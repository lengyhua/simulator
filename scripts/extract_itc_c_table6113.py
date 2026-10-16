#!/usr/bin/env python3
"""
Build ITC Vol C Table 6.1.1.3 (mean atomic scattering factors for
chemically significant ions) from the authoritative machine-readable
source: Gemmi `it92.hpp` — 4-Gaussian + c (Cromer–Mann) coefficients,
the same ITC-1992 upstream used by CCP4/cctbx and ITC Vol C
Tables 6.1.1.1–6.1.1.4.

Output values are sampled on the printed s = sinθ/λ grid of
Table 6.1.1.3 (66 rows: 0.00–0.20 step 0.01; 0.22–0.50 step 0.02;
0.55–2.00 step 0.05).

Why this source instead of the scanned PDF text layer
------------------------------------------------------
references/dokumen.pub_...9781402019005.pdf is a scan whose text layer
is a linearised 2-D table.  A first-pass text extraction
(scripts/extract_itc_c_table6113.py v1, results preserved in
docs/itc-c-table6113-pdf-samples.json) produced 49 monotonicity
violations from two defects:
  (a) glued columns ("6.9248.3748.751" = 6.924/8.374/8.751);
  (b) s-row interleaving near the page bottom (s ≳ 1.50).
Both are extraction artifacts, not physics, so the PDF layer cannot be
trusted as a value source without per-cell adjudication.  The Gemmi
coefficients are authoritative (they ARE the ITC-1992 table, same
upstream as the book's Table 6.1.1.4) and evaluation is exact.

Note on edition:
  Gemmi/ITC-1992 coefficients are used for *all* species.  The shipped
  4th ed. (2006) book refits a few entries (H via Thakkar-Smith SDS,
  heavy ions via modified Dirac–Slater; see Table 6.1.1.3 methods
  column).  Where the book's refit differs from ITC-1992, the value
  here follows ITC-1992.  This is documented per-species in the
  validation record (docs/itc-c-table6113-extraction.md §3).

IUCr online tables (www.iucr.org / monogram.web.iucr.org) are
Cloudflare-gated from this network (HTTP 403 "Just a moment"), so they
could not be used directly; Gemmi is the canonical open mirror.

Outputs
-------
  docs/itc-c-table6113.json    — full species × 66-s sampled table
  docs/itc-c-table6113-extraction.md — provenance + validation
"""

import argparse
import csv
import io
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "references" / "gemmi-it92.hpp"
OUT = ROOT / "docs" / "itc-c-table6113.json"
CSV_OUT = ROOT / "docs" / "data" / "itc-c-table6113.csv"

# s-grid exactly as printed in ITC Vol C Table 6.1.1.3
S_GRID = (
    [round(0.01 * i, 2) for i in range(0, 21)]           # 0.00 .. 0.20 step 0.01
    + [round(0.22 + 0.02 * i, 2) for i in range(0, 15)]  # 0.22 .. 0.50 step 0.02
    + [round(0.55 + 0.05 * i, 2) for i in range(0, 29)]  # 0.55 .. 1.90 step 0.05
    + [2.0]
)
assert S_GRID[0] == 0.0 and S_GRID[-1] == 2.0 and len(S_GRID) == 66

# Table 6.1.1.3 species list, in printed order (see
# docs/itc-c-table6113-extraction.md §1 for mapping notes)
SPECIES_6113 = [
    "H1", "Li1", "Be2", "Cval", "O1", "F1", "Na1", "Mg2", "Al3", "Sival",
    "Si4", "Cl1", "K1", "Ca2", "Sc3", "Ti2", "Ti3", "Ti4", "V2", "V3",
    "V5", "Cr2", "Cr3", "Mn2", "Mn3", "Mn4", "Fe2", "Fe3", "Co2", "Co3",
    "Ni2", "Ni3", "Cu1", "Cu2", "Zn2", "Ga3", "Ge4", "Br1", "Rb1", "Sr2",
    "Y3", "Zr4", "Nb3", "Nb5", "Mo3", "Mo5", "Mo6", "Ru3", "Ru4", "Rh3",
    "Rh4", "Pd2", "Pd4", "Ag1", "Ag2", "Cd2", "In3", "Sn2", "Sn4", "Sb3",
    "Sb5", "I1", "Cs1", "Ba2", "La3", "Ce3", "Ce4", "Pr3", "Pr4", "Nd3",
    "Pm3", "Sm3", "Eu2", "Eu3", "Gd3", "Tb3", "Dy3", "Ho3", "Er3", "Tm3",
    "Yb2", "Yb3", "Lu3", "Hf4", "Ta5", "W6", "Os4", "Ir3", "Ir4", "Pt2",
    "Pt4", "Au1", "Au3", "Hg1", "Hg2", "Tl1", "Tl3", "Pb2", "Pb4", "Bi3",
    "Bi5", "Ra2", "Ac3", "Th4", "U3", "U4", "U6", "Np3", "Np4", "Np6",
    "Pu3", "Pu4", "Pu6",
]


