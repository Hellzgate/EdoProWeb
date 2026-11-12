import io, os, sys, re

p = os.path.expanduser("~/edo-src/edopro/irrlicht/src/CIrrDeviceSDL2.cpp")
s = io.open(p, encoding="utf-8").read()

# 1) 헬퍼 추가 (캔버스 실제 버퍼 크기 읽기)
helper = """
// SDL2(emscripten)은 window->w 기준(CSS px)으로 크기를 알리지만 실제 WebGL 버퍼는
// 셸이 CSS*dpr 로 잡는다. irrlicht 뷰포트를 버퍼와 일치시키기 위해 캔버스 속성 크기를 읽는다.
static void EDO_GetCanvasBufferSize(int *w, int *h)
{
	*w = 0; *h = 0;
#ifdef __EMSCRIPTEN__
	emscripten_get_canvas_element_size("#canvas", w, h);
#endif
	if (*w <= 0 || *h <= 0) { *w = 0; *h = 0; }
}
"""
if "EDO_GetCanvasBufferSize" not in s:
    anchor = "void CIrrDeviceSDL2::updateNativeScale()"
    if anchor not in s:
        print("!! helper 앵커 불일치"); sys.exit(1)
    s = s.replace(anchor, helper + "\n" + anchor, 1)

# 2) RESIZED/SIZE_CHANGED 처리: 버퍼 크기 우선
old_resize = """					fprintf(stderr, "[irr] resize ev=%d data=%dx%d -> %ux%u (was %ux%u)\\n",
						(int)SDL_event.window.event, SDL_event.window.data1, SDL_event.window.data2,
						new_width, new_height, (unsigned)Width, (unsigned)Height);"""
new_resize = """					{
						int bw = 0, bh = 0;
						EDO_GetCanvasBufferSize(&bw, &bh);
						if (bw > 0 && bh > 0) { new_width = (u32)bw; new_height = (u32)bh; }
					}
					fprintf(stderr, "[irr] resize ev=%d data=%dx%d -> %ux%u (was %ux%u)\\n",
						(int)SDL_event.window.event, SDL_event.window.data1, SDL_event.window.data2,
						new_width, new_height, (unsigned)Width, (unsigned)Height);"""
if old_resize in s and "EDO_GetCanvasBufferSize(&bw" not in s:
    s = s.replace(old_resize, new_resize, 1)
    print("resize 처리 패치")
elif "EDO_GetCanvasBufferSize(&bw" in s:
    print("resize 처리 already")
else:
    print("!! resize 앵커 불일치"); sys.exit(1)

# 3) 생성 직후 크기: SDL drawable 대신 버퍼 크기
old_create = """		int new_width, new_height;
		SDL_GL_GetDrawableSize(window, &new_width, &new_height);"""
new_create = """		int new_width, new_height;
		SDL_GL_GetDrawableSize(window, &new_width, &new_height);
		{
			int bw = 0, bh = 0;
			EDO_GetCanvasBufferSize(&bw, &bh);
			if (bw > 0 && bh > 0) { new_width = bw; new_height = bh; }
			fprintf(stderr, "[irr] create size -> %dx%d (sdl %dx%d)\\n", new_width, new_height, bw, bh);
		}"""
if old_create in s and "[irr] create size" not in s:
    s = s.replace(old_create, new_create, 1)
    print("생성 크기 패치")
elif "[irr] create size" in s:
    print("생성 크기 already")
else:
    print("!! create 앵커 불일치"); sys.exit(1)

io.open(p, "w", encoding="utf-8").write(s)
print("완료")
