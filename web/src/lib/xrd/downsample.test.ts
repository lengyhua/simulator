import { describe, expect, it } from 'vitest';

import { downsamplePattern } from './downsample';

describe('downsample — 图谱降采样（T11）', () => {
  it('点数不超过上限时原样返回（深相等）', () => {
    const twoTheta = [3, 4, 5];
    const intensity = [0, 10, 0];
    expect(downsamplePattern(twoTheta, intensity, 2000)).toEqual([
      { twoTheta: 3, intensity: 0 },
      { twoTheta: 4, intensity: 10 },
      { twoTheta: 5, intensity: 0 },
    ]);
  });

  it('降采样后点数恰为 maxPoints', () => {
    const n = 9701;
    const twoTheta = Array.from({ length: n }, (_, i) => 3 + i * 0.01);
    const intensity = Array.from({ length: n }, (_, i) => (i === 3563 ? 100 : 1));
    const points = downsamplePattern(twoTheta, intensity, 2000);
    expect(points).toHaveLength(2000);
  });

  it('峰高精确保留：每桶取最大强度点', () => {
    // 一个位于 index 5000 的尖峰（强度 100），2000 桶、10000 点。
    const n = 10000;
    const twoTheta = Array.from({ length: n }, (_, i) => i);
    const intensity = Array.from({ length: n }, (_, i) => (i === 5000 ? 100 : 1));
    const points = downsamplePattern(twoTheta, intensity, 2000);
    expect(Math.max(...points.map((p) => p.intensity))).toBe(100);
    const peak = points.find((p) => p.intensity === 100);
    expect(peak?.twoTheta).toBe(5000); // 峰顶角度不失真
  });

  it('桶连续不重叠：输出角度单调不减', () => {
    const n = 5000;
    const twoTheta = Array.from({ length: n }, (_, i) => 3 + i * 0.02);
    const intensity = Array.from({ length: n }, (_, i) => Math.sin(i / 50) * 50 + 50);
    const points = downsamplePattern(twoTheta, intensity, 500);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].twoTheta).toBeGreaterThanOrEqual(points[i - 1].twoTheta);
    }
  });

  it('空输入返回空数组', () => {
    expect(downsamplePattern([], [], 2000)).toEqual([]);
  });

  it('长度不一致时取较短者', () => {
    expect(downsamplePattern([1, 2, 3], [7, 8], 2000)).toEqual([
      { twoTheta: 1, intensity: 7 },
      { twoTheta: 2, intensity: 8 },
    ]);
  });

  it('maxPoints=1 时返回全局最大点', () => {
    const twoTheta = [0, 1, 2];
    const intensity = [3, 9, 5];
    expect(downsamplePattern(twoTheta, intensity, 1)).toEqual([{ twoTheta: 1, intensity: 9 }]);
  });
});
