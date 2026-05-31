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
        ("password_resets", [("token", 1)], {"name": "token"}),
        ("ai_insights", [("user_id", 1)], {"name": "user_id"}),
    ]:
        try:
            await db[coll].create_index(keys, **kwargs)
        except Exception as e:
            logger.warning(f"Index on {coll} {keys} skipped: {e}")
