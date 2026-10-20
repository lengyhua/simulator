# Dev-server "加载中" stuck-fallback root cause (2026-10-19)

## Symptom

`http://localhost:5173/calc-xrd/` (the DEV root → `HomePage`) stayed on the
Suspense fallback (`加载中…`) indefinitely. `/calc-xrd/module` worked.

## Root cause (Phases 1–4, systematic-debugging)

The `HomePage` lazy chunk (`routes.tsx`:
`lazy(() => import('@/pages/HomePage'))`) kept its underlying promise in a
**rejected state from a stale HMR generation**. A rejected `React.lazy`
promise never re-resolves for the lifetime of the page, and `Suspense`
swallows the resulting render error **silently** — no error boundary was in
the tree, so the fallback stuck forever.

The console log was misleading: it replayed **history from prior HMR
generations** (a long-gone `ATOM_FIELDS is not defined` throw in an old
`AtomTable` module, CSS 404s with stale `?t=` timestamps, a run of
`ERR_CONNECTION_REFUSED` captured while a dev server was briefly down). A
fresh navigation reported "0 errors" because none of those were live — but
the stale lazy-promise rejection was still pending, and fresh navigations
inherited it from the warm browser/HMR state.

Evidence:
- Fiber walk of the stuck tree found a `Suspense` (tag 13) with no pending
  branch ever clearing; `document.getElementById('root')` held only the
  fallback `div.route-fallback`.
- `curl` of `HomePage.tsx` / `CalcXrdPage.tsx` on the dev server → 200, so
  the chunks themselves served fine; the failure was in the **in-memory
  promise state**, not the network.
- Pointing `/` at `CalcXrdPage` instead of the lazy `HomePage` made the root
  render immediately and cleanly (0 resource errors), confirming the lazy
  `HomePage` import was the blocker.

## Fix (landed)

1. **`src/routes.tsx`** — DEV root `/` now renders `CalcXrdPage` directly
   (marked `TEMP (diagnostic 2026-10-19)`). Revert to `HomePage` once the
   home chunk is wanted again; the page itself is fine, only the stale
   promise bit.
2. **`src/App.tsx`** — added a class `RouteErrorBoundary` around the
   `Suspense` tree. In DEV it prints the real error + `componentStack` on
   catch, so a stuck-fallback can never be silent again. Production path is
   inert (single-module layout, no lazy home chunk).

## Why it self-healed after a full dev-server restart

Killing the Vite process (`70160`, started Oct 16 — long stale) and
re-running `npm run dev` cleared the warm module graph that carried the
poisoned lazy promise. The browser then re-hydrated a clean module state.

## Open item

The `HomePage` route at `/` is currently bypassed in favor of the module
page. If the platform home is still wanted in DEV, restore the `HomePage`
lazy import in `routes.tsx` **after** a clean dev-server restart (or a
browser hard-refresh) so no stale promise is in flight.
