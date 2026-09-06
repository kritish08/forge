import { weekdayIso } from "../utils/date";
// ── Frequency Picker ─────────────────────────────────────────────────────────
// Shared component for habit creation/editing across Settings and Onboarding
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function FrequencyPicker({ frequencyType, frequencyDays, frequencyTarget, onChange }) {
    const setType = (t) => onChange({ frequency_type: t, frequency_days: frequencyDays, frequency_target: frequencyTarget });
    const toggleDay = (d) => {
        const next = frequencyDays.includes(d)
            ? frequencyDays.filter(x => x !== d)
            : [...frequencyDays, d].sort();
        onChange({ frequency_type: frequencyType, frequency_days: next, frequency_target: frequencyTarget });
    };
    const setTarget = (n) => onChange({ frequency_type: frequencyType, frequency_days: frequencyDays, frequency_target: Math.max(1, Math.min(7, n)) });

    return (
        <div className="space-y-3">
            <span className="text-xs text-gray-500 dark:text-gray-500 font-manrope">Frequency:</span>

            {/* Segmented control */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
                {[
                    { id: "daily", label: "Every Day" },
                    { id: "specific_days", label: "Specific Days" },
                    { id: "times_per_week", label: "X Times/Week" },
                ].map(opt => (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => setType(opt.id)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold font-chivo transition-all ${
                            frequencyType === opt.id
                                ? "bg-orange-500 text-white shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Specific days — day bubbles */}
            {frequencyType === "specific_days" && (
                <div className="flex gap-2 justify-between">
                    {DAY_LABELS.map((label, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => toggleDay(i)}
                            className={`w-9 h-9 rounded-full text-xs font-bold font-chivo transition-all flex items-center justify-center ${
                                frequencyDays.includes(i)
                                    ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 hover:bg-gray-200"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* Times per week — stepper */}
            {frequencyType === "times_per_week" && (
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setTarget(frequencyTarget - 1)}
                        disabled={frequencyTarget <= 1}
                        className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-500 font-bold text-lg flex items-center justify-center disabled:opacity-30 hover:bg-gray-200 transition-all"
                    >
                        −
                    </button>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-gray-900 dark:text-white font-chivo">{frequencyTarget}</span>
                        <span className="text-sm text-gray-400 dark:text-gray-500 font-manrope">times/week</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setTarget(frequencyTarget + 1)}
                        disabled={frequencyTarget >= 7}
                        className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-500 font-bold text-lg flex items-center justify-center disabled:opacity-30 hover:bg-gray-200 transition-all"
                    >
                        +
                    </button>
                </div>
            )}
        </div>
    );
}

export function FrequencyBadge({ habit }) {
    const ft = habit?.frequency_type || "daily";
    if (ft === "daily") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-chivo">Daily</span>;
    if (ft === "specific_days") {
        const days = (habit.frequency_days || []).map(d => DAY_NAMES[d]).join(" · ");
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-900/50 font-chivo">{days || "No days"}</span>;
    }
    if (ft === "times_per_week") {
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 font-chivo">{habit.frequency_target || 1}x/week</span>;
    }
    return null;
}

export function WeeklyProgressDots({ habit, weekCompletions = 0 }) {
    const target = habit?.frequency_target || 1;
    const filled = Math.min(weekCompletions, target);
    return (
        <div className="flex items-center gap-1">
            {Array.from({ length: target }, (_, i) => (
                <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all ${
                        i < filled ? "bg-orange-500" : "bg-gray-200 dark:bg-gray-700"
                    }`}
                />
            ))}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-manrope ml-1">{filled}/{target}</span>
        </div>
    );
}

/**
 * Is this habit scheduled on the given day?
 *
 * `todayStr` is a YYYY-MM-DD in the USER's timezone (see hooks/useToday). It used
 * to read `new Date().getDay()` — the *browser's* local weekday — which disagreed
 * with the server for anyone travelling or with a timezone set that differs from
 * their device, and could put a habit in the wrong section of the dashboard.
 */
export function isScheduledToday(habit, todayStr) {
    const ft = habit?.frequency_type || "daily";
    if (ft === "daily") return true;
    if (ft === "specific_days") {
        return (habit.frequency_days || []).includes(weekdayIso(todayStr));
    }
    if (ft === "times_per_week") return true;
    return true;
}
