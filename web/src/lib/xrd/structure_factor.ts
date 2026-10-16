/**
 * Structure factor (plan §3.2 / T06):
 *
 *   F(h,k,l) = Σⱼ fⱼ · exp(2πi·(h·xⱼ + k·yⱼ + l·zⱼ))
 *
 * The sum runs over every equivalent position of every atom, produced by
 * {@link expandPositions} (Wyckoff ops × centering translations). Systematic
 * absences therefore emerge naturally from the position expansion — no
 * extinction table is consulted (plan §4.1).
 *
 * Per-atom scattering factor (plan §4.1, GUI-verified 2026-10-16, with the
 * F′F″ correction from FF.dat, T07 phase 2):
 *
 *   fⱼ = [ f₀(element, s)·exp(−Bⱼ·s²) + f′ ] + i·f″      (complex)
 *   F(hkl) = Σⱼ occⱼ · fⱼ · e^{iφⱼ},   φⱼ = 2π(hxⱼ+kyⱼ+lzⱼ)
 *
 * `Bⱼ` is the atom's own thermal factor (the .cord 7th field / the legacy
 * program's atom-table "B" column, default 1) — it is PER ATOM, not a global
 * parameter. The Debye–Waller factor attenuates ONLY f₀ (IT Vol. C); f′/f″ are
 * s-independent constants. When `useDispersion` is false (or the element/λ is
 * unsupported, e.g. Cr/Fe Kα) the correction vanishes and fⱼ reduces to the
 * neutral f₀ form above. The complex form (not the legacy help scalar eq. 5) is
 * required for multi-species structures such as NaCl.
 */

import { f0 } from './cronie';
import { getDispersion } from './dispersion';
import { expandPositions } from './wyckoff';
import type { Crystal } from './types';

/** 2π, the phase factor of the structure-factor exponent. */
const TWO_PI = 2 * Math.PI;

/** Options for {@link structureFactor} (plan §3.2). */
export interface SFOptions {
  /** Wavelength in Å — drives the F′F″ (anomalous-dispersion) correction. */
  lambda: number;
  /** Applies each atom's Debye–Waller factor exp(−Bⱼ·s²) when true. */
  useThermal: boolean;
  /**
   * Applies the F′F″ anomalous-dispersion correction (default ON, matching the
   * legacy GUI's checked checkbox). When true, each atom's scattering factor
   * becomes fⱼ·e^{iφ} = (f₀·e^{−Bⱼs²}+f′) + i·f″; unsupported elements/λ return
   * f′=f″=0 (see dispersion.ts), so this is a safe no-op for Cr/Fe Kα.
   */
  useDispersion?: boolean;
  /**
   * Optional precomputed scattering vector magnitude s = sinθ/λ (Å⁻¹). When
   * supplied by a caller that has already evaluated d (e.g. the pipeline,
   * which computes d for 2θ), the internal `dSpacing` recomputation is skipped.
   * s depends only on |G| (the squared Miller indices), so it is identical for
   * a Laue-orbit representative and its original image — passing s from the
   * original (h,k,l) yields bit-identical results to recomputing it for `rep`.
   */
  s?: number;
  /**
   * F′/F″ dispersion data source (used only when `useDispersion` is true):
   * - `'fidelity'` (default): FF.dat only, byte-for-byte legacy behavior.
   * - `'extended'`: adds Cr/Fe via LBNL Henke f″ (f′=0 approx) and ion species
   *   via charge-scaled F′/F″ approximation. Deviates from legacy; see
   *   docs/ion-and-cr-fe-data-research.md §3 for source citations.
   */
  dispersionMode?: 'fidelity' | 'extended';
}

/** A complex structure factor in Cartesian form. */
export interface ComplexFactor {
  re: number;
  im: number;
}

/** Validates the lattice parameters of a crystal (positive finite edges/angles). */
function validateCrystal(crystal: Crystal): void {
  const { a, b, c, alpha, beta, gamma } = crystal;
  const edges: Array<[string, number]> = [
    ['a', a],
    ['b', b],
    ['c', c],
  ];
  for (const [name, value] of edges) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`晶胞边长 ${name} 应为正有限值，实际为 ${value}`);
    }
  }
  const angles: Array<[string, number]> = [
    ['alpha', alpha],
    ['beta', beta],
    ['gamma', gamma],
  ];
  for (const [name, value] of angles) {
    if (!Number.isFinite(value) || value <= 0 || value >= 180) {
      throw new Error(`晶胞角 ${name} 应在 (0°,180°) 区间，实际为 ${value}`);
    }
  }
}

/**
 * Interplanar spacing d (Å) for reflection (h,k,l) from the general
 * triclinic closed form (plan §4.1, numerically verified against direct
 * reciprocal-lattice computation to 1e-12):
 *
 *   1/d² = (1/V²)[ h²b²c²sin²α + k²a²c²sin²β + l²a²b²sin²γ
 *            + 2hk·abc²(cosα·cosβ−cosγ)
 *            + 2hl·ab²c(cosα·cosγ−cosβ)
 *            + 2kl·a²bc(cosβ·cosγ−cosα) ]
 *   V = abc·√(1−cos²α−cos²β−cos²γ+2cosα·cosβ·cosγ)
 *
 * Exported because the pipeline (T07) needs the same d for 2θ evaluation.
 *
 * @throws Error on an invalid cell (non-positive volume) or h=k=l=0.
 */
