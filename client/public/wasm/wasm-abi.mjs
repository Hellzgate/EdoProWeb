// LocalCore ABI 스모크 — 더미 리더 없이 duel 생성/파괴
//   node wasm-abi.mjs
import createOcgCore from './ocgcore.js';

const M = await createOcgCore();
console.log('exports:', ['web_create_duel', 'web_start_duel', 'web_process', 'web_get_message',
  'web_set_response_int', 'web_destroy_duel'].map((n) => n + '=' + (typeof M['_' + n] === 'function')).join(' '));

const duel = M._web_create_duel(1, 2, 3, 4, 0n, 0, 0, 0, 0, 0);
console.log('create_duel →', duel);
if (duel > 0) {
  const st = M._web_process(duel);
  console.log('process(초기) →', st);
  M._web_destroy_duel(duel);
  console.log('destroyed');
  console.log('ABI OK');
} else {
  console.log('ABI FAIL (rc=' + duel + ')');
}
