from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os, logging, uuid, time, base64, json
from pathlib import Path
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
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

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "")
ALGORITHM = "HS256"
VAPID_PRIVATE_KEY_B64 = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_USER = os.environ.get("SMTP_USER", "")

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

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Enhanced CORS Logic (Supports Local & Production simultaneously)
DOMAIN_NAME = os.environ.get("DOMAIN_NAME", "forge.zerp.me")
APP_URL = os.environ.get("APP_URL", f"https://{DOMAIN_NAME}" if "localhost" not in DOMAIN_NAME else "http://localhost:3000")
CORS_ORIGINS_RAW = os.environ.get("CORS_ORIGINS", "")
API_URL = os.environ.get("API_URL", f"https://api-{DOMAIN_NAME}" if "localhost" not in APP_URL else "http://localhost:8001")

# Always allow the root production domains to prevent the override bug
CORS_ORIGINS = [f"https://{DOMAIN_NAME}", f"https://www.{DOMAIN_NAME}", f"https://api-{DOMAIN_NAME}"]

# Append any custom domains passed through the environment (e.g. localhost for local testing)
if CORS_ORIGINS_RAW:
    for o in CORS_ORIGINS_RAW.split(","):
        o = o.strip()
        if o and o not in CORS_ORIGINS:
            CORS_ORIGINS.append(o)

logger.info(f"Active CORS Origins: {CORS_ORIGINS}")

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ── Early CORS & Debug Middleware ─────────────────────────────────────────────
# Credentials cannot be used with "*"
if "*" in CORS_ORIGINS and len(CORS_ORIGINS) == 1:
    logger.warning("CORS_ORIGINS is set to '*' but allow_credentials=True. This can cause 400 errors in preflight.")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def debug_preflight(request: Request, call_next):
    if request.method == "OPTIONS":
        origin = request.headers.get("origin")
        logger.info(f"OPTIONS: {request.url.path} | Origin: {origin}")
    
    response = await call_next(request)
    if response.status_code == 400 and request.method == "OPTIONS":
        logger.error(f"CORS REJECTED: {request.headers.get('origin')} not in {CORS_ORIGINS}")
    return response

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


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

def decode_token(token: str, expected_type: Optional[str] = None) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Reject token-type confusion: a refresh/password_reset/unsubscribe token
        # must never be accepted where an access token is expected, and vice-versa.
        if expected_type is not None and payload.get("type") != expected_type:
            return None
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
    user_id = decode_token(token, expected_type="access")
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
    timezone: str = "UTC"

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
    frequency_type: str = "daily"          # "daily" | "specific_days" | "times_per_week"
    frequency_days: list = []              # [0,1,2,3,4,5,6] — 0=Mon, 6=Sun (ISO weekday)
    frequency_target: int = 7              # For times_per_week: how many days per week (1-7)

class HabitUpdate(BaseModel):
    name: Optional[str] = None
    priority: Optional[int] = None
    context: Optional[str] = None
    target_time: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    frequency_type: Optional[str] = None
    frequency_days: Optional[list] = None
    frequency_target: Optional[int] = None

class CompletionCreate(BaseModel):
    habit_id: str
    date: Optional[str] = None

class MoodCreate(BaseModel):
    rating: int
    note: str = ""
    gratitude: str = ""

class InsightRequest(BaseModel):
    reflection: str = ""

class UserSettingsUpdate(BaseModel):
    mode: Optional[str] = None
    direct_mode_reason: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    email_daily_reminder: Optional[bool] = None
    email_weekly_summary: Optional[bool] = None
    timezone: Optional[str] = None
    notification_rules: Optional[list] = None

class PushSubscribeRequest(BaseModel):
    subscription: dict

class DeleteAccountRequest(BaseModel):
    password: str


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


# ── Analytics helpers ───────────────────────────────────────────────────────────
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


