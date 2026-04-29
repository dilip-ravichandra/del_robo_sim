/* ═══════════════════════════════════════════════
   DELIVERYBOT — Dashboard Controller
═══════════════════════════════════════════════ */

'use strict';

// ── App State ─────────────────────────────────
const AppState = {
  user: null,
  currentView: 'dashboard',
  robotStatus: 'idle',
  activeDelivery: null,
  deliveries: [],
  battery: 87,
  notifications: 0,
  systemOnline: true,
};

// ── Sample delivery data ──────────────────────
const SAMPLE_DELIVERIES = [
  { id: 'DEL-001', item: 'Lab Report',    from: 'Admin Block',  to: 'Lab A – Chemistry', receiver: 'Dr. Anand',   status: 'completed', time: '9:14 AM',   duration: '8 min' },
  { id: 'DEL-002', item: 'Medical Docs',  from: 'Main Gate',    to: 'Medical Centre',    receiver: 'Nurse Priya', status: 'completed', time: '10:32 AM',  duration: '11 min' },
  { id: 'DEL-003', item: 'Books',         from: 'Library',      to: 'Hostel A',          receiver: 'Arjun M.',    status: 'completed', time: '11:05 AM',  duration: '14 min' },
  { id: 'DEL-004', item: 'Lunch Parcel',  from: 'Canteen',      to: 'Room 205 – Engg',   receiver: 'Prof. Rao',   status: 'active',    time: '1:20 PM',   duration: null },
  { id: 'DEL-005', item: 'Stationery',    from: 'Admin Block',  to: 'Hostel B',          receiver: 'Student #42', status: 'pending',   time: '2:45 PM',   duration: null },
  { id: 'DEL-006', item: 'Lab Equipment', from: 'Library',      to: 'Lab B – Physics',   receiver: 'Dr. Sharma',  status: 'pending',   time: '3:10 PM',   duration: null },
];

// ── Boot ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSession();
  initComponents();
  renderDeliveriesList(SAMPLE_DELIVERIES);
  updateDeliveryBadge();
  startBatterySimulation();
  startSystemPulse();
});

function loadSession() {
  const raw = sessionStorage.getItem('dbUser') || localStorage.getItem('dbUser');
  if (raw) {
    try { AppState.user = JSON.parse(raw); } catch {}
  }
  if (!AppState.user) {
    // Redirect to login if no session
    document.body.style.opacity = '0';
    setTimeout(() => { window.location.href = 'index.html'; }, 100);
    return;
  }
  applyUserProfile();
}

function applyUserProfile() {
  const u = AppState.user;
  const initial = u.name.charAt(0).toUpperCase();

  // Sidebar
  const sbName = document.getElementById('sidebar-name');
  const sbRole = document.getElementById('sidebar-role');
  const sbAvt  = document.getElementById('sidebar-avatar');
  if (sbName) sbName.textContent = u.name;
  if (sbRole) sbRole.textContent = u.role;
  if (sbAvt)  sbAvt.textContent  = initial;

  // Topbar
  const tbAvt = document.getElementById('topbar-avatar');
  if (tbAvt) tbAvt.textContent = initial;

  // Settings pre-fill
  const sName  = document.getElementById('settings-name');
  const sEmail = document.getElementById('settings-email');
  if (sName)  sName.value  = u.name;
  if (sEmail) sEmail.value = u.email || '';
}

function initComponents() {
  // Init map
  if (window.MapEngine) window.MapEngine.initMap();

  // Init LIDAR
  if (window.LidarEngine) window.LidarEngine.initLidar();

  // Init analytics
  if (window.AnalyticsEngine) window.AnalyticsEngine.initAnalytics();

  // Robot home event
  window.addEventListener('robotHome', () => {
    setRobotStatus('idle');
    AppState.activeDelivery = null;
    document.getElementById('btn-recall').disabled = true;
    document.getElementById('btn-estop').disabled  = true;
    document.getElementById('btn-dispatch').disabled = false;
    document.getElementById('task-text').textContent = 'Delivery completed ✓';
    toast('✓ Delivery Complete', 'Robot returned to base successfully.', 'success');

    // Re-enable after a moment
    setTimeout(() => {
      document.getElementById('task-text').textContent = 'Awaiting dispatch';
    }, 4000);
  });

  // Close dropdowns on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown')) {
      document.getElementById('user-menu').style.display = 'none';
    }
  });
}

