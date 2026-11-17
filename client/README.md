# EDOPro Web — 새 클라이언트 (DESIGN-V2)

[`docs/DESIGN-V2.md`](../docs/DESIGN-V2.md) 구현. **P0·P1 완료**, P2~P5 진행 중.

## 단계 현황

| 단계 | 내용 | 상태 |
|---|---|---|
| **P0** | `.yrpX` 파서 · MSG 95종 · 결정적 상태기계 · 전량 검증 · 골든 테스트 | ✅ **완료** |
| **P1** | `ICore` 계약 · `ReplayCore`(스냅샷/되감기) · **WebGL2 2.5D 보드** · 2D 텍스트 오버레이 · PWA 셸 | ✅ **완료** |
| P2 | `LocalCore` — ocgcore WASM(Worker) → 퍼즐/핸드테스트 | ⏳ 골격만(`ICore` 준수) |
| P3 | `RemoteCore` — WS(멀티롤 Gateway) → 방/대전/관전 | ⏳ 골격만 |
| P4 | 덱 편집기(25k 가상 리스트) + **사이드 모드** | ⏳ cdb 파이프라인 필요 |
| P5 | 모바일 PWA(manifest·SW·반응형) · Tauri · 게임패드 | 🟡 **PWA 셸 완료** / 나머지 ⏳ |

## 실행

```bash
npm install

# 전량 검증 (합격선: 잔여 0B, 실패 0)
npm run scan                 # 기본 D:/edopro/replay

# 브라우저 뷰어
npm run export -- "<리플레이.yrpX>" out.json   # 브라우저 LZMA 불필요
npm run dev                  # http://localhost:5173 → out.json 열기

npm test && npm run typecheck && npm run build
```

## 구조

```
src/core/ICore.ts        대전·관전·리플레이 공용 계약(이벤트 기반, 논블로킹)
src/core/ReplayCore.ts   64패킷마다 스냅샷 → 되감기 O(1)~O(64)
src/engine/msg.ts        MSG_* 95개 (tools/gen-msg.ts 자동 생성)
src/engine/yrpx.ts       .yrpX 리더 (LZMA 해제기 주입식)
src/engine/lzma-node.ts  Node 전용 LZMA (브라우저 번들 제외)
src/engine/state.ts      결정적 상태기계
src/render/BoardRenderer.ts  WebGL2 · 2.5D 쿼드(원근 근사)
src/main.ts              뷰어 (재생·정지·스텝·되감기·속도)
public/manifest.webmanifest · sw.js · icon.svg
tools/scan.ts · tools/export.ts · tools/gen-msg.ts
```

## 실측 (2026-11-17)

| 항목 | 값 |
|---|---|
| 리플레이 | **686/687 성공** · 실패 0 · 건너뜀 1(구형식 `.yrp`) · **잔여 0B** |
| 패킷/턴 | **1,083,139** / **1,912** |
| 처리 속도 | **5,894ms 전체 (평균 8.6ms/파일)** |
| 브라우저 번들 | **15.8KB** (gzip 7.1KB) |
| 브라우저 검증 | WebGL2 ✅ · 로드 ✅ · 끝/되감기/스텝 ✅ · 콘솔 오류 0 |

## 설계 결정 (감사에서 배운 것)

| 결정 | 이유 |
|---|---|
| **LZMA 를 브라우저에 넣지 않는다** | `lzma` 는 번들에서 `__dirname`, `lzma-purejs` 는 AMD `define.apply` 로 죽는다(실측). Node/서버에서 해제하고 클라는 패킷만 받는다 |
| **코어는 UI와 다른 실행 컨텍스트** | P2에서 `LocalCore`를 Worker로 → 스레드/SAB/COOP·COEP 불필요 |
| **페이로드 레이아웃은 C# 구현과 대조 확정** | MOVE 28B · SUMMONING 14B · START 17B(`deck0·extra0·deck1·extra1`) |
| **텍스트는 2D 오버레이** | WebGL 안에 CJK 폰트 아틀라스를 넣는 비용/복잡도 회피(추후 SDF로 교체) |

## P2~P4 착수에 필요한 것 (블로커)

1. **ocgcore WASM 빌드 산출물** — 미니PC `~/edo-src` 의 `core+lua` 오브젝트를 이 리포에 넣거나 CI로 빌드(`build-web-pthread.sh` 참고, 단 pthread 불필요)
2. **cdb → 카드 인덱스(샤드)** — 덱 편집기(P4)용. `cards.cdb` 읽기 스크립트 필요
3. **Gateway 규격 확정** — 멀티롤 7914 프론트의 `JOIN/CREATE` 레이아웃(기존 포팅 `docker/server.py` 참조)
