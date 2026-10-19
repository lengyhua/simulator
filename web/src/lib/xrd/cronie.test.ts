import { describe, expect, it } from 'vitest';

import { CRONIE_COEFFS } from './cronie_data';
import { FACTOR_COEFFS, FACTOR_TERM_COUNT } from './factor_data';
import {
  elementSymbols,
  f0,
  f0AtZero,
  getCoefficients,
  hasElement,
  normalizeElement,
  computeSearchFactor,
  formatSearchFactorReport,
  searchFactorMaxima,
} from './cronie';

/** Atomic numbers for the 92 neutral elements H–U (table self-check). */
const ELEMENT_Z: Record<string, number> = {
  H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10,
  Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18, K: 19, Ca: 20,
  Sc: 21, Ti: 22, V: 23, Cr: 24, Mn: 25, Fe: 26, Co: 27, Ni: 28, Cu: 29, Zn: 30,
  Ga: 31, Ge: 32, As: 33, Se: 34, Br: 35, Kr: 36, Rb: 37, Sr: 38, Y: 39, Zr: 40,
  Nb: 41, Mo: 42, Tc: 43, Ru: 44, Rh: 45, Pd: 46, Ag: 47, Cd: 48, In: 49, Sn: 50,
  Sb: 51, Te: 52, I: 53, Xe: 54, Cs: 55, Ba: 56, La: 57, Ce: 58, Pr: 59, Nd: 60,
  Pm: 61, Sm: 62, Eu: 63, Gd: 64, Tb: 65, Dy: 66, Ho: 67, Er: 68, Tm: 69, Yb: 70,
  Lu: 71, Hf: 72, Ta: 73, W: 74, Re: 75, Os: 76, Ir: 77, Pt: 78, Au: 79, Hg: 80,
  Tl: 81, Pb: 82, Bi: 83, Po: 84, At: 85, Rn: 86, Fr: 87, Ra: 88, Ac: 89, Th: 90,
  Pa: 91, U: 92,
};

/**
 * Reference f0 values [s = 0, 0.1, 0.3, 0.5 Å⁻¹] from the independently
 * transcribed IUCr table (ITbC Table 6.1.1.4), used as a CROSS-CHECK of the
 * runtime Factor.dat table — the two are different parameterizations of the
 * same physics, so agreement is expected to ~0.1%, not to 1e-3.
 */
const REFERENCE_F0: Record<string, [number, number, number, number]> = {
  H: [0.999872, 0.810942, 0.251357, 0.070707],
  He: [1.9999, 1.837572, 1.060194, 0.508941],
  Li: [2.9995, 2.214489, 1.511276, 1.034593],
  C: [5.9992, 5.107644, 2.49416, 1.685762],
  N: [6.9946, 6.185504, 3.217825, 1.939917],
  O: [7.9994, 7.245515, 4.089334, 2.337191],
  F: [8.9993, 8.302805, 5.054008, 2.873486],
  Na: [10.9924, 9.75818, 6.883736, 4.290765],
  Mg: [11.9865, 10.48093, 7.455874, 5.029131],
  Al: [12.9937, 11.230684, 7.870566, 5.697425],
  Si: [13.9976, 12.133805, 8.230006, 6.240089],
  P: [14.9993, 13.137795, 8.598446, 6.675095],
  S: [15.9998, 14.177241, 9.037846, 7.020798],
  Cl: [17.0005, 15.233286, 9.575408, 7.310747],
  K: [18.999, 16.732219, 10.980119, 7.88795],
  Ca: [20.0, 17.330975, 11.707644, 8.272922],
  Fe: [25.9904, 23.683083, 16.74802, 11.505688],
  Cu: [28.9859, 27.095698, 19.881111, 13.700702],
  Zn: [29.9854, 27.94036, 20.73344, 14.550531],
  Ba: [55.9901, 51.111838, 38.589139, 29.956085],
  Pb: [81.9488, 77.659793, 61.744755, 48.935236],
  U: [91.9693, 86.134534, 68.613706, 55.417745],
};

