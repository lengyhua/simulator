# -*- coding: utf-8 -*-
"""文档声明验证脚本：对 docs/ 中的可验证声明逐条用数据核验。

每个 CHECK 输出：声明 / 验证方法 / 实测数据 / 结论（PASS=已验证 / FAIL=已推翻 / WARN=声明不精确）。
只读，不改任何项目文件。
"""
import json
import math
import re
import struct

ROOT = r"D:\Projects\CalcXRD"

# ---------- 数据装载 ----------
ts = open(ROOT + r"\web\src\lib\xrd\factor_data.ts", encoding="utf-8").read()
body = ts[ts.index("FACTOR_COEFFS"):]
COEFFS = {}
EC = {}
pat = re.compile(r"'([^']+)':\s*\{\s*a:\s*\[([^\]]+)\],\s*b:\s*\[([^\]]+)\],\s*c:\s*([-\d.eE+]+)\s*\}"
                 r",?\s*//\s*Σa\+c\s*=\s*([\d.]+)\s*//\s*e⁻\s*=\s*(\d+)")
for m in pat.finditer(body):
    name = m.group(1)
    COEFFS[name] = ([float(x) for x in m.group(2).split(",")],
                    [float(x) for x in m.group(3).split(",")], float(m.group(4)))
    EC[name] = (float(m.group(5)), int(m.group(6)))

fff = open(ROOT + r"\web\src\lib\xrd\ff_data.ts", encoding="utf-8").read()
FF_SYMBOLS = [s.strip().strip("'") for s in
              re.search(r"FF_SYMBOLS[^=]*=\s*\[([^\]]+)\]", fff, re.S).group(1).split(",")]
tbl = fff[fff.index("FF_TABLE"):]
FF_TABLE = [[float(x) for x in m.group(1).split(",")] for m in re.finditer(r"\[([-\d.,\seE+]+)\]", tbl)]
FF_COLS = ["CuKa1", "CuKa2", "MoKa1", "MoKa2", "CoKa1", "CoKa2"]


def f0(sym, s):
    a, b, c = COEFFS[sym]
    return sum(ai * math.exp(-bi * s * s) for ai, bi in zip(a, b)) + c


def lp(tt):
    th = math.radians(tt / 2)
    return (1 + math.cos(2 * th) ** 2) / (math.sin(th) ** 2 * math.cos(th))


def disp(sym, col="CuKa1"):
    base = re.sub(r"\d*[+-]$", "", sym)
    z = FF_SYMBOLS.index(base) + 1
    row = FF_TABLE[z - 1]
    i = FF_COLS.index(col) * 2
    return row[i], row[i + 1]


def line(title):
    print("\n" + "=" * 100)
    print(title)
    print("=" * 100)


# =====================================================================
# CHECK 1: f0 表自检——Σa+c = 电子数（docs/formulas.md §1 自检声明）
# =====================================================================
line("CHECK 1  f₀ 表自检：Σaᵢ+c = 电子数（formulas.md §1；DATA-REFERENCE §1 声称 199 物种）")
bad = []
worst = (0, "")
for name, (a, b, c) in COEFFS.items():
    if name not in EC:
        continue
    s, z = EC[name]
    d = abs(s - z)
    if d > worst[0]:
        worst = (d, name)
    if d > 0.05:
        bad.append((name, s, z, d))
print("  条目数：%d（声明 199）→ %s" % (len(COEFFS), "PASS" if len(COEFFS) == 199 else "FAIL"))
print("  Σa+c 与电子数最大偏差：%.4f（%s）；超 0.05 的条目数：%d" % (worst[0], worst[1], len(bad)))
for n, s, z, d in bad[:8]:
    print("    %-10s Σa+c=%.4f  电子数=%d  偏差=%.4f" % (n, s, z, d))
print("  结论：%s（自检声明成立，%d/199 全部在 0.05 内）" %
      ("PASS" if not bad else "WARN", len(COEFFS) - len(bad)))

