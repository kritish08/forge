import { useNavigate } from "react-router-dom";
import { Spark, Chart, Bell, Trophy } from "./icons";
import ThemeToggle from "./ThemeToggle";

// The flame mark. One SVG, reused at every size; colour comes from the parent.
function Flame({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent">
        <Flame className="h-4 w-4 text-accent-contrast" />
      </span>
      <span className="font-chivo text-xl font-black tracking-tight text-ink">FORGE</span>
    </span>
  );
}

// A fortnight of completion intensity, 0–4, most recent day last. Hand-set so the
// hero visual reads like a real record with a legible dip (the "Tuesday problem"
// the coach note calls out), not random noise.
const HEATMAP = [3, 4, 2, 4, 4, 1, 3, 4, 4, 1, 4, 3, 4, 2];
const CELL = ["bg-surface-sunk", "bg-accent/25", "bg-accent/45", "bg-accent/70", "bg-accent"];

// What the coach actually returns — data first, one instruction. This is the
// product's output, shown as the hero rather than a stock illustration.
function CoachCard() {
  return (
    <figure className="rounded-2xl border border-line bg-surface-raised p-5 shadow-sheet">
      <figcaption className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent-soft">
          <Spark className="h-3.5 w-3.5 text-accent" />
        </span>
        <span className="font-chivo text-sm font-bold text-ink">Your coach · Strategic</span>
      </figcaption>
      <p className="text-[15px] leading-relaxed text-ink">
        You closed <span className="font-semibold tabular-nums">78%</span> of scheduled habits over
        two weeks. The gap is <span className="font-semibold">Tuesdays</span> —{" "}
        <span className="tabular-nums">62%</span>, your only day under 70. Move the hard one to the
        morning and Tuesday stops dragging the week.
      </p>

      {/* The two-week record the note is reading from. */}
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium text-ink-subtle">Last 14 days</span>
          <span className="font-chivo text-xs font-bold tabular-nums text-accent">78%</span>
        </div>
        <div className="flex gap-1.5" role="img" aria-label="Completion intensity over the last 14 days">
          {HEATMAP.map((v, i) => (
            <span
              key={i}
              className={`h-7 flex-1 rounded-md ${CELL[v]} motion-safe:animate-fade-in`}
              style={{ animationDelay: `${i * 45}ms`, animationFillMode: "both" }}
            />
          ))}
        </div>
      </div>

      {/* Three figures, one row — the numbers that make it feel like data. */}
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
        {[
          ["Streak", "12", "days"],
          ["Consistency", "78", "%"],
          ["Weak day", "Tue", ""],
        ].map(([label, value, unit]) => (
          <div key={label}>
            <dd className="font-chivo text-2xl font-black tabular-nums text-ink">
              {value}
              {unit && <span className="ml-0.5 text-sm font-bold text-ink-subtle">{unit}</span>}
            </dd>
            <dt className="mt-0.5 text-xs text-ink-subtle">{label}</dt>
          </div>
        ))}
      </dl>
    </figure>
  );
}

const FEATURES = [
  {
    Icon: Spark,
    title: "Coaching from your own history",
    body: "Every insight cites your numbers — which days hold, which slip, and the one change worth making. Three tones, from encouraging to blunt.",
  },
  {
    Icon: Chart,
    title: "Patterns you can act on",
    body: "A completion heatmap, day-of-week and time-of-day breakdowns, and one consistency score that every screen agrees on.",
  },
  {
    Icon: Trophy,
    title: "Weighted priorities",
    body: "Not every habit counts the same. Weight the ones that matter and the coach spends its attention there, not on the easy wins.",
  },
  {
    Icon: Bell,
    title: "Reminders that respect the schedule",
    body: "Only for what's still open, only on the days and times you set. Push or email — plus a weekly summary that reads in ten seconds.",
  },
];

const STEPS = [
  ["Add a few habits", "Name them, set a priority and a schedule. That context is what the coaching is built on."],
  ["Check in — ten seconds", "Tap to complete. The record builds itself; there's no journaling and nothing to analyse by hand."],
  ["Read what it found", "After two weeks the coach names your pattern in plain language and gives you one thing to change."],
];

