/**
 * End-to-end verification: web engine vs. legacy Al B-scan ref-data
 * (docs/archive/ref-data/single-xrd 005/004/003/002, CuKα1, Fd ON, B = 0/0.4/0.6/0.8).
 *
 * 定案 7 (2026-10-19): 111-normalized cross-B ratio
 *   I(N,B)/I(N,0) = exp(−2B(N−3)/(4a²))
 * (a=4.0339, "2" is the |F|² squaring, N−3 is the 111 normalization
 * reference N=3).  Legacy 15-point fit: max residual 0.0076%.
 * Target: web engine matches legacy to <0.1%.
 *
 * Run: cd web && npx vite-node scripts/verify-bscan-mcp.ts
 */
import { parseCord } from '../src/lib/xrd/crystal';
import { computeSingleXRD } from '../src/lib/xrd/single_xrd';
import { createDefaultParams } from '../src/lib/xrd/constants';
import { SAMPLE_CRYSTALS } from '../src/data/samples';
import type { Crystal } from '../src/lib/xrd/types';

const alText = SAMPLE_CRYSTALS.find((s) => s.id === 'al')!.text;

// Build params matching the legacy B-scan records:
// CuKα1 (1.54056), Fd ON, Thermal ON, L-P ON, PeakShape ON, q=0.1
const baseParams = {
  ...createDefaultParams(),
  lambda: 1.54056,
  useAnomalous: true,
  useThermal: true,
  useLp: true,
  dispersionMode: 'fidelity' as const,
  dispersionForm: 'legacy' as const,
};

function makeCrystalWithB(b: number): Crystal {
  const c = parseCord(alText);
  for (const atom of c.atoms) atom.thermalB = b;
  return c;
}

/**
 * 111-normalized peak intensity map: computeSingleXRD normalizes to the
 * strongest peak (=111 for Al at every B level) scaled to 100000, matching
 * the legacy ref-data tables. Returns N -> intensity (first orbit image).
 */
function norm111At(b: number): Map<number, number> {
  const { rows } = computeSingleXRD(makeCrystalWithB(b), baseParams);
  const seen = new Map<number, number>();
  for (const r of rows) {
    const N = r.h * r.h + r.k * r.k + r.l * r.l;
    if (!seen.has(N)) seen.set(N, r.intensity);
  }
  return seen;
}

// Legacy 111-normalized table values (ref-data 005/004/003/002)
const legacyB: Record<number, Record<number, number>> = {
  0:   { 4: 64593, 8: 20709, 11: 12060, 12: 10511, 16: 7401 },
  0.4: { 4: 63804, 8: 19475, 11: 10930, 12: 9411,  16: 6308 },
  0.6: { 4: 63413, 8: 18886, 11: 10406, 12: 8904,  16: 5824 },
  0.8: { 4: 63024, 8: 18314, 11: 9907,  12: 8425,  16: 5377 },
};

const a2 = 4.0339 * 4.0339;
const normB: Record<number, Map<number, number>> = {};
for (const B of [0, 0.4, 0.6, 0.8]) normB[B] = norm111At(B);

console.log('=== Web engine vs legacy Al B-scan (ref-data 002–005, 111-normalized) ===\n');

// (A) 111-normalized peak values: web vs legacy
console.log('--- (A) peak intensities: web vs legacy (target <0.1%) ---');
console.log('N      B    legacy    web       dev%');
console.log('-'.repeat(52));
let allPass = true;
let npts = 0;
for (const B of [0, 0.4, 0.6, 0.8]) {
  for (const N of [4, 8, 11, 12, 16]) {
    const Ileg = legacyB[B][N];
    const Iweb = normB[B]!.get(N);
    if (Iweb === undefined) {
      console.log(`${String(N).padStart(4)}  ${B}  ${Ileg}  MISSING`);
      allPass = false;
      continue;
    }
    const dev = Math.abs(Iweb - Ileg) / Ileg * 100;
    npts += 1;
    const pass = dev < 0.1;
    if (!pass) allPass = false;
    console.log(`${String(N).padStart(4)}  ${String(B).padStart(3)}  ${String(Ileg).padStart(6)}  ${String(Math.round(Iweb)).padStart(6)}  ${dev.toFixed(3)}%  ${pass ? 'OK' : 'FAIL'}`);
  }
}

// (B) DW closed form: I(N,B)/I(N,0) vs exp(−2B(N−3)/(4a²))
console.log('\n--- (B) DW closed form: I(N,B)/I(N,0) vs analytic (target <0.1%) ---');
console.log('N      B    web ratio  analytic   dev%');
console.log('-'.repeat(52));
for (const B of [0.4, 0.6, 0.8]) {
  for (const N of [4, 8, 11, 12, 16]) {
    const ratioWeb = normB[B]!.get(N)! / normB[0]!.get(N)!;
    const analytic = Math.exp((-2 * B * (N - 3)) / (4 * a2));
    const dev = Math.abs(ratioWeb - analytic) / analytic * 100;
    npts += 1;
    const pass = dev < 0.1;
    if (!pass) allPass = false;
    console.log(`${String(N).padStart(4)}  ${String(B).padStart(3)}  ${ratioWeb.toFixed(5)}  ${analytic.toFixed(5)}  ${dev.toFixed(3)}%  ${pass ? 'OK' : 'FAIL'}`);
  }
}

console.log(`\n${npts} checks, all <0.1%: ${allPass ? 'PASS' : 'FAIL'}`);
process.exit(allPass ? 0 : 1);
