/* ═══════════════════════════════════════════════
   DELIVERYBOT — In-App Chatbot Assistant
   Rule-based, no API calls. Trained on app details.
═══════════════════════════════════════════════ */

'use strict';

const DeliveryBotChat = (() => {

  // ── Knowledge base ────────────────────────────────────────────────────
  const KB = [
    {
      patterns: [/^(hi|hello|hey|howdy|yo|sup|good\s*(morning|afternoon|evening))\b/i],
      response: () => `Hey there! 👋 I'm <strong>BotAssist</strong> — your DeliveryBot helper.<br><br>
Ask me anything about dispatching deliveries, the robot's status, OTP unlock, or how the system works. Type <code>help</code> for a topic list.`,
    },

    // ── About the system ──────────────────────────────────────────────
    {
      patterns: [/what\s+is\s+(delivery\s*bot|this\s+app|this\s+system|the\s+app)/i,
                 /tell\s+me\s+about/i, /\babout\b.*\bapp\b/i, /overview/i],
      response: `<strong>DeliveryBot</strong> is an autonomous campus delivery robot simulation.<br><br>
🤖 A simulated ground robot navigates a university campus map<br>
📦 Staff dispatch deliveries through this dashboard<br>
🔒 The robot locks on arrival; the receiver gets a 6-digit OTP by email<br>
📡 All movement is streamed live via WebSocket<br>
🧠 AI module uses <strong>A* pathfinding</strong> + adaptive cost learning to avoid obstacles`,
    },

    // ── How to dispatch ───────────────────────────────────────────────
    {
      patterns: [/how\s+(do\s+i|to)\s+(dispatch|send|start|create)\s*(a\s+)?(delivery|package|robot)/i,
                 /dispatch/i, /start\s+delivery/i, /send\s+package/i, /how\s+do\s+i\s+use/i],
      response: `To dispatch a delivery:<br><br>
<strong>1.</strong> Open the <strong>Dashboard</strong> and find the Dispatch panel<br>
<strong>2.</strong> Fill in the <strong>Item Name</strong> (e.g. "Lab Samples")<br>
<strong>3.</strong> Choose a <strong>Pickup Location</strong> (default: Admin Tower)<br>
<strong>4.</strong> Choose the <strong>Destination</strong> from the dropdown<br>
<strong>5.</strong> Optionally add the <strong>Receiver's name &amp; email</strong> for OTP delivery<br>
<strong>6.</strong> Hit <strong>Dispatch Robot</strong> — the robot navigates in real time!`,
    },

    // ── Destinations / buildings ───────────────────────────────────────
    {
      patterns: [/(where|which)\s+(can|locations|destinations|places|buildings)/i,
                 /destination/i, /buildings/i, /campus\s+map/i, /deliver\s+to/i,
                 /available\s+location/i, /where\s+can\s+i\s+send/i],
      response: `Available delivery destinations on campus (34 buildings):<br><br>
🏛 <strong>Admin Tower</strong> &nbsp;|&nbsp; 🔬 <strong>Science Tower</strong><br>
⚗️ <strong>Lab C – Alpha / Beta</strong> &nbsp;|&nbsp; 📚 <strong>Library</strong><br>
💻 <strong>CS Block</strong> &nbsp;|&nbsp; 🧪 <strong>Research Lab</strong><br>
💡 <strong>Innovation Hub</strong> &nbsp;|&nbsp; 💼 <strong>Business School</strong><br>
🎓 <strong>Seminar Hall</strong> &nbsp;|&nbsp; 📖 <strong>Classroom 101</strong><br>
⚙️ <strong>Engineering</strong> &nbsp;|&nbsp; 🎭 <strong>Auditorium</strong><br>
🏥 <strong>Medical – A &amp; B</strong> &nbsp;|&nbsp; 💊 <strong>Pharmacy</strong> &nbsp;|&nbsp; 🏥 <strong>Clinic</strong><br>
🏠 <strong>Hostel A, B, C, D</strong> &nbsp;|&nbsp; 👤 <strong>Staff A &amp; B</strong><br>
🍽 <strong>Cafeteria</strong> &nbsp;|&nbsp; 🍜 <strong>Canteen</strong><br>
⚽ <strong>Sports Complex</strong> &nbsp;|&nbsp; 🏋 <strong>Gymnasium</strong><br>
🎨 <strong>Art Studio</strong> &nbsp;|&nbsp; 📐 <strong>Design Lab</strong><br>
🔧 <strong>Workshop A &amp; B</strong> &nbsp;|&nbsp; 📊 <strong>Conference Hall</strong><br>
🚪 <strong>Main Gate</strong> &nbsp;|&nbsp; 🅿 <strong>Parking</strong><br><br>
The campus has 20 road intersections and narrow 20px alleys between paired buildings — the A* path planner must route carefully!`,
    },

    // ── OTP / unlock ──────────────────────────────────────────────────
    {
      patterns: [/otp/i, /unlock/i, /collect\s+(package|delivery)/i,
                 /6.?digit/i, /code/i, /lock/i, /how\s+do\s+i\s+open/i,
                 /package\s+arrived/i, /arrived/i],
      response: `When the robot arrives at the destination:<br><br>
<strong>1.</strong> A 🔒 <strong>Lock modal</strong> pops up on the dashboard<br>
<strong>2.</strong> A <strong>6-digit OTP</strong> is generated and emailed to the receiver<br>
<strong>3.</strong> The receiver enters the OTP in the 6 digit boxes<br>
<strong>4.</strong> Hit <strong>Unlock Delivery</strong> to release the package<br>
<strong>5.</strong> The robot then automatically returns to base<br><br>
💡 In dev mode (no email set up) the OTP is shown directly on the modal.`,
    },

    // ── Emergency stop ────────────────────────────────────────────────
    {
      patterns: [/e.?stop/i, /emergency\s+stop/i, /stop\s+(the\s+)?robot/i,
                 /halt/i, /danger/i, /collision/i, /pause\s+robot/i],
      response: `⚠️ <strong>Emergency Stop</strong> immediately freezes the robot in place.<br><br>
• Click the red <strong>E-STOP</strong> button on the dashboard<br>
• The robot stops all movement and holds position<br>
• Use it if an obstacle or person is blocking the path<br>
• To resume, dispatch a new delivery or use <strong>Recall Robot</strong><br><br>
The E-Stop command is also available via API: <code>POST /robot/estop</code>`,
    },

    // ── Recall robot ──────────────────────────────────────────────────
    {
      patterns: [/recall/i, /bring.*back/i, /return.*base/i, /come.*home/i,
                 /cancel.*delivery/i, /abort/i],
      response: `<strong>Recall Robot</strong> cancels the current delivery and sends the robot back to home base (east side of campus).<br><br>
• Click the <strong>Recall</strong> button on the dashboard<br>
• The robot replans its path back to base<br>
• Available only when the robot is active (moving/delivering)<br><br>
API: <code>POST /robot/recall</code>`,
    },

    // ── Robot status / battery ────────────────────────────────────────
    {
      patterns: [/status/i, /battery/i, /where\s+is\s+the\s+robot/i,
                 /robot.*position/i, /is.*robot.*moving/i, /robot\s+state/i],
      response: `The robot has 6 states:<br><br>
⚪ <strong>Idle</strong> — at home base, awaiting dispatch<br>
🟢 <strong>Moving</strong> — en route to destination<br>
🟡 <strong>Avoiding</strong> — swerving around a dynamic obstacle<br>
🔵 <strong>Re-routing</strong> — replanning path after a blockage<br>
📦 <strong>Arrived</strong> — locked at destination, awaiting OTP<br>
🔄 <strong>Returning</strong> — heading back to base after delivery<br><br>
Battery level is shown in the Robot Status card and decreases during movement.`,
    },

    // ── A* / AI navigation ────────────────────────────────────────────
    {
      patterns: [/a\s*\*|astar|a-star/i, /path.?find/i, /navigation/i,
                 /how.*route/i, /how.*navigate/i, /ai.*module/i, /smart.*route/i],
      response: `The AI navigation module uses <strong>A* pathfinding</strong>:<br><br>
🗺 Campus is divided into a <strong>76×40 grid</strong> (10px cells)<br>
🏗 Buildings are marked impassable; roads &amp; open areas are free<br>
⚖️ An <strong>adaptive cost map</strong> adds penalties near past obstacles<br>
✂️ A <strong>line-of-sight smoother</strong> removes unnecessary waypoints<br>
🔄 If A* fails, an L-shaped road fallback is used<br><br>
The AI's confidence, route efficiency, and learning progress are shown in the AI panel on the dashboard.`,
    },

    // ── LIDAR / obstacle avoidance ────────────────────────────────────
    {
      patterns: [/lidar/i, /obstacle/i, /avoid/i, /sensor/i,
                 /camera/i, /pedestrian/i, /vehicle/i, /collision/i],
      response: `DeliveryBot has two sensor modules:<br><br>
📡 <strong>LIDAR</strong> — scans 360° for nearby objects. Shows nearest obstacle distance and count in real time.<br>
📷 <strong>Camera Feed</strong> — simulates object type detection (vehicle / pedestrian).<br><br>
Dynamic obstacles on campus:<br>
🚗 <strong>Vehicles</strong> — drive along road lanes at 2–4 units/tick<br>
🚶 <strong>Pedestrians</strong> — wander randomly at 0.6–1.5 units/tick<br><br>
When a collision is imminent the robot enters <em>Avoiding</em> state, steers clear, and penalises that area in the cost map so future routes avoid it.`,
    },

    // ── WebSocket / live feed ─────────────────────────────────────────
    {
      patterns: [/websocket/i, /live/i, /real.?time/i, /stream/i,
                 /connection/i, /python.*sim/i, /backend/i, /offline/i],
      response: `The frontend and Python backend communicate over <strong>WebSocket</strong> (<code>/ws</code>).<br><br>
🟢 <strong>Python SIM ACTIVE</strong> badge — backend connected, live state streaming<br>
⚫ Badge hidden — JS fallback simulation is running locally<br><br>
The bridge auto-reconnects every 4 seconds if disconnected. All robot state (position, battery, sensors, deliveries) is pushed at <strong>20 FPS</strong>.`,
    },

    // ── Analytics ─────────────────────────────────────────────────────
    {
      patterns: [/analytics/i, /stats/i, /history/i, /report/i,
                 /how\s+many\s+deliveries/i, /delivery\s+log/i],
      response: `The <strong>Analytics</strong> view (left sidebar → 📊) shows:<br><br>
📈 Delivery count over time<br>
✅ Completion rate<br>
⚡ Average delivery ETA<br>
🗂 Delivery history log (last 20 from MongoDB)<br><br>
Data is persisted in <strong>MongoDB</strong>. Each delivery record stores item, destination, receiver, status, and timestamps.`,
    },

    // ── Authentication ────────────────────────────────────────────────
    {
      patterns: [/login|sign\s+in|sign\s+up|register|account|password|auth/i,
                 /jwt/i, /token/i, /credentials/i],
      response: `Authentication is <strong>JWT-based</strong>:<br><br>
📝 <strong>Sign Up</strong> — create an account on the login page<br>
🔑 <strong>Sign In</strong> — get a 24-hour JWT token<br>
🛡 All dispatch, recall, and unlock actions require a valid token<br>
🍪 Token is stored in <code>sessionStorage</code> (or <code>localStorage</code>)<br><br>
API endpoints: <code>POST /auth/register</code>, <code>POST /auth/login</code>`,
    },

    // ── Tech stack ────────────────────────────────────────────────────
    {
      patterns: [/tech\s*stack/i, /built\s+with/i, /technology/i,
                 /python/i, /fastapi/i, /mongodb/i, /how.*made/i],
      response: `DeliveryBot tech stack:<br><br>
🐍 <strong>Python 3.10+</strong> — simulation engine<br>
⚡ <strong>FastAPI</strong> — REST API + WebSocket server<br>
🗄 <strong>MongoDB</strong> (Motor async) — delivery persistence<br>
🔐 <strong>JWT</strong> (python-jose) + <strong>bcrypt</strong> — auth<br>
📧 <strong>Gmail SMTP</strong> — OTP email delivery<br>
🗺 <strong>A* + NumPy</strong> — AI pathfinding<br>
🌐 <strong>Vanilla HTML/CSS/JS</strong> — frontend (no frameworks)<br>
🚀 <strong>Render.com</strong> — backend hosting`,
    },

    // ── Hosting / deployment ──────────────────────────────────────────
    {
      patterns: [/host/i, /deploy/i, /github\s*pages/i, /render/i,
                 /production/i, /live.*site/i, /url.*site/i],
      response: `Deployment setup:<br><br>
🌐 <strong>Frontend</strong> → GitHub Pages (static HTML/JS/CSS served from repo root)<br>
🐍 <strong>Backend</strong> → Render.com free tier (Python FastAPI + WebSocket)<br>
🗄 <strong>Database</strong> → MongoDB Atlas free cluster<br><br>
The frontend auto-detects the environment: on GitHub Pages it connects to the Render backend URL; locally it uses <code>localhost:8000</code>.`,
    },

    // ── ETA ───────────────────────────────────────────────────────────
    {
      patterns: [/eta/i, /how\s+long/i, /time\s+to\s+deliver/i, /minutes/i,
                 /delivery\s+time/i],
      response: `ETA is calculated by the AI module:<br><br>
• Path length in map units is computed from the A* route<br>
• <strong>1 map unit = 0.5 m</strong> in the real world<br>
• Real robot speed ≈ 1.5 m/s<br>
• ETA shown in <strong>minutes</strong> in the AI panel<br><br>
Most campus deliveries are 1–5 minutes in simulation.`,
    },

    // ── Help ──────────────────────────────────────────────────────────
    {
      patterns: [/^help$/i, /what\s+can\s+you/i, /topics/i, /commands/i,
                 /what\s+do\s+you\s+know/i],
      response: `Here's what I can help with — just ask naturally:<br><br>
📦 <strong>Dispatch</strong> — how to send a delivery<br>
📍 <strong>Destinations</strong> — available campus locations<br>
🔒 <strong>OTP Unlock</strong> — collect a package<br>
⚠️ <strong>E-Stop / Recall</strong> — robot control<br>
🤖 <strong>Robot Status</strong> — states & battery<br>
🧠 <strong>A* Pathfinding</strong> — AI navigation<br>
📡 <strong>LIDAR / Sensors</strong> — obstacle avoidance<br>
📊 <strong>Analytics</strong> — delivery history<br>
🔑 <strong>Authentication</strong> — login & JWT<br>
🚀 <strong>Deployment</strong> — hosting & GitHub Pages`,
    },
  ];

  // ── Fallback ──────────────────────────────────────────────────────────
  const FALLBACK = `I'm not sure about that one. Try asking about:<br>
<em>dispatch, destinations, OTP unlock, E-stop, recall, robot status, A* pathfinding, analytics, login, or type <strong>help</strong></em>`;

  function getResponse(text) {
    const t = text.trim();
    for (const entry of KB) {
      if (entry.patterns.some(p => p.test(t))) {
        return typeof entry.response === 'function' ? entry.response() : entry.response;
      }
    }
    return FALLBACK;
  }

  // ── UI ────────────────────────────────────────────────────────────────
  const CSS = `
  #dbc-toggle {
    position: fixed;
    bottom: 28px; right: 28px;
    width: 52px; height: 52px;
    border-radius: 50%;
    background: var(--accent, #1db954);
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(29,185,84,.45);
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
    z-index: 9999;
    transition: transform .2s, box-shadow .2s;
  }
  #dbc-toggle:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(29,185,84,.6); }

  #dbc-badge {
    position: absolute;
    top: -3px; right: -3px;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #ef4444;
    font-size: 9px; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    pointer-events: none;
    transition: opacity .2s;
  }

  #dbc-window {
    position: fixed;
    bottom: 92px; right: 28px;
    width: 340px;
    max-height: 500px;
    border-radius: 16px;
    background: rgba(13,31,13,.96);
    border: 1px solid rgba(29,185,84,.25);
    box-shadow: 0 24px 60px rgba(0,0,0,.45);
    display: flex; flex-direction: column;
    z-index: 9998;
    font-family: var(--font-body, 'DM Sans', sans-serif);
    overflow: hidden;
    transform-origin: bottom right;
    transition: opacity .18s, transform .18s;
  }
  #dbc-window.hidden { opacity: 0; transform: scale(.9) translateY(8px); pointer-events: none; }

  #dbc-header {
    display: flex; align-items: center; gap: 10px;
    padding: 13px 16px;
    background: rgba(29,185,84,.1);
    border-bottom: 1px solid rgba(29,185,84,.18);
    flex-shrink: 0;
  }
  .dbc-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--accent, #1db954);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; flex-shrink: 0;
  }
  #dbc-header-text { flex: 1; }
  #dbc-header-text strong { display: block; font-size: 13px; color: #e8f5e8; font-weight: 600; }
  #dbc-header-text span  { font-size: 11px; color: rgba(29,185,84,.8); }
  #dbc-close {
    background: none; border: none; color: rgba(255,255,255,.4);
    font-size: 18px; cursor: pointer; padding: 0 4px;
    line-height: 1; transition: color .15s;
  }
  #dbc-close:hover { color: rgba(255,255,255,.8); }

  #dbc-messages {
    flex: 1; overflow-y: auto;
    padding: 14px 14px 8px;
    display: flex; flex-direction: column; gap: 10px;
    scrollbar-width: thin;
    scrollbar-color: rgba(29,185,84,.25) transparent;
  }

  .dbc-msg { max-width: 88%; display: flex; flex-direction: column; gap: 3px; }
  .dbc-msg.bot  { align-self: flex-start; }
  .dbc-msg.user { align-self: flex-end; }

  .dbc-bubble {
    padding: 9px 13px;
    border-radius: 12px;
    font-size: 12.5px;
    line-height: 1.55;
  }
  .dbc-msg.bot  .dbc-bubble {
    background: rgba(29,185,84,.1);
    border: 1px solid rgba(29,185,84,.2);
    color: #d4edd4;
    border-bottom-left-radius: 4px;
  }
  .dbc-msg.user .dbc-bubble {
    background: rgba(29,185,84,.22);
    border: 1px solid rgba(29,185,84,.35);
    color: #e8f8e8;
    border-bottom-right-radius: 4px;
  }
  .dbc-bubble code {
    background: rgba(255,255,255,.1); border-radius: 4px;
    padding: 1px 5px; font-size: 11px;
    font-family: var(--font-mono, monospace);
    color: #7be37b;
  }
  .dbc-bubble strong { color: #a8e6a8; }

  .dbc-typing {
    display: flex; gap: 4px; align-items: center;
    padding: 10px 13px;
    background: rgba(29,185,84,.1);
    border: 1px solid rgba(29,185,84,.2);
    border-radius: 12px; border-bottom-left-radius: 4px;
    width: 48px;
  }
  .dbc-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(29,185,84,.6);
    animation: dbc-bounce .9s infinite;
  }
  .dbc-dot:nth-child(2) { animation-delay: .15s; }
  .dbc-dot:nth-child(3) { animation-delay: .3s; }
  @keyframes dbc-bounce {
    0%,80%,100% { transform: translateY(0); }
    40%         { transform: translateY(-5px); }
  }

  #dbc-input-row {
    display: flex; gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid rgba(29,185,84,.15);
    flex-shrink: 0;
  }
  #dbc-input {
    flex: 1; background: rgba(255,255,255,.06);
    border: 1px solid rgba(29,185,84,.25);
    border-radius: 8px;
    color: #e0f2e0; font-family: var(--font-body, sans-serif);
    font-size: 12.5px;
    padding: 8px 11px;
    outline: none; resize: none; height: 36px;
    transition: border-color .2s;
  }
  #dbc-input::placeholder { color: rgba(255,255,255,.3); }
  #dbc-input:focus { border-color: rgba(29,185,84,.55); }
  #dbc-send {
    width: 36px; height: 36px;
    background: var(--accent, #1db954);
    border: none; border-radius: 8px;
    cursor: pointer; font-size: 14px;
    color: #fff; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background .2s;
  }
  #dbc-send:hover { background: var(--accent-hover, #17a349); }

  #dbc-suggestions {
    display: flex; flex-wrap: wrap; gap: 5px;
    padding: 0 12px 8px;
  }
  .dbc-chip {
    font-size: 10.5px; padding: 4px 9px;
    background: rgba(29,185,84,.08);
    border: 1px solid rgba(29,185,84,.2);
    border-radius: 999px; color: rgba(29,185,84,.85);
    cursor: pointer; transition: background .15s, color .15s;
    white-space: nowrap;
  }
  .dbc-chip:hover { background: rgba(29,185,84,.18); color: #a8e6a8; }
  `;

  const QUICK_CHIPS = ['Dispatch', 'Destinations', 'OTP Unlock', 'E-Stop', 'A* Path', 'Help'];

  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildUI() {
    // Toggle button
    const toggle = document.createElement('button');
    toggle.id = 'dbc-toggle';
    toggle.title = 'Ask BotAssist';
    toggle.innerHTML = `🤖<div id="dbc-badge" style="display:none">1</div>`;
    document.body.appendChild(toggle);

    // Chat window
    const win = document.createElement('div');
    win.id = 'dbc-window';
    win.className = 'hidden';
    win.innerHTML = `
      <div id="dbc-header">
        <div class="dbc-avatar">🤖</div>
        <div id="dbc-header-text">
          <strong>BotAssist</strong>
          <span>DeliveryBot Helper · Always online</span>
        </div>
        <button id="dbc-close" title="Close">✕</button>
      </div>
      <div id="dbc-messages"></div>
      <div id="dbc-suggestions"></div>
      <div id="dbc-input-row">
        <input id="dbc-input" type="text" placeholder="Ask me anything…" maxlength="200" autocomplete="off">
        <button id="dbc-send">➤</button>
      </div>
    `;
    document.body.appendChild(win);

    // Quick chips
    const chipRow = win.querySelector('#dbc-suggestions');
    QUICK_CHIPS.forEach(label => {
      const c = document.createElement('button');
      c.className = 'dbc-chip';
      c.textContent = label;
      c.addEventListener('click', () => handleSend(label));
      chipRow.appendChild(c);
    });

    // Events
    toggle.addEventListener('click', () => toggleWindow(win, toggle));
    win.querySelector('#dbc-close').addEventListener('click', () => closeWindow(win, toggle));
    win.querySelector('#dbc-send').addEventListener('click', () => sendInput(win));
    win.querySelector('#dbc-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInput(win); }
    });

    // Greeting on first open
    setTimeout(() => addMessage(win, 'bot',
      `Hi! I'm <strong>BotAssist</strong> 👋<br>Ask me how to dispatch a delivery, about the robot, OTP unlock, or anything else. Type <code>help</code> for topics.`
    ), 300);
  }

  let open = false;

  function toggleWindow(win, toggle) {
    open ? closeWindow(win, toggle) : openWindow(win, toggle);
  }

  function openWindow(win, toggle) {
    open = true;
    win.classList.remove('hidden');
    const badge = document.getElementById('dbc-badge');
    if (badge) badge.style.display = 'none';
    setTimeout(() => win.querySelector('#dbc-input')?.focus(), 150);
  }

  function closeWindow(win, toggle) {
    open = false;
    win.classList.add('hidden');
  }

  function addMessage(win, type, html) {
    const msgs = win.querySelector('#dbc-messages');
    const wrap = document.createElement('div');
    wrap.className = `dbc-msg ${type}`;
    const bubble = document.createElement('div');
    bubble.className = 'dbc-bubble';
    bubble.innerHTML = html;
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap;
  }

  function showTyping(win) {
    const msgs = win.querySelector('#dbc-messages');
    const wrap = document.createElement('div');
    wrap.className = 'dbc-msg bot';
    wrap.id = 'dbc-typing-indicator';
    wrap.innerHTML = `<div class="dbc-typing">
      <div class="dbc-dot"></div><div class="dbc-dot"></div><div class="dbc-dot"></div>
    </div>`;
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping(win) {
    win.querySelector('#dbc-typing-indicator')?.remove();
  }

  function handleSend(text) {
    const win = document.getElementById('dbc-window');
    if (!win || !text.trim()) return;

    addMessage(win, 'user', escapeHTML(text));

    // Pulse the toggle badge if window is closed
    if (!open) {
      const badge = document.getElementById('dbc-badge');
      if (badge) badge.style.display = 'flex';
    }

    showTyping(win);
    setTimeout(() => {
      hideTyping(win);
      addMessage(win, 'bot', getResponse(text));
    }, 520 + Math.random() * 300);
  }

  function sendInput(win) {
    const input = win.querySelector('#dbc-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handleSend(text);
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    buildUI();
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    init();

})();
