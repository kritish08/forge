import { useState } from "react";
import { FrequencyPicker } from "./FrequencyPicker";
import Sheet from "./Sheet";

/**
 * Habit creation, in one place.
 *
 * The add-habit form was written twice — once in Onboarding, once in Settings —
 * and neither was reachable from the screen where habits actually live. It is
 * now one component, used by all three.
 */

export const EMPTY_HABIT = {
  name: "", priority: 1, context: "",
  frequency_type: "daily", frequency_days: [], frequency_target: 7,
};

/**
 * Starters, so step two of onboarding isn't a blank text field.
 *
 * A new user previously had to invent their entire system from nothing before
 * the Next button would enable. These are deliberately concrete — "Walk 20
 * minutes", not "Exercise" — because a vague habit is the one people drop first.
 */
export const HABIT_TEMPLATES = [
  {
    group: "Body",
    items: [
      { name: "Walk 20 minutes", context: "Move every day, no matter how small", priority: 1 },
      { name: "Strength session", context: "Build strength that lasts", priority: 3, frequency_type: "times_per_week", frequency_target: 3 },
      { name: "Lights out by 11", context: "Sleep is the whole foundation", priority: 2 },
      { name: "Drink water first", context: "Before coffee, before anything", priority: 1 },
    ],
  },
  {
    group: "Mind",
    items: [
      { name: "Read 20 pages", context: "Finish the books I start", priority: 2 },
      { name: "Ten minutes quiet", context: "Sit with my own thoughts", priority: 1 },
      { name: "Write one page", context: "Think more clearly on paper", priority: 2 },
      { name: "No phone in bed", context: "Get my evenings back", priority: 3 },
    ],
  },
  {
    group: "Work",
    items: [
      { name: "Deep work block", context: "Two hours before the inbox", priority: 3, frequency_type: "specific_days", frequency_days: [0, 1, 2, 3, 4] },
      { name: "Plan tomorrow", context: "Decide tonight, not at 9am", priority: 2 },
      { name: "Inbox to zero", context: "Stop carrying it around", priority: 1, frequency_type: "specific_days", frequency_days: [4] },
    ],
  },
];

const PRIORITY_LABELS = {
  1: { label: "Nice to do", hint: "1 point" },
  2: { label: "Important", hint: "2 points" },
  3: { label: "Non-negotiable", hint: "3 points" },
};

/** The form body. Used inline in Onboarding and inside a Sheet elsewhere. */
export function HabitFields({ value, onChange, autoFocus = false }) {
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">What's the habit?</span>
        <input
          data-testid="habit-name-input"
          autoFocus={autoFocus}
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Walk 20 minutes"
          className="w-full rounded-xl border border-line bg-surface-sunk px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Why does it matter? <span className="font-normal text-ink-subtle">Optional</span>
        </span>
        <input
          value={value.context}
          onChange={(e) => set({ context: e.target.value })}
          placeholder="The coach quotes this back when you're wavering"
          className="w-full rounded-xl border border-line bg-surface-sunk px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink">How much does it count?</span>
        <div className="flex gap-2">
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => set({ priority: p })}
              aria-pressed={value.priority === p}
              className={`flex-1 rounded-xl border px-2 py-2.5 text-center transition-colors ${
                value.priority === p ? "border-accent bg-accent-soft" : "border-line"
              }`}
            >
              <span className={`block text-[13px] font-semibold ${value.priority === p ? "text-accent-bold" : "text-ink"}`}>
                {PRIORITY_LABELS[p].label}
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-subtle">{PRIORITY_LABELS[p].hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Points add up to your level. Weighting the hard ones higher means a day
          where you did the difficult thing scores better than one where you didn't.
        </p>
      </div>

      <FrequencyPicker
        frequencyType={value.frequency_type}
        frequencyDays={value.frequency_days}
        frequencyTarget={value.frequency_target}
        onChange={(f) => set(f)}
      />
    </div>
  );
}

/** Template chooser — a grid of starters plus a "start blank" escape hatch. */
export function TemplatePicker({ onPick, onBlank, taken = [] }) {
  return (
    <div className="space-y-5">
      {HABIT_TEMPLATES.map(({ group, items }) => (
        <div key={group}>
          <h3 className="mb-2 px-1 text-[13px] font-semibold text-ink-muted">{group}</h3>
          <div className="grid grid-cols-2 gap-2">
            {items.map((t) => {
              const used = taken.includes(t.name);
              return (
                <button
                  key={t.name}
                  type="button"
                  disabled={used}
                  onClick={() => onPick({ ...EMPTY_HABIT, ...t })}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    used ? "border-line bg-surface-sunk opacity-50" : "border-line active:bg-surface-sunk"
                  }`}
                >
                  <span className="block text-[13px] font-semibold leading-snug text-ink">{t.name}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-subtle">
                    {used ? "Added" : t.context}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={onBlank}
        className="w-full rounded-xl border border-dashed border-line-strong py-3 text-sm font-semibold text-ink-muted transition-colors active:bg-surface-sunk"
      >
        Write my own instead
      </button>
    </div>
  );
}

/** Full add-habit flow in a sheet: templates first, then the form. */
export default function AddHabitSheet({ open, onClose, onCreate, existingNames = [] }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const close = () => { setDraft(null); onClose(); };

  const save = async () => {
    if (!draft?.name.trim()) return;
    if (draft.frequency_type === "specific_days" && draft.frequency_days.length === 0) return;
    setSaving(true);
    try {
      await onCreate(draft);
      close();
    } finally {
      setSaving(false);
    }
  };

  const invalid = !draft?.name.trim()
    || (draft?.frequency_type === "specific_days" && draft.frequency_days.length === 0);

  return (
    <Sheet
      open={open}
      onClose={close}
      title={draft ? "New habit" : "Add a habit"}
      description={draft ? undefined : "Start from one of these, or write your own."}
      footer={draft ? (
        <div className="flex gap-3 pb-1">
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="rounded-xl border border-line px-4 py-3 font-chivo text-sm font-bold text-ink-muted transition-transform active:scale-[0.98]"
          >
            Back
          </button>
          <button
            type="button"
            data-testid="save-habit-btn"
            onClick={save}
            disabled={invalid || saving}
            className="flex-1 rounded-xl bg-accent py-3 font-chivo text-sm font-bold text-accent-contrast transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add habit"}
          </button>
        </div>
      ) : undefined}
    >
      <div className="pb-4">
        {draft ? (
          <HabitFields value={draft} onChange={setDraft} autoFocus />
        ) : (
          <TemplatePicker
            taken={existingNames}
            onPick={(t) => setDraft(t)}
            onBlank={() => setDraft({ ...EMPTY_HABIT })}
          />
        )}
      </div>
    </Sheet>
  );
}
