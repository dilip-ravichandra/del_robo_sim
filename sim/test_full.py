import asyncio, json, sys
sys.path.insert(0, '.')
import httpx, websockets
from auth_handler import create_token

BASE = "http://localhost:8001"
WS   = "ws://localhost:8001/ws"
FE   = "http://localhost:5500"


async def test_all():
    results = []
    def ok(label):   results.append(("OK",  label))
    def fail(label): results.append(("ERR", label))

    async with httpx.AsyncClient(timeout=10) as c:

        # 1. Health
        r = await c.get(f"{BASE}/")
        assert r.status_code == 200 and r.json()["status"] == "running"
        ok("Health endpoint  /  running")

        # 2. Robot idle
        r = await c.get(f"{BASE}/robot/status")
        rob = r.json()
        assert rob["status"] == "idle"
        ok(f"Robot idle  pos=({rob['x']:.0f},{rob['y']:.0f})  batt={rob['battery']:.0f}%")

        # 3. Full state — AI + LIDAR + obstacles
        r = await c.get(f"{BASE}/robot/full")
        full = r.json()
        assert "ai" in full and "lidar" in full and "obstacles" in full
        ok(f"Full state  ai_conf={full['ai']['confidence']}%  lidar={round(full['lidar']['nearest'],1) if full['lidar']['nearest'] else 'N/A'}u  obs={len(full['obstacles'])}")

        # 4. Auth login (2-step OTP)
        login = await c.post(f"{BASE}/auth/login",
                             json={"email": "diliprbtech24@rvu.edu.in", "password": "campus123"})
        ldata = login.json()
        assert login.status_code == 200, f"Login failed: {ldata}"
        dev_otp = ldata.get("dev_otp")
        ok(f"Login step-1  masked={ldata.get('masked_email')}  OTP={'emailed' if not dev_otp else dev_otp}")

        if dev_otp:
            verify = await c.post(f"{BASE}/auth/verify-login",
                                  json={"email": "diliprbtech24@rvu.edu.in", "otp": dev_otp})
            vdata = verify.json()
            assert verify.status_code == 200, f"Verify failed: {vdata}"
            token = vdata["token"]
            ok(f"Login step-2 JWT  name={vdata['name']}  role={vdata['role']}")
        else:
            ok("Login OTP emailed (email service live — real OTP delivered to inbox)")
            token = create_token("diliprbtech24@rvu.edu.in", "Dilip R", "student")
            ok(f"Direct JWT for gated tests  len={len(token)}")

        headers = {"Authorization": f"Bearer {token}"}

        # 5. /auth/me
        me = await c.get(f"{BASE}/auth/me", headers=headers)
        assert me.status_code == 200
        ok(f"/auth/me  email={me.json()['email']}  role={me.json()['role']}")

        # 6. WebSocket idle state
        try:
            async with websockets.connect(WS, open_timeout=5) as ws:
                msg = await asyncio.wait_for(ws.recv(), timeout=3)
                ws_state = json.loads(msg)
            assert ws_state.get("type") == "state"
            r0 = ws_state["robot"]
            ok(f"WebSocket idle  pos=({r0['x']:.0f},{r0['y']:.0f})  status={r0['status']}")
        except Exception as e:
            fail(f"WebSocket idle: {e}")

        # 7. Dispatch delivery (sender=dispatcher, receiver=athreyar)
        disp = await c.post(f"{BASE}/delivery/start", headers=headers, json={
            "destination":    "Library",
            "item":           "Test Package",
            "pickup":         "Admin Tower",
            "receiver":       "Athreyar",
            "receiver_email": "athreyar15@gmail.com",
        })
        ddata = disp.json()
        assert disp.status_code == 200 and ddata["ok"], f"Dispatch failed: {ddata}"
        del_id = ddata["delivery_id"]
        ok(f"Dispatch  id={del_id}  eta={ddata.get('eta')} min")

        # 8. Robot now moving
        r = await c.get(f"{BASE}/robot/status")
        rob2 = r.json()
        assert rob2["status"] in ("moving", "avoiding", "rerouting"), \
            f"Expected moving, got {rob2['status']}"
        ok(f"Robot moving  status={rob2['status']}  speed={rob2['speed']:.1f}u/t  pos=({rob2['x']:.0f},{rob2['y']:.0f})")

        # 9. Robot-busy guard (second dispatch must 409)
        r2 = await c.post(f"{BASE}/delivery/start", headers=headers,
                          json={"destination": "Canteen", "item": "Busy test", "pickup": "Admin Tower"})
        assert r2.status_code == 409, f"Expected 409, got {r2.status_code}: {r2.json()}"
        ok(f"Robot-busy guard  409  detail={r2.json()['detail']}")

        # 10. A*/D* route analysis
        await asyncio.sleep(0.5)
        r = await c.get(f"{BASE}/robot/full")
        full2 = r.json()
        ana  = full2.get("analysis", {})
        apts = ana.get("astar_path", [])
        dpts = ana.get("dstar_path", [])
        if apts:
            ok(f"A* route  {len(apts)} pts  len={ana.get('astar_length','?')}u  hops={ana.get('astar_hops','?')}")
        else:
            fail("A* route missing from /robot/full analysis")
        if dpts:
            ok(f"D* route  {len(dpts)} pts  len={ana.get('dstar_length','?')}u  replans={ana.get('replans',0)}")
        else:
            fail("D* route missing from /robot/full analysis")

        # 11. LIDAR while moving
        li2 = full2["lidar"]
        ok(f"LIDAR moving  nearest={round(li2['nearest'],1) if li2['nearest'] else 'N/A'}u  hits={li2['obstacle_count']}")

        # 12. Dynamic obstacles
        veh = [o for o in full2["obstacles"] if o["type"] == "vehicle"]
        ped = [o for o in full2["obstacles"] if o["type"] == "person"]
        ok(f"Obstacles  vehicles={len(veh)}  persons={len(ped)}")

        # 13. AI engine metrics
        ai2 = full2["ai"]
        ok(f"AI engine  learn={ai2['learning_progress']}%  conf={ai2['confidence']}%  eff={ai2['route_efficiency']}%  plans={ai2['total_plans']}")

        # 14. WebSocket live state — robot moving + pickup/dest/analysis present
        ws_moving = None
        try:
            async with websockets.connect(WS, open_timeout=5) as ws:
                for _ in range(20):
                    msg = await asyncio.wait_for(ws.recv(), timeout=2)
                    m = json.loads(msg)
                    if m.get("type") == "state" and m["robot"]["status"] in ("moving", "avoiding", "rerouting"):
                        ws_moving = m
                        break
            if ws_moving:
                wm = ws_moving["robot"]
                ok(f"WebSocket live  ({wm['x']:.0f},{wm['y']:.0f})  batt={wm['battery']:.0f}%  status={wm['status']}")
                hp = ws_moving.get("pickup") is not None
                hd = ws_moving.get("dest")   is not None
                ha = bool(ws_moving.get("analysis", {}).get("dstar_path"))
                ok(f"WS payload  pickup={'yes' if hp else 'MISSING'}  dest={'yes' if hd else 'MISSING'}  analysis={'yes' if ha else 'MISSING'}")
                if not hp: fail("pickup coord missing from WebSocket state")
                if not hd: fail("dest coord missing from WebSocket state")
                if not ha: fail("analysis.dstar_path missing from WebSocket state")
            else:
                fail("WebSocket: no moving state received in 20 messages")
        except Exception as e:
            fail(f"WebSocket moving: {e}")

        # 15. Recall robot
        rc = await c.post(f"{BASE}/robot/recall", headers=headers)
        assert rc.status_code == 200 and rc.json()["ok"]
        ok("Robot recall  200 OK")
        await asyncio.sleep(0.3)
        r = await c.get(f"{BASE}/robot/status")
        ok(f"Post-recall status={r.json()['status']}")

        # 16. Reset robot
        rst = await c.post(f"{BASE}/robot/reset")
        assert rst.status_code == 200
        r = await c.get(f"{BASE}/robot/status")
        assert r.json()["status"] == "idle"
        ok("Robot reset  idle confirmed")

        # 17. Delivery log
        dels = await c.get(f"{BASE}/deliveries", headers=headers)
        assert dels.status_code == 200
        dlist = dels.json()
        ok(f"Delivery log  {len(dlist)} records  latest_status={dlist[0].get('status','?') if dlist else 'none'}")

        # 18. Frontend pages
        for page in ["index.html", "dashboard.html", "sim_viewer.html"]:
            pr = await c.get(f"{FE}/{page}")
            if pr.status_code == 200:
                ok(f"Frontend  /{page}  200 OK")
            else:
                fail(f"Frontend  /{page}  {pr.status_code}")

        # 19. JS assets
        for js in ["sim_connect.js", "map.js", "dashboard.js", "login.js"]:
            jr = await c.get(f"{FE}/{js}")
            if jr.status_code == 200:
                ok(f"JS asset  {js}  200 OK")
            else:
                fail(f"JS asset  {js}  {jr.status_code}")

        # 20. CORS headers
        cr = await c.options(
            f"{BASE}/robot/status",
            headers={"Origin": "http://localhost:5500", "Access-Control-Request-Method": "GET"},
        )
        acao = cr.headers.get("access-control-allow-origin", "")
        if acao in ("*", "http://localhost:5500"):
            ok(f"CORS headers  access-control-allow-origin={acao}")
        else:
            fail(f"CORS missing  got '{acao}'")

    # ── Print report ───────────────────────────────────────────────────
    print()
    print("=" * 62)
    print("  DeliveryBot  Full System Test")
    print("=" * 62)
    for typ, label in results:
        sym = "  OK  " if typ == "OK" else "  FAIL"
        print(f"{sym}  {label}")
    fails = [l for t, l in results if t == "ERR"]
    print()
    print("=" * 62)
    if not fails:
        print("  ALL PASS  System is fully operational")
    else:
        print(f"  {len(fails)} FAILURE(S):")
        for f in fails:
            print(f"    x  {f}")
    print("=" * 62)
    return len(fails)


sys.exit(asyncio.run(test_all()))
