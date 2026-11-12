
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
