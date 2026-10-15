#!/usr/bin/env python3
"""One-time generator for src/lib/xrd/factor_data.ts.

Parses `Factor.dat` — the atomic scattering-factor table (f₀) that ships with
the legacy CalcXRD.exe — and emits the TypeScript coefficient table used by
the calculation engine. This is the program's OWN table, so it is the single
runtime source of truth for f₀ (the hand-transcribed IUCr/Cronie table in
cronie_data.ts is kept for cross-validation only).

Binary layout (verified 2026-10-16, 19104 bytes = 199 records x 96 bytes, no
file header):

    offset 0      : Delphi ShortString length byte L
    offset 1..L   : ASCII species name (e.g. "Al", "Na1+", "Cl1-", "Cval")
    offset 8..95  : 11 little-endian IEEE-754 doubles (struct '<11d')

    coefficients are interleaved: a1,b1,a2,b2,a3,b3,a4,b4,a5,b5,c
    evaluation:    f(s) = Σᵢ₌₁..₅ aᵢ·exp(−bᵢ·s²) + c,   s = sinθ/λ [Å⁻¹]

    NOTE the negative exponent: the legacy help RTF writes exp(bᵢ·(λ/sinθ)²),
    which is an RTF transcription artifact — evaluated literally it gives
    f(Al, s=0.1) ≈ 0.14, which is physically absurd.

Usage (managed python 3.13):
    python scripts/gen_factor_dat.py [path/to/Factor.dat]

Validation before emitting:
  - every record has a non-empty ASCII name and 11 finite doubles;
  - Σaᵢ + c matches the electron count (atomic number ∓ charge) within 0.05
    (180/199 records match to <1e-3; the remaining 19 differ by ≤0.038 due to
    rounding inside the shipped table).
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

RECORD_SIZE = 96
NAME_FIELD_SIZE = 8  # Delphi ShortString: 1 length byte + 7 payload bytes max
COEFF_COUNT = 11
TERM_COUNT = 5

# Atomic numbers for the neutral species present in the table (H–U).
ELEMENT_Z = {
    "H": 1, "He": 2, "Li": 3, "Be": 4, "B": 5, "C": 6, "N": 7, "O": 8, "F": 9,
    "Ne": 10, "Na": 11, "Mg": 12, "Al": 13, "Si": 14, "P": 15, "S": 16, "Cl": 17,
    "Ar": 18, "K": 19, "Ca": 20, "Sc": 21, "Ti": 22, "V": 23, "Cr": 24, "Mn": 25,
    "Fe": 26, "Co": 27, "Ni": 28, "Cu": 29, "Zn": 30, "Ga": 31, "Ge": 32,
    "As": 33, "Se": 34, "Br": 35, "Kr": 36, "Rb": 37, "Sr": 38, "Y": 39,
    "Zr": 40, "Nb": 41, "Mo": 42, "Tc": 43, "Ru": 44, "Rh": 45, "Pd": 46,
    "Ag": 47, "Cd": 48, "In": 49, "Sn": 50, "Sb": 51, "Te": 52, "I": 53,
    "Xe": 54, "Cs": 55, "Ba": 56, "La": 57, "Ce": 58, "Pr": 59, "Nd": 60,
    "Pm": 61, "Sm": 62, "Eu": 63, "Gd": 64, "Tb": 65, "Dy": 66, "Ho": 67,
    "Er": 68, "Tm": 69, "Yb": 70, "Lu": 71, "Hf": 72, "Ta": 73, "W": 74,
    "Re": 75, "Os": 76, "Ir": 77, "Pt": 78, "Au": 79, "Hg": 80, "Tl": 81,
    "Pb": 82, "Bi": 83, "Po": 84, "At": 85, "Rn": 86, "Fr": 87, "Ra": 88,
    "Ac": 89, "Th": 90, "Pa": 91, "U": 92,
}

# Non-standard species names in the table (valence variants of Si / C) whose
# electron count equals the neutral element's.
SPECIAL_NEUTRAL = {"Siva": "Si", "Cval": "C"}

TS_TEMPLATE = """/**
 * Atomic scattering factors f₀ from the legacy program's own table —
 * GENERATED FILE, DO NOT EDIT.
 *
 * Source: `Factor.dat` shipped with CalcXRD.exe (binary, 199 records x 96
 * bytes), decoded 2026-10-16 and transcribed by scripts/gen_factor_dat.py.
 * This is the table the original program actually uses, so it is the single
 * runtime source of truth for f₀ — including ION species (`Na1+`, `Cl1-`,
 * `O2-`, ...), which the hand-transcribed IUCr table cannot represent.
 *
 *   f0(s) = Σᵢ₌₁..₅ aᵢ·exp(−bᵢ·s²) + c,   s = sinθ/λ [Å⁻¹]
 *
 * (Negative exponent — the legacy help RTF's exp(bᵢ(λ/sinθ)²) is an RTF
 * transcription artifact.)
 *
 * Regenerate with: python scripts/gen_factor_dat.py
 */

