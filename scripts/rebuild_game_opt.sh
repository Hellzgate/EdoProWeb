#!/usr/bin/env bash
# game.cpp 만 -O0 로 재컴파일 (거대 함수 단순화 실험)
set -uo pipefail
. "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1

EDO="$HOME/edo-src/edopro"
DEPS="$HOME/edo-src/deps"
OUT="$HOME/edo-src/wasm/gframe-emcc3/obj"
OPT="${1:--O0}"

FLAGS="$OPT -w -std=c++17 -fno-rtti -fexceptions -include iterator -DFMT_HEADER_ONLY \
-DYGOPRO_USE_MINIAUDIO \
-I. -I../irrlicht/include -I../ocgcore -I../ocgcore/lua/src \
-I$DEPS -I$DEPS/fmt/include -I$DEPS/libevent-lite -I$DEPS/curl-stub -I$DEPS/emscripten-shim \
-sUSE_SDL=2 -sUSE_SQLITE3 -sUSE_FREETYPE=1"

cd "$EDO/gframe" || exit 1
if em++ $FLAGS -c game.cpp -o "$OUT/game.o" 2>&1 | tail -5; then
  echo "COMPILED game.o ($OPT)"
else
  echo "COMPILE FAIL"
fi
ls -l "$OUT/game.o"
