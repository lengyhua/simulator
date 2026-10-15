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
 * Per-atom scattering factor (plan §4.1, GUI-verified 2026-10-16):
 *
 *   fⱼ = f₀(element, s) · occupancyⱼ · exp(−Bⱼ·s²),   s = sinθ/λ = 1/(2d)
 *
 * `Bⱼ` is the atom's own thermal factor (the .cord 7th field / the legacy
 * program's atom-table "B" column, default 1) — it is PER ATOM, not a global
 * parameter, and the exponential is suppressed when `useThermal` is false.
 */

import { f0 } from './cronie';
import { expandPositions } from './wyckoff';
import type { Crystal } from './types';

/** 2π, the phase factor of the structure-factor exponent. */
const TWO_PI = 2 * Math.PI;

/** Options for {@link structureFactor} (plan §3.2). */
export interface SFOptions {
  /** Wavelength in Å. Kept for the phase-2 F′F″ correction (λ-dependent);
   *  it cancels algebraically in s = sinθ/λ = 1/(2d) for the neutral f₀. */
  lambda: number;
  /** Applies each atom's Debye–Waller factor exp(−Bⱼ·s²) when true. */
  useThermal: boolean;
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
  const s = sinThetaOverLambda(crystal, h, k, l);

  let re = 0;
  let im = 0;
  for (const atom of crystal.atoms) {
    const positions = expandPositions(crystal.sgKey, atom.wyckoff, atom.x, atom.y, atom.z);
    // Debye–Waller is per atom: exp(−Bⱼ·sin²θ/λ²), Bⱼ from the .cord atom row.
    const thermal = opts.useThermal ? Math.exp(-atom.thermalB * s * s) : 1;
    const f = f0(atom.element, s) * atom.occupancy * thermal;
    for (const [x, y, z] of positions) {
      const phase = TWO_PI * (h * x + k * y + l * z);
      re += f * Math.cos(phase);
      im += f * Math.sin(phase);
    }
  }
  return { re, im };
}
