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
 * Per-atom scattering factor, two forms (2026-10-18, byte-confirmed in
 * CalcXRD.exe 0x47c804–0x47c83e + Fd-open B-scan):
 *
 * Legacy real-arithmetic form (`SFOptions.dispersionForm = 'legacy'`, default,
 * matches the shipped program exactly — M3, byte-confirmed in
 * CalcXRD.exe 0x47c7f2–0x47c842 (disp) + 0x47c885–0x47c8b4 (DW),
 * `docs/ghidra-reverse-findings.md` §8.2):
 *
 *   f_contrib = D·( f₀ + F′ + 0.5·F″²/(f₀ + F″) )·occ,   D = exp(−Bⱼ·s²)
 *
 * ONE D multiplies the whole bracket; the f₀ inside the bracket is the
 * UNATTENUATED value (the f₀ block 0x47c70b–0x47c7ed and the dispersion
 * denominator contain no B/D; D enters only at the single outer FMUL).
 * No +F″ linear term (the legacy help RTF writes a form that adds one; the
 * actual code path has no `fadd [F″]` instruction — see
 * `docs/dispersion-al-settlement.md` 定案 1, byte trace 0x47c804–0x47c83e).
 * The Debye–Waller factor is `exp(−Bⱼ·s²)` with `s² = 1/(4d²)` =
 * `N/(4a²)` for cubic systems (byte-confirmed 0x47c6e4–0x47c706; B-source
 * offset +0x440, §2.3 original text had +0x420, corrected in §7.5/§7.6).
 * The "D on f₀ twice" reading (M5 = [f₀D+F′+0.5F″²/(f₀D+F″)]·D) does not
 * exist in the instruction stream and is ~−31% off in intensity (§8.5).
 * 111-normalized single-XRD tables show
 * `I(N)/I(111) = exp(−2·B·(N−3)/(4a²))` where "2" is the |F|² squaring
 * (D enters F once, |F|² ∝ D²); the 15-point B-scan fit
 * (002–005, 5 peaks × 3 B levels, max residual 0.0076%, <0.1%) confirms
 * this closed form — see 定案 7 / `ghidra-reverse-findings.md` §7.6/§8.9.
 *
 * Complex IT Vol C form (`SFOptions.dispersionForm = 'complex'`):
 *
 *   fⱼ = [ f₀(s)·exp(−Bⱼ·s²) + F′ ] + i·F″
 *
 * This is required for physically correct multi-species structures (e.g.
 * NaCl all-odd peaks, deviation up to ~19% vs. legacy scalar on weak
 * reflections). The DW factor attenuates ONLY f₀ in both forms; F′/F″ are
 * s-independent constants. When `useDispersion` is false (or the element/λ
 * is unsupported, e.g. Cr/Fe Kα) the correction vanishes and both forms
 * reduce to the neutral f₀ form.
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
   * Rock-salt odd-family rule (confirmed 2026-10-17, NaCl ref-data 025–032):
   * when true, reflections with (h+k+l) odd use |F| = |Re F| only (the f″
   * imaginary part is dropped), matching the legacy program's behavior.
   * Even-family reflections are always fully complex. For single-element
   * crystals (Al, Po, …) this is a no-op (no parity-dependent cancellation).
   */
  rockSaltOddReal?: boolean;
  /**
   * F′/F″ dispersion data source (used only when `useDispersion` is true):
   * - `'fidelity'` (default): FF.dat only, byte-for-byte legacy behavior.
   * - `'extended'`: adds Cr/Fe via LBNL Henke f″ (f′=0 approx) and ion species
   *   via charge-scaled F′/F″ approximation. Deviates from legacy; see
   *   docs/ion-and-cr-fe-data-research.md §3 for source citations.
   */
  dispersionMode?: 'fidelity' | 'extended';
  /**
   * Anomalous-dispersion formula variant (used only when `useDispersion` is
   * true and at least one of the dispersion-affected atoms has F″≠0):
   *
   * - `'legacy'` (default): real-arithmetic scalar form, byte-confirmed
   *   2026-10-18 in `CalcXRD.exe` 0x47c7f2–0x47c842 + 0x47c885–0x47c8b4
   *   (M3, `docs/ghidra-reverse-findings.md` §8.2):
   *
   *   f_contrib = D·( f₀ + F′ + 0.5·F″²/(f₀ + F″) )·occ,  D = e^(−B·s²)
   *
   *   No +F″ linear term (byte trace: no `fadd [F″]` instruction in the
   *   Fd branch). ONE D multiplies the whole bracket; f₀ inside is the
   *   unattenuated value. For single-element crystals (Al, Po, …) this
   *   gives |F|² results identical to the complex form to <0.001% (f″ enters
   *   only the real part; the imaginary contribution cancels by FCC
   *   symmetry when summed over the full Laue orbit).
   *
   * - `'complex'`: IT Vol C form `f = (f₀+F′) + i·F″`, which is
   *   physically correct for multi-species structures (NaCl etc.) where
   *   the f″ imaginary part of one species interferes with the real part
   *   of another. Deviates from the legacy program on weak odd-family
   *   reflections (up to ~19% on NaCl (220) rock-salt quirk, defect #12).
   *
   * See `docs/dispersion-al-settlement.md` 定案 1 (formula) and 定案 6
   * (B-scan B_eff non-constancy, legacy implementation quirk, faithful).
   */
  dispersionForm?: 'legacy' | 'complex';
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
 * Legacy single-XRD thermal treatment (verified 2026-10-17 against three
 * B-level switch-state tables for Al/CuKα1, B ∈ {0, 0.5, 1}, all other
 * switch states on): the Debye–Waller factor D = e^(−B·s²) multiplies the
 * COMPLETE f_eff bracket once (M3, §8.2) — i.e. `exp(−2·B·s²)` on |F|² —
 * with B taken AT FACE VALUE from the atom row (no rescaling).
 * 111-normalized, `I(N)/I(111) = exp(−2B(N−3)/(4a²))` (定案 7);
 * the M3 form was byte-verified to <0.1% on the 15-point B-scan
 * (2026-10-19; `ghidra-reverse-findings.md` §7.6/§8.9).
 */

