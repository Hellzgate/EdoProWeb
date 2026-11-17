/**
 * 필드 좌표 계산 — 유희왕 표준 배치(docs/YGO-FIELD-LAYOUT.md).
 *
 *  내 진영(아래) 좌→우: [엑덱][필드][ST×5][묘지][덱]
 *  몬스터 줄:            [ MZ×5 ]  위에 EMZ 2칸(2·4열, 양쪽 공유)
 *  상대 진영은 180° 회전(좌우 반전).
 */
import type { DuelState } from '../engine/state.ts';
import type { Quad } from './BoardRenderer.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldLayout {
  cardW: number;
  cardH: number;
  zones: Record<string, Rect>; // 'm0-0' … 'm0-6'(5·6=EMZ), 's0-0'…'s0-5'(5=필드)
  piles: Record<string, Rect>; // deck/extra/gy/banished (side 0/1)
  quads: Quad[];
}

const COLORS = {
  emptyM: [0.075, 0.125, 0.165] as [number, number, number],
  emptyS: [0.055, 0.09, 0.12] as [number, number, number],
  emptyEmz: [0.09, 0.075, 0.15] as [number, number, number],
  field: [0.07, 0.13, 0.1] as [number, number, number],
  pile: [0.06, 0.09, 0.11] as [number, number, number],
  card: [0.19, 0.31, 0.47] as [number, number, number],
  set: [0.15, 0.22, 0.33] as [number, number, number],
  pend: [0.35, 0.2, 0.42] as [number, number, number],
};

/** 카드 한 칸 크기 — 화면 폭에 맞춰 8.4칸 + 여백이 들어가게. */
export function cardSize(w: number): { cw: number; ch: number; gap: number } {
  const gap = 8;
  const cw = Math.max(34, Math.min(64, (w - 56 - gap * 8) / 8.4));
  const ch = Math.round(cw * 1.42);
  return { cw, ch, gap };
}

export function layoutField(w: number, h: number): FieldLayout {
  const { cw, ch, gap } = cardSize(w);
  const midX = w / 2;
  const zones: Record<string, Rect> = {};
  const piles: Record<string, Rect> = {};
  const quads: Quad[] = [];

  // 한 줄에 8칸(엑덱·필드·ST5·묘지·덱) → 폭
  const rowW = cw * 8 + gap * 7;
  const left = Math.round(midX - rowW / 2);

  const colX = (i: number) => left + i * (cw + gap);

  // 세로 배치: 상대(위) / 나(아래)
  // [상대] ST줄 / MZ줄 / (EMZ) / MZ줄 / ST줄  … EMZ 는 두 MZ 줄 사이
  const topSt = 40;
  const topMz = topSt + ch + gap;
  const bottomSt = h - 40 - ch;
  const bottomMz = bottomSt - ch - gap;

  const put = (side: number, key: string, r: Rect, color: [number, number, number], depth: number) => {
    zones[key] = r;
    quads.push({ ...r, depth, color });
  };

  for (let side = 0; side <= 1; side++) {
    const stY = side === 0 ? bottomSt : topSt;
    const mzY = side === 0 ? bottomMz : topMz;
    const depth = side === 0 ? 0 : 1;

    // 좌우 반전: 상대는 열 순서를 뒤집는다(엑덱 ↔ 덱)
    const px = (i: number) => (side === 0 ? colX(i) : colX(7 - i));

    // 마함 줄: [0]=엑덱 [1]=필드 [2..6]=ST [7]=덱  … 묘지/제외는 ST 오른쪽 여백에 겹쳐 그린다
    piles[`extra-${side}`] = { x: px(0), y: stY, w: cw, h: ch };
    put(side, `s${side}-5`, { x: px(1), y: stY, w: cw, h: ch }, COLORS.field, depth); // 필드 마법
    for (let i = 0; i < 5; i++) put(side, `s${side}-${i}`, { x: px(2 + i), y: stY, w: cw, h: ch }, COLORS.emptyS, depth);
    piles[`deck-${side}`] = { x: px(7), y: stY, w: cw, h: ch };
    const gyY = side === 0 ? stY + ch + 6 : stY - Math.round(ch * 0.45) - 6;
    piles[`gy-${side}`] = { x: px(7), y: gyY, w: cw * 0.62, h: Math.round(ch * 0.45) };
    piles[`ban-${side}`] = { x: px(7) + cw * 0.62 + 4, y: gyY, w: cw * 0.62, h: Math.round(ch * 0.45) };

    // 몬스터 줄: ST 5칸과 같은 열 정렬(2..6)
    for (let i = 0; i < 5; i++) put(side, `m${side}-${i}`, { x: px(2 + i), y: mzY, w: cw, h: ch }, COLORS.emptyM, depth);
  }

  // EMZ 2칸은 **양쪽 공유** — 두 몬스터 줄 사이(중앙)에 한 번만 그린다.
  const emzY = Math.round((topMz + ch + bottomMz) / 2 - ch / 2);
  put(0, 'm0-5', { x: colX(3), y: emzY, w: cw, h: ch }, COLORS.emptyEmz, 0);
  put(0, 'm0-6', { x: colX(5), y: emzY, w: cw, h: ch }, COLORS.emptyEmz, 0);
  // 상대 상태가 EMZ 를 쓰면 같은 사각형을 공유한다(데이터는 mzone[side][5·6]).
  zones['m1-5'] = zones['m0-5']!;
  zones['m1-6'] = zones['m0-6']!;

  return { cardW: cw, cardH: ch, zones, piles, quads };
}

/** 상태를 반영한 최종 쿼드 목록(빈 칸 위에 카드 색을 덮는다). */
export function paintState(layout: FieldLayout, s: DuelState): Quad[] {
  const out = layout.quads.slice();
  const byKey = new Map<string, Quad>();
  for (const q of out) byKey.set(`${q.x},${q.y},${q.w}`, q);

  for (let side = 0; side <= 1; side++) {
    const depth = side === 0 ? 0 : 1;
    for (let i = 0; i < 7; i++) {
      const code = s.mzone[side][i];
      if (code === null) continue;
      const r = layout.zones[`m${side}-${i}`];
      if (r) out.push({ ...r, depth, color: COLORS.card });
    }
    for (let i = 0; i < 6; i++) {
      const code = s.szone[side][i];
      if (code === null) continue;
      const r = layout.zones[`s${side}-${i}`];
      if (r) out.push({ ...r, depth, color: i === 5 ? COLORS.field : COLORS.set });
    }
    // 펜듈럼 존(마함 0/4)에 펜듈럼 몬스터가 있으면 보라 테두리 → 별도 쿼드로 표시
    for (const i of [0, 4]) {
      const code = s.szone[side][i];
      if (code === null) continue;
      const r = layout.zones[`s${side}-${i}`];
      if (!r) continue;
      out.push({ x: r.x, y: r.y, w: r.w, h: 5, depth, color: COLORS.pend });
    }
  }
  return out;
}
