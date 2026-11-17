/**
 * P0 뷰어 — 리플레이 파일 → 상태기계 → 2D 보드 미리보기.
 * 렌더러는 P1에서 WebGL2(2.5D)로 교체한다. 여기서는 **상태가 맞는지**를 눈으로 확인하는 것이 목적.
 */
import { parseYrpx, type ReplayFile } from './engine/yrpx.ts';
import { applyPacket, createState, type DuelState, PHASE_NAMES } from './engine/state.ts';

/**
 * 브라우저 로딩 전략 (P0)
 *  - `.json` : tools/export.ts 로 만든 패킷 덤프 → LZMA 불필요
 *  - `.yrpX` : 로컬 LZMA 로 시도, 실패하면 안내(브라우저 LZMA 는 P1 — 서버 위임 예정)
 */
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

function fromJson(j: ReplayJson): ReplayFile {
  return {
    version: 0,
    flags: 0,
    names: j.names,
    duelFlags: 0,
    packets: j.packets.map(([m, b]) => ({ message: m, data: b64ToU8(b) })),
    turns: j.turns,
    compressed: false,
    trailing: 0,
    fileBytes: 0,
    bodyBytes: 0,
  };
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let replays: ReplayFile[] = [];
let idx = 0;
let cursor = 0;
let state: DuelState = createState();
let timer: number | null = null;

const canvas = $<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d')!;

function setName(id: string, v: string): void {
  $(id).textContent = v;
}

function resetTo(n: number): void {
  state = createState();
  const rf = replays[idx];
  if (!rf) return;
  cursor = Math.max(0, Math.min(n, rf.packets.length));
  for (let i = 0; i < cursor; i++) applyPacket(state, rf.packets[i]!);
  render();
}

function renderSummary(): void {
  const rf = replays[idx];
  if (!rf) return;
  setName('s-file', `${rf.packets.length}패킷 · ${(rf.fileBytes / 1024).toFixed(1)}KB · ${rf.compressed ? '압축' : '비압축'}`);
  setName('s-names', rf.names.filter(Boolean).join('  vs  ') || '—');
  setName('s-count', `${rf.packets.length.toLocaleString()} / ${rf.turns}턴`);
  setName('s-lp', `${state.lp[0]} / ${state.lp[1]}`);
  setName('s-win', state.winner === null ? '—' : `P${state.winner + 1} (reason ${state.winReason})`);
  setName('s-event', state.lastEvent || '—');
}

function card(x: number, y: number, w: number, h: number, code: number | null, faceDown = false): void {
  ctx.fillStyle = code === null ? 'rgba(255,255,255,0.03)' : faceDown ? '#1f3a5a' : '#24405f';
  ctx.strokeStyle = code === null ? 'rgba(255,255,255,0.10)' : 'rgba(160,200,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  if (code !== null) {
    ctx.fillStyle = '#cfe0ff';
    ctx.font = '9px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(code).slice(-6), x + w / 2, y + h / 2);
  }
}

function render(): void {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // 존 배치: 상대(위) / 나(아래), 몬스터 5 + 마함 5 (+ 엑스트라 2, 필드 1 은 생략)
  const cw = 62;
  const ch = 88;
  const gap = 8;
  const left = (W - (cw * 5 + gap * 4)) / 2;

  const drawSide = (ctrl: number, top: number) => {
    for (let i = 0; i < 5; i++) {
      card(left + i * (cw + gap), top, cw, ch, state.mzone[ctrl][i] ?? null);
      card(left + i * (cw + gap), top + ch + gap, cw, ch, state.szone[ctrl][i] ?? null, true);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `${ctrl === 0 ? '나' : '상대'} · LP ${state.lp[ctrl]} · 덱 ${state.deck[ctrl]} · 엑스트라 ${state.extra[ctrl]} · 패 ${state.hand[ctrl].length} · 묘지 ${state.grave[ctrl].length}`,
      left,
      top - 18 < 0 ? top + ch * 2 + gap * 2 + 6 : top - 18,
    );
  };

  drawSide(1, 46);
  drawSide(0, H - ch * 2 - gap - 46);

  // 체인 / 페이즈 표시
  ctx.fillStyle = 'rgba(111,211,195,0.9)';
  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const phase = PHASE_NAMES[state.phase] ?? String(state.phase);
  ctx.fillText(`TURN ${state.turn} · ${phase} · CHAIN ${state.chain.length}`, W / 2, H / 2);
  if (state.chain.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillText(state.chain.map((c) => c.code).join(' > '), W / 2, H / 2 + 20);
  }

  renderSummary();
  const seek = $<HTMLInputElement>('seek');
  const rf = replays[idx];
  seek.max = String(rf ? rf.packets.length : 0);
  seek.value = String(cursor);
  setName('pos', `${cursor} / ${rf ? rf.packets.length : 0}`);
}

async function files(list: FileList | null): Promise<void> {
  if (!list || !list.length) return;
  replays = [];
  for (const f of Array.from(list)) {
    try {
      if (/\.json$/i.test(f.name)) {
        replays.push(fromJson(JSON.parse(await f.text()) as ReplayJson));
      } else {
        replays.push(parseYrpx(new Uint8Array(await f.arrayBuffer())));
      }
    } catch (e) {
      const msg = (e as Error).message;
      setName(
        'hint',
        /lzma|undefined|apply/i.test(msg)
          ? `${f.name}: 브라우저 압축 해제는 P1 — tools/export.ts 로 .json 을 만들어 여세요`
          : `${f.name}: ${msg}`,
      );
    }
  }
  if (!replays.length) return;
  idx = 0;
  setName('hint', `${replays.length}개 로드됨`);
  resetTo(replays[0]!.packets.length);
}

$('load').addEventListener('click', () => files($<HTMLInputElement>('file').files));
$<HTMLInputElement>('file').addEventListener('change', (e) => files((e.target as HTMLInputElement).files));
$('seek').addEventListener('input', (e) => resetTo(Number((e.target as HTMLInputElement).value)));

$('play').addEventListener('click', () => {
  const rf = replays[idx];
  if (!rf) return;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
    $('play').textContent = '▶ 재생';
    return;
  }
  $('play').textContent = '■ 정지';
  if (cursor >= rf.packets.length) resetTo(0);
  timer = window.setInterval(() => {
    const r = replays[idx]!;
    if (cursor >= r.packets.length) {
      clearInterval(timer!);
      timer = null;
      $('play').textContent = '▶ 재생';
      return;
    }
    // 한 번에 여러 패킷(대략 20/프레임) — 리플레이는 원본 타이밍이 없으므로 균등 재생
    for (let i = 0; i < 20 && cursor < r.packets.length; i++, cursor++) applyPacket(state, r.packets[cursor]!);
    render();
  }, 50);
});

// 첫 화면
render();
setName('hint', '리플레이를 선택하세요 (.yrpX)');
