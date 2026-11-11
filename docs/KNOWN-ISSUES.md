# 남은 문제 / 다음 단계 (v1.1.0)

## 1. 카드 이미지 — ✅ 해결 (v1.1.0)

**증상(과거)**: 덱 편집기·듀얼에서 모든 카드가 뒷면/미확인 텍스처.

**원인 3개**
1. `ImageManager::GetTextureCard()` 가 THUMB 를 `web_fetch_pic(code, 1)` 로 넘겨 **`/pics/field/`** 에 저장했는데,
   실제 로딩 경로는 `pics/<code>.jpg`(ART) 이다 → 파일이 있어도 못 찾음.
2. 이미지 로딩 스레드가 없는 웹 빌드에서 `wait=false` 경로로 빠져 `to_load` 큐에만 쌓였다.
3. `EM_ASYNC_JS`(Asyncify) 로 구현한 `web_fetch_pic` 이 **렌더 루프 안에서 호출되지 않았다**
   (`Asyncify` 중단 실패). 로그도 남지 않아 "호출 자체가 안 됨"으로 보였다.

**수정**
- `web_fetch_pic` 을 **동기 XHR**(`EM_ASM_INT`, `charset=x-user-defined` 로 바이너리 획득)로 교체 → Asyncify 의존 제거
- THUMB/ART 모두 `/pics/<code>.jpg` 로 통일 (`imgType::COVER` 만 `/pics/cover/`)
- `wait = true` 강제 + 로딩 성공 시 `preload_status = LOADED` 설정 (다음 프레임 재사용)
- 이미 받은 카드는 `static std::set` 으로 스킵, 실패는 재시도 허용
- 링크 오류로 **조용히 옛 wasm 이 배포되던 문제**도 확인: `link-default.sh` 가 실패해도 `cp` 가 실행된다
  → 중복 심볼(`webpics.o` 의 `web_fetch_pic`) 제거 후 정상

**실측**: 덱 편집기 진입 시 `/pics/*.jpg` **36장** 기록, 화면에 카드 아트 표시. 듀얼 중 `[pic] ok 56364287 169607B` 확인.

## 2. 듀얼 시작 — ✅ 해결 (v1.1.0)

**증상(과거)**: `LAN + AI 대전 → 방 만들기 → 확인` 에서 화면이 멈춤(`destroyContext requested` 로그).

**원인**: `BUTTON_HOST_CONFIRM` 핸들러가 `NetServer::StartServer()` 를 호출하는데,
그 안에서 `epro::thread(ServerThread).detach()` = **std::thread** 를 만든다.
wasm(단일 스레드)에서는 `std::thread` 생성이 예외를 던지고, GUI 이벤트 핸들러에서 잡히지 않아
**메인 루프가 통째로 풀리면서** 디바이스 정리(`destroyContext`)가 불리고 화면이 정지했다.

**수정** (`menu_handler.cpp`)
```cpp
#ifdef __EMSCRIPTEN__
        /* 브라우저에는 TCP 리스너/스레드가 없다 -> 로컬 서버를 만들지 않고
           WS 브리지(BRIDGE_TARGET)로 외부 서버(멀티롤)에 바로 접속한다. */
#else
        mainGame->gBot.Refresh(...);
        if(!NetServer::StartServer(host_port)) break;
#endif
        if(!DuelClient::StartClient({&ip, epro::Address::INET}, host_port)) {
#ifndef __EMSCRIPTEN__
            NetServer::StopServer();
#endif
            break;
        }
```

**실측**: 방 만들기 → 확인 → **호스트 준비 창**(플레이어 2명) → 준비 → 시작 → **듀얼 필드 진입**.
NAS 패널 API 로 봇(`raisemoon`) 투입 후 실제 듀얼 진행(봇 대사·드로우·소환·페이즈 표시 확인).

## 3. 렌더링 — ✅ 해결 (v1.2.1)

**증상(과거)**: 듀얼 필드에서 `GL_INVALID_OPERATION: glDrawElements: Must have element array buffer bound` +
`vertexAttribPointer: no ARRAY_BUFFER is bound and offset is non-zero` 가 프레임마다 발생하고,
필드의 **마트(존 테두리)·카드 뒷면**이 그려지지 않아 배경(직전 프레임)만 남았다.

