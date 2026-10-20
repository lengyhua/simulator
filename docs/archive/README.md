# 归档区（历史过程文档）

> 本目录只放**过程记录**，不参与日常查阅。
> 项目结论统一入口：[`../SETTLED.md`](../SETTLED.md)；参数/数据索引：[`../DATA-REFERENCE.md`](../DATA-REFERENCE.md)。
>
> 归档原则：结论与依据留在活跃文档，按日期追加的推导、试算、被推翻的中间结论移入本目录。
> 归档内容仍可在 git 历史与此处查阅，**不会丢失** —— 目的是让活跃文档只呈现"现在什么是准的"。

## 归档文件

| 文件 | 原位置 | 归档原因 | 结论去向 |
|---|---|---|---|
| `ghidra-reverse-findings-process.md` | `docs/ghidra-reverse-findings.md` | 1402 行按日期追加的取证过程（§8.1–§8.27） | 结论 → [`../SETTLED.md`](../SETTLED.md)；字节级证据索引 → [`../ghidra-reverse-findings.md`](../ghidra-reverse-findings.md) |
| `DATA-REORGANIZATION.md` | `docs/DATA-REORGANIZATION.md` | 2026-10-16 文档整理操作记录（过程） | 导航 → [`../DATA-REFERENCE.md`](../DATA-REFERENCE.md) §2 |
| `dispersion-al-settlement.md` | `docs/dispersion-al-settlement.md` | Al 色散公式定案 + B 值纠错的过程推导 | → [`../SETTLED.md`](../SETTLED.md) §3（色散/DW）§6（默认参数） |
| `single-xrd-formula-audit.md` | `docs/single-xrd-formula-audit.md` | single 强度公式审计（含早期残差分析） | → [`../SETTLED.md`](../SETTLED.md) §3.3/§3.4 与 §8 |
| **`ref-data/`**（54 个原始采集文件） | `ref-data/` | 2026-10-20 定案「**以测试记录原始数据**」：全部参考值已转写进测试，采集件不再参与查阅与比对 | → `web/src/lib/xrd/legacy_refdata.test.ts`（36 条 single-XRD 存档逐值）与 `web/src/lib/xrd/legacy_factors.test.ts`（18 份 Search Factor）；定案 → [`../SETTLED.md`](../SETTLED.md) §8.28/§8.29 与 §9 |

## `ref-data/` 归档说明（2026-10-20）

原 `ref-data/` 下的 54 个文件是原程序 `CalcXRD.exe` 的**人工采集件**
（`single-xrd/` 36 份 single-XRD 输出记录、`factors/` 18 份 Search Factor 窗口读数），
曾作为定案 XRD 参数的对照基准。

用户定案：**原始采集件不再保留为活跃数据，改由测试承载原始值**——
「以后就以测试来记录原始数据文件，方便进行验证」。因此：

- 全部逐值基准已转写进两个测试文件（含每个用例的 `ref:` 溯源字段指向本目录对应文件）；
- 本目录仅作**溯源留档**，任何测试都不读取它（`grep -r "ref-data" web/src` 只剩注释中的溯源路径）；
- 新增对照请直接往测试里加用例，不要再往本目录加文件。

采集件本身有两处**已知不可信**（详见 `SETTLED.md` §8.28/§8.29）：
`018_Al-225.md` 的 λ 标注应为 Fe Kα 加权 1.93736（非 1.93604）；
`023_Al-75.md` / `024_Al-76.md` 的表体与 225 输出逐字节相同，不描述 75/76 群的行为。

> **保留未归档**：[`../audits/`](../audits/) 三份 2026-10-16 专家评审
> （`physics-audit` / `ff-dat-validation` / `intensity-uncertainty-review`）。
> 它们是**独立外部视角的依据**（不确定性分析、缺陷外部校验），不是本项目的过程流水；
> 其中「134 项物理测试」等数字是当时快照，已在 `DATA-REFERENCE.md` §4 #16 加脚注说明。

## 已删除文档及去向

2026-10-20 清理，以下文件此前仅带 DEPRECATED 头、内容已并入他处，故删除（git 历史可追溯）：

| 已删除 | 内容去向 |
|---|---|
| `docs/ff-dat-spec.md` | [`../params-dispersion.md`](../params-dispersion.md) §1/§2/§3（二进制结构、列序）；Kα1/Kα2 取证 → 同文件 §5 |
| `docs/itc-c-formulas.md` | [`../formulas.md`](../formulas.md) |
| `docs/itc-c-table6113-extraction.md` | [`../data-provenance.md`](../data-provenance.md)（提取记录） |
| `docs/ion-and-cr-fe-data-research.md` | 公式/多源实证 → [`../data-provenance.md`](../data-provenance.md) §5；离子 F′/F″ 与 Cr/Fe 方案 → [`../params-dispersion.md`](../params-dispersion.md) §2.3/§3/§4 |

> ⚠ 历史文档（[`../audits/`](../audits/) 的 2026-10-16 评审、`superpowers/plans/` 的计划）
> 中若出现对上述已删除文件的引用，按本表映射解读即可；这些历史文档**不做改写**以保留原貌。
