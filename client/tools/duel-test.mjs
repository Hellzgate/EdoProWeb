// 실제 카드 DB + 실제 스크립트로 ocgcore WASM 듀얼을 돌리는 검증 (Node)
//   node tools/duel-test.mjs
//
// 메시지 번호는 src/engine/msg.ts (= ocgapi_constants.h) 기준.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import createOcgCore from '../public/wasm/ocgcore.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'public', 'data');

const M_ = {
  RETRY: 1, HINT: 2, WAITING: 3, START: 4, WIN: 5, NEW_TURN: 40, NEW_PHASE: 41,
  SELECT_BATTLECMD: 10, SELECT_IDLECMD: 11, SELECT_EFFECTYN: 12, SELECT_YESNO: 13,
  SELECT_OPTION: 14, SELECT_CARD: 15, SELECT_CHAIN: 16, SELECT_PLACE: 18,
  SELECT_POSITION: 19, SELECT_TRIBUTE: 20, SORT_CHAIN: 21, SELECT_COUNTER: 22,
  SELECT_SUM: 23, SELECT_DISFIELD: 24, SORT_CARD: 25, SELECT_UNSELECT_CARD: 26,
  CONFIRM_DECKTOP: 30, CONFIRM_CARDS: 31, SHUFFLE_DECK: 32, SHUFFLE_HAND: 33,
  MOVE: 50, SET: 54, SUMMONING: 60, SUMMONED: 61, SPSUMMONING: 62, SPSUMMONED: 63,
  CHAINING: 70, CHAIN_SOLVING: 72, CHAIN_END: 74,
  DRAW: 90, DAMAGE: 91, RECOVER: 92, LPUPDATE: 94,
};
const NAME = Object.fromEntries(Object.entries(M_).map(([k, v]) => [v, k]));

/* ---------- 스크립트 인덱스 ---------- */
const SCRIPTS = new Map();
const SYS = [
  'constant.lua', 'utility.lua', 'archetype_setcode_constants.lua', 'card_counter_constants.lua',
  'cards_specific_functions.lua', 'deprecated_functions.lua', 'chain.lua',
  'proc_fusion_spell.lua', 'proc_fusion.lua', 'proc_link.lua', 'proc_maximum.lua',
  'proc_normal.lua', 'proc_pendulum.lua', 'proc_ritual.lua', 'proc_rush.lua',
  'proc_skill.lua', 'proc_synchro.lua', 'proc_union.lua', 'proc_unofficial.lua',
  'proc_workaround.lua', 'proc_xyz.lua',
];
const scriptRoot = join(DATA, 'script');
for (const repo of readdirSync(scriptRoot)) {
  const dir = join(scriptRoot, repo);
  let files = [];
  try { files = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith('.lua')) continue;
    if (!SCRIPTS.has(f.name) || repo === 'delta-bagooska') SCRIPTS.set(f.name, join(dir, f.name));
  }
}
console.log(`스크립트 ${SCRIPTS.size}개 · 시스템 ${SYS.filter((s) => SCRIPTS.has(s)).length}/${SYS.length}`);

/* ---------- 카드 DB ---------- */
const raw = JSON.parse(readFileSync(join(DATA, 'cards.json'), 'utf8'));
const CARDS = new Map();
for (const r of raw.cards) {
  CARDS.set(r[0], { type: r[2] | 0, atk: r[3] | 0, def: r[4] | 0, level: r[5] | 0, race: r[6] | 0, attr: r[7] | 0 });
}
console.log(`카드 ${CARDS.size}장`);

/* ---------- WASM ---------- */
const M = await createOcgCore();
const setcodeBuf = M._malloc(16);

const cardReader = M.addFunction((payload, code, ptr) => {
  const c = CARDS.get(code);
  M.HEAPU32[ptr >> 2] = code;
  M.HEAPU32[(ptr + 4) >> 2] = 0;
  M.HEAPU32[(ptr + 8) >> 2] = setcodeBuf;
  M.HEAPU32[(ptr + 12) >> 2] = c ? c.type : 0;
  M.HEAPU32[(ptr + 16) >> 2] = c ? c.level : 0;
  M.HEAPU32[(ptr + 20) >> 2] = c ? c.attr : 0;
  M.HEAPU32[(ptr + 24) >> 2] = c ? c.race >>> 0 : 0;
  M.HEAPU32[(ptr + 28) >> 2] = 0;
  M.HEAP32[(ptr + 32) >> 2] = c ? c.atk : 0;
  M.HEAP32[(ptr + 36) >> 2] = c ? c.def : 0;
  M.HEAPU32[(ptr + 40) >> 2] = 0;
  M.HEAPU32[(ptr + 44) >> 2] = 0;
  M.HEAPU32[(ptr + 48) >> 2] = 0;
}, 'viip');

const loadScript = (duel, name) => {
  const path = SCRIPTS.get(name);
  if (!path) return false;
  const src = readFileSync(path, 'utf8');
  const len = M.lengthBytesUTF8(src);
  const buf = M._malloc(len + 1);
  M.stringToUTF8(src, buf, len + 1);
  const namePtr = M._malloc(M.lengthBytesUTF8(name) + 1);
  M.stringToUTF8(name, namePtr, M.lengthBytesUTF8(name) + 1);
  M._web_load_script(duel, buf, len, namePtr);
  M._free(namePtr);
  M._free(buf);
  return true;
};

let scriptMiss = 0;
const scriptReader = M.addFunction((payload, duel, namePtr) => {
  const name = M.UTF8ToString(namePtr);
  if (loadScript(duel, name)) return 1;
  scriptMiss++;
  if (scriptMiss <= 5) console.log('  [script miss]', name);
  return 0;
}, 'iiip');

