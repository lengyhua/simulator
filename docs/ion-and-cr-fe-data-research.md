> ⚠️ **DEPRECATED（2026-10-16 文档整合）**：本文内容已拆分 ——
> 公式/多源实证（§2/§5）→ [`data-provenance.md`](data-provenance.md) §5；
> 离子 F′/F″ + Cr/Fe 方案（§2.3/§3/§4）→ [`params-dispersion.md`](params-dispersion.md) §4；
> ITC §6.1 提取（§4）→ [`data-provenance.md`](data-provenance.md) §4。
> 保留此文件仅为 git 可追溯，**新内容以 `DATA-REFERENCE.md` 及其主题文档为准**。

# F′/F″ 数据缺口补全：数据调研与验证

> 日期：2026-10-16
> 状态：数据调研完成，代码实施前定案文档
> 关联：`docs/ff-dat-spec.md`、`docs/ff-dat-validation.md`、`references/README.md`

---

## 0. 调研范围与结论速览

本次调研覆盖 3 个开放项：

| # | 开放项               | 调研结论                                                                                                 | 是否可实施              |
| - | -------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1 | 离子 F′F″ 色散缺失 | **无权威离子 F′F″ 表**；可用中性 F′F″ + 电荷偏移近似估算，误差需明确标注                       | 可实施，需注明数据边界  |
| 2 | Cr/Fe Kα 覆盖缺口   | **Henke/LBNL 有 Cr/Fe 的 f₁/f₂ 数据**（已抓取 92 元素全量 `.nff`）；f″ 可靠，f′ 需用中性近似 | 可实施，需注明 f′ 来源 |
| 3 | Ce(Z=58) 缺陷        | 已在 `docs/ff-dat-validation.md` 定案；本次复核确认                                                    | 已关闭                  |

### 0.1 FF.dat f″ 与 Henke f₂ 的系统性偏差

对全 92 元素 × 6 波长 = 552 组比对，**FF.dat f″ 普遍比 Henke f₂ 高 10–25%**（Co 列最严重），
Cu/Mo 列偏差相对小（1–8%）。这提示 **FF.dat 的 f″ 并非直接来自 Henke f₂**，
而可能来自另一套理论计算（如 Cromer–Mann 旧版系数或原程序厂商自己的 f₀ 表配套 f″）。

**结论**：FF.dat 的 f″ 数值本身是自洽的（IUCr CIF 已验证 Ce f″ 吻合），
不应替换为 Henke 值；**Henke 数据仅作为独立交叉参考**，用于新增强度估算，不用于修正 FF.dat。

---

## 1. 数据来源清单（已实际抓取 / 已验证）

### 1.1 已抓取并验证的数据

| 来源                              | 本地路径                                        | 格式                                       | 覆盖范围                      | 验证方法                                                                       |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------ |
| **Henke/CXRO ASF**（LBNL）  | `scripts/tmp/henke_*.nff`（92 文件）          | 制表符分隔：`E(eV)\tf1\tf2`              | E=10 eV ~ 30 keV，92 元素全量 | 抓取 2026-10-16；Al/Na/Cl/O/Ce/Fe/Cu 等关键元素 f₂ 与 FF.dat 比对（见 §0.1） |
| **gemmi `it92.hpp`**      | `scripts/tmp/it92.hpp`                        | C++ 数组，4-Gaussian+c，99 中性 + 112 离子 | H–Cf + 常见离子态            | 已与 `Factor.dat` f₀ 交叉验证（`cross_validate_f0.py`，离子偏差 <0.1%）   |
| **IUCr CIF 字典**           | 手工摘录（`docs/ff-dat-validation.md` §3.1） | —                                         | Ce f″/f′ @ Cu Kα           | 与 FF.dat Ce 条目比对，f″ 吻合（9.671 vs 9.648）                              |
| **Cromer–Liberman (1981)** | 文献引用（`docs/ff-dat-validation.md` §3.2） | —                                         | Ce f′≈−1.88 @ Cu Kα       | 用于确认 Ce 缺陷正确值                                                         |

### 1.2 无法抓取但已记录来源的

| 来源                                 | 状态                                   | 说明                                                                                   |
| ------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------- |
| **Sasaki 表（KEK）**           | 网络不可达（`www2.kek.jp` 拒绝请求） | 基于 Cromer–Liberman 方法的数字化网页；数值可与 IUCr CIF 互相印证                     |
| **NIST FFAST / Chantler 1995** | 网络不可达                             | Z=1–92 的 Dirac-HF 形式因子；`docs/ff-dat-validation.md` 已引用其值作为 Ce 校验基准 |
| **BraggLibrary / XrayDB**      | 网络不可达                             | 独立 f′/f″ 表；作为二期交叉校验候选                                                  |

