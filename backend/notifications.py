import os, json, socket, ipaddress
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from config import SMTP_HOST, SMTP_USER, VAPID_PRIVATE_KEY_B64, VAPID_PUBLIC_KEY, APP_URL, API_URL, DOMAIN_NAME, logger
from db import db
from logic import (get_level, is_habit_scheduled_today, compute_global_streak, aggregate_consistency,
                   due_daily_slot, is_weekly_due)
from security import create_token

scheduler = AsyncIOScheduler(timezone="UTC")


def push_endpoint_is_safe(endpoint) -> bool:
    """Whether a Web Push endpoint is safe to send to.

    The stored subscription is attacker-controlled — a user posts whatever
    `endpoint` they like to /notifications/subscribe, and the server then makes
    an authenticated POST to it. Web Push endpoints are arbitrary vendor URLs
    (FCM, Mozilla autopush, Apple...), so the host cannot be allowlisted. What
    CAN be required is that it is https and that its host does not resolve onto
    the internal network — which turns an SSRF into an ordinary outbound
    request. Every resolved address is checked, so a public name that resolves
    to a private IP is rejected too.

    Resolution happens here and again inside the HTTP client at send time, so a
    determined DNS-rebinding attacker retains a narrow window; closing it fully
    needs connection-level IP pinning the push library does not expose. This
    blocks the straightforward cases (loopback, link-local metadata endpoints,
    RFC-1918) rather than claiming to be airtight."""
    if not isinstance(endpoint, str) or not endpoint:
        return False
    try:
        u = urlparse(endpoint)
    except Exception:
        return False
    if u.scheme != "https" or not u.hostname:
        return False
    try:
        infos = socket.getaddrinfo(u.hostname, u.port or 443, proto=socket.IPPROTO_TCP)
    except Exception:
        return False
    if not infos:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False
    return True

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
        Daily reminders start at 8PM and weekly summaries arrive on Sundays — both<br/>
        adjustable, along with which days they run, in Settings.<br/>
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
    if not push_endpoint_is_safe(sub.get("endpoint")):
        # A subscription can predate this check, or have been crafted to point at
        # an internal address. Refuse rather than let the server fetch it.
        raise ValueError("Push endpoint is not an allowed destination.")
    if not VAPID_PRIVATE_KEY_B64:
        raise ValueError("VAPID_PRIVATE_KEY is not configured in the server environment.")
    if not VAPID_PUBLIC_KEY:
        raise ValueError("VAPID_PUBLIC_KEY is not configured in the server environment.")

    from pywebpush import webpush
    from cryptography.hazmat.primitives.asymmetric import ec
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
        today = local_now.strftime("%Y-%m-%d")
        weekday = local_now.weekday()
        now_min = local_now.hour * 60 + local_now.minute

        rules = user.get("notification_rules", [{"days": [0,1,2,3,4,5,6], "time": "20:00"}])
        # Due within a grace window after the slot time, deduped by last-sent date so a
        # delayed/missed scheduler tick still fires exactly once.
        slot = due_daily_slot(rules, weekday, now_min, user.get("last_daily_sent"), today)
        if not slot:
            continue

        user_id = user["user_id"]
        habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
        scheduled_habits = [h for h in habits if is_habit_scheduled_today(h, weekday)]
        remaining = []
        if scheduled_habits:
            today_comps = await db.completions.find({"user_id": user_id, "date": today}, {"_id": 0}).to_list(100)
            done_ids = {c["habit_id"] for c in today_comps}
            remaining = [h for h in scheduled_habits if h["habit_id"] not in done_ids]

        if remaining:
            # Push notification — respect opt-in preference
            if user.get("push_notifications_enabled", True):
                try:
                    await send_push(user, "FORGE — Check in!", f"{len(remaining)} habit(s) remaining today 🔥")
                except Exception as e:
                    logger.warning("Push failed for user %s: %s", user_id, e)

            # Email — respect email_daily_reminder setting
            if user.get("email_daily_reminder", True) and user.get("email"):
                items = "".join([f"<li style='margin:4px 0'>{h['name']}</li>" for h in remaining[:5]])
                all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
                streak = compute_global_streak(all_comps, habits, today)

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
                try:
                    await send_email(user["email"], "🔥 FORGE: Complete your habits today", html)
                except Exception as e:
                    logger.warning("Daily email failed for %s: %s", user_id, e)

        # Mark this slot handled today — within the grace window we neither re-send nor re-query.
        await db.users.update_one({"user_id": user_id}, {"$set": {f"last_daily_sent.{slot}": today}})


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
        today = local_now.strftime("%Y-%m-%d")
        weekday = local_now.weekday()
        now_min = local_now.hour * 60 + local_now.minute

        # Due Sunday within a grace window after 09:00, deduped by last-sent date so a
        # delayed/missed scheduler tick still fires exactly once for the week.
        if not is_weekly_due(weekday, now_min, user.get("last_weekly_sent"), today):
            continue

        user_id = user["user_id"]
        # Claim this week's slot up-front (deduped by date) so the grace window neither
        # re-queries nor re-sends, even if delivery below is skipped or fails.
        await db.users.update_one({"user_id": user_id}, {"$set": {"last_weekly_sent": today}})

        start_7 = (local_now - timedelta(days=7)).strftime("%Y-%m-%d")
        week_comps = await db.completions.find({"user_id": user_id, "date": {"$gte": start_7}}, {"_id": 0}).to_list(10000)
        habits = await db.habits.find({"user_id": user_id, "is_active": True}, {"_id": 0}).to_list(100)
        all_comps = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
        if not week_comps or not user.get("email"):
            continue

        # Schedule-aware consistency over the past 7 days (unified helper)
        rate = round(aggregate_consistency(habits, all_comps, local_now, 7))
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
        try:
            await send_email(user["email"], f"🔥 FORGE Weekly: {rate}% consistency this week", html)
        except Exception as e:
            logger.warning("Weekly email failed for %s: %s", user_id, e)
