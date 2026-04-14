# FORGE Flexible Habit Scheduling — "Rhythm-Aware" System

## The Psychology Behind This

FORGE's core identity is built on the Phillippa Lally / UCL research (published in the *European Journal of Social Psychology*): habit automaticity takes **66 days on average**, not the pop-psychology 21-day myth. But here's what that same research reveals that most apps ignore:

1. **Missing a single day does not reset progress.** Lally's data shows that a single missed occasion has no measurable impact on the eventual automaticity of the habit. The killer is *consecutive* missed days, not isolated ones.
2. **Context-dependent repetition** is what builds neural pathways — doing the same behavior in response to the same cue. A gym habit that fires on M/W/F after work is building the *same* neural pathway each time. Forcing it into Saturday mornings is actually counterproductive — it introduces a novel context that dilutes automaticity.
3. **Perceived failure collapses self-efficacy.** When a user sees their "streak" break because Sunday was their planned rest day, the app is punishing them for healthy behavior. This is the single biggest cause of abandonment in habit trackers (Fogg, 2019).

### FORGE's Approach: "Rhythm, Not Rigidity"

Instead of copying frequency pickers from other apps, we'll build a **rhythm-aware scheduling system** that treats each habit's cadence as a *contract between the user and the AI*. The system knows when you're "on" and when you're "off" — and it measures your commitment accordingly.

---

## ⚠️ User Review Required

### Breaking Change: Streak Calculation
**Today**, streaks count consecutive calendar days with *any* completion. **With this change**, streaks will be calculated per-habit and will count consecutive *scheduled* days. The global streak on the Dashboard will become the minimum streak across all active habits — meaning the weakest link determines the chain. This is psychologically more honest. If you'd prefer to keep the global streak as "at least one habit completed per day," let me know.

### Backward Compatibility
**Existing habits will default to "Every Day."** All current habits in the database will automatically be treated as daily habits. No existing data migration is needed — a missing `frequency_type` field is interpreted as `"daily"` by default.

---

## Three Frequency Modes

| Mode | Label in UI | How It Works | Streak Logic |
|------|------------|--------------|---------------|
| `daily` | **Every Day** | Expected every calendar day. Current behavior. | Consecutive calendar days with completion. |
| `specific_days` | **Specific Days** | User picks exact days (e.g., Mon/Wed/Fri). | Consecutive *scheduled* days with completion. Unscheduled days are invisible to the streak engine. |
| `times_per_week` | **Times Per Week** | User sets a weekly target (e.g., 3x/week). No specific days enforced. | Consecutive *weeks* (Mon-Sun) where the target was met or exceeded. |

---

## Proposed Changes

### Backend — Schema & Models

**File: `backend/server.py`**

**Pydantic Models** (`HabitCreate`, `HabitUpdate`) — add three new fields:
```python
class HabitCreate(BaseModel):
    name: str
    priority: int = 1
    context: str = ""
    target_time: str = ""
    color: str = "#F97316"
    frequency_type: str = "daily"         # "daily" | "specific_days" | "times_per_week"
    frequency_days: list[int] = []        # [0,1,2,3,4,5,6] — 0=Mon, 6=Sun (ISO weekday)
    frequency_target: int = 7             # For times_per_week (1-7)
```

**Habit creation route** (`POST /habits`): Store the three new fields alongside existing habit data.

**Habit update route** (`PUT /habits/{id}`): Allow updating frequency fields.

---

### Backend — Intelligence Layer

#### Streak Calculation: `compute_streak()`

The current implementation iterates backward through calendar days. The new version will accept the habit document and branch:

- **`daily`**: Current logic. Walks backward day-by-day.
- **`specific_days`**: Walks backward day-by-day, but *skips* days not in `frequency_days`. Only scheduled days count. A missed scheduled day breaks the streak.
- **`times_per_week`**: Groups completions into ISO weeks (Mon–Sun). Counts consecutive weeks backward where `completions_in_week >= frequency_target`. Current (incomplete) week is included if target is already met.

#### Stats Endpoint: `GET /analytics/stats`

Current logic:
```python
"habits_today": len(today_comps),
"habits_total": len(habits)
```

