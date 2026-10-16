import { useCallback, useEffect, useMemo, useState } from 'react';

import { syncDrafts } from '@/lib/draft-sync';
import { useCrystalStore } from '@/store/crystal-store';
import type { Crystal } from '@/lib/xrd/types';
import {
  CRYSTAL_SYSTEMS,
  SYSTEM_ANGLE_LOCKS,
  spaceGroupsForSystem,
  type CrystalSystem,
} from '@/lib/xrd/crystal_systems';

/** Editable scalar fields of the crystal header. */
type CrystalField = 'name' | 'a' | 'b' | 'c' | 'alpha' | 'beta' | 'gamma';

/** Normalizes a Crystal.system string to a known CrystalSystem (legacy spellings). */
function normalizeSystem(raw: string): CrystalSystem {
  const lower = raw.trim().toLowerCase();
  for (const sys of CRYSTAL_SYSTEMS) {
    if (sys.toLowerCase() === lower) {
      return sys;
    }
  }
  // Fall back: map common variants (e.g. "Rhombohedral" → Trigonal, legacy .cord
  // sometimes carries the full ITC name even when the program's own UI uses
  // the 7 short system names above).
  if (lower === 'rhombohedral') return 'Trigonal';
  return 'Cubic';
}

/**
 * Crystal header editor (plan §5-T09, UI v2 2026-10-16):
 *  - `System` is a dropdown (the legacy program's 7 systems), not free text.
 *  - `SpaceGroup` merges the old "SG Number" + "SG Symbol" into one linked
 *    dropdown: options are the 254 WholeSG keys filtered to the current
 *    system, displayed as `N(Symbol)` exactly like the legacy program.
 *  - Lattice angles lock per system (Cubic/Tetragonal/Orthohombic → all 90°,
 *    Hexagonal/Trigonal → α=β=90°, γ=120°, Monoclinic → α=γ=90° free β,
 *    Triclinic → all free). Locked fields show as read-only text.
 *
 * Draft-buffer pattern unchanged: parseable values only; `sgKey` is rebuilt
 * from the selected space-group key so wyckoff lookups stay consistent.
 */
