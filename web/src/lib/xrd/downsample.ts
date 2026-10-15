/**
 * Pattern downsampling for chart rendering (plan §5-T11).
 *
 * A full scan holds ~9701 points; SVG-rendering all of them per interaction
 * janks the page. Max-per-bucket sampling keeps every peak crest (the visual
 * signature of a powder pattern) while cutting the point count to
 * `maxPoints` — unlike striding, it can never drop a peak between samples.
 */

/** One chart point: 2θ (degrees) and intensity. */
export interface ChartPoint {
  twoTheta: number;
  intensity: number;
}

/**
 * Reduces a (twoTheta, intensity) series to at most `maxPoints` points,
 * keeping the maximum-intensity point of each equal-width bucket.
 *
 * Buckets partition the index range contiguously and without overlap, so the
 * strongest point of every bucket survives and peak heights are preserved
 * exactly; only peak shoulders are thinned.
 *
 * @param twoTheta angle grid (strictly increasing expected, not enforced).
 * @param intensity intensities, same length as `twoTheta`.
 * @param maxPoints upper bound on output length (≥ 1); the output is exactly
 *   `min(N, maxPoints)` points.
 * @returns a new array of {@link ChartPoint}s (empty when the input is empty).
 */
export function downsamplePattern(
  twoTheta: readonly number[],
  intensity: readonly number[],
  maxPoints = 2000,
): ChartPoint[] {
  const n = Math.min(twoTheta.length, intensity.length);
  if (n === 0) {
    return [];
  }
  if (n <= maxPoints) {
    const points: ChartPoint[] = [];
    for (let i = 0; i < n; i += 1) {
      points.push({ twoTheta: twoTheta[i], intensity: intensity[i] });
    }
    return points;
  }
  const buckets = Math.max(1, Math.floor(maxPoints));
  const points: ChartPoint[] = [];
  for (let b = 0; b < buckets; b += 1) {
    const start = Math.floor((b * n) / buckets);
    const end = Math.floor(((b + 1) * n) / buckets);
    let best = start;
    for (let i = start + 1; i < end; i += 1) {
      if (intensity[i] > intensity[best]) {
        best = i;
      }
    }
    points.push({ twoTheta: twoTheta[best], intensity: intensity[best] });
  }
  return points;
}
