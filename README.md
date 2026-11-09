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
| 버전 | **1.1.0** (`VERSION`) |
| 이미지 | `edopro-web:1.1.0` (약 285MB, `python:3.12-alpine` + `git`) |
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

## 4. 상태 요약 (v1.1.0)

| 기능 | 상태 |
|---|---|
| 브라우저에서 EDOPro 실행(렌더·입력) | ✅ |
| 한국어 패치(UI·카드·폰트) | ✅ |
| 게임 화면만 표시(셸 크롬 제거) | ✅ |
| Git 저장소 받기/적용 (`/repos.html`) | ✅ |
| 오디오(Web Audio) | ✅ |
| 서버 접속(방 목록/생성, 프로토콜 파싱) | ✅ |
| **카드 이미지 표시**(덱 편집기·듀얼) | ✅ v1.1.0 |
| **듀얼 시작 → 실제 진행**(봇 대전) | ✅ v1.1.0 |
| 듀얼 필드 마트/카드 뒷면 렌더링 품질 | ⚠️ WebGL 드로우 경로 문제(진행은 정상) |

자세한 원인과 다음 단계는 [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md).

---

## 5. 변경 이력

### v1.1.0 (2026-11-10)

- **카드 이미지 표시 해결**
  - `web_fetch_pic` 을 `EM_ASYNC_JS`(Asyncify) → **동기 XHR**(`EM_ASM_INT`)로 교체
  - THUMB 이 `/pics/field/` 에 저장되던 경로 버그 수정(ART 와 동일한 `pics/<code>.jpg`)
  - `wait=true` + `preload_status=LOADED` 로 다음 프레임 재사용, 성공 카드만 캐시
  - 링크 실패 시 옛 wasm 이 조용히 배포되던 문제(`webpics.o` 중복 심볼) 제거
- **듀얼 시작 해결**
  - `BUTTON_HOST_CONFIRM` 에서 `NetServer::StartServer()` 생략(wasm 은 `std::thread` 불가)
  - WS 브리지로 멀티롤 서버에 직결 → 호스트 준비 → 시작 → 듀얼 진행 확인
- Irrlicht `COGLES2Driver` 에 wasm 전용 VBO 언바인드(부분 개선)

### v1.0.0 (2026-11-09)

- 최초 공개: wasm 빌드, 한국어, 단일 포트 Docker(정적+WS 브리지+Git API), 오디오(miniaudio)

