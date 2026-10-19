#!/usr/bin/env python3
"""扩展裁决：对 legacy Al B 扫描（002-005）四峰四档，逐模型对比。
引擎实测（verify-bscan-mcp.ts，2026-10-18 复跑）：
  B=0.8: legacy 63024/9907/8425/5377 -> web 63071/9981/8499/5455 (+0.75/+0.75/+0.88/+1.45%)
找出引擎实际计算的模型。
"""
import math

A = [4.730796, 2.313951, 1.54198, 1.117564, 3.154754]
B = [3.628931, 43.051167, 0.09596, 108.932388, 1.555918]
C = 0.139509
LAM = 1.54056
FP, FPP = 0.212, 0.246

# (hkl, d, 2theta) 与 ref-data 002-005 对照峰（200/311/222/400，111 为归一基）
PEAKS = [
    ("200", 2.0170, 44.900),
    ("311", 1.2163, 78.590),
    ("222", 1.1645, 82.830),
    ("400", 1.0085, 99.600),
]
BASE = ("111", 2.3290, 38.630)  # 归一基（不在对照表内，但参与 base）

# 引擎实测 web 输出（vite-node 复跑，2026-10-18）
ENGINE = {
    (0.0, "200"): 64593, (0.0, "311"): 12060, (0.0, "222"): 10511, (0.0, "400"): 7401,
    (0.4, "200"): 63827, (0.4, "311"): 10970, (0.4, "222"): 9450, (0.4, "400"): 6352,
    (0.6, "200"): 63448, (0.6, "311"): 10463, (0.6, "222"): 8962, (0.6, "400"): 5886,
    (0.8, "200"): 63071, (0.8, "311"): 9981, (0.8, "222"): 8499, (0.8, "400"): 5455,
}
LEGACY = {
    (0.0, "200"): 64593, (0.0, "311"): 12060, (0.0, "222"): 10511, (0.0, "400"): 7401,
    (0.4, "200"): 63804, (0.4, "311"): 10930, (0.4, "222"): 9411, (0.4, "400"): 6308,
    (0.6, "200"): 63413, (0.6, "311"): 10406, (0.6, "222"): 8904, (0.6, "400"): 5824,
    (0.8, "200"): 63024, (0.8, "311"): 9907, (0.8, "222"): 8425, (0.8, "400"): 5377,
}

def f0(s2):
    return sum(a * math.exp(-b * s2) for a, b in zip(A, B)) + C

def lp(two_theta):
    th = math.radians(two_theta / 2)
    return (1 + math.cos(2 * th) ** 2) / (math.sin(th) ** 2 * math.cos(th))

MODELS = {
    "M1 经验(DW乘f0+fp, fpp2在外)": lambda f0v, D: D*D*(f0v+FP)**2 + FPP*FPP,
    "M2 旧代码(DW只乘f0)":          lambda f0v, D: (D*f0v+FP)**2 + FPP*FPP,
    "M3 反汇编直读(D乘整个标量f_eff)": lambda f0v, D: (D*(f0v+FP+0.5*FPP*FPP/(f0v+FPP)))**2,
    "M4 现行web(分母D*f0)":          lambda f0v, D: (D*f0v + D*(FP + 0.5*FPP*FPP/(D*f0v+FPP)))**2,
}

print(f"{'B':>4} {'hkl':>4} {'legacy':>7} {'engine':>7} | " + " | ".join(f"{n.split(' ')[0]:>7}" for n in MODELS) + " |  engine最匹配")
for bth in (0.0, 0.4, 0.6, 0.8):
    # 各模型 base（111）
    s2b = 1.0 / (2 * BASE[1]) ** 2
    Db = math.exp(-bth * s2b)
    f0b = f0(s2b)
    for hkl, d, tt in PEAKS:
        s2 = 1.0 / (2 * d) ** 2
        D = math.exp(-bth * s2)
        f0v = f0(s2)
        row = {}
        for name, fn in MODELS.items():
            v = lp(tt) * fn(f0v, D)
            vb = lp(BASE[2]) * fn(f0b, Db)
            row[name] = v / vb * 100000
        eng = ENGINE[(bth, hkl)]
        leg = LEGACY[(bth, hkl)]
        best = min(MODELS, key=lambda n: abs(row[n] - eng))
        cells = " | ".join(f"{row[n]:>7.0f}" for n in MODELS)
        print(f"{bth:>4} {hkl:>4} {leg:>7d} {eng:>7d} | {cells} |  {best.split(' ')[0]} (差{abs(row[best]-eng):.1f})")
