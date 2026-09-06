"""One-off cleanup for auth token rows written before the P1 changes.

WHY THIS EXISTS
    P1 added TTL indexes on refresh_tokens.expires_at and
    password_resets.expires_at so those collections stop growing without bound.
    MongoDB's TTL monitor only acts on BSON **dates** — it silently ignores a
    document whose indexed field holds anything else. Rows written before P1
    stored expires_at as an ISO *string*, so they are invisible to the index and
    will sit there forever unless something converts them.

    P1 also stopped storing password-reset tokens in the clear, keeping only a
    SHA-256 digest. Pre-existing rows still hold the raw token.

WHAT IT DOES
    refresh_tokens   string expires_at -> real datetime, so the TTL index can see
                     them. Rows already past expiry are deleted outright rather
                     than left for the TTL monitor's next sweep.
    password_resets  legacy rows (those with a plaintext `token` field) are
                     deleted. They cannot be migrated usefully: reset tokens live
                     one hour, so any that predate this are long expired, and the
                     whole point is to stop holding the raw value.

SAFETY
    Idempotent — running it twice changes nothing the second time. Defaults to a
    dry run; pass --apply to actually write.

USAGE
    python migrate_token_expiry.py              # report only, changes nothing
    python migrate_token_expiry.py --apply
    docker compose exec backend python migrate_token_expiry.py --apply
"""
import os
import sys
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Relative to this file, so it works inside the container as well as locally.
load_dotenv(Path(__file__).parent / ".env")


def _parse(value):
    """ISO string -> aware datetime, or None if it isn't one."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def main(apply: bool) -> int:
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL is not set. Point it at the database you want to clean.")
        return 1

    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get("DB_NAME", "forge_db")]
    now = datetime.now(timezone.utc)
    mode = "APPLY" if apply else "DRY RUN — nothing will be written"
    print(f"[{mode}] database: {db.name}\n")

    converted = deleted_expired = unparseable = 0
    try:
        # ── refresh_tokens ───────────────────────────────────────────────────
        cursor = db.refresh_tokens.find({"expires_at": {"$type": "string"}})
        async for doc in cursor:
            parsed = _parse(doc.get("expires_at"))
            if parsed is None:
                unparseable += 1
                continue
            if parsed <= now:
                deleted_expired += 1
                if apply:
                    await db.refresh_tokens.delete_one({"_id": doc["_id"]})
            else:
                converted += 1
                if apply:
                    update = {"expires_at": parsed}
                    created = _parse(doc.get("created_at"))
                    if created is not None:
                        update["created_at"] = created
                    await db.refresh_tokens.update_one({"_id": doc["_id"]}, {"$set": update})

        print("refresh_tokens")
        print(f"  {converted:6d}  string expires_at -> datetime (TTL can now see them)")
        print(f"  {deleted_expired:6d}  already expired, deleted")
        if unparseable:
            print(f"  {unparseable:6d}  expires_at unparseable — LEFT ALONE, inspect by hand")

        # ── password_resets ──────────────────────────────────────────────────
        legacy_q = {"token": {"$exists": True}}
        legacy = await db.password_resets.count_documents(legacy_q)
        if apply and legacy:
            await db.password_resets.delete_many(legacy_q)
        print("\npassword_resets")
        print(f"  {legacy:6d}  legacy rows holding a plaintext token, deleted")

        # ── what's left ──────────────────────────────────────────────────────
        rt_left = await db.refresh_tokens.count_documents({"expires_at": {"$type": "string"}})
        pr_left = await db.password_resets.count_documents(legacy_q)
        print("\nremaining after this run"
              f"\n  refresh_tokens with a string expires_at: {rt_left if apply else 'n/a (dry run)'}"
              f"\n  password_resets with a plaintext token:  {pr_left if apply else 'n/a (dry run)'}")

        if not apply:
            print("\nNothing was written. Re-run with --apply to make these changes.")
        elif unparseable:
            print("\nDone, but some rows could not be parsed — see above.")
        else:
            print("\nDone. Both collections are now fully managed by their TTL indexes.")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--apply" in sys.argv)))