export function CrystalInput() {
  const crystal = useCrystalStore((state) => state.crystal);
  const setCrystal = useCrystalStore((state) => state.setCrystal);
  const [drafts, setDrafts] = useState<Partial<Record<CrystalField, string>>>({});

  // Value-based draft sync (see draft-sync.ts): drafts survive store updates
  // they agree with (mid-typing "4.") but are dropped when the store value
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

  /** All space-group keys for the crystal's current system, precomputed. */
  const sgOptions = useMemo(() => {
    if (!crystal) {
      return [];
    }
    return spaceGroupsForSystem(normalizeSystem(crystal.system));
  }, [crystal?.system]);

  /** The crystal's sgKey; falls back to the system's first key when the
   *  stored key is not in the current system's list (e.g. after switching
   *  systems without picking a new group yet). */
  const effectiveSgKey = crystal ? (sgOptions.includes(crystal.sgKey) ? crystal.sgKey : sgOptions[0] ?? '') : '';

  /** Picks a space-group key from the dropdown and rebuilds sgNumber/
   *  sgSymbol/sgKey in one shot (the fields the rest of the engine reads). */
  const handleSgKeyChange = useCallback(
    (rawKey: string) => {
      if (!crystal || !rawKey) {
        return;
      }
      const m = /^(\d+)\(([^)]+)\)/.exec(rawKey);
      if (!m) {
        return;
      }
      patchCrystal({ sgNumber: Number(m[1]), sgSymbol: m[2], sgKey: rawKey });
    },
    [crystal, patchCrystal],
  );

  /** Switches the crystal system: resets SpaceGroup to the new system's
   *  first entry and applies that system's angle locks in the same store
   *  write (so one click can't leave a stale, out-of-system sgKey). */
  const handleSystemChange = useCallback(
    (system: CrystalSystem) => {
      if (!crystal) {
        return;
      }
      const options = spaceGroupsForSystem(system);
      const first = options[0];
      const m = first ? /^(\d+)\(([^)]+)\)/.exec(first) : undefined;
      const locks = SYSTEM_ANGLE_LOCKS[system];
      patchCrystal({
        system,
        ...(m ? { sgNumber: Number(m[1]), sgSymbol: m[2], sgKey: first } : {}),
        alpha: locks.alpha ? locks.alphaFixed : crystal.alpha,
        beta: locks.beta ? locks.betaFixed : crystal.beta,
        gamma: locks.gamma ? locks.gammaFixed : crystal.gamma,
      });
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

  const handleNumber = (field: CrystalField, raw: string) => {
    setDrafts((prev) => ({ ...prev, [field]: raw }));
    const parsed = raw.trim() === '' ? 0 : Number(raw);
    if (!Number.isFinite(parsed)) {
      return; // intermediate state: keep the draft, leave the store intact
    }
    patchCrystal({ [field]: parsed } as Partial<Crystal>);
  };

  const locks = SYSTEM_ANGLE_LOCKS[normalizeSystem(crystal.system)];
  const angleField = (field: 'alpha' | 'beta' | 'gamma', label: string, locked: boolean, fixedValue: number) => (
    <div>
      <label htmlFor={`crystal-${field}`}>{label}</label>
      {locked ? (
        <input
          id={`crystal-${field}`}
          type="text"
          value={String(fixedValue)}
          readOnly
          aria-readonly
          title={`由晶系锁定：${normalizeSystem(crystal.system)} → ${label} = ${fixedValue}°`}
        />
      ) : (
        <input
          id={`crystal-${field}`}
          type="number"
          step="any"
          value={value(field)}
          onChange={(event) => handleNumber(field, event.target.value)}
        />
      )}
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
            onChange={(event) => patchCrystal({ name: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="crystal-system">System（晶系）</label>
          <select
            id="crystal-system"
            value={normalizeSystem(crystal.system)}
            onChange={(event) => handleSystemChange(event.target.value as CrystalSystem)}
          >
            {CRYSTAL_SYSTEMS.map((system) => (
              <option key={system} value={system}>
                {system}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="crystal-spacegroup">SpaceGroup（空间群，随 System 联动）</label>
          <select
            id="crystal-spacegroup"
            value={effectiveSgKey}
            onChange={(event) => handleSgKeyChange(event.target.value)}
          >
            {sgOptions.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
        <div className="crystal-grid-full">
          <p className="sg-key-readout text-dim">
            sgKey（Wyckoff 查询键）：<span className="mono">{crystal.sgKey}</span>
          </p>
        </div>
        <div className="crystal-grid-full">
          <p className="text-faint unit-cell-caption">Unit Cell（晶胞参数，角度随 System 联动锁定）</p>
        </div>
        <div>
          <label htmlFor="crystal-a">a (Å)</label>
          <input id="crystal-a" type="number" step="any" value={value('a')} onChange={(event) => handleNumber('a', event.target.value)} />
        </div>
        <div>
          <label htmlFor="crystal-b">b (Å)</label>
          <input id="crystal-b" type="number" step="any" value={value('b')} onChange={(event) => handleNumber('b', event.target.value)} />
        </div>
        <div>
          <label htmlFor="crystal-c">c (Å)</label>
          <input id="crystal-c" type="number" step="any" value={value('c')} onChange={(event) => handleNumber('c', event.target.value)} />
        </div>
        {angleField('alpha', 'α (°)', locks.alpha, locks.alphaFixed)}
        {angleField('beta', 'β (°)', locks.beta, locks.betaFixed)}
        {angleField('gamma', 'γ (°)', locks.gamma, locks.gammaFixed)}
      </div>
      <p className="text-faint crystal-edit-hint">
        System 切换会重置 SpaceGroup 为该晶系首个空间群并按晶系锁定 α/β/γ；
        SpaceGroup 变更联动重建 sgKey；a/b/c 自由编辑。
      </p>
    </section>
  );
}
