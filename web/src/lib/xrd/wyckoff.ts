/**
 * Wyckoff position queries (plan §3.2 / T05).
 *
 * Pure functions over the generated {@link WYCKOFF_DATA} table:
 * `getSite` / `expandPositions` / `multiplicityOf` / `laueOperations`.
 *
 * Coordinate expressions of the source data (`(x,y,z)`, `(-y,x-y,z+1/3)`,
 * `(1/2,1/2,1/2)`, `(x+1/2,y,z)`, ...) are parsed into a 3×3 rotation matrix
 * plus a translation, so positions expand as `R·(x,y,z) + t (+ centering)`.
 */

import type { SpaceGroupData, Vec3, WyckoffSite } from './types';
import { WYCKOFF_DATA } from './wyckoff_data';

/** Dedup tolerance for expanded positions (plan §3.2). */
const POSITION_TOLERANCE = 1e-6;
/** Dedup tolerance for rotation matrices. */
const MATRIX_TOLERANCE = 1e-9;

/** A coordinate expression parsed into rotation + translation. */
interface ParsedOperation {
  /** Row-major 3×3 rotation matrix (rows = output components). */
  rot: number[][];
  /** Constant translation. */
  trans: Vec3;
}

/** Matches one signed term of a coordinate component: `-x`, `+1/2`, `2y`, `z`. */
const TERM_RE = /^([+-]?)(\d+(?:\.\d+)?(?:\/\d+)?)?\*?([xyz])?$/;

/** Parses `1/2`, `3/4`, `0.5`, `2` into a number. */
function parseFraction(text: string): number {
  if (text.includes('/')) {
    const slash = text.indexOf('/');
    const numerator = Number(text.slice(0, slash));
    const denominator = Number(text.slice(slash + 1));
    if (denominator === 0) {
      throw new Error(`坐标表达式分母为 0：「${text}」`);
    }
    return numerator / denominator;
  }
  return Number(text);
}

/** Parses one component (e.g. `x-y`, `-z+1/2`, `1/2`) into a matrix row + constant. */
function parseComponent(component: string): { row: [number, number, number]; constant: number } {
  const terms = component.match(/[+-]?[^+-]+/g);
  if (!terms || terms.length === 0) {
    throw new Error(`坐标表达式分量为空：「${component}」`);
  }
  const row: [number, number, number] = [0, 0, 0];
  let constant = 0;
  for (const term of terms) {
    const match = TERM_RE.exec(term);
    if (!match) {
      throw new Error(`无法解析坐标项「${term}」（分量「${component}」）`);
    }
    const sign = match[1] === '-' ? -1 : 1;
    const magnitude = match[2] !== undefined ? parseFraction(match[2]) : 1;
    const variable = match[3];
    if (variable !== undefined) {
      const column = variable === 'x' ? 0 : variable === 'y' ? 1 : 2;
      row[column] += sign * magnitude;
    } else {
      if (match[2] === undefined) {
        throw new Error(`无法解析常数项「${term}」（分量「${component}」）`);
      }
      constant += sign * magnitude;
    }
  }
  return { row, constant };
}

/**
 * Parses a coordinate expression such as `(-y,x-y,z+1/3)` or a centering
 * translation such as `(0,1/2,1/2)+` into rotation + translation.
 *
 * @throws Error when the expression is not of the form `(c,c,c)`.
 */
export function parseCoordinateExpression(expression: string): ParsedOperation {
  const trimmed = expression.trim();
  const match = /^\((.*)\)\+?$/.exec(trimmed);
  if (!match) {
    throw new Error(`坐标表达式应为「(c,c,c)」形式：「${expression}」`);
  }
  const parts = match[1].split(',');
  if (parts.length !== 3) {
    throw new Error(`坐标表达式应包含 3 个分量：「${expression}」`);
  }
  const rot: number[][] = [];
  const trans: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const { row, constant } = parseComponent(parts[i].trim());
    rot.push(row);
    trans[i] = constant;
  }
  return { rot, trans };
}

/**
 * Resolves a space-group key, falling back to the WholeSG-suffixed variants.
 * A plain `.cord` key like `201(Pn-3)` (no origin choice) resolves to the
 * first matching variant — `[origin choice 1]` by sorted order (plan §8-10).
 */
function resolveGroup(sgKey: string): SpaceGroupData | undefined {
  const direct = WYCKOFF_DATA[sgKey];
  if (direct) {
    return direct;
  }
  const prefix = `${sgKey}[`;
  const candidates = Object.keys(WYCKOFF_DATA)
    .filter((key) => key.startsWith(prefix))
    .sort();
  return candidates.length > 0 ? WYCKOFF_DATA[candidates[0]] : undefined;
}

/** Wraps a fractional coordinate into [0, 1). */
function wrapUnit(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** Circular distance on the unit interval (0 and 1 are the same point). */
function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 1;
  return Math.min(diff, 1 - diff);
}

