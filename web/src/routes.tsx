import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { MODULE_PATH } from '@/config';

const CalcXrdPage = lazy(() => import('@/pages/CalcXrdPage'));

const prodRoutes = (
  <Routes>
    <Route path="/" element={<CalcXrdPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

/**
 * Environment-conditional route tree consumed by `App` (plan §1.5).
 *
 * - DEV: `/` renders the replicated platform home, `/module` renders the
 *   module page.
 * - PROD: the platform home is served by the host application, so `/` renders
 *   the module directly and any other path redirects to `/`.
 *
 * Everything DEV-only lives inside the `if (import.meta.env.DEV)` block:
 * Vite replaces `import.meta.env.DEV` with a literal at build time and rollup
 * then drops the dead statement block — including the `lazy()` call and its
 * dynamic import — so the home page and its stylesheet never enter production
 * bundles. (A top-level `lazy()` call would survive as a side-effectful
 * statement even when its binding is unused.) `config.ts` stays the single
 * source of truth for every other consumer.
 */
export function AppRoutes() {
  if (import.meta.env.DEV) {
    // TEMP (diagnostic 2026-10-19): `/` temporarily serves the module page
    // instead of the broken lazy HomePage chunk; revert once HomePage is fixed.
    return (
      <Routes>
        <Route path="/" element={<CalcXrdPage />} />
        <Route path={MODULE_PATH} element={<CalcXrdPage />} />
      </Routes>
    );
  }
  return prodRoutes;
}
