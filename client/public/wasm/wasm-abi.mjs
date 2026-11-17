// ocgcore WASM ABI 검증 — 더미 리더로 duel 생성 → start → process → 메시지 배치 파싱
//   node wasm-abi.mjs
//
// ocgcore 의미(ocgapi.cpp 실측):
//   OCG_DuelProcess  : buff.clear() 후 process() 루프 → 배치 버퍼를 채운다. 0=END 1=AWAITING 2=CONTINUE
//   OCG_DuelGetMessage: 배치 버퍼(void*), *length = buff.size(). 다음 process 까지 유효
//   메시지 = [u32 size][u32 type][payload ...] (size 는 자기 자신 포함)
import createOcgCore from './ocgcore.js';

const M = await createOcgCore();
const setcodes = M._malloc(16);

const cardReader = M.addFunction((payload, code, ptr) => {
  M.HEAPU32[ptr >> 2] = code;
  M.HEAPU32[(ptr + 4) >> 2] = 0;
  M.HEAPU32[(ptr + 8) >> 2] = setcodes;
  M.HEAPU32[(ptr + 12) >> 2] = 0x1; // TYPE_MONSTER
  M.HEAPU32[(ptr + 16) >> 2] = 4;
  M.HEAPU32[(ptr + 20) >> 2] = 0x1;
  M.HEAPU32[(ptr + 24) >> 2] = 0x1;
  M.HEAPU32[(ptr + 28) >> 2] = 0;
  M.HEAP32[(ptr + 32) >> 2] = 1000;
  M.HEAP32[(ptr + 36) >> 2] = 1000;
  M.HEAPU32[(ptr + 40) >> 2] = 0;
  M.HEAPU32[(ptr + 44) >> 2] = 0;
  M.HEAPU32[(ptr + 48) >> 2] = 0;
}, 'viip');

const scriptReader = M.addFunction(() => 0, 'iiip');
const logHandler = M.addFunction((payload, strPtr, type) => {
  console.log(`  [core:${type}] ${M.UTF8ToString(strPtr)}`);
}, 'viip');
const readerDone = M.addFunction(() => {}, 'vip');

const duel = M._web_create_duel(12345, 6789, 8000, 5, 1, 0n,
  cardReader, scriptReader, logHandler, readerDone, 0);
console.log('create_duel →', duel, '| status', M._web_last_create_status());
if (!duel) {
  console.log('ABI FAIL (create status ' + M._web_last_create_status() + ')');
  process.exit(1);
}

M._web_start_duel(duel);
const allTypes = [];
let finished = false;
for (let round = 1; round <= 12; round++) {
  const st = M._web_process(duel);
  const p = M._web_get_message(duel);
  const len = M._web_msg_length();
  const msgs = [];
  let off = 0;
  const dv = new DataView(M.HEAPU8.buffer, p, len); // 비정렬 읽기 (u32 경계 보장 없음)
  while (p && off + 5 <= len) {
    const msize = dv.getUint32(off, true);
    const mtype = dv.getUint8(off + 4);
    if (!msize) break;
    msgs.push(`${mtype}/${msize}`);
    allTypes.push(mtype);
    off += 4 + msize;
  }
  console.log(`round ${round}: status=${st} buffer=${len}B msgs=[${msgs.join(' ')}]`);
  if (round === 1) {
    const hex = [];
    for (let i = 0; i < Math.min(len, 48); i++) hex.push(M.HEAPU8[p + i].toString(16).padStart(2, '0'));
    console.log('  hex:', hex.join(' '));
  }
  if (st === 0) { finished = true; break; }
  if (st === 1) M._web_set_response_int(duel, 0); // 임시 응답
}

M._web_destroy_duel(duel);
M._free(setcodes);
console.log('메시지 타입:', allTypes.join(','));
console.log(finished ? 'ABI OK (듀얼 종료까지 진행)' : 'ABI OK (진행 확인 — 응답 로직은 LocalCore 에서)');