# ── Email helpers ───────────────────────────────────────────────────────────────
async def send_email(to: str, subject: str, html_body: str):
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_pass = os.environ.get("SMTP_PASS", "")
    smtp_from = os.environ.get("SMTP_FROM", f"FORGE <{SMTP_USER}>")

    if not SMTP_HOST or not SMTP_USER:
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
        await aiosmtplib.send(msg, hostname=SMTP_HOST, port=smtp_port,
                              username=SMTP_USER, password=smtp_pass, start_tls=True)
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
    """Send a Web Push notification. Raises on failure so callers can surface errors."""
    sub = user.get("push_subscription")
    if not sub:
        raise ValueError("No push subscription stored for this user. Please enable notifications first.")
    if not VAPID_PRIVATE_KEY_B64:
        raise ValueError("VAPID_PRIVATE_KEY is not configured in the server environment.")
    if not VAPID_PUBLIC_KEY:
        raise ValueError("VAPID_PUBLIC_KEY is not configured in the server environment.")

    from pywebpush import webpush, WebPushException
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.backends import default_backend
    import base64
    
    padded = VAPID_PRIVATE_KEY_B64 + "=" * ((4 - len(VAPID_PRIVATE_KEY_B64) % 4) % 4)
    raw_key = base64.urlsafe_b64decode(padded)
    private_value = int.from_bytes(raw_key, 'big')

    contact_email = f"admin@{DOMAIN_NAME}"
    
    from py_vapid import Vapid
    vapid_instance = Vapid()
    # Ensure claims are set directly on the instance AND passed to webpush
    # to handle different versions of the library's internal signature logic.
    vapid_instance.claims = {"sub": f"mailto:{contact_email}"}
    vapid_instance.private_key = ec.derive_private_key(private_value, ec.SECP256R1(), default_backend())

    webpush(
        subscription_info=sub,
        data=json.dumps({"title": title, "body": body, "url": url}),
        vapid_private_key=vapid_instance,
        vapid_claims={"sub": f"mailto:{contact_email}"}
    )


# ── Scheduled jobs ──────────────────────────────────────────────────────────────
async def daily_reminder_job():
    utc_now = datetime.now(timezone.utc)
    users = await db.users.find({"onboarding_completed": True}, {"_id": 0}).to_list(10000)
    for user in users:
        tz_str = user.get("timezone", "UTC")
        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = timezone.utc
            
        local_now = utc_now.astimezone(tz)
        local_time = local_now.strftime("%H:%M")
        local_weekday = local_now.weekday()
        
        rules = user.get("notification_rules", [{"days": [0,1,2,3,4,5,6], "time": "20:00"}])
        should_notify = False
        for r in rules:
            if local_weekday in r.get("days", []) and r.get("time", "20:00") == local_time:
                should_notify = True
                break
                
        if not should_notify:
            continue

        today = local_now.strftime("%Y-%m-%d")
        today_weekday = local_weekday
        user_id = user["user_id"]
        habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
        if not habits:
            continue
        # Only consider habits scheduled for today
        scheduled_habits = [h for h in habits if is_habit_scheduled_today(h, today_weekday)]
        if not scheduled_habits:
            continue
        today_comps = await db.completions.find({"user_id": user_id, "date": today}, {"_id": 0}).to_list(100)
        done_ids = {c["habit_id"] for c in today_comps}
        remaining = [h for h in scheduled_habits if h["habit_id"] not in done_ids]
        if not remaining:
            continue

        # Push notification — respect opt-in preference
        push_enabled = user.get("push_notifications_enabled", True)
        if push_enabled:
            try:
                await send_push(user, "FORGE — Check in!", f"{len(remaining)} habit(s) remaining today 🔥")
            except Exception as e:
                logger.warning("Push failed for user %s: %s", user_id, e)

        # Email — respect email_daily_reminder setting
        if user.get("email_daily_reminder", True) and user.get("email"):
            items = "".join([f"<li style='margin:4px 0'>{h['name']}</li>" for h in remaining[:5]])
            all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
            all_habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
            streak = compute_global_streak(all_comps, all_habits, today)
            
            unsub_token = create_token(user_id, "unsubscribe", 60 * 24 * 365)
            unsub_link = f"{API_URL}/api/notifications/unsubscribe?token={unsub_token}&type=daily"
            
            html = f"""
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
              <h2 style="color:#F97316">🔥 Daily Check-in — Keep the streak alive!</h2>
              <p style="color:#374151">Hey {user['name']}, you have <strong>{len(remaining)}</strong> habit(s) left today:</p>
              <ul style="color:#374151;padding-left:20px">{items}</ul>
              <p style="color:#374151"><strong>Current streak:</strong> {streak} days</p>
              <a href="{APP_URL}" style="display:inline-block;background:#F97316;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;margin-top:16px">Open FORGE →</a>
              <p style="color:#9CA3AF;font-size:11px;margin-top:32px">
                <a href="{unsub_link}" style="color:#9CA3AF;text-decoration:underline">Unsubscribe from daily reminders</a> |
                <a href="{APP_URL}/settings" style="color:#F97316">Manage all settings</a>
              </p>
            </div>"""
            await send_email(user["email"], "🔥 FORGE: Complete your habits today", html)


