interface PlatformTabProps {
  /** Tab label, e.g.「XRD理论数据仿真」. */
  label: string;
  /** Active tabs render with the accent underline (`.tab.active`). */
  active?: boolean;
  /** Disabled tabs are not clickable and dimmed (`.tab:disabled`). */
  disabled?: boolean;
  /** Click handler (absent for non-interactive tabs). */
  onClick?: () => void;
}

/**
 * Single platform tab button — replica of the upstream `.tab` styles
 * (XRD_simulator.css Platform Shell section). Each module page keeps only its
 * own tab in the header.
 */
export function PlatformTab({ label, active = false, disabled = false, onClick }: PlatformTabProps) {
  const className = active ? 'tab active' : 'tab';
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}
