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
| **f₀ 系数**（199 物种，含离子，5-Gaussian+c） | `Factor.dat` | `factor_data.ts` + `cronie.ts:77 f0()` | ITC 6.1.1.1/.3/.4（Cromer–Mann） | `scripts/gen_factor_dat.py`（生成 ts+csv，`--check` round-trip）；`cross_validate_f0.py`（验证） | 运行时权威；**199 条目自检全过**（Σa+c vs 电子数，最大偏差 0.0379 @ Os，§6 C1）。⚠ 离子条目「偏差 <0.01%」**未限定 s 区间、不成立**：实测 104 项可比，s≤0.2 时 71 项 <0.01%（最差 Bi5+ 0.503%）；s≤0.6 时仅 10 项 <0.01%、97 项 <0.1%（最差 Bi5+ **7.065%**、Ru4+ 2.644%、H1− 2.162%）→ 见 §4 #15 |
| **离子 f₀ 采样表**（113 物种 × 66 s） | `docs/itc-c-table6113.json` | 二期 → `factor_data.ts` 扩展 | ITC 6.1.1.3 / Gemmi `it92.hpp` | `extract_itc_c_table6113.py` | Cval/Sival 用中性 C/Si 替代；Sc³⁺/Ti⁴⁺ s>1.9 尾区非单调（见 `data-provenance.md`） |
| **F′/F″ 色散**（92 元素 × 6 波长） | `FF.dat` | `ff_data.ts` + `dispersion.ts:144 getDispersion(el,λ,mode)` | IUCr CIF / Cromer–Liberman | `extract_ff_dat.py` + `gen_ff.py` + `cross_validate_ff.py`；**缺陷扫描** `scripts/verify_ff_anomalies.py`（兄弟列 Kα1/Kα2 自洽） | ⚠ **Ce(Z=58) Cu Kα1 f′=−1.087 录入缺陷**（保真保留，修正 ≈−1.88，见 `audits/ff-dat-validation.md`）；⚠ **Er(Z=68) Cu Kα1 f″=9.943 录入缺陷**（IUCr 3.937；兄弟 Kα2=3.948 吻合，差 5.995 = 1090× 中位，见 §4 #14）；Z=91 符号误标 Po，按 Z 索引 |
| **离子 F′/F″**（近似） | `ion_dispersion.ts` | `dispersion.ts`（extended 模式） | 电荷偏移近似（§params §2.3） | `gen_ion_dispersion.py` | **无权威离子表**；F″ 按电子数缩放，误差边界 NaCl Na¹⁺ −8.9% / Cl⁻¹ +6.3% |
| **Cr/Fe Kα 色散扩展** | `henke_dispersion.ts` | `dispersion.ts`（extended 模式） | LBNL CXRO Henke（Delmotte 2018） | `gen_henke_dispersion.py` | f″=Henke 权威，f′=0（保守近似，注明）；fidelity 模式仍置灰 |
| **Wyckoff 消光/位置**（254 群） | `Wyckoff` + `WholeSG` | `wyckoff_data.ts` + `wyckoff.ts:163 getSite` | ITC Vol A/B | `web/scripts/gen_wyckoff.py`（生成，round-trip 已验）；`scripts/verify_wyckoff.py`（只读抽查） | 系统消光靠它；生成器在 `web/scripts/`（非根 `scripts/`），改 `Wyckoff` 源后重跑生成器 + `npm test` |
| **热因子 B**（逐原子，Å²） | `.cord` 第 7 字段 | `constants.ts:53 DEFAULT_ATOM_THERMAL_B=1` | ITC 6.1.1.5 | —（无生成，逐原子输入） | **默认 = 1**（旧文档 0.9 已过时）；色散 ON 时最优 ≈1.0–1.03（见 `audits/physics-audit.md` §5.6 关联） |
| **波长表 λ** | — | `constants.ts:15 LAMBDA_TABLE`（Cu/Mo/Cr/Co/Fe） | UI 默认 + NIST | — | Cu=1.54056；⚠ 表述澄清：**Cr/Fe「无 FF.dat 列」= 以 Cr/Fe Kα 作【辐射源】时无列**（FF.dat 6 列是辐射源 Cu/Mo/Co 的 Kα1/Kα2）。Cr/Fe **作吸收体**有正常值：Cr(Z=24) CuKa1 f′=−0.163/f″=2.445，Fe(Z=26) f′=−1.127/f″=3.150（§6 R2 实测）→ fidelity 模式取不到才靠 extended 模式 |
| **Lorentz–polarization** | — | `lorentz.ts:52 lorentzPolarization` | ITC 6.2 | — | 偏振假设（完全非偏振→偏振因子近似），见 `audits/intensity-uncertainty-review.md` §2.4 |
| **高斯峰形 q（σ）** | — | `gaussian.ts` `gaussianBroaden`（`GAUSSIAN_WINDOW_Q=8`） | GUI 标定 0.10° | — | **q=σ=0.10°**（旧 0.25 FWHM 读法已废）；**已实测**：`samples/Al.xrd` 首峰 2θ=38.630 的 FWHM=**0.2355°** → σ=FWHM/2.3548=**0.1000°**（§6 C7）；**峰顶归一形式**（无 1/(q√2π) 密度因子，2026-10-16 定案，见 `params-geometry-peak.md` §5 + §4 缺陷 #9），help RTF 公式(6) 文字系理想化表述 |
| **.cord 输入格式** | `*.cord` | `crystal.ts` 解析 | 原程序约定 | — | 第 7 字段 = 热因子 B（非占位率/多重度） |
| **.xrd 输出格式** | `*.xrd` | `xrd_file.ts` | 原程序约定 | — | 5 表头 + `2θ`/强度成对行 + 单 `0` 尾；`Full Scall` = 显示刻度非归一化；⚠ **`Data Number` 计【区间数】非点数**（`xrd_file.ts:51` 有注释）：`samples/Al.xrd` 表头 9700、实际 9701 个数据点（3.000–100.000 步长 0.010）→ **正确，非不一致**（§6 R4） |

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
cd web && npm test                        # 2026-10-17 实测：11 文件 / 155 项全过
                                          # （旧文档多处写「134 项」已过时，见 §4 #16）
