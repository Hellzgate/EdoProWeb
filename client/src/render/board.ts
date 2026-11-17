/**
 * 보드 오버레이 — **원본 EDOPro 자산**으로 그린다.
 *   field.png(플레이매트) 위에 카드 이미지(pics/<id>.jpg)를 실제 좌표에 올린다.
 *   덱/엑덱은 EDOPro 카드 뒷면(cover2/cover) 이미지를 쓴다.
 *
 * 이미지가 없으면 이름·공수가 적힌 판으로 대체한다(로딩 중에도 판이 보인다).
 */
import { phaseName, type DuelState } from '../engine/state.ts';
import { cardById } from '../data/carddb.ts';
import { cardImage, deckBack, extraBack, fieldImage } from './assets.ts';
import type { FieldLayout, Rect } from './field.ts';

export interface BoardLabels {
  names?: string[];
}

const INK = {
  cream: '#f2ead6',
  dim: 'rgba(242,234,214,0.6)',
  gold: '#e8c87a',
  me: 'rgba(120,214,190,0.95)',
  foe: 'rgba(230,140,150,0.95)',
  hair: 'rgba(242,234,214,0.16)',
};

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rr = Math.max(2, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.lineTo(r.x + r.w - rr, r.y);
  ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + rr);
  ctx.lineTo(r.x + r.w, r.y + r.h - rr);
  ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - rr, r.y + r.h);
  ctx.lineTo(r.x + rr, r.y + r.h);
  ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - rr);
  ctx.lineTo(r.x, r.y + rr);
  ctx.quadraticCurveTo(r.x, r.y, r.x + rr, r.y);
  ctx.closePath();
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/** 카드 한 장 — 이미지가 있으면 이미지, 없으면 이름판 */
function drawCard(ctx: CanvasRenderingContext2D, r: Rect, code: number, faceUp: boolean, back: HTMLImageElement | null): void {
  const img = faceUp ? cardImage(code) : back;
  if (img) {
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    // 가는 테두리(카드 경계)
    roundRect(ctx, r, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }

  const card = cardById(code);
  const type = card?.type ?? 0;
  roundRect(ctx, r, 3);
  ctx.fillStyle = !faceUp
    ? 'rgba(58,40,74,0.95)'
    : type & 0x2
      ? 'rgba(44,84,62,0.95)'
      : type & 0x4
        ? 'rgba(88,52,94,0.95)'
        : 'rgba(120,88,52,0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,234,214,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  if (!faceUp) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const sz = Math.min(r.w, r.h) * 0.2;
    ctx.strokeStyle = 'rgba(232,200,122,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - sz);
    ctx.lineTo(cx + sz * 0.7, cy);
    ctx.lineTo(cx, cy + sz);
    ctx.lineTo(cx - sz * 0.7, cy);
    ctx.closePath();
    ctx.stroke();
    return;
  }
  const fs = Math.max(6, Math.round(r.w * 0.13));
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `500 ${fs}px system-ui, "Malgun Gothic", sans-serif`;
  const nm = card ? card.name : String(code);
  ctx.fillText(ellipsis(ctx, nm, r.w - 6), r.x + r.w / 2, r.y + r.h * 0.62);
  if (card && type & 0x1 && r.w > 34) {
    ctx.font = `${Math.max(6, Math.round(r.w * 0.11))}px ui-monospace, Consolas, monospace`;
    ctx.fillStyle = 'rgba(242,234,214,0.85)';
    ctx.fillText(`${card.atk}/${card.def}`, r.x + r.w / 2, r.y + r.h * 0.8);
  }
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  area: Rect,
  codes: number[],
  faceUp: boolean,
): void {
  if (!area || !codes.length) return;
  const n = codes.length;
  const back = faceUp ? null : deckBack();
  const cw = Math.min(layout.cardW * 0.96, area.h / 1.45);
  const chh = cw * 1.45;
  const step = n > 1 ? Math.min(cw + 4, Math.max(cw * 0.34, (area.w - cw) / (n - 1))) : 0;
  const totalW = cw + step * (n - 1);
  let x = area.x + (area.w - totalW) / 2;
  const y = area.y + (area.h - chh) / 2;
  for (const code of codes) {
    drawCard(ctx, { x, y, w: cw, h: chh }, code, faceUp, back);
    x += step || cw + 4;
  }
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  layout: FieldLayout,
  s: DuelState | null,
  labels: BoardLabels = {},
): void {
  ctx.clearRect(0, 0, vw, vh);
  ctx.textBaseline = 'middle';

  // 배경은 CSS(bg.png)가 담당 — 여기서는 매트만 그린다
  const field = fieldImage();
  if (field) {
    ctx.drawImage(field, layout.field.x, layout.field.y, layout.field.w, layout.field.h);
  } else {
    roundRect(ctx, layout.field, 10);
    ctx.fillStyle = '#16201c';
    ctx.fill();
  }

  if (!s) return;

  const deckImg = deckBack();
  const extraImg = extraBack();

  /* 더미 — 덱/엑덱은 뒷면 이미지, 묘지/제외는 장수만 */
  const pile = (key: string, side: number, img: HTMLImageElement | null, label: string, count: number) => {
    const r = layout.piles[key];
    if (!r) return;
    if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h);
    else {
      roundRect(ctx, r, 4);
      ctx.fillStyle = 'rgba(10,12,14,0.55)';
      ctx.fill();
      ctx.strokeStyle = INK.hair;
      ctx.stroke();
    }
    // 장수 배지
    const bw = Math.max(18, r.w * 0.5);
    const bh = Math.max(13, r.h * 0.2);
    const bx = r.x + r.w - bw - 2;
    const by = r.y + r.h - bh - 2;
    roundRect(ctx, { x: bx, y: by, w: bw, h: bh }, 4);
    ctx.fillStyle = 'rgba(8,10,12,0.82)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = INK.cream;
    ctx.font = `600 ${Math.max(9, Math.round(bh * 0.72))}px ui-monospace, Consolas, monospace`;
    ctx.fillText(String(count), bx + bw / 2, by + bh / 2);
    if (!img) {
      // 매트에 이미 아이콘이 있으므로 라벨은 생략하고 장수 배지만 남긴다
      void label;
    }
    void side;
  };

  pile('deck-0', 0, deckImg, '덱', s.deck[0]!);
  pile('deck-1', 1, deckImg, '덱', s.deck[1]!);
  pile('extra-0', 0, extraImg, '엑덱', s.extra[0]!);
  pile('extra-1', 1, extraImg, '엑덱', s.extra[1]!);
  pile('gy-0', 0, null, '묘지', s.grave[0]!.length);
  pile('gy-1', 1, null, '묘지', s.grave[1]!.length);
  pile('ban-0', 0, null, '제외', s.banished[0]!.length);
  pile('ban-1', 1, null, '제외', s.banished[1]!.length);

  /* 필드 카드 — 상대 마함은 뒷면 */
  for (let side = 0; side <= 1; side++) {
    for (let i = 0; i < 7; i++) {
      const code = s.mzone[side][i];
      if (code === null) continue;
      if (i >= 5 && side === 1 && s.mzone[0][i] !== null) continue;
      const r = layout.zones[`m${side}-${i}`];
      if (r) drawCard(ctx, r, code, true, null);
    }
    for (let i = 0; i < 6; i++) {
      const code = s.szone[side][i];
      if (code === null) continue;
      const r = layout.zones[`s${side}-${i}`];
      if (r) drawCard(ctx, r, code, side === 0, deckImg);
    }
  }

  /* 손패 */
  drawHand(ctx, layout, layout.hand.p1, s.hand[1]!, false);
  drawHand(ctx, layout, layout.hand.p0, s.hand[0]!, true);

  /* 라벨 — 밝은 배경 위에서도 읽히도록 어두운 알약 배경 */
  const name = (side: number) => labels.names?.[side] ?? (side === 0 ? '나' : '상대');
  const small = Math.max(9, Math.round(layout.cardW * 0.2));
  const pill = (text: string, x: number, y: number, align: 'left' | 'right', font: string, color: string) => {
    ctx.font = font;
    const tw = ctx.measureText(text).width;
    const padX = 7;
    const hgt = Math.max(18, small * 1.7);
    const bx = align === 'left' ? x : x - tw - padX * 2;
    roundRect(ctx, { x: bx, y: y - hgt / 2, w: tw + padX * 2, h: hgt }, hgt / 2);
    ctx.fillStyle = 'rgba(6,8,10,0.62)';
    ctx.fill();
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(text, align === 'left' ? x + padX : x - padX, y);
  };

  pill(`턴 ${s.turn} · ${phaseName(s.phase)}`, 8, 16, 'left', `600 ${small}px system-ui, "Malgun Gothic", sans-serif`, INK.gold);

  const lpSize = Math.max(14, Math.round(layout.cardW * 0.34));
  const sideBlock = (side: number) => {
    const y = side === 0 ? vh - 16 : 16;
    const text = `${name(side)}  ${s.lp[side]}`;
    pill(text, vw - 8, y, 'right', `600 ${lpSize}px ui-serif, Georgia, serif`, side === 0 ? INK.me : INK.foe);
  };
  sideBlock(1);
  sideBlock(0);

  if (s.chain.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,200,122,0.85)';
    ctx.font = `${small}px ui-monospace, Consolas, monospace`;
    ctx.fillText(`체인 ${s.chain.length}`, vw / 2, vh / 2);
  }
  if (s.winner !== null) {
    const cx = vw / 2;
    const cy = vh / 2;
    const bw = Math.max(170, layout.cardW * 3);
    const bh = Math.max(34, layout.cardW * 0.6);
    roundRect(ctx, { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh }, 8);
    ctx.fillStyle = 'rgba(8,10,12,0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,122,0.6)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = INK.gold;
    ctx.font = `600 ${Math.max(14, Math.round(layout.cardW * 0.3))}px system-ui, sans-serif`;
    ctx.fillText(`승리 · P${s.winner + 1}`, cx, cy);
  }
}
