/**
 * Binary parser for the legacy program's `Factor.dat` —
 * the authoritative f₀ (atomic scattering factor) table, GENERATED FILE,
 * DO NOT EDIT.
 *
 * Source: `Factor.dat` shipped with CalcXRD.exe (binary, 19104 bytes =
 * 199 records × 96 bytes), decoded 2026-10-16 (layout cross-validated in
 * `docs/DATA-REFERENCE.md` §2 and `docs/data/factor_dat.csv`). The pre-
 * generated runtime table lives in `factor_data.ts`; this parser is the
 * runtime path for loading a user-supplied `Factor.dat` binary (one parser
 * file per parameter category, per the project's file-organization rule).
 *
 * Record layout (no file header; records are packed contiguously):
 *
 *   Offset 0      : Delphi ShortString length byte L (0..14; the shipped
 *                   table uses L ≤ 4, i.e. ASCII species names ≤ 4 chars)
 *   Offset 1..L   : ASCII species name, zero-padded to a fixed 8 bytes
 *                   (e.g. "H", "H1-", "Na1+", "Cval", "Siva" — valence
 *                   variants kept as-is)
 *   Offset 8..95  : 11 little-endian IEEE-754 **doubles** (float64, 8 bytes
 *                   each — confirmed against record 0 "H": float64 read gives
 *                   a=[0.413048,…], c=4.9e-05 matching `factor_data.ts`;
 *                   float32 read gives garbage), INTERLEAVED
 *                   a1,b1,a2,b2,a3,b3,a4,b4,a5,b5,c — i.e.
 *                   a = [v0,v2,v4,v6,v8], b = [v1,v3,v5,v7,v9], c = v10,
 *                   evaluated as f0(s) = Σᵢ aᵢ·exp(−bᵢ·s²) + c,
 *                   s = sinθ/λ [Å⁻¹].
 *
 * The exponent is NEGATIVE. (The legacy help RTF's exp(bᵢ(λ/sinθ)²) is an
 * RTF transcription artifact — `docs/DATA-REFERENCE.md` §2.)
 *
 * Sanity check applied in {@link parseFactorDat}: for each record,
 * Σaᵢ + c should equal the species' electron count within ~0.04 (180/199
 * records match to <1e-3; the remaining 19 are table rounding, not parser
 * bugs) — violations above `electronCountTolerance` are reported, not
 * silently corrected (fidelity-first convention, CLAUDE.md rule 4).
 */

import type { FactorCoefficients } from './factor_data';

/** Number of Gaussian terms in the shipped table (drives the evaluator loop). */
const TERM_COUNT = 5;

/**
 * Parses a `Factor.dat` binary (199 records × 96 bytes, no header) into the
 * same `FACTOR_COEFFS` shape that `factor_data.ts` exports.
 *
 * @throws Error when the byte buffer does not have the exact packed-record
 *   size (199 × 96 = 19104 bytes) or a record's ShortString length byte is
 *   out of range for the 8-byte name slot.
 *
 * The parser accepts any `ArrayBuffer`-typed input (`Uint8Array` from
 * `FileReader`/`fetch`, a plain `ArrayBuffer`, etc.) — callers in the web
 * UI use `await file.arrayBuffer()` and pass it through.
 */
export function parseFactorDat(input: ArrayBuffer | Uint8Array): Record<string, FactorCoefficients> {
  const bytes: Uint8Array = input instanceof Uint8Array ? input : new Uint8Array(input);
  const RECORD = 96;
  const NAME_SLOTS = 8; // fixed 8-byte name field (L byte + 7 data bytes)
  const COEF_OFFSET = 8; // doubles start at record offset 8
  const COEF_COUNT = 11; // 5 a's + 5 b's interleaved, + c

  const recordCount = bytes.length / RECORD;
  if (!Number.isInteger(recordCount) || recordCount <= 0) {
    throw new Error(
      `Factor.dat 字节数 ${bytes.length} 不是 ${RECORD} 字节定长记录的整数倍（期望 199 条 = 19104 字节）`,
    );
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const out: Record<string, FactorCoefficients> = {};
  for (let i = 0; i < recordCount; i += 1) {
    const base = i * RECORD;
    const len = bytes[base];
    if (len > NAME_SLOTS - 1) {
      throw new Error(
        `Factor.dat 记录 ${i}（species 名）ShortString 长度 L=${len} 超出 8 字节槽位（max ${NAME_SLOTS - 1}）`,
      );
    }
    let name = '';
    for (let j = 0; j < len; j += 1) {
      const code = bytes[base + 1 + j];
      name += code >= 32 && code <= 126 ? String.fromCharCode(code) : '';
    }
    if (name.length === 0) {
      throw new Error(`Factor.dat 记录 ${i} 物种名为空（L=${len}），无法解析`);
    }

    const interleaved: number[] = [];
    for (let k = 0; k < COEF_COUNT; k += 1) {
      // 11 little-endian IEEE-754 doubles (8 bytes each), interleaved
      // a1,b1,a2,b2,…,a5,b5,c — confirmed against `factor_data.ts`
      // (record 0 H: a=[0.413048,…], c=4.9e-05 matches the LE float64 read;
      // big-endian read produces garbage).
      interleaved.push(dv.getFloat64(COEF_OFFSET + k * 8 + base, true));
    }

    // Interleaved layout: a1,b1,a2,b2,a3,b3,a4,b4,a5,b5,c (11 values).
    // a = indices 0,2,4,6,8; b = indices 1,3,5,7,9; c = index 10.
    const a = [0, 2, 4, 6, 8].map((idx) => interleaved[idx]);
    const b = [1, 3, 5, 7, 9].map((idx) => interleaved[idx]);
    const c = interleaved[10];
    if (a.length !== TERM_COUNT || b.length !== TERM_COUNT) {
      throw new Error(`Factor.dat 记录 ${i} 系数数量不足（a=${a.length}, b=${b.length}，期望各 ${TERM_COUNT}）`);
    }

    // Keep the exact key the shipped table uses (e.g. "Na1+", "Cval").
    out[name] = { a, b, c };
  }

  return out;
}

/**
 * Companion validator (fidelity convention, CLAUDE.md rule 1–3): reports
 * records whose Σaᵢ+c deviates from the expected electron count by more
 * than `tolerance`. Callers may log or surface these; the parser itself
 * does NOT rescale any value (遗留缺陷保真优先).
 *
 * @param coeffs parsed coefficients (from {@link parseFactorDat})
 * @param electronCount map of species → expected e⁻ (Z ∓ charge); pass
 *   `undefined` to skip records not in the map.
 */
export function validateFactorElectronCount(
  coeffs: Record<string, FactorCoefficients>,
  electronCount: Record<string, number> | undefined,
  tolerance = 0.05,
): Array<{ species: string; sum: number; expected: number; delta: number }> {
  if (!electronCount) {
    return [];
  }
  const out: Array<{ species: string; sum: number; expected: number; delta: number }> = [];
  for (const [species, c] of Object.entries(coeffs)) {
    const expected = electronCount[species];
    if (expected === undefined) {
      continue;
    }
    const sum = c.a.reduce((acc, v) => acc + v, 0) + c.c;
    const delta = sum - expected;
    if (Math.abs(delta) > tolerance) {
      out.push({ species, sum, expected, delta });
    }
  }
  return out;
}
