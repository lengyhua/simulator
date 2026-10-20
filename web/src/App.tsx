import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';

import { AppRoutes } from '@/routes';

/**
 * Class error boundary that surrounds the lazy route tree.
 *
 * React `Suspense` swallows render-time errors on lazy components and keeps
 * the fallback on screen with no console output when the rejection originates
 * from a stale HMR promise. This boundary catches that and prints the real
 * error to the console so the stuck "加载中…" state is debuggable.
 *
 * DEV-only import of the error UI: the boundary is inert in production builds
 * where it would never fire under the single-module layout.
 */
class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // DEV: print the real stack so a stale-promise Suspense hang is visible.
    if (import.meta.env.DEV) {
      console.error('[RouteErrorBoundary]', error, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 20,
            color: '#f87171',
            fontFamily: 'monospace',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
          }}
        >
          Route render error: {this.state.error.message}
          <br />
          <br />
          {this.state.error.stack}
          <br />
          <br />
          Try a hard refresh (Ctrl+Shift+R) to clear any stale lazy-module
          promise from an earlier HMR session.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <RouteErrorBoundary>
      <Suspense
        fallback={
          <div className="route-fallback" role="status">
            加载中…
          </div>
        }
      >
        <AppRoutes />
      </Suspense>
    </RouteErrorBoundary>
  );
}
