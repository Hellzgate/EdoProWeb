// ocgcore.wasm 스모크 테스트 — 로드 + 버전 확인 (Node)
//   node wasm-smoke.mjs
import createOcgCore from './ocgcore.js';

const M = await createOcgCore();
const p = M._malloc(8);
try {
  M._OCG_GetVersion(p, p + 4);
  const major = M.HEAP32[p >> 2];
  const minor = M.HEAP32[(p + 4) >> 2];
  console.log('OCG version:', major, '.', minor);
  console.log('exports:', ['OCG_CreateDuel', 'OCG_StartDuel', 'OCG_DuelProcess', 'OCG_DuelGetMessage']
    .map((n) => n + '=' + (typeof M['_' + n] === 'function')).join(' '));
  console.log('SMOKE OK', major > 0 ? '' : '(버전 0? 확인 필요)');
} finally {
  M._free(p);
}
