#!/usr/bin/env bash
# Irrlicht(1.9-custom) 를 emscripten 으로 컴파일해 손상도를 측정한다 (S2a).
set -uo pipefail
. "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1

IRR="${1:-$HOME/edo-src/edopro/irrlicht}"
OUT="${2:-$HOME/edo-src/wasm/irr-emcc}"
J="${3:-12}"

rm -rf "$OUT"; mkdir -p "$OUT/obj" "$OUT/log"
cd "$IRR/src" || exit 1

FLAGS="-O1 -w -std=c++17 -fno-rtti -I../include -D_IRR_STATIC_LIB_ -sUSE_SDL=2"
CFLAGS="-O1 -w -I../include -sUSE_SDL=2"

compile_one() {
  f="$1"
  b="$(echo "${f%.*}" | tr '/' '_')"
  case "$f" in
    *.c) cc=emcc; FL="$CFLAGS" ;;
    *)   cc=em++;  FL="$FLAGS" ;;
  esac
  if $cc $FL -c "$f" -o "$OUT/obj/$b.o" > "$OUT/log/$b.log" 2>&1; then
    echo "OK $f"
  else
    echo "FAIL $f"
  fi
}
export -f compile_one
export OUT FLAGS CFLAGS

# 최상위 + 부가 라이브러리(zlib/bzip2/libpng/jpeglib 는 emscripten 포트 사용)
FILES="$(ls *.cpp) aesGladman/aescrypt.cpp aesGladman/aeskey.cpp aesGladman/aestab.cpp \
aesGladman/fileenc.cpp aesGladman/hmac.cpp aesGladman/prng.cpp aesGladman/pwd2key.cpp \
aesGladman/sha1.cpp aesGladman/sha2.cpp lzma/LzmaDec.c"

echo "$FILES" | tr ' ' '\n' | grep -v '^$' | xargs -P "$J" -I{} bash -c 'compile_one "$@"' _ {} > "$OUT/result.txt" 2>&1

ok=$(grep -c "^OK " "$OUT/result.txt" || true)
fail=$(grep -c "^FAIL " "$OUT/result.txt" || true)
total=$(grep -cE "^(OK|FAIL) " "$OUT/result.txt" || true)
echo "=============================================="
echo "Irrlicht emcc: OK=$ok FAIL=$fail (total=$total)"
echo "=============================================="
if [ "$fail" != "0" ]; then
  echo "--- 실패 파일 + 첫 오류 ---"
  grep "^FAIL " "$OUT/result.txt" | awk '{print $2}' | while read -r f; do
    b="$(echo "${f%.*}" | tr '/' '_')"
    first=$(grep -m1 -E "error:|fatal error:" "$OUT/log/$b.log" | head -c 200)
    printf "  %-42s %s\n" "$b" "${first:-<오류 줄 없음>}"
  done
fi
echo "--- 오류 유형 집계 ---"
cat "$OUT/log"/*.log 2>/dev/null | grep -oE "error: .{0,60}" | sed 's/[0-9]\+/N/g' | sort | uniq -c | sort -rn | head -20