/** Scattering-factor coefficients: `f0(s) = Σ aᵢ·exp(−bᵢ·s²) + c`. */
export interface FactorCoefficients {{
  /** Gaussian amplitudes a1..aN (N = 5 in the shipped table). */
  a: number[];
  /** Gaussian exponents b1..bN (Å²). */
  b: number[];
  /** Constant offset c. */
  c: number;
}}

/** Species coefficients keyed by the exact `Factor.dat` name (ions included). */
export const FACTOR_COEFFS: Record<string, FactorCoefficients> = {{
{body}
}};

/** Number of Gaussian terms in the shipped table (drives the evaluator loop). */
export const FACTOR_TERM_COUNT: number = {term_count};
"""


def parse_species(path: Path) -> list[tuple[str, list[float], list[float], float, float]]:
    """Parses every record into (name, a[], b[], c, electrons)."""
    raw = path.read_bytes()
    if len(raw) % RECORD_SIZE != 0:
        raise SystemExit(f"Factor.dat size {len(raw)} is not a multiple of {RECORD_SIZE}")
    rows: list[tuple[str, list[float], list[float], float, float]] = []
    for index in range(len(raw) // RECORD_SIZE):
        offset = index * RECORD_SIZE
        length = raw[offset]
        if length == 0 or length >= NAME_FIELD_SIZE:
            raise SystemExit(f"record {index}: invalid name length {length}")
        name = raw[offset + 1 : offset + 1 + length].decode("ascii")
        if not name.isprintable() or name.strip() == "":
            raise SystemExit(f"record {index}: non-printable name {name!r}")
        values = struct.unpack("<11d", raw[offset + 8 : offset + 8 + COEFF_COUNT * 8])
        for value in values:
            if value != value or value in (float("inf"), float("-inf")):
                raise SystemExit(f"record {index} ({name}): non-finite coefficient")
        a = [values[i * 2] for i in range(TERM_COUNT)]
        b = [values[i * 2 + 1] for i in range(TERM_COUNT)]
        c = values[10]
        rows.append((name, a, b, c, sum(a) + c))
    return rows


def expected_electrons(name: str) -> int | None:
    """Electron count for a species name, or None when it cannot be derived."""
    if name in SPECIAL_NEUTRAL:
        return ELEMENT_Z.get(SPECIAL_NEUTRAL[name])
    # Strip a trailing charge such as "1+", "2-", "3+".
    base = name
    charge = 0
    if len(name) >= 2 and name[-1] in "+-":
        digits = ""
        cursor = len(name) - 2
        while cursor >= 0 and name[cursor].isdigit():
            digits = name[cursor] + digits
            cursor -= 1
        value = int(digits) if digits else 1
        charge = value if name[-1] == "+" else -value
        base = name[: cursor + 1]
    z = ELEMENT_Z.get(base)
    if z is None:
        return None
    # A cation has lost electrons; an anion has gained them.
    return z - charge


def validate(rows) -> None:
    checked = 0
    worst = 0.0
    offenders: list[str] = []
    for name, _a, _b, _c, total in rows:
        expected = expected_electrons(name)
        if expected is None:
            continue
        checked += 1
        delta = abs(total - expected)
        worst = max(worst, delta)
        if delta > 0.05:
            offenders.append(f"{name}: Σa+c={total:.4f} vs {expected} (Δ{delta:.4f})")
    if offenders:
        raise SystemExit("electron-count check failed:\n  " + "\n  ".join(offenders))
    print(f"electron-count check: {checked} species, worst Δ = {worst:.4f}")


def format_number(value: float) -> str:
    """Formats a coefficient the way TS reads it back exactly."""
    return repr(round(value, 10)) if value != int(value) else f"{int(value)}.0"


def format_ts(rows) -> str:
    lines: list[str] = []
    for name, a, b, c, total in rows:
        a_text = ", ".join(format_number(v) for v in a)
        b_text = ", ".join(format_number(v) for v in b)
        expected = expected_electrons(name)
        note = f" // e⁻ = {expected}" if expected is not None else ""
        lines.append(
            f"  '{name}': {{ a: [{a_text}], b: [{b_text}], c: {format_number(c)} }},"
            f" // Σa+c = {total:.4f}{note}"
        )
    return TS_TEMPLATE.format(body="\n".join(lines), term_count=TERM_COUNT)


def main() -> None:
    default_path = Path(__file__).resolve().parent.parent.parent / "Factor.dat"
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else default_path
    if not source.exists():
        raise SystemExit(f"Factor.dat not found: {source}")
    rows = parse_species(source)
    validate(rows)
    output = Path(__file__).resolve().parent.parent / "src" / "lib" / "xrd" / "factor_data.ts"
    output.write_text(format_ts(rows), encoding="utf-8", newline="\n")
    print(f"wrote {output} ({len(rows)} species, {TERM_COUNT} Gaussian terms)")


if __name__ == "__main__":
    main()
