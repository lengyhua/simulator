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
| 已知缺陷 | **Ce(Z=58) Cu Kα1 f′ = −1.087 录入缺陷**（保真保留，修正 ≈−1.88）；**Er(Z=68) Cu Kα1 f″ = 9.943 录入缺陷**（保真保留，IUCr 3.937，`DATA-REFERENCE.md` §4 #14） |
| legacy 列选择（Ghidra 实证 2026-10-17） | 按 ComboBox **ItemIndex 硬编码 switch**（FUN_0047907c case 0–5），**不是**按 λ 最近匹配；FeKa1/FeKa 实读 **Co Kα1/Kα2 列**（λ/色散错配，#17）；两个加权项读 Kα2 列；MoKa1 笔误**不会**错配列 |
| 无权威源 | 离子 F′/F″（近似）、Cr/Fe Kα（Henke f″ + f′=0） |
| 汇编级全文 | [`ghidra-reverse-findings.md`](ghidra-reverse-findings.md)（G1–G12，含公式/常量/内存图） |

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

### 2.1 原程序 λ 下拉全列表（2026-10-17 Win32 提取 + Ghidra 列选择实证）

主窗口与 Search Factor 对话框共用同一 6 项列表（`scripts/dump_main_combos.py` 经 CB_GETLBTEXT 精确提取，非截图识字）。
「原程序实读列」= Ghidra 反编译 FUN_0047907c `switch(λ ComboBox ItemIndex)` 实证（2026-10-17）：

| # | 项 | λ (Å) | web 最近列规则 | 原程序实读列（Ghidra） |
|---|---|---|---|---|
| 0 | CuKa1 | 1.54056 | Cu Kα1（精确命中） | pair0 = **Cu Kα1** ✓ |
| 1 | CuKa（加权） | 1.54178 | Cu Kα1（Δ0.0012） | pair1 = **Cu Kα2** |
| 2 | FeKa1 | 1.93604 | Co Kα2（Δ0.143） | pair4 = **Co Kα1** ⚠ 错配 |
| 3 | FeKa（加权） | 1.93736 | Co Kα2（Δ0.144） | pair5 = **Co Kα2** ⚠ 错配 |
| 4 | MoKa1 | **0.71930** ⚠ 录入笔误（标准 0.70930） | Mo Kα2（Δ0.0057） | pair2 = **Mo Kα1**（列正确，λ 值错） |
| 5 | MoKa（加权） | 0.71073 | Mo Kα1（Δ0.0014） | pair3 = **Mo Kα2** |

- MoKa1 笔误已登记 `DATA-REFERENCE.md` §4 #11；web `LAMBDA_TABLE.Mo` 采用正确值 0.70930（**有意偏离原程序**）。
- web λ 表（Cu/Mo/Cr/Co/Fe 5 项）与原程序 6 项**结构不同**：原程序含 3 个加权平均项（CuKa/FeKa/MoKa）、无 Cr；web 有 Cr、无加权项。**2026-10-20 已补齐**：三个加权项以 `CUSTOM_LAMBDA_PRESETS` 形式加入（Cu Kα 加权 1.54178 / Fe Kα 加权 1.93736 / Mo Kα 加权 0.71073），legacy 6 项现已全部可选；Cr/Co/Ti/Al 作为 web-only 扩展保留（Co 虽不在 legacy λ 下拉，但 FF.dat 有列且被 FeKa1 错配读取，见上表）。是否「严格只保留 legacy 6 项」仍属 UI 产品决策，非物理差异。
- **Search Factor 对话框辐射靶下拉**：原程序与主窗口**共用同一 6 项 λ 列表**（`dump_factor_dialog.py` 提取），web 则按 FF.dat 的 6 个色散列展示（CuKa1/CuKa2/MoKa1/MoKa2/CoKa1/CoKa2）。两者数量巧合相同、覆盖同一份数据（legacy 经 ItemIndex switch 映射到同一批列），但只有 `CuKa1 1.54056` 完全重合；legacy 的 FeKa1/FeKa 实读 Co Kα1/Co Kα2 列却标 Fe，MoKa1 标 0.71930（笔误）——web 按真实列名/列波长显示，属**有意纠正标签**而非数据差异。
- **原程序 FeKa 色散行为已实证关闭**（Ghidra FUN_0047907c）：选 FeKa1/FeKa 时 F′F″ 复选框**不置灰**（FF.dat 存在即装载），实读 **Co Kα1/Co Kα2 列**——λ 用 Fe 值（1.93604/1.93736）而色散取 Co 值，构成 λ/色散来源错配（legacy latent bug，`DATA-REFERENCE.md` §4 #17）。以 Fe(Z=26) 为例：选 FeKa1 时程序用 f′=−2.052、f″=0.568（Co Kα1 列），而非任何 Fe Kα 物理值。
- **列选择机制**：按 ComboBox ItemIndex 硬编码 switch（case 0→pair0、1→pair1、2→pair4、3→pair5、4→pair2、5→pair3），**不存在按 λ 最近匹配的查列逻辑**。由此关闭两项旧推测：①「选 FeKa 复选框置灰」——错误，是静默错配；②「MoKa1 笔误导致错配 Mo Kα2 列」——错误，MoKa1（ItemIndex 4）实读 Mo Kα1 列（pair2），笔误只影响几何（峰位 ≈+1.4%），不影响色散列。

