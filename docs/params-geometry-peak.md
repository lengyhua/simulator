# 几何与峰形参数 · 参考

> 入口：[`DATA-REFERENCE.md`](DATA-REFERENCE.md) §1。本文 = Wyckoff 消光 / 热因子 B / λ / Lp / 高斯 q。
> 公式见 [`formulas.md`](formulas.md) §3/§6/§7；来源见 [`data-provenance.md`](data-provenance.md)。

## 0. TL;DR

| 参数 | 值 / 来源 | 引擎锚点 | 备注 |
|---|---|---|---|
| Wyckoff 消光/位置 | `Wyckoff`+`WholeSG`（254 群） | `wyckoff_data.ts` + `wyckoff.ts:163` | 系统消光靠它 |
| 热因子 B | 默认 **1**（Å²） | `constants.ts:53 DEFAULT_ATOM_THERMAL_B` | 逐原子（`.cord` 第 7 字段），无全局 B |
| 波长 λ | Cu=1.54056 等 5 靶 | `constants.ts:15 LAMBDA_TABLE` | Cr/Fe 无 FF.dat 色散列 |
| Lp 因子 | `lorentz.ts:52` | 完全非偏振→偏振近似 | 假设见 `audits/intensity-uncertainty-review.md` §2.4 |
| 高斯峰形 q | **σ=0.10°** | `gaussian.ts:60`，窗=`GAUSSIAN_WINDOW_Q=8`（`constants.ts:44`） | 旧 q=0.25(FWHM) 读法已废 |
| 扫描范围 | 3°–100°，步长 0.01° | `constants.ts:30-32` | 非物理，仪器设定 |
| K 标度 | 1 | `constants.ts:27` | 归一化后 K 无影响 |

## 1. Wyckoff 消光与位置（`wyckoff.ts`）

- 数据：`Wyckoff`（各群坐标操作）+ `WholeSG`（254 群权威键列表，含 origin-choice 变体）。
- 生成：`web/scripts/gen_wyckoff.py`（已提交；重生成与 git HEAD 逐字节一致，
  2026-10-16 验证）；`scripts/verify_wyckoff.py` 为独立只读交叉校验器（见
  `DATA-REFERENCE.md` §5）。
- API：
  - `getSite(sgKey, letter):163` — 取 Wyckoff 位置
  - `expandPositions():178` — 展开坐标操作
  - `multiplicityOf():240` — 位置多重度
  - `laueOperations():260` — Laue 群操作矩阵
- 用途：系统消光判定 + 结构因子的坐标操作求和（`structure_factor.ts`）。

## 2. 热因子 B（Debye–Waller）

$$f = f_0\,e^{-B s^2}\qquad s=\tfrac{\sin\theta}{\lambda}$$

- **逐原子参数**（`.cord` 第 7 字段 / legacy 原子表 "B" 列），**无全局 B 开关**。
- 默认 `DEFAULT_ATOM_THERMAL_B = 1`（`constants.ts:53`，所有 shipped sample 均 B=1）。
- **口径定案**（`DATA-REFERENCE.md` §4 缺陷 4）：
  - 旧文档 B=0.9 是「缺失 f′ 被 B 吸收」的产物；**开启色散后最优 B ≈ 1.0–1.03**。
  - `DEFAULT=1` 取整数作 UI 默认（残差 0.195%），极限保真用 1.03（残差 0.059%）作测试基线。
- **勘误**：`.cord` 第 7 字段 = 热因子 B，**不是**占位率/多重度（早期文档误标，已更正）。

## 3. 波长表 λ

`constants.ts:15`：

| 靶 | λ (Å) | FF.dat 色散列 |
|---|---|---|
| Cu | 1.54056 | ✅ Kα1 |
| Mo | 0.70930 | ✅ Kα1 |
| Cr | 2.28970 | ❌（extended 用 Henke） |
| Co | 1.78897 | ✅ Kα1 |
| Fe | 1.93604 | ❌（extended 用 Henke） |

- `DEFAULT_LAMBDA = LAMBDA_TABLE.Cu`（Al.xrd 参考用 Cu Kα 测得）。

## 4. Lorentz–polarization 因子

`lorentz.ts:52 lorentzPolarization(twoThetaDeg)`：

$$Lp = \frac{1+\cos^2 2\theta}{2\sin^2\theta\,\cos\theta}$$

- 完全非偏振入射 → 偏振假设（`audits/intensity-uncertainty-review.md` §2.4 列为 🟡 不确定性项）。
- 低角 $\sin\theta\to0$ 有奇点，管线用 `MIN_THETA_DEG=1e-6` 兜底（`constants.ts:68`）。

## 5. 高斯峰形 q（σ）

- **q = σ = 0.10°**（`constants.ts:44 DEFAULT_Q`，GUI 标定 2026-10-16）。
- 峰形：`f(x)=\exp\bigl(-(x-u)^2/2q^2\bigr)`（**峰顶 = I_hkl 的归一化形式**，
  无 `1/(q√2π)` 密度因子）；FWHM = 2.355σ ≈ 0.2355°。
  help RTF 公式 (6) 的文字含 `1/(q√2π)`，但**程序实现不采用**——实证见
  `samples/Al.xrd`（原程序 2026-10-16 保存，与 ref-temp/Al.xrd 逐字节一致；ref-temp/ 已于 2026-10-19 删除）
  峰值 152557 = I_hkl 本身；若含该因子峰顶应为 ≈608614（3.9894 倍）。
  原程序曲线图同口径（GUI 实测 38.63° 处 152557）。
- 展宽窗口：`GAUSSIAN_WINDOW_Q = 8`（`gaussian.ts`），即 ±8σ 邻域内非零。
- **勘误**：早期 `q=0.25` 是把 q 当 FWHM 的误读，已废（`constants.ts` 注释明确）。
- 判据：Al.xrd 逐点吻合（峰顶 ±0.01° 处强度 = 峰顶·exp(−0.005)）。

## 6. 维护建议

- **几何/峰形参数都是纯常量**（无生成文件）：改 `constants.ts` 对应项即可，重跑 `npm test` 验证 Al/NaCl 基准。
- **Wyckoff 数据**：改 `Wyckoff`/`WholeSG` 源文件后重跑 `python web/scripts/gen_wyckoff.py`
  再生成 `wyckoff_data.ts`，并跑 `npm test`（消光逻辑敏感）+ `scripts/verify_wyckoff.py`
  交叉校验；生成物勿手改。
- **q 标定**：如改峰形模型，须同步 GUI 标定证据（`constants.ts:44` 注释里的 Al.xrd 逐点验证）。
