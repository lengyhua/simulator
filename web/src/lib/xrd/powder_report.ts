import type { HKLReflection } from './types';

/**
 * Powder List-table report row (2026-10-20, NaCl.RTF 对照定案).
 *
 * The legacy powder List/RTF report is **grouped by d**: reflections whose
 * Bragg angles coincide share ONE row, the hkl column lists every family,
 * and `I` is the SUM of the family intensities. Evidence
 * (`D:/Users/admin/Desktop/NaCl.RTF`, last row):
 *
 * ```
 *   90.83  1.0815  9325  9  (-3-3-3)(333)…(5-11)(-115)…(511)…   ← 32 hkl
 * ```
 *
 * `{333}` (mult 8) and `{511}` (mult 24) have the same N = 27 → identical d,
 * so the shipped program merges them into one row: 2331 + 6994 = 9325, and
 * 2 + 7 = 9 (‰). web previously printed them as two separate rows, which is
 * why NaCl showed 11 peaks against the legacy 10 — every number still
 * matched, only the row layout differed.
 *
 * This module reproduces that grouping at the report layer only — the engine
 * keeps one {@link HKLReflection} per crystallographic FAMILY (its
 * `multiplicity` field already counts the members), so nothing about the
 * physics changes.
 */

/** One crystallographic family sharing the row's angle. */
export interface PowderReportFamily {
  /** Representative hkl of the family (the first one enumerated). */
  h: number;
  k: number;
  l: number;
  /** Member count of the family — the reflection's `multiplicity`. */
  multiplicity: number;
  /** Intensity of the whole family (already Σ over its members). */
  intensity: number;
}

/** A grouped List-table row — what the legacy RTF report prints per line. */
export interface PowderReportRow {
  twoTheta: number;
  d: number;
  /** One entry per distinct family sharing this angle (legacy order). */
  families: PowderReportFamily[];
  /** Representative hkl of every family, in enumeration order. */
  hklList: string[];
  /** Sum of the family intensities — the legacy row's `I`. */
  intensity: number;
  /** Relative intensity, strongest row = 1000 (legacy List convention). */
  intensityIo: number;
  /** Total multiplicity = Σ family member counts (e.g. 8 + 24 = 32). */
  multiplicity: number;
}

/** Formats hkl as `(h k l)`, the web table's display form. */
function hklLabel(h: number, k: number, l: number): string {
  return `(${h} ${k} ${l})`;
}

/**
 * Family key: the sorted absolute indices. (1 1 1) / (-1 -1 -1) / (1 -1 1) …
 * all map to `1,1,1`; (5 1 1) / (1 5 -1) / (-1 1 5) … all map to `5,1,1`.
 * The engine already enumerates one reflection per family, so this grouping
 * is idempotent there — it stays as a guard against member-level duplicates.
 */
function familyKey(reflection: HKLReflection): string {
  return [Math.abs(reflection.h), Math.abs(reflection.k), Math.abs(reflection.l)]
    .sort((a, b) => b - a)
    .join(',');
}

/**
 * Groups reflections the way the legacy powder List table does: one row per
 * distinct 2θ (the reported, millidegree-quantized angle), families merged,
 * intensities and multiplicities summed, and I/Io renormalized so the
 * strongest row = 1000.
 *
 * Rows come back in first-seen order; callers that need the legacy
 * ascending-2θ layout should sort by {@link PowderReportRow.twoTheta}.
 */
export function groupReflectionsByAngle(reflections: readonly HKLReflection[]): PowderReportRow[] {
  const rows: PowderReportRow[] = [];
  const rowByAngle = new Map<string, PowderReportRow>();
  const familyByKey = new Map<string, PowderReportFamily>();

  for (const reflection of reflections) {
    // Key on the 2-decimal reported angle: the legacy report rounds 2θ to
    // two decimals, so two families only share a row when they print alike.
    // (Their exact millidegree Singles are equal anyway when d is equal.)
    const angleKey = reflection.twoTheta.toFixed(2);
    let row = rowByAngle.get(angleKey);
    if (!row) {
      row = {
        twoTheta: reflection.twoTheta,
        d: reflection.d,
        families: [],
        hklList: [],
        intensity: 0,
        intensityIo: 0,
        multiplicity: 0,
      };
      rowByAngle.set(angleKey, row);
      rows.push(row);
    }

    const key = familyKey(reflection);
    let family = familyByKey.get(key);
    if (!family) {
      family = {
        h: reflection.h,
        k: reflection.k,
        l: reflection.l,
        multiplicity: 0,
        intensity: 0,
      };
      familyByKey.set(key, family);
      row.families.push(family);
      row.hklList.push(hklLabel(reflection.h, reflection.k, reflection.l));
    }
    // A reflection carries the WHOLE family: its `multiplicity` is the member
    // count and its `intensity` already includes it.
    family.multiplicity += reflection.multiplicity;
    family.intensity += reflection.intensity;

    row.intensity += reflection.intensity;
    row.multiplicity += reflection.multiplicity;
  }

  // I/Io is defined on the ROWS (the merged value is what legacy prints), so
  // renormalize after all rows exist.
  const maxIntensity = rows.reduce((max, row) => Math.max(max, row.intensity), 0);
  if (maxIntensity > 0) {
    for (const row of rows) {
      row.intensityIo = (row.intensity / maxIntensity) * 1000;
    }
  }
  return rows;
}

/** Compact hkl cell text: one representative per family, e.g. `(3 3 3) (5 1 1)`. */
export function reportHklCell(row: PowderReportRow): string {
  return row.families.map((family) => hklLabel(family.h, family.k, family.l)).join(' ');
}

/** Full member list for a row's tooltip, e.g. `(3 3 3) (5 1 1)`. */
export function reportHklFull(row: PowderReportRow): string {
  return row.hklList.join(' ');
}
