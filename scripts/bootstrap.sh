#!/usr/bin/env bash
# EDOPro Web — 소스/의존성/자산 준비 (패치 적용까지)
# 사용: ./bootstrap.sh [작업루트]   기본 ~/edo-src
set -euo pipefail

ROOT="${1:-$HOME/edo-src}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
ASSETS="$HOME/edopro-assets"
WORK="$ROOT/ocgwasm"

echo "== [1/6] emsdk =="
if [ ! -d "$HOME/emsdk" ]; then
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$HOME/emsdk"
  (cd "$HOME/emsdk" && ./emsdk install latest && ./emsdk activate latest)
fi
. "$HOME/emsdk/emsdk_env.sh"

echo "== [2/6] EDOPro + Irrlicht =="
mkdir -p "$ROOT"
if [ ! -d "$ROOT/edopro" ]; then
  git clone --depth 1 --recurse-submodules --shallow-submodules \
    https://github.com/edo9300/edopro.git "$ROOT/edopro"
fi
cd "$ROOT/edopro/irrlicht"
if [ ! -d src ]; then
  curl -sL -o irr.zip https://github.com/edo9300/irrlicht1-8-4/archive/1.9-custom.zip
  unzip -q irr.zip
  mv irrlicht1-8-4-1.9-custom/include include
  mkdir -p src && mv irrlicht1-8-4-1.9-custom/source/Irrlicht/* src/
  cp -r irrlicht1-8-4-1.9-custom/media media
  rm -rf irrlicht1-8-4-1.9-custom irr.zip
fi

echo "== [3/6] 패치 =="
cd "$ROOT/edopro"
git apply --check "$REPO/patches/edopro-source.patch" 2>/dev/null && git apply "$REPO/patches/edopro-source.patch" || echo "  (이미 적용됨)"
cp "$REPO"/patches/irrlicht/*.cpp irrlicht/src/

echo "== [4/6] 의존성 =="
mkdir -p "$ROOT/deps"
cp -r "$REPO/deps/libevent-lite" "$REPO/deps/curl-stub" "$REPO/deps/emscripten-shim" "$ROOT/deps/" 2>/dev/null || true
mkdir -p "$ROOT/deps/nlohmann"
[ -f "$ROOT/deps/nlohmann/json.hpp" ] || curl -sL -o "$ROOT/deps/nlohmann/json.hpp" \
  https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp
[ -d "$ROOT/deps/fmt" ] || git clone --depth 1 https://github.com/fmtlib/fmt "$ROOT/deps/fmt"

echo "== [5/6] 게임 자산 =="
mkdir -p "$HOME/edopro-ref"
if [ ! -d "$HOME/edopro-ref/ProjectIgnis" ]; then
  (cd "$HOME/edopro-ref" && curl -LO https://github.com/ProjectIgnis/edopro-assets/releases/download/41.0.2/ProjectIgnis-EDOPro-41.0.2-linux.tar.gz && tar xf ProjectIgnis-EDOPro-41.0.2-linux.tar.gz)
fi
mkdir -p "$ASSETS"
for d in config fonts textures skin expansions lflists deck script; do
  cp -r "$HOME/edopro-ref/ProjectIgnis/$d" "$ASSETS/" 2>/dev/null || true
done

# 한국어 패치
if [ ! -f "$ASSETS/config/languages/Korean/strings.conf" ]; then
  rm -rf /tmp/kr && git clone --depth 1 https://github.com/Team-AllYGOPro/edopro-korean.git /tmp/kr
  cp /tmp/kr/cards.cdb "$ASSETS/expansions/cards.cdb"
  mkdir -p "$ASSETS/config/languages/Korean"
  cp /tmp/kr/strings.conf "$ASSETS/config/languages/Korean/strings.conf"
fi
[ -f "$ASSETS/fonts/NotoSansKR-Regular.otf" ] || curl -sL -o "$ASSETS/fonts/NotoSansKR-Regular.otf" \
  https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf

cat > "$ASSETS/config/system.conf" <<'EOF'
driver_type = WEBGL1
vsync = 0
maxFPS = 60
fullscreen = 0
showConsole = 0
antialias = 0
nickname = Player
gamename = I:P
useWayland = 0
textfont = fonts/NotoSansKR-Regular.otf 12
numfont = fonts/NotoSansKR-Regular.otf
language = Korean
EOF

echo "== [6/6] 스크립트 배치 =="
mkdir -p "$WORK"
cp "$REPO"/scripts/*.sh "$REPO"/scripts/*.c "$REPO"/scripts/*.cpp "$WORK/" 2>/dev/null || true
chmod +x "$WORK"/*.sh

echo
echo "준비 완료. 다음:"
echo "  cd $WORK && ./build-irrlicht.sh && ./build-gframe-audio.sh && ./link-default.sh"
