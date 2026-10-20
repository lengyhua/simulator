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
 * Fe Kα1 fidelity-mode column quirk (G5, byte-confirmed in
 * CalcXRD.exe FUN_0047907c loader switch, `docs/ghidra-reverse-findings.md`
 * §1/G5): the legacy program reads the Co Kα1 column of FF.dat when the user
 * selects Fe Kα1, paired with the Fe λ value (1.93604 Å) for geometry. This
 * is a latent loader bug in the shipped program; fidelity mode reproduces it
 * faithfully rather than correcting to "nearest column". Fe Kα2 is not a
 * selectable option in the legacy λ dropdown, so the quirk does not apply
 * to it.
 */
const FE_KA1_LAMBDA = 1.93604;
const FE_KA_WEIGHTED_LAMBDA = 1.93736;

/**
 * Legacy λ dropdown item → FF.dat column, pinned 2026-10-20 by the 18 archived
 * "Search Factor" captures (`docs/archive/ref-data/factors/*.rtf`), each of which prints the
 * program's own `DeltaF1` / `DeltaF2` readout. Those readouts reproduce FF.dat
 * to the last printed digit, and they expose TWO loader rules that
 * "nearest column" gets wrong:
 *
 *   1. the Kα (intensity-weighted) items read the **Kα₂** column, not Kα₁ —
 *      Al: CuKa1 0.212/0.246 vs CuKa 0.213/0.246; MoKa1 0.064/0.052 vs
 *      MoKa 0.065/0.052; FeKa1 0.279/0.381 vs FeKa 0.279/0.382. Nearest-column
 *      would send CuKa 1.54178 and MoKa 0.71073 to the Kα₁ column (both are
 *      nearer to it than to Kα₂).
 *   2. both Fe Kα items read a **Co** column (the G5 loader bug):
 *      FeKa1 → Co Kα₁, FeKa → Co Kα₂. Numerically impossible to guess from λ
 *      (Δλ ≈ 0.15 Å, far outside any sane tolerance).
 *
 * The Mo pair is the nastiest: the legacy "MoKa1" item carries the 0.71930
 * typo while "MoKa" carries 0.71073 — i.e. the *weighted* item is the one
 * closer to the physical Mo Kα₁ wavelength, yet it is the one that reads the
 * Kα₂ column.
 */
const LEGACY_TARGET_COLUMNS: ReadonlyArray<{ lambda: number; column: string }> = [
  { lambda: 1.54056, column: 'CuKa1' },
  { lambda: 1.54178, column: 'CuKa2' },
  { lambda: 0.7193, column: 'MoKa1' },
  { lambda: 0.71073, column: 'MoKa2' },
  { lambda: FE_KA1_LAMBDA, column: 'CoKa1' },
  { lambda: FE_KA_WEIGHTED_LAMBDA, column: 'CoKa2' },
];

/** True for either legacy Fe Kα dropdown item (G5 Co-column quirk applies). */
function isLegacyFeKa(lambda: number): boolean {
  return Math.abs(lambda - FE_KA1_LAMBDA) < 1e-4 || Math.abs(lambda - FE_KA_WEIGHTED_LAMBDA) < 1e-4;
}

/** Column index for a legacy dropdown λ, or −1 when λ is not one of the six. */
function legacyTargetColumn(lambda: number): number {
  const keys = Object.keys(FF_LAMBDAS);
  const hit = LEGACY_TARGET_COLUMNS.find((t) => Math.abs(lambda - t.lambda) < 1e-4);
  return hit ? keys.indexOf(hit.column) : -1;
}

/**
 * Column index for fidelity-mode lookup: the legacy dropdown mapping when λ is
 * one of the six legacy items, otherwise the plain nearest column (web-only
 * wavelengths such as Cr Kα, Co Kα, Ti/Al Kα).
 */
function fidelityColumn(lambda: number): number {
  const legacy = legacyTargetColumn(lambda);
  return legacy >= 0 ? legacy : nearestColumn(lambda).index;
}

