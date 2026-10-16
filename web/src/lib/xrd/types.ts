/**
 * Shared types for the CalcXRD module (plan §3.1).
 *
 * The calculation engine is pure TypeScript: no DOM, no I/O, no global
 * mutable state. UI layers (components, store) depend on these types, never
 * the other way around.
 */

/** A 3D vector of fractional/Cartesian coordinates. */
export type Vec3 = [number, number, number];

/** One atom occupation (an element block in a .cord file). */
export interface Atom {
  /** Raw symbol as written in the file, ion valence preserved: 'Al' | 'Na1+' | 'O2-'. */
  element: string;
  /** Wyckoff letter, e.g. 'a' | 'b' | ... */
  wyckoff: string;
  /** Fractional coordinates. */
  x: number;
  y: number;
  z: number;
  /** Site occupancy, 0..1. */
  occupancy: number;
  /**
   * Per-atom thermal factor B in Å² (the .cord 7th atom field, the legacy
   * program's "B" column — GUI-verified: shipped samples all use B = 1).
   * Applied as the Debye–Waller factor exp(−B·sin²θ/λ²) in the structure
   * factor; it is per atom, NOT a global parameter.
   */
  thermalB: number;
}

/** A full crystal structure (a parsed .cord file). */
export interface Crystal {
  name: string;
  /** 'Cubic' | 'Tetragonal' | 'Orthohombic' | 'Hexagonal' | ... */
  system: string;
  /** Space group number, e.g. 225. */
  sgNumber: number;
  /** Space group symbol without number/parens, e.g. 'Fm-3m'. */
  sgSymbol: string;
  /** Lookup key into wyckoff_data.ts, e.g. '225(Fm-3m)'. */
  sgKey: string;
  /** Lattice parameters in Å. */
  a: number;
  b: number;
  c: number;
  /** Lattice angles in degrees. */
  alpha: number;
  beta: number;
  gamma: number;
  atoms: Atom[];
}

/** One discrete hkl reflection. */
export interface HKLReflection {
  h: number;
  k: number;
  l: number;
  /** Interplanar spacing in Å. */
  d: number;
  /** Bragg angle 2θ in degrees. */
  twoTheta: number;
  /** Laue-equivalent plane count (Friedel pairs included). */
  multiplicity: number;
  /** Structure factor, complex. */
  fRe: number;
  fIm: number;
  /** Raw intensity I = K·Lp·|F|²·mult. */
  intensity: number;
  /** Intensity normalized so the strongest peak is 100. */
  intensityNorm: number;
}

/** A continuous simulated pattern. */
export interface XRDPattern {
  /** Angle grid in degrees, evenly spaced by meta.step. */
  twoTheta: number[];
  /** Intensities, same length as twoTheta. */
  intensity: number[];
  /** Discrete peak table (for the hkl table / annotations). */
  reflections: HKLReflection[];
  meta: {
    /** Wavelength in Å. */
    lambda: number;
    /** Gaussian FWHM in degrees. */
    q: number;
    /** Grid step in degrees. */
    step: number;
    /** Scan range in degrees. */
    min: number;
    max: number;
  };
}

/** Calculation parameters (UI-controlled). */
export interface XrdParams {
  /** Wavelength in Å (default 1.54056, Cu Kα). */
  lambda: number;
  /** Gaussian standard deviation σ in degrees (default 0.10, GUI-verified). */
  q: number;
  /** Lorentz-polarization factor on/off. */
  useLp: boolean;
  /** Thermal factor (Debye–Waller, per-atom B) on/off. */
  useThermal: boolean;
  /** true = Gaussian broadening; false = delta stick spectrum. */
  usePeakShape: boolean;
  /**
   * F′F″ anomalous-dispersion correction on/off. Checked by default to match
   * the legacy program's default UI state. When true, the correction is
   * applied inside {@link structureFactor} via `SFOptions.useDispersion`
   * (wired in `pipeline.ts`), reading F′/F″ from the FF.dat table
   * (`ff_data.ts`). Unsupported element/λ pairs (e.g. Cr/Fe Kα) fall back to
   * a no-op with f′ = f″ = 0.
   */
  useAnomalous: boolean;
  /** Scan range in degrees. */
  rangeMin: number;
  rangeMax: number;
  step: number;
}

/** One Wyckoff position. */
export interface WyckoffSite {
  /** Position letter, e.g. 'a'. */
  letter: string;
  /** Position multiplicity. */
  mult: number;
  /** Site symmetry, e.g. 'm-3m' / '..m' / '1'. */
  symm: string;
  /** Coordinate expressions, e.g. ["(x,y,z)", "(-x,-y,-z)", ...]. */
  ops: string[];
}

/** Space group data (the value type of wyckoff_data.ts). */
export interface SpaceGroupData {
  /** Centering translations, e.g. ["(0,0,0)+", "(0,1/2,1/2)+", ...]. */
  centers: string[];
  sites: WyckoffSite[];
}
