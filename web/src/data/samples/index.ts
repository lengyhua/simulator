import AlCord from './Al.cord?raw';
import BaTiO3Cord from './BaTiO3.cord?raw';
import NaClCord from './NaCl.cord?raw';
import PoCord from './Po.cord?raw';

/** One preloaded sample crystal shipped with the module. */
export interface SampleCrystal {
  /** Stable identifier used as the picker value. */
  id: string;
  /** Human-readable label for the picker. */
  label: string;
  /** Raw .cord text (bundled via `?raw`, no runtime file dependency). */
  text: string;
}

/** Preloaded .cord samples (plan §2 / §5 T03). */
export const SAMPLE_CRYSTALS: SampleCrystal[] = [
  { id: 'al', label: 'Al（铝，Fm-3m）', text: AlCord },
  { id: 'nacl', label: 'NaCl（岩盐，Fm-3m）', text: NaClCord },
  { id: 'batio3', label: 'BaTiO3（钛酸钡，Pm-3m）', text: BaTiO3Cord },
  { id: 'po', label: 'Po（钋，Pm-3m）', text: PoCord },
];
