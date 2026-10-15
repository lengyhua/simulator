import { useCallback, useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { downsamplePattern } from '@/lib/xrd/downsample';
import { serializeXrd } from '@/lib/xrd/xrd_file';
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

  const handleExport = useCallback(() => {
    if (!crystal || !pattern) {
      return;
    }
    const text = serializeXrd(crystal, pattern);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(crystal.name)}.xrd`;
    anchor.click();
    URL.revokeObjectURL(url);
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
          {pattern.reflections.map((reflection) => (
            <ReferenceLine
              key={`${reflection.h}-${reflection.k}-${reflection.l}`}
              x={reflection.twoTheta}
              stroke={COLORS.accent}
              strokeDasharray="4 3"
              strokeOpacity={0.55}
              label={{
                value: `(${reflection.h} ${reflection.k} ${reflection.l})`,
                position: 'insideTopRight',
                fill: COLORS.axis,
                fontSize: 10,
              }}
            />
          ))}
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