**원인**: 이 빌드는 `EDT_WEBGL1` 드라이버(`CWebGL1Driver`, `irrlicht/src/CWebGL1Driver.cpp`)를 쓰고,
그 안의 `drawVertexPrimitiveList()` 가 클라이언트 배열 호출을 **의도적으로 무시**하고 있었다.

```cpp
os::Printer::log("WebGL driver does not support drawVertexPrimitiveList calls without a VBO", ELL_WARNING);
```

EDOPro 는 필드 카드·존·선택선을 `drawVertexPrimitiveList(4 verts, EPT_TRIANGLES, EIT_16BIT)` 로 그리므로
그 요소들이 **전부 누락**됐다. (COGLES2Driver 쪽 패치는 이 드라이버에 적용되지 않아 효과가 없었다)

**수정**: 클라이언트 데이터를 **스트리밍 메시버퍼(VBO)** 로 올려 `drawMeshBuffer()` 로 그린다.

```cpp
static scene::SMeshBuffer* sb = nullptr;
if (!sb) sb = new scene::SMeshBuffer();
sb->Vertices.set_used(0);
sb->Indices.set_used(0);
sb->BoundingBox.reset(0.f, 0.f, 0.f);
sb->append(vertices, vertexCount, static_cast<const u16*>(indexList), primitiveCount * 3);
sb->setHardwareMappingHint(scene::EHM_STREAM);
sb->setDirty(scene::EBT_VERTEX_AND_INDEX);
drawMeshBuffer(sb);
```

**실측**: 메뉴 화면 `GL_INVALID_OPERATION` **0건**(이전 188건/198줄).
듀얼 필드의 존 테두리·마트·덱/묘지 더미·손패 카드가 모두 표시되고, 손패/효과 선택/페이즈 진행이 정상.

> 듀얼 시작 시점에 한 번(약 190건) 같은 계열 경고가 남아 있으나 화면에는 영향이 없다(초기 텍스처 업로드 단계).

## 4. 화면 레이아웃 — ✅ 해결 (v1.2.1)

**증상(과거)**: 캔버스가 오른쪽으로 밀리고 창 밖으로 잘렸다(좌측에 검은 여백).

**원인**: Emscripten 셸의 숨은 `<div class="emscripten">`(progress 래퍼)가 flex 행에 남아
`justify-content:center` 의 중심 계산이 밀렸다. (id 가 없는 래퍼라 기존 `#progress` 숨김 규칙에 걸리지 않음)

**수정**: `body>*{display:none!important}` 후 `.emscripten_border` 만 `position:fixed;inset:0` 로 살리고,
JS 로 캔버스를 `min(W/1024, H/640)` 배율로 **비율 유지 확대**한다.
Emscripten 은 마우스 좌표를 `canvas.width / rect.width` 로 환산하므로 확대해도 입력이 정확하다.

## 5. 서버 대전(온라인) — ✅ 해결 (v1.3.0)

**증상(과거)**: `서버 대전` 화면은 뜨지만 서버 목록이 EU/US 기본값이고, 방 목록은 항상 비어 있었다.

**원인 2개**
1. `ServerLobby::GetRoomsThread()` 가 **`epro::thread` + `curl`** 로 목록을 받아온다
   → wasm 은 스레드가 없고 `curl` 은 스텁(항상 실패) → 목록이 비어 있음
2. 브라우저는 다른 오리진(멀티롤 `:7922`)을 **CORS** 때문에 직접 호출할 수 없다

**수정**
- `RefreshRooms()` → wasm 에서는 스레드 없이 `GetRoomsThread()` 를 **동기 호출**
- HTTP 는 **동기 XHR** 로 구현 (`server_lobby.cpp`):
  ```cpp
  /* emscripten_fetch 의 동기 모드는 responseType=arraybuffer 때문에 XHR 예외로 null 을 반환한다 */
  const int len = EM_ASM_INT({
      var xhr = new XMLHttpRequest();
      xhr.open('GET', UTF8ToString($0), false);   // 동기
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
      xhr.send(null);
      if (xhr.status !== 200) return -1;
      /* 바이너리 -> Uint8Array -> MEMFS /tmp/getrooms.json */
      Module.FS.writeFile('/tmp/getrooms.json', arr);
      return arr.length;
  }, path.c_str());
  std::ifstream in("/tmp/getrooms.json", std::ios::binary);  // FILE* 는 헤더 충돌로 사용 불가
  ```
  URL 은 **경로만**(`/api/getrooms`) 사용해 현재 페이지 오리진에서 요청 → CORS 회피
