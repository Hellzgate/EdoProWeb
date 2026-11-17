/**
 * 보드 테마 — 색/타이포 토큰과 작은 그리기 유틸.
 * (원본 EDOPro 자산 위에 얹는 라벨·HUD 는 여기 토큰만 쓴다)
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const INK = {
  cream: '#f2ead6',
  dim: 'rgba(242,234,214,0.6)',
  gold: '#e8c87a',
  me: 'rgba(120,214,190,0.95)',
  foe: 'rgba(230,140,150,0.95)',
  hair: 'rgba(242,234,214,0.16)',
  pillBg: 'rgba(6,8,10,0.62)',
} as const;

export const FONT = {
  ui: 'system-ui, "Malgun Gothic", sans-serif',
  num: 'ui-monospace, Consolas, monospace',
  display: 'ui-serif, Georgia, Times, serif',
} as const;

export function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
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

export function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
