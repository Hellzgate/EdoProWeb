/**
 * LocalCore — 브라우저 안에서 ocgcore(WASM)로 실제 듀얼을 돌린다 (DESIGN-V2 P2).
 *
 * 책임:
 *  - 덱 배치 → 시스템 스크립트 선행 로드 → start → process 루프
 *  - 메시지 배치를 `applyPacket`(P0 상태기계)에 그대로 넣는다 → ReplayCore 와 **같은 상태**
 *  - 응답이 필요한 메시지는 `need` 이벤트로 UI 에 넘긴다
 */
import { MSG_NAME } from '../engine/msg.ts';
import { applyPacket, createState, type DuelState } from '../engine/state.ts';
import type { CoreEventMap, ICore } from './ICore.ts';
import { OCG_STATUS, OcgDuel, type CardSource, type ScriptSource } from './ocgcore.ts';

/** ocgcore 가 요구하는 시스템 스크립트 (호스트가 선행 로드) */
export const SYSTEM_SCRIPTS = [
  'constant.lua',
  'utility.lua',
  'archetype_setcode_constants.lua',
  'card_counter_constants.lua',
  'cards_specific_functions.lua',
  'deprecated_functions.lua',
  'chain.lua',
  'proc_fusion_spell.lua',
  'proc_fusion.lua',
  'proc_link.lua',
  'proc_maximum.lua',
  'proc_normal.lua',
  'proc_pendulum.lua',
  'proc_ritual.lua',
  'proc_rush.lua',
  'proc_skill.lua',
  'proc_synchro.lua',
  'proc_union.lua',
  'proc_unofficial.lua',
  'proc_workaround.lua',
  'proc_xyz.lua',
] as const;

/** 응답이 필요한 메시지 (SELECT_* / SORT_* / CONFIRM_* / ANNOUNCE_*) */
const NEED_TYPES = new Set([
  10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26,
  30, 31, 42, 140, 141, 142, 143, 144, 145, 146, 147, 148,
]);

const LOC = { DECK: 0x01, EXTRA: 0x40 } as const;
const POS_FACEDOWN = 0x8;

export interface LocalDeck {
  main: number[];
  extra?: number[];
}

export interface LocalDuelOptions {
  decks: [LocalDeck, LocalDeck];
  cards: CardSource;
  scripts: ScriptSource;
  seed?: [number, number];
  lp?: number;
  hand?: number;
  onLog?: (message: string, type: number) => void;
  moduleUrl?: string;
}

export class LocalCore implements ICore {
  readonly mode = 'local' as const;

  private duel: OcgDuel;
  private state: DuelState = createState();
  private applied = 0;
  private listeners: { [K in keyof CoreEventMap]?: Array<(v: CoreEventMap[K]) => void> } = {};
  private pending: { type: number; data: Uint8Array } | null = null;
  private ended = false;
  /** 진단: MSG_RETRY 횟수(응답 형식이 틀렸다는 신호) */
  retries = 0;
  /** 진단: 마지막 배치의 메시지 타입/상태 */
  lastBatch: number[] = [];
  lastStatus = -1;
  /** 시스템 스크립트 로드 결과(진단용) */
  readonly scriptReport = { loaded: 0, missing: [] as string[] };

  private constructor(duel: OcgDuel) {
    this.duel = duel;
  }

  static async create(opts: LocalDuelOptions): Promise<LocalCore> {
    const duel = await OcgDuel.create({
      cards: opts.cards,
      scripts: opts.scripts,
      seed: opts.seed,
      lp: opts.lp,
      hand: opts.hand,
      onLog: opts.onLog,
      moduleUrl: opts.moduleUrl,
    });
    const core = new LocalCore(duel);
    // ocgcore 는 MSG_START(덱 장수)를 보내지 않는다(호스트가 알려주는 값) → 직접 채운다
    core.state.deck = [opts.decks[0].main.length, opts.decks[1].main.length];
    core.state.extra = [(opts.decks[0].extra ?? []).length, (opts.decks[1].extra ?? []).length];

    for (const name of SYSTEM_SCRIPTS) {
      if (duel.preloadScript(name)) core.scriptReport.loaded++;
      else core.scriptReport.missing.push(name);
    }

    for (let team = 0; team < 2; team++) {
      const deck = opts.decks[team];
      // duelist=0 은 일반 듀얼(팀당 1명) — 0 이 아니면 태그용 extra_lists 로 들어가 덱이 빈다
      deck.main.forEach((code, seq) => duel.addCard(team, 0, code, team, LOC.DECK, seq, POS_FACEDOWN));
      (deck.extra ?? []).forEach((code, seq) => duel.addCard(team, 0, code, team, LOC.EXTRA, seq, POS_FACEDOWN));
    }

    duel.start();
    core.pump();
    return core;
  }

  get length(): number {
    return this.applied;
  }

  get cursor(): number {
    return this.applied;
  }

  /** 현재 듀얼 상태(읽기 전용 사본) */
  get snapshot(): DuelState {
    return this.state;
  }

  /** 응답 대기 메시지(없으면 null) */
  get pendingRequest(): { kind: string; type: number; payload: Uint8Array } | null {
    if (!this.pending) return null;
    return {
      kind: MSG_NAME[this.pending.type] ?? String(this.pending.type),
      type: this.pending.type,
      payload: this.pending.data,
    };
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

  /** 응답 전달 → 즉시 다음 단계로 */
  respond(data: Uint8Array): void {
    if (this.ended) return;
    this.pending = null;
    this.duel.respond(data);
    this.pump();
  }

  /** 엔진 루프: END/AWAITING 까지 process */
  private pump(): void {
    for (let guard = 0; guard < 200; guard++) {
      const { status, packets } = this.duel.step();
      this.lastStatus = status;
      this.lastBatch = packets.map((p) => p.type);
      for (const p of packets) {
        applyPacket(this.state, { message: p.type, data: p.data });
        this.applied++;
        if (p.type === 1) this.retries++;
        if (NEED_TYPES.has(p.type)) this.pending = { type: p.type, data: p.data };
        if (p.type === 5) {
          this.ended = true;
          this.emit('state', this.state);
          this.emit('end', { winner: this.state.winner, reason: this.state.winReason });
          return;
        }
      }
      if (packets.length) this.emit('state', this.state);

      if (status === OCG_STATUS.END) {
        if (!this.ended) {
          this.ended = true;
          this.emit('end', { winner: this.state.winner, reason: this.state.winReason });
        }
        return;
      }
      if (status === OCG_STATUS.AWAITING) {
        if (this.pending) {
          this.emit('need', {
            kind: MSG_NAME[this.pending.type] ?? String(this.pending.type),
            type: this.pending.type,
            payload: this.pending.data,
          });
          return;
        }
        // RETRY 등: 코어가 같은 요청을 다시 보낸다 → 계속 진행
        continue;
      }
      // CONTINUE: 계속
    }
  }

  /** 라이브 듀얼은 되감기 없음 — 인터페이스만 만족 */
  seek(): void {
    /* no-op */
  }

  step(): void {
    this.pump();
  }

  dispose(): void {
    this.listeners = {};
    this.pending = null;
    this.duel.destroy();
  }
}
