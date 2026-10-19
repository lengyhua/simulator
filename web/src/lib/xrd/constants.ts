/**
 * Physical and default constants for the CalcXRD calculation engine (plan §7).
 *
 * This module is the single source of truth for physical constants and UI
 * defaults: components must not scatter magic numbers. Pure data only — no
 * DOM, no I/O, no mutable state.
 */

import type { XrdParams } from './types';

/**
 * X-ray wavelength table (Kα₁, in Å) — plan §7.
 * Keys are the labels shown in the wavelength dropdown (T10).
 *
 * Cu = 1.54056 was GUI-verified against the legacy program (2026-10-16
 * screenshot "CuKa1 1.54056"). The full legacy 6-item list was extracted
 * 2026-10-17 via Win32 (CB_GETLBTEXT): CuKa1 1.54056 / CuKa 1.54178 /
 * FeKa1 1.93604 / FeKa 1.93736 / MoKa1 0.71930 / MoKa 0.71073.
 *
 * NOTE: Mo uses the CORRECT standard value 0.70930 — the legacy dropdown
 * carries a data-entry typo "MoKa1 0.71930" (its sibling weighted entry
 * MoKa 0.71073 and Mo Kα2 0.71359 are both correct), registered as defect
 * #11 in `docs/DATA-REFERENCE.md` §4. Fe = 1.93604 matches the legacy
 * FeKa1 entry; Cr is NOT in the legacy list (web-only extension, dispersion
 * via Henke data — see `henke_dispersion.ts`).
 *
 * 2026-10-19 定案（ref-data 019/033/034/035 实证，§8.12）：legacy 程序几何
 * 计算**实际使用 0.71930 笔误值**——Al B=1 全谱对照，λ=0.71930 与 legacy
 * 峰值残差 ≤0.005%（(200)=64895 vs 64894、(220)=20350 vs 20349），而
 * λ=0.70930 残差达 0.152%（(220) 20380 vs 20349），远超 0.1% 目标。
 * web 保留 0.70930（LAMBDA_TABLE.Mo）为物理正确默认值；legacy 保真复刻
 * 场景请显式选 CUSTOM_LAMBDA_PRESETS 的 "Mo Kα1 (legacy 笔误 0.71930)"
 * 条目。缺陷 #11 由「待决策」定案为「双值并存、legacy 保真用 0.71930」。
 *
 * 2026-10-20 与 legacy 6 项逐项对账（用户提问「为什么现在选项更多、值有出入」）：
 *
 * | legacy 下拉项      | λ        | 本表对应                              |
 * |-------------------|----------|---------------------------------------|
 * | CuKa1             | 1.54056  | `Cu` 1.54056（一致）                  |
 * | CuKa（Kα 加权）    | 1.54178  | preset「Cu Kα 加权」1.54178          |
 * | FeKa1             | 1.93604  | `Fe` 1.93604（一致；色散按 G5 读 Co 列）|
 * | FeKa（Kα 加权）    | 1.93736  | preset「Fe Kα 加权」1.93736          |
 * | MoKa1             | 0.71930  | preset「legacy 笔误 0.71930」（`Mo` 用物理值 0.70930）|
 * | MoKa（Kα 加权）    | 0.71073  | preset「Mo Kα 加权」0.71073          |
 *
 * 即 legacy 6 项现已**全部可选**（5 项标准表 + 4 项 preset 覆盖其余）。
 * 多出来的 `Cr` 2.28970、`Co` 1.78897 与 Ti/Al 属 **web-only 扩展**：
 * legacy 下拉没有 Co（但 FF.dat 有 Co 列，Fe Kα1 正是错配读它，见 G5），
 * 也没有 Cr（色散走 Henke 数据，见 `henke_dispersion.ts`）。
 * 扩展项一律不删除——它们不影响 legacy 复现，只是下拉更长。
 */
export const LAMBDA_TABLE: Readonly<Record<string, number>> = Object.freeze({
  Cu: 1.54056,
  Mo: 0.70930,
  Cr: 2.28970,
  Co: 1.78897,
  Fe: 1.93604,
});

/**
 * Custom wavelength entries supported by the dropdown (in addition to
 * {@link LAMBDA_TABLE}). The legacy program's `lamda` field is editable, so a
 * numeric value outside the 5 standard targets is legal; these give the
 * common non-standard targets a proper label instead of "自定义".
 *
 * The three `legacy 加权` entries complete the legacy 6-item dropdown (see the
 * {@link LAMBDA_TABLE} note): the shipped program listed the Kα₁ line and a
 * Kα₁/Kα₂ intensity-weighted mean for each of Cu / Fe / Mo, so reproducing a
 * legacy "CuKa" / "FeKa" / "MoKa" run needs those weighted values, not just
 * the Kα₁ ones.
 */
