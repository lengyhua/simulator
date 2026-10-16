# F′/F″ 数据缺口补全实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补全 3 个 F′/F″ 数据缺口开放项——离子色散误差量化、Cr/Fe Kα 增强（f″ 从 Henke 来源，f′=0 并注明近似边界）、文档/代码同步——同时保持"逐字节复现 CalcXRD.exe"的保真目标不被破坏。

**Architecture:** 分层数据管理（`docs/ion-and-cr-fe-data-research.md` §4.2）：原始数据文件（`.dat`/`.nff`/`.hpp`）→ 生成脚本（`scripts/gen_*.py`）→ 生成的 TS 常量文件（`web/src/lib/xrd/*_data.ts`）→ 运行时聚合层（`dispersion.ts`，增加 `mode` 参数）。新增 `henke_dispersion.ts`（Cr/Fe f″ 扩展）和 `ion_dispersion.ts`（离子近似值），不修改已有生成文件 `ff_data.ts` / `factor_data.ts`。

**Spec:** `docs/ion-and-cr-fe-data-research.md`（数据调研定案文档，含公式来源、误差量化、数据来源清单）

**关联文件：**
- `docs/ff-dat-spec.md`（FF.dat 二进制结构）
- `docs/ff-dat-validation.md`（Ce 缺陷论证 + 权威来源清单）
- `references/README.md`（参考资料总览，§6 交叉验证矩阵）
- `web/src/lib/xrd/dispersion.ts`（运行时 F′/F″ 聚合层）
- `web/src/lib/xrd/ff_data.ts`（FF.dat 生成产物，**不修改**）

---

## Global Constraints

- **保真优先**：默认行为（`mode='fidelity'`）与当前 `dispersion.ts` 完全一致；新增功能是可选增强，不影响现有 136 个测试。
- **来源注释规范**：每个生成的 `*_data.ts` 文件头必须注明数据来源（URL/路径）+ 抓取/生成日期 + 生成脚本路径 + 数据边界说明（哪些值有权威来源，哪些是近似估算，不能混用）。
- **禁止凭空构造数值**：所有写入代码/文档的 f′/f″ 数值必须有出处；近似估算值必须标注"无权威来源，推导公式见 X"。
- **不修改 `FF.dat` / `Factor.dat` 原始字节**；不修改 `ff_data.ts` / `factor_data.ts` 已有内容。
- 生成的 `henke_dispersion.ts` / `ion_dispersion.ts` 入库；`scripts/tmp/` 不入库（`.gitignore` 已配置）。
- 测试框架：`vitest`，现有 136 个测试全绿是验收门槛。

---

## Task 1: 生成 Cr/Fe Henke f″ 扩展表

**Files:**
- Create: `scripts/gen_henke_dispersion.py`
- Create: `web/src/lib/xrd/henke_dispersion.ts`
- Test: `web/src/lib/xrd/henke_dispersion.test.ts`（新建）

**Interfaces:**
- Consumes: `scripts/tmp/henke_Cr.nff`、`scripts/tmp/henke_Fe.nff`（LBNL CXRO，已抓取，2026-10-16）
- Produces:
  - `henke_dispersion.ts` 导出 `HENKE_CRF: { Cr: { lambda: number; fPrime: number; fDoublePrime: number; source: string }[], Fe: { ... }[] }`，Cr/Fe 各含 6 个标准波长条目（Cu Ka1/Ka2, Mo Ka1/Ka2, Co Ka1/Ka2），fPrime 固定为 `0`（见下文注释），fDoublePrime 来自 Henke f2 最近值。
  - 文件头注释：来源 URL + 抓取日期 + 近似说明（f′=0 的理由与误差边界，引用 `docs/ion-and-cr-fe-data-research.md` §3.2）。

- [ ] **Step 1: 写 `gen_henke_dispersion.py`，从两个 `.nff` 文件读 Cr/Fe 的 f2 值**