- `server.py` 에 **`/api/getrooms` 프록시** 추가 (`LOBBY_UPSTREAM`, 기본 `http://192.168.0.4:7922`)
- `config/user_configs.json` 에 `servers` 항목(서버 1개 = NAS Multirole) — `assets/user_configs.json` 참고.
  이 파일은 **preload 되어 `.data` 에 들어가므로** 바꾸면 재링크가 필요하다.

**실측**: `[lobby] GET /api/getrooms ok 434B` → 표에 1행(프리릴리즈 · [1vs1] · MR5 · N/A · Player · 열림) 표시.
행 선택 → **들어가기** → 호스트 준비 창(2명) → 준비 → 시작 → 듀얼 진행.
**방 만들기**도 서버에 방이 생성되고(`roomid 1`) 목록 API 로 확인됨.

> 서버 목록은 `user_configs.json` 의 `servers` 배열이 **전부**이므로, 다른 서버를 쓰려면 그 파일을 고쳐 재링크한다.

## 6. 여러 서버 접속 (v1.4.0)

기본 서버 목록은 `config/configs.json` 의 `servers` 배열이다(없으면 `user_configs.json`).
`server.py` 가 **같은 오리진 프록시**로 방 목록을, **WS 브리지**로 TCP 를 중계하므로
브라우저에서도 각 서버에 접속할 수 있다.

| 단계 | 구현 |
|---|---|
| 서버 목록 | `configs.json` → `Game::LoadServers` (수정 시 `.data` 라 **재링크** 필요) |
| 방 목록 | 게임 → `/api/getrooms?srv=<host>&port=<port>&proto=<http\|https>` → 프록시가 `proto://host:port/api/getrooms` |
| TCP 접속 | 게임 → `window.__edoproTarget = {host, port}` → `evlite.c` 가 `ws://<페이지>/ws?host=<이름>&port=<포트>` → `server.py` 가 컨테이너에서 DNS 조회 후 TCP |

환경변수
- `BRIDGE_ALLOW_ANY=1`(기본): 클라이언트가 요청한 host:port 로 접속(여러 서버)
- `BRIDGE_FORCE=1` + `BRIDGE_TARGET`: 예전처럼 한 곳으로 고정
- `LOBBY_ALLOW_ANY=1`(기본): `/api/getrooms?srv=...` 허용
- `BRIDGE_DEBUG=1`: 패킷 hex 로그(`c->s`, `s->c`, 종료 주체) — 프로토콜 문제 진단용

**실측(2026-11-10)**
- 서버 6개 표시(Hellzmain · EU 캐주얼/경쟁전 · US 캐주얼/경쟁전 · 중국)
- EU 경쟁전 방 목록 **5방**(Veto/Diamond Dude, Kaiser, goose, muln, RSP Fenrir)
- **방 만들기** → 호스트 준비 창 정상
- **`muln` 방 입장** → GOAT · BO3 · 제한 100 · 상대 `muln` 표시
- 중국(HTTPS 443) 목록 200, TCP 44444 연결 101 확인

**주의**
- 방 목록은 **새로 고침 시점의 스냅샷**이다. 이미 시작/정원 초과된 방에 들어가면
  `연결이 끊어졌습니다` 가 뜰 수 있다(서버가 먼저 끊음). 다른 방을 선택하면 된다.
- 호스트 준비 창의 `관전자 수` 표기가 서버에 따라 어긋나 보일 수 있다(표시 문제, 진행에는 영향 없음).

## 7. 덱·리플레이 보관 / 드래그&드롭 (v1.5.0)

브라우저 MEMFS 는 새로고침하면 사라진다. 이를 서버에 보관한다.

| 항목 | 구현 |
|---|---|
| 저장 위치 | 컨테이너 `/app/userdata` (docker volume `edopro_userdata`) |
| API | `GET /api/userdata` → `{"files":{경로:base64}}` · `POST /api/userdata` (같은 형식) |
| 허용 경로 | `deck/`, `replay/` 만, `..`·절대경로·200바이트 초과 이름 거부 |
| 복원 | **부팅 완료 후**(캔버스가 실제 크기가 된 뒤 1.2초) 1회 — `preRun` 에서 하면 프리로드와 충돌해 게임이 죽는다 |
| 저장 | 20초 주기 + 창 포커스 아웃 + `beforeunload` + `F2` |
| 드래그&드롭 | `.ydk` → `/deck`, `.yrpX/.yrp3d/.yrp` → `/replay` |

