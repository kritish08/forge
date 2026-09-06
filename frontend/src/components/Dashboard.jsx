import { useState, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";
import HabitDetailModal from "./HabitDetailModal";
import { FrequencyBadge, WeeklyProgressDots, isScheduledToday } from "./FrequencyPicker";
import { useToday } from "../hooks/useToday";
import { isoWeekMonday } from "../utils/date";
import { useCachedQuery, invalidate } from "../hooks/useCachedQuery";
import Screen, { Group } from "./Screen";
import Sheet from "./Sheet";
import { Check, Chevron, Flame } from "./icons";
import { HabitRowSkeleton, Skeleton } from "./Skeleton";
import { tapSuccess, tapLight, tapError } from "../utils/haptics";

const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};

const MOOD_OPTIONS = [
  { rating: 1, emoji: "😢", label: "Rough" },
  { rating: 2, emoji: "😟", label: "Low" },
  { rating: 3, emoji: "😐", label: "Okay" },
  { rating: 4, emoji: "🙂", label: "Good" },
  { rating: 5, emoji: "😊", label: "Great" },
];

/**
 * One habit.
 *
 * The interaction is inverted from what it used to be. Previously the whole row
 * was a button that opened the History modal, and completion lived in a bare
 * <div onClick> nested inside it — invalid HTML, unreachable by keyboard, and
 * completely unsignposted, so the app's primary daily action was hidden inside
 * its secondary one. Now the row completes the habit and a separate, clearly
 * marked control opens the history. The two controls are siblings, not nested.
 */
