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
import { cardById } from '../data/carddb.ts';
import { deckBack, extraBack, fieldImage } from './assets.ts';
import { drawCard, drawHand } from './cards.ts';
import type { FieldLayout } from './field.ts';
import { drawHud } from './hud.ts';
import { INK, roundRect } from './theme.ts';

export interface BoardLabels {
  /** [나, 상대] */
  names?: string[];
  /** 강조할 존 키(`m0-1`, `s1-0` …) — 선택 대상 */
  highlight?: string[];
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

  /* 2.5) 선택 대상 강조 */
  for (const key of labels.highlight ?? []) {
    const r = layout.zones[key];
    if (!r) continue;
    roundRect(ctx, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, 6);
    ctx.strokeStyle = 'rgba(232,200,122,0.95)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

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

  /* 3.4) 체인 번호 — 카드 위에 1,2,3… */
  s.chain.forEach((c, i) => {
    const key = c.loc & 0x04 ? `m${c.ctrl & 1}-${c.seq}` : c.loc & 0x08 ? `s${c.ctrl & 1}-${c.seq}` : '';
    const r = key ? layout.zones[key] : undefined;
    if (!r) return;
    const d = Math.max(12, r.w * 0.3);
    roundRect(ctx, { x: r.x + 2, y: r.y + 2, w: d, h: d }, 3);
    ctx.fillStyle = 'rgba(232,200,122,0.95)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a1408';
    ctx.font = `700 ${Math.max(8, Math.round(d * 0.66))}px ui-monospace, Consolas, monospace`;
    ctx.fillText(String(i + 1), r.x + 2 + d / 2, r.y + 2 + d / 2);
  });

  /* 3.5) 카운터 배지 */  for (const key of Object.keys(s.counters ?? {})) {
    const n = s.counters[key]!;
    if (!n) continue;
    const r = layout.zones[key];
    if (!r) continue;
    const bw = Math.max(14, r.w * 0.32);
    roundRect(ctx, { x: r.x + r.w - bw - 1, y: r.y + 1, w: bw, h: bw }, 3);
    ctx.fillStyle = 'rgba(232,200,122,0.92)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a1408';
    ctx.font = `700 ${Math.max(8, Math.round(bw * 0.68))}px ui-monospace, Consolas, monospace`;
    ctx.fillText(String(n), r.x + r.w - bw / 2 - 1, r.y + 1 + bw / 2);
  }

  /* 3.6) 펜듈럼 스케일 (마함 0/4번 = 펜듈럼 존) */
  for (let side = 0; side <= 1; side++) {
    for (const i of [0, 4]) {
      const code = s.szone[side][i];
      if (code === null) continue;
      const c = cardById(code);
      if (!c || (c.type & 0x1000000) === 0) continue; // PENDULUM
      const r = layout.zones[`s${side}-${i}`];
      if (!r) continue;
      const scale = i === 0 ? c.lscale : c.rscale;
      const bw = Math.max(16, r.w * 0.34);
      roundRect(ctx, { x: r.x + r.w / 2 - bw / 2, y: r.y - bw * 0.9, w: bw, h: bw * 0.8 }, 3);
      ctx.fillStyle = 'rgba(232,200,122,0.95)';
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1a1408';
      ctx.font = `700 ${Math.max(8, Math.round(bw * 0.6))}px ui-monospace, Consolas, monospace`;
      ctx.fillText(String(scale), r.x + r.w / 2, r.y - bw * 0.5);
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