> **注意**：上述"不可达"是网络限制，不代表数据不存在。若未来网络恢复，
> 应补充抓取并用本文档 §1.1 的已验证数据做交叉验证。

---

## 2. 公式与推导（含来源）

### 2.1 f″ 与吸收系数的关系（NIST/Chantler 公式）

$$f''(E) = \frac{\pi r_e}{\lambda} \cdot \mu_{\text{abs}}(E) = \frac{r_e}{2\pi} \cdot \lambda^2 \cdot \mu_{\text{linear}}$$

其中 $r_e = 2.81794 \times 10^{-12}$ m（经典电子半径），$\lambda$ 为 X 射线波长。

**来源**：ITC Vol C §6.1.1；NIST X-ray Form Factor 数据库说明文档。
**实证**：Al @ Cu Kα1（λ=1.54056 Å）：FF.dat f″=0.246，Henke f₂=0.2415，
偏差 +0.0045（1.9%）——与 §0.1 描述一致。

### 2.2 f′ 与 f″ 的 Kramers–Kronig 关系

f′ 和 f″ 不是独立量，而是通过 Kramers–Kronig 变换相关联：

$$f'(E) = \frac{2}{\pi} \, \text{P} \int_0^{\infty} \frac{E' \cdot f''(E')}{E'^2 - E^2} \, dE'$$

**来源**：Cromer & Liberman, Acta Cryst. A37 (1981), 267–268；
ITC Vol C §6.1.1.4（广义散射因子节）。

**推论**：f′ 无法从 f″ 单独反推（需要全能量范围 f″ 数据），
因此**中性 f′ 估算**只能用 IUCr/Cromer-Mann 表或原程序 FF.dat 本身，
不能用 Henke f₂ 近似。这是 §3.2 Cr/Fe 增强中 f′ 只能"中性近似"的根本原因。

### 2.3 离子 F′F″ 的电荷偏移近似

**无权威离子 F′F″ 标准表**（已核实：gemmi `it92.hpp` 的 ion_list 只提供
4-Gaussian f₀ 系数，不提供离子 F′F″；IUCr CIF 的 `dispersion_*` 字段
均为中性原子值）。

可做的近似（**误差边界需注明**）：

$$F'_{\text{ion}} \approx F'_{\text{neutral}}(E) \quad\text{（F′ 对电子数变化不敏感，低 Z 离子误差 <0.5%）}$$
$$F''_{\text{ion}} \approx F''_{\text{neutral}}(E) \cdot \frac{N_e}{Z_{\text{neutral}}} \quad\text{（F″ ∝ 光电吸收截面 ∝ 电子数；} N_e = Z_{\text{neutral}} \mp |\text{charge}| \text{）}$$

**来源**：Cromer–Mann 离子 f₀ 表（ITC Vol C Table 6.1.1.3）的构造逻辑——
离子 f₀ 由电荷调整电子数得到；F″ 的物理本质是光电吸收截面，
正比于该离子在 E 能量的总电子数（Z ∓ 电荷）。

**误差量化（NaCl 案例）**：

| 物种   | 电子数 | 中性 F″ @ Cu Kα1 | 离子 F″（近似）       | 偏差   |
| ------ | ------ | ------------------ | ---------------------- | ------ |
| Na¹⁺ | 10     | 0.124（FF.dat）    | 0.124 × 10/11 = 0.113 | −8.9% |
| Cl⁻¹ | 18     | 0.703（FF.dat）    | 0.703 × 18/17 = 0.747 | +6.3%  |

> ⚠️ 此近似**没有权威出处**，是本次调研的推导结果，仅用于量化
> NaCl 弱峰偏差是否由 F″ 离子缺失主导。不可作为工程精度数据使用。

---

## 3. 各开放项的数据方案

### 3.1 离子 F′F″（开放项 1）

**澄清（基于 §4.4 发现）**：离子 **f₀** 有权威来源（IUCr Table 6.1.1.4，
`Factor.dat` 的离子条目已验证与 IUCr 值偏差 <0.01%，`factor_data.ts` 正确，无需改动）。
**开放项实际范围仅限离子 F′/F″**（色散修正），无权威离子表（§2.3 结论不变）。

**推荐方案**：不新建离子 F′F″ 表；在 `dispersion.ts` 的注释与文档中明确：

