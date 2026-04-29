import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['deliverybot']

    users = await db.users.find({}, {'_id':0,'name':1,'email':1,'verified':1,'role':1}).to_list(20)
    print('=== USERS ===')
    if not users:
        print('  (none)')
    for u in users:
        print(f"  {u['email']}  verified={u['verified']}  role={u.get('role','?')}")

    deliveries = await db.deliveries.find({}, {'_id':0,'delivery_id':1,'item':1,'status':1}).to_list(20)
    print(f'=== DELIVERIES ({len(deliveries)}) ===')
    for d in deliveries:
        print(f"  {d['delivery_id']}  {d['item']}  status={d['status']}")
    client.close()

asyncio.run(check())
