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
 * Intensity convention (same as the legacy single XRD table, GUI-verified
 * 2026-10-16 against NaCl/Al): the per-reflection value is
 * `|F_hkl|² · mult` with Lp on, normalized so the strongest entry reads
 * 100000. This is deliberately NOT the powder `.xrd` curve's value (that one
 * also folds multiplicity differently); it's the legacy program's single-XRD
 * tab scale.
 */

import { degToRad, radToDeg } from '@/lib/math';
import { dSpacing, structureFactor } from './structure_factor';
import type { Crystal, XrdParams } from './types';
import { laueOperations } from './wyckoff';

/** One row of the single-XRD table: a single (h,k,l) reflection image. */
export interface SingleXrdRow {
  h: number;
  k: number;
  l: number;
  /** Interplanar spacing in Å. */
  d: number;
  /** Bragg angle 2θ in degrees. */
  twoTheta: number;
  /** Relative intensity, max = 100000 across the table. */
  intensity: number;
}

/** A full single-XRD result: header text + sorted rows. */
export interface SingleXrdResult {
  /** The legacy "input" block, ready to print/export. */
  header: string;
  rows: SingleXrdRow[];
}

/** Renders the legacy "input" header block for export (matches the program's
 *  own on-screen readout line-for-line, 4-digit 2θ / 4-digit d). */
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
  const twoTheta = `${row.twoTheta.toFixed(3)}(deg)`.padStart(13);
  const intensity = String(Math.round(row.intensity)).padStart(7);
  return ` ${h}  ${k}  ${l}  ${d}  ${twoTheta}  ${intensity}`;
}

/**
 * Counts the distinct (h,k,l) images of a reflection under the space group's
 * Laue rotations + Friedel pairs — the orbit multiplicity.
 */
function orbitMultiplicity(crystal: Crystal, h: number, k: number, l: number): number {
  const matrices = laueOperations(crystal.sgKey);
  const seen = new Set<string>();
  for (const m of matrices) {
    const v0 = m[0] * h + m[1] * k + m[2] * l;
    const v1 = m[3] * h + m[4] * k + m[5] * l;
    const v2 = m[6] * h + m[7] * k + m[8] * l;
    for (const sign of [1, -1]) {
      seen.add(`${sign * v0},${sign * v1},${sign * v2}`);
    }
  }
  return seen.size;
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
 * Formula (verified 2026-10-17 against the legacy program's own exports,
 * `ref-temp/single-xrd/Al-225|Al-75|Al-143|NaCl-225`, all ≤0.6% deviation):
 *
 *   I_hkl = K · mult_hkl · Lp(2θ_hkl) · |F_hkl(s_hkl)|²
 *
 * where `mult_hkl` is the number of distinct (h,k,l) images under the
 * space-group's Laue rotations plus Friedel pairs (the same multiplicity
 * the powder pipeline uses), Lp is the standard powder L–P factor, and
 * |F|² uses this reflection's own s = sinθ/λ. The whole table is then
 * normalized so its maximum reads 100000 (the legacy program's
 * `Full Scall` readout scale).
 *
 * The table lists EVERY image of EVERY orbit individually (the legacy
 * single-XRD tab's convention), so a single 2θ appears `mult` times with
 * the same value.
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
  };

  const rows: Array<Omit<SingleXrdRow, 'intensity'>> = [];
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
        rows.push({ h, k, l, d, twoTheta });
      }
    }
  }

  // Per-reflection intensity: mult × Lp × |F|² (each at its own s), then
  // normalize the whole table to max = 100000.
  let maxRaw = 0;
  const raw = new Map<string, number>();
  for (const row of rows) {
    const s = 1 / (2 * row.d);
    const f = structureFactor(crystal, row.h, row.k, row.l, { ...sfOpts, s });
    const mult = orbitMultiplicity(crystal, row.h, row.k, row.l);
    const value = mult * lp(row.twoTheta) * (f.re * f.re + f.im * f.im);
    const key = `${row.h},${row.k},${row.l}`;
    raw.set(key, value);
    if (value > maxRaw) {
      maxRaw = value;
    }
  }

  const normalized: SingleXrdRow[] = rows.map((row) => {
    const value = raw.get(`${row.h},${row.k},${row.l}`) ?? 0;
    return {
      h: row.h,
      k: row.k,
      l: row.l,
      d: row.d,
      twoTheta: row.twoTheta,
      intensity: maxRaw > 0 ? (value / maxRaw) * 100000 : 0,
    };
  });

  // Sort by 2θ ascending, then |h|+|k|+|l| for stable within-orbit ordering
  // (matches the legacy tab's d-descending readout order).
  normalized.sort(
    (a, b) =>
      a.twoTheta - b.twoTheta ||
      Math.abs(a.h) + Math.abs(a.k) + Math.abs(a.l) - (Math.abs(b.h) + Math.abs(b.k) + Math.abs(b.l)),
  );

  return { header: singleXrdHeader(crystal), rows: normalized };
}
