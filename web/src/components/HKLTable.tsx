import { useMemo, useState } from 'react';

import {
  groupReflectionsByAngle,
  reportHklCell,
  reportHklFull,
  type PowderReportRow,
} from '@/lib/xrd/powder_report';
import { useCrystalStore } from '@/store/crystal-store';

/** Sortable columns of the hkl table. */
type SortKey = 'hkl' | 'd' | 'twoTheta' | 'intensity' | 'intensityIo' | 'multiplicity';

/** Representative hkl of a row (its first family) — the sort key for `hkl`. */
function rowHkl(row: PowderReportRow): { h: number; k: number; l: number } {
  const first = row.families[0];
  return first ? { h: first.h, k: first.k, l: first.l } : { h: 0, k: 0, l: 0 };
}

/** Sort comparator: hkl sorts by the tuple, numerics by value. */
function compare(a: PowderReportRow, b: PowderReportRow, key: SortKey): number {
  const ah = rowHkl(a);
  const bh = rowHkl(b);
  switch (key) {
    case 'hkl':
      return ah.h - bh.h || ah.k - bh.k || ah.l - bh.l;
    case 'd':
      return a.d - b.d;
    case 'twoTheta':
      return a.twoTheta - b.twoTheta;
    case 'intensity':
      return a.intensity - b.intensity;
    case 'intensityIo':
      return a.intensityIo - b.intensityIo;
    case 'multiplicity':
      return a.multiplicity - b.multiplicity;
    default:
      return 0;
  }
}

/**
 * Discrete hkl table (plan §5-T12): 2θ / d / I / I·Io⁻¹ / multiplicity /
 * hkl per **report row**, click-to-sort, matching the legacy program's "List"
 * table column layout (verified against the original CalcXRD.exe List
 * output `2θ d Intensity I/Io hkl`, 2026-10-16):
 *
 * - `I`     — raw reflection intensity I_hkl (K·Lp·|F|²·mult, K=1),
 *             same value the legacy program writes to the `.xrd` file's
 *             peak grid points (ref: `samples/Al.xrd`).
 * - `I/Io`  — relative intensity with the strongest peak normalized to
 *             **1000** (the legacy List table's convention, e.g. Al:
 *             1000/470/266/283/80/37), as opposed to `intensityNorm`'s
 *             max-100 convention kept for the plot/curve layers.
 *
 * **Rows are grouped by d, exactly like the legacy report** (2026-10-20,
 * `NaCl.RTF` 定案): reflections that share a 2θ — e.g. NaCl `{333}` (mult 8)
 * and `{511}` (mult 24), both N = 27 — print as ONE legacy row whose `I` is
 * the sum (2331 + 6994 = 9325) and whose hkl column lists all 32 members.
 * See {@link groupReflectionsByAngle}. Without this, NaCl showed 11 rows
 * against the legacy 10 while every number still matched.
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
    const grouped = groupReflectionsByAngle(pattern.reflections);
    const sorted = [...grouped].sort((a, b) => compare(a, b, sort.key));
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
          hkl 数据表{pattern ? `（${rows.length} 个衍射峰，${pattern.reflections.length} 个反射）` : ''}
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
                {header('hkl', 'hkl', '按 hkl 排序（同角度多族合并为一行，悬停看全部反射）')}
                {header('intensity', 'I', '按原始强度排序')}
                {header('intensityIo', 'I/Io', '按相对强度（满刻度 1000）排序')}
                {header('multiplicity', 'mult', '按多重性排序')}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.twoTheta.toFixed(4)}>
                  <td className="mono">{row.twoTheta.toFixed(2)}</td>
                  <td className="mono">{row.d.toFixed(4)}</td>
                  <td className="mono" title={reportHklFull(row)}>
                    {reportHklCell(row)}
                  </td>
                  <td className="mono">{Math.round(row.intensity)}</td>
                  <td className="mono">{Math.round(row.intensityIo)}</td>
                  <td className="mono">{row.multiplicity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
