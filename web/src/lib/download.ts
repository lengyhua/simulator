/**
 * Browser file-download helper (all export buttons go through this).
 *
 * Why not the naive three-liner (`createObjectURL` → `a.click()` →
 * `revokeObjectURL` immediately)? Chrome commits the download asynchronously;
 * revoking the object URL in the same tick can invalidate the blob before the
 * download reads it. The user then sees a dead `blob:http://localhost/…`
 * entry in the download list and no file on disk (reported 2026-10-20 for the
 * 「导出 .xrd」 button). Fix: mount the anchor in the document, click it, and
 * revoke the URL on a deferred timer (blob URLs are also released on unload,
 * so the timer only tidies up).
 */
const REVOKE_DELAY_MS = 10_000;

/** Downloads `text` as `fileName` (UTF-8 text by default). */
export function downloadTextFile(
  fileName: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
