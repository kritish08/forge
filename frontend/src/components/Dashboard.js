import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";
import HabitDetailModal from "./HabitDetailModal";
import { FrequencyBadge, WeeklyProgressDots, isScheduledToday } from "./FrequencyPicker";

const MOOD_OPTIONS = [
  { rating: 1, emoji: "😢", label: "Rough" },
  { rating: 2, emoji: "😟", label: "Low" },
  { rating: 3, emoji: "😐", label: "Okay" },
  { rating: 4, emoji: "🙂", label: "Good" },
  { rating: 5, emoji: "😊", label: "Great" },
];

function WellnessModal({ warning, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white dark:bg-gray-950 w-full max-w-lg rounded-t-3xl p-6 animate-in slide-in-from-bottom-4 duration-300">
        <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-6" />
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-950/40 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-xl">💙</span>
          </div>
          <div>
            <h3 className="font-bold font-chivo text-gray-900 dark:text-white mb-1">Checking In</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-manrope leading-relaxed">{warning.message}</p>
          </div>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-2xl p-4 mb-4">
          <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-2 uppercase tracking-widest font-chivo">Resources</p>
          {warning.resources.map((r, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-red-100 dark:border-red-900/50 last:border-0">
              <span className="text-sm font-manrope text-gray-700 dark:text-gray-300">{r.name}</span>
              <span className="text-sm font-bold text-red-600 dark:text-red-400 font-manrope">{r.contact}</span>
            </div>
          ))}
        </div>
        <button
          data-testid="wellness-modal-close"
          onClick={onClose}
          className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-chivo font-bold text-sm tracking-wide uppercase rounded-xl active:scale-95 transition-all"
        >
          I'm okay, continue
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [habits, setHabits] = useState([]);
  const [completions, setCompletions] = useState({});
  const [animating, setAnimating] = useState({});
  const [todayMood, setTodayMood] = useState(null);
  const [showMoodForm, setShowMoodForm] = useState(false);
  const [moodRating, setMoodRating] = useState(null);
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [gratitude, setGratitude] = useState("");
  const [stats, setStats] = useState({ streak: 0, today_points: 0, max_today_points: 0, level: 1, habits_today: 0, habits_total: 0 });
  const [wellnessWarning, setWellnessWarning] = useState(null);
  const [weeklyCompletions, setWeeklyCompletions] = useState({});
  const [loading, setLoading] = useState(true);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const fetchData = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const [habitsRes, completionsRes, statsRes, moodRes] = await Promise.all([
        api.get("/habits"),
        api.get(`/completions?date=${todayStr}`),
        api.get("/analytics/stats"),
        api.get("/moods/today"),
      ]);
      setHabits(habitsRes.data);
      const compMap = {};
      completionsRes.data.forEach((c) => { compMap[c.habit_id] = c.completion_id; });
      setCompletions(compMap);
      setStats(statsRes.data);
      if (moodRes.data && moodRes.data.mood_id) {
        setTodayMood(moodRes.data);
      }
    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleHabit = async (habit) => {
    const isCompleted = !!completions[habit.habit_id];
    const prevCompletions = { ...completions };
    const prevWeekly = { ...weeklyCompletions };

    setAnimating((prev) => ({ ...prev, [habit.habit_id]: true }));
    setTimeout(() => setAnimating((prev) => ({ ...prev, [habit.habit_id]: false })), 400);

    // Optimistically adjust the weekly counter for times_per_week habits so the
    // progress dots update instantly without refetching the whole completion history.
    if (habit.frequency_type === "times_per_week") {
      setWeeklyCompletions((prev) => {
        const cur = prev[habit.habit_id] || 0;
        return { ...prev, [habit.habit_id]: Math.max(0, cur + (isCompleted ? -1 : 1)) };
      });
    }

    try {
      if (isCompleted) {
        const compId = completions[habit.habit_id];
        setCompletions((prev) => { const next = { ...prev }; delete next[habit.habit_id]; return next; });
        await api.delete(`/completions/${compId}`);
      } else {
        setCompletions((prev) => ({ ...prev, [habit.habit_id]: "pending" }));
        const res = await api.post("/completions", { habit_id: habit.habit_id });
        setCompletions((prev) => ({ ...prev, [habit.habit_id]: res.data.completion_id }));
        toast.success(`+${habit.priority}pt — ${habit.name} done!`, { duration: 2000 });
      }
    } catch {
      setCompletions(prevCompletions);
      setWeeklyCompletions(prevWeekly);
      toast.error("Failed to update. Try again.");
      return;
    }
    // Best-effort stats refresh — a failure here must NOT revert a successful toggle.
    try {
      const statsRes = await api.get("/analytics/stats");
      setStats(statsRes.data);
    } catch { /* stats will refresh on next full load */ }
  };

  const submitMood = async () => {
    if (!moodRating) return;
    try {
      const res = await api.post("/moods", { rating: moodRating, gratitude });
      setTodayMood(res.data.mood);
      setShowMoodForm(false);
      if (res.data.wellness_warning) {
        setWellnessWarning(res.data.wellness_warning);
      }
      toast.success("Mood logged!");
    } catch {
      toast.error("Failed to log mood.");
    }
  };

  // Split habits into scheduled and rest day
  const scheduledHabits = useMemo(() => habits.filter(h => isScheduledToday(h)), [habits]);
  const restDayHabits = useMemo(() => habits.filter(h => !isScheduledToday(h)), [habits]);

  // Seed weekly completion counts for times_per_week habits. Depends only on
  // `habits` — toggleHabit keeps the counts live optimistically, so we no longer
  // refetch the entire completions history on every check-in.
  useEffect(() => {
    const fetchWeeklyComps = async () => {
      const weeklyHabits = habits.filter(h => h.frequency_type === "times_per_week");
      if (weeklyHabits.length === 0) return;
      // Get start of current ISO week (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun
      const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMon);
      const mondayStr = monday.toISOString().split("T")[0];
      try {
        const res = await api.get(`/completions`);
        // Filter completions from monday onwards per habit
        const weekMap = {};
        (res.data || []).forEach(c => {
          if (c.date >= mondayStr) {
            weekMap[c.habit_id] = (weekMap[c.habit_id] || 0) + 1;
          }
        });
        setWeeklyCompletions(weekMap);
      } catch { /* silent */ }
    };
    fetchWeeklyComps();
  }, [habits]);

  const completionPct = stats.max_today_points > 0
    ? Math.round(stats.today_points / stats.max_today_points * 100)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 px-6 pt-12 pb-5 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope uppercase tracking-widest">{today}</p>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white font-chivo">
              {stats.habits_today === stats.habits_total && stats.habits_total > 0
                ? "Perfect Day! 🔥"
                : scheduledHabits.length === 0 && habits.length > 0
                  ? user?.mode === "supportive" ? "Rest day — you earned it 💚"
                    : user?.mode === "strategic" ? "No habits scheduled today."
                    : `Hey, ${user?.name?.split(" ")[0] || "Champion"}`
                : `Hey, ${user?.name?.split(" ")[0] || "Champion"}`}
            </h1>
          </div>
          {/* Top-right: FORGE logo + optional avatar */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* FORGE brand mark */}
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-sm shadow-orange-200">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.1 0 2 .9 2 2v.5c0 .3.2.5.5.5s.5-.2.5-.5V7c0-.6.4-1 1-1s1 .4 1 1v1c0 3.3-2.7 6-6 6H9.5C8.1 14 7 12.9 7 11.5S8.1 9 9.5 9H11c.6 0 1-.4 1-1V7c0-.6.4-1 1-1z" />
                </svg>
              </div>
              <span className="text-sm font-black text-gray-900 dark:text-white font-chivo tracking-tight">FORGE</span>
            </div>
            {user?.picture && (
              <img src={user.picture} alt="avatar" className="w-9 h-9 rounded-full border-2 border-orange-200" />
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-3">
          <div data-testid="streak-counter" className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/30 rounded-xl px-3 py-2 border border-orange-100 dark:border-orange-900/50">
            <span className="text-orange-500 text-lg">🔥</span>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope leading-none">Streak</p>
              <p className="text-base font-black text-gray-900 dark:text-white font-chivo leading-tight">{stats.streak}d</p>
            </div>
          </div>
          <div data-testid="points-display" className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-950/30 rounded-xl px-3 py-2 border border-yellow-100 dark:border-yellow-900/50">
            <span className="text-yellow-500 text-lg">⚡</span>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope leading-none">Today</p>
              <p className="text-base font-black text-gray-900 dark:text-white font-chivo leading-tight">{stats.today_points}pt</p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2 border border-blue-100 dark:border-blue-900/50">
            <span className="text-blue-500 dark:text-blue-400 text-sm font-bold font-chivo">Lv.{stats.level}</span>
            <div className="flex-1">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope leading-none">Level</p>
              <div className="h-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-full mt-0.5 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${stats.level_progress_pct || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Daily progress */}
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-manrope">Daily Progress</span>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 font-chivo">
              {stats.habits_today}/{stats.habits_total} habits · {completionPct}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              data-testid="daily-progress-bar"
              className={`h-full rounded-full transition-all duration-700 ${completionPct === 100 ? "bg-gradient-to-r from-orange-500 to-red-500" : "bg-orange-400"}`}
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Habit list */}
      <div className="px-6 pt-5 space-y-3">
        {habits.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 dark:text-gray-500 font-manrope text-sm">No habits yet. Add some in Settings.</p>
          </div>
        ) : (
          <>
            {/* Due Today habits */}
            {scheduledHabits.map((habit) => {
              const done = !!completions[habit.habit_id];
              const isAnimating = animating[habit.habit_id];
              return (
                <button
                  key={habit.habit_id}
                  data-testid={`habit-toggle-${habit.habit_id}`}
                  onClick={() => setSelectedHabit(habit)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-300 active:scale-[0.98] ${
                    done
                      ? "bg-orange-50 border-orange-300 shadow-sm"
                      : "bg-white dark:bg-gray-950 border-gray-100 dark:border-gray-800 hover:border-orange-200 hover:shadow-md shadow-sm"
                    } ${isAnimating ? "scale-[0.97]" : "scale-100"}`}
                >
                  <div
                    onClick={(e) => { e.stopPropagation(); toggleHabit(habit); }}
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${done
                      ? "bg-orange-500 border-orange-500 shadow-lg shadow-orange-200 hover:bg-orange-600"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 hover:border-orange-300"
                      }`}
                  >
                    {done && (
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold font-chivo text-base ${done ? "text-gray-500 dark:text-gray-500 line-through" : "text-gray-900 dark:text-white"}`}>
                      {habit.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {habit.context && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope truncate">For: {habit.context}</p>
                      )}
                      <FrequencyBadge habit={habit} />
                    </div>
                    {habit.frequency_type === "times_per_week" && (
                      <div className="mt-1">
                        <WeeklyProgressDots habit={habit} weekCompletions={weeklyCompletions[habit.habit_id] || 0} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="flex gap-0.5">
                      {[1, 2, 3].map((s) => (
                        <span key={s} className={`text-xs ${s <= habit.priority ? "text-orange-500" : "text-gray-200"}`}>★</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[11px] font-bold font-chivo">History</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Rest Day habits — dimmed section */}
            {restDayHabits.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-3">
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-manrope uppercase tracking-widest">Rest Day</span>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                </div>
                {restDayHabits.map((habit) => {
                  const done = !!completions[habit.habit_id];
                  const isAnimating = animating[habit.habit_id];
                  return (
                    <button
                      key={habit.habit_id}
                      data-testid={`habit-toggle-${habit.habit_id}`}
                      onClick={() => setSelectedHabit(habit)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-300 active:scale-[0.98] opacity-50 ${
                        done
                          ? "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 shadow-sm"
                          : "bg-white dark:bg-gray-950 border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:border-gray-700 shadow-sm"
                        } ${isAnimating ? "scale-[0.97]" : "scale-100"}`}
                    >
                      <div
                        onClick={(e) => { e.stopPropagation(); toggleHabit(habit); }}
                        className={`w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${done
                          ? "bg-gray-400 border-gray-400"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 hover:border-gray-300"
                          }`}
                      >
                        {done && (
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold font-chivo text-base ${done ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-500 dark:text-gray-500"}`}>
                          {habit.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <FrequencyBadge habit={habit} />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <div className="flex gap-0.5">
                          {[1, 2, 3].map((s) => (
                            <span key={s} className={`text-xs ${s <= habit.priority ? "text-gray-300" : "text-gray-200"}`}>★</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* Mood check-in */}
      <div className="px-6 mt-6">
        <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold font-chivo text-gray-900 dark:text-white text-sm">How are you feeling?</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-manrope">Mood tracking reveals patterns over time</p>
            </div>
            {todayMood && (
              <span className="text-xl" data-testid="today-mood-display">
                {MOOD_OPTIONS.find((m) => m.rating === todayMood.rating)?.emoji}
              </span>
            )}
          </div>

          {!todayMood && !showMoodForm && (
            <div className="flex justify-between">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.rating}
                  data-testid={`mood-btn-${m.rating}`}
                  onClick={() => { setMoodRating(m.rating); setShowMoodForm(true); }}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors active:scale-95"
                >
                  <span className="text-2xl">{m.emoji}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-manrope">{m.label}</span>
                </button>
              ))}
            </div>
          )}

          {showMoodForm && (
            <div className="animate-in fade-in duration-300">
              <div className="flex justify-between mb-4">
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m.rating}
                    onClick={() => setMoodRating(m.rating)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 ${moodRating === m.rating ? "bg-orange-50 ring-2 ring-orange-300" : ""
                      }`}
                  >
                    <span className="text-2xl">{m.emoji}</span>
                  </button>
                ))}
              </div>
              <textarea
                value={gratitude}
                onChange={(e) => setGratitude(e.target.value)}
                placeholder="What are you grateful for today? (optional)"
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-manrope resize-none focus:outline-none focus:ring-2 focus:ring-orange-300 mb-3"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowMoodForm(false)}
                  className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-500 font-chivo font-bold text-sm uppercase tracking-wide rounded-xl active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  data-testid="mood-submit-btn"
                  onClick={submitMood}
                  disabled={!moodRating}
                  className="flex-1 py-2.5 bg-orange-500 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl disabled:opacity-40 active:scale-95 transition-all"
                >
                  Log Mood
                </button>
              </div>
            </div>
          )}

          {todayMood && !showMoodForm && (
            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/50 rounded-xl p-3">
              <p className="text-xs text-orange-700 dark:text-orange-400 font-manrope">
                {todayMood.gratitude ? `Grateful for: "${todayMood.gratitude}"` : "Mood logged for today"}
              </p>
              <button onClick={() => { setMoodRating(todayMood.rating); setGratitude(todayMood.gratitude || ""); setShowMoodForm(true); }}
                className="text-xs text-orange-500 font-bold font-chivo mt-1">Edit</button>
            </div>
          )}
        </div>
      </div>

      {/* Wellness warning modal */}
      {wellnessWarning && (
        <WellnessModal warning={wellnessWarning} onClose={() => setWellnessWarning(null)} />
      )}

      {/* Habit Detail Modal */}
      {selectedHabit && (
        <HabitDetailModal
          habit={selectedHabit}
          isOpen={!!selectedHabit}
          onClose={() => setSelectedHabit(null)}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}
