// OCG_DuelQuery 동작 확인 (덱/필드 카드)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LocalCore } from '../src/core/LocalCore.ts';

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
console.log('deck[0] 코드', deck.main[0], 'DB', CARDS.get(deck.main[0]));
for (const [label, ctrl, loc, seq] of [
  ['내 덱 0', 0, 0x01, 0],
  ['내 패 0', 0, 0x02, 0],
  ['내 몬스터 0', 0, 0x04, 0],
  ['상대 덱 0', 1, 0x01, 0],
]) {
  console.log(label, JSON.stringify(duel.queryCard(ctrl, loc, seq)));
}
core.dispose();
