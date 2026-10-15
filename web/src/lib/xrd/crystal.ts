/**
 * .cord parser / serializer (plan §3.2).
 *
 * File format (reverse-engineered from CalcXRD.exe, see CLAUDE.md):
 * ```
 * <CrystalName>
 * <System>                      # Cubic, Tetragonal, Orthohombic, Hexagonal, ...
 * <N>(SGSymbol)                 # e.g. "225(Fm-3m)"
 * <ax> <bx> <cx>                # Å, space-separated on one line
 * <angle1> <angle2> <angle3>    # degrees, space-separated on one line
 * <AtomCount>
 * <element symbol>              # e.g. Na1+, Al, Ba2+  (ion valence kept verbatim)
 * <wyckoff symbol>              # single letter
 * <x>                           # one fractional coordinate per line
 * <y>
 * <z>
 * <occupancy>                   # usually 1
 * <B>                           # per-atom thermal factor B in Å², usually 1
 * ```
 * The element block repeats AtomCount times. Numbers may use Fortran-style
 * scientific notation (`4.03390000000000E+0000`) as written by the legacy
 * program, or plain decimals (`0.5`).
 *
 * All parse failures throw {@link CordParseError} carrying the 1-based line
 * number of the offending (or missing) line.
 */

import type { Atom, Crystal } from './types';

/** Error thrown for malformed .cord input; `line` is the 1-based line number. */
export class CordParseError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`.cord 解析错误（第 ${line} 行）: ${message}`);
    this.name = 'CordParseError';
    this.line = line;
  }
}

/** Fortran-style or plain decimal number, e.g. `4.03390000000000E+0000`, `0.5`, `-1`. */
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([Ee][+-]?\d+)?$/;
/** Space-group header line, e.g. `225(Fm-3m)`. */
const SG_LINE_RE = /^(\d+)\(([^)]+)\)$/;
/** Wyckoff letter: a single ASCII letter. */
const WYCKOFF_RE = /^[A-Za-z]$/;

/**
 * Parses a .cord file into a {@link Crystal}.
 *
 * @throws {CordParseError} on missing lines, non-numeric fields, an atom count
 *   below 1, or a malformed space-group header.
 */
