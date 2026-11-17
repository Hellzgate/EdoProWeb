/**
 * ICore — 대전·관전·리플레이·퍼즐이 공유하는 단일 계약 (DESIGN-V2 §2.3).
 *
 * 규칙: UI 는 절대 코어에서 블로킹하지 않는다. 코어는 **이벤트**로 말한다.
 * 구현: ReplayCore(지금) / LocalCore(Worker+ocgcore, P2) / RemoteCore(WS, P3)
 */
import type { DuelState } from '../engine/state.ts';

export type CoreMode = 'replay' | 'local' | 'online';

export interface CoreEventMap {
  /** 상태가 바뀌었다(렌더 트리거) */
  state: DuelState;
  /** 응답이 필요하다(선택/옵션/체인/위치) — P2+ */
  need: { kind: string; type: number; payload: Uint8Array };
  /** 코어 종료 */
  end: { winner: number | null; reason: number | null };
  /** 오류 */
  error: { message: string };
}

export interface ICore {
  readonly mode: CoreMode;
  /** 총 이벤트 수(리플레이: 패킷 수, 온라인: 수신 수) */
  readonly length: number;
  /** 현재 위치 */
  readonly cursor: number;

  on<K extends keyof CoreEventMap>(ev: K, cb: (v: CoreEventMap[K]) => void): () => void;
  /** n 번째 이벤트까지 진행(뒤로도 가능 — 스냅샷 사용) */
  seek(n: number): void;
  /** 다음 이벤트 1개 */
  step(): void;
  /** 응답 전달(P2+) */
  respond?(data: Uint8Array): void;
  dispose(): void;
}
