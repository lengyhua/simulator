# F′/F″ 反常色散 · 参数参考

> 入口：[`DATA-REFERENCE.md`](DATA-REFERENCE.md) §1。本文 = 色散细节。
> 公式见 [`formulas.md`](formulas.md) §5；来源谱系见 [`data-provenance.md`](data-provenance.md)。

## 0. TL;DR

| 项 | 结论 |
|---|---|
| 运行时权威表 | `web/src/lib/xrd/ff_data.ts`（FF.dat 解码，**92 元素 × 6 波长**） |
| 聚合入口 | `dispersion.ts:144 getDispersion(el, λ, mode)` |
| mode 语义 | `fidelity`（默认，仅 FF.dat）/ `extended`（含 Cr/Fe Henke + 离子近似） |
| 原始来源 | `FF.dat`（9568 B = **92 × 104 B**，8 B ShortString + 12 × double） |
| 已知缺陷 | **Ce(Z=58) Cu Kα1 f′ = −1.087 录入缺陷**（保真保留，修正 ≈−1.88） |
| 无权威源 | 离子 F′/F″（近似）、Cr/Fe Kα（Henke f″ + f′=0） |

## 1. FF.dat 二进制结构（已完全解析）

- **9568 B = 92 × 104**，无文件头、无尾部填充。
- 记录 = 8 B Delphi `ShortString[7]`（1 长度字节 + 符号 + 零填充）+ 12 个 little-endian double。
- 12 个 double = **6 组交错的 (f′, f″)**，列序 = Cu Kα1 / Cu Kα2 / Mo Kα1 / Mo Kα2 / Co Kα1 / Co Kα2。
- **非分块**（分块读法产生负 f″，物理不可能）；已用 Fe 三重印证锁定。
- 记录按 **Z=1…92 升序**，**无离子条目**（与 Factor.dat 199 条不同）。

> 详细 hex 证据与 9 条候选布局排除理由：`docs/audits/` 无；见旧 `docs/ff-dat-spec.md` §1/§6
> （已 DEPRECATED，内容本文 §1 为权威摘要）。

### 1.1 ⚠ Z=91 符号误标

- 记录 Z=91 的名称字段误写成 `Po`（与 Z=84 重复），但**数值正确**。
- **必须按 Z 索引**（`FF_SYMBOLS` 提供正确的 Z 序符号表），不能按符号建 Map。

## 2. 波长列识别与 λ 表对照

- **K 吸收边跃变法**识别三组靶：跃变点在 Co→Ni（Cu Kα）、Y→Zr（Mo Kα）、Mn→Fe（Co Kα）。
- 组内两列 = Kα1/Kα2（Δλ≈0.004 Å，f″ 略增方向锁定先 Kα1）。

| 靶 | `constants.ts` λ | FF.dat 有列？ |
|---|---|---|
| Cu | 1.54056 | ✅ 完全命中 Cu Kα1 |
| Mo | 0.70930 | ✅ 完全命中 Mo Kα1 |
| Co | 1.78897 | ✅ 完全命中 Co Kα1 |
| Cr | 2.28970 | ❌ 无列（最近 Co Kα2 Δλ=0.497） |
| Fe | 1.93604 | ❌ 无列（最近 Co Kα2 Δλ=0.143） |

**λ 索引规则**：取最近列，**不做插值**（相邻列间可能横跨 K 边，插值无物理意义）。

### 2.1 原程序 λ 下拉全列表（2026-10-17 Win32 提取）

主窗口与 Search Factor 对话框共用同一 6 项列表（`scripts/dump_main_combos.py` 经 CB_GETLBTEXT 精确提取，非截图识字）：

| # | 项 | λ (Å) | FF.dat 对应列 |
|---|---|---|---|
| 0 | CuKa1 | 1.54056 | Cu Kα1（精确命中） |
| 1 | CuKa（加权） | 1.54178 | 无精确列；web 最近列规则 → Cu Kα1（Δ0.0012） |
| 2 | FeKa1 | 1.93604 | **无列**（web 最近列规则 → Co Kα2，Δ0.143） |
| 3 | FeKa（加权） | 1.93736 | **无列**（web 最近列规则 → Co Kα2，Δ0.144） |
| 4 | MoKa1 | **0.71930** ⚠ 录入笔误（标准 0.70930） | 若按最近 λ 会错配 Mo Kα2（Δ0.0057 < 0.010），待实证 |
| 5 | MoKa（加权） | 0.71073 | 无精确列；web 最近列规则 → Mo Kα1（Δ0.0014） |

- MoKa1 笔误已登记 `DATA-REFERENCE.md` §4 #11；web `LAMBDA_TABLE.Mo` 采用正确值 0.70930（**有意偏离原程序**）。
- web λ 表（Cu/Mo/Cr/Co/Fe 5 项）与原程序 6 项**结构不同**：原程序含 3 个加权平均项（CuKa/FeKa/MoKa）、无 Cr；web 有 Cr、无加权项。是否对齐见 `DATA-REFERENCE.md` §5.1 开放项。
- 原程序选 FeKa 时 F′F″ 的行为未经实证（FF.dat 无 Fe 列；推测复选框置灰，与 web fidelity 模式一致）。

