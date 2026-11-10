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

## 6. 그 밖의 제약

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