## 3. 组合公式：复数式（权威）

$$f = f_0 + F' + i\,F''\qquad\Rightarrow\qquad |F_{hkl}|^2=\Big|\sum_j \big(f_{0,j}+F'_j+iF''_j\big)e^{-B_j s^2}e^{i\phi_j}\Big|^2$$

- `help` 公式 (5) 标量式 $f_0+F'+\tfrac{0.5F''^2}{f_0+F'}$ 是 $|f|$ 的二阶 Taylor，**非 bug**（与复数差 ≤2e-5）。
- **多物种结构必须用复数式**：NaCl 弱峰 (311) 标量 vs 复数差可达 2–3%。
- 落地（`structure_factor.ts`）：`Re=A·cosφ−B·sinφ`，`Im=A·sinφ+B·cosφ`（A=f₀+ F′，B=F″）。
  ⚠ 只往 `im` 加 F″ 而漏 `re` 的 `−F″·sinφ` 项，对非中心对称结构（GaAs 200/222）有实误差。
- **Debye–Waller 只施加于 f₀**，F′/F″ 为 s 无关常数（ITC 标准，已实证）。
  ⚠ 但 legacy 代码实际把 DW 乘在**完整 f_eff**（含色散项）之后，宽于本条约定——见 §3.1。

### 3.1 legacy 代码标量式（Ghidra 实证，2026-10-17）

原程序**不用复数**：F′F″ 复选框开时先把色散折成实数标量，再做实数结构因子求和（`ghidra-reverse-findings.md` §2.2/§2.4，汇编 0x47894a–0x4789d8）：

$$f_{\text{legacy}} = f_0 + f' + \frac{0.5\,f''^2}{f_0 + f''}\qquad\text{（分母是 }f_0+f''\text{，不是 help 的 }f_0+F'\text{）}$$

且 Thermal 复选框开时，$e^{-Bs^2}$ 乘在**整个 $f_{\text{legacy}}$** 之后（0x4789dd–0x478a05：`FLD B; FCHS; FMUL s²; CALL exp; FMUL f_eff; FMUL occ`），再进 `Re/Im += f·cosφ/sinφ` 与 `|F|²=Re²+Im²`。

三者口径对照（以 Ce：f₀≈52、f′=−1.88、f″≈9.7 计，完整数据表见 `ghidra-reverse-findings.md` §2.2）：

| 来源 | 公式 | 数值 | 与精确模差 |
|---|---|---|---|
| **legacy 代码** | f₀+f′+0.5f″²/(f₀+**f″**) | 50.88 | −0.33% |
| help (5) | f₀+F′+0.5F″²/(f₀+**F′**) | 51.06 | +0.02% |
| 精确 / 项目 web | √((f₀+f′)²+f″²) | 51.05 | 0 |

→ 代码分母用 f″ 是独立于 help 的实现细节（疑作者笔误，保真优先应复现）。**fidelity 模式若追求逐位复刻，需按 legacy 标量式 + DW 乘整项实现**（是否纳入见 `DATA-REFERENCE.md` §5.1 开放项）；现行复数式与 legacy 的强度差量级：单原子 ≤0.4%，多物种弱峰更大。

**RTF 报表口径（2026-10-19 定案，`ghidra-reverse-findings.md` §8.19）**：
`ref-data/factors/001-Al.rtf`「Fo after F1 & F2」列与计算管线**同式**
（分母 f₀+F″），`001-Al.rtf` 三行数值对照残差 4.3e-8（= 报表 `%.9f`
显示截断）；早期「报表故意用 help (5) 字面（分母 f₀+F′）」的说法已作废。
help RTF 公式 (5) 字面分母 f₀+F′ 与程序实际实现（f₀+F″）确有差异，
属 help 文档转写误差（§8.15 同类），不影响 fidelity 口径（代码以字节
实读为准）。

**双路径指令级实证**（2026-10-17，`ghidra-reverse-findings.md` §2.2/§2.3/§2.12）：粉末（FUN_004787f8，0x47894a–0x47899a）与 single（FUN_0047c6a0，0x47c7f2–0x47c842）两条管线**逐指令同构**——`FADD f′` → `FLD 0.5; FMUL f″; FMUL f″` → `FLD f₀; FADD f″` → `FDIVP` → `FADDP`，f′/f″ 槽位（0x3958/0x3960+16j）由装载器 FUN_0047907c 实证。并行 Ghidra 分析曾得出「无分母项、0.5F′²」的冲突结论，已被原始汇编裁决证伪（根因：其线性反汇编器把 SIB 字节 0xc3 并入位移，颠倒 f′/f″）。DW 侧同理：`FLD B; FCHS; FMUL s²; CALL exp; FMUL f_eff; FMUL occ`——e^(−Bs²) 乘在已含色散项的完整 f_eff 上。

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
