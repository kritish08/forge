import { useState, useEffect, useCallback } from "react";
import api from "../utils/api";
import { toast } from "sonner";
import { FrequencyBadge } from "./FrequencyPicker";

// ── Helpers ──────────────────────────────────────────────────────────────────
function toDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calcStreak(completionSet, habit) {
    const ft = habit?.frequency_type || "daily";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (ft === "daily") {
        let streak = 0;
        const cursor = new Date(today);
        while (completionSet.has(toDateStr(cursor))) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
        }
        return streak;
    }

    if (ft === "specific_days") {
        const freqDays = habit?.frequency_days || [];
        if (!freqDays.length) return 0;
        let streak = 0;
        const cursor = new Date(today);
        for (let i = 0; i < 400; i++) {
            // JS getDay(): 0=Sun → ISO: 0=Mon
            const jsDay = cursor.getDay();
            const isoDay = jsDay === 0 ? 6 : jsDay - 1;
            if (!freqDays.includes(isoDay)) {
                cursor.setDate(cursor.getDate() - 1);
                continue;
            }
            if (completionSet.has(toDateStr(cursor))) {
                streak++;
                cursor.setDate(cursor.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    }

    if (ft === "times_per_week") {
        const target = habit?.frequency_target || 1;
        // Find Monday of current week
        const dayOfWeek = today.getDay();
        const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(today);
        monday.setDate(today.getDate() - diffToMon);
        // Check current week
        const currentWeekDates = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday); d.setDate(monday.getDate() + i);
            return toDateStr(d);
        });
        const currentCount = currentWeekDates.filter(d => completionSet.has(d)).length;
        let streak = currentCount >= target ? 1 : 0;
        // Walk back previous weeks
        for (let w = 1; w <= 52; w++) {
            const wMonday = new Date(monday);
            wMonday.setDate(monday.getDate() - w * 7);
            const wDates = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(wMonday); d.setDate(wMonday.getDate() + i);
                return toDateStr(d);
            });
            if (wDates.filter(d => completionSet.has(d)).length >= target) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }
    return 0;
}

