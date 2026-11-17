/**
 * 뷰어 — ICore(ReplayCore) + WebGL2 필드(표준 배치) + 2D 텍스트 오버레이 + 덱 편집 탭.
 * 필드 좌표는 render/field.ts 가 단일 소스(docs/YGO-FIELD-LAYOUT.md).
 */
import { parseYrpx, type ReplayPacket } from './engine/yrpx.ts';
import { phaseName, type DuelState } from './engine/state.ts';
import { ReplayCore } from './core/ReplayCore.ts';
import { BoardRenderer } from './render/BoardRenderer.ts';
import { layoutField } from './render/field.ts';
import { drawBoard } from './render/board.ts';
import { onAssetLoad } from './render/assets.ts';
import { DeckEditor } from './ui/DeckEditor.ts';
import { DataPanel } from './ui/DataPanel.ts';
import { DuelScreen } from './ui/DuelScreen.ts';

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

let gl: BoardRenderer;
let fx: CanvasRenderingContext2D;
let core: ReplayCore | null = null;
let state: DuelState | null = null;
let names: string[] = [];
let fileName = '';
let timer: number | null = null;
let speed = 20;

function stageSize(): { w: number; h: number } {
  const w = Math.max(380, $('stage').clientWidth);
  return { w, h: Math.round(Math.min(900, Math.max(440, w * 0.8))) };
}

function setup(): void {
  gl = new BoardRenderer($<HTMLCanvasElement>('gl'));
  fx = $<HTMLCanvasElement>('fx').getContext('2d')!;
  window.addEventListener('resize', resize);
  resize();
}

function resize(): void {
  const { w, h } = stageSize();
  $('stage').style.height = h + 'px';
  gl.resize(w, h);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = $<HTMLCanvasElement>('fx');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  draw();
}

function draw(): void {
  if (!fx) return;
  const { w, h } = stageSize();
  const layout = layoutField(w, h);
  gl.draw([]);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  fx.save();
  fx.scale(dpr, dpr);
  drawBoard(fx, w, h, layout, state, { names });
  fx.restore();
}


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
      packets = j.packets.map(([m, b]) => ({ message: m, data: b64ToU8(b) }));
      nm = j.names;
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
  core.on('state', (st) => {
    state = st;
    draw();
    renderSummary();
  });
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
  onAssetLoad(() => draw());
  setName('hint', '리플레이(.json) 를 선택하세요');

  let deck: DeckEditor | null = null;
  let data: DataPanel | null = null;
  let duel: DuelScreen | null = null;
  document.querySelectorAll<HTMLButtonElement>('nav .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab!;
      document.querySelectorAll('nav .tab').forEach((b) => b.classList.toggle('active', b === btn));
      $('tab-replay').classList.toggle('hidden', tab !== 'replay');
      $('tab-deck').classList.toggle('hidden', tab !== 'deck');
      $('tab-data').classList.toggle('hidden', tab !== 'data');
      $('tab-duel').classList.toggle('hidden', tab !== 'duel');
      if (tab === 'deck' && !deck) deck = new DeckEditor($('deck-root'));
      if (tab === 'data' && !data) data = new DataPanel($('data-root'));
      if (tab === 'duel' && !duel) duel = new DuelScreen($('duel-root'));
      if (tab === 'duel') duel?.show();
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

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
