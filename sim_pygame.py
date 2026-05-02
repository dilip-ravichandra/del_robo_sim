"""
DeliveryBot — Full Pygame Simulation Viewer
Shows: robot, A* path, LIDAR rays, dynamic obstacles (vehicles + pedestrians),
       OTP lock banners, AI stats, battery, ETA, recall, all live via WebSocket.
"""

import sys, json, math, threading, asyncio
import websockets, pygame

WS_URL  = "ws://localhost:8000/ws"
MAP_W, MAP_H = 760, 400
SCALE   = 1.85
WIN_W   = int(MAP_W * SCALE)
PANEL_H = 150
WIN_H   = int(MAP_H * SCALE) + PANEL_H
FPS     = 30

# ── Palette ──────────────────────────────────────────────────────────────────
BG          = (6,   18,  6)
ROAD        = (22,  42,  22)
ROAD_DASH   = (30,  55,  30)
BLDG_FILL   = (13,  30,  13)
BLDG_BORDER = (29, 185,  84)
BLDG_LABEL  = (90, 160,  90)
GREEN       = (29, 185,  84)
GREEN_DIM   = (15,  70,  35)
GREEN_DARK  = (8,   35,  18)
YELLOW      = (255, 220, 50)
BLUE        = (59,  130, 246)
RED         = (239,  68,  68)
ORANGE      = (251, 146,  60)
WHITE       = (220, 240, 220)
DIM         = (50,   80,  50)
PANEL_BG    = (8,   18,   8)
HOME_COL    = (255, 200,  50)
PATH_COL    = (29,  185,  84)
LIDAR_COL   = (29,  185,  84)
LIDAR_HIT   = (239,  68,  68)
OBS_VEH     = (251, 146,  60)
OBS_PED     = (167, 139, 250)

BUILDINGS = [
    ('main-gate',   10,  10,  130, 110, 'Main Gate'),
    ('admin',      202,  10,  150, 110, 'Admin Block'),
    ('science',    402,  10,  130, 110, 'Science Block'),
    ('library',     10, 162,  130,  80, 'Library'),
    ('lab-a',      202, 162,  150,  80, 'Lab A'),
    ('lab-b',      402, 162,  130,  80, 'Lab B'),
    ('canteen',    602, 162,  130,  80, 'Canteen'),
    ('engineering', 10, 292,  130,  90, 'Engineering'),
    ('hostel-a',   202, 292,  150,  90, 'Hostel A'),
    ('sports',     402, 292,  130,  90, 'Sports Complex'),
    ('medical',    602,  10,  130, 110, 'Medical'),
    ('hostel-b',   602, 292,  130,  90, 'Hostel B'),
]
ROADS = [(0,140,760,22),(0,270,760,22),(160,0,22,400),(380,0,22,400),(560,0,22,400)]
HOME_X, HOME_Y = 680.0, 170.0

# ── Shared live state ─────────────────────────────────────────────────────────
live = {
    "robot":    {"x":HOME_X,"y":HOME_Y,"angle":0,"status":"idle","speed":0,
                 "battery":100,"eta":0,"phase":"idle","task":""},
    "path":     [],
    "trail":    [],
    "obstacles":[],
    "lidar":    {"points":[],"nearest":9999,"obstacle_count":0},
    "ai":       {"learning_progress":0,"confidence":0,"route_efficiency":0,"total_plans":0},
    "pickup":   None,
    "dest":     None,
    "lock":     {"active":False,"item":"","dest":""},
    "pickup_lock": {"active":False,"item":"","pickup":""},
    "deliveries":  [],
    "task":        {"item":"","pickup":"","dest":"","phase":"idle"},
    "connected":   False,
    "events":      [],
}

