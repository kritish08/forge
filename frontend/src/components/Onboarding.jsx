import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { toast } from "sonner";
import { FrequencyBadge } from "./FrequencyPicker";
import { HabitFields, TemplatePicker, EMPTY_HABIT } from "./HabitForm";
import Sheet from "./Sheet";
import { Trash, Plus, Check } from "./icons";
import { deviceTimeZone } from "../utils/date";

// Direct mode is the one choice with a consequence, so it is the only one
// flagged. The other two are presented as a preference, not a warning.
const MODES = [
  {
    id: "supportive",
    label: "Supportive",
    desc: "Warm and encouraging. Celebrates what's working and stays gentle when it isn't.",
  },
  {
    id: "strategic",
    label: "Strategic",
    desc: "Analytical. Looks for patterns in your data and suggests adjustments.",
  },
  {
    id: "direct",
    label: "Direct",
    desc: "Blunt, with no softening. It will quote your own reason back at you.",
    caution: true,
  },
];

const STEPS = ["Welcome", "Habits", "Coaching"];

export default function Onboarding() {
  const { setUser } = useAuth();
  const [step, setStep] = useState(1);
  const [habits, setHabits] = useState([]);
  const [draft, setDraft] = useState(null);
  const [mode, setMode] = useState("supportive");
  const [directReason, setDirectReason] = useState("");
  const [loading, setLoading] = useState(false);

  const commitDraft = () => {
    if (!draft?.name.trim()) return;
    if (draft.frequency_type === "specific_days" && draft.frequency_days.length === 0) {
      toast.error("Pick at least one day for this habit.");
      return;
    }
    setHabits((hs) => [...hs, { ...draft, id: `${Date.now()}-${hs.length}` }]);
    setDraft(null);
  };

  const finish = async () => {
    if (mode === "direct" && !directReason.trim()) {
      toast.error("Direct mode needs a reason — it's what the coach holds you to.");
      return;
    }
    setLoading(true);
    try {
      // Created in parallel: this used to be a sequential await loop, so five
      // habits meant five round trips before anything happened.
      await Promise.all(habits.map((h) => api.post("/habits", {
        name: h.name, priority: h.priority, context: h.context,
        frequency_type: h.frequency_type, frequency_days: h.frequency_days,
        frequency_target: h.frequency_target,
      })));
      const res = await api.put("/user/settings", {
        mode,
        direct_mode_reason: directReason,
        onboarding_completed: true,
        timezone: deviceTimeZone(),
      });
      setUser(res.data);
    } catch {
      toast.error("Couldn't finish setting up. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div
      className="mx-auto flex min-h-screen max-w-lg flex-col bg-surface px-5"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
      }}
    >
      {/* Progress. Named steps rather than anonymous dots, so it's clear what's
          left — and there is now a way back from every one of them. */}
      <div className="mb-6 flex items-center gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={back}
            aria-label="Back"
            className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors active:bg-surface-sunk"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5" aria-hidden="true"><path d="M15 19 8 12l7-7" /></svg>
          </button>
        ) : <div className="h-8 w-8 shrink-0" />}
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1 rounded-full ${i < step ? "bg-accent" : "bg-surface-sunk"}`} />
              <span className={`mt-1.5 block text-[11px] ${i < step ? "text-ink-muted" : "text-ink-subtle"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 1. Welcome ─────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="flex flex-1 flex-col">
          <div className="mb-8 mt-4">
            <h1 className="font-chivo text-[34px] font-bold leading-[1.1] tracking-tight text-ink">
              Let's set up<br />your habits
            </h1>
            <p className="mt-3 max-w-[38ch] leading-relaxed text-ink-muted">
              Three quick steps. You can change any of it later.
            </p>
          </div>
          <ul className="mb-10 space-y-3.5">
            {[
              "Pick a few habits — start smaller than you think",
              "FORGE watches when you actually follow through",
              "You get insights from your own patterns, not generic advice",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-[15px] leading-snug text-ink">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto">
            <button
              type="button"
              data-testid="onboarding-next-step1"
              onClick={() => setStep(2)}
              className="w-full rounded-xl bg-accent py-4 font-chivo font-bold text-accent-contrast transition-transform active:scale-[0.98]"
            >
              Get started
            </button>
          </div>
        </div>
      )}

      {/* ── 2. Habits ──────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="flex flex-1 flex-col">
          <h2 className="font-chivo text-2xl font-bold tracking-tight text-ink">Your habits</h2>
          <p className="mb-5 mt-1.5 text-[15px] leading-relaxed text-ink-muted">
            Two or three is a good start. Adding ten and keeping none is the usual failure.
          </p>

          {habits.length > 0 && (
            <ul className="mb-4 overflow-hidden rounded-2xl border border-line bg-surface-raised">
              {habits.map((h) => (
                <li key={h.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">{h.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <FrequencyBadge habit={h} />
                      <span className="text-xs text-ink-subtle">{h.priority} pt{h.priority > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${h.name}`}
                    onClick={() => setHabits((hs) => hs.filter((x) => x.id !== h.id))}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors active:bg-surface-sunk"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <TemplatePicker
            taken={habits.map((h) => h.name)}
            onPick={(t) => setDraft(t)}
            onBlank={() => setDraft({ ...EMPTY_HABIT })}
          />

          <div className="mt-6">
            <button
              type="button"
              data-testid="onboarding-next-step2"
              onClick={() => setStep(3)}
              disabled={habits.length === 0}
              className="w-full rounded-xl bg-accent py-4 font-chivo font-bold text-accent-contrast transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              {habits.length === 0
                ? "Add at least one habit"
                : `Continue with ${habits.length} habit${habits.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* ── 3. Coaching ────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="flex flex-1 flex-col">
          <h2 className="font-chivo text-2xl font-bold tracking-tight text-ink">How should the coach talk to you?</h2>
          <p className="mb-5 mt-1.5 text-[15px] leading-relaxed text-ink-muted">
            You can switch at any time from the Coach tab.
          </p>

          <div className="space-y-2.5">
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`mode-select-${m.id}`}
                  onClick={() => setMode(m.id)}
                  aria-pressed={active}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    active
                      ? m.caution ? "border-danger bg-danger-soft" : "border-accent bg-accent-soft"
                      : "border-line bg-surface-raised"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-chivo text-[15px] font-bold text-ink">{m.label}</span>
                    {active && (
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-accent-contrast ${m.caution ? "bg-danger" : "bg-accent"}`}>
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{m.desc}</p>
                </button>
              );
            })}
          </div>

          {mode === "direct" && (
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Why do you want this?</span>
              <textarea
                data-testid="direct-reason-input"
                value={directReason}
                onChange={(e) => setDirectReason(e.target.value)}
                rows={3}
                placeholder="e.g. I keep talking myself out of things and I want that called out."
                className="w-full resize-none rounded-xl border border-line bg-surface-sunk px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-subtle focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/30"
              />
            </label>
          )}

          <div className="mt-auto pt-6">
            <button
              type="button"
              data-testid="complete-onboarding-btn"
              onClick={finish}
              disabled={loading || (mode === "direct" && !directReason.trim())}
              className="w-full rounded-xl bg-accent py-4 font-chivo font-bold text-accent-contrast transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              {loading ? "Setting up…" : "Start tracking"}
            </button>
          </div>
        </div>
      )}

      {/* Editing a habit before it's added */}
      <Sheet
        open={!!draft}
        onClose={() => setDraft(null)}
        title="New habit"
        footer={
          <div className="flex gap-3 pb-1">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-xl border border-line px-4 py-3 font-chivo text-sm font-bold text-ink-muted transition-transform active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="add-habit-btn"
              onClick={commitDraft}
              disabled={!draft?.name.trim()}
              className="flex-1 rounded-xl bg-accent py-3 font-chivo text-sm font-bold text-accent-contrast transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />Add habit</span>
            </button>
          </div>
        }
      >
        <div className="pb-4">
          {draft && <HabitFields value={draft} onChange={setDraft} autoFocus />}
        </div>
      </Sheet>
    </div>
  );
}
