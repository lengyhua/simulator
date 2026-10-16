#!/usr/bin/env python3
"""Cross-validate Factor.dat (f₀, 5-Gaussian) against gemmi it92.hpp (IUCr 4-Gaussian).

Sources:
  A. Factor.dat        — CalcXRD.exe 自带的运行时 f₀ 表（199 物种含离子，5 项 + c）
  B. scripts/tmp/it92.hpp — gemmi 内嵌 ITC Vol C 1992+ 系数（4 项 + c，中性 99 + 离子 112）

Output:
  - f₀(s) 对比表（s = 0, 0.1, 0.3, 0.5, 1.0 Å⁻¹）
  - 每元素最大偏差 / 相对偏差
  - 全元素电子数自检（f₀(0) vs Z）

Usage:
    python scripts/cross_validate_f0.py
    python scripts/cross_validate_f0.py --minimal   # 只打印最大偏差 > 2% 的元素
"""

from __future__ import annotations

import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTOR_DAT = ROOT / "Factor.dat"
IT92_HPP = ROOT / "scripts" / "tmp" / "it92.hpp"

S_POINTS = [0.0, 0.1, 0.3, 0.5, 1.0]  # s = sinθ/λ [Å⁻¹]
THRESHOLD = 0.02  # 相对偏差阈值（报告超出的元素）

# 92 中性元素符号（与 factor_data.ts 键顺序一致）
NEUTRAL = [
    "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
    "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
    "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
    "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
    "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
    "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
    "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
    "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th",
    "Pa", "U",
]
Z = {el: i + 1 for i, el in enumerate(NEUTRAL)}


# ---------------------------------------------------------------------------
# Factor.dat reader
# ---------------------------------------------------------------------------

def load_factor_dat() -> dict[str, dict]:
    """Parse Factor.dat → {species: {a: [...], b: [...], c: float}}."""
    data = FACTOR_DAT.read_bytes()
    out = {}
    for off in range(0, len(data), 96):
        L = data[off]
        name = data[off + 1 : off + 1 + L].decode("ascii", errors="replace")
        v = struct.unpack("<11d", data[off + 8 : off + 96])
        a = [v[0], v[2], v[4], v[6], v[8]]
        b = [v[1], v[3], v[5], v[7], v[9]]
        c = v[10]
        out[name] = {"a": a, "b": b, "c": c}
    return out


def f0(coeffs: dict, s: float) -> float:
    """f₀(s) = Σᵢ aᵢ·exp(−bᵢ·s²) + c."""
    s2 = s * s
    terms = min(len(coeffs["a"]), len(coeffs["b"]))
    v = coeffs["c"]
    for i in range(terms):
        import math
        v += coeffs["a"][i] * math.exp(-coeffs["b"][i] * s2)
    return v


# ---------------------------------------------------------------------------
# it92.hpp parser
# ---------------------------------------------------------------------------

ROW_RE = re.compile(
    r"\{(\s*[\d\.\-]+)(?:\s*,\s*(\S+)){8}\s*},\s*//\s*(\S+)"
)

def load_it92() -> dict[str, dict]:
    """Parse it92.hpp → {element_or_ion: {a: [4 floats], b: [4 floats], c: float}}.

    it92.hpp format: a1 a2 a3 a4 b1 b2 b3 b4 c  (4-Gaussian)
    """
    text = IT92_HPP.read_text(encoding="utf-8")
    out = {}
    # Find all coefficient rows: {v1,...,v9}, // label
    pattern = re.compile(
        r"\{\s*([\d\.\-eE]+)\s*,\s*([\d\.\-eE]+)\s*,\s*([\d\.\-eE]+)\s*,"
        r"\s*([\d\.\-eE]+)\s*,\s*([\d\.\-eE]+)\s*,\s*([\d\.\-eE]+)\s*,"
        r"\s*([\d\.\-eE]+)\s*,\s*([\d\.\-eE]+)\s*,\s*([\d\.\-eE]+)\s*\}\s*,?\s*//\s*(\S+)"
    )
    for m in pattern.finditer(text):
        vals = [float(m.group(i)) for i in range(1, 10)]
        label = m.group(10)
        # Skip the first row (X=O dummy at index 0)
        if label.startswith("X="):
            continue
        out[label] = {"a": vals[:4], "b": vals[4:8], "c": vals[8]}
    return out


