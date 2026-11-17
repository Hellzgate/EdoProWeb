/**
 * 필드 좌표 — **원본 EDOPro 와 동일**.
 *
 * 근거: gframe/materials.cpp (SetS3DVertex) — 필드 월드 좌표계 x∈[-1,9], y∈[-4,4] (10×8).
 *   몬스터 존 : x = 1.2 + i*1.1 … 2.3 + i*1.1, y = 0.8 … 2.0
 *   마함 존   : 같은 x,                         y = 2.0 … 3.2
 *   EMZ       : x 2.3…3.4 / 4.5…5.6,            y = -0.6 … 0.6
 *   필드마법  : x 0.2…1.0,                       y = 0.1 … 1.3
 *   엑스트라  : x 0.2…1.0,                       y = 2.7 … 3.9
 *   덱        : x 6.9…7.7,                       y = 2.7 … 3.9
 *   묘지      : x 6.9…7.7,                       y = 0.1 … 1.3
 *   제외      : x 7.9…8.7,                       y = 0.1 … 1.3
 *
 * 플레이어 1(상대)은 **y 만 반전**(180° 회전하면 덱/엑덱이 반대로 가므로 EDOPro 와 같이 y 반전).
 */
import type { Quad } from './BoardRenderer.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldLayout {
  /** field.png 를 그릴 사각형 */
  field: Rect;
  cardW: number;
  cardH: number;
  zones: Record<string, Rect>;
  piles: Record<string, Rect>;
  hand: { p0: Rect; p1: Rect };
  quads: Quad[];
}

/* EDOPro 월드 좌표(플레이어 0 기준) */
type Box = [number, number, number, number]; // x1, y1, x2, y2
const WORLD = { x0: -1, x1: 9, y0: -4, y1: 4 };

const MZONE = (i: number): Box => [1.2 + i * 1.1, 0.8, 2.3 + i * 1.1, 2.0];
const SZONE = (i: number): Box => [1.2 + i * 1.1, 2.0, 2.3 + i * 1.1, 3.2];
const EMZ: Box[] = [
  [2.3, -0.6, 3.4, 0.6],
  [4.5, -0.6, 5.6, 0.6],
];
const FIELD_SPELL: Box = [0.2, 0.1, 1.0, 1.3];
const EXTRA: Box = [0.2, 2.7, 1.0, 3.9];
const DECK: Box = [6.9, 2.7, 7.7, 3.9];
const GRAVE: Box = [6.9, 0.1, 7.7, 1.3];
const BANISHED: Box = [7.9, 0.1, 8.7, 1.3];

const mirrorY = (b: Box): Box => [b[0], -b[3], b[2], -b[1]];

export function layoutField(w: number, h: number): FieldLayout {
  const m = 6;
  const handH = Math.max(42, Math.min(112, h * 0.155));
  const fieldAreaH = Math.max(80, h - handH * 2 - m * 2);
  const s = Math.min((w - m * 2) / 10, fieldAreaH / 8);
  const fieldW = 10 * s;
  const fieldH = 8 * s;
  const fieldX = (w - fieldW) / 2;
  const fieldY = handH + m + (fieldAreaH - fieldH) / 2;

  const toRect = (b: Box): Rect => ({
    x: fieldX + (b[0] - WORLD.x0) * s,
    y: fieldY + (b[1] - WORLD.y0) * s,
    w: (b[2] - b[0]) * s,
    h: (b[3] - b[1]) * s,
  });

  const zones: Record<string, Rect> = {};
  const piles: Record<string, Rect> = {};

  for (let side = 0; side <= 1; side++) {
    const f = (b: Box) => toRect(side === 0 ? b : mirrorY(b));
    for (let i = 0; i < 5; i++) zones[`m${side}-${i}`] = f(MZONE(i));
    for (let i = 0; i < 5; i++) zones[`s${side}-${i}`] = f(SZONE(i));
    zones[`s${side}-5`] = f(FIELD_SPELL);
    piles[`deck-${side}`] = f(DECK);
    piles[`extra-${side}`] = f(EXTRA);
    piles[`gy-${side}`] = f(GRAVE);
    piles[`ban-${side}`] = f(BANISHED);
  }
  // EMZ 는 공유 — 플레이어 0 기준 사각형을 양쪽이 같이 쓴다
  for (let k = 0; k < 2; k++) {
    const r = toRect(EMZ[k]!);
    zones[`m0-${5 + k}`] = r;
    zones[`m1-${5 + k}`] = r;
  }

  const field: Rect = { x: fieldX, y: fieldY + 0, w: fieldW, h: fieldH };
  const hand = {
    p1: { x: fieldX, y: 0, w: fieldW, h: handH },
    p0: { x: fieldX, y: h - handH, w: fieldW, h: handH },
  };

  const mz0 = MZONE(0);
  return {
    field,
    cardW: (mz0[2] - mz0[0]) * s,
    cardH: (mz0[3] - mz0[1]) * s,
    zones,
    piles,
    hand,
    quads: [],
  };
}
