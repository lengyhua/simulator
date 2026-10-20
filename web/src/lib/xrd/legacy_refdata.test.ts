/**
 * Legacy single-XRD regression — one pinned case per archived CalcXRD.exe run.
 *
 * POLICY (user decision 2026-10-20): the archived `docs/archive/ref-data/**` capture files
 * are NOT read by the test suite any more. Every reference value they carried
 * is transcribed HERE, so this file *is* the record of the original data and
 * `docs/archive/ref-data/` can be archived away. Keep the `ref:` field on every case — it
 * names the source capture for traceability.
 *
 * What each case pins, strictly (no tolerance beyond one count):
 *   - the total row count of the single-XRD table;
 *   - every Laue orbit, in the legacy display order (d descending):
 *       N = h²+k²+l², d (4 dp), 2θ (2 dp), I (relative, max = 100000),
 *       and the number of member rows the orbit contributes.
 *     Since all members of one orbit share d / 2θ / I, this fully determines
 *     every printed row.
 *
 * Intensity tolerance is `±1 count`: the legacy program stores the normalized
 * intensity in a 32-bit Single before printing, so the last printed digit can
 * differ by one from this double-precision engine (seen on 016/019/020/034,
 * never more than 1 count, never on more than the low-intensity tail).
 *
 * Coverage (34 verified cases, Al + NaCl, CuKα1/CuKα/FeKα1/FeKα/MoKα1/MoKα):
 *   B scan 001–005 · flag scan 006–009, 033/036 · q scan 010–012 ·
 *   occupancy scan 013–015 · λ scan 016–020, 034/035 ·
 *   space groups 226(Fm-3c) 021 / 227(Fd-3m) 022 ·
 *   NaCl B-matrix 025–032 (Na/Cl thermal factors 1 / 0.5 / 0).
 *
 * Two cases are NOT pinned yet — see PENDING_CASES at the bottom: the captures
 * 023/024 (space groups 75 P4 / 76 P41) contradict the engine structurally and
 * are waiting on a re-capture from the original program.
 */

import { describe, expect, it } from 'vitest';

import { createDefaultParams } from '@/lib/xrd/constants';
import { computeSingleXRD } from '@/lib/xrd/single_xrd';
import type { Crystal, XrdParams } from '@/lib/xrd/types';

/** Al in a cubic space group, a = 4.0339 Å, one atom on Wyckoff `a` (0,0,0). */
function al(sgKey: string, sgNumber: number, sgSymbol: string, thermalB: number, occupancy = 1): Crystal {
  return {
    name: 'Al',
    system: 'Cubic',
    sgNumber,
    sgSymbol,
    sgKey,
    a: 4.0339,
    b: 4.0339,
    c: 4.0339,
    alpha: 90,
    beta: 90,
    gamma: 90,
    atoms: [{ element: 'Al', wyckoff: 'a', x: 0, y: 0, z: 0, occupancy, thermalB }],
  };
}

const AL225 = (thermalB: number, occupancy = 1): Crystal => al('225(Fm-3m)', 225, 'Fm-3m', thermalB, occupancy);
const AL226 = (thermalB: number, occupancy = 1): Crystal => al('226(Fm-3c)', 226, 'Fm-3c', thermalB, occupancy);
const AL227 = (thermalB: number, occupancy = 1): Crystal =>
  al('227(Fd-3m)[origin choice 1]', 227, 'Fd-3m', thermalB, occupancy);
const AL = (sgKey: string, sgNumber: number, sgSymbol: string, thermalB: number, occupancy = 1): Crystal =>
  al(sgKey, sgNumber, sgSymbol, thermalB, occupancy);

/** NaCl rock salt, a = 5.6200 Å: Na1+ on 4a (0,0,0), Cl1- on 4b (½,½,½). */
const NACL = (thermalBNa: number, thermalBCl: number): Crystal => ({
  name: 'NaCl',
  system: 'Cubic',
  sgNumber: 225,
  sgSymbol: 'Fm-3m',
  sgKey: '225(Fm-3m)',
  a: 5.62,
  b: 5.62,
  c: 5.62,
  alpha: 90,
  beta: 90,
  gamma: 90,
  atoms: [
    { element: 'Na1+', wyckoff: 'a', x: 0, y: 0, z: 0, occupancy: 1, thermalB: thermalBNa },
    { element: 'Cl1-', wyckoff: 'b', x: 0.5, y: 0.5, z: 0.5, occupancy: 1, thermalB: thermalBCl },
  ],
});

