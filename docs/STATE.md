# EDOPro Web — 현재 상태 / 다음 작업 (인수인계)

> 새 세션은 **이 파일만 읽고** 이어서 시작한다. (2026-11-17 기준, 커밋 `d7cafb7`)

## 1. 한 줄 상태

DESIGN-V2 의 **P0 · P1 · P4 · P5(셸) · P2(코어 빌드)** 완료.
**다음 = P2 마무리(LocalCore 배선) → P3(온라인)**.

## 2. 배포 (미니PC 도커)

| 항목 | 값 |
|---|---|
| 컨테이너 | `edopro-client:0.6.0` · `--restart unless-stopped` · **:7560** |
| 주소 | http://192.168.0.53:7560/ |
| 데이터 | 볼륨 `/home/hellzsub/edopro-data` → `/data` (ro 아님 · 갱신이 씀) |
| 갱신 | 웹 `데이터` 탭 → **[지금 갱신]** (토큰 없음 · 30초 쿨다운) |
| 빌드/배포 | `scp dist + Dockerfile + server/api.py + tools/* + basecdb` → `docker build -t edopro-client:X` → `docker rm -f` → `docker run ... -v ~/edopro-data:/data` |

## 3. 완료된 것

| 단계 | 내용 | 검증 |
|---|---|---|
| **P0** | `.yrpX` 파서 · MSG 95종 · 결정적 상태기계 · 골든 테스트 | 686/687 · 잔여 0B · 1,083,139패킷 |
| **P1** | `ICore` · `ReplayCore`(스냅샷 되감기) · **WebGL2 2.5D** · 텍스트 오버레이 | 끝/되감기/스텝 OK |
| **P4** | 카드 인덱스(cdb+한/영 병기) · 덱 편집기(언어·번역만·**키워드 검색**) | 22,654장(한 17,073/영 5,581) |
| **P5(셸)** | manifest · sw.js · 반응형 · 아이콘 | 모바일 가로스크롤 0 |
| **P2(빌드)** | **ocgcore+lua → WASM** | **1.3MB · OCG v11.0 · 심볼 4개 확인(SMOKE OK)** |
| 데이터 | 레포 8개 동기화(EDOPro configs 그대로) + base cdb 5종 | 스크립트 4,974 · 금제 8 · 퍼즐 459 |

## 4. 다음 작업 (이 순서)

### P2-a `src/core/LocalCore.ts`
```ts
// OCG_DuelOptions (ocgapi_types.h 실측)
//   uint64 seed[4](0..31) · uint64 flags(32) · OCG_Player team1/team2 ·
//   DataReader cardReader(+payload1) · ScriptReader scriptReader(+payload2) ·
//   LogHandler logHandler(+payload3) · DataReaderDone(+payload4) · uint8 enableUnsafeLibraries
M.addFunction(cardReader, 'viip')   // (payload, code, OCG_CardData*)
M.addFunction(scriptReader, 'iiip') // (payload, duel, name) -> int
M._OCG_CreateDuel(&duel, opts)      // by-value struct → 포인터 전달
M._OCG_StartDuel(duel)
while (!M._OCG_DuelProcess(duel)) { /* OCG_DuelGetMessage */ }
```
- 카드 리더: `public/data/cards.json` (이미 있음)
- 스크립트 리더: `public/data/script/<repo>/*.lua` (4,974개)
- 응답: `OCG_DuelSetResponse` ← `ICore.respond`

### P2-b 퍼즐 1개 클리어 → `ReplayCore` 와 같은 상태기계에 연결
### P3 `RemoteCore`(WS) — 기존 포팅의 `/ws` 브리지 + `JoinGame(41.0)`

## 5. 함정 (다시 밟지 말 것)

| 함정 | 해결 |
|---|---|
| 링크에 `emcc` | **`em++`** (C++ 심볼) |
| export 이름 | 이 코어는 **`OCG_` 접두사** → `tools/gen-exports.py` 로 `ocgapi.h` 에서 추출 |
| Lua 빌드 | `ldo.c` 가 throw → **Lua 만 `-fexceptions`**, `liolib.c` **필수**(`luaopen_io`) |
| wasm 심볼 | `_malloc`/`_free` 를 EXPORTED_FUNCTIONS 에 추가해야 함 |
| 바인드 마운트 | `/data` **rename 불가(EBUSY)** → `$OUT/.tmp` 에 만들고 **항목별 mv** |
| 브라우저 LZMA | `lzma`(→`__dirname`), `lzma-purejs`(→AMD `define.apply`) 둘 다 번들에서 죽음 → **Node/서버에서 해제** |
| 페이로드 레이아웃 | MOVE **28B**, SUMMONING **14B**, START **17B**(deck0·extra0·deck1·extra1) |
| 기본 카드DB | 컨테이너엔 `expansions/*.cdb` 가 없다 → `client/basecdb/` (git 제외) + `BASE_CDB_DIR` |
| 기존 포팅 | `edopro-web:1.25.5`(7556) 는 **참조 구현**으로 보존 |

## 6. 파일 지도

```
client/src/engine/   yrpx.ts(파서) · state.ts(상태기계) · msg.ts(자동생성)
client/src/core/     ICore.ts · ReplayCore.ts        ← LocalCore.ts 추가 예정
client/src/render/   BoardRenderer.ts(WebGL2) · field.ts(필드 좌표 단일 소스)
client/src/ui/       DeckEditor.ts · DataPanel.ts
client/src/data/     carddb.ts(한/영·키워드검색)
client/tools/        sync-data.py · refresh.sh · cards.py · build-core.sh · gen-exports.py
client/server/api.py 데이터 갱신 API(무토큰·30초 쿨다운)
client/public/wasm/  ocgcore.js/.wasm (1.3MB) · wasm-smoke.mjs
docs/                DESIGN-V2 · GAP-ANALYSIS · DATA-REPOS · YGO-FIELD-LAYOUT
```

## 7. 검증 명령

```bash
cd client
npm run typecheck && npm test && npm run build      # 3/3 통과 기준
npm run scan                                        # 리플레이 686/687 · 잔여 0B
node public/wasm/wasm-smoke.mjs                     # OCG v11.0 · SMOKE OK
python tools/sync-data.py --no-net                  # 22,654장
bash tools/refresh.sh ~/edopro-data                 # 컨테이너 갱신(미니PC)
```