async def weekly_summary_job():
    utc_now = datetime.now(timezone.utc)
    users = await db.users.find({"onboarding_completed": True, "email_weekly_summary": True},
                                 {"_id": 0}).to_list(10000)
    for user in users:
        tz_str = user.get("timezone", "UTC")
        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = timezone.utc
            
        local_now = utc_now.astimezone(tz)
        local_time = local_now.strftime("%H:%M")
        local_weekday = local_now.weekday()
        
        if local_weekday != 6 or local_time != "09:00":
            continue

        today = local_now.strftime("%Y-%m-%d")
        start_7 = (local_now - timedelta(days=7)).strftime("%Y-%m-%d")
        user_id = user["user_id"]
        week_comps = await db.completions.find({"user_id": user_id, "date": {"$gte": start_7}}, {"_id": 0}).to_list(10000)
        habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
        all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
        if not week_comps or not user.get("email"):
            continue

        # Schedule-aware consistency rate: scheduled completions over the past 7 days
        scheduled_possible_7 = 0
        for h in habits:
            ft = h.get("frequency_type", "daily")
            if ft == "daily":
                scheduled_possible_7 += 7
            elif ft == "specific_days":
                scheduled_possible_7 += len(h.get("frequency_days", []))
            elif ft == "times_per_week":
                scheduled_possible_7 += h.get("frequency_target", 1)
        rate = round(len(week_comps) / max(scheduled_possible_7, 1) * 100)
        streak = compute_global_streak(all_comps, habits, today)
        total_pts = sum(c.get("points_earned", 1) for c in all_comps)
        lvl = get_level(total_pts)

        color = "#22C55E" if rate >= 75 else ("#F59E0B" if rate >= 50 else "#EF4444")
        
        unsub_token = create_token(user_id, "unsubscribe", 60 * 24 * 365) # 1 year validity
        unsub_link = f"{API_URL}/api/notifications/unsubscribe?token={unsub_token}&type=weekly"
        
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
            <a href="{unsub_link}" style="color:#9CA3AF;text-decoration:underline">Unsubscribe from weekly summaries</a> |
            <a href="{APP_URL}/settings" style="color:#F97316">Manage all settings</a>
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
        "onboarding_completed": False, "push_subscription": None,
        "email_daily_reminder": True, "email_weekly_summary": True,
        "timezone": data.timezone,
        "notification_rules": [{"days": [0,1,2,3,4,5,6], "time": "20:00"}],
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
    safe["ai_configured"] = bool(AZURE_API_KEY)
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

    user_id = decode_token(rt, expected_type="refresh")
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
    safe["has_api_key"] = bool(AZURE_API_KEY)
    return {"user": safe, "access_token": new_access}


