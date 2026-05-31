"""Unit tests for backend/logic.py — the pure domain logic (levels, streaks,
adherence, the unified consistency metric, day/time patterns).

These functions have no DB or network dependency, so they import and run in
isolation. Dates use a fixed reference: 2026-01-15 is a Thursday (weekday 3),
2026-01-12 a Monday, 2026-01-18 a Sunday.
"""
from datetime import datetime, timezone

import logic


# ── Levels ───────────────────────────────────────────────────────────────────
def test_get_level_boundaries():
    assert logic.get_level(0) == 1
    assert logic.get_level(99) == 1
    assert logic.get_level(100) == 2
    assert logic.get_level(250) == 3
    assert logic.get_level(9000) == 10
    assert logic.get_level(50000) == 10          # capped at top tier
    assert logic.get_level(-10) == 1             # never below 1


def test_get_level_progress():
    p0 = logic.get_level_progress(0)
    assert p0["level"] == 1 and p0["next_threshold"] == 100 and p0["progress_pct"] == 0.0

    p = logic.get_level_progress(175)            # halfway between 100 and 250
    assert p["level"] == 2 and p["progress_pct"] == 50.0

    cap = logic.get_level_progress(9000)         # top tier -> synthetic +1000 span
    assert cap["level"] == 10 and cap["next_threshold"] == 10000 and cap["progress_pct"] == 0.0


# ── Scheduling ───────────────────────────────────────────────────────────────
def test_is_habit_scheduled_today():
    assert logic.is_habit_scheduled_today({"frequency_type": "daily"}, 2) is True
    assert logic.is_habit_scheduled_today({"frequency_type": "times_per_week"}, 2) is True
    sd = {"frequency_type": "specific_days", "frequency_days": [0, 2, 4]}
    assert logic.is_habit_scheduled_today(sd, 0) is True
    assert logic.is_habit_scheduled_today(sd, 1) is False
    assert logic.is_habit_scheduled_today({}, 5) is True      # default daily


def test_is_day_scheduled_uses_weekday():
    sd = {"frequency_type": "specific_days", "frequency_days": [3]}  # Thursday only
    assert logic.is_day_scheduled(sd, datetime(2026, 1, 15)) is True   # Thu
    assert logic.is_day_scheduled(sd, datetime(2026, 1, 16)) is False  # Fri


# ── Global streak ────────────────────────────────────────────────────────────
def _comp(habit_id, date):
    return {"habit_id": habit_id, "date": date}


def test_global_streak_empty():
    assert logic.compute_global_streak([], [], "2026-01-15") == 0
    assert logic.compute_global_streak([_comp("h1", "2026-01-15")], [], "2026-01-15") == 0


def test_global_streak_daily_consecutive_then_gap():
    habits = [{"habit_id": "h1", "frequency_type": "daily"}]
    comps = [_comp("h1", d) for d in ("2026-01-15", "2026-01-14", "2026-01-13")]
    assert logic.compute_global_streak(comps, habits, "2026-01-15") == 3
    # gap at 01-14 breaks it -> only today counts
    comps_gap = [_comp("h1", "2026-01-15"), _comp("h1", "2026-01-13")]
    assert logic.compute_global_streak(comps_gap, habits, "2026-01-15") == 1


def test_global_streak_requires_all_scheduled_habits():
    habits = [{"habit_id": "h1", "frequency_type": "daily"},
              {"habit_id": "h2", "frequency_type": "daily"}]
    comps = [_comp("h1", "2026-01-15"), _comp("h2", "2026-01-15"),
             _comp("h1", "2026-01-14")]  # h2 missing on the 14th
    assert logic.compute_global_streak(comps, habits, "2026-01-15") == 1


def test_global_streak_skips_unscheduled_days():
    # Habit only scheduled on Mondays; non-Mondays are skipped, not broken.
    habits = [{"habit_id": "h1", "frequency_type": "specific_days", "frequency_days": [0]}]
    comps = [_comp("h1", "2026-01-12")]   # Monday completed; today is Thu 01-15
    assert logic.compute_global_streak(comps, habits, "2026-01-15") == 1


# ── Per-habit streak ─────────────────────────────────────────────────────────
def test_habit_streak_daily():
    habit = {"habit_id": "h1", "frequency_type": "daily"}
    comps = [_comp("h1", d) for d in ("2026-01-15", "2026-01-14", "2026-01-13")]
    assert logic.compute_habit_streak(comps, habit, "2026-01-15") == 3


def test_habit_streak_specific_days_counts_only_scheduled():
    habit = {"habit_id": "h1", "frequency_type": "specific_days", "frequency_days": [3]}  # Thu
    comps = [_comp("h1", "2026-01-15"), _comp("h1", "2026-01-08")]  # two consecutive Thursdays
    assert logic.compute_habit_streak(comps, habit, "2026-01-15") == 2


