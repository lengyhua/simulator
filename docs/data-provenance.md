# 数据来源谱系与交叉验证地图

> 入口：[`DATA-REFERENCE.md`](DATA-REFERENCE.md) §2。本文 = 来源、验证、提取记录。
> 旧 `references/README.md` 与 `docs/ion-and-cr-fe-data-research.md` §4/§5 的数据内容已并入本文（那两处已 DEPRECATED）。

---

## 1. 来源谱系图

```
IUCr / ITC Vol C (权威标准, 1992+ & 2006 4th ed.)
│
├─ ITC 6.1.1.4 系数表 (Cromer-Mann 4-Gaussian+c)
│    │  机读镜像: Gemmi it92.hpp (references/gemmi-it92.hpp)
│    │            CCP4 atomsf.lib, cctbx table="it1992" (同源)
│    ├─→ Factor.dat (原程序自有 f₀ 表, 199 物种, 5-Gaussian)  ── gen ──→ web/.../factor_data.ts
│    └─→ docs/itc-c-table6113.json (离子 f₀ 采样, 113 物种)  ── 待 ──→ factor_data.ts 扩展
│
├─ IUCr CIF 字典 / Cromer-Liberman (F′/F″ 权威)
│    └─→ FF.dat (原程序 F′/F″ 表, 92×6, 保真基准)  ── gen ──→ web/.../ff_data.ts
│
├─ LBNL CXRO / Henke (Delmotte 2018, 独立交叉源)
│    └─→ scripts/tmp/henke_{Cr,Fe}.nff  ── gen ──→ web/.../henke_dispersion.ts
│
└─ (本项目推导, 无权威出处)
     └─ 离子 F′/F″ 电荷偏移近似  ── gen ──→ web/.../ion_dispersion.ts   [source:'approximation']
```

**关键定案**：
- `FF.dat` 与 IUCr CIF **同源**（Ce f″ 9.671 vs 9.648 差 0.023）；**Henke 是独立交叉参考**（Ce f″ 10.080，偏高 4%），二者不可混用。
- 离子 f₀ 有权威源（ITC 6.1.1.3/.4）；**离子 F′/F″ 无权威表**（仅近似）。

## 2. 交叉验证地图（脚本 ↔ 源）

| 脚本 | 验证对象 | 基准 | 结果 |
|---|---|---|---|
| `scripts/cross_validate_f0.py` | `Factor.dat` f₀ | Gemmi `it92.hpp` | 中性全过（f₀(0)≈Z）；离子 <0.1%（Bi5⁺ s=0.3 边缘 1.3%）；H s=0.5 为 4-Gaussian 截断 |
| `scripts/cross_validate_ff.py` | `FF.dat` F′/F″ | 物理自洽（L3 边感知阈值） | Dy/Eu/Gd/Ho/Lu/Tm Δf′ 大 = L3 边近 Cu Kα1，**物理正常**；**Ce 为唯一真缺陷** |
| `scripts/extract_ff_dat.py --csv` | `FF.dat` → CSV | IUCr CIF 手工摘录 | Ce f″ 吻合 |
| `scripts/extract_itc_c_table6113.py` | 离子 f₀（Gemmi 求值） | 单调性 + 电子数自检 | 113/113 物种，Sc³⁺/Ti⁴⁺ 尾区非单调（已注 `tail_note`） |

## 3. 权威在线源（网络受限记录）

| 源 | 状态 |
|---|---|
| IUCr 在线表（`www.iucr.org` / `monogram.web.iucr.org`） | **Cloudflare 拦截（HTTP 403 "Just a moment"）不可达** → 用 Gemmi 机读镜像替代 |
| LBNL CXRO / Henke（`henke.lbl.gov`） | 已抓取 92 元素 `.nff` 至 `scripts/tmp/`（2026-10-16） |
| Sasaki 表（KEK）/ NIST FFAST / BraggLibrary | 网络不可达，仅记录来源 |

## 4. ITC-C Table 6.1.1.3 提取记录（并入自旧 `itc-c-table6113-extraction.md`）

- **价值**：补上「离子 f₀ 权威来源」缺口（113 化学相关离子 × 66 s 采样）。
- **PDF 文本层不可逐值**：列粘连（`6.9248.3748.751`）+ 页底 s 行交错 → 首版 49 处单调性违例（抽取伪影，非物理）。
- **改用 Gemmi `it92.hpp`**（ITC-1992 系数，权威机读）在印刷 s 网格（0.00–0.20 步 0.01；0.22–0.50 步 0.02；0.55–2.00 步 0.05，共 66 行）精确求值。
- **版差**：本机 PDF 为 4th ed. (2006)，对 H（Thakkar-Smith SDS）与重离子（*DS）有重拟合；Gemmi 携带 ITC-1992 上游，故 H/重离子值与 2006 书表有真实但小的差异（跟随 1992）。
- **Cval/Sival**：Gemmi 无条目，用中性 C/Si 替代并逐条注明（`note` 字段）。
- **已知残差**：Sc³⁺/Ti⁴⁺ 负 c 系数在 s>1.90 尾区非单调（4-Gaussian+c 固有边界，数值本身精确），已写 `tail_note`。
- **产出**：`docs/itc-c-table6113.json`（113 物种，含系数 + 66 s 采样 + 电子数）。

## 5. 多源实证记录（并入自旧 `ion-and-cr-fe-data-research.md` §5）

- **FF.dat f″ vs Henke f₂ 全量 552 组**：Co 列 FF.dat 系统性偏高 10–25% → 两套独立理论值，**FF.dat 为保真基准、Henke 为独立交叉参考**，不替换。
- **关键元素三源（FF.dat / Henke / IUCr CIF）**：

  | 元素/波长 | FF.dat f″ | Henke f₂ | IUCr CIF | 判读 |
  |---|---|---|---|---|
  | Al Cu Kα1 | 0.246 | 0.2415 | — | +1.9% |
  | Ce Cu Kα1 | **9.671** | 10.080 | **9.648** | FF.dat 与 IUCr 吻合（差 0.023），Henke 偏高 4% |
  | Fe Cu Kα1 | 3.150 | 3.2084 | — | −1.8% |

  → 证实 FF.dat 与 IUCr 同源，Henke 独立。

## 6. 文件导航（谁讲什么，避免迷路）

| 想知道 | 看这里 |
|---|---|
| 某参数在哪用 / 怎么维护 | `DATA-REFERENCE.md` §1/§3 |
| f₀ 细节 | `params-f0.md` |
| F′/F″ 细节 + 二进制 + 模式 | `params-dispersion.md` |
| 几何/峰形（Wyckoff/B/λ/Lp/q） | `params-geometry-peak.md` |
| 公式（LaTeX） | `formulas.md` |
| 来源谱系 / 交叉验证 / 提取记录 | 本文 |
| Ce 缺陷 / 物理审计 / 强度不确定性 | `audits/ff-dat-validation.md` / `audits/physics-audit.md` / `audits/intensity-uncertainty-review.md` |
| 旧文档去哪了 / CLAUDE.md 待勘误 | `DATA-REORGANIZATION.md` |
