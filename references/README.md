# Atomic Scattering Factors — 项目参考资料总览

> 本文件整合 CalcXRD 项目中与**原子散射因子 f₀** 及**反常色散 F′/F″** 相关的全部权威来源、
> 开源库、在线工具，以及本项目的实际口径与 A/B 交叉验证方案。
> 纯参考文档，不驱动代码；与 `CLAUDE.md`、`docs/ff-dat-spec.md`、`docs/ff-dat-validation.md`、
> `docs/physics-audit.md` 交叉引用。

---

## 目录

1. [核心概念与公式](#1-核心概念与公式)
2. [权威数据来源](#2-权威数据来源)
3. [在线查询/计算工具](#3-在线查询计算工具)
4. [开源库生态](#4-开源库生态)
5. [本项目口径映射](#5-本项目口径映射)
6. [A/B 交叉验证方案](#6-ab-交叉验证方案)
7. [开放项与已知缺陷](#7-开放项与已知缺陷)

---

## 1. 核心概念与公式

### 1.1 f₀：角度相关的中性原子散射因子

```
f₀(s) = Σᵢ₌₁..₅ aᵢ·exp(−bᵢ·s²) + c,    s = sinθ/λ  [Å⁻¹]
```

- **自检**：`f₀(0) = Σaᵢ + c` = 电子数（中性 Z；离子 Z ∓ 电荷）。
  本仓库 `Factor.dat`（199 物种）中 180/199 满足（差 <1e-3），余 19 条因表内四舍五入差 ≤0.038。

### 1.2 热振动因子（Debye–Waller / B 因子）

```
f = f₀ · exp(−B·s²)
```

- `.cord` 第 7 个原子字段即热因子 B（非占位率，早期文档误标）。
- Web 引擎默认 B=0.9（对 `samples/Al.xrd` 标定值；`docs/physics-audit.md` 记录 B=1.0 为色散开启时的最优值）。

### 1.3 反常色散修正 F′/F″

```
严格复数形式：  f = f₀ + F′ + i·F″
标量近似（原程序 help 公式 5）：f = f₀ + F′ + 0.5·F″²/(f₀ + F′)
```

- 两者数值差 ≤2e-5，公式 (5) 非 bug（`docs/ff-dat-validation.md` §0 已证明）。
- 但标量式在**多物种结构**下与复数式不等价；引擎采用**复数式**。

---

## 2. 权威数据来源

### 2.1 International Tables for Crystallography, Volume C

**「Mathematical, Physical and Chemical Tables」**（E. Prince ed., 4th ed., Kluwer, 1992；IUCr 在线版）。
绝大多数晶体学软件 f₀ 系数（CCP4 `atomsf.lib`、cctbx `it1992`、Gemmi `it92.hpp`、BraggLibrary）的上游。

本仓库 PDF 的相关表（正文含可提取但**有缺陷**的文本层，扫描+OCR 混合）：

| 表号                    | 内容                                                      | 对应本项目                                                                                     |
| ----------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Table 6.1.1.1** | 自由原子 f₀（按 sinθ/λ 采样）                          | f₀ 权威采样值，可用于交叉验证 `Factor.dat`                                                  |
| **Table 6.1.1.3** | 化学相关离子 f₀（113 物种：O²⁻、Na⁺ 等）            | **已提取为 `docs/itc-c-table6113.json`**（补上离子 f₀ 权威来源，见 `docs/itc-c-table6113-extraction.md`） |
| **Table 6.1.1.4** | 解析近似系数（Cromer–Mann 4-Gaussian+c）             | `f₀(s)=Σaᵢexp(−bᵢs²)+c` 的**标准系数来源**；`cronie_data.ts`（仅测试）手抄此表 |
| Table 6.1.1.5           | 高 s 区间修正（2<s/λ<6 Å⁻¹）                          | 本项目暂未使用                                                                                 |
| §6.1.1.1–.3           | Rayleigh/Compton/原子散射因子理论                         | 背景                                                                                           |
| §6.1.2 / Part 4        | 中子相干/非相干散射长度                                   | 与 XRD 项目无关，仅记录                                                                        |
| §6.1.1 公式           | 第 6.1 章全部公式（LaTeX 统一）                          | **`docs/itc-c-formulas.md`**（含 f₀ 近似、温度因子、结构因子、色散、Lp、强度/峰形） |

> **注意**：本仓库 PDF 正文**可**用 pypdf 提取文本层，但该层是二维表
> 线性化结果，存在**列粘连**（`6.9248.3748.751`=6.924/8.374/8.751）与
> 页底 s 行交错两类缺陷——首版提取出 49 处单调性违例。故**逐值数据源**
> 改用 Gemmi `it92.hpp`（ITC-1992 系数，权威机读镜像），PDF 仅作来源标注。
> 详见 `docs/itc-c-table6113-extraction.md` §2。

### 2.2 其它可检索权威源（文献/字典）

| 来源                                   | 内容                                                        | 备注                                                                         |
| -------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **IUCr CIF 字典**（online）      | 各元素在指定辐射下的 F′/F″ 标准值                         | `FF.dat` 虚部 f″ 已与其交叉校验吻合（`ff-dat-validation.md` §3.1）     |
| **Cromer & Liberman (1981)**     | 基于 Dirac–Slater 自洽波函数的反常色散系数（现代计算基准） | 用于修正 `FF.dat` 中 Ce 缺陷的参考值（f′≈−1.88, f″≈9.74 @ Cu Kα）    |
| **Brennan & Cowan (1992)**       | X 射线吸收/反射/衍射计算程序（Rev. Sci. Instrum. 63, 850）  | 算法内置于 APS、SSRL 等中心；支持任意波长 f′/f″                            |
| **BraggLibrary / XrayDB / CVIP** | 独立 F′/F″ 表                                             | 二期交叉校验 Z≈55–62 区段候选（`physics-audit.md` §2）                  |
| **Gemmi `it92.hpp`**           | ITC Vol C 1992+ 系数的 C++ 源码版                           | 与 CCP4/cctbx 同源；`scripts/gen_cronie.py` 以其为 `cronie_data.ts` 上游 |

---

## 3. 在线查询/计算工具

> 以下工具**均需输入元素符号 + 能量 (eV) 或波长 (Å)**，直接返回 f′、f″ 数值或曲线。
> 是 `FF.dat` 的独立验证/补全首选来源。

| 工具                           | 维护机构                  | 方法/数据源                                            | 链接                                                            | 建议用途                             |
| ------------------------------ | ------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------ |
| **Sasaki Table**         | 日本 KEK / Photon Factory | Sasaki 1987；Cromer–Liberman 方法                     | `https://www2.kek.jp/imss/pf/tools/sasaki/sinram/sinram.html` | Cu/Mo/Co Kα 常规波长验证 `FF.dat` |
| **CXRO / Henke 表**      | LBNL / 先进光源 (ALS)     | Henke 表（Gullikson 维护），100 eV–1 MeV 连续曲线     | `https://henke.lbl.gov/optical_constants/asf.html`            | 同步辐射任意能量；曲线可下载         |
| **NIST FFAST**           | NIST                      | Chantler 1995；Z=1–92, 1 eV–1 MeV Dirac-Hartree-Fock | `https://physics.nist.gov/PhysRefData/FFast/html/form.html`   | 高精度独立验证                       |
| **APS 7-ID Calculators** | ANL / 先进光子源          | 晶体 Bragg 峰、相干性、反常校正几何                    | `https://7id.xray.aps.anl.gov/calculators/`                   | 辅助工具                             |
| **Brennan–Cowan**       | SSRL / NIST               | Brennan & Cowan 1992（需本地运行程序）                 | `https://pubs.aip.org/aip/rsi/article/63/1/850/367736`        | 离线批量计算                         |

> **使用约束**：以上工具**均只支持中性元素的 F′/F″**，不支持离子条目（与 `FF.dat` 限制一致）。

---

## 4. 开源库生态

> ⚠️ 结论先行：**结构容器类库（diffpy.structure）本身不提供散射因子**。
> 要查/算 f₀、F′/F″ 必须搭配带 `ScatteringFactor` 能力的组件。

### 4.1 diffpy 家族（Python）

| 包                         | 定位                                        | f₀ / F′F″ 能力                                                                                                                    | 链接                                           |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **diffpy.structure** | 纯几何容器（Atom/Structure/Lattice/对称性） | ❌ 无 f/f′/f″ 接口                                                                                                                 | `https://github.com/diffpy/diffpy.structure` |
| **diffpy.srreal**    | PDF/结构因子拟合                            | `SFTXray.lookup(element, Q)` — Waasmaier–Kirfel 近似（ITC 同源），支持 `setCustom` 覆写；**仅实值，无 F′/F″ 复数接口** | `https://github.com/diffpy/diffpy.srreal`    |
| **diffpy.pdffit2**   | 单元素 get/set 覆写                         | `get_scat(stype, element)` / `set_scat(stype, element, value)`，无 Q 依赖，无 F′/F″                                            | `https://github.com/diffpy/diffpy.pdffit2`   |

**srreal 关键 API（供 Python 离线脚本参考）：**

```python
from diffpy.srreal.scatteringfactortable import SFTXray
t = SFTXray()
t.lookup("Na", 0.1)   # Q 可为 float 或 NumPy 数组
t.setCustom("Fe", 25.9)  # 覆写某元素 f₀
t.resetAll()
```

### 4.2 diffsims（电子衍射域）

- 面向**电子衍射**（电镜模拟）；`get_kinematical_atomic_scattering_factor` 结合
  diffpy.structure `Atom` + 内建参数表（Lobato 或 ITC）。
- **与 XRD f₀ 数值表不通用**，仅作概念参考。
- 链接：`https://github.com/diffpy/diffsims`

### 4.3 Gemmi（C++）

- `it92.hpp` 包含 ITC Vol C 1992+ 的 92 个中性元素系数（Cromer–Mann 4-Gaussian+c）。
- 本项目 `scripts/gen_cronie.py` 解析此文件生成 `cronie_data.ts`（仅测试用）。
- 链接：`https://github.com/project-gemmi/gemmi`（`include/gemmi/it92.hpp`）

### 4.4 一句话选型

| 需求                                  | 推荐                                                                |
| ------------------------------------- | ------------------------------------------------------------------- |
| 标准元素 X 射线 f₀（Q 依赖，Python） | `diffpy.srreal.SFTXray.lookup`                                    |
| 自定义/覆写某元素 f₀                 | srreal `setCustom*` 或 pdffit2 `set_scat`                       |
| 反常色散 F′/F″                      | DiffPy 家族**均不覆盖** → 用 §3 在线工具或本项目 `FF.dat` |
| 离子 f₀（本项目）                    | 只有 `Factor.dat`（199 物种含离子）覆盖                           |
| 离子 F′/F″（开放项）                | **已实现**：`ion_dispersion.ts`（电荷偏移近似，无权威源，误差量化见 research doc §2.3）；`dispersion.ts` extended 模式 |

---

## 5. 本项目口径映射

| 物理量                   | 权威表/上游                   | 本项目运行时来源                                       | 生成脚本                      |
| ------------------------ | ----------------------------- | ------------------------------------------------------ | ----------------------------- |
| f₀（含离子）            | ITC Vol C 6.1.1.1/.3/.4       | `Factor.dat`（199 物种）→ `factor_data.ts`        | `scripts/gen_factor_dat.py` |
| F′/F″（中性）          | IUCr CIF / Cromer–Liberman   | `FF.dat`（92 元素×6 波长）→ `ff_data.ts`         | `scripts/gen_ff.py`         |
| f₀ 手抄对照表（仅测试） | Gemmi `it92.hpp`（ITC1992） | `cronie_data.ts`                                     | `scripts/gen_cronie.py`     |
| Wyckoff 位置/消光        | ITC Vol A/B（254 空间群）     | `Wyckoff` / `Wyckoff_Point` → `wyckoff_data.ts` | `scripts/gen_wyckoff.py`    |

> 引擎（`web/src/lib/xrd/`）运行时**只读** `Factor.dat`/`FF.dat` 生成的 `*_data.ts`；
> `cronie_data.ts`（手抄 IUCr）**仅供测试交叉验证**，引擎不引用。

### 5.1 Factor.dat 与 UI 系数表（AL-Factor.png）的关系

原程序 UI 中的「Search Factor and F′/F″」窗口（见 `AL-Factor.png`）显示：

- 系数表列：`a1 b1 a2 b2 a3 b3 a4 b4 a5 b5 c F1 F2`，其中 **F1/F2 列对应 F′/F″**。
- 对 Al（Mo Kα1）：`c=0.139509, F1=0.064, F2=0.052`。
- **注意**：该界面表是**运行时拟合**（显示给用户看），**不落盘**；运行时唯一事实来源是 `Factor.dat`。
- AL-Factor.png 截图中 Al 的 c 列值（0.139509）与 `Factor.dat` 中 Al 的 c 值（0.1395）**一致**，验证了数据同源。

---

## 6. A/B 交叉验证方案

> 本方案用于：(a) 验证 `Factor.dat`/`FF.dat` 的数值正确性；(b) 定位录入缺陷；(c) 二期补全离子色散。

### 6.1 f₀ 交叉验证矩阵

| 验证方式（A）                                | 对比基准（B）                                  | 预期结果                      | 适用场景                 |
| -------------------------------------------- | ---------------------------------------------- | ----------------------------- | ------------------------ |
| `Factor.dat` 系数直接求 `f₀(0)=Σaᵢ+c` | 电子数 Z（中性）/ Z∓charge（离子）            | 差 <0.04（表内量化误差）      | 自检，180/199 通过       |
| `Factor.dat` 系数求 `f₀(s=0.1)`         | `diffpy.srreal.SFTXray.lookup(element, 0.1)` | 差 <5%（两表可能不同版本）    | 外部独立验证             |
| `cronie_data.ts`（手抄 IUCr）求 `f₀(s)` | `Factor.dat` 同 s 值                         | 同元素差 <1e-3                | 测试交叉验证（两表同源） |
| `Factor.dat` 离子系数（Na1+）              | 中性 Na 系数缩放 ≈ Z±charge/Z                | 差 <10%（离子化改变电子分布） | 定性检查                 |
| `Factor.dat` Al f₀(0.1) @ Mo Kα1         | AL-Factor.png 界面表 c 列 + 曲线               | 差 <1%                        | UI 取证                  |

### 6.2 F′/F″ 交叉验证矩阵

| 验证方式（A）                            | 对比基准（B）                        | 适用场景         | 当前结果                                           |
| ---------------------------------------- | ------------------------------------ | ---------------- | -------------------------------------------------- |
| `FF.dat` Ce (Z=58) Cu Kα1 f′         | IUCr CIF 字典 `dispersion_real_cu` | 定位录入缺陷     | −1.087 ❌ vs 正确 ≈−1.88（validation 文档 §3） |
| `FF.dat` Ce Cu Kα2 f′                | IUCr CIF 字典                        | 兄弟条目自洽验证 | −1.818 ✅ 正确量级                                |
| `FF.dat` Ce f″                        | IUCr CIF `dispersion_imag_cu`      | 虚部独立性验证   | 9.671 vs 9.648 ✅（差 0.023，量化误差）            |
| `FF.dat` Ce f′/f″                    | Sasaki Table / NIST FFAST（§3）     | 多源一致性       | 待执行                                             |
| `FF.dat` Z-trend（Ba→La→Ce→Pr→Nd） | Kα1/Kα2 能量差 ~20 eV 自洽性       | 内部一致性       | La/Pr 自洽 ✅，Ce Kα1 孤立即断                    |
| `FF.dat` 全 92 元素 f″                | NIST FFAST 批量                      | 全面校验         | 待执行（二期）                                     |

### 6.3 推荐的 Python 自动化脚本（已落地）

以下两个脚本已完成并可直接运行（需先 `curl` 下载 gemmi `it92.hpp` 到
`scripts/tmp/it92.hpp`，已提交于 2026-10-16）：

```bash
# 1. f₀ 交叉验证（Factor.dat vs gemmi it92.hpp）
python3 scripts/cross_validate_f0.py           # 全量
python3 scripts/cross_validate_f0.py --minimal # 只打印偏差 > 2% 的元素

# 2. F′/F″ 交叉验证（FF.dat vs IUCr/物理一致性）
python3 scripts/cross_validate_ff.py           # 全量
python3 scripts/cross_validate_ff.py --check-ce # 只查 Ce
```

**关键结果（2026-10-16 运行确认）**：
- f₀：92 中性元素全通过（f₀(0)≈Z）；离子 f₀ 与 IUCr 偏差 <0.1%（Bi5+ s=0.3 为 5-Gaussian 截断边缘效应，1.3%）；唯一中性偏差是 H s=0.5（31%，4-Gaussian 截断已知边缘效应，非数据错误）。
- F′/F″：Ce 缺陷复核确认（Δf'=+0.79）；Kα1/Kα2 自洽扫描发现 Dy/Eu/Gd/Ho/Lu/Tm 的 Cu 列 Δf' 较大，经 L3 吸收边核算（`cross_validate_ff.py` 物理感知阈值）确认为**物理正常**（这些元素 L3 边距 Cu Kα1 <2 keV），非数据缺陷。Ce 缺陷是唯一无法用物理自洽性解释的异常值。

---

## 7. 开放项与已知缺陷

| # | 开放项                                   | 影响                                                 | 现状                            | 备注                                      |
| - | ---------------------------------------- | ---------------------------------------------------- | ------------------------------- | ----------------------------------------- |
| 1 | **离子 F′/F″ 缺失**              | 离子化合物（NaCl、BaTiO₃ 等）弱峰强度偏差最大 ~5.7% | **已实现 extended 模式（2026-10-16）**：`ion_dispersion.ts`（电荷偏移近似表，来源标注 `approximation`，误差边界 NaCl Na¹⁺ −8.9% / Cl⁻¹ +6.3%）；默认 fidelity 模式仍回退中性值 | 无权威离子 F′F″ 表，近似公式见 `docs/ion-and-cr-fe-data-research.md` §2.3 |
| 2 | **Ce (Z=58) Cu Kα1 f′ 录入缺陷** | CeO₂ 等含 Ce 样品在 Cu Kα 下失真 ~1.4%             | 已确认，保持 byte-for-byte 保真 | 修正值 ≈−1.88（validation §3.2）       |
| 3 | **Cr/Fe Kα 覆盖缺口**             | 选 Cr/Fe 靶时 f′=f″=0（置灰保真）                  | **已实现 extended 模式（2026-10-16）**：`henke_dispersion.ts`（LBNL Henke f″ 权威来源，f′=0 近似并注明边界）；默认 fidelity 模式仍置灰 | 来源：LBNL CXRO Henke (Delmotte 2018)；详见 `docs/ion-and-cr-fe-data-research.md` §3.2 |
| 4 | ~~Kα1/Kα2 双线是否叠加~~ | ~~Al(400)+2.51% 高角残差头号嫌疑~~ | **已定案（2026-10-16）**：legacy 只用 Kα1，证据见 `ff-dat-spec.md` §7.5（Al.xrd 99.94° 无 Kα2 卫星峰） | 开放项已关闭，可从清单移除 |
| 5 | **PDF 逐值数值层缺陷**        | 扫描版文本层有列粘连+s 行交错（49 处单调性违例），不可作逐值源 | **已定案**：逐值改用 Gemmi `it92.hpp`（ITC-1992 系数），PDF 仅来源标注；提取物 `docs/itc-c-table6113.json`（113 离子物种×66 s 点） | 见 `docs/itc-c-table6113-extraction.md` §2；IUCr 在线表被 Cloudflare 拦截不可达 |
| 6 | **cronie_data.ts 双份表冗余**      | 测试交叉验证已足后可删                               | 待确认测试覆盖                  | `intensity-uncertainty-review.md` §3.3 |

> **`dispersion.ts` mode 说明**（2026-10-16 新增）：
> - `mode='fidelity'`（默认）：仅用 `FF.dat`，Cr/Fe 置灰，离子回退中性。与 legacy GUI 逐字节一致，现有 136+ 测试全绿。
> - `mode='extended'`：Cr/Fe → `HENKE_CRF`（LBNL Henke f″，f′=0）；离子物种 → `ION_DISPERSION`（电荷偏移近似）。`source` 字段区分来源（'FF.dat' / 'LBNL Henke' / 'approximation'），供 UI 标注或测试断言。
> - 详见 `docs/ion-and-cr-fe-data-research.md` §4 数据管理方案。

> **与 §6 交叉验证方案的对应**：
> 开放项 2（Ce 缺陷）→ §6.2 矩阵已定案，§6.3 `cross_validate_ff.py` 复核确认；
> 开放项 1（离子色散）→ §6.3 脚本为二期实施模板；
> 开放项 3（Cr/Fe）→ 需 §3 中 Sasaki/NIST 工具补值；
> ~~开放项 4（Kα1/Kα2 双线）~~ → 已定案关闭，见 §6.3 `cross_validate_ff.py` 及 `ff-dat-spec.md` §7.5。
