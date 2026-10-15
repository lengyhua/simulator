import { useCallback, useState } from 'react';

import { LAMBDA_TABLE } from '@/lib/xrd/constants';
import type { XrdParams } from '@/lib/xrd/types';
import { useCrystalStore } from '@/store/crystal-store';

/** Wavelength label shown in the dropdown, e.g. `Cu Kα (1.54056 Å)`. */
function lambdaLabel(key: string, value: number): string {
  return `${key} Kα (${value} Å)`;
}

/** Reverse lookup: wavelength value → table key (for the select value). */
function lambdaKeyOf(lambda: number): string {
  const entry = Object.entries(LAMBDA_TABLE).find(([, value]) => value === lambda);
  return entry ? entry[0] : '';
}

/**
 * Settings panel (plan §5-T10): the TFormCalc control set — λ dropdown, q
 * (Gaussian σ), the four checkboxes (Lp / Thermal / PeakShape usable; F′F″
 * rendered and checked like the legacy default but disabled with a phase-2
 * tooltip), and the scan range. Every change lands in the store via
 * `setParams` and immediately recomputes when a crystal is loaded (T10
 * acceptance 6); numeric fields use a draft buffer committed on blur so
 * mid-typing states never trigger a full-spectrum recompute.
 *
 * There is no global B control: the thermal factor is per atom (the atom
 * table's B column / .cord 7th field).
 */
export function SettingsPanel() {
  const params = useCrystalStore((state) => state.params);
  const hasCrystal = useCrystalStore((state) => state.crystal !== null);
  const setParams = useCrystalStore((state) => state.setParams);
  const compute = useCrystalStore((state) => state.compute);
  const [drafts, setDrafts] = useState<Partial<Record<keyof XrdParams, string>>>({});

  /** Applies a param patch and recomputes right away when possible. */
  const apply = useCallback(
    (patch: Partial<XrdParams>) => {
      setParams(patch);
      if (useCrystalStore.getState().crystal) {
        compute();
      }
    },
    [setParams, compute],
  );

  /** Numeric field: draft on change, commit on blur (parseable values only). */
  const numericField = (field: 'q' | 'rangeMin' | 'rangeMax' | 'step') => ({
    value: drafts[field] ?? String(params[field]),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setDrafts((prev) => ({ ...prev, [field]: event.target.value }));
    },
    onBlur: () => {
      const raw = drafts[field];
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      if (raw === undefined) {
        return;
      }
      const parsed = raw.trim() === '' ? Number.NaN : Number(raw);
      if (Number.isFinite(parsed)) {
        apply({ [field]: parsed } as Partial<XrdParams>);
      }
    },
  });

  return (
    <section className="module-panel">
      <p className="section-label">计算参数</p>

      <div className="field-group">
        <label htmlFor="settings-lambda">Lamda（X 射线波长）</label>
        <select
          id="settings-lambda"
          value={lambdaKeyOf(params.lambda)}
          onChange={(event) => {
            const lambda = LAMBDA_TABLE[event.target.value];
            if (lambda !== undefined) {
              apply({ lambda });
            }
          }}
        >
          {lambdaKeyOf(params.lambda) === '' ? (
            <option value="">自定义 ({params.lambda} Å)</option>
          ) : null}
          {Object.entries(LAMBDA_TABLE).map(([key, value]) => (
            <option key={key} value={key}>
              {lambdaLabel(key, value)}
            </option>
          ))}
        </select>
      </div>

      <div className="field-group">
        <label htmlFor="settings-q">q（高斯标准差 σ，°；FWHM ≈ 2.355q）</label>
        <input id="settings-q" type="number" step="any" min="0" {...numericField('q')} />
      </div>

      <div className="field-group">
        <span className="checkbox-group-label">修正与谱形</span>
        <div className="checkbox-row">
          <label className="checkbox-label" htmlFor="settings-lp">
            <input
              id="settings-lp"
              type="checkbox"
              checked={params.useLp}
              onChange={(event) => apply({ useLp: event.target.checked })}
            />
            Lp（洛伦兹-偏振因子）
          </label>
          <label className="checkbox-label" htmlFor="settings-peakshape">
            <input
              id="settings-peakshape"
              type="checkbox"
              checked={params.usePeakShape}
              onChange={(event) => apply({ usePeakShape: event.target.checked })}
            />
            PeakShape（高斯展宽；关闭为 δ 棒谱）
          </label>
          <label className="checkbox-label" htmlFor="settings-thermal">
            <input
              id="settings-thermal"
              type="checkbox"
              checked={params.useThermal}
              onChange={(event) => apply({ useThermal: event.target.checked })}
            />
            Thermal（温度因子）
          </label>
          <label className="checkbox-label checkbox-disabled" htmlFor="settings-anomalous">
            <input
              id="settings-anomalous"
              type="checkbox"
              checked={params.useAnomalous}
              disabled
              onChange={(event) => apply({ useAnomalous: event.target.checked })}
            />
            <span title="二期：Factor.dat 解码后启用异常散射修正">
              F′F″（异常散射，二期）
            </span>
          </label>
        </div>
        <p className="text-faint thermal-hint">
          温度因子 B 为逐原子参数（原子表「B (Å²)」列，默认 1）；此处 Thermal
          复选框仅控制是否应用 Debye–Waller 项。
        </p>
      </div>

      <div className="field-group">
        <span className="checkbox-group-label">扫描范围（°）</span>
        <div className="row2">
          <div>
            <label htmlFor="settings-min">起始 2θ</label>
            <input id="settings-min" type="number" step="any" {...numericField('rangeMin')} />
          </div>
          <div>
            <label htmlFor="settings-max">终止 2θ</label>
            <input id="settings-max" type="number" step="any" {...numericField('rangeMax')} />
          </div>
          <div>
            <label htmlFor="settings-step">步长</label>
            <input id="settings-step" type="number" step="any" min="0.001" {...numericField('step')} />
          </div>
        </div>
      </div>

      {!hasCrystal ? <p className="text-faint settings-hint">加载晶体后，参数变更将自动重算。</p> : null}
    </section>
  );
}
