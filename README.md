# EDOPro Web (WebAssembly)

**Project Ignis: EDOPro 41.0.2** 클라이언트를 **Emscripten 으로 WebAssembly 빌드**해 브라우저에서 실행하고,
미니PC **Docker** 에 올려 **한 포트(7556)** 로 배포하는 프로젝트입니다.

```
브라우저 ──HTTP/WS :7556──▶ [컨테이너 edopro-web]
                              ├─ server.py        정적 + WS↔TCP 브리지 + Git 저장소 동기화
                              ├─ edopro-full.*    wasm 클라이언트 (게임)
                              └─ /app/repos       git clone 한 저장소 (부팅 시 MEMFS 마운트)
                                   │
                                   └──TCP──▶ Multirole 7911 / 7914 (NAS)
```

| 항목 | 값 |
|---|---|
| 버전 | **1.10.0** (`VERSION`) |
| 이미지 | `edopro-web:1.10.0` (약 378MB, `python:3.12-alpine` + `git`) |
| 포트 | **7556** → 컨테이너 8080 |
| 게임 URL | <http://192.168.0.53:7556> |
| 저장소 관리 | <http://192.168.0.53:7556/repos.html> |
| 렌더러 | Irrlicht `EDT_WEBGL1` → `OpenGL ES 2.0 (WebGL 1.0)` |
| 오디오 | `miniaudio` (Web Audio) |
| 언어 | **한국어** (UI 문자열 + 한국어 `cards.cdb` + Noto Sans KR) |

---

## 1. 빠른 시작

```bash
# 이미지 빌드 (미니PC, ~10초)
docker build -t edopro-web:1.0.0 docker/

# 실행
docker run -d --name edopro-web --restart unless-stopped \
  -p 7556:8080 \
  -v edopro_pics:/app/piccache \
  -e BRIDGE_TARGET=192.168.0.4:7911 \
  -e REPOS=ProjectIgnis/BabelCDB \
  edopro-web:1.0.0
```

브라우저에서 <http://192.168.0.53:7556> → `LAN + AI 대전` → `Host`(방 만들기) 또는 `Join`.

---

## 2. 문서

| 문서 | 내용 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 전체 구조·데이터 흐름·구성 요소 |
| [docs/BUILD.md](docs/BUILD.md) | 툴체인 준비부터 wasm 번들 생성까지 |
| [docs/PATCHES.md](docs/PATCHES.md) | 원본 소스에 가한 **모든 변경** 목록과 이유 |
| [docs/API.md](docs/API.md) | 서버 HTTP/WS API |
| [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md) | 남은 문제·다음 단계 |
| [LICENSE-NOTICE.md](LICENSE-NOTICE.md) | AGPL 등 라이선스 고지 |

---

## 3. 디렉터리

```
edopro-web/
├─ VERSION
├─ README.md
├─ docker/          Dockerfile · server.py (정적 + WS 브리지 + Git 동기화)
├─ deps/            브라우저용 대체 라이브러리
│   ├─ libevent-lite/   libevent API → emscripten WebSocket
│   ├─ curl-stub/       curl 스텁(웹 빌드에서 업데이터 비활성)
│   └─ emscripten-shim/ sys/sendfile.h 등
├─ patches/         원본 소스 패치
│   ├─ edopro-source.patch   gframe 11개 파일 (+194줄)
│   └─ irrlicht/             3개 파일 전체 사본(패치 적용용)
├─ scripts/         빌드 스크립트 (irrlicht / gframe / 링크 / 부트스트랩)
├─ web/             서버가 서빙하는 정적 파일 (repos.html, shell.html)
└─ docs/
```

빌드 산출물(`edopro-full.{html,js,wasm,data}`, 107MB)은 **저장소에 넣지 않습니다**(`.gitignore`).
배포용 묶음은 릴리스 자산 ZIP 으로 제공합니다.

---

## 4. 상태 요약 (v1.3.0)

