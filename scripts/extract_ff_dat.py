#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_ff_dat.py — 解码 CalcXRD.exe 的 FF.dat（反常散射/色散修正表 F′, F″）。

用法
----
    python scripts/extract_ff_dat.py                      # 打印摘要（92 条物种 × 6 列）
    python scripts/extract_ff_dat.py --json ff.json       # 导出 JSON
    python scripts/extract_ff_dat.py --csv  ff.csv        # 导出 CSV（长表：Z,符号,辐射,f′,f″）
    python scripts/extract_ff_dat.py --show Al Fe Na1+    # 打印指定物种（Cu Kα1 等全部辐射）
    python scripts/extract_ff_dat.py --lambda 1.54056 --show Al Fe   # 指定波长（自动选最近辐射）

文件结构（本脚本的解析依据，详见 docs/ff-dat-spec.md）
------------------------------------------------------
- 无文件头；9568 字节 = 92 条 × 104 字节，整除、无余尾。
- 每条记录：
    偏移 0..7   : Delphi ShortString —— 1 字节长度 + 最多 7 字节符号，零填充
    偏移 8..103 : 12 个 little-endian IEEE-754 double
- 12 个 double = 6 列（f′, f″）交错存放，列序见 COLUMNS。
  列序由「K 吸收边跳变法」判定（f″ 在辐射跨越某元素 K 边时骤降）：
    A 组（第 1–2 列）f″ 在 Co(Z=27)→Ni(Z=28) 之间崩塌 ⇒ λ ∈ (1.4879, 1.6083) ⇒ Cu Kα
    B 组（第 3–4 列）f″ 在 Y (Z=39)→Zr(Z=40) 之间崩塌 ⇒ λ ∈ (0.6889, 0.7277) ⇒ Mo Kα
    C 组（第 5–6 列）f″ 在 Mn(Z=25)→Fe(Z=26) 之间崩塌 ⇒ λ ∈ (1.7433, 1.8961) ⇒ Co Kα
  每组的第 1 列为 Kα1、第 2 列为 Kα2（Kα2 波长更长，f″ 略大，据此定向）。

已知数据缺陷
------------
- 第 91 条记录（Z=91，应为 Pa 镤）的符号被写成 "Po"（与 Z=84 的 Po 重复）。
  因此**必须按记录序号（= 原子序数 Z）索引，不能按符号索引**；本脚本会重复符号告警。
- 表中只有 92 个中性元素（H–U），**不含离子态**；离子（Na1+、Cl1- 等）需回退到中性元素取值。

依赖：Python ≥ 3.8，仅标准库。作者：架构师 高见远，2026-10-16。
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import struct
import sys

# ── 结构常量 ────────────────────────────────────────────────────────────────
RECORD_SIZE = 104          # 每条记录字节数
NAME_FIELD_SIZE = 8        # Delphi ShortString 字段宽（1 长度字节 + 7 字符）
NUM_DOUBLES = 12           # 记录内 double 个数
EXPECTED_RECORDS = 92      # H(1) – U(92)
EXPECTED_FILE_SIZE = RECORD_SIZE * EXPECTED_RECORDS  # 9568

# 列序：(辐射标签, 波长 Å)。Kα1/Kα2 取国际通用值（与 web/src/lib/xrd/constants.ts 一致）。
COLUMNS: list[tuple[str, float]] = [
    ("CuKa1", 1.54056),
    ("CuKa2", 1.54439),
    ("MoKa1", 0.70930),
    ("MoKa2", 0.71359),
    ("CoKa1", 1.78897),
    ("CoKa2", 1.79285),
]

# 常见离子的中性母体回退表（FF.dat 无离子态记录）
ION_FALLBACK_HINT = (
    "FF.dat 仅含 92 个中性元素。离子符号（Na1+/Cl1-/O2-/Ba2+/Ti4+ …）"
    "请剥离价态后缀后按中性元素查表（与 web 侧 cronie.ts 的 normalizeElement 同一口径）。"
)


