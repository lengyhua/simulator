# CalcXRD 参数与数据 · 主文档

> **本文件是参数/数据文档的唯一入口。** 每个参数/数据集在这里有一行，
> 指向「在哪用 / 权威来源 / 维护代码 / 维护建议」。细节（推导、验证、
> 二进制结构）不搬进来，按链接进主题文档，避免重复。
>
> 状态：2026-10-16 全面整理；旧散文档已加 DEPRECATED 头（见
> `DATA-REORGANIZATION.md` 处置清单），**本表 + 主题文档为权威**。

---

## 1. 数据资产总表

> 「引擎消费点」均指本仓 `web/src/lib/xrd/`；行号为 2026-10-16 实查。
> 「维护代码」指 `scripts/`。大数据集另存 CSV，见 §1.1。

| 参数/数据 | 原始文件 | 引擎消费点（文件:锚点） | 权威来源 | 维护代码 | 维护建议 / 已知缺陷 |
|---|---|---|---|---|---|
| **f₀ 系数**（199 物种，含离子，5-Gaussian+c） | `Factor.dat` | `factor_data.ts` + `cronie.ts:77 f0()` | ITC 6.1.1.1/.3/.4（Cromer–Mann） | `scripts/gen_factor_dat.py`（生成 ts+csv，`--check` round-trip）；`cross_validate_f0.py`（验证） | 运行时权威；离子条目 = IUCr 标准值（偏差 <0.01%），无需改 |
| **离子 f₀ 采样表**（113 物种 × 66 s） | `docs/itc-c-table6113.json` | 二期 → `factor_data.ts` 扩展 | ITC 6.1.1.3 / Gemmi `it92.hpp` | `extract_itc_c_table6113.py` | Cval/Sival 用中性 C/Si 替代；Sc³⁺/Ti⁴⁺ s>1.9 尾区非单调（见 `data-provenance.md`） |
| **F′/F″ 色散**（92 元素 × 6 波长） | `FF.dat` | `ff_data.ts` + `dispersion.ts:144 getDispersion(el,λ,mode)` | IUCr CIF / Cromer–Liberman | `extract_ff_dat.py` + `gen_ff.py` + `cross_validate_ff.py` | ⚠ **Ce(Z=58) Cu Kα1 f′=−1.087 录入缺陷**（保真保留，修正 ≈−1.88，见 `audits/ff-dat-validation.md`）；Z=91 符号误标 Po，按 Z 索引 |
| **离子 F′/F″**（近似） | `ion_dispersion.ts` | `dispersion.ts`（extended 模式） | 电荷偏移近似（§params §2.3） | `gen_ion_dispersion.py` | **无权威离子表**；F″ 按电子数缩放，误差边界 NaCl Na¹⁺ −8.9% / Cl⁻¹ +6.3% |
| **Cr/Fe Kα 色散扩展** | `henke_dispersion.ts` | `dispersion.ts`（extended 模式） | LBNL CXRO Henke（Delmotte 2018） | `gen_henke_dispersion.py` | f″=Henke 权威，f′=0（保守近似，注明）；fidelity 模式仍置灰 |
| **Wyckoff 消光/位置**（254 群） | `Wyckoff` + `WholeSG` | `wyckoff_data.ts` + `wyckoff.ts:163 getSite` | ITC Vol A/B | `web/scripts/gen_wyckoff.py`（生成，round-trip 已验）；`scripts/verify_wyckoff.py`（只读抽查） | 系统消光靠它；生成器在 `web/scripts/`（非根 `scripts/`），改 `Wyckoff` 源后重跑生成器 + `npm test` |
| **热因子 B**（逐原子，Å²） | `.cord` 第 7 字段 | `constants.ts:53 DEFAULT_ATOM_THERMAL_B=1` | ITC 6.1.1.5 | —（无生成，逐原子输入） | **默认 = 1**（旧文档 0.9 已过时）；色散 ON 时最优 ≈1.0–1.03（见 `audits/physics-audit.md` §5.6 关联） |
| **波长表 λ** | — | `constants.ts:15 LAMBDA_TABLE`（Cu/Mo/Cr/Co/Fe） | UI 默认 + NIST | — | Cu=1.54056；Cr/Fe 无 FF.dat 列（靠 extended 模式） |
| **Lorentz–polarization** | — | `lorentz.ts:52 lorentzPolarization` | ITC 6.2 | — | 偏振假设（完全非偏振→偏振因子近似），见 `audits/intensity-uncertainty-review.md` §2.4 |
| **高斯峰形 q（σ）** | — | `gaussian.ts` `gaussianBroaden`（`GAUSSIAN_WINDOW_Q=8`） | GUI 标定 0.10° | — | **q=σ=0.10°**（旧 0.25 FWHM 读法已废）；**峰顶归一形式**（无 1/(q√2π) 密度因子，2026-10-16 定案，见 `params-geometry-peak.md` §5 + §4 缺陷 #9），help RTF 公式(6) 文字系理想化表述 |
| **.cord 输入格式** | `*.cord` | `crystal.ts` 解析 | 原程序约定 | — | 第 7 字段 = 热因子 B（非占位率/多重度） |
| **.xrd 输出格式** | `*.xrd` | `xrd_file.ts` | 原程序约定 | — | 5 表头 + `2θ`/强度成对行 + 单 `0` 尾；`Full Scall` = 显示刻度非归一化 |

