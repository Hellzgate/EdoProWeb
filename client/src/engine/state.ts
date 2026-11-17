/**
 * 결정적 듀얼 상태 — DESIGN-V2 P0.
 * 리플레이/온라인/관전이 같은 상태기계를 쓴다(입력만 다르다).
 *
 * 원칙: 모든 필드 읽기는 **경계 안전**하다(짧은/구버전 페이로드도 예외 없이 0 처리).
 */
import { MSG } from './msg.ts';
import type { ReplayPacket } from './yrpx.ts';

/** ocgapi_constants.h 의 LOCATION_* */
export const LOC = {
  DECK: 0x01,
  HAND: 0x02,
  MZONE: 0x04,
  SZONE: 0x08,
  GRAVE: 0x10,
  REMOVED: 0x20,
  EXTRA: 0x40,
  OVERLAY: 0x80,
  ONFIELD: 0x0c,
  FZONE: 0x100,
  PZONE: 0x200,
} as const;

export const PHASE_NAMES = [
  'DRAW',
  'STANDBY',
  'MAIN1',
  'BATTLE_START',
  'BATTLE_STEP',
  'DAMAGE',
  'DAMAGE_CALC',
  'BATTLE',
  'MAIN2',
  'END',
] as const;

export interface StackCard {
  code: number;
  ctrl: number;
}

export interface DuelState {
  started: boolean;
  lp: [number, number];
  deck: [number, number];
  extra: [number, number];
  hand: number[][];
  grave: number[][];
  banished: number[][];
  mzone: Array<Array<number | null>>;
  szone: Array<Array<number | null>>;
  turn: number;
  activePlayer: number;
  phase: number;
  chain: StackCard[];
  winner: number | null;
  winReason: number | null;
  eventCount: number;
  lastEvent: string;
}

const empty = (n: number) => new Array<number | null>(n).fill(null);

export function createState(): DuelState {
  return {
    started: false,
    lp: [8000, 8000],
    deck: [0, 0],
    extra: [0, 0],
    hand: [[], []],
    grave: [[], []],
    banished: [[], []],
    mzone: [empty(7), empty(7)],
    szone: [empty(6), empty(6)],
    turn: 0,
    activePlayer: 0,
    phase: 0,
    chain: [],
    winner: null,
    winReason: null,
    eventCount: 0,
    lastEvent: '',
  };
}

/* ---------- 경계 안전 리더 ---------- */
function readU8(d: Uint8Array, o: number): number {
  return o < d.length ? d[o]! : 0;
}
function readU16(d: Uint8Array, o: number): number {
  return o + 2 <= d.length ? d[o]! | (d[o + 1]! << 8) : 0;
}
function readU32(d: Uint8Array, o: number): number {
  return o + 4 <= d.length
    ? (d[o]! | (d[o + 1]! << 8) | (d[o + 2]! << 16) | (d[o + 3]! << 24)) >>> 0
    : 0;
}

function zoneOf(loc: number): 'deck' | 'extra' | 'hand' | 'grave' | 'banished' | 'mzone' | 'szone' | null {
  if (loc & LOC.DECK) return 'deck';
  if (loc & LOC.EXTRA) return 'extra';
  if (loc & LOC.HAND) return 'hand';
  if (loc & LOC.GRAVE) return 'grave';
  if (loc & LOC.REMOVED) return 'banished';
  if (loc & LOC.MZONE) return 'mzone';
  if (loc & LOC.SZONE) return 'szone';
  return null;
}

function removeFrom(s: DuelState, ctrl: number, loc: number, seq: number, code: number): void {
  const z = zoneOf(loc);
  if (!z || z === 'deck' || z === 'extra') return; // 덱/엑스트라는 장수로만 관리
  if (z === 'mzone' || z === 'szone') {
    const arr = s[z][ctrl];
    if (arr && seq < arr.length && arr[seq] === code) arr[seq] = null;
    return;
  }
  const arr = s[z][ctrl] as number[];
  const i = arr.lastIndexOf(code);
  if (i >= 0) arr.splice(i, 1);
}

function addTo(s: DuelState, ctrl: number, loc: number, seq: number, code: number): void {
  const z = zoneOf(loc);
  if (!z || z === 'deck' || z === 'extra') return; // 덱/엑스트라는 장수로만 관리
  if (z === 'mzone' || z === 'szone') {
    const arr = s[z][ctrl];
    if (arr && seq < arr.length) arr[seq] = code;
    return;
  }
  (s[z][ctrl] as number[]).push(code);
}