New logic:
```python
# Only count habits that are scheduled for TODAY
today_weekday = datetime.now(timezone.utc).weekday()  # 0=Mon
scheduled_habits = [h for h in habits if is_habit_scheduled_today(h, today_weekday)]
"habits_today": len([c for c in today_comps if c["habit_id"] in scheduled_ids]),
"habits_total": len(scheduled_habits)
```

This means the "Daily Progress" bar shows `2/3 habits` if only 3 of your 5 habits are scheduled for today. **Clean, honest, no guilt.**

#### Helper: `is_habit_scheduled_today(habit, weekday)`

```python
def is_habit_scheduled_today(habit: dict, weekday: int) -> bool:
    ft = habit.get("frequency_type", "daily")
    if ft == "daily":
        return True
    if ft == "specific_days":
        return weekday in habit.get("frequency_days", [])
    if ft == "times_per_week":
        return True  # Always "available" — user decides when
    return True
```

#### Daily Reminder Email Job

Current: sends to all users with incomplete habits.
New: only includes habits that are scheduled for today. If a user has zero scheduled habits today, skip entirely — no email.

#### Analytics: `compute_dow_patterns()`

Current: divides completions by total habits per day.
New: divides completions by *scheduled* habits per day. This prevents M/W/F gym habits from dragging down your Tuesday score.

---

### Frontend — Dashboard

**File: `frontend/src/components/Dashboard.js`**

**Two-section habit list:**

1. **"Due Today" section** — Habits scheduled for today. Full interactivity, vibrant styling.
2. **"Rest Day" section** — Habits NOT scheduled today. Shown dimly at the bottom with a subtle divider. Users CAN still tap to complete (bonus credit), but they're visually deprioritized.

For `times_per_week` habits in the "Due Today" section, show a small weekly progress indicator:
```
[Running 🏃] ●●○ 2/3 this week
```
Three small dots showing progress toward the weekly target. Filling up gives a satisfying visual.

**Daily Progress bar** only counts scheduled habits — preventing artificial 0% days on rest days.

---

### Frontend — Settings (Habit Creation & Edit)

**File: `frontend/src/components/Settings.js`**

Add a **Frequency** section to the "Add New Habit" form and the inline edit form:

1. **Segmented Control** — Three pills: `Every Day` (default) | `Specific Days` | `X Times/Week`
2. **Specific Days** → Reveals 7 circular day buttons: `M T W T F S S`. Tappable, multi-select. Orange fill when selected.
3. **Times/Week** → Reveals a stepper (1–7) with `−` and `+` buttons.

The form state adds:
```javascript
const [newHabit, setNewHabit] = useState({
  name: "", priority: 1, context: "",
  frequency_type: "daily", frequency_days: [], frequency_target: 7
});
```

---

### Frontend — Onboarding

**File: `frontend/src/components/Onboarding.js`**

Add the same frequency picker to Step 2 (Add Habits). Users should set their rhythm from Day 1 — this is critical for the 66-day path to be accurate.

---

### Frontend — Habit Detail Modal

**File: `frontend/src/components/HabitDetailModal.js`**

1. **Show frequency badge** in the header next to the priority tag. e.g., `Mon · Wed · Fri` or `3x/week`.
2. **Calendar view** — On non-scheduled days for `specific_days` habits, render day cells in a lighter shade (like `bg-gray-50`) to visually distinguish "rest days" from "missed days." This is psychologically critical: gray = rest, not red = failure.
3. **Streak label** — Change from "Day streak" to "Scheduled streak" for non-daily habits, so users understand it's measuring scheduled consistency.
4. **Frontend `calcStreak()`** — Mirror the backend logic: skip unscheduled days, count ISO weeks for weekly targets.

---

### Frontend — Analytics

**File: `frontend/src/components/Analytics.js`**

- **Heatmap**: No change needed (it already shows actual completion rates per day).
- **Day-of-Week Patterns**: The backend change handles the denominator fix.
- **Consistency metric**: Will automatically become more accurate since the rate calculation uses scheduled habits, not total habits.

---

## 🔥 Coach Mode Integration — "The Schedule Is Your Contract"

The scheduling system doesn't just change what gets tracked — it fundamentally changes how each mode *talks to the user* about their performance. The schedule becomes a **psychological contract**: you chose these days, you defined this rhythm. Each mode holds you to that contract differently.