export function parseCord(text: string): Crystal {
  const lines = text.split(/\r\n|\r|\n/);
  // A trailing newline must not produce a phantom line; other blank lines stay
  // in place and fail validation where they appear.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  let cursor = 0; // 0-based index of the next unread line.

  /** Reads the next raw line; throws with the 1-based line number if absent. */
  const nextLine = (field: string): string => {
    if (cursor >= lines.length) {
      throw new CordParseError(`文件在此处意外结束，缺少字段「${field}」`, cursor + 1);
    }
    const line = lines[cursor];
    cursor += 1;
    return line;
  };

  /** Reads a line and validates it as a single number. */
  const nextNumber = (field: string): number => {
    const raw = nextLine(field).trim();
    if (!NUMBER_RE.test(raw)) {
      throw new CordParseError(`字段「${field}」应为数值，实际为「${raw}」`, cursor);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new CordParseError(`字段「${field}」数值超出范围：「${raw}」`, cursor);
    }
    return value;
  };

  /** Reads a line holding `count` space-separated numbers. */
  const nextNumberRow = (field: string, count: number): number[] => {
    const raw = nextLine(field).trim();
    const parts = raw.split(/\s+/).filter((p) => p !== '');
    if (parts.length !== count) {
      throw new CordParseError(
        `字段「${field}」应包含 ${count} 个数值，实际为「${raw}」`,
        cursor,
      );
    }
    return parts.map((part, i) => {
      if (!NUMBER_RE.test(part)) {
        throw new CordParseError(`字段「${field}」第 ${i + 1} 项应为数值，实际为「${part}」`, cursor);
      }
      const value = Number(part);
      if (!Number.isFinite(value)) {
        throw new CordParseError(`字段「${field}」第 ${i + 1} 项数值超出范围：「${part}」`, cursor);
      }
      return value;
    });
  };

  const name = nextLine('CrystalName').trim();
  if (name === '') {
    throw new CordParseError('字段「CrystalName」不能为空', cursor);
  }

  const system = nextLine('System').trim();
  if (system === '') {
    throw new CordParseError('字段「System」不能为空', cursor);
  }

  const sgRaw = nextLine('N(SGSymbol)').trim();
  const sgMatch = SG_LINE_RE.exec(sgRaw);
  if (!sgMatch) {
    throw new CordParseError(
      `空间群行应为「N(SGSymbol)」形式（如 225(Fm-3m)），实际为「${sgRaw}」`,
      cursor,
    );
  }
  const sgNumber = Number(sgMatch[1]);
  const sgSymbol = sgMatch[2];
  const sgKey = `${sgNumber}(${sgSymbol})`;

  const [a, b, c] = nextNumberRow('ax bx cx', 3);
  const [alpha, beta, gamma] = nextNumberRow('angle1 angle2 angle3', 3);

  const atomCountRaw = nextLine('AtomCount').trim();
  if (!/^\d+$/.test(atomCountRaw)) {
    throw new CordParseError(`字段「AtomCount」应为非负整数，实际为「${atomCountRaw}」`, cursor);
  }
  const atomCount = Number(atomCountRaw);
  if (atomCount < 1) {
    throw new CordParseError(`原子数 AtomCount 必须 ≥ 1，实际为 ${atomCount}`, cursor);
  }

  const atoms: Atom[] = [];
  for (let i = 0; i < atomCount; i += 1) {
    const element = nextLine(`第 ${i + 1} 个原子的 element symbol`).trim();
    if (element === '') {
      throw new CordParseError(`第 ${i + 1} 个原子的元素符号不能为空`, cursor);
    }

    const wyckoff = nextLine(`第 ${i + 1} 个原子的 wyckoff symbol`).trim();
    if (!WYCKOFF_RE.test(wyckoff)) {
      throw new CordParseError(
        `第 ${i + 1} 个原子的 Wyckoff 位应为单个字母，实际为「${wyckoff}」`,
        cursor,
      );
    }

    const x = nextNumber(`第 ${i + 1} 个原子的 x`);
    const y = nextNumber(`第 ${i + 1} 个原子的 y`);
    const z = nextNumber(`第 ${i + 1} 个原子的 z`);
    const occupancy = nextNumber(`第 ${i + 1} 个原子的 occupancy`);
    if (occupancy < 0 || occupancy > 1) {
      throw new CordParseError(
        `第 ${i + 1} 个原子的 occupancy 应在 [0,1] 区间，实际为 ${occupancy}`,
        cursor,
      );
    }
    // 7th atom field = per-atom thermal factor B (Å²), GUI-verified: the
    // legacy program's atom table shows it as a "B" column, default 1.
    const thermalB = nextNumber(`第 ${i + 1} 个原子的热因子 B`);
    if (thermalB < 0) {
      throw new CordParseError(
        `第 ${i + 1} 个原子的热因子 B 不能为负，实际为 ${thermalB}`,
        cursor,
      );
    }

    atoms.push({ element, wyckoff, x, y, z, occupancy, thermalB });
  }

  return {
    name,
    system,
    sgNumber,
    sgSymbol,
    sgKey,
    a,
    b,
    c,
    alpha,
    beta,
    gamma,
    atoms,
  };
}

/**
 * Formats a number the way the legacy program writes it: a 23-character
 * Fortran-style field ` 4.03390000000000E+0000` (sign column, 14 decimals,
 * 4-digit exponent). Rows join fields directly — each field carries its own
 * sign column, so three numbers read ` a b c` with single separators, exactly
 * like the shipped sample files. CRLF line endings match those files too.
 */
export function formatCordNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`无法序列化非有限数值: ${value}`);
  }
  if (value === 0) {
    return ' 0.00000000000000E+0000';
  }
  const sign = value < 0 ? '-' : ' ';
  let exponent = Math.floor(Math.log10(Math.abs(value)));
  let mantissa = Math.abs(value) / 10 ** exponent;
  // Guard against mantissa rounding up to 10.00000000000000.
  if (Number(mantissa.toFixed(14)) >= 10) {
    mantissa /= 10;
    exponent += 1;
  }
  const expSign = exponent < 0 ? '-' : '+';
  const expDigits = String(Math.abs(exponent)).padStart(4, '0');
  return `${sign}${mantissa.toFixed(14)}E${expSign}${expDigits}`;
}

/**
 * Serializes a {@link Crystal} back to .cord text (legacy program layout).
 * `parseCord(serializeCord(c))` is semantically equivalent to `c`.
 */
export function serializeCord(crystal: Crystal): string {
  const lines: string[] = [
    crystal.name,
    crystal.system,
    crystal.sgKey,
    [crystal.a, crystal.b, crystal.c].map(formatCordNumber).join(''),
    [crystal.alpha, crystal.beta, crystal.gamma].map(formatCordNumber).join(''),
    String(crystal.atoms.length),
  ];
  for (const atom of crystal.atoms) {
    lines.push(
      atom.element,
      atom.wyckoff,
      formatCordNumber(atom.x),
      formatCordNumber(atom.y),
      formatCordNumber(atom.z),
      formatCordNumber(atom.occupancy),
      formatCordNumber(atom.thermalB),
    );
  }
  // The legacy files end with a trailing CRLF after the last record.
  return lines.join('\r\n') + '\r\n';
}
