
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
