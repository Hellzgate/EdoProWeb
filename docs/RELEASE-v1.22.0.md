# RELEASE v1.22.0 (2026-11-13)

## 변경
- **영어 선택 시 UI 문자열(config/strings.conf)도 영어로** 넣도록 서버 번들에 분기 추가
  (/app/lang/english/strings.conf, 54,288B).
- 실측: 번들 lang=English → config/strings.conf 포함 / lang=Korean → zzz-korean-cards.cdb 포함.

## 한계 (실측)
- 영어 번들에서 MEMFS 의 /config/strings.conf 는 영어(0 Hangul)인데 **게임 UI 는 한국어로 표시**됐다.
  → 게임이 부팅 초기에 문자열을 먼저 읽는 것으로 보임. 카드DB 전환은 정상.
- 다음: .data 언어별 빌드 또는 LoadStrings 직전 재기록 훅.

## 검증
- scripts/health.sh **12/12 OK** (page/repos/ko>en/wasm 304/img local·remote·404/진단 5종)
- 프릴 이미지: /img/101402001.jpg **200** (로컬 오버레이), 커스텀 404 즉시
- 드롭다운: 첫 행 = 첫 항목