```

**A2. 文档声明复核（改文档/数据后，或定期）→ 跑声明验证脚本**
> 原则：**每条文档声明都要有实测数据支撑**。以下脚本逐条核验本文 §1 总表与
> §4 登记簿中的量化声明，输出 PASS/FAIL + 依据数据，可复跑。
```bash
python scripts/verify_doc_claims.py       # 9 个 CHECK：f₀ 自检/离子 f₀/FF 覆盖/
                                          # 加权 λ 算术/Ce 缺陷/RTF 报表/Al.xrd 实测/
                                          # 粉末 DW 口径/single XRD 公式
python scripts/verify_doc_claims2.py      # R1–R5 细化：离子 f₀ 按 s 分区、
                                          # Cr/Fe 声明含义、Kα1/Kα2 全表扫描、
                                          # Al.xrd 点数、粉末 DW×B 扫描
python scripts/verify_ff_anomalies.py     # FF.dat 兄弟列自洽扫描 + IUCr 权威值比对
cd web && npm test                        # 引擎回归（155 项）
```
> 逐条结论与实测值见 §6「文档声明验证记录」。

**B. 改物理常量（B、q、λ、Lp、峰形）→ 只改 `constants.ts` + 跑测试**
```bash
# 改 web/src/lib/xrd/constants.ts 对应常量（勿改 generated *_data.ts）
cd web && npm test                        # 确认 Al 六峰、NaCl 奇偶峰基准不破（155 项）
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
| 7 | **Cr/Fe Kα 无 FF.dat 列** | 最近列 Co Kα2 Δλ=0.14–0.50；含义 = 以 Cr/Fe Kα 作**辐射源**时无列（**作吸收体有值**：Cr CuKa1 f′=−0.163/f″=2.445，Fe −1.127/3.150，§6 R2 实测） | Henke f″ + f′=0 | extended 模式；fidelity 模式置灰 |
| 8 | **双份 f₀ 表**（`cronie_data.ts` vs `factor_data.ts`） | 前者手抄 IUCr 仅测试用 | 运行时只用 `factor_data.ts` | 测试交叉验证足后可删 `cronie_data.ts`（开放项） |
| 9 | **高斯展宽口径**：help RTF 公式(6) 文字含 `1/(q√2π)` 密度因子，但**程序实现为峰顶归一形式**（峰值=I_hkl） | `ref-temp/Al.xrd`（原程序 2026-10-16 新存，与 `samples/Al.xrd` 逐字节一致）峰值 152557 = I_hkl 本身；若含该因子峰值应 ≈608614（3.9894 倍）；GUI 曲线实测同口径 | 峰值=I_hkl（无 1/(q√2π)），展宽仅向邻点叠加 I_hkl·exp(−dx²/2q²) | `gaussian.ts` 2026-10-16 移除该因子；回归守护 `pipeline.test.ts` 验收 7（峰值≈I_hkl、不出现 >2x 放大）；详见 `params-geometry-peak.md` §5 |
| 10 | **single XRD 表强度 = Lp·\|F\|² 归一到最强峰=100000，无 multiplicity，热因子 DW 作用在 f₀ 上**（2026-10-17 定案，替代 2026-10-16 "≤0.6% 偏差"错误 claim） | ① 全开/Lp关比值 = Lp(2θ)/Lp(2θ_min_ref) 逐峰 ≤0.01%（Al CuKa1 五峰）；② Lp关表 = \|F\|² 归一到最强峰（111 族 100000），无需 mult；③ Th开/Th关（B=1/B=0，Lp+Fd 均开）比值 = exp(−B·s²)（s=sinθ/λ），B 缩放严格 2:1（B=0.5 比值 = B=1 比值平方，逐点 ≤0.0005%），与标准 Debye-Waller `f₀·exp(−B·s²)`（DW 仅作用 f₀，不含 f′/f″）一致；④ 归一基数 = 最强活峰（Al 为 111 族 38.63°），非扫描下界 3°（假设 2θref=3° 预测 (200) 峰仅 146 强度 vs legacy 64593，偏差 −99.8% 证伪） | —（公式本身定案，无待修缺陷） | `single_xrd.ts` 现按 `I = Lp(2θ)·\|F\|²/peak_max`（Lp 关时仅 `\|F\|²`，DW 经 `structure_factor.ts` 作用于 f₀）实现；实测 Al CuKa1 全开 B=0/B=0.5/B=1 三档 vs legacy 逐峰偏差 0.0% / 0.9% / 1.9%（B 越大高角偏差越大，属 DW 指数拟合残差，非公式错误） | 完整审计含四组 switch-state 对照表见 `docs/single-xrd-formula-audit.md`（已按本条定案同步） |
| 11 | **原程序 λ 下拉 MoKa1 = 0.71930 录入缺陷** | 2026-10-17 Win32 提取原程序下拉列表（主窗口与 Search Factor 对话框共用 6 项：CuKa1 1.54056 / CuKa 1.54178 / FeKa1 1.93604 / FeKa 1.93736 / MoKa1 **0.71930** / MoKa 0.71073）；标准 Mo Kα1 = 0.70930，兄弟项 MoKa 加权 0.71073 正确、Mo Kα2 = 0.71359，反证 Kα1 槽位为单 digit 误录；0.71930 不对应任何标准 Mo 线 | 0.70930 | web `LAMBDA_TABLE.Mo=0.70930` 采用正确值（**有意偏离原程序**：否则 Mo 图案峰位整体偏移 Δλ/λ≈+1.4%，如 2θ=60° 处 ≈+0.8°）；原程序选 MoKa1 时若按最近 λ 查 FF.dat 会错配到 MoKa2 列（Δλ 0.0057 < 0.010），待 GUI 实证 |
| 12 | **single XRD 表不计基底位置相位 + 奇次族丢 f″**（legacy 岩盐相位怪癖，2026-10-17 定案） | ① 偶次族（h+k+l 偶）：完整复数模，Re=8(f_Na+f_Cl+f′_Na+f′_Cl)，Im=8(f″_Na+f″_Cl)，025–032 全档 <1.6%；② 奇次族（h+k+l 奇）：只取实部 `[8(f_Na−f_Cl+f′_Na−f′_Cl)]²`，**f″ 不进奇次族**——032（Fd 关）全峰 0.01–0.11% 精确命中，025/030 全峰 <1.8%；B_Na=0 档（029）奇次族 90.83° 双峰最大 6.69%（系统残差，方向一致）；③ 归一基数 = 全扫描范围 Lp·|F|² 全局最大值（含未显示弱峰，NaCl 恒为 (200) 族 31.82°） | 已实现：`structure_factor.ts` `rockSaltOddReal` 选项（`single_xrd.ts` 默认开启）；`single_xrd.ts` 归一基数改全范围 max | 偏差规律：奇次族残差随 B_Na 减小而增大（f″/f₀ 占比增大所致），032 Fd关档为最干净锚点；详见 `single-xrd-formula-audit.md` §8 |
| 13 | **DW 作用对象为 (f₀+f′) 整体，f″ 不进 DW**（2026-10-17 扩展：**single 表与粉末曲线两条管线皆然**） | ① single 表：Al-225 导出反解隐含 B = 1.0025~1.0031 全反射一致（.cord B=1）；若 DW 只作用 f₀（web 现式 `(f0·e^(−Bs²)+f′)+i·f″`）最大偏差 1.87%。② 报表：`ref-temp/CuKa1 Na1+.rtf` 证实程序把 f′/f″ 合成实数 `f_eff=√((f₀+f′)²+f″²)`（help 公式 (5) 二阶 Taylor）后再进强度。③ **粉末曲线实测（§6 R5，`samples/Al.xrd` 峰高比 1000/469.9/266.4/283.0/79.7/37.2）**：DW 作用 (f₀+f′) 且 B=1.00 时逐点偏差 **0.00 / −0.03 / +0.01 / +0.03 / +0.03 / +0.08%**（最大 **0.08%**）；web 现式 f₀-only 在 B=1.00 时逐点系统性偏到 **+1.85%**（0.00/0.06/0.52/0.95/1.10/1.85），放宽到最佳 B=1.05 仍残 **0.23%** → 粉末管线同样需改 | — | 影响面：轻原子 ≤1.9%（Al），重原子大 f′ 时更大；修正涉及 `structure_factor.ts`，**需连带回归粉末基准（Al 六峰 + NaCl 九峰）**；详见 `docs/single-xrd-formula-audit.md` §4 |
| 14 | **Er(Z=68) Cu Kα1 f″ = 9.943 录入缺陷**（2026-10-17 新发现） | 兄弟列 Kα2 = **3.948**，\|Kα1−Kα2\| = **5.995** = **1090×** 全表中位差（Cu f″ 中位 0.0055）——Kα1/Kα2 仅差 ~20 eV（Δλ 0.0038 Å），且吸收边恰落在这一 20 eV 窗口的概率极低，故不可用物理跳变解释。**外部权威佐证**：IUCr CIF `dispersion_imag_cu`(Er) = **3.937**，与 FF 的 Kα2=3.948 吻合（Δ 0.011），与 Kα1=9.943 差 **6.006**。同批 IUCr 比对中 Ce 9.648 / Dy 9.748 / Ho 3.704 / Tm 4.181 / Lu 4.693 与 FF 两列均吻合（Δ≤0.035），**证明虚部列本身可信、唯 Er Kα1 槽位错** | 3.937（或直接取兄弟值 3.948） | 保真优先：保留 9.943，仅登记（与 #1 Ce 同策略）。影响面：web `getDispersion` 取 Kα1 列（#3），故 **Er 化合物在 Cu 靶下 f″ 被高估 6.0**、\|F\|² 与强度显著失真；改值需回归基准。复跑 `python scripts/verify_ff_anomalies.py` |
| 15 | **文档声明失实：「离子 f₀ 偏差 <0.01%」** | 实测 104 项可比（Factor.dat 离子条目 vs gemmi `it92`）：**s≤0.2** 时 71 项 <0.01%、100 项 <0.1%（最差 Bi5+ 0.503%）；**s≤0.3** 时 55 项 <0.01%（最差 Bi5+ 1.252%）；**s≤0.6** 时仅 **10 项** <0.01%、97 项 <0.1%（最差 **Bi5+ 7.065% @ s=0.60**、Ru4+ 2.644%、H1− 2.162%） | 声明须限定 s 区间：低 s（≤0.2，实测常用区）≈<0.5%；高 s 区误差可达 7% | 已改 §1 总表表述；保留原值（保真）。复跑 `python scripts/verify_doc_claims2.py`（R1） |
| 16 | **文档声明过时：「134 项物理测试」** | 2026-10-17 实测 `cd web && npm test` → **Test Files 11 passed / Tests 155 passed**（11 文件，耗时 16.0 s）。`docs/audits/physics-audit.md`（2 处）与 `docs/audits/intensity-uncertainty-review.md`（1 处）的「134 项」系 2026-10-16 快照 | 155（随代码演进会变，以实跑为准） | 已改 §3 Runbook；两处审计文档保留历史数字并加实测脚注（历史快照不改数） |

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
- **Po/NaCl single XRD 存档导出的有效 B ≠ 1**（2026-10-17，§4 #10/#12/#13
  连带）：Al-225/Al-75 导出按 B=1 复算 0.10% 定案，但 Po-221/Po-16 需
  B≈1.55（残差 1.3%）、NaCl-225/NaCl-75 需 B≈0.25（残差 9.5%）才能拟合；
  且这两组导出的 2θ 列与 λ=1.54056 有 +(0.003~0.028)° 系统差（Al/NaCl 仅
  ±0.007°）。已排除 f₀ 表错行（Σa+c 自检全过）、色散行错配、Lp/DW 变体。
  推测存档导出生成时的 .cord B 或复选框状态与当前 `samples/*.cord`（B 全 1）
  不同。复现方案：以当前 samples 重新驱动原程序（Thermal 开、B=1、CuKa1）
  导出 single 表与存档比对；程序本次已关闭，待下次开机补做。
