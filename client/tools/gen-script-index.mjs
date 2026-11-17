// public/data/script/index.json 생성 — 파일명 → 저장소 폴더
//   node tools/gen-script-index.mjs
// (sync-data.py 로 스크립트를 다시 받은 뒤 실행하면 된다)
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'public', 'data', 'script');
const OUT = join(ROOT, 'index.json');

if (!existsSync(ROOT)) {
  console.error('스크립트 폴더 없음:', ROOT);
  process.exit(1);
}

const index = {};
let files = 0;
const order = readdirSync(ROOT).filter((d) => {
  try {
    return statSync(join(ROOT, d)).isDirectory();
  } catch {
    return false;
  }
});
// 시스템 스크립트는 delta-bagooska 우선
order.sort((a, b) => (a === 'delta-bagooska' ? -1 : b === 'delta-bagooska' ? 1 : a.localeCompare(b)));

for (const repo of order) {
  const dir = join(ROOT, repo);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.lua')) continue;
    if (!index[f]) {
      index[f] = repo;
      files++;
    }
  }
}

writeFileSync(OUT, JSON.stringify(index), 'utf8');
const kb = (readFileSync(OUT).length / 1024).toFixed(1);
console.log(`index.json: ${files}개 스크립트 · ${kb}KB · ${OUT}`);
