#!/usr/bin/env bash
# 기본 셸로 링크(안정적 입력/렌더) + HTML 후처리로 '게임 화면만' 표시
set -uo pipefail
. "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1

W="$HOME/edo-src/wasm"
A="$HOME/edopro-assets"
EDO="$HOME/edo-src/edopro"
OBJ="$W/gframe-emcc3/obj"

em++ -O1 -w -std=c++17 -fno-rtti -fexceptions \
  "$OBJ"/*.o "$W"/irr-emcc/obj/*.o "$W"/out/obj/*.o "$W"/out/obj/lua/*.o \
  -o "$W/web/edopro-full.html" \
  -sUSE_SDL=2 -sUSE_FREETYPE=1 -sUSE_LIBPNG=1 -sUSE_LIBJPEG=1 -sUSE_BZIP2=1 -sUSE_ZLIB=1 -sUSE_SQLITE3 \
  -sASYNCIFY -sASYNCIFY_STACK_SIZE=1048576 \
  -sEXPORTED_RUNTIME_METHODS=["FS","ccall","cwrap","addRunDependency","removeRunDependency"]\
  -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=0 -sINITIAL_MEMORY=134217728 -sSTACK_SIZE=5242880 \
  -sDISABLE_EXCEPTION_CATCHING=0 -lwebsocket.js -sFETCH \
  --preload-file "$A/config@/config" \
  --preload-file "$A/fonts@/fonts" \
  --preload-file "$A/textures@/textures" \
  --preload-file "$A/skin@/skin" \
  --preload-file "$A/expansions@/expansions" \
  --preload-file "$A/lflists@/lflists" \
  --preload-file "$A/deck@/deck" \
  --preload-file "$A/script@/script" \
  --preload-file "$HOME/edo-src/assets-sound@/sound" \
  --preload-file "$EDO/irrlicht/media@/media" \
  2>&1 | tail -3

cp "$W/web/edopro-full.html" "$W/web/edopro-full.js" "$W/web/edopro-full.wasm" "$W/web/edopro-full.data" "$HOME/edopro-docker/web/"
# repositories 마운트용 preRun 주입은 postprocess 스크립트가 담당
python3 "$HOME/edo-src/ocgwasm/patch_shell_post.py"
ls -lh "$W/web/edopro-full.html"
