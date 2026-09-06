import { useState, useEffect } from "react";
import { ScoreAreaChart, DayOfWeekChart } from "./charts";
import api from "../utils/api";
import Screen from "./Screen";
import { CardSkeleton } from "./Skeleton";
import { useToday } from "../hooks/useToday";
import { addDays, daysBetween, isoWeekMonday } from "../utils/date";

function HeatmapGrid({ data, todayStr }) {
  const [picked, setPicked] = useState(null);

  // Weekday-aligned, Monday at the top. The old grid sliced a flat 90-day list
  // into groups of seven, so a row did not correspond to a weekday — it looked
  // like a contribution graph but encoded nothing positional, and there were no
  // month or weekday labels to notice by.
  const lastDay = todayStr;
  const firstDay = addDays(lastDay, -(7 * 14 - 1));
  const gridStart = isoWeekMonday(firstDay);
  const weeks = [];
  for (let w = 0; ; w++) {
    const monday = addDays(gridStart, w * 7);
    if (daysBetween(monday, lastDay) < 0) break;
    weeks.push(Array.from({ length: 7 }, (_, d) => {
      const date = addDays(monday, d);
      const future = daysBetween(date, lastDay) < 0;
      return { date, rate: future ? null : (data[date] ?? -1) };
    }));
  }

  // One hue, five steps — a sequential scale, so intensity reads as magnitude.
  const level = (rate) => {
    if (rate === null) return "opacity-0";
    if (rate < 0 || rate === 0) return "bg-surface-sunk";
    if (rate <= 0.25) return "bg-accent/25";
    if (rate <= 0.5) return "bg-accent/45";
    if (rate <= 0.75) return "bg-accent/70";
    return "bg-accent";
  };

  const monthLabels = weeks.map((week, i) => {
    const first = week[0].date;
    const prev = i > 0 ? weeks[i - 1][0].date : null;
    const changed = !prev || first.slice(5, 7) !== prev.slice(5, 7);
    return changed ? new Date(`${first}T00:00:00`).toLocaleDateString(undefined, { month: "short" }) : "";
  });

  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-1 pl-7">
            {monthLabels.map((m, i) => (
              <div key={i} className="w-3.5 text-[10px] leading-none text-ink-subtle">{m}</div>
            ))}
          </div>
          <div className="flex gap-1">
            <div className="flex w-6 flex-col gap-1 pr-1">
              {["M", "", "W", "", "F", "", "S"].map((d, i) => (
                <div key={i} className="flex h-3.5 items-center justify-end text-[9px] leading-none text-ink-subtle">{d}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((cell) => (
                  <button
                    key={cell.date}
                    type="button"
                    disabled={cell.rate === null}
                    // Tap, not hover: the old cells carried only a `title`, which
                    // does not exist on touch — the app's primary target.
                    onClick={() => setPicked(cell)}
                    aria-label={cell.rate === null ? undefined
                      : `${fmt(cell.date)}: ${cell.rate >= 0 ? Math.round(cell.rate * 100) + "%" : "no data"}`}
                    className={`h-3.5 w-3.5 rounded-[3px] transition-transform ${level(cell.rate)} ${ picked?.date === cell.date ?"ring-2 ring-ink ring-offset-1 ring-offset-surface-raised" : ""
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-h-[1.25rem] text-xs text-ink-muted" aria-live="polite">
          {picked
            ? `${fmt(picked.date)} — ${picked.rate >= 0 ? `${Math.round(picked.rate * 100)}% complete` : "no data"}`
            : "Tap a day for detail"}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-1 text-[10px] text-ink-subtle">Less</span>
          {["bg-surface-sunk", "bg-accent/25", "bg-accent/45", "bg-accent/70", "bg-accent"].map((c) => (
            <span key={c} className={`h-3 w-3 rounded-[3px] ${c}`} />
          ))}
          <span className="ml-1 text-[10px] text-ink-subtle">More</span>
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const todayStr = useToday();
  const [stats, setStats] = useState(null);
  const [heatmap, setHeatmap] = useState({});
  const [patterns, setPatterns] = useState(null);
  const [moods, setMoods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, heatmapRes, patternsRes, moodsRes] = await Promise.all([
          api.get("/analytics/stats"),
          api.get("/analytics/heatmap"),
          api.get("/analytics/patterns"),
          api.get("/moods?days=30"),
        ]);
        setStats(statsRes.data);
        setHeatmap(heatmapRes.data);
        setPatterns(patternsRes.data);
        setMoods(moodsRes.data);
      } catch (e) {
        console.error("Analytics load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);


  // Defensive ordering. The server now emits Mon->Sun, but object key order is a
  // fragile thing to depend on for an axis, so pin it here as well.
  const DOW_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dowData = patterns
    ? DOW_ORDER.filter((day) => day in (patterns.dow_patterns || {}))
        .map((day) => ({ day, pct: patterns.dow_patterns[day] }))
    : [];
  const scoreData = patterns?.score_series?.slice(-14) || [];

  const avgMoodHabitDays = (() => {
    if (!moods.length || !patterns) return null;
    const heatmapDates = Object.keys(heatmap).filter((d) => heatmap[d] > 0);
    const habitMoods = moods.filter((m) => heatmapDates.includes(m.date)).map((m) => m.rating);
    const skipMoods = moods.filter((m) => !heatmapDates.includes(m.date) || heatmap[m.date] === 0).map((m) => m.rating);
    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
    return { habit: avg(habitMoods), skip: avg(skipMoods) };
  })();

  return (
    <Screen title="Analytics" subtitle="Your patterns, visualised">
      {loading ? (
        <div className="space-y-4">
          <CardSkeleton lines={2} /><CardSkeleton lines={4} /><CardSkeleton lines={3} />
        </div>
      ) : (
      <div className="space-y-5">
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Consistency", value: `${stats?.completion_rate || 0}%`, sub: "last 14 days", light: "bg-accent-soft border-accent/25", dark: " " },
            { label: "Current Streak", value: `${stats?.streak || 0}d`, sub: "consecutive days", light: "bg-warning-soft border-warning/25", dark: " " },
            { label: "Total Points", value: stats?.total_points || 0, sub: `Level ${stats?.level || 1}`, light: "bg-surface-sunk border-line", dark: " " },
            { label: "Check-ins", value: stats?.total_checkins || 0, sub: `over ${stats?.days_since_start || 0} days`, light: "bg-success-soft border-success/25", dark: " " },
          ].map((m) => (
            <div key={m.label} data-testid={`metric-${m.label.toLowerCase().replace(" ", "-")}`}
              className={`${m.light} ${m.dark} border rounded-2xl p-4`}>
              <p className="text-xs text-ink-subtle font-manrope mb-1">{m.label}</p>
              <p className="text-2xl font-black text-ink font-chivo">{m.value}</p>
              <p className="text-xs text-ink-subtle font-manrope">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Score over time */}
        <div className="bg-surface-raised rounded-2xl border border-line p-5">
          <h3 className="font-bold font-chivo text-ink mb-1">Score Over Time</h3>
          <p className="text-xs text-ink-subtle font-manrope mb-4">Daily completion % — last 14 days</p>
          {scoreData.length > 0 ? (
            <div data-testid="score-chart">
              <ScoreAreaChart data={scoreData} />
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <p className="text-ink-subtle text-sm font-manrope">Complete some habits to see your graph</p>
            </div>
          )}
        </div>

        {/* Heatmap */}
        <div className="bg-surface-raised rounded-2xl border border-line p-5">
          <h3 className="font-bold font-chivo text-ink mb-1">Consistency Heatmap</h3>
          <p className="text-xs text-ink-subtle font-manrope mb-4">Last 90 days of activity</p>
          <div data-testid="heatmap-grid">
            <HeatmapGrid data={heatmap} todayStr={todayStr} />
          </div>
        </div>

        {/* Day of week patterns */}
        <div className="bg-surface-raised rounded-2xl border border-line p-5">
          <h3 className="font-bold font-chivo text-ink mb-1">Day-of-Week Patterns</h3>
          <p className="text-xs text-ink-subtle font-manrope mb-4">Your strongest and weakest days</p>
          {dowData.length > 0 ? (
            <div data-testid="dow-chart">
              <DayOfWeekChart data={dowData} />
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <p className="text-ink-subtle text-sm font-manrope">Not enough data yet</p>
            </div>
          )}
        </div>

        {/* Time patterns */}
        {patterns?.time_patterns && Object.values(patterns.time_patterns).some((v) => v > 0) && (
          <div className="bg-surface-raised rounded-2xl border border-line p-5">
            <h3 className="font-bold font-chivo text-ink mb-1">When You Show Up</h3>
            <p className="text-xs text-ink-subtle font-manrope mb-4">Distribution of completions by time of day</p>
            <div className="space-y-3">
              {[
                { key: "early", label: "Early (<9AM)", color: "bg-accent-bold" },
                { key: "morning", label: "Morning (9-12)", color: "bg-accent" },
                { key: "afternoon", label: "Afternoon (12-17)", color: "bg-accent/50" },
                { key: "evening", label: "Evening (17+)", color: "bg-accent/35" },
              ].map(({ key, label, color }) => {
                const pct = patterns.time_patterns[key] || 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-ink-muted font-manrope">{label}</span>
                      <span className="text-xs font-bold text-ink font-chivo">{pct}%</span>
                    </div>
                    <div className="h-2 bg-surface-sunk rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mood correlation */}
        {avgMoodHabitDays?.habit && (
          <div className="bg-surface-raised rounded-2xl border border-line p-5">
            <h3 className="font-bold font-chivo text-ink mb-1">Mood & Habits Correlation</h3>
            <p className="text-xs text-ink-subtle font-manrope mb-4">Average mood on habit vs skip days</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-success-soft border border-success/25 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-success font-chivo">{avgMoodHabitDays.habit}/5</p>
                <p className="text-xs text-ink-muted font-manrope mt-1">Habit days</p>
              </div>
              <div className="bg-danger-soft border border-danger/25 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-danger font-chivo">{avgMoodHabitDays.skip || "—"}/5</p>
                <p className="text-xs text-ink-muted font-manrope mt-1">Skip days</p>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </Screen>
  );
}
