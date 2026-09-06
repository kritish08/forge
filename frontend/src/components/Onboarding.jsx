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
    color: "border-line",
    activeColor: "border-accent bg-accent-soft",
  },
  {
    id: "strategic",
    label: "Strategic",
    subtitle: "Data-driven",
    desc: "Pattern recognition, optimization insights, analytical feedback. For performance-focused builders.",
    color: "border-line",
    activeColor: "border-accent bg-accent-soft",
  },
  {
    id: "direct",
    label: "Direct",
    subtitle: "Brutally honest",
    desc: "Zero tolerance. Raw truth. Harsh feedback. Requires activation reason. Not for the faint-hearted.",
    color: "border-line",
    activeColor: "border-danger bg-danger-soft",
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
    <div className="min-h-screen bg-surface-raised flex flex-col max-w-lg mx-auto px-6 py-8">
      {/* Progress dots */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${s <= step ?"bg-accent" : "bg-surface-sunk"}`}
          />
        ))}
      </div>

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-8">
            <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mb-6">
              <span className="text-3xl">🔥</span>
            </div>
            <h1 className="text-4xl font-black text-ink font-chivo tracking-tight mb-3">
              Welcome to<br />FORGE
            </h1>
            <p className="text-ink-muted font-manrope text-base leading-relaxed">
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
                <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-ink font-manrope text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
          <button
            data-testid="onboarding-next-step1"
            onClick={() => setStep(2)}
            className="w-full py-4 bg-accent text-white font-chivo font-bold rounded-xl active:scale-95 transition-all"
          >
            Let's Build Your System
          </button>
        </div>
      )}

      {/* Step 2: Add habits */}
      {step === 2 && (
        <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-ink font-chivo mb-1">Your Habits</h2>
            <p className="text-ink-muted text-sm font-manrope">
              Add 3–5 habits. Priority determines point weight (⭐ = 1pt, ⭐⭐⭐ = 3pts daily).
            </p>
          </div>

          {/* Habit list */}
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {habits.map((h) => (
              <div key={h.id} className="flex items-center gap-2 bg-surface-sunk rounded-xl p-3 border border-line">
                <div className="flex gap-0.5">
                  {[1, 2, 3].map((s) => (
                    <span key={s} className={`text-sm ${s <= h.priority ?"text-accent" : "text-ink-subtle"}`}>★</span>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink font-manrope truncate">{h.name}</p>
                  <div className="flex items-center gap-2">
                    {h.context && <p className="text-xs text-ink-subtle truncate">For: {h.context}</p>}
                    <FrequencyBadge habit={h} />
                  </div>
                </div>
                <button onClick={() => removeHabit(h.id)} className="text-ink-subtle hover:text-danger transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Add habit form */}
          <div className="bg-accent-soft rounded-2xl p-4 border border-accent/25 mb-6">
            <input
              data-testid="habit-name-input"
              value={newHabit.name}
              onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addHabit()}
              placeholder="Habit name (e.g. Morning run)"
              className="w-full bg-surface-raised border border-accent/25 rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              value={newHabit.context}
              onChange={(e) => setNewHabit({ ...newHabit, context: e.target.value })}
              placeholder="What is this for? (optional)"
              className="w-full bg-surface-raised border border-accent/25 rounded-xl px-4 py-3 text-sm font-manrope mb-3 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs text-ink-muted font-manrope">Priority:</span>
              {[1, 2, 3].map((p) => (
                <button
                  key={p}
                  onClick={() => setNewHabit({ ...newHabit, priority: p })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${ newHabit.priority === p ?"bg-accent text-white"
                      : "bg-surface-raised border border-accent/25 text-accent"
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
              className="w-full py-3 bg-accent text-white font-chivo font-bold text-sm rounded-xl disabled:opacity-40 active:scale-95 transition-all"
            >
              + Add Habit
            </button>
          </div>

          <button
            data-testid="onboarding-next-step2"
            onClick={() => setStep(3)}
            disabled={habits.length === 0}
            className="w-full py-4 bg-ink text-white font-chivo font-bold rounded-xl disabled:opacity-40 active:scale-95 transition-all"
          >
            Next: Choose Your Mode →
          </button>
        </div>
      )}

      {/* Step 3: Choose mode */}
      {step === 3 && (
        <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-ink font-chivo mb-1">Your Coach Mode</h2>
            <p className="text-ink-muted text-sm font-manrope">
              Choose how FORGE talks to you. You can change this anytime.
            </p>
          </div>

          <div className="space-y-3 mb-6">
            {MODES.map((m) => (
              <button
                key={m.id}
                data-testid={`mode-select-${m.id}`}
                onClick={() => setMode(m.id)}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${ mode === m.id ? m.activeColor : m.color }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <div>
                    <span className="font-bold font-chivo text-ink">{m.label}</span>
                    <span className="text-xs text-ink-muted ml-2 font-manrope">{m.subtitle}</span>
                  </div>
                  {mode === m.id && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-xs text-ink-muted font-manrope leading-relaxed ml-8">{m.desc}</p>
              </button>
            ))}
          </div>

          {mode === "direct" && (
            <div className="mb-4 bg-danger-soft border border-danger/25 rounded-2xl p-4">
              <p className="text-xs text-danger font-manrope font-medium mb-2">
                Why do you want Direct Mode? Be honest — the AI will reference this.
              </p>
              <textarea
                data-testid="direct-reason-input"
                value={directReason}
                onChange={(e) => setDirectReason(e.target.value)}
                placeholder="e.g., I keep making excuses. I need someone to call me out..."
                className="w-full bg-surface-raised border border-danger/25 rounded-xl px-3 py-2 text-sm font-manrope resize-none focus:outline-none focus:ring-2 focus:ring-danger"
                rows={3}
              />
            </div>
          )}

          <button
            data-testid="complete-onboarding-btn"
            onClick={finish}
            disabled={loading || (mode === "direct" && !directReason.trim())}
            className="w-full py-4 bg-accent text-white font-chivo font-bold rounded-xl disabled:opacity-40 active:scale-95 transition-all"
          >
            {loading ? "Setting up..." : "Start Forging 🔥"}
          </button>
        </div>
      )}
    </div>
  );
}