**주의(실측)**
- 공식 배포 덱 중 `Evil★Twin ...` 파일명은 .data 안에서 **PUA 문자로 깨져** 보인다(U+E000~U+F8FF).
  그 이름을 그대로 올리면 파일명이 255바이트를 넘어 `ENAMETOOLONG` 이 되고, 복원 시 덱 스캔이 죽는다
  → **PUA/서rogate 이름은 업로드·복원에서 제외**.
- 프리로드된 기본 덱은 복원 시 **덮어쓰지 않는다**(`analyzePath` 확인).

## 8. 퍼즐·리플레이 폴더 (v1.5.0)

EDOPro 는 `./puzzles`(퍼즐 목록)와 `replay/*.yrpX`(리플레이) 를 스캔한다.
웹 빌드는 두 폴더가 없으면 `FS ErrnoError` 로 **앱이 종료**되므로 부팅 시 폴더를 만든다.
퍼즐은 공식 배포물에도 비어 있어 목록이 비어 보이는 것이 정상이다.

## 9. 설정·퍼즐·보관함 (v1.6.0)

| 기능 | 구현 | 비고 |
|---|---|---|
| 설정 저장 | `config/system.conf` 를 `preRun` + **run dependency** 로 복원 | 게임이 시작 전에 읽으므로 부팅 후 복원으로는 늦다 |
| 퍼즐 | `/puzzles` 동기화·복원, `.lua` 드롭 | 퍼즐 파일은 직접 넣어야 한다(공식 배포물은 비어 있음) |
| 보관함 | `/files.html` — 목록·다운로드·업로드·삭제 | `GET|POST|DELETE /api/userdata/file?path=` |

**주의**: `Module.addRunDependency` 는 `-sEXPORTED_RUNTIME_METHODS` 에 넣어야 노출된다.
노출되지 않는 빌드에서는 설정 복원을 **부팅 후**로 미루고(다음 실행부터 적용) 로그로 알린다.

## 10. 저장소 / 자동 업데이트 (v1.7.0)

EDOPro 는 `configs.json` 의 `repos` 를 **libgit2** 로 clone/pull 해 카드 DB·스크립트·금제를 자동 갱신한다.
웹 빌드는 libgit2 를 쓸 수 없어 **서버가 git 을 대행**하고, 게임은 결과만 받아 쓴다.

```
[서버] 기동 시 + REPOS_AUTO_HOURS(기본 6h) 마다  git fetch + reset  →  /app/repos/<owner>_<repo>
       /api/repos/bundle  :  *.cdb → expansions/<repo>__<파일>
                             *.lua → script/<repo>/<파일>     (게임은 script/ 1단계만 스캔 → 평탄화)
                             *.conf→ lflists/<repo>__<파일>   (ETag, 변경 없으면 304)
[게임] preRun(프리로드 완료 후) 에 번들 적용  →  DataHandler 가 그대로 읽는다(코드 수정 불필요)
```

**왜 이 경로인가**
- 게임의 로더가 이미 `./expansions/**/*.cdb`(2단계), `./script`(+1단계), `./lflists/*.conf` 를 스캔한다
  → C++ 수정 없이 저장소 내용을 그 자리에 넣기만 하면 된다.
- `repo_manager.cpp` 는 wasm 에서 스텁이라 `Game::ParseGithubRepositories` 가 빈 목록을 받는다(그래서 예전엔 저장소가 무효).

**주의**
- 적용 시점은 **페이지 로드(부팅) 1회** — EDOPro 처럼 "다음 실행에 적용"과 동일.
- 기존 프리로드 카드 DB(한국어 `cards.cdb`) 뒤에 저장소 cdb 가 로드되므로,
  **같은 ID 는 기존(한국어) 데이터가 유지**되고 **새 카드만 추가**된다(의도).
- 대용량 스크립트 저장소(DeltaBagooska 등)는 번들이 커지므로 `/repos.html` 에서 필요할 때만 추가.

## 11. 사운드 / 봇 투입 (v1.8.0)

### 사운드
원본 `sound/` 는 **47MB**(BGM 40MB/7 + 효과음 6.9MB/20 wav)인데 preload 목록에 없어 **무음**이었다.
→ 효과음만 `.data` 에 넣었다(`--preload-file "$A/sound@/sound"`, wav 20개). BGM 은 용량 대비 효용이 낮아 **미포함**.

