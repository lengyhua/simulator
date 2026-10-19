# f₀ 原子散射因子 · 参数参考

> 入口：[`DATA-REFERENCE.md`](DATA-REFERENCE.md) §1。本文 = f₀ 细节。
> 公式见 [`formulas.md`](formulas.md) §1；来源谱系见 [`data-provenance.md`](data-provenance.md)。

## 0. TL;DR

| 项 | 结论 |
|---|---|
| 运行时权威表 | `web/src/lib/xrd/factor_data.ts`（**199 物种，含离子**，5-Gaussian+c） |
| 原始来源 | `Factor.dat`（19104 B = 199 × 96 B），原程序自己的 f₀ 表 |
| 理论上游 | ITC Vol C 6.1.1.1/.3/.4（Cromer–Mann）；`Factor.dat` 扩展为 5-Gaussian |
| 离子条目 | = IUCr 标准值，**不是近似**，无需标注。⚠ **原「偏差 <0.01%」声明已实测推翻**（2026-10-17）：104 项可比，s≤0.2 时 71 项 <0.01%（最差 Bi5+ 0.503%）；s≤0.6 时仅 10 项 <0.01%（最差 **Bi5+ 7.065%**）→ **偏差必须按 s 区间表述**，见 `DATA-REFERENCE.md` §4 #15 / §6 R1 |
| 对照测试表 | `cronie_data.ts`（手抄 IUCr，仅测试，引擎不用） |

## 1. 系数形式

$$f_0(s)=\sum_{i=1}^{5} a_i\,e^{-b_i s^2}+c,\qquad s=\tfrac{\sin\theta}{\lambda}\ \mathrm{\AA}^{-1}$$

- **指数为负**（原程序 `help` RTF 写 $e^{+b_i(\lambda/\sin\theta)^2}$ 是转写错误，物理荒谬）。
- 自检：$f_0(0)=\sum a_i+c=$ 电子数（中性 $Z$；离子 $Z\mp q$）。
- `Factor.dat` = 19104 B = **199 × 96 B**，记录 = 8 B `ShortString[7]`（长度字节+名称+零填充）+ 11 个 little-endian double（a1 b1 a2 b2 a3 b3 a4 b4 a5 b5 c 交错）。

### 1.1 GUI 交叉验证：Search Factor 对话框（2026-10-17）

原程序 `Search Factor and F',F''` 对话框实测布局与语义：

- 右侧元素表 = `Factor.dat` 全 199 物种（与主窗口元素下拉同一列表）；
- 系数表 = 7 列 × 2 行：第 1 行 = a₁–a₅ + c + F1，第 2 行 = b₁–b₅ + F2（列表头为 (aᵢ bᵢ) 竖对，第 j 列上行 aⱼ、下行 bⱼ）；F1/F2 应为所选波长下的 f′/f″（H 两值皆 0，无法按列区分，按表头顺序推定）；
- 曲线 = f₀(2θ)，标注 `Max Fo` 与 `Max Fo (F1 F2)`。

实证结果（选中 H、波长 MoKa1）：

- 显示系数与 `factor_data.ts` 的 `H` **逐值一致**：a = [0.413048, 0.294953, 0.187491, 0.080701, 0.023736]，b = [15.569946, 32.398468, 5.711404, 61.889874, 1.334118]，c = 4.9E-5；
- `Max Fo = 0.999978 = Σa+c`（§1 自检的可视化）；F1 = F2 = 0 与 FF.dat 中 H 行列全 0 一致；
- `Factor.dat` 字节序经直接读取复核：记录内 11 个 double 确为**交错** a₁ b₁ a₂ b₂ …（H 原始序列 [0.413048, 15.569946, 0.294953, 32.398468, …] 可证），本文 §1 布局描述无误；`gen_factor_dat.py --check` 199 条 round-trip 全过、`cross_validate_f0.py` 对 gemmi it92 全过。

GUI 只读检查工具（截屏与裁片一律写 `scripts/tmp/peek/`，git 已忽略；ref-temp/ 目录已于 2026-10-19 删除，勿再创建）：

| 脚本 | 作用 |
|---|---|
| `scripts/peek_calcxrd.py` | pywinauto 枚举顶层窗口 + PrintWindow 截图（可按标题关键字过滤） |
| `scripts/crop_peek.py` | 对截图按区域裁剪放大（低分辨率读数用） |
| `scripts/dump_factor_dialog.py` | Win32 消息精确提取 Search Factor 对话框的下拉/列表框文本 |
| `scripts/dump_main_combos.py` | Win32 消息精确提取主窗口全部下拉框（元素表 199 项、λ 表、晶系、空间群） |

## 2. 数据在哪用（引擎）

| 文件 | 角色 |
|---|---|
| `web/src/lib/xrd/factor_data.ts` | **运行时权威**：199 物种系数（含 `Na1+`/`Cl1-`/`O2-`… 离子） |
| `web/src/lib/xrd/cronie.ts:77 f0(species,s)` | 查系数求 f₀；对离子 `normalizeElement` 去尾电荷后回退中性 |
| `web/src/lib/xrd/structure_factor.ts:168` | f₀ + 热因子 + 色散 → 复数结构因子 |
| `web/src/lib/xrd/cronie_data.ts` | 手抄 IUCr，**仅测试交叉验证**，引擎不引用 |

## 3. 离子 f₀ 权威来源（关键结论）

- 离子 f₀（Na¹⁺/Cl⁻¹/O²⁻…）**有权威来源** = IUCr Table 6.1.1.3/6.1.1.4。
  逐元素比对（s=0.1）：Na¹⁺ 9.5463 / Cl⁻¹ 15.6883 与 `Factor.dat` **0.00% 偏差**。
- 离子 F′/F″（色散）**仍无权威表** —— 见 [`params-dispersion.md`](params-dispersion.md)。
- 本机 ITC-C PDF 文本层不可逐值提取（列粘连+s 行交错，49 处单调性违例）；
  离子 f₀ 权威采样表改从 **Gemmi `it92.hpp`**（ITC-1992 系数）求值 →
  `docs/itc-c-table6113.json`（113 物种 × 66 s），提取记录见 [`data-provenance.md`](data-provenance.md)。
  注意 `Cval`/`Sival` Gemmi 无条目，JSON 中用中性 C/Si 替代并逐条注明。

## 4. 维护代码

| 脚本 | 作用 |
|---|---|
| `scripts/cross_validate_f0.py` | f₀ vs gemmi it92：中性全过（f₀(0)≈Z）；离子 <0.1%（Bi5⁺ s=0.3 为 5-Gaussian 截断边缘 1.3%）；H s=0.5 已知 4-Gaussian 截断 |
| ⚠ `gen_factor_dat.py` | **缺失**（`factor_data.ts` 头声称由其生成）。待补：`Factor.dat` → `factor_data.ts` + `docs/data/factor_dat.csv` |

## 5. 维护建议

- **改 f₀**：必须动 `Factor.dat`（保真）或走 IUCr/Gemmi 权威源；重生成后必跑 `cross_validate_f0.py` + `npm test`。
- **不要**把 `cronie_data.ts` 当运行时源；它只服务测试交叉验证（开放项 8 可删）。
- **大数据**：`factor_dat.csv`（199 行）放 `docs/data/`，MD 只引用不内嵌。