/** One Laue orbit: [N, d (4dp), 2θ (2dp), I, member-row count]. */
type Orbit = readonly [number, string, string, number, number];

interface LegacyCase {
  /** Source capture filename (archived `docs/archive/ref-data/single-xrd/<ref>`). */
  ref: string;
  crystal: Crystal;
  lambda: number;
  /** Legacy checkbox states: F′F″ / Thermal / L-P / PeakShape. */
  flags: { Fd: boolean; Th: boolean; Lp: boolean; Ps: boolean };
  q: number;
  /** Expected total row count of the single-XRD table. */
  rows: number;
  note?: string;
  orbits: readonly Orbit[];
}

function paramsFor(c: LegacyCase): XrdParams {
  return {
    ...createDefaultParams(),
    lambda: c.lambda,
    q: c.q,
    useLp: c.flags.Lp,
    useThermal: c.flags.Th,
    usePeakShape: c.flags.Ps,
    useAnomalous: c.flags.Fd,
  };
}

/** Collapses consecutive equal-N rows into one orbit, in engine output order. */
function orbitsOf(
  rows: ReadonlyArray<{ h: number; k: number; l: number; d: number; twoTheta: number; intensity: number }>,
) {
  const out: Array<{ N: number; d: string; twoTheta: string; intensity: number; members: number }> = [];
  for (const row of rows) {
    const N = row.h ** 2 + row.k ** 2 + row.l ** 2;
    const last = out[out.length - 1];
    if (last && last.N === N) {
      last.members += 1;
      continue;
    }
    out.push({
      N,
      d: row.d.toFixed(4),
      twoTheta: row.twoTheta.toFixed(2),
      intensity: Math.round(row.intensity),
      members: 1,
    });
  }
  return out;
}

function assertCase(c: LegacyCase): void {
  const result = computeSingleXRD(c.crystal, paramsFor(c));
  expect(result.rows.length, `${c.ref}: 表格行数`).toBe(c.rows);
  const got = orbitsOf(result.rows);
  expect(got.length, `${c.ref}: 衍射族数`).toBe(c.orbits.length);
  c.orbits.forEach((expected, i) => {
    const g = got[i];
    const [N, d, twoTheta, intensity, members] = expected;
    const tag = `${c.ref} orbit#${i} (N=${N})`;
    expect(g.N, `${tag} N`).toBe(N);
    expect(g.d, `${tag} d`).toBe(d);
    expect(g.twoTheta, `${tag} 2θ`).toBe(twoTheta);
    // ±1 count: legacy normalizes into a 32-bit Single before printing.
    expect(Math.abs(g.intensity - intensity), `${tag} I: web=${g.intensity} legacy=${intensity}`).toBeLessThanOrEqual(1);
    expect(g.members, `${tag} 成员行数`).toBe(members);
  });
}

