from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from config import AZURE_ENDPOINT, AZURE_MODEL, AZURE_API_KEY, logger
from logic import compute_habit_adherence

SYSTEM_PROMPT = """You are FORGE's AI habit coach. Analyze user data and give genuine, personalized insights.

CRITICAL RULES:
1. Always cite specific numbers from their data
2. Reference past AI insights when available — show memory and continuity
3. If user followed a past suggestion, acknowledge it and measure the outcome
4. Give exactly 1-2 specific, actionable suggestions based on THEIR patterns
5. Keep it 4-6 sentences, conversational tone
6. NEVER give generic advice — every sentence must reference their actual data
7. Cross-reference their completion rates with their reported moods/gratitude to find correlations

Mode: {mode}
{mode_instruction}"""

MODE_INSTRUCTIONS = {
    "supportive": "Be warm, encouraging. Celebrate small wins. Reframe setbacks positively.",
    "strategic": "Be analytical and data-driven. Focus on optimization. Professional tone.",
    "direct": "Be brutally honest. Call out patterns. Zero tolerance for excuses. Reference their Direct Mode reason. They asked for this—don't hold back."
}

# Schedule-aware additions — APPENDED to MODE_INSTRUCTIONS at runtime, never replacing
SCHEDULE_MODE_ADDITIONS = {
    "supportive": "When referencing schedules: praise rest-day discipline. Frame missed days as single events, not patterns. Celebrate bonus effort on rest days.",
    "strategic": "When referencing schedules: calculate per-day adherence rates. Identify systematic misses. Cross-reference with mood data. Recommend schedule adjustments based on data.",
    "direct": "When referencing schedules: the schedule is THEIR contract — a death warrant they signed. Every missed scheduled day is a self-broken promise. Do not acknowledge rest days. If adherence < 50%, question their commitment. Call out avoidance patterns by specific day name. Use their Direct Mode reason against their own excuses. If they chose a lighter schedule and still can't hit it, that's worse — they lowered the bar and tripped."
}

FALLBACK = {
    "supportive": {
        "high": "You're at {pct}% over the last 2 weeks — genuinely impressive. Your {best_day} performance ({best_pct}%) shows what happens when your environment aligns. Try front-loading your hardest habit in the morning to replicate that success.",
        "mid": "At {pct}% completion, you've built a foundation worth keeping. Your {best_day} ({best_pct}%) proves you know how to show up. Identify what made {best_day} different and replicate it on {worst_day}.",
        "low": "At {pct}% this period, momentum hasn't clicked yet — but {best_day} at {best_pct}% shows it's possible. Start with one habit per day. Consistency beats quantity."
    },
    "strategic": {
        "high": "{pct}% over 14 days. Peak day {best_day}: {best_pct}%. Weakest day {worst_day}: {worst_pct}%. Close the {var}% gap by systematizing your {best_day} routine for the other days.",
        "mid": "{pct}% over 14 days. {best_day} at {best_pct}% vs {worst_day} at {worst_pct}% — that's a {var}% swing. Apply your {best_day} conditions to weak days.",
        "low": "{pct}% completion means you're skipping more than completing. {best_day} at {best_pct}% is the benchmark. Identify what made {best_day} work and replicate it daily."
    },
    "direct": {
        "high": "{pct}% — good but leaving {gap}% on the table. {worst_day} at {worst_pct}% is unacceptable given {best_day} ({best_pct}%). Fix {worst_day} this week.",
        "mid": "{pct}% means skipping every third day. {best_day} at {best_pct}% shows you know how. Stop accepting {worst_day} ({worst_pct}%) as normal.",
        "low": "Below 40% — that's wishful tracking. {best_day} at {best_pct}% proves you can. Pick one priority habit and do it every day this week. No excuses."
    }
}

