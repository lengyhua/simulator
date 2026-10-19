import { useCallback, useMemo } from 'react';
import {
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { downloadTextFile } from '@/lib/download';
import { downsamplePattern } from '@/lib/xrd/downsample';
import { serializeXrd } from '@/lib/xrd/xrd_file';
import type { XRDPattern } from '@/lib/xrd/types';
import { useCrystalStore } from '@/store/crystal-store';

/**
 * Stroke / fill colors mirroring the tokens.css values. Recharts renders SVG
 * presentation attributes, which do not resolve CSS custom properties, so the
 * token VALUES are duplicated here (kept in sync with tokens.css by comment).
 */
const COLORS = {
  grid: '#454B6B', // --border
  axis: '#AEB6CC', // --text-dim
  accent: '#5B8DEF', // --accent
} as const;

/** Maximum SVG points rendered (plan §5-T11: ≤ 2000, peak-preserving). */
const MAX_CHART_POINTS = 2000;

/**
 * Peak-top labels for the hkl reference lines. `ReferenceLine`'s built-in
 * label positions (insideTop etc.) pin every label to the plot top, so two
 * close peaks of different height get overlapping text. Instead we render
 * each label ourselves at (2θ_hkl, that peak's own crest height − gap),
 * so two close peaks whose intensities differ land their labels at
 * different y and no longer collide.
 */
interface PeakLabel {
  /** 2θ of the reflection in degrees. */
  twoTheta: number;
  /** Label text, e.g. "2.3288 (1 1 1)". */
  text: string;
  /** Peak intensity of this reflection (anchors the label height). */
  peakIntensity: number;
}

/** Minimum gap in 2θ (degrees) between labelled peaks below which the
 *  smaller peak's label is dropped — prevents two adjacent labels from
 *  colliding horizontally when peaks of similar height sit close together. */
const LABEL_MIN_SPACING_DEG = 3;

/**
 * Filters the raw per-reflection labels down to a displayable set: skips the
 * two closest-to-the-edge reflections (their labels would clip off the plot),
 * and additionally drops a label when a previously-kept label is within
 * `LABEL_MIN_SPACING_DEG` in 2θ *and* that label is at least as tall (keeps
 * the taller of two overlapping labels).
 */
function pickVisibleLabels(labels: PeakLabel[], meta: XRDPattern['meta']): PeakLabel[] {
  const sorted = [...labels].sort((a, b) => a.twoTheta - b.twoTheta);
  const picked: PeakLabel[] = [];
  for (const label of sorted) {
    if (label.twoTheta <= meta.min + 1 || label.twoTheta >= meta.max - 1) {
      continue; // too close to the plot edges to be legible
    }
    const prev = picked[picked.length - 1];
    if (prev && label.twoTheta - prev.twoTheta < LABEL_MIN_SPACING_DEG && label.peakIntensity <= prev.peakIntensity) {
      continue; // this label is the smaller of two close peaks — skip it
    }
    picked.push(label);
  }
  return picked;
}

/**
 * Renders peak-top labels via Recharts' `Customized` component. `Customized`
 * hands us the real chart-instance props — `xAxisMap` / `yAxisMap` (each with
 * a working d3 `scale` that already encodes Recharts' actual domain AND
 * pixel range) — so we compute the label's pixel position with
 * `xAxisMap[key].scale(twoTheta)` / `yAxisMap[key].scale(peakIntensity)`
 * instead of guessing at tick domains. No need to predict Recharts' internal
 * "nice numbers" y-axis scaling.
 *
 * Each label sits at (2θ_hkl, that peak's own crest height − gap), so two
 * close peaks whose intensities differ land their labels at different y and
 * no longer collide.
 */
function PeakLabels(props: Record<string, any>) {
  const xAxisMap = props.xAxisMap;
  const yAxisMap = props.yAxisMap;
  const labels: PeakLabel[] | undefined = props.peakLabels;
  if (!xAxisMap || !yAxisMap || !labels || labels.length === 0) {
    return <g />;
  }
  const xKey = Object.keys(xAxisMap)[0];
  const yKey = Object.keys(yAxisMap)[0];
  const xScale = xAxisMap[xKey]?.scale;
  const yScale = yAxisMap[yKey]?.scale;
  if (typeof xScale !== 'function' || typeof yScale !== 'function') {
    return <g />;
  }
  const GAP_PX = 6;
  // Plot-area top in SVG y, so the tallest peak's label doesn't run off-screen.
  const yScaleRange = typeof yScale.range === 'function' ? yScale.range() : [0, 1];
  const plotTopY = Math.min(yScaleRange[0] ?? 0, yScaleRange[1] ?? 0);
  return (
    <g style={{ pointerEvents: 'none' }}>
      {labels.map((label) => {
        const xPix = xScale(label.twoTheta);
        const yPix = yScale(label.peakIntensity);
        // Clamp so the very tallest peak's label doesn't run off the top of the plot.
        const labelY = Math.max(plotTopY + 12, yPix - GAP_PX);
        return (
          <text
            key={`${label.twoTheta.toFixed(2)}-${label.text}`}
            x={xPix}
            y={labelY}
            textAnchor="middle"
            fontSize={10}
            fill={COLORS.axis}
          >
            {label.text}
          </text>
        );
      })}
    </g>
  );
}

/**
 * Finds the nearest grid point's intensity to a target 2θ within ±`windowDeg`
 * in a (twoTheta, intensity) series; -1 when no grid point is close enough.
 */
function peakIntensityNear(
  twoTheta: readonly number[],
  intensity: readonly number[],
  target: number,
  windowDeg = 0.05,
): number {
  let best = -1;
  let bestDx = Infinity;
  for (let i = 0; i < twoTheta.length; i += 1) {
    const dx = Math.abs(twoTheta[i] - target);
    if (dx <= windowDeg && dx < bestDx) {
      bestDx = dx;
      best = i;
    }
  }
  return best >= 0 ? intensity[best] : -1;
}

/** Sanitizes a file name for the Blob download (keep CJK, dots, dashes). */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\s]+/g, '_');
  return cleaned === '' ? 'pattern' : cleaned;
}

