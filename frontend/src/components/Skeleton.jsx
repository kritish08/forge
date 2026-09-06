/**
 * Loading placeholders.
 *
 * Every screen used to blank the entire viewport behind a centred spinner while
 * its two-to-four requests resolved, so switching tabs read as a page load.
 * A skeleton keeps the layout in place, which makes the wait feel shorter and
 * stops the content jumping when it lands.
 */
export function Skeleton({ className = "" }) {
  return (
    <div
      className={`rounded-lg bg-surface-sunk motion-safe:animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

export function HabitRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function CardSkeleton({ lines = 3 }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-raised p-5">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
