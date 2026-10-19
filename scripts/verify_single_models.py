#!/usr/bin/env python3
"""裁决 single XRD 表 Al B=1 的 f_eff/DW 模型分歧。

候选模型（均归一到 111 = 100000，Lp 开，B=1，CuKa1，全复选框开）：
  M1 经验赢家（audit §2.3, 0.10%）: |F|^2 = 16*[ D^2*(f0+fp)^2 + fpp^2 ]
  M2 2026-10-17 代码式            : |F|^2 = 16*[ (D*f0+fp)^2 + fpp^2 ]
  M3 反汇编直读（D x 标量 f_eff） : |F|^2 = 16*[ D*(f0+fp+0.5*fpp^2/(f0+fpp)) ]^2
  M4 现行 web 混合式              : |F|^2 = 16*[ D*f0 + D*fp + D*0.5*fpp^2/(D*f0+fpp) ]^2
  M5 经验反解式（f_eff=模长）     : |F|^2 = 16*[ ((f0+fp)*D)^2 + fpp^2 ]   （同 M1）
基准：ref-temp Al-225 原程序导出（DATA-REFERENCE C9 / audit §2.1）
"""
import math

# Al 高斯系数（factor_data.ts，Factor.dat 解码值）
A = [4.730796, 2.313951, 1.54198, 1.117564, 3.154754]
B = [3.628931, 43.051167, 0.09596, 108.932388, 1.555918]
C = 0.139509
LAM = 1.54056  # CuKa1
FP, FPP = 0.212, 0.246  # Al CuKa1 F'/F''
BTH = 1.0  # .cord B=1

# legacy 导出表（hkl 标签用审计文档的 004 记法）：(2theta, d, I_legacy)
PEAKS = [
    ("111", 38.630, 2.3290, 100000),
    ("200", 44.900, 2.0170, 62638),
    ("220", 65.380, 1.4262, 17760),
    ("311", 78.590, 1.2163, 9431),
    ("222", 82.830, 1.1645, 7972),
    ("004", 99.600, 1.0085, 4964),
]

def f0(s2):
    return sum(a * math.exp(-b * s2) for a, b in zip(A, B)) + C

def lp(two_theta):
    th = math.radians(two_theta / 2)
    return (1 + math.cos(2 * th) ** 2) / (math.sin(th) ** 2 * math.cos(th))

def run(name, f2fun):
    print(f"\n=== {name} ===")
    print(f"{'hkl':>4} {'2theta':>8} {'f0':>10} {'D':>8} {'I_pred':>9} {'I_legacy':>9} {'dev%':>8}")
    vals = []
    for hkl, tt, d, ileg in PEAKS:
        s = 1.0 / (2 * d)          # s = sin(theta)/lambda = 1/(2d)
        s2 = s * s
        D = math.exp(-BTH * s2)
        vals.append((hkl, tt, f0(s2), D, lp(tt) * f2fun(f0(s2), D)))
    base = vals[0][4]  # 111 归一
    worst = 0.0
    for (hkl, tt, f0v, D, v), (_, _, _, ileg) in zip(vals, PEAKS):
        pred = v / base * 100000
        dev = (pred - ileg) / ileg * 100
        worst = max(worst, abs(dev))
        print(f"{hkl:>4} {tt:>8.3f} {f0v:>10.5f} {D:>8.5f} {pred:>9.1f} {ileg:>9d} {dev:>+8.3f}")
    print(f"  -> 最大偏差 {worst:.3f}%")

# M1/M5: 经验赢家 —— DW 乘 (f0+fp) 整体，fpp^2 在外不衰减
run("M1 经验赢家 16*[D^2*(f0+fp)^2 + fpp^2]", lambda f0v, D: D*D*(f0v+FP)**2 + FPP*FPP)

# M2: 2026-10-17 代码式 —— DW 只乘 f0，fpp^2 在外
run("M2 旧代码 16*[(D*f0+fp)^2 + fpp^2]", lambda f0v, D: (D*f0v+FP)**2 + FPP*FPP)

# M3: 反汇编直读 —— D 乘整个标量 f_eff（分母 f0+fpp）
run("M3 反汇编直读 16*[D*(f0+fp+0.5*fpp^2/(f0+fpp))]^2",
    lambda f0v, D: (D*(f0v+FP+0.5*FPP*FPP/(f0v+FPP)))**2)

# M4: 现行 web 混合式 —— 分母用 D*f0
run("M4 现行 web 16*[D*f0 + D*fp + D*0.5*fpp^2/(D*f0+fpp)]^2",
    lambda f0v, D: (D*f0v + D*(FP + 0.5*FPP*FPP/(D*f0v+FPP)))**2)

# M5: 经验反解式（audit §4 反解 B=1.0025~1.0031 用的形式）——同 M1 结构
# （已在 M1 覆盖）

# 附：M1 在 B=0.5 / B=0 下对 005(B=0) 的对照（验证 B=0 时全模型退化为同一值）
print("\n=== B=0  sanity check（全模型应一致）===")
for hkl, tt, d, ileg in PEAKS:
    s2 = 1.0 / (2 * d) ** 2
    D0 = 1.0
    m1 = D0*D0*(f0(s2)+FP)**2 + FPP*FPP
    m2 = (D0*f0(s2)+FP)**2 + FPP*FPP
    m3 = (D0*(f0(s2)+FP+0.5*FPP*FPP/(f0(s2)+FPP)))**2
    print(f"{hkl:>4} M1={m1:.6f} M2={m2:.6f} M3={m3:.6f} max_spread={(max(m1,m2,m3)-min(m1,m2,m3))/m1*100:.4f}%")
