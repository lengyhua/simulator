import { useEffect, type ReactElement } from 'react';

/**
 * Minimal floating window (plan §UI-1, mirrors the legacy program's separate
 * "single XRD" / "Wyckoff symbol" top-level windows): a fixed, centered,
 * scrollable dialog with a title bar and a close control. No third-party
 * modal library — a single component keeps the bundle light and the escape
 * / backdrop-click-to-close behavior obvious.
 *
 * Usage: `<Float title="..." onClose={...} width={640}>{...}</Float>`
 * Renders null when `open` is false (kept in the tree so its content can
 * reuse the caller's memoized data without re-mount cost).
 */
export function Float({
  open,
  title,
  onClose,
  width = 640,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  width?: number;
  children: ReactElement;
}): ReactElement | null {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="float-backdrop"
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="float-window" style={{ maxWidth: width }}>
        <div className="float-head">
          <span className="float-title">{title}</span>
          <button type="button" className="float-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="float-body">{children}</div>
      </div>
    </div>
  );
}
