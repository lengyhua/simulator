import { describe, expect, it } from 'vitest';

import {
  expandPositions,
  getSite,
  laueOperations,
  listSites,
  multiplicityOf,
  parseCoordinateExpression,
  spaceGroupKeys,
} from './wyckoff';
import { WYCKOFF_DATA } from './wyckoff_data';

describe('WYCKOFF_DATA — 数据表完整性', () => {
  it('包含全部 254 个空间群', () => {
    expect(Object.keys(WYCKOFF_DATA)).toHaveLength(254);
  });

  it('每个群的每个位 ops 数 = 声明 multiplicity（生成器规范化保证）', () => {
    for (const [key, group] of Object.entries(WYCKOFF_DATA)) {
      for (const site of group.sites) {
        expect(site.ops.length, `${key} site ${site.letter}`).toBe(site.mult);
      }
    }
  });

  it('225(Fm-3m) 位 a：mult=4、ops=4 条（面心位置）', () => {
    const site = getSite('225(Fm-3m)', 'a');
    expect(site).toBeDefined();
    expect(site?.mult).toBe(4);
    expect(site?.ops).toHaveLength(4);
    expect(site?.symm).toBe('m-3m');
  });

  it('221(Pm-3m) 位 b 位于中心 (½,½,½)', () => {
    const site = getSite('221(Pm-3m)', 'b');
    expect(site?.mult).toBe(1);
    expect(site?.ops).toEqual(['(1/2,1/2,1/2)']);
  });

  it('origin choice 重号以 WholeSG 全名为键互不覆盖', () => {
    expect(getSite('201(Pn-3)[origin choice 1]', 'a')).toBeDefined();
    expect(getSite('201(Pn-3)[origin choice 2]', 'a')).toBeDefined();
    // 不带后缀的键按 §8-10 约定回退到 origin choice 1
    expect(getSite('201(Pn-3)', 'a')?.ops).toEqual(
      getSite('201(Pn-3)[origin choice 1]', 'a')?.ops,
    );
  });
});

describe('expandPositions — 位置展开', () => {
  it("225(Fm-3m) 位 a 代入 (0,0,0) 返回 4 个面心位置", () => {
    const positions = expandPositions('225(Fm-3m)', 'a', 0, 0, 0);
    expect(positions).toHaveLength(4);
    expect(positions).toEqual([
      [0, 0, 0],
      [0, 0.5, 0.5],
      [0.5, 0, 0.5],
      [0.5, 0.5, 0],
    ]);
  });

  it("225(Fm-3m) 位 b 代入 (½,½,½) 返回另一组 4 个面心位置", () => {
    const positions = expandPositions('225(Fm-3m)', 'b', 0.5, 0.5, 0.5);
    expect(positions).toHaveLength(4);
    expect(positions).toEqual([
      [0, 0, 0.5],
      [0, 0.5, 0],
      [0.5, 0, 0],
      [0.5, 0.5, 0.5],
    ]);
  });

  it("225(Fm-3m) 位 l 一般位展开计数 = 192", () => {
    // 通用坐标避开特殊值，防止轨道坍缩
    const positions = expandPositions('225(Fm-3m)', 'l', 0.123, 0.234, 0.345);
    expect(positions).toHaveLength(192);
  });

  it("225(Fm-3m) 位 a 展开结果去重（ops×centers 冗余被消除）", () => {
    // ops 已含完整轨道（4 条），再乘 4 centers = 16 组合，去重后必须仍是 4
    const positions = expandPositions('225(Fm-3m)', 'a', 0, 0, 0);
    const keys = new Set(positions.map((p) => p.join(',')));
    expect(keys.size).toBe(4);
  });

  it('C 心群 5(C2) 位 c（一般位）展开 = 4，含中心平移', () => {
    const positions = expandPositions('5(C2)[unique axis b]', 'c', 0.1, 0.2, 0.3);
    expect(positions).toHaveLength(4);
    expect(positions).toContainEqual([0.1, 0.2, 0.3]);
    expect(positions).toContainEqual([0.6, 0.7, 0.3]); // + (1/2,1/2,0)
    expect(positions).toContainEqual([0.9, 0.2, 0.7]); // (-x,y,-z) → (-0.1,0.2,-0.3) ≡ (0.9,0.2,0.7)
  });

  it('六方群 176(P63/m) 位 e (0,0,z) 展开 = 4（取通用 z，避开特殊值）', () => {
    const positions = expandPositions('176(P63/m)', 'e', 0, 0, 0.3);
    expect(positions).toHaveLength(4);
    expect(positions).toContainEqual([0, 0, 0.3]);
    expect(positions).toContainEqual([0, 0, 0.2]); // -z+1/2
    expect(positions).toContainEqual([0, 0, 0.7]); // -z
    expect(positions).toContainEqual([0, 0, 0.8]); // z+1/2
  });

  it('未知空间群 / 未知 Wyckoff 位抛错', () => {
    expect(() => expandPositions('999(Xx-xx)', 'a', 0, 0, 0)).toThrow(/未知空间群/);
    expect(() => expandPositions('225(Fm-3m)', 'z', 0, 0, 0)).toThrow(/无 Wyckoff 位/);
  });
});