def generate_template_insight(context: dict, mode: str = "supportive") -> str:
    pct = context.get("completion_rate", 0)
    dow = context.get("dow_patterns", {})
    best_day = max(dow, key=dow.get) if dow else "Monday"
    worst_day = min(dow, key=dow.get) if dow else "Sunday"
    best_pct = round(dow.get(best_day, 0))
    worst_pct = round(dow.get(worst_day, 0))
    gap = round(100 - pct)
    var = best_pct - worst_pct
    tier = "high" if pct >= 75 else ("mid" if pct >= 40 else "low")
    templates = FALLBACK.get(mode, FALLBACK["supportive"])
    return templates.get(tier, templates["mid"]).format(
        pct=round(pct), best_day=best_day, best_pct=best_pct,
        worst_day=worst_day, worst_pct=worst_pct, gap=gap, var=var)

async def generate_ai_insight(user: dict, context: dict, reflection: str = "") -> str:
    mode = user.get("mode", "supportive")
    # Combine base mode instruction with schedule-aware addition
    base_instruction = MODE_INSTRUCTIONS.get(mode, "")
    schedule_addition = SCHEDULE_MODE_ADDITIONS.get(mode, "")
    combined_instruction = f"{base_instruction}\n{schedule_addition}"
    system_prompt = SYSTEM_PROMPT.format(mode=mode.upper(), mode_instruction=combined_instruction)
    
    habits_list = context.get("habits", [])
    all_comps = context.get("all_completions", [])
    habits_str = "\n".join([f"- {h['name']} (P{h['priority']}, for: {h.get('context', 'N/A')})" for h in habits_list])
    past_str = "\n".join([f"[{i.get('created_at','')[:10]}] {i.get('content','')[:200]}" for i in context.get("past_insights", [])[-3:]])
    dow = context.get("dow_patterns", {})
    time_p = context.get("time_patterns", {})
    
    moods = context.get("moods", [])
    mood_str = "\n".join([f"[{m.get('date')}] Rating: {m.get('rating')}/5, Note: {m.get('note', '')}, Gratitude: {m.get('gratitude', '')}" for m in moods])
    
    achievements = context.get("achievements", [])
    achv_str = ", ".join([a.get('type', '') for a in achievements])

    # Build per-habit schedule adherence lines
    day_names = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    schedule_lines = []
    for h in habits_list:
        ft = h.get("frequency_type", "daily")
        if ft == "daily":
            freq_label = "Daily"
        elif ft == "specific_days":
            freq_label = "/".join([day_names[d] for d in sorted(h.get("frequency_days", []))])
        else:
            freq_label = f"{h.get('frequency_target', 1)}x/week"
        
        # Calculate local_now based on context
        tz_str = user.get("timezone", "UTC")
        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = timezone.utc
        local_now = datetime.now(tz)
        
        adherence = compute_habit_adherence(h, all_comps, local_now, 14)
        schedule_lines.append(f"- {h['name']}: {freq_label} — Adherence: {adherence}%")
    schedule_str = "\n".join(schedule_lines) if schedule_lines else "No schedule data"

    user_content = f"""HABITS:\n{habits_str or 'None yet'}
HABIT SCHEDULES:\n{schedule_str}
COMPLETION RATE (14 days): {round(context.get('completion_rate', 0))}%
STREAK: {context.get('streak', 0)} days | TOTAL CHECK-INS: {context.get('total_checkins', 0)}
DAY PATTERNS:\n{chr(10).join([f"  {d}: {p}%" for d, p in dow.items()])}
TIME PATTERNS: Early(<9AM):{time_p.get('early',0)}% Morning:{time_p.get('morning',0)}% Afternoon:{time_p.get('afternoon',0)}% Evening:{time_p.get('evening',0)}%
MOODS & GRATITUDE (Last 7 days):\n{mood_str or 'No moods logged recently'}
RECENT ACHIEVEMENTS: {achv_str or 'None recently'}
PAST INSIGHTS:\n{past_str or 'None yet'}
USER REFLECTION: {reflection or 'No reflection provided'}
DIRECT MODE REASON: {user.get('direct_mode_reason', 'N/A') if mode == 'direct' else 'N/A'}
Generate personalized insight:"""

    if AZURE_API_KEY:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(
                base_url=AZURE_ENDPOINT,
                api_key=AZURE_API_KEY
            )
            response = await client.chat.completions.create(
                model=AZURE_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.7
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error("Azure AI error: %s", e)

    return generate_template_insight(context, mode)
