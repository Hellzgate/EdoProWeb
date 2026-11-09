# 빌드 절차

호스트 예: 미니PC `hellzsub-r3` (Ubuntu 26.04, Ryzen 5 7430U)
소요: 도구 설치 후 **약 2분**(irrlicht 271 + gframe 68 + ocgcore 42 컴파일 + 링크)

## 1. 툴체인 (sudo 불필요)

```bash
git clone --depth 1 https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
source ~/emsdk/emsdk_env.sh
```

## 2. 소스

```bash
mkdir -p ~/edo-src && cd ~/edo-src
# EDOPro 41.0.2 (ocgcore 서브모듈 포함)
git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/edo9300/edopro.git edopro

# Irrlicht 포크 (1.9-custom)
cd edopro/irrlicht
curl -sL -o irr.zip https://github.com/edo9300/irrlicht1-8-4/archive/1.9-custom.zip
unzip -q irr.zip
mv irrlicht1-8-4-1.9-custom/include include
mkdir -p src && mv irrlicht1-8-4-1.9-custom/source/Irrlicht/* src/
cp -r irrlicht1-8-4-1.9-custom/media media
rm -rf irrlicht1-8-4-1.9-custom irr.zip
```

## 3. 패치 적용

```bash
cd ~/edo-src/edopro
git apply /path/to/edopro-web/patches/edopro-source.patch          # gframe 11개 파일
cp /path/to/edopro-web/patches/irrlicht/*.cpp irrlicht/src/        # irrlicht 3개 파일 교체
```
내용은 [PATCHES.md](PATCHES.md) 참고.

## 4. 의존성(shim)

```bash
mkdir -p ~/edo-src/deps
cp -r /path/to/edopro-web/deps/libevent-lite /path/to/edopro-web/deps/curl-stub \
      /path/to/edopro-web/deps/emscripten-shim ~/edo-src/deps/
# nlohmann/json (단일 헤더)
mkdir -p ~/edo-src/deps/nlohmann
curl -sL -o ~/edo-src/deps/nlohmann/json.hpp \
  https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp
# fmt (header-only)
git clone --depth 1 https://github.com/fmtlib/fmt ~/edo-src/deps/fmt
```

## 5. 게임 자산

```bash
# EDOPro 공식 배포물(Linux) — config/fonts/textures/skin/expansions/lflists/deck/script 를 사용
cd ~ && mkdir -p edopro-ref && cd edopro-ref
curl -LO https://github.com/ProjectIgnis/edopro-assets/releases/download/41.0.2/ProjectIgnis-EDOPro-41.0.2-linux.tar.gz
tar xf ProjectIgnis-EDOPro-41.0.2-linux.tar.gz

# 빌드용 자산 디렉터리
mkdir -p ~/edopro-assets
cp -r ~/edopro-ref/ProjectIgnis/{config,fonts,textures,skin,expansions,lflists,deck,script} ~/edopro-assets/

# 한국어 패치 (UI 문자열 + 한국어 cdb)
git clone --depth 1 https://github.com/Team-AllYGOPro/edopro-korean.git /tmp/kr
cp /tmp/kr/cards.cdb ~/edopro-assets/expansions/cards.cdb
mkdir -p ~/edopro-assets/config/languages/Korean
cp /tmp/kr/strings.conf ~/edopro-assets/config/languages/Korean/strings.conf
curl -sL -o ~/edopro-assets/fonts/NotoSansKR-Regular.otf \
  https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf
```

`~/edopro-assets/config/system.conf` (웹 전용 설정):
```ini
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
```

## 6. 빌드

```bash
cd ~/edo-src/ocgwasm
./build-irrlicht.sh          # Irrlicht 271개 → ~/edo-src/wasm/irr-emcc/obj
./build-gframe-audio.sh      # gframe 68개 (-DYGOPRO_USE_MINIAUDIO) → ~/edo-src/wasm/gframe-emcc3/obj
# ocgcore(코어)는 EDOPro 저장소의 ocgcore/ 를 사용 (build.sh 참고: 16 + lua 26)
./link-default.sh            # 링크 + HTML 후처리(CSS/JS 주입) → ~/edo-src/wasm/web/edopro-full.*
cp ~/edo-src/wasm/web/edopro-full.* ~/edopro-docker/web/
```

링크 주요 플래그:
```
-sUSE_SDL=2 -sUSE_FREETYPE=1 -sUSE_LIBPNG=1 -sUSE_LIBJPEG=1 -sUSE_BZIP2=1 -sUSE_ZLIB=1 -sUSE_SQLITE3
-sASYNCIFY -sASYNCIFY_STACK_SIZE=1048576
-sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=0 -sINITIAL_MEMORY=134217728 -sSTACK_SIZE=5242880
-sDISABLE_EXCEPTION_CATCHING=0 -lwebsocket.js
--preload-file <asset>@/<path> ...
```

산출물: `edopro-full.wasm` 약 30MB, `.data` 약 80MB, `.js` 약 2.2MB.

## 7. 도커

```bash
cd ~/edopro-docker        # Dockerfile, server.py, web/
docker build -t edopro-web:1.0.0 .
docker run -d --name edopro-web --restart unless-stopped -p 7556:8080 \
  -v edopro_pics:/app/piccache -e BRIDGE_TARGET=192.168.0.4:7911 edopro-web:1.0.0
```
