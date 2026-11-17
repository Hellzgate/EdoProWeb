// 원시 질의 버퍼 덤프 — OCG_DuelQuery 레이아웃 확인
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LocalCore } from '../src/core/LocalCore.ts';
import { decodePrompt, autoChoice } from '../src/duel/prompts.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');
const raw = JSON.parse(readFileSync(join(DATA, 'cards.json'), 'utf8'));
const CARDS = new Map(raw.cards.map((r) => [r[0], { type: r[2] | 0, atk: r[3] | 0, def: r[4] | 0, level: r[5] | 0, race: r[6] | 0, attr: r[7] | 0, setcodes: r[12] ?? [] }]));

const IDX = new Map();
const SRC = new Map();
const root = join(DATA, 'script');
for (const repo of readdirSync(root)) {
  const d = join(root, repo);
  if (!statSync(d).isDirectory()) continue;
  for (const f of readdirSync(d)) if (f.endsWith('.lua') && !IDX.has(f)) IDX.set(f, join(d, f));
}
const scripts = (n) => {
  if (SRC.has(n)) return SRC.get(n);
  const p = IDX.get(n);
  if (!p) return null;
  const s = readFileSync(p, 'utf8');
  SRC.set(n, s);
  return s;
};

const pool = [];
for (const [id, c] of CARDS) {
  if (!(c.type & 1) || c.type & (0x40 | 0x2000 | 0x800000 | 0x4000000 | 0x80000)) continue;
  if (c.level < 1 || c.level > 4 || c.atk < 1200 || !IDX.has(`c${id}.lua`)) continue;
  pool.push(id);
  if (pool.length >= 10) break;
}
const deck = { main: [...pool, ...pool, ...pool, ...pool].slice(0, 40), extra: [] };

const core = await LocalCore.create({
  decks: [deck, deck],
  cards: (c) => CARDS.get(c),
  scripts,
  moduleUrl: pathToFileURL(join(ROOT, 'public', 'wasm', 'ocgcore.js')).href,
});
const duel = core.duel;
const M = duel.M;

function raw_(label, ctrl, loc, seq, flags) {
  const buf = M._malloc(256);
  const n = M._web_query_raw(duel.duel, ctrl, loc, seq, flags, buf, 256);
  const hex = [];
  for (let i = 0; i < Math.max(0, Math.min(n, 48)); i++) hex.push(M.HEAPU8[buf + i].toString(16).padStart(2, '0'));
  const u32 = [];
  for (let i = 0; i + 4 <= Math.max(0, Math.min(n, 48)); i += 4) {
    u32.push(new DataView(M.HEAPU8.buffer, buf + i, 4).getUint32(0, true));
  }
  M._free(buf);
  console.log(`${label} flags=0x${flags.toString(16)} len=${n} hex=${hex.join(' ')} u32=[${u32.join(',')}]`);
}

console.log('== 시작 직후 (패 5장) ==');
raw_('내 패0 A', 0, 0x02, 0, 0x100);
raw_('내 패0 C', 0, 0x02, 0, 0x1);
raw_('내 덱0 A', 0, 0x01, 0, 0x100);
raw_('상대 덱0 A', 1, 0x01, 0, 0x100);

// 자동으로 몇 수 진행해서 필드에 몬스터를 올린다
for (let i = 0; i < 40; i++) {
  const req = core.pendingRequest;
  if (!req) break;
  const p = decodePrompt(req.type, req.payload);
  if (!p) break;
  core.respond(autoChoice(p));
}
console.log('== 진행 후 ==');
const st = core.snapshot;
for (let s = 0; s <= 1; s++) {
  for (let i = 0; i < 7; i++) {
    if (st.mzone[s][i] === null) continue;
    const code = st.mzone[s][i];
    const db = CARDS.get(code);
    console.log(`mzone ${s}-${i} code=${code} DB atk=${db?.atk}`);
    raw_(`  A`, s, 0x04, i, 0x100);
    raw_(`  D`, s, 0x04, i, 0x200);
    raw_(`  O`, s, 0x04, i, 0x10000);
  }
}
core.dispose();
