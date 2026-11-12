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
    "#edopro-hint{display:none!important;position:fixed;left:0;right:0;bottom:10px;text-align:center;color:#8b93a1;font:12px sans-serif;z-index:99997;pointer-events:none}"
    "#edopro-hint.on{display:block!important}"
    "#edopro-start{display:flex!important;position:fixed!important;inset:0;z-index:100002;"
    "background:rgba(6,7,9,.92);align-items:center;justify-content:center;text-align:center;"
    "font:20px/1.5 'Malgun Gothic',sans-serif;color:#e8eaf0}"
    "#edopro-start .panel{max-width:min(760px,88vw)}"
    "#edopro-start .t{font-size:30px;font-weight:700;margin-bottom:22px}"
    "#edopro-start .s{font-size:18px;color:#98a3b6;margin-top:16px}"
    "#edopro-start .k{margin-top:18px}"
    "#edopro-start .k a{color:#98a3b6;font-size:20px}"
    "#edopro-start button{font:700 26px 'Malgun Gothic',sans-serif;padding:20px 34px;border-radius:12px;"
    "border:1px solid #3f6fd8;background:linear-gradient(180deg,#3b72e0,#2a55b0);color:#fff;cursor:pointer}"
    "#edopro-start button:active{filter:brightness(1.15)}"
    "#edopro-fs{display:block!important;position:fixed!important;right:10px;top:10px;"
    "width:44px;height:44px;border-radius:22px;border:1px solid rgba(255,255,255,.35);"
    "background:rgba(20,22,28,.55);color:#e8eaf0;font:20px/1 sans-serif;padding:0;"
    "z-index:100000;cursor:pointer}"
    "#edopro-fs:active{background:rgba(80,140,255,.65)}"
    "#edopro-diag{display:none!important;position:fixed;left:6px;top:6px;max-width:92vw;"
    "background:rgba(0,0,0,.78);color:#9fe3a0;font:11px/1.45 monospace;padding:6px 8px;"
    "border-radius:6px;z-index:99999;white-space:pre-wrap}"
    "#edopro-diag.on{display:block!important}"
    "</style>"
)

DIAG = r"""
<script>
/* ?diag=1 이면 화면 좌상단에 WebGL/오류 상태를 표시한다(모바일 진단용) */
(function () {
  if (location.search.indexOf('diag') < 0) return;
  var el = document.createElement('div');
  el.id = 'edopro-diag';
  el.className = 'on';
  el.textContent = 'diag start';
  document.body.appendChild(el);
  var lines = [];
  function add(t) { lines.push(t); if (lines.length > 12) lines.shift(); el.textContent = lines.join('\n'); }
  window.__diag = add;

  window.addEventListener('error', function (e) {
    add('ERR ' + (e.message || '') + ' @' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function (e) {
    add('REJ ' + ((e.reason && (e.reason.message || e.reason)) || ''));
  });

  setTimeout(function () {
    var c = document.querySelector('canvas');
    add('canvas ' + (c ? (c.width + 'x' + c.height + ' css ' + Math.round(c.getBoundingClientRect().width)) : 'none'));
    try {
      var t = document.createElement('canvas');
      var g1 = t.getContext('webgl') || t.getContext('experimental-webgl');
      add('webgl1 ' + (g1 ? 'OK' : 'NULL') + (g1 ? (' ' + g1.getParameter(g1.VERSION)) : ''));
    } catch (e) { add('webgl1 EX ' + e); }
    try {
      var t2 = document.createElement('canvas');
      var g2 = t2.getContext('webgl2');
      add('webgl2 ' + (g2 ? 'OK' : 'NULL'));
    } catch (e) { add('webgl2 EX ' + e); }
    try {
      var mc = Module && Module.canvas;
      add('module canvas ' + (mc ? (mc.width + 'x' + mc.height) : 'none'));
      add('fs /pics ' + (FS.readdir('/pics').length) + ' /sound ' + (FS.readdir('/sound').length));
      add('calledRun ' + (Module.calledRun ? 1 : 0));
    } catch (e) { add('module EX ' + e); }
  }, 12000);
})();
</script>
"""


