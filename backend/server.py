from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, time, base64, json
from pathlib import Path
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone, timedelta
from cryptography.fernet import Fernet
from collections import defaultdict
from jose import JWTError, jwt
from passlib.context import CryptContext
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from apscheduler.schedulers.asyncio import AsyncIOScheduler

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

AZURE_ENDPOINT = os.environ.get("AZURE_ENDPOINT", "https://kyrex-hub-resource.openai.azure.com/openai/v1/")
AZURE_MODEL = os.environ.get("AZURE_MODEL", "gpt-5.2")
AZURE_API_KEY = os.environ.get("AZURE_API_KEY", "")
APP_URL = os.environ.get("APP_URL", "http://localhost")
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "")
ALGORITHM = "HS256"
VAPID_PRIVATE_KEY_B64 = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")
fernet = None
if ENCRYPTION_KEY:
    try:
        fernet = Fernet(ENCRYPTION_KEY.encode())
    except Exception:
        pass

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
limiter = Limiter(key_func=get_remote_address)
scheduler = AsyncIOScheduler(timezone="UTC")

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api_router = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ── Encryption ─────────────────────────────────────────────────────────────────
def encrypt_value(v: str) -> str:
    if fernet and v:
        return fernet.encrypt(v.encode()).decode()
    return v

def decrypt_value(v: str) -> str:
    if fernet and v:
        try:
            return fernet.decrypt(v.encode()).decode()
        except Exception:
            return v
    return v


