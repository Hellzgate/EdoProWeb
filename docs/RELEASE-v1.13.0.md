v1.13.0: 회전(orientation) 시 화면이 작아지던 문제 해결 — dpr 정규화

## 증상
세로/가로 어느 쪽으로 **시작하면 정상**인데, 페이지를 연 뒤 **회전하면** 게임이 캔버스의
왼쪽 아래 약 38%(=1/dpr)만 차지했다.

## 원인 (실측)
| 계층 | 값 |
|---|---|
| SDL (irrlicht 로그) | `nativeScale win=446x279 drawable=446x279 ratio=1.000` → **dpr=1 로 인식** |
| Emscripten 셸 | 캔버스 버퍼 = CSS × devicePixelRatio = **1170x732** |
| irrlicht | `SDL_WINDOWEVENT_SIZE_CHANGED` 만 처리, `RESIZED` 는 무시 |

→ SDL/irrlicht 은 CSS px 크기(446x279)로 렌더하고, 셸은 버퍼를 2.625배 크게 잡아
**버퍼의 1/2.625 만 그려진다**. PC(dpr=1)에서는 두 해석이 같아 드러나지 않는다.

## 수정
1. **dpr 정규화** — `<head>` 직후에서 `window.devicePixelRatio` 를 1로 고정해
   SDL 과 셸이 같은 값을 보게 한다(핵심).
2. **2x CSS + transform** — 캔버스 CSS 크기를 표시 크기의 `SS=min(2,실제dpr)` 배로 잡고
   `transform: scale(1/SS)` 로 맞춘다. 실측상 SDL 이 버퍼를 절반(표시 크기)으로 다시 잡으므로
   실효 해상도는 표시 크기와 동일하다.
3. **irrlicht 패치** — `SDL_WINDOWEVENT_RESIZED` 를 `SIZE_CHANGED` 와 동일 처리(안전장치).
4. **진단 페이지 `/view.html`** — 게임 페이지가 `localStorage` 에
   `뷰포트/dpr/CSS/표시크기/버퍼` 이력을 남긴다(최근 12건).

## 검증
| 환경 | 세로 시작 | 가로 회전 | 세로 복귀 |
|---|---|---|---|
| PC (900x600 → 500x800 → 900x600) | ✅ | ✅ | ✅ |
| 안드로이드(갤럭시 S26 · 네이버 웨일) | ✅ | ✅ 전체 채움 · FPS 61 · 선명 | ✅ |

## 재발 주의 (이번에 밟은 함정)
- 페이지 JS 에서 `canvas.getContext(...)` 를 호출하면 SDL 보다 먼저 GL 컨텍스트를 잡아
  게임이 `EGL_BAD_MATCH` 로 죽는다(완전 검은 화면). 계측도 컨텍스트를 만지지 말 것.
- SDL 이 넣은 `canvas.style.width/height` 를 지우면 크기가 출렁여 렌더가 깨진다.
- 부팅 중 `window.dispatchEvent(new Event('resize'))` 는 초기화를 깨뜨린다(부팅 후에만).
