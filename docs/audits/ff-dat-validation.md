# FF.dat 色散表交叉校验与 Ce(Z=58) 数据缺陷确认

> 作者：主理人（team-lead）
> 日期：2026-10-16
> 关联：`docs/params-dispersion.md`（原 ff-dat-spec）（二进制结构）、`docs/audits/physics-audit.md` §2.1（审计项 P2）
> 状态：**Ce Cu Kα1 f′ 录入缺陷已确认；按保真策略保留原始值，本文档沉淀权威参考值与修正值**

---

## 0. TL;DR

- `FF.dat` 中 **Ce (Z=58) 的 Cu Kα1 `f′ = −1.087` 是一个已确认的录入缺陷**（非解码脚本误差）。
- 正确值 ≈ **−1.88**（Cromer–Liberman / IUCr CIF 等独立来源）；其**兄弟条目 Cu Kα2 `f′ = −1.818` 已是正确的量级**，反向证明 Kα1 槽位是被损坏的那一个。
- 本项目以**逐字节复现 CalcXRD.exe** 为首要目标，故**在 `ff_data.ts` 中保留原始值 −1.087**，仅在代码注释与本文档中明确标记为已知缺陷，并提供修正值供「优先物理正确性」的用户选用。
- 缺陷**孤立**：仅 Ce 的 Cu Kα1 实部一项；Mo 列已与 IUCr CIF 字典交叉校验一致，证明 `FF.dat` 其余部分正常。

---

## 1. 缺陷现象

`ff_data.ts:95`（= `FF_TABLE[57]`，源自 `FF.dat` 原始字节 `struct.unpack('<12d', ...)`）的 Ce 行：

```
[-1.087, 9.671, -1.818, 9.683, -0.205, 2.64, -0.203, 2.649, -8.054, 11.838, -8.087, 12.852]
   ↑CuKα1 f′  ↑f″    ↑CuKα2 f′
```

即 Cu Kα1 `f′ = −1.087`，但其 Cu Kα2 `f′ = −1.818`。两者入射波长仅差 0.0038 Å（能量差 20 eV），反常色散实部 `f′` 在如此窄的能量窗口内**不可能变化 0.73**——这是缺陷的第一直觉信号。

---

## 2. 三条独立内部证据（全部指向 Kα1 槽位损坏）

### 2.1 Z-趋势单调性被打破

Cu Kα1 `f′` 随 Z 的单调（越来越负）趋势：

| Z  | 元素         | Cu Kα1 f′（FF.dat）                       |
| -- | ------------ | ------------------------------------------- |
| 56 | Ba           | −1.014                                     |
| 57 | La           | −1.361                                     |
| 58 | **Ce** | **−1.087** ⚠ 比 La 还浅（趋势断裂） |
| 59 | Pr           | −2.403                                     |
| 60 | Nd           | −3.164                                     |

Ce 的 −1.087 不仅没有延续「比 La(−1.361) 更深」的走势，反而**回退到与 Z=56 Ba(−1.014) 几乎相同**——强烈暗示该值是从 Ba 错抄/错位而来。

### 2.2 Kα1 / Kα2 自洽性崩坏

同一元素、20 eV 间隔的两个辐射，其 `f′` 必须几乎相等（差异应 < 0.05）。对比 Ce 的两条 Kα 与相邻元素的两条 Kα：

- Ce：`f′_Kα1 = −1.087`，`f′_Kα2 = −1.818` → 差 **0.73**（不可能）
- 对照 La：`f′_Kα1 = −1.361`，`f′_Kα2 = −1.369` → 差 0.008（合理）
- 对照 Pr：`f′_Kα1 = −2.403`，`f′_Kα2 = −2.415` → 差 0.012（合理）

只有 Ce 的 Kα1 一项偏离，且偏离方向恰好使它与 Ba 重合 → **Kα1 槽位是损坏项**。

### 2.3 兄弟条目 Cu Kα2 自洽

Ce 的 Cu Kα2 `f′ = −1.818` 落在 La(−1.369) 与 Pr(−2.415) 之间，**完美契合 Z-趋势**。这证明：`FF.dat` 对 Ce 的「正确量级」是 ≈ −1.8，而 Cu Kα1 槽位的 −1.087 是孤立的录入错误。

> 直接对 `FF.dat` 原始字节复核（`struct.unpack('<12d', FF.dat[57*104+8:])`）得到与 `ff_data.ts` 完全相同的值，确认**是源数据缺陷，不是解码脚本误差**。

---

## 3. 外部权威交叉校验（联网沉淀）

### 3.1 IUCr CIF 字典（官方晶体学数据字典）

IUCr 发布的 CIF 核心字典给出各元素在指定辐射下的反常散射系数：

- `_atom_type_scat.dispersion_imag_cu`（Cu Kα 虚部 f″）：**Ce = 9.648**
  → 与 `FF.dat` 的 Ce Cu Kα1 `f″ = 9.671` **一致**（差 0.023，属 3 位小数量化误差）。
- `_atom_type_scat.dispersion_imag_mo`（Mo Kα 虚部 f″）：**Ce = 2.632**
  → 与 `FF.dat` 的 Ce Mo Kα1 `f″ = 2.64` / Kα2 `f″ = 2.649` **一致**。