const S_VALUES = [0, 0.1, 0.3, 0.5];

describe('FACTOR_COEFFS — 运行时唯一数据源（Factor.dat 解码）', () => {
  it('覆盖 199 个物种（92 中性元素 + 离子态 + Cval/Siva 变体）', () => {
    const keys = Object.keys(FACTOR_COEFFS);
    expect(keys).toHaveLength(199);
    for (const symbol of Object.keys(ELEMENT_Z)) {
      expect(FACTOR_COEFFS[symbol]).toBeDefined();
    }
    // 价态变体与离子态原样保留。
    expect(FACTOR_COEFFS.Cval).toBeDefined();
    expect(FACTOR_COEFFS.Siva).toBeDefined();
    expect(FACTOR_COEFFS['Na1+']).toBeDefined();
    expect(FACTOR_COEFFS['Cl1-']).toBeDefined();
  });

  it('每条记录 5 个高斯项 + c（a/b 等长，与 FACTOR_TERM_COUNT 一致）', () => {
    expect(FACTOR_TERM_COUNT).toBe(5);
    for (const [symbol, coefficients] of Object.entries(FACTOR_COEFFS)) {
      expect(coefficients.a, symbol).toHaveLength(FACTOR_TERM_COUNT);
      expect(coefficients.b, symbol).toHaveLength(FACTOR_TERM_COUNT);
      expect(Number.isFinite(coefficients.c), symbol).toBe(true);
      for (const value of [...coefficients.a, ...coefficients.b]) {
        expect(Number.isFinite(value), symbol).toBe(true);
      }
    }
  });

  it('中性元素 f0(s=0) = Σaᵢ+c 与原子序数 Z 误差 < 0.5', () => {
    for (const [symbol, z] of Object.entries(ELEMENT_Z)) {
      expect(Math.abs(f0AtZero(symbol) - z), `${symbol} vs Z=${z}`).toBeLessThan(0.5);
    }
  });

  it('离子态 f0(0) 等于其电子数（区分于中性元素）', () => {
    // Na1+ 丢 1 个电子 → 10；Cl1- 得 1 个 → 18；O2- → 10。
    expect(f0AtZero('Na1+')).toBeCloseTo(10, 1);
    expect(f0AtZero('Cl1-')).toBeCloseTo(18, 1);
    expect(f0AtZero('O2-')).toBeCloseTo(10, 1);
    expect(f0AtZero('Na')).toBeCloseTo(11, 1);
    expect(f0AtZero('Cl')).toBeCloseTo(17, 1);
    // 离子与中性不再同值——这是接入 Factor.dat 后 NaCl 差项峰改善的关键。
    expect(f0('Na1+', 0.3)).not.toBe(f0('Na', 0.3));
  });

  it('f0 随 s 单调不增（物理合理性）', () => {
    let previous = Infinity;
    for (let s = 0; s <= 1.5; s += 0.05) {
      const value = f0('Al', s);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      previous = value;
    }
  });
});

describe('f0 — 与 IUCr 交叉校验（旧表仅作参照，不参与运行时）', () => {
  it('抽查 22 个元素在 s = 0 / 0.1 / 0.3 / 0.5 Å⁻¹ 与 IUCr 表偏差 < 0.5%', () => {
    expect(Object.keys(REFERENCE_F0).length).toBeGreaterThanOrEqual(10);
    for (const [symbol, reference] of Object.entries(REFERENCE_F0)) {
      S_VALUES.forEach((s, i) => {
        const value = f0(symbol, s);
        const deviation = Math.abs(value - reference[i]) / Math.max(1e-6, Math.abs(reference[i]));
        expect(deviation, `${symbol} @ s=${s}: ${value} vs ${reference[i]}`).toBeLessThan(0.005);
      });
    }
  });

  it('旧 IUCr 表本身仍然完整（92 元素、H/Al 系数未漂移）', () => {
    expect(Object.keys(CRONIE_COEFFS)).toHaveLength(92);
    expect(CRONIE_COEFFS.H.a).toEqual([0.489918, 0.262003, 0.196767, 0.049879]);
    expect(CRONIE_COEFFS.H.b).toEqual([20.6593, 7.74039, 49.5519, 2.20159]);
    expect(CRONIE_COEFFS.Al.a).toEqual([6.4202, 1.9002, 1.5936, 1.9646]);
    expect(CRONIE_COEFFS.Al.b).toEqual([3.0387, 0.7426, 31.5472, 85.0886]);
    expect(CRONIE_COEFFS.Al.c).toBeCloseTo(1.1151, 6);
  });
});

