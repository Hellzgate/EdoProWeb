# EDOPro Web — v1.24.4 릴리스 노트

- 날짜: 2026-11-13
- 이미지: `edopro-web:1.24.4`
- 접속: `https://sw20103.synology.me:8451/` (DSM 역프록시) · LAN `https://192.168.0.53:8443`
- 원본: Project Ignis EDOPro 41.0.2 (wasm)

## 한눈에

| 항목 | 결과 |
|---|---|
| **부팅 전송량** | **81.3MB → 60.3MB (-25.8%)** (HTTPS 실측) |
| 폰트 | NotoSansKR 16.4MB → **1.7MB** (서브셋) |
| 압축 | brotli: wasm 13.3→**8.9MB**, data 52.6→**45.0MB**, 번들 11.3→**6.1MB** |
| 언어 | `system.conf language` 하나로 **UI 6개 언어 + 카드DB** 동시 전환 |
| 스크린샷 | 📷 버튼 → PNG 다운로드(원본 '스크린샷' 대응) |
| 셸 주입기 | 1,141줄 단일 파일 → 오케스트레이터 + `scripts/shell/` 12개 자산(**출력 바이트 동일**) |
| 안정성 | 패 테스트(단일모드) fiber 통합은 **실패 → 되돌림**, 버튼 숨김 유지 |

## 1. 부팅 전송량 최적화

| 리소스 | 이전(gzip) | 지금(brotli) |
|---|---|---|
| `edopro-full.data` | 67.4MB | **45.0MB** |
| `edopro-full.wasm` | 14.0MB | **8.9MB** |
| `edopro-full.js` | 0.3MB | 0.3MB |
| `/api/repos/bundle` (한국어) | 11.9MB | **6.1MB** |

- `.data` 113,129,788B (폰트 서브셋으로 -14.7MB).
- ⚠ 평문 HTTP 에서는 Chrome 이 `br` 을 보내지 않아 gzip(77.5MB)이다. **HTTPS 로 접속해야 최대 절감**.

## 2. 언어 연동 (정정)

- `.data` 에 **6개 로케일** 내장(Deutsch/Español/Français/Italiano/Korean/Português) → **언어별 빌드 불필요**.
- `config/system.conf language` → `Game::ApplyLocale()` → `config/languages/<locale>/strings.conf` 로 UI 전환.
- 카드DB 는 서버 번들 `/api/repos/bundle?lang=` 이 결정(한국어 = `zzz-korean-cards.cdb` 추가).
- **수정**: 번들이 **system.conf 를 우선**으로 언어를 읽고(localStorage 는 보조), preRun 순서를
  `설정 복원 → 번들 적용` 으로 바꿔 첫 부팅/새 기기에서도 언어가 어긋나지 않는다.

## 3. 스크린샷

- 우측 상단 **📷**: `gl.readPixels` 로 캡처(검은 화면이면 최대 15회 재시도) → `edopro-YYYYMMDD-HHMMSS.png`.
- `canvas.toDataURL()` 만 쓰면 **검은 PNG** 가 나온다(WebGL 버퍼는 프레임 후 비워짐) — 실측.

## 4. 모듈화

```
scripts/patch_shell_post.py   오케스트레이터(≈160줄)
scripts/shell/
  layout.css  boot.js  jlog.js  load.js  diag.js
  ime.js  fullscreen.js  screenshot.js  fs-start.js  files.js  audio.js  board.js
```
- 검증: 리팩터 전후 생성 HTML **바이트 동일**(`cmp`).

## 5. 검증 로그

| 항목 | 결과 |
|---|---|
| 페이지 | 200 |
| 정적 br | `Content-Encoding: br`, wasm 9,310,856B |
| 번들 br | `Content-Encoding: br`, 6,407,233B |
| UI 언어(영어) | Servers/LAN + AI/Puzzles/Replays/Decks/Exit |
| 한글 렌더 | `[몬스터/효과] 빛/전사족` 정상(서브셋 폰트) |
| 스크린샷 | 1,024×700 PNG 정상 |
| 모듈화 | 생성 HTML `cmp` IDENTICAL |

## 6. 남은 일

- 패 테스트(fiber/worker) — `docs/HANDTEST-WEB.md` §7 (실패 기록) 참고.
- 폰 실기기 확인(한글 IME·파일 UI) — 사용자 확인 필요.
- 오프라인(PWA 캐시)·공지(notices) — 원본 대비 미구현.
