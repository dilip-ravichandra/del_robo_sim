"""
DeliveryBot — ML inference wrapper.

Loads nav_model.pt (produced by train.py) and exposes two clean methods
that the simulation can call optionally without breaking anything if the
model is absent or PyTorch is not installed.

Quick usage
-----------
    from ml.predictor import get_predictor

    pred = get_predictor()          # singleton; loads model once

    if pred.available:
        # Object detection from a LidarSensor.scan() result
        detections = pred.detect_objects(lidar_scan)
        # → [{'ray': 3, 'angle_deg': 45.0, 'label': 'vehicle',
        #      'confidence': 0.91, 'dist': 32.4}, ...]

        # Path-optimised movement direction
        dx, dy = pred.optimize_direction(lidar_scan, goal_cos, goal_sin)
        # → e.g. (0.71, -0.71)  — unit vector

How to integrate (optional, non-breaking)
------------------------------------------
In simulation_engine.py, after the existing A* call:

    from ml.predictor import get_predictor
    _pred = get_predictor()

    # Inside the tick loop, after computing goal direction:
    if _pred.available and self.lidar_scan:
        dx, dy = _pred.optimize_direction(
            self.lidar_scan, goal_cos, goal_sin
        )
        # blend ML suggestion with A* waypoint as desired
"""

import os
import sys
import math
import logging

log = logging.getLogger(__name__)

# ── Path setup ────────────────────────────────────────────────────────
_ML_DIR  = os.path.dirname(os.path.abspath(__file__))
_SIM_DIR = os.path.dirname(_ML_DIR)
for p in (_SIM_DIR, _ML_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

MODEL_PATH  = os.path.join(_ML_DIR, "nav_model.pt")
N_RAYS      = 24
LIDAR_RANGE = 90.0
LABELS      = ["none", "building", "vehicle", "pedestrian", "bike"]


# ── Predictor class ───────────────────────────────────────────────────

class NavPredictor:
    """
    Wraps the trained NavModel for runtime inference.
    Degrades gracefully if the model file or PyTorch is missing.
    """

    def __init__(self):
        self._model    = None
        self._torch    = None
        self.available = False
        self._load()

    # ── Initialisation ────────────────────────────────────────────────

    def _load(self):
        if not os.path.exists(MODEL_PATH):
            log.warning(
                "[NavPredictor] nav_model.pt not found. "
                "Run  python sim/ml/train.py  to train it first."
            )
            return
        try:
            import torch
            from ml.model import NavModel

            m = NavModel()
            m.load_state_dict(torch.load(MODEL_PATH, map_location="cpu",
                                         weights_only=True))
            m.eval()
            self._model    = m
            self._torch    = torch
            self.available = True
            log.info("[NavPredictor] nav_model.pt loaded successfully.")
        except Exception as exc:
            log.warning(f"[NavPredictor] Could not load model: {exc}")

    # ── Public API ────────────────────────────────────────────────────

    def detect_objects(self, lidar_scan: list) -> list:
        """
        Run the detection head on a LidarSensor.scan() result.

        Parameters
        ----------
        lidar_scan : list of dicts  (output of LidarSensor.scan())
                     Each dict must have keys: "distance", "type"

        Returns
        -------
        list of detected obstacle dicts — one per ray with a non-zero class:
            [{
                "ray":        int,    # ray index 0-23
                "angle_deg":  float,  # compass angle of this ray
                "label":      str,    # "vehicle" | "pedestrian" | "bike" | "building"
                "confidence": float,  # softmax probability 0-1
                "dist":       float,  # measured distance in map units
            }]
        Returns [] if model is unavailable.
        """
        if not self.available:
            return []

        x = self._build_features(lidar_scan)
        with self._torch.no_grad():
            det_out, _ = self._model(x)              # (1, 24, 5)

        probs = self._torch.softmax(det_out[0], dim=-1).numpy()   # (24, 5)

        detections = []
        for i, p in enumerate(probs):
            pred = int(p.argmax())
            if pred > 0:                              # skip "none" rays
                detections.append({
                    "ray":        i,
                    "angle_deg":  round(360.0 * i / N_RAYS, 1),
                    "label":      LABELS[pred],
                    "confidence": round(float(p.max()), 3),
                    "dist":       round(lidar_scan[i]["distance"], 1),
                })
        return detections

    def optimize_direction(
        self,
        lidar_scan:  list,
        goal_cos:    float,
        goal_sin:    float,
    ) -> tuple[float, float]:
        """
        Run the path-optimisation head and return the best movement direction.

        Parameters
        ----------
        lidar_scan : list of dicts from LidarSensor.scan()
        goal_cos   : cos(angle to goal)
        goal_sin   : sin(angle to goal)

        Returns
        -------
        (dx, dy) — normalised unit vector.
        Falls back to the raw goal direction when model is unavailable.
        """
        if not self.available:
            return goal_cos, goal_sin

        x = self._build_features(lidar_scan, goal_cos, goal_sin)
        with self._torch.no_grad():
            _, path_out = self._model(x)             # (1, 2)

        dx, dy = float(path_out[0, 0]), float(path_out[0, 1])
        mag    = math.sqrt(dx ** 2 + dy ** 2) or 1.0
        return dx / mag, dy / mag

    def explain(self, lidar_scan: list, goal_cos: float, goal_sin: float) -> dict:
        """
        Return a combined explanation dict — useful for the dashboard API.

        {
          "available":  bool,
          "detections": [...],        # from detect_objects()
          "direction":  [dx, dy],     # from optimize_direction()
          "danger":     float 0-1,    # fraction of rays with obstacles
        }
        """
        if not self.available:
            return {"available": False, "detections": [], "direction": [goal_cos, goal_sin], "danger": 0.0}

        detections = self.detect_objects(lidar_scan)
        dx, dy     = self.optimize_direction(lidar_scan, goal_cos, goal_sin)
        danger     = round(len(detections) / N_RAYS, 3)

        return {
            "available":  True,
            "detections": detections,
            "direction":  [dx, dy],
            "danger":     danger,
        }

    # ── Internal ──────────────────────────────────────────────────────

    def _build_features(
        self,
        lidar_scan: list,
        goal_cos:   float = 0.0,
        goal_sin:   float = 0.0,
    ):
        """Convert a LidarSensor scan to a (1, 26) float32 tensor."""
        dists = [
            min(1.0, lidar_scan[i]["distance"] / LIDAR_RANGE)
            for i in range(N_RAYS)
        ]
        vec = dists + [goal_cos, goal_sin]
        return self._torch.tensor(vec, dtype=self._torch.float32).unsqueeze(0)


# ── Singleton factory ─────────────────────────────────────────────────
_instance: NavPredictor | None = None


def get_predictor() -> NavPredictor:
    """Return the shared NavPredictor instance (created on first call)."""
    global _instance
    if _instance is None:
        _instance = NavPredictor()
    return _instance
