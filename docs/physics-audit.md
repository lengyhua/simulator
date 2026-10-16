# XRD 物理公式与参数全面正确性审计报告

> 作者：架构师 高见远（software-architect）
> 日期：2026-10-16
> 范围：`web/src/lib/xrd/` 全部物理公式与参数（只读审计，未修改任何代码/文档）
> 审计方法：逐文件源码精读 + 行号级物理依据比对 + 134 项现有测试套件复核 + 与 `docs/ff-dat-spec.md` / `scripts/extract_ff_dat.py` 交叉验证

---

## 0. 摘要（TL;DR）

**结论：整套物理公式与参数在物理学上正确，未发现任何致命或显著错误。**

- 逐文件审查的 **11 个模块全部判定为「正确」**（结构因子复数式、强度与多重性、洛伦兹-偏振、高斯展宽、f₀ 形式、离子查找、色散索引、Wyckoff 展开、反射枚举框界、2θ、逐原子 B、消光）。
- 发现 **3 个轻微项**（非公式错误）：
  1. **[数据/潜在]** `FF.dat` 中 Z=58(Ce) 的 Cu Kα1 f′ 疑似录入缺陷（≈−1.087，几乎复制了 Z=56 Ba 的 −1.014；正确值应 ≈−1.8，其 Kα2 条目 −1.818 已是正确趋势）。不影响当前样本（无 Ce），仅对含 Ce 样品（如 CeO₂）在 Cu Kα 下失真。
  2. **[文档/过时]** `types.ts:111` 与 `lorentz.ts:23` 两处注释仍写「引擎忽略色散」「IUCr Cronie f₀」，与实际已接入 `ff_data.ts` / `factor_data.ts` 的代码不符。
  3. **[性能/冗余]** `pipeline.ts` 对每个反射计算两次 `dSpacing`（结构因子内部又算一遍）；无关正确性。
- **两个已知残差来源判定**：Al(400) +2.51% 与 NaCl 离子差项放大均属**「物理近似上限、可接受」**，非公式层面 bug（详见 §4）。
- 误报排除：legacy `Lp=(1+cos²2θ)/(sin2θ·sinθ)` 等价性、help 公式(5) 是否 bug、Kα1/Kα2 排序、FF 表 12-double 分块 vs 交错 —— 均已在 §5 逐一证伪/确认。

**发现计数：致命 0 / 显著 0 / 轻微 3 / 风格 1。**

---

## 1. 审计逐条结论

每条给出 **正确 / 存疑 / 错误** 判定、`文件:行号`、物理依据。物理基准引用 International Tables for Crystallography Vol. C（IT Vol. C）、标准粉末衍射教科书，以及与 GUI 实测基线（`pipeline.test.ts` 验收 2/6）。

### 1.1 `structure_factor.ts` —— 正确

| 公式 | 位置 | 判定 | 依据 |
|---|---|---|---|
| `F = Σⱼ fⱼ·e^{iφⱼ}`, φⱼ=2π(hx+ky+lz) | :151-190 | 正确 | 标准复数结构因子；相位约定与 IT Vol. C 一致 |
| 色散复数算术 `Re=A·cosφ−B·sinφ, Im=A·sinφ+B·cosφ` | :179-187 | 正确 | (A+iB)(cosφ+i sinφ) 的复数乘法展开；`A=occ·(f₀s+f′)`, `B=occ·f″` |
| Debye–Waller **只作用于 f₀** | :169 | 正确 | `f0s = f0·exp(−Bⱼ s²)`；f′/f″ 为 s 无关常数，不衰减（IT Vol. C） |
| `sinThetaOverLambda = 1/(2d)` | :141-143 | 正确 | `s = sinθ/λ`，且 `sinθ=λ/(2d)` ⇒ `s=1/(2d)`，与 λ 无关（与中性 f₀ 模型一致） |

