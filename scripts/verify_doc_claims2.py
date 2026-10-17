# -*- coding: utf-8 -*-
"""文档声明验证 · 复核脚本：对 verify_doc_claims.py 中存疑项做追查与补充验证。"""
import math
import re

ROOT = r"D:\Projects\CalcXRD"
ts = open(ROOT + r"\web\src\lib\xrd\factor_data.ts", encoding="utf-8").read()
body = ts[ts.index("FACTOR_COEFFS"):]
COEFFS = {}
for m in re.finditer(r"'([^']+)':\s*\{\s*a:\s*\[([^\]]+)\],\s*b:\s*\[([^\]]+)\],\s*c:\s*([-\d.eE+]+)\s*\}", body):
    COEFFS[m.group(1)] = ([float(x) for x in m.group(2).split(",")],
                          [float(x) for x in m.group(3).split(",")], float(m.group(4)))
fff = open(ROOT + r"\web\src\lib\xrd\ff_data.ts", encoding="utf-8").read()
FF_SYMBOLS = [s.strip().strip("'") for s in
              re.search(r"FF_SYMBOLS[^=]*=\s*\[([^\]]+)\]", fff, re.S).group(1).split(",")]
tbl = fff[fff.index("FF_TABLE"):]
FF_TABLE = [[float(x) for x in m.group(1).split(",")] for m in re.finditer(r"\[([-\d.,\seE+]+)\]", tbl)]


def f0(sym, s):
    a, b, c = COEFFS[sym]
    return sum(ai * math.exp(-bi * s * s) for ai, bi in zip(a, b)) + c


def lp(tt):
    th = math.radians(tt / 2)
    return (1 + math.cos(2 * th) ** 2) / (math.sin(th) ** 2 * math.cos(th))


def line(t):
    print("\n" + "=" * 100 + "\n" + t + "\n" + "=" * 100)


# ---------- R1: 离子 f₀ 偏差按 s 分区（细化 CHECK 2） ----------
line("R1  离子 f₀ vs gemmi it92：偏差按 s 区间细分（CHECK 2 细化）")
import json
itc = json.load(open(ROOT + r"\docs\itc-c-table6113.json", encoding="utf-8"))
sgrid = itc["s_grid"]
itc_map = {}
for sp in itc["species"]:
    key = (sp["gemmi_symbol"], abs(sp.get("charge", 0)), "-" if sp.get("charge", 0) < 0 else "+")
    itc_map[key] = sp
for smax in (0.2, 0.3, 0.6):
    worst = []
    for name in COEFFS:
        m = re.match(r"([A-Za-z]+)(\d*)([+-]?)", name)
        el, chg, sign = m.group(1), int(m.group(2) or 0), m.group(3)
        if chg == 0:
            continue
        sp = itc_map.get((el, chg, sign or "+")) or itc_map.get((el, chg, "-"))
        if not sp:
            continue
        cf = sp["coefficients"]
        wd = 0.0
        for s in sgrid:
            if s > smax:
                break
            fitc = (cf["a1"] * math.exp(-cf["b1"] * s * s) + cf["a2"] * math.exp(-cf["b2"] * s * s) +
                    cf["a3"] * math.exp(-cf["b3"] * s * s) + cf["a4"] * math.exp(-cf["b4"] * s * s) + cf["c"])
            wd = max(wd, abs(f0(name, s) - fitc) / max(fitc, 1e-6) * 100)
        worst.append((wd, name))
    worst.sort(reverse=True)
    n01 = sum(1 for w, _ in worst if w < 0.01)
    n1 = sum(1 for w, _ in worst if w < 0.1)
    print("  s≤%.1f：%d 项可比；<0.01%% 有 %d 项，<0.1%% 有 %d 项；最差 %s %.3f%%"
          % (smax, len(worst), n01, n1, worst[0][1], worst[0][0]))

# ---------- R2: Cr/Fe 声明的正确含义（辐射 λ 无列，非吸收体无值） ----------
line("R2  「Cr/Fe Kα 无 FF.dat 列」的真实含义（吸收体 vs 辐射源）")
print("  FF.dat 6 列 = 辐射源 Cu/Mo/Co 的 Kα1/Kα2（不是吸收体元素）：")
print("    Cr(Z=24) 作为吸收体：CuKa1 f′=%.3f f″=%.3f  → 有值（正常）" % (FF_TABLE[23][0], FF_TABLE[23][1]))
print("    Fe(Z=26) 作为吸收体：CuKa1 f′=%.3f f″=%.3f  → 有值（正常）" % (FF_TABLE[25][0], FF_TABLE[25][1]))
consts = open(ROOT + r"\web\src\lib\xrd\constants.ts", encoding="utf-8").read()
m = re.search(r"LAMBDA_TABLE[\s\S]*?\{([\s\S]*?)\}\s*as const", consts)
print("  web LAMBDA_TABLE：%s" % (m.group(1).strip().replace("\n", " ") if m else "未解析"))
print("  → 声明含义应为：以 Cr/Fe Kα 作【辐射】时 FF.dat 无对应列（fidelity 模式取不到值），")
print("    而非 Cr/Fe【元素】无色散值。原文档表述「Cr/Fe Kα 无 FF.dat 列」成立但易误读，建议改写。")

