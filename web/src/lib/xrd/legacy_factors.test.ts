/**
 * Legacy "Search Factor" window — 18 archived CalcXRD.exe captures.
 *
 * POLICY (user decision 2026-10-20): these values used to live in
 * `docs/archive/ref-data/factors/*.rtf`. They are transcribed HERE so the captures can be
 * archived away; this file is now the record.
 *
 * What each capture gives us, and why it is worth pinning:
 *
 * 1. The element's own Cromer–Mann coefficients (a1..a5 / b1..b5 / c) — the
 *    legacy program prints them, and they reproduce Factor.dat exactly.
 *    (Cosmetic legacy bug: the RTF labels all five b's "b1".)
 * 2. `DeltaF1` / `DeltaF2` = the f′ / f″ the program actually applies for that
 *    element + target. These pin the λ → FF.dat column mapping, and they are
 *    what uncovered two engine defects (see `dispersion.ts`):
 *      - the Kα *weighted* items read the **Kα₂** column (Al: CuKa1 0.212 vs
 *        CuKa 0.213; MoKa1 0.064 vs MoKa 0.065; FeKa1 f″ 0.381 vs FeKa 0.382);
 *      - both Fe Kα items read a **Co** column (FeKa1 → Co Kα₁, FeKa → Co Kα₂).
 * 3. A 101-row table of `2θ / sinθ/λ / F₀ / F₀ after F1 & F2`. The last column
 *    is the legacy dispersion formula evaluated by the program itself:
 *
 *        F₀corr = F₀ + F′ + 0.5·F″² / (F₀ + F″)
 *
 *    i.e. the byte-confirmed M3 form (no +F″ linear term, denominator F₀+F″).
 *    Pinning three rows per capture (first / middle / last) verifies f₀(s),
 *    the f′/f″ lookup, and the dispersion formula all at once, to the 1e-7
 *    relative accuracy the legacy 32-bit Single printout allows.
 */

import { describe, expect, it } from 'vitest';

import { f0, getCoefficients } from '@/lib/xrd/cronie';
import { getDispersion } from '@/lib/xrd/dispersion';

interface FactorCase {
  /** Source capture filename (archived `docs/archive/ref-data/factors/<ref>`). */
  ref: string;
  /** Species key as written in the .cord file: 'Al' | 'Na1+' | 'Cl1-'. */
  element: string;
  /** Legacy dropdown item, e.g. 'CuKa1' | 'CuKa' | 'FeKa'. */
  target: string;
  lambda: number;
  /** Cromer–Mann amplitudes a1..a5. */
  a: readonly number[];
  /** Cromer–Mann exponents b1..b5. */
  b: readonly number[];
  c: number;
  /** Legacy `DeltaF1` readout. */
  fPrime: number;
  /** Legacy `DeltaF2` readout. */
  fDoublePrime: number;
  /** Row count of the legacy table (always 101: 2θ in 0.01° steps). */
  rows: number;
  /** [2θ, sinθ/λ, F₀, F₀ after F1 & F2] — first / middle / last row. */
  samples: ReadonlyArray<readonly [number, string, string, string]>;
}