const logs = [];
const logHandler = M.addFunction((payload, strPtr, type) => {
  const s = M.UTF8ToString(strPtr);
  logs.push(`${type}:${s}`);
  if (logs.length <= 8) console.log(`  [core:${type}] ${s}`);
}, 'viip');
const readerDone = M.addFunction(() => {}, 'vip');

/* ---------- 테스트 덱 ---------- */
const pickId = [...CARDS.entries()].find(([id, c]) =>
  (c.type & 0x1) && (c.type & 0x80000) === 0 && c.level >= 1 && c.level <= 4 &&
  (c.type & (0x40 | 0x2000 | 0x800000 | 0x4000000 | 0x8000000)) === 0 &&
  SCRIPTS.has(`c${id}.lua`))?.[0];
if (!pickId) { console.log('테스트 카드 없음'); process.exit(1); }
console.log('테스트 카드:', pickId, '| script:', SCRIPTS.get(`c${pickId}.lua`).split('script\\').pop());

const duel = M._web_create_duel(2024, 7, 8000, 5, 1, 0n, cardReader, scriptReader, logHandler, readerDone, 0);
console.log('create_duel →', duel, 'status', M._web_last_create_status());
if (!duel) process.exit(1);

// 시스템 스크립트 선행 로드 (EDOPro 클라이언트와 동일)
let sysLoaded = 0;
for (const s of SYS) if (loadScript(duel, s)) sysLoaded++;
console.log(`시스템 스크립트 로드 ${sysLoaded}/${SYS.length}`);

for (let p = 0; p < 2; p++) {
  for (let seq = 0; seq < 40; seq++) M._web_new_card(duel, p, p, pickId, p, 0x01, seq, 0x8);
}
M._web_start_duel(duel);

/* ---------- 응답 정책 ---------- */
const u32 = (v) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
};
function resp(type, d) {
  switch (type) {
    case M_.SELECT_IDLECMD:
    case M_.SELECT_BATTLECMD:
    case M_.SELECT_CARD:
    case M_.SELECT_OPTION:
    case M_.SELECT_SUM:
    case M_.SELECT_TRIBUTE:
    case M_.SELECT_UNSELECT_CARD:
    case M_.SELECT_DISFIELD:
    case M_.SELECT_COUNTER:
      return u32(0);
    case M_.SELECT_CHAIN:
      return u32(0xffffffff);
    case M_.SELECT_EFFECTYN:
    case M_.SELECT_YESNO:
    case M_.CONFIRM_DECKTOP:
    case M_.CONFIRM_CARDS:
      return Uint8Array.of(0);
    case M_.SELECT_POSITION:
      return u32(0x1);
    case M_.SELECT_PLACE:
      return u32((0 << 16) | (0x04 << 8) | 0);
    case M_.SORT_CARD:
    case M_.SORT_CHAIN: {
      const n = new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(0, true);
      const out = new Uint8Array(4 + n * 4);
      const dv = new DataView(out.buffer);
      dv.setUint32(0, n, true);
      for (let i = 0; i < n; i++) dv.setUint32(4 + i * 4, i, true);
      return out;
    }
    default:
      return u32(0);
  }
}

/* ---------- 루프 ---------- */
const seen = [];
let retries = 0, summons = 0, finished = false, lastAsk = null;
for (let round = 1; round <= 80; round++) {
  const st = M._web_process(duel);
  const p = M._web_get_message(duel);
  const len = M._web_msg_length();
  if (!p || len === 0) { if (st === 0) { finished = true; break; } continue; }
  const dv = new DataView(M.HEAPU8.buffer, p, len);
  let off = 0;
  let ask = null;
  while (off + 5 <= len) {
    const size = dv.getUint32(off, true);
    if (!size) break;
    const type = dv.getUint8(off + 4);
    const data = M.HEAPU8.slice(p + off + 5, p + off + 4 + size);
    seen.push(type);
    if (type === M_.SUMMONING || type === M_.SPSUMMONING) summons++;
    if (type === M_.RETRY) retries++;
    if (type === M_.WIN) console.log(`  WIN: player=${data[0]} reason=${data[1]}`);
    if (type >= 10 && type <= 26) ask = { type, data };
    off += 4 + size;
  }
  if (st === 0) { finished = true; break; }
  if (ask && st === 1) {
    lastAsk = NAME[ask.type] ?? ask.type;
    const out = resp(ask.type, ask.data);
    const ptr = M._malloc(out.length);
    M.HEAPU8.set(out, ptr);
    M._web_set_response_buf(duel, ptr, out.length);
    M._free(ptr);
  }
}

M._web_destroy_duel(duel);
M._free(setcodeBuf);

const counts = new Map();
for (const t of seen) counts.set(t, (counts.get(t) ?? 0) + 1);
console.log(`\n메시지 ${seen.length}개: ` + [...counts.entries()].sort((a, b) => b[1] - a[1])
  .map(([t, n]) => `${NAME[t] ?? t}×${n}`).join(' '));
console.log(`소환 ${summons} · RETRY ${retries} · 마지막 요청 ${lastAsk} · 종료 ${finished} · script miss ${scriptMiss}`);
console.log(`core 로그 ${logs.length}건`);

const ok = seen.includes(M_.DRAW) && summons > 0;
console.log(ok ? 'DUEL OK (드로우 + 실제 소환까지 확인)' : 'DUEL PARTIAL');
process.exit(ok ? 0 : 1);
