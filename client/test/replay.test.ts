/** P0 골든 검증 — 실제 리플레이로 파서·상태기계 불변식을 확인한다. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseYrpx } from '../src/engine/yrpx.ts';
import { nodeDecompress } from '../src/engine/lzma-node.ts';
import { applyAll, createState } from '../src/engine/state.ts';

const DIR = process.env.REPLAY_DIR ?? 'D:/edopro/replay';

function pick(n: number): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => /\.yrpX$/i.test(f))
    .slice(0, n)
    .map((f) => join(DIR, f));
}

const files = pick(5);

describe.skipIf(files.length === 0)('리플레이 파이프라인', () => {
  it('파일을 전부 소비한다(잔여 0)', () => {
    for (const f of files) {
      const rf = parseYrpx(new Uint8Array(readFileSync(f)), nodeDecompress);
      expect(rf.trailing, f).toBe(0);
      expect(rf.packets.length, f).toBeGreaterThan(0);
    }
  });

  it('상태기계가 불변식을 지킨다', () => {
    for (const f of files) {
      const rf = parseYrpx(new Uint8Array(readFileSync(f)), nodeDecompress);
      const st = applyAll(createState(), rf.packets);
      expect(st.started, f).toBe(true);
      expect(st.lp[0], f).toBeGreaterThanOrEqual(0);
      expect(st.lp[1], f).toBeGreaterThanOrEqual(0);
      expect(st.turn, f).toBeGreaterThan(0);
      if (st.winner !== null) expect([0, 1], f).toContain(st.winner);
      // 체인은 항복/중단으로 남아 있을 수 있다(불변식 아님) → 배열 형태만 확인
      expect(Array.isArray(st.chain), f).toBe(true);
    }
  });

  it('같은 입력은 같은 결과(결정적)', () => {
    const f = files[0]!;
    const a = applyAll(createState(), parseYrpx(new Uint8Array(readFileSync(f)), nodeDecompress).packets);
    const b = applyAll(createState(), parseYrpx(new Uint8Array(readFileSync(f)), nodeDecompress).packets);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
