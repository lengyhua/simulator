# ITC Vol C §6.1 公式总汇（LaTeX）

> 本文件收录 ITC Vol C（Prince, ed., 4th ed., 2006）第 6.1 章与 CalcXRD
> 相关的全部公式，统一 **LaTeX**（MathJax/KaTeX 可直接渲染）。
> 编号沿用原书。引擎消费点见 [`DATA-REFERENCE.md`](DATA-REFERENCE.md)。

## 1. 原子散射因子 f₀ 的解析近似

对应 Table 6.1.1.1（自由原子）/ 6.1.1.3（离子）的拟合（§6.1.1.15）：

$$f(s)=\sum_{i=1}^{4}a_i\,e^{-b_i s^{2}}+c,\qquad s=\tfrac{\sin\theta}{\lambda}\ \mathrm{\AA}^{-1}$$

- 系数见 Table 6.1.1.4（4-Gaussian+c）；`Factor.dat` 扩展为 5-Gaussian（`Factor.dat` 11 double）。
- **指数为负**。原 `help` RTF 写作 $e^{+b_i(\lambda/\sin\theta)^2}$ 是转写错误。
- 自检：$f(0)=\sum a_i+c=$ 电子数（中性 $Z$；离子 $Z\mp q$）。
- 高角（$2<s<6$）用 Table 6.1.1.5 对数多项式（Fox 1989）：$\ln f(s)=\sum_{i=0}^{3}a_i s^i$（本项目暂未用）。

## 2. 散射因子内插（§6.1.1.3.1）

- **Aitken 迭代式**（6.1.1.13，递推）：$f_x(j|x_0,\dots,x_k)=\frac{x_k-x}{x_k-x_{k-1}}\,f_x(j|x_0,\dots,x_{k-1})$（完整递推含前一项，见原书）。
- **Lagrange 多项式**（6.1.1.14）：$f_x=\sum_{i=0}^{n}l_i(x)f_i+R_n(x)$，$l_i(x)=\dfrac{n_x(x)}{(x-x_i)n'_i(x)}$，$n_x(x)=\prod_{j=0}^{n}(x-x_j)$。

> 内插只作背景；本项目权威路径是**直接代入 §1 解析系数**（`factor_data.ts`），不走表格内插。

## 3. 温度因子（Debye–Waller，§6.1.1.5）

各向异性张量（6.1.1.31）：$T_0(\mathbf{S})=\exp\!\bigl(-\tfrac12\,\mathbf{S}^{T}\hat\Gamma\,\mathbf{S}\bigr)$

**各向同性特例**（CalcXRD 实际使用，$R_{ii}=\tfrac{B}{8\pi^2}$）：

$$\boxed{\,f=f_0\,e^{-B s^{2}},\quad s=\tfrac{\sin\theta}{\lambda}\,}$$

> **勘误**：`.cord` 第 7 字段 = 热因子 B（**非**占位率/多重度）。默认 B=1（`constants.ts:53`）。

## 4. 结构因子（§6.1.1.7，公式 6.1.1.93/94）

$$F(\mathbf{S})=\sum_{j=1}^{N}f_j\,T_j\,e^{i\mathbf{S}\cdot\mathbf{r}_j},\qquad f=f_0+f'+i f''$$

粉晶消光由 Wyckoff 位置表（`wyckoff_data.ts`）查系统消光，$F_{hkl}\equiv0$ 者不衍射。
**引擎复数色散式与 ITC 标准约定完全一致**（Debye–Waller 只作用 f₀，f′/f″ 为 s 无关复数常数）。

## 5. 反常色散修正（§6.3.2；CalcXRD `FF.dat`）

**严格复数式**：$f=f_0+F'+iF''$

**CalcXRD help 公式 (5) 标量近似**：$f\approx f_0+F'+\dfrac{0.5F''^{2}}{f_0+F'}$（$|f|$ 的二阶 Taylor，非 bug；多物种结构下与复数式不等价，引擎用复数式）。

## 6. Lorentz–polarization 因子（§6.2.2/.4/.5）

粉晶方法：$L=\dfrac{1}{\sin^2\theta\cos\theta}$，$P=\dfrac{1+\cos^2 2\theta}{2}$，合 $Lp=L\cdot P$。
`lorentz.ts:52`。低角 $\sin\theta\to0$ 奇点，管线 `MIN_THETA_DEG` 兜底。

## 7. 强度与峰形（§6.1.1.8 + CalcXRD 高斯）

单晶反射率（6.1.1.95）：
$$\frac{\omega I}{I_0}=\frac{r_e^2\lambda^3}{4\pi V_c}\,\frac{1+\cos^2 2\theta}{\sin^2\theta\cos\theta}\,|F(\mathbf{S})|^2$$

CalcXRD 粉晶：$I_{hkl}=K\,Lp\,|F_{hkl}|^2\cdot\text{mult}_{hkl}$，连续化
$$I(2\theta)=\sum_{hkl}I_{hkl}\,\exp\!\Big[-\frac{(2\theta-2\theta_{hkl})^2}{2q^2}\Big]$$
$q=\sigma=0.10°$（`gaussian.ts`）。

## 8. 符号速查

| 符号 | 含义 | 单位 |
|---|---|---|
| $s=\sin\theta/\lambda$ | 散射矢量 | Å⁻¹ |
| $f_0(s)$ | 平均原子散射因子 | e⁻ |
| $B$ | 各向同性热因子（`.cord` 第 7 字段） | Å² |
| $F',F''$ | 反常色散实/虚部 | e⁻ |
| $Lp$ | Lorentz–polarization 因子 | — |
| $q$ | 高斯峰形 σ | ° |
| $K$ | 几何/仪器常数 | — |

## 9. 与项目文档对应

§1↔`Factor.dat`/`params-f0.md`；§3↔`params-geometry-peak.md` §2；§4↔`wyckoff_data.ts`；§5↔`params-dispersion.md`；§6/§7↔`params-geometry-peak.md` §4/§5。
