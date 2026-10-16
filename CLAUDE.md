# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CalcXRD is a Windows desktop application (PE32, i386, GUI) that calculates X-ray diffraction (XRD) patterns from crystal structure data. It was built with Borland/CodeGear Delphi 7 VCL (Windows Component Library) and is **closed-source binary-only** — there is no source code in this repo, no build system, and no way to compile it. All work on this repo is either:

1. **Static analysis / reverse engineering** of `CalcXRD.exe` and its data files, or
2. **Reimplementing** the functionality in another language/toolchain.

There are no tests, no CI, no linting, and no build commands. The `.remember/` directory is local Claude session state — do not commit or modify it casually.

## Running the binary

```
CalcXRD.exe   # 32-bit Windows GUI; will not run on 64-bit-only Windows without WoW64 (rarely an issue on modern Windows)
```

It is unsigned and untrusted. Treat it as a closed-source reference implementation, not something to execute in a CI or unattended pipeline without review.

## 实证与来源标注约定（本项目强制）

本项目为科研性质，**所有结论必须有实证，不允许"差不多就行"的工作风格**：

1. **公式 / 常数 / 表值必须标注来源**。写入代码注释或文档时，注明来源
   （文献、IUCr 表号、在线工具名 + URL、或本仓库哪个 `.dat` 文件），不得凭空构造数值。
2. **多源相互实证**。关键数值至少用两个独立来源交叉验证（例如 `Factor.dat` 对
   gemmi `it92.hpp`；`FF.dat` 对 IUCr CIF / Henke / NIST）。单一来源不足以下结论。
3. **区分物理正常与数据缺陷**。发现异常（趋势断裂、Kα1/Kα2 不自洽等）时，先核算
   吸收边位置等物理解释，再判定是否为录入缺陷，不得直接标"错误"。
4. **遗留缺陷保真优先**：项目目标是逐字节复现 `CalcXRD.exe`。已确认的 legacy 数据
   缺陷（如 Ce 录入、Z=91 误标）**保留原值**，仅在注释与文档中显式标记 + 给出修正值，
   不静默改写 `*.dat` 或 `*_data.ts`。
5. **文档与代码同步**：任何结论定案后，相关 `docs/`、`references/`、代码注释一并
   更新；修正发现的错误信息后，删除旧表述，不留过时/矛盾内容。

## Data file formats (the core of the program)

The program reads/writes a handful of plain-text and binary data files. Understanding their exact layouts is the key to doing any useful work in this repo.

### `.cord` files — crystal structure input

Plain text, one field per line, in this exact order:

```
<CrystalName>
<System>                      # Cubic, Tetragonal, Orthohombic, Hexagonal, etc.
<N>(SGSymbol)                # e.g. "225(Fm-3m)"
<ax> <bx> <cx>               # lattice parameters in Å, space-separated
<angle1> <angle2> <angle3>    # degrees, space-separated (usually 90 90 90)
<AtomCount>
<element symbol>             # e.g. Na1+, Al, Ba2+
<wyckoff symbol>            # single letter, e.g. a, b, c
<x> <y> <z>                  # fractional coordinates, one per line
<occupancy>                 # usually 1
<B>                         # per-atom thermal factor B in Å², usually 1
```

The element block repeats for each atom. See `samples/Al.cord`, `samples/NaCl.cord`, `samples/BaTiO3.cord`, `samples/Po.cord`.

Note: the 7th atom field is the **thermal factor B** (the program's atom-table
"B" column, default 1), applied per atom as `f = f₀·exp(−B·sin²θ/λ²)` — it is
NOT a multiplicity (earlier versions of this file mislabeled it). B is a
per-atom parameter; there is no global B setting.

### `.xrd` files — XRD intensity output

Plain text, CRLF line endings: five header lines, then one data row per grid
point as `2θ` (`%9.4f`) immediately followed by the intensity (`%8.0f`), and a
lone `0` terminator line:

```
<CrystalName>
Lamda = 1.54056
  3.000,100.000,  0.010
Data Number =     9700
Full Scall  =    10000
   3.0000       0
  ...
 100.0000       2
0
```

