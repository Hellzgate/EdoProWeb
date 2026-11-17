/**
 * P0 검증기 — 리플레이 디렉터리를 전부 파싱해 요약·이상 유무를 낸다.
 *
 *   node tools/scan.ts [디렉터리] [--limit N] [--verbose]
 *
 * 합격선(DESIGN-V2 P0): 모든 파일 파싱 성공 + trailing(잔여 바이트) 0.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseYrpx, type ReplayFile } from '../src/engine/yrpx.ts';
import { nodeDecompress } from '../src/engine/lzma-node.ts';
import { applyAll, createState } from '../src/engine/state.ts';
import { msgName } from '../src/engine/msg.ts';

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const verbose = args.includes('--verbose');
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--limit');
const dir = positional[0] ?? 'D:/edopro/replay';

function files(d: string): string[] {
  return readdirSync(d)
    .filter((f) => /\.yrp[0-9a-z]*$/i.test(f))
    .map((f) => join(d, f))
    .filter((p) => statSync(p).isFile())
    .sort();
}

const list = files(dir).slice(0, limit === Infinity ? undefined : limit);
if (!list.length) {
  console.error('리플레이 없음:', dir);
  process.exit(2);
}

type Row = {
  name: string;
  packets: number;
  turns: number;
  bytes: number;
  trailing: number;
  compressed: boolean;
  winner: string;
  lp: string;
  ms: number;
  error?: string;
};

const rows: Row[] = [];
const hist = new Map<number, number>();
let fail = 0;
let trailBad = 0;

console.log('디렉터리:', dir, '· 파일', list.length + '개\n');
console.log(
  ['파일'.padEnd(24), '패킷'.padStart(6), '턴'.padStart(4), 'KB'.padStart(7), '압축'.padStart(4), '잔여'.padStart(5), '승자'.padStart(5), '최종LP'.padStart(13), 'ms'.padStart(6)].join(' '),
);
console.log('-'.repeat(96));

for (const path of list) {
  const t0 = performance.now();
  const name = path.split(/[\\/]/).pop()!;
  try {
    const rf: ReplayFile = parseYrpx(new Uint8Array(readFileSync(path)), nodeDecompress);
    for (const p of rf.packets) hist.set(p.message, (hist.get(p.message) ?? 0) + 1);
    const st = applyAll(createState(), rf.packets);
    const ms = performance.now() - t0;
    if (rf.trailing !== 0) trailBad++;
    rows.push({
      name,
      packets: rf.packets.length,
      turns: rf.turns,
      bytes: rf.fileBytes,
      trailing: rf.trailing,
      compressed: rf.compressed,
      winner: st.winner === null ? '—' : 'P' + (st.winner + 1),
      lp: st.lp[0] + '/' + st.lp[1],
      ms,
    });
    if (verbose || rows.length <= 20) {
      const r = rows[rows.length - 1]!;
      console.log(
        [
          r.name.slice(0, 24).padEnd(24),
          String(r.packets).padStart(6),
          String(r.turns).padStart(4),
          (r.bytes / 1024).toFixed(0).padStart(7),
          (r.compressed ? 'Y' : '-').padStart(4),
          String(r.trailing).padStart(5),
          r.winner.padStart(5),
          r.lp.padStart(13),
          r.ms.toFixed(0).padStart(6),
        ].join(' '),
      );
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('구형식')) {
      // .yrp(yrp1) 는 의도적으로 미지원 — 실패가 아니라 건너뜀
      rows.push({ name, packets: 0, turns: 0, bytes: 0, trailing: 0, compressed: false, winner: '—', lp: '—', ms: 0, error: 'SKIP' });
      console.log(name.slice(0, 24).padEnd(24), '  -- 구형식(.yrp) 건너뜀');
      continue;
    }
    fail++;
    rows.push({ name, packets: 0, turns: 0, bytes: 0, trailing: 0, compressed: false, winner: '—', lp: '—', ms: 0, error: msg });
    console.log(name.slice(0, 24).padEnd(24), '  !! ' + msg);
  }
}

const ok = rows.filter((r) => !r.error);
const skipped = rows.filter((r) => r.error === 'SKIP');
const sum = (f: (r: Row) => number) => ok.reduce((a, r) => a + f(r), 0);
const med = (f: (r: Row) => number) => {
  const v = ok.map(f).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : 0;
};

console.log('\n=== 집계 ===');
console.log('파일        :', rows.length, '(성공', ok.length + ', 실패', fail + ', 건너뜀', skipped.length + ')');
console.log('총 패킷     :', sum((r) => r.packets).toLocaleString());
console.log('패킷 중앙값 :', med((r) => r.packets));
console.log('총 턴       :', sum((r) => r.turns).toLocaleString());
console.log('총 크기     :', (sum((r) => r.bytes) / 1024 / 1024).toFixed(1) + ' MB');
console.log('파싱 총시간 :', sum((r) => r.ms).toFixed(0) + ' ms (평균 ' + (sum((r) => r.ms) / rows.length).toFixed(1) + ' ms)');
console.log('압축 파일   :', ok.filter((r) => r.compressed).length + ' / ' + ok.length);
console.log('잔여≠0      :', trailBad + (trailBad ? '  ← 실패' : '  OK'));

const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('\n=== 메시지 상위 12 ===');
for (const [id, n] of top) console.log('  ' + msgName(id).padEnd(26), String(n).padStart(8));

const bad = fail > 0 || trailBad > 0;
console.log('\n결과:', bad ? 'FAIL' : 'PASS');
process.exit(bad ? 1 : 0);