function HabitRow({ habit, done, pending, weekCount, onToggle, onOpenDetail, dimmed }) {
  return (
    <div className={`flex items-stretch ${dimmed ?"opacity-70" : ""}`}>
      <button
        type="button"
        onClick={() => onToggle(habit)}
        disabled={pending}
        aria-pressed={done}
        data-testid={`habit-check-${habit.habit_id}`}
        className="flex min-w-0 flex-1 items-center gap-3.5 px-5 py-4 text-left transition-colors active:bg-surface-sunk disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-colors ${ done ?"border-accent bg-accent text-accent-contrast" : "border-line-strong text-transparent"
          }`}
        >
          <Check className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-chivo text-[15px] font-semibold ${ done ?"text-ink-subtle line-through" : "text-ink"
            }`}
          >
            {habit.name}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <FrequencyBadge habit={habit} />
            {habit.frequency_type === "times_per_week" && (
              <WeeklyProgressDots habit={habit} weekCompletions={weekCount} />
            )}
            {habit.context && !habit.frequency_type?.startsWith("times") && (
              <span className="truncate text-xs text-ink-subtle">{habit.context}</span>
            )}
          </span>
        </span>

        <span className="shrink-0 font-chivo text-xs font-semibold tabular-nums text-ink-subtle">
          {habit.priority} pt{habit.priority > 1 ? "s" : ""}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOpenDetail(habit)}
        aria-label={`History for ${habit.name}`}
        data-testid={`habit-history-${habit.habit_id}`}
        className="grid w-11 shrink-0 place-items-center border-l border-line text-ink-subtle transition-colors active:bg-surface-sunk"
      >
        <Chevron className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const todayStr = useToday();
  const [pending, setPending] = useState({});
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodRating, setMoodRating] = useState(null);
  const [gratitude, setGratitude] = useState("");
  const [wellness, setWellness] = useState(null);

  const monday = isoWeekMonday(todayStr);

  const habitsQ = useCachedQuery("habits", () => api.get("/habits").then((r) => r.data));
  const compsQ = useCachedQuery(`completions:${todayStr}`, () =>
    api.get(`/completions?date=${todayStr}`).then((r) => r.data));
  const statsQ = useCachedQuery("stats", () => api.get("/analytics/stats").then((r) => r.data));
  const moodQ = useCachedQuery(`mood:${todayStr}`, () => api.get("/moods/today").then((r) => r.data));
  const weekQ = useCachedQuery(`week:${monday}`, () =>
    api.get(`/completions?since=${monday}`).then((r) => r.data));

  // Stable fallbacks: `?? []` creates a new array identity on every render, so
  // every downstream useMemo saw a changed dependency and recomputed each time.
  const habits = habitsQ.data ?? EMPTY_ARRAY;
  const stats = statsQ.data ?? EMPTY_OBJECT;
  const todayMood = moodQ.data?.mood_id ? moodQ.data : null;

  const completions = useMemo(() => {
    const m = {};
    (compsQ.data ?? EMPTY_ARRAY).forEach((c) => { m[c.habit_id] = c.completion_id; });
    return m;
  }, [compsQ.data]);

  const weekCounts = useMemo(() => {
    const m = {};
    (weekQ.data ?? EMPTY_ARRAY).forEach((c) => { m[c.habit_id] = (m[c.habit_id] || 0) + 1; });
    return m;
  }, [weekQ.data]);

  const refreshAfterToggle = useCallback(() => {
    invalidate("stats", `completions:${todayStr}`, `week:${monday}`);
    statsQ.refetch();
    compsQ.refetch();
    weekQ.refetch();
  }, [todayStr, monday, statsQ, compsQ, weekQ]);

  const toggleHabit = useCallback(async (habit) => {
    const id = habit.habit_id;
    const wasDone = !!completions[id];
    setPending((p) => ({ ...p, [id]: true }));
    try {
      if (wasDone) {
        await api.delete(`/completions/${completions[id]}`);
        tapLight();
        toast(`${habit.name} unchecked`, {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await api.post("/completions", { habit_id: id });
                tapSuccess();
                refreshAfterToggle();
              } catch {
                toast.error("Couldn't restore that check-in.");
              }
            },
          },
        });
      } else {
        await api.post("/completions", { habit_id: id });
        tapSuccess();
      }
      refreshAfterToggle();
    } catch {
      tapError();
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally {
      setPending((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  }, [completions, refreshAfterToggle]);

  const submitMood = async () => {
    if (!moodRating) return;
    try {
      const res = await api.post("/moods", { rating: moodRating, gratitude });
      invalidate(`mood:${todayStr}`);
      moodQ.refetch();
      setMoodOpen(false);
      setGratitude("");
      if (res.data.wellness_warning) setWellness(res.data.wellness_warning);
      toast.success("Mood logged");
    } catch {
      toast.error("Couldn't log your mood. Try again.");
    }
  };

  const scheduled = useMemo(
    () => habits.filter((h) => isScheduledToday(h, todayStr)), [habits, todayStr]);
  const restDay = useMemo(
    () => habits.filter((h) => !isScheduledToday(h, todayStr)), [habits, todayStr]);

  const firstName = user?.name?.split(" ")[0] || "there";
  const dateLabel = new Date(`${todayStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  const doneCount = scheduled.filter((h) => completions[h.habit_id]).length;
  const allDone = scheduled.length > 0 && doneCount === scheduled.length;
  const pct = stats.max_today_points > 0
    ? Math.round((stats.today_points / stats.max_today_points) * 100) : 0;

  const loading = habitsQ.loading || compsQ.loading;

  return (
    <Screen
      title={allDone ? "All done today" : `Hey, ${firstName}`}
      subtitle={dateLabel}
    >
      {/* The one bold element on the screen. The streak is what the product is
          about, so it gets the accent and the weight; points and level sit
          beside it in plain ink rather than competing for attention. */}
      <div className="mb-4 flex items-stretch gap-3">
        <div className="flex flex-1 items-center gap-3 rounded-2xl border border-line bg-surface-raised px-4 py-3.5 shadow-row">
          <Flame className="h-7 w-7 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="font-chivo text-[26px] font-bold leading-none tabular-nums text-ink">
              {statsQ.loading ? <Skeleton className="h-6 w-10" /> : stats.streak ?? 0}
            </p>
            <p className="mt-1 text-xs text-ink-muted">day streak</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center rounded-2xl border border-line bg-surface-raised px-4 py-3.5 shadow-row">
          <div className="flex items-baseline justify-between">
            <p className="font-chivo text-[15px] font-semibold tabular-nums text-ink">
              {doneCount}<span className="text-ink-subtle">/{scheduled.length}</span>
            </p>
            <p className="text-xs tabular-nums text-ink-muted">Lv {stats.level ?? 1}</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunk">
            <div
              data-testid="daily-progress-bar"
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
          <div className="divide-y divide-line">
            <HabitRowSkeleton /><HabitRowSkeleton /><HabitRowSkeleton />
          </div>
        </div>
      ) : habits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="font-chivo text-base font-semibold text-ink">No habits yet</p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-sm text-ink-muted">
            Add your first one in Settings and it'll show up here every day it's due.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {scheduled.length > 0 && (
            <Group label="Due today">
              {scheduled.map((h) => (
                <HabitRow
                  key={h.habit_id}
                  habit={h}
                  done={!!completions[h.habit_id]}
                  pending={!!pending[h.habit_id]}
                  weekCount={weekCounts[h.habit_id] || 0}
                  onToggle={toggleHabit}
                  onOpenDetail={setSelectedHabit}
                />
              ))}
            </Group>
          )}

          {restDay.length > 0 && (
            <Group label="Not scheduled today">
              {restDay.map((h) => (
                <HabitRow
                  key={h.habit_id}
                  habit={h}
                  done={!!completions[h.habit_id]}
                  pending={!!pending[h.habit_id]}
                  weekCount={weekCounts[h.habit_id] || 0}
                  onToggle={toggleHabit}
                  onOpenDetail={setSelectedHabit}
                  dimmed
                />
              ))}
            </Group>
          )}

          {/* Mood */}
          <section>
            <h2 className="mb-2 px-1 text-[13px] font-semibold text-ink-muted">How was today?</h2>
            <div className="rounded-2xl border border-line bg-surface-raised p-4 shadow-row">
              {todayMood ? (
                <button
                  type="button"
                  onClick={() => { setMoodRating(todayMood.rating); setGratitude(todayMood.gratitude || ""); setMoodOpen(true); }}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="text-2xl" data-testid="today-mood-display">
                    {MOOD_OPTIONS.find((m) => m.rating === todayMood.rating)?.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {todayMood.gratitude ? `Grateful for: ${todayMood.gratitude}` : "Logged"}
                    </span>
                    <span className="text-xs text-ink-subtle">Tap to change</span>
                  </span>
                  <Chevron className="h-4 w-4 shrink-0 text-ink-subtle" />
                </button>
              ) : (
                <div className="flex justify-between">
                  {MOOD_OPTIONS.map((m) => (
                    <button
                      key={m.rating}
                      type="button"
                      data-testid={`mood-btn-${m.rating}`}
                      onClick={() => { setMoodRating(m.rating); setMoodOpen(true); }}
                      className="flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition-transform active:scale-95"
                    >
                      <span className="text-2xl">{m.emoji}</span>
                      <span className="text-[11px] text-ink-subtle">{m.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Mood sheet */}
      <Sheet
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        title="How was today?"
        description="Mood alongside habits is what lets the coach spot correlations."
        footer={
          <div className="flex gap-3 pb-1">
            <button
              type="button"
              onClick={() => setMoodOpen(false)}
              className="flex-1 rounded-xl border border-line py-3 font-chivo text-sm font-bold text-ink-muted transition-transform active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="mood-submit-btn"
              onClick={submitMood}
              disabled={!moodRating}
              className="flex-1 rounded-xl bg-ink py-3 font-chivo text-sm font-bold text-surface-raised transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              Save
            </button>
          </div>
        }
      >
        <div className="flex justify-between pb-4">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.rating}
              type="button"
              onClick={() => setMoodRating(m.rating)}
              aria-pressed={moodRating === m.rating}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-colors ${ moodRating === m.rating ?"bg-accent-soft ring-2 ring-accent" : ""
              }`}
            >
              <span className="text-2xl">{m.emoji}</span>
              <span className="text-[11px] text-ink-subtle">{m.label}</span>
            </button>
          ))}
        </div>
        <label className="block pb-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Anything you're grateful for? <span className="text-ink-subtle">(optional)</span>
          </span>
          <textarea
            value={gratitude}
            onChange={(e) => setGratitude(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-line bg-surface-sunk px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="One small thing counts."
          />
        </label>
      </Sheet>

      {/* Wellness check — shown when Direct Mode sees a run of low moods */}
      <Sheet
        open={!!wellness}
        onClose={() => setWellness(null)}
        title="Checking in"
        description={wellness?.message}
        footer={
          <button
            type="button"
            data-testid="wellness-modal-close"
            onClick={() => setWellness(null)}
            className="mb-1 w-full rounded-xl bg-ink py-3 font-chivo text-sm font-bold text-surface-raised transition-transform active:scale-[0.98]"
          >
            I'm okay, continue
          </button>
        }
      >
        <div className="mb-4 rounded-2xl border border-danger/25 bg-danger-soft p-4">
          <p className="mb-2 text-xs font-semibold text-danger">Support, any time</p>
          {(wellness?.resources ?? EMPTY_ARRAY).map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-3 border-b border-danger/15 py-2 last:border-0">
              <span className="text-sm text-ink">{r.name}</span>
              <span className="shrink-0 text-sm font-semibold text-danger">{r.contact}</span>
            </div>
          ))}
        </div>
      </Sheet>

      {selectedHabit && (
        <HabitDetailModal
          habit={selectedHabit}
          isOpen={!!selectedHabit}
          onClose={() => setSelectedHabit(null)}
          onUpdate={refreshAfterToggle}
        />
      )}
    </Screen>
  );
}
