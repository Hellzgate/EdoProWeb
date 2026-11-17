/**
 * ReplayCore — 패킷 배열(리플레이/덤프)을 상태기계로 재생한다.
 * 되감기를 위해 64패킷마다 상태 스냅샷을 보관한다(메모리 O(n/64)).
 */
import { applyPacket, createState, type DuelState } from '../engine/state.ts';
import type { ReplayPacket } from '../engine/yrpx.ts';
import type { CoreEventMap, ICore } from './ICore.ts';

const SNAPSHOT_EVERY = 64;

export class ReplayCore implements ICore {
  readonly mode = 'replay' as const;
  readonly length: number;

  private packets: ReplayPacket[];
  private state: DuelState;
  private pos = 0;
  private snaps: DuelState[] = [];
  private listeners: { [K in keyof CoreEventMap]?: Array<(v: CoreEventMap[K]) => void> } = {};

  constructor(packets: ReplayPacket[]) {
    this.packets = packets;
    this.length = packets.length;
    this.state = createState();
    this.snaps = [structuredClone(this.state)];
  }

  get cursor(): number {
    return this.pos;
  }

  on<K extends keyof CoreEventMap>(ev: K, cb: (v: CoreEventMap[K]) => void): () => void {
    const arr = (this.listeners[ev] ??= [] as never) as Array<(v: CoreEventMap[K]) => void>;
    arr.push(cb);
    return () => {
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  private emit<K extends keyof CoreEventMap>(ev: K, v: CoreEventMap[K]): void {
    const arr = this.listeners[ev];
    if (arr) for (const cb of arr) cb(v);
  }

  private snapshotAt(n: number): DuelState {
    const idx = Math.floor(n / SNAPSHOT_EVERY);
    if (this.snaps[idx]) return this.snaps[idx]!;
    // 아직 없으면 가장 가까운 이전 스냅샷부터 만들어 둔다
    for (let i = this.snaps.length; i <= idx; i++) {
      const st = structuredClone(this.snaps[i - 1]!);
      const from = (i - 1) * SNAPSHOT_EVERY;
      const to = Math.min(i * SNAPSHOT_EVERY, this.packets.length);
      for (let k = from; k < to; k++) applyPacket(st, this.packets[k]!);
      this.snaps[i] = st;
    }
    return this.snaps[idx]!;
  }

  seek(n: number): void {
    const target = Math.max(0, Math.min(n, this.packets.length));
    let start = Math.floor(target / SNAPSHOT_EVERY) * SNAPSHOT_EVERY;
    let st: DuelState;
    if (target < this.pos) {
      // 되감기: 스냅샷에서 복원
      st = structuredClone(this.snapshotAt(start));
    } else {
      start = this.pos;
      st = this.state;
    }
    for (let i = start; i < target; i++) applyPacket(st, this.packets[i]!);
    this.state = st;
    this.pos = target;
    this.emit('state', this.state);
    if (this.pos >= this.packets.length) {
      this.emit('end', { winner: this.state.winner, reason: this.state.winReason });
    }
  }

  step(): void {
    this.seek(this.pos + 1);
  }

  dispose(): void {
    this.listeners = {};
    this.snaps = [];
  }
}