| 기능 | 상태 |
|---|---|
| 브라우저에서 EDOPro 실행(렌더·입력) | ✅ |
| 화면이 창에 꽉 차게(비율 유지) 표시 | ✅ v1.2.1 |
| 한국어 패치(UI·카드·폰트) | ✅ |
| 게임 화면만 표시(셸 크롬 제거) | ✅ |
| Git 저장소 받기/적용 (`/repos.html`) | ✅ |
| 오디오(Web Audio) | ✅ |
| 카드 이미지 표시(덱 편집기·듀얼) | ✅ v1.1.0 |
| 듀얼 시작 → 실제 진행(봇 대전) | ✅ v1.1.0 |
| 듀얼 필드(존·마트·카드) 렌더링 | ✅ v1.2.1 |
| **서버 대전(온라인) — 여러 서버(6) 각각 접속** | ✅ v1.4.0 |
| **덱·리플레이·설정·퍼즐 영구 저장 / 드래그&드롭** | ✅ v1.6.0 |
| **보관함 페이지 `/files.html` (다운로드·업로드·삭제)** | ✅ v1.6.0 |
| **저장소 자동 업데이트 (카드 DB·스크립트·금제)** | ✅ v1.7.0 |
| **효과음 20종 + BGM 7종** | ✅ v1.9.0 |
| **덱 썸네일 선반입(히치 제거)** | ✅ v1.10.0 |
| **세로 화면 안내** | ✅ v1.10.0 |
| **봇 투입 페이지 `/bot`** | ✅ v1.8.0 |
| **필드 마법 일러 표시 / 퍼즐·리플레이 폴더** | ✅ v1.5.0 |

자세한 원인과 다음 단계는 [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md).

---

## 5. 변경 이력

### v1.10.0 (2026-11-11)

- **덱 편집기 이미지 히치 제거**: `Game::DrawDeckBd()` 에서 덱 카드 40~55장을 `ImageManager::PrefetchCard()`
  로 **비동기 선반입**(`fetch` → MEMFS). 렌더 경로는 그대로 동기 XHR 이지만, 화면을 열 때 이미 파일이 있어
  첫 프레임 끊김이 사라진다. 실측: 덱 편집기 진입 **3초 안에 36장 표시**.
- **세로 화면 안내**: 창이 세로(H > W×1.15)면 하단에 "가로로 돌리면 더 크게 보입니다" 표시.
- 실측(412×915): 캔버스 412×257(16:10 유지)·가로 스크롤 없음 / 가로 회전 시 확대.

### v1.9.0 (2026-11-11)

- **BGM 포함**: `sound/BGM`(40MB, 7종) preload → 메뉴/듀얼/승패 BGM 재생. `.data` 100→140MB, 번들 61→~90MB
- **모바일 대응**: `viewport` 메타 + `touch-action:none` / `user-select:none` (스크롤·확대·선택 방지)
- 카드 이미지 로딩: 비동기(fetch 후 다음 프레임) 방식은 EDOPro 의 preload 상태기계가 재시도하지 않아
  **카드가 뒤집힌 채 남는 문제**가 있어 **동기 XHR 로 되돌림**(첫 표시에만 10~40ms 히치, 이후 캐시)

### v1.8.0 (2026-11-10)

- **효과음 추가**: 원본 `sound/` 중 **BGM(40MB) 제외, 효과음 6.9MB(20 wav)** 를 preload
  → 소환/공격/발동/세트 등 무음이던 문제 해결(miniaudio 백엔드는 그대로)
- **봇 투입 페이지 `/bot`**: 브라우저는 WindBot 을 실행할 수 없으므로 **멀티롤 패널 API** 로 서버 방에 봇을 넣는다
  - `GET /api/bot/rooms` · `GET /api/bot/decks` · `POST /api/bot/start` · `POST /api/bot/stopall` (패널 프록시)
  - 방 목록·참가자·봇 상태 표시, 덱 선택, 10초 자동 새로고침
  - 환경변수 `BOT_PANEL_URL`(예 `http://192.168.0.4:8090`), `BOT_PANEL_TOKEN`
- 실측: `/sound` 에 wav **20개**, `/bot` 200, 패널 연결 시 **덱 53종** 표시

### v1.7.0 (2026-11-10)

