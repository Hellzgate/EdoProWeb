# 소스 패치 목록

원본은 **edo9300/edopro (41.0.2)** + **irrlicht1-8-4 (1.9-custom)** 입니다.
아래 변경은 모두 **웹(wam) 빌드에만 적용**되도록 `#ifdef __EMSCRIPTEN__` 로 감싸거나,
웹 전용 경로(WebSocket 등)에서만 동작합니다.

---

## 1. EDOPro (`patches/edopro-source.patch`, gframe 11파일 +194줄)

| 파일 | 변경 | 이유 |
|---|---|---|
| `compiler_features.h` | `__EMSCRIPTEN__` → `EDOPRO_LINUX=1` 매핑 | 플랫폼 매크로가 하나도 정의되지 않아 `launch_ret_t` 등이 미정의 |
| `game_config.cpp` | `driver_type` 문자열에 **`WEBGL1`** 추가(읽기/쓰기) | EDOPro 는 WEBGL1 드라이버를 모른다 |
| `utils_gui.cpp` | 셰이더 경로를 `BUNDLED` → `/media/Shaders/` | 번들 정적 셰이더 대신 preload 한 GLSL 사용 |
| `game.cpp` | 루프에서 `DuelClient::PumpWeb()`, 프레임 리미터를 `emscripten_sleep` | 단일 스레드에서 네트워크 펌프 + 브라우저 양보 |
| `duelclient.h/.cpp` | `PumpWeb()` 추가, 스레드 생성 생략, `to_analyze` 큐 소비 | `std::thread` 불가 → 협조형 처리 |
| `image_downloader.cpp` | 스레드 생성/조인 생략 | 동일(스레드 불가) |
| `image_manager.cpp` | 스레드 생략, **이미지 동기 로딩**(`wait=true`), `LOADED` 상태 설정, `web_fetch_pic`(JS 헬퍼 호출) | 스레드가 없어 카드 이미지가 로딩되지 않음 |
| `edopro_main.cpp` | `real_main` 에 catch-all(진단용) | 초기 예외 원인 파악 |
| `gframe.cpp` | `[flow]` 진단 로그 | 초기화 단계 추적 |
| `data_handler.cpp` | `[flow]` 진단 로그 | 동일 |
| `config/system.conf` (신규) | `driver_type=WEBGL1`, 한국어 폰트/언어 | 웹 기본 설정 |

## 2. Irrlicht (`patches/irrlicht/*.cpp` 전체 교체)

| 파일 | 변경 | 이유 |
|---|---|---|
| `CSDL2ContextManager.cpp` | `generateContext()` — 첫 컨텍스트를 **static 공유**, `destroyContext()` **무시** | 브라우저는 캔버스당 컨텍스트 1개. EDOPro 가 임시 디바이스를 만들어 컨텍스트를 잃는 문제 |
| `CIrrDeviceSDL2.cpp` | 창 플래그 `SHOWN`, 캔버스 크기 변경 생략, `SDL_DestroyWindow`/`SDL_Quit` 생략 | OffscreenCanvas/컨텍스트 재사용, 페이지 수명 동안 창 유지 |
| `Irrlicht.cpp` | `createDeviceEx` 에 `[dev]` 진단 로그 | 디바이스 생성/드라이버 확인 |

> Irrlicht 는 zip 배포판(`1.9-custom`)이라 git diff 가 없어 **파일 전체 교체** 방식입니다.

## 3. 대체 라이브러리 (`deps/`)

| 대상 | 대체 | 설명 |
|---|---|---|
| **libevent**(`event2/*`) | `libevent-lite/` | `bufferevent_socket_connect` → **emscripten WebSocket**, 수신 → `evbuffer`+`readcb`, `event_base_dispatch` 는 `emscripten_sleep` 펌프. `pthread_setname_np`/`libevent_global_shutdown` 스텁 포함 |
| **curl** | `curl-stub/` | 타입/상수/스텁 함수(모두 실패 반환). 업데이터·이미지 다운로더는 웹에서 미사용 |
| `sys/sendfile.h` | `emscripten-shim/` | emscripten 에 없는 헤더 스텁 |
| `std::back_inserter` | 컴파일 플래그 `-include iterator` | utils.h 누락 보완 |
| `pthread_setname_np` | libevent-lite 스텁 | 단일 스레드 런타임 |

## 4. 게임 웹 빌드에서 제외

| 파일 | 이유 | 대체 |
|---|---|---|
| `repo_manager.cpp` | libgit2 불가 | `scripts/web_stubs.cpp` 의 빈 구현 + 서버 Git API |
| `irrlicht/src/lzma/LzmaEnc.c` 등 | 일부만 사용 | gframe/lzma 를 별도 컴파일 |

## 5. 런타임 주입 (HTML 후처리, `scripts/link-default.sh` → `patch_shell_post.py`)

- 셸 크롬(로고·컨트롤·로그창) 숨김 CSS, 캔버스 1024×640 중앙
- `window.EDOPRO_WS_BASE = ws(s)://<host>/ws`
- `Module.arguments = ['-i-want-to-be-admin']` (wasm 에서 `getuid()==0` 이라 root 판정 회피)
- `window.__edoproFetchPic(code, type)` — 카드 이미지 `/img/<id>.jpg` → MEMFS `/pics/<id>.jpg`
