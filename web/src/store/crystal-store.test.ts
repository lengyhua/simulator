import { beforeEach, describe, expect, it } from 'vitest';

import { SAMPLE_CRYSTALS } from '@/data/samples';
import { useCrystalStore } from './crystal-store';
import { createDefaultParams } from '@/lib/xrd/constants';

const sampleText = (id: string): string => {
  const sample = SAMPLE_CRYSTALS.find((s) => s.id === id);
  if (!sample) {
    throw new Error(`sample ${id} not found`);
  }
  return sample.text;
};

const store = () => useCrystalStore.getState();

beforeEach(() => {
  store().reset();
});

describe('crystal-store — 初始状态与默认参数（T08）', () => {
  it('初始为空的 crystal/pattern/error，params 取 constants.ts 默认值', () => {
    expect(store().crystal).toBeNull();
    expect(store().pattern).toBeNull();
    expect(store().error).toBeNull();
    expect(store().params).toEqual(createDefaultParams());
  });
});

describe('loadCordText — 成功/失败两路', () => {
  it('成功：解析 Al 并写入 crystal，清 error，pattern 待 compute', () => {
    store().loadCordText(sampleText('al'));
    expect(store().error).toBeNull();
    expect(store().crystal?.name).toBe('Al');
    expect(store().crystal?.sgKey).toBe('225(Fm-3m)');
    expect(store().crystal?.atoms).toHaveLength(1);
    // 显式计算模型：加载不自动产出 pattern。
    expect(store().pattern).toBeNull();
  });

  it('失败：畸形输入置带行号的 error，且不污染已成功的结果', () => {
    store().loadCordText(sampleText('al'));
    store().compute();
    const goodPattern = store().pattern;
    expect(goodPattern).not.toBeNull();

    store().loadCordText('Bad\nCubic\nnot-a-space-group\n');
    expect(store().error).toContain('第 3 行');
    // 上一次成功结果保持（行为确定：不清空）。
    expect(store().crystal?.name).toBe('Al');
    expect(store().pattern).toBe(goodPattern);
  });

  it('失败（无历史结果）：error 非空，crystal/pattern 保持为空', () => {
    store().loadCordText('');
    expect(store().error).not.toBeNull();
    expect(store().crystal).toBeNull();
    expect(store().pattern).toBeNull();
  });
});

describe('setCrystal / updateAtom / addAtom / removeAtom', () => {
  it('setCrystal 写入晶体并使 pattern 失效', () => {
    store().loadCordText(sampleText('al'));
    store().compute();
    expect(store().pattern).not.toBeNull();
    store().setCrystal({ ...store().crystal!, name: 'Al2' });
    expect(store().crystal?.name).toBe('Al2');
    expect(store().error).toBeNull();
    expect(store().pattern).toBeNull();
  });

  it('updateAtom 成功：改坐标并失效 pattern', () => {
    store().loadCordText(sampleText('al'));
    store().updateAtom(0, { x: 0.1 });
    expect(store().crystal?.atoms[0].x).toBe(0.1);
    expect(store().error).toBeNull();
    expect(store().pattern).toBeNull();
  });

  it('updateAtom 失败：索引越界 / 非有限坐标 / occupancy 越界', () => {
    store().loadCordText(sampleText('al'));
    store().updateAtom(5, { x: 0 });
    expect(store().error).toContain('越界');
    store().updateAtom(0, { x: Number.NaN });
    expect(store().error).toContain('有限数值');
    store().updateAtom(0, { occupancy: 1.5 });
    expect(store().error).toContain('[0,1]');
    // 失败的补丁不修改晶体。
    expect(store().crystal?.atoms[0].x).toBe(0);
    expect(store().crystal?.atoms[0].occupancy).toBe(1);
  });

  it('updateAtom 无晶体时报错', () => {
    store().updateAtom(0, { x: 0.1 });
    expect(store().error).not.toBeNull();
  });

  it('addAtom/removeAtom：增删行并维护 ≥1 原子不变式', () => {
    store().loadCordText(sampleText('al'));
    store().addAtom();
    expect(store().crystal?.atoms).toHaveLength(2);
    expect(store().crystal?.atoms[1]).toEqual({
      element: '',
      wyckoff: 'a',
      x: 0,
      y: 0,
      z: 0,
      occupancy: 1,
      thermalB: 1,
    });
    store().removeAtom(1);
    expect(store().crystal?.atoms).toHaveLength(1);
    // 最后一个原子不可删除。
    store().removeAtom(0);
    expect(store().error).toContain('至少需要保留 1 个原子');
    expect(store().crystal?.atoms).toHaveLength(1);
  });

  it('addAtom/removeAtom 无晶体或索引越界时报错', () => {
    store().addAtom();
    expect(store().error).not.toBeNull();
    store().loadCordText(sampleText('al'));
    store().removeAtom(9);
    expect(store().error).toContain('越界');
  });
});

