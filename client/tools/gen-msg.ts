/**
 * ocgapi_constants.h → src/engine/msg.ts 생성기.
 *   node tools/gen-msg.ts [헤더경로]
 * 원본 상수를 직접 읽으므로 버전이 바뀌어도 재실행만 하면 된다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const header =
  process.argv[2] ?? 'D:/rea-out/gh/edo9300__ygopro-core/ocgapi_constants.h';

const text = readFileSync(header, 'utf8');
const rows: Array<{ v: number; n: string }> = [];
const re = /#define\s+(MSG_[A-Z0-9_]+)\s+(\d+)/g;
for (let m = re.exec(text); m; m = re.exec(text)) {
  rows.push({ v: Number(m[2]), n: m[1] });
}
rows.sort((a, b) => a.v - b.v);
if (!rows.length) throw new Error('MSG_* 를 찾지 못했습니다: ' + header);

const out: string[] = [];
out.push('/** ocgapi_constants.h 의 MSG_* — 자동 생성(tools/gen-msg.ts). 수동 편집 금지. */');
out.push('export const MSG = {');
for (const r of rows) out.push('  ' + r.n.replace(/^MSG_/, '') + ': ' + r.v + ',');
out.push('} as const;');
out.push('');
out.push('export const MSG_NAME: Record<number, string> = {');
for (const r of rows) out.push('  ' + r.v + ": '" + r.n + "',");
out.push('};');
out.push('');
out.push('export function msgName(id: number): string {');
out.push("  return MSG_NAME[id] ?? ('MSG_' + id);");
out.push('}');
out.push('');

const dst = join(here, '..', 'src', 'engine', 'msg.ts');
mkdirSync(dirname(dst), { recursive: true });
writeFileSync(dst, out.join('\n'), 'utf8');
console.log('생성:', dst, '(' + rows.length + '개)');