# ── 解析 ────────────────────────────────────────────────────────────────────
def parse_ff_dat(path: str) -> list[dict]:
    """解析 FF.dat，返回记录列表（按 Z 升序）。记录结构见模块 docstring。"""
    with open(path, "rb") as handle:
        data = handle.read()

    size = len(data)
    if size != EXPECTED_FILE_SIZE:
        print(
            f"[warn] 文件大小 {size} 字节，预期 {EXPECTED_FILE_SIZE}；"
            f"仍按 {RECORD_SIZE} 字节/条解析（{size // RECORD_SIZE} 条，余 {size % RECORD_SIZE} 字节）",
            file=sys.stderr,
        )
    if size % RECORD_SIZE != 0:
        raise SystemExit(f"文件大小 {size} 不能被 {RECORD_SIZE} 整除，记录边界假设不成立。")

    records: list[dict] = []
    for index in range(size // RECORD_SIZE):
        record = data[index * RECORD_SIZE:(index + 1) * RECORD_SIZE]
        name_len = record[0]
        if name_len > NAME_FIELD_SIZE - 1:
            raise SystemExit(
                f"记录 {index}: ShortString 长度字节 {name_len} 超过字段容量 "
                f"{NAME_FIELD_SIZE - 1}，结构假设不成立。"
            )
        symbol = record[1:1 + name_len].decode("latin-1")
        values = struct.unpack("<%dd" % NUM_DOUBLES, record[NAME_FIELD_SIZE:RECORD_SIZE])
        entries = [
            {
                "radiation": COLUMNS[i][0],
                "lambda": COLUMNS[i][1],
                "fPrime": values[2 * i],
                "fDoublePrime": values[2 * i + 1],
            }
            for i in range(NUM_DOUBLES // 2)
        ]
        records.append({"z": index + 1, "symbol": symbol, "values": entries})

    _warn_duplicate_symbols(records)
    return records


def _warn_duplicate_symbols(records: list[dict]) -> None:
    """FF.dat 中 Z=91 的符号被误写为 'Po'（与 Z=84 重复）——按 Z 索引、勿按符号索引。"""
    seen: dict[str, list[int]] = {}
    for record in records:
        seen.setdefault(record["symbol"], []).append(record["z"])
    for symbol, zs in seen.items():
        if len(zs) > 1:
            print(
                f"[warn] 符号 '{symbol}' 出现在 Z={zs} —— FF.dat 录入缺陷"
                f"（Z=91 应为 Pa）。请按 Z（记录序号）索引。",
                file=sys.stderr,
            )


# ── 查询 ────────────────────────────────────────────────────────────────────
def normalize_symbol(symbol: str) -> str:
    """剥离离子价后缀：'Na1+' → 'Na'，'O2-' → 'O'（与 web 侧 cronie.ts 同口径）。"""
    import re

    return re.sub(r"\d*[+-]$", "", symbol.strip())


def find_record(records: list[dict], key: str) -> dict | None:
    """按原子序数（'26'）或元素符号（'Fe'、'Na1+'）查找记录。"""
    if key.isdigit():
        z = int(key)
        for record in records:
            if record["z"] == z:
                return record
        return None
    target = normalize_symbol(key).lower()
    for record in records:
        if record["symbol"].lower() == target:
            return record
    return None


def nearest_radiation(record: dict, lambda_a: float) -> dict:
    """在 6 个辐射列中取波长最接近 lambda_a 的一列（不插值）。"""
    return min(record["values"], key=lambda entry: abs(entry["lambda"] - lambda_a))


# ── 导出 ────────────────────────────────────────────────────────────────────
def to_long_rows(records: list[dict]) -> list[dict]:
    """展平为长表，每行 = (Z, 符号, 辐射, 波长, f′, f″)。"""
    rows: list[dict] = []
    for record in records:
        for entry in record["values"]:
            rows.append(
                {
                    "Z": record["z"],
                    "symbol": record["symbol"],
                    "radiation": entry["radiation"],
                    "lambda_A": entry["lambda"],
                    "fPrime": entry["fPrime"],
                    "fDoublePrime": entry["fDoublePrime"],
                }
            )
    return rows


def write_json(records: list[dict], path: str) -> None:
    payload = {
        "source": "CalcXRD.exe FF.dat",
        "record": {
            "size_bytes": RECORD_SIZE,
            "name_field": "Delphi ShortString (1 length byte + up to 7 chars, zero padded)",
            "doubles": NUM_DOUBLES,
            "layout": "6 interleaved (f', f'') pairs",
        },
        "columns": [{"radiation": r, "lambda_A": l} for r, l in COLUMNS],
        "notes": [
            "Index by Z (record ordinal), not by symbol: Z=91 is mislabelled 'Po' (should be Pa).",
            ION_FALLBACK_HINT,
        ],
        "elements": records,
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def write_csv(records: list[dict], path: str) -> None:
    rows = to_long_rows(records)
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["Z", "symbol", "radiation", "lambda_A", "fPrime", "fDoublePrime"]
        )
        writer.writeheader()
        writer.writerows(rows)


# ── CLI ─────────────────────────────────────────────────────────────────────
def print_summary(records: list[dict]) -> None:
    print(f"记录数: {len(records)}（预期 {EXPECTED_RECORDS}）  记录长度: {RECORD_SIZE} 字节")
    print("列序（f′, f″ 交错）: " + ", ".join(f"{r}={l:.5f}Å" for r, l in COLUMNS))
    print("符号: " + " ".join(r["symbol"] for r in records))
    print()


def print_species(records: list[dict], keys: list[str], lambda_a: float | None) -> None:
    for key in keys:
        record = find_record(records, key)
        if record is None:
            print(f"{key}: 未找到（FF.dat 仅含 H–U 92 个中性元素）")
            continue
        print(f"Z={record['z']:>2}  {record['symbol']:<3} "
              f"{'[离子→中性回退]' if normalize_symbol(key) != key else ''}")
        for entry in record["values"]:
            mark = ""
            if lambda_a is not None and abs(entry["lambda"] - lambda_a) < 1e-9:
                mark = "   <== 精确匹配"
            print(
                f"   {entry['radiation']:<6} λ={entry['lambda']:.5f} Å   "
                f"f′={entry['fPrime']:>8.3f}   f″={entry['fDoublePrime']:>8.3f}{mark}"
            )
        if lambda_a is not None:
            best = nearest_radiation(record, lambda_a)
            print(
                f"   最近辐射（λ={lambda_a} Å）: {best['radiation']} "
                f"(λ={best['lambda']:.5f} Å, Δλ={abs(best['lambda'] - lambda_a):.5f} Å) "
                f"f′={best['fPrime']:.3f} f″={best['fDoublePrime']:.3f}"
            )
        print()


def main() -> None:
    default_dat = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "FF.dat")
    parser = argparse.ArgumentParser(description="解码 CalcXRD.exe FF.dat（F′/F″ 色散修正表）")
    parser.add_argument("--dat", default=os.path.normpath(default_dat), help="FF.dat 路径")
    parser.add_argument("--json", metavar="PATH", help="导出 JSON")
    parser.add_argument("--csv", metavar="PATH", help="导出 CSV（长表）")
    parser.add_argument("--show", nargs="*", metavar="SPECIES", help="打印指定物种（Z 或符号）")
    parser.add_argument("--lambda", dest="lambda_a", type=float, help="目标波长（Å），用于最近辐射选择")
    args = parser.parse_args()

    if not os.path.exists(args.dat):
        raise SystemExit(f"找不到 FF.dat: {args.dat}")

    records = parse_ff_dat(args.dat)
    print_summary(records)

    if args.json:
        write_json(records, args.json)
        print(f"已写出 JSON: {args.json}")
    if args.csv:
        write_csv(records, args.csv)
        print(f"已写出 CSV : {args.csv}")
    if args.show:
        print_species(records, args.show, args.lambda_a)
    if not (args.json or args.csv or args.show):
        print("（加 --json/--csv/--show 以导出或查看数据；--help 查看全部选项）")


if __name__ == "__main__":
    main()
