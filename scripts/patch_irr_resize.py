import io, sys, os

p = os.path.expanduser("~/edo-src/edopro/irrlicht/src/CIrrDeviceSDL2.cpp")
s = io.open(p, encoding="utf-8").read()

old = "\t\t\t\tcase SDL_WINDOWEVENT_SIZE_CHANGED: {"
new = ("\t\t\t\tcase SDL_WINDOWEVENT_RESIZED:   /* SDL2(emscripten)는 CSS 리사이즈를 RESIZED 로만 보낸다 */\n"
       "\t\t\t\tcase SDL_WINDOWEVENT_SIZE_CHANGED: {")

if "SDL_WINDOWEVENT_RESIZED:" in s:
    print("already")
elif old in s:
    s = s.replace(old, new, 1)
    io.open(p, "w", encoding="utf-8").write(s)
    print("irrlicht 패치: SDL_WINDOWEVENT_RESIZED -> SIZE_CHANGED 와 동일 처리")
else:
    print("!! 앵커 불일치")
    sys.exit(1)