const PRIORITY_LABELS = { 1: "Low", 2: "Medium", 3: "High" };
const PRIORITY_COLORS = {
    1: "bg-blue-50 text-blue-700 border-blue-100",
    2: "bg-amber-50 text-amber-700 border-amber-100",
    3: "bg-orange-50 text-orange-700 border-orange-100",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function HabitDetailModal({ habit, isOpen, onClose, onUpdate }) {
    const [completionDates, setCompletionDates] = useState(new Set());
    const [completionMap, setCompletionMap] = useState({}); // dateStr → completion_id
    const [currentMonth, setCurrentMonth] = useState(() => {
        const d = new Date(); d.setDate(1); return d;
    });
    const [loading, setLoading] = useState(false);

    // ── Derived stats ──────────────────────────────────────────────────────
    const streak       = calcStreak(completionDates, habit);
    const totalCount   = completionDates.size;

    const today        = new Date(); today.setHours(0,0,0,0);
    const todayStr     = toDateStr(today);
    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 6);

    // ── Recent 7-day strip ─────────────────────────────────────────────────
    const recentDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(sevenDaysAgo);
        d.setDate(sevenDaysAgo.getDate() + i);
        const str = toDateStr(d);
        return {
            str,
            label: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2),
            dayNum: d.getDate(),
            done: completionDates.has(str),
            isToday: str === todayStr,
        };
    });

    // ── Fetch history ──────────────────────────────────────────────────────
    const fetchHistory = useCallback(async () => {
        if (!habit) return;
        setLoading(true);
        try {
            const res = await api.get(`/completions?habit_id=${habit.habit_id}`);
            const dates = new Set();
            const map   = {};
            res.data.forEach((c) => {
                dates.add(c.date);
                map[c.date] = c.completion_id;
            });
            setCompletionDates(dates);
            setCompletionMap(map);
        } catch {
            toast.error("Failed to load history");
        } finally {
            setLoading(false);
        }
    }, [habit]);

    useEffect(() => {
        if (isOpen && habit) fetchHistory();
    }, [isOpen, habit, fetchHistory]);

    // ── Toggle completion ──────────────────────────────────────────────────
    const toggleDay = async (dateStr) => {
        const target = new Date(dateStr + "T00:00:00");
        if (target > today) return;

        // Only past 7 days + today are editable (same as the main dashboard)
        const diffDays = Math.floor((today - target) / 86400000);
        if (diffDays > 30) {
            toast.error("You can only edit entries from the past 30 days");
            return;
        }

        try {
            if (completionDates.has(dateStr)) {
                const cid = completionMap[dateStr];
                if (cid) {
                    await api.delete(`/completions/${cid}`);
                    const nd = new Set(completionDates); nd.delete(dateStr);
                    const nm = { ...completionMap }; delete nm[dateStr];
                    setCompletionDates(nd);
                    setCompletionMap(nm);
                }
            } else {
                const res = await api.post("/completions", { habit_id: habit.habit_id, date: dateStr });
                setCompletionDates(prev => new Set([...prev, dateStr]));
                setCompletionMap(prev => ({ ...prev, [dateStr]: res.data.completion_id }));
            }
            onUpdate();
        } catch {
            toast.error("Failed to update check-in");
        }
    };

    // ── Calendar grid ──────────────────────────────────────────────────────
    const generateCalendarDays = () => {
        const y = currentMonth.getFullYear();
        const m = currentMonth.getMonth();
        const firstDOW = new Date(y, m, 1).getDay();
        const lastDay  = new Date(y, m + 1, 0).getDate();
        const freqDays = habit?.frequency_days || [];
        const ft = habit?.frequency_type || "daily";
        const days = [];
        for (let i = 0; i < firstDOW; i++) days.push(null);
        for (let d = 1; d <= lastDay; d++) {
            const date    = new Date(y, m, d);
            const dateStr = toDateStr(date);
            const diffMs  = date - today;
            const diffD   = Math.floor(diffMs / 86400000);
            const isFuture = diffD > 0;
            const isEditable = !isFuture && diffD >= -30;
            // Determine if this day is scheduled (for rest-day shading)
            const jsDay = date.getDay(); // 0=Sun
            const isoDay = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
            const isRestDay = ft === "specific_days" && !freqDays.includes(isoDay);
            days.push({ day: d, dateStr, isFuture, isEditable, isToday: dateStr === todayStr, isRestDay });
        }
        return days;
    };

    if (!isOpen || !habit) return null;

    const days           = generateCalendarDays();
    const weekDays       = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    const nowMonth       = new Date(); nowMonth.setDate(1);
    const isCurrentMonth = currentMonth.getMonth() === nowMonth.getMonth() &&
                           currentMonth.getFullYear() === nowMonth.getFullYear();
    const monthLabel     = currentMonth.toLocaleString("default", { month: "long", year: "numeric" });

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">

                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 font-chivo tracking-tight leading-none">
                            {habit.name}
                        </h2>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border font-chivo uppercase tracking-wide ${PRIORITY_COLORS[habit.priority] || PRIORITY_COLORS[1]}`}>
                                {PRIORITY_LABELS[habit.priority] || "Low"} Priority
                            </span>
                            <FrequencyBadge habit={habit} />
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── Stats row ────────────────────────────────────────────── */}
                <div className="flex gap-3 px-6 pb-4 shrink-0">
                    <div className="flex-1 bg-gray-900 rounded-2xl px-4 py-3">
                        <div className="text-2xl font-black text-orange-400 font-chivo">{totalCount}</div>
                        <div className="text-xs text-gray-400 font-manrope mt-0.5">Total check-ins</div>
                    </div>
                    <div className="flex-1 bg-orange-500 rounded-2xl px-4 py-3">
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white font-chivo">{streak}</span>
                            <span className="text-lg">⚡</span>
                        </div>
                        <div className="text-xs text-orange-100 font-manrope mt-0.5">
                            {habit?.frequency_type === "times_per_week" ? "Week streak" :
                             habit?.frequency_type === "specific_days" ? "Scheduled streak" :
                             "Day streak"}
                        </div>
                    </div>
                </div>

                {/* ── Scrollable content ───────────────────────────────────── */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

                    {/* ── Activity calendar ────────────────────────────────── */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black text-gray-900 font-chivo">Activity</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <span className="text-sm font-bold font-chivo text-gray-700 min-w-[130px] text-center">{monthLabel}</span>
                                <button
                                    onClick={() => !isCurrentMonth && setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                                    disabled={isCurrentMonth}
                                    className={`p-1.5 rounded-lg transition-colors ${isCurrentMonth ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="h-40 flex items-center justify-center text-gray-300">
                                <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                </svg>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-7 mb-2">
                                    {weekDays.map(d => (
                                        <div key={d} className="text-center text-[10px] font-bold text-gray-400 font-manrope uppercase tracking-wider py-1">{d}</div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 gap-y-1.5">
                                    {days.map((d, i) => {
                                        if (!d) return <div key={`e-${i}`} className="w-9 h-9" />;
                                        const done    = completionDates.has(d.dateStr);
                                        const editable = d.isEditable;
                                        return (
                                            <button
                                                key={d.dateStr}
                                                title={editable ? (done ? "Click to un-check" : "Click to check in") : d.isFuture ? "Future" : "Too far back to edit"}
                                                onClick={() => editable && toggleDay(d.dateStr)}
                                                className={`w-9 h-9 mx-auto rounded-full flex items-center justify-center text-sm font-chivo transition-all focus:outline-none
                                                    ${d.isFuture ? "text-gray-200 cursor-not-allowed" :
                                                    !editable ? "text-gray-300 cursor-not-allowed" :
                                                    done ? "bg-orange-500 text-white shadow-md shadow-orange-200 hover:bg-orange-600" :
                                                    d.isRestDay ? "text-gray-300 bg-gray-50 cursor-pointer" :
                                                    d.isToday ? "ring-2 ring-orange-400 text-orange-600 font-bold hover:bg-orange-50" :
                                                    "text-gray-600 hover:bg-gray-100"}`}
                                            >
                                                {done ? (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                ) : d.day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* Legend */}
                        <div className="flex items-center gap-3 mt-4 text-xs font-manrope text-gray-400 flex-wrap">
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
                                Completed
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full ring-2 ring-orange-400 inline-block" />
                                Today
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-gray-100 inline-block" />
                                Missed
                            </span>
                            {habit?.frequency_type === "specific_days" && (
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-gray-50 border border-gray-200 inline-block" />
                                    Rest day
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── Goal / Context ───────────────────────────────────── */}
                    <div>
                        <h3 className="text-lg font-black text-gray-900 font-chivo mb-3">Goal</h3>
                        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
                            <p className="text-orange-900 font-manrope font-medium leading-relaxed">
                                {habit.context || "No goal set yet."}
                            </p>
                        </div>
                        {habit.target_time && (
                            <div className="mt-2 flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-manrope text-gray-600 font-medium">Target: {habit.target_time}</span>
                            </div>
                        )}
                    </div>

                    {/* Bottom padding — clears fixed bottom nav bar */}
                    <div className="h-24" />
                </div>
            </div>
        </div>
    );
}
