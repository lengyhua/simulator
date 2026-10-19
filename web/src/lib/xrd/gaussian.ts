/**
 * Gaussian peak broadening (plan §3.2 / T07), in the legacy program's own
 * parameterization (help formula 6, GUI-verified 2026-10-16, and
 * re-confirmed against `samples/Al.xrd`):
 *
 *   I(2θ) = Σ_hkl I_hkl · exp(−(2θ − 2θ_hkl)² / (2q²))
 *
 * `q` is the Gaussian standard deviation σ in degrees — NOT the FWHM (the
 * earlier q = 0.25 FWHM reading is deprecated). The default q = 0.10 gives
 * FWHM = 2.355q ≈ 0.2355°, matching the legacy Al.xrd profile point-by-point
 * (a grid point 0.01° off a crest reads crest·exp(−0.005)).
 *
 * **No 1/(q·√2π) amplitude factor** — the legacy program normalizes each
 * Gaussian so its *crest* equals the reflection intensity I_hkl; only the
 * wings (exp(−dx²/2q²)) are added to neighbouring grid points. Evidence:
 * the legacy GUI's own chart reads 152557 at the 38.63° crest, and a
 * legacy-saved `.xrd` (`samples/Al.xrd`)
 * carries 152557 at that same grid point. With a 1/(q·√2π) density
 * normalization the crest would read I_hkl/(q·√2π) ≈ 608614 for the same
 * data — a factor of 3.9894 = 1/(0.10·√(2π)) too high. The help RTF's
 * formula (6) text prints a "f(x)=exp(−(x−u)²/2q²)/(q√(2π))" style, but
 * the shipped program's actual numerics (chart + saved file) are the
 * crest-normalized form; we follow the program, not the RTF prose.
 *
 * Consequence: `I_hkl` (a discrete reflection, or the q≤0 δ stick value)
 * and the broadened crest are numerically equal, so peak height in the
 * .xrd / List output is I_hkl itself — no hidden per-peak rescaling.
 * Relative intensities between peaks are therefore preserved trivially.
 *
 * With `q ≤ 0` the output is a δ stick spectrum: each reflection's intensity
 * lands on the nearest grid point (the `usePeakShape = false` mode of the
 * pipeline). Overlapping sticks add up.
 */

import type { HKLReflection } from './types';

/** Options for {@link gaussianBroaden}. */
export interface BroadenOptions {
  /** Scan start in degrees. */
  min: number;
  /** Scan end in degrees. */
  max: number;
  /** Grid step in degrees. */
  step: number;
  /** Gaussian standard deviation σ in degrees; ≤ 0 selects δ stick spectrum. */
  q: number;
}

/** A broadened pattern on an evenly spaced 2θ grid. */
export interface BroadenedPattern {
  twoTheta: number[];
  intensity: number[];
}

/**
 * Gaussian contributions beyond ±8σ are below e⁻³² ≈ 1.3e-14 — numerically
 * zero for any realistic intensity, so the window keeps the loop cheap
 * without changing results.
 */
const GAUSSIAN_WINDOW_Q = 8;

/**
 * Broadens discrete reflections onto a `[min, max]` grid with spacing `step`.
 *
 * The grid holds `floor((max−min)/step) + 1` points (9701 for the default
 * 3–100°/0.01° range, matching the legacy Al.xrd layout); the last point is
 * snapped to `max` when float drift brings it within 1e-9.
 *
 * @throws Error when the range/step parameters are invalid.
 */
export function gaussianBroaden(
  reflections: HKLReflection[],
  opts: BroadenOptions,
): BroadenedPattern {
  const { min, max, step, q } = opts;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    throw new Error(`展宽范围无效：[${min}, ${max}]`);
  }
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`展宽步长应为正有限值，实际为 ${step}`);
  }
  if (!Number.isFinite(q) || q < 0) {
    throw new Error(`高斯 σ（q）应为非负有限值，实际为 ${q}`);
  }

  const count = Math.floor((max - min) / step + 1e-6) + 1;
  const twoTheta: number[] = new Array(count);
  const intensity: number[] = new Array(count).fill(0);
  for (let i = 0; i < count; i += 1) {
    twoTheta[i] = min + i * step;
  }
  // Snap a drifted final point (e.g. 100.00000000000001) onto max exactly.
  if (Math.abs(twoTheta[count - 1] - max) <= 1e-9) {
    twoTheta[count - 1] = max;
  }

  for (const reflection of reflections) {
    if (!(reflection.intensity > 0)) {
      continue; // extinct / non-positive reflections contribute nothing
    }
    if (q <= 0) {
      // δ stick spectrum: intensity lands on the nearest grid point.
      const index = Math.round((reflection.twoTheta - min) / step);
      if (index >= 0 && index < count) {
        intensity[index] += reflection.intensity;
      }
      continue;
    }
    const halfWidth = GAUSSIAN_WINDOW_Q * q;
    const from = Math.max(0, Math.ceil((reflection.twoTheta - halfWidth - min) / step));
    const to = Math.min(count - 1, Math.floor((reflection.twoTheta + halfWidth - min) / step));
    // Crest-normalized form: the reflection's full intensity I_hkl lands on
    // the crest; neighbouring grid points add I_hkl·exp(−dx²/2q²). No
    // 1/(q·√2π) density factor (see the file-header evidence note — the
    // legacy program's saved `.xrd` and its own chart both read I_hkl at the
    // crest, not I_hkl/(q·√2π)).
    for (let i = from; i <= to; i += 1) {
      const dx = twoTheta[i] - reflection.twoTheta;
      intensity[i] += reflection.intensity * Math.exp((-dx * dx) / (2 * q * q));
    }
  }

  return { twoTheta, intensity };
}
