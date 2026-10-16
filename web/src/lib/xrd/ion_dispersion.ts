/**
 * Ion F'/F'' approximation table — GENERATED FILE, DO NOT EDIT.
 *
 * Formula (docs/ion-and-cr-fe-data-research.md §2.3):
 *   F'_ion  = F'_neutral(Cu Ka1)        [F' insensitive to charge, low Z]
 *   F''_ion = F''_neutral(Cu Ka1) * (N_e / Z_neutral)
 *           where N_e = Z_neutral - charge
 *
 * NO AUTHORITATIVE ION F'/F'' TABLE EXISTS.  Every entry below carries
 * `source: 'approximation'`.  Do NOT use where authoritative precision
 * is required.  Error boundary (docs §2.3, NaCl case):
 *   Na1+ f'' = 0.1127 (−8.9% vs neutral 0.1240)
 *   Cl1- f'' = 0.7444 (+6.3% vs neutral 0.7030)
 *
 * Source: FF.dat Cu Kα1 column (col 0), decoded 2026-10-16.
 * Regenerate with: python3 scripts/gen_ion_dispersion.py
 */

export interface IonDispersionEntry {
  species: string;
  charge: number;
  fPrime: number;
  fDoublePrime: number;
  source: string;
}

export const ION_DISPERSION: IonDispersionEntry[] =
[
  { species: 'Na1+', charge: +1, fPrime: 0.1360, fDoublePrime: 0.1127, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'Cl1-', charge: -1, fPrime: 0.3640, fDoublePrime: 0.7444, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'O2-', charge: -2, fPrime: 0.0500, fDoublePrime: 0.0400, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'Fe2+', charge: +2, fPrime: -1.1270, fDoublePrime: 2.9077, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'Al3+', charge: +3, fPrime: 0.2120, fDoublePrime: 0.1892, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'Si4+', charge: +4, fPrime: 0.2550, fDoublePrime: 0.2357, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'Ba2+', charge: +2, fPrime: -1.0140, fDoublePrime: 8.1636, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'Mg2+', charge: +2, fPrime: 0.1730, fDoublePrime: 0.1475, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'Ca2+', charge: +2, fPrime: 0.3660, fDoublePrime: 1.1574, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'Ti4+', charge: +4, fPrime: 0.2210, fDoublePrime: 1.4793, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'F1-', charge: -1, fPrime: 0.0730, fDoublePrime: 0.0589, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
  { species: 'K1+', charge: +1, fPrime: 0.3870, fDoublePrime: 1.0099, source: 'approximation (Cu Ka1, docs/ion-and-cr-fe-data-research.md §2.3; no authoritative ion table)' },
];
