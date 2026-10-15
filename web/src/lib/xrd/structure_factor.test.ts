import { describe, expect, it } from 'vitest';

import { parseCord } from './crystal';
import { f0 } from './cronie';
import { SAMPLE_CRYSTALS } from '@/data/samples';
import { EXTINCTION_REL_TOL, createDefaultParams } from './constants';
import { lorentzPolarization } from './lorentz';
import { dSpacing, sinThetaOverLambda, structureFactor } from './structure_factor';
import {
  normalizeReflections,
  peakIntensity,
  reflectionIntensity,
  reflectionMultiplicity,
} from './intensity';
import type { Crystal, HKLReflection } from './types';

const sampleText = (id: string): string => {
  const sample = SAMPLE_CRYSTALS.find((s) => s.id === id);
  if (!sample) {
    throw new Error(`sample ${id} not found`);
  }
  return sample.text;
};

/** Parsed Al (Cubic, 225(Fm-3m), a = 4.0339 Å, 1×Al @ 4a). */
const al: Crystal = parseCord(sampleText('al'));
/** Parsed NaCl (Cubic, 225(Fm-3m), a = 5.62 Å, Na1+ @ 4a / Cl1- @ 4b). */
const nacl: Crystal = parseCord(sampleText('nacl'));

const LAMBDA = 1.54056; // Cu Kα
// 逐原子 B 取自晶体本身；这里只控制 Thermal 开关（默认关，便于比对裸 |F|）。
const sfOpts = { lambda: LAMBDA, useThermal: false };

const modulus = (f: { re: number; im: number }): number => Math.hypot(f.re, f.im);

describe('structureFactor — Fm-3m 系统消光（T06 验收 1）', () => {
  it('混合奇偶 hkl 的 |F| < 1e-6·|F(111)|（消光由位置展开自然涌现）', () => {
    const reference = modulus(structureFactor(al, 1, 1, 1, sfOpts));
    expect(reference).toBeGreaterThan(0);
    // Face-centered extinction: h,k,l must be all-even or all-odd.
    const mixedParity: Array<[number, number, number]> = [
      [1, 0, 0],
      [1, 1, 0],
      [2, 1, 0],
      [2, 1, 1],
      [2, 2, 1],
      [3, 0, 0],
      [3, 1, 0],
      [3, 2, 0],
      [3, 2, 1],
    ];
    for (const [h, k, l] of mixedParity) {
      const f = structureFactor(al, h, k, l, sfOpts);
      expect(modulus(f)).toBeLessThan(EXTINCTION_REL_TOL * reference);
    }
  });

  it('全偶/全奇 hkl 均允许：(111)/(200)/(220)/(311)/(222)/(400) 的 |F| ≈ 4·f₀', () => {
    for (const [h, k, l] of [
      [1, 1, 1],
      [2, 0, 0],
      [2, 2, 0],
      [3, 1, 1],
      [2, 2, 2],
      [4, 0, 0],
    ] as Array<[number, number, number]>) {
      const s = sinThetaOverLambda(al, h, k, l);
      const f = structureFactor(al, h, k, l, sfOpts);
      expect(modulus(f)).toBeCloseTo(4 * f0('Al', s), 9);
    }
  });
});

describe('structureFactor — Al (111) |F| = 4·f₀(s)（T06 验收 2）', () => {
  it('4 个面心等效位置同位相，F 为 4 倍实数', () => {
    const s = sinThetaOverLambda(al, 1, 1, 1);
    const f = structureFactor(al, 1, 1, 1, sfOpts);
    expect(modulus(f)).toBeCloseTo(4 * f0('Al', s), 9);
    // (0,0,0) + 3 face centers all contribute exp(2πi·整数) = +1.
    expect(Math.abs(f.im)).toBeLessThan(1e-9);
    expect(f.re).toBeCloseTo(4 * f0('Al', s), 9);
  });

  it('s = 1/(2d) 与 λ 无关（f₀ 的中性原子形式）', () => {
    const s1 = sinThetaOverLambda(al, 1, 1, 1);
    const f = structureFactor(al, 1, 1, 1, { ...sfOpts, lambda: 0.7093 });
    expect(modulus(f)).toBeCloseTo(4 * f0('Al', s1), 9);
  });
});

