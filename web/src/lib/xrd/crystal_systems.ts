/**
 * Crystal-system ↔ space-group linkage data (plan §UI-2, GUI 2026-10-16):
 * the original CalcXRD program's "System" dropdown constrains the SpaceGroup
 * list, and the system fixes which lattice angles are variable.
 *
 * Source: `WholeSG` (254 groups) split by the standard space-group number
 * ranges per crystal system (ITC Vol A: Triclinic 1; Monoclinic 2–15;
 * Orthorhombic 16–74; Tetragonal 75–143; Trigonal 144–167; Hexagonal
 * 168–194; Cubic 195–230). The legacy program's own System list ships these
 * 7 systems with the "Orthohombic" spelling (legacy quirk, kept for the
 * `Crystal.system` field to stay byte-compatible with .cord output).
 */

import { spaceGroupKeys } from './wyckoff';

/** Crystal systems in the legacy program's UI order. */
export const CRYSTAL_SYSTEMS = [
  'Cubic',
  'Tetragonal',
  'Orthohombic',
  'Hexagonal',
  'Trigonal',
  'Monoclinic',
  'Triclinic',
] as const;

export type CrystalSystem = (typeof CRYSTAL_SYSTEMS)[number];

/** Which lattice angles stay free (user-editable) per system; the rest lock. */
export interface SystemAngleLocks {
  alpha: boolean; // true = locked to fixed value
  beta: boolean;
  gamma: boolean;
  /** The fixed value (degrees) for a locked angle. */
  alphaFixed: number;
  betaFixed: number;
  gammaFixed: number;
}

/** Angle constraints per crystal system (standard crystallography). */
export const SYSTEM_ANGLE_LOCKS: Record<CrystalSystem, SystemAngleLocks> = {
  Cubic: { alpha: true, beta: true, gamma: true, alphaFixed: 90, betaFixed: 90, gammaFixed: 90 },
  Tetragonal: { alpha: true, beta: true, gamma: true, alphaFixed: 90, betaFixed: 90, gammaFixed: 90 },
  Orthohombic: { alpha: true, beta: true, gamma: true, alphaFixed: 90, betaFixed: 90, gammaFixed: 90 },
  Hexagonal: { alpha: true, beta: true, gamma: true, alphaFixed: 90, betaFixed: 90, gammaFixed: 120 },
  Trigonal: { alpha: true, beta: true, gamma: true, alphaFixed: 90, betaFixed: 90, gammaFixed: 120 },
  Monoclinic: { alpha: true, beta: false, gamma: true, alphaFixed: 90, betaFixed: 90, gammaFixed: 90 },
  Triclinic: { alpha: false, beta: false, gamma: false, alphaFixed: 90, betaFixed: 90, gammaFixed: 90 },
};

/**
 * All 254 WholeSG keys, filtered to one crystal system, sorted by group
 * number then origin-choice suffix — the options for the linked SpaceGroup
 * dropdown. (Space-group number ranges per system, see file-header note.)
 */
export function spaceGroupsForSystem(system: CrystalSystem): string[] {
  const RANGES: Record<CrystalSystem, [number, number]> = {
    Cubic: [195, 230],
    Tetragonal: [75, 143],
    Orthohombic: [16, 74],
    Hexagonal: [168, 194],
    Trigonal: [144, 167],
    Monoclinic: [2, 15],
    Triclinic: [1, 1],
  };
  const [lo, hi] = RANGES[system];
  return spaceGroupKeys().filter((key) => {
    const num = Number(key.split('(')[0]);
    return num >= lo && num <= hi;
  });
}