/** Deduplicates positions with tolerance {@link POSITION_TOLERANCE}, sorted. */
function dedupePositions(positions: Vec3[]): Vec3[] {
  const unique: Vec3[] = [];
  for (const candidate of positions) {
    const isDuplicate = unique.some(
      (existing) =>
        circularDistance(existing[0], candidate[0]) < POSITION_TOLERANCE &&
        circularDistance(existing[1], candidate[1]) < POSITION_TOLERANCE &&
        circularDistance(existing[2], candidate[2]) < POSITION_TOLERANCE,
    );
    if (!isDuplicate) {
      unique.push(candidate);
    }
  }
  return unique.sort((left, right) =>
    left[0] - right[0] || left[1] - right[1] || left[2] - right[2],
  );
}

/** True when two flat 3×3 matrices agree within {@link MATRIX_TOLERANCE}. */
function matricesEqual(left: number[], right: number[]): boolean {
  for (let i = 0; i < 9; i += 1) {
    if (Math.abs(left[i] - right[i]) > MATRIX_TOLERANCE) {
      return false;
    }
  }
  return true;
}

/**
 * Looks up a Wyckoff site.
 *
 * @returns the site, or `undefined` when the group or letter is unknown.
 */
export function getSite(sgKey: string, letter: string): WyckoffSite | undefined {
  const group = resolveGroup(sgKey);
  if (!group) {
    return undefined;
  }
  return group.sites.find((site) => site.letter === letter);
}

/**
 * Expands a Wyckoff site into all equivalent fractional positions:
 * `ops × centers`, substituting `(x, y, z)` and wrapping into [0,1).
 *
 * @returns deduplicated positions (tolerance 1e-6), sorted for determinism.
 * @throws Error when the group or the letter is unknown.
 */
export function expandPositions(
  sgKey: string,
  letter: string,
  x: number,
  y: number,
  z: number,
): Vec3[] {
  const group = resolveGroup(sgKey);
  if (!group) {
    throw new Error(`未知空间群「${sgKey}」：Wyckoff 数据表（254 群）中无此键`);
  }
  const site = group.sites.find((candidate) => candidate.letter === letter);
  if (!site) {
    throw new Error(`空间群「${sgKey}」无 Wyckoff 位「${letter}」`);
  }

  // Primitive groups have no centering lines; the identity translation stands
  // in for the missing center so ops × centers stays well-defined.
  const centerTranslations: Vec3[] =
    group.centers.length > 0
      ? group.centers.map((center) => parseCoordinateExpression(center).trans)
      : [[0, 0, 0]];

  const positions: Vec3[] = [];
  for (const op of site.ops) {
    const { rot, trans } = parseCoordinateExpression(op);
    for (const center of centerTranslations) {
      positions.push([
        wrapUnit(rot[0][0] * x + rot[0][1] * y + rot[0][2] * z + trans[0] + center[0]),
        wrapUnit(rot[1][0] * x + rot[1][1] * y + rot[1][2] * z + trans[1] + center[1]),
        wrapUnit(rot[2][0] * x + rot[2][1] * y + rot[2][2] * z + trans[2] + center[2]),
      ]);
    }
  }
  return dedupePositions(positions);
}

/**
 * Convenience export for UI dropdowns: every space-group key of the table
 * (`N(Symbol)`, e.g. `225(Fm-3m)`), sorted for stable rendering.
 */
export function spaceGroupKeys(): string[] {
  return Object.keys(WYCKOFF_DATA).sort();
}

/**
 * Convenience export for UI dropdowns: the Wyckoff sites of `sgKey` in table
 * order (letter, declared multiplicity, site symmetry, coordinate operations).
 *
 * @returns the sites, or an empty array when the group is unknown (the UI
 *   renders an empty Wyckoff picker instead of throwing).
 */
export function listSites(sgKey: string): WyckoffSite[] {
  const group = resolveGroup(sgKey);
  return group ? [...group.sites] : [];
}

/**
 * Multiplicity of a Wyckoff site (the value declared in the source table).
 *
 * @throws Error when the group or the letter is unknown.
 */
export function multiplicityOf(sgKey: string, letter: string): number {
  const site = getSite(sgKey, letter);
  if (!site) {
    throw new Error(`空间群「${sgKey}」无 Wyckoff 位「${letter}」`);
  }
  return site.mult;
}

/**
 * Rotation matrices of the space group, extracted from the general-position
 * coordinate operations and deduplicated. Each matrix is a flat row-major
 * 9-element array (`[m00, m01, m02, m10, m11, m12, m20, m21, m22]`).
 *
 * For centrosymmetric groups (all phase-1 samples) this is exactly the Laue
 * group (m-3m → 48 operations). For non-centrosymmetric groups the point
 * group is returned; Friedel pairs are accounted for by the intensity layer
 * when computing reflection multiplicities.
 *
 * @throws Error when the group is unknown.
 */
export function laueOperations(sgKey: string): number[][] {
  const group = resolveGroup(sgKey);
  if (!group) {
    throw new Error(`未知空间群「${sgKey}」：Wyckoff 数据表（254 群）中无此键`);
  }
  const general = group.sites.reduce((widest, site) => (site.mult > widest.mult ? site : widest));
  const matrices: number[][] = [];
  for (const op of general.ops) {
    const { rot } = parseCoordinateExpression(op);
    const flat = rot.flat();
    if (!matrices.some((existing) => matricesEqual(existing, flat))) {
      matrices.push(flat);
    }
  }
  return matrices;
}