- **single XRD 代码修正待批准**（用户 2026-10-17 约束「只要调研不改代码」）：
  (a) `single_xrd.ts` 去掉 mult（Al-225 预期即复现原程序 ≤0.1%）；
  (b) `structure_factor.ts` DW 作用对象改 (f₀+f′)（需回归粉末基准）；
  (c) `single_xrd.ts` 头注释「GUI-verified … |F|²·mult … ≤0.6%」失实、
  `SingleXrdFloat.tsx` 引用不存在的开放项——两处注释勘误；
  (d) single 表是否复刻「不计基底相位」怪癖需产品决策（保真 vs 物理）。
  完整证据见 `docs/single-xrd-formula-audit.md`。
- **Er(Z=68) Cu Kα1 f″ 缺陷的连带处置待决**（§4 #14）：是否按 #1 Ce 的
  「保真保留 + 注释标记」同策略处理；若选择物理优先，修正值 3.937（IUCr）
  或 3.948（兄弟列）。另需确认原程序 Er 的 f′（−9.392 / −9.352，兄弟差 0.040
  正常）是否可信——目前仅虚部有外部权威值，实部无。
- **Tm / Lu / Ho / Eu / U / Dy 的 Kα1-Kα2 兄弟差偏大，性质待定**（2026-10-17
  全表扫描，`scripts/verify_ff_anomalies.py`）：Cu f′ 列 Tm 差 **2.022**
  （1011× 中位）、Lu 0.988、Ho 0.536、Eu 0.480；Mo f′ 列 U 0.487；Co f′ 列
  Dy 0.381；Co f″ 列 Ce 1.014。**均未取到外部权威 f′ 参照值**，故只登记为
  「可疑」而非「确认缺陷」。与 Er 的区别：Er 有 IUCr f″ 权威值直接证伪，
  这批只有内部自洽性证据。下一步：查 IUCr `dispersion_real_cu` /
  Cromer–Liberman 原始表比对 f′。
