/**
 * 카드 그리기 — 원본 카드 이미지(pics/<id>.jpg) 우선, 없으면 이름판으로 대체.
 * 손패도 같은 함수를 쓴다(겹침 배치만 다름).
 */
import { cardById } from '../data/carddb.ts';
import { cardImage } from './assets.ts';
import type { FieldLayout } from './field.ts';
import { ellipsis, roundRect, type Rect } from './theme.ts';

/** 카드 1장 — position 의 수비(0x4)/세트(0x8)면 90° 회전, 세트는 뒷면 */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  code: number,
  faceUp: boolean,
  back: HTMLImageElement | null,
  position = 0,
): void {
  const set = (position & 0x8) !== 0;
  const defense = (position & 0x4) !== 0 || set;
  const shown = faceUp && !set;
  const img = shown ? cardImage(code) : back;
  if (img) {
    if (defense) {
      // 수비 표시: 카드를 눕힌다
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -r.h / 2, -r.w / 2, r.h, r.w);
      ctx.restore();
    } else {
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
    }
    roundRect(ctx, r, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }

  const card = cardById(code);
  const type = card?.type ?? 0;
  roundRect(ctx, r, 3);
  ctx.fillStyle = !shown
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
  if (!shown) {
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

/** 손패 — 겹쳐서 그리고, 좁으면 더 겹친다 */
export function drawHand(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  area: Rect,
  codes: number[],
  faceUp: boolean,
  back: HTMLImageElement | null,
): void {
  if (!area || !codes.length) return;
  const n = codes.length;
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