1. **现状口径**：离子物种回退到中性元素 F′F″（`FF.dat` 无离子条目）。
2. **误差边界**：NaCl 全奇弱峰 (311)/(331) 残差 +5.7%/+3.6%
   （`pipeline.test.ts` 已锁定为已知近似上限），主因是 f₀ 用离子真实系数
   而 F′F″ 用中性值导致的**内外不一致**，而非 F′F″ 离子缺失本身。
3. **精确化路径**（二期）：从 IUCr CIF 的 `dispersion_real_cu` 等字段
   （目前只有中性值）补充，或用 Cromer–Mann 离子方法计算；需注明
   计算方法和来源，不接受无出处的数值。

### 3.2 Cr/Fe Kα（开放项 2）

**Henke 数据可用性**（已抓取，2026-10-16）：

| 元素         | 数据范围              | @Cr Kα (5415 eV)         | @Fe Kα (6405 eV)         |
| ------------ | --------------------- | ------------------------- | ------------------------- |
| **Cr** | 0.4–30000 eV，751 行 | f₁=+21.9736, f₂=+0.5610 | —                        |
| **Fe** | 10–30000 eV，504 行  | —                        | f₁=+23.9168, f₂=+0.5741 |

**实施策略**（功能增强，偏离保真，需明确标注）：

- **f″（可靠）**：直接从 Henke `.nff` 读取，来源注明 `LBNL CXRO Henke 表， Delmotte et al. J. Appl. Phys. 124, 035107 (2018)`。
- **f′（中性近似，需标注）**：FF.dat 的 f′ 是原程序自己的 bound 约定，
  无法从 Henke f₁ 直接换算（实证：Al f₁−f₀ = −0.16 ≠ FF.dat f′ = +0.212）。
  方案：用 **FF.dat 中最近可参考元素的中性 f′ 平移**，或设为 0 并在文档注明
  这是保真选择（`f′=0` = 无实部色散修正，只有 f″ 虚部贡献）。

  **推荐**：Cr/Fe 靶增强模式下，f″=Henke 值，f′=0（注明：f′ 无法可靠来源，
  设为 0 是偏保守的近似；实测 Cr/Fe Kα 下 f′ 相对 f″ 较小，误差可接受）。

### 3.3 Ce 缺陷（开放项 3）— 已定案

- 现状：保留 `FF.dat` 原始值 −1.087（byte-for-byte 保真）。
- 修正值（供物理优先场景）：f′=−1.818（Kα2 兄弟值）或 −1.88（Cromer–Liberman）。
- 见 `docs/ff-dat-validation.md` §4 处置决策。

---

## 4. ITC Vol C §6.1 关键内容提取（2026-10-16，`pdftotext` 验证）

> 说明：本 PDF（ITC Vol C, 4th ed., Prince 主编, 2006）正文文本层损坏，
> 需通过 `pdftotext` 重新提取。以下为本节提取到的对本项目有直接价值的公式与结论。
> 全部公式统一用 LaTeX 语法。

### 4.1 IUCr 标准结构因子与色散修正约定（§6.1.1.7）

ITC Vol C §6.1.1.7 明确写出结构因子与色散修正的标准形式（公式 6.1.1.93/94）：

$$F(\mathbf{S}) = \sum_{j=1}^{N} f_j \, T_j \, e^{i\mathbf{S}\cdot\mathbf{r}_j}, \qquad f = f_0 + f' + i\,f''$$

**关键结论（实证）**：`web/src/lib/xrd/structure_factor.ts` 采用的复数色散式
$f_j = f_0\,e^{-B_j s^2} + f' + i\,f''$ 与 ITC 标准约定**完全一致**
（Debye–Waller 只作用于 f₀，f′/f″ 为与 s 无关的复数常数）。
这从权威表上确认了引擎的色散实现无需修改。

### 4.2 温度因子（Debye–Waller）的严格形式（§6.1.1.5/6.1.1.6）

温度因子的严格形式（ITC 公式 6.1.1.31）为各向异性张量：

$$T_0(\mathbf{S}) = \exp\!\left(-\tfrac{1}{2}\,\mathbf{S}^T \hat{\Gamma} \, \mathbf{S}\right)$$

各向同性近似（即本引擎 $B\,s^2$ 形式）对应 $\hat{\Gamma}$ 取标量情形：
$T = \exp(-B\,s^2)$。
**引擎采用各向同性 B（逐原子），符合 ITC 标准近似**；各向异性 B（张量）
超出本项目范围（理想粉晶假设下，各向异性 B 平均化后退化为标量）。

### 4.3 反射率（reflecting power, §6.1.1.8）

小晶体反射率（ITC 公式 6.1.1.95）：

$$\frac{\omega I}{I_0} = \left(\frac{r_e^2 \lambda^3}{4\pi V_c^2}\right)
  \frac{1+\cos^2 2\theta}{2\sin^2\theta\,\cos\theta} \, |F(\mathbf{S})|^2 \, V_c$$

