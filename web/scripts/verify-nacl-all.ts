import { parseCord } from '../src/lib/xrd/crystal';
import { computeSingleXRD } from '../src/lib/xrd/single_xrd';
import { SAMPLE_CRYSTALS } from '../src/data/samples';
import { createDefaultParams } from '../src/lib/xrd/constants';
import { readFileSync } from 'node:fs';

/**
 * Cross-check ALL NaCl ref-data (025–032, every B_Na×B_Cl combination +
 * both Fd states) against the web M3 implementation.  Defect #12
 * adjudication (ghidra-reverse-findings.md §8.13): legacy counts the
 * rock-salt phase; 19.7% was a historical approximate-model residual.
 *
 * Run: cd web && npx vite-node scripts/verify-nacl-all.ts
 */

/** Parse one ref-data record: per-atom B values (last table cell) + Fd state. */
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
      const N = +m[1] * +m[1] + +m[2] * +m[2] + +m[3] * +m[3];
      if (!(N in peaks)) peaks[N] = +m[4];
    }
  }
  return { Bs, FdOpen, peaks };
}

const IDS = [
  '025_NaCl-225', '026_NaCl-225', '027_NaCl-225', '028_NaCl-225',
  '029_NaCl-225', '030_NaCl-225', '031_NaCl-225', '032_NaCl-225',
];

let maxDevAll = 0;
let npts = 0;
for (const id of IDS) {
  const { Bs, FdOpen, peaks } = parseRef(
    `D:/Projects/CalcXRD/docs/archive/ref-data/single-xrd/${id}.md`,
  );
  const c = parseCord(SAMPLE_CRYSTALS.find((s) => s.id === 'nacl')!.text);
  for (let i = 0; i < c.atoms.length; i++) c.atoms[i].thermalB = Bs[i] ?? 1;
  const { rows } = computeSingleXRD(c, {
    ...createDefaultParams(),
    lambda: 1.54056,
    useAnomalous: FdOpen,
  });
  const web: Record<number, number> = {};
  for (const r of rows) {
    const N = r.h * r.h + r.k * r.k + r.l * r.l;
    if (!(N in web)) web[N] = Math.round(r.intensity);
  }
  const parts: string[] = [];
  for (const [Nstr, leg] of Object.entries(peaks).slice(0, 4)) {
    const N = Number(Nstr);
    const w = web[N];
    const dev = w !== undefined ? (Math.abs(w - leg) / leg) * 100 : 100;
    maxDevAll = Math.max(maxDevAll, dev);
    npts += 1;
    parts.push(`${N}:${dev < 0.1 ? 'OK' : 'FAIL ' + dev.toFixed(3) + '%'}`);
  }
  console.log(`${id} B=${JSON.stringify(Bs)} Fd=${FdOpen ? 'on' : 'off'}: ${parts.join(' ')}`);
}
console.log(`\n${npts} peaks across ${IDS.length} records, max dev ${maxDevAll.toFixed(4)}%: ${maxDevAll < 0.1 ? 'PASS' : 'FAIL'}`);
process.exit(maxDevAll < 0.1 ? 0 : 1);
