import { useMemo } from 'react';

import { computeSingleXRD, formatSingleXrdRow } from '@/lib/xrd/single_xrd';
import { useCrystalStore } from '@/store/crystal-store';
import { Float } from './Float';

/**
 * "single XRD" floating table (plan §UI-6, mirrors the legacy program's
 * single-XRD tab): lists EVERY (h,k,l) Laue+Friedel image with its own
 * d / 2θ / relative intensity (max = 100000), plus a `.txt` export that
 * reproduces the legacy program's on-screen readout (input block + rows).
 *
 * Intensity is `|F(own s)|²·Lp·mult`, the physically closest model to the
 * legacy values (which are not exactly reproducible by any single closed-form
 * factor — see the `docs/` open item noted in the source header).
 */
export function SingleXrdFloat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const crystal = useCrystalStore((state) => state.crystal);
  const params = useCrystalStore((state) => state.params);

  const result = useMemo(() => {
    if (!crystal) {
      return null;
    }
    try {
      return computeSingleXRD(crystal, params);
    } catch {
      return null; // same-scope error is already surfaced by the main compute path
    }
  }, [crystal, params]);

  const handleExport = () => {
    if (!result) {
      return;
    }
    const text = [result.header, '', ...result.rows.map((row) => formatSingleXrdRow(row))].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${crystal ? crystal.name : 'pattern'}_single.xrd`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Float open={open} title="single XRD" onClose={onClose} width={680}>
      {result ? (
        <>
          <pre className="single-xrd-header mono">{result.header}</pre>
          <p className="text-faint single-xrd-meta">
            {result.rows.length} 行（每个 (h,k,l) 独立一行，Laue+Friedel 全展开）
          </p>
          <div className="single-xrd-table-wrap">
            <table className="data-table single-xrd-table">
              <thead>
                <tr>
                  <th>h</th>
                  <th>k</th>
                  <th>l</th>
                  <th>d (Å)</th>
                  <th>2θ (°)</th>
                  <th>I / I₀（max=100000）</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={`${row.h},${row.k},${row.l}`}>
                    <td className="mono">{row.h}</td>
                    <td className="mono">{row.k}</td>
                    <td className="mono">{row.l}</td>
                    <td className="mono">{row.d.toFixed(4)}</td>
                    <td className="mono">{(Math.round(row.twoTheta * 100) / 100).toFixed(2)}</td>
                    <td className="mono">{Math.round(row.intensity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn" onClick={handleExport}>
            导出 single XRD (.txt)
          </button>
        </>
      ) : (
        <p className="text-dim">尚无计算结果。</p>
      )}
    </Float>
  );
}
