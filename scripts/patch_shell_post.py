import io
import os
import time
import re

_HERE = os.path.dirname(os.path.abspath(__file__))
_SHELL_DIR = os.path.join(_HERE, "shell")


def _asset(name):
    """scripts/shell/<name> 을 그대로 읽는다(주입 내용 = 파일 내용)."""
    return io.open(os.path.join(_SHELL_DIR, name), encoding="utf-8").read()


CANDIDATES = [
    "/home/hellzsub/edopro-docker/web/edopro-full.html",
    "/home/hellzsub/edo-docker/web/edopro-full.html",
]

p = next((c for c in CANDIDATES if os.path.exists(c)), CANDIDATES[0])
s = io.open(p, encoding="utf-8").read()

CSS = _asset("layout.css")

DIAG = _asset("diag.js")


EDOPRO_JLOG = _asset("jlog.js")

EDOPRO_LOAD = _asset("load.js")
BOOT = _asset("boot.js")

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
    html = _re.sub(r"<script>/\*buildtag\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\*fs-btn\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\*fs-start\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\*fs-files\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\*fs-audio\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\*fs-ime\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\*fs-shot\*/.*?</script>", "", html, flags=_re.S)
    html = _re.sub(r"<script>\s*/\*fs-build\*/.*?</script>", "", html, flags=_re.S)
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

def _build_stamp():
    """배포마다 바뀌는 스탬프(wasm mtime) — wasm/js/data 캐시 무효화에 쓴다."""
    _c = os.path.expanduser("~/edo-src/wasm/web/edopro-full.wasm")
    try:
        if os.path.isfile(_c):
            return str(int(os.path.getmtime(_c)))
    except OSError:
        pass
    return str(int(time.time()))


BUILD_STAMP = _build_stamp()

EARLY2 = (
    '<script>/*buildtag*/window.__edoproBuild="' + BUILD_STAMP + '";'
    'window.Module=window.Module||{};'
    'window.Module.locateFile=function(p){return p+"?v="+window.__edoproBuild;};'
    '</script>'
)
if '/*buildtag*/' not in s:
    s = s.replace("<head>", "<head>" + EARLY2, 1)

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

FS = _asset("fullscreen.js")

FS2 = _asset("fs-start.js")

FS6 = _asset("board.js")
if 'FS6 + "</body>"' not in s:
    s = s.replace("</body>", FS6 + "</body>", 1)

FS5 = _asset("ime.js")

FS4 = _asset("audio.js")

FS3 = _asset("files.js")

SHOT = _asset("screenshot.js")

if "</body>" in s:
    s = s.replace("</body>", BOOT + "</body>", 1)
else:
    s += BOOT

if '/*fs-btn*/' not in s:
    s = s.replace("</body>", FS + "</body>", 1)

if '/*fs-start*/' not in s:
    s = s.replace("</body>", FS2 + "</body>", 1)

if '/*fs-files*/' not in s:
    s = s.replace("</body>", FS3 + "</body>", 1)

if '/*fs-audio*/' not in s:
    s = s.replace("</body>", FS4 + "</body>", 1)

if '/*fs-ime*/' not in s:
    s = s.replace("</body>", FS5 + "</body>", 1)

if '/*fs-shot*/' not in s:
    s = s.replace("</body>", SHOT + "</body>", 1)

if '/*fs-ime-boot*/' not in s:
    s = s.replace("  function applyRepoBundle() {",
                  "  /* 게임(irrlicht) 이 편집박스 포커스 시 호출 */\n"
                  "  if (typeof Module !== 'undefined') Module['__edoproIME'] = function (on, x, y, w, h) {\n"
                  "    try { if (window.__ime) window.__ime(on, x, y, w, h); } catch (e) {}\n"
                  "  };\n\n"
                  "  function applyRepoBundle() {", 1)

s = s.replace("</head>", EDOPRO_JLOG + "</head>", 1)
s = s.replace("<body>", "<body>" + EDOPRO_LOAD, 1)
s = s.replace("</body>", DIAG + "</body>", 1)

io.open(p, "w", encoding="utf-8").write(s)
print("postprocess: 레이아웃 + 사용자데이터(덱/리플레이) + WS + admin 주입 완료")