/**
 * Result curve (plan §5-T11): Recharts line chart of the broadened pattern
 * with dashed hkl reference lines, a hover tooltip, and an `.xrd` export
 * button (Blob download, legacy-compatible bytes via {@link serializeXrd}).
 *
 * The 9701-point full scan is downsampled to ≤ 2000 peak-preserving points
 * (see downsample.ts) and memoized on the pattern, so interactions stay
 * responsive; animation is disabled for the same reason.
 */
export function XRDChart() {
  const crystal = useCrystalStore((state) => state.crystal);
  const pattern = useCrystalStore((state) => state.pattern);
  const error = useCrystalStore((state) => state.error);
  const compute = useCrystalStore((state) => state.compute);

  const data = useMemo(
    () =>
      pattern
        ? downsamplePattern(pattern.twoTheta, pattern.intensity, MAX_CHART_POINTS)
        : [],
    [pattern],
  );

  // Peak-top label data: for each in-range hkl reflection, anchor the label
  // to that peak's own crest intensity (so labels at different heights don't
  // overlap even when two peaks sit close in 2θ). Uses the FULL (un-
  // downsampled) grid for the intensity lookup so the crest is exact.
  const peakLabels = useMemo(() => {
    if (!pattern) {
      return [];
    }
    const raw: PeakLabel[] = [];
    for (const reflection of pattern.reflections) {
      const peakIntensity = peakIntensityNear(
        pattern.twoTheta,
        pattern.intensity,
        reflection.twoTheta,
      );
      if (peakIntensity <= 0) {
        continue;
      }
      raw.push({
        twoTheta: reflection.twoTheta,
        text: `${reflection.d.toFixed(4)} (${reflection.h} ${reflection.k} ${reflection.l})`,
        peakIntensity,
      });
    }
    return pickVisibleLabels(raw, pattern.meta);
  }, [pattern]);

  const handleExport = useCallback(() => {
    if (!crystal || !pattern) {
      return;
    }
    downloadTextFile(`${safeFileName(crystal.name)}.xrd`, serializeXrd(crystal, pattern));
  }, [crystal, pattern]);

  const body = (() => {
    if (!pattern) {
      return (
        <div className="chart-placeholder" role="status">
          {error ? (
            <>
              <p className="text-dim">计算失败，曲线不可用。</p>
              <p className="text-faint">请根据上方错误提示调整晶体或参数后重试。</p>
            </>
          ) : (
            <>
              <p className="text-dim">尚无计算结果。</p>
              <p className="text-faint">加载晶体结构后点击「计算粉末 XRD 图谱」。</p>
            </>
          )}
        </div>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
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
            tickFormatter={(value: number) => value.toFixed(0)}
            stroke={COLORS.axis}
            tick={{ fill: COLORS.axis, fontSize: 11 }}
            width={52}
          />
          <Tooltip
            isAnimationActive={false}
            labelFormatter={(label: number) => `2θ = ${Number(label).toFixed(2)}°`}
            formatter={(value: number) => [Number(value).toFixed(2), '强度']}
            contentStyle={{
              background: '#232636', // --surface-2
              border: '1px solid #454B6B', // --border
              borderRadius: 8,
              color: '#E6E8F0', // --text
              fontSize: 12,
            }}
          />
          {peakLabels.map((label) => (
            <ReferenceLine
              key={label.text}
              x={label.twoTheta}
              stroke={COLORS.accent}
              strokeDasharray="4 3"
              strokeOpacity={0.55}
            />
          ))}
          {/* 峰顶 d/hkl 标注：用 Customized 拿到 Recharts 真实的 x/y scale，
              直接算像素坐标（不再靠 ReferenceLine 的 label 注入机制，那个
              不会把 viewBox 传给自定义 label 组件）。 */}
          <Customized
            component={(props: unknown) => (
              <PeakLabels peakLabels={peakLabels} {...(props as object)} />
            )}
          />
          <Line
            type="monotone"
            dataKey="intensity"
            stroke={COLORS.accent}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  })();

  return (
    <section className="module-panel">
      <div className="chart-head">
        <p className="section-label">粉末 XRD 图谱</p>
        <div className="chart-actions">
          {pattern && !error ? (
            <span className="text-faint chart-meta">
              {pattern.twoTheta.length} 点 · λ={pattern.meta.lambda} Å · q={pattern.meta.q}°
            </span>
          ) : null}
          <button
            type="button"
            className="btn"
            onClick={handleExport}
            disabled={!crystal || !pattern}
            title={pattern ? '导出 .xrd 文件（原程序格式）' : '计算完成后可导出'}
          >
            导出 .xrd
          </button>
          <button
            type="button"
            className="btn"
            onClick={compute}
            disabled={!crystal}
            title={crystal ? '重新计算' : '请先加载晶体'}
          >
            重新计算
          </button>
        </div>
      </div>
      {body}
    </section>
  );
}
