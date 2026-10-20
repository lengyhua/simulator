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
import { FF_COLUMNS, FF_SYMBOLS, FF_TABLE, FF_LAMBDAS } from './ff_data';

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

/**
 * Legacy "Search Factor" dialog (TFormFactor, §8.19/§8.20) — the ported
 * UI component the user chose to include (product decision 2026-10-19).
 *
 * The dialog lets the user pick an element + radiation target and displays:
 *   - the a₁..a₅/c coefficients (from Factor.dat)
 *   - ΔF1 (f′) / ΔF2 (f″) for the selected radiation
 *   - a table of 2θ / s / f₀ / f₀+F′+0.5F″²/(f₀+F″) over a 2θ window
 *
 * The "Fo after F1 & F2" column uses the SAME scalar formula as the
 * calculation pipeline (byte-confirmed §8.19: denominator f₀+F″, not the
 * help RTF's f₀+F′).  The f₀ column uses Factor.dat's 5-Gaussian form.
 * No new calculation logic — this is a thin wrapper over `f0` +
 * `FF_TABLE`/`FF_SYMBOLS` lookups.
 */

export interface SearchFactorEntry {
  /** 2θ in degrees. */
  twoTheta: number;
  /** sinθ/λ in Å⁻¹. */
  s: number;
  /** f₀ from Factor.dat 5-Gaussian form. */
  f0: number;
  /** f₀ + F′ + 0.5·F″²/(f₀+F″) — the legacy "Fo after F1 & F2" value. */
  fEff: number;
}

export interface SearchFactorResult {
  /** Species name as given (e.g. 'Na1+'). */
  species: string;
  /** Neutral element symbol (e.g. 'Na'). */
  neutral: string;
  /** Radiation label (e.g. 'CuKa1'). */
  radiation: string;
  /** Wavelength in Å. */
  lambda: number;
  /** Factor.dat coefficients a1..a5. */
  a: number[];
  /** Factor.dat coefficients b1..b5. */
  b: number[];
  /** Factor.dat constant c. */
  c: number;
  /** ΔF1 = f′ (dimensionless). */
  deltaF1: number;
  /** ΔF2 = f″ (dimensionless). */
  deltaF2: number;
  /** 2θ/s/f₀/f_eff table rows. */
  rows: SearchFactorEntry[];
}

/**
 * Computes the Search Factor dialog's output for `species` at radiation
 * column `radiation` (key of {@link FF_LAMBDAS}, e.g. 'CuKa1') over a
 * 2θ window `[rangeMin, rangeMax]` degrees with `step` step (degrees).
 *
 * @throws Error when the species is not in Factor.dat or the neutral form
 *   is not in FF_SYMBOLS.
 */
export function computeSearchFactor(
  species: string,
  radiation: string,
  rangeMin: number,
  rangeMax: number,
  step: number,
): SearchFactorResult {
  const coeffs = getCoefficients(species);
  if (!coeffs) {
    throw new Error(
      `未知物种「${species}」：Factor.dat 散射因子表中无此符号`,
    );
  }
  const neutral = normalizeElement(species);
  const zIndex = FF_SYMBOLS.indexOf(neutral);
  if (zIndex < 0) {
    throw new Error(
      `元素「${neutral}」不在 FF.dat 色散表中（H–U，92 元素）`,
    );
  }
  const radIndex = (Object.keys(FF_LAMBDAS) as readonly string[]).indexOf(radiation);
  if (radIndex < 0) {
    throw new Error(
      `辐射靶「${radiation}」无效（支持：${FF_COLUMNS.join(', ')}）`,
    );
  }
  const lambda = FF_LAMBDAS[radiation as keyof typeof FF_LAMBDAS];
  const row = FF_TABLE[zIndex];
  const fPrime = row[2 * radIndex];
  const fDoublePrime = row[2 * radIndex + 1];

  const rows: SearchFactorEntry[] = [];
  for (let twoTheta = rangeMin; twoTheta <= rangeMax + 1e-9; twoTheta += step) {
    const theta = (twoTheta / 2) * (Math.PI / 180);
    const s = Math.sin(theta) / lambda;
    const f0Val = f0(species, s);
    // Legacy formula (byte-confirmed §8.19, 0x47c833 FMUL loads f″ slot):
    // f_eff = f₀ + F′ + 0.5·F″²/(f₀+F″)
    const fEff =
      f0Val + fPrime + (0.5 * fDoublePrime * fDoublePrime) / (f0Val + fDoublePrime);
    rows.push({ twoTheta, s, f0: f0Val, fEff });
  }

  return {
    species,
    neutral,
    radiation,
    lambda,
    a: [...coeffs.a],
    b: [...coeffs.b],
    c: coeffs.c,
    deltaF1: fPrime,
    deltaF2: fDoublePrime,
    rows,
  };
}

/** Maxima of the two Search Factor series over the computed 2θ window — the
 *  legacy dialog's `Max Fo` / `Max Fo (F1 F2)` readouts (docs/params-f0.md
 *  §1.1: for H @ MoKa1 the legacy shows `Max Fo = 0.999978 = Σa+c = f₀(0)`;
 *  f₀ decreases monotonically with s, so the window maximum sits at 2θ min). */
export function searchFactorMaxima(
  result: SearchFactorResult,
): { maxFo: number; maxFoEff: number } | null {
  if (result.rows.length === 0) {
    return null;
  }
  let maxFo = -Infinity;
  let maxFoEff = -Infinity;
  for (const row of result.rows) {
    if (row.f0 > maxFo) {
      maxFo = row.f0;
    }
    if (row.fEff > maxFoEff) {
      maxFoEff = row.fEff;
    }
  }
  return { maxFo, maxFoEff };
}

/**
 * Renders the Search Factor dialog's report text — the layout the legacy
 * program writes (`docs/archive/ref-data/factors/007-Na+.rtf`): element/target header,
 * the a/b/c coefficient block, ΔF1/ΔF2, the Max Fo readouts, then the
 * `2theta / sin(theta)/lamda / Fo / Fo after F1 & F2` value table.
 *
 * ⚠ One deliberate deviation from the legacy file: the original labels EVERY
 * b as `b1` (`a1=…; b1=…` repeated five times — a display bug in the
 * generated report). We emit the correct b₁..b₅ labels; the VALUES are
 * untouched, so any numeric comparison still matches.
 */
export function formatSearchFactorReport(result: SearchFactorResult): string {
  const maxima = searchFactorMaxima(result);
  const lines: string[] = [];
  lines.push(`Element Name :  ${result.species}`);
  lines.push(`Target : ${result.radiation}  ${result.lambda}`);
  for (let i = 0; i < 5; i += 1) {
    lines.push(`a${i + 1}=  ${result.a[i]};   b${i + 1}= ${result.b[i]}`);
  }
  lines.push(`c=  ${result.c}`);
  lines.push(`DeltaF1 =  ${result.deltaF1};   DeltaF2= ${result.deltaF2}`);
  if (maxima) {
    lines.push(
      `Max Fo = ${maxima.maxFo.toFixed(6)};   Max Fo (F1 F2) = ${maxima.maxFoEff.toFixed(6)}`,
    );
  }
  lines.push(' 2theta degree    sin(theta)/lamda         Fo               Fo after F1 & F2');
  for (const row of result.rows) {
    lines.push(
      `${row.twoTheta.toFixed(2).padStart(8)}${row.s.toFixed(8).padStart(18)}` +
        `${row.f0.toFixed(9).padStart(21)}${row.fEff.toFixed(9).padStart(21)}`,
    );
  }
  return lines.join('\n');
}