/** 패킷 1개를 상태에 반영한다. 모르는 메시지는 세기만 한다. */
export function applyPacket(s: DuelState, p: ReplayPacket): void {
  s.eventCount++;
  const d = p.data;
  switch (p.message) {
    case MSG.START: {
      // 실측(17B): u8 playernum | u32 lp0 | u32 lp1 | u16 deck0 | u16 extra0 | u16 deck1 | u16 extra1
      s.started = true;
      s.lp = [readU32(d, 1), readU32(d, 5)];
      s.deck = [readU16(d, 9), readU16(d, 13)];
      s.extra = [readU16(d, 11), readU16(d, 15)];
      s.lastEvent = 'START';
      break;
    }
    case MSG.NEW_TURN: {
      s.turn++;
      s.phase = 0;
      s.chain = [];
      s.activePlayer = readU16(d, 0) === 1 ? 1 : 0;
      s.lastEvent = 'TURN ' + s.turn + ' (P' + (s.activePlayer + 1) + ')';
      break;
    }
    case MSG.NEW_PHASE: {
      s.phase = readU16(d, 0);
      s.lastEvent = 'PHASE ' + (PHASE_NAMES[s.phase] ?? s.phase);
      break;
    }
    case MSG.DRAW: {
      const who = readU8(d, 0) & 1;
      const n = readU8(d, 1);
      for (let i = 0; i < n; i++) {
        const off = 2 + i * 8;
        if (off + 4 > d.length) break;
        const code = readU32(d, off);
        s.deck[who] = Math.max(0, s.deck[who] - 1);
        s.hand[who].push(code);
      }
      s.lastEvent = 'DRAW P' + (who + 1) + ' x' + n;
      break;
    }
    case MSG.MOVE:
    case MSG.SET: {
      // 실측 레이아웃(28B): u32 code · u8 fCtrl · u8 fLoc · u32 fSeq · u32 fPos ·
      //                     u8 tCtrl · u8 tLoc · u32 tSeq · u32 tPos · …
      const code = readU32(d, 0);
      const fCtrl = readU8(d, 4) & 1;
      const fLoc = readU8(d, 5);
      const fSeq = readU32(d, 6);
      const tCtrl = readU8(d, 14) & 1;
      const tLoc = readU8(d, 15);
      const tSeq = readU32(d, 16);
      removeFrom(s, fCtrl, fLoc, fSeq, code);
      addTo(s, tCtrl, tLoc, tSeq, code);
      if (fLoc & LOC.DECK) s.deck[fCtrl] = Math.max(0, s.deck[fCtrl] - 1);
      if (fLoc & LOC.EXTRA) s.extra[fCtrl] = Math.max(0, s.extra[fCtrl] - 1);
      if (tLoc & LOC.DECK) s.deck[tCtrl]++;
      if (tLoc & LOC.EXTRA) s.extra[tCtrl]++;
      s.lastEvent = (p.message === MSG.SET ? 'SET ' : 'MOVE ') + code;
      break;
    }
    case MSG.SUMMONING:
    case MSG.SPSUMMONING: {
      // 실측(14B): u32 code · u8 ctrl · u8 loc · u32 seq · u32 pos
      const code = readU32(d, 0);
      const ctrl = readU8(d, 4) & 1;
      const loc = readU8(d, 5);
      const seq = readU32(d, 6);
      if (loc & LOC.MZONE) {
        if (seq < s.mzone[ctrl].length) s.mzone[ctrl][seq] = code;
      } else if (loc & LOC.SZONE) {
        if (seq < s.szone[ctrl].length) s.szone[ctrl][seq] = code;
      }
      s.lastEvent = (p.message === MSG.SUMMONING ? 'SUMMON ' : 'SPSUMMON ') + code;
      break;
    }
    case MSG.LPUPDATE: {
      const who = readU8(d, 0) & 1;
      s.lp[who] = readU32(d, 1);
      s.lastEvent = 'LP P' + (who + 1) + ' = ' + s.lp[who];
      break;
    }
    case MSG.DAMAGE: {
      const who = readU8(d, 0) & 1;
      const v = readU32(d, 1);
      s.lp[who] = Math.max(0, s.lp[who] - v);
      s.lastEvent = 'DMG P' + (who + 1) + ' -' + v;
      break;
    }
    case MSG.RECOVER: {
      const who = readU8(d, 0) & 1;
      const v = readU32(d, 1);
      s.lp[who] += v;
      s.lastEvent = 'RECOVER P' + (who + 1) + ' +' + v;
      break;
    }
    case MSG.CHAINING: {
      // payload: u32 code, u8 controller, u8 location, u8 sequence, u8 position, u64 desc
      s.chain.push({ code: readU32(d, 0), ctrl: readU8(d, 4) & 1 });
      s.lastEvent = 'CHAIN ' + readU32(d, 0);
      break;
    }
    case MSG.CHAIN_SOLVING:
      s.lastEvent = 'CHAIN SOLVE ' + readU8(d, 0);
      break;
    case MSG.CHAIN_END:
      s.chain = [];
      s.lastEvent = 'CHAIN END';
      break;
    case MSG.WIN: {
      s.winner = readU8(d, 0) & 1;
      s.winReason = readU8(d, 1);
      s.lastEvent = 'WIN P' + (s.winner + 1) + ' reason=' + s.winReason;
      break;
    }
    default:
      break;
  }
}

export function applyAll(s: DuelState, packets: ReplayPacket[]): DuelState {
  for (const p of packets) applyPacket(s, p);
  return s;
}
