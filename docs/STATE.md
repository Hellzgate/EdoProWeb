# EDOPro Web — 현재 상태 / 다음 작업 (인수인계)

> 새 세션은 **이 파일만 읽고** 이어서 시작한다. (2026-11-17 기준 · 배포 `edopro-client:0.7.8`)
> 최신 커밋: `2bda383`(LocalCore) 이후 → 이번 작업분 커밋 예정.

## 1. 한 줄 상태

**P2 완료 + 원본 EDOPro 자산 적용** — 브라우저에서 실제 듀얼이 끝까지 돌고, 필드는 **원본 `field3.png` 매트 + 실제 카드 이미지(18,962장)** 로 그린다.
실측: `TURN 15 · WIN P1 · LP 8000/0 · 패킷 894 · RETRY 0`
최신 v0.9.8: 카드 표시형식(수비 회전/세트 뒷면) · 카드 호버 확대(미검증) · 렌더 모듈화.
**다음 = P3(온라인 RemoteCore)** 또는 나머지 격차(EDOPRO-COMPARISON.md §5).

### 1.1 최근 추가 (v0.9.12)
- 필드: `field3.png` 매트 + `bg.png` 배경 + `materials.cpp` 실측 좌표 (→ `YGO-FIELD-LAYOUT.md` §7) · **매트 선택**(field/2/3/4)
- 카드: `pics/<id>.jpg` 18,962장 · 뒷면 `cover2/cover.png`
- 표시: **수비 회전 · 세트 뒷면**(`mpos/spos`) · **체인 번호 배지** · **카운터 배지** · **펜듈럼 스케일** · **선택 대상 존 강조** · **호버 확대**
- 상태기계: `MSG_DRAW` count u32 · `MSG_NEW_TURN` u8 · `MSG_SET` loc_info 1개 · `MSG_POS_CHANGE`/`FLIPSUMMONING`/`ADD·REMOVE_COUNTER` 처리
- 렌더 모듈화: `field / cards / hud / theme / assets / board`

## 2. 지금 되는 것 (배포본 http://192.168.0.53:7560/)

| 탭 | 내용 |
|---|---|
| 리플레이 | `.yrpX`/`.json` 재생·되감기·스텝 (P0/P1) |
| **로컬 듀얼** | **ocgcore WASM 로 실제 듀얼** · 프롬프트 UI · 상대 자동 · 「내 턴도 자동」 |
| 덱 편집 | 카드 검색(한/영·효과 키워드)·언어·`.ydk` 내보내기 |
| 데이터 | 레포 동기화 상태 · **[지금 갱신]** (무토큰·30초 쿨다운) |

## 3. 이번에 추가한 구조

```
src/core/ocgcore.ts        ocgcore C 심 바인딩(create/addCard/preloadScript/start/step/respond)
src/core/LocalCore.ts      ICore 구현 — 덱 배치 → 시스템 스크립트 21개 → start → batch pump
src/duel/prompts.ts        선택 메시지 23종 디코드 + 응답 인코딩 + autoChoice(자동 정책)
src/ui/DuelScreen.ts       보드(WebGL2) + 프롬프트 버튼 + 로그 + 자동 상대
src/data/scripts.ts        스크립트 인덱스/캐시 (동기 scriptReader 대응)
tools/gen-script-index.mjs script/index.json 생성 (4,973개 → 162KB)
tools/duel-full.mjs        Node 엔드투엔드: 실제 카드·스크립트로 WIN 까지
tools/patch-cards-meta.py  cards.json 에 setcodes/lscale/rscale/link_marker 주입(멱등)
```

## 4. 메시지 레이아웃 (실측 — 다시 조사하지 말 것)

