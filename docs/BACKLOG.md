# EDOPro Web — 남은 작업 (백로그)

- 기준: **v1.20.3** (2026-11-13)
- 서비스: `https://sw20103.synology.me:8451/` · 이미지 `edopro-web:1.20.3`
- 상태: 한국어(언어 설정 연동) · 퍼즐 · 커스텀 카드 · 저장소 탭 · config 자동 반영 · 사운드 · 모바일 IME · ETag · **FPS 60**

---

## P0 — 다음 세션 최우선

| # | 항목 | 상태 / 할 일 |
|---|---|---|
| 1 | **실제 봇 대전 1판** | 미검증. `LAN + AI 대전` → 방 생성 → 봇(`bot`/`b:raisemoon`) → 소환·공격·효과·체인·승패, 콘솔 오류 0 |
| 2 | **서버 대전 방 목록·입장** | 프록시만 확인. 멀티롤 방 생성 → 웹 목록 → 입장 → 듀얼 시작 |
| 3 | **콤보 드롭다운 행 오프셋 (NEW)** | **클릭한 행과 다른 항목이 선택된다**(관측: y=152 → 2행 아래). 원인 후보: 아이템 높이(폰트 메트릭)·스크롤 오프셋 불일치 (`CGUIListBox::getItemAt` 의 `-1 + ScrollBar->getPos()`). 금제/덱 이름 등 모든 콤보에 영향 → **금제 선택 불가처럼 보임** |
| 4 | 덱 이름(콤보 내부 입력) | 폰에서 이름 변경이 되는지 확인. 콤보 내부 edit box 도 IME 브리지에 연결 필요할 수 있음 |
| 5 | 모바일 한글 입력 | ASCII(`PlayerKim`)만 검증. 한글 조합 입력 확인 |
| 6 | 파일 업/다운로드 | 폰에서 `.ydk`·리플레이 업로드/다운로드 확인 |

### 3번 조사 메모 (다음 세션용)
- 리스트 팝업은 `CGUIListBox` 이고, 선택 인덱스 = `(y - listTop - 1 + scrollPos) / ItemHeight`.
- 팝업 높이는 `skin->getFont()->getDimension("A").Height + 4` 로 계산 — **리스트가 실제로 쓰는 폰트/ItemHeight 와 다르면**
  `TotalItemHeight > height` 가 되어 스크롤바가 생기고 `scrollPos ≠ 0` → **클릭 행이 밀린다**.
- 실측: 항목 10개인데 팝업이 1행 스크롤된 상태로 열림(N/A 가 위로 숨음) + 클릭이 1~2행 밀림.
- 후보 수정: ① 팝업 생성 직후 `ListBox->setItemHeight(...)`/`setFont(...)` 를 **명시적으로 고정**,
  ② 스크롤바가 필요 없으면 `setSelected(Selected)` 전에 `ScrollBar->setPos(0)`,
  ③ 근본적으로는 `openCloseMenu()` 에서 `h` 를 리스트의 실제 `ItemHeight` 로 계산.
- 검증: "첫 행 클릭 = 첫 항목", "마지막 행 클릭 = 마지막 항목" 을 스크린샷으로 확인.

---

## P1 — 원본 체감 차이

| # | 항목 | 상태 / 할 일 |
|---|---|---|
| 7 | BGM | 원본 설정도 OFF. 켤 때 소리 나도록 64kbps 모노(16MB) 내장 또는 lazy |
| 8 | 사운드 기본값 | 원본 `system.conf`(볼륨 20/15)와 대조 |
| 9 | PWA | "홈 화면에 추가 → 전체화면" 절차 문서화(⛶ 는 웨일에서 동작 확인) |
| 10 | 세로 모드 | 레터박스/안내 확인, 조작성 |
| 11 | 저장소 탭 | 진행률 100% 고정 → 실제 head/시각 표시 검토 |
| 12 | **UI 문자열도 언어 연동** | 카드DB는 언어 분리 완료. `/config/strings.conf` 는 항상 한국어 → 영어 설정 시 UI만 한국어로 남음 |

---

## P2 — 안정성·운영

| # | 항목 | 할 일 |
|---|---|---|
| 13 | 헬스체크 자동화 | `page/repos/bundle?lang/wasm 304/img` 확인 스크립트 |
| 14 | 배포 스크립트 | `docker build+rm+run` 표준화(`scripts/deploy.sh`) |
| 15 | 재시작/복구 문서 | docker run·볼륨(`edopro_pics`,`edopro_userdata`)·백업 복원 |
| 16 | 인증 | 현재 무인증(개인용) — 외부 공개 확대 시 DSM Basic/IP 제한 |
| 17 | 오류 수집 | `/last.html` + `/api/beacon` 확장 |
| 18 | 이미지 캐시 | `edopro_pics` 증가 모니터링(현재 141장/18MB, `.miss` 별도) |

---

## P3 — 성능/품질

| # | 항목 | 메모 |
|---|---|---|
| 19 | `game.cpp -O1` | 현재 `-O0`(모바일 V8 크래시 회피). FPS 60 유지 중, 여유용 |
| 20 | 렌더 해상도 옵션 | DeX 대형 화면용 `?w=960` 등 |
| 21 | 발열/FPS 상한 | 30/60 선택 노출 |
| 22 | `patch_shell_post.py` 분리 | 주입 블록 10개로 비대 |

---

## 이번 세션(v1.20.x)에서 해결

| 항목 | 버전 | 핵심 |
|---|---|---|
| **카드 한글화(한패)** | v1.20.0 | 기본=영어 cdb, 언어팩=한국어 cdb. `system.conf language` → `/api/repos/bundle?lang=` → `expansions/zzz-korean-cards.cdb`(마지막 로드) |
| **프리릴리즈/대량 목록에서 이미지 폭주** | v1.20.2~3 | 서버 404 캐시(24h) + 9자리 커스텀 ID 즉시 404 + 클라이언트 실패 메모(60s) + 프레임당 2장 예산 |
| 덱 파일 이전 | v1.20.x | `D:\edopro\deck\*.ydk` 8개 → 볼륨 `/app/userdata/deck/` (총 13개) |
| 도구 정리 | 문서 | `docs/TOOLING.md` |

---

## 이미 해결됨 (재발 방지)

| 항목 | 버전 | 핵심 |
|---|---|---|
| 검은 화면 | v1.16.7 | `getDefaultDriver()` emscripten → WebGL1 최우선 |
| 회전/해상도 | v1.13~15 | irrlicht 이 캔버스 **버퍼** 크기 사용 + dpr=1 |
| `???` UI | v1.17.x | 번들이 `strings.conf` 덮지 않게 + 한국어 내장 |
| 퍼즐 없음 | v1.17.4 | `ProjectIgnis/Puzzles` → `/puzzles` 267개 |
| 저장소 탭 빈 목록 | v1.19.0 | 스텁이 `/api/repos` 반환 |
| 무음 | v1.19.0 | `std::thread`(pthread 없음) → 메인 스레드 + Web Audio 명시 |
| 모바일 입력 불가 | v1.19.0 | HTML 입력 브리지(`Module.__edoproIME`) |
| 매 방문 65MB 재다운로드 | v1.19.0 | ETag/304 |
| **느림 + 금제 선택 불가** | v1.19.4 | 스텁이 항상 ready → 매 프레임 lflist 재파싱(13,209개) → 1회성 + 중복 제거 |
