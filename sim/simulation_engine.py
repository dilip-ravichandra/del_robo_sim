# ═══════════════════════════════════════════════
# DELIVERYBOT — Simulation Engine
# Robot state machine + dynamic obstacles
# ═══════════════════════════════════════════════

import asyncio
import json
import math
import random
import time
from typing import List, Dict, Optional, Tuple

from constants import (
    MAP_W, MAP_H, HOME_X, HOME_Y,
    TICK_RATE, ROBOT_SPEED, BUILDINGS, DEST_COORDS,
)
from ai_module    import AIModule
from sensor_module import LidarSensor, CameraFeed


# ── Dynamic obstacle ──────────────────────────────────────────────────
class DynObs:
    def __init__(self, obs_type: str):
        self.type   = obs_type
        self.radius = 10 if obs_type == "vehicle" else 6

        if obs_type == "vehicle":
            self.speed = random.uniform(2.0, 4.0)
            road_y = random.choice([151.0, 281.0])
            self.x  = random.uniform(30, MAP_W - 30)
            self.y  = road_y
            self.vx = self.speed * random.choice([-1, 1])
            self.vy = 0.0
            self.change_timer = 0
        else:
            self.speed = random.uniform(0.6, 1.5)
            # Spawn near building edges (not inside)
            self.x = random.uniform(30, MAP_W - 30)
            self.y = random.uniform(30, MAP_H - 30)
            angle  = random.uniform(0, 2 * math.pi)
            self.vx = math.cos(angle) * self.speed
            self.vy = math.sin(angle) * self.speed
            self.change_timer = random.randint(40, 100)

    def update(self) -> None:
        if self.type == "vehicle":
            self.x += self.vx
            if self.x <= 0 or self.x >= MAP_W:
                self.vx = -self.vx
        else:
            self.change_timer -= 1
            if self.change_timer <= 0:
                angle = random.uniform(0, 2 * math.pi)
                self.vx = math.cos(angle) * self.speed
                self.vy = math.sin(angle) * self.speed
                self.change_timer = random.randint(40, 120)
            nx = self.x + self.vx
            ny = self.y + self.vy
            if 15 <= nx <= MAP_W - 15:
                self.x = nx
            else:
                self.vx = -self.vx
            if 15 <= ny <= MAP_H - 15:
                self.y = ny
            else:
                self.vy = -self.vy

    def to_dict(self) -> Dict:
        return {
            "x": round(self.x, 1), "y": round(self.y, 1),
            "type": self.type, "radius": self.radius,
        }