### 🌱 Supportive Mode — "Grace with Guidance"

**Philosophy:** Rest days are celebrated, not just tolerated. The schedule proves the user is being intentional, not lazy.

**Dashboard messaging:**
- Rest day: `"Rest day for [Habit]. Recovery is part of the process. 💚"`
- Missed scheduled day: `"Yesterday was a [Habit] day and it slipped. That's one day — not a pattern. Show up today."`
- Weekly target met early: `"You hit your 3x goal by Thursday! That's ahead of schedule. 🎉"`

**AI Coach prompt addition:**
```
HABIT SCHEDULES:
- Morning Run: M/W/F (specific_days) — Hit: M✓ W✓ F✗ | Scheduled streak: 4
- Read 30min: Daily — Streak: 12
- Meditation: 3x/week — This week: 2/3

When referencing missed scheduled days, acknowledge the effort on completed days first.
Frame rest days as intentional decisions, not gaps.
If they completed a habit on a rest day, celebrate the bonus effort.
```

**Fallback template update (mid tier):**
```
"At {pct}% on your scheduled days — that's the number that matters. You designed 
this rhythm yourself, and {best_day} at {best_pct}% proves the system works when 
you trust it. {worst_day} dipped to {worst_pct}% — What changed about your 
environment that day?"
```

---

### 📊 Strategic Mode — "Data Weaponized for Optimization"

**Philosophy:** The schedule creates a controlled experiment. Strategic mode treats each frequency type as a variable to optimize.

**Dashboard messaging:**
- Rest day: `"[Habit] — Not scheduled today. Next: Wednesday"`
- Missed scheduled day: No sugar-coating, just data: `"Missed: Morning Run (was scheduled). Schedule adherence: 78%"`
- Weekly target: `"Running: 2/3 this week. 1 remaining by Sunday."`

**AI Coach prompt addition:**
```
HABIT SCHEDULES:
- Morning Run: M/W/F (specific_days) — Adherence: 83% (5/6 scheduled). Consistently missed: Friday.
- Read 30min: Daily — Adherence: 71%
- Meditation: 3x/week — Met target: 2 of last 4 weeks

Calculate per-habit schedule adherence rates.
Identify which specific scheduled days are systematically missed.
Cross-reference missed scheduled days with mood data — is Friday skipping correlated with low Friday mood?
Recommend schedule adjustments based on data: "Your data suggests moving Friday's run to Saturday would increase adherence by ~15%."
```

**Fallback template update (mid tier):**
```
"{pct}% schedule adherence over 14 days. {best_day} adherence: {best_pct}% vs 
{worst_day}: {worst_pct}% — a {var}% delta. Your M/W/F habits show highest 
compliance on Mondays, systematic drop on Fridays. Consider restructuring Friday 
or moving it to a day your data shows higher execution capacity."
```

---

### ⚡ Direct Mode — "The Death Warrant They Signed"

**Philosophy:** Direct mode is the fire. The anvil. The thing that makes FORGE mean something. The scheduling system does not soften Direct mode — it gives the fire a more precise target. Before, Direct mode had a blunt hammer: "your completion rate is 40%, stop making excuses." Now it has a scalpel: "You looked at this screen, picked Monday, Wednesday, Friday, and hit Save. That was YOUR decision. You showed up Monday. You bailed Wednesday. You bailed Friday. Two broken promises in one week — on a schedule YOU designed because daily was too hard."

**The schedule is a death warrant. They signed it themselves. No one forced them.**

**Dashboard messaging:**
- Rest day: **Nothing.** No message. No acknowledgment. No emoji. The habit is dimmed. That's it. Rest is not something Direct mode celebrates or even notices. You don't get a trophy for not working.
- Missed scheduled day: The habit card shows a small red indicator. No motivational text. The data speaks.
- Weekly target behind: `"1/3 this week. 2 days left."` — Cold. Just the numbers. The math is the message.
- Weekly target met: Checkmark. No confetti, no encouragement. You did the minimum of what you promised. That's not exceptional. That's expected.

