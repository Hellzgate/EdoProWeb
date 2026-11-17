# 원본 EDOPro 대조 — 자산 · 렌더 · 기능 (2026-11-17)

> 목적: 새 웹 클라이언트가 **원본 EDOPro(Project Ignis)** 와 어디까지 같은지, 무엇이 다른지를
> 근거(파일·경로·함수)와 함께 고정한다. 새 세션은 이 문서 + `STATE.md` 만 보고 이어간다.
>
> 기준: 설치본 `D:\edopro` (클라이언트 1.25.x) · 소스 `D:\rea-out\gh\edo9300__edopro` (gframe)

---

## 1. 자산 (Asset)

| 자산 | 원본 경로 | 우리 경로 | 상태 |
|---|---|---|---|
| 플레이매트 | `textures/field.png`, `field2..4.png`, `fieldSP*.png` (512×410) | `public/theme/field3.png` | ✅ 사용 (field3 고정) |
| 매트 종류 선택 | 설정 → 필드 선택 | 툴바 **[매트 N]** (field/2/3/4, localStorage 저장) | ✅ |
| 매트 투명판 | `field-transparent.png` 등 | — | ❌ 미사용 (커스텀 매트용) |
| 카드 뒷면(덱) | `textures/cover2.png` (보라) | `public/theme/cover2.png` | ✅ |
| 카드 뒷면(엑덱) | `textures/cover.png` (주황) | `public/theme/cover.png` | ✅ |
| 배경 | `textures/bg.png` (1920×1080) | `public/theme/bg.png` (CSS 배경) | ✅ |
| 카드 이미지 | `pics/<id>.jpg` — **18,962장(534MB)** | 볼륨 `~/edopro-data/pics` → `/data/pics/<id>.jpg` | ✅ |
| 대체 일러스트 | `pics/cover/`, `pics/field/` 하위 폴더 | 동기화만 (미사용) | ⚠️ |
| 존 하이라이트 | `textures/act.png`, `chain.png`, `attack.png`, `equip.png`, `mask.png` | `public/theme/` 에 복사만 | ❌ 미사용 |
| LP 아이콘 | `textures/lp.png`, `lpf.png` (16×16) | 복사만 | ❌ 미사용 |
| 폰트 | `fonts/` (EDOPro 전용 비트맵) | 시스템 폰트 | ⚠️ 의도적 대체 |
| 사운드 | `sound/` (BGM·SE) | — | ❌ |
| 스킨 | `skin/` | — | ❌ |

**규칙**: 매트·카드·뒷면·배경은 **원본 파일을 그대로** 쓴다(색을 새로 만들지 않는다).
HUD 텍스트만 우리 토큰(`render/theme.ts`)을 쓴다.

---

## 2. 렌더 (Rendering)