- **저장소(Repository) 실제 적용 + 자동 업데이트** — EDOPro 의 최대 장점을 웹에서 재현
  - 서버: 기동 시 + `REPOS_AUTO_HOURS`(기본 6시간) 마다 `git fetch + reset` 로 갱신
  - 게임: 부팅 시 `/api/repos/bundle` 을 받아 **`expansions/`·`script/`·`lflists/`** 에 배치 후 시작
    (변경 없으면 `304 Not Modified` → 즉시)
  - 매핑: `*.cdb` → `expansions/<repo>__<파일>`, `*.lua` → `script/<repo>/<파일>`(평탄화), `*.conf` → `lflists/<repo>__<파일>`
  - 기본 저장소: `ProjectIgnis/BabelCDB` + `ProjectIgnis/LFLists`(둘 다 12.2MB)
  - `/repos.html` 새 UI: 적용 상태(파일 수·용량·해시), 저장소 목록(최신 커밋), 추가/전체 갱신, 자동 갱신 주기 안내
- 실측: 번들 **24파일 / 12.2MB** 적용, `/lflists` 에 GOAT·Speed·Rush·World·Traditional 등, 게임 부팅 정상

### v1.6.0 (2026-11-10)

- **설정(system.conf) 영구 저장**: 게임이 시작 전에 읽으므로 `preRun` + **run dependency** 로
  프리로드가 끝난 직후 복원(프리로드 전에 쓰면 죽는 문제 회피). 실측: `nickname = TESTER` 유지 확인
- **퍼즐 지원**: `/puzzles` 폴더 동기화·복원, 드래그&드롭 `.lua` → 퍼즐 목록에 표시
- **보관함 페이지 `/files.html`**: 덱/리플레이/퍼즐/설정 목록 · **다운로드** · 업로드 · 삭제
  (`GET|POST|DELETE /api/userdata/file?path=...`)
- 저장 대상 확장: `deck/`, `replay/`, `puzzles/`, `config/system.conf`

### v1.5.0 (2026-11-10)

- **덱·리플레이 영구 저장** (새로고침해도 유지)
  - 서버: `GET/POST /api/userdata` (`USERDATA_DIR=/app/userdata`, 볼륨) — `deck/`, `replay/` 만 허용, 경로·길이 검증
  - 클라이언트: 부팅 후 자동 복원 + 20초 주기/포커스 아웃/종료 시 자동 업로드, `F2` 즉시 저장(토스트 표시)
  - **드래그&드롭**: `.ydk` → `/deck`, `.yrpX/.yrp3d/.yrp` → `/replay`
- **리플레이 열람**: `/replay` 폴더를 만들어 리플레이 목록이 동작(서버에 넣은 리플레이가 그대로 보임)
- **퍼즐 크래시 수정**: `/puzzles` 폴더가 없어 `FS ErrnoError` 로 앱이 죽던 문제(폴더 보장)
- **필드 마법 일러**: `GetTextureField` 도 서버에서 이미지를 받아 `pics/field/<id>.jpg` 로 저장
- **복원 시점**: `preRun` 에서 MEMFS 에 쓰면 프리로드(.data)와 충돌해 게임이 죽는다 → **부팅 후** 복원으로 변경
- 저장소 정리: 루트의 옛 사본(`server.py`·`Dockerfile`·`shell.html`·`serve.ps1`·`wsbridge.py`) 제거 — `docker/` 가 정본

### v1.4.0 (2026-11-10)

- **여러 서버 접속 지원** (`config/configs.json` 의 `servers` 배열 그대로)
  - 서버마다 **방 목록**을 가져온다: `/api/getrooms?srv=<host>&port=<port>&proto=<http|https>` (컨테이너 프록시, CORS·HTTPS 우회)
  - 서버마다 **TCP 접속**: 클라이언트가 호스트 이름을 `window.__edoproTarget` 으로 넘기고
    `evlite.c` 가 `ws://<페이지>/ws?host=<이름>&port=<포트>` 로 연결 → `server.py` 가 컨테이너에서 **DNS+TLS 없이 TCP** 로 붙는다
  - `BRIDGE_ALLOW_ANY=1`(기본) 이면 요청한 host:port 로 접속. `BRIDGE_FORCE=1` 이면 기존처럼 `BRIDGE_TARGET` 고정
  - wasm 은 DNS 를 못 하므로 `ServerLobby::JoinServer` 가 **호스트 이름을 그대로** 브리지에 전달(루프백 주소 사용)
