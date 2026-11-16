export function LoadingSpinner({ label = 'Loading', fullScreen = false, compact = false, overlay = false }: { label?: string; fullScreen?: boolean; compact?: boolean; overlay?: boolean }) {
  return <div role="status" aria-live="polite" aria-busy="true" className={`loading-center ${fullScreen ? 'loading-screen' : ''} ${compact ? 'loading-compact' : ''} ${overlay ? 'loading-overlay' : ''}`}>
    <span className="loading-ring" aria-hidden="true" />
    <span className="sr-only">{label}</span>
  </div>;
}
