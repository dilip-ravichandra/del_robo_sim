# DeliveryBot — Autonomous Campus Delivery Robot Simulation

> A full-stack autonomous robot delivery system simulating a 34-building university campus. Order packages from your phone, watch the robot navigate in real-time on your laptop.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue?style=for-the-badge&logo=github)](https://dilip-ravichandra.github.io/del_robo_sim/dashboard.html)
[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![Database](https://img.shields.io/badge/Database-MongoDB-47A248?style=for-the-badge&logo=mongodb)](https://www.mongodb.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python)](https://python.org)

---

## What Is This?

DeliveryBot is a real-time simulation of an autonomous delivery robot navigating a dense university campus. It has two screens:

| Screen | URL | Who Uses It |
|--------|-----|-------------|
| **Dashboard** (order page) | `dashboard.html` | Student on phone — place an order |
| **Sim Viewer** (live map) | `sim_viewer.html` | Operator on laptop — watch the robot |

When a student places an order, the robot computes a D\* Lite path around 34 campus buildings, avoids live traffic (vehicles, bikes, pedestrians), and navigates to the drop-off point. The sender receives an OTP by email to unlock the delivery box.

---

## Features

- **D\* Lite pathfinding** — dynamic re-routing around moving obstacles
- **LIDAR sensor** — 360° ray-cast obstacle detection rendered in real-time
- **Live traffic** — vehicles, cyclists, and pedestrians on campus roads
- **34-building campus map** — 4 horizontal × 5 vertical roads, 20 intersections
- **OTP delivery lock** — email-based 6-digit code to confirm pickup/delivery
- **JWT authentication** — secure login with 24-hour tokens
- **WebSocket streaming** — sub-50 ms robot state updates to the browser
- **Multi-device** — phone orders, laptop simulation viewer, works over ngrok

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  FRONTEND  (Static HTML/JS)          │
│  index.html   →  login.js       (Sign in)            │
│  dashboard.html → dashboard.js  (Place orders)       │
│  sim_viewer.html → sim_connect.js (Live map)         │
│  map.js  ·  analytics.js  ·  chatbot.js              │
└───────────────────┬─────────────────────────────────┘
                    │  REST + WebSocket
┌───────────────────▼─────────────────────────────────┐
│              BACKEND  (FastAPI / Python)              │
│  main.py           — API routes, WebSocket hub       │
│  simulation_engine.py — Robot state machine          │
│  ai_module.py      — D* Lite planner                 │
│  sensor_module.py  — LIDAR + camera feed             │
│  auth_handler.py   — JWT encode/decode               │
│  auth_routes.py    — /login, /register               │
│  email_service.py  — Gmail OTP delivery              │
└───────────────────┬─────────────────────────────────┘
                    │  motor (async driver)
┌───────────────────▼─────────────────────────────────┐
│                   MongoDB                            │
│  users  ·  deliveries  ·  robot_state               │
└─────────────────────────────────────────────────────┘
```

---

## Quick Start — Windows (Recommended)

This is the easiest way to run the full simulation on your laptop while letting phones connect over the internet.

### Prerequisites

| Tool | Purpose | Download |
|------|---------|----------|
| Python 3.10+ | Backend runtime | [python.org](https://python.org) |
| MongoDB Community | Local database | [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community) |
| ngrok | Phone → laptop tunnel | [ngrok.com/download](https://ngrok.com/download) |

### Step 1 — Clone & install dependencies

```bash
git clone https://github.com/dilip-ravichandra/del_robo_sim.git
cd del_robo_sim
pip install -r sim/requirements.txt
```

### Step 2 — Configure environment

Create the file `sim/.env` with the following content (copy and fill in your values):

```env
MONGO_URI=mongodb://localhost:27017
DB_NAME=deliverybot
JWT_SECRET=replace-with-any-long-random-string-32chars

# Optional — needed only for OTP emails
GMAIL_USER=your.gmail@gmail.com
GMAIL_APP_PASS=your-16-char-app-password
```

> **Gmail App Password** — Go to Google Account → Security → 2-Step Verification → App passwords. Generate one for "Mail".

### Step 3 — Configure ngrok

Edit `start_simulation.bat` and replace the ngrok domain with your own free static domain:

```bat
start "DeliveryBot ngrok" cmd /k "ngrok http --domain=YOUR-DOMAIN.ngrok-free.app 8001"
```

Get your free static domain at [dashboard.ngrok.com](https://dashboard.ngrok.com) → Domains.

### Step 4 — Launch

Double-click `start_simulation.bat` (or run it from a terminal). It will:

1. Start the FastAPI backend on port `8001`
2. Reset robot state to home position
3. Open an ngrok tunnel so phones can reach your laptop
4. Start a local HTTP server for the frontend on port `5500`
5. Open the simulation viewer in your browser automatically

```
[LAPTOP]  Simulation viewer  →  http://localhost:5500/sim_viewer.html
[PHONE]   Order dashboard    →  https://dilip-ravichandra.github.io/del_robo_sim/dashboard.html
```

---

## Quick Start — Docker

Run the entire stack (frontend + backend + MongoDB) with a single command.

```bash
git clone https://github.com/dilip-ravichandra/del_robo_sim.git
cd del_robo_sim
```

Create `sim/.env` (same as above), then:

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5500 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |

To stop and wipe the database:

```bash
docker compose down -v
```

---

## Testing the Simulation — Step by Step

Once the stack is running, follow this flow to see the full end-to-end delivery:

### 1. Register an account

Open the dashboard and click **Sign Up**. Use a real email address if you want to receive OTP notifications, otherwise any email works for testing.

### 2. Open the simulation viewer

On your laptop, open http://localhost:5500/sim_viewer.html. You should see:

- The 34-building campus map
- The robot (blue circle) parked at the **Home** base (right-centre)
- Moving vehicles on roads
- LIDAR rays sweeping around the robot

### 3. Place a delivery order

From the dashboard, log in and submit a new delivery:

- **Pickup location** — where the sender is (any building)
- **Delivery location** — where the package should go (any other building)
- **Sender email** — the email that will receive the pickup OTP

Hit **Place Order**. The simulation viewer should immediately show the robot planning and moving.

### 4. Watch the robot navigate

On the simulation viewer you will see:

- The **planned path** drawn in cyan
- The robot moving along the path, stopping at intersections
- LIDAR rays detecting obstacles in real-time
- The robot pausing and re-routing when a vehicle cuts across its path

### 5. Confirm pickup with OTP

When the robot arrives at the pickup building, the sender email receives a 6-digit OTP. Enter it in the dashboard to unlock the delivery box and let the robot proceed to the destination.

### 6. Delivery complete

The robot navigates to the destination building, drops off the package, and returns to the Home base automatically.

---

## API Reference

The FastAPI server exposes interactive docs at **http://localhost:8000/docs** (Docker) or **http://localhost:8001/docs** (bat launcher).

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Get JWT token |
| `GET` | `/robot/state` | Current robot position + status |
| `POST` | `/robot/reset` | Reset robot to home |
| `POST` | `/delivery/new` | Place a new delivery order |
| `POST` | `/delivery/otp/verify` | Verify pickup/delivery OTP |
| `WS` | `/ws` | WebSocket stream of robot state |

---

## Cloud Deployment (Render + GitHub Pages)

The frontend is already live on GitHub Pages. To deploy the backend to Render:

1. Fork this repository
2. Create a free Render account at [render.com](https://render.com)
3. New → Web Service → connect your fork
4. Render auto-detects `render.yaml` — just fill in the env vars in the dashboard:
   - `MONGO_URI` — get a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
   - `JWT_SECRET` — any long random string
   - `GMAIL_USER` / `GMAIL_APP_PASS` — for OTP emails

5. Update the backend URL in `sim_connect.js` and `dashboard.js` to point to your Render URL.

---

## Project Structure

```
del_robo_sim/
├── index.html            Login page
├── dashboard.html        Order dashboard (phone-friendly)
├── sim_viewer.html       Live simulation map (laptop)
├── login.js              Auth UI logic
├── dashboard.js          Order management UI
├── sim_connect.js        WebSocket client + canvas renderer
├── map.js                Campus map drawing
├── analytics.js          Delivery analytics panel
├── chatbot.js            AI chatbot widget
├── variables.css         Global design tokens + all styles
├── start_simulation.bat  One-click Windows launcher
├── docker-compose.yml    Full stack via Docker
├── render.yaml           Render.com deployment config
└── sim/
    ├── main.py               FastAPI app + WebSocket hub
    ├── simulation_engine.py  Robot state machine + D* routing
    ├── ai_module.py          D* Lite pathfinding algorithm
    ├── sensor_module.py      LIDAR + camera feed simulation
    ├── auth_handler.py       JWT encode / decode
    ├── auth_routes.py        /login, /register endpoints
    ├── email_service.py      Gmail OTP mailer
    ├── database.py           MongoDB connection (motor)
    ├── config.py             Env-var loader
    ├── constants.py          Map geometry, building list
    ├── requirements.txt      Python dependencies
    └── Dockerfile            Container image
```

---

## Troubleshooting

**Robot not moving after placing order**
- Check the backend terminal for errors
- Confirm MongoDB is running: `mongosh --eval "db.adminCommand('ping')"`
- Try `POST /robot/reset` to clear stuck state

**Phone can't reach the backend**
- Make sure ngrok is running and the domain in `start_simulation.bat` matches your ngrok dashboard
- Check the ngrok terminal window — it shows live requests

**OTP email not arriving**
- Verify `GMAIL_USER` and `GMAIL_APP_PASS` in `sim/.env`
- Check spam folder
- Confirm 2-Step Verification is enabled on the Gmail account

**`ModuleNotFoundError` when starting backend**
```bash
pip install -r sim/requirements.txt
```

**Port already in use**
```bash
# Windows — find and kill the process on port 8001
netstat -ano | findstr :8001
taskkill /PID <PID> /F
```

---

## Built With

- [FastAPI](https://fastapi.tiangolo.com) — async Python web framework
- [Motor](https://motor.readthedocs.io) — async MongoDB driver
- [python-jose](https://github.com/mpdavis/python-jose) — JWT tokens
- [D\* Lite](https://en.wikipedia.org/wiki/D*) — incremental heuristic path planner
- [ngrok](https://ngrok.com) — secure tunnels for cross-device testing

---

## License

MIT — use it, fork it, break it, learn from it.

---

*Built for RV University · Campus Robotics Project · 2025*
