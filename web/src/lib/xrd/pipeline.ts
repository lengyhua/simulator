/**
 * XRD computation pipeline (plan §3.2 / T07): Crystal + XrdParams → XRDPattern.
 *
 * Stages:
 *   1. hkl enumeration over a rigorous per-axis box. For any reflection with
 *      diffraction angle 2θ ≤ rangeMax, |h| = |G·a| ≤ |G|·|a| ≤ gMax·a with
 *      gMax = 2·sin(rangeMax/2)/λ (and likewise k, l) — so the box
 *      [−⌊gMax·a⌋..⌊gMax·a⌋] × … is guaranteed to contain every in-range
 *      reflection for ANY crystal system (no cubic-only shortcuts).
 *   2. d (general triclinic closed form) → 2θ, keeping rangeMin < 2θ ≤ rangeMax.
 *   3. Canonical Laue-orbit dedup: each orbit of (h,k,l) under the space-group
 *      rotations plus Friedel pairs is counted once, at its lexicographically
 *      largest image; the orbit size is the multiplicity. For cubic groups
 *      this reduces to the plan's h≥k≥l≥0 canonical form; for lower
 *      symmetries it stays correct where naive index sorting would merge
 *      distinct reflections (e.g. tetragonal (201) vs (102)).
 *   4. F (structure factor) → I = K·Lp·|F|²·mult; numerically extinct
 *      reflections (systematic absences, |F| ≈ 0) are dropped.
 *   5. Normalization (strongest peak = 100) and broadening (Gaussian or δ).
 */

import { degToRad, radToDeg } from '@/lib/math';
import { gaussianBroaden } from './gaussian';
import { normalizeReflections, reflectionIntensity } from './intensity';
import { dSpacing, structureFactor } from './structure_factor';
import type { Crystal, HKLReflection, XRDPattern, XrdParams } from './types';
import { laueOperations } from './wyckoff';

/**
 * Reflections whose intensity is below this fraction of the strongest one are
 * treated as numerically extinct (systematic absences give |F| ≈ 1e-13, i.e.
 * intensity ratios ~1e-26 — far below any real weak reflection).
 */
const EXTINCTION_DROP = 1e-12;
// Legacy 0.01 hard threshold (G2, byte-confirmed extended-precision
// constant @0x478d28, 0x478ad6–0x478b09): the powder path zeroes |F|²[i] < 0.01
// before binning — the filter tests the BARE |F|² (the 0.01 threshold loop
// runs before the Lp-multiplication loop 0x478ad6; Lp applies to surviving
// rows only). The single-table display pass (0x47c648) uses the same value.
// Accordingly this floor is applied to |F|², not to |F|²·Lp·mult.
const F2_ABSOLUTE_FLOOR = 0.01;

/** Validates calculation parameters, throwing errors with context. */
function validateParams(params: XrdParams): void {
  if (!Number.isFinite(params.lambda) || params.lambda <= 0) {
    throw new Error(`波长 λ 应为正有限值，实际为 ${params.lambda}`);
  }
  if (!Number.isFinite(params.q) || params.q < 0) {
    throw new Error(`高斯 FWHM q 应为非负有限值，实际为 ${params.q}`);
  }
  if (!Number.isFinite(params.step) || params.step <= 0) {
    throw new Error(`扫描步长应为正有限值，实际为 ${params.step}`);
  }
  if (!(params.rangeMin >= 0) || !(params.rangeMin < params.rangeMax)) {
    throw new Error(`扫描范围应满足 0 ≤ min < max，实际为 [${params.rangeMin}, ${params.rangeMax}]`);
  }
  if (params.rangeMax > 180) {
    throw new Error(`扫描上限不得超过 180°，实际为 ${params.rangeMax}`);
  }
}

/** True when `a` is lexicographically greater than `b` (component-wise). */
function lexGreater(a: number[], b: number[]): boolean {
  return (
    a[0] > b[0] ||
    (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))
  );
}

/**
 * Distinct Laue-orbit images of (h,k,l): every space-group rotation applied
 * to (h,k,l), plus each result's Friedel pair, deduplicated.
 */
