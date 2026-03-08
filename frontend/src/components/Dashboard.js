import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";
import HabitDetailModal from "./HabitDetailModal";

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
      <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 animate-in slide-in-from-bottom-4 duration-300">
        <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-xl">💙</span>
          </div>
          <div>
            <h3 className="font-bold font-chivo text-gray-900 mb-1">Checking In</h3>
            <p className="text-sm text-gray-600 font-manrope leading-relaxed">{warning.message}</p>
          </div>
        </div>
        <div className="bg-red-50 rounded-2xl p-4 mb-4">
          <p className="text-xs font-bold text-red-700 mb-2 uppercase tracking-widest font-chivo">Resources</p>
          {warning.resources.map((r, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-red-100 last:border-0">
              <span className="text-sm font-manrope text-gray-700">{r.name}</span>
              <span className="text-sm font-bold text-red-600 font-manrope">{r.contact}</span>
            </div>
          ))}
        </div>
        <button
          data-testid="wellness-modal-close"
          onClick={onClose}
          className="w-full py-3 bg-gray-900 text-white font-chivo font-bold text-sm tracking-wide uppercase rounded-xl active:scale-95 transition-all"
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

    setAnimating((prev) => ({ ...prev, [habit.habit_id]: true }));
    setTimeout(() => setAnimating((prev) => ({ ...prev, [habit.habit_id]: false })), 400);

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
      const statsRes = await api.get("/analytics/stats");
      setStats(statsRes.data);
    } catch {
      setCompletions(prevCompletions);
      toast.error("Failed to update. Try again.");
    }
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

  const completionPct = stats.max_today_points > 0
    ? Math.round(stats.today_points / stats.max_today_points * 100)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 pt-12 pb-5 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-xs text-gray-400 font-manrope uppercase tracking-widest">{today}</p>
            <h1 className="text-2xl font-black text-gray-900 font-chivo">
              {stats.habits_today === stats.habits_total && stats.habits_total > 0
                ? "Perfect Day! 🔥"
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
              <span className="text-sm font-black text-gray-900 font-chivo tracking-tight">FORGE</span>
            </div>
            {user?.picture && (
              <img src={user.picture} alt="avatar" className="w-9 h-9 rounded-full border-2 border-orange-200" />
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-3">
          <div data-testid="streak-counter" className="flex items-center gap-1.5 bg-orange-50 rounded-xl px-3 py-2 border border-orange-100">
            <span className="text-orange-500 text-lg">🔥</span>
            <div>
              <p className="text-xs text-gray-400 font-manrope leading-none">Streak</p>
              <p className="text-base font-black text-gray-900 font-chivo leading-tight">{stats.streak}d</p>
            </div>
          </div>
          <div data-testid="points-display" className="flex items-center gap-1.5 bg-yellow-50 rounded-xl px-3 py-2 border border-yellow-100">
            <span className="text-yellow-500 text-lg">⚡</span>
            <div>
              <p className="text-xs text-gray-400 font-manrope leading-none">Today</p>
              <p className="text-base font-black text-gray-900 font-chivo leading-tight">{stats.today_points}pt</p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-1.5 bg-blue-50 rounded-xl px-3 py-2 border border-blue-100">
            <span className="text-blue-500 text-sm font-bold font-chivo">Lv.{stats.level}</span>
            <div className="flex-1">
              <p className="text-xs text-gray-400 font-manrope leading-none">Level</p>
              <div className="h-1.5 bg-blue-100 rounded-full mt-0.5 overflow-hidden">
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
            <span className="text-xs text-gray-400 font-manrope">Daily Progress</span>
            <span className="text-xs font-bold text-gray-700 font-chivo">
              {stats.habits_today}/{stats.habits_total} habits · {completionPct}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
            <p className="text-gray-400 font-manrope text-sm">No habits yet. Add some in Settings.</p>
          </div>
        ) : (
          habits.map((habit) => {
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
                    : "bg-white border-gray-100 hover:border-orange-200 hover:shadow-md shadow-sm"
                  } ${isAnimating ? "scale-[0.97]" : "scale-100"}`}
              >
                {/* Check button (Click to toggle today's completion) */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleHabit(habit);
                  }}
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${done
                    ? "bg-orange-500 border-orange-500 shadow-lg shadow-orange-200 hover:bg-orange-600"
                    : "border-gray-200 bg-white hover:border-orange-300"
                    }`}
                >
                  {done && (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`font-bold font-chivo text-base ${done ? "text-gray-500 line-through" : "text-gray-900"}`}>
                    {habit.name}
                  </p>
                  {habit.context && (
                    <p className="text-xs text-gray-400 font-manrope truncate mt-0.5">For: {habit.context}</p>
                  )}
                </div>

                {/* Right side: priority + calendar cue */}
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
          })
        )}
      </div>

      {/* Mood check-in */}
      <div className="px-6 mt-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold font-chivo text-gray-900 text-sm">How are you feeling?</h3>
              <p className="text-xs text-gray-400 font-manrope">Mood tracking reveals patterns over time</p>
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
                  className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-orange-50 transition-colors active:scale-95"
                >
                  <span className="text-2xl">{m.emoji}</span>
                  <span className="text-xs text-gray-400 font-manrope">{m.label}</span>
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
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-manrope resize-none focus:outline-none focus:ring-2 focus:ring-orange-300 mb-3"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowMoodForm(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-500 font-chivo font-bold text-sm uppercase tracking-wide rounded-xl active:scale-95 transition-all"
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
            <div className="bg-orange-50 rounded-xl p-3">
              <p className="text-xs text-orange-700 font-manrope">
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