@api_router.get("/auth/me")
async def get_me(current_user=Depends(get_current_user)):
    safe = {k: v for k, v in current_user.items() if k not in ["password_hash"]}
    safe["has_api_key"] = bool(AZURE_API_KEY)
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
    user_id = decode_token(data.token, expected_type="password_reset")
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

@api_router.get("/notifications/status")
async def get_notification_status(current_user=Depends(get_current_user)):
    """Returns whether the server has VAPID and SMTP keys configured."""
    return {
        "vapid_configured": bool(VAPID_PRIVATE_KEY_B64 and VAPID_PUBLIC_KEY),
        "smtp_configured": bool(SMTP_HOST and SMTP_USER),
        "user_subscribed": bool(current_user.get("push_subscription"))
    }

@api_router.post("/notifications/subscribe")
async def subscribe_push(data: PushSubscribeRequest, current_user=Depends(get_current_user)):
    await db.users.update_one({"user_id": current_user["user_id"]},
                               {"$set": {"push_subscription": data.subscription}})
    return {"message": "Subscribed to push notifications"}

@api_router.post("/notifications/test")
async def test_notification(current_user=Depends(get_current_user)):
    try:
        await send_push(current_user, "FORGE Test", "Push notifications are working! 🔥", "/")
        return {"success": True, "message": "Test notification sent!"}
    except Exception as e:
        logger.error("Test push failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import HTMLResponse

@api_router.get("/notifications/unsubscribe")
async def unsubscribe_email(token: str, type: str):
    user_id = decode_token(token, expected_type="unsubscribe")
    if not user_id:
         return HTMLResponse("<h1>Invalid or expired link.</h1>", status_code=400)
    
    if type == "daily":
        await db.users.update_one({"user_id": user_id}, {"$set": {"email_daily_reminder": False}})
        msg = "You have successfully unsubscribed from Daily Reminders."
    elif type == "weekly":
        await db.users.update_one({"user_id": user_id}, {"$set": {"email_weekly_summary": False}})
        msg = "You have successfully unsubscribed from Weekly Summaries."
    else:
        return HTMLResponse("<h1>Invalid type.</h1>", status_code=400)
    
    html = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 40px auto; text-align: center; background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <h2 style="color: #F97316; margin-bottom: 24px;">FORGE</h2>
        <p style="color: #374151; font-size: 16px;">{msg}</p>
        <p style="margin-top: 32px;"><a href="{APP_URL}/settings" style="color: #F97316; font-weight: bold; text-decoration: none;">Manage your notification settings here →</a></p>
    </div>
    """
    return HTMLResponse(html)

# ── Habit Routes ────────────────────────────────────────────────────────────────
@api_router.get("/habits")
async def get_habits(current_user=Depends(get_current_user)):
    return await db.habits.find({"user_id": current_user["user_id"], "is_active": True}, {"_id": 0}).to_list(100)

@api_router.post("/habits")
async def create_habit(data: HabitCreate, current_user=Depends(get_current_user)):
    # Validate frequency_days values (must be 0-6)
    freq_days = [d for d in data.frequency_days if 0 <= d <= 6]
    freq_target = max(1, min(7, data.frequency_target))
    habit = {"habit_id": f"hab_{uuid.uuid4().hex[:12]}", "user_id": current_user["user_id"],
             "name": data.name, "priority": max(1, min(3, data.priority)),
             "context": data.context, "target_time": data.target_time,
             "color": data.color, "is_active": True,
             "frequency_type": data.frequency_type if data.frequency_type in ("daily", "specific_days", "times_per_week") else "daily",
             "frequency_days": freq_days,
             "frequency_target": freq_target,
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
async def get_completions(date: Optional[str] = None, habit_id: Optional[str] = None, current_user=Depends(get_current_user)):
    q = {"user_id": current_user["user_id"]}
    if date:
        q["date"] = date
    if habit_id:
        q["habit_id"] = habit_id
    return await db.completions.find(q, {"_id": 0}).to_list(10000)

@api_router.post("/completions")
async def create_completion(data: CompletionCreate, current_user=Depends(get_current_user)):
    target_date = data.date if data.date else get_user_today(current_user)
    existing = await db.completions.find_one(
        {"user_id": current_user["user_id"], "habit_id": data.habit_id, "date": target_date}, {"_id": 0})
    if existing:
        return existing

    habit = await db.habits.find_one({"habit_id": data.habit_id, "user_id": current_user["user_id"]}, {"_id": 0})
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    completion = {"completion_id": f"comp_{uuid.uuid4().hex[:12]}", "user_id": current_user["user_id"],
                  "habit_id": data.habit_id, "date": target_date,
                  "completed_at": datetime.now(timezone.utc).isoformat(),
                  "points_earned": habit.get("priority", 1)}
    try:
        await db.completions.insert_one(completion)
    except DuplicateKeyError:
        # Race backstop: a concurrent request already inserted the same
        # (user_id, habit_id, date). Return the existing completion instead of
        # creating a duplicate that would inflate points/streaks/achievements.
        existing = await db.completions.find_one(
            {"user_id": current_user["user_id"], "habit_id": data.habit_id, "date": target_date}, {"_id": 0})
        if existing:
            return existing
        raise
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
    today = get_user_today(current_user)
    return await db.moods.find_one({"user_id": current_user["user_id"], "date": today}, {"_id": 0}) or {}

@api_router.post("/moods")
async def log_mood(data: MoodCreate, current_user=Depends(get_current_user)):
    today = get_user_today(current_user)
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
    tz_str = current_user.get("timezone", "UTC")
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = timezone.utc
    start = (datetime.now(tz) - timedelta(days=days)).strftime("%Y-%m-%d")
    return await db.moods.find({"user_id": current_user["user_id"], "date": {"$gte": start}},
                                {"_id": 0}).sort("date", 1).to_list(100)


# ── Analytics Routes ────────────────────────────────────────────────────────────
@api_router.get("/analytics/stats")
async def get_stats(current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    tz_str = current_user.get("timezone", "UTC")
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = timezone.utc
        
    local_now = datetime.now(tz)
    today = local_now.strftime("%Y-%m-%d")
    today_weekday = local_now.weekday()
    start_14 = (local_now - timedelta(days=14)).strftime("%Y-%m-%d")

    all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    
    # Only count habits scheduled for today in progress calculations
    scheduled_habits = [h for h in habits if is_habit_scheduled_today(h, today_weekday)]
    scheduled_ids = {h["habit_id"] for h in scheduled_habits}
    
    today_comps = [c for c in all_comps if c["date"] == today and c["habit_id"] in scheduled_ids]
    today_bonus = [c for c in all_comps if c["date"] == today and c["habit_id"] not in scheduled_ids]
    recent_comps = [c for c in all_comps if c["date"] >= start_14]

    total_pts = sum(c.get("points_earned", 1) for c in all_comps)
    today_pts = sum(c.get("points_earned", 1) for c in today_comps) + sum(c.get("points_earned", 1) for c in today_bonus)
    max_today = sum(h.get("priority", 1) for h in scheduled_habits)
    
    # Global streak: consecutive days where ALL scheduled habits were completed
    streak = compute_global_streak(all_comps, habits, today)
    
    lvl_data = get_level_progress(total_pts)
    
    # Completion rate: scheduled completions over 14 days
    scheduled_possible = 0
    for h in habits:
        ft = h.get("frequency_type", "daily")
        if ft == "daily":
            scheduled_possible += 14
        elif ft == "specific_days":
            scheduled_possible += len(h.get("frequency_days", [])) * 2
        elif ft == "times_per_week":
            scheduled_possible += h.get("frequency_target", 1) * 2
    rate = len(recent_comps) / max(scheduled_possible, 1) * 100 if habits else 0

    try:
        created_dt = datetime.fromisoformat(current_user.get("created_at", local_now.isoformat()).replace("Z", "+00:00"))
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        days_using = (local_now.date() - created_dt.astimezone(tz).date()).days
    except Exception:
        days_using = 0

    return {"streak": streak, "total_points": total_pts, "today_points": today_pts,
            "max_today_points": max_today, "today_pct": round(today_pts / max(max_today, 1) * 100, 1),
            "completion_rate": round(rate, 1), "total_checkins": len(all_comps),
            "level": lvl_data["level"], "level_progress_pct": lvl_data["progress_pct"],
            "next_level_threshold": lvl_data["next_threshold"],
            "habits_today": len(today_comps), "habits_total": len(scheduled_habits),
            "habits_total_all": len(habits), "days_since_start": days_using}


@api_router.get("/analytics/heatmap")
async def get_heatmap(current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    tz_str = current_user.get("timezone", "UTC")
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = timezone.utc
    local_now = datetime.now(tz)
    start = (local_now - timedelta(days=89)).strftime("%Y-%m-%d")
    comps = await db.completions.find({"user_id": user_id, "date": {"$gte": start}}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    n_habits = max(len(habits), 1)
    by_date = defaultdict(int)
    for c in comps:
        by_date[c["date"]] += 1
    return {(local_now - timedelta(days=i)).strftime("%Y-%m-%d"):
            min(1.0, round(by_date.get((local_now - timedelta(days=i)).strftime("%Y-%m-%d"), 0) / n_habits, 2))
            for i in range(90)}


@api_router.get("/analytics/patterns")
async def get_patterns(current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    tz_str = current_user.get("timezone", "UTC")
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = timezone.utc
    local_now = datetime.now(tz)
    start_30 = (local_now - timedelta(days=30)).strftime("%Y-%m-%d")
    comps = await db.completions.find({"user_id": user_id, "date": {"$gte": start_30}}, {"_id": 0}).to_list(10000)
    all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)

    by_date = defaultdict(int)
    for c in comps:
        by_date[c["date"]] += 1
    n_habits = max(len(habits), 1)
    score_series = []
    for i in range(29, -1, -1):
        d = local_now - timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        n = by_date.get(ds, 0)
        score_series.append({"date": ds, "completed": n, "max": n_habits, "pct": round(n / n_habits * 100, 1)})

    priority_stats = defaultdict(lambda: {"c": 0, "p": 0})
    p_map = {h["habit_id"]: h.get("priority", 1) for h in habits}
    for c in comps:
        priority_stats[p_map.get(c["habit_id"], 1)]["c"] += 1
    for h in habits:
        priority_stats[h.get("priority", 1)]["p"] += 30

    return {"dow_patterns": compute_dow_patterns(all_comps, habits, local_now),
            "time_patterns": compute_time_patterns(all_comps, tz),
            "score_series": score_series,
            "priority_breakdown": {f"p{p}": round(d["c"] / max(d["p"], 1) * 100, 1) for p, d in priority_stats.items()}}


# ── AI Routes ───────────────────────────────────────────────────────────────────
@api_router.post("/ai/insight")
async def generate_insight(data: InsightRequest, current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    tz_str = current_user.get("timezone", "UTC")
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = timezone.utc
    local_now = datetime.now(tz)
    start_14 = (local_now - timedelta(days=14)).strftime("%Y-%m-%d")
    start_7 = (local_now - timedelta(days=7)).strftime("%Y-%m-%d")

    comps = await db.completions.find({"user_id": user_id, "date": {"$gte": start_14}}, {"_id": 0}).to_list(10000)
    all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    past = await db.ai_insights.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(5)
    moods = await db.moods.find({"user_id": user_id, "date": {"$gte": start_7}}, {"_id": 0}).sort("date", -1).to_list(7)
    achievements = await db.achievements.find({"user_id": user_id}, {"_id": 0}).sort("earned_at", -1).to_list(5)

    n_habits = max(len(habits), 1)
    rate = len(comps) / (n_habits * 14) * 100 if habits else 0
    streak = compute_global_streak(all_comps, habits, local_now.strftime("%Y-%m-%d"))

    try:
        created_dt = datetime.fromisoformat(current_user.get("created_at", local_now.isoformat()).replace("Z", "+00:00"))
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        days_using = (local_now.date() - created_dt.astimezone(tz).date()).days
    except Exception:
        days_using = 0

    context = {"habits": habits, "all_completions": all_comps, "completion_rate": rate,
               "total_checkins": len(all_comps), "days_using": days_using, "streak": streak,
               "dow_patterns": compute_dow_patterns(all_comps, habits, local_now),
               "time_patterns": compute_time_patterns(all_comps, tz), "past_insights": past,
               "moods": moods, "achievements": achievements}

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
    if upd:
        await db.users.update_one({"user_id": current_user["user_id"]}, {"$set": upd})
    updated = await db.users.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    safe = {k: v for k, v in updated.items() if k not in ["password_hash"]}
    safe["has_api_key"] = bool(AZURE_API_KEY)
    return safe


@api_router.delete("/user/account")
async def delete_account(data: DeleteAccountRequest, current_user=Depends(get_current_user), response: Response = None):
    user_id = current_user["user_id"]
    
    # 1. Verify password
    if not pwd_context.verify(data.password, current_user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Incorrect password")
    
    # 2. Delete all user data across collections
    await db.habits.delete_many({"user_id": user_id})
    await db.completions.delete_many({"user_id": user_id})
    await db.moods.delete_many({"user_id": user_id})
    await db.achievements.delete_many({"user_id": user_id})
    await db.ai_insights.delete_many({"user_id": user_id})
    await db.password_resets.delete_many({"user_id": user_id})
    await db.refresh_tokens.delete_many({"user_id": user_id})
    
    # 3. Delete user account itself
    await db.users.delete_one({"user_id": user_id})
    
    # 4. Clear cookies if response object is injected
    if response:
        response.delete_cookie("refresh_token", path="/", samesite="none", secure=True)
        response.delete_cookie("access_token", path="/", samesite="none", secure=True)
        
    return {"message": "Account successfully deleted"}

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
# Middleware moved to top


async def _ensure_indexes():
    """Create indexes (idempotent). Unique indexes are guarded individually so
    that pre-existing duplicate data can never crash startup of the live app —
    on conflict we log and (for completions) fall back to a non-unique index."""
    try:
        await db.completions.create_index(
            [("user_id", 1), ("habit_id", 1), ("date", 1)],
            unique=True, name="uniq_user_habit_date")
    except Exception as e:
        logger.warning(
            "Could not create UNIQUE completion index — dedupe existing data, "
            f"then restart to enforce it. Falling back to non-unique. ({e})")
        try:
            await db.completions.create_index([("user_id", 1), ("date", 1)], name="user_date")
        except Exception:
            pass
    for coll, keys, kwargs in [
        ("users", [("email", 1)], {"unique": True, "name": "uniq_email"}),
        ("users", [("user_id", 1)], {"name": "user_id"}),
        ("habits", [("user_id", 1)], {"name": "user_id"}),
        ("moods", [("user_id", 1), ("date", 1)], {"name": "user_date"}),
        ("refresh_tokens", [("token", 1)], {"name": "token"}),
        ("password_resets", [("token", 1)], {"name": "token"}),
        ("ai_insights", [("user_id", 1)], {"name": "user_id"}),
    ]:
        try:
            await db[coll].create_index(keys, **kwargs)
        except Exception as e:
            logger.warning(f"Index on {coll} {keys} skipped: {e}")


@app.on_event("startup")
async def startup():
    await _ensure_indexes()
    scheduler.add_job(daily_reminder_job, "cron", minute="*", id="daily_reminder")
    scheduler.add_job(weekly_summary_job, "cron", minute="*", id="weekly_summary")
    scheduler.start()
    logger.info("FORGE backend started — scheduler running")


@app.on_event("shutdown")
async def shutdown():
    if scheduler.running:
        scheduler.shutdown()
    client.close()