const CASES: readonly FactorCase[] = [
  {
    ref: '001-Al.rtf',
    element: 'Al',
    target: 'MoKa1',
    lambda: 0.7193,
    a: [4.730796, 2.313951, 1.54198, 1.117564, 3.154754],
    b: [3.628931, 43.051167, 0.09596, 108.932388, 1.555918],
    c: 0.139509,
    fPrime: 0.064,
    fDoublePrime: 0.052,
    rows: 101,
    samples: [
      [26.0, '0.31273607', '7.728231109', '7.792404883'],
      [26.5, '0.31864367', '7.662303398', '7.726478657'],
      [27.0, '0.32454520', '7.596698504', '7.660875266']
    ],
  },
  {
    ref: '002-Al.rtf',
    element: 'Al',
    target: 'CuKa1',
    lambda: 1.54056,
    a: [4.730796, 2.313951, 1.54198, 1.117564, 3.154754],
    b: [3.628931, 43.051167, 0.09596, 108.932388, 1.555918],
    c: 0.139509,
    fPrime: 0.212,
    fDoublePrime: 0.246,
    rows: 101,
    samples: [
      [33.0, '0.18435851', '9.413789035', '9.628921401'],
      [33.5, '0.18707241', '9.368066668', '9.583213931'],
      [34.0, '0.18978274', '9.323090975', '9.538253031']
    ],
  },
  {
    ref: '003-Al.rtf',
    element: 'Al',
    target: 'CuKa',
    lambda: 1.54178,
    a: [4.730796, 2.313951, 1.54198, 1.117564, 3.154754],
    b: [3.628931, 43.051167, 0.09596, 108.932388, 1.555918],
    c: 0.139509,
    fPrime: 0.213,
    fDoublePrime: 0.246,
    rows: 101,
    samples: [
      [36.0, '0.20042872', '9.152726797', '9.368946169'],
      [36.5, '0.20311835', '9.111186238', '9.327419902'],
      [37.0, '0.20580411', '9.070274169', '9.286522034']
    ],
  },
  {
    ref: '004-Al.rtf',
    element: 'Al',
    target: 'FeKa1',
    lambda: 1.93604,
    a: [4.730796, 2.313951, 1.54198, 1.117564, 3.154754],
    b: [3.628931, 43.051167, 0.09596, 108.932388, 1.555918],
    c: 0.139509,
    fPrime: 0.279,
    fDoublePrime: 0.381,
    rows: 101,
    samples: [
      [47.0, '0.20596117', '9.067898811', '9.354580182'],
      [47.5, '0.20802602', '9.036844930', '9.323551629'],
      [48.0, '0.21008690', '9.006166647', '9.292898533']
    ],
  },
  {
    ref: '005-Al.rtf',
    element: 'Al',
    target: 'FeKa',
    lambda: 1.93736,
    a: [4.730796, 2.313951, 1.54198, 1.117564, 3.154754],
    b: [3.628931, 43.051167, 0.09596, 108.932388, 1.555918],
    c: 0.139509,
    fPrime: 0.279,
    fDoublePrime: 0.382,
    rows: 101,
    samples: [
      [55.0, '0.23833909', '8.613388378', '8.900499423'],
      [55.5, '0.24033454', '8.587331548', '8.874466157'],
      [56.0, '0.24232541', '8.561521983', '8.848680066']
    ],
  },
  {
    ref: '006-Al.rtf',
    element: 'Al',
    target: 'MoKa',
    lambda: 0.71073,
    a: [4.730796, 2.313951, 1.54198, 1.117564, 3.154754],
    b: [3.628931, 43.051167, 0.09596, 108.932388, 1.555918],
    c: 0.139509,
    fPrime: 0.065,
    fDoublePrime: 0.052,
    rows: 101,
    samples: [
      [43.0, '0.51566872', '5.530882641', '5.596124809'],
      [43.5, '0.52137582', '5.472605260', '5.537849984'],
      [44.0, '0.52707300', '5.414793995', '5.480041306']
    ],
  },
  {
    ref: '007-Na+.rtf',
    element: 'Na1+',
    target: 'CuKa1',
    lambda: 1.54056,
    a: [3.14869, 4.073989, 0.767888, 0.995612, 0.968249],
    b: [2.594987, 6.046925, 0.070139, 14.122657, 0.217037],
    c: 0.0453,
    fPrime: 0.136,
    fDoublePrime: 0.124,
    rows: 101,
    samples: [
      [53.0, '0.28963352', '7.049808337', '7.186880013'],
      [53.5, '0.29216547', '7.011738584', '7.148815977'],
      [54.0, '0.29469187', '6.973784659', '7.110867814']
    ],
  },
  {
    ref: '008-Na+.rtf',
    element: 'Na1+',
    target: 'CuKa',
    lambda: 1.54178,
    a: [3.14869, 4.073989, 0.767888, 0.995612, 0.968249],
    b: [2.594987, 6.046925, 0.070139, 14.122657, 0.217037],
    c: 0.0453,
    fPrime: 0.136,
    fDoublePrime: 0.124,
    rows: 101,
    samples: [
      [36.0, '0.20042872', '8.367788907', '8.504694252'],
      [36.5, '0.20311835', '8.330033916', '8.466943304'],
      [37.0, '0.20580411', '8.292126070', '8.429039555']
    ],
  },
  {
    ref: '009-Na+.rtf',
    element: 'Na1+',
    target: 'FeKa1',
    lambda: 1.93604,
    a: [3.14869, 4.073989, 0.767888, 0.995612, 0.968249],
    b: [2.594987, 6.046925, 0.070139, 14.122657, 0.217037],
    c: 0.0453,
    fPrime: 0.186,
    fDoublePrime: 0.195,
    rows: 101,
    samples: [
      [59.0, '0.25434576', '7.580914891', '7.769359941'],
      [59.5, '0.25630488', '7.551533403', '7.739987727'],
      [60.0, '0.25825913', '7.522198768', '7.710662421']
    ],
  },
  {
    ref: '010-Na+.rtf',
    element: 'Na1+',
    target: 'FeKa',
    lambda: 1.93736,
    a: [3.14869, 4.073989, 0.767888, 0.995612, 0.968249],
    b: [2.594987, 6.046925, 0.070139, 14.122657, 0.217037],
    c: 0.0453,
    fPrime: 0.186,
    fDoublePrime: 0.195,
    rows: 101,
    samples: [
      [58.0, '0.25024240', '7.642356003', '7.830781885'],
      [58.5, '0.25220983', '7.612914526', '7.801349555'],
      [59.0, '0.25417246', '7.583512488', '7.771956721']
    ],
  },
  {
    ref: '011-Na+.rtf',
    element: 'Na1+',
    target: 'MoKa1',
    lambda: 0.7193,
    a: [3.14869, 4.073989, 0.767888, 0.995612, 0.968249],
    b: [2.594987, 6.046925, 0.070139, 14.122657, 0.217037],
    c: 0.0453,
    fPrime: 0.037,
    fDoublePrime: 0.025,
    rows: 101,
    samples: [
      [52.0, '0.60944133', '3.324098436', '3.361191745'],
      [52.5, '0.61488765', '3.284343662', '3.321438091'],
      [53.0, '0.62032228', '3.245403735', '3.282499289']
    ],
  },
  {
    ref: '012-Na+.rtf',
    element: 'Na1+',
    target: 'MoKa',
    lambda: 0.71073,
    a: [3.14869, 4.073989, 0.767888, 0.995612, 0.968249],
    b: [2.594987, 6.046925, 0.070139, 14.122657, 0.217037],
    c: 0.0453,
    fPrime: 0.037,
    fDoublePrime: 0.025,
    rows: 101,
    samples: [
      [55.0, '0.64968218', '3.047243941', '3.084345658'],
      [55.5, '0.65512152', '3.012719636', '3.049822509'],
      [56.0, '0.66054840', '2.978932406', '3.016036437']
    ],
  },
  {
    ref: '013-Cl-.rtf',
    element: 'Cl1-',
    target: 'CuKa1',
    lambda: 1.54056,
    a: [1.061802, 7.139886, 6.524271, 2.355626, 35.829403],
    b: [0.144727, 1.171795, 19.467655, 60.320301, 0.000436],
    c: -34.916603,
    fPrime: 0.364,
    fDoublePrime: 0.703,
    rows: 101,
    samples: [
      [41.0, '0.22732473', '11.176301290', '11.561102556'],
      [41.5, '0.22997549', '11.103562142', '11.488491562'],
      [42.0, '0.23262187', '11.031958904', '11.417016029']
    ],
  },
  {
    ref: '014-Cl-.rtf',
    element: 'Cl1-',
    target: 'CuKa',
    lambda: 1.54178,
    a: [1.061802, 7.139886, 6.524271, 2.355626, 35.829403],
    b: [0.144727, 1.171795, 19.467655, 60.320301, 0.000436],
    c: -34.916603,
    fPrime: 0.365,
    fDoublePrime: 0.704,
    rows: 101,
    samples: [
      [54.0, '0.29445868', '9.629026217', '10.018008349'],
      [54.5, '0.29697746', '9.581961772', '9.971053637'],
      [55.0, '0.29949060', '9.535712128', '9.924912808']
    ],
  },
  {
    ref: '015-Cl-.rtf',
    element: 'Cl1-',
    target: 'FeKa1',
    lambda: 1.93604,
    a: [1.061802, 7.139886, 6.524271, 2.355626, 35.829403],
    b: [0.144727, 1.171795, 19.467655, 60.320301, 0.000436],
    c: -34.916603,
    fPrime: 0.39,
    fDoublePrime: 1.062,
    rows: 101,
    samples: [
      [61.0, '0.26215283', '10.299721672', '10.739355171'],
      [61.5, '0.26409221', '10.255771636', '10.695597875'],
      [62.0, '0.26602657', '10.212423516', '10.652441328']
    ],
  },
  {
    ref: '016-Cl-.rtf',
    element: 'Cl1-',
    target: 'FeKa',
    lambda: 1.93736,
    a: [1.061802, 7.139886, 6.524271, 2.355626, 35.829403],
    b: [0.144727, 1.171795, 19.467655, 60.320301, 0.000436],
    c: -34.916603,
    fPrime: 0.39,
    fDoublePrime: 1.063,
    rows: 101,
    samples: [
      [53.0, '0.23031229', '11.094393112', '11.530865616'],
      [53.5, '0.23232566', '11.039923225', '11.476604881'],
      [54.0, '0.23433461', '10.986155494', '11.423045461']
    ],
  },
  {
    ref: '017-Cl-.rtf',
    element: 'Cl1-',
    target: 'MoKa1',
    lambda: 0.7193,
    a: [1.061802, 7.139886, 6.524271, 2.355626, 35.829403],
    b: [0.144727, 1.171795, 19.467655, 60.320301, 0.000436],
    c: -34.916603,
    fPrime: 0.149,
    fDoublePrime: 0.159,
    rows: 101,
    samples: [
      [66.0, '0.75717925', '5.528112243', '5.679334900'],
      [66.5, '0.76225946', '5.494049365', '5.645285415'],
      [67.0, '0.76732516', '5.460157406', '5.611406942']
    ],
  },
  {
    ref: '018-Cl-.rtf',
    element: 'Cl1-',
    target: 'MoKa',
    lambda: 0.71073,
    a: [1.061802, 7.139886, 6.524271, 2.355626, 35.829403],
    b: [0.144727, 1.171795, 19.467655, 60.320301, 0.000436],
    c: -34.916603,
    fPrime: 0.149,
    fDoublePrime: 0.16,
    rows: 101,
    samples: [
      [58.0, '0.68212911', '6.037970496', '6.189035689'],
      [58.5, '0.68749207', '6.001227726', '6.152305234'],
      [59.0, '0.69284195', '5.964609105', '6.115699035']
    ],
  },
];

