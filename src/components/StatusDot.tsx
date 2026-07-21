interface StatusDotProps {
  tone?: "live" | "safe" | "risk" | "muted";
}

export const StatusDot = ({ tone = "muted" }: StatusDotProps) => (
  <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />
);
