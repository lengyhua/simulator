import { Link } from 'react-router-dom';

import instrumentImg from '@/assets/img/module-instrument.png';
import latticeImg from '@/assets/img/module-lattice.png';
import patternImg from '@/assets/img/module-pattern.png';
import { MODULE_PATH } from '@/config';

// home.css is imported here (not in main.tsx) so the stylesheet ships with the
// DEV-only home page chunk and never enters the production bundle.
import '@/styles/home.css';

/**
 * Platform home page — replica of simulator/static/home/index.html
 * (`.home-page` > `header.home-header` + `main.module-grid` 三卡 +
 * `footer.home-footer`), same CSS class names and font chain as the original.
 *
 * Deviations from the original markup (plan §1.3 item 9):
 * - Card 2 (「XRD理论数据仿真」) is now live: it renders as a `<Link>` to the
 *   module route instead of a non-interactive `<div>即将上线</div>`, and uses
 *   the existing live-card classes (`module-card--live` / `module-status--live`
 *   / `module-cta`) so its affordance matches card 1.
 * - Images are ESM imports (hashed assets) instead of `/static/...` URLs, so
 *   the page has no runtime dependency on the simulator's static directory.
 * - Card 1 keeps its original absolute link
 *   `/static/simulator/xrd_simulator/XRD_simulator.html` (valid once embedded
 *   in the platform; a 404 in standalone dev is expected, plan §8 item 6).
 */
export default function HomePage() {
  return (
    <div className="home-page">
      <header className="home-header">
        <h1 className="home-title">XRD模拟仿真辅助分析平台</h1>
        <p className="home-subtitle">XRD Simulation &amp; Assisted Analysis Platform</p>
      </header>

      <main className="module-grid">
        {/* 模块一：仪器模拟（已上线，点击进入模拟器） */}
        <a
          className="module-card module-card--live"
          href="/static/simulator/xrd_simulator/XRD_simulator.html"
        >
          <span className="module-status module-status--live">已上线</span>
          <div className="module-thumb">
            <img src={instrumentImg} alt="XRD仪器模拟测试" />
          </div>
          <div className="module-info">
            <h2 className="module-name">XRD仪器模拟测试</h2>
            <p className="module-desc">
              XRD仪器模拟测试模块完美还原了材料分析实验室的真实冷启动、样品装载及数据采集流程，具象化为直观的设备操作实践。支持设置扫描速度、起止角度、扫描步长等涉及真实实验常规测试相关设置。
            </p>
            <span className="module-cta">
              进入模拟器<span className="module-cta-arrow">&#8594;</span>
            </span>
          </div>
        </a>

        {/* 模块二：理论数据仿真（本期上线，卡片即模块入口） */}
        <Link className="module-card module-card--live" to={MODULE_PATH}>
          <span className="module-status module-status--live">已上线</span>
          <div className="module-thumb">
            <img src={patternImg} alt="XRD理论数据仿真" />
          </div>
          <div className="module-info">
            <h2 className="module-name">XRD理论数据仿真</h2>
            <p className="module-desc">
              基于晶体结构底层理论的XRD全参数仿真软件。支持将布拉格方程、原子散射、结构因子、多重性、洛伦兹极化、温度因子及干涉函数等底层因子逐项进行独立数据仿真。软件通过理想&delta;峰与高斯/洛伦兹/Voigt峰形函数的数学卷积，并叠加晶粒尺寸与微应变的物理展宽，完美合成出高逼真度的最终真实XRD连续全谱。
            </p>
            <span className="module-cta">
              进入仿真<span className="module-cta-arrow">&#8594;</span>
            </span>
          </div>
        </Link>

        {/* 模块三：辅助分析套件 */}
        <div className="module-card">
          <span className="module-status">即将上线</span>
          <div className="module-thumb">
            <img src={latticeImg} alt="XRD辅助分析套件" />
          </div>
          <div className="module-info">
            <h2 className="module-name">XRD辅助分析套件</h2>
            <p className="module-desc">
              本套件作为独立的可扩展轻量化辅助分析平台，旨在简化晶体学基础计算、直观的可视化工具，接口设计标准化，方便未来无缝对接AI模型等高级功能模块。
            </p>
            <p className="module-features-label">当前版本集成核心功能：</p>
            <ul className="module-features">
              <li>倒空间三维模拟引擎</li>
              <li>晶体几何学高精度计算工具箱</li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="home-footer">
        <span>XRD模拟仿真辅助分析平台</span>
      </footer>
    </div>
  );
}
