#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_factor_dat.py — 由 CalcXRD.exe 的 Factor.dat 生成 web 引擎的 f₀ 数据表
`web/src/lib/xrd/factor_data.ts`（GENERATED FILE, DO NOT EDIT）。

解码逻辑（CLAUDE.md「Data file formats」§Factor.dat）：
- 无文件头；19104 字节 = 199 条 × 96 字节。
- 每条记录：8 字节 Delphi ShortString[7]（1 长度字节 + 最多 7 字符，零填充）
             + 11 个 little-endian IEEE-754 double（88 字节）。
- 11 个 double 交错排列 a1 b1 a2 b2 a3 b3 a4 b4 a5 b5 c：
             f0(s) = Σᵢ₌₁..₅ aᵢ·exp(−bᵢ s²) + c，s = sinθ/λ [Å⁻¹]
- 199 物种 = 92 中性元素 + 107 离子/价态物种（Na1+、Cl1-、O2-、Cval、Sival…）。

同时导出 CSV `docs/data/factor_dat.csv`（species,a1..a5,b1..b5,c,f0_electrons）。

用法：
    python scripts/gen_factor_dat.py                       # 写 factor_data.ts + factor_dat.csv
    python scripts/gen_factor_dat.py --out path/to/factor_data.ts
    python scripts/gen_factor_dat.py --check               # 只校验，不写文件

依赖：Python ≥ 3.8，仅标准库。2026-10-16 补齐（原脚本缺失，factor_data.ts
头声称由此生成；本脚本与现 factor_data.ts 逐值一致，6 位小数，round-trip
验证通过）。
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACTOR_DAT = ROOT / "Factor.dat"
TS_OUT = ROOT / "web" / "src" / "lib" / "xrd" / "factor_data.ts"
CSV_OUT = ROOT / "docs" / "data" / "factor_dat.csv"

RECORD_SIZE = 96            # 每条记录字节数
EXPECTED_RECORDS = 199      # 92 中性 + 107 离子/价态
EXPECTED_FILE_SIZE = RECORD_SIZE * EXPECTED_RECORDS  # 19104


def _fmt(x: float) -> str:
    """匹配现 factor_data.ts 的数值格式：6 位有效数字以上，去尾零，
    极小值走科学计数（如 4.9e-05）。"""
    s = f"{x:.6f}".rstrip("0").rstrip(".")
    if s in ("", "-"):
        s = "0"
    # 现 TS 用 4.9e-05 形式：绝对值 < 1e-4 且非零时用科学计数
    if x != 0 and abs(x) < 1e-4:
        s = f"{x:.1e}"
    return s


def load_factor_dat() -> list[tuple[str, list[float], list[float], float]]:
    """Parse Factor.dat → [(name, a[5], b[5], c), ...] in file order."""
    data = FACTOR_DAT.read_bytes()
    if len(data) != EXPECTED_FILE_SIZE:
        raise SystemExit(
            f"Factor.dat 尺寸 {len(data)} B ≠ 期望 {EXPECTED_FILE_SIZE} B "
            f"({EXPECTED_RECORDS} × {RECORD_SIZE})；中止。")
    out = []
    for off in range(0, len(data), RECORD_SIZE):
        L = data[off]
        if L > 7:
            raise SystemExit(f"偏移 {off}: 名称长度 {L} > 7，记录边界错乱；中止。")
        name = data[off + 1: off + 1 + L].decode("ascii", errors="replace")
        v = struct.unpack("<11d", data[off + 8: off + 96])
        a = [v[0], v[2], v[4], v[6], v[8]]
        b = [v[1], v[3], v[5], v[7], v[9]]
        c = v[10]
        out.append((name, a, b, c))
    return out


