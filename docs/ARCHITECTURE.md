# EDOPro Web — 아키텍처 / 모듈 지도

- 버전: **1.25.0** (이미지 `edopro-web:1.25.0`)
- 전송: `.br`(brotli) 우선 + BGM 지연 → 부팅 **45.6MB**(이전 81.3MB)
- 구성: **브라우저(wasm) + 정적·중계 서버(Python asyncio) + DSM HTTPS 역프록시**
- 원본: Project Ignis EDOPro 41.0.2 (gframe + irrlicht + ocgcore) / SDL2 2.32.10 / emscripten

```
[브라우저]  edopro-full.html + .js + .wasm + .data
   │  HTTPS (신뢰 인증서)                    ← DSM 역프록시 8451 → 192.168.0.53:7556
   ├─ /ws?host=&port=      ── WebSocket ⇄ TCP 브리지 ──▶ 게임서버(멀티롤 7911/7912/7914)
   ├─ /img/<id>.jpg        ── 카드/필드/커버 이미지 프록시(디스크 캐시) ──▶ ygoprodeck
   ├─ /api/repos(+sync/tar/bundle) ── git 저장소 동기화(카드DB·금제·스크립트)
   ├─ /api/userdata        ── 덱·리플레이·퍼즐·system.conf 보관(볼륨)
   ├─ /api/getrooms, /api/bot/* ── 로비/봇 패널 연동
   └─ /manifest.json, /icon-*.png ── PWA(전체화면·가로)
```

---

## 1. 저장소 파일 지도

| 경로 | 모듈 | 책임 |
|---|---|---|
| `docker/server.py` | **서버(단일 파일, 7개 논리 모듈)** | 아래 §2 |
| `docker/app/` | (분리 예정/없음) | 현재는 server.py 내부 섹션으로 구분 |
| `docker/Dockerfile` | 이미지 | nginx 없이 python asyncio 로 직접 서빙 + `.gz`/`.br` 사전 압축 |
| `scripts/patch_shell_post.py` | **셸 주입기(오케스트레이터)** | emscripten HTML 에 자산을 순서대로 삽입(멱등) |
| `scripts/shell/*` | **셸 자산(12개)** | `layout.css` · `boot.js`(유저데이터/저장소/세이버) · `ime.js` · `screenshot.js` · `fullscreen.js` · `fs-start.js` · `files.js` · `audio.js` · `board.js` · `jlog.js` · `load.js` · `diag.js` |
| `scripts/precompress.py` | 전송 최적화 | `web/*.{js,wasm,data}` 의 `.gz` + `.br` 생성(배포 전 1회) |
| `scripts/build-irrlicht.sh` | 빌드 | irrlicht 전체 오브젝트(`irr-emcc/obj`) |
| `scripts/build-gframe-audio.sh` | 빌드 | gframe 오브젝트(`gframe-emcc3/obj`) — `repo_manager.cpp`, `image_downloader.cpp` 제외 |
| `scripts/link-default.sh` | 링크 | wasm/html/data 생성 + `.gz` + postprocess 호출 |
| `scripts/rebuild-one.sh` | 빌드 | 단일 gframe .cpp 재컴파일 |
| `scripts/rebuild_irr_one.sh` | 빌드 | 단일 irrlicht .cpp 재컴파일 + 링크 + 이미지 |
| `scripts/rebuild_game_opt.sh` | 빌드 | `game.cpp` 만 `-O0`(모바일 크래시 회피) |
| `scripts/init_probe.sh` | 진단 | `Game::Initialize()` N단계 조기 return 이분탐색(별도 컨테이너) |
| `scripts/patch_*.py` | 소스 패치 | irrlicht/SDL/gframe 패치(멱등) |
| `scripts/web_stubs.cpp` | 스텁 | `RepoManager` 무력화(웹은 서버가 git 대행) |
| `scripts/tls/` | TLS(B안) | 미니PC nginx 로 TLS 종단할 때 사용 |
| `web/*.html` | 보조 페이지 | `last.html`(로그), `view.html`(해상도), `repos.html`(저장소), `bot.html` |
| `patches/` | 참고 스냅샷 | irrlicht/EDOPro 소스 스냅샷 + 통합 patch |
| `docs/` | 문서 | 본 문서 포함 16편 |
| `deps/` | shim | `curl-stub`(전 함수 실패), `libevent-lite`, `emscripten-shim` |

빌드 산출물(`edopro-full.*`, `release/`)은 `.gitignore` 로 제외.

---

## 2. 서버 모듈 (`docker/server.py`, 1,003줄)

