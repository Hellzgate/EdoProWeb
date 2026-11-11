import io
import os
import re

CANDIDATES = [
    "/home/hellzsub/edopro-docker/web/edopro-full.html",
    "/home/hellzsub/edo-docker/web/edopro-full.html",
]

p = next((c for c in CANDIDATES if os.path.exists(c)), CANDIDATES[0])
s = io.open(p, encoding="utf-8").read()

CSS = (
    "<style>"
    "html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}"
    "body{display:block}"
    "body>*{display:none!important}"
    "body>.emscripten_border{display:flex!important;position:fixed;inset:0;"
    "align-items:center;justify-content:center;border:0!important;background:#000}"
    "canvas.emscripten{border:0 none;background:#000;outline:none;display:block;"
    "width:1024px;height:640px;touch-action:none;user-select:none;-webkit-user-select:none;"
    "-webkit-tap-highlight-color:transparent}"
    "body{touch-action:none;overscroll-behavior:none}"
    "#edopro-toast{display:block!important;position:fixed;left:50%;bottom:28px;"
    "transform:translateX(-50%);max-width:70vw;padding:9px 16px;border-radius:8px;"
    "background:rgba(20,22,28,.92);color:#e8eaf0;font:13px/1.4 'Malgun Gothic',sans-serif;"
    "border:1px solid #3a3f4b;box-shadow:0 6px 24px rgba(0,0,0,.5);z-index:99999;"
    "opacity:0;transition:opacity .25s;pointer-events:none;white-space:pre-wrap}"
    "#edopro-toast.on{opacity:1}"
    "#edopro-drop{display:none!important;position:fixed;inset:0;z-index:99998;"
    "background:rgba(0,0,0,.55);color:#fff;font:20px 'Malgun Gothic',sans-serif;"
    "align-items:center;justify-content:center;text-align:center}"
    "#edopro-drop.on{display:flex!important}"
    "</style>"
)