# ── Simulation engine ─────────────────────────────────────────────────
class SimulationEngine:
    # Robot states
    IDLE       = "idle"
    MOVING     = "moving"
    AVOIDING   = "avoiding"
    REROUTING  = "rerouting"
    ARRIVED    = "arrived"
    RETURNING  = "returning"

    def __init__(self):
        self.ai     = AIModule()
        self.lidar  = LidarSensor(num_rays=180, max_range=90.0)
        self.camera = CameraFeed()

        # Robot physical state
        self.rx        = HOME_X
        self.ry        = HOME_Y
        self.angle     = 0.0
        self.status    = self.IDLE
        self.battery   = 87.0
        self.speed     = 0.0
        self.trail: List[Dict] = []

        # Delivery state
        self.task_item   = ""
        self.task_dest   = ""
        self.task_pickup = ""
        self.task_receiver = ""
        self.task_receiver_email = ""
        self.sender_email = ""
        self.path: List[Tuple[float, float]] = []
        self.path_idx   = 0
        self.pickup_coord: Optional[Tuple[float, float]] = None
        self.dest_coord:   Optional[Tuple[float, float]] = None
        self.phase      = "none"   # "to_pickup" | "to_dest" | "returning"
        self.eta        = 0.0

        # Pickup lock state (sender loads package at pickup point)
        self.pickup_lock_active = False
        self.pickup_lock_otp    = ""

        # Delivery lock state (receiver collects package at destination)
        self.lock_active    = False
        self.lock_otp       = ""
        self.current_del_id = ""

        # Callbacks
        # on_pickup_arrived(item, pickup, sender_email, delivery_id) -> None
        self.on_pickup_arrived   = None
        # on_delivery_arrived(item, dest, receiver_email, delivery_id) -> None
        self.on_delivery_arrived = None

        # Obstacle avoidance state
        self.avoid_pause = 0
        self.steer_offset = 0.0

        # Dynamic obstacles
        self.obstacles: List[DynObs] = (
            [DynObs("person") for _ in range(5)] +
            [DynObs("vehicle") for _ in range(3)]
        )

        # Sensor cache (updated every tick)
        self.lidar_scan: List[Dict] = []
        self.camera_data: Dict = {}

        # WebSocket clients
        self._clients = set()
        self._delivery_log: List[Dict] = []

    # ── WebSocket client management ───────────────────────────────────
    def add_client(self, ws) -> None:
        self._clients.add(ws)

    def remove_client(self, ws) -> None:
        self._clients.discard(ws)

    # ── Delivery commands ─────────────────────────────────────────────
    def start_delivery(
        self,
        destination: str,
        item: str,
        pickup: str = "Admin Block",
        receiver: str = "",
        receiver_email: str = "",
        sender_email: str = "",
        delivery_id: str = "",
    ) -> Dict:
        if self.status not in (self.IDLE,):
            return {"ok": False, "error": "Robot is busy"}

        dest_coord   = DEST_COORDS.get(destination)
        pickup_coord = DEST_COORDS.get(pickup, (HOME_X, HOME_Y))

        if not dest_coord:
            for k, v in DEST_COORDS.items():
                if destination.lower() in k.lower():
                    dest_coord = v
                    break
            if not dest_coord:
                dest_coord = (400, 200)

        self.task_item           = item
        self.task_dest           = destination
        self.task_pickup         = pickup
        self.task_receiver       = receiver
        self.task_receiver_email = receiver_email
        self.sender_email        = sender_email
        self.pickup_coord        = pickup_coord
        self.dest_coord          = dest_coord
        self.phase               = "to_pickup"
        self.lock_active         = False
        self.lock_otp            = ""
        self.pickup_lock_active  = False
        self.pickup_lock_otp     = ""
        self.current_del_id      = delivery_id or f"DEL-{len(self._delivery_log)+1:03d}"

        self._plan_phase()
        self.status = self.MOVING
        self.speed  = ROBOT_SPEED

        log_entry = {
            "id":   self.current_del_id,
            "item": item, "dest": destination,
            "time": time.strftime("%H:%M"),
            "status": "active",
        }
        self._delivery_log.insert(0, log_entry)
        return {"ok": True, "eta": self.eta}

    def recall_robot(self) -> None:
        if self.status == self.IDLE:
            return
        self._plan_return()
        self.status = self.RETURNING

    def emergency_stop(self) -> None:
        self.status = self.IDLE
        self.path   = []
        self.speed  = 0.0
        self.phase  = "none"

    # ── Path planning helpers ─────────────────────────────────────────
    def _plan_phase(self) -> None:
        if self.phase == "to_pickup":
            target = self.pickup_coord
        elif self.phase == "to_dest":
            target = self.dest_coord
        else:
            target = (HOME_X, HOME_Y)

        self.path     = self.ai.find_path((self.rx, self.ry), target)
        self.path_idx = 0
        self.eta      = self.ai.estimate_eta(self.path, ROBOT_SPEED)

    def _plan_return(self) -> None:
        self.phase    = "returning"
        self.path     = self.ai.find_path((self.rx, self.ry), (HOME_X, HOME_Y))
        self.path_idx = 0

    # ── Main simulation tick ──────────────────────────────────────────
    def tick(self) -> None:
        # Update dynamic obstacles
        for obs in self.obstacles:
            obs.update()

        # Update sensors
        obs_dicts      = [o.to_dict() for o in self.obstacles]
        self.lidar_scan = self.lidar.scan(self.rx, self.ry, obs_dicts)
        self.camera_data = self.camera.get_frame_data(
            self.rx, self.ry, self.angle, obs_dicts
        )

        # Adaptive learning: decay costs every tick
        self.ai.decay_costs()

        # Battery drain/charge
        if self.status in (self.MOVING, self.RETURNING, self.AVOIDING):
            self.battery = max(5.0, self.battery - 0.008)
        else:
            self.battery = min(100.0, self.battery + 0.003)

        # Robot movement FSM
        if self.status in (self.MOVING, self.RETURNING, self.AVOIDING):
            self._move_robot()

    def _move_robot(self) -> None:
        if not self.path or self.path_idx >= len(self.path):
            self._on_phase_complete()
            return

        # Check for nearby dynamic obstacles
        if self._check_obstacle_proximity():
            return   # avoid_pause handles standstill

        target = self.path[self.path_idx]
        dx     = target[0] - self.rx
        dy     = target[1] - self.ry
        dist   = math.sqrt(dx * dx + dy * dy)

        if dist < ROBOT_SPEED:
            self.rx, self.ry = target
            self.path_idx += 1
        else:
            norm_x = dx / dist
            norm_y = dy / dist
            self.rx += norm_x * ROBOT_SPEED
            self.ry += norm_y * ROBOT_SPEED
            self.angle = math.atan2(dy, dx)

        # Trail
        self.trail.append({"x": round(self.rx, 1), "y": round(self.ry, 1)})
        if len(self.trail) > 120:
            self.trail.pop(0)

    def _check_obstacle_proximity(self) -> bool:
        """Return True if robot should pause/reroute due to nearby obstacle."""
        if self.avoid_pause > 0:
            self.avoid_pause -= 1
            self.status = self.AVOIDING
            return True

        for obs in self.obstacles:
            dx   = obs.x - self.rx
            dy   = obs.y - self.ry
            dist = math.sqrt(dx * dx + dy * dy)
            warn_r = obs.radius + 18  # warning zone

            if dist < warn_r:
                self.ai.penalise_area(obs.x, obs.y, weight=1.5)
                self.ai.replans += 1

                if dist < obs.radius + 10:
                    # Too close — reroute
                    self.status      = self.REROUTING
                    self.avoid_pause = 12
                    self._plan_phase()  # replan current phase with updated cost map
                    self.status      = self.MOVING
                    return True

        return False

    def _on_phase_complete(self) -> None:
        if self.phase == "to_pickup":
            # Robot arrived at pickup — wait for sender to load package via OTP
            self.status = self.ARRIVED
            self.speed  = 0.0
            if self._delivery_log:
                self._delivery_log[0]["status"] = "at_pickup"

            if self.on_pickup_arrived:
                self.on_pickup_arrived(
                    self.task_item,
                    self.task_pickup,
                    self.sender_email,
                    self.current_del_id,
                )
            else:
                # No callback — auto-proceed after 2 s
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                loop.call_later(2.0, self._proceed_to_dest)

        elif self.phase == "to_dest":
            self.status = self.ARRIVED
            self.speed  = 0.0
            if self._delivery_log:
                self._delivery_log[0]["status"] = "arrived"

            if self.on_delivery_arrived:
                # main.py handles lock flow (OTP email + WS broadcast)
                self.on_delivery_arrived(
                    self.task_item,
                    self.task_dest,
                    self.task_receiver_email,
                    self.current_del_id,
                )
            else:
                # No callback registered — auto-return after 2 s
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                loop.call_later(2.0, self._begin_return)

        elif self.phase == "returning":
            self.rx, self.ry = HOME_X, HOME_Y
            self.status    = self.IDLE
            self.speed     = 0.0
            self.trail     = []
            self.phase     = "none"
            self.eta       = 0.0
            self.task_item = ""
            self.task_dest = ""

    def _begin_return(self) -> None:
        self.lock_active = False
        self.lock_otp    = ""
        self._plan_return()
        self.status = self.RETURNING
        self.speed  = ROBOT_SPEED

    # ── Pickup lock helpers ───────────────────────────────────────────
    def set_pickup_lock(self, otp: str) -> None:
        self.pickup_lock_active = True
        self.pickup_lock_otp    = otp

    def unlock_pickup(self, entered_otp: str) -> bool:
        """Sender enters OTP to load package — robot proceeds to destination."""
        if not self.pickup_lock_active:
            return False
        if entered_otp != self.pickup_lock_otp:
            return False
        self.pickup_lock_active = False
        self.pickup_lock_otp    = ""
        self._proceed_to_dest()
        return True

    def _proceed_to_dest(self) -> None:
        if self._delivery_log:
            self._delivery_log[0]["status"] = "active"
        self.phase  = "to_dest"
        self._plan_phase()
        self.status = self.MOVING
        self.speed  = ROBOT_SPEED

    # ── Delivery lock helpers ─────────────────────────────────────────
    def set_lock(self, otp: str) -> None:
        self.lock_active = True
        self.lock_otp    = otp

    def unlock(self, entered_otp: str) -> bool:
        """Receiver enters OTP to collect package; robot returns to base."""
        if not self.lock_active:
            return False
        if entered_otp != self.lock_otp:
            return False
        if self._delivery_log:
            self._delivery_log[0]["status"] = "completed"
        self._begin_return()
        return True

    async def broadcast_event(self, payload: dict) -> None:
        """Broadcast any custom JSON event to all WebSocket clients."""
        import json as _json
        msg  = _json.dumps(payload)
        dead = set()
        for ws in self._clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        self._clients -= dead

    # ── State snapshot ────────────────────────────────────────────────
    def get_state(self) -> Dict:
        nearest   = self.lidar.nearest(self.lidar_scan)
        obs_count = self.lidar.obstacle_count(self.lidar_scan)

        return {
            "robot": {
                "x":        round(self.rx, 2),
                "y":        round(self.ry, 2),
                "angle":    round(self.angle, 4),
                "status":   self.status,
                "battery":  round(self.battery, 1),
                "speed":    round(self.speed, 2),
                "task":     self._task_label(),
                "destination": self.task_dest,
                "eta":      round(self.eta, 1),
                "phase":    self.phase,
            },
            "path": [
                {"x": p[0], "y": p[1]}
                for p in self.path[self.path_idx:]
            ],
            "pickup": {"x": self.pickup_coord[0], "y": self.pickup_coord[1]}
                       if self.pickup_coord else None,
            "dest":   {"x": self.dest_coord[0], "y": self.dest_coord[1]}
                       if self.dest_coord else None,
            "trail":  self.trail[-40:],
            "obstacles": [o.to_dict() for o in self.obstacles],
            "lidar": {
                "points":   self.lidar_scan[::3],   # thin to 60 pts for WS
                "nearest":  nearest,
                "obstacle_count": obs_count,
            },
            "camera": self.camera_data,
            "ai": {
                "learning_progress": self.ai.learning_progress,
                "confidence":        self.ai.confidence,
                "route_efficiency":  self.ai.route_efficiency,
                "total_plans":       self.ai.total_plans,
                "routes":            self.ai.route_log[:4],
            },
            "deliveries": self._delivery_log[:10],
            "lock": {
                "active":      self.lock_active,
                "delivery_id": self.current_del_id if self.lock_active else "",
                "dest":        self.task_dest      if self.lock_active else "",
                "item":        self.task_item      if self.lock_active else "",
            },
            "pickup_lock": {
                "active":      self.pickup_lock_active,
                "delivery_id": self.current_del_id      if self.pickup_lock_active else "",
                "pickup":      self.task_pickup          if self.pickup_lock_active else "",
                "item":        self.task_item            if self.pickup_lock_active else "",
            },
        }

    def _task_label(self) -> str:
        if self.status == self.IDLE:
            return "Awaiting dispatch"
        if self.status == self.ARRIVED and self.pickup_lock_active:
            return f"At {self.task_pickup} — awaiting package load"
        if self.status == self.ARRIVED:
            return f"Delivered: {self.task_item} at {self.task_dest}"
        if self.phase == "to_pickup":
            return f"En route to pickup: {self.task_pickup}"
        if self.phase == "to_dest":
            return f"{self.task_item} → {self.task_dest}"
        if self.phase == "returning":
            return "Returning to base"
        if self.status == self.AVOIDING:
            return "Obstacle detected — pausing"
        if self.status == self.REROUTING:
            return "AI replanning route..."
        return self.status

    # ── Async loop ────────────────────────────────────────────────────
    async def run(self) -> None:
        """Main simulation loop, 20 FPS."""
        while True:
            t0 = asyncio.get_event_loop().time()
            self.tick()
            await self._broadcast()
            elapsed = asyncio.get_event_loop().time() - t0
            await asyncio.sleep(max(0.0, TICK_RATE - elapsed))

    async def _broadcast(self) -> None:
        if not self._clients:
            return
        payload = json.dumps({"type": "state", **self.get_state()})
        dead    = set()
        for ws in self._clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self._clients -= dead