| 항목 | 원본 | 우리 | 차이 |
|---|---|---|---|
| 좌표계 | 월드 `x∈[-1,9], y∈[-4,4]` (10×8) — `gframe/materials.cpp` | 동일 (`render/field.ts` 상수) | ✅ |
| 매트 비율 | 512:410 = 10:8 | 동일, 비율 유지 스케일 | ✅ |
| 상대 진영 | **y 만 반전**(180° 회전 아님) | 동일 | ✅ |
| 카드 크기 | 존 1.1×1.2 (카드 0.7×1.0 보다 약간 큼) | 존 크기에 맞춰 그림 | ✅ |
| 카드 이미지 | `pics/<id>.jpg`, 없으면 색판 | 동일 + 이름/공수 대체판 | ✅ (+대체판) |
| 상대 마함/손패 | 뒷면 | 뒷면 | ✅ |
| 3D 원근 | 원본은 3D 평면(원근) | **평면 2D** | ⚠️ 의도적(가독성) |
| 존 선택 하이라이트 | 선택 가능 존에 `act.png` 발광 | 대상 존 **금색 테두리** | ✅ |
| 체인 표시 | 카드 위 체인 번호 + `chain.png` | 화면 중앙 "체인 N" 알약 | ⚠️ |
| 공격/수비 표시 | 카드 회전(수비 = 90°) | mpos/spos 로 **회전** | ✅ (MSG_POS_CHANGE 처리) |
| 뒷면 세트 표시 | 카드 뒷면 + 회전 | 뒷면 + 회전 | ✅ (MSG_SET loc_info 1개로 수정) |
| 엑시즈 소재 | 카드 아래 겹침 표시 | 없음 | ❌ |
| 카운터 | 카드 위 코인/숫자 | **금색 배지** | ✅ (MSG_ADD/REMOVE_COUNTER) |
| ATK/DEF 변화 | `MSG_UPDATE_CARD` 반영 | 기본값만 | ❌ |
| 펜듈럼 스케일 | 카드 좌우 스케일 숫자 | 없음 | ❌ |
| 카드 확대 보기 | 호버/더블클릭 시 확대 | **호버 확대**(#d-zoom) | ✅ |
| LP/이름 | 상단 바 | 우상·우하 알약 | ⚠️ 위치만 다름 |
| 턴/페이즈 | 중앙 상단 | 좌상 알약 | ⚠️ |

---

## 3. 게임 흐름 (Interaction)

| 기능 | 원본 | 우리 | 상태 |
|---|---|---|---|
| 룰 엔진 | ocgcore (C++) | **ocgcore v11 → WASM 1.7MB** | ✅ 동일 엔진 |
| 카드 데이터 | `expansions/*.cdb` | `/data/cards.json` (22,654장, setcode 포함) | ✅ |
| 스크립트 | `script/*.lua` (4,973) | `/data/script/<repo>/` + index | ✅ |
| 선택 UI | 23종 프롬프트 | `duel/prompts.ts` 23종 | ✅ |
| 자동 상대 | WindBot(외부 프로세스) | 내장 `autoChoice` 정책 | ⚠️ 수준 낮음 |
| 사이드 덱 교환 | 매치 사이 | 없음 | ❌ |
| 덱 편집 | 덱 관리자(폴더·다중 덱) | 1개 덱(localStorage) + `.ydk` | ⚠️ |
| 리플레이 재생 | `.yrp` 재생/저장 | `.yrpX`/`.json` 재생 + **로컬 듀얼 기록 저장** | ✅ |
| 온라인 대전 | ygopro 프로토콜(41.0) | 없음 | ❌ **P3** |
| 관전 | 지원 | 없음 | ❌ |
| 채팅 | 지원 | 없음 | ❌ |
| 퍼즐 | `puzzles/*.lua` (459) | 동기화만 | ❌ |
| 언어 | 다국어 | 한국어/영어(카드명·설명) | ✅ 부분 |
| 사운드/BGM | 지원 | 없음 | ❌ |
| 단축키 | 키 설정 | 없음 | ❌ |

---

## 4. 우리가 의도적으로 다르게 한 것

1. **브라우저 단일 페이지** — 설치·계정 불필요. 데이터는 볼륨에서 서빙.
2. **3D 원근 제거** — 작은 화면에서 존이 겹쳐 보여 가독성이 떨어졌다(실측).
3. **서버 권위 없음(로컬 모드)** — ocgcore 를 WASM 으로 브라우저에서 직접 실행.
4. **HUD 를 알약(pill)로** — 원본의 3D 바 대신, 밝은 배경 위에서도 읽히게.
5. **`autoChoice` 내장** — WindBot 대신 규칙 기반 최소 정책(막히지 않게 하는 것이 목적).

---

## 5. 남은 격차 (우선순위)

| P | 항목 | 근거 | 예상 |
|---|---|---|---|
| **P3** | 온라인 대전(`RemoteCore`, WS + `JoinGame 41.0`) | 원본 `gframe/network.cpp` | 큼 |
| 1 | 공격/수비·세트 **회전 표시** | `MSG_POS_CHANGE`, `client_card.cpp` | 작음 |
| 1 | `MSG_UPDATE_CARD` 반영(ATK/DEF 변화) | `processor.cpp` | 중간 |
| 2 | 존 선택 하이라이트(`act.png`) | 프롬프트의 대상 카드 | 중간 |
| 2 | 카드 확대 보기 | 호버 | 작음 |
| 2 | 체인 번호(카드 위) | `MSG_CHAINING` | 작음 |
| 3 | 엑시즈 소재·카운터 표시 | `MSG_MOVE` overlay, `MSG_ADD_COUNTER` | 중간 |
| 3 | 매트 종류 선택(설정) | `textures/field*.png` | 작음 |
| 3 | 사이드 덱 교환 | `STOC_CHANGE_SIDE` | 중간 |
| 4 | 퍼즐 모드 | `puzzles/*.lua` | 중간 |
| 4 | 채팅/관전 | 프로토콜 | 큼 |
| 4 | 사운드 | `sound/` | 작음 |

---

## 6. 재현 · 검증 명령

```bash
cd client
npm run typecheck && npm test && npm run build
node tools/duel-full.mjs 3000          # 실제 카드·스크립트로 WIN 까지
node tools/duel-record-test.mjs        # 기록 → ReplayCore 왕복 일치
curl -sI http://192.168.0.53:7560/data/pics/89631139.jpg   # 카드 이미지 200
```

원본 자산 재동기화:
```powershell
# 매트/뒷면/배경
Copy-Item D:\edopro\textures\field3.png,D:\edopro\textures\cover.png,`
          D:\edopro\textures\cover2.png,D:\edopro\textures\bg.png `
          D:\rea-out\edopro-web\client\public\theme\ -Force
# 카드 이미지(볼륨)
tar -czf pics.tgz -C D:\edopro pics
scp -O pics.tgz mini:~/pics.tgz
ssh mini "tar xzf ~/pics.tgz -C ~/edopro-data --strip-components=1 && cd ~/edopro-data && mkdir -p pics && mv -f *.jpg cover field pics/ 2>/dev/null"
```