> 关键点：复式乘法中 `re` 的 `−B·sinφ` 项**已正确实现**（:185），避免了中心对称结构才会显现、非中心对称会露出的符号错误。✓

### 1.2 `intensity.ts` —— 正确

| 公式 | 位置 | 判定 | 依据 |
|---|---|---|---|
| `I = K·Lp·|F|²·mult`, K=1 | :4, :47, :53-60 | 正确 | 标准粉末积分强度；`K=1`（constants.ts:27） |
| 多重性 = Laue 旋转 + Friedel 对，去重计数 | :71-89 | 正确 | `laueOperations` 给出旋转矩阵集，`push([v])` 与 `push([−v])` 经 `seen` 去重 |
| 中心对称群不双重计数 | :71-89 | 正确 | 中心对称时倒易群已含反演，`−v` 已存在，`seen` 去重使其为 no-op |
| `normalizeReflections` 归一到最强峰=100 | :96-110 | 正确 | 采用「先除后乘 `r.intensity/max·100`」避免 `max·(100/max)` 的 1-ulp 漂移 |

> **Friedel 对与多重性（重点复核）**：数学上 `F(−hkl) = [Σ fⱼ e^{iφⱼ}]* = F(hkl)*`，故 **`|F(−hkl)|² = |F(hkl)|²` 对任意晶体、含反常散射均成立**。因此 `mult × |F(hkl)|²` 对 Laue 等价面（含 Friedel 对）的求和恒等于 `Σ_轨道 |F|²`。**不存在 Friedel 重复计数或漏计**——这是本次审查最初疑似、经复数共轭推导排除的点（详见 §5.4）。

### 1.3 `lorentz.ts` —— 正确

| 公式 | 位置 | 判定 | 依据 |
|---|---|---|---|
| `Lp=(1+cos²2θ)/(sin²θ·cosθ)`, θ=2θ/2 | :52-68 | 正确 | 标准粉末 Lp（θ 为 Bragg 角 = 2θ/2；分子 `cos2θ` 的 `2θ` 为全衍射角） |
| θ→0 下限处理 | :57 | 正确 | `thetaDeg = max(2θ/2, MIN_THETA_DEG=1e-6)`；实际 rangeMin=3° ⇒ θ≈1.5°，该保护从不触发，无伪影 |
| 与 legacy help 等价性 | :6-18 | 正确 | legacy `sin2θ`=sin(2θ)=2 sinθ cosθ ⇒ legacy = 标准/2，归一后等价（RAW-BYTE 取证确认） |

### 1.4 `gaussian.ts` —— 正确

| 公式 | 位置 | 判定 | 依据 |
|---|---|---|---|
| `I(2θ)=Σ I_hkl·exp(−(2θ−2θ_hkl)²/(2q²))/(q√2π)` | :5, :101-104 | 正确 | 与 help 公式(6) 逐字符一致；`q=σ` |
| q = σ（非 FWHM），默认 0.10 | :44 | 正确 | FWHM=2.355σ≈0.2355°；与 Al.xrd 剖面逐点吻合（峰值 38.63° 处 152557，±0.01° ≈ 峰值·exp(−0.005)） |
| 面积守恒 + δ 棒谱分支 | :14-18, :90-96 | 正确 | 振幅 `intensity/(q√2π)` ⇒ 单峰面积=intensity（保面积），峰高=intensity/(q√2π)（与「List=剖面峰值」一致）；`q≤0` 落最近栅格点 |

### 1.5 `constants.ts` —— 正确

