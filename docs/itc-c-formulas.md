# ITC-C 公式解析（Chapter 6.1）

> 本文件收录 ITC Vol C（Prince, ed., 4th ed., 2006）第 6.1 章与 CalcXRD
> 项目直接相关的全部公式，统一用 **LaTeX** 语法书写，便于在支持
> MathJax/KaTeX 的文档或 README 中直接渲染。
>
> 公式编号沿用原书（§6.1.1.x）。来源标注见 `references/README.md` §2.1。

---

## 1. 原子散射因子 f₀ 的解析近似（Cromer–Mann 形式）

对应 **Table 6.1.1.1**（自由原子）与 **Table 6.1.1.3**（化学相关离子）
数值表的拟合形式（§6.1.1.3 公式 6.1.1.15）：

$$
f(s) = \sum_{i=1}^{4} a_i\, e^{-b_i s^2} + c, \qquad s = \frac{\sin\theta}{\lambda}\ \ [\mathrm{\AA}^{-1}]
$$

- 系数 $a_i, b_i, c$ 即 **Table 6.1.1.4**（4-Gaussian + c）。
- **符号约定（务必注意）**：指数为**负**（$e^{-b_i s^2}$）。
  原书 RTF `help` 文档写作 $e^{+b_i(\lambda/\sin\theta)^2}$，是
  转写错误（字面代入得 f(Al, s=0.1) ≈ 0.14，物理荒谬）。
- **自检**：$f(0) = \sum_i a_i + c = $ 电子数（中性 $Z$；离子 $Z \mp q$）。

本仓库 `Factor.dat`（199 物种）与 `docs/itc-c-table6113.json`（113 离子
物种 × 66 s 采样点）均基于此系数表。

> 高角区（$2.0 < s < 6.0\ \mathrm{\AA}^{-1}$）用 Table 6.1.1.5 的
> 对数多项式（Fox et al., 1989；§6.1.1.16）：
> $$\ln f(s) = \sum_{i=0}^{3} a_i\, s^i$$
> 本项目暂未使用。

---

## 2. 散射因子内插（§6.1.1.3.1）

对 Tabulated $f(s)$ 的两种通用内插（原书 6.1.1.13 / 6.1.1.14）：

- **Aitken 迭代式**（递推）：$f_x(j\mid x_0,\dots,x_k)$ 为在
  $x_0,\dots,x_k$ 处与表值重合的多项式：
  $$f_x(j\mid x_0,\dots,x_k) = \frac{x_k - x}{x_k - x_{k-1}}\, f_x(j\mid x_0,\dots,x_{k-1})$$
  （完整递推还含前一项 $f_x(j\mid x_0,\dots,x_{k-2})$，见原书 6.1.1.13）
  迭代至增加 $k$ 不再改变插值。

- **Lagrange 多项式**：
  $$f_x = \sum_{i=0}^{n} l_i(x)\, f_i + R_n(x),\quad
  l_i(x) = \frac{n_x(x)}{(x-x_i)\,n'_i(x)}$$
  其中 $n_x(x)=\prod_{j=0}^{n}(x-x_j)$，$n'_i(x)$ 为其导数。

> 内插只作背景记录；本项目的权威路径是**直接代入 §1 的解析系数**
> （`docs/itc-c-table6113.json` 的 `coefficients` 字段），不走表格内插。

---

## 3. 温度因子（Debye–Waller，§6.1.1.5）

位移分布 $u$ 的高斯近似（原书 6.1.1.30）：

$$
\rho(\mathbf{u}) \propto \frac{1}{(2\pi)^{3/2}\, |\mathbf{R}|^{1/2}}\,
\exp\!\left(-\tfrac12\, \mathbf{u}^T \mathbf{R}^{-1} \mathbf{u}\right)
$$

对应温度因子（原书 6.1.1.31，散射振幅的 Fourier 变换）：

$$
T(S) = \exp\!\left(-\tfrac12\, \mathbf{S}^T \mathbf{R} \mathbf{S}\right)
$$

**各向同性特例**（CalcXRD 实际使用）：令 $R_{ii} = \frac{B}{8\pi^2}$
（$B$ 即 `.cord` 第 7 个原子字段，单位 Å²），且 $S$ 沿动量转移方向：

$$
\boxed{\,f = f_0 \cdot \exp\!\left(-B\, s^2\right),\quad s = \tfrac{\sin\theta}{\lambda}\,}
$$

> **勘误**：`.cord` 第 7 字段是热因子 $B$（**不是**占位率/多重度）。
> 原书 §6.1.1.5 用张量 $T(hkl)$ 的一般式；CalcXRD 用各向同性 $B$。

---

## 4. 结构因子（§6.1.1.7）

$$
F_{hkl} = \sum_j f_j \, \exp\!\big(2\pi i\,(h x_j + k y_j + l z_j)\big)
$$

其中 $f_j = f_{0,j} \cdot T(\mathbf{S})$（§1 + §3）。

**粉末消光**：由空间群的 Wyckoff 位置表（`Wyckoff` / `Wyckoff_Point`）
查系统消光；`F_{hkl} \equiv 0` 的 hkl 不产生衍射。

---

## 5. 反常色散修正（§6.3.2 色散；CalcXRD `FF.dat`）

**严格复数形式**：

$$
f = f_0 + F' + i\,F''
$$

**CalcXRD help 公式 (5) 的标量近似**：

$$
f \approx f_0 + F' + \frac{0.5\, (F'')^2}{f_0 + F'}
$$

