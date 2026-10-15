#!/usr/bin/env python3
r"""One-time generator for src/lib/xrd/wyckoff_data.ts (plan T05).

Parses the reverse-engineered space-group tables shipped with CalcXRD:

  ../Wyckoff   254 blocks, one per space group:
                 <N>(<SGSymbol>)            group key (verbatim from WholeSG)
                 (0,0,0)+                   centering translations (0+ lines)
                 ...                        immediately after the key
                 <mult>                     per Wyckoff site:
                 <letter>                     multiplicity (integer)
                 <siteSymm>                   letter (single char)
                 (<op>) × k                   site symmetry
                                               k coordinate expressions
  ../WholeSG   254 lines, the authoritative key list.

The ops list of a site runs until the first line that is not a coordinate
expression. For centered groups the source lists representatives only
(site a of 225(Fm-3m) is the single `(0,0,0)`), so this script normalizes every
site to its FULL orbit: ops × centers, symbolically deduplicated, which always
yields exactly `mult` expressions (validated per site). `centers` is kept in the
output for reference; expandPositions() still expands centers × ops.

Keys use the full WholeSG names (e.g. "201(Pn-3)[origin choice 1]") so the
origin-choice variants of the 48 duplicated space-group numbers stay distinct.
A stray trailing backslash in the source data (130(P4/ncc)[origin choice 2]\)
is stripped.

Usage (managed python 3.13):
    python scripts/gen_wyckoff.py

The script validates structure and fails loudly before writing output; the
generated file is committed and must never be hand-edited.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WYCKOFF_SRC = ROOT.parent / "Wyckoff"
WHOLESG_SRC = ROOT.parent / "WholeSG"
OUTPUT = ROOT / "src" / "lib" / "xrd" / "wyckoff_data.ts"

KEY_RE = re.compile(r"^\d+\(.*\)")
CENTER_RE = re.compile(r"^\(.*\)\+$")
OP_RE = re.compile(r"^\(.*\)$")
EXPR_RE = re.compile(r"^\((.*)\)\+?$")
TERM_RE = re.compile(r"^([+-]?)(\d+(?:\.\d+)?(?:/\d+)?)?\*?([xyz])?$")


def parse_fraction(text: str) -> float:
    if "/" in text:
        numerator, _, denominator = text.partition("/")
        denominator_value = float(denominator)
        if denominator_value == 0:
            raise SystemExit(f"coordinate expression divides by zero: {text!r}")
        return float(numerator) / denominator_value
    return float(text)


def parse_component(component: str) -> tuple[tuple[int, int, int], float]:
    """Parses one component (e.g. `x-y`, `-z+1/2`, `1/2`) → (row, constant)."""
    terms = re.findall(r"[+-]?[^+-]+", component)
    if not terms:
        raise SystemExit(f"empty coordinate component: {component!r}")
    row = [0, 0, 0]
    constant = 0.0
    for term in terms:
        match = TERM_RE.fullmatch(term)
        if not match:
            raise SystemExit(f"cannot parse coordinate term {term!r} in {component!r}")
        sign = -1 if match.group(1) == "-" else 1
        magnitude = parse_fraction(match.group(2)) if match.group(2) else 1.0
        variable = match.group(3)
        if variable is not None:
            row["xyz".index(variable)] += sign * int(round(magnitude))
        else:
            if match.group(2) is None:
                raise SystemExit(f"cannot parse constant term {term!r} in {component!r}")
            constant += sign * magnitude
    return (row[0], row[1], row[2]), constant


def parse_expression(expression: str) -> tuple[tuple[tuple[int, int, int], ...], tuple[float, ...]]:
    """Parses `(c,c,c)` (+ optional trailing `+`) → (rot rows, translation)."""
    match = EXPR_RE.match(expression.strip())
    if not match:
        raise SystemExit(f"not a coordinate expression: {expression!r}")
    parts = match.group(1).split(",")
    if len(parts) != 3:
        raise SystemExit(f"coordinate expression needs 3 components: {expression!r}")
    rows: list[tuple[int, int, int]] = []
    translation: list[float] = []
    for part in parts:
        row, constant = parse_component(part.strip())
        rows.append(row)
        translation.append(constant)
    return tuple(rows), tuple(translation)


def format_number(value: float) -> str:
    """Formats a translation magnitude as a nice fraction when possible."""
    magnitude = abs(value)
    for denominator in (1, 2, 3, 4, 6, 8, 12):
        numerator = round(magnitude * denominator)
        if abs(magnitude - numerator / denominator) < 1e-9 and numerator != 0:
            return str(numerator) if denominator == 1 else f"{numerator}/{denominator}"
    return f"{magnitude:g}"


def format_component(row: tuple[int, int, int], constant: float) -> str:
    pieces: list[tuple[str, str]] = []
    for variable, coefficient in zip("xyz", row):
        if coefficient == 0:
            continue
        sign = "+" if coefficient > 0 else "-"
        magnitude = abs(coefficient)
        term = variable if magnitude == 1 else f"{magnitude}{variable}"
        pieces.append((sign, term))
    if abs(constant) > 1e-9:
        pieces.append(("+" if constant > 0 else "-", format_number(constant)))
    if not pieces:
        return "0"
    rendered = ""
    for index, (sign, term) in enumerate(pieces):
        if index == 0:
            rendered += f"-{term}" if sign == "-" else term
        else:
            rendered += f"{sign}{term}"
    return rendered


def format_expression(rows: tuple[tuple[int, int, int], ...], translation: tuple[float, ...]) -> str:
    components = [
        format_component(row, constant) for row, constant in zip(rows, translation)
    ]
    return "(" + ",".join(components) + ")"


def full_orbit(ops: list[str], centers: list[str]) -> list[str]:
    """Normalizes a site's ops to the full orbit: ops × centers, deduplicated."""
    center_translations = [parse_expression(center)[1] for center in centers] or [(0.0, 0.0, 0.0)]
    seen: set[tuple[tuple[tuple[int, int, int], ...], tuple[float, ...]]] = set()
    orbit: list[str] = []
    for op in ops:
        rows, translation = parse_expression(op)
        for center in center_translations:
            combined = tuple(
                (value + shift) % 1.0 for value, shift in zip(translation, center)
            )
            key = (rows, combined)
            if key not in seen:
                seen.add(key)
                orbit.append(format_expression(rows, combined))
    return orbit


