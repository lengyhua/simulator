#!/usr/bin/env python3
"""One-time generator for web/src/lib/xrd/ion_dispersion.ts.

Formula (docs/ion-and-cr-fe-data-research.md §2.3):
  F'_ion  = F'_neutral(E)                    [F' insensitive to charge at low Z]
  F''_ion = F''_neutral(E) * (N_e / Z_neutral)
           where N_e = Z_neutral - charge  (Na1+: 11-1=10; Cl1-: 17-(-1)=18; O2-: 8-(-2)=10)

NO AUTHORITATIVE ION F'/F'' TABLE EXISTS.  Every entry is labelled
`source: 'approximation'` to make this explicit.  Do NOT use these values
where authoritative precision is required.  Error boundary (docs §2.3,
NaCl case): Na1+ f'' −8.9%, Cl1- f'' +6.3% vs neutral.

Source: FF.dat byte (Z-1)*104..+104, Cu Kα1 column only (col 0).
Fetched/decoded 2026-10-16 from D:/Projects/CalcXRD/FF.dat.
"""
from __future__ import annotations

import struct
from pathlib import Path

FF_DAT = Path(__file__).resolve().parent.parent / "FF.dat"

# (species_name, neutral_Z, charge): charge>0 cation, charge<0 anion
IONS: list[tuple[str, int, int]] = [
    ("Na1+", 11, +1),
    ("Cl1-", 17, -1),
    ("O2-", 8, -2),
    ("Fe2+", 26, +2),
    ("Al3+", 13, +3),
    ("Si4+", 14, +4),
    ("Ba2+", 56, +2),
    ("Mg2+", 12, +2),
    ("Ca2+", 20, +2),
    ("Ti4+", 22, +4),
    ("F1-", 9, -1),
    ("K1+", 19, +1),
]


def neutral_ff_cu_ka1(z: int) -> tuple[float, float]:
    """(f', f'') at Cu Kα1 for neutral element Z from FF.dat."""
    data = FF_DAT.read_bytes()
    off = (z - 1) * 104
    v = struct.unpack("<12d", data[off + 8 : off + 104])
    return v[0], v[1]


def main() -> None:
    out = Path(__file__).parent.parent / "web/src/lib/xrd/ion_dispersion.ts"
    out.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "/**",
        " * Ion F'/F'' approximation table — GENERATED FILE, DO NOT EDIT.",
        " *",
        " * Formula (docs/ion-and-cr-fe-data-research.md §2.3):",
        " *   F'_ion  = F'_neutral(Cu Ka1)        [F' insensitive to charge, low Z]",
        " *   F''_ion = F''_neutral(Cu Ka1) * (N_e / Z_neutral)",
        " *           where N_e = Z_neutral - charge",
        " *",
        " * NO AUTHORITATIVE ION F'/F'' TABLE EXISTS.  Every entry below carries",
        " * `source: 'approximation'`.  Do NOT use where authoritative precision",
        " * is required.  Error boundary (docs §2.3, NaCl case):",
        " *   Na1+ f'' = 0.1127 (−8.9% vs neutral 0.1240)",
        " *   Cl1- f'' = 0.7444 (+6.3% vs neutral 0.7030)",
        " *",
        " * Source: FF.dat Cu Kα1 column (col 0), decoded 2026-10-16.",
        " * Regenerate with: python3 scripts/gen_ion_dispersion.py",
        " */",
        "",
        "export interface IonDispersionEntry {",
        "  species: string;",
        "  charge: number;",
        "  fPrime: number;",
        "  fDoublePrime: number;",
        "  source: string;",
        "}",
        "",
        "export const ION_DISPERSION: IonDispersionEntry[] =",
        "[",
    ]

    entries = []
    for name, z, chg in IONS:
        fp, fpp = neutral_ff_cu_ka1(z)
        n_e = z - chg  # Na1+: 11-1=10; Cl1-: 17-(-1)=18; O2-: 8-(-2)=10
        fpp_ion = fpp * (n_e / z)
        entries.append(
            f"  {{ species: '{name}', charge: {chg:+d}, fPrime: {fp:.4f}, "
            f"fDoublePrime: {fpp_ion:.4f}, "
            f"source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' }},"
        )

    out.write_text("\n".join(lines + entries) + "\n];\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