export const CUSTOM_LAMBDA_PRESETS: ReadonlyArray<{ label: string; value: number }> = Object.freeze([
  { label: 'Ti Kα', value: 2.8308 },
  { label: 'Al Kα', value: 7.0919 },
  // Cu Kα₂ = 1.54439 Å (FF.dat column + LBNL Henke table agree). NOT Kβ —
  // Cu Kβ₁ is 1.39222 Å; an earlier entry mislabelled this line "K-beta"
  // and carried a stray 1.54433 value, both corrected 2026-10-20.
  { label: 'Cu Kα₂', value: 1.54439 },
  // Legacy fidelity: MoKa1 typo value (defect #11, §8.12). The shipped
  // program computed geometry with 0.71930 (not the physical 0.70930);
  // picking this reproduces the legacy MoKα1 ref-data tables (019/033/034/035)
  // to <0.1%.
  { label: 'Mo Kα1 (legacy 笔误 0.71930)', value: 0.7193 },
  // Legacy weighted Kα means — the remaining three items of the legacy
  // 6-item λ dropdown (Win32 CB_GETLBTEXT extraction, 2026-10-17).
  { label: 'Cu Kα 加权 (legacy CuKa)', value: 1.54178 },
  { label: 'Fe Kα 加权 (legacy FeKa)', value: 1.93736 },
  { label: 'Mo Kα 加权 (legacy MoKa)', value: 0.71073 },
]);

/** Default wavelength: Cu Kα (Å) — the Al.xrd reference was measured with it. */
export const DEFAULT_LAMBDA: number = LAMBDA_TABLE.Cu;

/** Scale factor K in `I_hkl = K·Lp·|F|²·mult` (plan §4.1: K = 1). */
export const K: number = 1;

/** Default scan range and step, in degrees (plan §7). */
export const SCAN_RANGE_MIN: number = 3;
export const SCAN_RANGE_MAX: number = 100;
export const SCAN_STEP: number = 0.01;

/**
 * Default Gaussian sigma `q` in degrees (plan §7 "q 标定", GUI-verified
 * 2026-10-16).
 *
 * The legacy program's `q` field is the standard deviation σ of the Gaussian
 * peak shape (help formula 6: `f(x) = exp(−(x−u)²/2q²) / (q·√2π)`), default
 * **0.10**; FWHM = 2.355σ ≈ 0.2355°, which matches the Al.xrd profile
 * point-by-point (intensity at ±0.01° from a crest = crest·exp(−0.005)).
 * The earlier `q = 0.25` reading treated q as a FWHM and is deprecated.
 *
 * NOTE: despite the help RTF printing a `1/(q√2π)` density-normalized form,
 * the actual legacy numerics (both its `.xrd` files and its own curve
 * display) use a CREST-normalized form `I(2θ) = Σ I_hkl·exp(−(2θ−2θ_hkl)²/2q²)`,
 * i.e. the peak top equals I_hkl with no `1/(q√2π)` factor. See
 * `docs/DATA-REFERENCE.md` §4 defect #9 and `gaussian.ts` for the evidence.
 */
export const DEFAULT_Q: number = 0.10;

/**
 * Default per-atom thermal factor B in Å² (plan §7 "B 标定", GUI-verified).
 *
 * B lives on each ATOM (the .cord 7th field / the legacy atom-table "B"
 * column); every shipped sample uses B = 1, which is also the value the
 * legacy GUI defaults to. There is no global B parameter.
 */
export const DEFAULT_ATOM_THERMAL_B: number = 1;

/**
 * Default F′F″ anomalous-dispersion switch. `true` to match the legacy GUI's
 * default (the F′F″ checkbox is checked on launch). The correction is a no-op
 * for unsupported elements/wavelengths (e.g. Cr/Fe Kα), so leaving it on is
 * always safe.
 */
export const DEFAULT_USE_DISPERSION: boolean = true;

/**
 * Numerical floor for the Bragg angle θ (degrees) used by the Lorentz factor.
 * `Lp ∝ 1/sin²θ` diverges as θ→0; clamping θ keeps the factor finite instead
 * of returning Infinity (plan §5-T06 acceptance 5).
 */
export const MIN_THETA_DEG: number = 1e-6;

/**
 * Relative extinction threshold (plan §5-T06 acceptance 1): a reflection
 * counts as systematically absent when |F| < {@link EXTINCTION_REL_TOL} ×
 * |F| of the strongest compared reflection.
 */
export const EXTINCTION_REL_TOL: number = 1e-6;

/**
 * Creates the default {@link XrdParams} (the single source of UI defaults,
 * plan §7 "常量唯一来源"). A fresh object per call so callers can mutate
 * their own copy safely.
 */
export function createDefaultParams(): XrdParams {
  return {
    lambda: DEFAULT_LAMBDA,
    q: DEFAULT_Q,
    useLp: true,
    useThermal: true,
    usePeakShape: true,
    useAnomalous: DEFAULT_USE_DISPERSION,
    dispersionMode: 'fidelity',
    dispersionForm: 'legacy',
    rangeMin: SCAN_RANGE_MIN,
    rangeMax: SCAN_RANGE_MAX,
    step: SCAN_STEP,
  };
}
