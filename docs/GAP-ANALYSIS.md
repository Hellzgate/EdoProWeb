# EDOPro Web — 원본 대비 격차 분석과 방안

> 조사일 2026-11-17 · 대상 `edopro-web:1.25.5` (미니PC `http://192.168.0.53:7556/`)
> 원본 기준 `EDOPro 41.0.2 "Bagooska"` (`~/edo-src/edopro`)

## 0. 요약

| 구분 | 건수 | 내용 |
|---|---:|---|
| **A. 브라우저가 원래 못 함** | 4 | 로컬 호스팅 · WindBot 로컬 실행 · OS 파일 대화상자 · OS 공유 |
| **B. 미해결(진짜 버그)** | **1** | **퍼즐/패 테스트(싱글모드) 시작** |
| **C. 대체 구현됨(원본과 다름)** | 5 | 저장소 UI · 카드 이미지 다운로더 · 로비 · 오디오 · 파일 저장 |
| **D. 품질/성능 격차** | 7 | 첫 로딩 40~60초 · 메모리 · `???` 미번역 · 스킨 없음 · 창/해상도 · 게임패드 · 모바일 |

**결론**

- UI 표면은 **사실상 완전**하다 — 원본 버튼 상수 **142개** 중 우리가 새로 만든 화면은 없고, 미구현 화면도 없다.
- 실질 격차는 **P0 1건(퍼즐 시작)** + P1 3건(로딩·메모리·미번역)이다. 나머지는 "브라우저가 못 하는 일"이며 이미 우회돼 있다.
- **언어 교체(Rust 등)는 이 격차를 줄이지 않는다.** 격차의 원인은 언어가 아니라 ① 브라우저 API 부재 ② 스레드 부재 ③ 자산 크기다.
- **pthreads로 가는 우회로는 현재 배포 형태에서 막혀 있다**(실측: `crossOriginIsolated=false`, `SharedArrayBuffer=undefined`, `isSecureContext=false`). → **A안(상태기계)이 유일한 현실 경로**.

---

## 1. 조사 방법 (재현 가능)

```bash
# 원본 = 미니PC
ssh mini
E=~/edo-src/edopro/gframe
grep -oE "BUTTON_[A-Z0-9_]+" $E/menu_handler.h | sort -u | wc -l     # 142
ls -1 $E/*.cpp | wc -l                                              # 43
grep -n "epro::thread\|singleSignal.Wait\|actionSignal.Wait" $E/single_mode.cpp
sed -n '1,80p' ~/edo-src/ocgwasm/build-gframe4.sh                   # 제외 목록
cat ~/edo-src/ocgwasm/link-default.sh                               # 링크 플래그
```

```js
// 런타임 = Playwright (pw)
await page.goto('http://192.168.0.53:7556/');   // 40~60초 로딩
// 퍼즐 듀얼 → 항목 선택 → '퍼즐 다시 시작'
// 콘솔: [fatal] uncaught: thread constructor failed: Not supported
```

보조: `README.md` §4 상태표, `docs/KNOWN-ISSUES.md`, `Web/` 셸(`boot.js`·`ime.js`·`screenshot.js`).

---

## 2. 현재 web의 실제 구성 (실측)

| 항목 | 값 |
|---|---|
| 컴파일 범위 | `gframe/*.cpp` **41/43** + 하위 폴더, `irrlicht`(패치), `ocgcore`, `lua` |
| **컴파일 제외** | `repo_manager.cpp` · `image_downloader.cpp` (→ 서버/스텁이 대체) |
| 링크 플래그 | `-O1 -sASYNCIFY -sASYNCIFY_STACK_SIZE=1MB` · `-sUSE_SDL/FREETYPE/LIBPNG/LIBJPEG/BZIP2/ZLIB/SQLITE3` · `-sINITIAL_MEMORY=128MB` · `-sSTACK_SIZE=5MB` · `-sALLOW_MEMORY_GROWTH` |
| 자산 | `.data` **80,052,282 B** (config·fonts·textures·skin·expansions·lflists·deck·script·sound·media) |
| 산출물 | `.wasm` **31,530,568 B** · `.js` 2.2MB · 서빙 HTML **69,297 B**(셸 인라인) |
| 스레드 | wasm 내 `pthread_create` **0건** (단일 스레드 빌드) |
| 서버 | `server.py` — `/api/userdata`(+`/file`) · `/api/repos`(+`bundle`,`sync`,`tar`) · `/api/bgm` · `/api/getrooms` · `/api/bot/{start,stop,stopall,decks,rooms}` · `/ws` |
| 리포 동기화 | 콘솔 실측 `[repo] applied 5283 files (37.9MB)` · 6시간 자동 |
| 렌더 | `OpenGL ES 2.0 (WebGL 1.0)` · 60 FPS |

