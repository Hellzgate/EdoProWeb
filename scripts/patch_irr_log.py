import io, os, sys

p = os.path.expanduser("~/edo-src/edopro/irrlicht/src/CIrrDeviceSDL2.cpp")
s = io.open(p, encoding="utf-8").read()

# 1) updateNativeScale 계측
old1 = """void CIrrDeviceSDL2::updateNativeScale()
{
	int width, height = 0;
	SDL_GetWindowSize(window, &width, &height);"""
new1 = """void CIrrDeviceSDL2::updateNativeScale()
{
	int width, height = 0;
	SDL_GetWindowSize(window, &width, &height);"""
# (로깅은 아래 함수 끝에 붙인다)

mark1 = "\tNativeScaleX = (f32)real_width / (f32)width;\n\tNativeScaleY = (f32)real_height / (f32)height;"
ins1 = ("\tNativeScaleX = (f32)real_width / (f32)width;\n"
        "\tNativeScaleY = (f32)real_height / (f32)height;\n"
        "\tfprintf(stderr, \"[irr] nativeScale win=%dx%d drawable=%dx%d ratio=%.3f\\n\",\n"
        "\t\twidth, height, real_width, real_height, (double)NativeScaleX);")

# 2) RESIZED 처리 계측
mark2 = ("\t\t\t\t\tif(new_width != Width || new_height != Height) {\n"
         "\t\t\t\t\t\tWidth = new_width;\n"
         "\t\t\t\t\t\tHeight = new_height;")
ins2 = ("\t\t\t\t\tfprintf(stderr, \"[irr] resize ev=%d data=%dx%d -> %ux%u (was %ux%u)\\n\",\n"
        "\t\t\t\t\t\t(int)SDL_event.window.event, SDL_event.window.data1, SDL_event.window.data2,\n"
        "\t\t\t\t\t\tnew_width, new_height, (unsigned)Width, (unsigned)Height);\n"
        "\t\t\t\t\tif(new_width != Width || new_height != Height) {\n"
        "\t\t\t\t\t\tWidth = new_width;\n"
        "\t\t\t\t\t\tHeight = new_height;")

changed = False
if "[irr] nativeScale" not in s:
    if mark1 in s:
        s = s.replace(mark1, ins1, 1); changed = True
    else:
        print("!! nativeScale 앵커 불일치"); sys.exit(1)

if "[irr] resize ev=" not in s:
    if mark2 in s:
        s = s.replace(mark2, ins2, 1); changed = True
    else:
        print("!! resize 앵커 불일치"); sys.exit(1)

if changed:
    io.open(p, "w", encoding="utf-8").write(s)
    print("irrlicht 계측 로그 삽입")
else:
    print("already")
