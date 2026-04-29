# ═══════════════════════════════════════════════
# DELIVERYBOT — Shared Map Constants
# Coordinate space matches frontend (760 x 400)
# ═══════════════════════════════════════════════

MAP_W = 760
MAP_H = 400
CELL  = 10        # A* grid cell size in map units
GRID_W = MAP_W // CELL   # 76
GRID_H = MAP_H // CELL   # 40
HOME_X, HOME_Y = 680.0, 170.0

TICK_RATE   = 0.05   # simulation step in seconds (20 FPS)
ROBOT_SPEED = 3.5    # map units per tick at full speed

BUILDINGS = [
    {'id': 'main-gate',   'x': 10,  'y': 10,  'w': 130, 'h': 110, 'label': 'Main Gate'},
    {'id': 'admin',       'x': 202, 'y': 10,  'w': 150, 'h': 110, 'label': 'Admin Block'},
    {'id': 'science',     'x': 402, 'y': 10,  'w': 130, 'h': 110, 'label': 'Science Block'},
    {'id': 'library',     'x': 10,  'y': 162, 'w': 130, 'h': 80,  'label': 'Library'},
    {'id': 'lab-a',       'x': 202, 'y': 162, 'w': 150, 'h': 80,  'label': 'Lab A'},
    {'id': 'lab-b',       'x': 402, 'y': 162, 'w': 130, 'h': 80,  'label': 'Lab B'},
    {'id': 'canteen',     'x': 602, 'y': 162, 'w': 130, 'h': 80,  'label': 'Canteen'},
    {'id': 'engineering', 'x': 10,  'y': 292, 'w': 130, 'h': 90,  'label': 'Engineering'},
    {'id': 'hostel-a',    'x': 202, 'y': 292, 'w': 150, 'h': 90,  'label': 'Hostel A'},
    {'id': 'sports',      'x': 402, 'y': 292, 'w': 130, 'h': 90,  'label': 'Sports Complex'},
    {'id': 'medical',     'x': 602, 'y': 10,  'w': 130, 'h': 110, 'label': 'Medical Centre'},
    {'id': 'hostel-b',    'x': 602, 'y': 292, 'w': 130, 'h': 90,  'label': 'Hostel B'},
]

ROADS = [
    {'x': 0,   'y': 140, 'w': 760, 'h': 22, 'label': 'Main Road'},
    {'x': 0,   'y': 270, 'w': 760, 'h': 22},
    {'x': 160, 'y': 0,   'w': 22,  'h': 400},
    {'x': 380, 'y': 0,   'w': 22,  'h': 400},
    {'x': 560, 'y': 0,   'w': 22,  'h': 400},
]

# Building entrance points (edge of building, facing nearest road)
DEST_COORDS = {
    'Main Gate':                (75,  121),
    'Admin Block':              (277, 121),
    'Room 101 — Science Block': (467, 121),
    'Library':                  (75,  162),
    'Lab A — Chemistry':        (277, 162),
    'Lab B — Physics':          (467, 162),
    'Canteen':                  (667, 162),
    'Room 205 — Engineering':   (75,  292),
    'Hostel A':                 (277, 292),
    'Sports Complex':           (467, 292),
    'Medical Centre':           (667, 121),
    'Hostel B':                 (667, 292),
    'Lab C — Computer':         (277, 162),
    'Room 301 — Arts Block':    (277, 121),
    'Room 410 — Admin':         (277, 121),
}
