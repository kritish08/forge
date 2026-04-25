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
            <span className="text-xs text-gray-500 font-manrope">Frequency:</span>

            {/* Segmented control */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
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
                                : "text-gray-500 hover:bg-gray-200"
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
                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
                        className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 font-bold text-lg flex items-center justify-center disabled:opacity-30 hover:bg-gray-200 transition-all"
                    >
                        −
                    </button>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-gray-900 font-chivo">{frequencyTarget}</span>
                        <span className="text-sm text-gray-400 font-manrope">times/week</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setTarget(frequencyTarget + 1)}
                        disabled={frequencyTarget >= 7}
                        className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 font-bold text-lg flex items-center justify-center disabled:opacity-30 hover:bg-gray-200 transition-all"
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
    if (ft === "daily") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-chivo">Daily</span>;
    if (ft === "specific_days") {
        const days = (habit.frequency_days || []).map(d => DAY_NAMES[d]).join(" · ");
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100 font-chivo">{days || "No days"}</span>;
    }
    if (ft === "times_per_week") {
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-chivo">{habit.frequency_target || 1}x/week</span>;
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
                        i < filled ? "bg-orange-500" : "bg-gray-200"
                    }`}
                />
            ))}
            <span className="text-[10px] text-gray-400 font-manrope ml-1">{filled}/{target}</span>
        </div>
    );
}

export function isScheduledToday(habit) {
    const ft = habit?.frequency_type || "daily";
    if (ft === "daily") return true;
    if (ft === "specific_days") {
        const today = new Date().getDay(); // 0=Sun
        // Convert JS day (0=Sun) to ISO (0=Mon)
        const isoDay = today === 0 ? 6 : today - 1;
        return (habit.frequency_days || []).includes(isoDay);
    }
    if (ft === "times_per_week") return true;
    return true;
}
