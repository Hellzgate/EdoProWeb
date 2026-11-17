# EDOPro Web — 처음부터 다시 만드는 설계 (v2)

> 2026-11-17 · 근거: [GAP-ANALYSIS.md](GAP-ANALYSIS.md)(전면 대조) · [HANDTEST-WEB.md](HANDTEST-WEB.md)(스레드 실패 기록) · [KNOWN-ISSUES.md](KNOWN-ISSUES.md) · [PATCHES.md](PATCHES.md) · 배포본 `edopro-web:1.25.5` 실측
> 목표: **PC/모바일 크로스플랫폼**, 원본 EDOPro 41.0.2 기능 전면 커버

---

## 0. 먼저 버릴 것과 남길 것

감사의 핵심 결론은 **"지금 web은 다시 만든 클라이언트가 아니라, 원본 C++을 브라우저에 밀어넣은 빌드"** 라는 것입니다.
그래서 처음부터 만들 때의 선택은 "무엇을 다시 구현하나"가 아니라 **"어느 계층을 원본에서 떼어내나"** 입니다.

| 계층 | 처리 | 이유(감사 근거) |
|---|---|---|
| **ocgcore + Lua (룰 엔진)** | **그대로 사용**(C, WASM/네이티브) | 카드 스크립트 22,953개가 Lua API에 의존. 재작성 불가 |
| **ygopro CTOS/STOC 프로토콜** | **그대로 사용** | 멀티롤·WindBot·리플레이 2,200개·금제 해시가 이 규격 |
| **cdb / pics / lflist** | 그대로 | 자산 |
| **Irrlicht** | **버린다** | 3D 엔진을 WebGL1로 패치한 4,593줄. 2.5D로 충분 |
| **gframe UI(약 10만 줄)** | **버린다** | 창/위젯/스킨/폰트 파이프라인이 브라우저·모바일과 맞지 않음 |
| **Emscripten 셸·asyncify·HTML 후처리** | **버린다** | 부팅 45.6MB·후처리 12모듈·`function signature mismatch`의 근원 |
| **스레드 기반 코어 구동** | **버린다** | 브라우저에 스레드 없음 → 퍼즐이 유일한 미해결 버그가 됨 |

---

## 1. 설계 원칙 8 (모두 감사 실측에서 유도)

| # | 원칙 | 근거 |
|---|---|---|
| **P1** | **코어는 렌더러와 같은 스레드/컨텍스트를 쓰지 않는다** | web의 유일한 P0(퍼즐)는 `epro::thread` 실패. fiber+asyncify 조합은 `signature mismatch`로 3회 실패 |
| **P2** | **스레드·SAB·COOP/COEP에 의존하지 않는다** | HTTPS에서도 COOP/COEP 헤더 없음(실측) → `crossOriginIsolated=false`, `SharedArrayBuffer=undefined` |
| **P3** | **코어는 "요청/응답 메시지 루프"로만 구동한다** | ocgcore API가 이미 `process() → messages → set_response()` 형태. 대기(`Signal`)가 필요 없음 |
| **P4** | **온라인 룰 판정은 서버 권위** | 멀티롤이 이미 `create_duel`을 서버에서 실행. 클라가 룰을 몰라도 됨 |
| **P5** | **단일/퍼즐은 로컬 코어**(Worker) | 퍼즐·핸드테스트는 서버 없이 돌아야 함. Worker면 P1·P2 만족 |
| **P6** | **부팅 페이로드를 8MB 이하로** | 현재 45.6MB(brotli) 실측. 대부분 스크립트·카드DB·폰트·BGM |
| **P7** | **자산은 필요할 때 스트리밍** | 스크립트 22,953개·카드 25k장을 선로딩하지 않는다 |
| **P8** | **원본은 "정답 oracle"로만 쓴다** | 리플레이 2,200개 + 현재 포팅 빌드로 프레임 단위 대조 가능 |

---

## 2. 아키텍처

### 2.1 배포 (온라인)

```
 PC 브라우저 / 모바일 PWA / 데스크톱(Tauri)
   │  WSS (ygopro CTOS/STOC 그대로)
   ▼
 Room Gateway  ← 기존 멀티롤 프론트(7914) + 웹 패널 API 재사용
   │
   ├─ ocgcore(C++) + Lua  ← 방마다 서버에서 실행(이미 동작)
   └─ WindBot 봇          ← 패널 API로 투입(이미 동작)
```

