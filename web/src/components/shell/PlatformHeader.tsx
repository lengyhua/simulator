import { Link } from 'react-router-dom';

import { HOME_HREF } from '@/config';

import { PlatformTab } from './PlatformTab';

interface PlatformHeaderProps {
  /**
   * Optional instruction pill rendered in the header's top-right corner
   * (upstream `#top-instructions`). Omitted when no instruction is active.
   */
  instruction?: string;
}

/**
 * Platform shell header — verbatim replica of XRD_simulator.html lines 20–38
 * (simulator/static/simulator/xrd_simulator/XRD_simulator.html):
 * `#top-bar` (display:none kept) + `header.platform-header` >
 * `.platform-title-row` (logo「X」+ title link) + `nav.tab-bar` with the single
 * active tab of this module.
 *
 * The title is the "back to platform home" link: DEV navigates inside the SPA
 * (`<Link to="/">`), PROD performs a full navigation to the platform root
 * (`<a href="/">`). Both branches share the same className, so the visuals are
 * identical (plan §1.5). The branch reads `import.meta.env.DEV` inline so the
 * unused element type is tree-shaken from production builds.
 */
export function PlatformHeader({ instruction }: PlatformHeaderProps) {
  const titleLink = import.meta.env.DEV ? (
    <Link className="platform-name" to={HOME_HREF} title="返回主页">
      XRD模拟仿真辅助分析平台
    </Link>
  ) : (
    <a className="platform-name" href={HOME_HREF} title="返回主页">
      XRD模拟仿真辅助分析平台
    </a>
  );

  return (
    <>
      <div id="top-bar" style={{ display: 'none' }} />
      <header className="platform-header">
        <div className="platform-title-row">
          <div className="logo">X</div>
          {titleLink}
        </div>
        {/* 模块页只展示当前模块的 tab；后续模块上线时各自页面只保留自己的 tab */}
        <nav className="tab-bar">
          <PlatformTab label="XRD理论数据仿真" active />
        </nav>
        {instruction ? (
          <div id="top-instructions" className="top-instructions-on">
            <p id="top-instructions-txt">{instruction}</p>
          </div>
        ) : null}
      </header>
    </>
  );
}
