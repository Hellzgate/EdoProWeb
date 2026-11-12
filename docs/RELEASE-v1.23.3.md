# RELEASE v1.23.3 (2026-11-13)

## OCG/TCG 라벨
- 30×15 스프라이트를 **선형 축소**해 글자가 뭉개져 `???` 처럼 보였음.
- **원본 비율(30×15) 유지** + `draw2DImage`(필터 없음) → `OCG` 선명 표시.

## 패 테스트(단일모드) — 원인 확정 및 차단
- 로그: `[fatal] uncaught: thread constructor failed: Not supported`
- `SingleMode` 가 `std::thread` 로 듀얼을 돌림 → emscripten(pthread 없음) 불가.
- 웹에서는 **버튼 숨김 + 핸들러 차단**(`HAND_TEST_WEB_UNSUPPORTED`) → 먹통 방지.
- 웹 구동 방법은 별도 연구(§18).

## BGM 내장
- 7곡 64k(win 32k) 모노 = **16MB** → `.data` **127.8MB**, `/sound/BGM/*` 확인.
- `enable_music = 1` 이면 재생(원본 설정은 0).

## 문서
- `docs/PWA.md` 신설, parity §17.
