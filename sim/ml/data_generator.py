"""
DeliveryBot — Training data generator.

Generates synthetic navigation scenarios by:
  1. Placing the robot + goal randomly on campus roads
  2. Scattering 0-6 dynamic obstacles (vehicles / pedestrians / bikes)
  3. Running a 24-ray LIDAR scan (reuses existing LidarSensor)
  4. Running A* to find the optimal next-step direction (label)

Saves:  sim/ml/training_data.npz
Run:    python sim/ml/data_generator.py   (or called by train.py)
"""

import sys
import os
import math
import random

import numpy as np

# ── Make sure sim/ is importable ──────────────────────────────────────
_SIM_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SIM_DIR not in sys.path:
    sys.path.insert(0, _SIM_DIR)

from constants import ROADS          # road rectangles
from sensor_module import LidarSensor
from ai_module import AIModule

# ── Constants ─────────────────────────────────────────────────────────
N_RAYS      = 24          # 15° per ray
LIDAR_RANGE = 90.0        # map units — matches LidarSensor default
N_SCENARIOS = 20_000

DATA_PATH = os.path.join(os.path.dirname(__file__), "training_data.npz")

# Map sensor string types → integer class index
_TYPE_MAP = {
    "none":       0,
    "building":   1,
    "vehicle":    2,
    "pedestrian": 3,
    "bike":       4,
}


# ── Helpers ───────────────────────────────────────────────────────────

def _random_road_point() -> tuple[float, float]:
    """Pick a uniformly random point on any campus road."""
    road = random.choice(ROADS)
    x = random.uniform(road["x"] + 2, road["x"] + road["w"] - 2)
    y = random.uniform(road["y"] + 2, road["y"] + road["h"] - 2)
    return float(x), float(y)


def _random_obstacles(n: int) -> list[dict]:
    """Generate n random dynamic obstacles on roads."""
    obs = []
    for _ in range(n):
        ox, oy   = _random_road_point()
        obs_type = random.choice(["vehicle", "pedestrian", "bike"])
        obs.append({
            "x":      ox,
            "y":      oy,
            "radius": 10 if obs_type == "vehicle" else 6,
            "type":   obs_type,
        })
    return obs


# ── Main generator ────────────────────────────────────────────────────

def generate(n: int = N_SCENARIOS, verbose: bool = True):
    """
    Generate n labelled scenarios.

    Returns
    -------
    X      : float32 (n, N_RAYS+2)  — lidar distances + [goal_cos, goal_sin]
    Y_det  : int64   (n, N_RAYS)    — obstacle class per ray (0-4)
    Y_path : float32 (n, 2)         — optimal (dx, dy) from A*
    """
    lidar = LidarSensor(num_rays=N_RAYS, max_range=LIDAR_RANGE)
    ai    = AIModule()

    X:      list = []
    Y_det:  list = []
    Y_path: list = []

    for i in range(n):
        if verbose and i % 2000 == 0:
            print(f"  generating {i:>6}/{n} scenarios...")

        rx, ry = _random_road_point()
        gx, gy = _random_road_point()

        dyn_obs = _random_obstacles(random.randint(0, 6))

        # ── LIDAR scan ────────────────────────────────────────────────
        scan        = lidar.scan(rx, ry, dyn_obs)
        lidar_dists = [min(1.0, s["distance"] / LIDAR_RANGE) for s in scan]
        lidar_types = [_TYPE_MAP.get(s["type"], 0)            for s in scan]

        # ── Goal direction ────────────────────────────────────────────
        ddx, ddy  = gx - rx, gy - ry
        goal_dist = math.sqrt(ddx ** 2 + ddy ** 2) or 1.0
        goal_cos  = ddx / goal_dist
        goal_sin  = ddy / goal_dist

        # ── A* optimal next step ──────────────────────────────────────
        path = ai.find_path((rx, ry), (gx, gy))
        if len(path) >= 2:
            nx, ny   = path[1]
            mdx, mdy = nx - rx, ny - ry
            m        = math.sqrt(mdx ** 2 + mdy ** 2) or 1.0
            mdx, mdy = mdx / m, mdy / m
        else:
            mdx, mdy = goal_cos, goal_sin   # fallback: head straight to goal

        X.append(lidar_dists + [goal_cos, goal_sin])
        Y_det.append(lidar_types)
        Y_path.append([mdx, mdy])

    X_arr      = np.array(X,      dtype=np.float32)
    Y_det_arr  = np.array(Y_det,  dtype=np.int64)
    Y_path_arr = np.array(Y_path, dtype=np.float32)

    np.savez(DATA_PATH, X=X_arr, Y_det=Y_det_arr, Y_path=Y_path_arr)
    if verbose:
        print(f"  saved {n} scenarios -> {DATA_PATH}")

    return X_arr, Y_det_arr, Y_path_arr


def load():
    """Load previously generated data from disk."""
    data = np.load(DATA_PATH)
    return data["X"], data["Y_det"], data["Y_path"]


if __name__ == "__main__":
    generate()