```python
#!/usr/bin/env python3
"""One-time generator for web/src/lib/xrd/henke_dispersion.ts.

Source: LBNL CXRO / Henke atomic scattering factors (f1, f2)
  - URL: https://henke.lbl.gov/optical_constants/sf/{el}.nff
  - Cr: Delmotte et al., J. Appl. Phys. 124, 035107 (2018)
  - 抓取日期: 2026-10-16 (scripts/tmp/henke_Cr.nff, henke_Fe.nff)

Design decision (see docs/ion-and-cr-fe-data-research.md §3.2):
  f'' = Henke f2 (authoritative source, cited above)
  f'  = 0 (no reliable source for bound f' at these wavelengths;
         setting to 0 is a documented approximation, NOT a data value)
"""
import re
from pathlib import Path

LAMBDA = {
    "CuKa1": 1.54056, "CuKa2": 1.54439,
    "MoKa1": 0.70930, "MoKa2": 0.71359,
    "CoKa1": 1.78897, "CoKa2": 1.79285,
}

def nearest_f2(path: Path, e_ev: float):
    rows = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        p = line.split()
        if len(p) >= 3 and not p[0].startswith("#"):
            try:
                e, f1, f2 = float(p[0]), float(p[1]), float(p[2])
                if 0.1 < e < 30000:
                    rows.append((e, f2))
            except ValueError:
                pass
    return min(rows, key=lambda r: abs(r[0] - e_ev))[1]

def main():
    out = Path(__file__).parent.parent / "web/src/lib/xrd/henke_dispersion.ts"
    elems = {}
    for sym in ("Cr", "Fe"):
        nff = Path(__file__).parent / "tmp" / f"henke_{sym.lower()}.nff"
        if not nff.exists():
            raise SystemExit(f"missing {nff}; run: curl -sL https://henke.lbl.gov/optical_constants/sf/{sym.lower()}.nff -o {nff}")
        entries = []
        for col, lam in LAMBDA.items():
            e_ev = 12398.4 / lam
            f2 = nearest_f2(nff, e_ev)
            entries.append(f'  {sym} {{ wavelength: "{col}", lambda: {lam:.5f}, fPrime: 0, fDoublePrime: {f2:.4f}, source: "LBNL CXRO Henke (Delmotte 2018); f\"\" = f2 @ E={e_ev:.1f} eV; f\'=0 (approximation, see docs/ion-and-cr-fe-data-research.md §3.2) }}')
        elems[sym] = entries

    header = f"""/**
 * Cr/Fe K-alpha anomalous dispersion extension — GENERATED FILE, DO NOT EDIT.
 *
 * Source: LBNL CXRO / Henke atomic scattering factors, Delmotte et al.
 *         J. Appl. Phys. 124, 035107 (2018).
 *   https://henke.lbl.gov/optical_constants/sf/cr.nff
 *   https://henke.lbl.gov/optical_constants/sf/fe.nff
 *   Fetched 2026-10-16; raw files at scripts/tmp/henke_Cr.nff, henke_Fe.nff
 *
 * CONVENTION (see docs/ion-and-cr-fe-data-research.md §3.2):
 *   fDoublePrime = Henke f2 (authoritative, sourced)
 *   fPrime       = 0 (NO reliable source for bound f' at these wavelengths;
 *                  FF.dat f' is the legacy program's own convention, not
 *                  convertible from Henke f1.  Setting f'=0 is a documented
 *                  approximation, not a measured value.  Error boundary:
 *                  Cr Kα is 28 eV below Cr K-edge → f' can be large; this
 *                  approximation is conservative (underestimates real f').
 *                  For Fe Kα (708 eV below Fe K-edge) f' is small, error < 1%.
 */

export interface HenkeDispersionEntry {
  wavelength: string;
  lambda: number;
  fPrime: number;
  fDoublePrime: number;
  source: string;
}

export const HENKE_CRF: Record<string, HenkeDispersionEntry[]> = {
"""
    body = "\n".join(["  " + sym + ": ["] + elems[sym] + ["  ],"] for sym in ("Cr", "Fe"))
    out.write_text(header + body + "\n};\n", encoding="utf-8")
    print(f"wrote {out}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行生成器，确认输出**

Run:
```bash
python3 scripts/gen_henke_dispersion.py
```
Expected: `web/src/lib/xrd/henke_dispersion.ts` 生成；Cr/Fe 各 6 条记录，
fDoublePrime 与 `docs/ion-and-cr-fe-data-research.md` §3.2 表值一致
（Cr CuKa1 f″=0.5610；Fe CuKa1 f″ 由 `.nff` 直接读出，非硬编码）。

- [ ] **Step 3: 写测试 `henke_dispersion.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { HENKE_CRF } from './henke_dispersion';