def f0_it92(coeffs: dict, s: float) -> float:
    """f₀(s) = Σᵢ₌₁..4 aᵢ·exp(−bᵢ·s²) + c (it92 standard form)."""
    import math
    s2 = s * s
    return coeffs["c"] + sum(ai * math.exp(-bi * s2) for ai, bi in zip(coeffs["a"], coeffs["b"]))


# ---------------------------------------------------------------------------
# Main comparison
# ---------------------------------------------------------------------------

def main() -> None:
    import os
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.stdout.reconfigure(encoding="utf-8")

    minimal = "--minimal" in sys.argv
    factor_coeffs = load_factor_dat()
    it92_coeffs = load_it92()

    print(f"Factor.dat: {len(factor_coeffs)} species")
    print(f"it92.hpp:   {len(it92_coeffs)} species (neutral + ions)")
    print()

    # --- Comparison 1: neutral elements f₀(s) at multiple s points ---
    print(f"{'species':8s} {'s':>6s}  {'f₀(A)':>10s} {'f₀(B)':>10s}  {'Δ':>10s}  {'rel%':>7s}")
    print("-" * 58)
    worst: dict[str, float] = {}
    for el in NEUTRAL:
        a = factor_coeffs.get(el)
        b = it92_coeffs.get(el)
        if not a or not b:
            continue
        for s in S_POINTS:
            fa = f0(a, s)
            fb = f0_it92(b, s)
            if s == 0:
                rel = abs(fa - fb) / max(abs(fb), 1e-9)
                worst[el] = max(worst.get(el, 0), rel)
                continue
            if not minimal:
                rel = abs(fa - fb) / max(abs(fb), 1e-9)
                flag = " ⚠" if rel > THRESHOLD else ""
                print(f"{el:8s} {s:>6.2f}  {fa:10.4f} {fb:10.4f}  {fa-fb:10.4f}  {rel*100:6.2f}%{flag}")
        # minimal mode: only print if worst exceeded threshold
        if minimal:
            s_max = 0.0  # find s with worst relative error
            for s in S_POINTS[1:]:
                fa = f0(a, s)
                fb = f0_it92(b, s)
                rel = abs(fa - fb) / max(abs(fb), 1e-9)
                if rel > worst.get(el, 0):
                    worst[el] = rel
                    s_max = s
            if worst.get(el, 0) > THRESHOLD:
                print(f"{el:8s} {s_max:>6.2f}  {f0(a,s_max):10.4f} {f0_it92(b,s_max):10.4f}"
                      f"  {'':>10s}  {worst[el]*100:6.2f}% ⚠")
                print(f"{'':8s} f₀(0): A={f0(a,0):.4f} B={f0_it92(b,0):.4f} (Z={Z[el]})")
                print()

    print()
    if not minimal:
        print("=== f₀(0) self-check: Σa+c vs Z (Factor.dat) ===")
        bad = []
        for el in NEUTRAL:
            c = factor_coeffs.get(el)
            if not c:
                continue
            f0_0 = f0(c, 0.0)
            z = Z[el]
            if abs(f0_0 - z) > 0.5:
                bad.append((el, f0_0, z))
        if bad:
            for el, v, z in bad:
                print(f"  {el:4s}  f₀(0)={v:.4f}  Z={z}  Δ={v-z:+.4f}")
        else:
            print("  all neutral elements: f₀(0) ≈ Z ✅")

    # --- Comparison 2: ion f₀(s) where both have data ---
    print()
    print("=== Ion comparison (s = 0, 0.1, 0.3) ===")
    ion_prefixes = [s for s in factor_coeffs if any(c in s for c in "+-")]
    matched = 0
    for sp in sorted(ion_prefixes):
        a = factor_coeffs.get(sp)
        b = it92_coeffs.get(sp)
        if not a or not b:
            continue
        matched += 1
        for s in [0.0, 0.1, 0.3]:
            fa = f0(a, s)
            fb = f0_it92(b, s)
            rel = abs(fa - fb) / max(abs(fb), 1e-9)
            flag = " ⚠" if rel > 0.05 else ""
            print(f"  {sp:6s} s={s:4.1f}  A={fa:8.4f}  B={fb:8.4f}  Δrel={rel*100:5.1f}%{flag}")
    print(f"  ({matched} ion species matched in both tables)")


if __name__ == "__main__":
    main()
