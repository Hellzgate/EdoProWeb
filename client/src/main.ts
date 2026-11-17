/**
 * P1 뷰어 — ICore(ReplayCore) + WebGL2 2.5D 보드 + 2D 텍스트 오버레이.
 * P0의 상태기계를 그대로 쓰고, 렌더/코어 경계를 ICore 로 분리했다.
 */
import { parseYrpx, type ReplayPacket } from './engine/yrpx.ts';
import { PHASE_NAMES, type DuelState } from './engine/state.ts';
import { ReplayCore } from './core/ReplayCore.ts';
import { BoardRenderer, type Quad } from './render/BoardRenderer.ts';
import { DeckEditor } from './ui/DeckEditor.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface ReplayJson {
  file: string;
  names: string[];
  turns: number;
  packets: Array<[number, string]>;
}

function b64ToU8(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fromJson(j: ReplayJson): { names: string[]; packets: ReplayPacket[] } {
  return {
    names: j.names,
    packets: j.packets.map(([m, b]) => ({ message: m, data: b64ToU8(b) })),
  };
}

/* ---------- 레이아웃 ---------- */
const C = {
  card: 62,
  cardH: 88,
  gap: 8,
  pad: 28,
  rowGap: 10,
};

let gl: BoardRenderer;
let fx: CanvasRenderingContext2D;
let core: ReplayCore | null = null;
let state: DuelState | null = null;
let names: string[] = [];
let fileName = '';
let timer: number | null = null;
let speed = 20;

function boardSize(): { w: number; h: number } {
  const host = $('stage');
  const w = Math.max(360, host.clientWidth);
  return { w, h: 560 };
}

function setup(): void {
  const glCanvas = $<HTMLCanvasElement>('gl');
  const fxCanvas = $<HTMLCanvasElement>('fx');
  gl = new BoardRenderer(glCanvas);
  fx = fxCanvas.getContext('2d')!;
  resize();
  window.addEventListener('resize', resize);
  gl.draw([]);
}

function resize(): void {
  const { w, h } = boardSize();
  $('stage').style.height = h + 'px';
  const glCanvas = $<HTMLCanvasElement>('gl');
  const fxCanvas = $<HTMLCanvasElement>('fx');
  gl.resize(w, h);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  fxCanvas.width = Math.round(w * dpr);
  fxCanvas.height = Math.round(h * dpr);
  fxCanvas.style.width = w + 'px';
  fxCanvas.style.height = h + 'px';
  draw();
}

function zoneQuads(w: number, h: number): { quads: Quad[]; rects: Record<string, { x: number; y: number; w: number; h: number }> } {
  const quads: Quad[] = [];
  const rects: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const cw = C.card;
  const ch = C.cardH;
  const gap = C.gap;
  const fieldW = cw * 5 + gap * 4;
  const left = (w - fieldW) / 2;

  // 존: 상대(위, depth 1) / 나(아래, depth 0)
  const rows: Array<{ side: number; top: number; depth: number }> = [
    { side: 1, top: C.pad + 44, depth: 1 },
    { side: 0, top: h - C.pad - ch * 2 - gap - 20, depth: 0 },
  ];

  for (const r of rows) {
    for (let i = 0; i < 5; i++) {
      const x = left + i * (cw + gap);
      const y = r.top;
      const key = `m${r.side}-${i}`;
      rects[key] = { x, y, w: cw, h: ch };
      quads.push({ ...rects[key]!, depth: r.depth, color: [0.075, 0.125, 0.165] });
      const sy = y + ch + 6;
      const skey = `s${r.side}-${i}`;
      rects[skey] = { x, y: sy, w: cw, h: ch };
      quads.push({ ...rects[skey]!, depth: r.depth, color: [0.055, 0.09, 0.12] });
    }
  }
  return { quads, rects };
}

function draw(): void {
  if (!fx || !state) return;
  const { w, h } = boardSize();
  const { quads, rects } = zoneQuads(w, h);

  // 카드가 있으면 색을 밝힌다
  const paint = (key: string, filled: boolean, faceDown: boolean) => {
    const r = rects[key];
    if (!r) return;
    const depth = key.startsWith('m1') || key.startsWith('s1') ? 1 : 0;
    quads.push({
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      depth,
      color: filled ? (faceDown ? [0.15, 0.22, 0.33] : [0.19, 0.31, 0.47]) : [0.045, 0.07, 0.09],
    });
  };
  for (let side = 0; side <= 1; side++) {
    for (let i = 0; i < 5; i++) {
      const m = state.mzone[side][i];
      const s = state.szone[side][i];
      paint(`m${side}-${i}`, m !== null, false);
      paint(`s${side}-${i}`, s !== null, true);
    }
  }
  gl.draw(quads);

  // 텍스트 오버레이
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  fx.save();
  fx.scale(dpr, dpr);
  fx.clearRect(0, 0, w, h);

  fx.font = '600 13px system-ui, "Malgun Gothic", sans-serif';
  fx.textBaseline = 'middle';

  const head = (side: number, y: number, align: 'top' | 'bottom') => {
    const label = side === 0 ? '나' : '상대';
    const text = `${label}  ·  LP ${state!.lp[side]}   덱 ${state!.deck[side]}   엑스트라 ${state!.extra[side]}   패 ${state!.hand[side].length}   묘지 ${state!.grave[side].length}   제외 ${state!.banished[side].length}`;
    fx.fillStyle = side === 0 ? 'rgba(220,235,255,0.92)' : 'rgba(200,215,235,0.78)';
    fx.textAlign = 'left';
    fx.fillText(text, C.pad, align === 'top' ? y : y);
    if (side === 1 && names[1]) {
      fx.fillStyle = 'rgba(140,160,190,0.8)';
      fx.textAlign = 'right';
      fx.fillText(names[1], w - C.pad, y);
    }
    if (side === 0 && names[0]) {
      fx.fillStyle = 'rgba(140,160,190,0.8)';
      fx.textAlign = 'right';
      fx.fillText(names[0], w - C.pad, y);
    }
  };

  head(1, C.pad + 18, 'top');
  head(0, h - C.pad - C.cardH * 2 - C.gap - 40, 'bottom');

  // 카드 코드
  fx.font = '9px ui-monospace, Consolas, monospace';
  fx.textAlign = 'center';
  for (let side = 0; side <= 1; side++) {
    for (let i = 0; i < 5; i++) {
      const m = state.mzone[side][i];
      if (m !== null) {
        const r = rects[`m${side}-${i}`]!;
        fx.fillStyle = 'rgba(210,230,255,0.95)';
        fx.fillText(String(m).slice(-6), r.x + r.w / 2, r.y + r.h / 2);
      }
      const s = state.szone[side][i];
      if (s !== null) {
        const r = rects[`s${side}-${i}`]!;
        fx.fillStyle = 'rgba(150,180,220,0.8)';
        fx.fillText('SET', r.x + r.w / 2, r.y + r.h / 2);
      }
    }
  }

  // 중앙 상태
  const phase = PHASE_NAMES[state.phase] ?? String(state.phase);
  fx.font = '600 13px ui-monospace, Consolas, monospace';
  fx.fillStyle = 'rgba(111,211,195,0.95)';
  fx.fillText(`TURN ${state.turn} · ${phase}`, w / 2, h / 2 - 8);
  if (state.chain.length) {
    fx.font = '11px ui-monospace, Consolas, monospace';
    fx.fillStyle = 'rgba(255,255,255,0.7)';
    fx.fillText(state.chain.map((c) => c.code).join(' > '), w / 2, h / 2 + 12);
  }
  if (state.winner !== null) {
    fx.font = '600 15px system-ui, sans-serif';
    fx.fillStyle = 'rgba(255,220,140,0.95)';
    fx.fillText(`WIN · P${state.winner + 1}`, w / 2, h / 2 + 38);
  }
  fx.restore();
}

/* ---------- UI ---------- */
function setName(id: string, v: string): void {
  $(id).textContent = v;
}

function renderSummary(): void {
  if (!core || !state) return;
  setName('s-file', `${fileName || '—'} · ${core.length.toLocaleString()}패킷`);
  setName('s-names', names.filter(Boolean).join('  vs  ') || '—');
  setName('s-count', `${core.cursor.toLocaleString()} / ${core.length.toLocaleString()}`);
  setName('s-lp', `${state.lp[0]} / ${state.lp[1]}`);
  setName('s-win', state.winner === null ? '—' : `P${state.winner + 1} (reason ${state.winReason})`);
  setName('s-event', state.lastEvent || '—');
  const seek = $<HTMLInputElement>('seek');
  seek.max = String(core.length);
  seek.value = String(core.cursor);
}

async function load(files: FileList | null): Promise<void> {
  if (!files?.length) return;
  const f = files[0]!;
  let packets: ReplayPacket[] = [];
  let nm: string[] = [];
  try {
    if (/\.json$/i.test(f.name)) {
      const j = JSON.parse(await f.text()) as ReplayJson;
      const r = fromJson(j);
      packets = r.packets;
      nm = r.names;
    } else {
      const r = parseYrpx(new Uint8Array(await f.arrayBuffer()));
      packets = r.packets;
      nm = r.names;
    }
  } catch (e) {
    setName('hint', /해제기|LZMA/i.test((e as Error).message)
      ? '압축 리플레이는 `npm run export -- "<파일>" out.json` 으로 변환해 여세요'
      : `${f.name}: ${(e as Error).message}`);
    return;
  }
  core?.dispose();
  core = new ReplayCore(packets);
  names = nm;
  fileName = f.name;
  core.on('state', (s) => {
    state = s;
    draw();
    renderSummary();
  });
  core.seek(0);
  state = null;
  core.seek(0);
  setName('hint', `${packets.length.toLocaleString()}패킷 로드 · 재생/스텝 가능`);
}

function togglePlay(): void {
  if (!core) return;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
    $('play').textContent = '▶ 재생';
    return;
  }
  $('play').textContent = '■ 정지';
  if (core.cursor >= core.length) core.seek(0);
  timer = window.setInterval(() => {
    if (!core) return;
    if (core.cursor >= core.length) {
      clearInterval(timer!);
      timer = null;
      $('play').textContent = '▶ 재생';
      return;
    }
    core.seek(core.cursor + speed);
  }, 50);
}