describe('computeSearchFactor — legacy Search Factor 对话框（§8.19/§8.20，2026-10-19 C3 已裁决：移植为 UI 组件）', () => {
  it('Na1+ @ CuKa1, 2θ=53.00° 与 ref-data/007-Na+.rtf 逐值对照 0.0000%', () => {
    // 007-Na+.rtf: 2θ=53.00 s=0.28963352 f0=7.049808337 fEff=7.186880013
    //              ΔF1=0.136 ΔF2=0.124
    const result = computeSearchFactor('Na1+', 'CuKa1', 53.00, 53.00, 0.01);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.s).toBeCloseTo(0.28963352, 8);
    expect(row.f0).toBeCloseTo(7.049808337, 9);
    expect(row.fEff).toBeCloseTo(7.186880013, 9);
    expect(result.deltaF1).toBeCloseTo(0.136, 3);
    expect(result.deltaF2).toBeCloseTo(0.124, 3);
  });

  it('Al @ CuKa1, 2θ=38.63° f0 ≈ 8.9 (13 e⁻ at s=0, decreases with s)', () => {
    const result = computeSearchFactor('Al', 'CuKa1', 38.63, 38.63, 0.01);
    expect(result.rows[0].f0).toBeCloseTo(8.94, 0);
    expect(result.rows[0].fEff).toBeGreaterThan(result.rows[0].f0); // f′ > 0
  });

  it('未知物种抛错', () => {
    expect(() => computeSearchFactor('Xx', 'CuKa1', 3, 100, 0.01)).toThrow();
  });

  it('多行输出 2θ 递增', () => {
    const result = computeSearchFactor('Cu', 'CuKa1', 3, 35, 0.01);
    expect(result.rows.length).toBeGreaterThan(300);
    for (let i = 1; i < result.rows.length; i += 1) {
      expect(result.rows[i].twoTheta).toBeGreaterThan(result.rows[i - 1].twoTheta - 1e-9);
    }
  });
});

