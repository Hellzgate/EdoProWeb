/**
 * ocgcore 선택 메시지 ↔ 응답 인코딩 (DESIGN-V2 P2).
 *
 * 모든 레이아웃은 ocgcore 소스에서 실측했다(추측 금지):
 *   playerop.cpp  : SELECT_IDLECMD/BATTLECMD/CARD/CHAIN/EFFECTYN/YESNO/OPTION/POSITION/
 *                   PLACE/DISFIELD/SORT_CARD/SORT_CHAIN/TRIBUTE/SUM/UNSELECT_CARD/COUNTER,
 *                   ANNOUNCE_RACE/ATTRIB/NUMBER/CARD
 *   duel.cpp      : loc_info 직렬화 = u8 controler · u8 location · u32 sequence · u32 position (10B)
 *   operations.cpp: CONFIRM_CARDS
 *   libduel.cpp   : CONFIRM_DECKTOP
 */
import { MSG } from '../engine/msg.ts';

export interface LocInfo {
  ctrl: number;
  loc: number;
  seq: number;
  pos: number;
}

export interface CardEntry extends LocInfo {
  code: number;
}

export interface EffectEntry extends CardEntry {
  desc: bigint;
  mode: number;
}

export interface TributeEntry extends CardEntry {
  release: number;
}

export interface SumEntry extends CardEntry {
  param: number;
}

export interface CounterEntry extends CardEntry {
  counters: number;
}

/* ---------------- 리더 ---------------- */
class R {
  private dv: DataView;
  private d: Uint8Array;
  private p = 0;
  constructor(d: Uint8Array) {
    this.d = d;
    this.dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  }
  get left(): number {
    return this.d.byteLength - this.p;
  }
  u8(): number {
    const v = this.p < this.d.byteLength ? this.dv.getUint8(this.p) : 0;
    this.p += 1;
    return v;
  }
  u16(): number {
    const v = this.p + 2 <= this.d.byteLength ? this.dv.getUint16(this.p, true) : 0;
    this.p += 2;
    return v;
  }
  i16(): number {
    const v = this.p + 2 <= this.d.byteLength ? this.dv.getInt16(this.p, true) : 0;
    this.p += 2;
    return v;
  }
  u32(): number {
    const v = this.p + 4 <= this.d.byteLength ? this.dv.getUint32(this.p, true) : 0;
    this.p += 4;
    return v;
  }
  i32(): number {
    const v = this.p + 4 <= this.d.byteLength ? this.dv.getInt32(this.p, true) : 0;
    this.p += 4;
    return v;
  }
  u64(): bigint {
    if (this.p + 8 > this.d.byteLength) {
      this.p += 8;
      return 0n;
    }
    const v = this.dv.getBigUint64(this.p, true);
    this.p += 8;
    return v;
  }
  loc(): LocInfo {
    return { ctrl: this.u8(), loc: this.u8(), seq: this.u32(), pos: this.u32() };
  }
  entries(n: number, seqSize: 1 | 4 = 4): CardEntry[] {
    const out: CardEntry[] = [];
    for (let i = 0; i < n && this.left > 0; i++) {
      const code = this.u32();
      const ctrl = this.u8();
      const loc = this.u8();
      const seq = seqSize === 1 ? this.u8() : this.u32();
      out.push({ code, ctrl, loc, seq, pos: 0 });
    }
    return out;
  }
}

