// 로컬 듀얼 엔드투엔드 검증 — 실제 카드/스크립트 + 실제 프롬프트 인코딩으로 WIN 까지
//   node tools/duel-full.mjs [최대스텝]
//
// LocalCore(TS) 를 Node 타입 스트리핑으로 그대로 import 해서 브라우저와 같은 코드 경로를 검증한다.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LocalCore, SYSTEM_SCRIPTS } from '../src/core/LocalCore.ts';
import { decodePrompt, autoChoice } from '../src/duel/prompts.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(ROOT, 'public', 'data');
const MAX_STEPS = Number(process.argv[2] ?? 600);

/* ---------- 카드 ---------- */
const raw = JSON.parse(readFileSync(join(DATA, 'cards.json'), 'utf8'));
const CARDS = new Map();
for (const r of raw.cards) {
  CARDS.set(r[0], {
    type: r[2] | 0,
    atk: r[3] | 0,
    def: r[4] | 0,
    level: r[5] | 0,
    race: r[6] | 0,
    attr: r[7] | 0,
    setcodes: r[12] ?? [],
    lscale: r[13] ?? 0,
    rscale: r[14] ?? 0,
    linkMarker: r[15] ?? 0,
  });
}

/* ---------- 스크립트 ---------- */
const IDX = new Map();
const SRC = new Map();
const root = join(DATA, 'script');
const repos = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory());
repos.sort((a, b) => (a === 'delta-bagooska' ? -1 : b === 'delta-bagooska' ? 1 : a.localeCompare(b)));
for (const repo of repos) {
  for (const f of readdirSync(join(root, repo))) {
    if (f.endsWith('.lua') && !IDX.has(f)) IDX.set(f, join(root, repo, f));
  }
}
let miss = 0;
const missing = new Set();
const scripts = (name) => {
  if (SRC.has(name)) return SRC.get(name);
  const p = IDX.get(name);
  if (!p) {
    miss++;
    if (missing.size < 8) missing.add(name);
    return null;
  }
  const s = readFileSync(p, 'utf8');
  SRC.set(name, s);
  return s;
};

/* ---------- 덱 ---------- */
function deck() {
  const pool = [];
  for (const [id, c] of CARDS) {
    if ((c.type & 0x1) === 0) continue;
    if (c.type & (0x40 | 0x2000 | 0x800000 | 0x4000000 | 0x80000)) continue;
    if (c.level < 1 || c.level > 4) continue;
    if (c.atk < 1200) continue;
    if (!IDX.has(`c${id}.lua`)) continue;
    pool.push(id);
    if (pool.length >= 14) break;
  }
  const main = [];
  for (const code of pool) {
    main.push(code, code, code);
    if (main.length >= 40) break;
  }
  return { main: main.slice(0, 40), extra: [] };
}

const cards = (code) => CARDS.get(code);
const d0 = deck();
console.log(`카드 ${CARDS.size} · 스크립트 ${IDX.size} · 덱 ${d0.main.length}장 (${new Set(d0.main).size}종)`);

/* ---------- 듀얼 ---------- */
const t0 = Date.now();
const core = await LocalCore.create({
  decks: [d0, deck()],
  cards,
  scripts,
  moduleUrl: pathToFileURL(join(ROOT, 'public', 'wasm', 'ocgcore.js')).href,
  onLog: (m, t) => {
    if (t === 0 && !/initial_effect/.test(m)) console.log(`  [core] ${m}`);
  },
});
console.log(`생성 ${Date.now() - t0}ms · 시스템 스크립트 ${core.scriptReport.loaded}/${SYSTEM_SCRIPTS.length}`);

let ended = false;
core.on('end', () => {
  ended = true;
});

const kinds = new Map();
let steps = 0;
let lastKey = '';
let same = 0;
let lastRetries = 0;
const retryLog = [];

while (steps < MAX_STEPS) {
  const req = core.pendingRequest;
  if (!req) break;
  const p = decodePrompt(req.type, req.payload);
  if (!p) {
    console.log(`!! 알 수 없는 프롬프트 ${req.kind}(${req.type}) len=${req.payload.length}`);
    break;
  }
  kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
  if (steps % 25 === 0) console.log(`  step ${steps} · packets ${core.length} · retry ${core.retries} · ${p.kind} · heap ${Math.round(process.memoryUsage().heapUsed / 1e6)}MB · batch ${core.lastBatch.length}`);

  // 같은 프롬프트 반복(RETRY 루프) 감지
  const key = `${req.type}:${req.payload.length}:${p.kind}`;
  same = key === lastKey ? same + 1 : 0;
  lastKey = key;
  if (same > 400) {
    console.log(`!! 무한 반복 감지: ${p.kind} (type ${req.type}, ${req.payload.length}B)`);
    break;
  }

  const enemyAtk = Math.max(0, ...core.snapshot.mzone[1].filter((c) => c !== null).map((c) => CARDS.get(c)?.atk ?? 0));
  core.respond(autoChoice(p, { atk: (c) => CARDS.get(c)?.atk ?? 0, enemyAtk }));
  steps++;
  if (core.retries > lastRetries) {
    retryLog.push(`raw=${Buffer.from(req.payload).toString('hex')} p${p.player} ${p.kind} ${p.disfield === undefined ? '' : p.disfield ? 'DIS':'PLACE'} flag=0x${(p.flag ?? 0).toString(16)} count=${p.count} → ${Buffer.from(autoChoice(p)).toString('hex')}`);
    lastRetries = core.retries;
  }
  if (ended) break;
}

const st = core.snapshot;
console.log(`\n스텝 ${steps} · 패킷 ${core.length} · RETRY ${core.retries} · ${Date.now() - t0}ms`);
if (!ended && !core.pendingRequest) {
  const N = (await import('../src/engine/msg.ts')).MSG_NAME;
  console.log(`마지막 배치: status=${core.lastStatus} [${core.lastBatch.map((t) => N[t] ?? t).join(', ')}]`);
}
if (retryLog.length) console.log(`RETRY 유발: ${retryLog.slice(0, 5).join(' | ')}`);
console.log(`프롬프트: ${[...kinds.entries()].map(([k, v]) => `${k}×${v}`).join(' ')}`);
console.log(`LP ${st.lp[0]}/${st.lp[1]} · 턴 ${st.turn} · 승자 ${st.winner === null ? '없음' : 'P' + (st.winner + 1)} · reason ${st.winReason}`);
console.log(`스크립트 미스 ${miss}${missing.size ? ` (${[...missing].join(', ')}…)` : ''}`);

core.dispose();
const ok = st.winner !== null || st.turn >= 5;
console.log(ok ? 'DUEL-FULL OK' : 'DUEL-FULL FAIL');
process.exit(ok ? 0 : 1);
