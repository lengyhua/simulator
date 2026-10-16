/**
 * Anomalous dispersion correction F′/F″ (plan §4.1, T07 phase 2).
 *
 * Source of truth: {@link FF_TABLE} in ff_data.ts, generated from the legacy
 * program's own `FF.dat` (92 neutral elements H–U, 6 interleaved (f′, f″)
 * columns for Cu/Mo/Co Kα1+Kα2). This is the exact table the original CalcXRD
 * GUI uses — its F′F″ checkbox is ON by default, so the engine enables the
 * correction by default to match it.
 *
 * The correction enters the per-atom scattering factor as a complex constant
 * (International Tables Vol. C):
 *
 *   fⱼ = f₀(s)·e^{−Bⱼ·s²} + f′ + i·f″
 *
 * f′/f″ are s-independent constants — they are NOT attenuated by the Debye–
 * Waller factor (see structure_factor.ts). The complex form is required for
 * multi-species structures (e.g. NaCl), where the scalar |f| form of the
 * legacy help formula (5) is wrong by up to ~3% on weak peaks.
 *
 * Wavelength coverage: FF.dat only ships Cu / Mo / Co Kα. Cr Kα (2.28970 Å)
 * and Fe Kα (1.93604 Å) have NO dispersion data, so {@link getDispersion}
 * returns `supported: false` (f′ = f″ = 0) and the UI greys out the checkbox.
 * We take the NEAREST supported radiation column without interpolation — the
 * three columns straddle K absorption edges, so linear interpolation between
 * them is physically meaningless.
 *
 * Element coverage: FF.dat has NO ion entries. `Na1+`/`Cl1-`/`O2-`/`Fe2+`…
 * fall back to the neutral element (same normalization as cronie.ts). This is
 * a documented approximation: on NaCl's weak all-odd peaks the difference term
 * amplifies the approximation error to ~19% (see docs/ff-dat-spec.md §5.7).
 *
 * Indexing: ALWAYS index by Z (= position in {@link FF_SYMBOLS}), never by the
 * raw symbol. FF.dat mislabels Z=91 as "Po" (should be "Pa"); {@link FF_SYMBOLS}
 * carries the corrected name.
 */

import { normalizeElement } from './cronie';
import { FF_COLUMNS, FF_LAMBDAS, FF_SYMBOLS, FF_TABLE } from './ff_data';
import { HENKE_CRF } from './henke_dispersion';
import { ION_DISPERSION } from './ion_dispersion';

/**
 * Dispersion lookup mode:
 * - 'fidelity' (default): use FF.dat only; Cr/Fe Kα unsupported; ions fall back
 *   to neutral FF.dat values. This is byte-for-byte faithful to the legacy GUI.
 * - 'extended': Cr/Fe use the LBNL Henke f″ extension table (f′=0 approximation);
 *   ion species use the charge-scaled F′/F″ approximation table. Deviates from
 *   legacy fidelity (documented in docs/ion-and-cr-fe-data-research.md §3).
 */
export type DispersionMode = 'fidelity' | 'extended';

/**
 * Wavelength tolerance (Å) for treating a requested λ as "close enough" to one
 * of the tabulated radiation columns. The three supported targets (Cu/Mo/Co
 * Kα1) land EXACTLY on a column (Δλ = 0). Cr Kα (Δλ ≈ 0.50) and Fe Kα
 * (Δλ ≈ 0.14) exceed this and are reported as unsupported in fidelity mode.
 */
const LAMBDA_TOLERANCE = 0.05;

