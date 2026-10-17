#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
FF.dat / ff_data.ts 录入缺陷扫描（可复跑）
=========================================
用途：对 92 元素 × 6 辐射列（Cu/Mo/Co 的 Kα1/Kα2）做「兄弟列自洽性」扫描。

原理（内部证据，无需外部数据）：
  Kα1 与 Kα2 仅相差约 20 eV（Cu: 1.54056 vs 1.54439 Å），同一元素的 f′、f″
  在这两列上应当几乎相等。若某元素在某一列的 |Kα1 − Kα2| 远大于全表中位差，
  则该槽位极可能是录入缺陷（digit 打错 / 串行）。

用法：
  python scripts/verify_ff_anomalies.py            # 全表扫描
  python scripts/verify_ff_anomalies.py --top 12   # 打印每个 (列, 分量) 的前 N 名

输出：每列每分量（f′ / f″）的 |Kα1−Kα2| 排名 + 中位差 + 倍数，
      并对已知外部权威值（IUCr CIF dispersion_imag_cu）做比对。
"""
import re
import sys
import statistics

ROOT = __file__.replace("\\", "/").rsplit("/", 2)[0] + "/"

fff = open(ROOT + "web/src/lib/xrd/ff_data.ts", encoding="utf-8").read()
FF_SYMBOLS = [s.strip().strip("'") for s in
              re.search(r"FF_SYMBOLS[^=]*=\s*\[([^\]]+)\]", fff, re.S).group(1).split(",")]
tbl = fff[fff.index("FF_TABLE"):]
FF_TABLE = [[float(x) for x in m.group(1).split(",")]
            for m in re.finditer(r"\[([-\d.,\seE+]+)\]", tbl)]
FF_COLS = ["CuKa1", "CuKa2", "MoKa1", "MoKa2", "CoKa1", "CoKa2"]

# 外部权威值（IUCr CIF 字典 dispersion_imag_cu，即 Cu Kα 的 f″）
# 来源：https://www.iucr.org/__data/assets/pdf_file/0013/79397/cifdic_registered.pdf
#       / IUCr 在线 CIF 字典 dispersion_imag_cu 条目（2026-10-17 检索）
IUCR_FDPP_CU = {   # Z: (symbol, f''(Cu Kα))  —— 仅登记本脚本实际比对过的元素
    58: ("Ce", 9.648),
    66: ("Dy", 9.748),
    67: ("Ho", 3.704),
    68: ("Er", 3.937),
    69: ("Tm", 4.181),
    71: ("Lu", 4.693),
}

TOP = 10
if "--top" in sys.argv:
    TOP = int(sys.argv[sys.argv.index("--top") + 1])

print("=" * 100)
print("FF.dat 兄弟列自洽性扫描：|Kα1 − Kα2|（f′ 与 f″ 分别统计）")
print("=" * 100)

findings = []
for comp, off in (("f'", 0), ("f''", 1)):
    for rad in ("Cu", "Mo", "Co"):
        i1 = FF_COLS.index(rad + "Ka1") * 2 + off
        i2 = FF_COLS.index(rad + "Ka2") * 2 + off
        diffs = []
        for z in range(1, 93):
            v1, v2 = FF_TABLE[z - 1][i1], FF_TABLE[z - 1][i2]
            diffs.append((abs(v1 - v2), z, v1, v2))
        med = statistics.median(d for d, *_ in diffs)
        diffs.sort(reverse=True)
        print("\n-- %s / %s ：中位差 %.3f，最大 %d 名 --" % (rad, comp, med, TOP))
        for d, z, v1, v2 in diffs[:TOP]:
            ratio = d / med if med else float("nan")
            flag = "  <== 异常" if d > max(0.05, 20 * med) else ""
            print("   Z=%2d %-3s  Kα1=%9.3f  Kα2=%9.3f  差=%7.3f  (%.0fx 中位)%s"
                  % (z, FF_SYMBOLS[z - 1], v1, v2, d, ratio, flag))
            if flag:
                findings.append((rad, comp, z, FF_SYMBOLS[z - 1], v1, v2, d, ratio))

print("\n" + "=" * 100)
print("外部权威值比对（IUCr CIF dispersion_imag_cu，Cu Kα 的 f″）")
print("=" * 100)
print("  %-4s %-3s %10s %10s | %10s  %s" % ("Z", "el", "FF Kα1", "FF Kα2", "IUCr", "判定"))
for z, (sym, ref) in sorted(IUCR_FDPP_CU.items()):
    i1 = FF_COLS.index("CuKa1") * 2 + 1
    i2 = FF_COLS.index("CuKa2") * 2 + 1
    v1, v2 = FF_TABLE[z - 1][i1], FF_TABLE[z - 1][i2]
    d1, d2 = abs(v1 - ref), abs(v2 - ref)
    verdict = []
    if d1 > 0.5:
        verdict.append("Kα1 偏离 IUCr %.3f" % d1)
    if d2 > 0.5:
        verdict.append("Kα2 偏离 IUCr %.3f" % d2)
    print("  %-4d %-3s %10.3f %10.3f | %10.3f  %s"
          % (z, sym, v1, v2, ref, "；".join(verdict) or "两列均与 IUCr 吻合"))

print("\n" + "=" * 100)
print("异常汇总（|Kα1−Kα2| > max(0.05, 20×中位)，共 %d 项）" % len(findings))
print("=" * 100)
for rad, comp, z, sym, v1, v2, d, ratio in sorted(findings, key=lambda x: -x[6]):
    print("  %s %-3s Z=%2d  %s: Kα1=%.3f vs Kα2=%.3f  差=%.3f (%.0fx 中位)"
          % (rad, sym, z, comp, v1, v2, d, ratio))
