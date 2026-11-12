import io, os, sys

p = os.path.expanduser("~/edo-src/edopro/gframe/utils_gui.cpp")
s = io.open(p, encoding="utf-8").read()

# 1) 뒤에 있던 emscripten 분기 제거
old_tail = """#elif defined(__EMSCRIPTEN__)
	/* 웹(emscripten)은 OpenGL 드라이버가 컴파일되지 않으므로 기본값을 WebGL1 로 둔다
	   (system.conf 의 driver_type=default 이면 여기로 온다) */
	return irr::video::EDT_WEBGL1;
"""
if old_tail in s and "#elif defined(__EMSCRIPTEN__)\n\treturn irr::video::EDT_WEBGL1;" not in s:
    s = s.replace(old_tail, "", 1)
    print("뒤쪽 emscripten 분기 제거")

# 2) 맨 위(ANDROID 다음)로 emscripten 분기 이동
anchor = """#elif EDOPRO_IOS
	return irr::video::EDT_OGLES1;"""
new = """#elif defined(__EMSCRIPTEN__)
	/* 웹(emscripten)은 OpenGL 드라이버가 컴파일되지 않으므로 **무조건 WebGL1**.
	   (EDOPRO_LINUX 분기가 먼저 걸려 EDT_OPENGL 로 떨어지던 문제 수정) */
	return irr::video::EDT_WEBGL1;
#elif EDOPRO_IOS
	return irr::video::EDT_OGLES1;"""

if "#elif defined(__EMSCRIPTEN__)\n\treturn irr::video::EDT_WEBGL1;" not in s:
    if anchor not in s:
        print("!! 앵커 불일치"); sys.exit(1)
    s = s.replace(anchor, new, 1)
    print("emscripten 분기를 맨 앞으로 이동")

io.open(p, "w", encoding="utf-8").write(s)

# 검증 출력
i = s.find("getDefaultDriver")
print(s[i:i+560])
