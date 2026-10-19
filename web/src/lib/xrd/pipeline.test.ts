import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { parseCord } from './crystal';
import { SAMPLE_CRYSTALS } from '@/data/samples';
import { createDefaultParams } from './constants';
import { computeXRDPattern } from './pipeline';
import { dSpacing } from './structure_factor';
import { parseXrd, serializeXrd } from './xrd_file';
import type { Crystal, XrdParams, XRDPattern } from './types';

const sampleText = (id: string): string => {
  const sample = SAMPLE_CRYSTALS.find((s) => s.id === id);
  if (!sample) {
    throw new Error(`sample ${id} not found`);
  }
  return sample.text;
};

const al: Crystal = parseCord(sampleText('al'));

/** Plan §9 reference table, read from the authoritative fixture Al.xrd. */
const REFERENCE: Array<{
  hkl: [number, number, number];
  twoTheta: number;
  intensityNorm: number;
}> = [
  { hkl: [1, 1, 1], twoTheta: 38.6272, intensityNorm: 100.0 },
  { hkl: [2, 0, 0], twoTheta: 44.9033, intensityNorm: 46.99 },
  { hkl: [2, 2, 0], twoTheta: 65.3799, intensityNorm: 26.64 },
  { hkl: [3, 1, 1], twoTheta: 78.5903, intensityNorm: 28.3 },
  { hkl: [2, 2, 2], twoTheta: 82.8251, intensityNorm: 7.97 },
  { hkl: [4, 0, 0], twoTheta: 99.6019, intensityNorm: 3.72 },
];

const alParams: XrdParams = { ...createDefaultParams() }; // Cu Kα, q=0.10 (σ), 3–100°/0.01°
const alPattern: XRDPattern = computeXRDPattern(al, alParams);

/** Grid maximum within ±window degrees of `twoTheta`. */
function gridPeak(
  pattern: XRDPattern,
  twoTheta: number,
  window = 0.5,
): { twoTheta: number; intensity: number } {
  let best = { twoTheta: Number.NaN, intensity: -1 };
  for (let i = 0; i < pattern.twoTheta.length; i += 1) {
    const angle = pattern.twoTheta[i];
    if (Math.abs(angle - twoTheta) <= window && pattern.intensity[i] > best.intensity) {
      best = { twoTheta: angle, intensity: pattern.intensity[i] };
    }
  }
  return best;
}

/** All local maxima of the broadened pattern (interior points only). */
function localMaxima(pattern: XRDPattern): Array<{ twoTheta: number; intensity: number }> {
  const peaks: Array<{ twoTheta: number; intensity: number }> = [];
  for (let i = 1; i < pattern.intensity.length - 1; i += 1) {
    if (
      pattern.intensity[i] >= pattern.intensity[i - 1] &&
      pattern.intensity[i] >= pattern.intensity[i + 1] &&
      pattern.intensity[i] > 0
    ) {
      peaks.push({ twoTheta: pattern.twoTheta[i], intensity: pattern.intensity[i] });
    }
  }
  return peaks;
}

