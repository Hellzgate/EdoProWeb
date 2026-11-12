# RELEASE v1.19.0 (2026-11-12)

## 핵심 — "원본과 이질감 없애기"
- **config 자동 반영**: config/configs.json + user_configs.json 의 repos/urls 를 읽어 REPOS(env)와 합집합.
  언어팩(is_language)은 .data 내장이라 건너뛴다.
- **게임 내 저장소 탭 복구**: web_stubs.cpp 의 RepoManager 가 /api/repos 목록을 반환
  → 덱 편집 → 저장소 탭에 **리포 5개 / 진행률 100% / 변경 로그**.
- **필드·커버 이미지 urls 지원**: config 의 커스텀 템플릿을 field/cover 에 우선 적용.
- **사운드 복구**: 원인은 std::thread — emscripten 빌드에 pthread 가 없어 백엔드 생성이 실패했다.
  → 웹은 **메인 스레드 백엔드** + **Web Audio 백엔드 명시**. 첫 제스처에서 AudioContext.resume().
- **모바일 IME**: SDL2-emscripten 에 IME 가 없어 **HTML 입력 브리지**(irrlicht → JS → keypress → SDL_TEXTINPUT).
  폰에서 키보드가 뜨고 입력이 게임 편집박스로 들어간다.
- **ETag/304**: 정적 파일에 검증자가 없어 매 방문 65MB 재다운로드 → 재방문 **0B**.

## 검증 (실측)
| 항목 | 결과 |
|---|---|
| / | 200 |
| /api/repos | 5개 |
| 저장소 탭 | Puzzles/LFLists/DeltaBagooska/BabelCDB/EMP-TY, 100%, 변경 로그 |
| bundle | 5,254 파일 28.6MB (gzip 9.0MB) |
| WS 화이트리스트 | deny 403 / allow 101 |
| 사운드 | ma_context_init=0, ma_engine_init=0, 첫 탭 후 unning |
| 모바일 IME | 키보드 표시 + PlayerHello 입력 |
| 재방문 | 304 / 0B |

## 함정 (문서 §12)
- import 시점 실행부에서 log() 호출 금지 → print(flush=True) (page=000 사고)
- ody>*{display:none!important} 가 입력 필드까지 숨김 → setProperty('display','block','important')
- BRIDGE_ALLOW_ANY=0 은 고정 타깃이라 화이트리스트가 무력화된다(반드시 =1 + HOSTS/PORTS)
- 번들이 config/strings.conf 를 덮으면 UI 전체가 ??? → 번들에서 제외(내장 한국어 유지)

## 알려진 제약
- BGM: 원본 설정도 OFF(enable_music=0). 켜면 파일이 없어 무음(64kbps 모노 16MB 내장 가능)
- 모바일 브라우저 주소창: PWA(홈 화면에 추가)로 전체화면 권장
- 실제 봇 대전 1판 미검증(서버 대전 화면·프록시는 확인)