const VERIFIED_CASES: readonly LegacyCase[] = [
  {
    ref: '001_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62638, 6],
    [8, '1.4262', '65.38', 17760, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [12, '1.1645', '82.83', 7972, 8],
    [16, '1.0085', '99.60', 4964, 6]
    ],
  },
  {
    ref: '002_Al-225.md',
    crystal: AL225(0.8, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 63024, 6],
    [8, '1.4262', '65.38', 18314, 12],
    [11, '1.2163', '78.59', 9907, 24],
    [12, '1.1645', '82.83', 8425, 8],
    [16, '1.0085', '99.60', 5377, 6]
    ],
  },
  {
    ref: '003_Al-225.md',
    crystal: AL225(0.6, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 63413, 6],
    [8, '1.4262', '65.38', 18886, 12],
    [11, '1.2163', '78.59', 10406, 24],
    [12, '1.1645', '82.83', 8904, 8],
    [16, '1.0085', '99.60', 5824, 6]
    ],
  },
  {
    ref: '004_Al-225.md',
    crystal: AL225(0.4, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 63804, 6],
    [8, '1.4262', '65.38', 19475, 12],
    [11, '1.2163', '78.59', 10930, 24],
    [12, '1.1645', '82.83', 9411, 8],
    [16, '1.0085', '99.60', 6308, 6]
    ],
  },
  {
    ref: '005_Al-225.md',
    crystal: AL225(0.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 64593, 6],
    [8, '1.4262', '65.38', 20709, 12],
    [11, '1.2163', '78.59', 12060, 24],
    [12, '1.1645', '82.83', 10511, 8],
    [16, '1.0085', '99.60', 7401, 6]
    ],
  },
  {
    ref: '006_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:false, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62480, 6],
    [8, '1.4262', '65.38', 17572, 12],
    [11, '1.2163', '78.59', 9277, 24],
    [12, '1.1645', '82.83', 7826, 8],
    [16, '1.0085', '99.60', 4833, 6]
    ],
  },
  {
    ref: '007_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:false, Th:false, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 64430, 6],
    [8, '1.4262', '65.38', 20490, 12],
    [11, '1.2163', '78.59', 11862, 24],
    [12, '1.1645', '82.83', 10319, 8],
    [16, '1.0085', '99.60', 7206, 6]
    ],
  },
  {
    ref: '008_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:false, Th:false, Lp:false, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 90215, 6],
    [8, '1.4262', '65.38', 66862, 12],
    [11, '1.2163', '78.59', 55274, 24],
    [12, '1.1645', '82.83', 52009, 8],
    [16, '1.0085', '99.60', 41184, 6]
    ],
  },
  {
    ref: '009_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:false, Th:false, Lp:false, Ps:false },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 90215, 6],
    [8, '1.4262', '65.38', 66862, 12],
    [11, '1.2163', '78.59', 55274, 24],
    [12, '1.1645', '82.83', 52009, 8],
    [16, '1.0085', '99.60', 41184, 6]
    ],
  },
  {
    ref: '010_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.2,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62638, 6],
    [8, '1.4262', '65.38', 17760, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [12, '1.1645', '82.83', 7972, 8],
    [16, '1.0085', '99.60', 4964, 6]
    ],
  },
  {
    ref: '011_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.4,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62638, 6],
    [8, '1.4262', '65.38', 17760, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [12, '1.1645', '82.83', 7972, 8],
    [16, '1.0085', '99.60', 4964, 6]
    ],
  },
  {
    ref: '012_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.8,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62638, 6],
    [8, '1.4262', '65.38', 17760, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [12, '1.1645', '82.83', 7972, 8],
    [16, '1.0085', '99.60', 4964, 6]
    ],
  },
  {
    ref: '013_Al-225.md',
    crystal: AL225(1.0, 0.8),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62638, 6],
    [8, '1.4262', '65.38', 17760, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [12, '1.1645', '82.83', 7972, 8],
    [16, '1.0085', '99.60', 4964, 6]
    ],
  },
  {
    ref: '014_Al-225.md',
    crystal: AL225(1.0, 0.6),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62638, 6],
    [8, '1.4262', '65.38', 17760, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [12, '1.1645', '82.83', 7972, 8],
    [16, '1.0085', '99.60', 4964, 6]
    ],
  },
  {
    ref: '015_Al-225.md',
    crystal: AL225(1.0, 0.4),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62638, 6],
    [8, '1.4262', '65.38', 17760, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [12, '1.1645', '82.83', 7972, 8],
    [16, '1.0085', '99.60', 4964, 6]
    ],
  },
  {
    ref: '016_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54178,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.66', 100000, 8],
    [4, '2.0170', '44.94', 62635, 6],
    [8, '1.4262', '65.44', 17759, 12],
    [11, '1.2163', '78.66', 9435, 24],
    [12, '1.1645', '82.91', 7977, 8],
    [16, '1.0085', '99.71', 4974, 6]
    ],
  },
  {
    ref: '017_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.93604,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 26,
    orbits: [
    [3, '2.3290', '49.12', 100000, 8],
    [4, '2.0170', '57.36', 61684, 6],
    [8, '1.4262', '85.49', 19029, 12]
    ],
  },
  {
    ref: '018_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.93736,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 26,
    note: '存档把 λ 标成 FeKα1 1.93604，但其 2θ 列 (49.16/57.41/85.56) 只可能是 Fe Kα 加权 1.93736；按 2θ 定案为 1.93736（web 侧已修 G5 色散覆盖，见 §8.28）。',
    orbits: [
    [3, '2.3290', '49.16', 100000, 8],
    [4, '2.0170', '57.41', 61682, 6],
    [8, '1.4262', '85.56', 19042, 12]
    ],
  },
  {
    ref: '019_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 0.7193,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 644,
    orbits: [
    [3, '2.3290', '17.77', 100000, 8],
    [4, '2.0170', '20.54', 64894, 6],
    [8, '1.4262', '29.21', 20349, 12],
    [11, '1.2163', '34.40', 10801, 24],
    [12, '1.1645', '35.98', 8939, 8],
    [16, '1.0085', '41.79', 4505, 6],
    [19, '0.9254', '45.74', 2848, 24],
    [20, '0.9020', '47.00', 2465, 24],
    [24, '0.8234', '51.80', 1429, 24],
    [27, '0.7763', '55.20', 980, 32],
    [32, '0.7131', '60.58', 548, 12],
    [35, '0.6819', '63.67', 397, 48],
    [36, '0.6723', '64.68', 358, 30],
    [40, '0.6378', '68.65', 241, 24],
    [43, '0.6152', '71.56', 182, 24],
    [44, '0.6081', '72.51', 167, 24],
    [48, '0.5822', '76.30', 119, 8],
    [51, '0.5649', '79.09', 93, 48],
    [52, '0.5594', '80.02', 86, 24],
    [56, '0.5391', '83.70', 65, 48],
    [59, '0.5252', '86.44', 53, 72],
    [64, '0.5042', '91.00', 39, 6],
    [67, '0.4928', '93.74', 32, 24],
    [68, '0.4892', '94.65', 31, 48],
    [72, '0.4754', '98.32', 25, 36]
    ],
  },
  {
    ref: '020_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 0.71073,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 700,
    orbits: [
    [3, '2.3290', '17.55', 100000, 8],
    [4, '2.0170', '20.30', 64913, 6],
    [8, '1.4262', '28.86', 20377, 12],
    [11, '1.2163', '33.98', 10824, 24],
    [12, '1.1645', '35.54', 8960, 8],
    [16, '1.0085', '41.27', 4520, 6],
    [19, '0.9254', '45.16', 2859, 24],
    [20, '0.9020', '46.40', 2475, 24],
    [24, '0.8234', '51.13', 1436, 24],
    [27, '0.7763', '54.48', 984, 32],
    [32, '0.7131', '59.78', 551, 12],
    [35, '0.6819', '62.82', 399, 48],
    [36, '0.6723', '63.82', 359, 30],
    [40, '0.6378', '67.72', 242, 24],
    [43, '0.6152', '70.57', 183, 24],
    [44, '0.6081', '71.51', 167, 24],
    [48, '0.5822', '75.23', 119, 8],
    [51, '0.5649', '77.97', 93, 48],
    [52, '0.5594', '78.88', 86, 24],
    [56, '0.5391', '82.48', 64, 48],
    [59, '0.5252', '85.17', 52, 72],
    [64, '0.5042', '89.62', 38, 6],
    [67, '0.4928', '92.29', 32, 24],
    [68, '0.4892', '93.18', 30, 48],
    [72, '0.4754', '96.75', 24, 36],
    [75, '0.4658', '99.44', 21, 56]
    ],
  },
  {
    ref: '021_Al-226.md',
    crystal: AL226(1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 32,
    orbits: [
    [4, '2.0170', '44.90', 100000, 6],
    [8, '1.4262', '65.38', 28353, 12],
    [12, '1.1645', '82.83', 12727, 8],
    [16, '1.0085', '99.60', 7925, 6]
    ],
  },
  {
    ref: '022_Al-227.md',
    crystal: AL227(1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 50,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [8, '1.4262', '65.38', 35520, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [16, '1.0085', '99.60', 9928, 6]
    ],
  },
  {
    ref: '025_NaCl-225.md',
    crystal: NACL(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 168,
    orbits: [
    [3, '3.2447', '27.47', 6829, 8],
    [4, '2.8100', '31.82', 100000, 6],
    [8, '1.9870', '45.62', 30804, 12],
    [11, '1.6945', '54.08', 481, 24],
    [12, '1.6224', '56.69', 14050, 8],
    [16, '1.4050', '66.49', 7767, 6],
    [19, '1.2893', '73.37', 220, 24],
    [20, '1.2567', '75.61', 4897, 24],
    [24, '1.1472', '84.36', 3437, 24],
    [27, '1.0816', '90.83', 170, 32]
    ],
  },
  {
    ref: '026_NaCl-225.md',
    crystal: NACL(1.0, 0.5),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 168,
    orbits: [
    [3, '3.2447', '27.47', 7169, 8],
    [4, '2.8100', '31.82', 100000, 6],
    [8, '1.9870', '45.62', 31373, 12],
    [11, '1.6945', '54.08', 627, 24],
    [12, '1.6224', '56.69', 14582, 8],
    [16, '1.4050', '66.49', 8224, 6],
    [19, '1.2893', '73.37', 328, 24],
    [20, '1.2567', '75.61', 5294, 24],
    [24, '1.1472', '84.36', 3798, 24],
    [27, '1.0816', '90.83', 275, 32]
    ],
  },
  {
    ref: '027_NaCl-225.md',
    crystal: NACL(1.0, 0.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 168,
    orbits: [
    [3, '3.2447', '27.47', 7514, 8],
    [4, '2.8100', '31.82', 100000, 6],
    [8, '1.9870', '45.62', 31964, 12],
    [11, '1.6945', '54.08', 798, 24],
    [12, '1.6224', '56.69', 15149, 8],
    [16, '1.4050', '66.49', 8722, 6],
    [19, '1.2893', '73.37', 467, 24],
    [20, '1.2567', '75.61', 5740, 24],
    [24, '1.1472', '84.36', 4214, 24],
    [27, '1.0816', '90.83', 420, 32]
    ],
  },
  {
    ref: '028_NaCl-225.md',
    crystal: NACL(0.5, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 168,
    orbits: [
    [3, '3.2447', '27.47', 6443, 8],
    [4, '2.8100', '31.82', 100000, 6],
    [8, '1.9870', '45.62', 31231, 12],
    [11, '1.6945', '54.08', 377, 24],
    [12, '1.6224', '56.69', 14436, 8],
    [16, '1.4050', '66.49', 8082, 6],
    [19, '1.2893', '73.37', 155, 24],
    [20, '1.2567', '75.61', 5156, 24],
    [24, '1.1472', '84.36', 3659, 24],
    [27, '1.0816', '90.83', 114, 32]
    ],
  },
  {
    ref: '029_NaCl-225.md',
    crystal: NACL(0.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 168,
    orbits: [
    [3, '3.2447', '27.47', 6069, 8],
    [4, '2.8100', '31.82', 100000, 6],
    [8, '1.9870', '45.62', 31674, 12],
    [11, '1.6945', '54.08', 283, 24],
    [12, '1.6224', '56.69', 14847, 8],
    [16, '1.4050', '66.49', 8425, 6],
    [19, '1.2893', '73.37', 98, 24],
    [20, '1.2567', '75.61', 5444, 24],
    [24, '1.1472', '84.36', 3912, 24],
    [27, '1.0816', '90.83', 66, 32]
    ],
  },
  {
    ref: '030_NaCl-225.md',
    crystal: NACL(0.0, 0.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 168,
    orbits: [
    [3, '3.2447', '27.47', 6722, 8],
    [4, '2.8100', '31.82', 100000, 6],
    [8, '1.9870', '45.62', 32818, 12],
    [11, '1.6945', '54.08', 537, 24],
    [12, '1.6224', '56.69', 15947, 8],
    [16, '1.4050', '66.49', 9392, 6],
    [19, '1.2893', '73.37', 279, 24],
    [20, '1.2567', '75.61', 6308, 24],
    [24, '1.1472', '84.36', 4717, 24],
    [27, '1.0816', '90.83', 244, 32]
    ],
  },
  {
    ref: '031_NaCl-225.md',
    crystal: NACL(0.0, 0.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:false, Lp:true, Ps:true },
    q: 0.1,
    rows: 168,
    orbits: [
    [3, '3.2447', '27.47', 6722, 8],
    [4, '2.8100', '31.82', 100000, 6],
    [8, '1.9870', '45.62', 32818, 12],
    [11, '1.6945', '54.08', 537, 24],
    [12, '1.6224', '56.69', 15947, 8],
    [16, '1.4050', '66.49', 9392, 6],
    [19, '1.2893', '73.37', 279, 24],
    [20, '1.2567', '75.61', 6308, 24],
    [24, '1.1472', '84.36', 4717, 24],
    [27, '1.0816', '90.83', 244, 32]
    ],
  },
  {
    ref: '032_NaCl-225.md',
    crystal: NACL(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:false, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 168,
    orbits: [
    [3, '3.2447', '27.47', 6461, 8],
    [4, '2.8100', '31.82', 100000, 6],
    [8, '1.9870', '45.62', 30535, 12],
    [11, '1.6945', '54.08', 421, 24],
    [12, '1.6224', '56.69', 13826, 8],
    [16, '1.4050', '66.49', 7596, 6],
    [19, '1.2893', '73.37', 192, 24],
    [20, '1.2567', '75.61', 4762, 24],
    [24, '1.1472', '84.36', 3325, 24],
    [27, '1.0816', '90.83', 150, 32]
    ],
  },
  {
    ref: '033_Al-225.md',
    crystal: AL225(0.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:false, Th:true, Lp:false, Ps:false },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 90215, 6],
    [8, '1.4262', '65.38', 66862, 12],
    [11, '1.2163', '78.59', 55274, 24],
    [12, '1.1645', '82.83', 52009, 8],
    [16, '1.0085', '99.60', 41184, 6]
    ],
  },
  {
    ref: '034_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 0.7193,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 644,
    orbits: [
    [3, '2.3290', '17.77', 100000, 8],
    [4, '2.0170', '20.54', 64894, 6],
    [8, '1.4262', '29.21', 20349, 12],
    [11, '1.2163', '34.40', 10801, 24],
    [12, '1.1645', '35.98', 8939, 8],
    [16, '1.0085', '41.79', 4505, 6],
    [19, '0.9254', '45.74', 2848, 24],
    [20, '0.9020', '47.00', 2465, 24],
    [24, '0.8234', '51.80', 1429, 24],
    [27, '0.7763', '55.20', 980, 32],
    [32, '0.7131', '60.58', 548, 12],
    [35, '0.6819', '63.67', 397, 48],
    [36, '0.6723', '64.68', 358, 30],
    [40, '0.6378', '68.65', 241, 24],
    [43, '0.6152', '71.56', 182, 24],
    [44, '0.6081', '72.51', 167, 24],
    [48, '0.5822', '76.30', 119, 8],
    [51, '0.5649', '79.09', 93, 48],
    [52, '0.5594', '80.02', 86, 24],
    [56, '0.5391', '83.70', 65, 48],
    [59, '0.5252', '86.44', 53, 72],
    [64, '0.5042', '91.00', 39, 6],
    [67, '0.4928', '93.74', 32, 24],
    [68, '0.4892', '94.65', 31, 48],
    [72, '0.4754', '98.32', 25, 36]
    ],
  },
  {
    ref: '035_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 0.7193,
    flags: { Fd:false, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 644,
    orbits: [
    [3, '2.3290', '17.77', 100000, 8],
    [4, '2.0170', '20.54', 64845, 6],
    [8, '1.4262', '29.21', 20284, 12],
    [11, '1.2163', '34.40', 10748, 24],
    [12, '1.1645', '35.98', 8890, 8],
    [16, '1.0085', '41.79', 4469, 6],
    [19, '0.9254', '45.74', 2820, 24],
    [20, '0.9020', '47.00', 2439, 24],
    [24, '0.8234', '51.80', 1411, 24],
    [27, '0.7763', '55.20', 965, 32],
    [32, '0.7131', '60.58', 538, 12],
    [35, '0.6819', '63.67', 389, 48],
    [36, '0.6723', '64.68', 350, 30],
    [40, '0.6378', '68.65', 235, 24],
    [43, '0.6152', '71.56', 178, 24],
    [44, '0.6081', '72.51', 162, 24],
    [48, '0.5822', '76.30', 115, 8],
    [51, '0.5649', '79.09', 90, 48],
    [52, '0.5594', '80.02', 84, 24],
    [56, '0.5391', '83.70', 62, 48],
    [59, '0.5252', '86.44', 51, 72],
    [64, '0.5042', '91.00', 37, 6],
    [67, '0.4928', '93.74', 31, 24],
    [68, '0.4892', '94.65', 29, 48],
    [72, '0.4754', '98.32', 24, 36]
    ],
  },
  {
    ref: '036_Al-225.md',
    crystal: AL225(1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:false, Th:true, Lp:false, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 87485, 6],
    [8, '1.4262', '65.38', 57340, 12],
    [11, '1.2163', '78.59', 43228, 24],
    [12, '1.1645', '82.83', 39444, 8],
    [16, '1.0085', '99.60', 27622, 6]
    ],
  },
];

/**
 * NOT YET PINNED — waiting on a re-capture from the original program.
 *
 * 023_Al-75.md / 024_Al-76.md record space groups 75(P4) / 76(P41) with a =
 * 4.0339, but their printed tables are byte-identical to 001 (225 Fm-3m):
 * same 64 rows, only FCC-allowed families {111}{200}{220}{311}{222}{400}.
 * A genuine P4 run with Al on 4a (0,0,z) has no systematic absences at all, so
 * it must list {100} at 2θ ≈ 22.02° as its strongest line — the engine does
 * exactly that (256 rows, 14 families). The captures therefore do not describe
 * a 75/76 run at all; the header block says P4/P41 while the body says Fm-3m.
 *
 * Either the capture script failed to commit the space-group change, or the
 * shipped program falls back to the previously loaded cubic expansion for
 * non-cubic groups. Both are resolved by one re-capture — see
 * `docs/SETTLED.md` §8.29.
 */
const PENDING_CASES: readonly LegacyCase[] = [
  {
    ref: '023_Al-75.md',
    crystal: AL('75(P4)', 75, 'P4', 1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62638, 6],
    [8, '1.4262', '65.38', 17760, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [12, '1.1645', '82.83', 7972, 8],
    [16, '1.0085', '99.60', 4964, 6]
    ],
  },
  {
    ref: '024_Al-76.md',
    crystal: AL('76(P41)', 76, 'P41', 1.0, 1.0),
    lambda: 1.54056,
    flags: { Fd:true, Th:true, Lp:true, Ps:true },
    q: 0.1,
    rows: 64,
    orbits: [
    [3, '2.3290', '38.63', 100000, 8],
    [4, '2.0170', '44.90', 62638, 6],
    [8, '1.4262', '65.38', 17760, 12],
    [11, '1.2163', '78.59', 9431, 24],
    [12, '1.1645', '82.83', 7972, 8],
    [16, '1.0085', '99.60', 4964, 6]
    ],
  },
];

describe('legacy single-XRD 存档逐值复现（测试即原始数据载体）', () => {
  for (const c of VERIFIED_CASES) {
    it(`${c.ref} — ${c.rows} 行 / ${c.orbits.length} 族全表逐值命中`, () => {
      assertCase(c);
    });
  }

  for (const c of PENDING_CASES) {
    it.skip(`${c.ref} — 待原程序复采确认（存档与 225 输出逐字节相同）`, () => {
      assertCase(c);
    });
  }
});
