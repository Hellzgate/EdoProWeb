# EDOPro Web — 현재 상태 / 다음 작업 (인수인계)

> 새 세션은 **이 파일만 읽고** 이어서 시작한다. (2026-11-17 기준)
> 마지막 커밋: `4f5fe5e` 이후 → 이번 작업(코어 링크 성공 + 실제 듀얼 검증) 커밋 예정.

## 1. 한 줄 상태

**P2(ocgcore WASM) 완료** — 링크 성공, 실제 카드·스크립트로 **드로우 → 소환 → 필드 이동**까지 검증.
**다음 = P2-b `LocalCore.ts` 배선** (JS/Worker) → P3(온라인).

## 2. 이번에 뚫은 것 (중요 — 다시 헤매지 말 것)

### 2.1 링크 성공 조건 4가지
| 문제 | 해결 |
|---|---|
| C++ 심볼 미해결 | 링크는 **`em++`** (emcc 아님) |
| export 이름 | 이 코어는 **`OCG_` 접두사** → `tools/gen-exports.py` 가 `ocgapi.h` 에서 추출 |
| Lua 가 throw | **Lua 만 `-fexceptions`** + `liolib.c` 필수(`luaopen_io`) |
| **상태 5 `INCOMPATIBLE_LUA_API`** | **코어도 `-fexceptions`** 로 컴파일해야 함. `interpreter.cpp` 의 검사 함수가 "스택 풀기 중 소멸자가 도는지"를 보므로 `-fno-exceptions` 코어에서는 실패한다 |

산출: `public/wasm/ocgcore.wasm` **1.7MB**, `ocgcore.js` 91KB, OCG v11.0.

### 2.2 ocgcore C API 실측 (추측 금지 — 헤더가 정답)
```c
int   OCG_CreateDuel(OCG_Duel* out, const OCG_DuelOptions* opts);  // 실패 시 0 아닌 status
void  OCG_StartDuel(OCG_Duel);                                     // **void**
int   OCG_DuelProcess(OCG_Duel);      // 0=END 1=AWAITING 2=CONTINUE
void* OCG_DuelGetMessage(OCG_Duel, uint32_t* len);                 // **내부 버퍼 포인터**
void  OCG_DuelSetResponse(OCG_Duel, const void* buf, uint32_t len);
void  OCG_DestroyDuel(OCG_Duel);
void  OCG_DuelNewCard(OCG_Duel, const OCG_NewCardInfo* info);
int   OCG_LoadScript(OCG_Duel, const char* buf, uint32_t len, const char* name);
```
`OCG_CardData` 순서(wasm32): code0 · alias4 · **setcodes(ptr)8** · type12 · level16 · attribute20 · race(u64)24 · atk32 · def36 · lscale40 · rscale44 · link_marker48
`OCG_DuelOptions`: seed[4](u64×4) · flags · **team1(startingLP, startHand, drawPerTurn)** · team2 · cardReader(+payload) · scriptReader(+payload) · logHandler(+payload) · cardReaderDone(+payload) · enableUnsafeLibraries

### 2.3 메시지 버퍼 형식 (이게 핵심 함정)
- `OCG_DuelProcess` 가 `buff.clear()` 후 `process()` 루프 → **배치**로 쌓는다.
- `OCG_DuelGetMessage` 는 **배치 전체**를 반환하고 **다음 process 전까지 유지**(호출해도 비워지지 않는다 → 반복 호출하면 무한 루프).
- 배치 안의 각 메시지 = **`[u32 size][type u8][payload (size-1)]`** — `size` 는 type 포함, **4바이트 정렬 보장 없음** → `DataView.getUint32(off, true)` 로 읽어야 한다. (`HEAPU32[(p+off)>>2]` 는 정렬 때문에 오독)
- 응답은 `web_set_response_buf`/`web_set_response_int` 로 **길이까지 정확히**(예: `SELECT_CHAIN` = `u32 0xFFFFFFFF` = 체인 없음).

### 2.4 시스템 스크립트는 **호스트가 선행 로드**해야 한다
`constant.lua` · `utility.lua` · `archetype_setcode_constants.lua` · `card_counter_constants.lua` ·
`cards_specific_functions.lua` · `deprecated_functions.lua` · `chain.lua` · `proc_*.lua`(14종) — **21개**
→ create 직후 `OCG_LoadScript(duel, src, len, name)` 로 넣는다. 빠지면 `proc_equip/proc_persistent/proc_gemini/debug_utility` 미스가 나고 효과 동작이 깨진다.

## 3. 검증 명령 (실측 결과)

