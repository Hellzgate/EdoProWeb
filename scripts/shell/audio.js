
<script>
/*fs-audio*/
/* 브라우저 자동재생 정책: 첫 사용자 제스처에서 Web Audio 컨텍스트를 resume 한다 */
(function () {
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      if (window.miniaudio && window.miniaudio.devices) {
        for (var i = 0; i < window.miniaudio.devices.length; i++) {
          var d = window.miniaudio.devices[i];
          if (d && d.webaudio && d.webaudio.state !== 'running') {
            try { d.webaudio.resume(); } catch (e) {}
          }
        }
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        var a = new AC();
        if (a.state !== 'running') a.resume();
        setTimeout(function () { try { a.close(); } catch (e) {} }, 800);
      }
    } catch (e) {}
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (t) {
    document.addEventListener(t, unlock, { passive: true });
  });
})();
</script>
