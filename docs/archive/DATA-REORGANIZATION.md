# 项目文档整理记录

> 日期：2026-10-16
> 操作：将参数/数据文档从 9 个散文件重组为「主文档 + 主题参考文档 + 审计」三层结构。
> 原则：**保留旧文件并加 DEPRECATED 头**（不删除，保持 git 可追溯）；新文档为权威入口。

---

## 1. 重组后目录结构

```
docs/
├─ DATA-REFERENCE.md               ← 【主文档】数据资产总表 + 维护工作流 + 缺陷登记簿
├─ params-f0.md                    ← f₀ 主题（Factor.dat / 离子 f₀ / cronie 对照）
├─ params-dispersion.md            ← F′/F″ 主题（FF.dat 二进制 / 离子近似 / Cr/Fe Henke）
├─ params-geometry-peak.md         ← 几何与峰形（Wyckoff 消光 / 热因子 B / λ 表 / Lp / 高斯 q）
├─ formulas.md                     ← 公式总汇（LaTeX，原 itc-c-formulas.md 并入）
├─ data-provenance.md              ← 来源谱系 + 交叉验证地图 + 6.1.1.3 提取记录
└─ audits/                         ← 审计/验证（保留，修互链与过时值）
   ├─ physics-audit.md
   ├─ ff-dat-validation.md
   └─ intensity-uncertainty-review.md
```

## 2. 旧文件处置（全部保留，加 DEPRECATED 头）

| 旧文件                                   | 内容去向                                                                                                                 | 处置              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `docs/ff-dat-spec.md`                  | 二进制结构→`params-dispersion.md`；§7.5 Kα1/Kα2 取证→`params-dispersion.md`                                     | 加 DEPRECATED 头  |
| `docs/ff-dat-validation.md`            | →`audits/ff-dat-validation.md`                                                                                        | 移动 + DEPRECATED |
| `docs/physics-audit.md`                | →`audits/physics-audit.md`                                                                                            | 移动              |
| `docs/intensity-uncertainty-review.md` | →`audits/intensity-uncertainty-review.md`                                                                             | 移动              |
| `docs/ion-and-cr-fe-data-research.md`  | 公式/调研→`data-provenance.md`；离子F′F″/Cr/Fe 方案→`params-dispersion.md`；§4 ITC 提取→`data-provenance.md` | 加 DEPRECATED 头  |
| `docs/itc-c-formulas.md`               | →`formulas.md`                                                                                                        | 加 DEPRECATED 头  |
| `docs/itc-c-table6113-extraction.md`   | →`data-provenance.md` §提取记录                                                                                      | 加 DEPRECATED 头  |
| `references/README.md`                 | 数据部分→`data-provenance.md`；保留为纯导航                                                                           | 加 DEPRECATED 头  |

## 3. 待确认的 CLAUDE.md 勘误（列出，不擅自改）

| 位置                | 旧述                                  | 正确值（证据）                                                                                              |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `FF.dat` 记录布局 | 「192 字节 / float32，布局未解」      | **104 字节 / 8B ShortString + 12×double**（`docs/audits/ff-dat-validation.md`、`ff_data.ts` 头） |
| 热因子 B 默认       | （CLAUDE.md 未述 B 值；旧文档 B=0.9） | `DEFAULT_ATOM_THERMAL_B = 1`（`web/src/lib/xrd/constants.ts:53`）；色散 ON 时最优 ≈1.0–1.03           |
| `.cord` 第 7 字段 | 正确（=热因子 B）                     | 无勘误，保留                                                                                                |
| `.xrd` Full Scall | 正确（=显示刻度非归一化）             | 无勘误，保留                                                                                                |

> 用户批准后，仅改 CLAUDE.md 中「FF.dat 192 字节/float32 未解」一段为上表正确值。

## 4. 消费点核实（本仓 web/ 内，已逐一查实）

主文档与主题文档引用的 `web/src/lib/xrd/*` 锚点（2026-10-16 查得）：

