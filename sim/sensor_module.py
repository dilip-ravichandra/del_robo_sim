# ═══════════════════════════════════════════════
# DELIVERYBOT — Sensor Module
# 180-ray LIDAR + simulated camera feed
# ═══════════════════════════════════════════════

import math
from typing import List, Dict, Tuple

from constants import BUILDINGS, MAP_W, MAP_H


class LidarSensor:
    def __init__(self, num_rays: int = 180, max_range: float = 90.0):
        self.num_rays  = num_rays
        self.max_range = max_range

    def scan(
        self,
        robot_x: float,
        robot_y: float,
        dynamic_obstacles: List[Dict],
    ) -> List[Dict]:
        """
        Cast `num_rays` evenly distributed around 360°.
        Returns list of hit dicts: {angle, distance, x, y, hit, type}
        """
        results = []
        step_angle = (2 * math.pi) / self.num_rays

        for i in range(self.num_rays):
            angle = i * step_angle
            hit_x, hit_y, dist, hit_type = self._cast_ray(
                robot_x, robot_y, angle, dynamic_obstacles
            )
            results.append({
                "angle":    round(angle, 4),
                "distance": round(dist,  2),
                "x":        round(hit_x, 1),
                "y":        round(hit_y, 1),
                "hit":      dist < self.max_range,
                "type":     hit_type,   # "building" | "person" | "vehicle" | "none"
            })

        return results

    # ── Ray casting ───────────────────────────────────────────────────
    def _cast_ray(
        self,
        ox: float,
        oy: float,
        angle: float,
        dynamic_obstacles: List[Dict],
    ) -> Tuple[float, float, float, str]:
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)

        best_dist = self.max_range
        best_x    = ox + cos_a * self.max_range
        best_y    = oy + sin_a * self.max_range
        best_type = "none"

        # ── Check static buildings ─────────────────────────────────
        for b in BUILDINGS:
            d = self._ray_aabb(ox, oy, cos_a, sin_a, b)
            if d is not None and 1.0 < d < best_dist:
                best_dist = d
                best_x    = ox + cos_a * d
                best_y    = oy + sin_a * d
                best_type = "building"

        # ── Check dynamic obstacles (circle approximation) ─────────
        for obs in dynamic_obstacles:
            d = self._ray_circle(ox, oy, cos_a, sin_a, obs)
            if d is not None and 0.5 < d < best_dist:
                best_dist = d
                best_x    = ox + cos_a * d
                best_y    = oy + sin_a * d
                best_type = obs.get("type", "person")

        return best_x, best_y, best_dist, best_type

    def _ray_aabb(
        self,
        ox: float, oy: float,
        cos_a: float, sin_a: float,
        rect: Dict,
    ) -> float | None:
        """Slab method ray–AABB intersection. Returns distance or None."""
        rx, ry  = rect["x"], rect["y"]
        rw, rh  = rect["w"], rect["h"]
        tmin, tmax = -math.inf, math.inf

        if abs(cos_a) > 1e-9:
            t1 = (rx      - ox) / cos_a
            t2 = (rx + rw - ox) / cos_a
            tmin = max(tmin, min(t1, t2))
            tmax = min(tmax, max(t1, t2))
        elif ox < rx or ox > rx + rw:
            return None

        if abs(sin_a) > 1e-9:
            t1 = (ry      - oy) / sin_a
            t2 = (ry + rh - oy) / sin_a
            tmin = max(tmin, min(t1, t2))
            tmax = min(tmax, max(t1, t2))
        elif oy < ry or oy > ry + rh:
            return None

        if tmax < tmin or tmax < 0:
            return None

        return max(0.0, tmin) if tmin > 1.0 else (tmax if tmax > 1.0 else None)

    def _ray_circle(
        self,
        ox: float, oy: float,
        cos_a: float, sin_a: float,
        obs: Dict,
    ) -> float | None:
        """Analytic ray–circle intersection."""
        cx, cy = obs["x"] - ox, obs["y"] - oy
        r = obs.get("radius", 8)

        # Project obstacle center onto ray
        proj = cx * cos_a + cy * sin_a
        if proj <= 0:
            return None

        # Perpendicular distance from obs center to ray
        perp_sq = (cx * cx + cy * cy) - proj * proj
        if perp_sq > r * r:
            return None

        dist = proj - math.sqrt(max(0.0, r * r - perp_sq))
        return dist if dist > 0.5 else None

    # ── Summary stats ─────────────────────────────────────────────────
    @staticmethod
    def nearest(scan: List[Dict]) -> float:
        hits = [p["distance"] for p in scan if p["hit"]]
        return round(min(hits), 2) if hits else 99.9

    @staticmethod
    def obstacle_count(scan: List[Dict]) -> int:
        return sum(1 for p in scan if p["hit"] and p["type"] != "building")


class CameraFeed:
    """Simulated front-facing camera: returns structured object detection data."""

    def get_frame_data(
        self,
        robot_x: float,
        robot_y: float,
        robot_angle: float,
        dynamic_obstacles: List[Dict],
    ) -> Dict:
        detected = []
        fov = math.pi / 3   # 60° field of view
        view_range = 80.0

        for obs in dynamic_obstacles:
            dx  = obs["x"] - robot_x
            dy  = obs["y"] - robot_y
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > view_range:
                continue

            bearing = math.atan2(dy, dx)
            rel_angle = bearing - robot_angle
            # Normalise to [-π, π]
            while rel_angle >  math.pi: rel_angle -= 2 * math.pi
            while rel_angle < -math.pi: rel_angle += 2 * math.pi

            if abs(rel_angle) <= fov / 2:
                label = "Person" if obs["type"] == "person" else "Vehicle"
                detected.append({
                    "label":    label,
                    "distance": round(dist, 1),
                    "bearing":  round(math.degrees(rel_angle), 1),
                    "confidence": round(max(0.6, 1.0 - dist / view_range), 2),
                })

        return {
            "objects": detected,
            "fps": 30,
            "resolution": "640x480",
        }