def parse_blocks(path: Path) -> dict[str, dict]:
    """Parses the Wyckoff file into {key: {centers, sites}}."""
    lines = [line.rstrip("\r\n") for line in path.read_text(encoding="ascii").splitlines()]
    blocks: dict[str, dict] = {}
    index = 0
    total = len(lines)

    while index < total:
        line = lines[index]
        if not KEY_RE.match(line):
            index += 1
            continue
        key = line.strip().rstrip("\\").strip()
        if key in blocks:
            raise SystemExit(f"duplicate space-group key: {key}")
        index += 1

        centers: list[str] = []
        while index < total and CENTER_RE.match(lines[index]):
            centers.append(lines[index])
            index += 1

        sites: list[dict] = []
        while index < total and not KEY_RE.match(lines[index]):
            mult_line = lines[index].strip()
            if not re.fullmatch(r"\d+", mult_line):
                raise SystemExit(f"{key}: expected multiplicity, got {mult_line!r}")
            mult = int(mult_line)
            index += 1
            if index >= total:
                raise SystemExit(f"{key}: truncated site record")
            letter = lines[index].strip()
            if not re.fullmatch(r"[A-Za-z]", letter):
                raise SystemExit(f"{key}: expected site letter, got {letter!r}")
            index += 1
            if index >= total:
                raise SystemExit(f"{key}: truncated site record")
            symm = lines[index].strip()
            if symm == "" or symm.startswith("("):
                raise SystemExit(f"{key}: expected site symmetry, got {symm!r}")
            index += 1
            # The ops list runs until the first line that is not a coordinate
            # expression (next site's multiplicity or the next group key).
            ops: list[str] = []
            while index < total and OP_RE.match(lines[index]):
                ops.append(lines[index].strip())
                index += 1
            if not ops:
                raise SystemExit(f"{key}: site {letter} has no coordinate expressions")
            sites.append({"letter": letter, "mult": mult, "symm": symm, "ops": ops})

        if not sites:
            raise SystemExit(f"{key}: no Wyckoff sites parsed")
        blocks[key] = {"centers": centers, "sites": sites}

    return blocks


