import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from db import db
from logic import get_user_today, compute_global_streak

# Single source of truth for the achievement set. This list used to be duplicated
# in frontend/src/components/Achievements.js, so anything added here rendered in
# the UI as a generic medal with no description. The frontend now fetches it from
# GET /api/achievements/catalog instead.
ACHIEVEMENT_CATALOG = [
    {"type": "first_checkin",   "name": "First Flame",       "icon": "🔥",
     "description": "Complete your first habit",
     "earned_blurb": "Your journey of a thousand habits starts here."},
    {"type": "perfect_day",     "name": "First Perfect Day", "icon": "⭐",
     "description": "Complete all habits in one day",
     "earned_blurb": "Completed every habit in a single day!"},
    {"type": "streak_7",        "name": "7-Day Streak",      "icon": "💪",
     "description": "7 consecutive days",
     "earned_blurb": "7 consecutive days of consistency!"},
    {"type": "streak_30",       "name": "Forge Legend",      "icon": "🏆",
     "description": "30 consecutive days",
     "earned_blurb": "30 consecutive days - unstoppable!"},
    {"type": "checkins_100",    "name": "Centurion",         "icon": "💯",
     "description": "100 habit check-ins",
     "earned_blurb": "100 check-ins completed. Respect."},
    {"type": "morning_warrior", "name": "Morning Warrior",   "icon": "🌅",
     "description": "10 completions before 9AM",
     "earned_blurb": "10 completions before 9AM."},
    {"type": "comeback",        "name": "Comeback King",     "icon": "👑",
     "description": "Restart after a 7-day break",
     "earned_blurb": "Restarted after a break. Resilience > Perfection."},
]

CATALOG_BY_TYPE = {a["type"]: a for a in ACHIEVEMENT_CATALOG}


def _user_tz(user: dict):
    try:
        return ZoneInfo(user.get("timezone", "UTC"))
    except Exception:
        return timezone.utc


async def check_and_award_achievements(user_id: str) -> list:
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        return []
    completions = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    existing_types = {a["type"] for a in await db.achievements.find({"user_id": user_id}, {"_id": 0}).to_list(1000)}
    today = get_user_today(user)
    tz = _user_tz(user)
    new_ach = []

    def award(t):
        if t in existing_types:
            return None
        meta = CATALOG_BY_TYPE[t]
        return {"achievement_id": f"ach_{uuid.uuid4().hex[:12]}", "user_id": user_id,
                "type": t, "name": meta["name"], "description": meta["earned_blurb"],
                "earned_at": datetime.now(timezone.utc).isoformat()}

    def add(t):
        a = award(t)
        if a:
            new_ach.append(a)

    if len(completions) >= 1:
        add("first_checkin")

    if habits:
        today_ids = {c["habit_id"] for c in completions if c["date"] == today}
        all_ids = {h["habit_id"] for h in habits}
        if all_ids and all_ids.issubset(today_ids):
            add("perfect_day")

    streak = compute_global_streak(completions, habits, today)
    if streak >= 7:
        add("streak_7")
    if streak >= 30:
        add("streak_30")

    if len(completions) >= 100:
        add("checkins_100")

    # "Before 9AM" means 9AM where the USER is. This previously read .hour off the
    # UTC timestamp, so the badge and the "When You Show Up" chart — which does
    # convert to local time — disagreed about what counted as a morning.
    morning_count = 0
    for c in completions:
        try:
            ts = c.get("completed_at", "")
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts.astimezone(tz).hour < 9:
                morning_count += 1
        except Exception:
            pass
    if morning_count >= 10:
        add("morning_warrior")

    sorted_comps = sorted(completions, key=lambda x: x["date"])
    for i in range(1, len(sorted_comps)):
        d1 = datetime.strptime(sorted_comps[i-1]["date"], "%Y-%m-%d")
        d2 = datetime.strptime(sorted_comps[i]["date"], "%Y-%m-%d")
        if (d2 - d1).days >= 7:
            add("comeback")
            break

    for ach in new_ach:
        await db.achievements.insert_one(ach)
    return new_ach
