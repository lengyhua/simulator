import { describe, expect, it } from 'vitest';

import { CordParseError, formatCordNumber, parseCord, serializeCord } from './crystal';
import { SAMPLE_CRYSTALS } from '@/data/samples';

const sampleText = (id: string): string => {
  const sample = SAMPLE_CRYSTALS.find((s) => s.id === id);
  if (!sample) {
    throw new Error(`sample ${id} not found`);
  }
  return sample.text;
};

describe('parseCord — 预置样品', () => {
  it('解析 Al.cord：Cubic / 225(Fm-3m) / a=4.0339 / 1 原子 Wyckoff a', () => {
    const c = parseCord(sampleText('al'));
    expect(c.name).toBe('Al');
    expect(c.system).toBe('Cubic');
    expect(c.sgNumber).toBe(225);
    expect(c.sgSymbol).toBe('Fm-3m');
    expect(c.sgKey).toBe('225(Fm-3m)');
    expect(c.a).toBe(4.0339);
    expect(c.b).toBe(4.0339);
    expect(c.c).toBe(4.0339);
    expect(c.alpha).toBe(90);
    expect(c.beta).toBe(90);
    expect(c.gamma).toBe(90);
    expect(c.atoms).toHaveLength(1);
    expect(c.atoms[0]).toEqual({
      element: 'Al',
      wyckoff: 'a',
      x: 0,
      y: 0,
      z: 0,
      occupancy: 1,
      thermalB: 1,
    });
  });

  it('解析 NaCl.cord：2 原子 Na1+ @ a(0,0,0) / Cl1- @ b(½,½,½)，离子价符号原样保留', () => {
    const c = parseCord(sampleText('nacl'));
    expect(c.sgKey).toBe('225(Fm-3m)');
    expect(c.a).toBe(5.62);
    expect(c.atoms).toHaveLength(2);
    expect(c.atoms[0].element).toBe('Na1+');
    expect(c.atoms[0].wyckoff).toBe('a');
    expect(c.atoms[1].element).toBe('Cl1-');
    expect(c.atoms[1].wyckoff).toBe('b');
    expect([c.atoms[1].x, c.atoms[1].y, c.atoms[1].z]).toEqual([0.5, 0.5, 0.5]);
  });

  it('解析 BaTiO3.cord：3 原子 Ba2+/Ti4+/O2-，sgKey=221(Pm-3m)', () => {
    const c = parseCord(sampleText('batio3'));
    expect(c.name).toBe('BaTiO3');
    expect(c.sgKey).toBe('221(Pm-3m)');
    expect(c.a).toBe(4.0073);
    expect(c.atoms.map((atom) => atom.element)).toEqual(['Ba2+', 'Ti4+', 'O2-']);
    expect(c.atoms.map((atom) => atom.wyckoff)).toEqual(['a', 'b', 'c']);
    expect([c.atoms[2].x, c.atoms[2].y, c.atoms[2].z]).toEqual([0, 0.5, 0.5]);
  });

  it('解析 Po.cord：a=3.345，sgKey=221(Pm-3m)', () => {
    const c = parseCord(sampleText('po'));
    expect(c.name).toBe('Po');
    expect(c.sgKey).toBe('221(Pm-3m)');
    expect(c.a).toBe(3.345);
    expect(c.atoms).toHaveLength(1);
  });
});

describe('parseCord — 畸形输入', () => {
  it('文件截断（缺行）抛 CordParseError 且带行号', () => {
    const text = ['Al', 'Cubic', '225(Fm-3m)', '4.0339 4.0339 4.0339', '90 90 90', '1'].join('\n');
    try {
      parseCord(text);
      throw new Error('应当抛出 CordParseError');
    } catch (err) {
      expect(err).toBeInstanceOf(CordParseError);
      expect((err as CordParseError).line).toBe(7); // 缺少第 7 行（element symbol）
    }
  });

  it('非数值字段抛 CordParseError 且带行号', () => {
    const text = [
      'Al',
      'Cubic',
      '225(Fm-3m)',
      '4.0339 4.0339 abc', // 第 4 行
      '90 90 90',
      '1',
      'Al',
      'a',
      '0',
      '0',
      '0',
      '1',
      '1',
    ].join('\n');
    try {
      parseCord(text);
      throw new Error('应当抛出 CordParseError');
    } catch (err) {
      expect(err).toBeInstanceOf(CordParseError);
      expect((err as CordParseError).line).toBe(4);
    }
  });

  it('原子数为 0 抛 CordParseError 且带行号', () => {
    const text = ['Al', 'Cubic', '225(Fm-3m)', '4.0339 4.0339 4.0339', '90 90 90', '0'].join('\n');
    try {
      parseCord(text);
      throw new Error('应当抛出 CordParseError');
    } catch (err) {
      expect(err).toBeInstanceOf(CordParseError);
      expect((err as CordParseError).line).toBe(6);
    }
  });

  it('空间群行格式错误抛 CordParseError', () => {
    const text = ['Al', 'Cubic', 'Fm-3m', '4.0339 4.0339 4.0339', '90 90 90', '1'].join('\n');
    expect(() => parseCord(text)).toThrow(CordParseError);
  });

  it('occupancy 超出 [0,1] 抛 CordParseError', () => {
    const text = [
      'Al', 'Cubic', '225(Fm-3m)', '4.0339 4.0339 4.0339', '90 90 90', '1',
      'Al', 'a', '0', '0', '0', '1.5', '1',
    ].join('\n');
    expect(() => parseCord(text)).toThrow(CordParseError);
  });
});

describe('serializeCord — round-trip', () => {
  it('四个预置样品 parse→serialize→parse 语义等价', () => {
    for (const sample of SAMPLE_CRYSTALS) {
      const first = parseCord(sample.text);
      const reserialized = serializeCord(first);
      const second = parseCord(reserialized);
      expect(second).toEqual(first);
    }
  });

  it('序列化输出保持 .cord 逐行字段布局（原子块 7 行）', () => {
    const crystal = parseCord(sampleText('nacl'));
    const text = serializeCord(crystal);
    const lines = text.split('\r\n');
    // 6 行头部 + 2 原子 × 7 行 + 结尾空段（trailing CRLF 产生）
    expect(lines).toHaveLength(6 + 14 + 1);
    expect(lines[0]).toBe('NaCl');
    expect(lines[2]).toBe('225(Fm-3m)');
    expect(lines[6]).toBe('Na1+');
    expect(lines[7]).toBe('a');
    expect(lines[13]).toBe('Cl1-');
  });

  it('formatCordNumber 复刻原程序 Fortran 风格数值', () => {
    expect(formatCordNumber(4.0339)).toBe(' 4.03390000000000E+0000');
    expect(formatCordNumber(90)).toBe(' 9.00000000000000E+0001');
    expect(formatCordNumber(0)).toBe(' 0.00000000000000E+0000');
    expect(formatCordNumber(0.5)).toBe(' 5.00000000000000E-0001');
    expect(formatCordNumber(-2.25)).toBe('-2.25000000000000E+0000');
  });

  it('序列化结果可被重新解析（含 Fortran 与纯小数两种书写）', () => {
    const crystal = parseCord(sampleText('al'));
    const text = serializeCord(crystal);
    expect(text).toContain(' 4.03390000000000E+0000 4.03390000000000E+0000 4.03390000000000E+0000');
    const reparsed = parseCord(text);
    expect(reparsed.a).toBe(4.0339);
    expect(reparsed.atoms[0].x).toBe(0);
  });
});
