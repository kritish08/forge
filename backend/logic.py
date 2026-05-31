from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from collections import defaultdict

LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1500, 2500, 4000, 6000, 9000]

def get_level(pts: int) -> int:
    for i in range(len(LEVEL_THRESHOLDS) - 1, -1, -1):
        if pts >= LEVEL_THRESHOLDS[i]:
            return i + 1
    return 1

def get_level_progress(pts: int) -> dict:
    lvl = get_level(pts)
    cur = LEVEL_THRESHOLDS[lvl - 1]
    nxt = LEVEL_THRESHOLDS[lvl] if lvl < len(LEVEL_THRESHOLDS) else LEVEL_THRESHOLDS[-1] + 1000
    span = max(nxt - cur, 1)
    return {"level": lvl, "total_points": pts, "current_threshold": cur,
            "next_threshold": nxt, "progress_pct": round((pts - cur) / span * 100, 1)}

def get_user_today(user: dict) -> str:
    """Get the current date string (YYYY-MM-DD) mapped to the user's timezone."""
    tz_str = user.get("timezone", "UTC")
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = timezone.utc
    return datetime.now(tz).strftime("%Y-%m-%d")

def is_habit_scheduled_today(habit: dict, weekday: int) -> bool:
    """Check if a habit is scheduled for a given ISO weekday (0=Mon, 6=Sun)."""
    ft = habit.get("frequency_type", "daily")
    if ft == "daily":
        return True
    if ft == "specific_days":
        return weekday in habit.get("frequency_days", [])
    if ft == "times_per_week":
        return True  # Always available — user decides when
    return True

def is_day_scheduled(habit: dict, date_obj) -> bool:
    """Check if a specific date is a scheduled day for this habit."""
    return is_habit_scheduled_today(habit, date_obj.weekday())

def compute_global_streak(all_completions: list, habits: list, today_str: str) -> int:
    """Consecutive days where ALL scheduled habits were completed.
    Days with zero scheduled habits are skipped (don't break or extend)."""
    if not habits or not all_completions:
        return 0
    comp_by_date = defaultdict(set)
    for c in all_completions:
        comp_by_date[c["date"]].add(c["habit_id"])
    streak = 0
    cursor = datetime.strptime(today_str, "%Y-%m-%d")
    for _ in range(400):  # max lookback
        ds = cursor.strftime("%Y-%m-%d")
        weekday = cursor.weekday()
        scheduled = [h for h in habits if is_habit_scheduled_today(h, weekday)]
        if not scheduled:
            # No habits scheduled this day — skip it, don't break streak
            cursor -= timedelta(days=1)
            continue
        scheduled_ids = {h["habit_id"] for h in scheduled}
        completed_ids = comp_by_date.get(ds, set())
        if scheduled_ids.issubset(completed_ids):
            streak += 1
            cursor -= timedelta(days=1)
        else:
            break
    return streak

def compute_habit_streak(completions: list, habit: dict, today_str: str) -> int:
    """Per-habit streak respecting the habit's frequency type."""
    if not completions:
        return 0
    ft = habit.get("frequency_type", "daily")
    dates_set = set(c["date"] for c in completions)

    if ft == "daily":
        streak, cursor = 0, datetime.strptime(today_str, "%Y-%m-%d")
        while cursor.strftime("%Y-%m-%d") in dates_set:
            streak += 1
            cursor -= timedelta(days=1)
        return streak

    if ft == "specific_days":
        freq_days = habit.get("frequency_days", [])
        if not freq_days:
            return 0
        streak, cursor = 0, datetime.strptime(today_str, "%Y-%m-%d")
        for _ in range(400):
            if cursor.weekday() not in freq_days:
                cursor -= timedelta(days=1)
                continue
            if cursor.strftime("%Y-%m-%d") in dates_set:
                streak += 1
                cursor -= timedelta(days=1)
            else:
                break
        return streak

    if ft == "times_per_week":
        return _compute_weekly_streak(dates_set, habit, today_str)

    return 0

