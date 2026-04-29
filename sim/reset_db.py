"""Clean up test/fake users and reset for fresh use."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def reset():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['deliverybot']

    # Remove unverified + test users
    result = await db.users.delete_many({
        "$or": [
            {"verified": False},
            {"email": {"$in": ["test@campus.edu", "dilip@test.com", "test@test.com"]}}
        ]
    })
    print(f"Removed {result.deleted_count} stale/test users")

    # Show remaining users
    users = await db.users.find({}, {'_id':0,'name':1,'email':1,'verified':1}).to_list(20)
    print(f"Remaining users: {len(users)}")
    for u in users:
        print(f"  {u['email']}  verified={u['verified']}")

    client.close()
    print("Done — fresh start ready")

asyncio.run(reset())
