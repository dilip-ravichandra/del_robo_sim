# ═══════════════════════════════════════════════
# DELIVERYBOT — AI Navigation Module
# A* pathfinding + adaptive cost learning
# ═══════════════════════════════════════════════

import heapq
import math
from typing import List, Tuple, Optional
import numpy as np

from constants import (
    MAP_W, MAP_H, CELL, GRID_W, GRID_H, BUILDINGS, ROADS
)


class AIModule:
    def __init__(self):
        self.grid       = self._build_grid()
        # Cost map: accumulated cost from obstacle encounters
        self.cost_map   = np.zeros((GRID_H, GRID_W), dtype=np.float32)
        self.route_log  = []   # history of routes for learning display
        self.total_plans = 0
        self.replans     = 0

    # ── Grid construction ─────────────────────────────────────────────
    def _build_grid(self) -> np.ndarray:
        """1 = impassable (inside building), 0 = free."""
        grid = np.zeros((GRID_H, GRID_W), dtype=np.int8)
        margin = 1  # 1 cell (10px) inset so robot navigates along walls

        for b in BUILDINGS:
            gx1 = max(0, (b['x'] + margin * CELL) // CELL)
            gy1 = max(0, (b['y'] + margin * CELL) // CELL)
            gx2 = min(GRID_W - 1, (b['x'] + b['w'] - margin * CELL) // CELL)
            gy2 = min(GRID_H - 1, (b['y'] + b['h'] - margin * CELL) // CELL)
            if gx2 > gx1 and gy2 > gy1:
                grid[gy1:gy2, gx1:gx2] = 1

        return grid

    # ── Coordinate helpers ─────────────────────────────────────────────
    def world_to_grid(self, x: float, y: float) -> Tuple[int, int]:
        return (
            max(0, min(GRID_W - 1, int(x / CELL))),
            max(0, min(GRID_H - 1, int(y / CELL))),
        )

    def grid_to_world(self, gx: int, gy: int) -> Tuple[float, float]:
        return (gx * CELL + CELL / 2.0, gy * CELL + CELL / 2.0)

    def _nearest_free(self, pos: Tuple[int, int]) -> Tuple[int, int]:
        """Find the nearest grid cell that is not a building."""
        for r in range(1, 30):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    nx, ny = pos[0] + dx, pos[1] + dy
                    if 0 <= nx < GRID_W and 0 <= ny < GRID_H:
                        if self.grid[ny, nx] == 0:
                            return (nx, ny)
        return pos

    # ── A* core ───────────────────────────────────────────────────────
    def _astar(
        self,
        start: Tuple[int, int],
        end:   Tuple[int, int],
    ) -> Optional[List[Tuple[int, int]]]:
        def heuristic(a: Tuple[int, int], b: Tuple[int, int]) -> float:
            return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)

        open_set: list = []
        heapq.heappush(open_set, (0.0, start))
        came_from: dict = {}
        g: dict = {start: 0.0}

        while open_set:
            _, cur = heapq.heappop(open_set)

            if cur == end:
                path = []
                while cur in came_from:
                    path.append(cur)
                    cur = came_from[cur]
                path.append(start)
                return list(reversed(path))

            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1),
                           (-1, -1), (1, -1), (-1, 1), (1, 1)]:
                nx, ny = cur[0] + dx, cur[1] + dy
                nb = (nx, ny)
                if not (0 <= nx < GRID_W and 0 <= ny < GRID_H):
                    continue
                if self.grid[ny, nx] == 1:
                    continue

                move_cost     = math.sqrt(dx * dx + dy * dy)
                adaptive_cost = float(self.cost_map[ny, nx])
                tent_g        = g[cur] + move_cost + adaptive_cost

                if nb not in g or tent_g < g[nb]:
                    came_from[nb] = cur
                    g[nb] = tent_g
                    f = tent_g + heuristic(nb, end)
                    heapq.heappush(open_set, (f, nb))

        return None  # No path

    # ── Path planning public API ───────────────────────────────────────
    def find_path(
        self,
        start: Tuple[float, float],
        end:   Tuple[float, float],
    ) -> List[Tuple[float, float]]:
        """Plan a smooth world-coordinate path from start to end."""
        self.total_plans += 1
        sg = self.world_to_grid(*start)
        eg = self.world_to_grid(*end)

        if self.grid[sg[1], sg[0]] == 1:
            sg = self._nearest_free(sg)
        if self.grid[eg[1], eg[0]] == 1:
            eg = self._nearest_free(eg)

        grid_path = self._astar(sg, eg)
        if not grid_path:
            # Fallback: L-shaped path through nearest road
            return self._fallback_route(start, end)

        world_path = [self.grid_to_world(gx, gy) for gx, gy in grid_path]
        smoothed   = self._smooth_path(world_path)

        # Log route for learning display
        label = f"{int(start[0])},{int(start[1])} → {int(end[0])},{int(end[1])}"
        score = max(60, 100 - int(self.cost_map.mean() * 10))
        self.route_log = ([{'label': label, 'score': score}] + self.route_log)[:8]

        return smoothed

    def _fallback_route(
        self,
        start: Tuple[float, float],
        end:   Tuple[float, float],
    ) -> List[Tuple[float, float]]:
        """L-shaped routing via nearest road when A* fails."""
        road_y = 151.0 if abs(start[1] - 151) < abs(start[1] - 281) else 281.0
        return [start, (start[0], road_y), (end[0], road_y), end]

    # ── Path smoothing ─────────────────────────────────────────────────
    def _smooth_path(
        self,
        path: List[Tuple[float, float]],
    ) -> List[Tuple[float, float]]:
        """Remove intermediate waypoints that have line-of-sight to a farther one."""
        if len(path) <= 2:
            return path
        result = [path[0]]
        i = 0
        while i < len(path) - 1:
            j = len(path) - 1
            while j > i + 1:
                if self._los(path[i], path[j]):
                    break
                j -= 1
            result.append(path[j])
            i = j
        return result

    def _los(
        self,
        a: Tuple[float, float],
        b: Tuple[float, float],
    ) -> bool:
        """Line-of-sight check in grid space."""
        dx, dy = b[0] - a[0], b[1] - a[1]
        dist = math.sqrt(dx * dx + dy * dy)
        if dist == 0:
            return True
        steps = int(dist / (CELL * 0.5)) + 1
        for k in range(steps + 1):
            t  = k / steps
            wx = a[0] + dx * t
            wy = a[1] + dy * t
            gx, gy = self.world_to_grid(wx, wy)
            if self.grid[gy, gx] == 1:
                return False
        return True

    # ── Adaptive cost learning ─────────────────────────────────────────
    def penalise_area(
        self,
        wx: float,
        wy: float,
        weight: float = 2.0,
        radius: int   = 3,
    ) -> None:
        """Increase traversal cost near a dynamic obstacle encounter."""
        gx, gy = self.world_to_grid(wx, wy)
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                nx, ny = gx + dx, gy + dy
                if 0 <= nx < GRID_W and 0 <= ny < GRID_H:
                    d = math.sqrt(dx * dx + dy * dy)
                    if d <= radius:
                        self.cost_map[ny, nx] += weight * (1.0 - d / radius)
                        if self.cost_map[ny, nx] > 15.0:
                            self.cost_map[ny, nx] = 15.0

    def decay_costs(self) -> None:
        """Called every tick: slowly forget learned penalties."""
        self.cost_map *= 0.9998

    # ── ETA estimation ─────────────────────────────────────────────────
    def estimate_eta(
        self,
        path:  List[Tuple[float, float]],
        speed: float,
    ) -> float:
        """Return estimated minutes to complete the given path."""
        if not path or speed <= 0:
            return 0.0
        total_units = sum(
            math.sqrt(
                (path[i + 1][0] - path[i][0]) ** 2 +
                (path[i + 1][1] - path[i][1]) ** 2
            )
            for i in range(len(path) - 1)
        )
        # 1 map unit = 0.5 m real-world. Real campus robot ≈ 1.5 m/s.
        # Simulation runs ~20x faster than real time, so ETA uses real speed.
        metres = total_units * 0.5
        real_speed_mps = 1.5
        return round(metres / (real_speed_mps * 60), 1)

    # ── Stats for API ──────────────────────────────────────────────────
    @property
    def learning_progress(self) -> int:
        hot_cells = int((self.cost_map > 0.5).sum())
        return min(99, 50 + hot_cells // 2)

    @property
    def confidence(self) -> int:
        if self.total_plans == 0:
            return 0
        return min(99, 60 + self.total_plans * 2)

    @property
    def route_efficiency(self) -> int:
        if self.total_plans == 0:
            return 0
        # Clamp: replans can exceed total_plans due to proximity checks
        ratio = max(0.0, 1.0 - (min(self.replans, self.total_plans) / self.total_plans))
        return int(ratio * 100)