| 메시지 | payload | 응답 |
|---|---|---|
| IDLECMD | u8 player · (u32 n + 10B×n)×5 [summon/spsummon/**poschange(u8 seq)**/mset/sset] · (u32 n + 19B×n) activate · u8 toBP · u8 toEP · u8 shuffle | i32 `(index<<16)\|type`, type 0~8 |
| BATTLECMD | u8 player · (u32 n + 19B×n) activate · (u32 n + **8B**×n attack) · u8 toM2 · u8 toEP | i32 `(index<<16)\|type`, 0~3 |
| CARD/TRIBUTE | u8 player · u8 cancelable · u32 min · u32 max · u32 n · (u32 code + **loc_info 10B**) | i32 type(-1/0/1/2/3) · u32 n · idx… |
| CHAIN | u8 player · u8 spe · u8 forced · u32 ×2 · u32 n · 19B×n | i32 index, -1=없음 |
| EFFECTYN / YESNO | u8 · u32 code + loc_info + u64 desc / u64 desc | i32 0/1 |
| OPTION / NUMBER / CARD | u8 · u8 n · u64×n | i32 index |
| POSITION | u8 · u32 code · u8 positions | i32 0x1/0x2/0x4/0x8 |
| PLACE / DISFIELD | u8 · u8 count · u32 flag | count×3B (u8 player, u8 loc, u8 seq) |
| SORT_CARD / SORT_CHAIN | u8 · u32 n · 13B×n | n×i8 순열, -1=취소 |
| COUNTER | u8 · u16 type · u16 count · u32 n · 9B×n | n×i16 |
| CONFIRM_* | u8 · u32 n · 10B×n | u32 0 |
| ANNOUNCE_RACE/ATTRIB/NUMBER/CARD | u8 · u8 count · u64/u32/u64×n | u64 비트 / u32 비트 / i32 idx / i32 code |

`loc_info` = **u8 controler · u8 location · u32 sequence · u32 position (10B, 패딩 없음)**.

## 5. 이번에 밟은 함정 (중요)

| 증상 | 원인 → 해결 |
|---|---|
| 양쪽 overdraw → `WIN reason=2` (턴 1) | `OCG_NewCardInfo.duelist` 는 **태그 인덱스**. 일반 듀얼은 **`duelist=0` + `team`** 으로 구분. 1 을 넣으면 `extra_lists_main` 으로 들어가 덱이 빈다 |
| `place` 응답이 계속 RETRY | flag 비트는 **요청 플레이어 기준** — 상대 존은 **+16 시프트**. ctrl=0 으로 답하면 거부. DISFIELD 는 비트 의미 반전 |
| IDLECMD 파싱이 어긋남 | poschange 목록만 **seq 가 u8** (다른 4개는 u32). BATTLECMD 공격 목록도 **8B**(u8 seq) |
| RETRY 후 진행 정지 | `process()` 가 AWAITING + 배치에 RETRY 만 오면 **같은 요청을 다시 보낸다** → `pump()` 는 pending 없으면 `continue` |
| 자동 토글해도 안 움직임 | 이미 떠 있던 프롬프트는 새 이벤트가 없음 → 토글 시 pending 도 자동 응답 |
| 새 프롬프트가 즉시 사라짐 | `core.respond()` 가 **동기로 다음 need 를 emit** → respond() 안에서 프롬프트를 **먼저** 비우고 호출 |
| 페이즈 이름이 BATTLE_STEP 로 표시 | `NEW_PHASE` 값은 **비트 플래그**(0x01 DRAW … 0x200 END) → `phaseName()` 으로 log2 매핑 |
| 덱 장수가 0 | ocgcore 는 `MSG_START` 를 보내지 않는다(호스트 값) → LocalCore 가 덱 길이로 seed |
| Node 로 TS 직접 실행 | `constructor(private x)` **파라미터 프로퍼티 금지**(strip-only) → 명시 대입으로 |

## 6. 검증 명령

```bash
cd client
npm run typecheck && npm test && npm run build     # 3/3 통과 기준
node public/wasm/wasm-abi.mjs                      # C 심 8개 export
node tools/duel-full.mjs 3000                      # 실제 카드·스크립트 → WIN (RETRY 0)
node tools/duel-record-test.mjs                    # 로컬 듀얼 기록 → ReplayCore 재생 왕복 일치
python tools/gen-script-index.mjs                  # script/index.json
python tools/patch-cards-meta.py                   # setcodes 등 주입
```
`duel-full.mjs` 실측: `WIN P1 · reason 1(LP 0) · 434스텝 · RETRY 0 · 카드 22,654 · 스크립트 4,973`
`duel-record-test.mjs` 실측: `기록 1,055패킷 → 라이브/재생 상태 완전 일치 (lp·deck·mzone·grave·winner)`

### 리플레이 저장
로컬 듀얼 툴바 **[리플레이 저장]** → `local-<시각>.json` 다운로드 → **리플레이 탭에서 그대로 열린다**.
(합성 `MSG_START` 패킷을 기록에 포함시켜 덱 장수/LP 가 라이브와 동일하게 재생된다)

## 7. 배포

