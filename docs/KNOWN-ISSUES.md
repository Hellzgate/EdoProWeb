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

## 3. 렌더링 — 남은 문제 (기능은 동작)

**증상**: 듀얼 필드에서 `GL_INVALID_OPERATION: glDrawElements: Must have element array buffer bound` 와
`vertexAttribPointer: no ARRAY_BUFFER is bound and offset is non-zero` 가 프레임마다 발생하고,
필드의 **마트(존 테두리)·카드 뒷면 일부**가 어긋나 보인다(배경은 듀얼 시작 연출 이미지가 남는다).

**원인(추정)**: Irrlicht `COGLES2Driver` 의 `drawVertexPrimitiveList()` 가
`HardwareMappingHint != EHM_NEVER` 상태에서 **VBO 오프셋**을 쓰는데, wasm 빌드에서는 해당 VBO 가 없거나
`draw2DImage*` 의 **클라이언트 포인터** 경로와 섞여 WebGL 이 이를 잘못 해석한다.
(데스크톱 GL 은 두 방식을 섞어도 되지만 WebGL 은 안 된다)

**시도한 것**: `setRenderStates2DMode()` 진입 시 `ARRAY/ELEMENT_ARRAY_BUFFER` 언바인드,
`drawVertexPrimitiveList()` 종료 시 언바인드 → **오류는 남음**(188건/198줄).

**다음 후보**
1. `COGLES2Driver::drawVertexPrimitiveList` 의 `HWBuffer->Mapped_Vertex/Index` 분기를 wasm 에서 **항상 클라이언트 배열**로
2. `COGLES2Driver::updateHardwareBuffer` 에서 VBO 생성 여부 로그 → 어느 드로우가 문제인지 특정
3. 근본 회피: `EDT_WEBGL1` 대신 **GLES2 + WebGL2**(`-sMAX_WEBGL_VERSION=2`, `-sMIN_WEBGL_VERSION=2`)로 링크

> 게임 진행(드로우·소환·페이즈·효과 선택·봇 대화)은 정상 동작하며, 위 문제는 **화면 품질**에 해당한다.

## 4. 그 밖의 제약

- **서버 대전(HTTP 로비)**: `ServerLobby` 가 `curl` 을 쓰는데 웹 빌드는 `curl-stub` 이라 동작하지 않는다.
  → **LAN 모드 + WS 브리지**가 유일한 접속 경로.
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
