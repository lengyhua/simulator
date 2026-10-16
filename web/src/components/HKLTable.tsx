import { useMemo, useState } from 'react';

import type { HKLReflection } from '@/lib/xrd/types';
import { useCrystalStore } from '@/store/crystal-store';

/** Sortable columns of the hkl table. */
type SortKey = 'hkl' | 'd' | 'twoTheta' | 'intensity' | 'intensityNorm1000' | 'multiplicity';

/** Formats hkl as `(h k l)` for display and sorting key. */
function hklLabel(reflection: HKLReflection): string {
  return `(${reflection.h} ${reflection.k} ${reflection.l})`;
}

/** Legacy List-table relative intensity: strongest peak = 1000 (see header doc). */
function intensityIo(reflection: HKLReflection): number {
  return (reflection.intensityNorm / 100) * 1000;
}

/** Sort comparator: hkl sorts by the tuple, numerics by value. */
function compare(a: HKLReflection, b: HKLReflection, key: SortKey): number {
  switch (key) {
    case 'hkl':
      return a.h - b.h || a.k - b.k || a.l - b.l;
    case 'd':
      return a.d - b.d;
    case 'twoTheta':
      return a.twoTheta - b.twoTheta;
    case 'intensity':
      return a.intensity - b.intensity;
    case 'intensityNorm1000':
      return intensityIo(a) - intensityIo(b);
    case 'multiplicity':
      return a.multiplicity - b.multiplicity;
    default:
      return 0;
  }
}

/**
 * Discrete hkl table (plan §5-T12): 2θ / d / I / I·Io⁻¹ / multiplicity /
 * hkl per reflection, click-to-sort, matching the legacy program's "List"
 * table column layout (verified against the original CalcXRD.exe List
 * output `2θ d Intensity I/Io hkl`, 2026-10-16):
 *
 * - `I`     — raw reflection intensity I_hkl (K·Lp·|F|²·mult, K=1),
 *             same value the legacy program writes to the `.xrd` file's
 *             peak grid points (ref: `ref-temp/Al.xrd`).
 * - `I/Io`  — relative intensity with the strongest peak normalized to
 *             **1000** (the legacy List table's convention, e.g. Al:
 *             1000/470/266/283/80/37), as opposed to `intensityNorm`'s
 *             max-100 convention kept for the plot/curve layers.
 *
 * Empty and error states get explicit placeholders (the page-level error
 * banner carries the detail); the curve stays authoritative for the
 * continuous profile. The optional row↔curve highlight of the plan is not
 * wired in this task — see the T13 integration notes.
 */
export function HKLTable() {
  const pattern = useCrystalStore((state) => state.pattern);
  const error = useCrystalStore((state) => state.error);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'twoTheta',
    dir: 'asc',
  });

  const rows = useMemo(() => {
    if (!pattern) {
      return [];
    }
    const sorted = [...pattern.reflections].sort((a, b) => compare(a, b, sort.key));
    return sort.dir === 'asc' ? sorted : sorted.reverse();
  }, [pattern, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  };

  const arrow = (key: SortKey): string =>
    sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  const header = (key: SortKey, label: string, title: string) => (
    <th
      className="sortable-th"
      onClick={() => toggleSort(key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleSort(key);
        }
      }}
      tabIndex={0}
      role="button"
      title={title}
    >
      {label}
      {arrow(key)}
    </th>
  );

  return (
    <section className="module-panel">
      <div className="atom-table-head">
        <p className="section-label">
          hkl 数据表{pattern ? `（${pattern.reflections.length} 个衍射峰）` : ''}
        </p>
      </div>
      {!pattern ? (
        <div className="chart-placeholder table-placeholder" role="status">
          {error ? (
            <>
              <p className="text-dim">计算失败，衍射峰表不可用。</p>
              <p className="text-faint">请根据上方错误提示调整后重试。</p>
            </>
          ) : (
            <>
              <p className="text-dim">尚无计算结果。</p>
              <p className="text-faint">计算完成后显示离散衍射峰列表。</p>
            </>
          )}
        </div>
      ) : (
        <div className="atom-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {header('twoTheta', '2θ (°)', '按衍射角排序')}
                {header('d', 'd (Å)', '按晶面间距排序')}
                {header('hkl', 'hkl', '按 hkl 排序')}
                {header('intensity', 'I', '按原始强度排序')}
                {header('intensityNorm1000', 'I/Io', '按相对强度（满刻度 1000）排序')}
                {header('multiplicity', 'mult', '按多重性排序')}
              </tr>
            </thead>
            <tbody>
              {rows.map((reflection) => (
                <tr key={`${reflection.h}-${reflection.k}-${reflection.l}`}>
                  <td className="mono">{reflection.twoTheta.toFixed(2)}</td>
                  <td className="mono">{reflection.d.toFixed(4)}</td>
                  <td className="mono">{hklLabel(reflection)}</td>
                  <td className="mono">{Math.round(reflection.intensity)}</td>
                  <td className="mono">{Math.round(intensityIo(reflection))}</td>
                  <td className="mono">{reflection.multiplicity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
