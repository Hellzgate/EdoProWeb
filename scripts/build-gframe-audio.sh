#!/usr/bin/env bash
# gframe 전체 재빌드 (miniaudio 활성). 기존 오브젝트 디렉터리를 비우고 동일 플래그로 생성.
set -uo pipefail
. "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1

EDO="$HOME/edo-src/edopro"
DEPS="$HOME/edo-src/deps"
OUT="$HOME/edo-src/wasm/gframe-emcc3/obj"
J=12

rm -rf "$OUT"; mkdir -p "$OUT"
cd "$EDO/gframe" || exit 1

FLAGS="-O1 -w -std=c++17 -fno-rtti -fexceptions -include iterator -DFMT_HEADER_ONLY \
-DYGOPRO_USE_MINIAUDIO \
-I. -I../irrlicht/include -I../ocgcore -I../ocgcore/lua/src \
-I$DEPS -I$DEPS/fmt/include -I$DEPS/libevent-lite -I$DEPS/curl-stub -I$DEPS/emscripten-shim \
-sUSE_SDL=2 -sUSE_SQLITE3 -sUSE_FREETYPE=1"

compile_one() {
  f="$1"
  b=$(echo "${f#./}" | sed 's|\.cpp$||' | tr '/' '_')
  if em++ $FLAGS -c "$f" -o "$OUT/$b.o" > "/tmp/gfa_$b.log" 2>&1; then
    echo "OK $f"
  else
    echo "FAIL $f"
  fi
}
export -f compile_one
export OUT FLAGS

LIST=""
for f in *.cpp; do
  [ "$f" = "repo_manager.cpp" ] && continue
  LIST="$LIST $f"
done
for f in $(find . -mindepth 2 -name '*.cpp' -not -path './Android/*'); do
  LIST="$LIST $f"
done

echo "$LIST" | tr ' ' '\n' | grep -v '^$' | xargs -P "$J" -I{} bash -c 'compile_one "$@"' _ {} > "$OUT/build.txt" 2>&1
ok=$(grep -c '^OK ' "$OUT/build.txt" || true)
fail=$(grep -c '^FAIL ' "$OUT/build.txt" || true)
echo "gframe(audio): OK=$ok FAIL=$fail  obj=$(ls "$OUT"/*.o | wc -l)"
grep '^FAIL ' "$OUT/build.txt" | head -5