describe('multiplicityOf / laueOperations', () => {
  it('spaceGroupKeys 返回全部群键（254 群，排序稳定）', () => {
    const keys = spaceGroupKeys();
    expect(keys.length).toBeGreaterThanOrEqual(254);
    expect(keys).toContain('225(Fm-3m)');
    expect(keys).toContain('221(Pm-3m)');
    expect(keys).toContain('1(P1)');
    // Sorted (stable rendering for UI dropdowns).
    expect([...keys].sort()).toEqual(keys);
  });

  it('listSites 返回该群的 Wyckoff 位（UI 下拉用）', () => {
    const sites = listSites('225(Fm-3m)');
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.map((s) => s.letter)).toContain('a');
    // 4a of Fm-3m: multiplicity 4, one coordinate expression.
    const siteA = sites.find((s) => s.letter === 'a');
    expect(siteA?.mult).toBe(4);
    expect(siteA?.ops.length).toBeGreaterThan(0);
    // Unknown group → empty list (the UI renders an empty picker, no throw).
    expect(listSites('999(Xx-1)')).toEqual([]);
  });
  it('multiplicityOf 返回声明多重性', () => {
    expect(multiplicityOf('225(Fm-3m)', 'a')).toBe(4);
    expect(multiplicityOf('225(Fm-3m)', 'l')).toBe(192);
    expect(multiplicityOf('221(Pm-3m)', 'n')).toBe(48);
    expect(multiplicityOf('1(P1)', 'a')).toBe(1);
  });

  it("laueOperations('225(Fm-3m)') 导出 48 个旋转矩阵（m-3m 阶）", () => {
    const matrices = laueOperations('225(Fm-3m)');
    expect(matrices).toHaveLength(48);
    // 每个矩阵为扁平行主序 9 元素；单位矩阵在内
    expect(matrices.some((m) => m[0] === 1 && m[4] === 1 && m[8] === 1)).toBe(true);
    // 每行是 3×3 置换符号矩阵（每行恰一个 ±1）
    for (const matrix of matrices) {
      expect(matrix).toHaveLength(9);
      for (let row = 0; row < 3; row += 1) {
        const base = row * 3;
        expect(Math.abs(matrix[base]) + Math.abs(matrix[base + 1]) + Math.abs(matrix[base + 2])).toBe(1);
      }
    }
  });

  it('laueOperations 阶数与点群一致：P1 → 1，P-1 → 2，P63/m → 12，Pm-3m → 48', () => {
    expect(laueOperations('1(P1)')).toHaveLength(1);
    expect(laueOperations('2(P-1)')).toHaveLength(2);
    expect(laueOperations('176(P63/m)')).toHaveLength(12); // 点群 6/m
    expect(laueOperations('221(Pm-3m)')).toHaveLength(48);
  });
});

describe('parseCoordinateExpression — 坐标表达式解析', () => {
  it('解析一般形式 (x,y,z)', () => {
    const { rot, trans } = parseCoordinateExpression('(x,y,z)');
    expect(rot).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(trans).toEqual([0, 0, 0]);
  });

  it('解析六方形式 (-y,x-y,z+1/3)', () => {
    const { rot, trans } = parseCoordinateExpression('(-y,x-y,z+1/3)');
    expect(rot).toEqual([
      [0, -1, 0],
      [1, -1, 0],
      [0, 0, 1],
    ]);
    expect(trans[2]).toBeCloseTo(1 / 3, 12);
  });

  it('解析纯数值位与含平移形式', () => {
    expect(parseCoordinateExpression('(1/2,1/2,1/2)').trans).toEqual([0.5, 0.5, 0.5]);
    expect(parseCoordinateExpression('(x+1/2,-y+1/2,z)').rot).toEqual([
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ]);
    expect(parseCoordinateExpression('(x+1/2,-y+1/2,z)').trans).toEqual([0.5, 0.5, 0]);
    // 中心平移（带后缀 +）
    expect(parseCoordinateExpression('(0,1/2,1/2)+').trans).toEqual([0, 0.5, 0.5]);
  });

  it('畸形表达式抛错', () => {
    expect(() => parseCoordinateExpression('(x,y)')).toThrow(/3 个分量/);
    expect(() => parseCoordinateExpression('x,y,z')).toThrow();
  });
});
