import ThemeToggle from "./ThemeToggle";

/**
 * The shell every authenticated screen sits in.
 *
 * Two headers used to coexist: ForgeHeader (Analytics, Achievements, Settings)
 * and a hand-rolled near-copy inside Dashboard and AICoach — which is why the
 * theme toggle was missing from the two screens people use most. There is now
 * one header.
 *
 * Top padding comes from env(safe-area-inset-top) rather than a hardcoded pt-12,
 * so the header clears the notch or dynamic island on a device and doesn't leave
 * a dead band on one that has neither.
 */
export default function Screen({ title, subtitle, action, children }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-raised/85 backdrop-blur-xl">
        <div
          className="flex items-end justify-between gap-4 px-5 pb-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.875rem)" }}
        >
          <div className="min-w-0">
            <h1 className="truncate font-chivo text-[26px] font-bold leading-none tracking-tight text-ink">
              {title}
            </h1>
            {subtitle && <p className="mt-1.5 truncate text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {action}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Bottom padding clears the fixed nav plus the home indicator. */}
      <main
        className="px-5 pt-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * A grouped list of rows: one rounded container, hairline separators, no
 * per-item card. This is the native list idiom, and it is what makes the app
 * compact — the previous design gave every habit its own floating bordered card
 * with its own shadow, which spent a lot of vertical space saying nothing.
 */
export function Group({ label, children, className = "" }) {
  return (
    <section className={className}>
      {label && (
        <h2 className="mb-2 px-1 text-[13px] font-semibold text-ink-muted">{label}</h2>
      )}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-row">
        <div className="divide-y divide-line">{children}</div>
      </div>
    </section>
  );
}
