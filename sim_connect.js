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
  const BACKEND_HOST = window.DELIVERYBOT_BACKEND
    || (IS_LOCAL ? 'localhost:8001' : 'replace-detest-recycling.ngrok-free.dev');
  const WS_URL  = `ws${IS_LOCAL ? '' : 's'}://${BACKEND_HOST}/ws`;
  const API_URL = `http${IS_LOCAL ? '' : 's'}://${BACKEND_HOST}`;
  let   ws      = null;
  let   active  = false;
  let   reconnT = null;
  let   pollT   = null;
  let   pollFail = 0;

  // ── Connect ─────────────────────────────────────────────────────────
  function init() {
    tryConnect();
    startPolling();
    patchDispatch();
    wireLockModal();
  }

  function activateBridge() {
    if (active) return;
    active = true;
    showBridgeBadge();
    pauseJSSim();
    console.info('[SimBridge] Python simulation active');
  }

  function deactivateBridge() {
    if (!active) return;
    active = false;
    hideBridgeBadge();
    // Keep JS sim paused to maintain sync with viewer (don't resume fallback sim)
    console.warn('[SimBridge] Backend offline — both dashboard and viewer show frozen state');
  }

  function tryConnect() {
    try { ws = new WebSocket(WS_URL); }
    catch { return; }

    ws.onopen = () => {
      activateBridge();
      pollFail = 0;
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
      deactivateBridge();
      clearTimeout(reconnT);
      reconnT = setTimeout(tryConnect, 4000);
    };

    ws.onerror = () => ws.close();
  }

  function startPolling() {
    if (pollT) return;
    const tick = async () => {
      try {
        const res = await fetch(`${API_URL}/robot/full`, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const s = await res.json();
        pollFail = 0;
        activateBridge();
        applyState(s);
      } catch {
        pollFail++;
        const wsDown = !ws || ws.readyState !== 1;
        if (wsDown && pollFail >= 3) deactivateBridge();
      }
    };
    tick();
    pollT = setInterval(tick, 1500);
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

    if (window.setRobotStatus) {
      window.setRobotStatus(r.status === 'idle'
        ? 'idle'
        : r.status === 'returning'
          ? 'returning'
          : r.status === 'arrived'
            ? 'delivering'
            : 'moving');
    }

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
    window.updateBatteryUI?.(pct);

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

    if (s.analysis && window.MapEngine?.applyAnalysis) {
      window.MapEngine.applyAnalysis(s.analysis);
    }

    // Sync pickup/dest markers from Python state
    if (window.MapEngine?.setPickupMarker) {
      window.MapEngine.setPickupMarker(s.pickup ? {cx: s.pickup.x, cy: s.pickup.y} : null);
      window.MapEngine.setDestMarker(s.dest ? {cx: s.dest.x, cy: s.dest.y} : null);
    }

    // Sync trail from Python coordinates (fade older points)
    if (s.trail?.length && window.MapEngine?.robotState) {
      window.MapEngine.robotState.trail = s.trail.map((t, i, arr) => ({
        x: t.x, y: t.y, life: (i + 1) / arr.length,
      }));
    }

    // LIDAR panel
    if (s.lidar) {
      setEl('lidar-range', s.lidar.nearest != null ? Math.round(s.lidar.nearest) : '--');
      setEl('obstacle-count', s.lidar.obstacle_count || 0);
      const lp = document.getElementById('lidar-progress');
      if (lp) {
        const pct = Math.min(100, (s.lidar.obstacle_count / 8) * 100);
        lp.style.width = pct + '%';
        lp.className = 'progress-fill ' + (pct > 75 ? 'red' : pct > 40 ? 'orange' : 'green');
      }
      if (s.lidar.points && s.robot) _lidarState = { rx: s.robot.x, ry: s.robot.y, lidar: s.lidar };
    }

    // Deliveries list
    if (s.deliveries) {
      window.renderDeliveriesList && window.renderDeliveriesList(s.deliveries);
      window.updateDeliveryBadge?.();
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
    showCompartmentCountdown('pickup', 300);
  }

  function handlePickupUnlocked(message) {
    clearCompartmentCountdown();
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
    showCompartmentCountdown('delivery', 300);
  }

  function handleDeliveryUnlocked(message) {
    clearCompartmentCountdown();
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

  // ── Compartment countdown banner ─────────────────────────────────────
  (function injectCountdownCSS() {
    if (document.getElementById('_cdcss')) return;
    const s = document.createElement('style');
    s.id = '_cdcss';
    s.textContent = `
      @keyframes _cdIn{from{opacity:0;transform:translateX(-50%) translateY(24px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      @keyframes _cdOut{from{opacity:1;transform:translateX(-50%) translateY(0)}to{opacity:0;transform:translateX(-50%) translateY(16px)}}
      #_cd-banner{animation:_cdIn .4s cubic-bezier(.16,1,.3,1) forwards}
      #_cd-banner.removing{animation:_cdOut .3s ease forwards}
      #_cd-banner ._cd-bar-inner{transition:width 1s linear}
    `;
    document.head.appendChild(s);
  })();

  let _cdTimerId = null;

  function showCompartmentCountdown(type, totalSec = 300) {
    clearCompartmentCountdown();
    const isPickup  = type === 'pickup';
    const color     = isPickup ? '#3b82f6' : '#10b981';
    const borderCol = isPickup ? 'rgba(59,130,246,0.4)' : 'rgba(16,185,129,0.4)';
    const glowCol   = isPickup ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)';
    const icon      = isPickup ? '📦' : '🔓';
    const action    = isPickup ? 'PLEASE LOAD THE PACKAGE' : 'PLEASE COLLECT YOUR PACKAGE';

    const banner = document.createElement('div');
    banner.id = '_cd-banner';
    banner.style.cssText = `
      position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
      z-index:10001;
      background:rgba(4,9,10,0.97);
      border:1px solid ${borderCol};
      border-radius:18px;
      padding:16px 24px 14px;
      display:flex;align-items:center;gap:16px;
      box-shadow:0 12px 48px rgba(0,0,0,0.55),0 0 40px ${glowCol};
      font-family:JetBrains Mono,monospace;
      min-width:400px;max-width:92vw;
    `;
    banner.innerHTML = `
      <div style="font-size:34px;filter:drop-shadow(0 0 10px ${color});flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#fff;letter-spacing:.4px;margin-bottom:2px">
          Compartment is <span style="color:${color}">OPEN</span>
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,0.5);letter-spacing:2px;margin-bottom:10px">
          ${action}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;height:4px;background:rgba(255,255,255,0.07);border-radius:99px;overflow:hidden">
            <div id="_cd-bar" class="_cd-bar-inner" style="height:100%;background:${color};border-radius:99px;width:100%"></div>
          </div>
          <div style="font-size:15px;font-weight:700;color:${color};min-width:46px;text-align:right;letter-spacing:.5px" id="_cd-txt">5:00</div>
        </div>
        <div style="font-size:9px;color:rgba(255,255,255,0.25);letter-spacing:1.5px;margin-top:5px">
          AUTO-CLOSES AFTER TIMER — ACT NOW
        </div>
      </div>
      <button id="_cd-close"
        style="background:none;border:none;color:rgba(255,255,255,0.25);cursor:pointer;font-size:18px;padding:4px 2px;line-height:1;flex-shrink:0;transition:color .2s"
        onmouseover="this.style.color='rgba(255,255,255,0.7)'"
        onmouseout="this.style.color='rgba(255,255,255,0.25)'">✕</button>
    `;
    document.body.appendChild(banner);
    document.getElementById('_cd-close').onclick = clearCompartmentCountdown;

    let remaining = totalSec;
    const bar = () => document.getElementById('_cd-bar');
    const txt = () => document.getElementById('_cd-txt');

    _cdTimerId = setInterval(() => {
      remaining--;
      const pct = (remaining / totalSec) * 100;
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      const b = bar(), t = txt();
      if (b) b.style.width = pct + '%';
      if (t) {
        t.textContent = `${min}:${String(sec).padStart(2, '0')}`;
        if (remaining <= 60) {
          t.style.color = '#ef4444';
          if (b) b.style.background = '#ef4444';
        }
      }
      if (remaining <= 0) clearCompartmentCountdown();
    }, 1000);
  }

  function clearCompartmentCountdown() {
    clearInterval(_cdTimerId);
    _cdTimerId = null;
    const b = document.getElementById('_cd-banner');
    if (!b) return;
    b.classList.add('removing');
    setTimeout(() => b.remove(), 320);
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
    window._origResetRobot = window.resetRobot;

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

      let token = getToken();
      if (!token) {
        // For development: auto-create a test token if user hasn't logged in
        token = 'dev-test-token-' + Date.now();
        const testUser = { 
          token, 
          email: 'dispatcher@test.edu', 
          name: 'Test Dispatcher',
          role: 'admin',
          sub: 'dispatcher@test.edu'
        };
        sessionStorage.setItem('dbUser', JSON.stringify(testUser));
        console.info('[SimBridge] Created dev test token for dispatch');
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

    window.resetRobot = async function () {
      if (!active) {
        window._origResetRobot?.();
        return;
      }

      try {
        await fetch(`${API_URL}/robot/reset`, { method: 'POST' });
        window.toast?.('Robot Reset', 'Robot returned to base and is ready for a new delivery.', 'success');
      } catch (err) {
        window.toast?.('Reset Failed', err.message, 'error');
      }
    };
  }

  async function authFetch(url, method, body) {
    const token = getToken();
    return fetch(url, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        'ngrok-skip-browser-warning': 'true',
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
    // Keep JS sim paused even on deactivate to maintain sync with viewer
    // Both pages should show the same state or both show offline
    if (window.MapEngine && window.MapEngine.robotState) {
      // Commented out to prevent desync with simulation viewer
      // window.MapEngine.robotState._paused = false;
      console.info('[SimBridge] Keeping JS sim frozen to stay in sync with viewer');
    }
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

  // ── Dashboard polar LIDAR canvas ──────────────────────────────────────
  function drawDashboardLidar(rx, ry, lidar) {
    const canvas = document.getElementById('lidar-canvas');
    if (!canvas) return;
    const dc   = canvas.getContext('2d');
    const W    = canvas.width  || 200;
    const H    = canvas.height || 200;
    const cx   = W / 2, cy = H / 2;
    const RANGE = 90;
    const scale = Math.min(W, H) / 2 / RANGE * 0.84;
    dc.clearRect(0, 0, W, H);

    // Background radial gradient
    const bg = dc.createRadialGradient(cx, cy, 0, cx, cy, W / 2);
    bg.addColorStop(0, '#041208'); bg.addColorStop(1, '#020704');
    dc.fillStyle = bg; dc.fillRect(0, 0, W, H);

    // Grid cross-hairs
    dc.strokeStyle = 'rgba(29,185,84,0.08)'; dc.lineWidth = 1; dc.setLineDash([]);
    dc.beginPath(); dc.moveTo(cx, 0); dc.lineTo(cx, H); dc.stroke();
    dc.beginPath(); dc.moveTo(0, cy); dc.lineTo(W, cy); dc.stroke();

    // Range rings with distance labels
    [0.25, 0.5, 0.75, 1.0].forEach((f, i) => {
      dc.strokeStyle = `rgba(29,185,84,${0.06 + i * 0.04})`;
      dc.lineWidth = 1; dc.setLineDash(i < 3 ? [3, 5] : []);
      dc.beginPath(); dc.arc(cx, cy, RANGE * f * scale, 0, Math.PI * 2); dc.stroke();
      if (f < 1) {
        dc.fillStyle = 'rgba(29,185,84,0.22)';
        dc.font = '7px JetBrains Mono, monospace'; dc.textAlign = 'left'; dc.setLineDash([]);
        dc.fillText(`${Math.round(RANGE * f)}u`, cx + RANGE * f * scale + 2, cy - 2);
      }
    });
    dc.setLineDash([]);

    // LIDAR rays and hits
    const pts = lidar.points || [];
    pts.forEach(pt => {
      const dx = pt.x - rx, dy = pt.y - ry;
      const ex = cx + dx * scale, ey = cy + dy * scale;
      if (pt.hit) {
        const typ = pt.type || 'none';
        const hcol = typ === 'vehicle' ? 'rgba(251,146,60,.95)'
                   : typ === 'person'  ? 'rgba(168,85,247,.95)'
                                       : 'rgba(239,68,68,.75)';
        dc.strokeStyle = 'rgba(239,68,68,0.18)'; dc.lineWidth = 0.6;
        dc.beginPath(); dc.moveTo(cx, cy); dc.lineTo(ex, ey); dc.stroke();
        // Glow ring for dynamic objects
        if (typ === 'vehicle' || typ === 'person') {
          dc.strokeStyle = hcol.replace('.95)', '.25)');
          dc.lineWidth = 2.5;
          dc.beginPath(); dc.arc(ex, ey, 5, 0, Math.PI * 2); dc.stroke();
        }
        dc.fillStyle = hcol;
        dc.beginPath(); dc.arc(ex, ey, typ === 'building' ? 1.5 : 2.8, 0, Math.PI * 2); dc.fill();
      } else {
        dc.strokeStyle = 'rgba(29,185,84,0.04)'; dc.lineWidth = 0.4;
        dc.beginPath(); dc.moveTo(cx, cy); dc.lineTo(ex, ey); dc.stroke();
      }
    });

    // Deduplicated object labels
    const seen = new Set();
    pts.forEach(pt => {
      if (!pt.hit) return;
      const typ = pt.type || 'none';
      if (typ === 'building' || typ === 'none') return;
      const cell = `${Math.round((pt.x - rx) / 14)},${Math.round((pt.y - ry) / 14)}`;
      if (seen.has(cell)) return;
      seen.add(cell);
      const dx = pt.x - rx, dy = pt.y - ry;
      const dist = Math.round(Math.sqrt(dx*dx + dy*dy));
      const ex = cx + dx * scale, ey = cy + dy * scale;
      const col = typ === 'vehicle' ? '#fb923c' : '#c084fc';
      const lbl = typ === 'vehicle' ? '▣' : '◉';
      dc.fillStyle = col; dc.font = 'bold 8px JetBrains Mono, monospace'; dc.textAlign = 'left';
      dc.fillText(`${lbl} ${dist}u`, ex + 4, ey - 3);
    });

    // Rotating sweep line
    const ang = (Date.now() / 800) % (Math.PI * 2);
    const sweepGrad = dc.createLinearGradient(cx, cy,
      cx + Math.cos(ang) * RANGE * scale, cy + Math.sin(ang) * RANGE * scale);
    sweepGrad.addColorStop(0, 'rgba(29,185,84,0.55)');
    sweepGrad.addColorStop(1, 'rgba(29,185,84,0)');
    dc.strokeStyle = sweepGrad; dc.lineWidth = 1.5;
    dc.beginPath(); dc.moveTo(cx, cy);
    dc.lineTo(cx + Math.cos(ang) * RANGE * scale, cy + Math.sin(ang) * RANGE * scale);
    dc.stroke();

    // Sweep arc fill
    dc.save();
    dc.beginPath(); dc.moveTo(cx, cy);
    dc.arc(cx, cy, RANGE * scale, ang - 0.3, ang, false);
    dc.closePath();
    dc.fillStyle = 'rgba(29,185,84,0.04)'; dc.fill();
    dc.restore();

    // Robot center dot
    const rg = dc.createRadialGradient(cx, cy, 0, cx, cy, 8);
    rg.addColorStop(0, '#1db954'); rg.addColorStop(1, 'rgba(29,185,84,0)');
    dc.fillStyle = rg; dc.beginPath(); dc.arc(cx, cy, 8, 0, Math.PI*2); dc.fill();
    dc.fillStyle = '#1db954'; dc.beginPath(); dc.arc(cx, cy, 4, 0, Math.PI*2); dc.fill();
    dc.fillStyle = '#030a04'; dc.beginPath(); dc.arc(cx, cy, 2, 0, Math.PI*2); dc.fill();

    // Nearest label
    if (lidar.nearest != null) {
      dc.fillStyle = 'rgba(4,9,10,0.75)';
      dc.fillRect(cx - 28, H - 18, 56, 14);
      dc.fillStyle = lidar.nearest < 20 ? '#ef4444' : '#1db954';
      dc.font = 'bold 9px JetBrains Mono, monospace'; dc.textAlign = 'center';
      dc.fillText(`NEAR: ${Math.round(lidar.nearest)}u`, cx, H - 7);
    }

  }

  // ── Sweep animation loop for LIDAR canvas ─────────────────────────
  let _lidarState = null;  // { rx, ry, lidar }
  (function startLidarLoop() {
    const tick = () => {
      if (_lidarState) drawDashboardLidar(_lidarState.rx, _lidarState.ry, _lidarState.lidar);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();

  // ── Boot when DOM ready ────────────────────────────────────────────
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    setTimeout(init, 200);

  return { isActive: () => active };
})();

window.SimBridge = SimBridge;