| 常量 | 位置 | 判定 | 依据 |
|---|---|---|---|
| `LAMBDA_TABLE` {Cu 1.54056, Mo 0.70930, Cr 2.28970, Co 1.78897, Fe 1.93604} | :15-21 | 正确 | 与 GUI 表一致 |
| `K=1` | :27 | 正确 | 强度比例常数 |
| `DEFAULT_Q=0.10`（σ） | :44 | 正确 | GUI-verified |
| `DEFAULT_ATOM_THERMAL_B=1`（逐原子，无全局 B） | :53 | 正确 | GUI 实测：.cord 第 7 字段 / 原子表 "B" 列，样例全为 1 |
| `DEFAULT_USE_DISPERSION=true` | :61 | 正确 | 对齐 legacy GUI 复选框默认勾选 |
| `MIN_THETA_DEG=1e-6`, `EXTINCTION_REL_TOL=1e-6` | :68, :75 | 正确 | 见 §1.9 消光 |

### 1.6 `cronie.ts` + `factor_data.ts` —— 正确

| 公式 | 位置 | 判定 | 依据 |
|---|---|---|---|
| `f₀(s)=Σaᵢ·exp(−bᵢ s²)+c`，指数**负** | cronie.ts:88 | 正确 | `−coefficients.b[i]*s2`；help RTF 的 `exp(bᵢ(λ/sinθ)²)` 是 RTF 转写伪影（已证 f(Al,s=0.1)≈0.14 物理荒谬） |
| 离子查找：精确 → 中性回退 → undefined 报错 | cronie.ts:48-62 | 正确 | 不静默回退到错误物种；`normalizeElement` 去尾部电荷 |
| 5-Gaussian 通用循环 | cronie.ts:85-90 | 正确 | `min(a.len, b.len)` 适配未来表形 |
| `factor_data.ts` 含离子（Na1+/Cl1-/O2-…） | factor_data.ts:31-60 | 正确 | `Σa+c≈Z`（中性）/≈`Z−电荷`（离子），自洽校验通过 |

### 1.7 `dispersion.ts` + `ff_data.ts` —— 正确

| 公式 | 位置 | 判定 | 依据 |
|---|---|---|---|
| Z 索引（Z=91 误标 Pa 已用 `FF_SYMBOLS` 修正） | dispersion.ts:105-109, ff_data.ts:31 | 正确 | 见 `docs/ff-dat-spec.md` §1.5 |
| 最近辐射列、**不插值** | dispersion.ts:63-75, :111 | 正确 | 三组列横跨 K 吸收边，插值无物理意义；Cu/Mo/Co Kα1 Δλ=0 精确命中 |
| Cr Kα(2.2897)/Fe Kα(1.9360) → `supported:false`（置灰） | dispersion.ts:46, :82-87 | 正确 | `LAMBDA_TOLERANCE=0.05`：Cr Δλ≈0.50、Fe Δλ≈0.14，均 >0.05；列间距 ~0.25 Å，0.05 阈值不会误赋 |
| 复数式 `fⱼ=f₀·e^{−Bⱼ s²}+f′+i f″` | dispersion.ts:13 | 正确 | IT Vol. C；help(5) 仅标量近似（见 §5.2） |

### 1.8 `wyckoff.ts` —— 正确

| 公式 | 位置 | 判定 | 依据 |
|---|---|---|---|
| 位置展开 ops×centers，wrap [0,1)，去重 | :178-213 | 正确 | 消光由位置求和自然涌现（计划 §4.1） |
| 坐标表达式解析 `(x−y,z+1/3)`/`(1/2,1/2,1/2)` | :46-98 | 正确 | `TERM_RE` 覆盖 `−x,2y,z,1/2,−x/2` 等；特殊位 `(1/2,1/2,1/2)` 解析为 rot=I, trans=0.5 |
| `laueOperations` 由一般位旋转矩阵去重 | :260-275 | 正确 | 取一般位（最大 mult）ops 的旋转部分；螺旋/滑移平移被忽略（多重性只看倒易旋转） |
| 原点选择回退 | :105-115 | 正确 | `201(Pn-3)` 无 origin choice 时回退首变体 |

### 1.9 `pipeline.ts` + `crystal.ts` —— 正确

