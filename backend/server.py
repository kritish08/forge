from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from pymongo.errors import DuplicateKeyError
import uuid
from typing import Optional
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from config import (limiter, logger, OPENAI_MODEL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY_B64, SMTP_HOST, SMTP_USER, APP_URL, CORS_ORIGINS)
from db import client, db, _ensure_indexes
from models import RegisterRequest, LoginRequest, PasswordResetRequest, PasswordReset, HabitCreate, HabitUpdate, CompletionCreate, MoodCreate, InsightRequest, UserSettingsUpdate, AIKeyRequest, PushSubscribeRequest, DeleteAccountRequest
from security import create_token, decode_token, get_current_user, pwd_context, hash_token, encrypt_value, encryption_available
from logic import (get_level_progress, get_user_today, is_habit_scheduled_today, compute_global_streak, aggregate_consistency, compute_dow_patterns, compute_time_patterns, validate_completion_date)
from achievements import check_and_award_achievements, ACHIEVEMENT_CATALOG
from notifications import scheduler, send_email, send_welcome_email, send_push, daily_reminder_job, weekly_summary_job, push_endpoint_is_safe
from ai import generate_ai_insight, resolve_ai_credentials, openai_client

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

# ── User serialization ──────────────────────────────────────────────────────────
# Everything the client is allowed to see about an account, in one place. Each
# route used to build this dict inline with its own exclusion list, which is how
# a newly added secret field ends up in an API response: add it to the store and
# five separate comprehensions start returning it. Only this function reaches the
# client, and it drops secrets by name.
_PRIVATE_USER_FIELDS = ("password_hash", "openai_api_key_enc")


def public_user(user: dict) -> dict:
    safe = {k: v for k, v in user.items() if k not in _PRIVATE_USER_FIELDS}
    api_key, model, source = resolve_ai_credentials(user)
    # has_api_key: this account has its own key on file.
    # ai_configured: insights will reach a real model at all (own key or the
    # server fallback). The two differ, and the UI needs both to say why.
    safe["has_api_key"] = source == "user"
    safe["ai_configured"] = bool(api_key)
    safe["ai_key_source"] = source
    safe["ai_model"] = model
    # A masked tail so the UI can show which key is saved without ever holding it.
    safe["ai_key_hint"] = f"…{api_key[-4:]}" if source == "user" and api_key else ""
    return safe


# ── Auth Routes ─────────────────────────────────────────────────────────────────
@api_router.post("/auth/register")
@limiter.limit("10/hour")
async def register(data: RegisterRequest, request: Request, response: Response, background_tasks: BackgroundTasks):
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
        "push_notifications_enabled": True,
        "timezone": data.timezone,
        "notification_rules": [{"days": [0,1,2,3,4,5,6], "time": "20:00"}],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    user.pop("_id", None)

    access_token = create_token(user_id, "access", 60 * 24)
    refresh_token = create_token(user_id, "refresh", 60 * 24 * 30)
    await db.refresh_tokens.insert_one({"token": refresh_token, "user_id": user_id,
                                         "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
                                         "created_at": datetime.now(timezone.utc)})

    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=True,
                        samesite="none", path="/", max_age=30 * 24 * 60 * 60)
    background_tasks.add_task(send_welcome_email, email, data.name)

    return {"user": public_user(user), "access_token": access_token}


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
                                         "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
                                         "created_at": datetime.now(timezone.utc)})

    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=True,
                        samesite="none", path="/", max_age=30 * 24 * 60 * 60)

    return {"user": public_user(user), "access_token": access_token}


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
                                         "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
                                         "created_at": datetime.now(timezone.utc)})

    response.set_cookie("refresh_token", new_refresh, httponly=True, secure=True,
                        samesite="none", path="/", max_age=30 * 24 * 60 * 60)

    return {"user": public_user(user), "access_token": new_access}