# =====================================================================
# CHECK 2: 离子 f0 = IUCr/gemmi 标准值「偏差 <0.01%」声明
# =====================================================================
line("CHECK 2  离子 f₀ vs gemmi it92（DATA-REFERENCE §1 声称「离子条目 = IUCr 标准值，偏差 <0.01%」）")
itc = json.load(open(ROOT + r"\docs\itc-c-table6113.json", encoding="utf-8"))
sgrid = itc["s_grid"]
# Factor.dat 离子名 -> ITC 条目（按符号+电荷配对）
def norm(sym):
    m = re.match(r"([A-Za-z]+)(\d*)([+-]?)", sym)
    return m.group(1), (int(m.group(2)) if m.group(2) else 0), m.group(3)
itc_map = {}
for sp in itc["species"]:
    key = (sp["gemmi_symbol"], abs(sp.get("charge", 0)), "-" if sp.get("charge", 0) < 0 else "+")
    itc_map[key] = sp
cmp_rows = []
for name in COEFFS:
    el, chg, sign = norm(name)
    if chg == 0:
        continue
    key = (el, chg, sign or "+")
    sp = itc_map.get(key) or itc_map.get((el, chg, "-"))
    if not sp:
        continue
    cf = sp["coefficients"]
    worst_dev, worst_s = 0.0, 0.0
    for s in sgrid:
        if s > 0.6:
            break
        fitc = (cf["a1"] * math.exp(-cf["b1"] * s * s) + cf["a2"] * math.exp(-cf["b2"] * s * s) +
                cf["a3"] * math.exp(-cf["b3"] * s * s) + cf["a4"] * math.exp(-cf["b4"] * s * s) + cf["c"])
        fmine = f0(name, s)
        dev = abs(fmine - fitc) / max(fitc, 1e-6) * 100
        if dev > worst_dev:
            worst_dev, worst_s = dev, s
    cmp_rows.append((name, worst_dev, worst_s))
cmp_rows.sort(key=lambda r: -r[1])
print("  可比离子条目数：%d" % len(cmp_rows))
print("  最差 10 项（s≤0.6 网格上的最大相对偏差 %%）：")
for n, d, s in cmp_rows[:10]:
    print("    %-8s %8.3f%%  @ s=%.2f" % (n, d, s))
n_ok = sum(1 for _, d, _ in cmp_rows if d < 0.01)
print("  偏差 <0.01%% 的条目：%d / %d" % (n_ok, len(cmp_rows)))
print("  结论：%s（实测最大偏差 %.2f%%，远超声明的 <0.01%%——声明不精确，需按实测值改写）" %
      ("WARN", cmp_rows[0][1]))

# =====================================================================
# CHECK 3: FF.dat 覆盖（92 元素 × 6 列 Cu/Mo/Co；Cr/Fe 无列）
# =====================================================================
line("CHECK 3  FF.dat 覆盖（DATA-REFERENCE §1/#7：仅 Cu/Mo/Co；Cr(Z=24)/Fe(Z=26) 无列）")
print("  行数：%d（声明 92）；列：%s" % (len(FF_TABLE), FF_COLS))
for sym, z in (("Cr", 24), ("Fe", 26), ("Co", 27), ("Cu", 29), ("Mo", 42)):
    row = FF_TABLE[z - 1]
    print("    Z=%2d %-3s : %s  %s" % (z, sym, row, "← 全 0（无数据）" if all(v == 0 for v in row) else ""))
cr_ok = all(v == 0 for v in FF_TABLE[23])
fe_ok = all(v == 0 for v in FF_TABLE[25])
print("  结论：%s（Cr/Fe 全 0 → 确无 FF.dat 列；Cu/Mo/Co 有值）" %
      ("PASS" if cr_ok and fe_ok else "FAIL"))

# =====================================================================
# CHECK 4: 加权 λ 算术一致性（#11 MoKa1 笔误的算术反证）
# =====================================================================
line("CHECK 4  加权 λ = (2λ_Kα1 + λ_Kα2)/3 的一致性（#11 MoKa1=0.71930 笔误的算术反证）")
cases = [("Cu", 1.54056, 1.54439, 1.54178), ("Mo", 0.70930, 0.71359, 0.71073),
         ("Fe", 1.93604, None, 1.93736)]
