v1.11.0: 부팅/렌더 정상화 + gzip 전송 최적화

## 수정 (PC·폰 공통 버그)
- **셸 패치 무한 뮤테이션 루프 제거**: `fit()` 이 `hintEl.className` 을 값이 같아도 재대입하고
  `MutationObserver` 가 그 변경을 다시 감시해 **렌더러 메인 스레드가 잠겼다**
  (`edopro-full.js` 는 100% 수신되지만 실행되지 않아 `.data`/`.wasm` 요청 0건 → 검은 화면).
  → className 은 값이 다를 때만, observer 는 `childList` 만 감시.
- **셸 패치 멱등화**: 이미 패치된 HTML 에 다시 실행하면 블록이 누적(JLOG 3중, 오버레이 2중, script 14쌍)
  되어 페이지가 멈췄다. → 패치 시작 시 이전 주입 블록을 정규식으로 제거.
- **부팅 완료 신호 오판**: 이 게임은 `main()` 이 끝나지 않아 `Module.calledRun` 이 항상 false.
  → 오버레이 숨김/부팅 판정을 **캔버스 실제 크기**로 변경.
- **덱/리플레이 복원 시점**: 부팅 후 → **`preRun`**(프리로드 완료 후, main 진입 전).
  부팅 후에 하면 게임이 이미 덱 목록을 읽은 뒤라 반영되지 않았고, 너무 이르면 ErrnoError 로 시작이 죽었다.
- **로딩 오버레이**: 진행률 표시 + 실패 사유 + [다시 시도]. `unhandledrejection` 은 경고로만 처리.

## 최적화
- **gzip 사전 압축 서빙**: 빌드 시 `.gz` 생성, `Accept-Encoding: gzip` + Range 없는 요청에만 전송.
  실측 `edopro-full.data` 99MB → **47MB**, `wasm` 30MB → 13MB (합계 131MB → 약 61MB).
  Range 요청은 원본 그대로 → 청크 로더/이어받기와 호환.
- **BGM(40MB) preload 제외**: `.data` 146MB → 100MB.
- **디버그 로그 게이트**: `[flow]`/`[step]` 는 `?debug=1` 에서만 서버로 전송.
- 진단 플래그 추가: `?jlogsync=1`(동기 로그), `?nofit`(화면맞춤 끔), `/api/jlog`.

## 검증
- PC: 메인 메뉴 **FPS 61**, **덱 편집기 카드 40+10장 + 카드 이미지** 렌더 확인.
- 폰(Galaxy S26, Whale): `Initialize` 전 구간 완료, `MainLoop` 진입까지 확인.
  첫 프레임 이후 렌더러 `SIGTRAP` 은 미해결(메모리·GPU·WebGL버전·브라우저 교차검증으로 배제).