/**
 * Structure factor F(h,k,l) (plan §3.2), two dispersion forms.
 *
 * `opts.dispersionForm`:
 * - `'legacy'` (default): real-arithmetic scalar M3 form, byte-confirmed in
 *   CalcXRD.exe 0x47c7f2–0x47c842 (disp) + 0x47c885–0x47c8b4 (DW):
 *     f_contrib = D·(f₀ + F′ + 0.5·F″²/(f₀ + F″))·occ,  D = e^(−B·s²)
 *   (no +F″ linear term; one D multiplies the whole bracket, f₀ inside is
 *   unattenuated). This is a pure real number; the structure factor
 *   becomes F = f_contrib·Σⱼ e^{iφⱼ} = f_contrib·(Σcosφ + i·Σsinφ).
 * - `'complex'`: IT Vol C form (f₀s+F′)+i·F″, required for physically
 *   correct multi-species structures (NaCl etc., deviation up to ~19% on
 *   weak odd-family peaks vs. the legacy form).
 *
 * Both forms use s² = 1/(4d²) (byte-confirmed 0x47c6e4–0x47c706;
 * B-source at atom record +0x440). 111-normalized intensity ratios follow
 * I(N)/I(111) = exp(−2·B·(N−3)/(4a²)) (cubic) — the "2" is the |F|²
 * squaring; closed form verified to 0.0076% on the 15-point B-scan
 * (定案 7, 2026-10-19; `ghidra-reverse-findings.md` §7.6/§8.9).
 *
 *
 * `SFOptions.thermalForm` (default `'legacy'`):
 * - `'legacy'` (M3, byte-confirmed §8.2): Debye–Waller D = e^(−B·s²)
 *   multiplies the COMPLETE f_eff bracket once
 *   `f_contrib = D·(f₀ + F′ + 0.5·F″²/(f₀ + F″))·occ` — DW attenuates
 *   the dispersion terms too (legacy implementation quirk, defect #20).
 * - `'complex'` (IT Vol. C physical form): DW attenuates ONLY f₀,
 *   `f = (f₀·D + F′) + i·F″`; F′/F″ are s-independent constants.
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
  const dispForm: 'legacy' | 'complex' = opts.dispersionForm ?? 'legacy';

  let re = 0;
  let im = 0;
  for (const atom of crystal.atoms) {
    const positions = expandPositions(crystal.sgKey, atom.wyckoff, atom.x, atom.y, atom.z);
    // Debye–Waller is per atom: exp(−Bⱼ·s²) with s² = 1/(4d²) (byte-confirmed
    // 0x47c6e4–0x47c706; B-source at atom record +0x440, §7.5/§7.6). It
    // attenuates only f₀; F′/F″ are s-independent constants.
    //
    // DW closed form (定案 7, 2026-10-19; §8.2 M3 / §8.9): the
    // 111-normalized single-XRD table shows I(N)/I(111) =
    // exp(−2·B·(N−3)/(4a²)) where "2" is the |F|² squaring (one D enters F,
    // |F|² ∝ D²). This 15-point B-scan fit (002–005, 5 peaks × 3 B levels)
    // has max residual 0.0076%, well within 0.1%. The outer single D below
    // combined with |F|² reproduces this exactly; no rescaling is needed.
    const f0s =
      f0(atom.element, s) * (opts.useThermal ? Math.exp(-atom.thermalB * s * s) : 1);
    const mode = opts.dispersionMode ?? 'fidelity';
    // Anomalous dispersion: F′/F″ from FF.dat (fidelity) or extended sources
    // (LBNL Henke for Cr/Fe, charge-scaled approximation for ions), indexed by
    // Z (not symbol — Z=91 is mislabeled "Po" in the source).
    // Unsupported element/λ → 0 (no-op).
    const fp = opts.useDispersion
      ? getDispersion(atom.element, opts.lambda, mode).fPrime
      : 0;
    const fpp = opts.useDispersion
      ? getDispersion(atom.element, opts.lambda, mode).fDoublePrime
      : 0;

    // Legacy scalar form, byte-confirmed M3 (定案 1, 0x47c804–0x47c83e;
    // DW 作用范围 0x47c897–0x47c8b4, ghidra-reverse-findings.md §8.2/缺陷#20):
    //   f_contrib = e^(−Bⱼ·s²) · ( f₀ⱼ + F′ + 0.5·F″²/(f₀ⱼ + F″) ) · occⱼ
    // 括号内 f₀ 是**原值**（f₀ 块 0x47c70b–0x47c7ed 无 B；色散块分母
    // `FLD f₀; FADD f″` 用的也是原值 f₀），外层单个 D 乘整个括号。
    // 对 f₀ 计两次 D（M5 = [f₀D+F′+0.5F″²/(f₀D+F″)]·D）的读法在指令流中
    // 不存在，数值上与 legacy 差 ~−31%（强度），已排除（§8.5）。
    // No +F″ 线性项 (asm trace: no fadd [F″] in the Fd branch).
    // The real scattering factor f_eff enters F = f_eff·(Σcosφ + i·Σsinφ).
    //
    // Complex IT Vol C form (dispForm = 'complex'):
    //   Re component = f₀s + F′ (coefficient `a`)
    //   Im component = F″       (coefficient `bi`)
    // (复数式保持教科书口径：DW 只乘 f₀，F″ 不衰减——与 legacy
    // 标量式 M3 的"D 乘完整 f_eff"口径不同；legacy 行为属实现特性而非物理。)
    const D = opts.useThermal ? Math.exp(-atom.thermalB * s * s) : 1;
    // Bare f₀ (no D) for the legacy M3 bracket: the f₀ block
    // (0x47c70b–0x47c7ed) and the dispersion denominator both use the
    // original-value f₀; D enters only at the outer single FMUL.
    const f0Val = f0(atom.element, s);
    const isLegacy = dispForm === 'legacy' && fpp !== 0;
    // 分母 (f₀+F″) 字节级实读 0x47c82b–0x47c83a：0x47c82b FLD f₀，
    // 0x47c833 FMUL [f″ slot]（DC 84 C3 60 39 00，f″=slot[1]，EAX=1），
    // 0x47c83a DE F9 = FDIVP。与 RTF 报表数值实证一致（候选 A 匹配到 1e-8，
    // 001-Al.rtf 三行对照）；早期 §2.2 "分母 f₀+f″" 说法维持正确，
    // help 公式 (5) 字面分母 (f₀+F′) 与代码分母 (f₀+F″) 确有差异。
    const legacyF = isLegacy
      ? D * (f0Val + fp + (0.5 * fpp * fpp) / (f0Val + fpp))
      : 0;
    const a  = isLegacy ? atom.occupancy * legacyF : atom.occupancy * (f0s + fp);
    const bi = isLegacy ? 0 : atom.occupancy * fpp;

    // Rock-salt odd-family rule (confirmed 2026-10-17, NaCl ref-data 025–032):
    // when `rockSaltOddReal` is set and (h+k+l) is odd, drop the f″
    // imaginary part so |F|² = re² (the "rock-salt phase quirk", legacy
    // defect #12). For single-element crystals this has no effect (there
    // is no parity-dependent f″ cancellation), so it is safe to enable
    // unconditionally in the single-XRD table.
    // The rule does not apply to the legacy scalar form (bi is already 0).
    const dropIm =
      !!opts.rockSaltOddReal && (h + k + l) % 2 !== 0 && fpp !== 0 && !isLegacy;
    for (const [x, y, z] of positions) {
      const phase = TWO_PI * (h * x + k * y + l * z);
      const c = Math.cos(phase);
      const sn = Math.sin(phase);
      re += a * c - bi * sn;
      if (!dropIm) {
        im += a * sn + bi * c;
      }
    }
  }
  // Rock-salt odd-family rule: for reflections with (h+k+l) odd, the legacy
  // program drops the f″ imaginary part (|F| = |Re F| only). This is a
  // legacy data quirk (confirmed 2026-10-17, NaCl ref-data 025–032): the
  // odd family (311/331/511…) reads systematically lower than the full
  // complex modulus would predict, with the deviation growing as B_Na
  // decreases (f″/f₀ ratio increases). Even families are unaffected.
  if (opts.rockSaltOddReal && (h + k + l) % 2 !== 0) {
    im = 0;
  }
  return { re, im };
}
