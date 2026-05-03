# ═══════════════════════════════════════════════
# DELIVERYBOT — Shared Map Constants
# Coordinate space matches frontend (760 x 400)
# ═══════════════════════════════════════════════

MAP_W = 760
MAP_H = 400
CELL  = 10        # A* grid cell size in map units
GRID_W = MAP_W // CELL   # 76
GRID_H = MAP_H // CELL   # 40
HOME_X, HOME_Y = 700.0, 197.0

TICK_RATE   = 0.05   # simulation step in seconds (20 FPS)
ROBOT_SPEED = 3.5    # map units per tick at full speed

# Dense 34-building campus: 4 horizontal × 5 vertical roads = 20 intersections
# Paired buildings within blocks create 20px corridors (2 A* cells) forcing non-trivial routing
BUILDINGS = [
    # ── Row 0: north of Main Road (y 6..82) ──────────────────────────────
    {'id': 'admin-tower',    'x':   6, 'y':  6, 'w': 106, 'h': 76, 'label': 'Admin Tower'},
    {'id': 'lab-c-a',        'x': 140, 'y':  6, 'w':  36, 'h': 76, 'label': 'Lab C – Alpha'},
    {'id': 'lab-c-b',        'x': 198, 'y':  6, 'w':  34, 'h': 76, 'label': 'Lab C – Beta'},
    {'id': 'science-tower',  'x': 262, 'y':  6, 'w': 100, 'h': 76, 'label': 'Science Tower'},
    {'id': 'classroom-101',  'x': 392, 'y':  6, 'w':  40, 'h': 76, 'label': 'Classroom 101'},
    {'id': 'seminar-hall',   'x': 452, 'y':  6, 'w':  40, 'h': 76, 'label': 'Seminar Hall'},
    {'id': 'engineering-b',  'x': 522, 'y':  6, 'w':  90, 'h': 76, 'label': 'Engineering'},
    {'id': 'medical-a',      'x': 642, 'y':  6, 'w':  46, 'h': 76, 'label': 'Medical – A'},
    {'id': 'medical-b',      'x': 708, 'y':  6, 'w':  46, 'h': 76, 'label': 'Medical – B'},
    # ── Row 1: Main Road ↔ Ring Road (y 112..182) ─────────────────────────
    {'id': 'library',        'x':   6, 'y': 112, 'w': 106, 'h': 70, 'label': 'Library'},
    {'id': 'cs-block',       'x': 140, 'y': 112, 'w':  92, 'h': 70, 'label': 'CS Block'},
    {'id': 'research-lab',   'x': 262, 'y': 112, 'w':  40, 'h': 70, 'label': 'Research Lab'},
    {'id': 'innovation-hub', 'x': 322, 'y': 112, 'w':  40, 'h': 70, 'label': 'Innovation Hub'},
    {'id': 'business-sch',   'x': 392, 'y': 112, 'w': 100, 'h': 70, 'label': 'Business School'},
    {'id': 'hostel-c',       'x': 522, 'y': 112, 'w':  35, 'h': 70, 'label': 'Hostel C'},
    {'id': 'hostel-d',       'x': 577, 'y': 112, 'w':  35, 'h': 70, 'label': 'Hostel D'},
    {'id': 'cafeteria',      'x': 642, 'y': 112, 'w': 112, 'h': 70, 'label': 'Cafeteria'},
    # ── Row 2: Ring Road ↔ Road 3 (y 212..262) ───────────────────────────
    {'id': 'main-gate',      'x':   6, 'y': 212, 'w': 106, 'h': 50, 'label': 'Main Gate'},
    {'id': 'pharmacy',       'x': 140, 'y': 212, 'w':  36, 'h': 50, 'label': 'Pharmacy'},
    {'id': 'clinic',         'x': 198, 'y': 212, 'w':  34, 'h': 50, 'label': 'Clinic'},
    {'id': 'auditorium',     'x': 262, 'y': 212, 'w': 100, 'h': 50, 'label': 'Auditorium'},
    {'id': 'workshop-a',     'x': 392, 'y': 212, 'w':  40, 'h': 50, 'label': 'Workshop A'},
    {'id': 'workshop-b',     'x': 452, 'y': 212, 'w':  40, 'h': 50, 'label': 'Workshop B'},
    {'id': 'sports-complex', 'x': 522, 'y': 212, 'w':  90, 'h': 50, 'label': 'Sports Complex'},
    {'id': 'hostel-a',       'x': 642, 'y': 212, 'w':  46, 'h': 50, 'label': 'Hostel A'},
    {'id': 'hostel-b',       'x': 708, 'y': 212, 'w':  46, 'h': 50, 'label': 'Hostel B'},
    # ── Row 3: Road 3 ↔ Road 4 (y 292..342) ─────────────────────────────
    {'id': 'parking-a',      'x':   6, 'y': 292, 'w': 106, 'h': 50, 'label': 'Parking'},
    {'id': 'canteen',        'x': 140, 'y': 292, 'w':  92, 'h': 50, 'label': 'Canteen'},
    {'id': 'art-studio',     'x': 262, 'y': 292, 'w':  40, 'h': 50, 'label': 'Art Studio'},
    {'id': 'design-lab',     'x': 322, 'y': 292, 'w':  40, 'h': 50, 'label': 'Design Lab'},
    {'id': 'gymnasium',      'x': 392, 'y': 292, 'w': 100, 'h': 50, 'label': 'Gymnasium'},
    {'id': 'staff-a',        'x': 522, 'y': 292, 'w':  35, 'h': 50, 'label': 'Staff – A'},
    {'id': 'staff-b',        'x': 577, 'y': 292, 'w':  35, 'h': 50, 'label': 'Staff – B'},
    {'id': 'conf-hall',      'x': 642, 'y': 292, 'w': 112, 'h': 50, 'label': 'Conference Hall'},
]