# ---------- R3: 全表 Kα1/Kα2 一致性扫描，找 Ce 之外可疑项 ----------
line("R3  全表 |Cu Kα1 f′ − Cu Kα2 f′| 扫描（找 Ce 之外的可疑录入）")
rows = []
for z in range(21, 93):
    d = abs(FF_TABLE[z - 1][0] - FF_TABLE[z - 1][2])
    rows.append((d, z, FF_SYMBOLS[z - 1], FF_TABLE[z - 1][0], FF_TABLE[z - 1][2]))
rows.sort(reverse=True)
print("  差值最大的 8 项：")
for d, z, s, a1, a2 in rows[:8]:
    note = "  ← 已登记缺陷 #1" if z == 58 else ""
    print("    Z=%2d %-3s Kα1=%8.3f Kα2=%8.3f 差=%6.3f%s" % (z, s, a1, a2, d, note))
print("  中位数：%.3f" % sorted(r[0] for r in rows)[len(rows) // 2])

# ---------- R4: Al.xrd 数据点数 9701 vs 表头 9700 ----------
line("R4  Al.xrd 点数与表头一致性")
raw = open(ROOT + r"\samples\Al.xrd", encoding="utf-8", errors="ignore").read().splitlines()
print("  文件总行数：%d" % len(raw))
print("  前 6 行：%s" % [l[:40] for l in raw[:6]])
print("  末 4 行：%s" % [l[:40] for l in raw[-4:]])
body_lines = raw[5:]
num2 = [l for l in body_lines if len(l.split()) == 2]
num1 = [l for l in body_lines if len(l.split()) == 1]
print("  表体行数 %d；双列行 %d；单列行 %d（单列行样例：%s）"
      % (len(body_lines), len(num2), len(num1), num1[:3]))
print("  首数据行 %r；末数据行 %r" % (num2[0].strip(), num2[-1].strip()))

# ---------- R5: 粉末曲线 B 扫描（两种 DW 口径）判据 ----------
line("R5  粉末强度：DW 两种口径 × B 扫描，对 Al.xrd 实测峰高比取最佳拟合")
A_AL, LAM = 4.0339, 1.54056
fams = [((1, 1, 1), 3, 8), ((2, 0, 0), 4, 6), ((2, 2, 0), 8, 12),
        ((3, 1, 1), 11, 24), ((2, 2, 2), 12, 8), ((0, 0, 4), 16, 6)]
fp, fpp = FF_TABLE[12][0], FF_TABLE[12][1]  # Al CuKa1
obs = [152557, 71693, 40648, 43172, 12165, 5681]
obs_n = [v / max(obs) * 1000 for v in obs]


def model(mode, B):
    out = []
    for (hkl, N, mult) in fams:
        d = A_AL / math.sqrt(N)
        s = 1 / (2 * d)
        tt = 2 * math.degrees(math.asin(LAM / (2 * d)))
        if mode == "f0only":
            f2 = (f0("Al", s) * math.exp(-B * s * s) + fp) ** 2 + fpp ** 2
        else:
            f2 = ((f0("Al", s) + fp) * math.exp(-B * s * s)) ** 2 + fpp ** 2
        out.append(mult * lp(tt) * 16 * f2)
    mx = max(out)
    return [v / mx * 1000 for v in out]


print("  实测峰高比：%s" % " ".join("%6.1f" % v for v in obs_n))
for mode in ("f0only", "both"):
    best = None
    for i in range(0, 61):
        B = i * 0.05
        v = model(mode, B)
        dev = max(abs(a - b) / b * 100 for a, b in zip(v, obs_n))
        if best is None or dev < best[0]:
            best = (dev, B, v)
    print("  %-8s 最佳 B=%.2f  偏差 %.2f%%  %s"
          % (mode, best[1], best[0], " ".join("%6.1f" % x for x in best[2])))
print("  逐点（B=1.00）：")
for mode in ("f0only", "both"):
    v = model(mode, 1.0)
    print("    %-8s " % mode + " ".join("%6.2f%%" % ((a - b) / b * 100) for a, b in zip(v, obs_n)))