/* ---------------- 프롬프트 ---------------- */
export type Prompt =
  | {
      kind: 'idle';
      player: number;
      summon: CardEntry[];
      spsummon: CardEntry[];
      poschange: CardEntry[];
      mset: CardEntry[];
      sset: CardEntry[];
      activate: EffectEntry[];
      toBp: boolean;
      toEp: boolean;
      canShuffle: boolean;
    }
  | { kind: 'battle'; player: number; activate: EffectEntry[]; attack: CardEntry[]; direct: boolean[]; toM2: boolean; toEp: boolean }
  | { kind: 'card'; player: number; cancelable: boolean; min: number; max: number; cards: CardEntry[] }
  | { kind: 'tribute'; player: number; cancelable: boolean; min: number; max: number; cards: TributeEntry[] }
  | {
      kind: 'sum';
      player: number;
      cancelable: boolean;
      acc: number;
      min: number;
      max: number;
      must: SumEntry[];
      cards: SumEntry[];
    }
  | {
      kind: 'unselect';
      player: number;
      finishable: boolean;
      cancelable: boolean;
      select: CardEntry[];
      unselect: CardEntry[];
    }
  | { kind: 'chain'; player: number; forced: boolean; speCount: number; chains: EffectEntry[] }
  | { kind: 'effectyn'; player: number; code: number; card: LocInfo; desc: bigint }
  | { kind: 'yesno'; player: number; desc: bigint }
  | { kind: 'option'; player: number; options: bigint[] }
  | { kind: 'number'; player: number; options: bigint[] }
  | { kind: 'cardcode'; player: number; options: bigint[] }
  | { kind: 'position'; player: number; code: number; positions: number }
  | { kind: 'place'; player: number; count: number; flag: number; disfield: boolean }
  | { kind: 'sort'; player: number; chain: boolean; cards: CardEntry[] }
  | { kind: 'counter'; player: number; counterType: number; count: number; cards: CounterEntry[] }
  | { kind: 'confirm'; player: number; cards: CardEntry[]; deckTop: boolean }
  | { kind: 'race'; player: number; count: number; available: bigint }
  | { kind: 'attrib'; player: number; count: number; available: number };

