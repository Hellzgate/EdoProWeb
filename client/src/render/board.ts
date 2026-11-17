/**
 * 보드 = 원본 EDOPro 자산의 조립.
 *
 *   1) field3.png  — 플레이매트(존·더미 아이콘이 이미 그려져 있다)
 *   2) 더미        — 덱/엑덱은 뒷면 이미지 + 장수 배지, 묘지/제외는 배지만
 *   3) 필드 카드   — pics/<id>.jpg (상대 마함은 뒷면)
 *   4) 손패        — 내 패 앞면 / 상대 패 뒷면
 *   5) HUD         — 턴·페이즈·LP·체인·승리 (hud.ts)
 *
 * 배경(bg.png)은 CSS 가 담당한다(캔버스는 투명).
 */
import type { DuelState } from '../engine/state.ts';
import { deckBack, extraBack, fieldImage } from './assets.ts';
import { drawCard, drawHand } from './cards.ts';
import type { FieldLayout } from './field.ts';
import { drawHud } from './hud.ts';
import { INK, roundRect } from './theme.ts';

export interface BoardLabels {
  /** [나, 상대] */
  names?: string[];
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

  /* 1) 매트 */
  const field = fieldImage();
  if (field) {
    ctx.drawImage(field, layout.field.x, layout.field.y, layout.field.w, layout.field.h);
  } else {
    roundRect(ctx, layout.field, 10);
    ctx.fillStyle = '#16201c';
    ctx.fill();
  }

  if (!s) return;

  /* 2) 더미 */
  const deckImg = deckBack();
  const extraImg = extraBack();
  const pile = (key: string, img: HTMLImageElement | null, count: number) => {
    const r = layout.piles[key];
    if (!r) return;
    if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h);
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
  };
  pile('deck-0', deckImg, s.deck[0]!);
  pile('deck-1', deckImg, s.deck[1]!);
  pile('extra-0', extraImg, s.extra[0]!);
  pile('extra-1', extraImg, s.extra[1]!);
  pile('gy-0', null, s.grave[0]!.length);
  pile('gy-1', null, s.grave[1]!.length);
  pile('ban-0', null, s.banished[0]!.length);
  pile('ban-1', null, s.banished[1]!.length);

  /* 3) 필드 카드 */
  for (let side = 0; side <= 1; side++) {
    for (let i = 0; i < 7; i++) {
      const code = s.mzone[side][i];
      if (code === null) continue;
      if (i >= 5 && side === 1 && s.mzone[0][i] !== null) continue; // EMZ 공유
      const r = layout.zones[`m${side}-${i}`];
      if (r) drawCard(ctx, r, code, true, null, s.mpos[side]?.[i] ?? 0);
    }
    for (let i = 0; i < 6; i++) {
      const code = s.szone[side][i];
      if (code === null) continue;
      const r = layout.zones[`s${side}-${i}`];
      if (r) drawCard(ctx, r, code, side === 0, deckImg, s.spos[side]?.[i] ?? 0);
    }
  }

  /* 4) 손패 */
  drawHand(ctx, layout, layout.hand.p1, s.hand[1]!, false, deckImg);
  drawHand(ctx, layout, layout.hand.p0, s.hand[0]!, true, null);

  /* 5) HUD */
  drawHud(ctx, vw, vh, layout, s, [
    labels.names?.[0] ?? '나',
    labels.names?.[1] ?? '상대',
  ]);
}