# ── WebSocket background thread ───────────────────────────────────────────────
def ws_thread():
    async def run():
        while True:
            try:
                async with websockets.connect(WS_URL, ping_interval=20) as ws:
                    live["connected"] = True
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                            t   = msg.get("type","")
                            if t == "state":
                                for k in ("robot","path","trail","obstacles","lidar","ai",
                                          "pickup","dest","lock","pickup_lock","deliveries"):
                                    if k in msg:
                                        live[k] = msg[k]
                                live["task"] = {
                                    "item":   msg.get("robot",{}).get("task",""),
                                    "pickup": "",
                                    "dest":   msg.get("robot",{}).get("destination",""),
                                    "phase":  msg.get("robot",{}).get("phase","idle"),
                                }
                                if live["deliveries"]:
                                    d = live["deliveries"][0]
                                    live["task"]["pickup"] = d.get("pickup","")
                                    live["task"]["item"]   = d.get("item","")
                            elif t in ("pickup_lock","delivery_lock","pickup_unlocked",
                                       "delivery_unlocked","pickup_unlock_error","unlock_error"):
                                live["events"].append((t, msg.get("message","") or t))
                                if len(live["events"]) > 6:
                                    live["events"].pop(0)
                        except Exception:
                            pass
            except Exception:
                live["connected"] = False
                await asyncio.sleep(3)
    asyncio.run(run())

# ── Coordinate helpers ────────────────────────────────────────────────────────
def sx(x): return int(x * SCALE)
def sy(y): return int(y * SCALE)
def sr(r): return max(1, int(r * SCALE))

