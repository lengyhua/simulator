import { describe, it, expect } from 'vitest';
import { ION_DISPERSION } from './ion_dispersion';

describe('ION_DISPERSION', () => {
  it('every entry is marked source=approximation', () => {
    for (const e of ION_DISPERSION) expect(e.source).toContain('approximation');
  });

  it('Na1+ fDoublePrime ≈ 0.1127 (0.1240 × 10/11)', () => {
    const e = ION_DISPERSION.find((x) => x.species === 'Na1+')!;
    expect(e.fDoublePrime).toBeCloseTo(0.1127, 3);
  });

  it('Cl1- fDoublePrime ≈ 0.7444 (0.7030 × 18/17)', () => {
    const e = ION_DISPERSION.find((x) => x.species === 'Cl1-')!;
    expect(e.fDoublePrime).toBeCloseTo(0.7444, 3);
  });

  it('fPrime equals neutral Cu Kα1 value (documented assumption)', () => {
    // Na1+ fPrime should equal FF.dat neutral Na CuKa1 fPrime = +0.1360
    const e = ION_DISPERSION.find((x) => x.species === 'Na1+')!;
    expect(e.fPrime).toBeCloseTo(0.136, 3);
  });

  it('all entries have non-zero charge', () => {
    for (const e of ION_DISPERSION) expect(e.charge).not.toBe(0);
  });
});
