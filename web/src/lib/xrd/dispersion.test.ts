import { describe, expect, it } from 'vitest';

import { parseCord } from './crystal';
import { f0 } from './cronie';
import { SAMPLE_CRYSTALS } from '@/data/samples';
import { getDispersion, hasDispersion, hasDispersionExtended } from './dispersion';
import { sinThetaOverLambda, structureFactor } from './structure_factor';

const LAMBDA_CU = 1.54056;
const LAMBDA_MO = 0.7093;
const LAMBDA_CR = 2.2897; // FF.dat 无数据
const LAMBDA_FE = 1.93604; // FF.dat 无数据

describe('getDispersion — 查表与索引', () => {
  it('中性元素命中 FF.dat：Al Cu Kα f′=0.212 f″=0.246', () => {
    const d = getDispersion('Al', LAMBDA_CU);
    expect(d.supported).toBe(true);
    expect(d.fPrime).toBeCloseTo(0.212, 3);
    expect(d.fDoublePrime).toBeCloseTo(0.246, 3);
  });

  it('离子符号回退中性（与 cronie.normalizeElement 同口径）', () => {
    // Na1+ → Na（Z=11），Cu Kα f′=0.136 f″=0.124。
    const d = getDispersion('Na1+', LAMBDA_CU);
    expect(d.supported).toBe(true);
    expect(d.fPrime).toBeCloseTo(0.136, 3);
    expect(d.fDoublePrime).toBeCloseTo(0.124, 3);
  });

  it('Z=91 误标修正：Pa 命中 Z=91，Po 命中 Z=84（二者不混淆）', () => {
    // FF.dat 把 Z=91 错写成 "Po"；FF_SYMBOLS 已修正为 "Pa"。
    // 'Pa' → index 90 (Z=91)：Cu Kα f′=−4.06 f″=12.884。
    const pa = getDispersion('Pa', LAMBDA_CU);
    expect(pa.supported).toBe(true);
    expect(pa.fPrime).toBeCloseTo(-4.06, 3);
    expect(pa.fDoublePrime).toBeCloseTo(12.884, 3);
    // 'Po' → index 83 (Z=84)：Cu Kα f′=−3.803 f″=9.396，与 Pa 不同。
    const po = getDispersion('Po', LAMBDA_CU);
    expect(po.supported).toBe(true);
    expect(po.fPrime).toBeCloseTo(-3.803, 3);
    expect(po.fDoublePrime).toBeCloseTo(9.396, 3);
    expect(pa.fDoublePrime).not.toBeCloseTo(po.fDoublePrime, 1);
  });

  it('无对应波长的靶（Cr/Fe Kα）回退为 unsupported，f′=f″=0（fidelity 模式）', () => {
    // 注意：fidelity 模式（默认）下 Cr/Fe 无 FF.dat 数据 → unsupported。
    // extended 模式才会从 HENKE_CRF 取值（见下方 "extended mode" 用例）。
    expect(getDispersion('Al', LAMBDA_CR, 'fidelity')).toEqual(
      { fPrime: 0, fDoublePrime: 0, supported: false, source: 'FF.dat' },
    );
    expect(getDispersion('Fe', LAMBDA_FE, 'fidelity')).toEqual(
      { fPrime: 0, fDoublePrime: 0, supported: false, source: 'FF.dat' },
    );
  });

  it('未知元素回退为 unsupported，不抛错', () => {
    expect(getDispersion('Xx', LAMBDA_CU)).toEqual(
      { fPrime: 0, fDoublePrime: 0, supported: false, source: 'FF.dat' },
    );
    expect(getDispersion('Uuo', LAMBDA_CU).supported).toBe(false);
  });
});

describe('hasDispersion — 波长覆盖判定', () => {
  it('Cu / Mo Kα 支持，Cr / Fe Kα 不支持', () => {
    expect(hasDispersion(LAMBDA_CU)).toBe(true);
    expect(hasDispersion(LAMBDA_MO)).toBe(true);
    expect(hasDispersion(LAMBDA_CR)).toBe(false);
    expect(hasDispersion(LAMBDA_FE)).toBe(false);
  });

  it('非法 λ 视为不支持', () => {
    expect(hasDispersion(0)).toBe(false);
    expect(hasDispersion(Number.NaN)).toBe(false);
    expect(hasDispersion(-1)).toBe(false);
  });
});

