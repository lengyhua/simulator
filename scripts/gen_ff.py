#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_ff.py — 由 CalcXRD.exe 的 FF.dat 生成 web 引擎的色散修正数据表
`web/src/lib/xrd/ff_data.ts`（GENERATED FILE, DO NOT EDIT）。

解码逻辑（详见 docs/ff-dat-spec.md）：
- 无文件头；9568 字节 = 92 条 × 104 字节。
- 每条记录：8 字节 Delphi ShortString（1 长度字节 + 最多 7 字符，零填充）
             + 12 个 little-endian IEEE-754 double（96 字节）。
- 12 个 double = 6 组交错的 (f′, f″)，列序见 LAMBDA_COLUMNS。
- 记录按 Z = 1..92 升序；Z=91 的名称被误标为 "Po"，正确应为 "Pa"。
  因此产物的 FF_SYMBOLS 用**按 Z 顺序的正确元素符号表**重建，不信任
  FF.dat 内的符号串。

用法：
    python scripts/gen_ff.py                       # 打印统计，并写 web/src/lib/xrd/ff_data.ts
    python scripts/gen_ff.py --out path/to/ff_data.ts

依赖：Python ≥ 3.8，仅标准库。作者：主理人（接手架构师 Y2），2026-10-16。
"""

from __future__ import annotations

import argparse
import os
import struct
import sys

# ── 结构常量 ────────────────────────────────────────────────────────────────
RECORD_SIZE = 104          # 每条记录字节数
NAME_FIELD_SIZE = 8        # Delphi ShortString 字段宽（1 长度字节 + 7 字符）
NUM_DOUBLES = 12           # 记录内 double 个数
EXPECTED_RECORDS = 92      # H(1) – U(92)
EXPECTED_FILE_SIZE = RECORD_SIZE * EXPECTED_RECORDS  # 9568

# 列序：(辐射标签, 波长 Å)。取国际通用 Kα1/Kα2（与 web/src/lib/xrd/constants.ts 一致）。
LAMBDA_COLUMNS: list[tuple[str, float]] = [
    ("CuKa1", 1.54056),
    ("CuKa2", 1.54439),
    ("MoKa1", 0.70930),
    ("MoKa2", 0.71359),
    ("CoKa1", 1.78897),
    ("CoKa2", 1.79285),
]

# 按 Z 顺序的正确元素符号（H..U）。FF.dat 内 Z=91 误标为 "Po"，
# 这里显式修正为 "Pa"，供 getDispersion 的 symbol->Z 索引使用。
CANONICAL_SYMBOLS: list[str] = [
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

assert len(CANONICAL_SYMBOLS) == EXPECTED_RECORDS, "CANONICAL_SYMBOLS 长度应为 92"
assert CANONICAL_SYMBOLS[90] == "Pa", "Z=91 应为 Pa（FF.dat 误标为 Po）"


def parse_ff_dat(path: str) -> list[list[float]]:
    """解析 FF.dat，返回 92 × 12 的 double 矩阵（按 Z 升序）。"""
    with open(path, "rb") as handle:
        data = handle.read()
    if len(data) != EXPECTED_FILE_SIZE:
        raise SystemExit(
            f"FF.dat 大小 {len(data)} 字节，预期 {EXPECTED_FILE_SIZE}；"
            f"记录边界假设不成立。"
        )
    matrix: list[list[float]] = []
    for index in range(EXPECTED_RECORDS):
        record = data[index * RECORD_SIZE:(index + 1) * RECORD_SIZE]
        name_len = record[0]
        symbol = record[1:1 + name_len].decode("latin-1")
        if symbol != CANONICAL_SYMBOLS[index]:
            print(
                f"[note] Z={index + 1} 文件内符号 '{symbol}' "
                f"≠ 规范符号 '{CANONICAL_SYMBOLS[index]}'（FF.dat 录入缺陷，已修正）",
                file=sys.stderr,
            )
        values = struct.unpack("<%dd" % NUM_DOUBLES, record[NAME_FIELD_SIZE:RECORD_SIZE])
        matrix.append([round(v, 3) for v in values])
    return matrix


def build_ts(matrix: list[list[float]]) -> str:
    """拼出 ff_data.ts 的内容（GENERATED FILE）。"""
    lines: list[str] = []
    lines.append("/**")
    lines.append(" * F′/F″ anomalous-dispersion table from the legacy program's own FF.dat —")
    lines.append(" * GENERATED FILE, DO NOT EDIT.")
    lines.append(" *")
    lines.append(" * Source: `FF.dat` shipped with CalcXRD.exe (binary, 92 records x 104")
    lines.append(" * bytes), decoded 2026-10-16. This is the exact dispersion table the")
    lines.append(" * original program uses, so it is the runtime source of truth for the")
    lines.append(" * F′F″ correction.")
    lines.append(" *")
    lines.append(" * Layout: 92 neutral elements (H..U) ordered by Z = 1..92.")
    lines.append(" * Each row holds 6 interleaved (f′, f″) pairs, one per radiation column")
    lines.append(" * in {@link FF_LAMBDAS}. Values are 3-decimal (the table is hand-recorded")
    lines.append(" * constants, not runtime output). NOTE Z=91 is Pa (FF.dat mislabels it")
    lines.append(" * 'Po'); index by Z via {@link FF_SYMBOLS}, never by the raw symbol.")
    lines.append(" *")
    lines.append(" * Regenerate with: python scripts/gen_ff.py")
    lines.append(" */")
    lines.append("")
    lines.append("/** Supported dispersion radiation columns (Cu/Mo/Co Kα1+Kα2). */")
    col_entries = ", ".join(f"{name}: {lam}" for name, lam in LAMBDA_COLUMNS)
    lines.append(f"export const FF_LAMBDAS = {{ {col_entries} }} as const;")
    lines.append("")
    lines.append("/**")
    lines.append(" * Supported radiation labels, in the same order as the 12 doubles per row.")
    lines.append(" */")
    col_names = ", ".join(f"'{name}'" for name, _ in LAMBDA_COLUMNS)
    lines.append(f"export const FF_COLUMNS: readonly string[] = [{col_names}];")
    lines.append("")
    lines.append("/**")
    lines.append(" * Canonical element symbols by Z (index 0 = Z=1). Z=91 is 'Pa' (FF.dat")
    lines.append(" * mislabels it 'Po'); use this to map a normalized element name to its Z.")
    lines.append(" */")
    sym_entries = ", ".join(f"'{s}'" for s in CANONICAL_SYMBOLS)
    lines.append(f"export const FF_SYMBOLS: readonly string[] = [{sym_entries}];")
    lines.append("")
    lines.append("/**")
    lines.append(" * F′/F″ table: 92 rows (Z=1..92), each 12 numbers = [f′₁,f″₁,f′₂,f″₂,")
    lines.append(" * f′₃,f″₃,f′₄,f″₄,f′₅,f″₅,f′₆,f″₆] with columns per {@link FF_LAMBDAS}.")
    lines.append(" */")
    lines.append("export const FF_TABLE: readonly (readonly number[])[] = [")
    for row in matrix:
        formatted = ", ".join(f"{v}" for v in row)
        lines.append(f"  [{formatted}],")
    lines.append("];")
    lines.append("")
    return "\n".join(lines) + "\n"


def main() -> None:
    default_dat = os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "FF.dat")
    )
    default_out = os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                     "web", "src", "lib", "xrd", "ff_data.ts")
    )
    parser = argparse.ArgumentParser(description="由 FF.dat 生成 ff_data.ts")
    parser.add_argument("--dat", default=default_dat, help="FF.dat 路径")
    parser.add_argument("--out", default=default_out, help="输出 ff_data.ts 路径")
    args = parser.parse_args()

    if not os.path.exists(args.dat):
        raise SystemExit(f"找不到 FF.dat: {args.dat}")

    matrix = parse_ff_dat(args.dat)
    content = build_ts(matrix)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        handle.write(content)

    print(f"已写出 {args.out}")
    print(f"  记录数: {len(matrix)}（预期 {EXPECTED_RECORDS}）")
    print(f"  列序: " + ", ".join(f"{n}={l:.5f}Å" for n, l in LAMBDA_COLUMNS))


if __name__ == "__main__":
    main()
