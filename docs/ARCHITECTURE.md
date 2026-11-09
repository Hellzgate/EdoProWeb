# 아키텍처

## 1. 구성 요소

| 계층 | 구성 | 역할 |
|---|---|---|
| 브라우저 | `edopro-full.html/.js/.wasm/.data` | EDOPro 클라이언트 (wasm) + WebGL1 렌더 |
| 셸(HTML) | 페이지 스코프 JS | 게임 캔버스만 표시, WS 주소 주입, 카드 이미지 헬퍼 |
| 컨테이너 | `server.py` | 정적 서빙(COOP/COEP) + **WS↔TCP 브리지**(`/ws`) + **Git 동기화 API** |
| 서버(게임) | Multirole 7911 / 머큐리 프론트 7914 (NAS) | 듀얼 처리·로비·리플레이 |

## 2. 데이터 흐름

### 2-1. 실행(부팅)
```
브라우저 GET /  ─▶ server.py ─▶ edopro-full.html
                  └▶ .js/.wasm/.data (preload: config·fonts·textures·skin·expansions·lflists·deck·script·media)
Module.preRun? (없음)  ─▶ EDOPro main()
   └ DataHandler: config/system.conf, expansions/*.cdb(한국어), repositories/ 스캔
   └ Game::Initialize: Irrlicht WEBGL1 디바이스 + SDL2 창
   └ Game::MainLoop: 프레임 루프 (Asyncify 로 프레임마다 브라우저에 양보)
```

### 2-2. 서버 접속
```
게임 UI(LAN + AI) → DuelClient::StartClient(ip, port)
   └ evlite.c: bufferevent_socket_connect → ws://<host>/ws?host=<ip>&port=<port>
        └ server.py /ws : WebSocket 프레임 ↔ TCP 바이트 중계 (BRIDGE_TARGET 로 대상 고정 가능)
   └ 메인 루프에서 DuelClient::PumpWeb() 이 to_analyze 큐를 소비 → STOC 처리
```

### 2-3. 저장소(깃) 적용
```
/repos.html → POST /api/repos/sync {repos:["owner/name"]}
   └ server.py: git clone --depth 1 / fetch+reset → /app/repos/<owner>_<name>
게임 새로고침 시 → GET /api/repos.tar
   └ (구) preRun 에서 tar 해제 → MEMFS repositories/
   ※ 현재는 tar 마운트를 사용하지 않는다(부팅 안정성). 저장소 파일은 서버가 보관·관리한다.
```

## 3. 스레드/이벤트 모델

- wasm 런타임은 **단일 스레드**(`-sASYNCIFY`). 브라우저에 양보는 `emscripten_sleep` 로 처리.
- EDOPro 는 원래 `ClientThread`/`ParserThread` 두 스레드를 쓰지만,
  wasm 빌드에서는 **메인 루프 펌프(`DuelClient::PumpWeb`)** 로 대체했다.
- WebSocket 콜백은 브라우저 이벤트로 메인 스레드에서 실행되고, 큐에 쌓인 STOC 패킷을 `PumpWeb` 이 처리한다.

## 4. 컨텍스트(WebGL) 관리

브라우저는 캔버스당 WebGL 컨텍스트 1개만 허용한다. EDOPro 는 데이터 로딩용 **임시 디바이스**를 만들기 때문에
그대로 두면 뒤에 만든 쪽이 앞의 컨텍스트를 잃는다 → `CSDL2ContextManager` 를 emscripten 전용으로 수정:

- `generateContext()` : 첫 컨텍스트를 **static 으로 보관**하고 이후 요청은 재사용
- `destroyContext()` : emscripten 에서 **무시**
- `~CIrrDeviceSDL2` : `SDL_DestroyWindow`/`SDL_Quit` 생략(창·컨텍스트는 페이지 수명)

## 5. 자산(Asset) 전략

| 자산 | 방법 |
|---|---|
| config/fonts/textures/skin/expansions/lflists/deck/script/media | **preload** 로 `.data` 에 포함(약 80MB) |
| 카드 이미지(pics) | 서버 프록시 `/img/<id>.jpg` (업스트림 images.ygoprodeck.com, `/app/piccache` 볼륨 캐시) |
| Git 저장소(cdb/스크립트 확장) | 서버 clone + `/api/repos.tar` |

## 6. 왜 "그대로 복사"가 아니라 wasm 인가

`.exe`/ELF 를 브라우저가 실행할 수 없으므로, **같은 소스(41.0.2)** 를 Emscripten 으로 다시 컴파일했다.
렌더러는 Irrlicht 포크에 이미 있는 **`EDT_WEBGL1` 드라이버**(WebGL1 ⊂ GLES2)를 사용한다.
