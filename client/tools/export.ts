/**
 * 리플레이 → 뷰어용 JSON 내보내기.
 *   node tools/export.ts "<replay.yrpX>" [out.json]
 *
 * 브라우저에서 LZMA 를 풀지 않아도 되도록 **패킷을 그대로** 담는다.
 * (브라우저 LZMA 는 P1 과제 — DESIGN-V2 §4 "자산/전송" 참고)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseYrpx } from '../src/engine/yrpx.ts';
import { nodeDecompress } from '../src/engine/lzma-node.ts';

const src = process.argv[2];
if (!src) {
  console.error('사용법: node tools/export.ts "<replay.yrpX>" [out.json]');
  process.exit(2);
}
const rf = parseYrpx(new Uint8Array(readFileSync(src)), nodeDecompress);
const out = {
  file: basename(src),
  names: rf.names,
  turns: rf.turns,
  duelFlags: rf.duelFlags,
  compressed: rf.compressed,
  packets: rf.packets.map((p) => [p.message, Buffer.from(p.data).toString('base64')]),
};
const dst = process.argv[3] ?? join(dirname(src), basename(src).replace(/\.yrp.*$/i, '') + '.json');
writeFileSync(dst, JSON.stringify(out));
console.log('내보냄:', dst, '(' + rf.packets.length + '패킷 · ' + (readFileSync(dst).length / 1024).toFixed(0) + 'KB)');
