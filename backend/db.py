import os
from motor.motor_asyncio import AsyncIOMotorClient
from config import logger

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

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
        ("refresh_tokens", [("user_id", 1)], {"name": "user_id"}),
        ("password_resets", [("token_hash", 1)], {"name": "token_hash"}),
        ("ai_insights", [("user_id", 1)], {"name": "user_id"}),
        # TTL indexes. Both collections grew without bound: rotation deletes the
        # refresh token it replaces, but an abandoned session's row was never
        # reclaimed, and spent reset tokens simply accumulated. expireAfterSeconds
        # of 0 means "expire at the time in this field", so mongo reaps each row
        # at its own expiry.
        #
        # NOTE: TTL only acts on BSON Date fields. Rows written before this change
        # stored expires_at as an ISO *string* and are silently skipped — they need
        # a one-off cleanup, they will not disappear on their own.
        ("refresh_tokens", [("expires_at", 1)],
            {"name": "ttl_expires_at", "expireAfterSeconds": 0}),
        ("password_resets", [("expires_at", 1)],
            {"name": "ttl_expires_at", "expireAfterSeconds": 0}),
    ]:
        try:
            await db[coll].create_index(keys, **kwargs)
        except Exception as e:
            logger.warning(f"Index on {coll} {keys} skipped: {e}")
