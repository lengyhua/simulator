import { describe, it, expect } from 'vitest';
import { HENKE_CRF } from './henke_dispersion';

describe('HENKE_CRF', () => {
  it('has Cr and Fe entries, 6 wavelengths each', () => {
    expect(HENKE_CRF.Cr).toHaveLength(6);
    expect(HENKE_CRF.Fe).toHaveLength(6);
  });

  it('fPrime is 0 for all entries (documented approximation)', () => {
    for (const entries of Object.values(HENKE_CRF)) {
      for (const e of entries) expect(e.fPrime).toBe(0);
    }
  });

  it('Cr Cu Kα1 fDoublePrime ≈ 2.4165 (LBNL Henke, Delmotte 2018)', () => {
    const e = HENKE_CRF.Cr.find((x) => x.wavelength === 'CuKa1')!;
    expect(e.fDoublePrime).toBeCloseTo(2.4165, 3);
  });

  it('every entry carries a source string citing LBNL Henke', () => {
    for (const entries of Object.values(HENKE_CRF)) {
      for (const e of entries) {
        expect(e.source).toContain('LBNL CXRO Henke');
        expect(e.source).toContain("f'=0 (approximation");
      }
    }
  });
});
