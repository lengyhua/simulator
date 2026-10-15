import { Suspense } from 'react';

import { AppRoutes } from '@/routes';

/**
 * Root layout. Pages own their chrome (plan §1.3 / §2):
 * - `HomePage` renders the replicated light-theme platform home (no shell);
 * - `CalcXrdPage` renders the dark platform header plus the module body.
 * A single Suspense boundary covers the lazy route chunks.
 */
export default function App() {
  return (
    <Suspense
      fallback={
        <div className="route-fallback" role="status">
          加载中…
        </div>
      }
    >
      <AppRoutes />
    </Suspense>
  );
}
