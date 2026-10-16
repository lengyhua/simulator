/**
 * Atomic scattering factors — the legacy program's own table (plan T04,
 * updated 2026-10-16).
 *
 *   f0(s) = Σᵢ₌₁..₅ aᵢ·exp(−bᵢ·s²) + c,   s = sinθ/λ  [Å⁻¹]
 *
 * Runtime source of truth: {@link FACTOR_COEFFS} in factor_data.ts, generated
 * from the `Factor.dat` binary that ships with CalcXRD.exe (199 species: 92
 * neutral elements H–U plus ~107 ion states such as `Na1+`, `Cl1-`, `O2-`,
 * and the valence variants `Cval` / `Siva`). Because the table carries real
 * ion coefficients, ion-sensitive reflections (e.g. NaCl's all-odd peaks,
 * where F = f_Na − f_Cl) no longer fall back to neutral atoms.
 *
 * The exponent is NEGATIVE. The legacy help RTF writes exp(bᵢ·(λ/sinθ)²),
 * which is an RTF transcription artifact: evaluated literally it yields
 * f(Al, s = 0.1) ≈ 0.14, which is physically absurd.
 *
 * The hand-transcribed IUCr / Cromer–Mann table (cronie_data.ts) is retained
 * for cross-validation in tests only — the engine never reads it.
 *
 * Regenerate cronie_data.ts with: python web/scripts/gen_cronie.py
 * (gen_factor_dat.py emits factor_data.ts, the runtime table this module
 * actually uses.)
 */

import { FACTOR_COEFFS, type FactorCoefficients } from './factor_data';

/** Trailing ion charge, e.g. the `1+` of `Na1+` or the `2-` of `O2-`. */
const ION_CHARGE_RE = /\d*[+-]$/;

/** Coefficients of one species: `f0(s) = Σ aᵢ·exp(−bᵢ·s²) + c`. */
export type ScatteringCoefficients = FactorCoefficients;

/**
 * Normalizes a species symbol to its neutral form by stripping a trailing ion
 * charge. `'Na1+'` → `'Na'`, `'O2-'` → `'O'`, `'Al'` → `'Al'`.
 */
export function normalizeElement(element: string): string {
  return element.trim().replace(ION_CHARGE_RE, '');
}

/**
 * Looks up coefficients for `species` in the Factor.dat table.
 *
 * Resolution order (no silent fallbacks beyond this):
 * 1. exact match of the .cord symbol (`Na1+`, `Cl1-`, `Cval`, `Al`, ...);
 * 2. the neutral form after stripping the trailing charge (`Fe9+` → `Fe`);
 * 3. `undefined` — callers report an error rather than substituting a guess.
 */
export function getCoefficients(species: string): ScatteringCoefficients | undefined {
  const trimmed = species.trim();
  const direct = FACTOR_COEFFS[trimmed];
  if (direct) {
    return direct;
  }
  const neutral = normalizeElement(trimmed);
  if (neutral !== trimmed) {
    const fallback = FACTOR_COEFFS[neutral];
    if (fallback) {
      return fallback;
    }
  }
  return undefined;
}

/** True when the species (or its neutral form) has tabulated coefficients. */
export function hasElement(species: string): boolean {
  return getCoefficients(species) !== undefined;
}

/**
 * Scattering factor f₀ at `s = sinθ/λ` (Å⁻¹).
 *
 * The evaluator loops over whichever number of Gaussian terms the table
 * carries (5 today), so a future table shape needs no code change.
 *
 * @throws Error when the species (after ion normalization) is not tabulated.
 */
export function f0(species: string, s: number): number {
  const coefficients = getCoefficients(species);
  if (!coefficients) {
    throw new Error(
      `未知物种「${species}」：Factor.dat 散射因子表（199 物种）中无此符号`,
    );
  }
  const s2 = s * s;
  const terms = Math.min(coefficients.a.length, coefficients.b.length);
  let value = coefficients.c;
  for (let i = 0; i < terms; i += 1) {
    value += coefficients.a[i] * Math.exp(-coefficients.b[i] * s2);
  }
  return value;
}

/**
 * Convenience export for UI datalists: every species key of the Factor.dat
 * table (neutral elements AND ion states), sorted alphabetically.
 */
export function elementSymbols(): string[] {
  return Object.keys(FACTOR_COEFFS).sort();
}

/** f₀ at s = 0 — equals the species' electron count (table self-check). */
export function f0AtZero(species: string): number {
  const coefficients = getCoefficients(species);
  if (!coefficients) {
    throw new Error(`未知物种「${species}」：Factor.dat 散射因子表中无此符号`);
  }
  let total = coefficients.c;
  for (const amplitude of coefficients.a) {
    total += amplitude;
  }
  return total;
}