# ── Static map (drawn once) ───────────────────────────────────────────────────
def build_map_surface(font_bldg):
    s = pygame.Surface((WIN_W, int(MAP_H * SCALE)))
    s.fill(BG)
    for rx,ry,rw,rh in ROADS:
        pygame.draw.rect(s, ROAD, (sx(rx),sy(ry),sx(rw),sy(rh)))
        if rw > rh:
            cy = sy(ry + rh//2)
            for dx in range(0, sx(rw), 26):
                pygame.draw.line(s, ROAD_DASH, (sx(rx)+dx,cy),(sx(rx)+dx+12,cy),1)
        else:
            cx = sx(rx + rw//2)
            for dy in range(0, sy(rh), 26):
                pygame.draw.line(s, ROAD_DASH, (cx,sy(ry)+dy),(cx,sy(ry)+dy+12),1)
    for _,bx,by,bw,bh,label in BUILDINGS:
        r = pygame.Rect(sx(bx),sy(by),sx(bw),sy(bh))
        pygame.draw.rect(s, BLDG_FILL,   r, border_radius=4)
        pygame.draw.rect(s, BLDG_BORDER, r, 1, border_radius=4)
        lbl = font_bldg.render(label, True, BLDG_LABEL)
        s.blit(lbl, lbl.get_rect(center=r.center))
    # Home base
    pygame.draw.circle(s, HOME_COL, (sx(HOME_X),sy(HOME_Y)), sr(8))
    pygame.draw.circle(s, BG,       (sx(HOME_X),sy(HOME_Y)), sr(4))
    htxt = font_bldg.render("HOME", True, HOME_COL)
    s.blit(htxt, (sx(HOME_X)+sr(10), sy(HOME_Y)-htxt.get_height()//2))
    return s

# ── Draw planned A* path ──────────────────────────────────────────────────────
def draw_path(surf, path):
    if len(path) < 2:
        return
    pts = [(sx(p["x"]), sy(p["y"])) for p in path]
    for i in range(1, len(pts)):
        if i % 2 == 0:
            pygame.draw.line(surf, GREEN_DIM, pts[i-1], pts[i], 1)

# ── Draw server trail ─────────────────────────────────────────────────────────
def draw_trail(surf, trail):
    if len(trail) < 2:
        return
    pts = [(sx(p["x"]), sy(p["y"])) for p in trail]
    for i in range(1, len(pts)):
        t = i / len(pts)
        c = (int(GREEN_DARK[0]+t*20), int(GREEN_DARK[1]+t*60), int(GREEN_DARK[2]+t*20))
        pygame.draw.line(surf, c, pts[i-1], pts[i], 2)

# ── Draw LIDAR rays ───────────────────────────────────────────────────────────
def draw_lidar(surf, robot, lidar_pts):
    rx, ry = sx(robot["x"]), sy(robot["y"])
    for pt in lidar_pts:
        hit  = pt.get("hit", False)
        dist = pt.get("distance", 0)
        ang  = math.radians(pt.get("angle", 0))
        ex   = rx + int(math.cos(ang) * dist * SCALE)
        ey   = ry - int(math.sin(ang) * dist * SCALE)
        col  = (*LIDAR_HIT, 120) if hit else (*LIDAR_COL, 35)
        line_surf = pygame.Surface((WIN_W, int(MAP_H*SCALE)), pygame.SRCALPHA)
        pygame.draw.line(line_surf, col, (rx,ry), (ex,ey), 1)
        surf.blit(line_surf, (0,0))
        if hit:
            pygame.draw.circle(surf, LIDAR_HIT, (ex,ey), sr(3))

# ── Draw dynamic obstacles ────────────────────────────────────────────────────
def draw_obstacles(surf, obstacles, font_tiny):
    for obs in obstacles:
        ox, oy = sx(obs["x"]), sy(obs["y"])
        r      = sr(obs.get("radius", 8))
        is_veh = obs.get("type") == "vehicle"
        col    = OBS_VEH if is_veh else OBS_PED
        if is_veh:
            pygame.draw.rect(surf, col, (ox-r, oy-r//2, r*2, r), border_radius=2)
            pygame.draw.rect(surf, (*col,180), (ox-r,oy-r//2,r*2,r), 1, border_radius=2)
        else:
            pygame.draw.circle(surf, col, (ox,oy), r)
            pygame.draw.circle(surf, (*col,200), (ox,oy), r, 1)
        tag = font_tiny.render("V" if is_veh else "P", True, BG)
        surf.blit(tag, tag.get_rect(center=(ox,oy)))

# ── Draw pickup / destination markers ────────────────────────────────────────
def draw_markers(surf, pickup, dest, font_m):
    if pickup:
        px, py = sx(pickup["x"]), sy(pickup["y"])
        pygame.draw.circle(surf, BLUE, (px,py), sr(12), 2)
        pygame.draw.circle(surf, (*BLUE,60), (px,py), sr(18), 1)
        lbl = font_m.render("P", True, BLUE)
        surf.blit(lbl, lbl.get_rect(center=(px,py)))

    if dest:
        dx, dy = sx(dest["x"]), sy(dest["y"])
        pygame.draw.circle(surf, RED, (dx,dy), sr(12), 2)
        pygame.draw.circle(surf, (*RED,60), (dx,dy), sr(18), 1)
        lbl = font_m.render("D", True, RED)
        surf.blit(lbl, lbl.get_rect(center=(dx,dy)))

# ── Draw robot ────────────────────────────────────────────────────────────────
def draw_robot(surf, robot):
    rx, ry  = sx(robot["x"]), sy(robot["y"])
    angle   = robot.get("angle", 0)
    status  = robot.get("status","idle")
    moving  = status not in ("idle",)

    status_col = {
        "idle":"#1db954","moving":"#1db954","arrived":"#fbbf24",
        "returning":"#3b82f6","avoiding":"#ef4444","rerouting":"#f97316",
    }
    col = pygame.Color(status_col.get(status,"#1db954"))

    # Outer glow
    if moving:
        glow = pygame.Surface((sr(60),sr(60)), pygame.SRCALPHA)
        pygame.draw.circle(glow, (*col[:3],30),(sr(30),sr(30)),sr(30))
        pygame.draw.circle(glow, (*col[:3],15),(sr(30),sr(30)),sr(22))
        surf.blit(glow,(rx-sr(30),ry-sr(30)))

    # Body rings
    pygame.draw.circle(surf, col[:3], (rx,ry), sr(13))
    pygame.draw.circle(surf, BG,      (rx,ry), sr(9))
    pygame.draw.circle(surf, col[:3], (rx,ry), sr(5))

    # Direction arrow
    rad = math.radians(angle)
    ax  = rx + int(math.cos(rad)*sr(11))
    ay  = ry - int(math.sin(rad)*sr(11))
    pygame.draw.line(surf, col[:3], (rx,ry),(ax,ay), sr(3))

    # Speed ring arc
    spd = min(robot.get("speed",0)/3.5, 1.0)
    if spd > 0.05:
        pygame.draw.arc(surf, col[:3],
                        pygame.Rect(rx-sr(16),ry-sr(16),sr(32),sr(32)),
                        math.pi/2, math.pi/2 + spd*2*math.pi, sr(2))

# ── Draw status panel ─────────────────────────────────────────────────────────
def draw_panel(surf, fonts, robot, task, lidar, ai, lock, pickup_lock, events, connected):
    fb, fs, ft = fonts
    y0 = int(MAP_H * SCALE)
    pygame.draw.rect(surf, PANEL_BG, (0, y0, WIN_W, PANEL_H))
    pygame.draw.line(surf, GREEN,    (0, y0), (WIN_W, y0), 1)

    status  = robot.get("status","idle").upper()
    battery = robot.get("battery",100)
    speed   = robot.get("speed",0)
    eta     = robot.get("eta",0)
    phase   = robot.get("phase","idle").replace("_"," ").upper()
    nearest = lidar.get("nearest",9999)
    obs_cnt = lidar.get("obstacle_count",0)
    ai_conf = ai.get("confidence",0)
    ai_eff  = ai.get("route_efficiency",0)
    plans   = ai.get("total_plans",0)

    stat_col = {
        "IDLE":GREEN_DIM,"MOVING":GREEN,"ARRIVED":YELLOW,
        "RETURNING":BLUE,"AVOIDING":RED,"REROUTING":ORANGE,
    }.get(status, WHITE)

    # ── Row 1: robot vitals ──────────────────────────────────────────
    row1 = [
        ("STATUS",  status,              stat_col),
        ("PHASE",   phase,               WHITE),
        ("SPEED",   f"{speed:.1f} u/t",  WHITE),
        ("BATTERY", f"{battery:.0f}%",
                    GREEN if battery>50 else YELLOW if battery>20 else RED),
        ("ETA",     f"{eta:.0f}s" if eta>0 else "—", WHITE),
        ("NETWORK", "● LIVE" if connected else "○ OFF",
                    GREEN if connected else RED),
    ]
    cw = WIN_W // len(row1)
    for i,(head,val,col) in enumerate(row1):
        hx = i*cw+10
        surf.blit(fs.render(head, True, DIM),  (hx, y0+8))
        surf.blit(fb.render(val,  True, col),  (hx, y0+22))

    # ── Row 2: task + sensors ────────────────────────────────────────
    item   = task.get("item","")   or "—"
    pickup = task.get("pickup","") or "—"
    dest   = task.get("dest","")   or "—"

    row2 = [
        ("ITEM",    item[:20],   WHITE),
        ("PICKUP",  pickup[:18], BLUE),
        ("DEST",    dest[:18],   RED),
        ("LIDAR",   f"{nearest:.0f}u / {obs_cnt} obs", ORANGE if obs_cnt>0 else WHITE),
        ("AI CONF", f"{ai_conf:.0f}%",  GREEN),
        ("ROUTES",  str(plans),          WHITE),
    ]
    for i,(head,val,col) in enumerate(row2):
        hx = i*cw+10
        surf.blit(fs.render(head, True, DIM), (hx, y0+58))
        surf.blit(fb.render(val,  True, col), (hx, y0+72))

    # ── Lock banners ─────────────────────────────────────────────────
    by = y0 + 110
    if pickup_lock.get("active"):
        msg = f"  PICKUP LOCK  —  {pickup_lock.get('item','')}  —  Enter OTP on phone  "
        _banner(surf, fb, msg, BLUE, by)
    elif lock.get("active"):
        msg = f"  DELIVERY LOCK  —  {lock.get('item','')}  —  Enter OTP on phone  "
        _banner(surf, fb, msg, RED, by)

    # ── Live events (right side) ─────────────────────────────────────
    ew = 280
    for j, (evtype, evmsg) in enumerate(reversed(events[-3:])):
        ec = BLUE if "pickup" in evtype else RED if "unlock" in evtype or "error" in evtype else GREEN
        ev = ft.render(f"▶ {evmsg[:38]}", True, ec)
        surf.blit(ev, (WIN_W-ew, y0+8+j*18))

    # ── Legend (bottom-left) ─────────────────────────────────────────
    legend = [("● Robot",(29,185,84)),("── Path",GREEN_DIM),
              ("◉ Pickup",BLUE),("◉ Dest",RED),
              ("■ Vehicle",OBS_VEH),("● Person",OBS_PED),
              ("· LIDAR",LIDAR_COL)]
    for j,(txt,col) in enumerate(legend):
        surf.blit(ft.render(txt, True, col),(10+j*98, y0+PANEL_H-20))


def _banner(surf, fb, msg, col, y):
    lbl = fb.render(msg, True, BG)
    w   = lbl.get_width()+8
    bg  = pygame.Surface((w, lbl.get_height()+6))
    bg.fill(col)
    surf.blit(bg,  (WIN_W//2 - w//2, y))
    surf.blit(lbl, (WIN_W//2 - w//2+4, y+3))


# ── Main loop ─────────────────────────────────────────────────────────────────
def main():
    pygame.init()
    pygame.display.set_caption("DeliveryBot — Live Simulation  |  ESC to quit")
    surf  = pygame.display.set_mode((WIN_W, WIN_H))
    clock = pygame.time.Clock()

    scale_pt = lambda p: int(p * SCALE * 0.52)
    fb  = pygame.font.SysFont("consolas", scale_pt(20), bold=True)
    fs  = pygame.font.SysFont("consolas", scale_pt(17))
    ft  = pygame.font.SysFont("consolas", scale_pt(15))
    fbldg = pygame.font.SysFont("consolas", scale_pt(16))
    fm  = pygame.font.SysFont("consolas", scale_pt(22), bold=True)
    ftn = pygame.font.SysFont("consolas", scale_pt(13), bold=True)

    map_surf = build_map_surface(fbldg)

    threading.Thread(target=ws_thread, daemon=True).start()
    print("DeliveryBot Pygame Viewer started — waiting for backend on ws://localhost:8000/ws")

    # LIDAR layer (redrawn each frame with alpha)
    lidar_layer = pygame.Surface((WIN_W, int(MAP_H*SCALE)), pygame.SRCALPHA)

    while True:
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                pygame.quit(); sys.exit()
            if ev.type == pygame.KEYDOWN and ev.key == pygame.K_ESCAPE:
                pygame.quit(); sys.exit()

        r  = live["robot"]
        connected = live["connected"]

        # Base map
        surf.blit(map_surf, (0, 0))

        # A* planned path (dashed green)
        draw_path(surf, live["path"])

        # Server trail
        draw_trail(surf, live["trail"])

        # LIDAR rays (semi-transparent layer)
        lidar_layer.fill((0,0,0,0))
        for pt in live["lidar"].get("points",[]):
            hit  = pt.get("hit", False)
            dist = pt.get("distance", 0)
            ang  = math.radians(pt.get("angle", 0))
            rx2  = sx(r["x"]); ry2 = sy(r["y"])
            ex   = rx2 + int(math.cos(ang)*dist*SCALE)
            ey   = ry2 - int(math.sin(ang)*dist*SCALE)
            col  = (239,68,68,100) if hit else (29,185,84,25)
            pygame.draw.line(lidar_layer, col, (rx2,ry2),(ex,ey),1)
            if hit:
                pygame.draw.circle(lidar_layer, (239,68,68,200),(ex,ey),sr(3))
        surf.blit(lidar_layer, (0,0))

        # Dynamic obstacles
        draw_obstacles(surf, live["obstacles"], ftn)

        # Pickup / dest markers
        draw_markers(surf, live["pickup"], live["dest"], fm)

        # Robot
        draw_robot(surf, r)

        # Status panel
        draw_panel(surf, (fb,fs,ft), r, live["task"],
                   live["lidar"], live["ai"],
                   live["lock"], live["pickup_lock"],
                   live["events"], connected)

        # Connecting overlay
        if not connected:
            ov = pygame.Surface((WIN_W, int(MAP_H*SCALE)), pygame.SRCALPHA)
            ov.fill((0,0,0,120))
            surf.blit(ov,(0,0))
            msg = fb.render("Connecting to simulation backend...", True, GREEN)
            surf.blit(msg, msg.get_rect(center=(WIN_W//2, int(MAP_H*SCALE)//2)))

        pygame.display.flip()
        clock.tick(FPS)

if __name__ == "__main__":
    main()
