# ═══════════════════════════════════════════════
# DELIVERYBOT — MongoDB (Motor async driver)
# ═══════════════════════════════════════════════

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import MONGO_URI, DB_NAME

_client: AsyncIOMotorClient | None = None


async def connect_db() -> AsyncIOMotorDatabase:
    global _client
    _client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000, tlsCAFile=certifi.where())
    db = _client[DB_NAME]

    # Ensure indexes (idempotent)
    await db.users.create_index("email", unique=True)
    await db.deliveries.create_index("delivery_id", unique=True)
    print(f"[DB] Connected to MongoDB — {DB_NAME}")
    return db


async def close_db() -> None:
    global _client
    if _client:
        _client.close()
        print("[DB] MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase | None:
    if _client is None:
        return None
    return _client[DB_NAME]
