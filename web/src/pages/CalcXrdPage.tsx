import { PlatformHeader } from '@/components/shell/PlatformHeader';
import { SamplePicker } from '@/components/SamplePicker';
import { CrystalInput } from '@/components/CrystalInput';
import { AtomTable } from '@/components/AtomTable';
import { SettingsPanel } from '@/components/SettingsPanel';
import { XRDChart } from '@/components/XRDChart';
import { HKLTable } from '@/components/HKLTable';
import { useCrystalStore } from '@/store/crystal-store';

/**
 * CalcXRD module page — platform shell + module body (plan §5-T13).
 *
 * Final layout: left column hosts the input flow (sample loading, crystal
 * header form, atom table, calculation settings) with the primary compute
 * action; the right column hosts the results (broadened curve with hkl
 * reference lines, discrete hkl table). The store invalidates the pattern on
 * every crystal/param edit, mirroring the legacy program's explicit
 * "powder XRD" button.
 */
export default function CalcXrdPage() {
  const error = useCrystalStore((state) => state.error);
  const hasPattern = useCrystalStore((state) => state.pattern !== null);
  const compute = useCrystalStore((state) => state.compute);

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
              <XRDChart />
              <HKLTable />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
