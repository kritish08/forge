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


def test_global_streak_today_is_a_grace_day():
    """An unfinished today must not zero out a streak earned on previous days."""
    habits = [{"habit_id": "h1", "frequency_type": "daily"}]
    # 01-14 and 01-13 done, today (01-15) not yet.
    comps = [_comp("h1", "2026-01-14"), _comp("h1", "2026-01-13")]
    assert logic.compute_global_streak(comps, habits, "2026-01-15") == 2
    # Completing today extends it rather than starting over.
    comps.append(_comp("h1", "2026-01-15"))
    assert logic.compute_global_streak(comps, habits, "2026-01-15") == 3


def test_global_streak_grace_applies_only_to_today():
    """Yesterday is not forgiven — a gap before today still ends the streak."""
    habits = [{"habit_id": "h1", "frequency_type": "daily"}]
    # today missing (forgiven), yesterday missing (fatal), 01-13 done.
    comps = [_comp("h1", "2026-01-13")]
    assert logic.compute_global_streak(comps, habits, "2026-01-15") == 0


def test_global_streak_grace_with_partial_today():
    """Today counts only when EVERY scheduled habit is done; partial is forgiven."""
    habits = [{"habit_id": "h1", "frequency_type": "daily"},
              {"habit_id": "h2", "frequency_type": "daily"}]
    comps = [_comp("h1", "2026-01-15"),                      # today: only h1
             _comp("h1", "2026-01-14"), _comp("h2", "2026-01-14")]
    assert logic.compute_global_streak(comps, habits, "2026-01-15") == 1


def test_habit_streak_daily_grace_day():
    habit = {"habit_id": "h1", "frequency_type": "daily"}
    comps = [_comp("h1", "2026-01-14"), _comp("h1", "2026-01-13")]
    assert logic.compute_habit_streak(comps, habit, "2026-01-15") == 2
    assert logic.compute_habit_streak(comps + [_comp("h1", "2026-01-15")],
                                      habit, "2026-01-15") == 3


def test_habit_streak_specific_days_grace_day():
    """Today is Thu (weekday 3) and scheduled but unfinished — prior Tue/Wed hold."""
    habit = {"habit_id": "h1", "frequency_type": "specific_days",
             "frequency_days": [1, 2, 3]}          # Tue, Wed, Thu
    comps = [_comp("h1", "2026-01-14"), _comp("h1", "2026-01-13")]  # Wed, Tue
    assert logic.compute_habit_streak(comps, habit, "2026-01-15") == 2


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


ALLDAYS = [0, 1, 2, 3, 4, 5, 6]


def test_due_daily_slot_exact_and_grace_window():
    rules = [{"days": ALLDAYS, "time": "20:00"}]  # 20:00 == 1200 minutes
    assert logic.due_daily_slot(rules, 2, 1200, {}, "D") == "20:00"          # exact minute
    assert logic.due_daily_slot(rules, 2, 1230, {}, "D") == "20:00"          # 30 min late, within grace
    assert logic.due_daily_slot(rules, 2, 1320, {}, "D") == "20:00"          # exactly +120 (edge)
    assert logic.due_daily_slot(rules, 2, 1321, {}, "D") is None             # past grace
    assert logic.due_daily_slot(rules, 2, 1199, {}, "D") is None             # before slot


def test_due_daily_slot_weekday_filter():
    rules = [{"days": [0], "time": "20:00"}]   # Mondays only
    assert logic.due_daily_slot(rules, 0, 1200, {}, "D") == "20:00"
    assert logic.due_daily_slot(rules, 2, 1200, {}, "D") is None


def test_due_daily_slot_dedupe_by_last_sent():
    rules = [{"days": ALLDAYS, "time": "20:00"}]
    assert logic.due_daily_slot(rules, 2, 1205, {"20:00": "D"}, "D") is None       # already sent today
    assert logic.due_daily_slot(rules, 2, 1205, {"20:00": "YDAY"}, "D") == "20:00"  # sent a different day


def test_due_daily_slot_picks_earliest_when_multiple_due():
    rules = [{"days": ALLDAYS, "time": "09:00"}, {"days": ALLDAYS, "time": "08:00"}]
    # now=540 (09:00): 08:00 window [480,600] and 09:00 window [540,660] both include 540 -> earliest wins
    assert logic.due_daily_slot(rules, 2, 540, {}, "D") == "08:00"


def test_is_weekly_due():
    assert logic.is_weekly_due(6, 540, None, "D") is True          # Sun 09:00
    assert logic.is_weekly_due(6, 600, None, "D") is True          # Sun 10:00 within grace
    assert logic.is_weekly_due(6, 661, None, "D") is False         # past grace
    assert logic.is_weekly_due(6, 539, None, "D") is False         # before 09:00
    assert logic.is_weekly_due(2, 540, None, "D") is False         # not Sunday
    assert logic.is_weekly_due(6, 540, "D", "D") is False          # already sent today


def test_time_patterns_buckets():
    comps = [
        {"completed_at": "2026-01-15T08:30:00+00:00"},  # early   (<9)
        {"completed_at": "2026-01-15T10:00:00+00:00"},  # morning (<12)
        {"completed_at": "2026-01-15T14:00:00+00:00"},  # afternoon (<17)
        {"completed_at": "2026-01-15T20:00:00+00:00"},  # evening
    ]
    res = logic.compute_time_patterns(comps, timezone.utc)
    assert res == {"early": 25.0, "morning": 25.0, "afternoon": 25.0, "evening": 25.0}


# ── Completion date validation ───────────────────────────────────────────────
def test_validate_completion_date_accepts_today_and_recent_past():
    assert logic.validate_completion_date("2026-01-15", "2026-01-15")[0] is True
    assert logic.validate_completion_date("2026-01-01", "2026-01-15")[0] is True
    # exactly on the boundary
    assert logic.validate_completion_date("2025-12-16", "2026-01-15")[0] is True


def test_validate_completion_date_rejects_future():
    ok, reason = logic.validate_completion_date("2026-01-16", "2026-01-15")
    assert ok is False and "future" in reason.lower()


def test_validate_completion_date_rejects_ancient_backfill():
    ok, reason = logic.validate_completion_date("2025-12-15", "2026-01-15")
    assert ok is False and "30 days" in reason


def test_validate_completion_date_rejects_malformed():
    for bad in ("15-01-2026", "not-a-date", "", None, "2026-13-45"):
        ok, reason = logic.validate_completion_date(bad, "2026-01-15")
        assert ok is False and "YYYY-MM-DD" in reason