def build_ts(records: list[tuple[str, list[float], list[float], float]]) -> str:
    # CRLF line endings: pre-existing *_data.ts in this repo use CRLF.
    sep = "\r\n"
    lines = [
        "/**",
        " * Atomic scattering factors f₀ from the legacy program's own table —",
        " * GENERATED FILE, DO NOT EDIT.",
        " *",
        " * Source: `Factor.dat` shipped with CalcXRD.exe (binary, 199 records x 96",
        " * bytes), decoded 2026-10-16 and transcribed by scripts/gen_factor_dat.py.",
        " * This is the table the original program actually uses, so it is the single",
        " * runtime source of truth for f₀ — including ION species (`Na1+`, `Cl1-`,",
        " * `O2-`, ...), which the hand-transcribed IUCr table cannot represent.",
        " *",
        " *   f0(s) = Σᵢ₌₁..₅ aᵢ·exp(−bᵢ·s²) + c,   s = sinθ/λ [Å⁻¹]",
        " *",
        " * (Negative exponent — the legacy help RTF's exp(bᵢ(λ/sinθ)²) is an RTF",
        " * transcription artifact.)",
        " *",
        " * Regenerate with: python scripts/gen_factor_dat.py",
        " */",
        "",
        "/** Scattering-factor coefficients: `f0(s) = Σ aᵢ·exp(−bᵢ·s²) + c`. */",
        "export interface FactorCoefficients {",
        "  /** Gaussian amplitudes a1..aN (N = 5 in the shipped table). */",
        "  a: number[];",
        "  /** Gaussian exponents b1..bN (Å²). */",
        "  b: number[];",
        "  /** Constant offset c. */",
        "  c: number;",
        "}",
        "",
        "/** Species coefficients keyed by the exact `Factor.dat` name (ions included). */",
        "export const FACTOR_COEFFS: Record<string, FactorCoefficients> = {",
    ]
    for name, a, b, c in records:
        e_sum = sum(a) + c
        a_s = ", ".join(_fmt(x) for x in a)
        b_s = ", ".join(_fmt(x) for x in b)
        lines.append(
            f"  '{name}': {{ a: [{a_s}], b: [{b_s}], c: {_fmt(c)} }}, "
            f"// Σa+c = {e_sum:.4f} // e⁻ = {round(e_sum)}")
    lines.append("};")
    lines.append("")
    lines.append(
        "/** Number of Gaussian terms in the shipped table (drives the evaluator loop). */")
    lines.append("export const FACTOR_TERM_COUNT: number = 5;")
    lines.append("")
    return sep.join(lines)


def build_csv(records: list[tuple[str, list[float], list[float], float]]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["species"] + [f"a{i}" for i in range(1, 6)]
               + [f"b{i}" for i in range(1, 6)] + ["c", "f0_electrons"])
    for name, a, b, c in records:
        row = [name] + [f"{x:.6f}" for x in a] + [f"{x:.6f}" for x in b]
        row += [f"{c:.6f}", f"{sum(a) + c:.4f}"]
        w.writerow(row)
    return buf.getvalue()


def check(ts_text: str) -> int:
    """Round-trip check: parse existing factor_data.ts and compare values."""
    records = load_factor_dat()
    bad = 0
    for name, a, b, c in records:
        m = re.search(
            r"'" + re.escape(name) + r"':\s*{[^}]*}", ts_text)
        if m is None:
            print(f"  MISS  '{name}' not in factor_data.ts")
            bad += 1
            continue
        block = m.group(0)
        a_m = re.search(r"a: \[(.*?)\]", block)
        c_m = re.search(r"c: (-?[\d.eE+-]+)", block)
        if a_m is None or c_m is None:
            print(f"  MISS  '{name}' block shape unexpected: {block[:80]!r}")
            bad += 1
            continue
        a_ts = [float(x) for x in re.findall(r"-?\d+\.\d+", a_m.group(1))]
        c_ts = float(c_m.group(1))
        for x1, x2 in zip(a, a_ts):
            if abs(x1 - x2) > 5e-7:
                print(f"  DIFF  {name} a: dat={x1!r} ts={x2!r}")
                bad += 1
                break
        if abs(c - c_ts) > 5e-7:
            print(f"  DIFF  {name} c: dat={c!r} ts={c_ts!r}")
            bad += 1
    print(f"round-trip: {len(records) - bad}/{len(records)} records match "
          f"(tol 5e-7); {bad} differ" if bad else
          f"round-trip OK: all {len(records)} records match within 5e-7")
    return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=TS_OUT,
                    help="factor_data.ts 输出路径（默认 web/src/lib/xrd/factor_data.ts）")
    ap.add_argument("--csv-out", type=Path, default=CSV_OUT,
                    help="factor_dat.csv 输出路径（默认 docs/data/factor_dat.csv）")
    ap.add_argument("--check", action="store_true",
                    help="只做 round-trip 校验（与现有 .ts 比对），不写文件")
    args = ap.parse_args()

    records = load_factor_dat()
    print(f"Factor.dat: {len(records)} records, "
          f"first='{records[0][0]}', last='{records[-1][0]}'")

    if args.check:
        existing = TS_OUT.read_text(encoding="utf-8")
        sys.exit(1 if check(existing) else 0)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(build_ts(records), encoding="utf-8")
    args.csv_out.parent.mkdir(parents=True, exist_ok=True)
    args.csv_out.write_text(build_csv(records), encoding="utf-8")
    print(f"wrote {args.out}  ({len(records)} species)")
    print(f"wrote {args.csv_out}  ({len(records)} rows)")
    print("NOTE: 若 .ts 内容变了，跑 `cd web && npm test` 回归 "
          "Al/NaCl 基准。")


if __name__ == "__main__":
    main()
