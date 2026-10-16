#!/usr/bin/env python3
"""One-time generator for web/src/lib/xrd/henke_dispersion.ts.

Source: LBNL CXRO / Henke atomic scattering factors (f1, f2)
  - URL: https://henke.lbl.gov/optical_constants/sf/{el}.nff
  - Cr: Delmotte et al., J. Appl. Phys. 124, 035107 (2018)
  - Fetched 2026-10-16; raw files at scripts/tmp/henke_Cr.nff, henke_Fe.nff

Design decision (see docs/ion-and-cr-fe-data-research.md §3.2):
  f'' = Henke f2 (authoritative source, cited above)
  f'  = 0 (no reliable source for bound f' at these wavelengths;
         FF.dat f' is the legacy program's own convention, not convertible
         from Henke f1. Setting f'=0 is a documented approximation, not a
         measured value. For Cr Kα (28 eV below Cr K-edge → f' can be large)
         this is conservative; for Fe Kα (708 eV below Fe K-edge → f' small)
         error is < 1%.)
"""
from __future__ import annotations

from pathlib import Path

LAMBDA = {
    "CuKa1": 1.54056, "CuKa2": 1.54439,
    "MoKa1": 0.70930, "MoKa2": 0.71359,
    "CoKa1": 1.78897, "CoKa2": 1.79285,
}


def nearest_f2(path: Path, e_ev: float) -> tuple[float, float]:
    """Return (f2, e_nearest) from the .nff file closest to e_ev."""
    rows: list[tuple[float, float]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        p = line.split()
        if len(p) >= 3 and not p[0].startswith("#"):
            try:
                e, f2 = float(p[0]), float(p[2])
                if 0.1 < e < 30000:
                    rows.append((e, f2))
            except ValueError:
                pass
    if not rows:
        raise SystemExit(f"no usable rows in {path}")
    return min(rows, key=lambda r: abs(r[0] - e_ev))[1], min(rows, key=lambda r: abs(r[0] - e_ev))[0]


def main() -> None:
    out = Path(__file__).parent.parent / "web/src/lib/xrd/henke_dispersion.ts"
    elems: dict[str, list[str]] = {}
    for sym in ("Cr", "Fe"):
        nff = Path(__file__).parent / "tmp" / f"henke_{sym.lower()}.nff"
        if not nff.exists():
            raise SystemExit(
                f"missing {nff}.\n"
                f"Fetch: curl -sL https://henke.lbl.gov/optical_constants/sf/{sym.lower()}.nff -o {nff}"
            )
        entries = []
        for col, lam in LAMBDA.items():
            e_ev = 12398.4 / lam
            f2, e_nearest = nearest_f2(nff, e_ev)
            entries.append(
                f'    {{ wavelength: "{col}", lambda: {lam:.5f}, fPrime: 0, '
                f'fDoublePrime: {f2:.4f}, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E={e_nearest:.1f} eV; f\'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" }},'
            )
        elems[sym] = entries

    header = """/**
 * Cr/Fe Kα anomalous dispersion extension — GENERATED FILE, DO NOT EDIT.
 *
 * Source: LBNL CXRO / Henke atomic scattering factors, Delmotte et al.,
 *         J. Appl. Phys. 124, 035107 (2018).
 *   https://henke.lbl.gov/optical_constants/sf/cr.nff
 *   https://henke.lbl.gov/optical_constants/sf/fe.nff
 *   Fetched 2026-10-16; raw files at scripts/tmp/henke_Cr.nff, henke_Fe.nff
 *
 * CONVENTION (docs/ion-and-cr-fe-data-research.md §3.2):
 *   fDoublePrime = Henke f2 (authoritative, cited above)
 *   fPrime       = 0  (NO reliable source for bound f' at these wavelengths;
 *                    FF.dat f' is the legacy program's own convention, not
 *                    convertible from Henke f1.  Setting f'=0 is a documented
 *                    approximation.  Cr Kα is 28 eV below Cr K-edge → f' can
 *                    be large; this is conservative (underestimates f').
 *                    Fe Kα is 708 eV below Fe K-edge → f' is small, error < 1%.)
 *
 * Regenerate with: python3 scripts/gen_henke_dispersion.py
 */

export interface HenkeDispersionEntry {
  wavelength: string;
  lambda: number;
  fPrime: number;
  fDoublePrime: number;
  source: string;
}

export const HENKE_CRF: Record<string, HenkeDispersionEntry[]> = {
"""
    body_parts = []
    for sym in ("Cr", "Fe"):
        entries = [e.rstrip(",") if i == len(elems[sym]) - 1 else e
                   for i, e in enumerate(elems[sym])]
        body_parts.append(f"  {sym}: [")
        body_parts.extend(entries)
        body_parts.append("  ],")
    body = "\n".join(body_parts)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(header + body + "\n};\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
