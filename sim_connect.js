/* ═══════════════════════════════════════════════
   DELIVERYBOT — Simulation Bridge
   Connects dashboard.html to Python FastAPI backend.

   HOW IT WORKS:
   • If Python is running → live data overrides JS simulation
   • If Python is offline → dashboard falls back silently to built-in JS sim
   • No changes needed to dashboard.js or map.js

   USAGE: add ONE line to dashboard.html before </body>:
     <script src="sim_connect.js"></script>

   The bridge will auto-detect the backend and take over.
═══════════════════════════════════════════════ */

'use strict';

const SimBridge = (() => {
  // Auto-detect environment: use Render backend when not on localhost
  const IS_LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  const BACKEND_HOST = IS_LOCAL
    ? 'localhost:8000'
    : (window.DELIVERYBOT_BACKEND || 'del-robo-sim-2.onrender.com');
  const WS_URL  = `ws${IS_LOCAL ? '' : 's'}://${BACKEND_HOST}/ws`;
  const API_URL = `http${IS_LOCAL ? '' : 's'}://${BACKEND_HOST}`;
  let   ws      = null;
  let   active  = false;
  let   reconnT = null;

  // ── Connect ─────────────────────────────────────────────────────────
  function init() {
    tryConnect();
    patchDispatch();
    wireLockModal();
  }

  function tryConnect() {
    try { ws = new WebSocket(WS_URL); }
    catch { return; }

    ws.onopen = () => {
      if (!active) {
        active = true;
        showBridgeBadge();
        console.info('[SimBridge] Connected to Python simulation');
        pauseJSSim();
      }
    };

    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if      (msg.type === 'state')               applyState(msg);
        else if (msg.type === 'pickup_lock')          showPickupModal(msg);
        else if (msg.type === 'pickup_unlocked')      handlePickupUnlocked(msg.message);
        else if (msg.type === 'pickup_unlock_error')  showPickupError(msg.message);
        else if (msg.type === 'delivery_lock')        showLockModal(msg);
        else if (msg.type === 'delivery_unlocked')    handleDeliveryUnlocked(msg.message);
        else if (msg.type === 'unlock_error')         handleDeliveryFailed(msg.message);
      } catch {}
    };

    ws.onclose = () => {
      if (active) {
        active = false;
        hideBridgeBadge();
        resumeJSSim();
        console.info('[SimBridge] Disconnected — fallback to JS simulation');
      }
      clearTimeout(reconnT);
      reconnT = setTimeout(tryConnect, 4000);
    };

    ws.onerror = () => ws.close();
  }

  // ── Apply Python state to dashboard ──────────────────────────────────
  function applyState(s) {
    if (!s || !s.robot) return;
    const r = s.robot;

    if (window.MapEngine && window.MapEngine.robotState) {
      const rs = window.MapEngine.robotState;
      rs.x = r.x; rs.y = r.y; rs.angle = r.angle;
      rs.status = r.status === 'idle'     ? 'idle'
                : r.status === 'arriving' ? 'arrived'
                : r.status === 'returning'? 'returning'
                : 'moving';
    }

    const statusMap = {
      idle:      ['badge-idle',       'Idle'],
      moving:    ['badge-moving',     'Moving'],
      avoiding:  ['badge-returning',  'Avoiding'],
      rerouting: ['badge-delivering', 'Re-routing'],
      arrived:   ['badge-delivering', 'Arrived'],
      returning: ['badge-returning',  'Returning'],
    };
    const [cls, label] = statusMap[r.status] || ['badge-idle', 'Idle'];
    const badge = document.getElementById('robot-badge');
    if (badge) { badge.className = `badge ${cls}`; badge.textContent = label; }

    const taskLabel = document.getElementById('robot-task-label');
    if (taskLabel) {
      const lblMap = {
        idle:'STANDING BY', moving:'EN ROUTE', avoiding:'AVOIDING',
        rerouting:'REPLANNING', arrived:'DELIVERED', returning:'RETURNING',
      };
      taskLabel.textContent = lblMap[r.status] || 'STANDING BY';
    }

    const taskText = document.getElementById('task-text');
    if (taskText) taskText.textContent = r.task || 'Awaiting dispatch';

    // Battery
    const pct  = Math.round(r.battery);
    const fill  = document.getElementById('battery-fill');
    const bpct  = document.getElementById('battery-pct');
    if (fill) fill.style.width = pct + '%';
    if (bpct) bpct.textContent = pct + '%';

    // Map status badge
    const mbadge = document.getElementById('map-status-badge');
    if (mbadge) {
      if (['moving','avoiding','rerouting','returning'].includes(r.status)) {
        mbadge.style.display = 'inline-flex';
        mbadge.textContent = label;
        mbadge.className = `badge ${cls}`;
      } else {
        mbadge.style.display = 'none';
      }
    }

    // AI panel
    if (s.ai) {
      const ai = s.ai;
      setEl('ai-eta',   r.eta > 0 ? r.eta + ' min' : '— min');
      setEl('ai-conf',  ai.confidence + '%');
      setEl('ai-eff',   ai.route_efficiency + '%');
      setEl('ai-status-text', ai.confidence > 70 ? 'Route Stable' : 'Model Improving');
      const pb = document.getElementById('ai-progress-fill');
      const pp = document.getElementById('ai-progress-pct');
      if (pb) pb.style.width = ai.learning_progress + '%';
      if (pp) pp.textContent = ai.learning_progress + '%';

      const routeEl = document.getElementById('ai-routes');
      if (routeEl && ai.routes && ai.routes.length) {
        routeEl.innerHTML = ai.routes.map(r =>
          `<div class="ai-route-item">
             <span>${r.label || '—'}</span>
             <span class="ai-route-score">${r.score || 0}%</span>
           </div>`
        ).join('');
      }
    }

    // LIDAR panel
    if (s.lidar) {
      setEl('lidar-range', s.lidar.nearest);
      setEl('obstacle-count', s.lidar.obstacle_count);
      const lp = document.getElementById('lidar-progress');
      if (lp) {
        const pct = Math.min(100, (s.lidar.obstacle_count / 8) * 100);
        lp.style.width = pct + '%';
      }
    }

    // Deliveries list
    if (s.deliveries) {
      window.renderDeliveriesList && window.renderDeliveriesList(s.deliveries);
    }

    // Button states
    const busy = r.status !== 'idle';
    const bDisp   = document.getElementById('btn-dispatch');
    const bRecall = document.getElementById('btn-recall');
    const bEstop  = document.getElementById('btn-estop');
    if (bDisp)   bDisp.disabled   = busy || s.lock?.active;
    if (bRecall) bRecall.disabled = !busy;
    if (bEstop)  bEstop.disabled  = !busy;
  }

  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Event Feed ────────────────────────────────────────────────────────
  function addEvent(icon, text, color) {
    const feed  = document.getElementById('event-feed');
    const inner = document.getElementById('event-feed-inner');
    if (!feed || !inner) return;

    feed.style.display = 'block';
    const item = document.createElement('div');
    item.style.cssText = `
      display:flex;align-items:center;gap:10px;
      background:rgba(13,31,13,0.92);
      border:1px solid ${color || 'rgba(29,185,84,0.3)'};
      border-radius:8px;padding:9px 14px;
      font-family:var(--font-mono,monospace);font-size:12px;
      color:#e0f0e0;pointer-events:auto;
      box-shadow:0 4px 16px rgba(0,0,0,0.3);
      animation:slideInEvent .25s ease;
    `;
    item.innerHTML = `<span style="font-size:16px">${icon}</span>
      <span style="flex:1">${text}</span>
      <span style="font-size:10px;color:#4a784a">${new Date().toLocaleTimeString()}</span>
      <button onclick="this.parentNode.remove()" style="background:none;border:none;color:#4a784a;cursor:pointer;font-size:14px;padding:0 0 0 6px">✕</button>`;
    inner.prepend(item);
    // Keep max 4 visible
    while (inner.children.length > 4) inner.lastChild.remove();
    // Auto-dismiss after 12 s
    setTimeout(() => item.remove(), 12000);
  }

  // Inject the slide-in keyframe once
  (function injectEventCSS() {
    if (document.getElementById('_event-feed-css')) return;
    const s = document.createElement('style');
    s.id = '_event-feed-css';
    s.textContent = `@keyframes slideInEvent{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(s);
  })();

  // ── Pickup Lock Modal ─────────────────────────────────────────────────
  function showPickupModal(msg) {
    const overlay = document.getElementById('pickup-overlay');
    if (!overlay) return;

    const lbl = document.getElementById('pickup-item-label');
    if (lbl) lbl.textContent = `${msg.item || 'Package'} — pickup at ${msg.pickup || 'location'}`;

    const hint = document.getElementById('pickup-otp-hint');
    if (hint) {
      hint.innerHTML = msg.dev_otp
        ? `DEV MODE — Load Code: <strong style="color:#3b82f6">${msg.dev_otp}</strong>`
        : (msg.otp_hint || '');
    }

    overlay.style.display = 'flex';
    wireDigits('.pickup-digit', submitPickupOTP);
    setTimeout(() => document.querySelector('.pickup-digit')?.focus(), 100);

    window.toast?.('🤖 Robot at Pickup!', 'Enter code to load the package.', 'info');
    addEvent('🤖', `Robot arrived at <strong>${msg.pickup || 'pickup'}</strong> with <strong>${msg.item || 'package'}</strong>. Enter load code.`, 'rgba(59,130,246,0.4)');
  }

  function handlePickupUnlocked(message) {
    const overlay = document.getElementById('pickup-overlay');
    if (overlay) {
      const icon = document.getElementById('pickup-icon');
      if (icon) { icon.textContent = '📦✅'; icon.style.filter = 'drop-shadow(0 0 12px #3b82f6)'; }
      setTimeout(() => {
        overlay.style.display = 'none';
        if (icon) { icon.textContent = '🤖'; icon.style.filter = ''; }
      }, 1400);
    }
    const msg = message || 'Package loaded — robot en route to destination.';
    window.toast?.('✅ Package Loaded!', msg, 'success');
    addEvent('🔒', `<strong>Compartment locked</strong> — ${msg}`, 'rgba(29,185,84,0.35)');
  }

  function showPickupError(message) {
    const el = document.getElementById('pickup-error');
    if (el) el.textContent = message || 'Incorrect code. Try again.';
    const digits = document.querySelectorAll('.pickup-digit');
    digits.forEach(d => { d.value = ''; d.style.borderColor = 'rgba(239,68,68,0.8)'; });
    setTimeout(() => digits.forEach(d => d.style.borderColor = ''), 700);
    digits[0]?.focus();
    window.toast?.('❌ Wrong Code', message || 'Incorrect pickup code.', 'error');
    addEvent('❌', `<strong>Pickup failed</strong> — ${message || 'Incorrect code.'}`, 'rgba(239,68,68,0.4)');
  }

  // ── Delivery Lock Modal ───────────────────────────────────────────────
  function showLockModal(msg) {
    const overlay = document.getElementById('lock-overlay');
    if (!overlay) return;

    const itemLabel = document.getElementById('lock-item-label');
    if (itemLabel) itemLabel.textContent = `${msg.item || 'Package'} arrived at ${msg.dest || 'destination'}`;

    const hint = document.getElementById('lock-otp-hint');
    if (hint) {
      hint.innerHTML = msg.dev_otp
        ? `DEV MODE — Unlock Code: <strong style="color:#ef4444">${msg.dev_otp}</strong>`
        : (msg.otp_hint || '');
    }

    overlay.style.display = 'flex';
    wireDigits('.lock-digit', submitUnlockOTP);
    setTimeout(() => document.querySelector('.lock-digit')?.focus(), 100);

    window.toast?.('📦 Package Arrived!', 'Enter the unlock code to collect.', 'warning');
    addEvent('📦', `Package <strong>${msg.item || ''}</strong> arrived at <strong>${msg.dest || 'destination'}</strong>. Receiver: enter code to collect.`, 'rgba(239,68,68,0.35)');
  }

  function handleDeliveryUnlocked(message) {
    const overlay = document.getElementById('lock-overlay');
    if (overlay) {
      const icon = document.getElementById('lock-icon');
      if (icon) { icon.textContent = '🔓'; icon.style.filter = 'drop-shadow(0 0 12px #1db954)'; }
      setTimeout(() => {
        overlay.style.display = 'none';
        if (icon) { icon.textContent = '🔒'; icon.style.filter = ''; }
      }, 1200);
    }
    const msg = message || 'Package collected — robot returning to base.';
    window.toast?.('✅ Package Collected!', msg, 'success');
    addEvent('✅', `<strong>Package collected successfully.</strong> ${msg}`, 'rgba(29,185,84,0.45)');
  }

  function handleDeliveryFailed(message) {
    const msg = message || 'Incorrect unlock code — package not collected.';
    showLockError(msg);
    window.toast?.('❌ OTP Failed', msg, 'error');
    addEvent('❌', `<strong>OTP failed</strong> — ${msg}`, 'rgba(239,68,68,0.4)');
  }

  function showLockError(message) {
    const el = document.getElementById('lock-error');
    if (el) el.textContent = message || 'Incorrect code. Try again.';
    const digits = document.querySelectorAll('.lock-digit');
    digits.forEach(d => { d.value = ''; d.style.borderColor = 'rgba(239,68,68,0.8)'; });
    setTimeout(() => digits.forEach(d => d.style.borderColor = ''), 600);
    digits[0]?.focus();
  }

  // ── Shared OTP digit wiring ───────────────────────────────────────────
  function wireDigits(selector, submitFn) {
    const digits = document.querySelectorAll(selector);
    digits.forEach(el => {
      const fresh = el.cloneNode(true);
      el.parentNode.replaceChild(fresh, el);
    });
    const fresh = document.querySelectorAll(selector);
    fresh.forEach((el, i) => {
      el.value = '';
      el.addEventListener('input', e => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val;
        if (val && i < fresh.length - 1) fresh[i + 1].focus();
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !el.value && i > 0) fresh[i - 1].focus();
        if (e.key === 'Enter') submitFn();
      });
      el.addEventListener('paste', e => {
        const data = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        if (data.length >= 6) {
          fresh.forEach((d, j) => { d.value = data[j] || ''; });
          e.preventDefault();
          setTimeout(submitFn, 200);
        }
      });
    });
  }

  function wireLockModal() { /* boot shim — kept for backwards compat */ }

  // ── Global OTP submit functions ───────────────────────────────────────

  window.submitPickupOTP = async function () {
    const digits  = document.querySelectorAll('.pickup-digit');
    const entered = Array.from(digits).map(d => d.value).join('');
    const errEl   = document.getElementById('pickup-error');
    if (errEl) errEl.textContent = '';

    if (entered.length < 6) {
      if (errEl) errEl.textContent = 'Enter all 6 digits.';
      return;
    }

    if (active) {
      try {
        const token = getToken();
        const res   = await fetch(`${API_URL}/delivery/pickup-unlock`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({ otp: entered }),
        });
        const data = await res.json();
        if (!res.ok) {
          showPickupError(data.detail || 'Incorrect code');
        } else {
          handlePickupUnlocked(data.message);
        }
      } catch (err) {
        showPickupError(err.message);
      }
    } else {
      ws?.send(JSON.stringify({ cmd: 'pickup_unlock', otp: entered }));
    }
  };

  window.submitUnlockOTP = async function () {
    const digits  = document.querySelectorAll('.lock-digit');
    const entered = Array.from(digits).map(d => d.value).join('');
    const errEl   = document.getElementById('lock-error');
    if (errEl) errEl.textContent = '';

    if (entered.length < 6) {
      if (errEl) errEl.textContent = 'Enter all 6 digits.';
      return;
    }

    if (active) {
      try {
        const token = getToken();
        const res   = await fetch(`${API_URL}/delivery/unlock`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({ otp: entered }),
        });
        const data = await res.json();
        if (!res.ok) {
          handleDeliveryFailed(data.detail || 'Invalid code');
        } else {
          handleDeliveryUnlocked(data.message);
        }
      } catch (err) {
        handleDeliveryFailed(err.message);
      }
    } else {
      ws?.send(JSON.stringify({ cmd: 'unlock', otp: entered }));
    }
  };

  // ── Patch dispatch so Start Delivery POSTs to Python ─────────────────
  function patchDispatch() {
    // Save original JS-sim function for fallback
    window._origStartDelivery = window.startDelivery;

    window.startDelivery = async function () {
      if (!active) {
        window._origStartDelivery?.();
        return;
      }

      const item          = document.getElementById('item-name')?.value.trim();
      const pickup        = document.getElementById('pickup-room')?.value;
      const dest          = document.getElementById('dest-room')?.value;
      const receiver      = document.getElementById('receiver-name')?.value.trim();
      const receiverEmail = document.getElementById('receiver-email')?.value.trim();

      if (!item || !pickup || !dest) {
        window.toast?.('Missing Info', 'Fill in item, pickup, and destination.', 'warning');
        return;
      }

      const token = getToken();
      if (!token) {
        window.toast?.('Not Authenticated', 'Please sign in to dispatch the robot.', 'error');
        setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/delivery/start`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            destination:    dest,
            item,
            pickup,
            receiver,
            receiver_email: receiverEmail,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Dispatch failed');

        window.toast?.('Robot Dispatched', `${item} to ${dest} (ETA ${data.eta} min)`, 'success');
        ['item-name', 'receiver-name', 'receiver-email'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        ['pickup-room', 'dest-room'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
      } catch (err) {
        window.toast?.('Dispatch Error', err.message, 'error');
      }
    };

    window.recallRobot = async function () {
      if (!active) return;
      await authFetch(`${API_URL}/robot/recall`, 'POST');
    };

    window.emergencyStop = async function () {
      if (!active) return;
      await authFetch(`${API_URL}/robot/estop`, 'POST');
    };
  }

  async function authFetch(url, method, body) {
    const token = getToken();
    return fetch(url, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  function getToken() {
    const raw = sessionStorage.getItem('dbUser') || localStorage.getItem('dbUser');
    if (!raw) return null;
    try { return JSON.parse(raw).token || null; } catch { return null; }
  }

  // ── Pause / resume built-in JS simulation ─────────────────────────
  function pauseJSSim() {
    if (window.MapEngine && window.MapEngine.robotState)
      window.MapEngine.robotState._paused = true;
  }
  function resumeJSSim() {
    if (window.MapEngine && window.MapEngine.robotState)
      window.MapEngine.robotState._paused = false;
  }

  // ── UI badge showing Python is active ────────────────────────────
  function showBridgeBadge() {
    let b = document.getElementById('sim-bridge-badge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'sim-bridge-badge';
      Object.assign(b.style, {
        position: 'fixed', bottom: '24px', left: '260px',
        zIndex: '9998',
        background: 'rgba(29,185,84,0.12)',
        border: '1px solid rgba(29,185,84,0.3)',
        borderRadius: '999px',
        padding: '5px 12px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '11px',
        fontWeight: '600',
        color: '#1db954',
        pointerEvents: 'none',
        transition: 'opacity .3s',
      });
      b.textContent = '⬡ PYTHON SIM ACTIVE';
      document.body.appendChild(b);
    }
    b.style.opacity = '1';
  }
  function hideBridgeBadge() {
    const b = document.getElementById('sim-bridge-badge');
    if (b) b.style.opacity = '0';
  }

  // ── Boot when DOM ready ────────────────────────────────────────────
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    setTimeout(init, 200);

  return { isActive: () => active };
})();

window.SimBridge = SimBridge;