**AI Coach prompt — APPENDED to existing Direct instructions (not replaced):**
```
SCHEDULE DATA (Direct Mode treats this as a signed contract):
- Morning Run: M/W/F — Adherence: 50% (3/6 scheduled). Avoidance pattern: Every Friday.
- Read 30min: Daily — 57% — Missing almost every other day.
- Meditation: 3x/week — Hit target 1 of last 4 weeks. 25%. Effectively abandoned.

RULES FOR DIRECT MODE + SCHEDULES:
- The user CHOSE this schedule. Nobody assigned it. Remind them of that.
- If adherence < 50% on any habit, question whether they actually want this habit or are just 
  performing the act of "self-improvement" for their own ego.
- If they skip the same day repeatedly (e.g., always skip Friday), name it: 
  "You skip every Friday. That's not bad luck, that's avoidance. Either own Friday or remove it 
  from your schedule and stop pretending."
- Reference their Direct Mode activation reason when they're underperforming. They wrote WHY they 
  wanted to be pushed. Use their own words against their own excuses.
- If they set a schedule weaker than daily (e.g., 3x/week) and STILL can't hit it, that's worse 
  than failing at daily. They lowered the bar and still tripped.
- Do NOT congratulate rest days. Do NOT say "good job taking a break." Rest is not an achievement. 
  Showing up is. If they didn't show up yesterday, today's rest day is just another day they 
  didn't do anything.
```

**Fallback template updates (schedule-aware variants — ADDED alongside existing templates):**

**High tier (≥75%):**
```
"{pct}% schedule adherence — leaving {gap}% on the table. {worst_day} at {worst_pct}% 
is unacceptable when {best_day} proves you can hit {best_pct}%. You chose this 
schedule. {worst_day} isn't optional — it's part of the contract. Fix it this week 
or admit you can't handle the rhythm you designed for yourself."
```

**Mid tier (40-74%):**
```
"{pct}% on a schedule YOU wrote. Nobody forced M/W/F on you. Nobody said 3x/week. 
That was you. {worst_day} at {worst_pct}% — you're consistently breaking a promise 
to yourself on the same day every week. That's not a scheduling problem. That's you 
deciding {worst_day} doesn't matter. If it doesn't, remove it. If it does, show up."
```

**Low tier (<40%):**
```
"{pct}% schedule adherence. You didn't even commit to daily — you picked a lighter 
schedule and you're STILL failing at it. Think about that. You lowered the bar to 
make it easier and you can't clear it. Your Direct Mode reason was: '{direct_reason}'. 
Read that again. Now look at {pct}%. Is this what that person would do? Delete every 
habit except one. Hit it every scheduled day for 7 days. Prove you mean a single word 
of what you wrote."
```

---

### 🚨 PRESERVATION RULES — DO NOT BREAK EXISTING MODES

> **Critical implementation constraint:** The existing `MODE_INSTRUCTIONS` dict and `FALLBACK` templates in `server.py` are **NOT replaced.** They are the foundation. Here's exactly what happens:

**Existing code (PRESERVED VERBATIM — lines 530-551 of server.py):**
```python
MODE_INSTRUCTIONS = {
    "supportive": "Be warm, encouraging. Celebrate small wins. Reframe setbacks positively.",
    "strategic": "Be analytical and data-driven. Focus on optimization. Professional tone.",
    "direct": "Be brutally honest. Call out patterns. Zero tolerance for excuses. Reference their Direct Mode reason. They asked for this—don't hold back."
}
```

**What we ADD (appended after the existing text, not replacing it):**
```python
SCHEDULE_MODE_ADDITIONS = {
    "supportive": "When referencing schedules: praise rest-day discipline. Frame missed days as single events. Celebrate bonus effort on rest days.",
    "strategic": "When referencing schedules: calculate per-day adherence rates. Identify systematic misses. Recommend schedule adjustments based on data.",
    "direct": "When referencing schedules: the schedule is THEIR contract — a death warrant they signed. Every missed scheduled day is a self-broken promise. Do not acknowledge rest days. If adherence < 50%, question their commitment. Call out avoidance patterns by specific day. Use their Direct Mode reason against their own excuses."
}

# Combined at runtime:
# mode_instruction = MODE_INSTRUCTIONS[mode] + "\n" + SCHEDULE_MODE_ADDITIONS[mode]
```