def normalize_blocks(blocks: dict[str, dict]) -> None:
    """Rewrites every site's ops to the full orbit and validates multiplicities."""
    for key, block in blocks.items():
        center_count = max(len(block["centers"]), 1)
        for site in block["sites"]:
            raw_count = len(site["ops"])
            if raw_count != site["mult"] and raw_count * center_count != site["mult"]:
                raise SystemExit(
                    f"{key} site {site['letter']}: mult={site['mult']} but {raw_count} ops "
                    f"× {center_count} centers"
                )
            site["ops"] = full_orbit(site["ops"], block["centers"])
            if len(site["ops"]) != site["mult"]:
                raise SystemExit(
                    f"{key} site {site['letter']}: full orbit has {len(site['ops'])} "
                    f"positions, declared mult={site['mult']}"
                )


def validate_keys(blocks: dict[str, dict], wholesg: list[str]) -> None:
    if len(blocks) != 254:
        raise SystemExit(f"expected 254 space groups, parsed {len(blocks)}")
    wholesg_set = {key.strip().rstrip("\\").strip() for key in wholesg}
    missing = sorted(wholesg_set - set(blocks))
    extra = sorted(set(blocks) - wholesg_set)
    if missing or extra:
        raise SystemExit(f"key mismatch vs WholeSG — missing: {missing}, extra: {extra}")


def json_quote(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def format_ts(blocks: dict[str, dict]) -> str:
    lines: list[str] = []
    lines.append("/**")
    lines.append(" * Space-group Wyckoff data — GENERATED FILE, DO NOT EDIT.")
    lines.append(" *")
    lines.append(" * Source: CalcXRD repository data files `Wyckoff` (254 blocks) and")
    lines.append(" * `WholeSG` (authoritative key list), parsed by scripts/gen_wyckoff.py.")
    lines.append(" *")
    lines.append(" * Keys are the full WholeSG names (e.g. \"201(Pn-3)[origin choice 1]\") so")
    lines.append(" * the origin-choice variants of duplicated space-group numbers stay distinct.")
    lines.append(" *")
    lines.append(" * Layout per group (plan §3.1):")
    lines.append(" *   centers — centering translations, e.g. [\"(0,0,0)+\", \"(0,1/2,1/2)+\", ...]")
    lines.append(" *   sites   — Wyckoff positions with letter / multiplicity / site symmetry /")
    lines.append(" *             coordinate expressions (ops). ops holds the FULL orbit of the")
    lines.append(" *             site (representatives × centers, deduplicated) — exactly `mult`")
    lines.append(" *             expressions; the general position lists every operation.")
    lines.append(" *")
    lines.append(" * Regenerate with: python scripts/gen_wyckoff.py")
    lines.append(" */")
    lines.append("")
    lines.append("import type { SpaceGroupData } from './types';")
    lines.append("")
    lines.append("/** All 254 space groups, keyed by WholeSG full name. */")
    lines.append("export const WYCKOFF_DATA: Record<string, SpaceGroupData> = {")

    for key, block in blocks.items():
        lines.append(f"  {json_quote(key)}: {{")
        lines.append("    centers: [")
        for center in block["centers"]:
            lines.append(f"      {json_quote(center)},")
        lines.append("    ],")
        lines.append("    sites: [")
        for site in block["sites"]:
            ops = ", ".join(json_quote(op) for op in site["ops"])
            lines.append(
                f"      {{ letter: {json_quote(site['letter'])}, mult: {site['mult']}, "
                f"symm: {json_quote(site['symm'])}, ops: [{ops}] }},"
            )
        lines.append("    ],")
        lines.append("  },")

    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    if not WYCKOFF_SRC.exists():
        raise SystemExit(f"source table not found: {WYCKOFF_SRC}")
    if not WHOLESG_SRC.exists():
        raise SystemExit(f"source table not found: {WHOLESG_SRC}")
    blocks = parse_blocks(WYCKOFF_SRC)
    wholesg = [
        line.strip()
        for line in WHOLESG_SRC.read_text(encoding="ascii").splitlines()
        if line.strip()
    ]
    validate_keys(blocks, wholesg)
    normalize_blocks(blocks)

    site_count = sum(len(block["sites"]) for block in blocks.values())
    op_count = sum(len(site["ops"]) for block in blocks.values() for site in block["sites"])
    print(f"normalized {len(blocks)} space groups, {site_count} sites, {op_count} orbit ops")

    OUTPUT.write_text(format_ts(blocks), encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
