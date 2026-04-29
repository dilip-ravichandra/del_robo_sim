# ═══════════════════════════════════════════════
# DELIVERYBOT — FastAPI Server
# Run: uvicorn main:app --reload --port 8000
# ═══════════════════════════════════════════════

import asyncio
import json
import random
import string
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from simulation_engine import SimulationEngine
from database import connect_db, close_db, get_db
from auth_handler import decode_token
from auth_routes import router as auth_router
from email_service import email_service

# ── Globals ───────────────────────────────────────────────────────────
sim: Optional[SimulationEngine] = None
security = HTTPBearer(auto_error=False)


# ── Auth dependency ───────────────────────────────────────────────────
async def require_auth(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    if not creds:
        raise HTTPException(401, "Authentication required")
    try:
        return decode_token(creds.credentials)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")


# ── Pickup arrived handler ────────────────────────────────────────────
async def _handle_pickup_arrived(
    item: str,
    pickup: str,
    sender_email: str,
    delivery_id: str,
) -> None:
    """Generate pickup OTP, email sender, broadcast pickup_lock event."""
    otp = "".join(random.choices(string.digits, k=6))
    sim.set_pickup_lock(otp)

    sender_name = sender_email.split("@")[0].capitalize() if sender_email else "Sender"

    db = get_db()
    if db is not None:
        await db.deliveries.update_one(
            {"delivery_id": delivery_id},
            {"$set": {
                "status":            "at_pickup",
                "pickup_arrived_at": datetime.utcnow(),
                "pickup_otp":        otp,
            }},
        )

    email_sent = False
    if sender_email and "@" in sender_email:
        email_sent = email_service.send_pickup_lock(
            sender_email, sender_name, item, pickup, otp
        )

    print(f"[Pickup Lock] {delivery_id} at pickup. OTP={otp} email_sent={email_sent}")
    if not email_sent:
        print(f"[Pickup Lock] DEV MODE — pickup OTP: {otp}")

    await sim.broadcast_event({
        "type":        "pickup_lock",
        "delivery_id": delivery_id,
        "item":        item,
        "pickup":      pickup,
        "sender":      sender_email,
        "otp_hint":    f"OTP sent to {sender_email}" if email_sent else f"DEV OTP: {otp}",
        "dev_otp":     otp if not email_sent else None,
    })


# ── Delivery arrived handler ──────────────────────────────────────────
async def _handle_delivery_arrived(
    item: str,
    dest: str,
    receiver_email: str,
    delivery_id: str,
) -> None:
    """Generate OTP, update DB, email receiver, broadcast lock event."""
    otp = "".join(random.choices(string.digits, k=6))
    sim.set_lock(otp)

    receiver_name = receiver_email.split("@")[0].capitalize() if receiver_email else "Recipient"

    # Update MongoDB delivery record
    db = get_db()
    if db is not None:
        await db.deliveries.update_one(
            {"delivery_id": delivery_id},
            {"$set": {
                "status":       "arrived",
                "arrived_at":   datetime.utcnow(),
                "unlock_otp":   otp,
            }},
        )

    # Email receiver
    email_sent = False
    if receiver_email and "@" in receiver_email:
        email_sent = email_service.send_delivery_lock(
            receiver_email, receiver_name, item, dest, otp
        )

    print(f"[Lock] Delivery {delivery_id} locked. OTP={otp} email_sent={email_sent}")
    if not email_sent:
        print(f"[Lock] DEV MODE — unlock OTP: {otp}")

    # Broadcast lock event to all WebSocket clients
    await sim.broadcast_event({
        "type":         "delivery_lock",
        "delivery_id":  delivery_id,
        "item":         item,
        "dest":         dest,
        "receiver":     receiver_email,
        "otp_hint":     f"OTP sent to {receiver_email}" if email_sent else f"DEV OTP: {otp}",
        "dev_otp":      otp if not email_sent else None,
    })


@asynccontextmanager
async def lifespan(app: FastAPI):
    global sim
    # Connect MongoDB
    try:
        await connect_db()
    except Exception as e:
        print(f"[DB] MongoDB connection failed: {e} — running without persistence")

    # Start simulation
    sim = SimulationEngine()

    # Wire pickup-arrived callback
    def _pickup_cb(item, pickup, sender_email, delivery_id):
        asyncio.create_task(
            _handle_pickup_arrived(item, pickup, sender_email, delivery_id)
        )

    sim.on_pickup_arrived = _pickup_cb

    # Wire delivery-arrived callback
    def _arrived_cb(item, dest, receiver_email, delivery_id):
        asyncio.create_task(
            _handle_delivery_arrived(item, dest, receiver_email, delivery_id)
        )

    sim.on_delivery_arrived = _arrived_cb

    asyncio.create_task(sim.run())
    yield
    await close_db()


app = FastAPI(title="DeliveryBot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth router
app.include_router(auth_router)


# ── Pydantic schemas ──────────────────────────────────────────────────
class DeliveryRequest(BaseModel):
    destination:    str
    item:           str
    pickup:         str = "Admin Block"
    receiver:       str = ""
    receiver_email: str = ""


class OTPRequest(BaseModel):
    otp: str


# ── Health ────────────────────────────────────────────────────────────
@app.get("/", tags=["health"])
def root():
    return {"service": "DeliveryBot API", "status": "running"}


# ── Delivery endpoints ────────────────────────────────────────────────
@app.post("/delivery/start", tags=["delivery"])
async def start_delivery(
    req: DeliveryRequest,
    user: dict = Depends(require_auth),
):
    delivery_id = f"DEL-{int(time.time()) % 100000:05d}"

    result = sim.start_delivery(
        destination=req.destination,
        item=req.item,
        pickup=req.pickup,
        receiver=req.receiver,
        receiver_email=req.receiver_email,
        sender_email=user.get("sub", ""),   # dispatcher's email for pickup OTP
        delivery_id=delivery_id,
    )
    if not result["ok"]:
        raise HTTPException(409, result["error"])

    # Persist to MongoDB
    db = get_db()
    if db is not None:
        await db.deliveries.insert_one({
            "delivery_id":     delivery_id,
            "item":            req.item,
            "destination":     req.destination,
            "pickup":          req.pickup,
            "receiver":        req.receiver,
            "receiver_email":  req.receiver_email,
            "dispatcher":      user.get("sub", "unknown"),
            "status":          "active",
            "created_at":      datetime.utcnow(),
        })

    return {**result, "delivery_id": delivery_id}


@app.post("/delivery/pickup-unlock", tags=["delivery"])
async def pickup_unlock(
    req: OTPRequest,
    user: dict = Depends(require_auth),
):
    """Sender enters OTP to load package into robot at pickup location."""
    if not sim.pickup_lock_active:
        raise HTTPException(400, "No active pickup lock")

    success = sim.unlock_pickup(req.otp)
    if not success:
        await sim.broadcast_event({
            "type":    "pickup_unlock_error",
            "message": "Incorrect pickup code — package not loaded.",
        })
        raise HTTPException(400, "Incorrect pickup code")

    sender_name = user.get("name", user.get("sub", "sender"))
    await sim.broadcast_event({
        "type":    "pickup_unlocked",
        "message": f"Package loaded by {sender_name} — compartment locked. Robot en route to destination.",
    })

    return {"ok": True, "message": "Package loaded — robot proceeding to destination"}


@app.post("/delivery/unlock", tags=["delivery"])
async def unlock_delivery(
    req: OTPRequest,
    user: dict = Depends(require_auth),
):
    if not sim.lock_active:
        raise HTTPException(400, "No active delivery lock")

    success = sim.unlock(req.otp)
    if not success:
        await sim.broadcast_event({
            "type":    "unlock_error",
            "message": "Incorrect unlock code — package not collected.",
        })
        raise HTTPException(400, "Incorrect unlock code")

    # Update MongoDB
    db = get_db()
    if db is not None:
        await db.deliveries.update_one(
            {"delivery_id": sim.current_del_id},
            {"$set": {
                "status":       "completed",
                "unlocked_by":  user.get("sub"),
                "unlocked_at":  datetime.utcnow(),
            }},
        )

    receiver_name = user.get("name", user.get("sub", "receiver"))
    await sim.broadcast_event({
        "type":    "delivery_unlocked",
        "message": f"Package collected by {receiver_name} — robot returning to base.",
    })

    return {"ok": True, "message": "Unlocked — robot returning to base"}


@app.get("/deliveries", tags=["delivery"])
async def get_deliveries(user: dict = Depends(require_auth)):
    db = get_db()
    if db is not None:
        docs = await db.deliveries.find(
            {}, {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        return docs
    # Fallback to in-memory log
    return sim.get_state()["deliveries"]


# ── Robot control endpoints ───────────────────────────────────────────
@app.post("/robot/recall", tags=["robot"])
async def recall_robot(user: dict = Depends(require_auth)):
    sim.recall_robot()
    return {"ok": True}


@app.post("/robot/estop", tags=["robot"])
async def emergency_stop(user: dict = Depends(require_auth)):
    sim.emergency_stop()
    return {"ok": True}


@app.get("/robot/status", tags=["robot"])
def get_status():
    return sim.get_state()["robot"]


@app.get("/robot/lidar", tags=["sensors"])
def get_lidar():
    return sim.get_state()["lidar"]


@app.get("/robot/camera", tags=["sensors"])
def get_camera():
    return sim.get_state()["camera"]


@app.get("/robot/full", tags=["robot"])
def get_full_state():
    return sim.get_state()


@app.get("/ai/info", tags=["ai"])
def get_ai_info():
    return sim.get_state()["ai"]


# ── WebSocket ─────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    sim.add_client(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                cmd = msg.get("cmd")
                if cmd == "start":
                    # WebSocket dispatch does NOT require auth (sim_viewer use)
                    sim.start_delivery(
                        destination=msg.get("destination", "Library"),
                        item=msg.get("item", "Package"),
                        pickup=msg.get("pickup", "Admin Block"),
                        receiver=msg.get("receiver", ""),
                        receiver_email=msg.get("receiver_email", ""),
                    )
                elif cmd == "recall":
                    sim.recall_robot()
                elif cmd == "estop":
                    sim.emergency_stop()
                elif cmd == "pickup_unlock":
                    otp = msg.get("otp", "")
                    if sim.unlock_pickup(otp):
                        await sim.broadcast_event({
                            "type":    "pickup_unlocked",
                            "message": "Package loaded — compartment locked. Robot en route to destination.",
                        })
                    else:
                        await sim.broadcast_event({
                            "type":    "pickup_unlock_error",
                            "message": "Incorrect pickup code.",
                        })
                elif cmd == "unlock":
                    otp = msg.get("otp", "")
                    if sim.unlock(otp):
                        await sim.broadcast_event({
                            "type":    "delivery_unlocked",
                            "message": "Package collected — robot returning to base.",
                        })
                    else:
                        await sim.broadcast_event({
                            "type":    "unlock_error",
                            "message": "Incorrect unlock code — package not collected.",
                        })
            except Exception:
                pass
    except WebSocketDisconnect:
        sim.remove_client(websocket)
    except Exception:
        sim.remove_client(websocket)
