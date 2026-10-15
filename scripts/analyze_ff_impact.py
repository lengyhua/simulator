#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
量化 F'F''（反常散射）修正对 XRD 谱强度的影响 —— FF.dat 研究的配套分析脚本（只读）。

用途：
  1. 从 web/src/lib/xrd/cronie_data.ts 读取 IUCr Cromer–Mann f0 系数；
  2. 从 FF.dat（经 extract_ff_dat 解析）读取指定元素的 f′/f″；
  3. 对 Al（单质 FCC）与 NaCl（双物种 FCC）计算开启/关闭色散修正后的
     归一化强度，并与 samples/Al.xrd 的参考值对比；
  4. 对比 help 公式 (5) 与物理式 |f| = sqrt((f0+f′)^2 + f″^2) 的数值差异。

只读脚本：不修改任何源文件。
用法：
  python scripts/analyze_ff_impact.py
  python scripts/analyze_ff_impact.py --lambda 0.70930 --B 0.9
"""

from __future__ import annotations

import argparse
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_ff_dat import (  # noqa: E402
    COLUMNS,
    find_record,
    nearest_radiation,
    parse_ff_dat,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRONIE_TS = os.path.join(ROOT, "web", "src", "lib", "xrd", "cronie_data.ts")
FF_DAT = os.path.join(ROOT, "FF.dat")
AL_XRD = os.path.join(ROOT, "samples", "Al.xrd")

LAMBDA_CU = 1.54056
K = 1.0
DEFAULT_B = 0.9

# Al 六强峰（FCC 允许反射：h,k,l 全奇或全偶）
AL_PEAKS = [(1, 1, 1), (2, 0, 0), (2, 2, 0), (3, 1, 1), (2, 2, 2), (4, 0, 0)]
AL_MULT = {  # 立方晶系 Laue m-3m 的多重性
    (1, 1, 1): 8,
    (2, 0, 0): 6,
    (2, 2, 0): 12,
    (3, 1, 1): 24,
    (2, 2, 2): 8,
    (4, 0, 0): 6,
}


# ---------------------------------------------------------------- 数据加载


def load_cronie(path: str) -> dict[str, dict]:
    """解析 cronie_data.ts 里的 `Sym: { a: [...], b: [...], c: x }` 行。"""
    text = open(path, encoding="utf-8").read()
    pat = re.compile(
        r"^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*\{\s*a\s*:\s*\[([^\]]*)\]\s*,"
        r"\s*b\s*:\s*\[([^\]]*)\]\s*,\s*c\s*:\s*([-\d.eE+]+)\s*\}",
        re.MULTILINE,
    )
    table: dict[str, dict] = {}
    for m in pat.finditer(text):
        sym = m.group(1)
        a = [float(v) for v in m.group(2).split(",")]
        b = [float(v) for v in m.group(3).split(",")]
        c = float(m.group(4))
        table[sym] = {"a": a, "b": b, "c": c}
    if not table:
        raise SystemExit("未从 %s 解析到任何系数" % path)
    return table


def f0(coeff: dict, s: float) -> float:
    """Cromer–Mann：f0(s) = Σ aᵢ·exp(−bᵢ·s²) + c。"""
    s2 = s * s
    return sum(ai * math.exp(-bi * s2) for ai, bi in zip(coeff["a"], coeff["b"])) + coeff["c"]


def load_al_reference(path: str) -> list[tuple[float, float]]:
    """读 samples/Al.xrd：跳过 5 行头，返回 (2θ, I) 列表。"""
    rows: list[tuple[float, float]] = []
    with open(path, encoding="latin-1") as fh:
        lines = fh.read().splitlines()
    for line in lines[5:]:
        parts = line.split()
        if len(parts) < 2:
            continue
        try:
            tt = float(parts[0])
            ii = float(parts[1])
        except ValueError:
            continue
        if tt <= 0 and ii == 0:
            break
        rows.append((tt, ii))
    return rows


def peak_at(rows: list[tuple[float, float]], center: float, win: float = 0.6):
    """在 ±win 度内取参考谱最大强度（近似峰高）。"""
    best = None
    for tt, ii in rows:
        if abs(tt - center) <= win:
            if best is None or ii > best[1]:
                best = (tt, ii)
    return best


# ---------------------------------------------------------------- 物理模型


def lorentz_polarization(two_theta_deg: float) -> float:
    """标准粉末 Lp = (1 + cos²2θ) / (sin²θ·cosθ)。"""
    th = math.radians(two_theta_deg / 2.0)
    st, ct = math.sin(th), math.cos(th)
    return (1.0 + math.cos(2.0 * th) ** 2) / (st * st * ct)


def dw(s: float, B: float) -> float:
    return math.exp(-B * s * s)


def two_theta_from_d(d: float, lam: float) -> float:
    x = lam / (2.0 * d)
    if x >= 1.0:
        return float("nan")
    return math.degrees(2.0 * math.asin(x))


def cubic_d(a: float, hkl) -> float:
    h, k, l = hkl
    return a / math.sqrt(h * h + k * k + l * l)


def fcc_centering_sum(hkl) -> float:
    """F 心平移 (0,0,0)(0,½,½)(½,0,½)(½,½,0) 的相因子和。全奇/全偶=4，混合=0。"""
    h, k, l = hkl
    s = 0.0
    for t in ((0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0)):
        phase = 2.0 * math.pi * (h * t[0] + k * t[1] + l * t[2])
        s += math.cos(phase)  # sin 部分对 centrosym 组合为 0
    return s


# ---------------------------------------------------------------- 计算


def al_peaks(cronie, ff_records, lam, B, use_disp, disp_mode="modulus",
             dw_on_total=False):
    """Al：F = 4·f_Al，返回 [(hkl, 2θ, I_raw)]。"""
    coeff = cronie["Al"]
    rec = find_record(ff_records, "Al")
    ent = nearest_radiation(rec, lam)
    fp, fpp = (ent["fPrime"], ent["fDoublePrime"]) if use_disp else (0.0, 0.0)

    out = []
    for hkl in AL_PEAKS:
        d = cubic_d(4.0339, hkl)
        tt = two_theta_from_d(d, lam)
        s = 1.0 / (2.0 * d)
        f_zero = f0(coeff, s)
        dws = dw(s, B)
        if dw_on_total:
            base = (f_zero + fp) * dws
            fpp_eff = fpp * dws
        else:
            base = f_zero * dws + fp
            fpp_eff = fpp
        if disp_mode == "modulus":
            fmag2 = base * base + fpp_eff * fpp_eff
        elif disp_mode == "help5":
            # help 公式 (5)：f = f0 + F' + 0.5·F''²/(f0+F')（标量）
            fmag2 = (base + 0.5 * fpp_eff * fpp_eff / base) ** 2
        elif disp_mode == "real_only":
            fmag2 = base * base
        else:
            raise ValueError(disp_mode)
        S = fcc_centering_sum(hkl)
        if abs(S) < 1e-9:
            continue
        F2 = (S * S) * fmag2
        I = K * lorentz_polarization(tt) * F2 * AL_MULT[hkl]
        out.append((hkl, tt, I, s, f_zero))
    return out


def nacl_peaks(cronie, ff_records, lam, B, use_disp, mode="complex"):
    """NaCl：F = S·(f_Na + f_Cl·e^{iπ(h+k+l)})，S 为 F 心和。

    mode='complex'  → 复数 f = f₀+f′+i f″，|F|² = Re²+Im²（物理正确）
    mode='scalar'   → 各原子先取标量 |f|（help 公式 5 的写法），再做结构求和
    """
    c_na, c_cl = cronie["Na"], cronie["Cl"]
    fp_na, fpp_na = _disp(ff_records, "Na", lam, use_disp)
    fp_cl, fpp_cl = _disp(ff_records, "Cl", lam, use_disp)
    out = []
    for hkl in [(1, 1, 1), (2, 0, 0), (2, 2, 0), (3, 1, 1), (2, 2, 2), (4, 0, 0)]:
        d = cubic_d(5.620, hkl)
        tt = two_theta_from_d(d, lam)
        s = 1.0 / (2.0 * d)
        dws = dw(s, B)
        sign = 1.0 if (sum(hkl) % 2 == 0) else -1.0
        if mode == "complex":
            re = (f0(c_na, s) * dws + fp_na) + sign * (f0(c_cl, s) * dws + fp_cl)
            im = fpp_na + sign * fpp_cl
            F2_unit = re * re + im * im
        else:
            a = f0(c_na, s) * dws + fp_na
            b = f0(c_cl, s) * dws + fp_cl
            m = lambda x, y: x + 0.5 * y * y / x  # help (5)
            F2_unit = (m(a, fpp_na) + sign * m(b, fpp_cl)) ** 2
        S = fcc_centering_sum(hkl)
        if abs(S) < 1e-9:
            continue
        F2 = (S * S) * F2_unit
        I = K * lorentz_polarization(tt) * F2 * AL_MULT.get(hkl, 8)
        out.append((hkl, tt, I))
    return out


def _disp(ff_records, symbol, lam, use_disp):
    if not use_disp:
        return 0.0, 0.0
    ent = nearest_radiation(find_record(ff_records, symbol), lam)
    return ent["fPrime"], ent["fDoublePrime"]


def normalize(peaks):
    mx = max(p[2] for p in peaks)
    return [(p[0], p[1], 100.0 * p[2] / mx) for p in peaks]


# ---------------------------------------------------------------- 主流程


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lambda", dest="lam", type=float, default=LAMBDA_CU)
    ap.add_argument("--B", type=float, default=DEFAULT_B)
    ap.add_argument("--dat", default=FF_DAT)
    args = ap.parse_args()

    cronie = load_cronie(CRONIE_TS)
    records = parse_ff_dat(args.dat)
    lam, B = args.lam, args.B

    ent = nearest_radiation(find_record(records, "Al"), lam)
    print("=" * 78)
    print("λ = %.5f Å (最近列: %s, λ=%.5f)   B = %.2f" % (lam, ent["radiation"], ent["lambda"], B))
    print("Al: f′ = %+.3f   f″ = %.3f" % (ent["fPrime"], ent["fDoublePrime"]))
    print("=" * 78)

    ref_rows = load_al_reference(AL_XRD)
    if ref_rows:
        print("参考谱 samples/Al.xrd：%d 个数据点，2θ %.2f–%.2f"
              % (len(ref_rows), ref_rows[0][0], ref_rows[-1][0]))

    print()
    print("— Al 六强峰（归一化到最强峰 = 100）—")
    print("%-8s %8s %10s %10s %10s %10s %10s"
          % ("hkl", "2θ°", "无修正", "modulus", "help(5)", "ref", "Δ(mod-ref)"))
    off = normalize(al_peaks(cronie, records, lam, B, False))
    on = normalize(al_peaks(cronie, records, lam, B, True, "modulus"))
    h5 = normalize(al_peaks(cronie, records, lam, B, True, "help5"))
    ro = normalize(al_peaks(cronie, records, lam, B, True, "real_only"))
    print("%-8s %8s %9s %9s %9s %9s %9s %9s"
          % ("hkl", "2θ°", "无修正", "f′(实部)", "modulus", "help(5)", "ref", "Δ(mod)"))
    for i, (hkl, tt, _) in enumerate(off):
        pk = peak_at(ref_rows, tt) if ref_rows else None
        refv = None
        if pk:
            mx = max(v for _, v in ref_rows)
            refv = 100.0 * pk[1] / mx
        d = ("%+.2f%%" % (on[i][2] - refv)) if refv is not None else "—"
        print("%-8s %8.3f %9.2f %9.2f %9.2f %9.2f %9s %9s"
              % ("".join(str(x) for x in hkl), tt, off[i][2], ro[i][2], on[i][2],
                 h5[i][2], ("%.2f" % refv) if refv is not None else "—", d))
    print("  → modulus 与 help(5) 的最大绝对差：%.2e"
          % max(abs(on[i][2] - h5[i][2]) for i in range(len(on))))

    # 色散修正自身的相对幅度
    print()
    print("— 色散修正带来的相对变化（modulus vs 无修正）—")
    for i in range(len(off)):
        rel = 100.0 * (on[i][2] - off[i][2]) / off[i][2]
        print("  %-5s %+7.3f%%" % ("".join(str(x) for x in off[i][0]), rel))
    mean_on = sum(p[2] for p in on) / len(on)
    mean_off = sum(p[2] for p in off) / len(off)
    print("  均值：无修正 %.3f → modulus %.3f（%+.3f%%）"
          % (mean_off, mean_on, 100.0 * (mean_on - mean_off) / mean_off))

    # DW 施加位置的影响
    on_dwtot = normalize(al_peaks(cronie, records, lam, B, True, "modulus", True))
    print()
    print("— DW 因子施加位置的差异（f₀ 单独 vs 整个 f）—")
    for i in range(len(on)):
        print("  %-5s f₀-only %.4f   整体 %.4f   差 %+.4f%%"
              % ("".join(str(x) for x in on[i][0]), on[i][2], on_dwtot[i][2],
                 100.0 * (on_dwtot[i][2] - on[i][2]) / on[i][2]))

    # NaCl
    print()
    print("— NaCl 六峰（归一化到最强峰 = 100）—")
    print("%-8s %8s %10s %10s %10s" % ("hkl", "2θ°", "无修正", "复数", "标量help5"))
    n_off = normalize(nacl_peaks(cronie, records, lam, B, False))
    n_on = normalize(nacl_peaks(cronie, records, lam, B, True, "complex"))
    n_sc = normalize(nacl_peaks(cronie, records, lam, B, True, "scalar"))
    for i in range(len(n_off)):
        print("%-8s %8.3f %10.2f %10.2f %10.2f"
              % ("".join(str(x) for x in n_off[i][0]), n_off[i][1],
                 n_off[i][2], n_on[i][2], n_sc[i][2]))
    print("  → 复数 vs 标量 help(5) 最大绝对差：%.3f（多物种结构下两者不等价）"
          % max(abs(n_on[i][2] - n_sc[i][2]) for i in range(len(n_on))))

    # 波长支持情况
    print()
    print("— FF.dat 支持的波长 vs web/src/lib/xrd/constants.ts 的 λ 表 —")
    web_lambda = {"Cu": 1.54056, "Mo": 0.70930, "Cr": 2.28970,
                  "Co": 1.78897, "Fe": 1.93604}
    ff_lambda = {name: lam_v for name, lam_v in COLUMNS}
    for name, v in web_lambda.items():
        hit = min(ff_lambda.items(), key=lambda kv: abs(kv[1] - v))
        gap = abs(hit[1] - v)
        flag = "完全命中" if gap < 1e-6 else (
            "近似(Δλ=%.4f Å, 同类靶 Kα1)" % gap if gap < 0.02 else "✗ 无对应列")
        print("  %-3s %.5f Å → %-8s %.5f Å   %s" % (name, v, hit[0], hit[1], flag))


if __name__ == "__main__":
    main()