def _charge_sign_from_label(label: str) -> int:
    """ITC 6.1.1.3 label convention: trailing digits are the *magnitude*
    of the charge; sign is inferred from the electron count (see
    extraction doc §1).  We don't need it here because we map to Gemmi
    by symbol + ion_list; this helper is only for sanity checks."""
    m = re.search(r"(\d+)$", label)
    return int(m.group(1)) if m else 0


def parse_gemmi(text: str):
    """
    Parse Gemmi it92.hpp.

    Returns (neutral, ions):
      neutral: {ElSym: [a1,a2,a3,a4,b1,b2,b3,b4,c]}   (9 values)
      ions:    list of (ElSym, charge, [a1..a4,b1..b4,c])
               in ion_list order

    The data array is one contiguous brace-block: first 99 neutral
    entries (index 0 = X, 1..92 = H..U), then 112 ion entries, each
    preceded by a `// <sym><n><+/->` comment (O2-/Tl3+ have no space
    between charge digits and sign).
    """
    # Extract the neutral + ion data block
    m_start = re.search(
        r"Coef\s+IT92<Real>::data\[\d+\+\d+\]\s*=\s*\{", text)
    if m_start is None:
        raise ValueError("data array not found in it92.hpp")
    m_end = text.find(";", m_start.end())
    block = text[m_start.end():m_end]

    # Each entry: {v1, ..., v9}, // comment
    # The neutral section ends right before the standalone comment line
    # "// Atoms with charge, ...".  Find that marker line in the raw
    # block and split the entry list at it.
    # Locate the marker's position relative to the entries by finding which
    # entry's comment first contains "Atoms with charge" or is preceded by
    # it.  Simpler: split the block text at the marker and re-parse.
    marker_pos = block.find("// Atoms with charge")
    if marker_pos < 0:
        marker_pos = 0
        print("  WARN: 'Atoms with charge' marker not found; using all entries")
    neutral_block = block[:marker_pos]
    ion_block = block[marker_pos:] if marker_pos >= 0 else ""

    def _parse_entries(sub_block):
        out = []
        for m in re.finditer(
                r"\{\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,"
                r"\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,"
                r"\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*\}"
                r"\s*,?\s*(?://\s*([^\n]+))?",
                sub_block):
            vals = [float(m.group(i)) for i in range(1, 10)]
            comment = (m.group(10) or "").strip()
            out.append((comment, vals))
        return out

    neutral_entries = _parse_entries(neutral_block)
    ion_entries = _parse_entries(ion_block)
    print(f"Parsed {len(neutral_entries)} neutral + {len(ion_entries)} ion entries")

    neutral = {}
    for comment, vals in neutral_entries:
        sym = comment.split()[-1].split("=")[-1].strip() if comment else ""
        if sym in ("", "X", "X="):
            continue
        neutral[sym] = vals

    ion_map = {}
    for comment, vals in ion_entries:
        tok = comment.split()[-1] if comment else ""
        m = re.fullmatch(r"([A-Za-z]+)(\d*)([+-])?", tok)
        if m is None or not m.group(2):
            continue
        sym, mag, sign = m.group(1), m.group(2), m.group(3)
        charge = int(mag) * (1 if sign == "+" else -1)
        ion_map[(sym, charge)] = vals
    print(f"ion_map size: {len(ion_map)}")
    return neutral, ion_map


