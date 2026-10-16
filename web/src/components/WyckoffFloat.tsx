import { useMemo } from 'react';

import { listSites } from '@/lib/xrd/wyckoff';
import { useCrystalStore } from '@/store/crystal-store';
import { Float } from './Float';

/**
 * "Wyckoff symbol" floating table (plan §UI-7, mirrors the legacy program's
 * Wyckoff-symbol window): every Wyckoff site of the current space group —
 * letter, multiplicity, site symmetry, and the full coordinate-operation
 * list — from the generated 254-group `wyckoff_data.ts` table.
 */
export function WyckoffFloat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const crystal = useCrystalStore((state) => state.crystal);

  const sites = useMemo(() => (crystal ? listSites(crystal.sgKey) : []), [crystal?.sgKey]);

  return (
    <Float open={open} title="Wyckoff symbol" onClose={onClose} width={640}>
      {crystal ? (
        <>
          <p className="text-dim wyckoff-meta">
            空间群 <span className="mono">{crystal.sgKey}</span>（{sites.length} 个 Wyckoff 位）
          </p>
          <div className="wyckoff-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>位</th>
                  <th>多重度</th>
                  <th>位对称</th>
                  <th>坐标表达式（完整轨道）</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.letter}>
                    <td className="mono">{site.letter}</td>
                    <td className="mono">{site.mult}</td>
                    <td className="mono">{site.symm}</td>
                    <td className="mono wyckoff-ops">{site.ops.join('  ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-dim">尚无晶体结构。</p>
      )}
    </Float>
  );
}