| 公式 | 位置 | 判定 | 依据 |
|---|---|---|---|
| 反射枚举框界 `|h|≤gMax·a` | :100-104 | 正确 | **完备性证明**：`G=h a*+k b*+l c*`，`G·a=h`（因 `a*·a=1`）⇒ `|h|=|G·a|≤|G|·|a|≤gMax·a`；对任意晶系（含三斜）均包围所有 in-range 反射，无遗漏（过包围由实际 2θ 过滤裁掉） |
| `2θ=2·arcsin(λ/(2d))` | :124-128 | 正确 | Bragg 定律直接形式 |
| 典型 Laue 轨道去重（lex-max 代表） | :132-146 | 正确 | 每轨道取字典序最大像为唯一代表，保证计一次 |
| 消光丢弃 `intensity ≤ max·1e-12` | :168-178 | 正确 | 系统消光 `|F|≈1e-13` ⇒ 强度比 ~1e-26 ≪ 1e-12，安全丢弃；近消光弱峰（比 ~1e-6~1e-4）保留 |
| 逐原子 B 从 .cord 第 7 字段 | crystal.ts:168-178 | 正确 | `thermalB` 解析自原子块第 7 行；Al.cord 末行为 1 ⇒ B=1 |

> **性能冗余**（轻微，见 §3.3）：:123 已算 `d`，:148 调 `structureFactor` 内部 (`sinThetaOverLambda`→`dSpacing`) 又算一遍；可让 `structureFactor` 直接收 `d` 或 `s` 消重。无正确性影响。

### 1.10 `downsample.ts` —— 正确（非物理层）
降采样为图表性能工具，不涉衍射物理；`pipeline.test.ts` 已验证逻辑。

---

## 2. 问题清单（按严重程度排序）

### 2.1 轻微-1 [数据/潜在] `FF.dat` Z=58(Ce) Cu Kα1 f′ 疑似录入缺陷

- **位置**：`ff_data.ts:95`（即 `FF_TABLE[57]`），数据源自 `FF.dat` 原始字节。
- **现象**：Ce 的 Cu Kα1 `f′=−1.087`，但同元素 Kα2 `f′=−1.818`；相邻 Z 趋势（La Z=57 −1.361，Pr Z=59 −2.403，Nd Z=60 −3.164）显示 **Ce 真实值应 ≈−1.8**（Kα2 条目已是正确趋势），而 Kα1 的 −1.087 几乎复制了 Z=56 Ba 的 Cu Kα1 `f′=−1.014`。
- **复核**：用 `struct.unpack("<12d", FF.dat[57*104+8:])` 直接解码，得到与 `ff_data.ts` 完全相同的值 —— **确认是 `FF.dat` 原始录入缺陷，非解码脚本误差**（见 `scripts/extract_ff_dat.py` 一致性）。
- **影响**：仅对含 Ce 样品（CeO₂ 等）在 Cu Kα 下的色散修正失真；**当前 4 个样本（Al / NaCl / BaTiO₃ / Po）均不含 Ce，验收不受影响**。
- **建议**：用独立 f′f″ 表（Cromer–Mann / CVIP / XrayDB）对 Z≈55–62 区段交叉校验 `FF.dat`；若确认，修 `FF.dat` 并用 `scripts/gen_ff.py` 重新生成 `ff_data.ts`。**不必阻塞当前交付**。