### 2.2 클라이언트 실행 (핵심)

```
┌──────────────────────────── UI 스레드(렌더/입력) ────────────────────────────┐
│  screens · board(2.5D) · input · i18n                                        │
│        │  ICore.request(msg)                        ▲ events                 │
└────────┼──────────────────────────────────────────────┼──────────────────────┘
         ▼                                              │
┌──────────────────── Core Worker (별도 실행 컨텍스트) ──┴─────────────────────┐
│  RemoteCore  : WebSocket ↔ Gateway   (온라인)                                 │
│  LocalCore   : ocgcore(WASM) + Lua   (퍼즐/핸드테스트/솔로)                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **UI는 절대 블로킹하지 않는다** → `Signal`·`Wait`·fiber·thread **모두 불필요**(P1·P2·P3)
- 두 구현이 **같은 `ICore`** → 대전·관전·리플레이·퍼즐이 같은 화면/상태기계를 공유
- LocalCore는 Worker 안에서 `process()` 루프를 돌지만 **메인에 영향 없음**

### 2.3 `ICore` 계약 (핵심 인터페이스)

```ts
interface ICore {
  open(o: {mode: 'online'|'local'|'replay', room?: RoomInfo, deck?: Deck}): Promise<void>;
  // 응답이 필요한 순간마다 이벤트로 온다 (UI는 즉시 그린다)
  on(ev: 'message', cb: (m: StocMessage) => void): void;
  on(ev: 'need',    cb: (q: Query) => void): void;   // 선택/옵션/체인/위치…
  respond(a: Response): void;                        // set_responsei/b
  state(): Snapshot;                                 // 직렬화 가능(재접속)
  close(): void;
}
```

| 구현 | open | 내부 |
|---|---|---|
| `RemoteCore` | WS 연결 + `JOIN/CREATE` | 패킷 중계 + 스냅샷 캐시 |
| `LocalCore` | `create_duel` + `start_duel` | Worker 안 폴링 루프 |
| `ReplayCore` | `.yrpX` 파서 | 같은 `StocMessage` 스트림 생성 |

→ **리플레이가 "다른 모드"가 아니라 같은 이벤트 소스**가 됩니다(P8).

---

## 3. 모듈 지도

```
app/
  core/        ICore.ts  remote.ts  local.ts  worker.ts  replay.ts
  engine/      protocol.ts(STOC/CTOS)  state.ts(결정적)  query.ts  replay-reader.ts
  render/      board.ts  cards.ts(atlas+LRU)  fx.ts  camera.ts  sdf-font.ts
  ui/          screens/{main,deck,duel,replay,rooms,settings}  widgets/
  data/        carddb.ts(샤드)  script-cache.ts  manifest.ts  i18n/
  platform/    net.ts  storage.ts(OPFS)  input.ts(touch/mouse/pad)  ime.ts  pwa.ts
  wasm/        ocgcore.wasm + loader (LocalCore 전용, 지연 로드)
