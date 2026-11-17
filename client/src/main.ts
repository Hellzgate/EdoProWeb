/**
 * 뷰어 — ICore(ReplayCore) + WebGL2 필드(표준 배치) + 2D 텍스트 오버레이 + 덱 편집 탭.
 * 필드 좌표는 render/field.ts 가 단일 소스(docs/YGO-FIELD-LAYOUT.md).
 */
import { parseYrpx, type ReplayPacket } from './engine/yrpx.ts';
import { phaseName, type DuelState } from './engine/state.ts';
import { ReplayCore } from './core/ReplayCore.ts';
import { BoardRenderer } from './render/BoardRenderer.ts';
import { layoutField, paintState } from './render/field.ts';
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
  return { w, h: Math.round(Math.min(620, Math.max(420, w * 0.52))) };
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
  gl.draw(state ? paintState(layout, state) : layout.quads);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  fx.save();
  fx.scale(dpr, dpr);
  fx.clearRect(0, 0, w, h);
  fx.font = '600 12.5px system-ui, "Malgun Gothic", sans-serif';
  fx.textBaseline = 'middle';

  const s = state;
  const L = layout;

  const label = (side: number, text: string, align: 'left' | 'right') => {
    const p = L.piles[`deck-${side}`]!;
    fx.fillStyle = side === 0 ? 'rgba(220,235,255,0.92)' : 'rgba(190,205,228,0.8)';
    fx.textAlign = align;
    const y = side === 0 ? p.y + L.cardH + 14 : p.y - 14;
    fx.fillText(text, align === 'left' ? L.piles[`extra-${side}`]!.x : p.x + p.w, y);
  };

  if (s) {
    for (let side = 0; side <= 1; side++) {
      label(
        side,
        `${side === 0 ? '나' : '상대'}  LP ${s.lp[side]} · 덱 ${s.deck[side]} · 엑덱 ${s.extra[side]} · 패 ${s.hand[side].length} · 묘지 ${s.grave[side].length} · 제외 ${s.banished[side].length}`,
        'left',
      );
      if (names[side]) {
        const p = L.piles[`deck-${side}`]!;
        fx.fillStyle = 'rgba(140,160,190,0.85)';
        fx.textAlign = side === 0 ? 'right' : 'left';
        fx.fillText(names[side], side === 0 ? p.x + p.w : p.x, side === 0 ? p.y + L.cardH + 14 : p.y - 14);
      }
    }

    // 카드 코드 / SET / 펜듈럼 표시
    fx.font = '9px ui-monospace, Consolas, monospace';
    fx.textAlign = 'center';
    for (let side = 0; side <= 1; side++) {
      for (let i = 0; i < 7; i++) {
        const code = s.mzone[side][i];
        if (code === null) continue;
        const r = L.zones[`m${side}-${i}`];
        if (!r) continue;
        fx.fillStyle = i >= 5 ? 'rgba(190,170,255,0.95)' : 'rgba(210,230,255,0.95)';
        fx.fillText(String(code).slice(-6), r.x + r.w / 2, r.y + r.h / 2);
      }
      for (let i = 0; i < 6; i++) {
        const code = s.szone[side][i];
        if (code === null) continue;
        const r = L.zones[`s${side}-${i}`];
        if (!r) continue;
        fx.fillStyle = i === 5 ? 'rgba(150,230,190,0.9)' : 'rgba(150,180,220,0.85)';
        fx.fillText(i === 5 ? 'FIELD' : 'SET', r.x + r.w / 2, r.y + r.h / 2);
      }
    }

    // 더미 위 장수
    fx.font = '600 11px ui-monospace, Consolas, monospace';
    const pile = (side: number, key: string, text: string, color: string) => {
      const r = L.piles[`${key}-${side}`];
      if (!r) return;
      fx.fillStyle = 'rgba(0,0,0,0.45)';
      fx.fillRect(r.x + 2, r.y + r.h - 15, r.w - 4, 13);
      fx.fillStyle = color;
      fx.fillText(text, r.x + r.w / 2, r.y + r.h - 8);
    };
    for (let side = 0; side <= 1; side++) {
      pile(side, 'deck', String(s.deck[side]), 'rgba(200,225,255,0.95)');
      pile(side, 'extra', String(s.extra[side]), 'rgba(190,190,255,0.9)');
      pile(side, 'gy', String(s.grave[side].length), 'rgba(255,200,200,0.85)');
      pile(side, 'ban', String(s.banished[side].length), 'rgba(230,200,255,0.85)');
    }

    // 중앙 상태
    fx.font = '600 13px ui-monospace, Consolas, monospace';
    fx.fillStyle = 'rgba(111,211,195,0.95)';
    fx.textAlign = 'center';
    fx.fillText(`TURN ${s.turn} · ${phaseName(s.phase)}`, w / 2, h / 2 - 6);
    if (s.chain.length) {
      fx.font = '11px ui-monospace, Consolas, monospace';
      fx.fillStyle = 'rgba(255,255,255,0.72)';
      fx.fillText(s.chain.map((c) => c.code).join(' > '), w / 2, h / 2 + 12);
    }
    if (s.winner !== null) {
      fx.font = '600 15px system-ui, sans-serif';
      fx.fillStyle = 'rgba(255,220,140,0.95)';
      fx.fillText(`WIN · P${s.winner + 1}`, w / 2, h / 2 + 34);
    }
  }
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