### 1.1 大数据集 → 单独 CSV（MD 引用，不内嵌）

| CSV | 内容 | 生成 |
|---|---|---|
| `docs/data/ff_dat.csv` | FF.dat 全量 92 元素 × 6 波长（553 行） | `python scripts/extract_ff_dat.py --csv docs/data/ff_dat.csv` |
| `docs/data/factor_dat.csv` | Factor.dat 199 物种 × 11 系数 | `python scripts/gen_factor_dat.py`（已生成） |
| `docs/data/itc-c-table6113.csv` | 离子 f₀ 113 物种 × 66 s（⚠ 待生成） | `extract_itc_c_table6113.py --csv`（待加导出） |

> 小数据集（λ 表 5 行、缺陷登记、B/q 默认）直接在本表与主题文档中，
> 不另建 CSV。

---

## 2. 主题文档导航（细节在这里）

| 主题 | 文档 | 内容 |
|---|---|---|
| 公式（LaTeX） | [`formulas.md`](formulas.md) | f₀ 近似、温度因子、结构因子、色散、Lp、强度/峰形 |
| f₀ | [`params-f0.md`](params-f0.md) | Factor.dat 结构、离子 f₀ 来源、cronie 对照、验证命令 |
| F′/F″ | [`params-dispersion.md`](params-dispersion.md) | FF.dat 二进制、离子近似、Cr/Fe Henke、mode 语义 |
| 几何/峰形 | [`params-geometry-peak.md`](params-geometry-peak.md) | Wyckoff 消光、B、λ、Lp、高斯 q |
| 来源谱系 | [`data-provenance.md`](data-provenance.md) | IUCr→中间源→引擎 链路、交叉验证地图、6.1.1.3 提取记录 |
| 审计/验证 | [`audits/`](audits/) | `physics-audit` / `ff-dat-validation` / `intensity-uncertainty-review` |
| 旧文档处置 | [`DATA-REORGANIZATION.md`](DATA-REORGANIZATION.md) | 重组映射 + CLAUDE.md 待勘误项 |

---

## 3. 维护工作流（Runbook）

> 改一个参数时照此执行，保证不破坏 Al/NaCl 基准。

**A. 改了原始 `.dat` 或来源表（f₀ / F′F″）→ 重生成 + 重验证**
```bash
# 生成（哪个来源变了就重跑哪个）
python scripts/extract_ff_dat.py --json docs/data/ff_dat.json   # → ff_data.ts
python scripts/gen_ff.py            # 生成 web/.../ff_data.ts
python scripts/gen_henke_dispersion.py   # henke_dispersion.ts
python scripts/gen_ion_dispersion.py     # ion_dispersion.ts
python scripts/gen_factor_dat.py         # factor_data.ts + docs/data/factor_dat.csv

# 交叉验证（多源实证，必跑）
python scripts/cross_validate_f0.py        # f₀ vs gemmi it92
python scripts/cross_validate_ff.py        # F′F″ vs 物理自洽
python scripts/verify_wyckoff.py          # Wyckoff 键一致性 + P 群抽查（只读，不重写 .ts）

# 引擎回归（Al/NaCl 基准应全绿）
cd web && npm test                        # 134 项物理测试
```

**B. 改物理常量（B、q、λ、Lp、峰形）→ 只改 `constants.ts` + 跑测试**
```bash
# 改 web/src/lib/xrd/constants.ts 对应常量（勿改 generated *_data.ts）
cd web && npm test                        # 确认 Al 六峰、NaCl 奇偶峰基准不破
```