EDOPRO_JLOG = r"""
<script>
/* 브라우저 콘솔/오류를 서버(/api/jlog)로 보낸다 — 모바일에서 DevTools 없이 진단하기 위함 */
(function () {
  var sent = 0;
  var DEBUG_LOG = location.search.indexOf('debug') >= 0;
  var NETLOG = location.search.indexOf('net=1') >= 0;
  var SYNC_LOG = location.search.indexOf('jlogsync') >= 0;
  function send(m) {
    if (sent > 4000) return;
    var s0 = String(m);
    /* 항상 localStorage 에 마지막 로그를 남긴다(크래시 후 /last.html 로 확인). */
    try {
      localStorage.setItem('edopro-last', s0.slice(0, 300));
      localStorage.setItem('edopro-last-at', String(Date.now()));
      /* 최근 40건 링 버퍼 — 크래시 지점 추적용 */
      var hist = [];
      try { hist = JSON.parse(localStorage.getItem('edopro-hist') || '[]'); } catch (e2) { hist = []; }
      hist.push(s0.slice(0, 200));
      if (hist.length > 40) hist = hist.slice(hist.length - 40);
      localStorage.setItem('edopro-hist', JSON.stringify(hist));
    } catch (e) {}
    /* 네트워크 로깅은 명시적으로 켤 때만 (?net=1 or ?jlogsync=1) — 기본 OFF */
    if (!NETLOG && !SYNC_LOG) return;
    if (!DEBUG_LOG) {
      if (s0.indexOf('[flow]') >= 0 || s0.indexOf('[step]') >= 0) return;
    }
    sent++;
    var u = '/api/jlog?m=' + encodeURIComponent(String(m).slice(0, 380));
    try {
      if (SYNC_LOG) {
        /* 진단용: 크래시로 큐가 유실되지 않도록 동기 전송 */
        var x = new XMLHttpRequest();
        x.open('GET', u, false);
        x.send(null);
      } else {
        navigator.sendBeacon(u);
      }
    } catch (e) {}
  }
  window.__jlog = send;
  function __desc(e) {
    if (e === null || e === undefined) return String(e);
    if (typeof e === 'string') return e;
    try { if (e instanceof Error) return (e.name + ': ' + e.message + (e.stack ? ('\n' + e.stack.split('\n').slice(0, 4).join(' | ')) : '')); } catch (x) {}
    var s = '';
    try { s = JSON.stringify(e); } catch (x) {}
    var cn = '';
    try { cn = (e.constructor && e.constructor.name) || ''; } catch (x) {}
    return (cn ? (cn + ': ') : '') + (s || String(e));
  }
  window.__desc = __desc;
  var names = ['log', 'warn', 'error'];
  for (var i = 0; i < names.length; i++) {
    (function (name) {
      var orig = console[name];
      console[name] = function () {
        try {
          var a = [];
          for (var k = 0; k < arguments.length && k < 4; k++) a.push(arguments[k]);
          send(name + ' ' + a.join(' ').slice(0, 340));
        } catch (e) {}
        return orig.apply(console, arguments);
      };
    })(names[i]);
  }
  window.addEventListener('error', function (e) {
    var f = String(e.filename || '').split('/').pop();
    send('ERR ' + (e.message || '') + ' @' + f + ':' + e.lineno + ':' + e.colno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    send('REJ ' + window.__desc(r));
  });
  /* 하트비트는 ?diag=1 일 때만, 그리고 **별도 캔버스**로만 검사한다.
     게임 캔버스에 getContext('webgl2') 를 먼저 호출하면 그 캔버스가 webgl2 로 고정되어
     emscripten 의 webgl1 컨텍스트 생성이 실패한다(실측) — 절대 건드리지 않는다. */
  if (location.search.indexOf('diag') >= 0) {
    var __frames = 0;
    (function __tick() { __frames++; requestAnimationFrame(__tick); })();
    var __hb = 0;
    setInterval(function () {
      __hb++;
      var c = document.querySelector('canvas');
      var lost = '?';
      try {
        var probe = document.createElement('canvas');
        var gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (gl && gl.isContextLost) lost = gl.isContextLost() ? 1 : 0;
      } catch (e) { lost = 'EX'; }
      var r = c && c.getBoundingClientRect ? c.getBoundingClientRect() : null;
      send('hb' + __hb + ' ready=' + document.readyState + ' frames=' + __frames +
           ' canvas=' + (c ? c.width + 'x' + c.height : '-') +
           ' css=' + (r ? Math.round(r.width) + 'x' + Math.round(r.height) : '-') +
           ' called=' + ((window.Module && Module.calledRun) ? 1 : 0) +
           ' lost=' + lost + ' vis=' + document.visibilityState);
    }, 5000);
  }
  send('page start ' + location.href.slice(0, 120) + ' ua=' + navigator.userAgent.slice(0, 60));
})();
</script>
"""