/** 메시지 → 프롬프트. 프롬프트가 아니면 null */
export function decodePrompt(type: number, data: Uint8Array): Prompt | null {
  const r = new R(data);
  switch (type) {
    case MSG.SELECT_IDLECMD:
      return {
        kind: 'idle',
        player: r.u8(),
        summon: r.entries(r.u32()),
        spsummon: r.entries(r.u32()),
        poschange: r.entries(r.u32(), 1),
        mset: r.entries(r.u32()),
        sset: r.entries(r.u32()),
        activate: readEffects(r, r.u32()),
        toBp: r.u8() === 1,
        toEp: r.u8() === 1,
        canShuffle: r.u8() === 1,
      };
    case MSG.SELECT_BATTLECMD: {
      const player = r.u8();
      const activate = readEffects(r, r.u32());
      const n = r.u32();
      const attack: CardEntry[] = [];
      const direct: boolean[] = [];
      for (let i = 0; i < n && r.left > 0; i++) {
        const code = r.u32();
        const ctrl = r.u8();
        const loc = r.u8();
        const seq = r.u8();
        const d = r.u8();
        attack.push({ code, ctrl, loc, seq, pos: 0 });
        direct.push(d === 1);
      }
      return { kind: 'battle', player, activate, attack, direct, toM2: r.u8() === 1, toEp: r.u8() === 1 };
    }
    case MSG.SELECT_CARD: {
      const player = r.u8();
      const cancelable = r.u8() === 1;
      const min = r.u32();
      const max = r.u32();
      const n = r.u32();
      const cards: CardEntry[] = [];
      for (let i = 0; i < n && r.left > 0; i++) cards.push({ code: r.u32(), ...r.loc() });
      return { kind: 'card', player, cancelable, min, max, cards };
    }
    case MSG.SELECT_TRIBUTE: {
      const player = r.u8();
      const cancelable = r.u8() === 1;
      const min = r.u32();
      const max = r.u32();
      const n = r.u32();
      const cards: TributeEntry[] = [];
      for (let i = 0; i < n && r.left > 0; i++) {
        const code = r.u32();
        const ctrl = r.u8();
        const loc = r.u8();
        const seq = r.u32();
        cards.push({ code, ctrl, loc, seq, pos: 0, release: r.u8() });
      }
      return { kind: 'tribute', player, cancelable, min, max, cards };
    }
    case MSG.SELECT_SUM: {
      const player = r.u8();
      const cancelable = r.u8() === 1;
      const acc = r.u32();
      const min = r.u32();
      const max = r.u32();
      const read = (n: number): SumEntry[] => {
        const out: SumEntry[] = [];
        for (let i = 0; i < n && r.left > 0; i++) out.push({ code: r.u32(), ...r.loc(), param: r.u32() });
        return out;
      };
      const must = read(r.u32());
      const cards = read(r.u32());
      return { kind: 'sum', player, cancelable, acc, min, max, must, cards };
    }
    case MSG.SELECT_UNSELECT_CARD: {
      const player = r.u8();
      const finishable = r.u8() === 1;
      const cancelable = r.u8() === 1;
      r.u32();
      r.u32();
      const read = (n: number): CardEntry[] => {
        const out: CardEntry[] = [];
        for (let i = 0; i < n && r.left > 0; i++) out.push({ code: r.u32(), ...r.loc() });
        return out;
      };
      const select = read(r.u32());
      const unselect = read(r.u32());
      return { kind: 'unselect', player, finishable, cancelable, select, unselect };
    }
    case MSG.SELECT_CHAIN: {
      const player = r.u8();
      const speCount = r.u8();
      const forced = r.u8() === 1;
      r.u32();
      r.u32();
      return { kind: 'chain', player, forced, speCount, chains: readEffects(r, r.u32()) };
    }
    case MSG.SELECT_EFFECTYN: {
      const player = r.u8();
      const code = r.u32();
      const loc = r.loc();
      return { kind: 'effectyn', player, code, card: loc, desc: r.u64() };
    }
    case MSG.SELECT_YESNO:
      return { kind: 'yesno', player: r.u8(), desc: r.u64() };
    case MSG.SELECT_OPTION:
    case MSG.ANNOUNCE_NUMBER:
    case MSG.ANNOUNCE_CARD: {
      const player = r.u8();
      const n = r.u8();
      const options: bigint[] = [];
      for (let i = 0; i < n && r.left > 0; i++) options.push(r.u64());
      const kind = type === MSG.SELECT_OPTION ? 'option' : type === MSG.ANNOUNCE_NUMBER ? 'number' : 'cardcode';
      return { kind, player, options } as Prompt;
    }
    case MSG.SELECT_POSITION:
      return { kind: 'position', player: r.u8(), code: r.u32(), positions: r.u8() };
    case MSG.SELECT_PLACE:
    case MSG.SELECT_DISFIELD:
      return { kind: 'place', player: r.u8(), count: r.u8(), flag: r.u32(), disfield: type === MSG.SELECT_DISFIELD };
    case MSG.SORT_CARD:
    case MSG.SORT_CHAIN: {
      const player = r.u8();
      const n = r.u32();
      const cards: CardEntry[] = [];
      for (let i = 0; i < n && r.left > 0; i++) cards.push({ code: r.u32(), ctrl: r.u8(), loc: r.u32(), seq: r.u32(), pos: 0 });
      return { kind: 'sort', player, chain: type === MSG.SORT_CHAIN, cards };
    }
    case MSG.SELECT_COUNTER: {
      const player = r.u8();
      const counterType = r.u16();
      const count = r.u16();
      const n = r.u32();
      const cards: CounterEntry[] = [];
      for (let i = 0; i < n && r.left > 0; i++) {
        const code = r.u32();
        const ctrl = r.u8();
        const loc = r.u8();
        const seq = r.u8();
        cards.push({ code, ctrl, loc, seq, pos: 0, counters: r.u16() });
      }
      return { kind: 'counter', player, counterType, count, cards };
    }
    case MSG.CONFIRM_DECKTOP:
    case MSG.CONFIRM_CARDS: {
      const player = r.u8();
      const n = r.u32();
      return { kind: 'confirm', player, cards: r.entries(n), deckTop: type === MSG.CONFIRM_DECKTOP };
    }
    case MSG.ANNOUNCE_RACE:
      return { kind: 'race', player: r.u8(), count: r.u8(), available: r.u64() };
    case MSG.ANNOUNCE_ATTRIB:
      return { kind: 'attrib', player: r.u8(), count: r.u8(), available: r.u32() };
    default:
      return null;
  }
}