**C. 新增数据来源（如补离子权威 F′F″）→ 三处齐改**
1. 新增 `scripts/gen_xxx.py` + 生成 `web/.../xxx_data.ts`（文件头注明来源/生成日期/边界）；
2. 在 `dispersion.ts` 加 mode 分支（参考 `ion_dispersion`/`henke_dispersion` 的接法）；
3. 更新本文 §1 总表 + `data-provenance.md` 来源谱系。
**不变式**：生成文件头必须含「来源 + 日期 + 生成脚本 + 数据边界」四要素（模板见 `params-dispersion.md` §4）。

**D. 发现数据缺陷 → 登记，不静默改 `.dat`**
```
在 §4 缺陷登记簿加一行（现象/证据/修正值/处置）→
若保真优先（本项目默认）：保留原值，仅注释标记；
若物理优先（可选场景）：走 C 流程新增来源，fidelity 模式不动。
```

---

## 4. 已知缺陷 & 口径决策登记簿

> 单一登记处，替代散在 5 个文档的描述。

| # | 缺陷/决策 | 现象/依据 | 修正值 | 处置 |
|---|---|---|---|---|
| 1 | **Ce(Z=58) Cu Kα1 f′ 录入缺陷** | Z 趋势断裂、Kα1/Kα2 自洽崩坏、IUCr/Cromer–Liberman 三源佐证 | ≈ −1.88（Kα2 兄弟值 −1.818） | 保真保留 −1.087，注释标记（`audits/ff-dat-validation.md`） |
| 2 | **FF.dat Z=91 符号误标 Po** | 与 Z=84 Po 重名，数值正确 | 按 Z 索引（`FF_SYMBOLS`） | `ff_data.ts`/`dispersion.ts` 已按 Z 索引 |
| 3 | **Kα1/Kα2 双线不叠加** | Al.xrd 99.94° 无 Kα2 卫星（I=18 背景级） | legacy 只用 Kα1 | `getDispersion` 取 Kα1 列，不叠加（`params-dispersion.md` §5） |
| 4 | **热因子 B 默认值** | 旧文档 0.9 为「缺 f′ 被 B 吸收」的产物 | 默认 1；色散 ON 最优 ≈1.03 | `DEFAULT_ATOM_THERMAL_B=1`（`constants.ts:53`） |
| 5 | **高斯 q 读法** | 旧 q=0.25(FWHM) 错误 | q=σ=0.10°（GUI 标定） | `DEFAULT_Q=0.10`（`constants.ts:44`） |
| 6 | **离子 F′/F″ 无权威表** | gemmi/IUCr 仅有中性值 | 电荷偏移近似（§params §2.3） | extended 模式，`source:'approximation'`，误差边界已量化 |
| 7 | **Cr/Fe Kα 无 FF.dat 列** | 最近列 Co Kα2 Δλ=0.14–0.50 | Henke f″ + f′=0 | extended 模式；fidelity 模式置灰 |
| 8 | **双份 f₀ 表**（`cronie_data.ts` vs `factor_data.ts`） | 前者手抄 IUCr 仅测试用 | 运行时只用 `factor_data.ts` | 测试交叉验证足后可删 `cronie_data.ts`（开放项） |
| 9 | **高斯展宽口径**：help RTF 公式(6) 文字含 `1/(q√2π)` 密度因子，但**程序实现为峰顶归一形式**（峰值=I_hkl） | `ref-temp/Al.xrd`（原程序 2026-10-16 新存，与 `samples/Al.xrd` 逐字节一致）峰值 152557 = I_hkl 本身；若含该因子峰值应 ≈608614（3.9894 倍）；GUI 曲线实测同口径 | 峰值=I_hkl（无 1/(q√2π)），展宽仅向邻点叠加 I_hkl·exp(−dx²/2q²) | `gaussian.ts` 2026-10-16 移除该因子；回归守护 `pipeline.test.ts` 验收 7（峰值≈I_hkl、不出现 >2x 放大）；详见 `params-geometry-peak.md` §5 |
| 10 | **single XRD 表强度 = K·mult·Lp·\|F(s)²\| 归一到 max=100000**（Lp 始终参与计算，不受 L-P factor 勾选框控制；mult = Laue 群等价面数含 Friedel 对） | `ref-temp/single-xrd/` 四个原程序导出（Al-225/Al-75/Al-143/NaCl-225）逐值验证 ≤0.6% 偏差（2026-10-17）；Lp 公式 `(1+cos2θ)²/sin4θ` 与 web 标准式差一个与 2θ 相关的因子（非恒定比例，故 Lp 勾选框不影响 single 表数值） | —（web `single_xrd.ts` 已按此实现） | 公式定案归档于 `single_xrd.ts` 头注释；`useLp` 开关仅作用于 powder 曲线，不作用于 single 表 |
| 11 | **原程序 λ 下拉 MoKa1 = 0.71930 录入缺陷** | 2026-10-17 Win32 提取原程序下拉列表（主窗口与 Search Factor 对话框共用 6 项：CuKa1 1.54056 / CuKa 1.54178 / FeKa1 1.93604 / FeKa 1.93736 / MoKa1 **0.71930** / MoKa 0.71073）；标准 Mo Kα1 = 0.70930，兄弟项 MoKa 加权 0.71073 正确、Mo Kα2 = 0.71359，反证 Kα1 槽位为单 digit 误录；0.71930 不对应任何标准 Mo 线 | 0.70930 | web `LAMBDA_TABLE.Mo=0.70930` 采用正确值（**有意偏离原程序**：否则 Mo 图案峰位整体偏移 Δλ/λ≈+1.4%，如 2θ=60° 处 ≈+0.8°）；原程序选 MoKa1 时若按最近 λ 查 FF.dat 会错配到 MoKa2 列（Δλ 0.0057 < 0.010），待 GUI 实证 |