describe('setParams 与 compute（T08 验收 2）', () => {
  it('参数变更后 compute 重算且 pattern.meta 反映新 λ/q', () => {
    store().loadCordText(sampleText('al'));
    store().compute();
    expect(store().pattern?.meta.lambda).toBe(1.54056);

    store().setParams({ lambda: 0.7093, q: 0.3 });
    // 参数变更使旧 pattern 失效。
    expect(store().pattern).toBeNull();
    store().compute();
    expect(store().pattern?.meta.lambda).toBe(0.7093);
    expect(store().pattern?.meta.q).toBe(0.3);
    // 峰位随 Bragg 定律左移。
    const r111 = store().pattern?.reflections.find((r) => r.h === 1 && r.k === 1 && r.l === 1);
    expect(r111?.twoTheta).toBeCloseTo(17.52, 1);
  });

  it('setParams 合并语义：未提供的字段保持原值', () => {
    store().setParams({ q: 0.4 });
    expect(store().params.q).toBe(0.4);
    expect(store().params.lambda).toBe(1.54056);
    expect(store().params.rangeMax).toBe(100);
  });
});

describe('compute — Al 全流程与错误路径', () => {
  it('Al 全流程：产出 9701 点 pattern 与 6 条 FCC 峰', () => {
    store().loadCordText(sampleText('al'));
    store().compute();
    const pattern = store().pattern;
    expect(pattern).not.toBeNull();
    expect(pattern?.twoTheta).toHaveLength(9701);
    expect(pattern?.reflections).toHaveLength(6);
    expect(store().error).toBeNull();
    const strongest = pattern?.reflections.reduce((a, b) => (a.intensity > b.intensity ? a : b));
    expect([strongest?.h, strongest?.k, strongest?.l]).toEqual([1, 1, 1]);
    expect(strongest?.intensityNorm).toBe(100);
  });

  it('无晶体时 compute 报错且不产出 pattern', () => {
    store().compute();
    expect(store().error).not.toBeNull();
    expect(store().pattern).toBeNull();
  });

  it('计算失败（未知物种）：error 非空且 pattern 被清空', () => {
    store().loadCordText(sampleText('al'));
    store().compute();
    expect(store().pattern).not.toBeNull();
    store().updateAtom(0, { element: 'Xx' });
    store().compute();
    expect(store().error).toContain('未知物种');
    expect(store().pattern).toBeNull();
  });

  it('计算失败（非法参数）：error 非空', () => {
    store().loadCordText(sampleText('al'));
    store().setParams({ lambda: -1 });
    store().compute();
    expect(store().error).toContain('计算失败');
    expect(store().pattern).toBeNull();
  });
});

describe('reset', () => {
  it('恢复到初始状态（默认参数来自 constants.ts）', () => {
    store().loadCordText(sampleText('nacl'));
    store().compute();
    store().reset();
    expect(store().crystal).toBeNull();
    expect(store().pattern).toBeNull();
    expect(store().error).toBeNull();
    expect(store().params).toEqual(createDefaultParams());
  });
});
