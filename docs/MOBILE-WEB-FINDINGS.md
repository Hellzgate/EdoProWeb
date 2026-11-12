
### 20-10. 모바일(안드로이드) — 이번 세션 결론과 근거 (2026-11-12)

**결론**: PC 는 정상 동작하지만, **안드로이드 Chromium 계열 브라우저에서는 `Game::Initialize()` 호출 직후
렌더러가 `SIGTRAP`(Chromium `CHECK` 실패)으로 죽는 문제를 해결하지 못했다.** 아래는 배제한 가설과 근거이며,
다음 세션에서 이어받기 위한 기록이다.

#### 확정된 사실

| 관찰 | 근거 |
|---|---|
| 다운로드·부팅 초반은 정상 | `EDOPro version 41.0.2` → `LoadDatabases ok` → `game ctor done` → `device swapped` 까지 로그 확인 |
| 마지막 실행 문장 | `[flow] device swapped` (localStorage 백업으로 확인: `error [flow] device swapped`) |
| 다음 문장이 없음 | `Initialize()` 첫 줄 `WEBSTEP("Initialize start")`, `std::puts("[step] INIT-ENTER")` 모두 **미출력** |
| 사망 지점 | `libchrome.so +0x51a6f38` (항상 동일) — `base::debug::BreakDebugger()`(CHECK 공통 경로) |
| 스레드 | `Compositor` / `CrRendererMain` / `ThreadPoolForeg` 등 **매번 다름** |
| 브라우저 | 네이버 웨일 · 삼성 인터넷 **모두 동일** (Chrome 은 LAN 접속 자체가 차단되어 시험 불가) |

#### 배제한 가설 (모두 실측)

| 가설 | 시험 | 결과 |
|---|---|---|
| 메모리 부족 | 렌더러 PSS 추적(최대 239MB), `am kill-all` 로 **6.0GB 여유** 확보 후 재시험 | ❌ 동일 |
| GPU 텍스처 한계 | `/webglstress.html` 로 1024×1024 텍스처 **64장(256MB)** 할당 | ❌ 정상 (끝까지 성공) |
| WebGL 버전 | `-sMIN/MAX_WEBGL_VERSION=2` 재링크 | ❌ 동일 (`OpenGL ES 3.0 (WebGL 2.0)`) |
| Irrlicht 드라이버 | `irr_web_test`(게임 코드 없이 드라이버만) 폰에서 실행 | ✅ **정상 렌더**(색 사각형 4개, `3 frames rendered`) |
| 오디오(miniaudio) | `enable_sound=false` / `sound_backend=NONE` / 코드로 `SoundManager::NONE` 강제 | ❌ 동일 |
| 로그 전송(비콘·동기 XHR) | `?nolog=1`(로그 전송 완전 차단) | ❌ 동일 |
| wasm 스택 | `-sSTACK_SIZE` 5MB → **16MB** | ❌ 동일 |
| Asyncify 스택 | `-sASYNCIFY_STACK_SIZE` 1MB → **8MB** | ❌ 동일 |
| 화면맞춤 스크립트 | `?nofit` | ❌ 동일 |
| 유저데이터 복원 | `?norestore` | ❌ 동일(초기 진단 단계) |

#### 유력한 남은 방향 (다음 세션)

1. **CHECK 메시지 확보** — Chromium 은 `CHECK` 실패 시 `Check failed: <식>` 을 stderr 로 남긴다.
   Whale/Samsung 이 이를 logcat 에 남기지 않아 확인 실패. **`--enable-logging` 플래그를 줄 수 있는
   디버그 빌드 브라우저**(예: Chromium trunk APK, `chrome://flags`)로 재현하면 문구를 얻을 수 있다.
2. **`Initialize()` 이분탐색** — 함수 진입 자체가 의심되므로, `Initialize()` 를 **여러 개의 작은 함수로 분할**해
   어느 블록(디바이스/스킨/폰트/GUI/`imageManager`)이 문제인지 확인.
3. **엔진 쪽 대안**: 모바일에서는 `Game::Initialize()` 대신 **최소 초기화 경로**를 두고 단계별로 켜는 빌드.
4. **Asyncify 회피**: `emscripten_sleep` 기반 프레임 루프를 `emscripten_set_main_loop` 로 바꾸는 포팅 시도
   (PC 동작이 바뀔 수 있어 별도 브랜치 권장).

#### 모바일에서 확인된 **개선**(유지)

- 초기 전송 **131MB → 약 61MB**(gzip) · `.data` 100MB(BGM 제외)
- 로딩 오버레이(진행률·실패 사유·재시도) — 크래시 화면 대신 **진행 상황이 보인다**
- `/webgltest.html` · `/probe2.html` · `/webglstress.html` · `/last.html`(localStorage 마지막 로그) 진단 페이지
