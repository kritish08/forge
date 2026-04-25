import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/Users/kritish/Downloads/forge/backend/.env")

async def migrate_users():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "forge")
    if not mongo_url:
        print("MONGO_URL not found.")
        return

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("Starting user timezone and notification migration...")
    users = await db.users.find({}).to_list(10000)
    migrated = 0

    default_rules = [{"days": [0,1,2,3,4,5,6], "time": "20:00"}]

    for user in users:
        updates = {}
        if "timezone" not in user:
            updates["timezone"] = "UTC"
        if "notification_rules" not in user:
            updates["notification_rules"] = default_rules

        if updates:
            await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
            migrated += 1

    print(f"Migration complete. Updated {migrated} out of {len(users)} users.")
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate_users())
