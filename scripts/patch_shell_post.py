import io

p = "/home/hellzsub/edo-docker/web/edopro-full.html"
import os
if not os.path.exists(p):
    p = "/home/hellzsub/edopro-docker/web/edopro-full.html"

s = io.open(p, encoding="utf-8").read()

CSS = (
    "<style>"
    "html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}"
    "body{display:block}"
    "body>*{display:none!important}"
    "body>.emscripten_border{display:flex!important;position:fixed;inset:0;"
    "align-items:center;justify-content:center;border:0!important;background:#000}"
    "canvas.emscripten{border:0 none;background:#000;outline:none;display:block;"
    "width:1024px;height:640px}"
    "</style>"
)

FIT = r"""
<script>
window.EDOPRO_WS_BASE = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
if (typeof Module !== 'undefined') { Module.arguments = ['-i-want-to-be-admin']; }

/* 화면 맞춤: 게임 캔버스(1024x640)를 창에 꽉 차게(비율 유지) 배치한다.
   Emscripten 셸은 마우스 좌표를 canvas.width/rect.width 로 환산하므로 CSS 확대해도 입력이 맞는다. */
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
  function visible(el) {
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
  }
  window.__edoproFit = fit;
  window.addEventListener('resize', fit);
  document.addEventListener('DOMContentLoaded', fit);
  window.addEventListener('load', fit);
  /* 게임이 캔버스 속성/크기를 바꾸거나 창이 늦게 커져도 계속 맞춘다 */
  var n = 0;
  var t = setInterval(function () { fit(); if (++n > 240) clearInterval(t); }, 250);
  try {
    new MutationObserver(fit).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'width', 'height'] });
  } catch (e) {}
})();
</script>
"""

# 1) 기존 스타일/헬퍼 제거 후 새로 주입 (멱등)
if "body>.emscripten_border" not in s:
    # 이전에 주입한 <style>...</style> 블록들이 있으면 교체
    import re
    s = re.sub(r"<style>html,body\{margin:0.*?</style>", "", s, flags=re.S)
    s = s.replace("</head>", CSS + "</head>", 1)
else:
    import re
    s = re.sub(r"<style>html,body\{margin:0.*?</style>", CSS, s, count=1, flags=re.S)

# 2) 기존 주입 스크립트(EDOPRO_WS_BASE 포함) 제거
start = s.find("<script>\nwindow.EDOPRO_WS_BASE")
if start == -1:
    start = s.find("<script>window.EDOPRO_WS_BASE")
if start == -1:
    # 다른 형태
    start = s.find("<script>\r\nwindow.EDOPRO_WS_BASE")
if start != -1:
    end = s.find("</script>", start)
    if end != -1:
        s = s[:start] + s[end + len("</script>"):]

if "</body>" in s:
    s = s.replace("</body>", FIT + "</body>", 1)
else:
    s += FIT

io.open(p, "w", encoding="utf-8").write(s)
print("postprocess: 레이아웃(중앙+맞춤) + WS + admin 주입 완료")
