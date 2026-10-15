/**
 * Numerical helpers shared across the calculation engine.
 *
 * Pure functions only — no DOM, no I/O, no global mutable state.
 */

/** Relative/absolute tolerance used by pure-function tests (plan §7). */
export const REL_TOL = 1e-9;
export const ABS_TOL = 1e-12;

/** Clamps `value` into the closed interval [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Converts degrees to radians. */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Converts radians to degrees. */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Tolerance-based float comparison: `|a-b| <= max(relTol*max(|a|,|b|), absTol)`.
 * Used instead of `===` for computed crystallographic quantities.
 */
export function nearlyEqual(
  a: number,
  b: number,
  relTol: number = REL_TOL,
  absTol: number = ABS_TOL,
): boolean {
  return Math.abs(a - b) <= Math.max(relTol * Math.max(Math.abs(a), Math.abs(b)), absTol);
}
