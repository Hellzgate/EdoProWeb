
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