EDOPRO_LOAD = r"""
<style>
#edopro-load{position:fixed;inset:0;z-index:100000;display:flex!important;flex-direction:column;
  align-items:center;justify-content:center;gap:14px;background:#0d0f13;color:#dfe5ee;
  font:14px/1.5 'Malgun Gothic','Noto Sans KR',sans-serif;text-align:center;padding:24px}
#edopro-load .logo{font:700 30px/1 system-ui,sans-serif;letter-spacing:.14em;color:#9cc3ff}
#edopro-load .bar{width:min(360px,72vw);height:6px;border-radius:3px;background:#232833;overflow:hidden}
#edopro-load .bar>i{display:block;height:100%;width:0;border-radius:3px;background:linear-gradient(90deg,#4f8cff,#7cd0ff);transition:width .25s}
#edopro-load .msg{font-size:13px;color:#98a3b6;min-height:20px}
#edopro-load .err{max-width:min(560px,86vw);font-size:12px;color:#ff9b9b;white-space:pre-wrap}
#edopro-load.off{display:none!important}
#edopro-load button{margin-top:6px;padding:9px 22px;border-radius:8px;border:1px solid #3d4759;
  background:#1b2130;color:#dfe5ee;font-size:14px;display:none}
#edopro-load button.on{display:inline-block}
</style>
<div id="edopro-load">
  <div class="logo">EDOPRO</div>
  <div class="bar"><i id="edopro-bar"></i></div>
  <div class="msg" id="edopro-lmsg">&#48520;&#47084;&#50724;&#45716; &#51473;&#8230;</div>
  <div class="err" id="edopro-lerr"></div>
  <button id="edopro-retry" type="button">&#45796;&#49884; &#49884;&#46020;</button>
</div>
<script>
(function () {
  var box = document.getElementById('edopro-load');
  var bar = document.getElementById('edopro-bar');
  var msg = document.getElementById('edopro-lmsg');
  var err = document.getElementById('edopro-lerr');
  var btn = document.getElementById('edopro-retry');
  var t0 = Date.now();
  var done = false;

  function show(text) { if (msg) msg.textContent = text; }
  function fail(text) {
    var e = (window.__desc ? window.__desc(text) : String(text || ''));
    if (err && !err.textContent) err.textContent = e.slice(0, 300);
    if (btn) btn.classList.add('on');
    show('불러오지 못했습니다. 네트워크를 확인하고 다시 시도하세요.');
    if (window.__jlog) window.__jlog('LOAD-FAIL ' + e.slice(0, 200));
  }
  if (btn) btn.onclick = function () { location.reload(); };

  /* emscripten 셸이 갱신하는 #status 를 읽어 진행률을 옮겨온다 */
  var st = document.getElementById('status');
  var tick = setInterval(function () {
    if (done) { clearInterval(tick); return; }
    try {
      var cvs = document.querySelector('canvas');
      if ((window.Module && Module.calledRun) || (cvs && cvs.width > 320)) {
        done = true; clearInterval(tick);
        box.classList.add('off');
        return;
      }
    } catch (e) {}
    var txt = st ? (st.textContent || '') : '';
    var m = txt.match(/\((\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\)/);
    if (m && bar) {
      var pct = Math.min(100, Math.max(0, parseFloat(m[1]) / parseFloat(m[2]) * 100));
      bar.style.width = pct.toFixed(1) + '%';
      show('불러오는 중… ' + Math.round(pct) + '%');
    } else if (txt) {
      show(txt.replace(/\s+/g, ' ').slice(0, 80));
    }
    var sec = (Date.now() - t0) / 1000;
    if (sec > 45 && !err.textContent) {
      show('불러오는 중… ' + Math.round(sec) + '초 (파일이 커서 시간이 걸립니다)');
    }
  }, 300);

  window.addEventListener('error', function (e) {
    if (e && e.message && e.message !== 'Script error.') fail(e.message);
  });
  /* 거부된 프로미스는 게임이 계속 돌 수 있으므로 경고만 남기고 화면을 막지 않는다 */
  window.addEventListener('unhandledrejection', function (e) {
    var d = (window.__desc ? window.__desc(e && e.reason) : 'unknown');
    if (window.__jlog) window.__jlog('WARN-REJ ' + d);
  });
  window.addEventListener('offline', function () { fail('네트워크 연결이 끊겼습니다.'); });
})();
</script>
"""
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

