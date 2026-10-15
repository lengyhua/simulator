/**
 * Environment-derived constants — the single source of truth for routing and
 * link strategy (plan §1.5). Business components never branch on the
 * environment themselves; they read these values instead.
 *
 * - DEV (standalone dev server): the replicated platform home page lives at
 *   `/calc-xrd/` and the module at `/calc-xrd/module`.
 * - PROD (embedded in the simulator platform): the root path renders the
 *   module directly; the platform home is served by the host application, so
 *   the title link is a plain `<a href="/">`.
 */

/** True in the standalone dev server, false in production builds. */
export const IS_DEV: boolean = import.meta.env.DEV;

/** Vite base URL, always `/calc-xrd/` (trailing slash included). */
export const BASE_URL: string = import.meta.env.BASE_URL;

/** Router basename derived from BASE_URL, e.g. `/calc-xrd`. */
export const ROUTER_BASENAME: string = BASE_URL.replace(/\/$/, '');

/**
 * Target of the platform-title link. DEV uses it via `<Link to>` (SPA
 * navigation to `/calc-xrd/`); PROD via `<a href>` (full navigation to the
 * platform root). Both branches intentionally resolve to `/`.
 */
export const HOME_HREF: string = '/';

/** Route path of the module page: `/module` in DEV, `/` in PROD. */
export const MODULE_PATH: string = IS_DEV ? '/module' : '/';