def test_habit_streak_times_per_week():
    habit = {"habit_id": "h1", "frequency_type": "times_per_week", "frequency_target": 3}
    comps = [_comp("h1", d) for d in ("2026-01-12", "2026-01-13", "2026-01-14",   # this week
                                      "2026-01-05", "2026-01-06", "2026-01-07")]  # last week
    assert logic.compute_habit_streak(comps, habit, "2026-01-15") == 2


# ── Adherence ────────────────────────────────────────────────────────────────
def test_habit_adherence_daily_half():
    habit = {"habit_id": "h1", "frequency_type": "daily"}
    comps = [_comp("h1", d) for d in ("2026-01-15", "2026-01-14", "2026-01-13",
                                      "2026-01-12", "2026-01-11", "2026-01-10", "2026-01-09")]
    # 7 of the last 14 days -> 50%
    assert logic.compute_habit_adherence(habit, comps, datetime(2026, 1, 15), days=14) == 50


# ── habit_due_count ──────────────────────────────────────────────────────────
def test_habit_due_count():
    daily = {"frequency_type": "daily"}
    assert logic.habit_due_count(daily, datetime(2026, 1, 15), 14) == 14.0

    tpw = {"frequency_type": "times_per_week", "frequency_target": 3}
    assert logic.habit_due_count(tpw, datetime(2026, 1, 15), 7) == 3.0
    assert logic.habit_due_count(tpw, datetime(2026, 1, 15), 14) == 6.0

    weekdays = {"frequency_type": "specific_days", "frequency_days": [0, 1, 2, 3, 4]}  # Mon-Fri
    # last 7 days from Sun 2026-01-18 contain Mon..Fri = 5 scheduled days
    assert logic.habit_due_count(weekdays, datetime(2026, 1, 18), 7) == 5.0


# ── aggregate_consistency (the unified metric — primary regression guard) ─────
def test_consistency_no_habits():
    assert logic.aggregate_consistency([], [_comp("h1", "2026-01-15")], datetime(2026, 1, 15), 14) == 0.0


def test_consistency_daily_single_completion():
    habits = [{"habit_id": "h1", "frequency_type": "daily"}]
    comps = [_comp("h1", "2026-01-15")]
    # 1 completion / 14 scheduled = 7.14 -> 7.1  (matches the live smoke-test value)
    assert logic.aggregate_consistency(habits, comps, datetime(2026, 1, 15), 14) == 7.1


def test_consistency_clamped_to_100():
    habits = [{"habit_id": "h1", "frequency_type": "times_per_week", "frequency_target": 1}]
    comps = [_comp("h1", d) for d in ("2026-01-15", "2026-01-14", "2026-01-13",
                                      "2026-01-12", "2026-01-11")]  # 5 done, possible=1
    assert logic.aggregate_consistency(habits, comps, datetime(2026, 1, 15), 7) == 100.0


def test_consistency_ignores_inactive_habits():
    habits = [{"habit_id": "h1", "frequency_type": "daily"}]
    comps = [_comp("h1", "2026-01-15"), _comp("h2", "2026-01-15")]  # h2 not in habits
    assert logic.aggregate_consistency(habits, comps, datetime(2026, 1, 15), 14) == 7.1


def test_consistency_window_boundary():
    habits = [{"habit_id": "h1", "frequency_type": "daily"}]
    # window for days=7 starts at 2026-01-09; 01-08 must be excluded
    comps = [_comp("h1", "2026-01-09"), _comp("h1", "2026-01-08")]
    assert logic.aggregate_consistency(habits, comps, datetime(2026, 1, 15), 7) == 14.3


# ── Day-of-week & time-of-day patterns ───────────────────────────────────────
def test_dow_patterns():
    habits = [{"habit_id": "h1", "frequency_type": "daily"}]
    comps = [_comp("h1", "2026-01-15")]  # a Thursday
    res = logic.compute_dow_patterns(comps, habits, datetime(2026, 1, 15), days=7)
    assert res["Thu"] == 100.0
    assert res["Wed"] == 0.0


def test_time_patterns_buckets():
    comps = [
        {"completed_at": "2026-01-15T08:30:00+00:00"},  # early   (<9)
        {"completed_at": "2026-01-15T10:00:00+00:00"},  # morning (<12)
        {"completed_at": "2026-01-15T14:00:00+00:00"},  # afternoon (<17)
        {"completed_at": "2026-01-15T20:00:00+00:00"},  # evening
    ]
    res = logic.compute_time_patterns(comps, timezone.utc)
    assert res == {"early": 25.0, "morning": 25.0, "afternoon": 25.0, "evening": 25.0}
