import { useCallback, useEffect, useState } from 'react';

import { syncDrafts } from '@/lib/draft-sync';
import { useCrystalStore } from '@/store/crystal-store';
import type { Crystal } from '@/lib/xrd/types';

/** Editable scalar fields of the crystal header. */
type CrystalField = 'name' | 'system' | 'sgNumber' | 'sgSymbol' | 'a' | 'b' | 'c' | 'alpha' | 'beta' | 'gamma';

/** Numeric header fields (rendered as `type="number"`). */
const NUMBER_FIELDS: ReadonlySet<CrystalField> = new Set<CrystalField>([
  'sgNumber',
  'a',
  'b',
  'c',
  'alpha',
  'beta',
  'gamma',
]);

/**
 * Crystal header editor (plan §5-T09): Name / System / SpaceGroup / lattice
 * parameters, all bound to the crystal store via `setCrystal`.
 *
 * Draft-buffer pattern: every keystroke updates a local string draft and only
 * a parseable value reaches the store, so intermediate states like `"4."` or
 * `"-"` never pollute the crystal. `sgKey` is derived (`N(Symbol)`) whenever
 * the space-group fields change, keeping wyckoff_data lookups consistent.
 */
export function CrystalInput() {
  const crystal = useCrystalStore((state) => state.crystal);
  const setCrystal = useCrystalStore((state) => state.setCrystal);
  const [drafts, setDrafts] = useState<Partial<Record<CrystalField, string>>>({});

  // Value-based draft sync (see draft-sync.ts): drafts survive store updates
  // they agree with (mid-typing `"4."`) but are dropped when the store value
  // changed underneath (upload / sample pick / reset).
  useEffect(() => {
    setDrafts((prev) => {
      const pruned = crystal
        ? syncDrafts(prev, crystal as unknown as Record<string, unknown>)
        : {};
      return pruned ?? prev;
    });
  }, [crystal]);

  const patchCrystal = useCallback(
    (patch: Partial<Crystal>) => {
      if (!crystal) {
        return;
      }
      setCrystal({ ...crystal, ...patch });
    },
    [crystal, setCrystal],
  );

  const handleChange = useCallback(
    (field: CrystalField, raw: string) => {
      setDrafts((prev) => ({ ...prev, [field]: raw }));
      if (!crystal) {
        return;
      }
      if (NUMBER_FIELDS.has(field)) {
        const parsed = raw.trim() === '' ? 0 : Number(raw);
        if (!Number.isFinite(parsed)) {
          return; // Intermediate state: keep the draft, leave the store intact.
        }
        if (field === 'sgNumber') {
          patchCrystal({ sgNumber: parsed, sgKey: `${parsed}(${crystal.sgSymbol})` });
        } else {
          patchCrystal({ [field]: parsed } as Partial<Crystal>);
        }
        return;
      }
      if (field === 'sgSymbol') {
        patchCrystal({ sgSymbol: raw, sgKey: `${crystal.sgNumber}(${raw})` });
      } else {
        patchCrystal({ [field]: raw } as Partial<Crystal>);
      }
    },
    [crystal, patchCrystal],
  );

  if (!crystal) {
    return (
      <section className="module-panel">
        <p className="section-label">晶体参数</p>
        <p className="text-dim">请先通过上方「预置样品」或「上传 .cord 文件」加载晶体结构。</p>
      </section>
    );
  }

  const value = (field: CrystalField): string => drafts[field] ?? String(crystal[field]);

  const numberInput = (field: CrystalField, label: string, step?: string) => (
    <div>
      <label htmlFor={`crystal-${field}`}>{label}</label>
      <input
        id={`crystal-${field}`}
        type="number"
        step={step ?? 'any'}
        value={value(field)}
        onChange={(event) => handleChange(field, event.target.value)}
      />
    </div>
  );

  return (
    <section className="module-panel">
      <p className="section-label">晶体参数</p>
      <div className="crystal-grid">
        <div className="crystal-grid-full">
          <label htmlFor="crystal-name">Name（晶体名称）</label>
          <input
            id="crystal-name"
            type="text"
            value={value('name')}
            onChange={(event) => handleChange('name', event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="crystal-system">System（晶系）</label>
          <input
            id="crystal-system"
            type="text"
            value={value('system')}
            onChange={(event) => handleChange('system', event.target.value)}
          />
        </div>
        {numberInput('sgNumber', 'SG Number（空间群序号）', '1')}
        <div>
          <label htmlFor="crystal-sgSymbol">SG Symbol（空间群符号）</label>
          <input
            id="crystal-sgSymbol"
            type="text"
            value={value('sgSymbol')}
            onChange={(event) => handleChange('sgSymbol', event.target.value)}
          />
        </div>
        <div className="crystal-grid-full">
          <p className="sg-key-readout text-dim">
            sgKey（Wyckoff 查询键）：<span className="mono">{crystal.sgKey}</span>
          </p>
        </div>
        {numberInput('a', 'a (Å)')}
        {numberInput('b', 'b (Å)')}
        {numberInput('c', 'c (Å)')}
        {numberInput('alpha', 'α (°)')}
        {numberInput('beta', 'β (°)')}
        {numberInput('gamma', 'γ (°)')}
      </div>
      <p className="text-faint crystal-edit-hint">
        编辑任一字段即同步至计算状态（已有结果将失效，需重新点「计算」）；
        SG Number/Symbol 变更会联动重建 sgKey。
      </p>
    </section>
  );
}
