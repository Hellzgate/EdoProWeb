# 남은 작업 (Remaining Work) — 2026-11-17 · v0.9.23

> 이 문서는 **다음 세션이 그대로 실행할 수 있게** 남은 일을 정리한 것이다.
> 현재 상태·함정은 `STATE.md`, 원본 대비 격차는 `EDOPRO-COMPARISON.md` 를 함께 본다.

---

## 0. 지금 상태 (한 줄)

브라우저에서 **실제 듀얼이 끝까지 돈다**(ocgcore WASM + 원본 EDOPro 자산 + 보드 클릭 조작).
배포: `edopro-client:0.9.23` · **https://sw20103.synology.me:8451/** (역방향 프록시 → :7556) · http://192.168.0.53:7560/ · 검증: `duel-full.mjs` WIN · RETRY 0.

---

## 1. P3 온라인 대전 — **최우선 (한 세션 분량)**

### 목표
`RemoteCore implements ICore` — WebSocket 으로 ygopro 프로토콜(41.0)을 말하고, **같은 상태기계**(`engine/state.ts`)와 렌더러를 그대로 쓴다.

### 선행 결정 (사용자 확인 필요)
| 선택지 | 내용 | 비고 |
|---|---|---|
| A. 로컬 브리지 서버를 새로 작성 | Node WS + 우리 WASM 코어로 호스트 | 검증 가능. 서버도 우리가 관리 |
| B. 기존 서버에 접속 | `repos.json` 의 servers(6) / 외부 ygopro 서버 | 버전(41.0) 일치 필요 |
| C. 기존 포팅(edopro-web:1.25.5)의 `/ws` 재사용 | 그 컨테이너는 **중지**됨(7556 을 새 클라이언트가 사용). 필요 시 7557 로 재기동 후 조사 | 프로토콜 다를 수 있음 |

### 구현 순서 (A 기준)
1. `client/src/core/RemoteCore.ts`
   - `new WebSocket(url)` → `CTOS_JOIN_GAME`(4바이트 버전 41.0 + 이름) → `STOC_JOIN_GAME` 대기
   - `STOC_CHAT` / `STOC_HS_*`(방 목록·플레이어 정보)는 로그로만
   - `STOC_GAME_MSG` → **패킷 배열**로 변환 → `applyPacket` (리플레이와 동일 경로)
   - `CTOS_RESPONSE` ← `ICore.respond(bytes)` 그대로 전송
   - `CTOS_UPDATE_DECK`(덱 제출) · `STOC_DUEL_START/END` · `STOC_TIME_LIMIT`
2. `duel/remote.ts`: 서버 → 프롬프트 매핑(이미 `decodePrompt` 재사용)
3. `ui/DuelScreen.ts`: `mode: 'local' | 'online'` 분기 (코어 생성만 교체, 나머지 UI 공유)
4. 서버: `tools/server/ws-duel.mjs` — 두 클라이언트를 받아 ocgcore WASM 으로 중계
   - 우리 `LocalCore` 를 서버에서 그대로 재사용(Node 에서 동작 확인됨)

### 함정 (이미 겪은 것)
- 메시지 번호/레이아웃은 `msg.ts`·`prompts.ts` 와 **동일** — 새로 조사하지 말 것
- `CTOS_RESPONSE` 길이는 프롬프트별로 정확히 (`prompts.ts` 인코더 사용)
- 서버는 `OCG_DuelProcess` 상태(AWAITING)를 플레이어별로 구분해야 함

### 검증
`node tools/remote-test.mjs`(브리지 대상) + 브라우저 두 탭 대전 + `STATE.md` 기록.

---

## 2. 사이드 덱 교환 (매치 사이)

- 원본: `STOC_CHANGE_SIDE` → 클라가 `CTOS_UPDATE_DECK` 으로 새 덱 전송 → `STOC_WAITING_SIDE`
- 우리: **로컬 듀얼에는 의미 없음**(상대가 사람일 때만). → **P3 완료 후** 온라인 모드에서 구현
- UI: 덱 편집기의 사이드 목록을 그대로 사용, 교환 후 메인/사이드 합계 40/15 검사

---

## 3. 퍼즐 모드