function orbitImages(
  matrices: number[][],
  h: number,
  k: number,
  l: number,
): number[][] {
  const images: number[][] = [];
  const seen = new Set<string>();
  for (const m of matrices) {
    const v0 = m[0] * h + m[1] * k + m[2] * l;
    const v1 = m[3] * h + m[4] * k + m[5] * l;
    const v2 = m[6] * h + m[7] * k + m[8] * l;
    for (const sign of [1, -1]) {
      const key = `${sign * v0},${sign * v1},${sign * v2}`;
      if (!seen.has(key)) {
        seen.add(key);
        images.push([sign * v0, sign * v1, sign * v2]);
      }
    }
  }
  return images;
}

/**
 * Legacy report-grid quantization for the powder path.
 *
 * Byte-confirmed in `CalcXRD.exe` (VA 0x47875c–0x4787b5, 2026-10-19):
 *
 * ```text
 *   fld  [ebx+0x3fa8]              ; λ
 *   fdiv dword [0x4787e4]          ; ÷ 2.0
 *   fdiv qword [ebx+esi*8+0x27228] ; ÷ d        → sinθ
 *   call 0x427170                  ; ArcSin(x) = ArcTan2(x, Sqrt(1−x²))
 *   fmul dword [0x4787e4]          ; × 2.0
 *   fld  xword [0x4787d0]          ; π
 *   fdivp st(1)                    ; 2θ_rad / π
 *   fmul dword [0x4787dc]          ; × 180.0
 *   fmul dword [0x4787f4]          ; × 1000.0   ← K
 *   call 0x402a10                  ; Round → Int64 (fistp qword)
 *   fild qword [esp+0x134]
 *   fdiv dword [0x4787f4]          ; ÷ 1000.0
 *   fstp dword [ebx+esi*4+0x3e92c] ; → stored as Single
 * ```
 *
 * So the angle the legacy powder path keeps is
 *
 * ```text
 *   2θ₁ = Single( Round(2θ · 1000) / 1000 )
 * ```
 *
 * (the `Round(2θ·1000)/1000` millidegree step of findings G11, now
 * byte-confirmed rather than inferred, plus the Single-precision store), and
 * the hkl List / RTF table then prints it with two decimals. That is why the
 * shipped `Al.RTF` row for (222) reads `82.82`: `Single(82.825)` is
 * 82.824996948…, which rounds **down**, whereas the single-crystal table —
 * which prints three decimals from an exact angle — reads `82.830`.
 *
 * Every downstream powder quantity is then evaluated at that 2-decimal angle:
 * the reported `d` is `λ/(2·sin(2θ₁/2))`, the Lorentz–polarization factor is
 * `Lp(2θ₁)` (so the reported peak height is the broadened crest at 2θ₁), and
 * the Gaussian is centred on 2θ₁. Verified value-for-value against all six
 * Al(111…400) rows of `Al.RTF` (2θ, d at 4 dp, I at 1 unit).
 *
 * Note this deliberately makes the reported `d` slightly inconsistent with the
 * cell (a/√N, printed by the single-crystal table); the structure factor still
 * uses the exact `d` via `s = 1/(2d)`, exactly as the legacy code does.
 */
export function legacyPowderReportAngle(twoThetaDeg: number): number {
  const milliDeg = Math.round(twoThetaDeg * 1000) / 1000;
  // Math.fround = the legacy Single store at [ebx+esi*4+0x3e92c].
  return Math.round(Math.fround(milliDeg) * 100) / 100;
}

/**
 * Computes the full powder XRD pattern for a crystal under `params`.
 *
 * @throws Error on invalid parameters, an invalid cell, an unknown Wyckoff
 *   letter, or an untabulated element.
 */