| # | 모듈(섹션) | 주요 함수 | 노출 경로 |
|---|---|---|---|
| M1 | **설정/유틸** | 환경변수, `MIME`, `log()`, `resp()`, `read_head()` | — |
| M2 | **정적 파일** | `.br` → `.gz` → 원본 선택, Range 지원, COOP/COEP 헤더 | `/`, `/edopro-full.*`, `*.html` |
| M3 | **이미지** | `_safe_pic()`, `fetch_image()` (디스크 캐시) | `/img/<id>.jpg`, `/img/field/…`, `/img/cover/…` |
| M4 | **사용자 데이터** | `load_userdata()`, `save_userdata()`, `_ud_read_file()`, `_ud_write_file()`, `_file_kind()`, `render_files_page()` | `/api/userdata`, `/api/userdata/file`, `/files.html` |
| M5b | **BGM(지연)** | `/api/bgm`(목록) · `/api/bgm/<scene>/<file>` — `sound-bgm/` 16MB, `enable_music=1` 일 때만 셸이 받는다 | `/api/bgm*` |
| M5 | **저장소(git)** | `sync_repo()`, `list_repos()`, `build_repo_bundle()`, `make_tar()`, `auto_sync_repos()`, `repo_bundle_summary()` | `/api/repos`, `/api/repos/sync`, `/api/repos.tar`, `/api/repos/bundle` |
| M6 | **WS 브리지** | `ws_frame()`, `read_ws_frame()`, `ws_bridge()`, `_valid_host()` | `/ws` |
| M7 | **로비/봇** | `fetch_lobby_rooms()`, `_bot_request()` | `/api/getrooms`, `/api/bot/*` |
| — | **HTTP 라우터** | `handle()` / `main()` (TLS 8443 + HTTP 8080 동시) | 전체 |

### 환경변수
| 키 | 기본 | 의미 |
|---|---|---|
| `PORT` / `ROOT` | 8080 / `/app/web` | HTTP 포트 / 정적 루트 |
| `HTTPS_PORT` / `CERT_DIR` | 8443 / `/app/cert` | 자체서명 TLS |
| `REPOS` | `ProjectIgnis/BabelCDB` | 기본 동기화 저장소(쉼표) |
| `REPOS_AUTO_HOURS` | 0(off) | 자동 동기화 주기 |
| `BRIDGE_TARGET` / `BRIDGE_ALLOW_ANY` / `BRIDGE_FORCE` | — / 1 / 0 | WS 중계 정책 |
| `LOBBY_UPSTREAM` / `LOBBY_ALLOW_ANY` | `http://192.168.0.4:7922` / 1 | 방 목록 프록시 |
| `BOT_PANEL_URL` / `BOT_PANEL_TOKEN` | — | 멀티롤 봇 패널 |
| `USERDATA_DIR` | `/app/userdata` | 덱/리플레이 볼륨 |
| `GAME_CONFIG_DIR` | `/app/config` | **EDOPro `configs.json`·`user_configs.json`** — repos/urls 를 읽어 `REPOS` 와 합집합 |

### 정적 응답 (v1.19)
- `.gz` 사전 압축본 우선 + `Range` 지원(모바일 청크 로더)
- **`ETag`(W/"size-mtime") · `Last-Modified` · `If-None-Match` → 304** (재방문 시 65MB 재다운로드 방지)
- `/api/beacon?b=<빌드>&ime=<타입>` — 클라이언트가 어느 빌드를 실행 중인지 서버 로그로 확인

---

## 3. 셸 주입 모듈 (`scripts/patch_shell_post.py`)

| # | 블록(주석 마커) | 책임 |
|---|---|---|
| S1 | `CSS` | 페이지 레이아웃(16:10·검은 배경), 토스트, 로딩 오버레이, ⛶ 버튼, 시작 오버레이 스타일 |
| S2 | `EDOPRO_JLOG` | 콘솔/오류 → localStorage 이력(40건) + `?jlogsync=1`(서버 전송) |
| S3 | `EDOPRO_LOAD` | 로딩 UI(진행률), 부팅 판정(`canvas.width > 320`) |
| S4 | `DIAG` | `?diag=1` 좌상단 진단 패널 |
| S5 | `BOOT` | ①화면 맞춤(`fit`) ②덱/리플레이 동기화(`/api/userdata`) ③레포 번들 적용 ④드래그&드롭 |
| S6 | `FS` | 우상단 ⛶ 전체화면 토글 |
| S7 | `FS2` | 로딩 시 1탭 시작 오버레이(가로 전용·12초 자동 해제) |
| S8 | `FS3` | 우상단 📁 → `/files.html`(덱·리플레이 업/다운로드) |
| S9 | `FS4` | 첫 사용자 제스처에서 `AudioContext.resume()` (자동재생 정책) |
| S10 | `FS5` | **모바일 IME 브리지** — HTML 입력 → `keypress` → SDL_TEXTINPUT |
| S11 | `buildtag`/`FS6` | 빌드 스탬프(wasm mtime) · `Module.locateFile` · 6초 배지 · `/api/beacon` |
| — | `_strip_injected()` | 재실행 시 이전 주입 제거(멱등) |

**주입 규칙**: `</head>` 앞 CSS/meta, `<head>` 직후 dpr=1 스크립트(가장 먼저), `</body>` 앞 JS 블록들.

---

## 4. 네이티브 소스 패치 (재현용)