BOOT = r"""
<script>
window.EDOPRO_WS_BASE = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
if (typeof Module !== 'undefined') { Module.arguments = ['-i-want-to-be-admin']; }

window.addEventListener('error', function (e) {
  try { console.log('[js-error] ' + (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0) + (e.error && e.error.stack ? ('\n' + e.error.stack) : '')); } catch (x) {}
});
window.addEventListener('unhandledrejection', function (e) {
  try { console.log('[js-reject] ' + ((e.reason && e.reason.stack) || e.reason)); } catch (x) {}
});

/* ===== 화면 맞춤 ===== */
(function () {
  var BASE_W = 1024, BASE_H = 640;
  function fit() {
    var c = document.querySelector('canvas.emscripten') || document.querySelector('canvas');
    if (!c) return;
    var W = window.innerWidth || document.documentElement.clientWidth;
    var H = window.innerHeight || document.documentElement.clientHeight;
    if (!W || !H) return;
    var s = Math.min(W / BASE_W, H / BASE_H);
    var w = Math.max(320, Math.floor(BASE_W * s));
    var h = Math.max(200, Math.floor(BASE_H * s));
    if (c.style.width !== w + 'px' || c.style.height !== h + 'px') {
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    }
  }
  window.__edoproFit = fit;
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  window.addEventListener('load', fit);
  var n = 0;
  var t = setInterval(function () { fit(); if (++n > 240) clearInterval(t); }, 250);
  try {
    new MutationObserver(fit).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'width', 'height'] });
  } catch (e) {}
})();

/* ===== 덱/리플레이 보관(서버 /api/userdata) + 드래그&드롭 ===== */
(function () {
  var SAVE_MS = 20000;
  var MAX_FILE = 4 * 1024 * 1024;
  var lastSig = '';
  var timer = null;
  var booted = false;

  function toast(msg, ms) {
    var el = document.getElementById('edopro-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'edopro-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'on';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = ''; }, ms || 2600);
  }
  window.__edoproToast = toast;

  function b64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function unb64(str) {
    var bin = atob(str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function walk(dir, out) {
    var names;
    try { names = FS.readdir(dir); } catch (e) { return; }
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (n === '.' || n === '..') continue;
      var full = dir + '/' + n;
      var st;
      try { st = FS.stat(full); } catch (e) { continue; }
      if (FS.isDir(st.mode)) walk(full, out);
      else out.push({ path: full, size: st.size });
    }
  }

  /* 프리로드된 덱 이름 중 일부는 UTF-8 이 깨져 PUA(U+E000~U+F8FF) 문자로 보인다.
     그런 이름을 서버에 올리면 복원 때 EDOPro 덱 스캔이 ErrnoError 로 죽는다 -> 제외. */
  function badName(p) {
    return /[\uE000-\uF8FF]/.test(p) || /[\uD800-\uDFFF]/.test(p);
  }

  function collect() {
    var list = [];
    walk('/deck', list);
    walk('/replay', list);
    walk('/puzzles', list);
    try { if (FS.analyzePath('/config/system.conf').exists) list.push({ path: '/config/system.conf', size: FS.stat('/config/system.conf').size }); } catch (e) {}
    var files = {};
    var sig = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (badName(it.path)) continue;
      sig.push(it.path + ':' + it.size);
      if (it.size > MAX_FILE) continue;
      try {
        files[it.path.substring(1)] = b64(FS.readFile(it.path));
      } catch (e) {}
    }
    return { files: files, sig: sig.join('|') };
  }

  function post(files, beacon) {
    var body = JSON.stringify({ files: files });
    if (beacon && navigator.sendBeacon) {
      try { navigator.sendBeacon('/api/userdata', new Blob([body], { type: 'application/json' })); return true; } catch (e) {}
    }
    var xhr = new XMLHttpRequest();
    try {
      xhr.open('POST', '/api/userdata', false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(body);
      return xhr.status === 200;
    } catch (e) { return false; }
  }

  function sync(force, silent) {
    if (!booted) return;
    var c = collect();
    if (!force && c.sig === lastSig) return;
    var ok = post(c.files, false);
    if (ok) lastSig = c.sig;
    if (!silent) toast(ok ? '덱/리플레이를 서버에 저장했습니다' : '저장 실패 — 서버 연결을 확인하세요');
  }
  window.__edoproSync = sync;

  function restore() {
    if (location.search.indexOf('norestore') >= 0) { console.log('[userdata] restore skipped by flag'); return; }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/userdata', false);
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
      xhr.send(null);
      if (xhr.status !== 200) return;
      var txt = xhr.responseText || '';
      var json = JSON.parse(txt);
      var files = json.files || {};
      var n = 0;
      for (var k in files) {
        try {
          var dst = '/' + k;
          if (badName(k)) continue;
          if (FS.analyzePath(dst).exists) continue;   /* 프리로드된 기본 덱은 덮어쓰지 않는다 */
          FS.mkdirTree('/' + k.substring(0, k.lastIndexOf('/')));
          FS.writeFile(dst, unb64(files[k]));
          n++;
        } catch (e) {}
      }
      if (n) console.log('[userdata] restored ' + n + ' files');
    } catch (e) { console.log('[userdata] restore error: ' + (e && e.stack ? e.stack : e)); }
  }

  /* MEMFS: /replay 폴더 보장 (리플레이 열람용) */
  function ensureDirs() {
    ['/replay', '/puzzles'].forEach(function (d) {
      try {
        FS.mkdirTree(d);
      } catch (e) {
        console.log('[userdata] mkdir ' + d + ' fail: ' + e);
        try { if (!FS.isDir(FS.stat(d).mode)) FS.unlink(d); FS.mkdirTree(d); } catch (e2) {}
      }
    });
  }

  /* 저장소(자동 업데이트) 번들 → MEMFS. 게임이 시작 전에 CDB/스크립트를 읽으므로 preRun 에서 적용한다. */
  function applyRepoBundle() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/repos/bundle', false);
      xhr.send(null);
      if (xhr.status !== 200) { console.log('[repo] bundle status ' + xhr.status); return; }
      var j = JSON.parse(xhr.responseText);
      var files = j.files || {};
      var n = 0, bytes = 0;
      for (var k in files) {
        try {
          var bin = atob(files[k]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          var dst = '/' + k;
          FS.mkdirTree(dst.substring(0, dst.lastIndexOf('/')));
          FS.writeFile(dst, arr);
          n++; bytes += arr.length;
        } catch (e) { console.log('[repo] write fail ' + k + ': ' + e); }
      }
      window.__repoStats = { files: n, mb: (bytes / 1048576).toFixed(1) };
      console.log('[repo] applied ' + n + ' files (' + (bytes / 1048576).toFixed(1) + 'MB)');
    } catch (e) { console.log('[repo] bundle fail: ' + e); }
  }

  /* 설정(system.conf)은 게임이 시작 전에 읽으므로, 프리로드가 끝난 직후(=preRun 안)에 복원한다.
     단, 프리로드가 시작되기 전에 쓰면 .data 해제와 충돌해 죽으므로 'system.conf 가 보일 때까지' 기다린다. */
  function restoreConfigOnly() {
    if (location.search.indexOf('norestore') >= 0) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/userdata', false);
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
      xhr.send(null);
      if (xhr.status !== 200) return;
      var files = (JSON.parse(xhr.responseText).files) || {};
      var b64 = files['config/system.conf'];
      if (!b64) return;
      FS.writeFile('/config/system.conf', unb64(b64));
      console.log('[userdata] system.conf restored');
    } catch (e) { console.log('[userdata] cfg restore fail: ' + e); }
  }

  function hookConfigRestore() {
    if (typeof Module === 'undefined') return false;
    var add = Module.addRunDependency, rem = Module.removeRunDependency;
    if (typeof add !== 'function') return false;   /* 아직 노출 전 — 재시도 */
    Module.preRun = Module.preRun || [];
    Module.preRun.unshift(function () {
      add('edopro-config-restore');
      var n = 0;
      (function wait() {
        /* 프리로드(.data) 마지막 항목은 /media 이므로 그것이 풀렸는지로 완료를 판단한다 */
        var ready = false;
        try { ready = FS.analyzePath('/config/system.conf').exists && FS.analyzePath('/media/Shaders').exists; } catch (e) {}
        if (ready || ++n > 1200) {
          try { applyRepoBundle(); } catch (e) { console.log('[repo] fail: ' + e); }
          try { restoreConfigOnly(); } catch (e) { console.log('[userdata] cfg restore fail: ' + e); }
          rem('edopro-config-restore');
          return;
        }
        setTimeout(wait, 25);
      })();
    });
    return true;
  }
  if (!hookConfigRestore()) {
    var tries2 = 0;
    var iv2 = setInterval(function () {
      if (hookConfigRestore()) { clearInterval(iv2); return; }
      if (++tries2 > 200) {
        clearInterval(iv2);
        console.log('[userdata] addRunDependency 미노출 — 설정은 부팅 후 복원(다음 실행부터 적용)');
        setTimeout(restoreConfigOnly, 9000);
      }
    }, 30);
  }

  /* 덱/리플레이 복원은 **부팅이 끝난 뒤**에 한다.
     preRun 에서 MEMFS 에 쓰면 프리로드(.data) 해제와 충돌해 게임이 ErrnoError 로 죽는다. */
  function waitBoot(cb) {
    var n = 0;
    var t = setInterval(function () {
      var c = document.querySelector('canvas');
      if ((c && c.width > 320) || ++n > 240) { clearInterval(t); cb(); }
    }, 250);
  }
  waitBoot(function () {
    setTimeout(function () {
      try { ensureDirs(); } catch (e) { console.log('[userdata] ensureDirs fail: ' + e); }
      try { restore(); } catch (e) { console.log('[userdata] restore fail: ' + e); }
      startSaver();
    }, 1200);
  });

  /* 부팅 완료 후 주기 저장 시작 */
  function startSaver() {
    if (booted) return;
    booted = true;
    setTimeout(function () { sync(true, true); }, 6000);
    timer = setInterval(function () { sync(false, true); }, SAVE_MS);
    window.addEventListener('beforeunload', function () { try { sync(true, true); } catch (e) {} });
    window.addEventListener('blur', function () { try { sync(false, true); } catch (e) {} });
  }
  window.addEventListener('edopro-ready', startSaver);
  var poll = setInterval(function () {
    if (typeof Module !== 'undefined' && Module.calledRun) { clearInterval(poll); startSaver(); }
  }, 500);

  /* 드래그&드롭: .ydk → /deck, .yrpX/.yrp3d/.yrp → /replay */
  function dropZone() {
    var el = document.getElementById('edopro-drop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'edopro-drop';
      el.textContent = '덱(.ydk) · 리플레이(.yrpX) 파일을 여기에 놓으세요';
      document.body.appendChild(el);
    }
    return el;
  }
  function isDeck(name) { return /\.ydk$/i.test(name); }
  function isReplay(name) { return /\.(yrpx|yrp3d|yrp)$/i.test(name); }
  function isPuzzle(name) { return /\.lua$/i.test(name); }

  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dragDepth++;
    dropZone().className = 'on';
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('dragleave', function (e) {
    e.preventDefault();
    if (--dragDepth <= 0) { dragDepth = 0; dropZone().className = ''; }
  });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    dropZone().className = '';
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    var saved = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var dir = isDeck(f.name) ? '/deck' : (isReplay(f.name) ? '/replay' : (isPuzzle(f.name) ? '/puzzles' : null));
      if (!dir) continue;
      var reader = new FileReader();
      reader.onload = (function (name, target) {
        return function (ev) {
          try {
            FS.mkdirTree(target);
            FS.writeFile(target + '/' + name, new Uint8Array(ev.target.result));
            saved++;
            var label = target === '/deck' ? '덱 추가: ' : (target === '/replay' ? '리플레이 추가: ' : '퍼즐 추가: ');
            toast(label + name + '\n게임 안에서 목록을 새로 열면 보입니다');
            if (booted) sync(true, true);
          } catch (err) { toast('파일을 넣지 못했습니다: ' + err); }
        };
      })(f.name, dir);
      reader.readAsArrayBuffer(f);
    }
  });

  /* 단축키: F2 즉시 저장 */
  window.addEventListener('keydown', function (e) {
    if (e.key === 'F2') { e.preventDefault(); sync(true, false); }
  });
})();
</script>
"""

if "body>.emscripten_border" not in s:
    s = re.sub(r"<style>html,body\{margin:0.*?</style>", "", s, flags=re.S)
    s = s.replace("</head>", '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">' + CSS + "</head>", 1)
else:
    s = re.sub(r"<style>html,body\{margin:0.*?</style>", CSS, s, count=1, flags=re.S)

start = s.find("<script>\nwindow.EDOPRO_WS_BASE")
if start < 0:
    start = s.find("<script>\r\nwindow.EDOPRO_WS_BASE")
if start < 0:
    start = s.find("<script>window.EDOPRO_WS_BASE")
if start != -1:
    end = s.find("</script>", start)
    if end != -1:
        s = s[:start] + s[end + len("</script>"):]

META = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">'
if 'name="viewport"' not in s:
    s = s.replace("</head>", META + "</head>", 1)

if "</body>" in s:
    s = s.replace("</body>", BOOT + "</body>", 1)
else:
    s += BOOT

io.open(p, "w", encoding="utf-8").write(s)
print("postprocess: 레이아웃 + 사용자데이터(덱/리플레이) + WS + admin 주입 완료")