describe('searchFactorMaxima / formatSearchFactorReport — 曲线 Max 读数与导出报表（2026-10-19）', () => {
  it('Max Fo = 窗口内 f₀ 最大值 = 首行（f₀ 随 2θ 单调下降）', () => {
    const result = computeSearchFactor('Al', 'CuKa1', 3, 100, 0.5);
    const maxima = searchFactorMaxima(result);
    expect(maxima).not.toBeNull();
    expect(maxima?.maxFo).toBe(result.rows[0].f0);
    expect(maxima?.maxFoEff).toBe(result.rows[0].fEff);
    expect(result.rows[result.rows.length - 1].f0).toBeLessThan(result.rows[0].f0);
  });

  it('空行窗口 → Max 为 null（不抛错，UI 可安全跳过）', () => {
    const base = computeSearchFactor('Al', 'CuKa1', 3, 3, 0.01);
    expect(searchFactorMaxima({ ...base, rows: [] })).toBeNull();
  });

  it('报表布局复刻 legacy 007-Na+.rtf：Element/Target/a1..a5+c/ΔF1ΔF2/Max Fo/表头/数据行', () => {
    // 007-Na+.rtf 首行数据：2θ=53.00 s=0.28963352 f0=7.049808337 fEff=7.186880013
    const result = computeSearchFactor('Na1+', 'CuKa1', 53.0, 53.0, 0.01);
    const lines = formatSearchFactorReport(result).split('\n');
    expect(lines[0]).toBe('Element Name :  Na1+');
    expect(lines[1]).toBe(`Target : CuKa1  ${result.lambda}`);
    expect(lines[2]).toMatch(/^a1=/);
    expect(lines[6]).toMatch(/^a5=/);
    expect(lines[7]).toMatch(/^c=/);
    expect(lines[8]).toMatch(/^DeltaF1 =/);
    expect(lines[9]).toMatch(/^Max Fo =/);
    expect(lines[10]).toBe(
      ' 2theta degree    sin(theta)/lamda         Fo               Fo after F1 & F2',
    );
    expect(lines[11]).toContain('7.049808337');
    expect(lines[11]).toContain('7.186880013');
    expect(lines).toHaveLength(12); // 11 行报头 + 1 行数据
  });

  it('b 系数标签为正确的 b1..b5（legacy 报表把 5 个 b 全写成 b1，此处有意修正）', () => {
    const text = formatSearchFactorReport(computeSearchFactor('Al', 'CuKa1', 3, 3, 0.01));
    expect(text).toContain('b1=');
    expect(text).toContain('b5=');
    expect(text.split('b1=').length - 1).toBe(1); // legacy 为 5
  });
});

describe('元素查询与查表策略', () => {
  it('未知物种 hasElement=false 且 f0 抛明确错误', () => {
    expect(hasElement('Xx')).toBe(false);
    expect(hasElement('Zz')).toBe(false);
    expect(hasElement('')).toBe(false);
    expect(() => f0('Xx', 0.1)).toThrow(/未知物种「Xx」/);
  });

  it('离子符号归一化到中性形式（查表回退用）', () => {
    expect(normalizeElement('Na1+')).toBe('Na');
    expect(normalizeElement('Cl1-')).toBe('Cl');
    expect(normalizeElement('O2-')).toBe('O');
    expect(normalizeElement('Ba2+')).toBe('Ba');
    expect(normalizeElement('Ti4+')).toBe('Ti');
    expect(normalizeElement('Al')).toBe('Al');
    expect(normalizeElement(' Al ')).toBe('Al');
  });

  it('查表：精确命中 → 剥电荷回退 → undefined（不静默猜测）', () => {
    // 精确命中原物种名。
    expect(getCoefficients('Na1+')).toBe(FACTOR_COEFFS['Na1+']);
    expect(getCoefficients('Cval')).toBe(FACTOR_COEFFS.Cval);
    // 未收录的价态剥电荷后退到中性元素。
    expect(getCoefficients('Fe9+')).toBe(FACTOR_COEFFS.Fe);
    expect(getCoefficients('Al7+')).toBe(FACTOR_COEFFS.Al);
    // 完全未知 → undefined（调用方负责报错）。
    expect(getCoefficients('Xx')).toBeUndefined();
  });

  it('getCoefficients 返回表内系数引用（冻结常量表）', () => {
    const coefficients = getCoefficients('Fe');
    expect(coefficients).toBe(FACTOR_COEFFS.Fe);
    expect(coefficients?.a).toHaveLength(5);
    expect(coefficients?.b).toHaveLength(5);
  });

  it('elementSymbols 返回全部 199 个物种键（含离子态，UI datalist 用）', () => {
    const symbols = elementSymbols();
    expect(symbols).toHaveLength(199);
    expect(symbols).toContain('H');
    expect(symbols).toContain('U');
    // 离子态现在是有独立系数的真实条目，必须出现在 datalist 里。
    expect(symbols).toContain('Na1+');
    expect(symbols).toContain('Cl1-');
    expect([...symbols].sort()).toEqual(symbols);
    for (const symbol of symbols) {
      expect(hasElement(symbol)).toBe(true);
    }
  });
});