- **Tm 是否仅为「可疑」需谨慎**：IUCr 比对显示 Tm 的 f″（4.188/4.194 vs
  IUCr 4.181）**两列均正常**，故 Tm 的异常只出现在 f′ 列，不能由 f″ 佐证。

---

## 6. 文档声明验证记录（2026-10-17 实测）

> 原则：**本文（及 `audits/`）中的每条量化声明都要能被脚本复跑、能用数据判
> PASS/FAIL。** 本节记录已核验过的声明、实测值与依据。
>
> 复跑：
> ```bash
> python scripts/verify_doc_claims.py     # CHECK 1–9
> python scripts/verify_doc_claims2.py    # R1–R5（细化）
> python scripts/verify_ff_anomalies.py   # FF 兄弟列扫描 + IUCr 比对
> cd web && npm test                      # 引擎回归
> ```

| ID | 被验证的文档声明 | 实测结果 | 判定 | 依据数据 |
|---|---|---|---|---|
| C1 | f₀ 表 199 物种，`Σaᵢ+c` = 电子数 | 199 条目全部自检通过，最大偏差 **0.0379**（Os） | **PASS** | `factor_data.ts` 逐条 Σa+c vs 电子数 |
| C2 | 离子 f₀ = IUCr 标准值，偏差 <0.01% | 104 项可比；s≤0.6 仅 **10/104** <0.01% | **FAIL（已更正为 #15）** | 见 R1 细分 |
| C3 | Cr/Fe「无 FF.dat 列」 | 作**辐射源**无列；作**吸收体**有值 | **PASS（表述已澄清）** | Cr(Z=24) CuKa1 f′=−0.163 / f″=2.445；Fe(Z=26) f′=−1.127 / f″=3.150 |
| C4 | 加权 λ = (2·Kα1+Kα2)/3 | Mo：(2×0.70930+0.71359)/3 = **0.710730**，与原程序下拉 MoKa **0.71073** 逐位吻合；Fe：由 1.93604/1.93736 反解 Kα2 = **1.94000**，标准值 1.93998（Δ 2e−5） | **PASS** | 算术自洽 + 标准值比对 |
| C4b | MoKa1 = 0.71930 是笔误（#11） | 若 Kα1 真为 0.71930，加权应 = 0.71740，与实际的 0.71073 差 **−0.00667** → 反证成立 | **PASS** | 同上算术反证 |
| C5 | Ce(Z=58) Cu Kα1 f′=−1.087 为录入缺陷（#1） | Z 趋势断裂：Ba −1.014 → La −1.361 → **Ce −1.087** → Pr −2.403 → Nd −3.164；\|Kα1−Kα2\|=**0.731**（全表 Z≥20 中位 0.002） | **PASS** | 内部证据 2 条（趋势 + 兄弟列） |
| C6 | 原程序 RTF 报表「Fo after F1 & F2」= 二阶 Taylor（#10/#13 依据） | 4 份报表（`CuKa1 Na1+` / `CuKa1 Cl1-` / `Na1+`(MoKa1) / `H`(MoKa1)）ΔF1/ΔF2 与 `ff_data.ts` **逐值一致**；每份 101 行：f₀ 复算偏差 **0.0000%**；Taylor 复算「Fo after F1&F2」偏差 **0.0000%~0.0081%** | **PASS** | 报表列 vs 引擎数据双比对 |
| C7 | q = σ = 0.10°（#5） | `samples/Al.xrd` 首峰 2θ=38.630 实测 FWHM = **0.2355°** → σ = 0.2355/2.3548 = **0.1000°** | **PASS** | 峰形半高宽反解 |
| C7b | Kα1/Kα2 不叠加（#3） | 2θ=99.60 → I=**5681**（主峰）；99.94 → I=**18**；99.99 → I=3 → 卫星峰仅背景级 | **PASS** | Al.xrd 逐点 |
| C7c | Al.xrd 六峰峰位/峰高 | 38.630/44.900/65.380/78.590/82.820/99.600，I = 152557/71693/40648/43172/12165/5681；相对比 **1000 / 469.9 / 266.4 / 283.0 / 79.7 / 37.2** | 记录（基准） | 与文档基准 1000/470/266/283/80/37 一致 |
| C7d | `Data Number` 与点数 | 表头 9700，实际 9701 点 → **区间数**口径，`xrd_file.ts:51` 注释亦如此 | **PASS（非不一致）** | R4 行数统计 |
| C8 | 粉末强度公式 mult·Lp·\|F\|² | 峰高比复算：f₀-only DW → 对实测最大偏差 **1.8%**；(f₀+f′) DW → **0.1%** | **PASS（公式成立，DW 口径需改→#13）** | 见 R5 |
| C9 | single XRD = Lp·\|F\|² **无 mult**（#10 定案） | 原程序 Al-225：100000/62638/17760/9431/7972/4964；模型复算 100000/62643/17764/9436/7976/4969 → 最大偏差 **0.10%**；web 现式 mult 版 → 最大偏差 **202.9%** | **PASS** | 双 λ（CuKa1 / CuKa 加权）均验，≤0.105% |
| R1 | 离子 f₀ 偏差按 s 分区（C2 细化） | s≤0.2：71/104 <0.01%，最差 Bi5+ **0.503%**；s≤0.3：55/104，最差 **1.252%**；s≤0.6：**10/104**，最差 Bi5+ **7.065%**（Ru4+ 2.644%、H1− 2.162%） | 声明按区间改写（#15） | gemmi `it92` 交叉 |
| R2 | Cr/Fe 声明含义 | FF.dat 6 列 = **辐射源** Cu/Mo/Co 的 Kα1/Kα2（非吸收体元素） | 表述改写（§1 λ 行 / #7） | `ff_data.ts` 列名 + Cr/Fe 吸收体取值 |
| R3 | 全表兄弟列自洽扫描 | Cu f′ 中位差 0.002；异常项：Tm **2.022**、Lu 0.988、Ce **0.731**(#1)、Ho 0.536、Eu 0.480。Cu f″：Er **5.995**（1090× 中位） | 新增 #14 + 开放项 | `verify_ff_anomalies.py` |
| R3b | IUCr 权威值比对（Cu f″） | Er：FF Kα1 **9.943** / Kα2 **3.948** vs IUCr **3.937** → Kα1 偏 **6.006**、Kα2 偏 0.011。Ce 9.671/9.683 vs 9.648；Dy 9.863/9.880 vs 9.748；Ho 3.708/3.713 vs 3.704；Tm 4.188/4.194 vs 4.181；Lu 4.703/4.709 vs 4.693 → **全部吻合** | **Er Kα1 确认为缺陷（#14）** | IUCr CIF `dispersion_imag_cu` |
| R4 | Al.xrd 文件结构 | 总行 9707；表体 9702（双列 9701 + 单列 1 尾 `0`）；首数据 `3.0000 0`，末 `100.0000 2` | **PASS** | 逐行解析 |
| R5 | 粉末 DW 口径 × B 扫描（对 Al.xrd 实测峰高比） | **DW 作用 (f₀+f′)**：最佳 **B=1.00**，偏差 **0.08%**（逐点 0.00/−0.03/+0.01/+0.03/+0.03/+0.08）。**DW 只作用 f₀（web 现式）**：B=1.00 时逐点 0.00/0.06/0.52/0.95/1.10/**+1.85%**（系统性随 2θ 增大），最佳 B=1.05 仍 **0.23%** | **PASS → #13 扩展到粉末管线** | B 扫描拟合 |
| R6 | 测试规模声明 | `npm test` → **11 文件 / 155 项全过**（16.0 s） | 旧「134 项」过时（#16） | vitest 2.1.9 |

> **判定图例**：PASS = 声明成立；FAIL = 声明被数据推翻（已改写并在 §4 登记）；
> 记录 = 实测值存档，供后续基准回归使用。
