v1.12.0: 안드로이드 크래시 해결 (game.cpp -O0) + HTTPS 리스너 + 진단 도구

## 핵심 수정
- **모바일(안드로이드) 렌더러 크래시 해결**: `game.cpp` 를 `-O1` 로 최적화하면
  `Game::Initialize()`/`Game::MainLoop()` 가 거대한 단일 함수로 생성되고,
  모바일 V8/Asyncify 가 이를 처리하지 못해 Chromium `CHECK`(SIGTRAP)로 죽었다.
  → **`game.cpp` 만 `-O0`** 로 컴파일(나머지는 `-O1` 유지). 폰에서 메뉴 렌더·FPS 61 확인.

## 진단 도구 (재사용)
- `localStorage['edopro-hist']` 링버퍼 40건 + **`/last.html`**(최신순, `?clear=1` 초기화)
  → 렌더러가 죽어도 마지막 실행 지점을 읽을 수 있다(로그 유실 문제 해결).
- `?net=1` / `?jlogsync=1` : 네트워크 로깅(기본 OFF, localStorage 전용)
- `?debug=1` : `[flow]`/`[step]` 마커를 서버 로그로
- `scripts/init_probe.sh <N>` : `Initialize()` 를 N단계에서 조기 반환시켜 이분탐색
- `/webglstress.html` · `/probe2.html` · `/webgltest.html`

## 서버
- **HTTPS 리스너 추가**(`HTTPS_PORT`, `/app/cert/{cert,key}.pem`, 자체 서명).
  안드로이드 Chrome 이 사설망 평문 HTTP 를 `ERR_TOO_MANY_RETRIES` 로 막는 경우의 우회로.
- gzip 사전 압축 서빙 유지(131MB → 약 61MB).

## 검증
| 플랫폼 | 결과 |
|---|---|
| PC (Chrome) | 메인 메뉴 · 덱 편집기(카드 40+10장) · FPS 61 |
| 안드로이드(웨일) | **메인 메뉴 렌더 · FPS 61** |