function boot(): void {
  setup();
  setName('hint', '리플레이(.json) 를 선택하세요');

  // 탭 전환 (덱 편집기는 처음 열 때 로드)
  let deck: DeckEditor | null = null;
  document.querySelectorAll<HTMLButtonElement>('nav .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab!;
      document.querySelectorAll('nav .tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById('tab-replay')!.classList.toggle('hidden', tab !== 'replay');
      document.getElementById('tab-deck')!.classList.toggle('hidden', tab !== 'deck');
      if (tab === 'deck' && !deck) {
        deck = new DeckEditor(document.getElementById('deck-root')!);
      }
    });
  });

  $('load').addEventListener('click', () => load($<HTMLInputElement>('file').files));
  $<HTMLInputElement>('file').addEventListener('change', (e) => load((e.target as HTMLInputElement).files));
  $('play').addEventListener('click', togglePlay);
  $('step').addEventListener('click', () => core?.step());
  $('back').addEventListener('click', () => core?.seek((core?.cursor ?? 0) - 1));
  $('seek').addEventListener('input', (e) => core?.seek(Number((e.target as HTMLInputElement).value)));
  $<HTMLInputElement>('speed').addEventListener('input', (e) => {
    speed = Number((e.target as HTMLInputElement).value);
    setName('speedv', String(speed));
  });

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
