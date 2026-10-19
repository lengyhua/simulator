/**
 * Diagnose web-vs-legacy B-scan ratio deviation (0.1% target).
 *
 * (A) B=0 (no DW): legacy B=0 table ratios I(N,0)/I(111,0) vs
 *     web B=0 ratios — isolates the f0/色散/Lp/mult 口径
 *     (DW not involved, should be ~0 if 口径一致).
 * (B) DW-only check: for each N, compute (I(N,B)/I(N,0))_web
 *     and (I(N,B)/I(N,0))_legacy, take the ratio; this cancels
 *     f0/Lp/mult and isolates the DW 口径 difference.
 *
 * Run: cd web && npx vite-node scripts/diag-web-vs-legacy.ts
 */
import { parseCord } from '../src/lib/xrd/crystal';
import { computeSingleXRD } from '../src/lib/xrd/single_xrd';
import { createDefaultParams } from '../src/lib/xrd/constants';
import { SAMPLE_CRYSTALS } from '../src/data/samples';

const alText = SAMPLE_CRYSTALS.find((s) => s.id === 'al')!.text;
const baseParams = {
  ...createDefaultParams(),
  lambda: 1.54056,
  useAnomalous: true,
  useThermal: true,
  useLp: true,
  dispersionMode: 'fidelity' as const,
  dispersionForm: 'legacy' as const,
};

const Ns = [4, 8, 11, 12, 16];
const hklOf: Record<number, [number, number, number]> = {
  4: [2, 0, 0], 8: [2, 2, 0], 11: [3, 1, 1], 12: [2, 2, 2], 16: [4, 0, 0],
};

function rawMap(B: number): Map<number, number> {
  const c = parseCord(alText);
  for (const atom of c.atoms) atom.thermalB = B;
  const { rows } = computeSingleXRD(c, baseParams);
  const m = new Map<number, number>();
  for (const r of rows) {
    const N = r.h * r.h + r.k * r.k + r.l * r.l;
    if (!m.has(N)) m.set(N, r.intensity);
  }
  return m;
}

const webB: Record<number, Map<number, number>> = {};
for (const B of [0, 0.4, 0.6, 0.8]) webB[B] = rawMap(B);

// Legacy (111-normalized tables from ref-data 005/004/003/002)
const legacyB: Record<number, Record<number, number>> = {
  0:   { 4: 64593, 8: 20709, 11: 12060, 12: 10511, 16: 7401 },
  0.4: { 4: 63804, 8: 19475, 11: 10930, 12: 9411,  16: 6308 },
  0.6: { 4: 63413, 8: 18886, 11: 10406, 12: 8904,  16: 5824 },
  0.8: { 4: 63024, 8: 18314, 11: 9907,  12: 8425,  16: 5377 },
};

console.log('(A) B=0 口径差：web I(N,0)/I(111,0) vs legacy I(N,0)/I(111,0)');
console.log('   (隔离 f0/色散/Lp/mult；若口径一致应 ~0)');
for (const N of Ns) {
  const w = webB[0]!.get(N)! / webB[0]!.get(3)!;
  const l = legacyB[0][N] / 100000;
  console.log('  N=%2d  web=%.6f  legacy=%.6f  dev=%.3f%%', N, w, l, Math.abs(w - l) / l * 100);
}

console.log('\n(B) DW-only 口径差：[I(N,B)/I(N,0)]_web / [I(N,B)/I(N,0)]_legacy');
console.log('   (约掉 f0/Lp/mult，只剩 DW 口径)');
for (const B of [0.4, 0.6, 0.8]) {
  for (const N of Ns) {
    const w = webB[B]!.get(N)! / webB[0]!.get(N)!;
    const l = legacyB[B][N] / legacyB[0][N];
    const dev = Math.abs(w / l - 1) * 100;
    console.log('  B=%s N=%2d  web_ratio=%.6f  legacy_ratio=%.6f  dev=%.3f%%', B, N, w, l, dev);
  }
}