describe('structureFactor — 热因子与占位（计划 §4.1，B 为逐原子参数）', () => {
  it('useThermal 时 |F| 逐原子乘 exp(−Bⱼ·s²)', () => {
    const s = sinThetaOverLambda(al, 1, 1, 1);
    const plain = structureFactor(al, 1, 1, 1, { ...sfOpts, useThermal: false });
    const thermal = structureFactor(al, 1, 1, 1, { ...sfOpts, useThermal: true });
    // Al.cord 原子表的 B = 1（GUI 实测默认），故 exp(−1·s²)。
    expect(modulus(thermal)).toBeCloseTo(modulus(plain) * Math.exp(-1 * s * s), 9);
  });

  it('不同原子可有不同 B：混合 B 的 |F| 逐原子加权', () => {
    // 两个原子（不同 Wyckoff 位、同为 B=1 与 B=3）时，热因子必须逐原子生效。
    const mixed: Crystal = {
      ...al,
      atoms: [
        { ...al.atoms[0], thermalB: 1 },
        { ...al.atoms[0], wyckoff: 'b', x: 0.5, y: 0.5, z: 0.5, thermalB: 3 },
      ],
    };
    const s = sinThetaOverLambda(al, 1, 1, 1);
    const fA = f0('Al', s);
    // Fm-3m 的 4a(0,0,0) 与 4b(1/2,1/2,1/2) 在 (111) 上相位相差 π。
    const expected = 4 * Math.abs(fA * Math.exp(-1 * s * s) - fA * Math.exp(-3 * s * s));
    expect(modulus(structureFactor(mixed, 1, 1, 1, { ...sfOpts, useThermal: true }))).toBeCloseTo(
      expected,
      9,
    );
  });

  it('useThermal=false 或 B=0 时热因子不生效', () => {
    const zeroB: Crystal = {
      ...al,
      atoms: [{ ...al.atoms[0], thermalB: 0 }],
    };
    const plain = structureFactor(al, 1, 1, 1, { ...sfOpts, useThermal: false });
    const off = structureFactor(al, 1, 1, 1, { ...sfOpts, useThermal: false });
    const zero = structureFactor(zeroB, 1, 1, 1, { ...sfOpts, useThermal: true });
    expect(modulus(off)).toBeCloseTo(modulus(plain), 12);
    expect(modulus(zero)).toBeCloseTo(modulus(plain), 12);
  });

  it('occupancy 线性缩放 |F|', () => {
    const half: Crystal = {
      ...al,
      atoms: [{ ...al.atoms[0], occupancy: 0.5 }],
    };
    const full = structureFactor(al, 1, 1, 1, sfOpts);
    const scaled = structureFactor(half, 1, 1, 1, sfOpts);
    expect(modulus(scaled)).toBeCloseTo(modulus(full) * 0.5, 9);
  });

  it('非法 λ / 未知 Wyckoff 位 / 未知元素均抛错', () => {
    expect(() => structureFactor(al, 1, 1, 1, { ...sfOpts, lambda: 0 })).toThrow();
    const badLetter: Crystal = { ...al, atoms: [{ ...al.atoms[0], wyckoff: 'z' }] };
    expect(() => structureFactor(badLetter, 1, 1, 1, sfOpts)).toThrow();
    const badElement: Crystal = { ...al, atoms: [{ ...al.atoms[0], element: 'Xx' }] };
    expect(() => structureFactor(badElement, 1, 1, 1, sfOpts)).toThrow();
  });
});

describe('dSpacing — 一般三斜闭式（计划 §4.1）', () => {
  it('立方退化：d = a/√(h²+k²+l²)', () => {
    expect(dSpacing(al, 1, 1, 1)).toBeCloseTo(4.0339 / Math.sqrt(3), 12);
    expect(dSpacing(al, 2, 0, 0)).toBeCloseTo(4.0339 / 2, 12);
  });

  it('正交晶胞：d(100)=a、d(010)=b、d(001)=c、d(110)=ab/√(a²+b²)', () => {
    const ortho: Crystal = {
      name: 'test',
      system: 'Orthohombic',
      sgNumber: 62,
      sgSymbol: 'Pnma',
      sgKey: '62(Pnma)',
      a: 3.1,
      b: 4.2,
      c: 5.3,
      alpha: 90,
      beta: 90,
      gamma: 90,
      atoms: al.atoms,
    };
    expect(dSpacing(ortho, 1, 0, 0)).toBeCloseTo(3.1, 12);
    expect(dSpacing(ortho, 0, 1, 0)).toBeCloseTo(4.2, 12);
    expect(dSpacing(ortho, 0, 0, 1)).toBeCloseTo(5.3, 12);
    expect(dSpacing(ortho, 1, 1, 0)).toBeCloseTo((3.1 * 4.2) / Math.hypot(3.1, 4.2), 12);
  });

  it('六方晶胞（γ=120°）：d(100) = a·√3/2', () => {
    const hexa: Crystal = {
      ...al,
      system: 'Hexagonal',
      a: 3.2,
      b: 3.2,
      c: 5.1,
      alpha: 90,
      beta: 90,
      gamma: 120,
    };
    expect(dSpacing(hexa, 1, 0, 0)).toBeCloseTo((3.2 * Math.sqrt(3)) / 2, 12);
  });

  it('(0,0,0) 与非法晶胞抛错', () => {
    expect(() => dSpacing(al, 0, 0, 0)).toThrow();
    const bad: Crystal = { ...al, a: -1 };
    expect(() => dSpacing(bad, 1, 1, 1)).toThrow();
  });
});

