type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
};

export function ProgressBar({
  value,
  max = 100,
  label = "Progress",
}: ProgressBarProps) {
  const percentage =
    max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="progress-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}