---

## 3. 격차 전수 목록

### A. 브라우저가 원래 못 하는 것 (기능 부재 = 해결 불가, 우회만)

| # | 항목 | 근거 | 현재 | 판정 |
|---|---|---|---|---|
| A1 | **로컬 방 만들기(TCP 호스팅)** | `NetServer::StartServer` 호출 제거(`patch_host_confirm2.py`) · `menu_handler.cpp` | **멀티롤 7914 로 대체** | 종결(우회) |
| A2 | **WindBot 로컬 실행** | 브라우저는 프로세스 생성 불가 · `windbot.cpp` UI만 존재 | **NAS 패널 `POST /api/bot/start`** (`patch_botapi.py`) | 종결(우회) |
| A3 | **OS 파일 대화상자**(덱 내보내기/불러오기·리플레이 저장) | `BUTTON_FILE_SAVE`, `BUTTON_IMPORT_YDKE` | `/files.html` 업/다운로드 + 드래그&드롭(v1.6.0) | 종결(우회) |
| A4 | **OS 공유 시트** | `BUTTON_SHARE_REPLAY`, `BUTTON_SHARE_SINGLEPLAY` | 없음(다운로드로 대체 가능) | 미구현(낮음) |

> **정정 (2026-11-17, 소스 확인)**: **사이드 덱 교환은 원본·멀티롤 모두 지원**한다.
> `STOC_CHANGE_SIDE`(0x7) → 클라가 덱 편집기를 `is_siding` 모드로 열어 main/extra/side 재배치 →
> `CTOS_UPDATE_DECK`(0x2, `[u32 main+extra][u32 side][codes…]`) → 서버 검증(`GenericDuel::UpdateDeck` /
> 멀티롤 `Room/State/Sidedecking.cpp`) → `STOC_WAITING_SIDE`(0x8) 대기 → 다음 판 + `STOC_SELECT_TP`.
> 검증 규칙: main(스킬 제외)·extra 장수 동일, **세 덱 전체 카드 코드 멀티셋이 원본과 동일**(카드 교체 불가, 재배치만),
> 스킬/LEGEND 각 ≤ max(원본,1). 불가한 것은 **WindBot 봇뿐**(`Executor` 에 `OnSide*` 콜백 없음).
> → 이전 판에 "원본도 미지원"으로 적은 것은 **오기**이며, 웹 클라이언트도 **P1 범위에서 구현**한다.

### B. 미해결 — **P0**

| # | 항목 | 근거 | 증상 |
|---|---|---|---|
| B1 | **퍼즐/패 테스트(싱글모드) 시작** | `single_mode.cpp:28` `epro::thread single_mode_thread` · `:35` `= epro::thread(SinglePlayThread, …)` · `:351/:406 actionSignal.Wait(lock)` · `:415/:446 singleSignal.Wait()` · **단일모드 관련 패치 스크립트 0건**(grep 실측) | 퍼즐 **목록·설명은 정상**(실측: `AlphaKretin_01_3200.lua` 설명 표시) → **시작 시** `[fatal] uncaught: thread constructor failed: Not supported` → 듀얼 진입 실패 |

#### B1 방안 비교

| 안 | 내용 | 선행 조건 | 비용 | 판정 |
|---|---|---|---|---|
| **A. 상태기계(권장)** | `StartPlay` 의 while 루프를 `PumpWeb()` 으로, `Wait()` 3곳을 `return;` + 다음 프레임 재개 | 없음 | **소** | ✅ **채택** |
| B. pthreads | `-pthread` + `PROXY_TO_PTHREAD` + `SAB` | **① HTTPS(secure context) ② COOP/COEP ③ pthread 전체 재빌드 ④ 모바일 예외** | 중 | ❌ 현 배포에서 불가 |
| C. 서버 실행 | 패 연산을 서버에서 돌리고 클라이언트는 표시만 | 별도 프로토콜·동기화 설계 | 대 | ❌ 오버킬 |

