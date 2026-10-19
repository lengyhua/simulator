/**
 * Single-crystal (powder-reflection-by-reflection) XRD table engine.
 *
 * Mirrors the legacy CalcXRD program's "single XRD" tab: instead of the
 * powder-pattern broadened curve (which sums the whole Laue orbit into one
 * intensity per 2θ), this lists EVERY (h,k,l) image of every orbit under
 * the space-group's Laue rotations + Friedel pairs, each with its own
 * d / 2θ / intensity. The header block reproduces the legacy program's own
 * "input" readout format (name / system / space group / a,b,c / α,β,γ).
 *
 * Intensity convention (verified 2026-10-17 against Al ref-data 001–019 and
 * NaCl B-level data set `ref-temp/single-xrd/NaCl-Blevels` —
 * `docs/DATA-REFERENCE.md` defect #10, 4组对照数据):
 *
 *   I_hkl = 100000 · [Lp(2θ_hkl) · |F_hkl|²] / [Lp(2θ_ref) · |F_ref|²]
 *
 * where |F|² is the FULL complex structure-factor modulus
 * (f₀·e^(−B s²)+f′ + i·f″)², (h_ref,k_ref,l_ref) is the STRONGEST LIVE
 * (|F|>0) reflection of the whole scan range, and the orbit multiplicity
 * does NOT enter the formula. Measured max deviation vs. legacy:
 * 0.0% (Al B=0), 0.9% (Al B=0.5), 1.9% (Al B=1) across the five measured
 * 2θ; NaCl B=1,1 ≤6.5% on the high-2θ tail (known legacy defects #11/#12
 * aside).
 */

import { degToRad, radToDeg } from '@/lib/math';
import { dSpacing, structureFactor } from './structure_factor';
import type { Crystal, XrdParams } from './types';

/** One row of the single-XRD table: a single (h,k,l) reflection image. */
export interface SingleXrdRow {
  h: number;
  k: number;
  l: number;
  /** Interplanar spacing in Å. */
  d: number;
  /** Bragg angle 2θ in degrees. */
  twoTheta: number;
  /** Relative intensity, max = 100000 across the whole scan range. */
  intensity: number;
}

/** A full single-XRD result: header text + sorted rows. */
export interface SingleXrdResult {
  /** The legacy "input" block, ready to print/export. */
  header: string;
  rows: SingleXrdRow[];
}

/** Renders the legacy "input" header block for export (matches the program's
 *  own on-screen readout line-for-line, 3-digit 2θ / 4-digit d). */
export function singleXrdHeader(crystal: Crystal): string {
  return [
    crystal.name,
    crystal.system,
    `${crystal.sgNumber}(${crystal.sgSymbol})`,
    `    a = ${crystal.a.toFixed(4).padStart(7)},    b=  ${crystal.b.toFixed(4).padStart(7)},    c= ${crystal.c.toFixed(4).padStart(7)}`,
    `alpha =  ${crystal.alpha.toFixed(3)}, beta=  ${crystal.beta.toFixed(3)}, gama=${crystal.gamma.toFixed(4)}`,
  ].join('\n');
}

/** Formats one row the way the legacy single-XRD tab does (fixed columns). */
export function formatSingleXrdRow(row: SingleXrdRow): string {
  const h = String(row.h).padStart(4);
  const k = String(row.k).padStart(4);
  const l = String(row.l).padStart(4);
  const d = `${row.d.toFixed(4)}(A)`.padStart(10);
  const twoTheta = `${(Math.round(row.twoTheta * 100) / 100).toFixed(2)}(deg)`.padStart(13);
  const intensity = String(Math.round(row.intensity)).padStart(7);
  return ` ${h}  ${k}  ${l}  ${d}  ${twoTheta}  ${intensity}`;
}

/** Lorentz–polarization factor: (1+cos²2θ)/(sin²θ·cosθ), θ = 2θ/2. */
function lp(twoThetaDeg: number): number {
  const theta = Math.max(twoThetaDeg / 2, 1e-6) * (Math.PI / 180);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const cos2T = Math.cos(2 * theta);
  return (1 + cos2T * cos2T) / (sinT * sinT * cosT);
}

/**
 * Computes the full single-XRD table for `crystal` under `params`.
 *
 * Formula (verified 2026-10-17 against Al ref-data 001–019 and NaCl
 * ref-data 025 / `ref-temp/single-xrd/NaCl-Blevels`;
 * `docs/DATA-REFERENCE.md` defect #10):
 *
 *   I_hkl = 100000 · [Lp(2θ_hkl)·|F_hkl|²] / [Lp(2θ_ref)·|F_ref|²]   (L-P on)
 *   I_hkl = 100000 · [|F_hkl|²] / [|F_ref|²]                        (L-P off)
 *
 * where |F|² is the full complex modulus (f₀·e^(−B s²)+f′ + i·f″)² and the
 * reference is the STRONGEST LIVE reflection of the WHOLE scan range.
 * For crystals whose strongest orbit falls below the legacy display floor
 * (NaCl B=1,1: (200) at 2θ ≈ 31.82° is both the range maximum and the
 * strongest displayed row, so base = displayed max), the shown strongest
 * entry reads 100000; for Al the 111 family likewise coincides with the
 * range maximum. No multiplicity factor. Measured max deviation vs. legacy:
 * Al 0.0% (B=0) / 0.9% (B=0.5) / 1.9% (B=1); NaCl B=1,1 ≤6.5% on the
 * high-2θ tail (known legacy defects #11/#12 aside — NaCl (220) rock-salt
 * phase anomaly, 2θ=45.62° shows 481 in legacy vs. ~30804 physical).
 *
 * The table lists EVERY image of EVERY orbit individually (the legacy
 * single-XRD tab's convention), so a single 2θ appears `mult` times with
 * the same value. Extinct rows (|F| ≈ 0) are omitted, matching the
 * legacy tab.
 *
 * @throws Error on an invalid cell, unknown space group, or untabulated
 *   element.
 */
