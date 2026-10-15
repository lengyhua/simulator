/**
 * Crystal calculation store (plan §3.3 / T08) — Zustand, no Provider needed.
 *
 * State: `crystal / params / pattern / error` plus the actions of plan §3.3.
 *
 * Semantics (deterministic, covered by crystal-store.test.ts):
 * - `loadCordText` parses .cord text; on failure it sets a line-numbered
 *   `error` and KEEPS the previous crystal/pattern untouched ("pattern 不被
 *   污染" — the last successful result survives a bad upload).
 * - `setCrystal` / `updateAtom` / `addAtom` / `removeAtom` / `setParams`
 *   mutate their slice and INVALIDATE `pattern` (stale results are hidden
 *   until `compute()` runs again — mirrors the legacy program's explicit
 *   "powder XRD" button).
 * - `compute()` regenerates the pattern from (crystal, params); on failure it
 *   sets `error` and clears `pattern`.
 * - `reset()` returns to the initial state with defaults from constants.ts.
 */

import { create } from 'zustand';

import { parseCord } from '@/lib/xrd/crystal';
import { computeXRDPattern } from '@/lib/xrd/pipeline';
import { createDefaultParams, DEFAULT_ATOM_THERMAL_B } from '@/lib/xrd/constants';
import type { Atom, Crystal, XrdParams, XRDPattern } from '@/lib/xrd/types';

/** Store shape per plan §3.3. */
export interface CrystalState {
  crystal: Crystal | null;
  params: XrdParams;
  pattern: XRDPattern | null;
  error: string | null;
  /** Parses .cord text into the store (failure sets a line-numbered error). */
  loadCordText(text: string): void;
  setCrystal(crystal: Crystal): void;
  updateAtom(index: number, patch: Partial<Atom>): void;
  addAtom(): void;
  removeAtom(index: number): void;
  setParams(patch: Partial<XrdParams>): void;
  /** crystal + params → pattern (try/catch → error). */
  compute(): void;
  reset(): void;
}

/** Extracts a user-readable message from an unknown thrown value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A fresh atom row for {@link CrystalState.addAtom} (UI fills it in). */
function blankAtom(): Atom {
  return {
    element: '',
    wyckoff: 'a',
    x: 0,
    y: 0,
    z: 0,
    occupancy: 1,
    thermalB: DEFAULT_ATOM_THERMAL_B,
  };
}

/** Validates the merged atom row after an {@link CrystalState.updateAtom} patch. */
function validateAtom(atom: Atom): string | null {
  if (atom.element.trim() === '') {
    return '原子元素符号不能为空';
  }
  if (atom.wyckoff.trim() === '') {
    return '原子 Wyckoff 位不能为空';
  }
  for (const [name, value] of [
    ['x', atom.x],
    ['y', atom.y],
    ['z', atom.z],
    ['occupancy', atom.occupancy],
    ['B（热因子）', atom.thermalB],
  ] as Array<[string, number]>) {
    if (!Number.isFinite(value)) {
      return `原子字段「${name}」应为有限数值，实际为 ${value}`;
    }
  }
  if (atom.occupancy < 0 || atom.occupancy > 1) {
    return `原子 occupancy 应在 [0,1] 区间，实际为 ${atom.occupancy}`;
  }
  if (atom.thermalB < 0) {
    return `原子热因子 B 不能为负，实际为 ${atom.thermalB}`;
  }
  return null;
}

export const useCrystalStore = create<CrystalState>()((set, get) => ({
  crystal: null,
  params: createDefaultParams(),
  pattern: null,
  error: null,

  loadCordText(text: string): void {
    try {
      const crystal = parseCord(text);
      set({ crystal, error: null, pattern: null });
    } catch (error) {
      // Keep the previous crystal/pattern; only report the parse failure.
      set({ error: errorMessage(error) });
    }
  },

  setCrystal(crystal: Crystal): void {
    set({ crystal, error: null, pattern: null });
  },

  updateAtom(index: number, patch: Partial<Atom>): void {
    const { crystal } = get();
    if (!crystal) {
      set({ error: '尚未加载晶体结构，无法编辑原子' });
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= crystal.atoms.length) {
      set({ error: `原子索引 ${index} 越界（当前共 ${crystal.atoms.length} 个原子）` });
      return;
    }
    const merged: Atom = { ...crystal.atoms[index], ...patch };
    const invalid = validateAtom(merged);
    if (invalid) {
      set({ error: invalid });
      return;
    }
    const atoms = crystal.atoms.map((atom, i) => (i === index ? merged : atom));
    set({ crystal: { ...crystal, atoms }, error: null, pattern: null });
  },

  addAtom(): void {
    const { crystal } = get();
    if (!crystal) {
      set({ error: '尚未加载晶体结构，无法新增原子' });
      return;
    }
    set({
      crystal: { ...crystal, atoms: [...crystal.atoms, blankAtom()] },
      error: null,
      pattern: null,
    });
  },

  removeAtom(index: number): void {
    const { crystal } = get();
    if (!crystal) {
      set({ error: '尚未加载晶体结构，无法删除原子' });
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= crystal.atoms.length) {
      set({ error: `原子索引 ${index} 越界（当前共 ${crystal.atoms.length} 个原子）` });
      return;
    }
    // The .cord format requires ≥ 1 atom; keep that invariant in the store.
    if (crystal.atoms.length <= 1) {
      set({ error: '至少需要保留 1 个原子（.cord 格式要求 AtomCount ≥ 1）' });
      return;
    }
    set({
      crystal: { ...crystal, atoms: crystal.atoms.filter((_, i) => i !== index) },
      error: null,
      pattern: null,
    });
  },

  setParams(patch: Partial<XrdParams>): void {
    // Unconditional merge; validation happens in compute() so the user gets
    // one clear error at calculation time (the UI constrains inputs anyway).
    set((state) => ({ params: { ...state.params, ...patch }, pattern: null }));
  },

  compute(): void {
    const { crystal, params } = get();
    if (!crystal) {
      set({ error: '请先加载或输入晶体结构，再执行计算' });
      return;
    }
    try {
      const pattern = computeXRDPattern(crystal, params);
      set({ pattern, error: null });
    } catch (error) {
      set({ error: `计算失败：${errorMessage(error)}`, pattern: null });
    }
  },

  reset(): void {
    set({ crystal: null, params: createDefaultParams(), pattern: null, error: null });
  },
}));