## 3. 组合公式：复数式（权威）

$$f = f_0 + F' + i\,F''\qquad\Rightarrow\qquad |F_{hkl}|^2=\Big|\sum_j \big(f_{0,j}+F'_j+iF''_j\big)e^{-B_j s^2}e^{i\phi_j}\Big|^2$$

- `help` 公式 (5) 标量式 $f_0+F'+\tfrac{0.5F''^2}{f_0+F'}$ 是 $|f|$ 的二阶 Taylor，**非 bug**（与复数差 ≤2e-5）。
- **多物种结构必须用复数式**：NaCl 弱峰 (311) 标量 vs 复数差可达 2–3%。
- 落地（`structure_factor.ts`）：`Re=A·cosφ−B·sinφ`，`Im=A·sinφ+B·cosφ`（A=f₀+ F′，B=F″）。
  ⚠ 只往 `im` 加 F″ 而漏 `re` 的 `−F″·sinφ` 项，对非中心对称结构（GaAs 200/222）有实误差。
- **Debye–Waller 只施加于 f₀**，F′/F″ 为 s 无关常数（ITC 标准，已实证）。

## 4. 引擎接入（模式语义）

`dispersion.ts:144 getDispersion(el, λ, mode)`：

| mode | 数据源 | Cr/Fe | 离子 | 用途 |
|---|---|---|---|---|
| `fidelity`（默认） | 仅 `ff_data.ts` | 置灰（无列） | 回退中性 | **逐字节复现 legacy** |
| `extended` | + `henke_dispersion.ts` + `ion_dispersion.ts` | Henke f″ + f′=0 | 中性 + 电荷偏移 F″ | 功能增强（偏离保真） |

每个返回值的 `source` 字段区分 `'FF.dat' / 'LBNL Henke' / 'approximation'`，供 UI 标注。

### 4.1 离子 F′/F″ 电荷偏移近似（⚠ 无权威出处，仅量化用）

$$F'_{\text{ion}}\approx F'_{\text{neutral}},\qquad F''_{\text{ion}}\approx F''_{\text{neutral}}\cdot\frac{N_e}{Z}$$

误差边界（NaCl）：Na¹⁺ F″ −8.9%、Cl⁻¹ +6.3%。**不可当工程精度数据**。

### 4.2 Cr/Fe Kα（extended）

- F″ = LBNL CXRO Henke（Delmotte 2018，`scripts/tmp/henke_{Cr,Fe}.nff`），权威。
- F′ = 0（FF.dat 的 f′ 是原程序 bound 约定，无法从 Henke f₁ 换算；设 0 为保守近似）。

## 5. Kα1/Kα2 不叠加（已定案）

- `FF.dat` 每靶存 Kα1+Kα2 两列，但 **legacy 只用 Kα1**（不叠加 2:1 权重）。
- 证据：`samples/Al.xrd` 99.94°（Kα2(400) 应处）实测 I=18，与背景同量级，无卫星峰。
- 结论：`getDispersion` 取 Kα1 列、不叠加，**与 legacy 一致，不需改**。
- 原 P0 开放项关闭。

## 6. 维护代码

| 脚本 | 作用 |
|---|---|
| `scripts/extract_ff_dat.py` | 解码 FF.dat → `--json` / `--csv docs/data/ff_dat.csv` / `--show` |
| `scripts/gen_ff.py` | 生成 `ff_data.ts`（含 `FF_SYMBOLS`/`FF_LAMBDAS`/`FF_TABLE`/`FF_COLUMNS`） |
| `scripts/cross_validate_ff.py` | F′/F″ 物理自洽（L3 边感知阈值）；`--check-ce` 单查 Ce |
| `scripts/analyze_ff_impact.py` | 色散开/关对 Al/NaCl 强度的影响量化 |
| `scripts/gen_henke_dispersion.py` | 生成 `henke_dispersion.ts` |
| `scripts/gen_ion_dispersion.py` | 生成 `ion_dispersion.ts` |
| `scripts/dump_main_combos.py` / `scripts/dump_factor_dialog.py` | Win32 消息**只读**提取原程序下拉/列表框文本（λ 全列表、元素表实证；不写任何数据文件） |

## 7. 维护建议

- **改色散**：走 `DATA-REFERENCE.md` §3 Runbook A（重生成 + `cross_validate_ff.py` + `npm test`）。
- **Ce 缺陷**：保真保留 −1.087，仅注释标记；修正值 ≈−1.88 供物理优先场景（见 `audits/ff-dat-validation.md` §4 处置）。
- **新增离子权威 F′/F″**（若日后拿到）：走 Runbook C，fidelity 不动、extended 新增来源并注 `source`。
- **大数据**：`docs/data/ff_dat.csv`（553 行）放 `docs/data/`，MD 只引用。