export function computeXRDPattern(crystal: Crystal, params: XrdParams): XRDPattern {
  validateParams(params);

  const matrices = laueOperations(crystal.sgKey);
  // |G| = 2·sinθ/λ; 2θ ≤ rangeMax ⟺ |G| ≤ gMax; |h| ≤ |G|·a bounds each axis.
  const gMax = (2 * Math.sin(degToRad(params.rangeMax / 2))) / params.lambda;
  const nh = Math.max(1, Math.floor(gMax * crystal.a));
  const nk = Math.max(1, Math.floor(gMax * crystal.b));
  const nl = Math.max(1, Math.floor(gMax * crystal.c));

  // Per-atom thermal factors come from the crystal itself (the .cord "B"
  // column); `useThermal` is only the on/off switch. The F′F″ correction is
  // driven by `useAnomalous` (legacy GUI default: checkbox checked). The data
  // source (FF.dat fidelity vs. extended LBNL Henke + ion approximation) is
  // driven by `dispersionMode` (default 'fidelity' = byte-for-byte legacy).
  const sfOpts = {
    lambda: params.lambda,
    useThermal: params.useThermal,
    useDispersion: params.useAnomalous,
    dispersionMode: params.dispersionMode,
    // Legacy scalar form (byte-confirmed 0x47c804–0x47c83e, 定案 1):
    // f_eff = f₀+F′+0.5·F″²/(f₀+F″). 'complex' for multi-element structures.
    dispersionForm: params.dispersionForm,
  };

  const candidates: HKLReflection[] = [];
  const seenOrbits = new Set<string>();
  for (let h = -nh; h <= nh; h += 1) {
    for (let k = -nk; k <= nk; k += 1) {
      for (let l = -nl; l <= nl; l += 1) {
        if (h === 0 && k === 0 && l === 0) {
          continue; // (000) has no d-spacing
        }
        const d = dSpacing(crystal, h, k, l);
        const sinTheta = params.lambda / (2 * d);
        if (sinTheta > 1) {
          continue; // beyond backscattering — not reachable
        }
        const twoTheta = 2 * radToDeg(Math.asin(sinTheta));
        if (twoTheta <= params.rangeMin || twoTheta > params.rangeMax) {
          continue;
        }
        const images = orbitImages(matrices, h, k, l);
        let rep = images[0];
        for (const image of images) {
          if (lexGreater(image, rep)) {
            rep = image;
          }
        }
        if (h !== rep[0] || k !== rep[1] || l !== rep[2]) {
          continue; // a non-canonical member of an already-counted orbit
        }
        const key = `${rep[0]},${rep[1]},${rep[2]}`;
        if (seenOrbits.has(key)) {
          continue;
        }
        seenOrbits.add(key);

        // Reuse the d already computed above for 2θ to derive s = 1/(2d) and
        // hand it to structureFactor, avoiding a redundant dSpacing recompute.
        // d is invariant under Laue rotations + Friedel sign flips, so the s
        // from the original (h,k,l) equals s of the canonical `rep`.
        const s = 1 / (2 * d);
        const f = structureFactor(crystal, rep[0], rep[1], rep[2], { ...sfOpts, s });
        const f2 = f.re * f.re + f.im * f.im;
        // Legacy 0.01 hard threshold on BARE |F|² (G2): the filter loop
        // 0x478ad6–0x478b09 zeros |F|²[i] < 0.01 BEFORE the Lp loop, so
        // Lp-attenuation of surviving rows is downstream of the filter.
        if (f2 < F2_ABSOLUTE_FLOOR) {
          continue;
        }
        // Legacy powder path reports and broadens at the 0.01°-grid angle, not
        // at the exact Bragg angle — see legacyPowderReportAngle() above.
        const reportTheta = legacyPowderReportAngle(twoTheta);
        const reportD =
          reportTheta > 0 && reportTheta < 180
            ? params.lambda / (2 * Math.sin(degToRad(reportTheta / 2)))
            : d;
        const intensity = reflectionIntensity(reportTheta, f, images.length, {
          useLp: params.useLp,
        });
        candidates.push({
          h: rep[0],
          k: rep[1],
          l: rep[2],
          d: reportD,
          twoTheta: reportTheta,
          multiplicity: images.length,
          fRe: f.re,
          fIm: f.im,
          intensity,
          intensityNorm: 0,
        });
      }
    }
  }

  // Drop numerically extinct reflections (systematic absences).
  let maxIntensity = 0;
  for (const candidate of candidates) {
    if (candidate.intensity > maxIntensity) {
      maxIntensity = candidate.intensity;
    }
  }
  const kept =
    maxIntensity > 0
      ? candidates.filter(
          (r) => r.intensity > maxIntensity * EXTINCTION_DROP && r.intensity >= F2_ABSOLUTE_FLOOR,
        )
      : [];
  const reflections = normalizeReflections(kept);

  const broadened = gaussianBroaden(reflections, {
    min: params.rangeMin,
    max: params.rangeMax,
    step: params.step,
    q: params.usePeakShape ? params.q : 0,
  });

  return {
    twoTheta: broadened.twoTheta,
    intensity: broadened.intensity,
    reflections,
    meta: {
      lambda: params.lambda,
      q: params.q,
      step: params.step,
      min: params.rangeMin,
      max: params.rangeMax,
    },
  };
}