- `constants.ts:15` `LAMBDA_TABLE`（Cu/Mo/Cr/Co/Fe）、`:24` `DEFAULT_LAMBDA`、`:27` `K=1`、`:30-32` 扫描范围、`:44` `DEFAULT_Q=0.10`、`:53` `DEFAULT_ATOM_THERMAL_B=1`、`:61` `DEFAULT_USE_DISPERSION`
- `structure_factor.ts:168` `structureFactor()`（复数色散）
- `intensity.ts:40` `peakIntensity`、`:53` `reflectionIntensity`、`:71` `reflectionMultiplicity`
- `lorentz.ts:52` `lorentzPolarization`
- `gaussian.ts:60` `gaussianBroaden`、`:49` `GAUSSIAN_WINDOW_Q=8`
- `wyckoff.ts:163` `getSite`、`:178` `expandPositions`、`:240` `multiplicityOf`、`:260` `laueOperations`
- `cronie.ts:77` `f0()`（仅测试对照）、`factor_data.ts`（199 物种含离子，运行时权威）
- `dispersion.ts:144` `getDispersion(el,λ,mode)`、`:104` `hasDispersion`、`:117` `hasDispersionExtended`
- `ion_dispersion.ts:27` `ION_DISPERSION`、`henke_dispersion.ts:30` `HENKE_CRF`
- `ff_data.ts`（FF.dat 92×12）、`wyckoff_data.ts`（254 群）

### 生成脚本现状勘误（2026-10-16 已闭环）

`factor_data.ts` / `wyckoff_data.ts` 文件头声称由 `gen_factor_dat.py` /
`gen_wyckoff.py` 生成；整理时误判两脚本"不在 `scripts/` 中"——实为**漏看
`web/scripts/` 目录**（生成器建在 web/ 一侧，非根 `scripts/`）。定案（见
`DATA-REFERENCE.md` §5）：

- ✅ 根 `scripts/gen_factor_dat.py`（补齐版）：`--check` 模式验证与已提交
  `factor_data.ts` 逐值一致（199 记录），并导出 `docs/data/factor_dat.csv`。
  ✅ **双份归并已定案（2026-10-16）**：根版为唯一权威，`web/scripts/gen_factor_dat.py`
  （原版，仅出 .ts）已删除——两版 .ts 输出数值一致（物种键与全部系数逐值相同，
  差异仅在文件头注释/排版），已提交 `factor_data.ts` 文件头本就连用根版路径，删后无影响。
- ✅ `gen_wyckoff.py` **本就存在于 `web/scripts/`**（已提交，首提交 9158af0），
  重生成 `wyckoff_data.ts` 与 git HEAD **逐字节一致**（254 群 / 1955 站点 /
  17365 orbit ops）；`scripts/verify_wyckoff.py` 为独立只读交叉校验器，非替代品。
- ✅ `extract_itc_c_table6113.py` **已加 `--csv`**：导出 `docs/data/itc-c-table6113.csv`
  （113 行 × 66 s，与已提交文件字节级一致）。

脚本目录现状：
- 根 `scripts/*.py`：`analyze_ff_impact.py`、`cross_validate_f0.py`、
  `cross_validate_ff.py`、`extract_ff_dat.py`、`extract_itc_c_table6113.py`、
  `gen_factor_dat.py`、`gen_ff.py`、`gen_henke_dispersion.py`、
  `gen_ion_dispersion.py`、`verify_wyckoff.py`。
- `web/scripts/*.py`：`gen_cronie.py`、`gen_wyckoff.py`（`gen_factor_dat.py` 已于
  2026-10-16 归并到根 `scripts/`，web 副本删除）。
- 可运行生成：`gen_ff.py`→`ff_data.ts`、`gen_henke_dispersion.py`→`henke_dispersion.ts`、
  `gen_ion_dispersion.py`→`ion_dispersion.ts`、根 `gen_factor_dat.py`→`factor_data.ts`+CSV、
  `web/scripts/gen_wyckoff.py`→`wyckoff_data.ts`、
  `extract_itc_c_table6113.py`→`docs/itc-c-table6113.json`（`--csv` 另出 CSV）。

## 5. 数据量大→CSV 规则（用户要求）

- **少数据**（λ 表 5 行、Lp 公式、B 默认、q 默认、缺陷登记等）→ 直接 MD 表格。
- **大数据**（FF.dat 92×6、Factor.dat 199 物种）→ 单独 CSV，MD 引用：
  - `docs/data/ff_dat.csv`（92×6 全量，`extract_ff_dat.py --csv` 已可生成）
  - `docs/data/factor_dat.csv`（199 物种 × 11 系数）
  - `docs/data/itc-c-table6113.csv`（113 离子物种 × 66 s，由 `extract_itc_c_table6113.py` 导出）