- 서버 목록 기본값 = 사용자 `configs.json` 6개(Hellzmain · EU 캐주얼/경쟁전 · US 캐주얼/경쟁전 · 중국)
- 실측: EU 경쟁전 목록 **5방**(Veto, Kaiser, goose, muln, RSP Fenrir) 표시,
  **방 만들기 성공**(호스트 준비 창), **`muln` 방 입장 성공**(GOAT · BO3 · 제한 100)
- `server.py` 에 `BRIDGE_DEBUG=1` 진단(패킷 hex 로그), `/ws` 대상 검증 추가

### v1.3.0 (2026-11-10)

- **서버 대전(온라인) 구현** — 화면만 있고 동작하지 않던 모드
  - 원인 ①: `ServerLobby::GetRoomsThread()` 가 `epro::thread` 를 만들고 **curl** 로 방 목록을 받아온다
    → wasm 은 스레드 불가 + curl 스텁 → 목록이 항상 비어 있었다
  - 원인 ②: 브라우저는 다른 오리진(멀티롤 7922)을 **CORS** 때문에 직접 못 부른다
  - 수정: `RefreshRooms()` 는 wasm 에서 스레드 없이 동기 실행, HTTP 는 **동기 XHR**
    (`emscripten_fetch` 동기 모드는 `responseType=arraybuffer` 때문에 XHR 예외로 **null 반환** → 사용 불가)
    + `server.py` 에 **`/api/getrooms` 프록시**(`LOBBY_UPSTREAM`, 기본 `http://192.168.0.4:7922`)
  - `config/user_configs.json` 에 `servers` 항목 추가(`assets/user_configs.json` 참고)
- 실측: `[lobby] GET /api/getrooms ok 434B` → 목록 표 1행(프리릴리즈·[1vs1]·MR5·Player·열림) 표시,
  행 선택 후 **들어가기** → 호스트 준비 창(2명) → 듀얼 가능. **방 만들기**도 서버에 방 생성 확인.

### v1.2.1 (2026-11-10)

- **화면 레이아웃 정상화**: 캔버스가 오른쪽으로 밀리고 잘리던 문제 수정
  - Emscripten 셸의 숨은 `<div class=emscripten>`(진행바 래퍼)이 flex 행에 남아 중심이 밀렸다
  - `body>*{display:none}` + `.emscripten_border` 를 `position:fixed;inset:0` 로 고정,
    캔버스를 `min(W/1024, H/640)` 배율로 **창에 꽉 차게**(비율 유지) 배치
  - Emscripten 은 마우스 좌표를 `canvas.width / rect.width` 로 환산하므로 확대해도 입력 정상
- **듀얼 필드 렌더링 정상화**: `CWebGL1Driver::drawVertexPrimitiveList` 가
  클라이언트 배열 호출을 **통째로 무시**하고 있었다(`"WebGL driver does not support ... without a VBO"`)
  → 스트리밍 `SMeshBuffer`(VBO)로 올려 그리도록 구현. `GL_INVALID_OPERATION` 경고 **0건**(메뉴) / 필드·존·카드 정상 표시
- `webpics.c` 제거(중복 심볼 원인), `scripts/patch_shell_post.py` 를 저장소에 포함

### v1.1.0 (2026-11-10)

- **카드 이미지 표시 해결**
  - `web_fetch_pic` 을 `EM_ASYNC_JS`(Asyncify) → **동기 XHR**(`EM_ASM_INT`)로 교체
  - THUMB 이 `/pics/field/` 에 저장되던 경로 버그 수정(ART 와 동일한 `pics/<code>.jpg`)
  - `wait=true` + `preload_status=LOADED` 로 다음 프레임 재사용, 성공 카드만 캐시
- **듀얼 시작 해결**
  - `BUTTON_HOST_CONFIRM` 에서 `NetServer::StartServer()` 생략(wasm 은 `std::thread` 불가)
  - WS 브리지로 멀티롤 서버에 직결 → 호스트 준비 → 시작 → 듀얼 진행 확인

### v1.0.0 (2026-11-09)

- 최초 공개: wasm 빌드, 한국어, 단일 포트 Docker(정적+WS 브리지+Git API), 오디오(miniaudio)

