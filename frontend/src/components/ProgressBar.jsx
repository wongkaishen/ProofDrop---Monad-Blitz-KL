/**
 * Generic progress bar used by Dashboard / Rewards.
 *
 * Pass `value` and `max`; renders a gradient fill and the textual breakdown.
 */
export default function ProgressBar({
  value,
  max,
  label,
  hint,
  color = "violet",
}) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100));
  return (
    <div className={"progress " + color}>
      <div className="progress-head">
        <span className="progress-label">{label}</span>
        <span className="progress-value">
          {value} / {max}
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {hint && <div className="progress-hint">{hint}</div>}
    </div>
  );
}
