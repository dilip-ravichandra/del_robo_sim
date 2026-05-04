import asyncio, sys
sys.path.insert(0, '.')
from motor.motor_asyncio import AsyncIOMotorClient
from auth_handler import hash_password, verify_password

NEW_PASSWORD = "campus123"

async def reset():
    c = AsyncIOMotorClient('mongodb://localhost:27017')
    db = c['deliverybot']

    emails = [
        'diliprbtech24@rvu.edu.in',
        'dilipr1813@gmail.com',
        'dilhack13@gmail.com',
        'athreyar15@gmail.com',
        'brnishchalabtech24@rvu.edu.in',
    ]

    for email in emails:
        u = await db.users.find_one({'email': email})
        if u:
            await db.users.update_one(
                {'email': email},
                {'$set': {
                    'password_hash': hash_password(NEW_PASSWORD),
                    'verified': True,
                    'otp': None,
                    'otp_expiry': None,
                    'otp_purpose': None,
                }}
            )
            print(f"Reset: {email}  ->  {NEW_PASSWORD}")
        else:
            print(f"Not found: {email}")

    # Verify one of them
    u = await db.users.find_one({'email': 'diliprbtech24@rvu.edu.in'})
    ok = verify_password(NEW_PASSWORD, u['password_hash'])
    print(f"\nVerify check: campus123 matches diliprbtech24 -> {ok}")
    c.close()

asyncio.run(reset())
