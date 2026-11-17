/**
 * HUD — 턴/페이즈, 플레이어 이름·LP, 체인, 승리 배너.
 * 밝은 배경(원본 bg.png) 위에서도 읽히도록 어두운 알약 배경을 쓴다.
 */
import { phaseName, type DuelState } from '../engine/state.ts';
import type { FieldLayout } from './field.ts';
import { FONT, INK, roundRect } from './theme.ts';

/** 페이즈 이름(한국어) */
export const PHASE_KO: Record<string, string> = {
  DRAW: '드로우 페이즈',
  STANDBY: '스탠바이 페이즈',
  MAIN1: '메인 페이즈 1',
  BATTLE_START: '배틀 페이즈',
  BATTLE_STEP: '배틀 스텝',
  DAMAGE: '데미지 스텝',
  DAMAGE_CAL: '데미지 계산',
  BATTLE: '배틀',
  MAIN2: '메인 페이즈 2',
  END: '엔드 페이즈',
};

/** 화면 중앙 페이즈 배너 (EDOPro 와 같은 위치·느낌) */
export function drawPhaseBanner(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  text: string,
  alpha: number,
  cardW: number,
): void {
  if (!text || alpha <= 0.01) return;
  const size = Math.max(22, Math.round(cardW * 0.75));
  const cy = vh * 0.42;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.font = `600 ${size}px ${FONT.display}`;
  const tw = ctx.measureText(text).width;
  const padX = size * 0.35;
  const bw = tw + padX * 2;
  const bh = size * 1.5;
  roundRect(ctx, { x: vw / 2 - bw / 2, y: cy - bh / 2, w: bw, h: bh }, bh / 2);
  ctx.fillStyle = 'rgba(6,8,10,0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,200,122,0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = INK.cream;
  ctx.fillText(text, vw / 2, cy);
  ctx.restore();
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  layout: FieldLayout,
  s: DuelState,
  names: [string, string],
): void {
  const small = Math.max(9, Math.round(layout.cardW * 0.2));
  const pill = (
    text: string,
    x: number,
    y: number,
    align: 'left' | 'right',
    font: string,
    color: string,
  ) => {
    ctx.font = font;
    const tw = ctx.measureText(text).width;
    const padX = 7;
    const hgt = Math.max(18, small * 1.7);
    const bx = align === 'left' ? x : x - tw - padX * 2;
    roundRect(ctx, { x: bx, y: y - hgt / 2, w: tw + padX * 2, h: hgt }, hgt / 2);
    ctx.fillStyle = INK.pillBg;
    ctx.fill();
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(text, align === 'left' ? x + padX : x - padX, y);
  };

  pill(`턴 ${s.turn} · ${phaseName(s.phase)}`, 8, 16, 'left', `600 ${small}px ${FONT.ui}`, INK.gold);

  const lpSize = Math.max(14, Math.round(layout.cardW * 0.34));
  const block = (side: 0 | 1) => {
    const y = side === 0 ? vh - 16 : 16;
    pill(`${names[side]}  ${s.lp[side]}`, vw - 8, y, 'right', `600 ${lpSize}px ${FONT.display}`, side === 0 ? INK.me : INK.foe);
  };
  block(1);
  block(0);

  if (s.chain.length) {
    pill(`체인 ${s.chain.length}`, vw / 2, vh / 2, 'right', `${small}px ${FONT.num}`, INK.gold);
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
    ctx.font = `600 ${Math.max(14, Math.round(layout.cardW * 0.3))}px ${FONT.ui}`;
    ctx.fillText(`승리 · P${s.winner + 1}`, cx, cy);
  }
}