> **2026-10-16 更新（已确认 + 已处置）**：经内部三条一致性证据（Z-趋势断裂、Kα1/Kα2 20 eV 不自洽、兄弟 Kα2 条目 −1.818 正确）与**两条独立外部交叉校验**——(a) IUCr CIF 字典 `dispersion_imag_cu` 给出 Ce f″=9.648，与 `FF.dat` 9.67 吻合（证明虚部正确）；(b) 独立 SAD 文献引用 Cromer–Liberman 表给出 Ce 在 Cu Kα 的 **f′=−1.88、f″≈9.74**——**确认 Kα1 槽位 −1.087 为录入缺陷，正确值 ≈−1.88**。
> **处置决策（主理人拍板）**：因项目以「逐字节复现 CalcXRD.exe」为首要目标，且缺陷影响可忽略（仅含 Ce + Cu Kα 样品，振幅扰动 ~1.4%），**保留 `ff_data.ts` 原始值 −1.087**；仅在 `gen_ff.py` 解码告警 + `ff_data.ts` 文件头注释 + 本文档 `docs/ff-dat-validation.md` 中显式标记为已知 legacy 数据缺陷，并给出修正值（−1.818 或 −1.88）供「优先物理正确性」的用户选用。**轻度项 P2 至此闭环**。

### 2.2 轻微-2 [文档/过时] 两处注释与代码现状不符

- `types.ts:111`：`useAnomalous` 注释「the correction itself is phase 2 (Factor.dat not decoded) — the engine ignores it for now.」—— 但 `pipeline.ts:112` 已把 `useAnomalous` 接入 `sfOpts.useDispersion`，色散**已在计算**。建议改为「色散修正由 `ff_data.ts` 提供，默认开启」。
- `lorentz.ts:23`：验收表注释写「IUCr Cronie f₀」—— 引擎早已改用 `factor_data.ts`（Factor.dat，task #17）。属历史注释残留，不影响计算。建议改为「Factor.dat f₀（含离子态）+ F′F″ 色散」。

### 2.3 轻微-3 [性能/冗余] `pipeline.ts` 重复计算 dSpacing

- **位置**：`pipeline.ts:123` 算 `d` 用于 2θ；`:148` 调 `structureFactor(...)` 内部经 `sinThetaOverLambda`→`dSpacing` 再算一遍 `d`（同一 h,k,l）。
- **影响**：每反射 1 次冗余三斜逆矩阵/sqrt；无关正确性，对 9701 栅格无感，但全谱反射枚举时浪费。
- **建议**：令 `structureFactor` 增加可选 `dOrS` 入参，pipeline 直接透传已算的 `d`，避免重算。

### 2.4 风格-1 两份 f₀ 表并存

`factor_data.ts`（引擎运行时）与 `cronie_data.ts`（仅测试交叉验证）并存。无错误；若想减少混乱，可在加充足测试覆盖后删除 `cronie_data.ts`。

---

## 3. 两个已知残差来源的判定（应 team-lead 要求）

### 3.1 Al(400) +2.51%

- **数据**：当前口径（Factor.dat f₀ + F′F″ 默认开启 + 逐原子 B=1 + q=0.10σ）六峰偏差 `0.00 / +0.05 / +0.69 / +0.94 / +0.77 / +2.51%`（`pipeline.test.ts` 验收 2/6）。
- **判定**：**物理近似上限、可接受**（<3% / <10% 验收内）。
- **归因**：
  - (400) 峰位 2θ≈99.6°，是 6 峰中最高角、最弱峰（归一化≈3.7），绝对强度小 → 任何归一化小扰动表现为较大百分比；
  - 单 λ（Cu Kα1）模型在高角的相对误差被放大；
  - **无任何 sign / 系数 / factor-2 / 常数错误可解释该偏差**——公式链为标准式（§1.1–1.5 逐项确认）。
- **是否公式层面可改进**：否（在当前 GUI 实测基准内）。若要进一步压到 <1%，需确认 legacy 是否在 List 强度中叠加 Kα2 卫星（双线叠加）——这超出 `samples/Al.xrd` 点吻合所覆盖的"单 λ 模型"范围，属"模型细节对齐"而非公式修正。

### 3.2 NaCl 离子差项放大（(111)=91.9 vs 91 / (311)=20.1 vs 19 / (331)=9.3 vs 9）