**Existing FALLBACK templates (PRESERVED VERBATIM):**
The current `high`, `mid`, `low` templates for each mode remain **exactly as they are**. The schedule-aware templates above are used ONLY when the habit has a non-daily frequency. Daily habits continue to use the original templates unchanged.

```python
# Selection logic:
if any(h.get("frequency_type", "daily") != "daily" for h in habits):
    template = SCHEDULE_FALLBACK[mode][tier]  # New schedule-aware template
else:
    template = FALLBACK[mode][tier]           # Original template, untouched
```

---

### AI Context Data Enhancement

Add schedule-aware data to the `user_content` string sent to the AI (appended to existing context, not replacing any fields):

```python
# Build per-habit schedule adherence
schedule_lines = []
for h in context.get("habits", []):
    ft = h.get("frequency_type", "daily")
    if ft == "daily":
        freq_label = "Daily"
    elif ft == "specific_days":
        day_names = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
        freq_label = "/".join([day_names[d] for d in h.get("frequency_days", [])])
    else:
        freq_label = f"{h.get('frequency_target', 1)}x/week"
    
    adherence = compute_habit_adherence(h, habit_completions, 14)
    schedule_lines.append(f"- {h['name']}: {freq_label} — Adherence: {adherence}%")

# APPENDED to user_content — existing fields remain untouched
user_content += f"\nHABIT SCHEDULES:\n" + "\n".join(schedule_lines)
```

### Dashboard Header Message (per mode)

The `Dashboard.js` header currently shows `"Hey, {name}"` or `"Perfect Day! 🔥"`. With scheduling, add mode-aware rest-day messaging **only when ALL habits are unscheduled today**:

```javascript
const scheduledCount = habits.filter(h => isScheduledToday(h)).length;
const isFullRestDay = scheduledCount === 0;

// Supportive
if (isFullRestDay && mode === "supportive") header = "Rest day — you earned it 💚";
// Strategic  
if (isFullRestDay && mode === "strategic") header = "No habits scheduled today.";
// Direct — NOTHING changes. Same default greeting. 
// Direct mode does not acknowledge rest. Period.
```

---

## Summary of All File Changes

| File | Type | What Changes |
|------|------|-------------|
| `backend/server.py` | MODIFY | Pydantic models, habit CRUD, streak calc, stats, daily job, analytics helpers |
| `frontend/src/components/Dashboard.js` | MODIFY | Two-section habit list, weekly progress dots, scheduled-only progress bar |
| `frontend/src/components/Settings.js` | MODIFY | Frequency picker in add/edit habit forms |
| `frontend/src/components/Onboarding.js` | MODIFY | Frequency picker in onboarding Step 2 |
| `frontend/src/components/HabitDetailModal.js` | MODIFY | Frequency badge, calendar rest-day shading, streak label, frontend streak calc |
| `frontend/src/components/Analytics.js` | MINOR | No direct changes; backend fixes the data it receives |

---

## ✅ Finalized Decisions

### 1. Bonus Credit on Rest Days → **(A) Points only, no streak effect**
Completing a habit on an unscheduled day earns bonus points but does NOT extend the streak. The schedule is the contract — bonus effort is rewarded but doesn't game the system.

### 2. Global Streak → **(A) ALL scheduled habits must be completed**
"Consecutive days where ALL scheduled habits were completed." Your weakest link defines the chain. Days with zero scheduled habits are skipped (don't break or extend the streak).

### 3. AI Coach Frequency Data → **YES**
The AI prompt will include per-habit schedule, adherence rates, and avoidance patterns. Each mode processes this data according to its personality (Supportive celebrates, Strategic optimizes, Direct weaponizes).

---

## Verification Plan

### Manual Verification
1. Create 3 test habits: Daily, Specific Days (M/W/F), Times/Week (3x)
2. Toggle completions and verify the Dashboard correctly separates "Due Today" vs "Rest Day"
3. Navigate to a Tuesday and confirm the M/W/F habit appears dimmed
4. Check streak calculation: complete M and W, skip F → streak should break
5. Check weekly target: complete 3 check-ins by Thursday → weekly progress shows ●●● 3/3
6. Verify the Onboarding flow captures frequency during habit setup
7. Rebuild Docker and verify backend handles missing `frequency_type` gracefully (backward compatibility)
