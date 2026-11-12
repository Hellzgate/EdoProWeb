
<script>
window.EDOPRO_WS_BASE = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
if (typeof Module !== 'undefined') { Module.arguments = ['-i-want-to-be-admin']; }

window.addEventListener('error', function (e) {
  try { console.log('[js-error] ' + (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0) + (e.error && e.error.stack ? ('\n' + e.error.stack) : '')); } catch (x) {}
});
window.addEventListener('unhandledrejection', function (e) {
  try { console.log('[js-reject] ' + ((e.reason && e.reason.stack) || e.reason)); } catch (x) {}
});

/* ===== 화면 맞춤 (v1.15: 논리 해상도 고정 + 화면 꽉 채우기) ===== */
(function () {
  /* 페이지 논리 폭을 1280 으로 고정(원본 EDOPro 1024~1280 과 동일한 UI 크기).
     dpr 을 1로 고정해 캔버스 버퍼 = CSS px 로 일치시킨다(SDL/셸 단위 불일치 방지). */
  var LOGICAL_W = 1280;
  var BASE_W = 1024, BASE_H = 640;
  var lastCss = '';
  var sending = false;
  var bootDone = false;
  setTimeout(function () { bootDone = true; }, 12000);

  function styleEl() {
    var st = document.getElementById('edopro-fit');
    if (!st) {
      st = document.createElement('style');
      st.id = 'edopro-fit';
      (document.head || document.documentElement).appendChild(st);
    }
    return st;
  }

  function sendResize() {
    try {
      sending = true;
      window.dispatchEvent(new Event('resize'));
    } catch (e) {}
    setTimeout(function () { sending = false; }, 120);
  }

  function fit() {
    var c = document.querySelector('canvas.emscripten') || document.querySelector('canvas');
    if (!c) return;
    var W = document.documentElement.clientWidth || window.innerWidth || 0;
    var H = document.documentElement.clientHeight || window.innerHeight || 0;
    if (!W || !H) return;

    var w, h;
    if (W / H >= 1.0) {
      /* 가로: 화면 꽉 채움(논리 폭 1280 유지, 세로는 화면 비율대로) */
      w = W;
      h = Math.max(240, H);
    } else {
      /* 세로: 16:10 레터박스(회전 안내) */
      var s = Math.min(W / BASE_W, H / BASE_H);
      if (!isFinite(s) || s <= 0) return;
      w = Math.max(200, Math.floor(BASE_W * s));
      h = Math.max(120, Math.floor(BASE_H * s));
    }

    var css = 'canvas.emscripten{width:' + w + 'px!important;height:' + h + 'px!important;'
      + 'position:fixed!important;inset:0!important;margin:auto!important;'
      + 'border:0!important;max-width:none!important;max-height:none!important}';
    if (css !== lastCss) {
      styleEl().textContent = css;
      lastCss = css;
      if (bootDone && location.search.indexOf('sync=0') < 0) sendResize();
    }

    /* 계측(getContext 금지) */
    try {
      var vi = 'WxH ' + W + 'x' + H + '  dpr ' + (window.devicePixelRatio || 1)
        + '  css ' + w + 'x' + h + '  buf ' + c.width + 'x' + c.height;
      if (vi !== window.__edoproViewStr) {
        window.__edoproViewStr = vi;
        try {
          var hist = [];
          try { hist = JSON.parse(localStorage.getItem('edopro-viewhist') || '[]'); } catch (e2) { hist = []; }
          hist.push(vi);
          if (hist.length > 12) hist = hist.slice(hist.length - 12);
          localStorage.setItem('edopro-viewhist', JSON.stringify(hist));
          localStorage.setItem('edopro-view', vi + '\n@ ' + new Date().toLocaleTimeString());
        } catch (e) {}
      }
    } catch (e) {}

    var hintEl = document.getElementById('edopro-hint');
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.id = 'edopro-hint';
      hintEl.textContent = '\uAC00\uB85C\uB85C \uB3CC\uB9AC\uBA74 \uB354 \uD06C\uAC8C \uBCF4\uC785\uB2C8\uB2E4';
      document.body.appendChild(hintEl);
    }
    var want = (H > W * 1.15) ? 'on' : '';
    if (hintEl.className !== want) hintEl.className = want;
  }

  window.__edoproFit = fit;
  if (location.search.indexOf('nofit') >= 0) return;

  function burst() {
    fit();
    var d = [40, 120, 260, 500, 900, 1500];
    for (var i = 0; i < d.length; i++) setTimeout(fit, d[i]);
  }

  window.addEventListener('resize', function () {
    if (sending) return;
    fit();
  }, true);
  window.addEventListener('resize', function () {
    if (sending) return;
    burst();
  });
  window.addEventListener('orientationchange', burst);
  if (window.screen && screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', burst);
  }
  if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener('resize', burst);
  }
  document.addEventListener('visibilitychange', burst);
  document.addEventListener('DOMContentLoaded', burst);
  window.addEventListener('load', burst);
  setInterval(fit, 500);
  burst();
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
    /* 게임 언어 설정을 기억해 두었다가 다음 부팅 때 그 언어의 카드DB 를 받는다 */
    try {
      if (FS.analyzePath('/config/system.conf').exists) {
        var _sc = FS.readFile('/config/system.conf', { encoding: 'utf8' });
        var _m = /^\\s*language\\s*=\\s*(.+?)\\s*$/m.exec(_sc);
        if (_m) localStorage.setItem('edopro-lang', _m[1]);
      }
    } catch (e) {}
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
  /* 저장소 탭(게임 내)에 보여줄 목록을 서버에서 받아 둔다(원본의 업데이터 UI 대응) */
  function loadRepoInfo() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/repos', false);
      xhr.send(null);
      if (xhr.status !== 200) return;
      var j = JSON.parse(xhr.responseText);
      var list = (j && j.repos) || [];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        var nm = (r.remote || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        out.push({ name: nm || r.name, path: r.name, url: r.remote || '', files: r.files || 0, head: r.head || '' });
      }
      window.__repos = out;
      console.log('[repo] info ' + out.length + ' repos');
    } catch (e) { console.log('[repo] info fail ' + e); }
  }

  function applyRepoBundle() {
    try {
      var xhr = new XMLHttpRequest();
      var _lang = '';
      /* 게임 설정(system.conf language)이 최우선.
         로컬스토리지는 보조 — 설정 복원 전(첫 부팅)이나 system.conf 가 아직 없을 때만 쓴다.
         (예전에는 localStorage 우선이라 한 번 영어로 켠 브라우저가 계속 영어 번들을 받았다) */
      try { var _sc0 = FS.readFile('/config/system.conf', { encoding: 'utf8' }); var _m0 = /^\s*language\s*=\s*(.+?)\s*$/m.exec(_sc0); if (_m0) _lang = _m0[1]; } catch (e) {}
      if (!_lang) { try { _lang = localStorage.getItem('edopro-lang') || ''; } catch (e) {} }
      try { if (_lang) localStorage.setItem('edopro-lang', _lang); } catch (e) {}
      xhr.open('GET', '/api/repos/bundle' + (_lang ? ('?lang=' + encodeURIComponent(_lang)) : ''), false);
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
          try { loadRepoInfo(); } catch (e) { console.log('[repo] info fail: ' + e); }
          /* 언어 결정은 system.conf(language) 를 따른다 →
             번들보다 **먼저** 사용자 설정을 복원해야 카드DB 언어가 어긋나지 않는다 */
          try { restoreConfigOnly(); } catch (e) { console.log('[userdata] cfg restore fail: ' + e); }
          try { applyRepoBundle(); } catch (e) { console.log('[repo] fail: ' + e); }
          /* 덱/리플레이 복원도 preRun(=프리로드 완료 후, main 진입 전)에서 한다.
             부팅 후에 하면 게임이 이미 목록을 읽은 뒤라 반영되지 않는다. */
          try { ensureDirs(); } catch (e) { console.log('[userdata] ensureDirs fail: ' + e); }
          try { restore(); } catch (e) { console.log('[userdata] restore fail: ' + e); }
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
    /* 이 게임은 main() 이 끝나지 않으므로 Module.calledRun 은 영원히 false 다.
       Irrlicht 가 캔버스를 실제 크기(>320)로 바꾸는 순간을 부팅 완료로 본다. */
    var n = 0;
    var t = setInterval(function () {
      var c = document.querySelector('canvas');
      if ((c && c.width > 320) || ++n > 240) { clearInterval(t); cb(); }
    }, 250);
  }
  waitBoot(function () {
    setTimeout(function () {
      try { startSaver(); } catch (e) { console.log('[userdata] saver fail: ' + e); }
    }, 2500);
    setTimeout(function () {
      try { loadBgmIfEnabled(); } catch (e) { console.log('[bgm] fail: ' + e); }
    }, 4000);
  });

  /* BGM 은 .data 에 넣지 않는다(16MB) — `enable_music = 1` 일 때만 내려받아 FS 에 넣고
     게임(실행기)에 목록 새로고침을 요청한다(edopro_refresh_bgm). */
  function loadBgmIfEnabled() {
    var enabled = false;
    try {
      var sc = FS.readFile('/config/system.conf', { encoding: 'utf8' });
      enabled = /^\s*enable_music\s*=\s*1\s*$/m.test(sc || '');
    } catch (e) { enabled = false; }
    if (!enabled) { console.log('[bgm] enable_music=0 → 건너뜀(16MB 절약)'); return; }
    if (window.__bgmLoading) return;
    window.__bgmLoading = true;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/bgm', true);
    xhr.onload = function () {
      if (xhr.status !== 200) { console.log('[bgm] list ' + xhr.status); return; }
      var list = [];
      try { list = (JSON.parse(xhr.responseText).files) || []; } catch (e) {}
      if (!list.length) { console.log('[bgm] 목록 없음'); return; }
      var total = 0, done = 0, ok = 0;
      for (var i = 0; i < list.length; i++) total += list[i].size;
      var idx = 0, active = 0, MAX = 3;
      function next() {
        if (idx >= list.length) {
          if (done >= list.length) finish();
          return;
        }
        var it = list[idx++];
        active++;
        var r = new XMLHttpRequest();
        r.open('GET', '/api/bgm/' + it.p, true);
        r.responseType = 'arraybuffer';
        r.onload = function () {
          if (r.status === 200) {
            try {
              var dst = '/sound/BGM/' + it.p;
              FS.mkdirTree(dst.substring(0, dst.lastIndexOf('/')));
              FS.writeFile(dst, new Uint8Array(r.response));
              ok++;
            } catch (e) { console.log('[bgm] write ' + it.p + ': ' + e); }
          }
          active--; done++; next();
        };
        r.onerror = function () { active--; done++; next(); };
        r.send();
      }
      function finish() {
        console.log('[bgm] applied ' + ok + '/' + list.length + ' files (' + (total / 1048576).toFixed(1) + 'MB)');
        try {
          if (Module._edopro_refresh_bgm) Module._edopro_refresh_bgm();
          else if (Module.ccall) Module.ccall('edopro_refresh_bgm', 'void', [], []);
          if (window.__edoproToast) window.__edoproToast('BGM ' + ok + '곡을 불러왔습니다', 1600);
        } catch (e) { console.log('[bgm] refresh fail: ' + e); }
      }
      for (var k = 0; k < MAX; k++) next();
    };
    xhr.onerror = function () { console.log('[bgm] list error'); };
    xhr.send();
  }

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