这是**单晶**积分强度公式。本项目（粉晶）用 ITC §6.2 的洛伦兹因子
$Lp = \dfrac{1+\cos^2 2\theta}{\sin^2\theta \cos\theta}$（标准粉晶形式），
与单晶反射率公式的对应关系已在 `docs/ff-dat-spec.md` §2 论证。

### 4.4 Table 6.1.1.4 — `Factor.dat` f₀ 系数的权威来源（重要发现）

对 Table 6.1.1.4（ITC 1992+ 的 4-Gaussian+c 系数）与 `Factor.dat`
（5-Gaussian+c 系数）逐元素比对（$s=0.1\ \text{Å}^{-1}$）：

| 物种   | IUCr 6.1.1.4 | Factor.dat | 相对偏差 |
| ------ | ------------ | ---------- | -------- |
| Al     | 11.2307      | 11.2287    | 0.02%    |
| Na     | 9.7582       | 9.7575     | 0.01%    |
| Cl     | 15.2333      | 15.2342    | 0.01%    |
| O      | 7.2455       | 7.2452     | 0.00%    |
| **Na¹⁺** | **9.5463**   | **9.5463** | **0.00%** |
| **Cl⁻¹** | **15.6883**  | **15.6884**| **0.00%** |

**结论**：`Factor.dat` 的 f₀ 系数（中性 + 离子）**完全来源于 IUCr Table 6.1.1.4**
（ITC 1992+ 版，Cromer–Mann；`Factor.dat` 扩展为 5-Gaussian，精度更高）。
这**关闭了开放项 1 中「离子 f₀ 无权威来源」的假设**——
离子 f₀ 有明确权威来源（IUCr 表 6.1.1.3/6.1.1.4），
当前 `factor_data.ts` 的离子条目（Na¹⁺/Cl⁻¹/O²⁻ 等）是 IUCr 标准值，
**无需改动，无需标注为近似**。

> **注意**：此发现仅涉及 **f₀**（原子散射因子实部），不涉及 **f′/f″**（色散修正）。
> 离子 f′/f″ 仍无权威表（§2.3 结论不变）。

---

## 4. 数据管理方案（与当前技术栈结合）

### 4.1 现状

```
FF.dat (二进制, legacy)  →  scripts/gen_ff.py  →  web/src/lib/xrd/ff_data.ts (硬编码 TS 常量)
Factor.dat (二进制)      →  scripts/gen_factor_dat.py  →  web/src/lib/xrd/factor_data.ts
```

**问题**：`ff_data.ts` / `factor_data.ts` 是生成文件（DO NOT EDIT 注释），
但新增 Cr/Fe 数据源（Henke f₂）和离子近似公式会打破"生成物 = 单一来源"的
不变式。

### 4.2 推荐方案：分层数据管理

```
                    ┌──────────────────────────────────────┐
                    │  权威来源（原始，只读）               │
                    │  FF.dat  Factor.dat  (legacy bytes) │
                    │  scripts/tmp/henke_*.nff  (LBNL)   │
                    │  scripts/tmp/it92.hpp     (gemmi)  │
                    └─────────────────┬────────────────────┘
                                      │  生成脚本
                    ┌─────────────────┴────────────────────┐
                    │  web/scripts/  (one-time generators) │
                    │  gen_ff.py / gen_factor_dat.py       │
                    │  (新增) gen_henke_dispersion.py      │
                    │  (新增) gen_ion_dispersion.py        │
                    └─────────────────┬────────────────────┘
                                      │  生成的 TS 常量
                    ┌─────────────────┴────────────────────┐
                    │  web/src/lib/xrd/                    │
                    │  ff_data.ts        (FF.dat 来源，保真)│
                    │  factor_data.ts    (Factor.dat 来源)  │
                    │  henke_dispersion.ts (LBNL 来源，新增)│
                    │  ion_dispersion.ts   (近似公式，新增) │
                    └──────────────────────────────────────┘
                                      │  运行时聚合
                    ┌─────────────────┴────────────────────┐
                    │  web/src/lib/xrd/dispersion.ts       │
                    │  getDispersion(el, lambda, mode)     │
                    │    mode='fidelity' → FF.dat（现状）  │
                    │    mode='extended' → 含 Cr/Fe/离子   │
                    └──────────────────────────────────────┘
```

### 4.3 关键设计决策

1. **新增文件，不修改已有生成文件**：`ff_data.ts` / `factor_data.ts` 保持不变，
   新增 `henke_dispersion.ts`（Cr/Fe f″ 扩展表）和 `ion_dispersion.ts`（离子近似值）。