- **判定**：**物理近似上限、可接受**（已锁定实测值并量化偏差，≤6% 内）。
- **归因**（来自 `pipeline.test.ts:219-226` 与 `docs/ff-dat-spec.md §5.7`）：
  - 全奇峰 `F = f_Na − f_Cl`（**差项**），对 f′/f₀ 的微小中性 vs 离子差异极敏感；
  - `FF.dat` **无离子条目** → Na1+/Cl1- 的 f′/f″ 回退中性 Na/Cl，而 f₀ 已用 `factor_data.ts` 的真实离子系数 → 差项被放大；
  - 这是 **FF.dat 数据覆盖的物理近似上限**，非公式 bug。
- **是否公式层面可改进**：否（除非为 `FF.dat` 补充离子色散项，但 legacy 本身也缺——超越保真范围）。

---

## 4. 误报排除（重点复核项）

| # | 疑似问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | legacy `Lp=(1+cos²2θ)/(sin2θ·sinθ)` 不等价标准式 | **等价**（=标准/2，归一后一致） | `sin2θ`=sin(2θ)=2sinθcosθ；RAW-BYTE 取证（lorentz.ts:6-18） |
| 2 | help 公式(5) `f=f₀+F′+0.5·F″²/(f₀+F′)` 是 bug | **非 bug**，是 `√((f₀+F′)²+F″²)` 的二阶 Taylor | `docs/ff-dat-spec.md §5.4`；实测差 ≤1.7e-5 |
| 3 | Kα1/Kα2 组内排序可能反了 | **先 Kα1 后 Kα2**（4 条方向性证据） | ff-dat-spec.md §2.3；影响 <0.15% |
| 4 | FF 表 12-double 是分块 `[f′×6, f″×6]` | **交错**；分块会产生 f″<0（物理不可能） | ff-dat-spec.md §1.4 |
| 5 | Friedel 对导致多重性双重计数 / anomalous 下漏计 | **均不成立**：`F(−hkl)=F(hkl)*` ⇒ `|F(−hkl)|²=|F(hkl)|²` 恒成立 | 见 §5.4 推导 |
| 6 | 反射枚举框界仅对立方/正交完备 | **任意晶系完备**（含三斜） | 见 §1.9 完备性证明：`|h|=|G·a|≤gMax·a` |

---

## 5. 附录：推荐修正清单（实施方参考，非阻塞）

| 优先级 | 文件:行 | 改动 |
|---|---|---|
| P3 | `types.ts:111` | 删除「engine ignores it for now」，改为已接入 `ff_data.ts` |
| P3 | `lorentz.ts:23` | 「IUCr Cronie f₀」→「Factor.dat f₀（含离子）+ F′F″」 |
| P3 | `pipeline.ts:123,148` | `structureFactor` 接收已算的 `d`，消除重复 dSpacing |
| P2 | `FF.dat` / `ff_data.ts:95` | 交叉校验 Z=55–62 区段，修正 Ce Cu Kα1 f′ 录入缺陷（如确认） |

---

## 6. 复核命令

```bash
# 1. 物理测试套件（134 项全过）
"$NODE" node_modules/vitest/vitest.mjs run
# → Test Files  9 passed / Tests  134 passed

# 2. 复核 Ce 可疑值确为 FF.dat 原始字节
python - <<'PY'
import struct
d=open('D:/Projects/CalcXRD/FF.dat','rb').read()
z=58; r=d[(z-1)*104:(z-1)*104+104]
v=struct.unpack('<12d', r[8:104])
print('Ce', r[1:r[0]+1].decode(), 'CuKa1 f\'=',v[0], 'CuKa2 f\'=',v[2])
PY
# → CuKa1 f'=-1.087  CuKa2 f'=-1.818  （Kα1 应为 ≈-1.8，疑似录入缺陷）

# 3. 与 GUI 验收基线对照
#   见 web/src/lib/xrd/pipeline.test.ts 验收 2 / 验收 6（Al 六峰、NaCl 奇偶峰）
```
