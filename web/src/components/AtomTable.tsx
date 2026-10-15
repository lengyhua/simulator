import { useCallback, useEffect, useState } from 'react';

import { syncDrafts } from '@/lib/draft-sync';
import { useCrystalStore } from '@/store/crystal-store';
import type { Atom } from '@/lib/xrd/types';

/** Numeric atom fields rendered as `type="number"` inputs. */
const ATOM_NUMBER_FIELDS: ReadonlyArray<keyof Atom> = ['x', 'y', 'z', 'occupancy', 'thermalB'];

/** All editable atom fields (draft bookkeeping order). */
const ATOM_FIELDS: ReadonlyArray<keyof Atom> = [
  'element',
  'wyckoff',
  ...ATOM_NUMBER_FIELDS,
];

/** Draft key for one cell: `rowIndex:field`. */
type CellKey = string;

/**
 * Atom table editor (plan §5-T09): one row per atom with element / Wyckoff
 * letter / fractional coordinates / occupancy / thermal factor B, plus add
 * and remove actions — all bound to the crystal store. B is per atom (the
 * .cord 7th field, the legacy program's "B" column, default 1).
 *
 * Validation lives in the store (`updateAtom` merges and checks the atom);
 * the component only guards against intermediate numeric drafts reaching the
 * store. Removing the last atom is disabled because the .cord format requires
 * AtomCount ≥ 1 (the store enforces the same invariant).
 */
export function AtomTable() {
  const crystal = useCrystalStore((state) => state.crystal);
  const updateAtom = useCrystalStore((state) => state.updateAtom);
  const addAtom = useCrystalStore((state) => state.addAtom);
  const removeAtom = useCrystalStore((state) => state.removeAtom);
  const [drafts, setDrafts] = useState<Partial<Record<CellKey, string>>>({});

  // Value-based draft sync per row (see draft-sync.ts): a cell draft survives
  // while it agrees with the store value (mid-typing `"0."`) and is dropped
  // when the row changed underneath (upload / edit elsewhere / reset). Drafts
  // of removed rows fall away naturally because rows are rebuilt by index.
  useEffect(() => {
    if (!crystal) {
      setDrafts({});
      return;
    }
    setDrafts((prev) => {
      const next: Partial<Record<string, string>> = {};
      for (let index = 0; index < crystal.atoms.length; index += 1) {
        const rowDrafts: Record<string, string> = {};
        for (const field of ATOM_FIELDS) {
          const draft = prev[`${index}:${field}`];
          if (draft !== undefined) {
            rowDrafts[field] = draft;
          }
        }
        const pruned = syncDrafts(
          rowDrafts,
          crystal.atoms[index] as unknown as Record<string, unknown>,
        );
        for (const [field, draft] of Object.entries(pruned ?? rowDrafts)) {
          next[`${index}:${field}`] = draft;
        }
      }
      return next;
    });
  }, [crystal]);

  const handleNumberCell = useCallback(
    (index: number, field: keyof Atom, raw: string) => {
      const key: CellKey = `${index}:${field}`;
      setDrafts((prev) => ({ ...prev, [key]: raw }));
      const parsed = raw.trim() === '' ? 0 : Number(raw);
      if (!Number.isFinite(parsed)) {
        return; // Intermediate state: keep the draft, leave the store intact.
      }
      updateAtom(index, { [field]: parsed } as Partial<Atom>);
    },
    [updateAtom],
  );

  const handleTextCell = useCallback(
    (index: number, field: keyof Atom, raw: string) => {
      const key: CellKey = `${index}:${field}`;
      setDrafts((prev) => ({ ...prev, [key]: raw }));
      updateAtom(index, { [field]: raw } as Partial<Atom>);
    },
    [updateAtom],
  );

  if (!crystal) {
    return (
      <section className="module-panel">
        <p className="section-label">原子列表</p>
        <p className="text-dim">加载晶体结构后在此编辑原子。</p>
      </section>
    );
  }

  const cellValue = (index: number, field: keyof Atom): string =>
    drafts[`${index}:${field}`] ?? String(crystal.atoms[index][field]);

  return (
    <section className="module-panel">
      <div className="atom-table-head">
        <p className="section-label">原子列表（{crystal.atoms.length} 个）</p>
        <button type="button" className="btn" onClick={addAtom}>
          + 添加原子
        </button>
      </div>
      <div className="atom-table-scroll">
        <table className="data-table atom-table">
          <thead>
            <tr>
              <th>#</th>
              <th>元素</th>
              <th>Wyckoff</th>
              <th>x</th>
              <th>y</th>
              <th>z</th>
              <th>占位度</th>
              <th>B (Å²)</th>
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {crystal.atoms.map((_atom, index) => (
              <tr key={index}>
                <td className="mono">{index + 1}</td>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    aria-label={`第 ${index + 1} 个原子的元素符号`}
                    value={cellValue(index, 'element')}
                    onChange={(event) => handleTextCell(index, 'element', event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="cell-input cell-input-narrow"
                    aria-label={`第 ${index + 1} 个原子的 Wyckoff 位`}
                    value={cellValue(index, 'wyckoff')}
                    onChange={(event) => handleTextCell(index, 'wyckoff', event.target.value)}
                  />
                </td>
                {ATOM_NUMBER_FIELDS.map((field) => (
                  <td key={field}>
                    <input
                      type="number"
                      step="any"
                      className="cell-input"
                      aria-label={`第 ${index + 1} 个原子的 ${field}`}
                      value={cellValue(index, field)}
                      onChange={(event) => handleNumberCell(index, field, event.target.value)}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="btn btn-danger-cell"
                    title={crystal.atoms.length <= 1 ? '至少需要保留 1 个原子' : '删除该原子'}
                    disabled={crystal.atoms.length <= 1}
                    onClick={() => removeAtom(index)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
