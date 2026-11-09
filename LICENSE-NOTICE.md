# 라이선스 고지

이 프로젝트는 다음 오픈소스/배포물을 사용합니다. **재배포·서비스 시 아래 고지를 확인**하세요.

## 1. EDOPro / 코어

- **Project Ignis: EDOPro** (edo9300/edopro) — **AGPL-3.0-or-later**
  <https://github.com/edo9300/edopro/blob/master/LICENSE>
- **ygopro-core** (edo9300/ygopro-core) — **AGPL-3.0-or-later** (EDOPro 에 서브모듈로 포함)
- **Irrlicht 1.9-custom** (edo9300/irrlicht1-8-4, branch `1.9-custom`) — zlib/libpng 계열 (Irrlicht 라이선스)

> ⚠ **AGPL**: 이 빌드를 **네트워크 서비스로 제공**하면, AGPL 에 따라
> **해당 소스(수정본 포함)를 사용자에게 제공**해야 합니다. 이 저장소의 `patches/` 가 그 수정본입니다.

## 2. 게임 데이터

- **카드 cdb/스크립트**: Project Ignis 배포물(`edopro-assets`) 및 커뮤니티 저장소에서 받아 사용합니다.
- **카드 이미지**: `images.ygoprodeck.com` (YGOPRODeck) 에서 프록시로 가져옵니다.
- **카드 이름/텍스트/일러스트는 Konami / 각 권리자의 저작물**입니다.
  공개 배포·상업적 이용 시 별도 허가가 필요합니다.

## 3. 한국어 패치

- UI 문자열/카드 cdb: **Team-AllYGOPro/edopro-korean** (해당 저장소의 라이선스를 따릅니다)

## 4. 폰트

- **Noto Sans KR / Noto Sans CJK** — SIL Open Font License 1.1

## 5. 기타 라이브러리

| 라이브러리 | 라이선스 |
|---|---|
| SDL2 (Emscripten 포트) | zlib |
| FreeType / libpng / libjpeg / bzip2 / zlib | 각 라이선스 |
| SQLite3 | Public Domain |
| Lua | MIT |
| nlohmann/json | MIT |
| fmt | MIT |
| miniaudio | MIT-0 / Public Domain |
| Python 3 (컨테이너) | PSF |
| Alpine Linux, git | 각 라이선스 |

## 6. 이 프로젝트 자체

`docker/server.py`, `scripts/`, `deps/libevent-lite`, `deps/curl-stub`, `docs/` 는
**AGPL-3.0-or-later** 로 배포합니다(EDOPro 파생 작업과 일관).
