/**
 * Binary parser for the legacy program's `FF.dat` —
 * the F′/F″ anomalous-dispersion table, GENERATED FILE, DO NOT EDIT.
 *
 * Source: `FF.dat` shipped with CalcXRD.exe (binary, 9568 bytes = 92
 * records × 104 bytes), fully decoded 2026-10-16
 * (`docs/params-dispersion.md` §1, evidence in
 * `docs/audits/ff-dat-validation.md`). The pre-generated runtime table
 * lives in `ff_data.ts`; this parser is the runtime path for loading a
 * user-supplied `FF.dat` binary (one parser file per parameter category,
 * per the project's file-organization rule).
 *
 * Record layout (no file header; records are packed contiguously,
 * ordered H..U so record n (0-based) is element Z = n + 1):
 *
 *   Offset 0      : Delphi ShortString length byte L (0..7)
 *   Offset 1..L   : ASCII element symbol, zero-padded to a fixed 8 bytes
 *   Offset 8..103 : 12 little-endian IEEE-754 doubles, INTERLEAVED
 *                  (f′, f″) × 6 radiation columns in the order
 *                  CuKα1, CuKα2, MoKα1, MoKα2, CoKα1, CoKα2
 *
 * ⚠ KNOWN LEGACY DATA DEFECTS (kept faithful, not rescaled —
 * CLAUDE.md rule 4):
 * - Z=91 is mislabelled `Po` in the source (must be `Pa`). The parser
 *   therefore returns symbols exactly as stored; callers MUST index by
 *   Z (record position), never by the raw symbol. `ff_data.ts` carries
 *   the corrected `FF_SYMBOLS` table for symbol→Z mapping.
 * - Ce (Z=58) Cu Kα1 f′ = −1.087 is a confirmed data-entry defect
 *   (should be ≈ −1.88; three independent lines of evidence in
 *   `docs/audits/ff-dat-validation.md`). Left as-is.
 */

import type { DispersionResult } from './dispersion';

/**
 * One parsed FF.dat record: element symbol (as stored, possibly mislabelled)
 * plus the 6 interleaved (f′, f″) radiation columns.
 */
export interface FFRecord {
  /** ASCII symbol exactly as stored in the binary (Z=91 reads "Po"). */
  symbol: string;
  /** 12 numbers: [f′₁,f″₁, f′₂,f″₂, …, f′₆,f″₆] per {@link FF_RAD_COLUMNS}. */
  values: number[];
}

/** Radiation column order (Cu/Mo/Co Kα1+Kα2) — mirrors `ff_data.ts` FF_LAMBDAS. */
export const FF_RAD_COLUMNS = ['CuKa1', 'CuKa2', 'MoKa1', 'MoKa2', 'CoKa1', 'CoKa2'] as const;

/**
 * Parses a `FF.dat` binary (92 records × 104 bytes, no header) into an
 * ordered record array. Record n (0-based) corresponds to element Z = n+1.
 *
 * @throws Error when the byte buffer does not have the exact packed-record
 *   size (92 × 104 = 9568 bytes) or a record's ShortString length byte is
 *   out of range for the 8-byte name slot.
 *
 * Accepts any `ArrayBuffer`-typed input (`Uint8Array` from `FileReader`/
 * `fetch`, a plain `ArrayBuffer`, etc.).
 */
export function parseFFDat(input: ArrayBuffer | Uint8Array): FFRecord[] {
  const bytes: Uint8Array = input instanceof Uint8Array ? input : new Uint8Array(input);
  const RECORD = 104;
  const NAME_SLOTS = 8;
  const COEF_OFFSET = 8; // 12 doubles start at record offset 8
  const COEF_COUNT = 12; // 6 × (f′, f″)

  const recordCount = bytes.length / RECORD;
  if (!Number.isInteger(recordCount) || recordCount <= 0) {
    throw new Error(
      `FF.dat 字节数 ${bytes.length} 不是 ${RECORD} 字节定长记录的整数倍（期望 92 条 = 9568 字节）`,
    );
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const out: FFRecord[] = [];
  for (let i = 0; i < recordCount; i += 1) {
    const base = i * RECORD;
    const len = bytes[base];
    if (len > NAME_SLOTS - 1) {
      throw new Error(
        `FF.dat 记录 ${i}（element 名）ShortString 长度 L=${len} 超出 8 字节槽位（max ${NAME_SLOTS - 1}）`,
      );
    }
    let name = '';
    for (let j = 0; j < len; j += 1) {
      const code = bytes[base + 1 + j];
      name += code >= 32 && code <= 126 ? String.fromCharCode(code) : '';
    }
    if (name.length === 0) {
      throw new Error(`FF.dat 记录 ${i} 元素名为空（L=${len}），无法解析`);
    }

    // 12 little-endian IEEE-754 doubles (float64, 8 bytes each),
    // interleaved (f′, f″) × 6 columns.
    const values: number[] = [];
    for (let k = 0; k < COEF_COUNT; k += 1) {
      values.push(dv.getFloat64(COEF_OFFSET + k * 8 + base, true));
    }

    out.push({ symbol: name, values });
  }

  return out;
}

/**
 * Convenience wrapper: parses `FF.dat` and builds the (fPrime, fDoublePrime,
 * supported, source) lookup shape that `dispersion.ts` consumes. The result
 * is keyed by Z-index (0-based, Z = index + 1) — NEVER by symbol, because
 * record 90 (Z=91) is mislabelled "Po" in the source (see module header).
 *
 * `lambda` selects the nearest radiation column (no interpolation — the
 * three column pairs straddle K absorption edges, so linear interpolation
 * between them is physically meaningless; same policy as `dispersion.ts`).
 */
export function ffDatToDispersion(
  input: ArrayBuffer | Uint8Array,
  lambda: number,
): Record<number, DispersionResult> {
  const records = parseFFDat(input);
  const columns = Object.values(
    { CuKa1: 1.54056, CuKa2: 1.54439, MoKa1: 0.7093, MoKa2: 0.71359, CoKa1: 1.78897, CoKa2: 1.79285 },
  ) as number[];

  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < columns.length; i += 1) {
    const delta = Math.abs(columns[i] - lambda);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  // Tolerance matches `dispersion.ts` LAMBDA_TOLERANCE.
  const supported = Number.isFinite(lambda) && lambda > 0 && bestDelta <= 0.05;

  const out: Record<number, DispersionResult> = {};
  records.forEach((rec, zIdx) => {
    out[zIdx] = {
      fPrime: supported ? rec.values[2 * bestIndex] : 0,
      fDoublePrime: supported ? rec.values[2 * bestIndex + 1] : 0,
      supported,
      source: 'FF.dat',
    };
  });
  return out;
}
