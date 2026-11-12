import io, os, sys

p = os.path.expanduser("~/edo-src/edopro/irrlicht/src/CIrrDeviceSDL2.cpp")
s = io.open(p, encoding="utf-8").read()

if "static void EDO_GetCanvasBufferSize(int *w, int *h);" in s:
    print("already")
    sys.exit(0)

anchor = "CIrrDeviceSDL2::CIrrDeviceSDL2("
i = s.find(anchor)
if i < 0:
    print("!! 앵커 불일치")
    sys.exit(1)

decl = "// 전방 선언 (파일 하단 정의)\nstatic void EDO_GetCanvasBufferSize(int *w, int *h);\n\n"
s = s[:i] + decl + s[i:]
io.open(p, "w", encoding="utf-8").write(s)
print("전방 선언 추가")
