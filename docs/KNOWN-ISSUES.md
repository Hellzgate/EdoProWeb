# 남은 문제 / 다음 단계 (v1.0.0)

## 1. 카드 이미지가 화면에 표시되지 않음

**증상**: 덱 편집기·듀얼에서 카드가 모두 '뒷면(unknown)' 텍스처로 보임.

**확인된 사실**
- 서버 프록시 `/img/<code>.jpg` 는 정상: `200`, 약 140KB, `/app/piccache` 캐시 동작
- 브라우저 페이지 스코프에서는 `/img` → MEMFS `/pics/*.jpg` 쓰기가 **정상 동작**(수동 검증)
- 게임 코드에 넣은 `web_fetch_pic`(JS 헬퍼 호출)이 **호출되지 않음**
  → 즉 `ImageManager::GetTextureCard()` 가 해당 렌더 경로에서 불리지 않는다

**다음 후보**
1. 덱 편집기 그리드가 실제로는 `imageManager.tMap/tThumb` 를 직접 참조하는지 확인
2. `drawing.cpp:1191`(썸네일) 경로가 호출되는 조건 추적
3. 확실한 대안: **부팅 시 pics 선반입** — `/api/repos.tar` 에 `pics/` 를 포함시키고
   `preRun` 에서 MEMFS 에 풀면 `GetTextureCard` 가 파일을 즉시 찾는다.

## 2. 듀얼 시작(Host → Duel)이 진행되지 않음

**증상**: `Host` 설정 창에서 `OK` 를 누르면 게임이 **디바이스 재시작** 경로로 들어가고,
컨텍스트가 사라져 화면이 멈춘다(`destroyContext requested` 로그).

**이미 적용된 완화**
- `CSDL2ContextManager::destroyContext()` 무시 + 컨텍스트 공유
- `SDL_DestroyWindow`/`SDL_Quit` 생략
- `MainLoop` 에서 `DuelClient::PumpWeb()` 및 `emscripten_sleep`

**다음 후보**
1. `Game::MainLoop()` 이 `restart=true` 를 반환하는 지점 확인(설정 변경? 방 생성?)
2. 재시작 시 `Game::Initialize()` 가 **기존 컨텍스트를 재사용**하는지 확인
   (`generateContext` 의 static 공유가 실제로 도달하는지 로그 추가)
3. 재시작 경로를 wasm 에서 **비활성화**(방 생성 시 디바이스 재생성 없이 진행)

## 3. 저장소 tar 마운트 비활성

부팅 안정성을 위해 `preRun` tar 마운트를 제거했습니다(`/api/repos.tar` 자체는 유지).
저장소 cdb/스크립트를 게임에 실제로 적용하려면 위 1-3 의 선반입 방식과 함께 되살리는 것이 좋습니다.

## 4. 기타

- 오디오: `miniaudio` 로 동작(`Using: miniaudio for audio playback`). 볼륨/뮤트는 게임 설정 사용.
- WindBot: 브라우저에서 로컬 실행 불가 → **NAS 패널에서 봇 투입**(`/api/bot/start`) 사용.
- 사이드 덱 교환은 WindBot/EDOPro 구조상 미지원(기존 프로젝트와 동일한 제약).

## 검증 체크리스트(변경 시)

```bash
# 1) 빌드
~/edo-src/ocgwasm/build-gframe-audio.sh && ~/edo-src/ocgwasm/link-default.sh
# 2) 배포
cd ~/edopro-docker && docker build -t edopro-web:X.Y.Z . && docker rm -f edopro-web && docker run ...
# 3) 확인
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.0.53:7556/
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" http://192.168.0.53:7556/edopro-full.wasm
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" http://192.168.0.53:7556/img/89631139.jpg
# 4) 화면
#    브라우저 → 메뉴(한국어) → LAN + AI → Host/Join → 방 창
```
