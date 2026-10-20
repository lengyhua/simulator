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
