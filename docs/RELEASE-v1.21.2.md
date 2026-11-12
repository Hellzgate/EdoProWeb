# RELEASE v1.21.2 (2026-11-13)

## 프리릴리즈 카드 이미지
- 원본 EDOPro 는 카드 **데이터**를 \BabelCDB/prerelease-*.cdb\ 에서, **이미지**는 ygoprodeck(기본 urls)에서 받는다.
  프릴 카드는 ygoprodeck 에 없어 **원본도 이미지가 없다**.
- 사용자의 \D:\edopro\pics\ 에서 (프릴 cdb id ∪ 9자리 커스텀 id) **6,081장 / 254MB** 를 서버
  \~/edopro-pics-local\ 로 올리고 \/app/localpics:ro\ 로 마운트.
- 서버는 **캐시 → 로컬 오버레이 → 원격** 순서로 서빙(실측 \101402001.jpg → 200\).

## 드롭다운 행 오프셋 수정
- 팝업 높이는 skin 폰트 기준, 리스트는 실제 ItemHeight 기준 → 스크롤 오프셋만큼 **클릭 행이 밀렸다**.
- \CGUIComboBox::openCloseMenu\ 에서 \setItemHeight(itemH)\ 로 동일 값 강제 → **1행 = 1번째 항목** 확인.

## 패 테스트(단일모드)
- \SingleMode::StartPlay\ → \RuntimeError: function signature mismatch\.
- **v1.19.4 에서도 동일** = 기존 wasm ABI 문제(회귀 아님). \EMULATE_FUNCTION_POINTER_CASTS\ 는 다른 오류를 유발해 되돌림.
- 다음 단계: \-g\ 심볼 빌드로 스택 심볼화.

## tooling
- \scripts/health.sh\(**12/12 OK**), \scripts/deploy.sh\, \_tools/adb.ps1\ 추가. \docs/TOOLING.md\ §6/§7 갱신.