export function dSpacing(crystal: Crystal, h: number, k: number, l: number): number {
  validateCrystal(crystal);
  if (h === 0 && k === 0 && l === 0) {
    throw new Error('hkl 不能全为 0（d 间距未定义）');
  }
  const { a, b, c } = crystal;
  const alpha = (crystal.alpha * Math.PI) / 180;
  const beta = (crystal.beta * Math.PI) / 180;
  const gamma = (crystal.gamma * Math.PI) / 180;
  const ca = Math.cos(alpha);
  const cb = Math.cos(beta);
  const cg = Math.cos(gamma);

  const volumeFactor = 1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg;
  if (volumeFactor <= 0) {
    throw new Error(
      `晶胞无效：V² 因子 ${volumeFactor} ≤ 0（边长/角度不构成合法晶胞）`,
    );
  }
  const volume = a * b * c * Math.sqrt(volumeFactor);

  const sa = Math.sin(alpha);
  const sb = Math.sin(beta);
  const sg = Math.sin(gamma);

  const invD2 =
    (h * h * b * b * c * c * sa * sa +
      k * k * a * a * c * c * sb * sb +
      l * l * a * a * b * b * sg * sg +
      2 * h * k * a * b * c * c * (ca * cb - cg) +
      2 * h * l * a * b * b * c * (ca * cg - cb) +
      2 * k * l * a * a * b * c * (cb * cg - ca)) /
    (volume * volume);

  if (invD2 <= 0) {
    throw new Error(`反射 (${h},${k},${l}) 的 1/d² 非正（${invD2}）`);
  }
  return 1 / Math.sqrt(invD2);
}

/**
 * Scattering vector magnitude s = sinθ/λ (Å⁻¹) for reflection (h,k,l).
 *
 * Since sinθ = λ/(2d), s = 1/(2d) — independent of λ for the neutral f₀
 * model. The λ-dependence returns with the phase-2 F′F″ correction.
 */
export function sinThetaOverLambda(crystal: Crystal, h: number, k: number, l: number): number {
  return 1 / (2 * dSpacing(crystal, h, k, l));
}

/**
 * Complex structure factor F(h,k,l) (plan §3.2).
 *
 * @throws Error when the crystal cell is invalid, the Wyckoff letter is
 *   unknown for the space group, or an element is not tabulated (f₀).
 */
export function structureFactor(
  crystal: Crystal,
  h: number,
  k: number,
  l: number,
  opts: SFOptions,
): ComplexFactor {
  if (!Number.isFinite(opts.lambda) || opts.lambda <= 0) {
    throw new Error(`波长 λ 应为正有限值，实际为 ${opts.lambda}`);
  }
  // Reuse a caller-supplied s when present (the pipeline already computed d
  // for 2θ); otherwise derive s from the cell. Either way the magnitude is
  // bit-identical because s = sinθ/λ depends only on |G|².
  const s = opts.s !== undefined ? opts.s : sinThetaOverLambda(crystal, h, k, l);

  let re = 0;
  let im = 0;
  for (const atom of crystal.atoms) {
    const positions = expandPositions(crystal.sgKey, atom.wyckoff, atom.x, atom.y, atom.z);
    // Debye–Waller is per atom: exp(−Bⱼ·sin²θ/λ²), Bⱼ from the .cord atom row.
    // It attenuates only f₀, NOT the anomalous f′/f″ constants (IT Vol. C).
    const f0s = f0(atom.element, s) * (opts.useThermal ? Math.exp(-atom.thermalB * s * s) : 1);
    const mode = opts.dispersionMode ?? 'fidelity';
    // Anomalous dispersion: F′F″ from FF.dat (fidelity) or extended sources
    // (LBNL Henke for Cr/Fe, charge-scaled approximation for ions), indexed by
    // Z (not symbol — Z=91 is mislabeled "Po" in the source).
    // Unsupported element/λ → 0 (no-op).
    const fp = opts.useDispersion
      ? getDispersion(atom.element, opts.lambda, mode).fPrime
      : 0;
    const fpp = opts.useDispersion
      ? getDispersion(atom.element, opts.lambda, mode).fDoublePrime
      : 0;
    // Complex atomic factor: (f0s + f′) + i·f″. Multiply by e^{iφ} = (cosφ + i sinφ):
    //   Re = A·cosφ − B·sinφ,  Im = A·sinφ + B·cosφ
    // where A = occ·(f0s + f′) and B = occ·f″. Both real & imaginary parts of
    // the dispersion contribute — for non-centrosymmetric structures omitting the
    // −B·sinφ term on `re` produces a real error on weak peaks.
    const a = atom.occupancy * (f0s + fp);
    const bi = atom.occupancy * fpp;
    for (const [x, y, z] of positions) {
      const phase = TWO_PI * (h * x + k * y + l * z);
      const c = Math.cos(phase);
      const sn = Math.sin(phase);
      re += a * c - bi * sn;
      im += a * sn + bi * c;
    }
  }
  return { re, im };
}