---

## 5. 维护缺口闭环记录（2026-10-16）

| 原缺口 | 处置结果 |
|---|---|
| `gen_factor_dat.py` 缺失 | ✅ 已补：根 `scripts/gen_factor_dat.py`（Factor.dat→factor_data.ts + `docs/data/factor_dat.csv`，`--check` round-trip 通过，199 记录全匹配）。✅ 归并已定案（2026-10-16）：**根版为唯一权威，`web/scripts/gen_factor_dat.py` 已删除**；已提交 `factor_data.ts` 文件头本就连用根版路径，无需改 |
| `gen_wyckoff.py` 缺失 | ✅ 已核实：**生成器本就存在于 `web/scripts/gen_wyckoff.py`**（早期计划建在 web/ 下，根 `scripts/` 未保留副本）。重生成 round-trip 逐字节一致（254 群 / 1955 站点）；`scripts/verify_wyckoff.py` 仅作只读抽查。改 `Wyckoff` 源后跑 `python web/scripts/gen_wyckoff.py` + `npm test` |
| `extract_itc_c_table6113.py --csv` | ✅ 已补：新增 `--csv` 参数，导出 `docs/data/itc-c-table6113.csv`（与已提交 CSV round-trip 一致） |
| CLAUDE.md FF.dat 旧述 | ✅ 已勘误：改为「9568 bytes = 92 × 104 字节（8B ShortString + 12 double），布局已完全解码」（含 Ce/Z=91 缺陷标注） |

### 5.1 遗留开放项

- ~~`gen_factor_dat.py` 双份归并~~（✅ 2026-10-16 已处置：根 `scripts/` 版为唯一权威，
  `web/scripts/gen_factor_dat.py` 已删；两版 .ts 输出数值一致，已提交 `factor_data.ts`
  文件头即根版路径）。
- 注：`web/src/lib/xrd/cronie.ts` 文件头原误引 `gen_factor_dat.py` 作为
  `cronie_data.ts` 的再生成路径，已改为 `web/scripts/gen_cronie.py`（该 .ts 实际由
  此脚本生成，2026-10-16 顺手勘误）。
- **原程序 λ 下拉结构差异**（2026-10-17 Win32 提取发现）：原程序 6 项 = CuKa1 /
  CuKa(加权) / FeKa1 / FeKa(加权) / MoKa1 / MoKa(加权)，web `LAMBDA_TABLE` =
  Cu/Mo/Cr/Co/Fe 5 项——web 缺 3 个加权平均项、多 Cr。是否向原程序结构对齐
  （UI 保真度）待决策；详见 `params-dispersion.md` §2.1。
- **原程序选 FeKa 时 F′F″ 行为未实证**：FF.dat 无 Fe 列；推测原程序将 F′F″
  复选框置灰（与 web fidelity 模式一致），待 GUI 实验确认。
- **MoKa1 笔误连带效应未实证**（§4 #11）：若原程序按最近 λ 查 FF.dat，选
  MoKa1（0.71930）会错配到 Mo Kα2 列、选 MoKa 加权（0.71073）反而命中 Mo Kα1。
  实验方案：Search Factor 对话框选重元素（如 Fe, Z=26），分别切 MoKa1 / MoKa
  两项读 F1/F2，与 `docs/data/ff_dat.csv` 的 Mo Kα1、Mo Kα2 两列比对。
