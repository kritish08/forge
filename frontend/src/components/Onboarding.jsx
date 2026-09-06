import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";
import { FrequencyPicker, FrequencyBadge } from "./FrequencyPicker";

const MODES = [
  {
    id: "supportive",
    label: "Supportive",
    subtitle: "Warm coaching",
    desc: "Celebrate progress, gentle guidance, encouraging tone. Best for building initial momentum.",
    icon: "🌱",
    color: "border-green-200 bg-green-50",
    activeColor: "border-green-500 bg-green-50 ring-2 ring-green-200",
  },
  {
    id: "strategic",
    label: "Strategic",
    subtitle: "Data-driven",
    desc: "Pattern recognition, optimization insights, analytical feedback. For performance-focused builders.",
    icon: "📊",
    color: "border-blue-200 bg-blue-50",
    activeColor: "border-blue-500 bg-blue-50 ring-2 ring-blue-200",
  },
  {
    id: "direct",
    label: "Direct",
    subtitle: "Brutally honest",
    desc: "Zero tolerance. Raw truth. Harsh feedback. Requires activation reason. Not for the faint-hearted.",
    icon: "⚡",
    color: "border-orange-200 bg-orange-50",
    activeColor: "border-orange-500 bg-orange-50 ring-2 ring-orange-200",
  },
];

