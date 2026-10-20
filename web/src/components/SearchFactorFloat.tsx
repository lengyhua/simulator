/**
 * SearchFactorFloat — legacy "Search Factor and F',F''" dialog (TFormFactor)
 * ported to the web (product decision 2026-10-19, C3: include as UI component).
 *
 * Layout follows the measured legacy dialog (docs/params-f0.md §1.1):
 *   - element picker = the full Factor.dat species table (199 entries, ions
 *     included), the same list the legacy element box offers;
 *   - a 7-column × 2-row coefficient grid: row 1 = a₁..a₅ + c + ΔF1,
 *     row 2 = b₁..b₅ + ΔF2 (column j holds the (aⱼ bⱼ) pair, as in the
 *     legacy "(aᵢ bᵢ)" stacked header);
 *   - **an f₀(2θ) curve** with the legacy's `Max Fo` / `Max Fo (F1 F2)`
 *     readouts (0x475bf4 draws the same curve in the original program);
 *   - a 2θ / s / f₀ / f₀+F′+0.5F″²/(f₀+F″) table, plus a `.txt` export that
 *     reproduces the legacy report layout (docs/archive/ref-data/factors/*.rtf).
 *
 * The "Fo after F1 & F2" series uses the same scalar formula as the
 * calculation pipeline (byte-confirmed §8.19: denominator f₀+F″).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { downloadTextFile } from '@/lib/download';
import {
  computeSearchFactor,
  elementSymbols,
  formatSearchFactorReport,
  searchFactorMaxima,
  type SearchFactorResult,
} from '@/lib/xrd/cronie';
import { FF_LAMBDAS } from '@/lib/xrd/ff_data';
import { Float } from './Float';

/**
 * Radiation list = the six FF.dat dispersion columns (Cu/Mo/Co × Kα₁/Kα₂),
 * i.e. the tabulated wavelengths that actually have f′/f″ data.
 *
 * NOTE (2026-10-20): the legacy Search Factor dialog shared the main window's
 * 6-item λ dropdown instead — CuKa1 1.54056 / CuKa 1.54178 / FeKa1 1.93604 /
 * FeKa 1.93736 / MoKa1 0.71930 / MoKa 0.71073 — and FUN_0047907c mapped those
 * ItemIndexes onto the very same six FF.dat columns by a hard-coded switch
 * (case 0→CuKa1, 1→CuKa2, 2→CoKa1, 3→CoKa2, 4→MoKa1, 5→MoKa2). So the two
 * lists cover identical data but differ in labels and in the λ printed:
 * legacy shows weighted means and a mistyped Mo Kα1 (0.71930, defect #11),
 * while we show the true column wavelengths. Only CuKa1 1.54056 coincides.
 */
const RADIATIONS = Object.entries(FF_LAMBDAS) as Array<[string, number]>;

/** Upper bound on SVG points per curve (the 2θ grid can hold ~9701 rows). */
const MAX_CHART_POINTS = 1200;
/** Rows rendered on screen; the export always carries the full grid. */
const MAX_TABLE_ROWS = 300;

/** Stroke / axis colors duplicating tokens.css values (Recharts needs
 *  literal colors — SVG presentation attributes do not resolve CSS vars). */
const COLORS = {
  grid: '#454B6B', // --border
  axis: '#AEB6CC', // --text-dim
  f0: '#5B8DEF', // --accent
  fEff: '#FBBF24', // --warn
} as const;

/** One chart row: 2θ plus the two curves drawn at that angle. */
interface CurvePoint {
  twoTheta: number;
  f0: number;
  fEff: number;
}

/** Legacy coefficient-grid header: column j carries the (aⱼ bⱼ) pair. */
const COEF_HEADERS = ['a1 / b1', 'a2 / b2', 'a3 / b3', 'a4 / b4', 'a5 / b5', 'c', 'ΔF1 / ΔF2'];