@api_router.get("/auth/me")
async def get_me(current_user=Depends(get_current_user)):
    return public_user(current_user)


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
    
    # Store only a digest of the token — the emailed token is the secret, and it
    # should not be recoverable from the database. expires_at is a real datetime
    # so the TTL index in db.py can reap these automatically.
    await db.password_resets.insert_one({
        "token_hash": hash_token(reset_token),
        "user_id": user["user_id"],
        "email": email,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
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
    token_hash = hash_token(data.token)
    reset_doc = await db.password_resets.find_one({"token_hash": token_hash, "used": False}, {"_id": 0})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    # Check expiration. Tolerates the pre-hashing records that stored this as an
    # ISO string, so resets issued before this change still verify correctly.
    expires_at = reset_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset token has expired")
    
    # Update password
    new_hash = pwd_context.hash(data.new_password)
    await db.users.update_one({"user_id": user_id}, {"$set": {"password_hash": new_hash}})
    
    # Mark token as used
    await db.password_resets.update_one({"token_hash": token_hash}, {"$set": {"used": True}})
    
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
    # The endpoint is attacker-controlled and the server will POST to it later,
    # so it is validated before storage rather than trusted.
    if not push_endpoint_is_safe(data.subscription.get("endpoint")):
        raise HTTPException(status_code=400, detail="Invalid push subscription endpoint.")
    await db.users.update_one({"user_id": current_user["user_id"]},
                               {"$set": {"push_subscription": data.subscription}})
    return {"message": "Subscribed to push notifications"}

@api_router.delete("/notifications/subscribe")
async def unsubscribe_push(current_user=Depends(get_current_user)):
    """Clear the stored push endpoint.

    The client used to call subscription.unsubscribe() in the browser and stop
    there, so the server kept a subscription it could no longer deliver to and
    went on pushing at a dead endpoint every day."""
    await db.users.update_one({"user_id": current_user["user_id"]},
                               {"$set": {"push_subscription": None}})
    return {"message": "Unsubscribed from push notifications"}

@api_router.post("/notifications/test")
async def test_notification(current_user=Depends(get_current_user)):
    try:
        await send_push(current_user, "FORGE Test", "Push notifications are working! 🔥", "/")
        return {"success": True, "message": "Test notification sent!"}
    except Exception as e:
        # The exception text can carry the push endpoint's HTTP response body,
        # so it is logged server-side but never returned to the caller.
        logger.error("Test push failed: %s", e)
        raise HTTPException(status_code=502,
                            detail="Push notification failed. Try re-enabling notifications in your browser.")

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
async def get_completions(date: Optional[str] = None, habit_id: Optional[str] = None,
                          since: Optional[str] = None, current_user=Depends(get_current_user)):
    """List completions, optionally narrowed.

    `since` (YYYY-MM-DD, inclusive) exists so callers that only need a recent
    window stop pulling the entire history — the dashboard's weekly progress dots
    were fetching every completion the user had ever logged in order to count the
    current week."""
    q = {"user_id": current_user["user_id"]}
    if date:
        q["date"] = date
    if since:
        q["date"] = {"$gte": since}
    if habit_id:
        q["habit_id"] = habit_id
    return await db.completions.find(q, {"_id": 0}).to_list(10000)

@api_router.post("/completions")
async def create_completion(data: CompletionCreate, current_user=Depends(get_current_user)):
    today = get_user_today(current_user)
    target_date = data.date if data.date else today
    # `date` comes straight from the client. The 30-day window used to be enforced
    # only in the habit calendar UI, so anything could be posted here — including
    # future dates, which silently inflated points, streaks and achievements.
    if data.date:
        ok, reason = validate_completion_date(data.date, today)
        if not ok:
            raise HTTPException(status_code=400, detail=reason)
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

    all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    
    # Only count habits scheduled for today in progress calculations
    scheduled_habits = [h for h in habits if is_habit_scheduled_today(h, today_weekday)]
    scheduled_ids = {h["habit_id"] for h in scheduled_habits}
    
    today_comps = [c for c in all_comps if c["date"] == today and c["habit_id"] in scheduled_ids]
    today_bonus = [c for c in all_comps if c["date"] == today and c["habit_id"] not in scheduled_ids]

    total_pts = sum(c.get("points_earned", 1) for c in all_comps)
    today_pts = sum(c.get("points_earned", 1) for c in today_comps) + sum(c.get("points_earned", 1) for c in today_bonus)
    max_today = sum(h.get("priority", 1) for h in scheduled_habits)
    
    # Global streak: consecutive days where ALL scheduled habits were completed
    streak = compute_global_streak(all_comps, habits, today)
    
    lvl_data = get_level_progress(total_pts)
    
    # Completion rate: schedule-aware consistency over the last 14 days (unified helper)
    rate = aggregate_consistency(habits, all_comps, local_now, 14)

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
@limiter.limit("20/hour")
async def generate_insight(data: InsightRequest, request: Request, current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    tz_str = current_user.get("timezone", "UTC")
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = timezone.utc
    local_now = datetime.now(tz)
    start_7 = (local_now - timedelta(days=7)).strftime("%Y-%m-%d")

    all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
    past = await db.ai_insights.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(5)
    moods = await db.moods.find({"user_id": user_id, "date": {"$gte": start_7}}, {"_id": 0}).sort("date", -1).to_list(7)
    achievements = await db.achievements.find({"user_id": user_id}, {"_id": 0}).sort("earned_at", -1).to_list(5)

    rate = aggregate_consistency(habits, all_comps, local_now, 14)
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
@api_router.get("/achievements/catalog")
async def get_achievement_catalog():
    """The full achievement set, earned or not.

    The frontend used to hardcode its own copy of this list, so an achievement
    added server-side rendered as a generic medal with no description."""
    return [{k: v for k, v in a.items() if k != "earned_blurb"} for a in ACHIEVEMENT_CATALOG]


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
    return public_user(updated)


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

# ── AI key (bring your own) ─────────────────────────────────────────────────────
# Each account holds its own OpenAI key, encrypted at rest. The stored key is
# never returned by any route — the client only ever sees a masked tail.

def _openai_error_message(e: Exception) -> str:
    """Turn an OpenAI failure into something a user can act on. The exception text
    can quote the request, so only the mapped message is ever sent onward."""
    text = str(e).lower()
    if "401" in text or "invalid_api_key" in text or "incorrect api key" in text or "authentication" in text:
        return "OpenAI rejected that key. Check you copied all of it, and that it hasn't been revoked."
    if "403" in text or "permission" in text:
        return "That key is valid but not allowed to use this model. Pick another model, or use a key with full access."
    if "404" in text or "does not exist" in text or "not found" in text:
        return "That model isn't available to your key. Choose a different one."
    if "429" in text or "quota" in text or "rate limit" in text:
        return "OpenAI is rate-limiting this key, or the account is out of credit. Check your billing and try again."
    if "timeout" in text or "timed out" in text:
        return "OpenAI didn't respond in time. Try again in a moment."
    if "connection" in text or "network" in text:
        return "Couldn't reach OpenAI. Check your connection and try again."
    return "Couldn't reach OpenAI with that key. Try again in a moment."


async def _list_chat_models(api_key: str) -> list:
    """Chat-capable models this key can actually use, newest-looking first. Doubles
    as key validation: /v1/models is a cheap authenticated call that costs nothing."""
    client = openai_client(api_key)
    listing = await client.models.list()
    ids = [m.id for m in listing.data
           if m.id.startswith(("gpt-", "o1", "o3", "o4", "chatgpt-"))
           and not any(x in m.id for x in ("audio", "realtime", "transcribe", "tts", "image", "search", "instruct"))]
    return sorted(set(ids), reverse=True)


@api_router.get("/user/ai-models")
async def list_ai_models(current_user=Depends(get_current_user)):
    """The models available to whichever key this account runs on."""
    api_key, model, source = resolve_ai_credentials(current_user)
    if not api_key:
        raise HTTPException(status_code=400, detail="Add an OpenAI key first")
    try:
        return {"models": await _list_chat_models(api_key), "current": model, "source": source}
    except Exception as e:
        logger.error("Model listing failed (key=%s): %s", source, e)
        raise HTTPException(status_code=502, detail=_openai_error_message(e))


@api_router.put("/user/ai-key")
@limiter.limit("20/hour")
async def save_ai_key(data: AIKeyRequest, request: Request, current_user=Depends(get_current_user)):
    """Validate a key against OpenAI, then store it encrypted. A key that OpenAI
    won't accept is never written — the old flow reported success regardless."""
    if not encryption_available():
        raise HTTPException(status_code=503,
                            detail="This server can't store keys securely right now. Contact the administrator.")

    api_key = data.api_key.strip()
    try:
        models = await _list_chat_models(api_key)
    except Exception as e:
        logger.warning("Rejected an AI key for %s: %s", current_user["user_id"], type(e).__name__)
        raise HTTPException(status_code=400, detail=_openai_error_message(e))

    # Keep the requested model only if the key can actually use it, so a saved
    # setting can never point at a model that 404s on every insight.
    model = data.model or current_user.get("ai_model") or OPENAI_MODEL
    if models and model not in models:
        model = OPENAI_MODEL if OPENAI_MODEL in models else models[0]

    await db.users.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": {"openai_api_key_enc": encrypt_value(api_key), "ai_model": model}})
    updated = await db.users.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    return {"success": True, "message": "Key saved. Your insights now run on your own OpenAI account.",
            "models": models, "user": public_user(updated)}


@api_router.delete("/user/ai-key")
async def delete_ai_key(current_user=Depends(get_current_user)):
    await db.users.update_one({"user_id": current_user["user_id"]},
                              {"$unset": {"openai_api_key_enc": ""}})
    updated = await db.users.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    return {"success": True, "message": "Key removed.", "user": public_user(updated)}


@api_router.post("/user/test-ai-key")
@limiter.limit("20/hour")
async def test_ai_key(request: Request, current_user=Depends(get_current_user)):
    """Make one real completion with whatever key this account runs on, so the
    result reflects the path an actual insight takes — not just that a key parses."""
    api_key, model, source = resolve_ai_credentials(current_user)
    if not api_key:
        raise HTTPException(status_code=400,
                            detail="No OpenAI key on this account. Add one above to enable AI insights.")
    try:
        client = openai_client(api_key)
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Reply with exactly: FORGE connection OK"}],
            temperature=0,
            max_tokens=20)
        whose = "your key" if source == "user" else "the server's key"
        return {"success": True, "source": source, "model": model,
                "message": f"Working — {model} responded using {whose}.",
                "test_response": resp.choices[0].message.content}
    except Exception as e:
        logger.error("AI key test failed (model=%s, key=%s): %s", model, source, e)
        return {"success": False, "source": source, "model": model,
                "message": _openai_error_message(e)}


app.include_router(api_router)

@app.on_event("startup")
async def startup():
    await _ensure_indexes()
    scheduler.add_job(daily_reminder_job, "cron", minute="*", id="daily_reminder",
                      max_instances=1, coalesce=True, misfire_grace_time=120)
    scheduler.add_job(weekly_summary_job, "cron", minute="*", id="weekly_summary",
                      max_instances=1, coalesce=True, misfire_grace_time=120)
    scheduler.start()
    logger.info("FORGE backend started — scheduler running")


@app.on_event("shutdown")
async def shutdown():
    if scheduler.running:
        scheduler.shutdown()
    client.close()
