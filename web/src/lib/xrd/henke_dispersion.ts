/**
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
  Cr: [
    { wavelength: "CuKa1", lambda: 1.54056, fPrime: 0, fDoublePrime: 2.4165, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=8077.1 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "CuKa2", lambda: 1.54439, fPrime: 0, fDoublePrime: 2.4165, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=8077.1 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "MoKa1", lambda: 0.70930, fPrime: 0, fDoublePrime: 0.6153, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=17466.3 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "MoKa2", lambda: 0.71359, fPrime: 0, fDoublePrime: 0.6153, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=17466.3 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "CoKa1", lambda: 1.78897, fPrime: 0, fDoublePrime: 3.1008, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=6900.8 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "CoKa2", lambda: 1.79285, fPrime: 0, fDoublePrime: 3.1008, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=6900.8 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" }
  ],
  Fe: [
    { wavelength: "CuKa1", lambda: 1.54056, fPrime: 0, fDoublePrime: 3.2084, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=8048.8 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "CuKa2", lambda: 1.54439, fPrime: 0, fDoublePrime: 3.2084, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=8048.8 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "MoKa1", lambda: 0.70930, fPrime: 0, fDoublePrime: 0.8545, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=17386.1 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "MoKa2", lambda: 0.71359, fPrime: 0, fDoublePrime: 0.8545, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=17386.1 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "CoKa1", lambda: 1.78897, fPrime: 0, fDoublePrime: 0.4994, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=6966.5 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" },
    { wavelength: "CoKa2", lambda: 1.79285, fPrime: 0, fDoublePrime: 0.4994, source: "LBNL CXRO Henke (Delmotte 2018); f2 @ E=6966.5 eV; f'=0 (approximation, docs/ion-and-cr-fe-data-research.md §3.2)" }
  ],
};