Notes: line 3 is `min,max,step` — the shipped `samples/Al.xrd` writes a
`0.001` step even though the real row spacing is `0.01` (a program quirk);
`Data Number` counts intervals (`rows − 1`); `Full Scall = 10000` is a display
scale, not a normalization (the file's own peak is 152557). See `samples/Al.xrd`.

### `Wyckoff` / `Wyckoff_Point` — space-group Wyckoff position tables

Plain text. Each space group is a block starting with `<N>(<SGSymbol>)` followed by:

- (for `Wyckoff_Point`) a multiplicity, Wyckoff letter, then a coordinate expression like `(x,y,z)`
- (for `Wyckoff`) the same but also lists the full coordinate operation list for the space group (e.g. 48 lines for Pm-3m)

Both files contain all 230 (actually 254) space groups. `WholeSG` is a plain index: one line per space group in the form `<N>(<SGSymbol>)`. `title1` is the same list without the index numbers.

### `Factor.dat` — atomic scattering factors f₀ (DECODED)

Binary, **19104 bytes = 199 records × 96 bytes**, no file header. This is the
program's OWN f₀ table (92 neutral elements H–U plus ~107 ion states) and is
the authoritative source for reimplementation.

```
Offset 0      : Delphi ShortString length byte L
Offset 1..L   : ASCII species name, zero-padded to 8 bytes
                e.g. "H", "H1-", "Al", "Na1+", "Cl1-", "O2-", "Ti2+",
                     "Cval"/"Siva" (valence variants of C/Si, keep as-is)
Offset 8..95  : 11 little-endian IEEE-754 doubles (struct '<11d' @ off+8)
```

Coefficients are interleaved `a1,b1,a2,b2,a3,b3,a4,b4,a5,b5,c`, i.e.
`a = [v0,v2,v4,v6,v8]`, `b = [v1,v3,v5,v7,v9]`, `c = v10`, and

```
f(s) = Σ_{i=1..5} aᵢ·exp(−bᵢ·s²) + c,   s = sinθ/λ  [Å⁻¹]
```

**The exponent is negative.** The `help` RTF writes `exp(bᵢ(λ/sinθ)²)`, an RTF
transcription artifact: taken literally it gives f(Al, s = 0.1) ≈ 0.14, which
is physically absurd. Sanity check: Σaᵢ + c equals the species' electron count
(atomic number ∓ charge) — 180/199 records match to <1e-3, the remaining 19
differ by ≤0.038 (rounding inside the table). Examples: Al 12.9986,
Na1+ 9.9997, Cl1- 17.9944, Fe 25.9946.

### `FF.dat` — F′ and F″ dispersion correction data

Binary. Each record is **192 bytes fixed**:

```
Byte 0:    name length (N)
Bytes 1..N: element/ionsymbol ASCII
Rest:      F′ and F″ coefficients (float32 arrays, layout not fully decoded)
```

⚠️ `FF.dat` is the **F′/F″ anomalous-dispersion** table, NOT f₀ (f₀ lives in
`Factor.dat`). Its decoder is a separate work item.

### `help` — embedded RTF help document

RTF file (not plain text). Contains the full list of formulas the program implements:

1. I = I₀ · K · Lp · |F_hkl|²
2. F_hkl = Σⱼ fⱼ · exp(2πi(hxⱼ + kyⱼ + lzⱼ))
3. f = f₀ · exp(−B sin²θ/λ²)  (thermal factor)
4. f(sinθ/λ) = Σ₍ᵢ₌₁..₄₎ aᵢ·exp(bᵢ(sinθ/λ)²) + C
5. f = f₀ + F′ + 0.5·F″²/(f₀+F′)  (anomalous correction)
6. Lorentz–polarization factor Lp
7. Gaussian peak-shape function for converting discrete hkl to a continuous pattern

### `Lang/` — language files

`Lang/title1` is a copy of the space-group list used for UI localization. `Lang/Tips.txt` is a short tips file. Replace `Lang/title1` into the main `title1` file to change the UI language (per the in-repo `Lang/Tips.txt` note).

## Binary analysis notes

- `CalcXRD.exe` is a **PE32 i386 Delphi 7** executable. Delphi's RTL/VCL is statically linked; there are no external DLL dependencies beyond standard Windows system DLLs (kernel32, user32, gdi32, comdlg32, comctl32, oleaut32, advapi32, winspool).
- The program uses `advapi32` (registry) and `winspool.drv` (printer) — likely for saving/plotting results.
- There are no network APIs imported.
- The DFM resource section contains 5 forms: `TFormCalc` (main), `TFormWCF`, `TFormSingle`, `TFormFactor`, `TFormHelp`.
- The main form `TFormCalc` has controls: `Memo1/2/3`, `PanelTop`, `PanelCondition`, `TSpeedButton` (B01–B11 — the 11 UI buttons), `TLabel` (Label00–Label05), `TShape` (Shape2/3/5).
- Program units visible in RTTI: `UnitHelp`, `UnitSingle` (others likely stripped or renamed).
- Use `pefile` (Python) for structured PE parsing. The section RVA table is slightly non-standard (some RVAs read as 0) — `pefile` handles it correctly; raw `struct` parsing will misread.

## Key physical constants used

From the UI default values visible in the binary:

- λ default = 1.54056 Å (Cu Kα)
- Default system: Orthohombic
- Default space group list: 254 entries

## Reimplementation reference

If reimplementing the calculation pipeline, the order is:

1. Read `.cord` → parse crystal (system, SG, a/b/c, angles, atoms with wyckoff/occupancy/**B**)
2. For each hkl reflection:
   a. Look up space-group systematic absences from `Wyckoff` table
   b. Compute structure factor F_hkl = Σⱼ fⱼ·exp(2πi(hx+ky+lz)) using multipliers from the SG's Wyckoff site
   c. Apply thermal factor per atom: fⱼ = f₀·exp(−Bⱼ·sin²θ/λ²)  (Bⱼ from the atom's own B field)
   d. Apply anomalous correction: f = f₀ + F′ + 0.5·F″²/(f₀+F′) using `Factor.dat`
   e. Compute Lorentz–polarization factor Lp
   f. I = I₀·K·Lp·|F|²
3. Convert discrete hkl intensities to a continuous 2θ pattern using the Gaussian peak function
4. Output `.xrd` file or plot