// ── Navigation ────────────────────────────────
function showView(viewId) {
  // Hide all views
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Show target view
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add('active');

  // Active nav item
  const navEl = document.querySelector(`[data-view="${viewId}"]`);
  if (navEl) navEl.classList.add('active');

  AppState.currentView = viewId;

  // Update topbar
  const pages = {
    dashboard:  ['Dashboard', 'Robot Control Center · ROBOT_01'],
    deliveries: ['All Deliveries', 'Campus delivery log'],
    analytics:  ['Analytics',  'Performance insights'],
    settings:   ['Settings',   'Account & system preferences'],
  };
  const [title, sub] = pages[viewId] || ['Dashboard', ''];
  document.getElementById('topbar-page').textContent = title;
  document.getElementById('topbar-sub').textContent  = sub;

  // Lazy-init analytics view charts
  if (viewId === 'analytics' && window.AnalyticsEngine) {
    setTimeout(() => window.AnalyticsEngine.initAnalyticsView(), 100);
  }
}

// ── Delivery dispatch ─────────────────────────
function startDelivery() {
  const item     = document.getElementById('item-name').value.trim();
  const pickup   = document.getElementById('pickup-room').value;
  const dest     = document.getElementById('dest-room').value;
  const receiver = document.getElementById('receiver-name').value.trim();

  if (!item || !pickup || !dest) {
    toast('⚠ Missing Info', 'Please fill in item, pickup, and destination.', 'warning');
    return;
  }

  if (AppState.robotStatus !== 'idle') {
    toast('🤖 Robot Busy', 'Recall the robot first before dispatching.', 'warning');
    return;
  }

  const deliveryId = 'DEL-' + String(SAMPLE_DELIVERIES.length + 1).padStart(3, '0');
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const delivery = { id: deliveryId, item, from: pickup, to: dest, receiver, status: 'active', time: timeStr, duration: null };
  SAMPLE_DELIVERIES.unshift(delivery);
  AppState.activeDelivery = delivery;

  // Update UI
  setRobotStatus('moving');
  document.getElementById('btn-dispatch').disabled = true;
  document.getElementById('btn-recall').disabled   = false;
  document.getElementById('btn-estop').disabled    = false;
  document.getElementById('task-text').textContent = `${item} → ${dest.split('—')[0].trim()}`;

  // Estimate ETA
  const etaMin = 5 + Math.floor(Math.random() * 8);
  if (window.AnalyticsEngine) window.AnalyticsEngine.updateAIPrediction(etaMin, dest);

  // Start map animation
  const pickupId = findBuildingId(pickup);
  const destId   = findBuildingId(dest);
  if (window.MapEngine) {
    window.MapEngine.startDeliveryOnMap(pickupId, destId, () => {
      delivery.status = 'completed';
      delivery.duration = etaMin + ' min';
      renderDeliveriesList(SAMPLE_DELIVERIES);
    });
  }

  // Show map status badge
  const badge = document.getElementById('map-status-badge');
  if (badge) { badge.style.display = 'inline-flex'; badge.textContent = 'Moving'; }

  toast('🚀 Robot Dispatched', `Delivering ${item} to ${dest.split('—')[0].trim()}.`, 'success');
  renderDeliveriesList(SAMPLE_DELIVERIES);
  updateDeliveryBadge();

  // Clear form
  document.getElementById('item-name').value    = '';
  document.getElementById('pickup-room').value  = '';
  document.getElementById('dest-room').value    = '';
  document.getElementById('receiver-name').value = '';
}

