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
from config import (limiter, logger, AZURE_ENDPOINT, AZURE_MODEL, AZURE_API_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY_B64, SMTP_HOST, SMTP_USER, APP_URL, CORS_ORIGINS)
from db import client, db, _ensure_indexes
from models import RegisterRequest, LoginRequest, PasswordResetRequest, PasswordReset, HabitCreate, HabitUpdate, CompletionCreate, MoodCreate, InsightRequest, UserSettingsUpdate, PushSubscribeRequest, DeleteAccountRequest
from security import create_token, decode_token, get_current_user, pwd_context
from logic import (get_level_progress, get_user_today, is_habit_scheduled_today, compute_global_streak, aggregate_consistency, compute_dow_patterns, compute_time_patterns)
from achievements import check_and_award_achievements
from notifications import scheduler, send_email, send_welcome_email, send_push, daily_reminder_job, weekly_summary_job
from ai import generate_ai_insight

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
    start_14 = (local_now - timedelta(days=14)).strftime("%Y-%m-%d")
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