**B안이 왜 지금 불가한가 (실측)**

| 확인 항목 | 값 | 의미 |
|---|---|---|
| `self.crossOriginIsolated` | **false** | 격리 컨텍스트 아님 |
| `typeof SharedArrayBuffer` | **undefined** | SAB 자체가 비활성 |
| `self.isSecureContext` | **false** | `http://192.168.0.53` → **비보안 컨텍스트** |
| `curl -I http://…:7556/` | COOP/COEP **헤더 없음** | `patch_connclose.py` 가 넣은 헤더가 실제 응답에 없음 |
| wasm `pthread_create` | **0건** | 현재 빌드는 단일 스레드 |

→ SAB 는 **secure context + COOP/COEP + (크로스오리진 자원) CORS** 를 모두 만족해야 열린다. LAN 평문 HTTP 배포를 유지하는 한 B안은 성립하지 않는다.

### C. 대체 구현됨 (동작하지만 원본과 다름)

| # | 원본 기능 | web 구현 | 차이/주의 |
|---|---|---|---|
| C1 | 저장소 관리 UI(`BUTTON_REPO_CHANGELOG`) | `repo_manager.cpp` 제외 + `web_stubs.cpp` → `window.__repos` 표시, 갱신은 서버 6시간 | 브라우저에서 clone/pull 불가(정상) |
| C2 | 카드 이미지 다운로더(`image_downloader.cpp`) | 서버 pics + **동기 XHR** | 대량 다운로드 시 UI 멈춤 가능 |
| C3 | 서버 로비 목록 | `curl` → **동기 XHR**(`RefreshRooms`) | 지연 2~3초, 실패 시 빈 목록 |
| C4 | 사운드(SDL_mixer) | `sound_miniaudio.cpp` → Web Audio | 동작(v1.9.0) |
| C5 | 파일 저장 | MEMFS + IndexedDB + `/api/userdata` | 서버 백업(12파일 복원 실측) |

### D. 품질 / 성능 격차

| # | 항목 | 실측 | 영향 |
|---|---|---|---|
| D1 | **첫 로딩** | wasm 31.5MB + data 80MB → **40~60초** | 진입 장벽 |
| D2 | 메모리 | `INITIAL_MEMORY=128MB` + growth, STACK 5MB | 모바일에서 OOM 위험 |
| D3 | **미번역 문자열** | 설정 > 클라이언트 탭에 **`???` 1개** 실측 | 폴리시 |
| D4 | 스킨 | 설정에 **`없음`** | 원본은 커스텀 스킨 지원 |
| D5 | 창/해상도 | 뷰포트 고정(FPS 60 캡) | 원본은 창 크기·FPS 설정 |
| D6 | 게임패드 | `joystick_wrapper.cpp` 컴파일됨 · **미검증** | — |
| D7 | 모바일 | 1.10.15(미릴리스) 세로 안내·터치 | 진행 중 |

---

## 4. 우선순위 로드맵

| 순위 | 항목 | 범위 | 완료 기준 |
|---|---|---|---|
| **P0** | B1 퍼즐/패 테스트 | `single_mode.{h,cpp}` + `game.cpp` 프레임 훅 | 퍼즐 시작 → 보드 표시 → 클리어/재시작 정상, 콘솔 fatal 0 |
| P1 | D1 로딩 | 자산 분할(스크립트·카드이미지 lazy) + `.data` 압축/분할 | 첫 진입 **20초 이내**, 기능 회귀 0 |
| P1 | D2 메모리 | 모바일 프로파일(INITIAL 축소 + 스트리밍) | 폰에서 10분 플레이 OOM 0 |
| P1 | D3 `???` | sysstr 누락 보완 | 설정 전 탭 `???` 0 |
| P1 | **사이드 덱 교환**(사람 대전) | `STOC_CHANGE_SIDE` → 덱 편집기 사이드 모드 → `CTOS_UPDATE_DECK` | 3판 매치에서 2판째 진입, 서버 검증 통과 |
| P2 | A4 공유 | 리플레이/퍼즐 "다운로드" 버튼 | 클릭 → 파일 저장 |
| P2 | D4 스킨 | 스킨 목록 노출(사전 로드분) | 1개 이상 선택 가능 |
| P2 | D6 게임패드 | 브라우저 Gamepad API 연결 | 패드로 커서/확인 |
| P2 | D7 모바일 | 1.10.15 릴리스 | 세로/터치 안내, 입력 정상 |
| P3 | B안(pthreads) **재평가** | HTTPS 배포가 결정되면 | 그때 비용/이득 재계산 |

