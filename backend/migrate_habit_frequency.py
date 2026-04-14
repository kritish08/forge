#!/usr/bin/env python3
"""
FORGE — MongoDB Migration: Habit Frequency Fields
==================================================
Adds frequency_type, frequency_days, frequency_target to all existing habits
that were created before the flexible scheduling feature was implemented.

This is a NON-DESTRUCTIVE, idempotent migration:
- Only updates documents that are MISSING the frequency_type field
- Defaults every existing habit to "daily" (preserving exact old behavior)
- Safe to run multiple times — already-migrated docs are skipped

Run once against your MongoDB (test = production for FORGE):
    python3 migrate_habit_frequency.py
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

MONGO_URL = os.environ.get("MONGO_URL", "mongodb+srv://forge:forge@forge.mongodb.net/forge?retryWrites=true&w=majority")
DB_NAME   = os.environ.get("DB_NAME", "forge")

async def run():
    print("=" * 60)
    print("FORGE Habit Frequency Migration")
    print("=" * 60)

    client = AsyncIOMotorClient(MONGO_URL)
    db     = client[DB_NAME]

    # Count habits missing frequency_type
    total   = await db.habits.count_documents({})
    missing = await db.habits.count_documents({"frequency_type": {"$exists": False}})

    print(f"\nTotal habits in collection : {total}")
    print(f"Habits missing frequency   : {missing}")

    if missing == 0:
        print("\n✅ All habits already have frequency fields. Nothing to do.")
        client.close()
        return

    print(f"\nMigrating {missing} habit(s) → setting frequency_type='daily'...")

    result = await db.habits.update_many(
        {"frequency_type": {"$exists": False}},
        {"$set": {
            "frequency_type":   "daily",
            "frequency_days":   [],
            "frequency_target": 7,
            "migrated_at":      datetime.now(timezone.utc).isoformat()
        }}
    )

    print(f"\n✅ Matched  : {result.matched_count}")
    print(f"✅ Modified : {result.modified_count}")

    # Verify
    still_missing = await db.habits.count_documents({"frequency_type": {"$exists": False}})
    if still_missing == 0:
        print("\n🎉 Migration complete. All habits now have frequency fields.")
    else:
        print(f"\n⚠️  {still_missing} habit(s) still missing frequency fields — investigate manually.")

    client.close()

if __name__ == "__main__":
    asyncio.run(run())