export default function Onboarding() {
  const { setUser } = useAuth();
  const [step, setStep] = useState(1);
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState({ name: "", priority: 1, context: "", frequency_type: "daily", frequency_days: [], frequency_target: 7 });
  const [mode, setMode] = useState("supportive");
  const [directReason, setDirectReason] = useState("");
  const [loading, setLoading] = useState(false);

  const addHabit = () => {
    if (!newHabit.name.trim()) return;
    if (newHabit.frequency_type === "specific_days" && newHabit.frequency_days.length === 0) {
      toast.error("Select at least one day.");
      return;
    }
    setHabits([...habits, { ...newHabit, id: Date.now() }]);
    setNewHabit({ name: "", priority: 1, context: "", frequency_type: "daily", frequency_days: [], frequency_target: 7 });
  };

  const removeHabit = (id) => setHabits(habits.filter((h) => h.id !== id));

  const finish = async () => {
    if (mode === "direct" && !directReason.trim()) {
      toast.error("Please provide your reason for Direct Mode.");
      return;
    }
    setLoading(true);
    try {
      // Create habits
      for (const h of habits) {
        await api.post("/habits", {
          name: h.name, priority: h.priority, context: h.context,
          frequency_type: h.frequency_type, frequency_days: h.frequency_days, frequency_target: h.frequency_target
        });
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Update user settings
      const res = await api.put("/user/settings", {
        mode,
        direct_mode_reason: directReason,
        onboarding_completed: true,
        timezone: tz,
      });
      setUser(res.data);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col max-w-lg mx-auto px-6 py-8">
      {/* Progress dots */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${s <= step ? "bg-orange-500" : "bg-gray-100 dark:bg-gray-800"}`}
          />
        ))}
      </div>

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-8">
            <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-200">
              <span className="text-3xl">🔥</span>
            </div>
            <h1 className="text-4xl font-black text-gray-900 dark:text-white font-chivo tracking-tight mb-3">
              Welcome to<br />FORGE
            </h1>
            <p className="text-gray-500 dark:text-gray-500 font-manrope text-base leading-relaxed">
              This isn't a generic habit tracker. Forge studies your patterns, remembers your history,
              and gives you insights no one else can.
            </p>
          </div>
          <div className="space-y-3 mb-10">
            {[
              "Track habits with priority weighting",
              "AI that detects your unique patterns",
              "Insights that evolve as you grow",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-gray-700 dark:text-gray-300 font-manrope text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
          <button
            data-testid="onboarding-next-step1"
            onClick={() => setStep(2)}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-chivo font-bold tracking-wide uppercase rounded-xl shadow-lg shadow-orange-200 active:scale-95 transition-all"
          >
            Let's Build Your System
          </button>
        </div>
      )}

      {/* Step 2: Add habits */}
      {step === 2 && (
        <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white font-chivo mb-1">Your Habits</h2>
            <p className="text-gray-500 dark:text-gray-500 text-sm font-manrope">
              Add 3–5 habits. Priority determines point weight (⭐ = 1pt, ⭐⭐⭐ = 3pts daily).
            </p>
          </div>

          {/* Habit list */}
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {habits.map((h) => (
              <div key={h.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-800">
                <div className="flex gap-0.5">
                  {[1, 2, 3].map((s) => (
                    <span key={s} className={`text-sm ${s <= h.priority ? "text-orange-500" : "text-gray-200"}`}>★</span>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 font-manrope truncate">{h.name}</p>
                  <div className="flex items-center gap-2">
                    {h.context && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">For: {h.context}</p>}
                    <FrequencyBadge habit={h} />
                  </div>
                </div>
                <button onClick={() => removeHabit(h.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Add habit form */}
          <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100 mb-6">
            <input
              data-testid="habit-name-input"
              value={newHabit.name}
              onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addHabit()}
              placeholder="Habit name (e.g. Morning run)"
              className="w-full bg-white dark:bg-gray-950 border border-orange-200 rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <input
              value={newHabit.context}
              onChange={(e) => setNewHabit({ ...newHabit, context: e.target.value })}
              placeholder="What is this for? (optional)"
              className="w-full bg-white dark:bg-gray-950 border border-orange-200 rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs text-gray-500 dark:text-gray-500 font-manrope">Priority:</span>
              {[1, 2, 3].map((p) => (
                <button
                  key={p}
                  onClick={() => setNewHabit({ ...newHabit, priority: p })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    newHabit.priority === p
                      ? "bg-orange-500 text-white"
                      : "bg-white dark:bg-gray-950 border border-orange-200 text-orange-400"
                  }`}
                >
                  {"⭐".repeat(p)}
                </button>
              ))}
            </div>
            <FrequencyPicker
              frequencyType={newHabit.frequency_type}
              frequencyDays={newHabit.frequency_days}
              frequencyTarget={newHabit.frequency_target}
              onChange={(f) => setNewHabit({ ...newHabit, ...f })}
            />
            <div className="mt-3" />
            <button
              data-testid="add-habit-btn"
              onClick={addHabit}
              disabled={!newHabit.name.trim()}
              className="w-full py-3 bg-orange-500 text-white font-chivo font-bold text-sm uppercase tracking-wide rounded-xl disabled:opacity-40 active:scale-95 transition-all"
            >
              + Add Habit
            </button>
          </div>

          <button
            data-testid="onboarding-next-step2"
            onClick={() => setStep(3)}
            disabled={habits.length === 0}
            className="w-full py-4 bg-gray-900 text-white font-chivo font-bold tracking-wide uppercase rounded-xl disabled:opacity-40 active:scale-95 transition-all"
          >
            Next: Choose Your Mode →
          </button>
        </div>
      )}

      {/* Step 3: Choose mode */}
      {step === 3 && (
        <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white font-chivo mb-1">Your Coach Mode</h2>
            <p className="text-gray-500 dark:text-gray-500 text-sm font-manrope">
              Choose how FORGE talks to you. You can change this anytime.
            </p>
          </div>

          <div className="space-y-3 mb-6">
            {MODES.map((m) => (
              <button
                key={m.id}
                data-testid={`mode-select-${m.id}`}
                onClick={() => setMode(m.id)}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  mode === m.id ? m.activeColor : m.color
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xl">{m.icon}</span>
                  <div>
                    <span className="font-bold font-chivo text-gray-900 dark:text-white">{m.label}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-500 ml-2 font-manrope">{m.subtitle}</span>
                  </div>
                  {mode === m.id && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500 font-manrope leading-relaxed ml-8">{m.desc}</p>
              </button>
            ))}
          </div>

          {mode === "direct" && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-xs text-red-700 font-manrope font-medium mb-2">
                Why do you want Direct Mode? Be honest — the AI will reference this.
              </p>
              <textarea
                data-testid="direct-reason-input"
                value={directReason}
                onChange={(e) => setDirectReason(e.target.value)}
                placeholder="e.g., I keep making excuses. I need someone to call me out..."
                className="w-full bg-white dark:bg-gray-950 border border-red-200 rounded-xl px-3 py-2 text-sm font-manrope resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                rows={3}
              />
            </div>
          )}

          <button
            data-testid="complete-onboarding-btn"
            onClick={finish}
            disabled={loading || (mode === "direct" && !directReason.trim())}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 text-white font-chivo font-bold tracking-wide uppercase rounded-xl shadow-lg shadow-orange-200 disabled:opacity-40 active:scale-95 transition-all"
          >
            {loading ? "Setting up..." : "Start Forging 🔥"}
          </button>
        </div>
      )}
    </div>
  );
}