/**
 * True when `lambda` matches one of the tabulated radiation columns closely
 * enough that a dispersion correction exists (Cu/Mo/Co Kα) in fidelity mode.
 * Cr/Fe Kα return false in fidelity mode (UI greys the F′F″ checkbox).
 *
 * In extended mode Cr/Fe have Henke f″ data for all 6 standard wavelengths,
 * so `hasDispersion` should be called with awareness of the active mode:
 * `hasDispersionExtended(lambda)` is a convenience export for that case.
 */
export function hasDispersion(lambda: number): boolean {
  if (!Number.isFinite(lambda) || lambda <= 0) {
    return false;
  }
  return nearestColumn(lambda).delta <= LAMBDA_TOLERANCE;
}

/**
 * Fidelity-mode coverage check — the one the UI must use to gate the F′F″
 * checkbox. Unlike {@link hasDispersion} (plain nearest-column, no quirks)
 * this includes the G5 Fe Kα quirk for BOTH legacy Fe Kα dropdown items
 * (1.93604 "FeKa1" and 1.93736 "FeKa"), because {@link getDispersion} really
 * does return Co-column f′/f″ for them in fidelity mode. Without this, the
 * checkbox would be greyed out for a wavelength the engine still corrects
 * for — and the Fe Kα weighted table would silently run 0.34% low.
 */
export function hasDispersionFidelity(lambda: number): boolean {
  if (!Number.isFinite(lambda) || lambda <= 0) {
    return false;
  }
  return isLegacyFeKa(lambda) || nearestColumn(lambda).delta <= LAMBDA_TOLERANCE;
}

/**
 * Wavelength coverage check for extended mode: always true for the 6 standard
 * radiation columns (Cu/Mo/Co Kα1+Kα2) because HENKE_CRF covers Cr/Fe at all
 * six; also true for FF.dat elements. Use this to gate the F′F″ checkbox when
 * the user selects extended mode.
 */
export function hasDispersionExtended(lambda: number): boolean {
  if (!Number.isFinite(lambda) || lambda <= 0) {
    return false;
  }
  // HENKE_CRF has entries for all 6 standard wavelengths for Cr and Fe
  const anyHenke = Object.values(HENKE_CRF).some((entries) =>
    entries.some((e) => Math.abs(e.lambda - lambda) < 0.001),
  );
  return anyHenke || hasDispersion(lambda);
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
 *
 * In extended mode:
 * - Cr/Fe → LBNL Henke table (authoritative f″, f′=0 documented approximation)
 * - ion species (Na1+/Cl1-/O2-/…) → ION_DISPERSION charge-scaled approximation
 * - all others → fall through to FF.dat fidelity result
 */
export function getDispersion(
  element: string,
  lambda: number,
  mode: DispersionMode = 'fidelity',
): DispersionResult {
  const trimmed = element.trim();
  const neutral = normalizeElement(trimmed);
  const zIndex = FF_SYMBOLS.indexOf(neutral); // −1 when not in H..U
  // Fidelity mode uses the G5-corrected column (Fe Kα1 → Co Kα1); extended
  // mode falls through to the plain nearest column for its FF.dat pass.
  const col = mode === 'fidelity' ? fidelityColumn(lambda) : nearestColumn(lambda).index;
  // A legacy dropdown λ is in-coverage by definition — the loader switch maps
  // it to its column regardless of how far that column's own λ is (the two Fe
  // Kα items sit ~0.15 Å from the Co columns they actually read).
  const delta =
    mode === 'fidelity' && legacyTargetColumn(lambda) >= 0
      ? 0
      : Math.abs(Object.values(FF_LAMBDAS)[col] - lambda);

  const ffSupported =
    Number.isFinite(lambda) && lambda > 0 && zIndex >= 0 && delta <= LAMBDA_TOLERANCE;
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

  // Extended mode: Cr/Fe → LBNL Henke; ion species → charge-scaled approximation.
  // Use `neutral` for Cr/Fe lookup (case-insensitive), and `trimmed` (exact
  // species string including charge) for the ion table lookup.
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
  const ion = ION_DISPERSION.find((e) => e.species === trimmed);
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