export default function Landing({ onGetStarted }) {
  const navigate = useNavigate();
  const go = (registering = false) =>
    onGetStarted ? onGetStarted() : navigate("/auth", { state: { isRegistering: registering } });

  return (
    <div className="min-h-screen bg-surface font-manrope text-ink">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => go(false)}
              className="hidden rounded-lg px-3 py-2 font-chivo text-sm font-bold text-ink-muted transition-colors hover:text-ink sm:block"
            >
              Sign in
            </button>
            <button
              onClick={() => go(true)}
              className="rounded-lg bg-ink px-4 py-2 font-chivo text-sm font-bold text-surface transition-transform active:scale-95"
            >
              Start free
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero: the product's output is the hero ──────────────────────── */}
      <header className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-32 right-0 h-[420px] w-[420px] rounded-full bg-accent-soft blur-3xl"
          aria-hidden="true"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="max-w-xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1 text-xs font-medium text-ink-muted">
              <Flame className="h-3.5 w-3.5 text-accent" />
              Consistency, forged from data
            </p>
            <h1 className="font-chivo text-[2.6rem] font-black leading-[1.05] tracking-tight text-ink sm:text-6xl">
              You don't have a motivation problem. You have a visibility one.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-muted">
              FORGE reads your own completion history and tells you what it shows — the days that
              hold, the days that slip, and the single change that moves the week. Not a pep talk. Your data.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => go(true)}
                className="rounded-xl bg-accent px-7 py-4 font-chivo font-bold text-accent-contrast shadow-sheet transition-transform active:scale-95"
              >
                Start free
              </button>
              <button
                onClick={() => go(false)}
                className="rounded-xl border border-line bg-surface-raised px-7 py-4 font-chivo font-bold text-ink transition-colors hover:border-line-strong"
              >
                Sign in
              </button>
            </div>
            <p className="mt-5 text-sm text-ink-subtle">
              Free to start · no ads · your OpenAI key, your data
            </p>
          </div>

          <div className="mx-auto w-full max-w-sm lg:mx-0">
            <CoachCard />
          </div>
        </div>
      </header>

      {/* ── What it does ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <h2 className="max-w-2xl font-chivo text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">
          Most trackers count check-ins. FORGE reads them.
        </h2>
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-4">
              <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft">
                <f.Icon className="h-5 w-5 text-accent" />
              </span>
              <div>
                <h3 className="font-chivo text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-1.5 max-w-sm leading-relaxed text-ink-muted">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works: a real 3-step sequence, drawn as a path ───────── */}
      <section className="border-y border-line bg-surface-raised">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
          <h2 className="max-w-xl font-chivo text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">
            From first habit to a real insight in two weeks.
          </h2>
          <ol className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-accent/30 bg-accent-soft font-chivo text-sm font-black tabular-nums text-accent">
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span className="hidden h-px flex-1 bg-line sm:block" aria-hidden="true" />
                  )}
                </div>
                <h3 className="font-chivo text-lg font-bold text-ink">{title}</h3>
                <p className="mt-1.5 leading-relaxed text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Closing CTA: an inverse band, dark in both themes ───────────── */}
      <section className="bg-inverse">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center lg:py-28">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent">
            <Flame className="h-7 w-7 text-accent-contrast" />
          </span>
          <h2 className="mx-auto mt-6 max-w-xl font-chivo text-3xl font-black leading-tight tracking-tight text-inverse-fg sm:text-4xl">
            Stop guessing why some weeks work.
          </h2>
          <p className="mx-auto mt-4 max-w-md leading-relaxed text-inverse-muted">
            Two weeks of check-ins is all it takes for the pattern to show. Start with two or three habits tonight.
          </p>
          <button
            onClick={() => go(true)}
            className="mt-8 rounded-xl bg-accent px-8 py-4 font-chivo font-bold text-accent-contrast transition-transform active:scale-95"
          >
            Start free
          </button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
        <Wordmark />
        <p className="text-xs text-ink-subtle">
          A habit takes about 66 days on average — not 21. FORGE is built for the long stretch.
        </p>
      </footer>
    </div>
  );
}