describe('pipeline — Al.xrd 全谱验收（T07，λ=1.54056、q=0.10 σ、3–100°/0.01°）', () => {
  it('网格：9701 点，3.00°–100.00°，步长 0.01°（与参考文件行数一致）', () => {
    expect(alPattern.twoTheta).toHaveLength(9701);
    expect(alPattern.twoTheta[0]).toBeCloseTo(3, 12);
    expect(alPattern.twoTheta[alPattern.twoTheta.length - 1]).toBeCloseTo(100, 12);
    expect(alPattern.meta).toEqual({
      lambda: 1.54056,
      q: 0.1,
      step: 0.01,
      min: 3,
      max: 100,
    });
  });

  it('验收 1：六峰 2θ 误差 < 0.01°（实测 ≈ 网格量化 0.005°）', () => {
    for (const reference of REFERENCE) {
      const peak = gridPeak(alPattern, reference.twoTheta);
      const error = Math.abs(peak.twoTheta - reference.twoTheta);
      expect(error, `hkl ${reference.hkl.join('')} 峰位偏差 ${error}°`).toBeLessThan(0.01);
    }
  });

  it('验收 2：六峰归一化强度与参考表偏差 < 10%（计划 §7 目标，逐原子 B=1 口径下达达成）', () => {
    const globalMax = Math.max(...alPattern.intensity);
    const deviations: string[] = [];
    for (const reference of REFERENCE) {
      const peak = gridPeak(alPattern, reference.twoTheta);
      const normalized = (peak.intensity / globalMax) * 100;
      const deviation = Math.abs(normalized - reference.intensityNorm) / reference.intensityNorm;
      deviations.push(
        `${reference.hkl.join('')}: ${normalized.toFixed(2)} vs ${reference.intensityNorm} (${(deviation * 100).toFixed(1)}%)`,
      );
      expect(
        deviation,
        `hkl ${reference.hkl.join('')} 归一化强度偏差 ${(deviation * 100).toFixed(1)}%`,
      ).toBeLessThan(0.1);
    }
    // 实测偏差（标准 Lp + Factor.dat f₀ + F′F″ 色散修正默认开启 + 逐原子 B=1、
    // q=0.10 σ）：六峰 0.00~2.51%（最强 (111) 恒 0，最弱 (400) 2.51%）。
    // 法证结论（详见 lorentz.ts docstring）：legacy help 的 Lp 原文实为
    // (1+cos²2θ)/(sin2θ·sinθ)，sin2θ 是双角，等价于标准式/2——归一化后与
    // 标准式一致。B 为 .cord 逐原子字段（GUI 实测默认 1），关 Thermal 时
    // 六峰高角系统性偏高 +2.9~+45.4%（热阻尼缺失特征，见下方 σ 峰形测试
    // 旁的 Thermal 开关测试）。
    expect(deviations).toHaveLength(6);
  });

  it('fidelity：峰形为高斯 σ=q=0.10（FWHM ≈ 2.355q ≈ 0.2355°，与 GUI 逐点吻合）', () => {
    // GUI 实测：Al (111) 峰顶 38.63° 处 152557，±0.01° 处 151883/151709
    // ≈ 峰值·exp(−0.005)，正是 σ=0.10 的高斯（FWHM = 2.355σ ≈ 0.2355°）。
    // 本测试在剖面 (111) 峰上用线性插值测半高宽，锁定该 σ 口径。
    const peak = gridPeak(alPattern, 38.6272);
    const index = alPattern.twoTheta.indexOf(peak.twoTheta);
    const half = peak.intensity / 2;
    const cross = (from: number, direction: -1 | 1): number => {
      let i = from;
      while (i + direction >= 0 && i + direction < alPattern.intensity.length) {
        const current = alPattern.intensity[i];
        const next = alPattern.intensity[i + direction];
        if (current >= half && next < half) {
          // Linear interpolation of the half-height crossing.
          const t = (current - half) / (current - next);
          return alPattern.twoTheta[i] + direction * t * alParams.step;
        }
        i += direction;
      }
      return Number.NaN;
    };
    const left = cross(index, -1);
    const right = cross(index, 1);
    const fwhm = right - left;
    expect(Number.isFinite(fwhm)).toBe(true);
    expect(fwhm).toBeCloseTo(2.3548 * alParams.q, 1); // 0.2355°，容差 0.05°
  });

  it('自洽性：展宽峰高与离散反射表归一化强度一致（<1%）', () => {
    const globalMax = Math.max(...alPattern.intensity);
    for (const reflection of alPattern.reflections) {
      const peak = gridPeak(alPattern, reflection.twoTheta);
      const normalized = (peak.intensity / globalMax) * 100;
      expect(Math.abs(normalized - reflection.intensityNorm)).toBeLessThan(1);
    }
  });

  it('验收 6（GUI 基准）：Al 六峰 I/I₀ 千分比与 GUI List 偏差 ≤3%，峰位 <0.01°', () => {
    // 2026-10-16 pywinauto 驱动原程序实测（List 面板 Intensity = 剖面峰值）：
    // 1000/470/266/283/80/37。口径：F′F″/Thermal/L-P/PeakShape 全开、
    // 逐原子 B=1、q=0.10(σ)、λ=1.54056、Al a=4.0339。
    // 本引擎实测偏差（Factor.dat f₀ + F′F″ 色散默认开启）：0.00 / +0.05 / +0.69 /
    // +0.94 / +0.77 / +2.51 %。最弱峰 (400) +2.51% 为当前口径上限（FF.dat 离子
    // 回退 + 逐原子 B=1，未做 B 重扫）；仍优于验收阈值 ≤3%。
    const guiPermille: Array<[number, number, number, number]> = [
      [1, 1, 1, 1000],
      [2, 0, 0, 470],
      [2, 2, 0, 266],
      [3, 1, 1, 283],
      [2, 2, 2, 80],
      [4, 0, 0, 37],
    ];
    for (const [h, k, l, reference] of guiPermille) {
      const reflection = alPattern.reflections.find(
        (r) => r.h === h && r.k === k && r.l === l,
      );
      expect(reflection, `(${h}${k}${l}) 未在反射表中找到`).toBeDefined();
      const permille = ((reflection?.intensityNorm ?? 0) / 100) * 1000;
      const deviation = Math.abs(permille - reference) / reference;
      expect(
        deviation,
        `(${h}${k}${l}) I/I₀ 偏差 ${(deviation * 100).toFixed(2)}%（计算 ${permille.toFixed(1)} vs GUI ${reference}）`,
      ).toBeLessThanOrEqual(0.03);
    }
    // 峰位同验收 1（此处用反射表自身的 2θ，独立于网格量化）。
    for (const reference of REFERENCE) {
      const reflection = alPattern.reflections.find(
        (r) =>
          r.h === reference.hkl[0] && r.k === reference.hkl[1] && r.l === reference.hkl[2],
      );
      expect(Math.abs((reflection?.twoTheta ?? NaN) - reference.twoTheta)).toBeLessThan(0.01);
    }
  });

  it('验收 7（绝对强度回归）：峰顶 = I_hkl（峰顶归一形式，无 1/(q√2π) 密度因子）', () => {
    // 实证来源：原程序 2026-10-16 保存 `samples/Al.xrd`
    // 峰值 = 152557 = 离散反射 I_hkl 本身；GUI 曲线同口径。
    // 若回归到 help RTF 公式(6) 文字的密度归一 1/(q√2π)，峰顶会变成
    // 152557/(0.10·√(2π)) ≈ 608614（3.9894 倍），本测试即失败。
    const gridPeakValue = gridPeak(alPattern, 38.6272).intensity;
    const reflection = alPattern.reflections.find((r) => r.h === 1 && r.k === 1 && r.l === 1);
    expect(reflection, '(111) 未在反射表中找到').toBeDefined();
    // 峰顶应等于 I_hkl（相对误差 <1%，mult 口径已知 0.24% 偏差）。
    // toBeCloseTo 第二参是"小数位数"（绝对差 < 0.5×10^-n），大数用显式相对误差判断。
    expect(Math.abs(gridPeakValue - reflection!.intensity) / reflection!.intensity).toBeLessThan(0.01);
    // 且绝不应出现密度归一放大（>2x 即异常）。
    expect(gridPeakValue / reflection!.intensity).toBeLessThan(2);
    // 数值锚点：参考文件峰值 152557，计算值应在 ±5% 内（吸收 mult 口径差）。
    expect(gridPeakValue).toBeGreaterThan(152557 * 0.95);
    expect(gridPeakValue).toBeLessThan(152557 * 1.05);
  });

  it('验收 6（GUI 基准）：NaCl 奇偶不敏感峰 I/I₀ 与 GUI List 偏差 ≤5%', () => {
    // GUI 实测（a=5.62、Na1+@4a / Cl1-@4b、均 B=1、四选项全开、q=0.10）：
    // 111/200/220/311/222/400/331/420/422 = 91/1000/616/19/187/78/9/196/137。
    // 偶指数（全偶）峰的 F = f_Na + f_Cl（和项），不受差项放大影响，
    // 实测偏差均在 5% 内（接入 Factor.dat 真实离子系数后）：
    // 200 0.00 / 220 −0.86 / 222 −1.42 / 400 −2.62 / 420 −2.82 / 422 −2.91 %。
    const naclPattern = computeXRDPattern(parseCord(sampleText('nacl')), alParams);
    const evenRefs: Array<[number, number, number, number]> = [
      [2, 0, 0, 1000],
      [2, 2, 0, 616],
      [2, 2, 2, 187],
      [4, 0, 0, 78],
      [4, 2, 0, 196],
      [4, 2, 2, 137],
    ];
    for (const [h, k, l, reference] of evenRefs) {
      const reflection = naclPattern.reflections.find(
        (r) => r.h === h && r.k === k && r.l === l,
      );
      expect(reflection, `(${h}${k}${l}) 未在 NaCl 反射表中找到`).toBeDefined();
      const permille = ((reflection?.intensityNorm ?? 0) / 100) * 1000;
      const deviation = Math.abs(permille - reference) / reference;
      expect(
        deviation,
        `(${h}${k}${l}) I/I₀ 偏差 ${(deviation * 100).toFixed(2)}%`,
      ).toBeLessThanOrEqual(0.05);
    }
  });

  it('NaCl 奇偶敏感峰（111/311/331）：F′F″ 落地后逼近 GUI（离子回退残差 ≤6%）', () => {
    // 全奇指数峰的 F = f_Na − f_Cl（差项），对 F′/f₀ 的微小差异极敏感。
    // 接入 Factor.dat 真实离子系数后 (111) 由 −9.30% 改善到 −5.33%（中性近似）；
    // 再接入 FF.dat 的 F′F″ 色散修正（默认开启，与 GUI 默认勾选一致）后进一步
    // 逼近（M3 口径：DW×完整 f_eff，见 ghidra-reverse-findings.md §8.2）：
    // 111 = 91.03（GUI 91，+0.03%）、311 = 19.22（GUI 19，+1.15%）、
    // 331 = 8.80（GUI 9，−2.24%）。坡位/强度按 legacy 报表网格口径取值
    // （见 pipeline.ts legacyPowderReportAngle：Lp 在 0.01° 报表角上求值），
    // 因此 (111) 由 91.05 微调为 91.03，更贴近 GUI 的整数 91。
    // 剩余偏差的主因是 FF.dat 无离子条目（Na1+/Cl1- 回退中性），差项放大所致，
    // 属已知近似上限（详见 docs/ff-dat-spec.md §5.7），非随机误差。
    // 按纪律带数据报告、不静默放宽——锁定实测值并量化与 GUI 的偏差。
    const naclPattern = computeXRDPattern(parseCord(sampleText('nacl')), alParams);
    const permilleOf = (h: number, k: number, l: number): number => {
      const reflection = naclPattern.reflections.find(
        (r) => r.h === h && r.k === k && r.l === l,
      );
      return ((reflection?.intensityNorm ?? 0) / 100) * 1000;
    };
    expect(permilleOf(1, 1, 1)).toBeCloseTo(91.0275, 2); // GUI 91 (M3 legacy scalar, default)
    expect(permilleOf(3, 1, 1)).toBeCloseTo(19.2186, 2); // GUI 19 (M3, odd family)
    expect(permilleOf(3, 3, 1)).toBeCloseTo(8.7988, 2); // GUI 9 (M3, odd family)
    // 与 GUI 偏差锁定（离子回退近似上限）：
    expect(Math.abs(permilleOf(1, 1, 1) - 91) / 91).toBeLessThan(0.02);
    expect(Math.abs(permilleOf(3, 1, 1) - 19) / 19).toBeLessThan(0.06);
    expect(Math.abs(permilleOf(3, 3, 1) - 9) / 9).toBeLessThan(0.04);
  });

  it('验收 3：无虚假峰——六峰之外谱面无 >1% 全局最大的峰', () => {
    const globalMax = Math.max(...alPattern.intensity);
    const significant = localMaxima(alPattern).filter((p) => p.intensity > 0.01 * globalMax);
    expect(significant).toHaveLength(6);
    for (const reference of REFERENCE) {
      const matched = significant.some(
        (p) => Math.abs(p.twoTheta - reference.twoTheta) < 0.05,
      );
      expect(matched, `hkl ${reference.hkl.join('')} 峰未找到`).toBe(true);
    }
  });

  it('反射表：仅 6 条 FCC 允许峰（全偶/全奇），mult 与 §9 一致', () => {
    expect(alPattern.reflections).toHaveLength(6);
    const expected: Array<[[number, number, number], number]> = [
      [[1, 1, 1], 8],
      [[2, 0, 0], 6],
      [[2, 2, 0], 12],
      [[3, 1, 1], 24],
      [[2, 2, 2], 8],
      [[4, 0, 0], 6],
    ];
    for (const [hkl, mult] of expected) {
      const reflection = alPattern.reflections.find(
        (r) => r.h === hkl[0] && r.k === hkl[1] && r.l === hkl[2],
      );
      expect(reflection, `hkl ${hkl.join('')} 应在反射表中`).toBeDefined();
      expect(reflection?.multiplicity).toBe(mult);
    }
    // 最强峰为 (111)，归一化 100。
    const strongest = alPattern.reflections.reduce((a, b) => (a.intensity > b.intensity ? a : b));
    expect([strongest.h, strongest.k, strongest.l]).toEqual([1, 1, 1]);
    expect(strongest.intensityNorm).toBe(100);
  });

  it('d 与 2θ：报表 d 由 legacy 报表角反算，晶面间距本身仍是 a/√3', () => {
    const r111 = alPattern.reflections.find((r) => r.h === 1 && r.k === 1 && r.l === 1);
    // 报表 2θ 落在 0.01° 网格上（legacyPowderReportAngle）；d 列由该角反算，
    // 与 Al.RTF 的 2.3288 逐值一致（晶胞精确值 a/√3 = 2.3290 见 single 表）。
    expect(r111?.twoTheta).toBeCloseTo(38.63, 6);
    expect(r111?.d).toBeCloseTo(1.54056 / (2 * Math.sin((38.63 / 2) * (Math.PI / 180))), 10);
    // 晶面间距公式本身未被改动：直接调用 dSpacing 仍是 a/√3 的精确值。
    expect(dSpacing(al, 1, 1, 1)).toBeCloseTo(4.0339 / Math.sqrt(3), 10);
  });

  it('与原程序 Al.RTF 六峰逐值一致（2θ 2 位 / d 4 位 / I 整数 / I·Io⁻¹ 千分制）', () => {
    // 基准：D:/Users/admin/Desktop/Al.RTF（原 CalcXRD.exe powder List 导出），
    // 列序 2θ(2dp) d(4dp) I I/Io hkl 列表。
    const rtf: Array<[string, number, number, number, number, number]> = [
      ['111', 38.63, 2.3288, 152557, 1000, 8],
      ['200', 44.9, 2.0171, 71693, 470, 6],
      ['220', 65.38, 1.4262, 40648, 266, 12],
      ['311', 78.59, 1.2163, 43172, 283, 24],
      ['222', 82.82, 1.1645, 12165, 80, 8],
      ['400', 99.6, 1.0085, 5681, 37, 6],
    ];
    const byAngle = [...alPattern.reflections].sort((a, b) => a.twoTheta - b.twoTheta);
    expect(byAngle).toHaveLength(rtf.length);
    byAngle.forEach((r, i) => {
      const [hkl, twoTheta, d, intensity, io, mult] = rtf[i];
      expect(`${r.h}${r.k}${r.l}`).toBe(hkl);
      expect(r.twoTheta.toFixed(2)).toBe(twoTheta.toFixed(2));
      expect(r.d.toFixed(4)).toBe(d.toFixed(4));
      expect(Math.round(r.intensity)).toBe(intensity);
      expect(Math.round(r.intensityNorm * 10)).toBe(io);
      expect(r.multiplicity).toBe(mult);
    });
    // 同时对齐 samples/Al.xrd 的网格峰高（0.01° 网格最大值）。
    const idx = alPattern.twoTheta.findIndex((v) => Math.abs(v - 38.63) < 1e-9);
    expect(Math.round(alPattern.intensity[idx])).toBe(152557);
  });
});

