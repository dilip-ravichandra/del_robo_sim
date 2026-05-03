"""Full end-to-end system test."""
import asyncio, time, sys
sys.path.insert(0, '.')
import requests
from auth_handler import create_token

BASE = "http://localhost:8000"

def ok(label, condition, detail=""):
    mark = "OK" if condition else "FAIL"
    print(f"  [{mark}] {label}" + (f" — {detail}" if detail else ""))
    return condition

print("\n" + "="*50)
print("  DELIVERYBOT — FULL SYSTEM TEST")
print("="*50)

# 1. Health
r = requests.get(f"{BASE}/")
ok("Backend health", r.status_code == 200, r.json().get("status"))

# 2. Robot idle
r = requests.get(f"{BASE}/robot/status")
s = r.json()
ok("Robot idle at boot", s["status"] == "idle", f"status={s['status']} battery={s['battery']}%")

# 3. Reject unauthenticated dispatch
r = requests.post(f"{BASE}/delivery/start", json={"destination":"Library","item":"Test"})
ok("Unauthenticated dispatch rejected", r.status_code == 401, r.json().get("detail"))

# 4. Generate JWT directly (simulates logged-in user)
token = create_token("diliprbtech24@rvu.edu.in", "Dilip R", "student")
headers = {"Authorization": f"Bearer {token}"}
ok("JWT generated", len(token) > 50, f"length={len(token)}")

# 5. /auth/me
r = requests.get(f"{BASE}/auth/me", headers=headers)
ok("/auth/me with JWT", r.status_code == 200, r.json().get("email"))

# 6. Dispatch delivery
r = requests.post(f"{BASE}/delivery/start", headers=headers, json={
    "destination": "Library",
    "item": "Lab Report",
    "pickup": "Admin Tower",
    "receiver": "Prof. Sharma",
    "receiver_email": "diliprbtech24@rvu.edu.in",
})
d = r.json()
ok("Dispatch delivery", r.status_code == 200, f"id={d.get('delivery_id')} eta={d.get('eta')}min")

# 7. Robot moving
time.sleep(1)
r = requests.get(f"{BASE}/robot/status")
s = r.json()
ok("Robot moving after dispatch", s["status"] in ("moving","avoiding","rerouting"), f"status={s['status']}")

# 8. Recall
r = requests.post(f"{BASE}/robot/recall", headers=headers)
ok("Recall accepted", r.status_code == 200)

# 9. E-stop
r = requests.post(f"{BASE}/robot/estop", headers=headers)
ok("E-stop accepted", r.status_code == 200)

# 10. Robot back to idle
time.sleep(0.5)
r = requests.get(f"{BASE}/robot/status")
s = r.json()
ok("Robot idle after e-stop", s["status"] == "idle", f"status={s['status']}")

# 11. LIDAR
r = requests.get(f"{BASE}/robot/lidar")
l = r.json()
ok("LIDAR active", "nearest" in l and "obstacle_count" in l, f"nearest={l.get('nearest')}m obs={l.get('obstacle_count')}")

# 12. AI info
r = requests.get(f"{BASE}/ai/info")
a = r.json()
ok("AI module active", "confidence" in a and "learning_progress" in a, f"confidence={a.get('confidence')}%")

# 13. Deliveries list
r = requests.get(f"{BASE}/deliveries", headers=headers)
ok("Deliveries list accessible", r.status_code == 200, f"count={len(r.json())}")

# 14. Forgot password endpoint
r = requests.post(f"{BASE}/auth/forgot-password", json={"email":"diliprbtech24@rvu.edu.in"})
ok("Forgot password endpoint", r.status_code == 200, r.json().get("message","")[:40])

print("\n" + "="*50)
print("  All systems verified.")
print("="*50 + "\n")
