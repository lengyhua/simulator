> ⚠️ **DEPRECATED（2026-10-16 文档整合）**：内容已并入权威 [`data-provenance.md`](data-provenance.md) §4。
> 保留此文件仅为 git 可追溯，新内容以 `data-provenance.md` 为准。

# Table 6.1.1.3 提取记录与数据价值评估

> 本文件记录 ITC Vol C **Table 6.1.1.3**（Mean atomic scattering factors
> in electrons for chemically significant ions）的提取过程、权威来源
> 定案与数据价值评估。配套产物：
> - `docs/itc-c-table6113.json`（113 物种 × 66 s 采样点 + 系数）
> - `docs/itc-c-formulas.md`（第 6.1 章公式，LaTeX 统一）
> - `scripts/extract_itc_c_table6113.py`（提取脚本）

---

## 1. 该表对 CalcXRD 的价值

**结论：高价值，直接补上「离子 f₀ 权威来源」缺口。**

| 维度 | 说明 |
|---|---|
| 覆盖物相 | 113 种化学相关离子：H⁻/Li⁺/Be²⁺/Cval/O⁻/F⁻/Na⁺/Mg²⁺/Al³⁺/Sival/Si⁴⁺/Cl⁻… 直至 Pu⁶⁺ |
| 直接用途 | ① 交叉验证 `Factor.dat` 的 ~107 条离子 f₀ 系数（`scripts/cross_validate_f0.py` 扩展）；② 二期 Web 引擎的离子 f₀ 权威采样表；③ 离子 F′/F″（开放项 P1）的电子数基准 |
| 与本项目现状 | `references/README.md` §7 开放项 1「离子 F′/F″ 无现成库」中，**f₀ 一半此前无独立权威表**，本表补齐 |
| 局限 | 该表是**中性电子分布的平均散射因子**（实值），不含 F′/F″；离子反常色散仍需 Cromer–Liberman / Henke 路径 |

**注意 `Cval` / `Sival`**：表内为 C、Si 的**价态变体**（covalent 用），
`Factor.dat` 中原样保留（CLAUDE.md §Factor.dat 约定）。Gemmi it92.hpp
无 Cval/Sival 条目，本提取用**中性 C/Si 系数**替代并逐条注明
（`note` 字段）；对共价精修影响极小，但**不可当价态值使用**。

---

## 2. 权威来源定案（关键决策）

### 2.1 PDF 文本层**不可**作数值源（已证）

`references/dokumen.pub_..._9781402019005.pdf`（扫描版）文本层是
二维表的线性化结果，首版提取
（`scripts/extract_itc_c_table6113.py` v1）暴露 **49 处单调性违例**，
源于两类缺陷：

- **(a) 列粘连**：相邻 f 值被无空格连接，如 `0.17` 行
  `10.14 3` = 10.143、`6.9248.3748.751` = 6.924/8.374/8.751。
- **(b) 页底 s 行交错**：块底部约 10 行混入下一块的 s 行，
  `s ≳ 1.50` 区段列错位。

这两类都是**抽取伪影，非物理**，故 PDF 层无法作逐值数据源
（CLAUDE.md 实证约定：不允许「差不多就行」）。

### 2.2 改用 Gemmi `it92.hpp`（权威，已落地）

- **来源**：`references/gemmi-it92.hpp`（Gemmi 0.7.5，
  `include/gemmi/it92.hpp`）。注释明确：*「X-ray scattering factor
  coefficients from ITC Volume C (1992 或后续版）。同一数据在
  CCP4 `atomsf.lib` 与 cctbx `table="it1992"`」*——即 ITC 6.1.1.4
  系数表的标准机读镜像。
- **系数形式**：4-Gaussian + c（Cromer–Mann），9 个系数
  `{a1 a2 a3 a4 b1 b2 b3 b4 c}`，**恰好**是 Table 6.1.1.4 的系数列。
- **采样**：在 Table 6.1.1.3 印刷 s 网格（66 行）上**精确求值**，
  无内插误差。
- **离子**：`ion_list` 含 112 个离子条目（H1⁻…Pu6⁺），与本表 113
  物种一致（Cval/Sival 用中性替代）。

### 2.3 版差（须知）

本机 PDF 是 **4th ed. (2006)**；Gemmi/CCP4/cctbx 携带 **ITC-1992** 系数。
2006 版对少数条目做了重拟合：
- **H**：Thakkar & Smith (1992) correlated/SDS（表中标 `SDS`）
- **重离子**（Y 及以后）：modified Dirac–Slater（表中标 `*DS`）

故本 JSON 的 H 与重离子值与 2006 书表**有真实但小的差异**（跟随
1992 上游）。若需 2006 书表原值，须逐行人工比对 PDF（开放项）。

### 2.4 IUCr 在线表不可达（记录在案）

`www.iucr.org` / `monogram.web.iucr.org` 在本网络被 Cloudflare 拦截
（HTTP 403 "Just a moment..."），`xraydb.wisc.edu` SSL 中断，均无法直接
抓取。Gemmi 为等价权威机读源，故采用。

---

## 3. 校验记录

| 校验 | 结果 |
|---|---|
| 物种覆盖 | 113/113，与表列一致，无缺失无多余 |
| `f(0)=Σa+c=电子数` | 全部物种通过（O⁻=9, Na⁺=10, Cl⁻=18, Ba²⁺=54, Ce³⁺=55 ✓） |
| 单调性 | 仅 **Sc3⁺ / Ti4⁺** 在 s>1.90 尾区非单调（负 c 系数的高斯尾 < 常数项，4-Gaussian+c 近似的固有边界行为，已写入 `tail_note`，数值本身是系数精确求值） |
| PDF 抽样对照 | 0.00–0.70 区段一致（PDF 粘连仅影响 s≳1.5 与个别行） |

**遗留**：Sc3⁺/Ti4⁺ 尾区若需物理单调的 f(s)，应换 2006 书表原系数
或更高阶拟合（开放项）。

---

## 4. 复现

```bash
# 1. 确认 gemmi it92.hpp 存在（references/ 已入库）
ls references/gemmi-it92.hpp

# 2. 运行提取（生成 docs/itc-c-table6113.json）
python -I scripts/extract_itc_c_table6113.py
```

输出 JSON 结构：
```jsonc
{
  "table": "ITC Vol C Table 6.1.1.3 ...",
  "s_grid": [0.00, 0.01, ..., 2.00],   // 66 行
  "n_species": 113,
  "species": [
    { "symbol": "Na1", "gemmi_symbol": "Na", "charge": 1,
      "electron_count": 9.9997,
      "coefficients": {"a1":..., "b4":..., "c":...},
      "s_values": {"0.00": 9.9997, "0.10": 9.5463, ..., "2.00": 1.0328},
      "n_s": 66 }
  ]
}
```

---

## 5. 参考

- 原书：International Tables for Crystallography, Vol. C（Prince, ed.,
  4th ed., 2006），§6.1.1 / Table 6.1.1.3，PDF p594–605（本仓库扫描版）。
- Gemmi：`references/gemmi-it92.hpp`（ITC-1992 系数，99 中性 + 112 离子）。
- 公式：见 `docs/itc-c-formulas.md`。
- 关联：`references/README.md`（总览）、`docs/ion-and-cr-fe-data-research.md`
  （离子 F′/F″ 与 Cr/Fe Kα 调研）、`docs/ff-dat-spec.md`。
