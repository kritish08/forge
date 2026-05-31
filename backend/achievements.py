import uuid
from datetime import datetime, timezone
from db import db
from logic import get_user_today, compute_global_streak

async def check_and_award_achievements(user_id: str) -> list:
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        return []
    completions = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    existing_types = {a["type"] for a in await db.achievements.find({"user_id": user_id}, {"_id": 0}).to_list(1000)}
    today = get_user_today(user)
    new_ach = []

    def award(t, name, desc):
        if t not in existing_types:
            return {"achievement_id": f"ach_{uuid.uuid4().hex[:12]}", "user_id": user_id,
                    "type": t, "name": name, "description": desc,
                    "earned_at": datetime.now(timezone.utc).isoformat()}
        return None

    if len(completions) >= 1:
        a = award("first_checkin", "First Flame", "Your journey of a thousand habits starts here.")
        if a: new_ach.append(a)

    if habits:
        today_ids = {c["habit_id"] for c in completions if c["date"] == today}
        all_ids = {h["habit_id"] for h in habits}
        if all_ids and all_ids.issubset(today_ids):
            a = award("perfect_day", "First Perfect Day", "Completed every habit in a single day!")
            if a: new_ach.append(a)

    streak = compute_global_streak(completions, habits, today)
    if streak >= 7:
        a = award("streak_7", "7-Day Streak", "7 consecutive days of consistency!")
        if a: new_ach.append(a)
    if streak >= 30:
        a = award("streak_30", "Forge Legend", "30 consecutive days - unstoppable!")
        if a: new_ach.append(a)

    if len(completions) >= 100:
        a = award("checkins_100", "Centurion", "100 check-ins completed. Respect.")
        if a: new_ach.append(a)

    morning_count = 0
    for c in completions:
        try:
            ts = c.get("completed_at", "")
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts)
            if ts.hour < 9:
                morning_count += 1
        except Exception:
            pass
    if morning_count >= 10:
        a = award("morning_warrior", "Morning Warrior", "10 completions before 9AM.")
        if a: new_ach.append(a)

    sorted_comps = sorted(completions, key=lambda x: x["date"])
    for i in range(1, len(sorted_comps)):
        d1 = datetime.strptime(sorted_comps[i-1]["date"], "%Y-%m-%d")
        d2 = datetime.strptime(sorted_comps[i]["date"], "%Y-%m-%d")
        if (d2 - d1).days >= 7:
            a = award("comeback", "Comeback King", "Restarted after a break. Resilience > Perfection.")
            if a: new_ach.append(a)
            break

    for ach in new_ach:
        await db.achievements.insert_one(ach)
    return new_ach
