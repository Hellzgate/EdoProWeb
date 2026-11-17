// 로컬 듀얼 기록 → ReplayCore 재생 왕복 검증
//   node tools/duel-record-test.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LocalCore } from '../src/core/LocalCore.ts';
import { ReplayCore } from '../src/core/ReplayCore.ts';
import { decodePrompt, autoChoice } from '../src/duel/prompts.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(ROOT, 'public', 'data');

const raw = JSON.parse(readFileSync(join(DATA, 'cards.json'), 'utf8'));
const CARDS = new Map();
for (const r of raw.cards) {
  CARDS.set(r[0], {
    type: r[2] | 0, atk: r[3] | 0, def: r[4] | 0, level: r[5] | 0,
    race: r[6] | 0, attr: r[7] | 0, setcodes: r[12] ?? [], lscale: r[13] ?? 0,
    rscale: r[14] ?? 0, linkMarker: r[15] ?? 0,
  });
}

const IDX = new Map();
const SRC = new Map();
const root = join(DATA, 'script');
const repos = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory());
repos.sort((a, b) => (a === 'delta-bagooska' ? -1 : b === 'delta-bagooska' ? 1 : a.localeCompare(b)));
for (const repo of repos) for (const f of readdirSync(join(root, repo))) if (f.endsWith('.lua') && !IDX.has(f)) IDX.set(f, join(root, repo, f));
const scripts = (name) => {
  if (SRC.has(name)) return SRC.get(name);
  const p = IDX.get(name);
  if (!p) return null;
  const s = readFileSync(p, 'utf8');
  SRC.set(name, s);
  return s;
};

function deck() {
  const pool = [];
  for (const [id, c] of CARDS) {
    if ((c.type & 0x1) === 0) continue;
    if (c.type & (0x40 | 0x2000 | 0x800000 | 0x4000000 | 0x80000)) continue;
    if (c.level < 1 || c.level > 4 || c.atk < 1200) continue;
    if (!IDX.has(`c${id}.lua`)) continue;
    pool.push(id);
    if (pool.length >= 14) break;
  }
  const main = [];
  for (const c of pool) { main.push(c, c, c); if (main.length >= 40) break; }
  return { main: main.slice(0, 40), extra: [] };
}

const core = await LocalCore.create({
  decks: [deck(), deck()],
  cards: (code) => CARDS.get(code),
  scripts,
  moduleUrl: pathToFileURL(join(ROOT, 'public', 'wasm', 'ocgcore.js')).href,
});

let ended = false;
core.on('end', () => { ended = true; });
for (let i = 0; i < 800 && !ended; i++) {
  const req = core.pendingRequest;
  if (!req) break;
  const p = decodePrompt(req.type, req.payload);
  if (!p) break;
  core.respond(autoChoice(p));
}

const live = core.snapshot;
const packets = core.recorded().map((p) => ({ message: p.message, data: p.data }));
core.dispose();

const replay = new ReplayCore(packets);
let rep = null;
replay.on('state', (s) => {
  rep = s;
});
replay.seek(packets.length);
const st = rep;
const snap = (s) => JSON.stringify({
  lp: s.lp, deck: s.deck, hand: s.hand.length, grave: s.grave.map((g) => g.length),
  m0: s.mzone[0], m1: s.mzone[1], turn: s.turn, winner: s.winner,
});

console.log(`기록 ${packets.length}패킷`);
console.log('라이브 ', snap(live));
console.log('재생   ', snap(st));
const ok = snap(live) === snap(st);
console.log(ok ? 'RECORD-ROUNDTRIP OK' : 'RECORD-ROUNDTRIP FAIL');
process.exit(ok ? 0 : 1);