```

역할 경계 규칙
- `engine/`은 DOM·캔버스·fetch를 모른다 → Node에서도 테스트 가능
- `render/`는 `engine`의 `view()`만 읽는다 → 화면 로직과 분리
- `core/local.ts`만 wasm을 import → **온라인 플레이 시 wasm 다운로드 0**

---

## 4. 자산·전송 예산 (실측 → 목표)

| 자산 | 현재(1.25.5 실측) | 설계 목표 | 방법 |
|---|---:|---:|---|
| wasm | 8.9MB(br) / 31.5MB(raw) | **0 (온라인)** / 3~4MB(로컬) | 룰 엔진 제거 · 로컬은 `ocgcore+lua`만 |
| `script/*.lua` 22,953 | 번들 6.1MB(br) | **0 선로딩** | 로컬 모드에서 **요청 시 1개씩**(`duel_script_reader` 훅 + 서버 캐시) |
| 카드DB(cdb) | .data 포함 | **샤드 6MB** | ID 대역 8분할 + 상세 lazy |
| 폰트 | 1.7MB(서브셋) | **0.3MB** | SDF 아틀라스(한글 음절 서브셋) |
| BGM | 16MB(lazy) | 0 | 스트리밍(선택) |
| 카드 이미지 | 서버 프록시 + 동기 XHR | **lazy ~20KB/장** | 아틀라스 + LRU + `?w=200` |
| 셸 | 69KB HTML | ~120KB(모듈) | 브리틀리 + SW 캐시 |
| **첫 진입** | **45.6MB / 40~60초** | **≤ 8MB / ≤ 8초** | 위 합 |

> 핵심: **스크립트와 룰 엔진을 클라이언트에서 빼는 것**만으로 45.6MB의 대부분이 사라집니다.

---

## 5. 플랫폼 전략 (PC/모바일)

| 플랫폼 | 형태 | 특이사항 |
|---|---|---|
| **PC 브라우저** | 동일 웹 앱 | 키보드 단축키, 창 크기, 다중 탭 금지(1탭 1세션) |
| **모바일** | **PWA**(manifest + SW) | 가로 고정, 세이프에어리어, 터치 UX, 홈 화면 설치 |
| **데스크톱 앱** | **Tauri로 같은 웹 자산 포장** | 로컬 코어를 네이티브(ocgcore)로 → 퍼즐/솔로 성능·오프라인 |
| **iOS** | PWA(설치형) | 전체화면 제약, 오디오 제스처, 저장소 용량 |

모바일 UX 원칙
- 데스크톱 레이아웃을 축소하지 않는다(보드 카드 크기·간격 별도)
- 하단 고정 명령 바(소환/발동/공격/페이즈), 롱프레스 = 툴팁/옵션
- **IME**: HTML `<input>` 오버레이 브리지(현 포팅에서 `Module.__edoproIME`로 검증된 방식)
- 세로 = 레터박스 + "가로로 돌려주세요" 안내(현 포팅과 동일 정책)

---

## 6. 기능 매트릭스 (원본 → 신규 설계)

| 원본 영역 | 신규 | 비고(감사에서 배운 것) |
|---|---|---|
| 덱 편집(25k 검색·필터·YDKE·사이드) | `screens/deck` | 가상 리스트 필수 |
| **사이드 덱 교환** | `screens/deck` 사이드 모드 | `STOC_CHANGE_SIDE`→`CTOS_UPDATE_DECK`→`STOC_WAITING_SIDE`. **검증: 세 덱 코드 멀티셋 동일** |
| 듀얼 UI(명령 8·체인 3·표시형식 4·선택/공표/전투/타이머) | `screens/duel` | 프로토콜 그대로 → 화면만 새로 |
| 온라인(방·관전·채팅·금제) | `screens/rooms` | Gateway 재사용 |
| LAN+AI | Gateway 봇 API | 클라 변화 없음(브라우저는 프로세스 불가) |
| **퍼즐/핸드테스트** | **LocalCore** | 현 포팅의 P0. 신규는 Worker라 구조적으로 해결 |
| 리플레이(재생·스텝·되감기·저장) | `core/replay` | 같은 상태기계 + 스냅샷 링버퍼 |
| 설정 5탭 | `screens/settings` | 웹 무관 항목(그래픽 드라이버 등) 숨김, FPS/스케일 노출 |
| 저장·업데이트 | 서버 + OPFS | 리포 동기화는 서버(현 구조 그대로) |
| 스크린샷 | WebGL `readPixels` | `toDataURL`은 검게 나옴(실측) |
| 공지(notices) | 미포함(선택) | 현재 포팅도 미구현 |
| 스킨 | 테마 토큰(카드백·필드) | 커스텀 스킨 파일 로드는 후순위 |
| 게임패드 | Gamepad API | 원본 조이스틱 대응 |

---

## 7. 렌더·성능 예산

| 항목 | 목표 |
|---|---|
| 프레임 | 16ms (모바일 60fps 유지, 30fps 옵션) |
| 드로우콜 | < 80 (아틀라스 1 + 카드 배치) |
| 메모리 | 모바일 ≤ 150MB (아틀라스 LRU 64MB 상한) |
| 이미지 | 화면당 신규 ≤ 2장/프레임(현 포팅의 프레임 예산 정책 계승) |
| 상태 스냅샷 | 1초 간격 + 이벤트 델타(재접속·관전·되감기 공용) |

---

## 8. 테스트 전략

| 층 | 방법 | 자산 |
|---|---|---|
| 프로토콜/상태 | **골든 리플레이 2,200개** 디코드 → 상태 해시 비교 | 기존 `.yrpX` |
| 화면 | 프레임 스냅샷 + 픽셀 diff | 현 포팅 빌드가 **oracle** |
| 로컬 코어 | 퍼즐 스크립트 N개 실행 → 결과(승/패·턴수) 고정 | `ProjectIgnis/Puzzles` 267개 |
| 온라인 | 가짜 클라 2개 + 봇 자동 대국 | 멀티롤 |
| 실기기 | SM-S942N(adb) 자동 설치·스크린샷·크래시 로그 | 기존 파이프라인 |
| 회귀 | "리플레이 1개 = 골든 이미지 1세트" | — |

---

## 9. 단계와 합격선

| Phase | 내용 | 합격선 |
|---|---|---|
| **P0** | `protocol` + `state` + `ReplayCore` (서버·wasm 없음) | 리플레이 **100개**를 oracle과 프레임 대조 → 불일치 0 |
| **P1** | `LocalCore`(Worker) + 퍼즐/핸드테스트 | 퍼즐 20개 클리어, UI 프리즈 0, `thread`/`signature` 오류 0 |
| **P2** | `RemoteCore` + 방/대전 | 30판 완주, 재접속·관전 각 3회 |
| **P3** | 덱 편집기(25k) | 필터 100ms, 스크롤 60fps, 사이드 모드 검증 |
| **P4** | 모바일 PWA + 터치/IME | 폰 10분 플레이, OOM 0, 한글 입력 |
| **P5** | 리플레이 되감기/공유 · Tauri 데스크톱 · 게임패드 | 오프라인 진입, 되감기 10초 |

각 단계 종료 시 **현 포팅 빌드는 그대로 서비스** → 신규가 앞서는 화면부터 교체.

---

## 10. 리스크와 완화

| 리스크 | 완화 |
|---|---|
| Core Worker 경계에서 메시지 순서/재진입 | 요청-응답 상관 id + 단일 큐, 계약 테스트 |
| 로컬 코어의 스크립트 지연 로딩 실패 | 스크립트 1개 실패 = 그 카드만 무효(치명 아님) + 서버 사전 캐시 |
| 룰 의미 미묘한 차이 | 서버 권위(P4)로 애초에 클라가 판정하지 않음 + 골든 리플레이 |
| 모바일 메모리 | 아틀라스 상한·이미지 lazy·wasm 로컬 모드만 |
| iOS PWA 제약 | 기능 감지 후 대체 UI(다운로드 대신 공유 시트 등) |
| 오라클 의존(현 포팅) | 오라클은 **테스트에만** 사용, 런타임 의존 없음 |
| 일정 | P0이 가장 싸고 리스크가 큼 → 먼저 |

---

## 11. 지금 포팅과 비교

| 항목 | 현재(1.25.5) | 신규 설계 |
|---|---|---|
| 첫 진입 | 45.6MB / 40~60초 | **≤8MB / ≤8초** |
| 퍼즐·핸드테스트 | ❌(스레드) | ✅(Worker) |
| 사이드 교환 | 미구현 | ✅(P3) |
| 스레드/SAB 의존 | 없음(그래서 퍼즐 불가) | **불필요** |
| Irrlicht | 패치 4,593줄 | 없음(2.5D) |
| 업스트림 추적 | diff 재적용 | **규격·코어만 추적** |
| 모바일 | 부분(검증 미완) | PWA 우선 |
| 유지비 | C++ 패치 11파일 + 셸 12모듈 + 100개 patch 스크립트 | TS 모듈 + Worker |

---

## 12. 결정이 필요한 3가지

1. **LocalCore 범위**: 퍼즐/핸드테스트만인가, **솔로 대전(봇 없이)** 까지인가 — 후자면 덱 로딩·AI 없이 코어만으로 가능.
2. **데스크톱 앱**: Tauri로 낼 것인가(오프라인·네이티브 코어 이득) 아니면 PWA만인가.
3. **전환 방식**: 신규를 화면 단위로 붙이며 교체(권장) vs 완성 후 일괄 교체.
