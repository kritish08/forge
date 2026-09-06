import { useState, useEffect, useCallback } from "react";
import api from "../utils/api";
import { toast } from "sonner";
import { FrequencyBadge } from "./FrequencyPicker";
import Sheet from "./Sheet";
import { Check } from "./icons";
import { tapSuccess, tapLight } from "../utils/haptics";
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
    1: "bg-surface-sunk text-ink border-line",
    2: "bg-warning-soft text-warning border-warning/25",
    3: "bg-accent-soft text-accent-bold border-accent/25",
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
                    tapLight();
                    const nd = new Set(completionDates); nd.delete(dateStr);
                    const nm = { ...completionMap }; delete nm[dateStr];
                    setCompletionDates(nd);
                    setCompletionMap(nm);
                }
            } else {
                const res = await api.post("/completions", { habit_id: habit.habit_id, date: dateStr });
                tapSuccess();
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
        <Sheet
            open={isOpen}
            onClose={onClose}
            title={habit.name}
            description={habit.context || undefined}
        >
            {/* Two figures, plainly set. These used to be a dark slab and a solid
                orange slab inside an otherwise light sheet — two competing colour
                blocks for two numbers. */}
            <div className="mb-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-surface-sunk px-4 py-3">
                    <p className="font-chivo text-2xl font-bold tabular-nums text-ink">{totalCount}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">check-ins</p>
                </div>
                <div className="rounded-xl border border-accent/25 bg-accent-soft px-4 py-3">
                    <p className="font-chivo text-2xl font-bold tabular-nums text-accent-bold">{streak}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                        {habit?.frequency_type === "times_per_week" ? "week streak"
                            : habit?.frequency_type === "specific_days" ? "scheduled streak"
                            : "day streak"}
                    </p>
                </div>
            </div>

            <div className="mb-2 flex items-center justify-between">
                <h3 className="font-chivo text-base font-bold text-ink">Activity</h3>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        aria-label="Previous month"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors active:bg-surface-sunk"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M15 19 8 12l7-7" /></svg>
                    </button>
                    <span className="min-w-[120px] text-center text-sm font-semibold text-ink">{monthLabel}</span>
                    <button
                        type="button"
                        aria-label="Next month"
                        onClick={() => !isCurrentMonth && setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                        disabled={isCurrentMonth}
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition-colors active:bg-surface-sunk disabled:opacity-30"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="h-56 animate-pulse rounded-xl bg-surface-sunk" aria-hidden="true" />
            ) : (
                <>
                    <div className="grid grid-cols-7">
                        {weekDays.map((d, i) => (
                            <div key={i} className="py-1 text-center text-[11px] font-medium text-ink-subtle">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1">
                        {days.map((d, i) => {
                            if (!d) return <div key={`e-${i}`} className="h-9" />;
                            const done = completionDates.has(d.dateStr);
                            return (
                                <button
                                    key={d.dateStr}
                                    type="button"
                                    disabled={!d.isEditable}
                                    aria-pressed={done}
                                    aria-label={`${d.dateStr}${done ? ", completed" : ""}`}
                                    title={d.isEditable ? (done ? "Uncheck" : "Check in") : d.isFuture ? "In the future" : "Outside the editable window"}
                                    onClick={() => toggleDay(d.dateStr)}
                                    className={`mx-auto grid h-9 w-9 place-items-center rounded-full font-chivo text-[13px] transition-colors ${ done ?"bg-accent text-accent-contrast"
                                            : !d.isEditable
                                              ? "text-ink-subtle/45"
                                              : d.isToday
                                                ? "text-accent ring-2 ring-accent"
                                                : d.isRestDay
                                                  ? "bg-surface-sunk text-ink-subtle"
                                                  : "text-ink-muted active:bg-surface-sunk"
                                    }`}
                                >
                                    {done ? <Check className="h-4 w-4" /> : d.day}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 pb-5 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full bg-accent" /> Completed
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full ring-2 ring-accent" /> Today
                </span>
                {habit?.frequency_type === "specific_days" && (
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-3 w-3 rounded-full bg-surface-sunk ring-1 ring-line" /> Rest day
                    </span>
                )}
                <span className="w-full text-ink-subtle">
                    Editable for the last {MAX_BACKFILL_DAYS} days.
                </span>
            </div>
        </Sheet>
    );
}
