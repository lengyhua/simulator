import { useCallback, useState } from 'react';

import { LAMBDA_TABLE, CUSTOM_LAMBDA_PRESETS } from '@/lib/xrd/constants';
import { hasDispersion, hasDispersionExtended } from '@/lib/xrd/dispersion';
import type { XrdParams } from '@/lib/xrd/types';
import { useCrystalStore } from '@/store/crystal-store';

/** Wavelength label shown in the dropdown, e.g. `Cu Kα (1.54056 Å)`. */
function lambdaLabel(key: string, value: number): string {
  return `${key} Kα (${value} Å)`;
}

/**
 * Reverse lookup: wavelength value → dropdown option value. Standard targets
 * key by symbol (`Cu`…); the custom presets key by their preset label. Returns
 * an empty string when the value matches neither (the "自定义" fallback).
 */
function lambdaOptionValue(lambda: number): string {
  const tableEntry = Object.entries(LAMBDA_TABLE).find(([, value]) => value === lambda);
  if (tableEntry) {
    return tableEntry[0];
  }
  const preset = CUSTOM_LAMBDA_PRESETS.find((entry) => entry.value === lambda);
  return preset ? preset.label : '';
}

/** Resolves a dropdown option value back to a wavelength (or NaN). */
function lambdaOfOption(option: string): number {
  const tableValue = LAMBDA_TABLE[option];
  if (tableValue !== undefined) {
    return tableValue;
  }
  const preset = CUSTOM_LAMBDA_PRESETS.find((entry) => entry.label === option);
  return preset ? preset.value : Number.NaN;
}

/**
 * Settings panel (plan §5-T10): the TFormCalc control set — λ dropdown, q
 * (Gaussian σ), the four checkboxes (Lp / Thermal / PeakShape / F′F″), and the
 * scan range. F′F″ (anomalous dispersion) is ON by default to match the legacy
 * GUI's checked checkbox; it is greyed out for Cr/Fe Kα because FF.dat only
 * ships Cu/Mo/Co Kα dispersion data. Every change lands in the store via
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

  // F′F″ dispersion is only tabulated for Cu/Mo/Co Kα in FF.dat (fidelity mode).
  // In extended mode, Cr/Fe Kα are supported via LBNL Henke f″ (f′=0 approx);
  // the checkbox stays enabled for those targets when mode='extended'.
  const isExtended = params.dispersionMode === 'extended';
  const dispersionSupported = isExtended ? hasDispersionExtended(params.lambda) : hasDispersion(params.lambda);

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

      {/* F′F″ 色散修正仅在 FF.dat 覆盖的波长（Cu/Mo/Co Kα）可用；Cr/Fe Kα 无数据则置灰。 */}


      <div className="field-group">
        <label htmlFor="settings-lambda">Lamda（X 射线波长）</label>
        <select
          id="settings-lambda"
          value={lambdaOptionValue(params.lambda)}
          onChange={(event) => {
            const lambda = lambdaOfOption(event.target.value);
            if (Number.isFinite(lambda)) {
              apply({ lambda });
            }
          }}
        >
          {lambdaOptionValue(params.lambda) === '' ? (
            <option value="">自定义 ({params.lambda} Å)</option>
          ) : null}
          {Object.entries(LAMBDA_TABLE).map(([key, value]) => (
            <option key={key} value={key}>
              {lambdaLabel(key, value)}
            </option>
          ))}
          {CUSTOM_LAMBDA_PRESETS.map((preset) => (
            <option key={preset.label} value={preset.label}>
              {preset.label} ({preset.value} Å)
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
          <label
            className={`checkbox-label${dispersionSupported ? '' : ' checkbox-disabled'}`}
            htmlFor="settings-anomalous"
          >
            <input
              id="settings-anomalous"
              type="checkbox"
              checked={params.useAnomalous}
              disabled={!dispersionSupported}
              onChange={(event) => apply({ useAnomalous: event.target.checked })}
            />
            <span
              title={
                dispersionSupported
                  ? 'F′F″ 异常散射修正（默认开启，与 CalcXRD 一致）'
                  : 'FF.dat 仅提供 Cu/Mo/Co Kα 色散数据，Cr/Fe Kα 不适用'
              }
            >
              F′F″（异常散射）
            </span>
          </label>
        </div>

        {/* F′F″ data source: fidelity (FF.dat only) vs extended (Henke + ion approx) */}
        <div className="field-group" style={{ marginTop: '0.5rem' }}>
          <span className="checkbox-group-label">F′F″ 数据来源</span>
          <div className="checkbox-row">
            <label className="checkbox-label">
              <input
                type="radio"
                name="dispersion-mode"
                checked={params.dispersionMode === 'fidelity'}
                onChange={() => apply({ dispersionMode: 'fidelity' })}
              />
              保真（FF.dat，与 CalcXRD 一致）
            </label>
            <label
              className="checkbox-label"
              title="Cr/Fe 靶使用 LBNL Henke f″ 权威值（f′=0 近似）；离子物种使用电荷偏移近似（误差 ~6%）。结果偏离 CalcXRD 原始行为。"
            >
              <input
                type="radio"
                name="dispersion-mode"
                checked={params.dispersionMode === 'extended'}
                onChange={() => apply({ dispersionMode: 'extended' })}
              />
              增强（+Cr/Fe +离子，含近似值）
            </label>
          </div>
          {params.dispersionMode === 'extended' ? (
            <p className="text-faint" style={{ margin: '0.25rem 0 0' }}>
              ⚠ 增强模式：Cr/Fe f″ 来自 LBNL Henke（权威），f′=0（近似）；
              离子 f″ 为电荷缩放近似（±6%）。非权威数据，适合定性参考，不建议定量分析。
            </p>
          ) : null}
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