# ---------------------------------------------------------------------------
# EDOPRO_STRIP: 이 스크립트를 여러 번 돌려도 블록이 중복되지 않게, 이전에 주입한
# 블록을 먼저 제거한다. (중복 주입된 HTML 은 브라우저에서 페이지가 멈췄다)
# ---------------------------------------------------------------------------
import re as _re

def _strip_injected(html):
    html = _re.sub(r"<script>\s*/\* 브라우저 콘솔/오류를 서버.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<style>\s*#edopro-load\{.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\* \?diag=1 이면.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>/\*dpr1\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\*fs-btn\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\*fs-start\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<link[^>]*>\s*", "", html, count=0) if False else html
    return html

s = _strip_injected(s)
print("strip: 이전 주입 블록 제거 (%d bytes)" % len(s))

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

META = ('<meta name="viewport" content="width=1280, user-scalable=no">'
        '<meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-capable" content="yes">'
        '<meta name="theme-color" content="#000000">'
        '<link rel="manifest" href="/manifest.json">')
if 'name="viewport"' not in s:
    s = s.replace("</head>", META + "</head>", 1)
else:
    s = re.sub(r'<meta name="viewport"[^>]*>', META, s, count=1)

# dpr 정규화(가장 먼저 실행): SDL(emscripten)과 셸이 같은 픽셀 단위를 쓰게 한다.
EARLY = (
    '<script>/*dpr1*/'
    '(function(){try{window.__edoproRealDpr=window.devicePixelRatio||1;'
    'Object.defineProperty(window,"devicePixelRatio",{configurable:true,get:function(){return 1;}});}'
    'catch(e){}})();'
    '</script>'
)
if '/*dpr1*/' not in s:
    s = s.replace("<head>", "<head>" + EARLY, 1)

FS = r"""
<script>
/*fs-btn*/
/* 전체화면 버튼: 모바일 브라우저의 주소창/툴바를 숨긴다(가로 고정 시도 포함) */
(function () {
  function mk() {
    if (document.getElementById('edopro-fs')) return;
    var b = document.createElement('button');
    b.id = 'edopro-fs';
    b.type = 'button';
    b.title = '\uC804\uCCB4\uD654\uBA74';
    b.textContent = '\u26F6';
    b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var el = document.documentElement;
      try {
        var p = el.requestFullscreen ? el.requestFullscreen()
              : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
      setTimeout(function () { if (window.__edoproFit) window.__edoproFit(); }, 400);
    });
    document.body.appendChild(b);
    document.addEventListener('fullscreenchange', function () {
      b.textContent = document.fullscreenElement ? '\u2715' : '\u26F6';
      setTimeout(function () { if (window.__edoproFit) window.__edoproFit(); }, 300);
    });
  }
  if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
})();
</script>
"""