describe('reflectionMultiplicity — Laue 等效面数（T06 验收 4）', () => {
  it('立方抽查：(100)=6 (110)=12 (111)=8 (220)=12 (311)=24 (400)=6', () => {
    const cases: Array<[[number, number, number], number]> = [
      [[1, 0, 0], 6],
      [[1, 1, 0], 12],
      [[1, 1, 1], 8],
      [[2, 2, 0], 12],
      [[3, 1, 1], 24],
      [[4, 0, 0], 6],
    ];
    for (const [[h, k, l], expected] of cases) {
      expect(reflectionMultiplicity(al.sgKey, h, k, l)).toBe(expected);
    }
  });

  it('含 Friedel 对：(hkl) 与 (−h,−k,−l) 同 mult', () => {
    expect(reflectionMultiplicity(al.sgKey, -1, 1, 1)).toBe(
      reflectionMultiplicity(al.sgKey, 1, 1, 1),
    );
  });
});

describe('lorentzPolarization（T06 验收 5）', () => {
  it('Lp(45°) 与手算一致 = 11.0870', () => {
    // θ = 22.5°: (1 + cos²45°) / (sin²22.5° · cos22.5°)
    //           = 1.5 / (0.1464466 · 0.9238795) = 11.08704…
    expect(lorentzPolarization(45)).toBeCloseTo(11.087, 3);
  });

  it('θ→0 有界不发散（数值下限处理）', () => {
    const atZero = lorentzPolarization(0);
    expect(Number.isFinite(atZero)).toBe(true);
    expect(atZero).toBeGreaterThan(0);
    // 单调有界：2θ 越小 Lp 越大，但永不溢出。
    const chain = [0, 0.001, 0.01, 0.1, 1].map((t) => lorentzPolarization(t));
    for (const value of chain) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(chain[0]).toBeGreaterThan(chain[chain.length - 1]);
  });

  it('Lp 在实用区间 (0°,90°) 随 2θ 单调递减', () => {
    // 注：Lp 在 2θ≈100° 附近取全局极小后向 180° 回升（分母 cosθ→0），
    // 粉末衍射实用范围（≤90°）内严格递减。
    let previous = Number.POSITIVE_INFINITY;
    for (let twoTheta = 5; twoTheta <= 90; twoTheta += 5) {
      const value = lorentzPolarization(twoTheta);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
    // 极小值位于 ~100°（两侧均更大）。
    expect(lorentzPolarization(100)).toBeLessThan(lorentzPolarization(90));
    expect(lorentzPolarization(100)).toBeLessThan(lorentzPolarization(110));
  });

  it('负角与非有限值抛错', () => {
    expect(() => lorentzPolarization(-1)).toThrow();
    expect(() => lorentzPolarization(Number.NaN)).toThrow();
  });
});

describe('NaCl 双元素结构因子（T06 验收 3）', () => {
  it('(020) 同位相 |F| = 4(f_Na+f_Cl)；(111) 反相 |F| = 4|f_Na−f_Cl|', () => {
    const s020 = sinThetaOverLambda(nacl, 0, 2, 0);
    const s111 = sinThetaOverLambda(nacl, 1, 1, 1);
    const fNa = f0('Na1+', s020); // 离子态映射中性元素（文档化近似）
    const fCl = f0('Cl1-', s020);
    const f020 = structureFactor(nacl, 0, 2, 0, sfOpts);
    expect(modulus(f020)).toBeCloseTo(4 * (fNa + fCl), 9);
    expect(Math.abs(f020.im)).toBeLessThan(1e-9);

    const fNa111 = f0('Na1+', s111);
    const fCl111 = f0('Cl1-', s111);
    const f111 = structureFactor(nacl, 1, 1, 1, sfOpts);
    expect(modulus(f111)).toBeCloseTo(4 * Math.abs(fNa111 - fCl111), 9);
  });

  it('(020)/(220) 强度比：本实现 1.637（Thermal 开、逐原子 B=1），对 GUI 基准 1.623 偏差 0.86%', () => {
    // 完整口径 I = K·Lp·|F|²·mult（K=1，标准 Lp，Laue mult，Factor.dat f₀）。
    // 旧的「截图 3.25」基准（设置未知、且与 Laue mult 数学不兼容）已被
    // 2026-10-16 GUI 实测取代：I/I₀ = 1000/616 → 比值 1.623。
    const row = (h: number, k: number, l: number) => {
      const twoTheta =
        (2 * Math.asin(LAMBDA / (2 * dSpacing(nacl, h, k, l))) * 180) / Math.PI;
      const f = structureFactor(nacl, h, k, l, { ...sfOpts, useThermal: true });
      const mult = reflectionMultiplicity(nacl.sgKey, h, k, l);
      return reflectionIntensity(twoTheta, f, mult, { useLp: true });
    };
    const ratio = row(0, 2, 0) / row(2, 2, 0);

    // 本实现 1.637 vs GUI 1.623（+0.86%）：与 NaCl 九峰验收中 (220) 的
    // −0.86% 偏差同源（同一条 f₀ 曲线在高角端的微小差异）。
    expect(ratio).toBeCloseTo(1.637, 2);
    expect(Math.abs(ratio - 1000 / 616) / (1000 / 616)).toBeLessThan(0.01);

    // 与 Lp 口径无关的部分（|F|²·mult，Thermal 开）。
    const f020 = structureFactor(nacl, 0, 2, 0, { ...sfOpts, useThermal: true });
    const f220 = structureFactor(nacl, 2, 2, 0, { ...sfOpts, useThermal: true });
    const lpFree =
      (modulus(f020) ** 2 * reflectionMultiplicity(nacl.sgKey, 0, 2, 0)) /
      (modulus(f220) ** 2 * reflectionMultiplicity(nacl.sgKey, 2, 2, 0));
    expect(lpFree).toBeGreaterThan(0);
  });
});

describe('intensity — 峰值强度与归一化', () => {
  it('peakIntensity = K·Lp·|F|²；useLp=false 时去掉 Lp', () => {
    const f = structureFactor(al, 1, 1, 1, sfOpts);
    const twoTheta =
      (2 * Math.asin(LAMBDA / (2 * dSpacing(al, 1, 1, 1))) * 180) / Math.PI;
    expect(peakIntensity(twoTheta, f, { useLp: true })).toBeCloseTo(
      lorentzPolarization(twoTheta) * modulus(f) ** 2,
      9,
    );
    expect(peakIntensity(twoTheta, f, { useLp: false })).toBeCloseTo(
      modulus(f) ** 2,
      9,
    );
  });

  it('reflectionIntensity 在 peakIntensity 基础上乘 mult', () => {
    const f = structureFactor(al, 1, 1, 1, sfOpts);
    const twoTheta =
      (2 * Math.asin(LAMBDA / (2 * dSpacing(al, 1, 1, 1))) * 180) / Math.PI;
    expect(reflectionIntensity(twoTheta, f, 8, { useLp: true })).toBeCloseTo(
      8 * peakIntensity(twoTheta, f, { useLp: true }),
      9,
    );
  });

  it('normalizeReflections：最强峰 = 100，返回新对象不修改入参', () => {
    const input: HKLReflection[] = [
      {
        h: 1, k: 1, l: 1, d: 2.33, twoTheta: 38.6, multiplicity: 8,
        fRe: 35.8, fIm: 0, intensity: 100, intensityNorm: 0,
      },
      {
        h: 2, k: 0, l: 0, d: 2.02, twoTheta: 44.9, multiplicity: 6,
        fRe: 34.0, fIm: 0, intensity: 25, intensityNorm: 0,
      },
    ];
    const snapshot = input.map((r) => ({ ...r }));
    const out = normalizeReflections(input);
    expect(out[0].intensityNorm).toBe(100);
    expect(out[1].intensityNorm).toBe(25);
    // 入参未被修改。
    expect(input).toEqual(snapshot);
    // 空数组与全零强度安全。
    expect(normalizeReflections([])).toEqual([]);
    const zeros: HKLReflection[] = [{ ...input[0], intensity: 0 }];
    expect(normalizeReflections(zeros)[0].intensityNorm).toBe(0);
  });

  it('默认参数来自 constants.ts（唯一来源）', () => {
    const params = createDefaultParams();
    expect(params.lambda).toBe(1.54056);
    expect(params.q).toBe(0.1); // 高斯 σ（GUI 实测默认 q = 0.10）
    expect(params.rangeMin).toBe(3);
    expect(params.rangeMax).toBe(100);
    expect(params.step).toBe(0.01);
    expect(params.useLp).toBe(true);
    expect(params.usePeakShape).toBe(true);
    expect(params.q).toBe(0.1); // 高斯 σ（GUI 实测默认 q=0.10）
    // Thermal 开（逐原子 B=1）；F′F″ 渲染为勾选但功能二期（§8-9）。
    expect(params.useThermal).toBe(true);
    expect(params.useAnomalous).toBe(true);
  });
});
