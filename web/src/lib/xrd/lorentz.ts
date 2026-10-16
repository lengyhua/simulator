/**
 * Lorentz–polarization factor (plan §4.1):
 *
 *   Lp(2θ) = (1 + cos²(2θ)) / (sin²θ · cosθ),   θ = 2θ / 2
 *
 * This is the standard powder-diffraction form. FORENSIC NOTE: the legacy
 * CalcXRD.exe `help` RTF defines
 *
 *   Lp = (1 + cos²2θ) / (sin2θ · sinθ)
 *
 * where `sin2θ` is the DOUBLE angle sin(2θ) (the RTF's math escapes split
 * `sin` and `2θ` into separate runs, and every square in that document is
 * written `^2` — e.g. `cos2θ^2` — so `sin2θ` cannot be sin²θ). Since
 * sin(2θ) = 2·sinθ·cosθ, the legacy formula equals the standard form divided
 * by the constant 2 — identical after intensity normalization. The team-lead
 * correction `sin²θ·sinθ` → `cosθ` is hereby confirmed by raw-byte forensics
 * (an earlier "sin³θ" reading of this document was a mis-parse of sin(2θ)
 * and is retracted).
 *
 * Residual deviation of this implementation from the legacy reference is
 * explained by the legacy program's own f₀ table (Factor.dat, now decoded
 * into `factor_data.ts`) and dispersion table (FF.dat, now decoded into
 * `ff_data.ts`). Measured against the GUI-verified six-peak reference
 * (λ = Cu Kα, Laue mult, Factor.dat f₀ (`factor_data.ts`), q = 0.10 σ):
 *
 * | model                                   | six-peak deviation  |
 * | --------------------------------------- | ------------------- |
 * | standard Lp + Factor.dat f₀, Thermal off      | +2.9% … +45.4%      |
 * | standard Lp + Factor.dat f₀, per-atom B = 1   | −0.25% … −2.38%     |
 *
 * The thermal factor is PER ATOM (the .cord 7th field / the legacy atom
 * table's "B" column, default 1 — GUI-verified 2026-10-16), applied as
 * exp(−Bⱼ·s²) inside the structure factor; there is no global B parameter
 * (an earlier "global B = 0.9" ruling is superseded by the GUI evidence and
 * kept only as a historical fit in plan §7).
 *
 * As θ→0 the factor diverges (∝1/θ²); θ is clamped to
 * {@link MIN_THETA_DEG} so the result stays finite (plan §5-T06 acceptance 5).
 */

import { degToRad } from '@/lib/math';
import { MIN_THETA_DEG } from './constants';

/**
 * Lorentz–polarization factor at the diffraction angle `twoThetaDeg` (degrees).
 *
 * @param twoThetaDeg full diffraction angle 2θ in degrees (≥ 0).
 * @returns finite Lp ≥ 0; θ→0 is clamped, never Infinity/NaN.
 * @throws Error when `twoThetaDeg` is negative or non-finite, or when the
 *   denominator vanishes (2θ ≥ 180°, outside the powder-diffraction range).
 */
export function lorentzPolarization(twoThetaDeg: number): number {
  if (!Number.isFinite(twoThetaDeg) || twoThetaDeg < 0) {
    throw new Error(`Lp 入射角 2θ 应为非负有限值，实际为 ${twoThetaDeg}`);
  }
  // θ is half of 2θ; clamp away from 0 to keep the denominator nonzero.
  const thetaDeg = Math.max(twoThetaDeg / 2, MIN_THETA_DEG);
  const theta = degToRad(thetaDeg);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const cos2Theta = Math.cos(2 * theta);
  const numerator = 1 + cos2Theta * cos2Theta;
  const denominator = sinTheta * sinTheta * cosTheta;
  // cosθ > 0 for θ < 90° i.e. 2θ < 180°; guard the pathological tail anyway.
  if (denominator <= 0) {
    throw new Error(`Lp 分母非正（2θ=${twoThetaDeg}°，超出粉末衍射有效范围）`);
  }
  return numerator / denominator;
}