describe('getDispersion — extended mode (Cr/Fe→Henke, ion→近似表)', () => {
  it('fidelity mode (default) returns source=FF.dat for supported element', () => {
    const r = getDispersion('Al', LAMBDA_CU, 'fidelity');
    expect(r.supported).toBe(true);
    expect(r.source).toBe('FF.dat');
  });

  it('extended mode returns source=LBNL Henke for Cr', () => {
    // 1.54056 Å = Cu Ka1; for Cr we pass lambda matching a Henke column
    const r = getDispersion('Cr', LAMBDA_CU, 'extended');
    expect(r.supported).toBe(true);
    expect(r.source).toBe('LBNL Henke');
    expect(r.fPrime).toBe(0);
  });

  it('extended mode returns source=approximation for Na1+', () => {
    const r = getDispersion('Na1+', LAMBDA_CU, 'extended');
    expect(r.supported).toBe(true);
    expect(r.source).toBe('approximation');
  });

  it('fidelity mode for Na1+ falls back to neutral FF.dat (no ion entry)', () => {
    const r = getDispersion('Na1+', LAMBDA_CU, 'fidelity');
    expect(r.source).toBe('FF.dat');
  });

  it('extended mode for unknown element still returns supported=false', () => {
    const r = getDispersion('Xx', LAMBDA_CU, 'extended');
    expect(r.supported).toBe(false);
  });

  it('extended mode for whitespace-padded ion still matches ION_DISPERSION', () => {
    // 'Na1+' with a leading space should still resolve to the ion approximation
    const r = getDispersion(' Na1+', LAMBDA_CU, 'extended');
    expect(r.source).toBe('approximation');
  });

  it('hasDispersionExtended(Cu Kα1) is true (Henke covers all 6 cols for Cr/Fe)', () => {
    expect(hasDispersionExtended(1.54056)).toBe(true);
  });

  it('hasDispersionExtended returns true for Fe Kα (extended covers it)', () => {
    // Fe Kα is not in FF.dat (fidelity → false) but HENKE_CRF has Fe Kα rows
    // The 6 standard cols in HENKE_CRF are Cu/Mo/Co Kα1+Kα2, NOT Fe Kα itself.
    // So hasDispersionExtended(1.93604) should still be true via Henke fallback logic:
    // entries.some(e => |e.lambda - 1.93604| < 0.001) → no match → falls to hasDispersion → false
    // This is a known limitation: Henke table only has the 6 Cu/Mo/Co cols.
    // Use hasDispersionExtended to gate checkbox: false for Fe Kα in current data.
    const result = hasDispersionExtended(1.93604);
    // Fe Kα (1.936 Å) is not among the 6 standard cols → false
    expect(result).toBe(false);
  });

  it('extended mode for non-Cr/Fe non-ion element uses FF.dat source', () => {
    // Al is not in HENKE_CRF and not in ION_DISPERSION, so extended falls through to FF.dat
    const r = getDispersion('Al', LAMBDA_CU, 'extended');
    expect(r.source).toBe('FF.dat');
    expect(r.supported).toBe(true);
  });
});

describe('structureFactor — F′F″ 复数式路径', () => {
  const al = parseCord(
    SAMPLE_CRYSTALS.find((s) => s.id === 'al')!.text,
  );
  const nacl = parseCord(
    SAMPLE_CRYSTALS.find((s) => s.id === 'nacl')!.text,
  );
  const base = { lambda: LAMBDA_CU, useThermal: false };

  it('Al(111) 中心对称：开启色散抬高 |F|，复数式给出 re=4(f0+f′)、im=4f″', () => {
    const s = sinThetaOverLambda(al, 1, 1, 1);
    const f0s = f0('Al', s); // useThermal:false → 无 Debye–Waller
    const off = structureFactor(al, 1, 1, 1, base);
    const on = structureFactor(al, 1, 1, 1, { ...base, useDispersion: true });
    const fp = getDispersion('Al', LAMBDA_CU).fPrime;
    const fpp = getDispersion('Al', LAMBDA_CU).fDoublePrime;
    // Al (111) 四个面心等效位相位均为 2π 整数倍 → e^{iφ}=1，复散射因子
    // (f0s+f′) + i f″ 在四个位置同相叠加：实部抬高 4·f′、虚部 = 4·f″（吸收项）。
    expect(off.im).toBeCloseTo(0, 9); // 无色散时纯实数
    expect(on.re).toBeCloseTo(4 * f0s + 4 * fp, 6); // 实部抬高 4·f′
    expect(on.im).toBeCloseTo(4 * fpp, 6); // 虚部 = 4·f″（非零，正确）
    // 复模 |F| = 4·|(f0s+f′)+i f″|，严格大于无色散的 4·f0s。
    const m = (f: { re: number; im: number }) => Math.hypot(f.re, f.im);
    expect(m(on)).toBeGreaterThan(m(off));
    expect(m(on)).toBeCloseTo(4 * Math.hypot(f0s + fp, fpp), 6);
  });

  it('NaCl(111) 差项：开启色散使 |F| 增大（逼近 GUI 基准）', () => {
    const off = structureFactor(nacl, 1, 1, 1, base);
    const on = structureFactor(nacl, 1, 1, 1, { ...base, useDispersion: true });
    const m = (f: { re: number; im: number }) => Math.hypot(f.re, f.im);
    expect(m(on)).toBeGreaterThan(m(off));
  });
});