/** Result of a dispersion lookup. */
export interface DispersionResult {
  /** Real anomalous part f′ (dimensionless, added to the real scattering factor). */
  fPrime: number;
  /** Imaginary anomalous part f″ (dimensionless, the absorption-related term). */
  fDoublePrime: number;
  /**
   * True when both the element and the wavelength are tabulated. When false,
   * fPrime/fDoublePrime are 0 and callers should treat the correction as absent
   * (e.g. grey out the F′F″ checkbox for Cr/Fe Kα).
   */
  supported: boolean;
  /**
   * Data source of the returned values. 'FF.dat' (fidelity), 'LBNL Henke'
   * (extended Cr/Fe), 'approximation' (extended ion charge-scaling). Callers
   * may use this to label results or gate UI; it is informational only.
   */
  source: string;
}

/** Returns the wavelength (Å) of the supported column closest to `lambda`. */
function nearestColumn(lambda: number): { index: number; delta: number } {
  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  const columns = Object.values(FF_LAMBDAS);
  for (let i = 0; i < columns.length; i += 1) {
    const delta = Math.abs(columns[i] - lambda);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  return { index: bestIndex, delta: bestDelta };
}

/**
 * True when `lambda` matches one of the tabulated radiation columns closely
 * enough that a dispersion correction exists (Cu/Mo/Co Kα). Cr/Fe Kα return
 * false — the UI greys the F′F″ checkbox in that case.
 */
export function hasDispersion(lambda: number): boolean {
  if (!Number.isFinite(lambda) || lambda <= 0) {
    return false;
  }
  return nearestColumn(lambda).delta <= LAMBDA_TOLERANCE;
}

/**
 * Anomalous dispersion (f′, f″) for `element` at wavelength `lambda` (Å).
 *
 * Resolution:
 * 1. strip any ion charge (`Na1+` → `Na`) via cronie.normalizeElement;
 * 2. map the neutral symbol to Z via {@link FF_SYMBOLS} (corrected for the
 *    Z=91 "Po" mislabel);
 * 3. pick the nearest supported radiation column (no interpolation);
 * 4. if the element is unknown OR the wavelength is outside coverage,
 *    return `{ fPrime: 0, fDoublePrime: 0, supported: false }` — never throws.
 */
export function getDispersion(
  element: string,
  lambda: number,
  mode: DispersionMode = 'fidelity',
): DispersionResult {
  // Base FF.dat lookup (works for all 92 neutral elements at Cu/Mo/Co Kα).
  const neutral = normalizeElement(element);
  const zIndex = FF_SYMBOLS.indexOf(neutral); // −1 when not in H..U
  const { index: col, delta } = nearestColumn(lambda);

  const ffSupported = Number.isFinite(lambda) && lambda > 0 && zIndex >= 0 && delta <= LAMBDA_TOLERANCE;
  const row = zIndex >= 0 ? FF_TABLE[zIndex] : undefined;
  const ffResult: DispersionResult = ffSupported
    ? {
        fPrime: row![2 * col],
        fDoublePrime: row![2 * col + 1],
        supported: true,
        source: 'FF.dat',
      }
    : { fPrime: 0, fDoublePrime: 0, supported: false, source: 'FF.dat' };
  if (mode === 'fidelity') return ffResult;

  // Extended mode: Cr/Fe → LBNL Henke (authoritative f″, f′=0 documented approx);
  // ion species → charge-scaled approximation; otherwise fall through to FF.dat.
  const henke = HENKE_CRF[neutral];
  if (henke) {
    const entry = henke.find((e) => Math.abs(e.lambda - lambda) < 0.001) ?? henke[0];
    return {
      fPrime: entry.fPrime,
      fDoublePrime: entry.fDoublePrime,
      supported: true,
      source: 'LBNL Henke',
    };
  }
  const ion = ION_DISPERSION.find((e) => e.species === element);
  if (ion) {
    return {
      fPrime: ion.fPrime,
      fDoublePrime: ion.fDoublePrime,
      supported: true,
      source: 'approximation',
    };
  }
  return ffResult;
}

/** Column labels in the same order as the 12 doubles per FF_TABLE row. */
export { FF_COLUMNS, FF_LAMBDAS, FF_SYMBOLS, FF_TABLE };