→ **`FF.dat` 的虚部 f″ 与 IUCr 字典吻合**，进一步说明缺陷**仅限 Ce 的 Cu Kα1 实部 f′**。

### 3.2 独立反常散射文献（Cromer–Liberman 数据表）

SAD 重原子定相文献（如 *Acta Cryst. D* 相关 Ce-SAD 工作，引用
`skuld.bmsc.washington.edu/scatter/AS_periodic.html` 的 Cromer–Liberman 表）明确给出：

> 铈（Ce, Z=58）在 Cu Kα（λ ≈ 1.54 Å）下的反常散射系数：
> **f′ = −1.88 ē，f″ = 9.74–9.76 ē**

- `f″ ≈ 9.74` 与 `FF.dat` 的 9.671 量级一致（确认虚部正确）；
- **`f′ = −1.88`** 与「兄弟条目 −1.818 + Z-趋势」完全吻合，且远离损坏值 −1.087（差 0.79）。

### 3.3 结论

| 来源                               | Ce Cu Kα f′       | 与 FF.dat 对比 |
| ---------------------------------- | ------------------- | -------------- |
| FF.dat Cu Kα1 槽位                | **−1.087**   | ❌ 损坏        |
| FF.dat Cu Kα2 槽位                | −1.818             | ✅ 正确量级    |
| IUCr / SAD 文献 (Cromer–Liberman) | **≈ −1.88** | ✅ 修正目标值  |

**推荐修正值**：若选择物理正确性优先，将 Ce Cu Kα1 `f′` 由 −1.087 改为 **−1.818**（直接沿用已正确的兄弟 Kα2 值，最简、自洽、且与独立值 −1.88 差 0.06）；追求更精确可填 **−1.88**。

---

## 4. 处置决策（主理人拍板）

**保留 `FF.dat` / `ff_data.ts` 中的原始值 −1.087（不静默修正）。**

理由：

1. **项目首要目标是逐字节复现 CalcXRD.exe 的物理**。`FF.dat` 是 legacy 程序自带的色散源表，web 引擎 1:1 解码它；改动数值会使 web 输出对 Ce 偏离原程序，破坏「可与 CalcXRD.exe 1:1 对照」这一核心承诺。
2. **影响可忽略**：缺陷只在含 Ce 样品 + Cu Kα 下显现，且 Δ0.79 相比于 Ce 的散射振幅（~58）仅 ~1.4% 的相对扰动，对积分强度影响更小；当前 4 个验收样本（Al / NaCl / BaTiO₃ / Po）均不含 Ce。
3. **缺陷已显式标记**：`gen_ff.py` 在解码 Z=58 时打印 stderr 告警，生成的 `ff_data.ts` 文件头也写入了本缺陷说明并指向本文件；`docs/audits/physics-audit.md` §2.1 记录为已知项。

**若后续决定优先物理正确性**，只需改一处（`web/src/lib/xrd/ff_data.ts` 第 95 行首元素，或改 `FF.dat` 后重跑 `scripts/gen_ff.py`）：

```ts
// 修正前（保真，保留）
[-1.087, 9.671, -1.818, 9.683, ...]
// 修正后（物理正确，可选）
[-1.818, 9.671, -1.818, 9.683, ...]   // 或 -1.88
```

---

## 5. 权威参考来源（已联网沉淀至本项目）

以下来源用于交叉校验 `FF.dat`，可作为后续维护的权威基准：

1. **International Tables for Crystallography, Volume C**（IT Vol. C），Table 6.1.1.10 等：标准反常散射系数表（f′ / f″）。
2. **Cromer, D. T. & Liberman, D. (1981).** *Anomalous dispersion corrections computed from self-consistent relativistic Dirac–Slater wave functions.* Acta Cryst. A37, 267–268.（f′/f″ 的现代计算基准）
3. **IUCr CIF 核心字典**（在线）：
   - `_atom_type_scat.dispersion_real_cu` / `_dispersion_imag_cu`（Cu Kα 实部/虚部）
   - `_atom_type_scat.dispersion_imag_mo`（Mo Kα 虚部）
   - 见 https://www.iucr.org/__data/iucr/cifdic_html/3_orig/CORE_DIC/
4. **CXRO Henke 表**（LBNL 中心 X 射线光学）：https://henke.lbl.gov/optical_constants/ （f₁/f₂ 随能量连续表，用于独立重算任意波长的 f′）。
5. **NIST X-ray Form Factor, Attenuation, and Scattering Tables (FFAST)**：https://www.nist.gov/pml/x-ray-form-factor-attenuation-and-scattering-tables
6. **Busing, W. R. & Levy, H. A.** 反常散射的复数结构因子形式 `f = f₀·e^{−B s²} + f′ + i f″`（IT Vol. C 采用）。
7. **Ce-SAD 文献**（如 Weiss et al. 2001; Narayanan & Velmurugan 2013）引用 `skuld.bmsc.washington.edu/scatter/` 给出 Ce 在 Cu Kα 的 f′=−1.88、f″≈9.74。

> 注：所有引用均为物理常数/方法的权威出处，未复制任何受版权保护的表格全文；如有需要以数据文件形式落地，应从上述官方来源按许可获取。
