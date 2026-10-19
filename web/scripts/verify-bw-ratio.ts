/**
 * Verify web B-scan DW decay against legacy B-scan ref-data (定案 7).
 * 111-normalized cross-B ratio: I(N,B)/I(N,0) = exp(−2B(N−3)/(4a²)),
 * max residual target <0.1% (legacy 15-point fit gives 0.0076%).
 * Run: cd web && npx vite-node scripts/verify-bw-ratio.ts
 */
import { parseCord } from '../src/lib/xrd/crystal';
import { computeSingleXRD } from '../src/lib/xrd/single_xrd';
import { createDefaultParams } from '../src/lib/xrd/constants';
import { SAMPLE_CRYSTALS } from '../src/data/samples';

const alText = SAMPLE_CRYSTALS.find((s) => s.id === 'al')!.text;
const a2 = 4.0339 ** 2;
const N_map = [
  { h: 2, k: 0, l: 0, N: 4 },
  { h: 2, k: 2, l: 0, N: 8 },
  { h: 3, k: 1, l: 1, N: 11 },
  { h: 2, k: 2, l: 2, N: 12 },
  { h: 4, k: 0, l: 0, N: 16 },
];

// Legacy B-scan intensities (111-normalized, from ref-data 002/003/004/005)
const legacy: Array<{ B: number; I: Record<number, number> }> = [
  { B: 0.0, I: { 4: 64593, 8: 20709, 11: 12060, 12: 10511, 16: 7401 } },
  { B: 0.4, I: { 4: 63804, 8: 19475, 11: 10930, 12: 9411, 16: 6308 } },
  { B: 0.6, I: { 4: 63413, 8: 18886, 11: 10406, 12: 8904, 16: 5824 } },
  { B: 0.8, I: { 4: 63024, 8: 18314, 11: 9907, 12: 8425, 16: 5377 } },
];

const paramsBase = {
  ...createDefaultParams(),
  lambda: 1.54056,
  useAnomalous: true,
  useThermal: true,
  useLp: true,
};

function intensityAt(B: number, h: number, k: number, l: number): number {
  const crystal = parseCord(alText);
  for (const atom of crystal.atoms) atom.thermalB = B;
  const { rows } = computeSingleXRD(crystal, paramsBase);
  const row = rows.find((r) => r.h === h && r.k === k && r.l === l);
  if (!row) throw new Error(`reflection (${h},${k},${l}) missing`);
  return row.intensity;
}

// Web engine: 111-normalized cross-B ratio I(N,B)/I(N,0)
const B0 = 0.0;
const I_web0 = new Map(N_map.map((p) => [p.N, intensityAt(B0, p.h, p.k, p.l)]));
let maxDev = 0;
let npts = 0;
for (const { B, I: Ileg } of legacy.slice(1)) { // B = 0.4/0.6/0.8
  for (const p of N_map) {
    const Iweb = intensityAt(B, p.h, p.k, p.l);
    const ratioWeb = Iweb / I_web0.get(p.N)!;
    const ratioLegacy = Ileg[p.N] / legacy[0].I[p.N];
    const dev = Math.abs(ratioWeb - ratioLegacy) / ratioLegacy * 100;
    maxDev = Math.max(maxDev, dev);
    npts += 1;
    // Also check against the analytic closed form exp(−2B(N−3)/(4a²))
    const analytic = Math.exp(-2 * B * (p.N - 3) / (4 * a2));
    const devAnalytic = Math.abs(ratioWeb - analytic) / analytic * 100;
    const pass = dev < 0.1 && devAnalytic < 0.1;
    console.log(
      `B=${B} N=${String(p.N).padStart(2)}: web/leg=${ratioWeb.toFixed(5)} legacy=${ratioLegacy.toFixed(5)} dev=${dev.toFixed(4)}%  analytic=${analytic.toFixed(5)} devA=${devAnalytic.toFixed(4)}%  ${pass ? 'PASS' : 'FAIL'}`,
    );
  }
}
console.log(`\n${npts} points, max dev vs legacy = ${maxDev.toFixed(4)}%  ${maxDev < 0.1 ? 'PASS <0.1%' : 'FAIL'}`);
process.exit(maxDev < 0.1 ? 0 : 1);