| 파일 | 패치 | 이유 |
|---|---|---|
| `gframe/utils_gui.cpp` | `getDefaultDriver()` **맨 앞**에 `#ifdef __EMSCRIPTEN__ → EDT_WEBGL1` | `EDOPRO_LINUX` 분기가 먼저 걸려 OpenGL(미컴파일) 선택 → 검은 화면 |
| `irrlicht/src/CIrrDeviceSDL2.cpp` | 캔버스 **버퍼 크기** 사용 + `SDL_WINDOWEVENT_RESIZED` 처리 | SDL 은 CSS px, 버퍼는 CSS×dpr |
| `gframe/image_manager.cpp` | `web_fetch_pic()` — `/img/…` **동기 XHR** → MEMFS | libcurl 스텁 |
| `gframe/game.cpp` | `[WEBSTEP]/[WEBFLOW]` 로그, `-O0` 컴파일 | 모바일 V8 거대함수 크래시 |
| `gframe/sound_manager.cpp` | emscripten 은 `MakeMiniaudioBackendDirect()` | **pthread 없음 → `std::thread` 백엔드 생성 실패(무음)** |
| `gframe/SoundBackends/miniaudio/sound_miniaudio.cpp` | `ma_backend_webaudio` 명시 + `ma_engine_config.pContext` | 자동 선택이 네이티브 백엔드를 먼저 시도 → 초기화 실패 |
| `irrlicht/src/CIrrDeviceSDL2.cpp` | `checkAndUpdateIMEState()` 에서 `Module.__edoproIME(on, rect)` | SDL2-emscripten 에 IME 없음 → HTML 입력 브리지 |
| `gframe/repo_manager.*` | `web_stubs.cpp` 로 대체 | 브라우저는 git 불가 → 서버가 대신 받고 목록만 표시 |
| `deps/curl-stub/curlstub.c` | 전 함수 실패 반환 | 링크용 |

---

## 5. 데이터 흐름

1. **부팅**: HTML → `Module` 초기화 → `/api/repos/bundle`(12MB) 풀기 → `/api/userdata` 복원 → `preRun`(덱/리플레이) → 메인 루프
2. **카드 이미지**: 렌더 중 `web_fetch_pic(code)` → `GET /img/<code>.jpg` → 서버 디스크 캐시(없으면 ygoprodeck) → MEMFS `/pics`
3. **대전**: 게임의 네트워크 → `wss://…/ws?host=&port=` → 서버가 TCP 연결 → 멀티롤(7911/7914)
4. **저장**: 20초/종료 시 `/deck`,`/replay`,`/puzzles`,`config/system.conf` → `/api/userdata`(볼륨)
5. **업데이트**: 서버가 git 동기화(6시간) → `/expansions`·`/script`·`/lflists` 번들 → 재접속 시 반영

---

## 6. 검증 명령

```bash
curl -sI  http://127.0.0.1:7556/                    # 200
curl -s   -o /dev/null -w "%{http_code} %{size_download}\n" --compressed http://127.0.0.1:7556/edopro-full.data
curl -s -i -N --max-time 5 --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
     "http://127.0.0.1:7556/ws?host=192.168.0.4&port=7911" | head -1     # 101
```
브라우저 진단: `/last.html`(로그), `/view.html`(해상도), `/repos.html`(저장소), `?diag=1`, `?nofit=1`, `?sync=0`.

---

## 7. 셸 주입 자산 (v1.24)

`patch_shell_post.py` 는 **오케스트레이터**다. 실제 주입 내용은 `scripts/shell/` 의 파일이고,
`_asset(name)` 이 그대로 읽어 넣는다(주입 결과 = 파일 내용).

| 자산 | 삽입 지점(마커) | 책임 |
|---|---|---|
| `layout.css` | `<head>` | 게임 화면만 표시, 토스트/버튼/IME 스타일 |
| `jlog.js` | `</head>` | 브라우저 콘솔·오류 서버 전송 |
| `load.js` | `<body>` | 로딩 오버레이 |
| `boot.js` | `</body>`(맨 앞) | 덱/리플레이/설정 저장·복원, 저장소 번들 적용, ETag, topbar |
| `ime.js` | `</body>` | 모바일 IME 브리지(`Module.__edoproIME`) |
| `screenshot.js` | `</body>` | 📷 스크린샷(`gl.readPixels`) |
| `fullscreen.js` | `</body>` | 전체화면 버튼 |
| `fs-start.js` / `files.js` / `audio.js` / `board.js` | `</body>` | 시작 안내 / 파일 페이지 링크 / 오디오 unlock / 보드 오버레이 |
| `diag.js` | `</body>`(맨 뒤) | `?diag=1` 진단 패널 |

- **불변 규칙**: 자산 파일의 **앞뒤 개행을 보존**해야 주입 HTML 이 바이트 동일해진다(검증: `cmp`).
- 새 자산을 추가하면 `_strip_injected()` 에도 마커 정규식을 넣어 **중복 주입**을 막는다.
