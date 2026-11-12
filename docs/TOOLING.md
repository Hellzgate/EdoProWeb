# EDOPro Web — 사용 도구 / MCP 정리

기준: **v1.20.1** (2026-11-13). 이 프로젝트를 굴리는 데 실제로 쓴 도구와 설정, 주의점.

---

## 1. 원격/빌드

| 도구 | 용도 | 접속/경로 | 비고 |
|---|---|---|---|
| **SSH/SCP** | 미니PC 빌드·배포 | `ssh mini` (BatchMode 키 인증) | 명령은 `ssh -o BatchMode=yes mini '...'` |
| **Docker** | 이미지 빌드/실행 | 미니PC `~/edopro-docker` | `docker build/run`, `docker cp`, `docker exec` |
| **emscripten (emsdk)** | wasm 빌드 | `~/emsdk` | `em++`, `-sUSE_SDL=2`, `-sASYNCIFY` |
| **빌드 스크립트** | 링크/재컴파일 | `~/edo-src/ocgwasm/` | `link-default.sh`, `rebuild-one.sh`, `rebuild_irr_one.sh`, `rebuild_game_opt.sh` |

### 자주 쓰는 명령
```bash
# 단일 gframe 파일 재컴파일 + 링크 + 이미지
ssh mini 'cd ~/edo-src/ocgwasm && bash rebuild-one.sh image_manager.cpp'
# 링크만 (셸 패치 반영)
ssh mini 'cd ~/edo-src/ocgwasm && bash link-default.sh'
# 배포
ssh mini 'cd ~/edopro-docker && docker build -q -t edopro-web:X.Y.Z . && docker rm -f edopro-web && docker run -d ... edopro-web:X.Y.Z'
```

---

## 2. 검증(브라우저)

| 도구 | 용도 | 설정 |
|---|---|---|
| **Playwright MCP (`pw`)** | **주 검증 도구** — 헤드리스 Chrome, 스크린샷, CDP 조작 | `--headless --isolated --browser chrome --viewport-size=1600,1000 --output-dir=D:\rea-out\_tmp\pw-mcp` |
| 데스크톱 브라우저 MCP (`browser`) | (초기) NAS 패널 확인 | **로컬 프록시(127.0.0.1:8099) 경유** → NAS/로컬 페이지에서 502 빈발 → 이 프로젝트에선 쓰지 않음 |

### Playwright 팁 (실측)
- **캐시 무효화**: `Network.setCacheDisabled` 를 CDP로 켜야 새 wasm을 받는다.
- **터치 재현**: `Input.dispatchTouchEvent` (touchStart/touchEnd) 로 모바일 탭 재현.
- **스크린샷 경로**: output-dir 안에만 저장 가능 → `D:\rea-out\_tmp\pw-mcp` 후 복사.
- 60초 부팅(첫 로드 75MB) → `waitForTimeout(50000~56000)` 필요.

---

## 3. 실기기(폰/DeX)

| 도구 | 용도 | 경로 |
|---|---|---|
| **adb** | 폰 제어·스크린샷·입력 | `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` |
| 대상 | 갤럭시 SM-S942N / Android 17 | `adb connect 192.168.0.50:5555` |
| 브라우저 | **네이버 웨일** | 패키지 `com.naver.whale` (Chrome은 이 폰에서 LAN 접속 불가) |

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb shell "am start -a android.intent.action.VIEW -d 'https://sw20103.synology.me:8451/' com.naver.whale"
& $adb shell input tap 1000 370          # 좌표 탭
& $adb shell input text "Hello"          # ASCII 입력(한글 불가)
& $adb shell input keyevent 4            # 뒤로(키보드 닫기)
& $adb exec-out screencap -p > shot.png
```
- ⚠ **DeX(외부 모니터) 화면은 adb 캡처가 안 된다** — 폰 화면만 캡처된다. DeX 검증은 사용자 확인 또는 PC 브라우저로 대체.
- ⚠ 앱 재시작은 `am force-stop` → `am start`.

---

## 4. 스크립트/보조

| 도구 | 용도 | 위치 |
|---|---|---|
| **Python 3** | 소스 패치·번들 점검·문서 변환 | `D:\rea-out\_tmp\patch_*.py` (임시) |
| **PowerShell** | 오케스트레이션·ZIP·해시 | `D:\rea-out\_tmp\*.ps1` |
| **curl** | 엔드포인트/ETag 304/번들 크기 측정 | 미니PC 또는 PC |
| **ffmpeg** | BGM 64kbps 모노 변환(대기) | `C:\ProgramData\chocolatey\bin\ffmpeg.exe` |
| **md-to-html.py** | 문서 사이트 생성 | `D:\rea-out\windbot-ai-editor\tools\md-to-html.py` |
| **git / gh** | 저장소·태그·릴리스 | `D:\rea-out\edopro-web` |
| **zip** | 백업 묶음 | 미니PC |

---

## 5. 진단 엔드포인트

| 경로 | 내용 |
|---|---|
| `/last.html` | 브라우저 로그 40건 |
| `/view.html` | 해상도/캔버스 계측 |
| `/repos.html` | 서버 저장소 목록/동기화 |
| `/files.html` | 덱·리플레이 업/다운로드 |
| `?diag=1` | 좌상단 진단 패널 |
| `?nofit=1`, `?sync=0`, `?norestore` | 레이아웃/저장/복원 끄기 |
| `?tag=...` | 캐시 구분용(디버그) |
| **`/api/beacon?b=..&ime=..`** | 클라이언트 빌드/기능 상태 보고(서버 로그) |

---

## 6. 정리/개선 제안

1. **`scripts/health.sh`** 신설(미구현) — 아래를 한 번에 확인
   ```
   page=200 / /api/repos / bundle?lang=Korean 크기 / wasm 304 / img 200·404(즉시)
   ```
2. **`scripts/deploy.sh`** — `docker build + rm + run` 표준화(현재 명령이 길어 실수 위험)
3. **`_tmp` 스크립트 승격** — 반복 사용한 `patch_*.py` 중 필요한 것만 `scripts/` 로 이동
4. **Playwright MCP 설정 문서화**(위 §2) — 새 세션에서 그대로 재현
5. **adb 헬퍼**(`_tools/adb.ps1`) — `tap/text/shot/reload` 단축
6. **DeX 검증 절차** — 폰 화면 캡처 불가 → PC 브라우저/사용자 확인으로 대체 명시