export function SearchFactorFloat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const speciesOptions = useMemo(() => elementSymbols(), []);
  const [species, setSpecies] = useState<string>(
    () => speciesOptions.find((symbol) => symbol === 'Al') ?? speciesOptions[0],
  );
  const [radiation, setRadiation] = useState<string>('CuKa1');
  const [rangeMin, setRangeMin] = useState(3);
  const [rangeMax, setRangeMax] = useState(100);
  const [step, setStep] = useState(0.01);
  const [result, setResult] = useState<SearchFactorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCompute = useCallback(() => {
    try {
      setResult(computeSearchFactor(species, radiation, rangeMin, rangeMax, step));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    }
  }, [species, radiation, rangeMin, rangeMax, step]);

  // The legacy TFormFactor draws its curve as soon as the dialog opens, so the
  // first open computes with the defaults rather than showing an empty pane.
  const autoComputed = useRef(false);
  useEffect(() => {
    if (!open || autoComputed.current) {
      return;
    }
    autoComputed.current = true;
    runCompute();
  }, [open, runCompute]);

  const maxima = useMemo(() => (result ? searchFactorMaxima(result) : null), [result]);

  const chartData = useMemo<CurvePoint[]>(() => {
    if (!result) {
      return [];
    }
    const rows = result.rows;
    if (rows.length <= MAX_CHART_POINTS) {
      return rows.map((row) => ({ twoTheta: row.twoTheta, f0: row.f0, fEff: row.fEff }));
    }
    // f₀(s) decreases monotonically with 2θ (and so does f_eff), so unlike a
    // powder pattern there is no narrow peak a stride could clip. Striding
    // also samples both series from the SAME row, keeping the curves aligned.
    const stride = Math.ceil(rows.length / MAX_CHART_POINTS);
    const points: CurvePoint[] = [];
    for (let i = 0; i < rows.length; i += stride) {
      const row = rows[i];
      points.push({ twoTheta: row.twoTheta, f0: row.f0, fEff: row.fEff });
    }
    const last = rows[rows.length - 1];
    if (points.length === 0 || points[points.length - 1].twoTheta !== last.twoTheta) {
      points.push({ twoTheta: last.twoTheta, f0: last.f0, fEff: last.fEff });
    }
    return points;
  }, [result]);

  const handleExport = useCallback(() => {
    if (!result || !maxima) {
      return;
    }
    downloadTextFile(
      `${result.species}_${result.radiation}_factor.txt`,
      formatSearchFactorReport(result),
    );
  }, [result, maxima]);

  const visibleRows = result ? result.rows.slice(0, MAX_TABLE_ROWS) : [];

  return (
    <Float open={open} title="Search Factor" onClose={onClose} width={900}>
      <div className="search-factor-form">
        <div className="search-factor-row">
          <label>
            元素
            <select value={species} onChange={(e) => setSpecies(e.target.value)}>
              {speciesOptions.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label>
            辐射靶
            <select
              value={radiation}
              onChange={(e) => setRadiation(e.target.value)}
              title="按 FF.dat 的 6 个色散列展示（Cu/Mo/Co × Kα₁/Kα₂）。原程序下拉用的是主窗口 λ 列表（含 CuKa/FeKa/MoKa 加权项与笔误值 MoKa1 0.71930），经 ItemIndex 硬编码映射到同一批列，故数量相同而标签/波长不同。"
            >
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
          <button type="button" className="btn btn-primary" onClick={runCompute}>
            计算
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleExport}
            disabled={!result}
            title={result ? '导出报表（原程序文本格式）' : '计算完成后可导出'}
          >
            导出 (.txt)
          </button>
        </div>

        {error ? (
          <p className="error-banner" role="alert">
            {error}
          </p>
        ) : null}

        {result && maxima ? (
          <>
            <p className="text-faint search-factor-summary">
              {result.species} @ {result.radiation} λ={result.lambda} Å ·{' '}
              Max Fo = {maxima.maxFo.toFixed(6)} · Max Fo (F1 F2) = {maxima.maxFoEff.toFixed(6)}
            </p>

            <div className="coef-table-wrap">
              <table className="data-table coef-table">
                <thead>
                  <tr>
                    {COEF_HEADERS.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {result.a.map((value, i) => (
                      <td key={`a${i}`} className="mono">
                        {value}
                      </td>
                    ))}
                    <td className="mono">{result.c}</td>
                    <td className="mono">{result.deltaF1}</td>
                  </tr>
                  <tr>
                    {result.b.map((value, i) => (
                      <td key={`b${i}`} className="mono">
                        {value}
                      </td>
                    ))}
                    <td className="mono text-faint">—</td>
                    <td className="mono">{result.deltaF2}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="search-factor-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="twoTheta"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(value: number) => value.toFixed(0)}
                    stroke={COLORS.axis}
                    tick={{ fill: COLORS.axis, fontSize: 11 }}
                    label={{
                      value: '2θ (°)',
                      position: 'insideBottom',
                      offset: -16,
                      fill: COLORS.axis,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    tickFormatter={(value: number) => value.toFixed(1)}
                    stroke={COLORS.axis}
                    tick={{ fill: COLORS.axis, fontSize: 11 }}
                    width={52}
                  />
                  <Tooltip
                    isAnimationActive={false}
                    labelFormatter={(label: number) => `2θ = ${Number(label).toFixed(2)}°`}
                    formatter={(value: number, name: string) => [Number(value).toFixed(6), name]}
                    contentStyle={{
                      background: '#232636', // --surface-2
                      border: '1px solid #454B6B', // --border
                      borderRadius: 8,
                      color: '#E6E8F0', // --text
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    wrapperStyle={{ fontSize: 12, color: COLORS.axis, paddingBottom: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="f0"
                    name="f₀"
                    stroke={COLORS.f0}
                    strokeWidth={1.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="fEff"
                    name="Fo after F1 & F2"
                    stroke={COLORS.fEff}
                    strokeWidth={1.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <p className="text-faint search-factor-meta">
              共 {result.rows.length} 行 · 曲线取 {chartData.length} 点 · 下表显示前{' '}
              {visibleRows.length} 行（导出含全部）
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
                  {visibleRows.map((row, i) => (
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
