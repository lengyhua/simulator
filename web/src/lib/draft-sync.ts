/**
 * Draft-buffer sync helper for form components bound to the crystal store
 * (plan §5-T09).
 *
 * Form inputs keep a local string draft per field so intermediate states
 * (`"4."`, `"-"`, `""`) never reach the store. The store value is patched
 * whenever the draft parses to a valid number (or is plain text), which
 * makes the two diverge in two ways:
 *
 * 1. **User typing** — the draft is the source of truth while focused; the
 *    store value equals the parsed draft, so the draft must SURVIVE a
 *    re-render (naively clearing drafts on every store update breaks decimal
 *    input: typing `4.` then `5` would produce `45`).
 * 2. **External load** (upload / sample pick / reset) — the store value
 *    changed underneath, so stale drafts must be DROPPED.
 *
 * {@link syncDrafts} distinguishes the two cases by comparing each draft with
 * the current store value: a draft is kept only while it still agrees with
 * (parses to / equals) the store value.
 *
 * @param drafts current per-field drafts (`field → raw string`).
 * @param values the current store record (`field → value`).
 * @returns the pruned drafts, or `null` when nothing changed (same reference
 *   is kept so React can skip the state update).
 */
export function syncDrafts(
  drafts: Partial<Record<string, string>>,
  values: Record<string, unknown>,
): Partial<Record<string, string>> | null {
  let changed = false;
  const next: Partial<Record<string, string>> = { ...drafts };
  for (const [field, draft] of Object.entries(drafts)) {
    if (draft === undefined) {
      continue;
    }
    const storeValue = values[field];
    const agrees =
      typeof storeValue === 'number'
        ? (() => {
            const parsed = draft.trim() === '' ? 0 : Number(draft);
            return Number.isFinite(parsed) && parsed === storeValue;
          })()
        : draft === storeValue;
    if (!agrees) {
      delete next[field];
      changed = true;
    }
  }
  return changed ? next : null;
}