def build_csv(species_out):
    """Emit the committed CSV layout: one row per species,
    symbol,gemmi_symbol,charge,electron_count, then s_0.00..s_2.00.
    Values use str(round(v,4)) — 4 decimals, trailing zeros dropped
    (matches docs/data/itc-c-table6113.csv byte-for-byte; line endings
    are \\n, matching the committed file)."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    header = ["symbol", "gemmi_symbol", "charge", "electron_count"]
    header += [f"s_{s:.2f}" for s in S_GRID]
    w.writerow(header)
    for r in species_out:
        row = [r["symbol"], r["gemmi_symbol"], r["charge"],
               r["electron_count"]]
        row += [str(round(r["s_values"][f"{s:.2f}"], 4)) for s in S_GRID]
        w.writerow(row)
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser(
        description="Build ITC Vol C Table 6.1.1.3 from Gemmi it92.hpp")
    ap.add_argument("--csv", action="store_true",
                    help=f"also export {CSV_OUT.relative_to(ROOT)}")
    ap.add_argument("--csv-out", type=Path, default=CSV_OUT,
                    help="CSV output path (default: docs/data/itc-c-table6113.csv)")
    args = ap.parse_args()
    run(csv_out=args.csv_out if args.csv else None)


def run(csv_out: "Path | None" = None):
    text = io.open(SRC, encoding="utf-8").read()
    neutral, ion_map = parse_gemmi(text)

    print(f"neutral species: {len(neutral)}, ion_map: {len(ion_map)}")

    # Map ITC 6.1.1.3 labels -> (sym, charge)
    # Sign convention in ITC labels: e_count = f(0) = Σa+c;
    # charge = Z - e_count (verified per-label in extraction doc §1).
    # Gemmi normalizes each coefficient set so f(0) = electron count.
    label_map = {}
    for lab in SPECIES_6113:
        if lab == "Cval":
            label_map[lab] = ("C", 0, "valence variant Cval; Gemmi has "
                              "no Cval entry — use neutral C (documented)")
            continue
        if lab == "Sival":
            label_map[lab] = ("Si", 0, "valence variant Sival; Gemmi has "
                               "no Sival entry — use neutral Si (documented)")
            continue
        m = re.fullmatch(r"([A-Za-z]+)(\d*)([+-])?", lab)
        if m is None:
            print(f"  SKIP {lab}: label not parseable")
            continue
        sym, mag_str = m.group(1), m.group(2)
        mag = int(mag_str) if mag_str else 0
        if mag == 0:
            charge = 0
        else:
            # Determine sign: electron count = Z - charge.  Gemmi's ion_map
            # holds both signs for some elements; pick the one whose f(0)
            # matches ITC's printed electron count.
            zcand = neutral.get(sym)
            z = round(sum(zcand[:4]) + zcand[8]) if zcand else None
            pos = ion_map.get((sym, mag))
            neg = ion_map.get((sym, -mag))
            if pos and not neg:
                charge, note = mag, ""
            elif neg and not pos:
                charge, note = -mag, ""
            elif pos and neg:
                ep = round(sum(pos[:4]) + pos[8])
                en = round(sum(neg[:4]) + neg[8])
                # electron count for +mag = Z - mag; for -mag = Z + mag
                if z is not None and abs(ep - (z - mag)) <= abs(en - (z + mag)):
                    charge, note = mag, ""
                else:
                    charge, note = -mag, ""
            else:
                charge = mag
                note = (f"WARN: {lab} not in Gemmi ion_map "
                        f"(have ({sym},+{mag})={pos is not None}, "
                        f"({sym},-{mag})={neg is not None})")
                print("  " + note)
                label_map[lab] = (sym, charge, note)
                continue
        label_map[lab] = (sym, charge, "")

    # Sample each species on S_GRID
    species_out = []
    pdf_samples_file = ROOT / "docs" / "itc-c-table6113-pdf-samples.json"
    pdf_samples = None
    if pdf_samples_file.exists():
        pdf_samples = json.load(io.open(pdf_samples_file, encoding="utf-8"))

    for lab in SPECIES_6113:
        sym, charge, note = label_map[lab]
        vals = ion_map.get((sym, charge)) if charge != 0 else neutral.get(sym)
        if vals is None:
            print(f"  SKIP {lab}: no coefficients for ({sym}, {charge:+d}) "
                  f"note={note}")
            continue
        a, b, c = vals[:4], vals[4:8], vals[8]
        e0 = round(sum(a) + c, 4)
        s_values = {}
        for s in S_GRID:
            v = c + sum(ai * math.exp(-bi * s * s) for ai, bi in zip(a, b))
            s_values[f"{s:.2f}"] = round(v, 4)
        # High-s tail check: for negative-c coefficient sets (Sc3+, Ti4+
        # and other strongly-bound closed-shell ions) the 4-Gaussian+c
        # approximation is *not* monotone over its full validity range
        # (Table 6.1.1.4's own "Max error" column notes non-zero
        # deviation up to s=2.0 for these species — the +c constant
        # exceeds the tail of the Gaussian sum).  Flag it in the record
        # instead of hiding it; values themselves are exact evaluations
        # of the published coefficients.
        mono_tail_violation = None
        for i in range(len(S_GRID) - 1):
            ka = f"{S_GRID[i]:.2f}"
            kb = f"{S_GRID[i + 1]:.2f}"
            if s_values[kb] > s_values[ka] + 1e-9:
                mono_tail_violation = f"non-monotone between s={ka} and s={kb}"
                break
        rec = {
            "symbol": lab,
            "gemmi_symbol": sym,
            "charge": charge,
            "electron_count": e0,
            "coefficients": {
                "a1": a[0], "a2": a[1], "a3": a[2], "a4": a[3],
                "b1": b[0], "b2": b[1], "b3": b[2], "b4": b[3],
                "c": c,
            },
            "s_values": s_values,
            "n_s": len(S_GRID),
            "note": note,
        }
        # Cross-check vs PDF text samples if available
        if pdf_samples and lab in pdf_samples:
            ps = pdf_samples[lab]
            diffs = []
            for s in (0.00, 0.05, 0.10, 0.20, 0.50, 1.00, 1.50, 2.00):
                key = f"{s:.2f}"
                pv = ps.get(key)
                if pv is None:
                    continue
                dv = abs(s_values[key] - pv)
                if dv > 0.02:
                    diffs.append(f"{key}: pdf={pv} vs {s_values[key]:.4f} "
                                 f"(Δ={dv:.4f})")
            if diffs:
                rec["pdf_crosscheck"] = diffs
        if mono_tail_violation:
            rec["tail_note"] = (mono_tail_violation +
                                " — 4-Gaussian+c approximation artifact; "
                                "exact evaluation of published coefficients")
        species_out.append(rec)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "table": "ITC Vol C Table 6.1.1.3 (ions f0), values sampled from "
                 "Gemmi it92.hpp (ITC-1992 4-Gaussian+c coefficients)",
        "title": "Mean atomic scattering factors in electrons for "
                 "chemically significant ions",
        "provenance": {
            "coefficient_source": "Gemmi it92.hpp (https://github.com/"
                                  "project-gemmi/gemmi/blob/master/"
                                  "include/gemmi/it92.hpp) — ITC-1992 "
                                  "Cromer-Mann coefficients, same upstream "
                                  "as ITC Vol C Table 6.1.1.4 / CCP4 / "
                                  "cctbx it1992",
            "s_grid": "printed Table 6.1.1.3 grid, 66 rows",
            "note_Cval_Sival": "Gemmi has no valence variants; neutral "
                               "C/Si coefficients substituted "
                               "(documented, low-impact: used only for "
                               "covalent-bonding refinements)",
            "edition_difference": "shipped book is 4th ed. (2006) with "
                                  "refits for H (Thakkar-Smith SDS) and "
                                  "heavy ions (*DS modified Dirac-Slater); "
                                  "values here are the ITC-1992 upstream "
                                  "that all major open-source tools use. "
                                  "Differences vs the 2006 book for those "
                                  "refit species are small but real; see "
                                  "docs/itc-c-table6113-extraction.md §3.",
        },
        "s_grid": S_GRID,
        "n_species": len(species_out),
        "species": species_out,
    }
    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Wrote {OUT}  ({len(species_out)} species)")

    if csv_out is not None:
        csv_out.parent.mkdir(parents=True, exist_ok=True)
        csv_out.write_text(build_csv(species_out), encoding="utf-8")
        print(f"Wrote {csv_out}  ({len(species_out)} rows)")

    # Monotonicity self-check
    viol = 0
    for r in species_out:
        sv = r["s_values"]
        for i in range(len(S_GRID) - 1):
            a = sv[f"{S_GRID[i]:.2f}"]
            b = sv[f"{S_GRID[i+1]:.2f}"]
            if b > a + 1e-9:
                viol += 1
                if viol < 8:
                    print(f"  MONO {r['symbol']} {S_GRID[i]:.2f} {a} -> "
                          f"{S_GRID[i+1]:.2f} {b}")
    print(f"monotonicity violations: {viol}")

    # Cross-check summary vs PDF samples
    flagged = [r["symbol"] for r in species_out
               if "pdf_crosscheck" in r]
    print(f"pdf_crosscheck flags: {len(flagged)}  {flagged[:10]}")
    for r in species_out:
        if "pdf_crosscheck" in r:
            print(f"  {r['symbol']}: {'; '.join(r['pdf_crosscheck'])}")


if __name__ == "__main__":
    main()
