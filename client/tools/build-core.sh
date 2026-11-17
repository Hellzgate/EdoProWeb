#!/usr/bin/env bash
# ocgcore + lua → WASM. EXPORTS 는 ocgapi.h(OCG_*) 자동 추출. 링크는 em++ (C++ 심볼)
set -uo pipefail
. "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1

E="$HOME/edo-src/edopro/ocgcore"
OUT="$HOME/edo-core-wasm"
OBJ="$OUT/obj"
rm -rf "$OUT"; mkdir -p "$OBJ/core" "$OBJ/lua"

CORE="card.cpp duel.cpp effect.cpp field.cpp interpreter.cpp libcard.cpp libdebug.cpp libduel.cpp libeffect.cpp libgroup.cpp ocgapi.cpp operations.cpp playerop.cpp processor.cpp processor_visit.cpp scriptlib.cpp"
LUA="lapi.c lauxlib.c lbaselib.c lcode.c lctype.c ldebug.c ldo.c ldump.c lfunc.c lgc.c liolib.c llex.c lmathlib.c lmem.c lobject.c lopcodes.c lparser.c lstate.c lstring.c lstrlib.c ltable.c ltablib.c ltm.c lundump.c lvm.c lzio.c"
COMMON="-O2 -w -std=c++17 -fno-rtti -DFMT_HEADER_ONLY -I$E -I$E/lua/src"

cd "$E" || exit 1
for f in $CORE; do emcc $COMMON -fno-exceptions -c "$f" -o "$OBJ/core/${f%.cpp}.o" 2>"$OUT/err_${f}.log" || echo "FAIL $f"; done
cd "$E/lua/src" || exit 1
for f in $LUA; do emcc $COMMON -fexceptions -x c++ -include "$E/lua/luaconf-customize.h" -I. -I.. -c "$f" -o "$OBJ/lua/${f%.c}.o" 2>"$OUT/err_${f}.log" || echo "FAIL $f"; done
echo "obj: core=$(ls "$OBJ"/core/*.o | wc -l) lua=$(ls "$OBJ"/lua/*.o | wc -l)"

EXPORTS=$(python3 "$HOME/gen-exports.py" "$E/ocgapi.h" 2>"$OUT/exports.log")
echo "exports: $(tail -2 "$OUT/exports.log" | head -1)"

em++ "$OBJ"/core/*.o "$OBJ"/lua/*.o -o "$OUT/ocgcore.js" \
  -sMODULARIZE=1 -sEXPORT_NAME=createOcgCore -sEXPORT_ES6=1 \
  -sEXPORTED_FUNCTIONS="[$EXPORTS,\"_malloc\",\"_free\"]" \
  -sEXPORTED_RUNTIME_METHODS='["ccall","cwrap","addFunction","removeFunction","HEAPU8","HEAP32","HEAPU32","UTF8ToString","stringToUTF8","lengthBytesUTF8"]' \
  -sALLOW_MEMORY_GROWTH=1 -sALLOW_TABLE_GROWTH=1 -sFILESYSTEM=0 -sWASM=1 \
  -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=1048576 2>&1 | tail -3

ls -lh "$OUT"/ocgcore.js "$OUT"/ocgcore.wasm 2>/dev/null
