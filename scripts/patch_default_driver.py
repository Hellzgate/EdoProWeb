import io, os, sys

p = os.path.expanduser("~/edo-src/edopro/gframe/utils_gui.cpp")
s = io.open(p, encoding="utf-8").read()

anchor = "#elif EDOPRO_WINDOWS && defined(IRR_COMPILE_WITH_DX9_DEV_PACK)"
new = ("#elif defined(__EMSCRIPTEN__)\n"
       "\t/* 웹(emscripten)은 OpenGL 드라이버가 컴파일되지 않으므로 기본값을 WebGL1 로 둔다\n"
       "\t   (system.conf 의 driver_type=default 이면 여기로 온다) */\n"
       "\treturn irr::video::EDT_WEBGL1;\n"
       "#elif EDOPRO_WINDOWS && defined(IRR_COMPILE_WITH_DX9_DEV_PACK)")

if "__EMSCRIPTEN__" in s and "EDT_WEBGL1" in s:
    print("already")
    sys.exit(0)

if anchor not in s:
    print("!! 앵커 불일치")
    sys.exit(1)

s = s.replace(anchor, new, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("getDefaultDriver: emscripten -> EDT_WEBGL1 패치")
