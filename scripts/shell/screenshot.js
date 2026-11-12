
<script>
/*fs-shot*/
/* 스크린샷 버튼: 게임 화면을 PNG 로 내려받는다 — 원본 EDOPro 의 '스크린샷' 대응.
   WebGL 버퍼는 프레임이 끝나면 비워지므로,
   ①gl.readPixels 로 읽고 ②검은 화면이면 잠시 뒤 재시도 ③2D 캔버스에 뒤집어 그려 저장한다. */
(function () {
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return 'edopro-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-'
      + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.png';
  }
  function toast(msg) {
    try { if (window.__edoproToast) window.__edoproToast(msg, 1800); } catch (e) {}
  }

  /* 캔버스 픽셀을 2D 캔버스로 옮긴다. 성공(true)/검은 화면(false) */
  function copyCanvas(c, dst) {
    var g = dst.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, dst.width, dst.height);
    var gl = null;
    try { gl = c.getContext('webgl2') || c.getContext('webgl'); } catch (e) {}
    if (gl && gl.readPixels) {
      var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (!w || !h) return false;
      var px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var lit = 0;
      for (var i = 0; i < px.length; i += 40 * 4) {
        if (px[i] + px[i + 1] + px[i + 2] > 24) lit++;
      }
      if (lit < 5) return false;                 /* 아직 프레임이 안 그려짐 */
      var img = g.createImageData(w, h);
      var src, rowBytes = w * 4;
      for (var y = 0; y < h; y++) {
        src = (h - 1 - y) * rowBytes;            /* GL 은 아래가 0행 */
        img.data.set(px.subarray(src, src + rowBytes), y * rowBytes);
      }
      dst.width = w; dst.height = h;
      g.putImageData(img, 0, 0);
      return true;
    }
    /* GL 이 아니면 일반 drawImage 로 시도 */
    try {
      g.drawImage(c, 0, 0);
      var d = g.getImageData(0, 0, Math.min(64, dst.width), Math.min(44, dst.height)).data;
      var n = 0;
      for (var k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 24) n++;
      return n >= 5;
    } catch (e) { return false; }
  }

  function save(c, tries) {
    var c2 = document.createElement('canvas');
    var ok = false;
    try { ok = copyCanvas(c, c2); } catch (e) { ok = false; }
    if (!ok && tries > 0) { setTimeout(function () { save(c, tries - 1); }, 90); return; }
    try {
      c2.toBlob(function (blob) {
        if (!blob) { toast('\uC2A4\uD06C\uB9B0\uC0F7 \uC2E4\uD328'); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = stamp();
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        toast('\uC2A4\uD06C\uB9B0\uC0F7 \uC800\uC7A5: ' + a.download);
      }, 'image/png');
    } catch (e) { toast('\uC2A4\uD06C\uB9B0\uC0F7 \uC2E4\uD328: ' + e); }
  }

  function mk() {
    if (document.getElementById('edopro-shot')) return;
    var b = document.createElement('button');
    b.id = 'edopro-shot';
    b.type = 'button';
    b.title = '\uC2A4\uD06C\uB9B0\uC0F7';        /* 스크린샷 */
    b.textContent = '\uD83D\uDCF7';              /* 📷 */
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var c = document.querySelector('canvas');
      if (!c) return;
      save(c, 15);                               /* 최대 15회(≈1.4초) 재시도 */
    });
    document.body.appendChild(b);
  }
  if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
})();
</script>