---

## 5. P0 구현 스케치 (A안)

```cpp
// single_mode.h
enum class SMState { Idle, Run, WaitResponse, WaitPopup, Done };
static SMState sm_state = SMState::Idle;
static void PumpWeb();          // game.cpp 메인 루프에서 매 프레임

// single_mode.cpp
void SingleMode::StartPlay(DuelOptions&& o) {
    web_options = std::move(o);
    sm_state = SMState::Run;
    PumpWeb();                   // 즉시 1회 (기존 thread 대신)
}

void SingleMode::PumpWeb() {
    int budget = 64;             // 프레임당 패킷 상한(무한 루프 방지)
    while (sm_state == SMState::Run && budget-- > 0) {
        auto packet = core->GetNextPacket();      // 기존 루프 본문 그대로
        switch (packet.message) {
        case MSG_SELECT_IDLECMD: /* UI 갱신 */ sm_state = SMState::WaitResponse; return;
        case MSG_SHOW_HINT:      /* 팝업    */ sm_state = SMState::WaitPopup;    return;
        case MSG_WIN: case MSG_DUEL_END:        sm_state = SMState::Done;        return;
        default: break;
        }
    }
}
// 응답 경로: singleSignal.Set()  → sm_state = SMState::Run;  (기존 Set 과 동일 지점)
// StopPlay            → sm_state = SMState::Done;
```

주의점 3개

1. **gMutex**: 기존 `Wait(lock)` 이 락을 놓는 구조 → 폴링에서도 UI 를 만질 때만 `unique_lock` 을 잡고 즉시 반환.
2. **재진입 금지**: `sm_state != Run` 이면 `core` 호출 금지(응답 대기 중 재진입 차단).
3. **Analyze() 자동 진행 경로**: 대기 없이 계속 도므로 프레임당 상한(budget) 필수.

---

## 6. 검증 절차

```bash
# 미니PC
bash ~/edo-src/ocgwasm/build-gframe4.sh
bash ~/edo-src/ocgwasm/link-default.sh          # → ~/edopro-docker/web/
docker restart edopro-web
```

| # | 확인 | 기대 |
|---|---|---|
| 1 | 콘솔 `[fatal] uncaught` | **0건** |
| 2 | 퍼즐 목록 → 시작 | 5초 내 보드, FPS ≥ 30 |
| 3 | 퍼즐에서 카드 사용/공격 | 응답 정상(멈춤 없음) |
| 4 | 퍼즐 종료 → 메인 메뉴 | 복귀 정상, 재시작 가능 |
| 5 | 회귀 5종: 덱 편집·LAN(AI)·서버 대전·리플레이·저장 | 전부 정상 |
| 6 | 10분 방치 | 메모리 증가/프리즈 없음 |

---

## 7. 하지 않기로 한 것 (근거)

| 후보 | 이유 |
|---|---|
| **Rust/TypeScript 재작성** | 격차 원인이 언어가 아님. UI 는 이미 원본 코드 재사용으로 완전. 재작성 시 Irrlicht·gframe 대체 비용 + 업스트림 추적 상실 |
| **SAB 기반 스레드(B안) 지금** | LAN 평문 HTTP + COOP/COEP 미적용 → `SharedArrayBuffer` 자체가 없음(실측). HTTPS 전환 결정 전에는 성립 불가 |
| **로컬 호스팅 복원** | 브라우저는 TCP 서버를 열 수 없음(멀티롤로 이미 해결) |
| **WindBot in browser** | 프로세스 실행 불가(패널 봇으로 해결) |

---

## 8. 남은 질문 (결정 필요)

1. **HTTPS 배포 계획**이 있는가? → 있으면 B안(pthreads)을 다시 계산할 가치가 생긴다(단 모바일 예외 확인 필요).
2. **모바일이 정식 목표**인가? → 그렇다면 D2(메모리)·D7(터치)가 P1로 올라가고 D1(로딩) 대책이 필수.
3. **퍼즐/패 테스트 외에 "원본에 있는데 web에서 안 보이는 화면"** 이 있는가? (사용자 체감 기준) — 제보 받으면 D/E 항목으로 추가.