function findBuildingId(label) {
  const map = {
    'Main Gate':        'main-gate',
    'Admin Block':      'admin',
    'Library':          'library',
    'Canteen':          'canteen',
    'Hostel A':         'hostel-a',
    'Hostel B':         'hostel-b',
    'Sports Complex':   'sports',
    'Room 101 — Science Block': 'science',
    'Room 205 — Engineering':   'engineering',
    'Lab A — Chemistry':        'lab-a',
    'Lab B — Physics':          'lab-b',
    'Lab C — Computer':         'lab-a',
    'Room 301 — Arts Block':    'admin',
    'Room 410 — Admin':         'admin',
    'Medical Centre':           'medical',
    'Hostel A':                 'hostel-a',
    'Hostel B':                 'hostel-b',
  };
  return map[label] || 'admin';
}

function recallRobot() {
  if (AppState.robotStatus === 'idle') return;
  setRobotStatus('returning');
  if (window.MapEngine) window.MapEngine.recallRobotOnMap();
  if (AppState.activeDelivery) AppState.activeDelivery.status = 'recalled';
  document.getElementById('task-text').textContent = 'Returning to base...';
  toast('↩ Robot Recalled', 'Robot returning to home base.', 'warning');
  renderDeliveriesList(SAMPLE_DELIVERIES);
}

function emergencyStop() {
  if (AppState.robotStatus === 'idle') return;
  setRobotStatus('idle');
  if (window.MapEngine) window.MapEngine.resetMapView();
  AppState.activeDelivery = null;
  document.getElementById('btn-dispatch').disabled = false;
  document.getElementById('btn-recall').disabled   = true;
  document.getElementById('btn-estop').disabled    = true;
  document.getElementById('task-text').textContent = 'Emergency stop engaged';
  const badge = document.getElementById('map-status-badge');
  if (badge) badge.style.display = 'none';
  toast('🛑 Emergency Stop', 'Robot halted. Manual check required.', 'error');

  setTimeout(() => {
    document.getElementById('task-text').textContent = 'Awaiting dispatch';
  }, 5000);
}

// ── Robot status ──────────────────────────────
function setRobotStatus(status) {
  AppState.robotStatus = status;
  const badge = document.getElementById('robot-badge');
  if (!badge) return;

  const statusMap = {
    idle:       ['badge-idle',       'Idle'],
    moving:     ['badge-moving',     'Moving'],
    delivering: ['badge-delivering', 'Delivering'],
    returning:  ['badge-returning',  'Returning'],
    error:      ['badge-error',      'Error'],
  };

  const [cls, label] = statusMap[status] || ['badge-idle', 'Idle'];
  badge.className = `badge ${cls}`;
  badge.textContent = label;

  const taskLabel = document.getElementById('robot-task-label');
  if (taskLabel) {
    const lblMap = {
      idle: 'STANDING BY',
      moving: 'EN ROUTE',
      delivering: 'DELIVERING',
      returning: 'RETURNING',
      error: 'ERROR',
    };
    taskLabel.textContent = lblMap[status] || 'STANDING BY';
  }
}

// ── Battery simulation ────────────────────────
function startBatterySimulation() {
  setInterval(() => {
    if (AppState.robotStatus === 'moving' || AppState.robotStatus === 'returning') {
      AppState.battery = Math.max(5, AppState.battery - 0.3);
    } else {
      AppState.battery = Math.min(100, AppState.battery + 0.05);
    }
    updateBatteryUI(AppState.battery);
  }, 2000);
}

function updateBatteryUI(pct) {
  const fill = document.getElementById('battery-fill');
  const label = document.getElementById('battery-pct');
  if (!fill || !label) return;

  pct = Math.round(pct);
  fill.style.width = pct + '%';
  label.textContent = pct + '%';

  fill.className = 'battery-bar-fill';
  if (pct <= 20) { fill.classList.add('low'); label.style.color = 'var(--status-error)'; }
  else if (pct <= 40) { fill.classList.add('mid'); label.style.color = 'var(--status-returning)'; }
  else { label.style.color = 'var(--accent)'; }
}