describe('xrd_file — 序列化兼容原程序 header（T07 验收 4/5）', () => {
  it('header 五行与数据行格式逐字节兼容（step 写实际值）', () => {
    const text = serializeXrd(al, alPattern);
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('Al');
    expect(lines[1]).toBe('Lamda = 1.54056 ');
    expect(lines[2]).toBe('  3.000,100.000,  0.010'); // 实际步长 0.01（legacy 笔误 0.001 不复刻）
    expect(lines[3]).toBe('Data Number =     9700');
    expect(lines[4]).toBe('Full Scall  =    10000');
    // 数据行 %9.4f%8.0f，行数 = (max−min)/step + 1。
    // split 后尾部多一个空元素（文本以 CRLF 结尾）。
    expect(lines).toHaveLength(5 + 9701 + 1 + 1);
    expect(lines[5]).toBe('   3.0000       0');
    expect(lines[9705]).toMatch(/^\s*100\.0000\s+\d+$/);
    expect(lines[9706]).toBe('0'); // 终止行
    expect(lines[9707]).toBe('');
    expect(text.endsWith('\r\n')).toBe(true);
  });

  it('验收 4/5：parseXrd(serializeXrd(...)) round-trip', () => {
    const text = serializeXrd(al, alPattern);
    const parsed = parseXrd(text);
    expect(parsed.twoTheta).toHaveLength(9701);
    for (let i = 0; i < parsed.twoTheta.length; i += 1) {
      expect(Math.abs(parsed.twoTheta[i] - alPattern.twoTheta[i])).toBeLessThanOrEqual(1e-4);
      // %8.0f 舍入：强度差 ≤ 0.5。
      expect(Math.abs(parsed.intensity[i] - alPattern.intensity[i])).toBeLessThanOrEqual(0.5);
    }
  });

  it('parseXrd 读权威夹具 Al.xrd：9701 行，六峰与 §9 参考表一致', () => {
    const fixture = readFileSync('tests/fixtures/Al.xrd', 'utf8');
    const parsed = parseXrd(fixture);
    expect(parsed.twoTheta).toHaveLength(9701);
    expect(parsed.twoTheta[0]).toBeCloseTo(3, 9);
    expect(parsed.twoTheta[parsed.twoTheta.length - 1]).toBeCloseTo(100, 9);
    const max = Math.max(...parsed.intensity);
    for (const reference of REFERENCE) {
      let best = -1;
      let bestAngle = Number.NaN;
      for (let i = 0; i < parsed.twoTheta.length; i += 1) {
        if (
          Math.abs(parsed.twoTheta[i] - reference.twoTheta) <= 0.2 &&
          parsed.intensity[i] > best
        ) {
          best = parsed.intensity[i];
          bestAngle = parsed.twoTheta[i];
        }
      }
      expect(best, `hkl ${reference.hkl.join('')} 在夹具中应存在`).toBeGreaterThan(0);
      const normalized = (best / max) * 100;
      expect(
        Math.abs(normalized - reference.intensityNorm),
        `hkl ${reference.hkl.join('')} 夹具归一化 ${normalized.toFixed(2)} vs ${reference.intensityNorm}`,
      ).toBeLessThan(0.05);
      // 夹具峰位（网格点）与理论值差 < 0.01°。
      expect(Math.abs(bestAngle - reference.twoTheta)).toBeLessThan(0.01);
    }
  });
});

