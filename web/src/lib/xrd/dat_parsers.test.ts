import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { FACTOR_COEFFS } from './factor_data';
import { parseFactorDat, validateFactorElectronCount } from './factor_dat_parser';
import { FF_TABLE, FF_SYMBOLS } from './ff_data';
import { ffDatToDispersion, parseFFDat, FF_RAD_COLUMNS } from './ff_dat_parser';

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../tests/fixtures',
);

const factorBytes = readFileSync(path.join(FIXTURES, 'Factor.dat'));
const ffBytes = readFileSync(path.join(FIXTURES, 'FF.dat'));

describe('parseFactorDat — Factor.dat 二进制布局', () => {
  it('199 条记录、11 系数（5a+5b 交错 + c），与 factor_data.ts 逐值一致', () => {
    const parsed = parseFactorDat(factorBytes);
    expect(Object.keys(parsed)).toHaveLength(199);
    // Spot-check Al (record 12 in the shipped order): exact match with the
    // generated factor_data.ts table.
    const al = parsed['Al'];
    const alGen = FACTOR_COEFFS['Al'];
    expect(al.a).toEqual(alGen.a);
    expect(al.b).toEqual(alGen.b);
    expect(al.c).toBe(alGen.c);
    // H (record 0) sanity check: Σa+c ≈ 1 electron.
    const h = parsed['H'];
    const hSum = h.a.reduce((acc, v) => acc + v, 0) + h.c;
    expect(hSum).toBeCloseTo(1, 3);
    // Valence variant keys preserved as-is.
    expect(parsed['Cval']).toBeDefined();
    expect(parsed['Siva']).toBeDefined();
  });

  it('字节数不符时报错', () => {
    expect(() => parseFactorDat(new Uint8Array(100))).toThrow();
  });

  it('validateFactorElectronCount：Al 误差 < 0.05', () => {
    const parsed = parseFactorDat(factorBytes);
    const electronCount: Record<string, number> = {
      Al: 13,
      'Na1+': 10,
      'Cl1-': 18,
      'O2-': 10,
      Fe: 26,
    };
    const offenders = validateFactorElectronCount(parsed, electronCount);
    expect(offenders).toHaveLength(0);
  });
});

describe('parseFFDat / ffDatToDispersion — FF.dat 二进制布局', () => {
  it('92 条记录（Z=1..92），符号与 ff_data.ts FF_SYMBOLS 逐一对应（Z=91 保留 "Po" 误标）', () => {
    const parsed = parseFFDat(ffBytes);
    expect(parsed).toHaveLength(92);
    // Record 0 = H (all zeros in the shipped table).
    expect(parsed[0].symbol).toBe('H');
    expect(parsed[0].values).toEqual(FF_TABLE[0]);
    // Record 12 = Al (index 12, Z=13): exact match with the generated table.
    expect(parsed[12].symbol).toBe('Al');
    expect(parsed[12].values).toEqual(FF_TABLE[12]);
    // Z=91 record (index 90) carries the legacy mislabel "Po" — parser
    // preserves it faithfully (fidelity-first, CLAUDE.md rule 4); the
    // corrected name lives in FF_SYMBOLS.
    expect(parsed[90].symbol).toBe('Po');
    expect(FF_SYMBOLS[90]).toBe('Pa');
    expect(parsed[90].values).toEqual(FF_TABLE[90]);
  });

  it('ffDatToDispersion：CuKα1 列取值与 FF_TABLE 一致，Z=91 按 Z 索引不按符号', () => {
    const table = ffDatToDispersion(ffBytes, 1.54056);
    // Al = Z=13 → index 12.
    expect(table[12].fPrime).toBe(FF_TABLE[12][0]); // CuKa1 f′
    expect(table[12].fDoublePrime).toBe(FF_TABLE[12][1]); // CuKa1 f″
    expect(table[12].supported).toBe(true);
    // Cr Kα (2.2897 Å) is outside all 6 columns' 0.05 Å tolerance → unsupported.
    const crTable = ffDatToDispersion(ffBytes, 2.2897);
    expect(crTable[12].supported).toBe(false);
    expect(crTable[12].fPrime).toBe(0);
    // Column order sanity: 6 interleaved pairs.
    expect(FF_RAD_COLUMNS).toHaveLength(6);
  });

  it('字节数不符时报错', () => {
    expect(() => parseFFDat(new Uint8Array(100))).toThrow();
  });
});