- 两者数值差 ≤ $2\times10^{-5}$（`docs/ff-dat-validation.md` §0 已证）。
- 但**多物种结构**下标量式 ≠ 复数式；引擎采用**复数式**。
- $F', F''$ 来源：`FF.dat`（中性 92 元素 × 6 波长）；离子 $F',F''$
  目前无权威库（开放项 P1，见 `references/README.md` §7）。

---

## 6. Lorentz–polarization 因子 $Lp$（§6.2.2 / §6.2.4）

粉末方法（§6.2.5）：

$$
L = \frac{1}{\sin^2\theta\,\cos\theta}, \qquad
P = \frac{1+\cos^2 2\theta}{2}
$$

合称 $Lp = L \cdot P$。

> 原书 §6.2 给出晶体学/实验几何的一般式；CalcXRD 粉末管线用
> 上式。$L$ 含 $\sin\theta$ 奇点 → 低角端需注意。

---

## 7. 强度与峰形（§6.1.1.8 + CalcXRD 高斯峰形）

单晶体反射强度（原书 §6.1.1.8）：

$$
I_{hkl} = I_0 \, K \, Lp \, \lvert F_{hkl} \rvert^2
$$

**粉末连续化**（CalcXRD 将离峰 hkl 强度转为 2θ 连续谱）：

$$
I(2\theta) = \sum_{hkl} I_{hkl}\,
\exp\!\left[-\frac{(2\theta - 2\theta_{hkl})^2}{2\,\sigma^2}\right]
$$

> 高斯峰形宽度 $\sigma$ 与 `.xrd` 输出步长相关；原书 §2.3.1.1.7 /
> §5.2.3.1.2 讨论晶粒尺寸/仪器展宽。

---

## 8. 符号约定速查

| 符号 | 含义 | 单位 |
|---|---|---|
| $s = \sin\theta/\lambda$ | 倒易空间散射矢量 | Å⁻¹ |
| $f_0(s)$ | 平均原子散射因子（电子数） | e⁻ |
| $B$ | 各向同性热因子（`.cord` 第 7 字段） | Å² |
| $F', F''$ | 反常色散实/虚部 | e⁻ |
| $Lp$ | Lorentz–polarization 因子 | — |
| $I_0$ | 入射强度 | — |
| $K$ | 几何/仪器常数 | — |

---

## 9. 与项目文档的对应

- §1 ↔ `Factor.dat` / `docs/itc-c-table6113.json` / `references/README.md` §1.1
- §3 ↔ `docs/ion-and-cr-fe-data-research.md`（$B$ 字段勘误）
- §4 ↔ `Wyckoff` / `Wyckoff_Point` / `CLAUDE.md` §.cord
- §5 ↔ `FF.dat` / `docs/ff-dat-spec.md` / `docs/ff-dat-validation.md`
- §6, §7 ↔ `.xrd` 输出 / `CLAUDE.md` §.xrd（`Full Scall` 非归一化）
