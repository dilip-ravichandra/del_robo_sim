"""
DeliveryBot — Pygame Live Simulation Viewer
Connects to local backend via WebSocket and renders the campus map + robot.
Run alongside uvicorn: python sim_pygame.py
"""

import sys
import json
import math
import threading
import asyncio
import websockets
import pygame

# ── Config ────────────────────────────────────────────────────────────────────
WS_URL   = "ws://localhost:8000/ws"
MAP_W, MAP_H = 760, 400
SCALE    = 1.8           # scale up for laptop screen
WIN_W    = int(MAP_W * SCALE)
WIN_H    = int(MAP_H * SCALE) + 140   # extra for status panel at bottom
FPS      = 30

# ── Colours ───────────────────────────────────────────────────────────────────
C_BG         = (6,  18,  6)
C_ROAD       = (25, 45,  25)
C_ROAD_LINE  = (30, 60,  30)
C_BUILDING   = (13, 30,  13)
C_BUILDING_B = (29, 185, 84)
C_LABEL      = (100,180,100)
C_ROBOT      = (29, 185, 84)
C_ROBOT_IDLE = (80, 130, 80)
C_TRAIL      = (20, 80,  40)
C_HOME       = (255,200, 0)
C_PICKUP     = (59, 130, 246)
C_DEST       = (239, 68, 68)
C_TEXT       = (200,230,200)
C_DIM        = (60,  90, 60)
C_PANEL      = (10,  22, 10)
C_ACCENT     = (29, 185, 84)
C_WHITE      = (255,255,255)
C_YELLOW     = (255,220, 50)
C_BLUE       = (80, 160, 255)
C_RED        = (255, 80, 80)

BUILDINGS = [
    {'id':'main-gate',   'x':10,  'y':10,  'w':130,'h':110,'label':'Main Gate'},
    {'id':'admin',       'x':202, 'y':10,  'w':150,'h':110,'label':'Admin Block'},
    {'id':'science',     'x':402, 'y':10,  'w':130,'h':110,'label':'Science Block'},
    {'id':'library',     'x':10,  'y':162, 'w':130,'h':80, 'label':'Library'},
    {'id':'lab-a',       'x':202, 'y':162, 'w':150,'h':80, 'label':'Lab A'},
    {'id':'lab-b',       'x':402, 'y':162, 'w':130,'h':80, 'label':'Lab B'},
    {'id':'canteen',     'x':602, 'y':162, 'w':130,'h':80, 'label':'Canteen'},
    {'id':'engineering', 'x':10,  'y':292, 'w':130,'h':90, 'label':'Engineering'},
    {'id':'hostel-a',    'x':202, 'y':292, 'w':150,'h':90, 'label':'Hostel A'},
    {'id':'sports',      'x':402, 'y':292, 'w':130,'h':90, 'label':'Sports Complex'},
    {'id':'medical',     'x':602, 'y':10,  'w':130,'h':110,'label':'Medical'},
    {'id':'hostel-b',    'x':602, 'y':292, 'w':130,'h':90, 'label':'Hostel B'},
]

ROADS = [
    (0, 140, 760, 22),
    (0, 270, 760, 22),
    (160, 0,  22, 400),
    (380, 0,  22, 400),
    (560, 0,  22, 400),
]

HOME_X, HOME_Y = 680.0, 170.0

# ── Shared state (updated by WS thread) ───────────────────────────────────────
state = {
    "robot": {"x": HOME_X, "y": HOME_Y, "angle": 0, "status": "idle", "speed": 0},
    "task":  {"item": "", "pickup": "", "dest": "", "phase": "idle"},
    "delivery_lock": {"active": False},
    "pickup_lock":   {"active": False},
    "connected": False,
    "events": [],
}
trail = []   # list of (x, y) in map coords


# ── WebSocket listener (runs in background thread) ────────────────────────────
def ws_thread():
    async def listen():
        while True:
            try:
                async with websockets.connect(WS_URL) as ws:
                    state["connected"] = True
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                            if msg.get("type") == "state":
                                r = msg.get("robot", {})
                                state["robot"].update(r)
                                t = msg.get("task", {})
                                state["task"].update(t)
                                state["delivery_lock"] = msg.get("delivery_lock", {})
                                state["pickup_lock"]   = msg.get("pickup_lock", {})
                                rx, ry = r.get("x", HOME_X), r.get("y", HOME_Y)
                                if r.get("status") != "idle":
                                    if not trail or math.hypot(rx-trail[-1][0], ry-trail[-1][1]) > 4:
                                        trail.append((rx, ry))
                                        if len(trail) > 120:
                                            trail.pop(0)
                                else:
                                    trail.clear()
                            elif msg.get("type") in ("pickup_lock","delivery_lock","pickup_unlocked","delivery_unlocked"):
                                state["events"].append(msg.get("message","") or msg.get("type",""))
                                if len(state["events"]) > 5:
                                    state["events"].pop(0)
                        except Exception:
                            pass
            except Exception:
                state["connected"] = False
                await asyncio.sleep(3)

    asyncio.run(listen())