```bash
node public/wasm/wasm-smoke.mjs     # OCG v11.0 · SMOKE OK
node public/wasm/wasm-abi.mjs       # 8개 export true → create/start/process/메시지 파싱 OK
node tools/duel-test.mjs            # 실제 카드 22,654 + 스크립트 4,973
```
`duel-test.mjs` 실측: `DRAW×1 SUMMONING×1 SUMMONED×1 MOVE×1 SELECT_PLACE×1 SELECT_IDLECMD×2`
→ **실제 카드/스크립트로 드로우·소환·필드 이동까지 성공**. 남은 것: RETRY 63회(응답 정책 미완성), `WIN reason=2` 조기 종료 원인 미확인.

## 4. 다음 작업

### P2-b `src/core/LocalCore.ts` (ICore 구현) — **작성 완료(타입 검사 통과), UI 배선만 남음**
- `src/core/ocgcore.ts` : C 심 바인딩(`OcgDuel.create/addCard/preloadScript/start/step/respondInt/respond/destroy`)
- `src/core/LocalCore.ts` : `ICore` 구현 — 덱 배치 → `SYSTEM_SCRIPTS` 21개 선행 로드 → start → pump
  - 메시지 배치는 `applyPacket`(P0 상태기계)로 그대로 흘려 ReplayCore 와 동일 상태
  - 응답 필요 메시지는 `need` 이벤트(`kind` = `MSG_NAME`) · `pendingRequest` getter
  - `seek()` 는 라이브라 no-op, `step()` = pump 1회
- **남은 것**: ①브라우저 소스 연결(`/data/cards.json` + `/data/script/<repo>/*.lua`, `script/index.json` 인덱스 필요)
  ②선택 UI(응답 정책) ③`setcodes` 수집

### P2-c 남은 정확도
- **`setcodes` 미수집**: `cards.json` 에 setcode 가 없어 `IsSetCard` 계열이 전부 실패한다 → `tools/cards.py` 로 cdb `datas.setcode` 를 **추가 수집**(최대 4개, 0 종료) 후 cardReader 에서 채울 것
- lscale/rscale/link_marker 도 0 → 펜듈럼/링크 카드 동작 불가(같은 작업에서 수집)
- 응답 정책(선택 UI) — `SELECT_IDLECMD`/`SELECT_CHAIN` 의 유효 응답 규칙을 `processor.cpp` 에서 확인

### P3 `RemoteCore`(WS) — `/ws` 브리지 + `JoinGame(41.0)`

## 5. 배포 (미니PC 도커 · 변경 없음)

| 항목 | 값 |
|---|---|
| 컨테이너 | `edopro-client:0.6.0` · `--restart unless-stopped` · **:7560** |
| 주소 | http://192.168.0.53:7560/ |
| 데이터 | 볼륨 `/home/hellzsub/edopro-data` → `/data` |
| 갱신 | 웹 `데이터` 탭 → **[지금 갱신]** (무토큰 · 30초 쿨다운 · 동시 1회) |

## 6. 함정 목록

| 함정 | 해결 |
|---|---|
| 링크 `emcc` | **`em++`** |
| export 이름 추측 | `ocgapi.h` 에서 `OCG_*` 자동 추출 |
| Lua throw | Lua+코어 **모두 `-fexceptions`**, `liolib.c` 필수 |
| `get_message` 반복 호출 | 배치는 **유지**된다 → 1회만 읽고 파싱, 다음은 `process` |
| 배치 메시지 파싱 | `[u32 size][type][payload]`, **비정렬** → `DataView` |
| 메시지 번호 | `MOVE=50`, `SET=54`, `SUMMONING=60`, `SPSUMMONING=62`, `NEW_TURN=40`, `DRAW=90` (`src/engine/msg.ts` 가 정답) |
| 시스템 스크립트 | 호스트가 21개 선행 `OCG_LoadScript` |
| 바인드 마운트 | `/data` rename 불가(EBUSY) → `$OUT/.tmp` 후 항목별 mv |
| 브라우저 LZMA | `lzma`/`lzma-purejs` 번들 사망 → 서버/Node 전용 |
| 페이로드 레이아웃(리플레이) | MOVE 28B · SUMMONING 14B · START 17B |

## 7. 파일 지도

```
client/wasm/webapi.cpp        ocgcore C 심(create/start/process/get_message/response/new_card/load_script)
client/tools/build-core.sh    wasm 빌드(17 core + 26 lua, em++ 링크, -fexceptions)
client/tools/gen-exports.py   ocgapi.h → EXPORTS
client/tools/duel-test.mjs    실제 카드·스크립트 듀얼 검증
client/public/wasm/           ocgcore.js/.wasm(1.7MB) · wasm-smoke.mjs · wasm-abi.mjs
client/src/core/              ICore.ts · ReplayCore.ts  ← LocalCore.ts 추가 예정
client/src/engine/            state.ts · msg.ts · yrpx.ts
client/src/render/            BoardRenderer.ts(WebGL2) · field.ts
docs/                         DESIGN-V2 · GAP-ANALYSIS · DATA-REPOS · YGO-FIELD-LAYOUT · STATE
```