# 4 horizontal + 5 vertical roads — 20 intersections, dense grid
ROADS = [
    {'x':   0, 'y':  88, 'w': 760, 'h': 18, 'label': 'Main Road'},
    {'x':   0, 'y': 188, 'w': 760, 'h': 18, 'label': 'Ring Road'},
    {'x':   0, 'y': 268, 'w': 760, 'h': 18},
    {'x':   0, 'y': 348, 'w': 760, 'h': 18},
    {'x': 118, 'y':   0, 'w':  18, 'h': 400},
    {'x': 238, 'y':   0, 'w':  18, 'h': 400},
    {'x': 368, 'y':   0, 'w':  18, 'h': 400},
    {'x': 498, 'y':   0, 'w':  18, 'h': 400},
    {'x': 618, 'y':   0, 'w':  18, 'h': 400},
]

# Delivery entrance points — at the road edge nearest to each building
DEST_COORDS = {
    # Row 0 buildings → bottom face → Main Road top (y=88)
    'Admin Tower':      ( 59,  88),
    'Lab C – Alpha':    (158,  88),
    'Lab C – Beta':     (215,  88),
    'Science Tower':    (312,  88),
    'Classroom 101':    (412,  88),
    'Seminar Hall':     (472,  88),
    'Engineering':      (567,  88),
    'Medical – A':      (665,  88),
    'Medical – B':      (731,  88),
    # Row 1 buildings → top face → Main Road bottom (y=106)
    'Library':          ( 59, 106),
    'CS Block':         (186, 106),
    'Research Lab':     (282, 106),
    'Innovation Hub':   (342, 106),
    'Business School':  (442, 106),
    'Hostel C':         (539, 106),
    'Hostel D':         (594, 106),
    'Cafeteria':        (698, 106),
    # Row 2 buildings → top face → Ring Road bottom (y=206)
    'Main Gate':        ( 59, 206),
    'Pharmacy':         (158, 206),
    'Clinic':           (215, 206),
    'Auditorium':       (312, 206),
    'Workshop A':       (412, 206),
    'Workshop B':       (472, 206),
    'Sports Complex':   (567, 206),
    'Hostel A':         (665, 206),
    'Hostel B':         (731, 206),
    # Row 3 buildings → top face → Road 3 bottom (y=286)
    'Parking':          ( 59, 286),
    'Canteen':          (186, 286),
    'Art Studio':       (282, 286),
    'Design Lab':       (342, 286),
    'Gymnasium':        (442, 286),
    'Staff – A':        (539, 286),
    'Staff – B':        (594, 286),
    'Conference Hall':  (698, 286),
}