# ── JWT Auth ────────────────────────────────────────────────────────────────────
def create_token(user_id: str, token_type: str, expires_minutes: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    return jwt.encode({"sub": user_id, "exp": exp, "type": token_type}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

async def get_current_user(request: Request):
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── Models ──────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    picture: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class PasswordResetRequest(BaseModel):
    email: str

class PasswordReset(BaseModel):
    token: str
    new_password: str

class HabitCreate(BaseModel):
    name: str
    priority: int = 1
    context: str = ""
    target_time: str = ""
    color: str = "#F97316"

class HabitUpdate(BaseModel):
    name: Optional[str] = None
    priority: Optional[int] = None
    context: Optional[str] = None
    target_time: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None

class CompletionCreate(BaseModel):
    habit_id: str

class MoodCreate(BaseModel):
    rating: int
    note: str = ""
    gratitude: str = ""

class InsightRequest(BaseModel):
    reflection: str = ""

class UserSettingsUpdate(BaseModel):
    mode: Optional[str] = None
    direct_mode_reason: Optional[str] = None
    ai_provider: Optional[str] = None
    azure_api_key: Optional[str] = None
    azure_endpoint: Optional[str] = None
    azure_model: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    email_daily_reminder: Optional[bool] = None
    email_weekly_summary: Optional[bool] = None

class PushSubscribeRequest(BaseModel):
    subscription: dict


# ── Gamification ────────────────────────────────────────────────────────────────
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

def compute_streak(completions: list, today_str: str) -> int:
    if not completions:
        return 0
    dates = sorted(set(c["date"] for c in completions), reverse=True)
    streak, expected = 0, today_str
    for d in dates:
        if d == expected:
            streak += 1
            expected = (datetime.strptime(expected, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        elif d < expected:
            break
    return streak

async def check_and_award_achievements(user_id: str) -> list:
    completions = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    existing_types = {a["type"] for a in await db.achievements.find({"user_id": user_id}, {"_id": 0}).to_list(1000)}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
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

    streak = compute_streak(completions, today)
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


# ── Analytics helpers ───────────────────────────────────────────────────────────
def compute_dow_patterns(completions: list, habits: list, days: int = 30) -> dict:
    today = datetime.now(timezone.utc)
    n_habits = max(len(habits), 1)
    by_date = defaultdict(int)
    for c in completions:
        by_date[c["date"]] += 1
    dow_data = defaultdict(lambda: {"c": 0, "p": 0})
    for i in range(days):
        d = today - timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        dow_data[d.weekday()]["c"] += by_date.get(ds, 0)
        dow_data[d.weekday()]["p"] += n_habits
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return {names[k]: round(v["c"] / max(v["p"], 1) * 100, 1) for k, v in dow_data.items()}

def compute_time_patterns(completions: list) -> dict:
    buckets = defaultdict(int)
    for c in completions:
        try:
            ts = c.get("completed_at", "")
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts)
            h = ts.hour
            if h < 9: buckets["early"] += 1
            elif h < 12: buckets["morning"] += 1
            elif h < 17: buckets["afternoon"] += 1
            else: buckets["evening"] += 1
        except Exception:
            pass
    total = max(sum(buckets.values()), 1)
    return {k: round(v / total * 100, 1) for k, v in buckets.items()}


# ── Email helpers ───────────────────────────────────────────────────────────────
async def send_email(to: str, subject: str, html_body: str):
    smtp_host = os.environ.get("SMTP_HOST", "")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    smtp_from = os.environ.get("SMTP_FROM", f"FORGE <{smtp_user}>")

    if not smtp_host or not smtp_user:
        logger.info("SMTP not configured, skipping email to %s", to)
        return

    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_from
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html"))
        await aiosmtplib.send(msg, hostname=smtp_host, port=smtp_port,
                              username=smtp_user, password=smtp_pass, start_tls=True)
        logger.info("Email sent to %s: %s", to, subject)
    except Exception as e:
        logger.error("Email send failed: %s", e)


async def send_welcome_email(email: str, name: str):
    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h1 style="color: #F97316; font-size: 28px; margin-bottom: 8px;">Welcome to FORGE, {name}!</h1>
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        You've taken the first step toward data-driven habit mastery.<br/>
        <strong>Consistency forged in fire.</strong>
      </p>
      <div style="background: #FFF7ED; border: 2px solid #FED7AA; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <p style="color: #92400E; margin: 0; font-size: 14px;">
          <strong>How FORGE works:</strong><br/>
          Track habits daily → Build patterns → Get AI insights → Improve systematically.
        </p>
      </div>
      <a href="{APP_URL}" style="display: inline-block; background: #F97316; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 15px;">Start Your First Day →</a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You'll receive daily reminders at 8PM and weekly summaries on Sundays.<br/>
        Manage preferences in <a href="{APP_URL}/settings" style="color: #F97316;">Settings</a>.
      </p>
    </div>"""
    await send_email(email, "Welcome to FORGE — Let's build something real", html)


# ── Push Notifications ──────────────────────────────────────────────────────────
async def send_push(user: dict, title: str, body: str, url: str = "/"):
    sub = user.get("push_subscription")
    if not sub or not VAPID_PRIVATE_KEY_B64:
        return
    try:
        from pywebpush import webpush, WebPushException
        private_pem = base64.b64decode(VAPID_PRIVATE_KEY_B64 + "==").decode()
        contact_email = os.environ.get("SMTP_USER", "admin@example.com")
        webpush(
            subscription_info=sub,
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=private_pem,
            vapid_claims={"sub": f"mailto:{contact_email}"}
        )
    except Exception as e:
        logger.error("Push notification failed: %s", e)


# ── Scheduled jobs ──────────────────────────────────────────────────────────────
async def daily_reminder_job():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    users = await db.users.find({"onboarding_completed": True}, {"_id": 0}).to_list(10000)
    for user in users:
        user_id = user["user_id"]
        habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
        if not habits:
            continue
        today_comps = await db.completions.find({"user_id": user_id, "date": today}, {"_id": 0}).to_list(100)
        done_ids = {c["habit_id"] for c in today_comps}
        remaining = [h for h in habits if h["habit_id"] not in done_ids]
        if not remaining:
            continue

        # Push notification
        await send_push(user, "FORGE — Check in!", f"{len(remaining)} habit(s) remaining today 🔥")

        # Email
        if user.get("email_daily_reminder", True) and user.get("email"):
            items = "".join([f"<li style='margin:4px 0'>{h['name']}</li>" for h in remaining[:5]])
            all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
            streak = compute_streak(all_comps, today)
            html = f"""
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
              <h2 style="color:#F97316">🔥 Daily Check-in — Keep the streak alive!</h2>
              <p style="color:#374151">Hey {user['name']}, you have <strong>{len(remaining)}</strong> habit(s) left today:</p>
              <ul style="color:#374151;padding-left:20px">{items}</ul>
              <p style="color:#374151"><strong>Current streak:</strong> {streak} days</p>
              <a href="{APP_URL}" style="display:inline-block;background:#F97316;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;margin-top:16px">Open FORGE →</a>
              <p style="color:#9CA3AF;font-size:11px;margin-top:32px">
                <a href="{APP_URL}/settings" style="color:#F97316">Manage notification preferences</a>
              </p>
            </div>"""
            await send_email(user["email"], "🔥 FORGE: Complete your habits today", html)


async def weekly_summary_job():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_7 = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    users = await db.users.find({"onboarding_completed": True, "email_weekly_summary": True},
                                 {"_id": 0}).to_list(10000)
    for user in users:
        user_id = user["user_id"]
        week_comps = await db.completions.find({"user_id": user_id, "date": {"$gte": start_7}}, {"_id": 0}).to_list(10000)
        habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
        all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
        if not week_comps or not user.get("email"):
            continue

        n_habits = max(len(habits), 1)
        rate = round(len(week_comps) / (n_habits * 7) * 100)
        streak = compute_streak(all_comps, today)
        total_pts = sum(c.get("points_earned", 1) for c in all_comps)
        lvl = get_level(total_pts)

        color = "#22C55E" if rate >= 75 else ("#F59E0B" if rate >= 50 else "#EF4444")
        html = f"""
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="color:#F97316">🔥 Your FORGE Week in Review</h2>
          <p style="color:#374151">Hey {user['name']}, here's how you did this week:</p>
          <div style="background:#FFF7ED;border:2px solid #FED7AA;border-radius:12px;padding:20px;margin:20px 0">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:6px 0;color:#374151"><strong>Consistency</strong></td>
                  <td style="padding:6px 0;text-align:right;font-weight:bold;color:{color}">{rate}%</td></tr>
              <tr><td style="padding:6px 0;color:#374151"><strong>Current Streak</strong></td>
                  <td style="padding:6px 0;text-align:right;font-weight:bold;color:#374151">{streak} days 🔥</td></tr>
              <tr><td style="padding:6px 0;color:#374151"><strong>Check-ins this week</strong></td>
                  <td style="padding:6px 0;text-align:right;font-weight:bold;color:#374151">{len(week_comps)}</td></tr>
              <tr><td style="padding:6px 0;color:#374151"><strong>Current Level</strong></td>
                  <td style="padding:6px 0;text-align:right;font-weight:bold;color:#374151">Level {lvl}</td></tr>
            </table>
          </div>
          <a href="{APP_URL}/analytics" style="display:inline-block;background:#F97316;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold">View Full Analytics →</a>
          <p style="color:#9CA3AF;font-size:11px;margin-top:32px">
            <a href="{APP_URL}/settings" style="color:#F97316">Manage notification preferences</a>
          </p>
        </div>"""
        await send_email(user["email"], f"🔥 FORGE Weekly: {rate}% consistency this week", html)


# ── AI Coach ────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are FORGE's AI habit coach. Analyze user data and give genuine, personalized insights.

CRITICAL RULES:
1. Always cite specific numbers from their data
2. Reference past AI insights when available — show memory and continuity
3. If user followed a past suggestion, acknowledge it and measure the outcome
4. Give exactly 1-2 specific, actionable suggestions based on THEIR patterns
5. Keep it 4-6 sentences, conversational tone
6. NEVER give generic advice — every sentence must reference their actual data

Mode: {mode}
{mode_instruction}"""

MODE_INSTRUCTIONS = {
    "supportive": "Be warm, encouraging. Celebrate small wins. Reframe setbacks positively.",
    "strategic": "Be analytical and data-driven. Focus on optimization. Professional tone.",
    "direct": "Be brutally honest. Call out patterns. Zero tolerance for excuses. Reference their Direct Mode reason. They asked for this—don't hold back."
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
    system_prompt = SYSTEM_PROMPT.format(mode=mode.upper(), mode_instruction=MODE_INSTRUCTIONS.get(mode, ""))
    habits_str = "\n".join([f"- {h['name']} (P{h['priority']}, for: {h.get('context', 'N/A')})" for h in context.get("habits", [])])
    past_str = "\n".join([f"[{i.get('created_at','')[:10]}] {i.get('content','')[:200]}" for i in context.get("past_insights", [])[-3:]])
    dow = context.get("dow_patterns", {})
    time_p = context.get("time_patterns", {})

    user_content = f"""HABITS:\n{habits_str or 'None yet'}
COMPLETION RATE (14 days): {round(context.get('completion_rate', 0))}%
STREAK: {context.get('streak', 0)} days | TOTAL CHECK-INS: {context.get('total_checkins', 0)}
DAY PATTERNS:\n{chr(10).join([f"  {d}: {p}%" for d, p in dow.items()])}
TIME PATTERNS: Early(<9AM):{time_p.get('early',0)}% Morning:{time_p.get('morning',0)}% Afternoon:{time_p.get('afternoon',0)}% Evening:{time_p.get('evening',0)}%
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


# ── Auth Routes ─────────────────────────────────────────────────────────────────
@api_router.post("/auth/register")
async def register(data: RegisterRequest, response: Response, background_tasks: BackgroundTasks):
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    email = data.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user = {
        "user_id": user_id, "email": email, "name": data.name.strip(),
        "picture": data.picture, "password_hash": pwd_context.hash(data.password),
        "mode": "supportive", "direct_mode_reason": "",
        "ai_provider": "none", "azure_api_key": "",
        "azure_endpoint": AZURE_ENDPOINT, "azure_model": AZURE_MODEL,
        "onboarding_completed": False, "push_subscription": None,
        "email_daily_reminder": True, "email_weekly_summary": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    user.pop("_id", None)

    access_token = create_token(user_id, "access", 60 * 24)
    refresh_token = create_token(user_id, "refresh", 60 * 24 * 30)
    await db.refresh_tokens.insert_one({"token": refresh_token, "user_id": user_id,
                                         "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                                         "created_at": datetime.now(timezone.utc).isoformat()})

    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=True,
                        samesite="none", path="/", max_age=30 * 24 * 60 * 60)
    background_tasks.add_task(send_welcome_email, email, data.name)

    safe = {k: v for k, v in user.items() if k not in ["password_hash"]}
    safe["has_api_key"] = False
    return {"user": safe, "access_token": access_token}


@api_router.post("/auth/login")
@limiter.limit("15/minute")
async def login(data: LoginRequest, request: Request, response: Response):
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not pwd_context.verify(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_token(user["user_id"], "access", 60 * 24)
    refresh_token = create_token(user["user_id"], "refresh", 60 * 24 * 30)
    await db.refresh_tokens.insert_one({"token": refresh_token, "user_id": user["user_id"],
                                         "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                                         "created_at": datetime.now(timezone.utc).isoformat()})

    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=True,
                        samesite="none", path="/", max_age=30 * 24 * 60 * 60)

    safe = {k: v for k, v in user.items() if k not in ["password_hash"]}
    safe["has_api_key"] = bool(AZURE_API_KEY)
    return {"user": safe, "access_token": access_token}


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    rt = request.cookies.get("refresh_token")
    if not rt:
        raise HTTPException(status_code=401, detail="No refresh token")

    token_doc = await db.refresh_tokens.find_one({"token": rt}, {"_id": 0})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = decode_token(rt)
    if not user_id:
        await db.refresh_tokens.delete_one({"token": rt})
        raise HTTPException(status_code=401, detail="Refresh token expired")

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    new_access = create_token(user_id, "access", 60 * 24)
    new_refresh = create_token(user_id, "refresh", 60 * 24 * 30)
    await db.refresh_tokens.delete_one({"token": rt})
    await db.refresh_tokens.insert_one({"token": new_refresh, "user_id": user_id,
                                         "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                                         "created_at": datetime.now(timezone.utc).isoformat()})

    response.set_cookie("refresh_token", new_refresh, httponly=True, secure=True,
                        samesite="none", path="/", max_age=30 * 24 * 60 * 60)

    safe = {k: v for k, v in user.items() if k not in ["password_hash"]}
    safe["has_api_key"] = bool(user.get("azure_api_key"))
    return {"user": safe, "access_token": new_access}


@api_router.get("/auth/me")
async def get_me(current_user=Depends(get_current_user)):
    safe = {k: v for k, v in current_user.items() if k not in ["password_hash"]}
    safe["has_api_key"] = bool(current_user.get("azure_api_key"))
    return safe


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    rt = request.cookies.get("refresh_token")
    if rt:
        await db.refresh_tokens.delete_one({"token": rt})
    response.delete_cookie("refresh_token", path="/", samesite="none", secure=True)
    response.delete_cookie("access_token", path="/", samesite="none", secure=True)
    return {"message": "Logged out"}


@api_router.post("/auth/forgot-password")
@limiter.limit("3/hour")
async def forgot_password(data: PasswordResetRequest, request: Request, background_tasks: BackgroundTasks):
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If that email exists, a password reset link has been sent"}
    
    # Generate reset token (valid for 1 hour)
    reset_token = create_token(user["user_id"], "password_reset", 60)
    
    # Store token in DB
    await db.password_resets.insert_one({
        "token": reset_token,
        "user_id": user["user_id"],
        "email": email,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "used": False
    })
    
    # Send reset email
    reset_link = f"{APP_URL}/reset-password?token={reset_token}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h1 style="color: #F97316; font-size: 28px; margin-bottom: 8px;">Reset Your FORGE Password</h1>
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        Hi {user['name']},<br/><br/>
        We received a request to reset your password. Click the button below to create a new password:
      </p>
      <a href="{reset_link}" style="display: inline-block; background: #F97316; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 15px; margin: 24px 0;">Reset Password →</a>
      <p style="color: #6B7280; font-size: 13px; line-height: 1.6;">
        This link expires in 1 hour.<br/>
        If you didn't request this, you can safely ignore this email.
      </p>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        Or copy this link:<br/>
        <span style="color: #F97316; word-break: break-all;">{reset_link}</span>
      </p>
    </div>"""
    
    background_tasks.add_task(send_email, email, "Reset Your FORGE Password", html)
    return {"message": "If that email exists, a password reset link has been sent"}


@api_router.post("/auth/reset-password")
@limiter.limit("5/hour")
async def reset_password(data: PasswordReset, request: Request):
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    # Verify token
    user_id = decode_token(data.token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check if token exists and hasn't been used
    reset_doc = await db.password_resets.find_one({"token": data.token, "used": False}, {"_id": 0})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check expiration
    expires_at = datetime.fromisoformat(reset_doc["expires_at"].replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset token has expired")
    
    # Update password
    new_hash = pwd_context.hash(data.new_password)
    await db.users.update_one({"user_id": user_id}, {"$set": {"password_hash": new_hash}})
    
    # Mark token as used
    await db.password_resets.update_one({"token": data.token}, {"$set": {"used": True}})
    
    # Invalidate all refresh tokens for security
    await db.refresh_tokens.delete_many({"user_id": user_id})
    
    return {"message": "Password reset successful. Please login with your new password."}


# ── Notification Routes ─────────────────────────────────────────────────────────
@api_router.get("/notifications/vapid-key")
async def get_vapid_key():
    return {"public_key": VAPID_PUBLIC_KEY}

@api_router.post("/notifications/subscribe")
async def subscribe_push(data: PushSubscribeRequest, current_user=Depends(get_current_user)):
    await db.users.update_one({"user_id": current_user["user_id"]},
                               {"$set": {"push_subscription": data.subscription}})
    return {"message": "Subscribed to push notifications"}

@api_router.post("/notifications/test")
async def test_notification(current_user=Depends(get_current_user)):
    await send_push(current_user, "FORGE Test", "Push notifications are working! 🔥", "/")
    return {"message": "Test notification sent"}


# ── Habit Routes ────────────────────────────────────────────────────────────────
@api_router.get("/habits")
async def get_habits(current_user=Depends(get_current_user)):
    return await db.habits.find({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0}).to_list(100)

@api_router.post("/habits")
async def create_habit(data: HabitCreate, current_user=Depends(get_current_user)):
    habit = {"habit_id": f"hab_{uuid.uuid4().hex[:12]}", "user_id": current_user["user_id"],
             "name": data.name, "priority": max(1, min(3, data.priority)),
             "context": data.context, "target_time": data.target_time,
             "color": data.color, "is_active": True,
             "created_at": datetime.now(timezone.utc).isoformat()}
    await db.habits.insert_one(habit)
    habit.pop("_id", None)
    return habit

@api_router.put("/habits/{habit_id}")
async def update_habit(habit_id: str, data: HabitUpdate, current_user=Depends(get_current_user)):
    upd = {k: v for k, v in data.model_dump().items() if v is not None}
    if upd:
        await db.habits.update_one({"habit_id": habit_id, "user_id": current_user["user_id"]}, {"$set": upd})
    return {"message": "Updated"}

@api_router.delete("/habits/{habit_id}")
async def delete_habit(habit_id: str, current_user=Depends(get_current_user)):
    await db.habits.update_one({"habit_id": habit_id, "user_id": current_user["user_id"]},
                                {"$set": {"is_active": False}})
    return {"message": "Deleted"}


# ── Completion Routes ───────────────────────────────────────────────────────────
@api_router.get("/completions")
async def get_completions(date: Optional[str] = None, current_user=Depends(get_current_user)):
    q = {"user_id": current_user["user_id"]}
    if date:
        q["date"] = date
    return await db.completions.find(q, {"_id": 0}).to_list(10000)

@api_router.post("/completions")
async def create_completion(data: CompletionCreate, current_user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing = await db.completions.find_one(
        {"user_id": current_user["user_id"], "habit_id": data.habit_id, "date": today}, {"_id": 0})
    if existing:
        return existing

    habit = await db.habits.find_one({"habit_id": data.habit_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    completion = {"completion_id": f"comp_{uuid.uuid4().hex[:12]}", "user_id": current_user["user_id"],
                  "habit_id": data.habit_id, "date": today,
                  "completed_at": datetime.now(timezone.utc).isoformat(),
                  "points_earned": habit.get("priority", 1)}
    await db.completions.insert_one(completion)
    completion.pop("_id", None)
    await check_and_award_achievements(current_user["user_id"])
    return completion

@api_router.delete("/completions/{completion_id}")
async def delete_completion(completion_id: str, current_user=Depends(get_current_user)):
    await db.completions.delete_one({"completion_id": completion_id, "user_id": current_user["user_id"]})
    return {"message": "Deleted"}


# ── Mood Routes ─────────────────────────────────────────────────────────────────
@api_router.get("/moods/today")
async def get_today_mood(current_user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return await db.moods.find_one({"user_id": current_user["user_id"], "date": today}, {"_id": 0}) or {}

@api_router.post("/moods")
async def log_mood(data: MoodCreate, current_user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    user_id = current_user["user_id"]
    mood = {"mood_id": f"mood_{uuid.uuid4().hex[:12]}", "user_id": user_id, "date": today,
            "rating": max(1, min(5, data.rating)), "note": data.note, "gratitude": data.gratitude,
            "logged_at": datetime.now(timezone.utc).isoformat()}
    await db.moods.replace_one({"user_id": user_id, "date": today}, mood, upsert=True)

    wellness_warning = None
    if current_user.get("mode") == "direct":
        recent = await db.moods.find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(14)
        low_streak = sum(1 for m in recent if m.get("rating", 5) <= 2)
        if low_streak >= 5:
            wellness_warning = {
                "type": "low_mood_streak",
                "message": "I push you because you asked, but something seems wrong. 5+ consecutive low mood days.",
                "resources": [{"name": "988 Suicide & Crisis Lifeline", "contact": "Call or text 988"},
                               {"name": "NAMI Helpline", "contact": "1-800-950-NAMI (6264)"},
                               {"name": "Crisis Text Line", "contact": "Text HOME to 741741"}]}
    return {"mood": mood, "wellness_warning": wellness_warning}

@api_router.get("/moods")
async def get_moods(days: int = 30, current_user=Depends(get_current_user)):
    start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    return await db.moods.find({"user_id": current_user["user_id"], "date": {"$gte": start}},
                                {"_id": 0}).sort("date", 1).to_list(100)


# ── Analytics Routes ────────────────────────────────────────────────────────────
@api_router.get("/analytics/stats")
async def get_stats(current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_14 = (datetime.now(timezone.utc) - timedelta(days=14)).strftime("%Y-%m-%d")

    all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    today_comps = [c for c in all_comps if c["date"] == today]
    recent_comps = [c for c in all_comps if c["date"] >= start_14]

    total_pts = sum(c.get("points_earned", 1) for c in all_comps)
    today_pts = sum(c.get("points_earned", 1) for c in today_comps)
    max_today = sum(h.get("priority", 1) for h in habits)
    streak = compute_streak(all_comps, today)
    lvl_data = get_level_progress(total_pts)
    n_habits = max(len(habits), 1)
    rate = len(recent_comps) / (n_habits * 14) * 100 if habits else 0

    try:
        created_dt = datetime.fromisoformat(current_user.get("created_at", datetime.now(timezone.utc).isoformat()).replace("Z", "+00:00"))
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        days_using = (datetime.now(timezone.utc) - created_dt).days
    except Exception:
        days_using = 0

    return {"streak": streak, "total_points": total_pts, "today_points": today_pts,
            "max_today_points": max_today, "today_pct": round(today_pts / max(max_today, 1) * 100, 1),
            "completion_rate": round(rate, 1), "total_checkins": len(all_comps),
            "level": lvl_data["level"], "level_progress_pct": lvl_data["progress_pct"],
            "next_level_threshold": lvl_data["next_threshold"],
            "habits_today": len(today_comps), "habits_total": len(habits), "days_since_start": days_using}


@api_router.get("/analytics/heatmap")
async def get_heatmap(current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    today = datetime.now(timezone.utc)
    start = (today - timedelta(days=89)).strftime("%Y-%m-%d")
    comps = await db.completions.find({"user_id": user_id, "date": {"$gte": start}}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    n_habits = max(len(habits), 1)
    by_date = defaultdict(int)
    for c in comps:
        by_date[c["date"]] += 1
    return {(today - timedelta(days=i)).strftime("%Y-%m-%d"):
            min(1.0, round(by_date.get((today - timedelta(days=i)).strftime("%Y-%m-%d"), 0) / n_habits, 2))
            for i in range(90)}


@api_router.get("/analytics/patterns")
async def get_patterns(current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    start_30 = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    comps = await db.completions.find({"user_id": user_id, "date": {"$gte": start_30}}, {"_id": 0}).to_list(10000)
    all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)

    by_date = defaultdict(int)
    for c in comps:
        by_date[c["date"]] += 1
    n_habits = max(len(habits), 1)
    score_series = []
    for i in range(29, -1, -1):
        d = datetime.now(timezone.utc) - timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        n = by_date.get(ds, 0)
        score_series.append({"date": ds, "completed": n, "max": n_habits, "pct": round(n / n_habits * 100, 1)})

    priority_stats = defaultdict(lambda: {"c": 0, "p": 0})
    p_map = {h["habit_id"]: h.get("priority", 1) for h in habits}
    for c in comps:
        priority_stats[p_map.get(c["habit_id"], 1)]["c"] += 1
    for h in habits:
        priority_stats[h.get("priority", 1)]["p"] += 30

    return {"dow_patterns": compute_dow_patterns(all_comps, habits),
            "time_patterns": compute_time_patterns(all_comps),
            "score_series": score_series,
            "priority_breakdown": {f"p{p}": round(d["c"] / max(d["p"], 1) * 100, 1) for p, d in priority_stats.items()}}


# ── AI Routes ───────────────────────────────────────────────────────────────────
@api_router.post("/ai/insight")
async def generate_insight(data: InsightRequest, current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    today = datetime.now(timezone.utc)
    start_14 = (today - timedelta(days=14)).strftime("%Y-%m-%d")

    comps = await db.completions.find({"user_id": user_id, "date": {"$gte": start_14}}, {"_id": 0}).to_list(10000)
    all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    past = await db.ai_insights.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(5)

    n_habits = max(len(habits), 1)
    rate = len(comps) / (n_habits * 14) * 100 if habits else 0
    streak = compute_streak(all_comps, today.strftime("%Y-%m-%d"))

    try:
        created_dt = datetime.fromisoformat(current_user.get("created_at", today.isoformat()).replace("Z", "+00:00"))
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        days_using = (today - created_dt).days
    except Exception:
        days_using = 0

    context = {"habits": habits, "completion_rate": rate, "total_checkins": len(all_comps),
               "days_using": days_using, "streak": streak,
               "dow_patterns": compute_dow_patterns(all_comps, habits),
               "time_patterns": compute_time_patterns(all_comps), "past_insights": past}

    insight_text = await generate_ai_insight(current_user, context, data.reflection)
    sentences = insight_text.split(".")
    suggestions = [s.strip() for s in sentences if any(w in s.lower() for w in ["try", "move", "schedule", "consider", "switch"])][:2]

    doc = {"insight_id": f"ins_{uuid.uuid4().hex[:12]}", "user_id": user_id,
           "content": insight_text, "patterns": [], "suggestions": suggestions,
           "tone": current_user.get("mode", "supportive"), "reflection": data.reflection,
           "completion_rate": rate, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.ai_insights.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/ai/insights")
async def get_insights(current_user=Depends(get_current_user)):
    return await db.ai_insights.find({"user_id": current_user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)


# ── Achievement Routes ──────────────────────────────────────────────────────────
@api_router.get("/achievements")
async def get_achievements(current_user=Depends(get_current_user)):
    return await db.achievements.find({"user_id": current_user["user_id"]}, {"_id": 0}).sort("earned_at", -1).to_list(100)


# ── User Routes ─────────────────────────────────────────────────────────────────
@api_router.put("/user/settings")
async def update_settings(data: UserSettingsUpdate, current_user=Depends(get_current_user)):
    upd = {k: v for k, v in data.model_dump().items() if v is not None}
    if "azure_api_key" in upd and upd["azure_api_key"] and upd["azure_api_key"].strip():
        upd["azure_api_key"] = encrypt_value(upd["azure_api_key"])
    if upd:
        await db.users.update_one({"user_id": current_user["user_id"]}, {"$set": upd})
    updated = await db.users.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    safe = {k: v for k, v in updated.items() if k not in ["password_hash"]}
    safe["has_api_key"] = bool(updated.get("azure_api_key"))
    return safe


@api_router.post("/user/test-ai-key")
async def test_ai_key(current_user=Depends(get_current_user)):
    """Test if the user's Azure AI API key is working"""
    azure_key = AZURE_API_KEY
    
    if not azure_key or azure_key.strip() == "":
        raise HTTPException(status_code=400, detail="No API key configured on the server")
    
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            base_url=AZURE_ENDPOINT,
            api_key=azure_key
        )
        
        # Simple test call
        resp = await client.chat.completions.create(
            model=AZURE_MODEL,
            messages=[{"role": "user", "content": "Say 'FORGE test successful' in 3 words."}],
            temperature=0.3
        )
        
        result = resp.choices[0].message.content
        return {
            "success": True,
            "message": "API key is working correctly!",
            "test_response": result
        }
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "authentication" in error_msg.lower():
            return {"success": False, "message": "Authentication failed. Check your API key."}
        elif "404" in error_msg or "not found" in error_msg.lower():
            return {"success": False, "message": "Model or endpoint not found. Check your configuration."}
        elif "quota" in error_msg.lower() or "rate" in error_msg.lower():
            return {"success": False, "message": "Rate limit or quota exceeded. Try again later."}
        else:
            return {"success": False, "message": f"Test failed: {error_msg[:100]}"}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    scheduler.add_job(daily_reminder_job, "cron", hour=20, minute=0, id="daily_reminder")
    scheduler.add_job(weekly_summary_job, "cron", day_of_week="sun", hour=9, minute=0, id="weekly_summary")
    scheduler.start()
    logger.info("FORGE backend started — scheduler running")


@app.on_event("shutdown")
async def shutdown():
    if scheduler.running:
        scheduler.shutdown()
    client.close()
