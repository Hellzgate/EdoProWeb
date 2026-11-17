# EDOPro Web — 새 클라이언트 (DESIGN-V2)

[`docs/DESIGN-V2.md`](../docs/DESIGN-V2.md) 의 **P0**(리플레이 파이프라인) 구현입니다.
서버·WASM·렌더러 없이 **프로토콜/상태 정확도**를 먼저 증명하는 단계입니다.

## 지금 되는 것

| 기능 | 상태 |
|---|---|
| `.yrpX` 파서 (헤더 32/72B · UTF-16LE 이름 · LZMA1 압축 해제) | ✅ |
| MSG 95종 상수 테이블 (`ocgapi_constants.h` 자동 생성) | ✅ |
| 결정적 상태기계 (LP · 덱/엑스트라/패/묘지/제외 · 몬스터/마함 존 · 턴/페이즈 · 체인 · 승자) | ✅ |
| 배치 검증 CLI — 687개 리플레이 전량 파싱, **잔여 바이트 0** | ✅ |
| 브라우저 뷰어 (파일 선택 · 타임라인 · 2D 보드 미리보기) | ✅ |
| 골든 테스트 (Vitest, 실제 리플레이) | ✅ |

## 실행

```bash
npm install

# 1) 전량 검증 (합격선: trailing 0, 실패 0)
npm run scan                       # 기본 D:/edopro/replay
npm run scan -- "D:/경로" --limit 100 --verbose

# 2) 브라우저 뷰어
npm run export -- "<리플레이.yrpX>" out.json    # 패킷 덤프(브라우저 LZMA 불필요)
npm run dev                        # http://localhost:5173 → out.json 열기

# 3) 테스트 / 타입
npm test
npm run typecheck
```

## 구조

```
src/engine/msg.ts        MSG_* 95개 (tools/gen-msg.ts 로 생성)
src/engine/yrpx.ts       .yrpX 리더 — LZMA 해제기는 주입식
src/engine/lzma-node.ts  Node 전용 LZMA 어댑터(브라우저 번들 제외)
src/engine/state.ts      결정적 상태기계 (리플레이·관전·대전 공용)
src/main.ts              P0 뷰어 (2D 캔버스)
tools/scan.ts            배치 검증
tools/export.ts          리플레이 → 뷰어용 JSON
```

## 실측 (2026-11-17, `D:\edopro\replay`)

- 파일 **687개** 중 **686 성공 / 0 실패 / 1 건너뜀**(`_LastReplay.yrp` = 구형식 yrp1)
- 패킷 **1,083,139** · 턴 **1,912** · **모든 파일 잔여 0바이트**
- 브라우저 번들 **10.6KB**(gzip 5.1KB) — 뷰어 기준

## 설계 결정 (감사에서 배운 것)

| 결정 | 이유 |
|---|---|
| **LZMA 를 브라우저에 넣지 않는다** | `lzma` 패키지는 번들에서 `__dirname`, `lzma-purejs` 는 AMD `define.apply` 로 죽는다(둘 다 실측). → Node/서버에서 해제하고 클라는 패킷 스트림만 받는다(제품에서는 `/api/replay`) |
| **상태기계는 경계 안전** | 짧은/구버전 페이로드에서 예외 없이 0 처리 |
| **페이로드 레이아웃은 C# 구현과 대조해 확정** | MOVE 28B: `code(4) ctrl(1) loc(1) seq(4) pos(4) ctrl(1) loc(1) seq(4) pos(4) …` · SUMMONING 14B · START 17B 는 **deck0/extra0/deck1/extra1** 순서 |

## 다음 (P1)

1. **WebGL2 2.5D 렌더러** (현 2D 캔버스 대체)
2. **Core Worker + `ICore`** — `ReplayCore` → `LocalCore`(ocgcore WASM) → `RemoteCore`(WS)
3. 브라우저 LZMA 대신 **서버 `/api/replay`** (또는 사전 .json)
4. 리플레이 **되감기/스텝**(스냅샷 링버퍼)
5. 골든 대조: 현 C++ 포팅 빌드와 프레임 단위 비교
