import { describe, expect, it } from 'vitest';

import { parseCord } from './crystal';
import { SAMPLE_CRYSTALS } from '@/data/samples';
import { createDefaultParams } from './constants';
import { computeXRDPattern } from './pipeline';
import {
  groupReflectionsByAngle,
  reportHklCell,
  reportHklFull,
} from './powder_report';
import type { XrdParams } from './types';

const sampleText = (id: string): string => {
  const sample = SAMPLE_CRYSTALS.find((s) => s.id === id);
  if (!sample) {
    throw new Error(`sample ${id} not found`);
  }
  return sample.text;
};

const alParams: XrdParams = { ...createDefaultParams() }; // Cu Kα, q=0.10 (σ), 3–100°/0.01°

/** Baseline rows as printed by the legacy RTF reports (2dp, 4dp, int, ‰, hkl count). */
const AL_RTF: Array<[number, number, number, number, number]> = [
  [38.63, 2.3288, 152557, 1000, 8],
  [44.9, 2.0171, 71693, 470, 6],
  [65.38, 1.4262, 40648, 266, 12],
  [78.59, 1.2163, 43172, 283, 24],
  [82.82, 1.1645, 12165, 80, 8],
  [99.6, 1.0085, 5681, 37, 6],
];

const NACL_RTF: Array<[number, number, number, number, number]> = [
  [27.47, 3.2442, 93860, 91, 8],
  [31.82, 2.8099, 1031112, 1000, 6],
  [45.62, 1.9869, 635246, 616, 12],
  [54.08, 1.6944, 19817, 19, 24],
  [56.69, 1.6224, 193179, 187, 8],
  [66.49, 1.4051, 80102, 78, 6],
  [73.37, 1.2894, 9073, 9, 24],
  [75.61, 1.2566, 201960, 196, 24],
  [84.36, 1.1472, 141762, 137, 24],
  // {333} (mult 8) and {511} (mult 24) share N = 27 → one legacy row, I summed.
  [90.83, 1.0815, 9325, 9, 32],
];

describe('powder_report — 按 d 分组的报表行（NaCl.RTF 定案）', () => {
  it('Al：六峰无同角度族，分组后仍为 6 行且逐值命中 Al.RTF', () => {
    const pattern = computeXRDPattern(parseCord(sampleText('al')), alParams);
    const rows = groupReflectionsByAngle(pattern.reflections).sort((a, b) => a.twoTheta - b.twoTheta);
    expect(rows).toHaveLength(AL_RTF.length);
    rows.forEach((row, i) => {
      const [twoTheta, d, intensity, io, mult] = AL_RTF[i];
      expect(row.twoTheta.toFixed(2)).toBe(twoTheta.toFixed(2));
      expect(row.d.toFixed(4)).toBe(d.toFixed(4));
      expect(Math.round(row.intensity)).toBe(intensity);
      expect(Math.round(row.intensityIo)).toBe(io);
      expect(row.multiplicity).toBe(mult);
      // Al has no degenerate angles: one family per row, one member per mult.
      expect(row.families).toHaveLength(1);
      expect(row.families[0].multiplicity).toBe(mult);
    });
  });

  it('NaCl：十行命中 NaCl.RTF，末行 (333)+(511) 合并为 I=9325、mult=32', () => {
    const pattern = computeXRDPattern(parseCord(sampleText('nacl')), alParams);
    const rows = groupReflectionsByAngle(pattern.reflections).sort((a, b) => a.twoTheta - b.twoTheta);
    expect(rows).toHaveLength(NACL_RTF.length);
    rows.forEach((row, i) => {
      const [twoTheta, d, intensity, io, mult] = NACL_RTF[i];
      expect(row.twoTheta.toFixed(2)).toBe(twoTheta.toFixed(2));
      expect(row.d.toFixed(4)).toBe(d.toFixed(4));
      expect(Math.round(row.intensity)).toBe(intensity);
      expect(Math.round(row.intensityIo)).toBe(io);
      expect(row.multiplicity).toBe(mult);
      // One representative per family in the row's hkl list.
      expect(row.hklList).toHaveLength(row.families.length);
    });
  });

  it('NaCl 末行：两族各自保持原始强度，行强度为两族之和', () => {
    const pattern = computeXRDPattern(parseCord(sampleText('nacl')), alParams);
    const rows = groupReflectionsByAngle(pattern.reflections);
    const last = rows.find((r) => r.twoTheta.toFixed(2) === '90.83');
    expect(last).toBeDefined();
    expect(last?.families).toHaveLength(2);
    const [three, five] = last?.families ?? [];
    expect(three.multiplicity).toBe(8);
    expect(five.multiplicity).toBe(24);
    expect(Math.round(three.intensity)).toBe(2331);
    expect(Math.round(five.intensity)).toBe(6994);
    expect(Math.round(three.intensity + five.intensity)).toBe(9325);
    // Representative cell text lists one hkl per family.
    expect(reportHklCell(last!)).toBe('(3 3 3) (5 1 1)');
    // The tooltip carries both families' representatives.
    expect(reportHklFull(last!)).toBe('(3 3 3) (5 1 1)');
  });

  it('hkl 成员集合与 legacy RTF 列表一致（顺序无关）', () => {
    // NaCl.RTF line 1 lists the {111} family as 8 members; the engine keeps
    // one reflection per family, so the row carries its representative and
    // multiplicity 8.
    const pattern = computeXRDPattern(parseCord(sampleText('nacl')), alParams);
    const rows = groupReflectionsByAngle(pattern.reflections);
    const first = rows.find((r) => r.twoTheta.toFixed(2) === '27.47');
    expect(first?.hklList).toEqual(['(1 1 1)']);
    expect(first?.multiplicity).toBe(8);
    // The degenerate 90.83° row merges both families into one set.
    const last = rows.find((r) => r.twoTheta.toFixed(2) === '90.83');
    expect(last?.hklList.sort()).toEqual(['(3 3 3)', '(5 1 1)']);
  });

  it('BaTiO3（Pm-3m primitive）同样存在同 d 多族，分组后行数少于反射数', () => {
    // Primitive cubic: N = 9 splits into {300} (6) + {221} (24) — the same
    // degeneracy class that NaCl exposes at N = 27.
    const pattern = computeXRDPattern(parseCord(sampleText('batio3')), alParams);
    const rows = groupReflectionsByAngle(pattern.reflections);
    expect(rows.length).toBeLessThan(pattern.reflections.length);
    const degenerate = rows.filter((r) => r.families.length > 1);
    expect(degenerate.length).toBeGreaterThan(0);
    for (const row of degenerate) {
      expect(row.hklList).toHaveLength(row.families.length);
      expect(row.multiplicity).toBe(
        row.families.reduce((sum, family) => sum + family.multiplicity, 0),
      );
    }
  });

  it('空输入返回空表，且不会除零', () => {
    expect(groupReflectionsByAngle([])).toEqual([]);
  });
});