| 항목 | 값 |
|---|---|
| 이미지 | `edopro-client:0.7.8` (0.6.0 → 0.7.8) |
| 컨테이너 | `edopro-client` · `--restart unless-stopped` · **:7560** |
| 데이터 | 볼륨 `/home/hellzsub/edopro-data` → `/data` (**root 소유** → 갱신은 docker 임시 컨테이너로) |
| 데이터 갱신(로컬→서버) | `docker run --rm -v /home/hellzsub/edopro-data:/data -v ~/up.json:/src/x:ro alpine cp …` |
| 빌드 | `scp dist → mini:~/edopro-client/dist` → `docker build -t edopro-client:X .` → `docker rm -f` → `docker run … -v ~/edopro-data:/data` |

## 8. 다음 작업

> **전체 목록·절차는 `docs/REMAINING.md`** (P3 온라인 설계·선행 결정·구현 순서·검증 포함).
> 요약: ①P3 온라인(브리지 서버 결정 필요) ②사이드 덱 ③퍼즐 ④사운드 확장 ⑤UI 마감 ⑥AI 심화 ⑦성능·CI

### P3 온라인 (RemoteCore)
- 기존 포팅(`edopro-web:1.25.5` :7556)의 `/ws` 브리지 참고
- `JoinGame` 41.0 · `STOC_*`/`CTOS_*` 를 `ICore` 이벤트로 매핑 (상태기계는 이미 공유)

### 선택 UI 마감
- SORT_CARD/CHAIN 실제 순서 변경(현재는 그대로 확정만) · COUNTER 분배 · ANNOUNCE_RACE(종족 이름표)
- 다중 선택 UI 에서 `min` 미만일 때 확정 비활성 (이미 적용) · 취소/뒤로

### 덱 연결 (완료)
- 덱 편집기 **[이 덱으로 듀얼]** → localStorage `edopro.deck` → 로컬 듀얼이 그대로 사용
  (실측: 3장 덱으로 `패 3 · 덱 0`, 버튼 라벨 `내 덱으로 시작 (3장)`)
- `.ydk` 업로드 · 기본 덱 자동 생성 · 사이드 덱 교환은 아직

### 선택 UI (완료/부분)
- 정렬(SORT) ▲▼ 실제 순서 변경 · 코인 **자동 분배** · 종족/속성 **한국어 이름** · 보드에 LP/패/묘지/제외 + 더미 장수 표시

### 데이터/성능
- 스크립트 **전체 프리페치 옵션**(현재는 시스템 21 + 덱 카드만) · 실패 시 그 카드 효과만 비활성
- `dist/data`(빌드에 public/data 복사본) 정리 — 이미지에 데이터 중복(볼륨이 정본)

## 9. 파일 지도

```
client/wasm/webapi.cpp        ocgcore C 심 (create/start/process/get_message/response/new_card/load_script)
client/tools/build-core.sh    WASM 빌드(17 core + 26 lua, em++ -fexceptions)
client/public/wasm/           ocgcore.js/.wasm(1.7MB) · wasm-abi.mjs · wasm-smoke.mjs
client/public/theme/          **원본 EDOPro 자산**(field3.png 매트 · bg.png · cover/cover2 뒷면)
client/src/core/              ICore · ReplayCore · LocalCore(패킷 기록) · ocgcore(심 바인딩)
client/src/duel/prompts.ts    선택 메시지 23종 ↔ 응답 + autoChoice
client/src/render/field.ts    EDOPro materials.cpp 좌표(10×8) 단일 소스
client/src/render/board.ts    매트+더미+카드+손패+HUD 조립
client/src/render/cards.ts    카드/손패 그리기(이미지 우선, 없으면 이름판)
client/src/render/hud.ts      턴·페이즈·LP·체인·승리 알약
client/src/render/theme.ts    색/타이포 토큰 + roundRect/ellipsis
client/src/render/assets.ts   카드 이미지·뒷면·매트 로더(비동기 + 재렌더 콜백)
client/src/ui/                DuelScreen · DeckEditor · DataPanel
client/src/engine/            state.ts(결정적 상태기계) · msg.ts(95종) · yrpx.ts
client/tools/                 sync-data.py · refresh.sh · patch-cards-meta.py · gen-script-index.mjs ·
                              duel-full.mjs · duel-record-test.mjs
docs/                         STATE · EDOPRO-COMPARISON(원본 대조) · YGO-FIELD-LAYOUT(§7 원본 좌표)
                              · DESIGN-V2 · GAP-ANALYSIS · DATA-REPOS
```