/** Relative-error assertion against the legacy 32-bit-accurate printout. */
function expectClose(actual: number, expected: string, tag: string): void {
  const want = Number(expected);
  const dev = Math.abs(actual - want) / Math.abs(want);
  expect(dev, `${tag}: web=${actual} legacy=${want} dev=${dev.toExponential(2)}`).toBeLessThan(1e-7);
}

describe('legacy Search Factor 窗口（f₀ 系数 + F′F″ + 色散公式）', () => {
  for (const c of CASES) {
    it(`${c.ref} — ${c.element} / ${c.target}`, () => {
      // 1. Cromer–Mann coefficients come straight from Factor.dat.
      const coeffs = getCoefficients(c.element);
      expect(coeffs, `${c.ref}: 未收录的散射因子物种`).toBeDefined();
      for (let i = 0; i < 5; i += 1) {
        expect(coeffs!.a[i], `${c.ref}: a${i + 1}`).toBeCloseTo(c.a[i], 6);
        expect(coeffs!.b[i], `${c.ref}: b${i + 1}`).toBeCloseTo(c.b[i], 6);
      }
      expect(coeffs!.c, `${c.ref}: c`).toBeCloseTo(c.c, 6);

      // 2. f′/f″ — pins the λ → FF.dat column mapping (weighted → Kα₂,
      //    Fe Kα → Co). Exact: both sides are 3-decimal table values.
      const disp = getDispersion(c.element, c.lambda, 'fidelity');
      expect(disp.supported, `${c.ref}: F′F″ 应受支持`).toBe(true);
      expect(disp.fPrime, `${c.ref}: F′`).toBe(c.fPrime);
      expect(disp.fDoublePrime, `${c.ref}: F″`).toBe(c.fDoublePrime);

      // 3. Three table rows: geometry, f₀(s), and the legacy dispersion form.
      for (const [twoTheta, sStr, f0Str, correctedStr] of c.samples) {
        const s = Math.sin((twoTheta / 2) * (Math.PI / 180)) / c.lambda;
        expectClose(s, sStr, `${c.ref} 2θ=${twoTheta}: sinθ/λ`);
        const bare = f0(c.element, Number(sStr));
        expectClose(bare, f0Str, `${c.ref} 2θ=${twoTheta}: F₀`);
        // Legacy M3 dispersion form (byte-confirmed 0x47c804–0x47c83e).
        const corrected = bare + disp.fPrime + (0.5 * disp.fDoublePrime ** 2) / (bare + disp.fDoublePrime);
        expectClose(corrected, correctedStr, `${c.ref} 2θ=${twoTheta}: F₀ after F1 & F2`);
      }
    });
  }
});