function readEffects(r: R, n: number): EffectEntry[] {
  const out: EffectEntry[] = [];
  for (let i = 0; i < n; i++) {
    const code = r.u32();
    const ctrl = r.u8();
    const loc = r.u8();
    const seq = r.u32();
    const desc = r.u64();
    out.push({ code, ctrl, loc, seq, pos: 0, desc, mode: r.u8() });
  }
  return out;
}

/* ---------------- 응답 인코딩 ---------------- */
const i32 = (v: number): Uint8Array => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, v | 0, true);
  return b;
};
const u32 = (v: number): Uint8Array => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
};
const u64 = (v: bigint): Uint8Array => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt.asUintN(64, v), true);
  return b;
};
const i8 = (v: number): Uint8Array => Uint8Array.of(v & 0xff);

/** SELECT_IDLECMD 응답: (index<<16) | type  (0 summon·1 spsummon·2 poschange·3 mset·4 sset·5 activate·6 toBp·7 toEp·8 shuffle) */
export const encodeIdle = (type: number, index: number): Uint8Array => i32(((index & 0xffff) << 16) | (type & 0xffff));
/** SELECT_BATTLECMD 응답: (index<<16) | type (0 activate·1 attack·2 toM2·3 toEp) */
export const encodeBattle = (type: number, index: number): Uint8Array => i32(((index & 0xffff) << 16) | (type & 0xffff));

/** 카드 다중 선택: [i32 type=0][u32 count][u32 idx...] (type -1 = 취소) */
export function encodeCards(indices: number[], cancel = false): Uint8Array {
  if (cancel) return i32(-1);
  const out = new Uint8Array(8 + indices.length * 4);
  const dv = new DataView(out.buffer);
  dv.setInt32(0, 0, true);
  dv.setUint32(4, indices.length, true);
  indices.forEach((v, i) => dv.setUint32(8 + i * 4, v, true));
  return out;
}

/** SELECT_UNSELECT_CARD: [i32 0=선택/1=해제(-1=취소)][i32 idx] */
export const encodeUnselect = (kind: number, index: number): Uint8Array => {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setInt32(0, kind, true);
  dv.setInt32(4, index, true);
  return b;
};

/** SELECT_PLACE / DISFIELD: count × (u8 player, u8 loc, u8 seq) */
export function encodePlaces(places: Array<{ ctrl: number; loc: number; seq: number }>): Uint8Array {
  const out = new Uint8Array(places.length * 3);
  places.forEach((p, i) => {
    out[i * 3] = p.ctrl & 1;
    out[i * 3 + 1] = p.loc & 0xff;
    out[i * 3 + 2] = p.seq & 0xff;
  });
  return out;
}

/** SORT_CARD / SORT_CHAIN: count × i8 (순열), 취소 = [-1] */
export function encodeSort(order: number[] | null): Uint8Array {
  if (!order) return i8(-1);
  return Uint8Array.from(order.map((v) => v & 0xff));
}

/** SELECT_COUNTER: 카드 수 × i16 (각 카드에 배치할 코인 수) */
export function encodeCounters(counts: number[]): Uint8Array {
  const out = new Uint8Array(counts.length * 2);
  const dv = new DataView(out.buffer);
  counts.forEach((v, i) => dv.setInt16(i * 2, v, true));
  return out;
}