# ── Draw helpers ──────────────────────────────────────────────────────────────
def sx(x): return int(x * SCALE)
def sy(y): return int(y * SCALE)
def sr(r): return max(1, int(r * SCALE))


def draw_map(surf):
    surf.fill(C_BG)

    # Roads
    for rx, ry, rw, rh in ROADS:
        pygame.draw.rect(surf, C_ROAD, (sx(rx), sy(ry), sx(rw), sy(rh)))

    # Road centre dashes
    for rx, ry, rw, rh in ROADS:
        if rw > rh:   # horizontal
            cy = sy(ry + rh // 2)
            for dx in range(0, sx(rw), 24):
                pygame.draw.line(surf, C_ROAD_LINE, (sx(rx)+dx, cy), (sx(rx)+dx+12, cy), 1)
        else:          # vertical
            cx = sx(rx + rw // 2)
            for dy in range(0, sy(rh), 24):
                pygame.draw.line(surf, C_ROAD_LINE, (cx, sy(ry)+dy), (cx, sy(ry)+dy+12), 1)

    # Buildings
    font_s = pygame.font.SysFont("consolas", int(9*SCALE*0.55), bold=False)
    for b in BUILDINGS:
        r = pygame.Rect(sx(b['x']), sy(b['y']), sx(b['w']), sy(b['h']))
        pygame.draw.rect(surf, C_BUILDING, r, border_radius=4)
        pygame.draw.rect(surf, C_BUILDING_B, r, 1, border_radius=4)
        lbl = font_s.render(b['label'], True, C_LABEL)
        surf.blit(lbl, lbl.get_rect(center=r.center))

    # Home marker
    hx, hy = sx(HOME_X), sy(HOME_Y)
    pygame.draw.circle(surf, C_HOME, (hx, hy), sr(8))
    pygame.draw.circle(surf, C_BG,   (hx, hy), sr(4))


def draw_trail(surf):
    if len(trail) < 2:
        return
    pts = [(sx(x), sy(y)) for x, y in trail]
    for i in range(1, len(pts)):
        alpha = int(180 * i / len(pts))
        c = (C_TRAIL[0], min(255, C_TRAIL[1] + alpha//2), C_TRAIL[2])
        pygame.draw.line(surf, c, pts[i-1], pts[i], 2)


def draw_robot(surf, robot):
    rx, ry   = sx(robot["x"]), sy(robot["y"])
    angle    = robot.get("angle", 0)
    status   = robot.get("status", "idle")
    moving   = status not in ("idle",)
    col      = C_ROBOT if moving else C_ROBOT_IDLE

    # Glow ring
    if moving:
        glow = pygame.Surface((sr(40), sr(40)), pygame.SRCALPHA)
        pygame.draw.circle(glow, (*col, 40), (sr(20), sr(20)), sr(20))
        surf.blit(glow, (rx - sr(20), ry - sr(20)))

    # Body
    pygame.draw.circle(surf, col,  (rx, ry), sr(11))
    pygame.draw.circle(surf, C_BG, (rx, ry), sr(7))

    # Direction arrow
    rad = math.radians(angle)
    ax  = rx + int(math.cos(rad) * sr(9))
    ay  = ry - int(math.sin(rad) * sr(9))
    pygame.draw.line(surf, col, (rx, ry), (ax, ay), sr(3))


def draw_markers(surf, task):
    font_m = pygame.font.SysFont("consolas", int(10*SCALE*0.55), bold=True)
    phase  = task.get("phase", "idle")

    from constants import DEST_COORDS
    pickup = task.get("pickup", "")
    dest   = task.get("dest",   "")

    if pickup and pickup in DEST_COORDS and phase in ("to_pickup","at_pickup","to_dest","delivering"):
        px, py = DEST_COORDS[pickup]
        pygame.draw.circle(surf, C_PICKUP, (sx(px), sy(py)), sr(9), 2)
        lbl = font_m.render("P", True, C_PICKUP)
        surf.blit(lbl, (sx(px)-lbl.get_width()//2, sy(py)-lbl.get_height()//2))

    if dest and dest in DEST_COORDS and phase in ("to_dest","delivering"):
        dx, dy = DEST_COORDS[dest]
        pygame.draw.circle(surf, C_DEST, (sx(dx), sy(dy)), sr(9), 2)
        lbl = font_m.render("D", True, C_DEST)
        surf.blit(lbl, (sx(dx)-lbl.get_width()//2, sy(dy)-lbl.get_height()//2))


def draw_panel(surf, font_b, font_s, robot, task, connected):
    py_off = int(MAP_H * SCALE)
    panel  = pygame.Rect(0, py_off, WIN_W, WIN_H - py_off)
    pygame.draw.rect(surf, C_PANEL, panel)
    pygame.draw.line(surf, C_ACCENT, (0, py_off), (WIN_W, py_off), 1)

    status  = robot.get("status", "idle").upper()
    speed   = robot.get("speed",  0)
    phase   = task.get("phase",   "idle").upper().replace("_"," ")
    item    = task.get("item",    "") or "—"
    pickup  = task.get("pickup",  "") or "—"
    dest    = task.get("dest",    "") or "—"

    status_col = {
        "IDLE": C_DIM, "MOVING": C_ACCENT, "ARRIVED": C_YELLOW,
        "RETURNING": C_BLUE, "AVOIDING": C_RED,
    }.get(status, C_TEXT)

    # Row 1
    y1 = py_off + 10
    col_w = WIN_W // 4
    labels = [
        ("STATUS",  status,          status_col),
        ("PHASE",   phase,           C_TEXT),
        ("SPEED",   f"{speed:.1f}u/t", C_TEXT),
        ("NETWORK", "LIVE" if connected else "OFFLINE",
                    C_ACCENT if connected else C_RED),
    ]
    for i, (head, val, col) in enumerate(labels):
        hx = i * col_w + 12
        surf.blit(font_s.render(head, True, C_DIM),  (hx, y1))
        surf.blit(font_b.render(val,  True, col),    (hx, y1 + 16))

    # Row 2
    y2 = py_off + 60
    surf.blit(font_s.render("ITEM",    True, C_DIM), (12,            y2))
    surf.blit(font_s.render("PICKUP",  True, C_DIM), (WIN_W//3,      y2))
    surf.blit(font_s.render("DEST",    True, C_DIM), (WIN_W*2//3,    y2))
    surf.blit(font_b.render(item[:22],   True, C_TEXT), (12,          y2+16))
    surf.blit(font_b.render(pickup[:22], True, C_BLUE), (WIN_W//3,    y2+16))
    surf.blit(font_b.render(dest[:22],   True, C_RED),  (WIN_W*2//3,  y2+16))

    # Lock indicators
    if state["pickup_lock"].get("active"):
        lk = font_b.render("  PICKUP LOCK ACTIVE — Check phone  ", True, C_BG)
        bg = pygame.Surface((lk.get_width()+4, lk.get_height()+4))
        bg.fill(C_BLUE); surf.blit(bg, (WIN_W//2 - bg.get_width()//2, y2+50))
        surf.blit(lk, (WIN_W//2 - lk.get_width()//2, y2+52))
    elif state["delivery_lock"].get("active"):
        lk = font_b.render("  DELIVERY LOCK ACTIVE — Check phone  ", True, C_BG)
        bg = pygame.Surface((lk.get_width()+4, lk.get_height()+4))
        bg.fill(C_RED); surf.blit(bg, (WIN_W//2 - bg.get_width()//2, y2+50))
        surf.blit(lk, (WIN_W//2 - lk.get_width()//2, y2+52))


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    pygame.init()
    pygame.display.set_caption("DeliveryBot — Live Simulation")
    surf  = pygame.display.set_mode((WIN_W, WIN_H))
    clock = pygame.time.Clock()

    font_b = pygame.font.SysFont("consolas", int(11*SCALE*0.55), bold=True)
    font_s = pygame.font.SysFont("consolas", int(9*SCALE*0.55))

    # Static map surface (drawn once)
    map_surf = pygame.Surface((WIN_W, int(MAP_H * SCALE)))
    draw_map(map_surf)

    # Start WS listener in background
    t = threading.Thread(target=ws_thread, daemon=True)
    t.start()

    print("DeliveryBot Pygame Viewer — connecting to ws://localhost:8000/ws ...")

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                pygame.quit()
                sys.exit()

        # Composite frame
        surf.blit(map_surf, (0, 0))
        draw_trail(surf)

        sys.path.insert(0, "sim")
        draw_markers(surf, state["task"])
        draw_robot(surf,   state["robot"])
        draw_panel(surf, font_b, font_s, state["robot"], state["task"], state["connected"])

        pygame.display.flip()
        clock.tick(FPS)


if __name__ == "__main__":
    main()
