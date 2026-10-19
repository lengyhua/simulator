/**
 * verify-search-factor.ts — cross-check the ported Search Factor (TFormFactor)
 * engine against the legacy RTF reference `ref-data/factors/007-Na+.rtf`.
 *
 * The legacy dialog prints 2θ/s/f₀/f₀+F′+0.5F″²/(f₀+F″) for a chosen element +
 * radiation. We verify `computeSearchFactor` reproduces the RTF row at 2θ=53.00°
 * for Na1+ @ CuKa1. The f₀ column is compared against the RTF's own value
 * (independent of our Factor.dat table); f′/f″ against the RTF's ΔF1/ΔF2.
 */
import { computeSearchFactor } from '../src/lib/xrd/cronie';

const r = computeSearchFactor('Na1+', 'CuKa1', 53.00, 53.00, 0.01);
const row = r.rows[0];

// RTF reference row (ref-data/factors/007-Na+.rtf, 2θ=53.00)
const REF = { s: 0.28963352, f0: 7.049808337, fEff: 7.186880013, dF1: 0.136, dF2: 0.124 };

const pct = (a: number, b: number) => (Math.abs(a - b) / Math.max(1e-9, Math.abs(b))) * 100;

console.log('Search Factor vs 007-Na+.rtf (Na1+ @ CuKa1, 2θ=53.00°):');
console.log(`  s     web=${row.s.toFixed(8)}  rtf=${REF.s}  dev=${pct(row.s, REF.s).toFixed(4)}%`);
console.log(`  f0    web=${row.f0.toFixed(9)}  rtf=${REF.f0}  dev=${pct(row.f0, REF.f0).toFixed(4)}%`);
console.log(`  fEff  web=${row.fEff.toFixed(9)}  rtf=${REF.fEff}  dev=${pct(row.fEff, REF.fEff).toFixed(4)}%`);
console.log(`  dF1   web=${r.deltaF1.toFixed(4)}  rtf=${REF.dF1}`);
console.log(`  dF2   web=${r.deltaF2.toFixed(4)}  rtf=${REF.dF2}`);

const sDev = pct(row.s, REF.s);
const f0Dev = pct(row.f0, REF.f0);
const feffDev = pct(row.fEff, REF.fEff);

const PASS = sDev < 0.01 && f0Dev < 0.01 && feffDev < 0.1;
console.log(`\n${PASS ? 'PASS' : 'FAIL'} — s=${sDev.toFixed(4)}% f0=${f0Dev.toFixed(4)}% fEff=${feffDev.toFixed(4)}%`);
process.exit(PASS ? 0 : 1);