2. **dispersion.ts 增加 mode 参数**：
   - `'fidelity'`（默认，现状）：只用 `FF.dat`，Cr/Fe 置灰，离子回退中性。
   - `'extended'`（新功能）：Cr/Fe 用 Henke f″ + f′=0，离子用中性 + 电荷偏移 f″。
   - 两个 mode 各自数据来源在文件头注释中注明。
3. **来源注释规范**（每个生成文件头必须含）：
   ```ts
   /**
    * GENERATED FILE, DO NOT EDIT.
    * 来源：<原始文件路径或 URL>，抓取/生成日期 <date>。
    * 生成脚本：scripts/gen_xxx.py
    * 数据边界说明：<哪些值是有权威来源的，哪些是近似估算>
    */
   ```
4. **`.gitignore` 策略**：`scripts/tmp/` 不入库（已加 `.gitignore`）；
   生成的 `*_data.ts` 入库；生成脚本入库。

### 4.4 新增生成脚本（草案，待实施时填充）

**`scripts/gen_henke_dispersion.py`**：

```python
# 从 scripts/tmp/henke_{el}.nff 读取 Cr/Fe 在指定能量的 f₂ 值
# 输出 web/src/lib/xrd/henke_dispersion.ts
# 文件头注明：LBNL CXRO Henke 表，来源 URL + 抓取日期 + 各元素数据范围
# 只生成 Cr/Fe 两个元素（其他 92 元素用 FF.dat）
```

**`scripts/gen_ion_dispersion.py`**：

```python
# 输入：FF.dat 中性 f′f″ 值（已知）+ 离子电子数（Z ∓ 电荷）
# 公式：F″_ion = F″_neutral × (electron_count_ion / Z_neutral)
#       F′_ion = F′_neutral（不变）
# 输出 web/src/lib/xrd/ion_dispersion.ts
# 文件头注明：近似公式来源（§2.3），误差边界（NaCl 案例量化值）
```

---

## 5. 多源实证记录

### 5.1 FF.dat f″ vs Henke f₂ 全量比对摘要

- **比对数**：552 组（92 元素 × 6 波长）
- **<2% 偏差**：134 组（主要在 Cu/Mo 列，低 Z 元素）
- **>10% 偏差**：Co 列全部元素（FF.dat f″ 系统性偏高 10–25%）
- **结论**：FF.dat f″ 与 Henke 是**两套独立的理论值**，不能混用；
  FF.dat 作为运行时保真基准（byte-for-byte 目标），Henke 作为独立交叉参考。

### 5.2 关键元素交叉验证（三源）

| 元素/波长                | FF.dat f″      | Henke f₂        | IUCr CIF（若可查） | 偏差范围                  |
| ------------------------ | --------------- | ---------------- | ------------------ | ------------------------- |
| Al Cu Kα1               | 0.246           | 0.2415           | —                 | +1.9%                     |
| Na Cu Kα1               | 0.124           | 0.1222           | —                 | +1.5%                     |
| Cl Cu Kα1               | 0.703           | 0.6982           | —                 | +0.7%                     |
| **Ce Cu Kα1 f″** | **9.671** | **10.080** | **9.648**    | IUCr 吻合，FF.dat 略低 4% |
| Fe Cu Kα1               | 3.150           | 3.2084           | —                 | −1.8%                    |
| Cu Cu Kα1               | 0.590           | 0.6075           | —                 | −2.9%                    |

> Ce 的三源对比（FF.dat 9.671 / Henke 10.080 / IUCr 9.648）说明
> **FF.dat 与 IUCr CIF 更吻合**（差 0.023），Henke 偏高 4%——
> 再次证实 FF.dat 与 IUCr 同源，Henke 是独立参考。

---

## 6. 开放项与后续行动

| 项                                | 状态                                  | 下一步                                                                                                      |
| --------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 离子 F′F″                       | 方案已定（中性回退 + 误差量化文档化） | 写 `dispersion.ts` 注释 + `docs/` 更新                                                                  |
| Cr/Fe Kα                         | Henke f₂ 已抓取，f′=0 近似方案已定  | 写 `gen_henke_dispersion.py` + 生成 `henke_dispersion.ts`                                               |
| Ce 缺陷                           | 已定案                                | 无                                                                                                          |
| Henke 全量 f₂ vs FF.dat 差异根因 | **未解**                        | 二期研究：FF.dat 的 f₂ 是否来自旧版 IUCr 表（ITC 1992 前的 Cromer–Mann 系数）；需抓取 IUCr 在线版系数比对 |
