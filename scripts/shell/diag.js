
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