- 데이터: `/data/puzzles/*.lua` (**459개**, 이미 볼륨에 있음)
- 원본 퍼즐은 **일반 듀얼 + 특수 스크립트**(`Debug.ReloadFieldBegin` 등)로 동작
- 구현: ① 퍼즐 목록 UI ② 퍼즐 루아를 시스템 스크립트처럼 선행 로드 ③ `Puzzle.*` 헬퍼가 요구하는 API 유무 확인
- 선행 조사: `D:\edopro\puzzles\*.lua` 상위 3개를 읽고 필요한 헬퍼 목록화 (미착수)

---

## 4. 사운드 확장

- 현재: SE 8종(`draw/nextturn/phase/damage/gainlp/activate/set/attack`) + 토글
- 남음: `destroyed.wav`, `coinflip.wav`, `diceroll.wav`, `addcounter/removecounter`, `equip`, `flip`, `chatmessage`
  → `MSG_*` 매핑만 추가하면 됨(`DuelScreen.soundFor`)
- BGM: `D:\edopro\sound` 에 bgm 파일 없음(사용자 파일). 필요 시 설정에서 파일 선택

---

## 5. UI 마감

| 항목 | 내용 | 규모 |
|---|---|---|
| 카드 확대 **고정** | 클릭 유지(현재 호버만) | 작음 |
| 공격 선언 UI | 공격 대상(상대 몬스터)을 **보드에서 클릭**해 선택 | 중간 (`SELECT_BATTLECMD` 공격은 대상 선택이 별도 프롬프트) |
| 체인 정렬 | `SORT_CHAIN` 의존 효과 대응(현재는 그대로 확정만) | 작음 |
| 펜듈럼 존 강조 | 펜듈럼 소환 가능 시 마함 0/4 하이라이트 | 작음 |
| 모바일 | 손패 카드가 작음(390px) — 세로 모드 전용 레이아웃 검토 | 작음 |

---

## 6. AI 심화 (`duel/prompts.ts` `autoChoice`)

- 현재: 최고 공격력 소환 · 이길/비길 때만 공격 · 발동은 첫 번째
- 개선안: ① 세트 카드 우선순위 ② 체인 응답 판단(효과 설명 기반) ③ `SELECT_CARD` 에서 제물/소재 가치 판단
- 검증: `node tools/duel-full.mjs 4000` — 턴 수·승률로 비교(현재 턴 14~22 결착)

---

## 7. 성능·정리

| 항목 | 내용 |
|---|---|
| `dist/data` 중복 | Vite 가 `public/data` 를 dist 에 복사 → 이미지에 데이터 중복. `vite.config` 에서 제외 검토 |
| 전체 스크립트 프리페치 | 현재 시스템 21 + 덱 카드만. 옵션 버튼으로 전체(4,973) 내려받기 |
| 이미지 캐시 | 카드 이미지 534MB — HTTP 캐시 헤더(`/data/` 는 `no-cache`) 조정 검토 |
| CI | GitHub Actions 에 `typecheck + test + build` 추가 |

---

## 8. 알려진 버그/한계

1. **`OCG_DuelQuery` 는 해결됨**(레이아웃 `[u16][flags][값…]`) — 공수·엑시즈 표시 동작
2. `MSG_UPDATE_CARD` 는 ocgcore 가 보내지 않음(서버 측 메시지) → 실시간 공수는 query 로 해결
3. 공격/수비 회전은 `mpos/spos` 로 처리, **`MSG_POS_CHANGE` 반영 완료**
4. 상대 마함은 항상 뒷면(정보 은닉) — 앞면으로 뒤집히는 효과는 미구현
5. 로컬 듀얼은 **AI 대전만**(핫시트 아님)

---

## 9. 재개 절차

```bash
cd D:/rea-out/edopro-web/client
npm run typecheck && npm test && npm run build
node tools/duel-full.mjs 3000          # 엔진 회귀
node tools/duel-record-test.mjs        # 리플레이 왕복
# 배포
scp -O -r dist mini:~/edopro-client/
ssh mini "cd ~/edopro-client && docker build -q -t edopro-client:X . && docker rm -f edopro-client && docker run -d --name edopro-client --restart unless-stopped -p 7560:80 -v /home/hellzsub/edopro-data:/data edopro-client:X"
```

문서 갱신: 이 파일 → `STATE.md`(상태) → `EDOPRO-COMPARISON.md`(격차표).
커밋은 GitHub + **NAS Gitea**(`git push gitea --all`) 둘 다.
