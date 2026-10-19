import { useState } from 'react';

import { PlatformHeader } from '@/components/shell/PlatformHeader';
import { SamplePicker } from '@/components/SamplePicker';
import { CrystalInput } from '@/components/CrystalInput';
import { AtomTable } from '@/components/AtomTable';
import { SettingsPanel } from '@/components/SettingsPanel';
import { XRDChart } from '@/components/XRDChart';
import { HKLTable } from '@/components/HKLTable';
import { SingleXrdFloat } from '@/components/SingleXrdFloat';
import { WyckoffFloat } from '@/components/WyckoffFloat';
import { SearchFactorFloat } from '@/components/SearchFactorFloat';
import { useCrystalStore } from '@/store/crystal-store';

/**
 * CalcXRD module page — platform shell + module body (plan §5-T13, UI v2
 * 2026-10-16).
 *
 * Layout: left column = input flow (sample / crystal header / atom table /
 * calc settings), right column = results (powder curve + hkl table).
 * Two floating windows (single XRD table, Wyckoff-symbol table) mirror the
 * legacy program's separate top-level windows; both are triggered from the
 * chart-header action bar and close on × / backdrop click / Esc.
 */
export default function CalcXrdPage() {
  const error = useCrystalStore((state) => state.error);
  const hasPattern = useCrystalStore((state) => state.pattern !== null);
  const hasCrystal = useCrystalStore((state) => state.crystal !== null);
  const compute = useCrystalStore((state) => state.compute);
  const [singleOpen, setSingleOpen] = useState(false);
  const [wyckoffOpen, setWyckoffOpen] = useState(false);
  const [searchFactorOpen, setSearchFactorOpen] = useState(false);

  return (
    <>
      <PlatformHeader instruction="请从下拉菜单中选择样品，或上传 .cord 文件" />
      <main id="module-main">
        <div className="module-body">
          {error ? (
            <p className="error-banner" role="alert">
              {error}
            </p>
          ) : null}
          <div className="module-panel-row">
            <div className="module-column">
              <section className="module-panel">
                <p className="section-label">样品加载</p>
                <SamplePicker />
                <div className="module-action-bar">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={compute}
                    title="按当前晶体与参数计算粉末 XRD 图谱"
                  >
                    计算粉末 XRD 图谱
                  </button>
                  <span className="text-dim action-status">
                    {hasPattern ? '计算完成' : '尚未计算'}
                  </span>
                </div>
              </section>
              <CrystalInput />
              <AtomTable />
              <SettingsPanel />
            </div>
            <div className="module-column">
              <div className="float-trigger-row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSearchFactorOpen(true)}
                  title="查看元素的原子散射因子 f₀ 与色散修正（Search Factor）"
                >
                  Search Factor
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSingleOpen(true)}
                  disabled={!hasPattern}
                  title={hasPattern ? '查看 single XRD 逐反射表（可导出）' : '先计算图谱'}
                >
                  single XRD
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setWyckoffOpen(true)}
                  disabled={!hasCrystal}
                  title={hasCrystal ? '查看当前空间群的 Wyckoff 位置表' : '先加载晶体'}
                >
                  Wyckoff symbol
                </button>
              </div>
              <XRDChart />
              <HKLTable />
            </div>
          </div>
        </div>
      </main>
      <SingleXrdFloat open={singleOpen} onClose={() => setSingleOpen(false)} />
      <WyckoffFloat open={wyckoffOpen} onClose={() => setWyckoffOpen(false)} />
      <SearchFactorFloat open={searchFactorOpen} onClose={() => setSearchFactorOpen(false)} />
    </>
  );
}
