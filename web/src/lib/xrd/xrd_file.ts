/**
 * .xrd file serializer / parser (plan §3.2 / T07).
 *
 * Byte-compatible with the legacy CalcXRD.exe output — see the authoritative
 * reference `tests/fixtures/Al.xrd` (CRLF throughout):
 * ```
 * Al                                 <- crystal name
 * Lamda = 1.54056                    <- wavelength (trailing space preserved)
 *   3.000,100.000,  0.001            <- min, max, step  (%7.3f each, comma-joined)
 * Data Number =     9700             <- interval count (max−min)/step, %8d
 * Full Scall  =    10000             <- legacy display-scale constant, %8d
 *    3.0000       0                  <- data rows: %9.4f (2θ) + %8.0f (I)
 *   ...
 *  100.0000       2
 * 0                                   <- lone terminator line
 * ```
 *
 * Deliberate deviations from the legacy bytes (documented, plan §8-7/§8-8):
 * - header line 3 writes the ACTUAL grid step (the legacy `0.001` is a
 *   known quirk — the real row spacing is 0.01°);
 * - data rows carry RAW intensities (the legacy `Full Scall = 10000` is a UI
 *   display scale, not a normalization — the reference file's own peak is
 *   152557).
 */

import type { Crystal, XRDPattern } from './types';

/** Legacy display-scale constant written into the header. */
const FULL_SCALE = 10000;

/** Right-aligns an integer in `width` columns (printf %<width>d). */
function padInt(value: number, width: number): string {
  return String(Math.round(value)).padStart(width);
}

/** Formats a degrees value as printf %7.3f. */
function fmtDegrees(value: number): string {
  return value.toFixed(3).padStart(7);
}

/**
 * Serializes a pattern to .xrd text (legacy layout, CRLF line endings).
 *
 * @throws Error when the pattern grid is empty.
 */
export function serializeXrd(crystal: Crystal, pattern: XRDPattern): string {
  const { twoTheta, intensity, meta } = pattern;
  if (twoTheta.length === 0 || twoTheta.length !== intensity.length) {
    throw new Error('.xrd 序列化失败：图谱网格为空或与强度数组长度不一致');
  }
  const intervals = twoTheta.length - 1; // legacy "Data Number" counts intervals
  const lines: string[] = [
    crystal.name,
    `Lamda = ${meta.lambda.toFixed(5)} `,
    `${fmtDegrees(meta.min)},${fmtDegrees(meta.max)},${fmtDegrees(meta.step)}`,
    `Data Number = ${padInt(intervals, 8)}`,
    `Full Scall  = ${padInt(FULL_SCALE, 8)}`,
  ];
  for (let i = 0; i < twoTheta.length; i += 1) {
    lines.push(`${twoTheta[i].toFixed(4).padStart(9)}${padInt(intensity[i], 8)}`);
  }
  lines.push('0'); // legacy terminator line
  return lines.join('\r\n') + '\r\n';
}

/**
 * Parses .xrd text into 2θ / intensity arrays.
 *
 * Tolerant by design: the five header lines are skipped, data rows are read
 * by whitespace splitting (the fixed `%9.4f%8.0f` layout included), and the
 * lone `0` terminator line is ignored.
 */
export function parseXrd(text: string): { twoTheta: number[]; intensity: number[] } {
  const lines = text.split(/\r\n|\r|\n/);
  const twoTheta: number[] = [];
  const intensity: number[] = [];
  for (const line of lines.slice(5)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2 || parts[0] === '') {
      continue; // terminator line / blank
    }
    const angle = Number(parts[0]);
    const value = Number(parts[1]);
    if (!Number.isFinite(angle) || !Number.isFinite(value)) {
      continue;
    }
    twoTheta.push(angle);
    intensity.push(value);
  }
  return { twoTheta, intensity };
}