FS2 = r"""
<script>
/*fs-start*/
/* 로딩 시 1탭으로 전체화면+가로 고정 (브라우저는 제스처 없이 전체화면을 허용하지 않는다)
   · 가로에서만 표시(세로는 회전 안내) · 배경 탭 또는 12초 뒤 자동 해제 */
(function () {
  var dismissed = false;
  function enterFs(cb) {
    var el = document.documentElement;
    try {
      var p = el.requestFullscreen ? el.requestFullscreen()
            : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);
      if (p && p.then) { p.then(function () { cb(); }).catch(function () { cb(); }); return; }
    } catch (e) {}
    try { cb(); } catch (e) {}
  }
  function lockOrient() {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
  }
  function close(d) {
    dismissed = true;
    if (d && d.parentNode) d.parentNode.removeChild(d);
    setTimeout(function () { if (window.__edoproFit) window.__edoproFit(); }, 300);
  }
  function build() {
    if (dismissed) return;
    if (document.getElementById('edopro-start')) return;
    if (document.fullscreenElement) return;
    if (window.innerWidth <= window.innerHeight) return;   /* 세로에서는 표시하지 않음 */
    var d = document.createElement('div');
    d.id = 'edopro-start';
    d.innerHTML =
      '<div class="panel">' +
      '<div class="t">\uD654\uBA74\uC744 \uAC00\uB4DD \uCC44\uC6CC \uC2DC\uC791\uD569\uB2C8\uB2E4</div>' +
      '<button type="button" id="edopro-start-btn">\uC804\uCCB4\uD654\uBA74\uC73C\uB85C \uC2DC\uC791 (\uAC00\uB85C)</button>' +
      '<div class="s">\uBE0C\uB77C\uC6B0\uC800 \uADDC\uCE59\uC0C1 \uC804\uCCB4\uD654\uBA74\uC740 \uD55C \uBC88 \uB204\uB974\uC57C \uCF1C\uC9D1\uB2C8\uB2E4.</div>' +
      '<div class="k"><a href="#" id="edopro-start-skip">\uADF8\uB0E5 \uC2DC\uC791</a></div>' +
      '</div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (ev) { if (ev.target === d) { ev.preventDefault(); close(d); } });
    document.getElementById('edopro-start-btn').addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      close(d);
      try { enterFs(function () { lockOrient(); }); } catch (e) {}
      try { lockOrient(); } catch (e) {}
    });
    document.getElementById('edopro-start-skip').addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      close(d);
    });
    setTimeout(function () { if (d.parentNode) close(d); }, 12000);
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
  window.addEventListener('orientationchange', function () { setTimeout(build, 700); });
  window.addEventListener('resize', function () { setTimeout(build, 700); });
})();
</script>
"""

if "</body>" in s:
    s = s.replace("</body>", BOOT + "</body>", 1)
else:
    s += BOOT

if '/*fs-btn*/' not in s:
    s = s.replace("</body>", FS + "</body>", 1)

if '/*fs-start*/' not in s:
    s = s.replace("</body>", FS2 + "</body>", 1)

s = s.replace("</head>", EDOPRO_JLOG + "</head>", 1)
s = s.replace("<body>", "<body>" + EDOPRO_LOAD, 1)
s = s.replace("</body>", DIAG + "</body>", 1)

io.open(p, "w", encoding="utf-8").write(s)
print("postprocess: 레이아웃 + 사용자데이터(덱/리플레이) + WS + admin 주입 완료")
