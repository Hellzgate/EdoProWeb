# RELEASE v1.17.4 (2026-11-12)

## 핵심
- **한국어 내장**: 카드DB(9.4MB) + strings.conf(62KB) + NotoSansKR 폰트(16.4MB)
- **퍼즐 모드 복구**: ProjectIgnis/Puzzles 번들 매핑(267개), 퍼즐 목록/정보 정상
- **커스텀 카드**: DeltaBagooska cdb 14종 + EMP-TY 스크립트/픽
- **번들 gzip**: 39.98MB → 9.04MB (부팅 부담 1/4)
- **WS 화이트리스트**: 임의 호스트/포트 차단(403), 허용만 101
- **파일 버튼**: 게임 우상단 📁 → /files.html (덱·리플레이 업로드/다운로드)

## 검증
| 항목 | 결과 |
|---|---|
| 메뉴/탭 | 한국어 정상(??? 현상 해결) |
| 퍼즐 | 목록 267 + 메타(Complexity/Objective) 로드 |
| 덱 편집기 | 한국어 UI, 카드 40+10장 |
| 번들 | 28.5MB (gzip 9.04MB) / puzzles 267 / delta cdb 14 |
| WS | deny 403 / allow 101 |

## 알려진 제약
- 모바일 텍스트 입력(IME) 미지원, 서버 대전 방 목록(curl 스텁), BGM 미포함