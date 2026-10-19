/**
 * SearchFactorFloat — legacy "Search Factor" dialog (TFormFactor) ported
 * to the web (product decision 2026-10-19, C3: include as UI component).
 *
 * Displays for a chosen element + radiation target:
 *   - a₁..a₅ / b₁..b₅ / c coefficients (from Factor.dat)
 *   - ΔF1 (f′) / ΔF2 (f″) from FF.dat
 *   - a 2θ / s / f₀ / f₀+F′+0.5F″²/(f₀+F″) table
 *
 * The "Fo after F1 & F2" column uses the same scalar formula as the
 * calculation pipeline (byte-confirmed §8.19: denominator f₀+F″).
 */
import { useState } from 'react';

import { elementSymbols, computeSearchFactor, SearchFactorResult } from '@/lib/xrd/cronie';
import { FF_LAMBDAS } from '@/lib/xrd/ff_data';
import { Float } from './Float';

const RADIATIONS = Object.entries(FF_LAMBDAS) as Array<[string, number]>;

export function SearchFactorFloat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const speciesOptions = elementSymbols();
  const [species, setSpecies] = useState<string>(speciesOptions.find((s) => s === 'Al') ?? speciesOptions[0]);
  const [radiation, setRadiation] = useState<string>('CuKa1');
  const [rangeMin, setRangeMin] = useState(3);
  const [rangeMax, setRangeMax] = useState(100);
  const [step, setStep] = useState(0.01);
  const [result, setResult] = useState<SearchFactorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCompute = () => {
    try {
      setResult(computeSearchFactor(species, radiation, rangeMin, rangeMax, step));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    }
  };

  return (
    <Float open={open} title="Search Factor" onClose={onClose} width={720}>
      <div className="search-factor-form">
        <div className="search-factor-row">
          <label>
            元素
            <select value={species} onChange={(e) => setSpecies(e.target.value)}>
              {speciesOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            辐射靶
            <select value={radiation} onChange={(e) => setRadiation(e.target.value)}>
              {RADIATIONS.map(([label, lambda]) => (
                <option key={label} value={label}>
                  {label} ({lambda})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="search-factor-row">
          <label>
            2θ min
            <input
              type="number"
              value={rangeMin}
              onChange={(e) => setRangeMin(Number(e.target.value))}
            />
          </label>
          <label>
            2θ max
            <input
              type="number"
              value={rangeMax}
              onChange={(e) => setRangeMax(Number(e.target.value))}
            />
          </label>
          <label>
            步长
            <input
              type="number"
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={handleCompute}>
            计算
          </button>
        </div>

        {error ? (
          <p className="error-banner" role="alert">{error}</p>
        ) : null}

        {result ? (
          <>
            <p className="text-faint">
              {result.species} @ {result.radiation} λ={result.lambda} Å
              {' '}
              ΔF1={result.deltaF1.toFixed(4)} ΔF2={result.deltaF2.toFixed(4)}
            </p>
            <div className="search-factor-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>2θ (°)</th>
                    <th>s = sinθ/λ</th>
                    <th>f₀</th>
                    <th>Fo after F1 &amp; F2</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      <td className="mono">{row.twoTheta.toFixed(2)}</td>
                      <td className="mono">{row.s.toFixed(8)}</td>
                      <td className="mono">{row.f0.toFixed(9)}</td>
                      <td className="mono">{row.fEff.toFixed(9)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-dim">选择元素和辐射靶后点击计算。</p>
        )}
      </div>
    </Float>
  );
}