// ── System status pulse ───────────────────────
function startSystemPulse() {
  setInterval(() => {
    const dot = document.getElementById('sys-dot');
    const txt = document.getElementById('sys-status-text');
    // Simulate occasional brief offline flicker
    if (Math.random() < 0.02) {
      dot.className = 'sys-dot offline';
      txt.textContent = 'RECONNECTING';
      setTimeout(() => {
        dot.className = 'sys-dot online';
        txt.textContent = 'ONLINE';
      }, 2000);
    }
  }, 5000);
}

// ── Delivery list rendering ───────────────────
const STATUS_CFG = {
  completed: { color: '#1db954', bg: 'rgba(29,185,84,0.08)', icon: '✓', label: 'Completed' },
  active:    { color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)', icon: '↗', label: 'Active' },
  pending:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: '⏳', label: 'Pending' },
  recalled:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: '↩', label: 'Recalled' },
};

let currentFilter = 'all';

function filterDeliveries(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderDeliveriesList(SAMPLE_DELIVERIES);
}

function renderDeliveriesList(deliveries) {
  const list = document.getElementById('deliveries-list');
  if (!list) return;

  const filtered = currentFilter === 'all'
    ? deliveries
    : deliveries.filter(d => d.status === currentFilter);

  const count = document.getElementById('delivery-count-label');
  if (count) count.textContent = `${filtered.length} deliveries found`;

  list.innerHTML = filtered.map((d, i) => {
    const cfg = STATUS_CFG[d.status] || STATUS_CFG.pending;
    return `
      <div class="delivery-item anim-fade-up" style="animation-delay:${i * 40}ms">
        <div class="delivery-icon-wrap" style="background:${cfg.bg}">
          <span style="font-size:18px">📦</span>
        </div>
        <div class="delivery-info">
          <div class="delivery-name">${d.item}</div>
          <div class="delivery-meta">${d.from} → ${d.to} · ${d.receiver || '—'}</div>
        </div>
        <div class="delivery-right">
          <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;font-family:var(--font-mono);background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}33">
            ${cfg.icon} ${cfg.label}
          </span>
          <span style="font-size:11px;color:var(--text-faint);font-family:var(--font-mono)">${d.time}${d.duration ? ' · ' + d.duration : ''}</span>
        </div>
      </div>
    `;
  }).join('') || `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px">No deliveries found.</div>`;
}

function updateDeliveryBadge() {
  const pending = SAMPLE_DELIVERIES.filter(d => d.status === 'pending').length;
  const badge   = document.getElementById('pending-badge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? 'inline-flex' : 'none';
  }
}

// ── Toast notifications ───────────────────────
function toast(title, msg, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(el);

  // Auto-remove
  setTimeout(() => {
    el.style.animation = 'toastOut 0.4s var(--ease-out) forwards';
    setTimeout(() => el.remove(), 400);
  }, 4000);

  // Notification badge
  AppState.notifications++;
  const nbadge = document.getElementById('notif-badge');
  if (nbadge) {
    nbadge.style.display = 'flex';
    nbadge.textContent = AppState.notifications;
  }
}

// ── Settings ──────────────────────────────────
function toggleSetting(el) {
  el.classList.toggle('on');
}

function saveSettings() {
  const name  = document.getElementById('settings-name').value;
  const email = document.getElementById('settings-email').value;
  if (AppState.user) {
    AppState.user.name  = name;
    AppState.user.email = email;
    sessionStorage.setItem('dbUser', JSON.stringify(AppState.user));
    applyUserProfile();
  }
  toast('✓ Settings Saved', 'Your profile has been updated.', 'success');
}

// ── UI toggles ────────────────────────────────
function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function toggleNotifPanel() {
  AppState.notifications = 0;
  const badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = 'none';
  toast('Notifications', 'All caught up! No new alerts.', 'info');
}

function goLogout() {
  sessionStorage.removeItem('dbUser');
  localStorage.removeItem('dbUser');
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.4s ease';
  setTimeout(() => { window.location.href = 'index.html'; }, 400);
}
