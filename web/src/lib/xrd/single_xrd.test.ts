import { describe, expect, it } from 'vitest';

import { parseCord } from '@/lib/xrd/crystal';
import { computeSingleXRD } from '@/lib/xrd/single_xrd';
import { createDefaultParams } from '@/lib/xrd/constants';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Single-XRD table is pinned to the legacy M3 dispersion form
 * (byte-confirmed `ghidra-reverse-findings.md` §8.2/§8.9, §8.13):
 * `f_eff = D·(f₀ + F′ + 0.5·F″²/(f₀+F″))·occ`, D multiplies the whole bracket.
 *
 * Regression guard: even when the caller passes `dispersionForm: 'complex'`
 * (the physically-correct IT Vol C form, used by the powder pipeline for
 * multi-element structures), the single-XRD table must compute with the
 * legacy M3 form and match the original CalcXRD.exe output to <0.1%.
 *
 * Al (FCC 225, Cu Kα1, B=1) per-N targets from `Al_single.xrd` (legacy
 * GUI export, `docs/archive/ref-data/single-xrd/036_Al-225.md`):
 *   N=3:100000 N=4:62638 N=8:17760 N=11:9431 N=12:7972 N=16:4964
 */
const LEGACY_TARGETS: Record<number, number> = {
  3: 100000,
  4: 62638,
  8: 17760,
  11: 9431,
  12: 7972,
  16: 4964,
};

const NS = [3, 4, 8, 11, 12, 16];

function perN(params: ReturnType<typeof createDefaultParams> & { dispersionForm: 'legacy' | 'complex' }) {
  const al = parseCord(
    readFileSync(path.resolve(__dirname, '..', '..', 'data', 'samples', 'Al.cord'), 'utf8'),
  );
  const result = computeSingleXRD(al, params);
  const byN: Record<number, number> = {};
  for (const row of result.rows) {
    const N = row.h ** 2 + row.k ** 2 + row.l ** 2;
    byN[N] = Math.round(row.intensity);
  }
  return byN;
}

function maxDev(byN: Record<number, number>): number {
  let max = 0;
  for (const N of NS) {
    const target = LEGACY_TARGETS[N];
    const web = byN[N];
    if (target === undefined || web === undefined) continue;
    max = Math.max(max, Math.abs(web - target) / target);
  }
  return max * 100;
}

describe('single XRD table pinned to legacy M3 form (§8.13 regression guard)', () => {
  it('default params match legacy program to <0.1%', () => {
    const p = createDefaultParams();
    expect(p.dispersionForm).toBe('legacy');
    const byN = perN(p);
    const dev = maxDev(byN);
    expect(dev, `Al per-N deviation = ${dev.toFixed(4)}% (must be <0.1%)`).toBeLessThan(0.1);
  });

  it('complex param is ignored by single table (pinned legacy, matches program)', () => {
    const p = { ...createDefaultParams(), dispersionForm: 'complex' as const };
    const byN = perN(p);
    const dev = maxDev(byN);
    expect(dev, `Al per-N deviation with complex param = ${dev.toFixed(4)}% (must be <0.1%)`).toBeLessThan(0.1);
    // Should equal the legacy output, not the complex-form output
    const byNLegacy = perN(createDefaultParams());
    for (const N of NS) {
      expect(byN[N], `N=${N}`).toBe(byNLegacy[N]);
    }
  });
});