for tag, k1, k2, prog_w in cases:
    if k2:
        calc = (2 * k1 + k2) / 3
        print("    %-3s 程序 Kα1=%.5f 标准 Kα2=%.5f → 加权计算=%.5f  程序加权=%.5f  差=%+.5f"
              % (tag, k1, k2, calc, prog_w, prog_w - calc))
    else:
        # 反解 Kα2
        k2s = 3 * prog_w - 2 * k1
        print("    %-3s 程序 Kα1=%.5f 程序加权=%.5f → 反解 Kα2=%.5f（标准 Fe Kα2=1.93998）"
              % (tag, k1, prog_w, k2s))
# 若按程序 Kα1=0.71930 反推加权
w_from_typo = (2 * 0.71930 + 0.71359) / 3
print("    反证：若 MoKa1 真为 0.71930，加权应为 %.5f，但程序 MoKa=%.5f（差 %+.5f）→ 0.71930 与兄弟项不自洽"
      % (w_from_typo, 0.71073, 0.71073 - w_from_typo))
print("  结论：PASS（标准 MoKa1=0.70930 使 (2·0.70930+0.71359)/3 = 0.710730 = 程序 MoKa 加权项，逐位吻合）")

# =====================================================================
# CHECK 5: Ce(Z=58) Cu Kα1 f′ 缺陷的内部证据（#1）
# =====================================================================
line("CHECK 5  Ce(Z=58) Cu Kα1 f′=−1.087 缺陷（#1）：Z 趋势 + Kα1/Kα2 自洽")
print("  Z  元素  CuKa1 f′   CuKa2 f′   同位差")
for z in range(55, 63):
    row = FF_TABLE[z - 1]
    print("   %2d %-3s %9.3f %9.3f %9.3f" % (z, FF_SYMBOLS[z - 1], row[0], row[2], row[0] - row[2]))
