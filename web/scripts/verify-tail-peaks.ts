/**
 * NaCl 025–032 全 8 条 × 全部 2θ 尾峰（N≥16，4 峰扩到 9 峰）逐值核对。
 * 上轮只测了 N=3/4/8/11（4 峰）；本轮补 N=12/16/19/20/24 尾峰。
 *
 * Run: cd web && npx vite-node scripts/verify-tail-peaks.ts
 */
import { parseCord } from '../src/lib/xrd/crystal';
import { computeSingleXRD } from '../src/lib/xrd/single_xrd';
import { SAMPLE_CRYSTALS } from '../src/data/samples';
import { createDefaultParams } from '../src/lib/xrd/constants';
import { readFileSync } from 'node:fs';

function parseRef(file: string): { Bs: number[]; FdOpen: boolean; peaks: Record<number, number> } {
  const text = readFileSync(file, 'utf8');
  const head = text.slice(0, text.indexOf('```'));
  const rows = head.split('\n').filter((l) => l.startsWith('|'));
  const dataRow = rows[2] ?? '';
  const cells = dataRow.split('|').map((c) => c.trim()).filter((c) => c !== '');
  const Bstr = cells[cells.length - 1];
  const Bs = Bstr.split(',').map((x) => parseFloat(x.trim()));
  const FdOpen = cells[4] === '开';
  const peaks: Record<number, number> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(-?\d)\s+(-?\d)\s+(-?\d)\s+[\d.]+\(A\)\s+[\d.]+\(deg\)\s+(\d+)/);
    if (m) {
      const N = (+m[1]) * (+m[1]) + (+m[2]) * (+m[2]) + (+m[3]) * (+m[3]);
      if (!(N in peaks)) peaks[N] = +m[4];
    }
  }
  return { Bs, FdOpen, peaks };
}

const IDS = ['025_NaCl-225','026_NaCl-225','027_NaCl-225','028_NaCl-225','029_NaCl-225','030_NaCl-225','031_NaCl-225','032_NaCl-225'];
let maxDevAll = 0;
let npts = 0;
for (const id of IDS) {
  const { Bs, FdOpen, peaks } = parseRef(`D:/Projects/CalcXRD/docs/archive/ref-data/single-xrd/${id}.md`);
  const c = parseCord(SAMPLE_CRYSTALS.find((s) => s.id === 'nacl')!.text);
  for (let i = 0; i < c.atoms.length; i++) c.atoms[i].thermalB = Bs[i] ?? 1;
  const { rows } = computeSingleXRD(c, { ...createDefaultParams(), lambda: 1.54056, useAnomalous: FdOpen });
  const web: Record<number, number> = {};
  for (const r of rows) {
    const N = r.h * r.h + r.k * r.k + r.l * r.l;
    if (!(N in web)) web[N] = Math.round(r.intensity);
  }
  const Ns = Object.keys(peaks).map(Number); // ALL peaks in the legacy table (incl. N≥16 tails)
  let maxDev = 0;
  let worstN = 0;
  for (const N of Ns) {
    const w = web[N];
    const leg = peaks[N];
    if (w === undefined) {
      console.log(`  ${id} N=${N}: legacy=${leg} web=MISSING`);
      maxDev = 100;
      continue;
    }
    const dev = Math.abs(w - leg) / leg * 100;
    if (dev > maxDev) { maxDev = dev; worstN = N; }
  }
  maxDevAll = Math.max(maxDevAll, maxDev);
  npts += Ns.length;
  console.log(`${id} B=${JSON.stringify(Bs)} Fd=${FdOpen ? 'on' : 'off'}: ${Ns.length} 峰, max dev ${maxDev.toFixed(4)}% (N=${worstN})`);
}
console.log(`\n${npts} peaks across ${IDS.length} records: max dev ${maxDevAll.toFixed(4)}% ${maxDevAll < 0.1 ? 'PASS' : 'FAIL'}`);
process.exit(maxDevAll < 0.1 ? 0 : 1);