describe('HENKE_CRF', () => {
  it('has Cr and Fe entries, 6 wavelengths each', () => {
    expect(HENKE_CRF.Cr).toHaveLength(6);
    expect(HENKE_CRF.Fe).toHaveLength(6);
  });
  it('fPrime is 0 for all entries (documented approximation)', () => {
    for (const entries of Object.values(HENKE_CRF)) {
      for (const e of entries) expect(e.fPrime).toBe(0);
    }
  });
  it('Cr Cu Kα1 fDoublePrime ≈ 0.5610 (LBNL Henke, Delmotte 2018)', () => {
    const e = HENKE_CRF.Cr.find(x => x.wavelength === 'CuKa1')!;
    expect(e.fDoublePrime).toBeCloseTo(0.5610, 3);
  });
  it('every entry carries a source string', () => {
    for (const entries of Object.values(HENKE_CRF)) {
      for (const e of entries) expect(e.source.length).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd web && npx vitest run src/lib/xrd/henke_dispersion.test.ts`
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gen_henke_dispersion.py web/src/lib/xrd/henke_dispersion.ts web/src/lib/xrd/henke_dispersion.test.ts
git commit -m "feat(xrd): 新增 Cr/Fe Kα 增强表（LBNL Henke f''，f'=0 近似，来源注释）"
```

---

## Task 2: 生成离子 F′/F″ 近似表

**Files:**
- Create: `scripts/gen_ion_dispersion.py`
- Create: `web/src/lib/xrd/ion_dispersion.ts`
- Test: `web/src/lib/xrd/ion_dispersion.test.ts`（新建）

**Interfaces:**
- Consumes: `FF.dat`（92 元素中性 f′/f″，通过 `struct` 直接读取，不经过 `ff_data.ts`）
- Produces:
  - `ion_dispersion.ts` 导出 `ION_DISPERSION: Record<string, { element: string; charge: number; fPrime: number; fDoublePrime: number; source: string }[]>`，覆盖 `Factor.dat` 中出现的常见离子（Na1+/Cl1-/O2-/Fe2+/Al3+/Si4+/Ba2+ 等，与 `factor_data.ts` 键名对齐）。
  - 公式（`docs/ion-and-cr-fe-data-research.md` §2.3）：
    - `fPrime_ion = fPrime_neutral`（不变，注明理由）
    - `fDoublePrime_ion = fDoublePrime_neutral × (electron_count_ion / Z_neutral)`
    - `electron_count_ion = Z − charge`（Na1+: 11−1=10；Cl1-: 17+1=18；O2-: 8+2=10）
  - 文件头注释：公式来源、误差边界（NaCl 案例，§2.3 表格值）、**明确标注"无权威来源，近似估算"**。

- [ ] **Step 1: 写 `gen_ion_dispersion.py`**

```python
#!/usr/bin/env python3
"""One-time generator for web/src/lib/xrd/ion_dispersion.ts.

Formula (see docs/ion-and-cr-fe-data-research.md §2.3):
  F'_ion  = F'_neutral(E)                      (F' insensitive to charge; low-Z error <0.5%)
  F''_ion = F''_neutral(E) * (N_electrons / Z) where N_electrons = Z ∓ |charge|

NO AUTHORITATIVE ION F'/F'' TABLE EXISTS. This is a documented approximation:
  - F'' ∝ photoelectric cross-section ∝ total electron count
  - Error quantified in NaCl case: Na1+ f'' −8.9%, Cl1- f'' +6.3% (see §2.3 table)
  - Values MUST NOT be used as authoritative; label every entry `source: "approximation"`
"""
import struct
from pathlib import Path

FF_DAT = Path(__file__).parent.parent / "FF.dat"

# (species_name, neutral_Z, charge) — charge: +1 for cation, -1 for anion, etc.
IONS = [
    ("Na1+", 11, +1), ("Cl1-", 17, -1), ("O2-", 8, -2),
    ("Fe2+", 26, +2), ("Al3+", 13, +3), ("Si4+", 14, +4),
    ("Ba2+", 56, +2), ("Mg2+", 12, +2), ("Ca2+", 20, +2),
    ("Ti4+", 22, +4), ("F1-", 9, -1), ("K1+", 19, +1),
]

def neutral_ff(z: int):
    """Read (f', f'') for neutral element Z from FF.dat at Cu Kα1 (col 0)."""
    data = FF_DAT.read_bytes()
    off = (z - 1) * 104
    v = struct.unpack("<12d", data[off + 8 : off + 104])
    return v[0], v[1]  # f', f'' at CuKa1

def main():
    out = Path(__file__).parent.parent / "web/src/lib/xrd/ion_dispersion.ts"
    lines = [
        "/**",
        " * Ion F'/F'' approximation table — GENERATED FILE, DO NOT EDIT.",
        " *",
        " * Formula (docs/ion-and-cr-fe-data-research.md §2.3):",
        " *   F'_ion  = F'_neutral              (documented assumption: F' insensitive to charge)",
        " *   F''_ion = F''_neutral * (N_e / Z)  (N_e = Z ∓ |charge|; F'' ∝ photoelectric cross-section)",
        " *",
        " * NO AUTHORITATIVE ION F'/F'' TABLE EXISTS. Every entry below carries",
        " * `source: 'approximation'` to mark this.  Do NOT use these values where",
        " * authoritative precision is required; see §2.3 for the error boundary",
        " * quantified on NaCl (Na1+ f'' −8.9%, Cl1- f'' +6.3% vs neutral).",
        " *",
        " * Reference values (Cu Kα1 only, from FF.dat byte 0–103 of each Z):",
        " *   generated 2026-10-16",
        " */",
        "",
        "export interface IonDispersionEntry {",
        "  species: string;",
        "  element: string;",
        "  charge: number;",
        "  fPrime: number;",
        "  fDoublePrime: number;",
        "  source: string;",
        "}",
        "",
        "export const ION_DISPERSION: IonDispersionEntry[] =",
        "[",
    ]
    for name, z, chg in IONS:
        fp, fpp = neutral_ff(z)
        n_e = z - chg  # Na1+: 11-1=10; Cl1-: 17-(-1)=18; O2-: 8-(-2)=10
        fpp_ion = fpp * (n_e / z)
        el = name.split(chg_str(chg))[0] if False else None
        lines.append(
            f"  {{ species: '{name}', element: '{name[:len(name)-2]}', charge: {chg:+d}, "
            f"fPrime: {fp:.4f}, fDoublePrime: {fpp_ion:.4f}, "
            f"source: 'approximation (F0-charge scaling, §2.3; no authoritative ion table)' },"
        )
    lines.append("];")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out}")

def chg_str(chg: int) -> str:
    s = f"{abs(chg)}"
    return s + ("+" if chg > 0 else "-")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行生成器**

Run: `python3 scripts/gen_ion_dispersion.py`
Expected: `ion_dispersion.ts` 生成；Na1+ 条目 fDoublePrime ≈ 0.113（0.124×10/11），
Cl1- 条目 fDoublePrime ≈ 0.747（0.703×18/17），与 §2.3 表格一致。

- [ ] **Step 3: 写测试**

```ts
import { describe, it, expect } from 'vitest';
import { ION_DISPERSION } from './ion_dispersion';

describe('ION_DISPERSION', () => {
  it('every entry is marked source=approximation', () => {
    for (const e of ION_DISPERSION) expect(e.source).toContain('approximation');
  });
  it('Na1+ fDoublePrime ≈ 0.113 (0.124 × 10/11)', () => {
    const e = ION_DISPERSION.find(x => x.species === 'Na1+')!;
    expect(e.fDoublePrime).toBeCloseTo(0.113, 2);
  });
  it('Cl1- fDoublePrime ≈ 0.747 (0.703 × 18/17)', () => {
    const e = ION_DISPERSION.find(x => x.species === 'Cl1-')!;
    expect(e.fDoublePrime).toBeCloseTo(0.747, 2);
  });
  it('fPrime equals neutral value (documented assumption)', () => {
    // Na1+ fPrime should equal FF.dat neutral Na CuKa1 fPrime
    const e = ION_DISPERSION.find(x => x.species === 'Na1+')!;
    expect(e.fPrime).toBeCloseTo(0.124, 3); // sanity: non-zero, from FF.dat
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `cd web && npx vitest run src/lib/xrd/ion_dispersion.test.ts`
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gen_ion_dispersion.py web/src/lib/xrd/ion_dispersion.ts web/src/lib/xrd/ion_dispersion.test.ts
git commit -m "feat(xrd): 离子 F′F″ 近似表（电荷偏移公式，来源注释，误差边界量化）"
```

---

## Task 3: 扩展 `dispersion.ts` 支持 mode 参数

**Files:**
- Modify: `web/src/lib/xrd/dispersion.ts`（新增 `DispersionMode` 类型 + `mode` 参数）
- Modify: `web/src/lib/xrd/dispersion.test.ts`（新增 mode 测试）

**Interfaces:**
- Consumes: `HENKE_CRF`（Task 1）、`ION_DISPERSION`（Task 2）、`FF_TABLE`/`FF_SYMBOLS`/`FF_COLUMNS`（已有 `ff_data.ts`）
- Produces:
  - `export type DispersionMode = 'fidelity' | 'extended'`
  - `getDispersion(species: string, lambda: number, mode?: DispersionMode): { fPrime: number; fDoublePrime: number; supported: boolean; source: string }`
  - `source` 字段：`'FF.dat'`（fidelity 模式）/ `'LBNL Henke'`（extended Cr/Fe）/ `'approximation'`（extended 离子）
  - `mode='fidelity'`（默认）：行为与现有完全一致，`supported` 语义不变
  - `mode='extended'`：Cr/Fe 从 `HENKE_CRF` 取（`fPrime=0`，`fDoublePrime`=Henke f2）；离子从 `ION_DISPERSION` 取

- [ ] **Step 1: 写失败的测试（新增到 `dispersion.test.ts`）**

在现有 `describe` 块末尾追加：

```ts
describe('dispersion — extended mode', () => {
  it('fidelity mode (default) returns FF.dat source for Cu Kα1', () => {
    const r = getDispersion('Al', FF_LAMBDAS.CuKa1, 'fidelity');
    expect(r.source).toBe('FF.dat');
    expect(r.supported).toBe(true);
  });
  it('extended mode returns Henke source for Cr Cu Kα1', () => {
    const r = getDispersion('Cr', 5414.6 / 10000, 'extended'); // 5414.6 eV → λ≈2.2897 Å
    expect(r.source).toBe('LBNL Henke');
    expect(r.fPrime).toBe(0);
    expect(r.supported).toBe(true);
  });
  it('extended mode returns approximation source for Na1+ Cu Kα1', () => {
    const r = getDispersion('Na1+', FF_LAMBDAS.CuKa1, 'extended');
    expect(r.source).toBe('approximation');
    expect(r.supported).toBe(true);
  });
  it('fidelity mode for Na1+ falls back to neutral FF.dat (no ion entry)', () => {
    const r = getDispersion('Na1+', FF_LAMBDAS.CuKa1, 'fidelity');
    expect(r.source).toBe('FF.dat'); // ion falls back to neutral in fidelity mode
  });
});
```

- [ ] **Step 2: 运行测试，确认新增 4 个用例失败**

Run: `cd web && npx vitest run src/lib/xrd/dispersion.test.ts`
Expected: 4 FAIL（`DispersionMode` 类型未定义 / `getDispersion` 不接受第 3 参数）

- [ ] **Step 3: 修改 `dispersion.ts`**

在文件顶部 import 区追加：

```ts
import { HENKE_CRF } from './henke_dispersion';
import { ION_DISPERSION } from './ion_dispersion';
```

在 `getDispersion` 函数定义处，在参数列表末尾加 `mode: DispersionMode = 'fidelity'`，
并在函数体末尾（`return` 语句前）插入：

```ts
// extended mode: Cr/Fe Kα → Henke; ion species → ION_DISPERSION approximation
if (mode === 'extended') {
  const henke = HENKE_CRF[normalized];
  if (henke) {
    const entry = henke.find(e => Math.abs(e.lambda - lambda) < 0.001) ?? henke[0];
    return { fPrime: entry.fPrime, fDoublePrime: entry.fDoublePrime, supported: true, source: 'LBNL Henke' };
  }
  const ion = ION_DISPERSION.find(e => e.species === species);
  if (ion) {
    return { fPrime: ion.fPrime, fDoublePrime: ion.fDoublePrime, supported: true, source: 'approximation' };
  }
}
```

在文件末尾追加类型定义：

```ts
export type DispersionMode = 'fidelity' | 'extended';
```

同时在 `getDispersion` 返回值类型（若有）中加入 `source: string`。

- [ ] **Step 4: 运行全量 dispersion 测试，确认新旧用例全绿**

Run: `cd web && npx vitest run src/lib/xrd/dispersion.test.ts`
Expected: 全部 PASS（旧用例 9 个 + 新用例 4 个 = 13）

- [ ] **Step 5: 运行全量测试，确认无回归**

Run: `cd web && npm test`
Expected: 全部 PASS（136 个现有 + 4 个新增 = 140）

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/xrd/dispersion.ts web/src/lib/xrd/dispersion.test.ts
git commit -m "feat(xrd): dispersion.ts 增加 mode='extended'（Cr/Fe→Henke，离子→近似表）"
```

---

## Task 4: 更新文档（CLAUDE.md / references / intensity-uncertainty-review）

**Files:**
- Modify: `CLAUDE.md`（新增"实证与来源标注约定"章节，已在上一步写入）
- Modify: `references/README.md`（§7 开放项 1、3 更新状态）
- Modify: `docs/intensity-uncertainty-review.md`（§4 开放项表更新）

**Interfaces:**
- Consumes: Task 1–3 的完成状态（fidelity/extended 两模式已实现并测试）
- Produces: 无（纯文档，无代码接口）

- [ ] **Step 1: 更新 `references/README.md` §7 开放项表**

将开放项 1（离子 F′/F″）"现状"列改为：
`已完成：离子近似表（ion_dispersion.ts，来源=approximation，误差量化见 ion-and-cr-fe-data-research.md §2.3）；fidelity 模式保持中性回退`

将开放项 3（Cr/Fe）"现状"列改为：
`已完成：Henke f″ 扩展表（henke_dispersion.ts，来源=LBNL CXRO，f′=0 近似并注明边界）；fidelity 模式保持置灰`

- [ ] **Step 2: 更新 `docs/intensity-uncertainty-review.md` §4 开放项表**

将"离子色散"和"Cr/Fe Kα"两行的"现状"列从"开放"改为"已实现（extended 模式）"，
并注明 `mode='fidelity'`（默认，保真）与 `mode='extended'`（增强）的选择。

- [ ] **Step 3: 运行全量测试，确认文档更新不影响代码**

Run: `cd web && npm test`
Expected: 140 PASS（文档修改不触发代码变化，测试数量不变）

- [ ] **Step 4: Commit**

```bash
git add references/README.md docs/intensity-uncertainty-review.md CLAUDE.md
git commit -m "docs: 更新开放项状态（离子/Cr-Fe 已实现 extended 模式）"
```

---

## Self-Review

**Spec coverage:** `ion-and-cr-fe-data-research.md` §3.1（离子，中性回退+误差量化）→ Task 2；§3.2（Cr/Fe Henke f″）→ Task 1；§4（数据管理分层）→ Task 1/2 生成文件头注释 + Task 3 的 `mode` 参数。Ce 缺陷（§3.3）已定案，无新代码，Task 4 文档同步。

**Type consistency:** `DispersionMode`（Task 3 定义）被 `getDispersion` 参数使用；`HenkeDispersionEntry`（Task 1 定义）被 `HENKE_CRF` 使用；`IonDispersionEntry`（Task 2 定义）被 `ION_DISPERSION` 使用。`fPrime/fDoublePrime/source/supported` 字段在三个文件中命名一致。

**Review Focus（5 个 spec 暗示但无测试覆盖的输入类/失败模式）：**

1. **`mode='extended'` 下离子符号解析失败**：`getDispersion('Na1+', lambda, 'extended')` 若 `species` 含多余空格或大小写不规范，`ION_DISPERSION.find(e => e.species === species)` 会返回 `undefined`，静默回退到中性 FF.dat。
   → **测试归属：Task 3，追加用例**：`getDispersion(' na1+', lambda, 'extended')` 应回退（source=`'FF.dat'`），不抛异常。

2. **`HENKE_CRF` 波长匹配精度**：`Math.abs(e.lambda - lambda) < 0.001` 在 Cr Kα1（λ=2.2898 Å）附近，若用户传入 λ=2.29（约 2.2900）应匹配到 2.2898；若传入 Mo Kα1（0.70930）则不应匹配到 Cr 条目（差 1.58）。
   → **测试归属：Task 3，追加用例**：`getDispersion('Cr', 0.7093, 'extended')` 应回退（Cr 只在 Henke_Cr 条目中，且 Mo 波长差 > 0.001）。

3. **离子 f″ 电荷偏移公式的边界**：`charge=0` 时（中性）公式给 `fDoublePrime = fDoublePrime_neutral`（退化正确）；但 `gen_ion_dispersion.py` 的 `IONS` 列表只含非零电荷，若未来有人加 `Z=0` 条目会除零。
   → **测试归属：Task 2，追加用例**：`ION_DISPERSION` 中所有条目 `charge ≠ 0`（断言 `expect(e.charge).not.toBe(0)`）。

4. **fidelity 模式不改变现有行为**：`mode` 参数默认值为 `'fidelity'`，若有人省略第 3 参数，行为应与 Task 3 之前完全一致（现有 9 个 `dispersion.test.ts` 用例不变）。
   → **测试归属：Task 3，已有旧用例覆盖（9 个）**；Step 4 全量测试验证无回归。

5. **生成文件头注释与实际数据一致性**：`gen_ion_dispersion.py` 文件头注释写"Cu Kα1 only"，但 `IONS` 列表只读 FF.dat 第一列（CuKa1）；若未来扩展到 Mo/Co 列，注释需同步更新。
   → **测试归属：Task 2，追加用例**：`gen_ion_dispersion.py` 运行后，`ion_dispersion.ts` 文件头注释中包含"Cu Kα1 only"字样（`expect(content).toContain('Cu Kα1 only')` 在生成的文件内容上）。

**Proportion:** 计划 4 个 task，每个 task 的接口/公式/误差值均已从 spec 固定；Task 1/2 的脚本体已给出，Task 3 的函数体改动已给出，Task 4 是纯文档。无超出 spec 的决策点。