def _compute_weekly_streak(dates_set: set, habit: dict, today_str: str) -> int:
    """Count consecutive ISO weeks (Mon-Sun) where completions >= target."""
    target = habit.get("frequency_target", 1)
    today = datetime.strptime(today_str, "%Y-%m-%d")
    # Start from the most recent COMPLETED week (last Monday)
    current_monday = today - timedelta(days=today.weekday())
    # Check if current (incomplete) week already meets target
    current_week_dates = {(current_monday + timedelta(days=d)).strftime("%Y-%m-%d") for d in range(7)}
    current_week_count = len(dates_set & current_week_dates)
    streak = 0
    if current_week_count >= target:
        streak = 1
    # Walk backward through previous complete weeks
    for w in range(1, 53):
        week_monday = current_monday - timedelta(weeks=w)
        week_dates = {(week_monday + timedelta(days=d)).strftime("%Y-%m-%d") for d in range(7)}
        if len(dates_set & week_dates) >= target:
            streak += 1
        else:
            break
    return streak

def compute_habit_adherence(habit: dict, completions: list, local_now: datetime, days: int = 14) -> int:
    """Calculate what % of scheduled days the user actually completed, over N days."""
    ft = habit.get("frequency_type", "daily")
    dates_set = set(c["date"] for c in completions if c["habit_id"] == habit["habit_id"])
    scheduled = 0
    completed = 0
    for i in range(days):
        d = local_now - timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        if ft == "daily":
            scheduled += 1
            if ds in dates_set:
                completed += 1
        elif ft == "specific_days":
            if d.weekday() in habit.get("frequency_days", []):
                scheduled += 1
                if ds in dates_set:
                    completed += 1
        elif ft == "times_per_week":
            scheduled += 1  # Every day is available
            if ds in dates_set:
                completed += 1
    return round(completed / max(scheduled, 1) * 100)


def habit_due_count(habit: dict, local_now: datetime, days: int) -> float:
    """How many times this habit was 'due' over the last `days` days (incl. today), schedule-aware."""
    ft = habit.get("frequency_type", "daily")
    if ft == "specific_days":
        wanted = set(habit.get("frequency_days", []))
        return float(sum(1 for i in range(days) if (local_now - timedelta(days=i)).weekday() in wanted))
    if ft == "times_per_week":
        return habit.get("frequency_target", 1) * (days / 7.0)
    return float(days)  # daily / default


def aggregate_consistency(habits: list, completions: list, local_now: datetime, days: int) -> float:
    """Unified schedule-aware consistency %: completions of ACTIVE habits within the last
    `days` days divided by how many were scheduled, clamped to 0..100. Single source of
    truth shared by /analytics/stats, /ai/insight and the weekly summary email so every
    surface reports the same number."""
    if not habits:
        return 0.0
    active_ids = {h["habit_id"] for h in habits}
    start = (local_now - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    today = local_now.strftime("%Y-%m-%d")
    done = sum(1 for c in completions
               if c.get("habit_id") in active_ids and start <= c.get("date", "") <= today)
    possible = sum(habit_due_count(h, local_now, days) for h in habits)
    return round(min(done / max(possible, 1.0) * 100, 100.0), 1)

def compute_dow_patterns(completions: list, habits: list, local_now: datetime, days: int = 30) -> dict:
    """Day-of-week patterns using SCHEDULED habits as denominator (not total)."""
    by_date = defaultdict(int)
    for c in completions:
        by_date[c["date"]] += 1
    dow_data = defaultdict(lambda: {"c": 0, "p": 0})
    for i in range(days):
        d = local_now - timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        weekday = d.weekday()
        scheduled_count = 0
        for h in habits:
            ft = h.get("frequency_type", "daily")
            if ft == "daily": scheduled_count += 1
            elif ft == "specific_days" and weekday in h.get("frequency_days", []): scheduled_count += 1
            elif ft == "times_per_week": scheduled_count += h.get("frequency_target", 1) / 7.0
        dow_data[weekday]["c"] += by_date.get(ds, 0)
        dow_data[weekday]["p"] += max(scheduled_count, 1)
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return {names[k]: round(v["c"] / max(v["p"], 1) * 100, 1) for k, v in dow_data.items()}

def compute_time_patterns(completions: list, tz: timezone) -> dict:
    buckets = defaultdict(int)
    for c in completions:
        try:
            ts = c.get("completed_at", "")
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            local_ts = ts.astimezone(tz)
            h = local_ts.hour
            if h < 9: buckets["early"] += 1
            elif h < 12: buckets["morning"] += 1
            elif h < 17: buckets["afternoon"] += 1
            else: buckets["evening"] += 1
        except Exception:
            pass
    total = max(sum(buckets.values()), 1)
    return {k: round(v / total * 100, 1) for k, v in buckets.items()}
