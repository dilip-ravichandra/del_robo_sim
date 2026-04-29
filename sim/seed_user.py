"""Create a pre-verified user for immediate testing."""
import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import sys
sys.path.insert(0, '.')
from auth_handler import hash_password

EMAIL    = "diliprbtech24@rvu.edu.in"
PASSWORD = "campus123"
NAME     = "Dilip R"
ROLE     = "student"

async def seed():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['deliverybot']

    existing = await db.users.find_one({"email": EMAIL})
    if existing:
        # Just mark as verified
        await db.users.update_one({"email": EMAIL}, {"$set": {"verified": True, "otp": None, "otp_expiry": None}})
        print(f"Updated existing user {EMAIL} -> verified=True")
    else:
        await db.users.insert_one({
            "name":          NAME,
            "email":         EMAIL,
            "password_hash": hash_password(PASSWORD),
            "role":          ROLE,
            "verified":      True,
            "otp":           None,
            "otp_expiry":    None,
            "created_at":    datetime.utcnow(),
        })
        print(f"Created verified user: {EMAIL}")

    print(f"Password: {PASSWORD}")
    print("Ready to log in!")
    client.close()

asyncio.run(seed())