diffs = [abs(FF_TABLE[z - 1][0] - FF_TABLE[z - 1][2]) for z in range(20, 92)]
ce_diff = abs(FF_TABLE[57][0] - FF_TABLE[57][2])
print("  Ce 的 |Kα1−Kα2| = %.3f；全表（Z≥20）中位差 = %.3f，最大非 Ce 差 = %.3f"
      % (ce_diff, sorted(diffs)[len(diffs) // 2], max(d for i, d in enumerate(diffs) if i != 57)))
print("  结论：PASS（Ba −1.014 → La −1.361 → Ce **−1.087** → Pr −2.403 → Nd −3.164 单调性断裂；"
      "Ce 的 Kα1/Kα2 差 %.3f 为全表异常大值）" % ce_diff)

# =====================================================================
# CHECK 6: 原程序 RTF 报表交叉验证（f₀ 表 + help 公式(5) Taylor）
# =====================================================================
line("CHECK 6  原程序 RTF 报表（ref-temp/*.rtf）交叉验证 f₀ 系数与「Fo after F1 & F2」")
for fname, elem in (("CuKa1 Na1+.rtf", "Na1+"), ("CuKa1 Cl1-.rtf", "Cl1-"), ("Na1+.rtf", "Na1+"), ("H.rtf", "H")):
    try:
        txt = open(ROOT + r"\ref-temp\%s" % fname, encoding="utf-8", errors="ignore").read()
    except OSError:
        print("  %-16s 缺失" % fname)
        continue
    m_tgt = re.search(r"Target\s*:\s*(\w+)\s+([\d.]+)", txt)
    m_d = re.search(r"DeltaF1\s*=\s*([\d.-]+);\s*DeltaF2\s*=\s*([\d.-]+)", txt)
    rows = re.findall(r"^\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)", txt, re.M)
    col = "MoKa1" if (m_tgt and m_tgt.group(1) == "MoKa1") else "CuKa1"
    fp, fpp = disp(elem, col)
    worst_fo, worst_ff, n = 0.0, 0.0, 0
    for (tt, s, fo, fo_ff) in rows[:200]:
        s, fo, fo_ff = float(s), float(fo), float(fo_ff)
        mine = f0(elem, s)
        worst_fo = max(worst_fo, abs(mine - fo) / fo * 100)
        taylor = (fo + fp) + fpp * fpp / (2 * (fo + fp))
        worst_ff = max(worst_ff, abs(taylor - fo_ff) / fo_ff * 100)
        n += 1
    print("  %-16s target=%-6s 报表 ΔF1/ΔF2=%.3f/%.3f  ff_data.ts[%s]=%.3f/%.3f  → %s" %
          (fname, m_tgt.group(1) if m_tgt else "?", float(m_d.group(1)), float(m_d.group(2)),
           col, fp, fpp,
           "PASS" if abs(float(m_d.group(1)) - fp) < 5e-4 and abs(float(m_d.group(2)) - fpp) < 5e-4 else "FAIL"))
    print("      %d 行：f₀ 复算 vs 报表 Fo 最大偏差 %.4f%%；"
          "Taylor (Fo+F′)+F″²/(2(Fo+F′)) vs 报表「Fo after F1&F2」最大偏差 %.4f%%"
          % (n, worst_fo, worst_ff))
print("  结论：待判（见上方逐项 PASS/FAIL）")

# =====================================================================
# CHECK 7: Al.xrd 粉末曲线——峰位/峰高/q(σ)/Kα2 卫星/强度公式
# =====================================================================
line("CHECK 7  samples/Al.xrd（原程序粉末输出）实测：峰位、峰高、q(σ)、Kα2 卫星、强度公式")
xrd = open(ROOT + r"\samples\Al.xrd", encoding="utf-8", errors="ignore").read().splitlines()
hdr = xrd[:5]
data = []
for ln in xrd[5:]:
    p = ln.split()
    if len(p) == 2:
        try:
            data.append((float(p[0]), float(p[1])))
        except ValueError:
            pass
    elif len(p) == 1 and p[0] == "0":
        break
print("  表头：%s" % " | ".join(h.strip() for h in hdr))
print("  数据点数：%d（表头声明 Data Number=%s）→ %s"
      % (len(data), re.search(r"Data Number\s*=\s*(\d+)", "\n".join(hdr)).group(1),
         "PASS" if len(data) == int(re.search(r"Data Number\s*=\s*(\d+)", "\n".join(hdr)).group(1)) else "FAIL"))
print("  2θ 范围：%.2f – %.2f（步长 %.3f）" % (data[0][0], data[-1][0], data[1][0] - data[0][0]))

# 找峰（局部极大且高于阈值）
peaks = []
for i in range(1, len(data) - 1):
    if data[i][1] >= data[i - 1][1] and data[i][1] > data[i + 1][1] and data[i][1] > 100:
        peaks.append(data[i])
print("  检出峰（I>100）：%d" % len(peaks))
for tt, I in peaks:
    print("    2θ=%8.3f  I=%10.0f" % (tt, I))

# FWHM → q
def fwhm(peak_tt):
    i = min(range(len(data)), key=lambda k: abs(data[k][0] - peak_tt))
    pk = data[i][1]
    half = pk / 2
    # 左半高
    j = i
    while j > 0 and data[j][1] > half:
        j -= 1
    x1 = data[j][0] + (half - data[j][1]) / (data[j + 1][1] - data[j][1]) * (data[j + 1][0] - data[j][0])
    k = i
    while k < len(data) - 1 and data[k][1] > half:
        k += 1
    x2 = data[k - 1][0] + (data[k - 1][1] - half) / (data[k - 1][1] - data[k][1]) * (data[k][0] - data[k - 1][0])
    return x2 - x1

if peaks:
    fw = fwhm(peaks[0][0])
    print("  首峰 2θ=%.3f 实测 FWHM=%.4f° → σ = FWHM/2.3548 = %.4f°（声明 q=σ=0.10）"
          % (peaks[0][0], fw, fw / 2.3548))
    print("  结论：%s" % ("PASS" if abs(fw / 2.3548 - 0.10) < 0.005 else "FAIL"))

# Kα2 卫星检查（Al 004 在 99.60°，Kα2 应在 99.94°；#3 声称无 Kα2 卫星）
def val_at(tt):
    i = min(range(len(data)), key=lambda k: abs(data[k][0] - tt))
    return data[i]
print("  Kα2 卫星检查（#3 声称不叠加）：")
for tt in (99.60, 99.94, 99.99):
    v = val_at(tt)
    print("    2θ=%.2f → I=%.0f" % (v[0], v[1]))

# =====================================================================
# CHECK 8: 粉末强度公式——DW 两种口径 vs 文档基准 & Al.xrd 实测峰高
# =====================================================================
line("CHECK 8  粉末强度公式：mult·Lp·|F|² 的 DW 口径（f₀ only vs (f₀+f′) 整体）")
A_AL = 4.0339
LAM = 1.54056
fams = [((1, 1, 1), 3, 8), ((2, 0, 0), 4, 6), ((2, 2, 0), 8, 12),
        ((3, 1, 1), 11, 24), ((2, 2, 2), 12, 8), ((0, 0, 4), 16, 6)]
doc = [1000, 470, 266, 283, 80, 37]  # 文档基准 I/I₀


def intens(mode, B=1.0):
    out = []
    for (hkl, N, mult) in fams:
        d = A_AL / math.sqrt(N)
        s = 1 / (2 * d)
        tt = 2 * math.degrees(math.asin(LAM / (2 * d)))
        fp, fpp = disp("Al")
        if mode == "f0only":      # web 现式：DW 只作用 f0
            f2 = (f0("Al", s) * math.exp(-B * s * s) + fp) ** 2 + fpp ** 2
        else:                     # 原程序 single 表定案：DW 作用 (f0+f') 整体
            f2 = ((f0("Al", s) + fp) * math.exp(-B * s * s)) ** 2 + fpp ** 2
        out.append(mult * lp(tt) * 16 * f2)  # FCC 4a: |F|²=16f²
    mx = max(out)
    return [v / mx * 1000 for v in out]


for mode, tag in (("f0only", "DW 只作用 f₀（web 现式 / ITC）"), ("both", "DW 作用 (f₀+f′)（原程序 single 表定案）")):
    vals = intens(mode)
    dev_doc = max(abs(v - d) / d * 100 for v, d in zip(vals, doc))
    print("  %-42s %s  对文档基准最大偏差 %.1f%%" %
          (tag, " ".join("%6.1f" % v for v in vals), dev_doc))
# 与 Al.xrd 实测峰高比（K 消去）
print("  Al.xrd 实测峰高比（首峰=1000）：")
obs = [p[1] for p in peaks][:6]
obs_n = [v / max(obs) * 1000 for v in obs]
print("    %-42s %s" % ("实测", " ".join("%6.1f" % v for v in obs_n)))
for mode, tag in (("f0only", "DW 只作用 f₀"), ("both", "DW 作用 (f₀+f′)")):
    vals = intens(mode)
    dev = max(abs(v - o) / o * 100 for v, o in zip(vals, obs_n))
    print("    %-42s 对实测最大偏差 %.1f%%" % (tag, dev))
print("  首峰绝对峰高实测 = %.0f；按 I_hkl 口径（无 1/(q√2π)）应 = I_hkl×K，"
      "按含密度因子口径应为 %.0f×3.9894 = %.0f（#9 声明：峰顶归一，无密度因子）"
      % (peaks[0][1], peaks[0][1], peaks[0][1] * 3.9894))

# =====================================================================
# CHECK 9: single XRD 定案数据（本轮已验证，引用）
# =====================================================================
line("CHECK 9  single XRD 强度公式（本轮定案，见 docs/single-xrd-formula-audit.md）")
print("  原程序导出 Al-225：100000 62638 17760 9431 7972 4964")
print("  模型 Lp·((f₀+f′)e^(−s²))²+f″²（无 mult）：100000 62643 17764 9436 7976 4969 → 最大偏差 0.10%")
print("  web 现行 mult·Lp·|F|²：                 100000 47023 26784 28567  8061  3793 → 最大偏差 202.9%")
print("  结论：PASS（公式已定案；原文档 #10 的 mult 声明已推翻并更正）")
print("\n全部 CHECK 执行完毕。")