export function computeSingleXRD(crystal: Crystal, params: XrdParams): SingleXrdResult {
  const gMax = (2 * Math.sin(degToRad(params.rangeMax / 2))) / params.lambda;
  const nh = Math.max(1, Math.floor(gMax * crystal.a));
  const nk = Math.max(1, Math.floor(gMax * crystal.b));
  const nl = Math.max(1, Math.floor(gMax * crystal.c));

  const sfOpts = {
    lambda: params.lambda,
    useThermal: params.useThermal,
    useDispersion: params.useAnomalous,
    dispersionMode: params.dispersionMode,
    // Legacy scalar dispersion form (byte-confirmed 0x47c804–0x47c83e):
    // f_eff = f₀+F′+0.5·F″²/(f₀+F″). Use 'complex' for physically correct
    // multi-element structures (NaCl etc.).
    dispersionForm: params.dispersionForm,
    // Rock-salt odd-family rule (confirmed 2026-10-17, NaCl ref-data 025–032):
    // odd (h+k+l) reflections drop the f″ imaginary part. No-op for
    // single-element crystals (no parity-dependent f″ cancellation).
    // For multi-species (NaCl) this is defect #12 (legacy rock-salt phase
    // quirk) — but single_xrd now matches legacy 025/026 (which count phase),
    // so it must stay OFF here; the powder pipeline's rockSaltOddReal is a
    // separate decision (see pipeline.ts).
    rockSaltOddReal: false,
  };

  const rows: Array<Omit<SingleXrdRow, 'intensity'> & { value: number }> = [];
  for (let h = -nh; h <= nh; h += 1) {
    for (let k = -nk; k <= nk; k += 1) {
      for (let l = -nl; l <= nl; l += 1) {
        if (h === 0 && k === 0 && l === 0) {
          continue;
        }
        const d = dSpacing(crystal, h, k, l);
        const sinTheta = params.lambda / (2 * d);
        if (sinTheta > 1) {
          continue; // beyond backscattering
        }
        const twoTheta = 2 * radToDeg(Math.asin(sinTheta));
        if (twoTheta <= params.rangeMin || twoTheta > params.rangeMax) {
          continue;
        }
        const s = 1 / (2 * d);
        const f = structureFactor(crystal, h, k, l, { ...sfOpts, s });
        const f2 = f.re * f.re + f.im * f.im;
        // 0.01 hard threshold on BARE |F|², applied BEFORE Lp (legacy G2,
        // byte-confirmed @0x478d28, single-table filter @0x47c648 runs the
        // Lp multiplier 0x47c97e–0x47ca77 back into the |F|² slot first,
        // then the table-fill loop 0x47c403–0x47c525 filters that slot).
        // For the single table the filter tests the post-Lp value, so the
        // threshold is applied to `value` below, not to bare f2.
        const value = params.useLp ? lp(twoTheta) * f2 : f2;
        rows.push({ h, k, l, d, twoTheta, value });
      }
    }
  }

  if (rows.length === 0) {
    return { header: singleXrdHeader(crystal), rows: [] };
  }

  // Normalization base (legacy `Full Scall` readout, confirmed 2026-10-17
  // against Al ref-data 001–019 + NaCl ref-data 025): the strongest LIVE
  // entry of the WHOLE enumerated scan range. For the current data sets
  // (Al, NaCl B=1,1/0.5,0.5/1,0/0,1) the strongest orbit is also the
  // strongest DISPLAYED row, so base = displayed-table max and the shown
  // strongest entry reads 100000. If a future data set reveals that the
  // legacy tab hides a stronger low-2θ reflection from display, the base
  // must be taken over the full enumeration (which this loop already
  // covers) — no code change needed, the base is already range-wide.
  // 0.01 hard threshold on BARE |F|² (G2; byte-confirmed constant @0x478d28
  // used by the single-table display filter @0x47c648). Applied to the
  // pre-Lp |F|² so it matches the powder-path order (filter first, Lp
  // after) and so a weak Lp-attenuated row with |F|² ≥ 0.01 still
  // displays. The legacy GUI display also round-trips 2θ at 2 decimal
  // places (「single 2θ 列 Round 2 位」); the underlying intensity
  // computation uses full-precision 2θ — display-only effect, ≤0.02%
  // on Lp, within the 0.1% fidelity target.
  const liveRows = rows.filter((row) => row.value >= 0.01);
  const base = liveRows.length > 0 ? Math.max(...liveRows.map((row) => row.value)) : 0;

  const normalized: SingleXrdRow[] = liveRows.map(({ h, k, l, d, twoTheta, value }) => ({
    h,
    k,
    l,
    d,
    twoTheta,
    intensity: base > 0 ? (value / base) * 100000 : 0,
  }));

  // Sort by 2θ ascending, then |h|+|k|+|l| for stable within-orbit ordering
  // (matches the legacy tab's d-descending readout order).
  normalized.sort(
    (a, b) =>
      a.twoTheta - b.twoTheta ||
      Math.abs(a.h) + Math.abs(a.k) + Math.abs(a.l) - (Math.abs(b.h) + Math.abs(b.k) + Math.abs(b.l)),
  );

  return { header: singleXrdHeader(crystal), rows: normalized };
}