export const encodeAck = (): Uint8Array => u32(0);
export const encodeIndex = (i: number): Uint8Array => i32(i);
export const encodeYesNo = (yes: boolean): Uint8Array => i32(yes ? 1 : 0);
export const encodeRace = (bits: bigint): Uint8Array => u64(bits);
export const encodeAttrib = (bits: number): Uint8Array => u32(bits);
export const encodeCode = (code: number): Uint8Array => i32(code);
export const encodePosition = (pos: number): Uint8Array => i32(pos);

/* ---------------- 자동 선택 (상대/AI/테스트) ---------------- */
export interface AutoContext {
  /** 카드 코드 → 현재 공격력(카드DB/조회값) */
  atk: (code: number) => number;
  /** 상대 필드의 최고 공격력(앞면) */
  enemyAtk: number;
}

/**
 * 가능한 첫 수를 고른다. 완벽한 AI 가 아니라 **듀얼이 막히지 않게** 하는 정책.
 *  - 메인: 발동 → 일반소환 → 세트 → BP → EP
 *  - 배틀: 직접 공격이 가능하면 최고 공격력으로, 아니면 이길 수 있을 때만 공격
 */
export function autoChoice(p: Prompt, ctx?: AutoContext): Uint8Array {
  switch (p.kind) {
    case 'idle': {
      if (p.activate.length) return encodeIdle(5, 0);
      if (p.summon.length) {
        // 가장 강한 몬스터부터
        let best = 0;
        if (ctx) for (let i = 1; i < p.summon.length; i++) {
          if (ctx.atk(p.summon[i]!.code) > ctx.atk(p.summon[best]!.code)) best = i;
        }
        return encodeIdle(0, best);
      }
      if (p.spsummon.length) return encodeIdle(1, 0);
      if (p.mset.length) return encodeIdle(3, 0);
      if (p.sset.length) return encodeIdle(4, 0);
      if (p.poschange.length) return encodeIdle(2, 0);
      if (p.toBp) return encodeIdle(6, 0);
      return encodeIdle(7, 0);
    }
    case 'battle': {
      if (p.activate.length) return encodeBattle(0, 0);
      if (p.attack.length) {
        const directIdx = p.direct.findIndex(Boolean);
        if (directIdx >= 0) return encodeBattle(1, directIdx);
        if (ctx) {
          // 이길 수 있는(공격력이 더 높은) 몬스터로만 공격
          let best = -1;
          let bestAtk = -1;
          p.attack.forEach((c, i) => {
            const a = ctx.atk(c.code);
            if (a >= ctx.enemyAtk && a > bestAtk) {
              best = i;
              bestAtk = a;
            }
          });
          if (best >= 0) return encodeBattle(1, best);
        } else {
          return encodeBattle(1, 0);
        }
      }
      if (p.toM2) return encodeBattle(2, 0);
      return encodeBattle(3, 0);
    }
    case 'card':
      if (p.cards.length >= p.min) return encodeCards(range(Math.max(p.min, 1)));
      return encodeCards([], p.cancelable);
    case 'tribute': {
      // release 값이 큰 카드부터 최소 개수만
      const order = p.cards.map((c, i) => ({ i, r: c.release })).sort((a, b) => b.r - a.r);
      const want = Math.max(1, p.min);
      return encodeCards(order.slice(0, want).map((o) => o.i), p.cancelable && p.min === 0);
    }
    case 'sum':
      return encodeCards(range(p.min || 1), p.cancelable && p.min === 0);
    case 'unselect':
      if (p.select.length) return encodeUnselect(0, 0);
      if (p.unselect.length) return encodeUnselect(1, 0);
      return encodeUnselect(-1, 0);
    case 'chain':
      if (p.forced) return encodeIndex(0);
      return encodeIndex(-1);
    case 'effectyn':
      return encodeYesNo(true);
    case 'yesno':
      return encodeYesNo(true);
    case 'option':
    case 'number':
    case 'cardcode':
      return encodeIndex(0);
    case 'position':
      return encodePosition(p.positions & 0x1 ? 0x1 : p.positions & 0x2 ? 0x2 : p.positions & 0x4 ? 0x4 : 0x8);
    case 'place':
      return encodePlaces(p.disfield ? disfieldZones(p.flag, p.count, p.player) : freeZones(p.flag, p.count, p.player));
    case 'sort':
      return encodeSort(p.cards.map((_, i) => i));
    case 'counter': {
      const out = new Array<number>(p.cards.length).fill(0);
      let need = p.count;
      for (let i = 0; i < p.cards.length && need > 0; i++) {
        const take = Math.min(need, p.cards[i]!.counters);
        out[i] = take;
        need -= take;
      }
      return encodeCounters(out);
    }
    case 'confirm':
      return encodeAck();
    case 'race':
      return encodeRace(firstBitBig(p.available));
    case 'attrib':
      return encodeAttrib(firstBitNum(p.available));
  }
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/**
 * SELECT_PLACE flag → 선택 가능한 존.
 * 비트 배치(실측 playerop.cpp): 요청 플레이어 기준 —
 *   MZONE 1<<seq · SZONE 1<<(8+seq) · **상대 플레이어는 +16 시프트**.
 * flag 의 1 = 사용 불가(점유/금지).
 */
export function freeZones(flag: number, count: number, player = 0): Array<{ ctrl: number; loc: number; seq: number }> {
  const LOC_M = 0x04;
  const LOC_S = 0x08;
  const out: Array<{ ctrl: number; loc: number; seq: number }> = [];
  for (const ctrl of [player, 1 - player]) {
    const shift = ctrl === player ? 0 : 16;
    for (let seq = 0; seq < 7 && out.length < count; seq++) {
      const bit = (1 << (seq + shift)) >>> 0;
      if (!(flag & bit)) out.push({ ctrl, loc: LOC_M, seq });
    }
    for (let seq = 0; seq < 8 && out.length < count; seq++) {
      const bit = (1 << (8 + seq + shift)) >>> 0;
      if (!(flag & bit)) out.push({ ctrl, loc: LOC_S, seq });
    }
  }
  return out;
}

/** SELECT_DISFIELD flag → **비활성화 가능한** 존(비트 1 = 가능) */
export function disfieldZones(flag: number, count: number, player = 0): Array<{ ctrl: number; loc: number; seq: number }> {
  const LOC_M = 0x04;
  const LOC_S = 0x08;
  const out: Array<{ ctrl: number; loc: number; seq: number }> = [];
  for (const ctrl of [player, 1 - player]) {
    const shift = ctrl === player ? 0 : 16;
    for (let seq = 0; seq < 7 && out.length < count; seq++) {
      const bit = (1 << (seq + shift)) >>> 0;
      if (flag & bit) out.push({ ctrl, loc: LOC_M, seq });
    }
    for (let seq = 0; seq < 8 && out.length < count; seq++) {
      const bit = (1 << (8 + seq + shift)) >>> 0;
      if (flag & bit) out.push({ ctrl, loc: LOC_S, seq });
    }
  }
  return out;
}

/** flag 비트 = 사용 가능한 존(0 = 불가) → 첫 MZONE */
export function freeZonesFor(flag: number, count: number, want: 'm' | 's' | 'any'): Array<{ ctrl: number; loc: number; seq: number }> {
  const all = freeZones(flag, 32);
  const filtered = want === 'any' ? all : all.filter((z) => (want === 'm' ? z.loc === 0x04 : z.loc === 0x08));
  return filtered.slice(0, count);
}

function firstBitBig(v: bigint): bigint {
  for (let i = 0; i < 64; i++) if ((v >> BigInt(i)) & 1n) return 1n << BigInt(i);
  return 0n;
}
function firstBitNum(v: number): number {
  for (let i = 0; i < 32; i++) if ((v >>> i) & 1) return 1 << i;
  return 0;
}
