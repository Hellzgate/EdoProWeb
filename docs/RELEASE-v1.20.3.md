# RELEASE v1.20.3 (2026-11-13)

## 카드 한글화(한패) — 언어 설정으로 cdb 선택
- 기본(.data) = **영어 정식 cdb**, 언어팩 = **한국어 cdb**(이미지 lang/korean/cards.cdb).
- 셸이 system.conf 의 language 를 읽어 /api/repos/bundle?lang= 로 전달 → 한국어면
  expansions/zzz-korean-cards.cdb 를 **마지막에** 넣어 카드명/효과를 덮어쓴다.
- 게임에서 언어를 바꾸면 저장 시 localStorage 에 기록되어 **다음 새로고침**에 적용.
- 실측: 푸른 눈의 백룡, 빛/드래곤족 ★8 / 번들 37.9MB(ko) vs 28.6MB(en).

## 이미지 404 폭주 (프리릴리즈/대량 목록)
- 서버: **404 캐시 24h** + **9자리 커스텀 ID 원격 조회 생략**(즉시 404).
- 클라이언트: **실패 세션 메모**(__picFail) + C++ 60초 백오프 + **프레임당 2장** 예산.
- 실측: 9자리 100장 **577ms**, 금제 적용 후 **FPS 60**.

## 덱 / 도구
- D:\edopro\deck\*.ydk 8개 → /app/userdata/deck/ (총 13개, 50 Time Wizard 로드 확인).
- docs/TOOLING.md 신설 — SSH/Docker/emsdk/Playwright MCP/adb/ffmpeg/진단 엔드포인트.

## 알려진 문제
- **콤보 드롭다운 행 오프셋**: 클릭한 행과 1~2행 다른 항목이 선택됨(모든 콤보).
  원인 후보 = 리스트 아이템 높이/스크롤 오프셋 불일치 → docs/BACKLOG.md P0-3 에 조사 메모.