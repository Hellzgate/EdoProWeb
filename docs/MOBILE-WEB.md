# 모바일(안드로이드) 웹 — 상태와 진단 방법

> 대상: 폰 브라우저에서 `http://192.168.0.53:7556` 을 열었을 때의 동작.
> 데스크톱 브라우저는 정상 동작한다.

최종 갱신: 2026-11-11 (이미지 `edopro-web:1.10.15`, **미릴리스**)

---

## 1. 결론 요약

| 사실 | 근거 |
|---|---|
| 네트워크·서버는 정상 | 폰이 `nc` 로 `.data` **146MB / 1.31초(109MB/s)** 수신 |
| 폰 WebGL 정상 | `webgltest.html` → `WebGL 1.0 (OpenGL ES 2.0 Chromium)`, 파란 캔버스 렌더 |
| 게임은 실제로 부팅된다 | 브라우저 콘솔 로그: `EDOPro version 41.0.2` → `LoadDatabases ok` → `game ctor done` → `device swapped` |
| **실패 지점 1** | 탭이 백그라운드(`visibilityState=hidden`)가 되면 브라우저가 180MB 전송을 중단 → `wasm streaming compile failed: … Response body loading was aborted` |
| **실패 지점 2** | 셸 CSS 가 모든 상태 UI 를 숨겨서(`body>*{display:none!important}`) 로딩/실패가 **완전한 검은 화면**으로 보임 |

즉 "페이지가 안 뜬다"의 실체는 **검은 화면 + (백그라운드 전환 시) 전송 중단**이다.

## 2. 초기 전송량

| 파일 | 크기 | 비고 |
|---|---|---|
| `edopro-full.wasm` | 약 31.5MB | -O1, 예외/Asyncify 포함 |
| `edopro-full.data` | 약 146MB | config·fonts·textures·skin·expansions·lflists·deck·script·**sound(47MB)**·media |
| `edopro-full.js` | 약 2.25MB | |
| 합계 | **약 180MB** | BGM 40MB 포함 |

## 3. 이번에 추가한 것

### 3-1. Range 요청 지원 (`server.py`)

```
Range: bytes=0-4194303
→ HTTP/1.1 206 Partial Content
   Content-Range: bytes 0-4194303/145946307
   Accept-Ranges: bytes
```

- 정적 응답은 `Connection: close` + 1MB 청크 전송(이벤트 루프 양보 포함).
- 폰 실측: 4MB 조각 **0.10~0.22초**, 20MB 단일 **0.26초**, 31MB 전체 **0.41초**.

### 3-2. 로딩 오버레이 (`patch_shell_post.py`)

- `#edopro-load` — `EDOPRO` 로고 + 진행바 + `불러오는 중… n%` + 실패 시 **사유와 [다시 시도]** 버튼.
- emscripten 셸의 `#status` 텍스트에서 `(n/m)` 을 읽어 % 로 변환, 45초 경과 시 경과 시간 안내.
- `window.onerror` / `unhandledrejection` / `offline` → 오류 문구 표시.
- 셸의 `body>*{display:none!important}` 를 이기도록 `#edopro-load{display:flex!important}`, 숨김은 `.off` 클래스.

### 3-3. 브라우저 로그 → 서버 (`GET /api/jlog?m=`)

DevTools 없이 폰 상태를 보기 위한 통로.

```
[web] JS page start http://…/?tag=xxx ua=…
[web] JS log  [repo] applied 24 files (12.2MB)
[web] JS error [flow] device swapped
[web] JS hb5  ready=complete frames=1 canvas=300x150 css=1024x640 called=0 lost=0 vis=hidden
```

- `console.log/warn/error` 래핑 + `onerror` + `unhandledrejection`
- 5초마다 하트비트(`ready`·`frames`·`canvas`·`called`·`lost`·`vis`)
- 최대 400건, 건당 380자 제한(`navigator.sendBeacon`)

## 4. 진단 페이지

| 페이지 | 용도 |
|---|---|
| `/webgltest.html` | WebGL1/2 생성 + 실제 렌더(파란 화면) 확인 |
| `/probe.html` | Range 4MB×4 + 전체 파일 XHR, 구간별 진행/실패 표시 |
| `/probe2.html` | 4MB·20MB·31MB(200)·31MB 재시도 — 전송 계층 판정 |

## 5. 폰에서 확인하는 절차

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb connect 192.168.0.50:5555

# 1) 브라우저를 완전히 종료(탭이 쌓여 있으면 서로 180MB 를 나눠 받아 굶는다)
& $adb shell am force-stop com.naver.whale
& $adb shell am force-stop com.android.chrome

# 2) 페이지 열기
& $adb shell am start -a android.intent.action.VIEW -d "http://192.168.0.53:7556/?tag=test1" com.naver.whale

# 3) 서버 로그로 진행 확인
ssh mini "docker logs -t --tail 40 edopro-web | grep -E 'JS |static'"
```

> **주의**: 탭이 수십 개 열려 있으면 각 탭이 동시에 180MB 를 받아 아무 것도 진행되지 않는다.
> 실측 중 탭 카운터가 **205** 였다. 반드시 **탭을 모두 닫고** 한 개만 연다.

- Chrome 이 LAN HTTP 를 열지 못할 때:
  `adb reverse tcp:7556 tcp:7556` + PC 에서 `tcp_proxy.py`(127.0.0.1:7556 → 192.168.0.53:7556) → 폰에서 `http://localhost:7556`
- 페이지 `?diag=1` → 좌상단에 WebGL/캔버스/FS 상태 오버레이.

## 6. 다음 작업

1. **전송량 감축**: `.data`/`.wasm` **gzip 사전 압축** 서빙(`Content-Encoding: gzip`) → 약 1/3
2. **BGM 40MB 선로딩 제외** → 180MB → 106MB
3. **Range 청크 로더**: 8MB 단위로 받아 MEMFS 조립 + 조각 재시도(백그라운드 중단에 강함)
4. 위 3개 후에도 남는 문제가 있으면 `instantiateWasm` 훅으로 wasm 로딩을 직접 제어

## 7. 참고

- 전체 시행착오 기록: `D:\rea-out\windbot-ai-editor\67-edopro-wasm-client.md` §17~§21
- 서버 API·환경변수·운영 명령: 같은 문서 **§21 총정리**