describe('pipeline — 其他样品与参数分支', () => {
  it('NaCl / BaTiO3 / Po 全流程无 NaN/Infinity，峰位符合 Bragg 定律', () => {
    for (const id of ['nacl', 'batio3', 'po']) {
      const crystal = parseCord(sampleText(id));
      const pattern = computeXRDPattern(crystal, alParams);
      expect(pattern.twoTheta).toHaveLength(9701);
      for (const value of pattern.intensity) {
        expect(Number.isFinite(value)).toBe(true);
      }
      for (const reflection of pattern.reflections) {
        expect(Number.isFinite(reflection.d)).toBe(true);
        expect(Number.isFinite(reflection.twoTheta)).toBe(true);
        expect(reflection.intensityNorm).toBeGreaterThanOrEqual(0);
        // 2θ = 2·asin(λ/2d) 自洽。
        const expected =
          2 * (Math.asin(alParams.lambda / (2 * reflection.d)) * 180) / Math.PI;
        expect(reflection.twoTheta).toBeCloseTo(expected, 9);
      }
      // 每条反射的 mult 与轨道展开一致（Wyckoff 站点多重性 sanity）。
      for (const reflection of pattern.reflections) {
        expect(reflection.multiplicity).toBeGreaterThan(0);
      }
    }
  });

  it('NaCl：出现 (111) 弱峰（反相相消）与 (020)/(220) 强峰', () => {
    const nacl = parseCord(sampleText('nacl'));
    const pattern = computeXRDPattern(nacl, alParams);
    const has = (h: number, k: number, l: number): boolean =>
      pattern.reflections.some((r) => r.h === h && r.k === k && r.l === l);
    expect(has(1, 1, 1)).toBe(true);
    // 立方 canonical 化：(020) 与 (200) 同轨道，表中以字典序最大像 (200) 呈现。
    expect(has(2, 0, 0)).toBe(true);
    expect(has(2, 2, 0)).toBe(true);
    const r111 = pattern.reflections.find((r) => r.h === 1 && r.k === 1 && r.l === 1);
    const r200 = pattern.reflections.find((r) => r.h === 2 && r.k === 0 && r.l === 0);
    // (111) 反相相消 → 远弱于 (020)/(200)。
    expect(r111?.intensityNorm ?? 0).toBeLessThan((r200?.intensityNorm ?? 0) / 5);
  });

  it('usePeakShape=false → δ 棒谱（强度落在最近网格点，其余为 0）', () => {
    const sticks = computeXRDPattern(al, { ...alParams, usePeakShape: false });
    const nonZero = sticks.intensity.filter((v) => v > 0);
    expect(nonZero).toHaveLength(6);
    for (let i = 0; i < sticks.intensity.length; i += 1) {
      const nearPeak = sticks.reflections.some(
        (r) => Math.abs(sticks.twoTheta[i] - r.twoTheta) < alParams.step,
      );
      if (!nearPeak) {
        expect(sticks.intensity[i]).toBe(0);
      }
    }
  });

  it('useLp=false 时 (111)/(200) 强度比趋近 |F|²·mult 比（无 Lp 修正）', () => {
    const withLp = computeXRDPattern(al, alParams);
    const withoutLp = computeXRDPattern(al, { ...alParams, useLp: false });
    const pick = (p: XRDPattern, h: number, k: number, l: number): number =>
      p.reflections.find((r) => r.h === h && r.k === k && r.l === l)?.intensityNorm ?? -1;
    // 本实现（标准 Lp + Factor.dat f₀ + F′F″ 色散修正默认开启 + 逐原子 B=1，
    // M3 口径 DW×完整 f_eff，见 ghidra-reverse-findings.md §8.2）：
    // 有 Lp 时 (111)/(200) = 2.127932（legacy 报表网格角求 Lp，
    // GUI 实测原程序 List 152557/71693 = 2.127941，偏差 4e-4%）；
    // 无 Lp 时 = (mult 8/6)·(|F|² 比，热因子与
    // 色散含于 |F|² 内) = 1.520226。
    // （残差分析见强度验收测试说明。）
    expect(pick(withLp, 1, 1, 1) / pick(withLp, 2, 0, 0)).toBeCloseTo(2.127932, 5);
    expect(pick(withoutLp, 1, 1, 1) / pick(withoutLp, 2, 0, 0)).toBeCloseTo(1.520226, 5);
  });

  it('λ 变更 → 峰位整体左移且 meta 反映新 λ', () => {
    const mo = computeXRDPattern(al, { ...alParams, lambda: 0.7093 });
    expect(mo.meta.lambda).toBe(0.7093);
    const r111 = mo.reflections.find((r) => r.h === 1 && r.k === 1 && r.l === 1);
    // 2θ = 2·asin(0.7093/(2·4.0339/√3)) = 17.5179°（独立数值核实）。
    // 计划 T10 验收写的「≈17.2°」为近似笔误，实际 17.52°。
    expect(r111?.twoTheta).toBeCloseTo(17.52, 2);
  });

  it('关 Thermal 后高角峰相对升高（逐原子 B=1 的 Debye–Waller 生效）', () => {
    const thermal = computeXRDPattern(al, alParams); // 默认 Thermal 开、B=1
    const plain = computeXRDPattern(al, { ...alParams, useThermal: false });
    const pick = (p: XRDPattern, h: number, k: number, l: number): number =>
      p.reflections.find((r) => r.h === h && r.k === k && r.l === l)?.intensityNorm ?? -1;
    // 归一化后 (111) 恒为 100；比较 400/111 的比值即可看出高角衰减。
    const ratio = (p: XRDPattern) => pick(p, 4, 0, 0) / pick(p, 1, 1, 1);
    expect(ratio(thermal)).toBeLessThan(ratio(plain));
    // B=1 关掉后 400 相对升高约 45%（§7 B 标定表）。
    expect(ratio(plain) / ratio(thermal)).toBeGreaterThan(1.4);
  });

  it('非法参数抛错（λ≤0、q<0、step≤0、min≥max、max>180）', () => {
    expect(() => computeXRDPattern(al, { ...alParams, lambda: 0 })).toThrow();
    expect(() => computeXRDPattern(al, { ...alParams, q: -1 })).toThrow();
    expect(() => computeXRDPattern(al, { ...alParams, step: 0 })).toThrow();
    expect(() => computeXRDPattern(al, { ...alParams, rangeMin: 50, rangeMax: 50 })).toThrow();
    expect(() => computeXRDPattern(al, { ...alParams, rangeMax: 200 })).toThrow();
  });

  it('低对称群（三斜）枚举不重不漏：每个轨道仅一个代表', () => {
    // P1（1 号群，无旋转）：每个 (h,k,l) 自成轨道，mult=2（Friedel 对）。
    const triclinic: Crystal = {
      ...al,
      sgKey: '1(P1)',
      system: 'Triclinic',
      alpha: 80,
      beta: 85,
      gamma: 95,
    };
    const pattern = computeXRDPattern(triclinic, alParams);
    const keys = pattern.reflections.map((r) => `${r.h},${r.k},${r.l}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const reflection of pattern.reflections) {
      expect(reflection.multiplicity).toBe(2);
    }
    // 代表元为字典序最大像（如 (2,1,0) 与 (2,-1,0) 是两个不同反射）。
    expect(keys).toContain('2,1,0');
    expect(keys).toContain('2,-1,0');
  });
});
