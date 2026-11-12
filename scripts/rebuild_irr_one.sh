#!/usr/bin/env bash
# irrlicht CIrrDeviceSDL2.cpp 재컴파일 + 링크 + docker 이미지 빌드
#   사용: bash rebuild_irr_one.sh [태그]
set -uo pipefail
. "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1

TAG="${1:-1.13.0}"
IRR="$HOME/edo-src/edopro/irrlicht"
OUT="$HOME/edo-src/wasm/irr-emcc"
W="$HOME/edo-src/wasm"

cd "$IRR/src" || exit 1
em++ -O1 -w -std=c++17 -fno-rtti -I../include -D_IRR_STATIC_LIB_ -sUSE_SDL=2 \
  -c CIrrDeviceSDL2.cpp -o "$OUT/obj/CIrrDeviceSDL2.o" 2>&1 | tail -3
ls -l "$OUT/obj/CIrrDeviceSDL2.o" | awk '{print "  obj=" $5 "B"}'

cd "$HOME/edo-src/ocgwasm" && bash link-default.sh 2>&1 | tail -2

cd "$HOME/edopro-docker" || exit 1
docker build -q -t "edopro-web:$TAG" . >/dev/null 2>&1 && echo "  docker build OK ($TAG)"