### 봇 투입
브라우저는 프로세스를 못 만들므로 `WindBot` 을 로컬에서 띄울 수 없다(인게임 `AI` 버튼은 팝업만).
대신 **멀티롤 웹 패널 API** 를 프록시하는 `/bot` 페이지에서 서버 방에 봇을 넣는다.

| 환경변수 | 설명 |
|---|---|
| `BOT_PANEL_URL` | 패널 주소(예 `http://192.168.0.4:8090`). 비면 봇 기능 비활성 |
| `BOT_PANEL_TOKEN` | 패널 토큰(`X-MR-Token`) |

**사용**: 게임에서 `LAN + AI 대전 → 방 만들기 → 확인` → `/bot` 에서 방 선택 + 덱 선택 → **봇 투입**

## 12. BGM / 모바일 / 이미지 로딩 (v1.9.0)

| 항목 | 상태 | 비고 |
|---|---|---|
| BGM | ✅ 40MB preload | 메뉴·듀얼·덱·승/패 등 7종 |
| 모바일 | ⚠️ 기본 대응 | viewport + touch-action. 실기기 터치 검증은 미실시 |
| 이미지 로딩 | ⚠️ 동기(히치 있음) | 비동기 시도는 **실패**(아래) |

**이미지 비동기 실패 원인**: `GetTextureCard` 는 `preload_status` 가 `LOADED` 가 아니면 재시도하는데,
실패 시 `LoadCardTexture` 가 `gImageDownloader->AddToDownloadQueue()` + `WAIT_DOWNLOAD` 를 반환하고,
다음 프레임에는 `DOWNLOADING` 으로 조기 반환한다(다운로더 스레드가 없으므로 영구).
`AddToDownloadQueue` 생략 + 상태 리셋까지 시도했으나 실제로는 카드가 뒤집힌 채 남아 **동기 구현으로 롤백**했다.
다음 시도 시에는 `GetTextureCard` 를 wasm 전용 경로로 분리(다운로더 상태 무시 + 매 프레임 재시도)하는 편이 안전하다.

## 13. 이미지 히치 완화 / 모바일 (v1.10.0)

- **선반입**: `ImageManager::PrefetchCard()`(wasm 전용, `web_pic_start` 비동기 fetch) 를
  `Game::DrawDeckBd()` 첫머리에서 덱 전체 카드에 대해 호출. 같은 카드는 `static std::set` 으로 1회만.
  렌더 경로(동기 XHR)는 그대로라 **상태기계 문제 없이** 첫 프레임 끊김만 사라진다.
- **모바일**: 412×915 에서 캔버스 412×257(16:10)·가로 스크롤 0, 세로일 때 하단 안내 문구.
  실기기 터치 플레이는 여전히 **미검증**(자동화는 마우스 이벤트만).

## 14. 그 밖의 제약

- **로컬 호스팅**: 브라우저는 TCP 서버를 열 수 없으므로 "방 만들기"는 실제로는 **멀티롤 서버에 접속**한다.
  봇은 NAS 패널(`POST /api/bot/start`)로 투입한다.
- **WindBot**: 브라우저에서 실행 불가(위와 동일).
- **사이드 덱 교환**: EDOPro/WindBot 구조상 미지원(기존 프로젝트와 동일).

## 검증 체크리스트(변경 시)

```bash
# 1) 빌드 (링크 실패는 반드시 확인해야 한다 — 실패해도 cp 는 실행됨)
~/edo-src/ocgwasm/build-gframe-audio.sh
~/edo-src/ocgwasm/link-default.sh 2>&1 | grep -E "error|failed" || echo "link clean"
# 2) 배포
cd ~/edopro-docker && docker build -t edopro-web:X.Y.Z . && docker rm -f edopro-web
docker run -d --name edopro-web --restart unless-stopped -p 7556:8080 \
  -v edopro_pics:/app/piccache -e BRIDGE_TARGET=192.168.0.4:7911 -e REPOS=ProjectIgnis/BabelCDB edopro-web:X.Y.Z
# 3) 서버 확인
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.0.53:7556/
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" http://192.168.0.53:7556/img/89631139.jpg
# 4) 화면 확인
#    메뉴 → 덱 편집(카드 아트) → LAN + AI → 방 만들기 → 확인 → 준비 → 시작 → 듀얼
#    봇 투입: POST http://192.168.0.4:8090/api/bot/start  {"roomId":N,"deck":"raisemoon"}
```
