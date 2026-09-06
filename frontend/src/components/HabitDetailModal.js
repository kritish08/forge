import { useState, useEffect, useCallback } from "react";
import api from "../utils/api";
import { toast } from "sonner";
import { FrequencyBadge } from "./FrequencyPicker";
import { useToday } from "../hooks/useToday";
import { addDays, daysBetween, weekdayIso, isoWeekMonday } from "../utils/date";

// Mirrors logic.MAX_BACKFILL_DAYS on the server, which now enforces this for real
// rather than trusting the client.
const MAX_BACKFILL_DAYS = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────
// All day arithmetic runs on "YYYY-MM-DD" strings in the user's timezone (see
// utils/date). This used to build Date objects from the browser's local clock,
// which disagreed with the server for anyone whose account timezone differs from
// their device.

function calcStreak(completionSet, habit, todayStr) {
    const ft = habit?.frequency_type || "daily";

    // Today is a grace day, matching logic.compute_global_streak on the server:
    // a day still in progress doesn't extend the streak, but it doesn't end it.
    if (ft === "daily") {
        let streak = 0;
        let cursor = todayStr;
        if (completionSet.has(cursor)) streak++;
        cursor = addDays(cursor, -1);
        while (completionSet.has(cursor)) {
            streak++;
            cursor = addDays(cursor, -1);
        }
        return streak;
    }

    if (ft === "specific_days") {
        const freqDays = habit?.frequency_days || [];
        if (!freqDays.length) return 0;
        let streak = 0;
        let cursor = todayStr;
        if (freqDays.includes(weekdayIso(cursor))) {
            if (completionSet.has(cursor)) streak++;
            cursor = addDays(cursor, -1);
        }
        for (let i = 0; i < 400; i++) {
            if (!freqDays.includes(weekdayIso(cursor))) {
                cursor = addDays(cursor, -1);
                continue;
            }
            if (completionSet.has(cursor)) {
                streak++;
                cursor = addDays(cursor, -1);
            } else {
                break;
            }
        }
        return streak;
    }

    if (ft === "times_per_week") {
        const target = habit?.frequency_target || 1;
        const weekCount = (mondayStr) => {
            let n = 0;
            for (let d = 0; d < 7; d++) if (completionSet.has(addDays(mondayStr, d))) n++;
            return n;
        };
        let monday = isoWeekMonday(todayStr);
        let streak = weekCount(monday) >= target ? 1 : 0;
        for (let w = 1; w <= 52; w++) {
            if (weekCount(addDays(monday, -7 * w)) >= target) streak++;
            else break;
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
    // NOTE: a `recentDays` 7-day strip used to be computed here on every render
    // and was referenced nowhere in the JSX. Removed.
    const todayStr   = useToday();
    const streak     = calcStreak(completionDates, habit, todayStr);
    const totalCount = completionDates.size;

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
        // Days elapsed since the target: negative means the future.
        const age = daysBetween(dateStr, todayStr);
        if (age < 0) return;
        if (age > MAX_BACKFILL_DAYS) {
            toast.error(`You can only edit entries from the past ${MAX_BACKFILL_DAYS} days`);
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
    // Weeks start on MONDAY. The grid used to start on Sunday while every server
    // week calculation (frequency_days, times_per_week streaks, day-of-week
    // patterns) is ISO Monday-first, so a "3x per week" habit was scored against
    // a different week than the one drawn here.
    const generateCalendarDays = () => {
        const y = currentMonth.getFullYear();
        const m = currentMonth.getMonth();
        const pad = (n) => String(n).padStart(2, "0");
        const monthStr = `${y}-${pad(m + 1)}`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        const freqDays = habit?.frequency_days || [];
        const ft = habit?.frequency_type || "daily";

        const days = [];
        for (let i = 0; i < weekdayIso(`${monthStr}-01`); i++) days.push(null);
        for (let d = 1; d <= lastDay; d++) {
            const dateStr = `${monthStr}-${pad(d)}`;
            const age = daysBetween(dateStr, todayStr);   // >0 past, <0 future
            const isFuture = age < 0;
            const isEditable = !isFuture && age <= MAX_BACKFILL_DAYS;
            const isRestDay = ft === "specific_days" && !freqDays.includes(weekdayIso(dateStr));
            days.push({ day: d, dateStr, isFuture, isEditable, isToday: dateStr === todayStr, isRestDay });
        }
        return days;
    };

    if (!isOpen || !habit) return null;

    const days           = generateCalendarDays();
    const weekDays       = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
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
            <div className="relative w-full sm:max-w-md bg-white dark:bg-gray-950 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">

                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 dark:text-white font-chivo tracking-tight leading-none">
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
                        className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-500 dark:text-gray-500 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── Stats row ────────────────────────────────────────────── */}
                <div className="flex gap-3 px-6 pb-4 shrink-0">
                    <div className="flex-1 bg-gray-800 rounded-2xl px-4 py-3">
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
                            <h3 className="text-lg font-black text-gray-900 dark:text-white font-chivo">Activity</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                                    className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-gray-800 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <span className="text-sm font-bold font-chivo text-gray-700 dark:text-gray-300 min-w-[130px] text-center">{monthLabel}</span>
                                <button
                                    onClick={() => !isCurrentMonth && setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                                    disabled={isCurrentMonth}
                                    className={`p-1.5 rounded-lg transition-colors ${isCurrentMonth ? "text-gray-200 cursor-not-allowed" : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-gray-800"}`}
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
                                        <div key={d} className="text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 font-manrope uppercase tracking-wider py-1">{d}</div>
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
                                                    d.isRestDay ? "text-gray-300 bg-gray-50 dark:bg-gray-900 cursor-pointer" :
                                                    d.isToday ? "ring-2 ring-orange-400 text-orange-600 font-bold hover:bg-orange-50" :
                                                    "text-gray-600 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-gray-800"}`}
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
                        <div className="flex items-center gap-3 mt-4 text-xs font-manrope text-gray-400 dark:text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
                                Completed
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full ring-2 ring-orange-400 inline-block" />
                                Today
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-gray-100 dark:bg-gray-800 inline-block" />
                                Missed
                            </span>
                            {habit?.frequency_type === "specific_days" && (
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 inline-block" />
                                    Rest day
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── Goal / Context ───────────────────────────────────── */}
                    <div>
                        <h3 className="text-lg font-black text-gray-900 dark:text-white font-chivo mb-3">Goal</h3>
                        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
                            <p className="text-orange-900 font-manrope font-medium leading-relaxed">
                                {habit.context || "No goal set yet."}
                            </p>
                        </div>
                        {habit.target_time && (
                            <div className="mt-2 flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3">
                                <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-manrope text-gray-600 dark:text-gray-500 font-medium">Target: {habit.target_time}</span>
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
