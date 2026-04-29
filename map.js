/* ═══════════════════════════════════════════════
   DELIVERYBOT — Campus Map Engine
═══════════════════════════════════════════════ */

'use strict';

// ── Building layout ──────────────────────────
const CAMPUS_MAP = {
  roads: [
    { x: 0,   y: 140, w: 760, h: 22, label: 'Main Road' },
    { x: 0,   y: 270, w: 760, h: 22 },
    { x: 160, y: 0,   w: 22,  h: 400 },
    { x: 380, y: 0,   w: 22,  h: 400 },
    { x: 560, y: 0,   w: 22,  h: 400 },
  ],
  buildings: [
    { id: 'main-gate',  x: 10,  y: 10,  w: 130, h: 110, label: 'Main Gate',       icon: '🏛', color: '#e8f5e9' },
    { id: 'admin',      x: 202, y: 10,  w: 150, h: 110, label: 'Admin Block',      icon: '🏢', color: '#e3f2fd' },
    { id: 'science',    x: 402, y: 10,  w: 130, h: 110, label: 'Science Block',    icon: '🔬', color: '#fff3e0' },
    { id: 'library',    x: 10,  y: 162, w: 130, h: 80,  label: 'Library',          icon: '📚', color: '#fce4ec' },
    { id: 'lab-a',      x: 202, y: 162, w: 150, h: 80,  label: 'Lab A – Chemistry',icon: '⚗️', color: '#f3e5f5' },
    { id: 'lab-b',      x: 402, y: 162, w: 130, h: 80,  label: 'Lab B – Physics',  icon: '⚡', color: '#e8eaf6' },
    { id: 'canteen',    x: 602, y: 162, w: 130, h: 80,  label: 'Canteen',          icon: '🍽', color: '#fff8e1' },
    { id: 'engineering',x: 10,  y: 292, w: 130, h: 90,  label: 'Engineering',      icon: '⚙️', color: '#e0f2f1' },
    { id: 'hostel-a',   x: 202, y: 292, w: 150, h: 90,  label: 'Hostel A',         icon: '🏠', color: '#fbe9e7' },
    { id: 'sports',     x: 402, y: 292, w: 130, h: 90,  label: 'Sports Complex',   icon: '⚽', color: '#e1f5fe' },
    { id: 'medical',    x: 602, y: 10,  w: 130, h: 110, label: 'Medical Centre',   icon: '🏥', color: '#e8f5e9' },
    { id: 'hostel-b',   x: 602, y: 292, w: 130, h: 90,  label: 'Hostel B',         icon: '🏘', color: '#fff3e0' },
  ],
  homeBase: { x: 680, y: 170, label: 'Home Base' },
};

// Map canvas and state
let mapCanvas, mapCtx;
let mapW, mapH;
const SCALE_W = 760;
const SCALE_H = 400;

// Robot state
const robotState = {
  x: 680, y: 170,
  tx: 680, ty: 170,
  angle: 0,
  targetAngle: 0,
  speed: 2.5,
  status: 'idle',   // idle | moving | arrived | returning
  trail: [],
  currentRoute: [],
  routeIdx: 0,
  deliveryId: null,
  pickup: null,
  destination: null,
  pulseR: 0,
  pulseAlpha: 1,
  onArrive: null,
};

// Pickup and destination markers
let pickupMarker = null;
let destMarker   = null;

// ── Init ─────────────────────────────────────
function initMap() {
  mapCanvas = document.getElementById('delivery-map');
  if (!mapCanvas) return;

  mapCtx = mapCanvas.getContext('2d');

  function resize() {
    const w = mapCanvas.parentElement.clientWidth || 760;
    if (w !== mapW) {
      mapW = w;
      mapCanvas.width  = mapW;
      mapCanvas.height = mapH;
    }
  }

  mapH = 300;
  // Defer first resize to next frame so grid layout has painted
  requestAnimationFrame(() => {
    resize();
    requestAnimationFrame(mapLoop);
  });

  window.addEventListener('resize', resize);

  // ResizeObserver catches container size changes (e.g. sidebar toggle)
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(mapCanvas.parentElement);
  }
}

// ── Scale helpers ─────────────────────────────
function sx(x) { return (x / SCALE_W) * mapW; }
function sy(y) { return (y / SCALE_H) * mapH; }
function sw(w) { return (w / SCALE_W) * mapW; }
function sh(h) { return (h / SCALE_H) * mapH; }

// ── Draw loop ─────────────────────────────────
let frame = 0;
function mapLoop() {
  frame++;
  updateRobotPos();
  drawMapFrame();
  requestAnimationFrame(mapLoop);
}

function drawMapFrame() {
  const c = mapCtx;
  c.clearRect(0, 0, mapW, mapH);

  // Background
  const bg = c.createLinearGradient(0, 0, mapW, mapH);
  bg.addColorStop(0, '#f0f4ef');
  bg.addColorStop(1, '#e4ede2');
  c.fillStyle = bg;
  c.fillRect(0, 0, mapW, mapH);

  // Grid
  c.strokeStyle = 'rgba(180,210,175,0.35)';
  c.lineWidth = 1;
  const gs = sw(40);
  for (let x = 0; x < mapW; x += gs) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, mapH); c.stroke();
  }
  for (let y = 0; y < mapH; y += gs) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(mapW, y); c.stroke();
  }

  // Roads
  CAMPUS_MAP.roads.forEach(r => {
    c.fillStyle = '#c8d8c4';
    c.fillRect(sx(r.x), sy(r.y), sw(r.w), sh(r.h));
    // Road markings
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.setLineDash([sw(10), sw(6)]);
    c.lineWidth = 1;
    c.beginPath();
    if (r.w > r.h) {
      c.moveTo(sx(r.x), sy(r.y + r.h / 2));
      c.lineTo(sx(r.x + r.w), sy(r.y + r.h / 2));
    } else {
      c.moveTo(sx(r.x + r.w / 2), sy(r.y));
      c.lineTo(sx(r.x + r.w / 2), sy(r.y + r.h));
    }
    c.stroke();
    c.setLineDash([]);
  });

  // Buildings
  CAMPUS_MAP.buildings.forEach(b => {
    const bx = sx(b.x), by = sy(b.y), bw = sw(b.w), bh = sh(b.h);
    const isPickup  = pickupMarker  && pickupMarker.id  === b.id;
    const isDest    = destMarker    && destMarker.id    === b.id;

    // Shadow
    c.fillStyle = 'rgba(13,31,13,0.08)';
    c.beginPath();
    roundRect(c, bx + 3, by + 3, bw, bh, sw(6));
    c.fill();

    // Fill
    c.fillStyle = isDest ? 'rgba(14,165,233,0.15)' : isPickup ? 'rgba(245,158,11,0.15)' : b.color;
    c.beginPath();
    roundRect(c, bx, by, bw, bh, sw(6));
    c.fill();

    // Border
    c.strokeStyle = isDest ? '#0ea5e9' : isPickup ? '#f59e0b' : 'rgba(180,210,175,0.8)';
    c.lineWidth = isDest || isPickup ? 2 : 1;
    c.beginPath();
    roundRect(c, bx, by, bw, bh, sw(6));
    c.stroke();

    // Icon
    c.font = `${sw(14)}px serif`;
    c.textAlign = 'center';
    c.fillText(b.icon, bx + bw / 2, by + sh(20) + sw(5));

    // Label
    c.font = `500 ${Math.max(8, sw(8))}px 'DM Sans', sans-serif`;
    c.fillStyle = '#2a402a';
    c.textAlign = 'center';
    const lines = b.label.split('–');
    lines.forEach((line, i) => {
      c.fillText(line.trim(), bx + bw / 2, by + sh(30) + i * sh(12) + sw(7));
    });
  });

  // Home base
  drawHomeBase(c);

  // Route line
  if (robotState.currentRoute.length > 0) {
    drawRouteLine(c);
  }

  // Pickup / Dest markers
  if (pickupMarker)  drawMarker(c, sx(pickupMarker.cx), sy(pickupMarker.cy), '#f59e0b', '📦', 'PICKUP');
  if (destMarker)    drawMarker(c, sx(destMarker.cx),   sy(destMarker.cy),   '#0ea5e9', '📍', 'DELIVER');

  // Robot trail
  robotState.trail.forEach((t, i) => {
    c.beginPath();
    c.arc(sx(t.x), sy(t.y), sw(2), 0, Math.PI * 2);
    c.fillStyle = `rgba(29,185,84,${t.life * 0.25})`;
    c.fill();
  });

  // Robot
  drawRobot(c, sx(robotState.x), sy(robotState.y), robotState.angle, robotState.status);

  // Pulse ring on arrival
  if (robotState.status === 'arrived' || robotState.status === 'idle') {
    robotState.pulseR += 0.4;
    if (robotState.pulseR > sw(20)) { robotState.pulseR = 0; }
    robotState.pulseAlpha = 1 - robotState.pulseR / sw(20);
    c.beginPath();
    c.arc(sx(robotState.x), sy(robotState.y), robotState.pulseR, 0, Math.PI * 2);
    c.strokeStyle = `rgba(29,185,84,${robotState.pulseAlpha * 0.5})`;
    c.lineWidth = 1.5;
    c.stroke();
  }
}

function drawHomeBase(c) {
  const hx = sx(CAMPUS_MAP.homeBase.x);
  const hy = sy(CAMPUS_MAP.homeBase.y);
  const r  = sw(22);

  c.beginPath();
  c.arc(hx, hy, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(29,185,84,0.08)';
  c.fill();
  c.strokeStyle = 'rgba(29,185,84,0.4)';
  c.lineWidth = 1.5;
  c.setLineDash([3, 3]);
  c.stroke();
  c.setLineDash([]);

  c.font = `${sw(10)}px serif`;
  c.textAlign = 'center';
  c.fillText('🤖', hx, hy - sh(3));
  c.font = `600 ${Math.max(7, sw(7))}px 'DM Sans', sans-serif`;
  c.fillStyle = '#1db954';
  c.fillText('HOME', hx, hy + sh(10));
}

function drawRobot(c, x, y, angle, status) {
  c.save();
  c.translate(x, y);
  c.rotate(angle + Math.PI / 2);

  const glow = status === 'moving' ? '#1db954' : status === 'arrived' ? '#0ea5e9' : '#1db954';
  c.shadowColor = glow;
  c.shadowBlur  = sw(8);

  // Body
  const bw = sw(14), bh = sh(20);
  c.fillStyle = '#ffffff';
  c.strokeStyle = glow;
  c.lineWidth = 1.5;
  c.beginPath();
  roundRect(c, -bw / 2, -bh / 2, bw, bh, sw(4));
  c.fill();
  c.stroke();

  // Front cap
  c.fillStyle = glow;
  c.beginPath();
  roundRect(c, -bw / 2, -bh / 2, bw, bh * 0.35, sw(4));
  c.fill();

  // Wheels
  [[-(bw/2 + 3), -bh * 0.2], [(bw/2), -bh * 0.2],
   [-(bw/2 + 3),  bh * 0.2], [(bw/2),  bh * 0.2]].forEach(([wx, wy]) => {
    c.fillStyle = '#2a402a';
    c.beginPath();
    roundRect(c, wx, wy - sh(3), 3, sh(6), 1);
    c.fill();
  });

  // Center light
  c.beginPath();
  c.arc(0, sh(3), sw(3), 0, Math.PI * 2);
  c.fillStyle = glow;
  c.fill();

  c.shadowBlur = 0;
  c.restore();
}

function drawMarker(c, x, y, color, icon, label) {
  // Outer ring
  c.beginPath();
  c.arc(x, y, sw(12), 0, Math.PI * 2);
  c.fillStyle = color + '22';
  c.fill();
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.stroke();

  c.font = `${sw(11)}px serif`;
  c.textAlign = 'center';
  c.fillText(icon, x, y + sh(4));

  c.font = `bold ${Math.max(7, sw(7))}px 'DM Sans', sans-serif`;
  c.fillStyle = color;
  c.fillText(label, x, y + sh(20));
}

function drawRouteLine(c) {
  const route = robotState.currentRoute;
  if (route.length < 2) return;

  c.save();
  // Ghost line
  c.strokeStyle = 'rgba(29,185,84,0.15)';
  c.lineWidth = sw(4);
  c.setLineDash([]);
  c.lineJoin = 'round';
  c.lineCap  = 'round';
  c.beginPath();
  c.moveTo(sx(route[0].x), sy(route[0].y));
  route.slice(1).forEach(pt => c.lineTo(sx(pt.x), sy(pt.y)));
  c.stroke();

  // Dashed line
  c.strokeStyle = '#1db954';
  c.lineWidth = sw(2.5);
  c.setLineDash([sw(6), sw(4)]);
  const dashOffset = (frame * 0.5) % (sw(6) + sw(4));
  c.lineDashOffset = -dashOffset;
  c.beginPath();
  c.moveTo(sx(route[0].x), sy(route[0].y));
  route.slice(1).forEach(pt => c.lineTo(sx(pt.x), sy(pt.y)));
  c.stroke();
  c.setLineDash([]);
  c.restore();
}

// ── Robot movement ────────────────────────────
function updateRobotPos() {
  // Freeze JS movement when Python simulation bridge is active
  if (robotState._paused) return;
  if (robotState.status !== 'moving' && robotState.status !== 'returning') return;

  const route = robotState.currentRoute;
  if (robotState.routeIdx >= route.length) {
    robotState.status = 'arrived';
    if (robotState.onArrive) { robotState.onArrive(); robotState.onArrive = null; }
    updateMapBadge();
    return;
  }

  const target = route[robotState.routeIdx];
  const dx = target.x - robotState.x;
  const dy = target.y - robotState.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    robotState.targetAngle = Math.atan2(dy * (mapH / SCALE_H), dx * (mapW / SCALE_W));
    // Smooth angle interpolation
    let da = robotState.targetAngle - robotState.angle;
    if (da >  Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    robotState.angle += da * 0.12;
  }

  const spd = robotState.speed;
  if (dist < spd) {
    robotState.x = target.x;
    robotState.y = target.y;
    robotState.routeIdx++;
  } else {
    robotState.x += (dx / dist) * spd;
    robotState.y += (dy / dist) * spd;
  }

  // Trail
  robotState.trail.push({ x: robotState.x, y: robotState.y, life: 1 });
  if (robotState.trail.length > 50) robotState.trail.shift();
  robotState.trail.forEach(t => t.life -= 0.02);
  robotState.trail = robotState.trail.filter(t => t.life > 0);
}

function updateMapBadge() {
  const badge = document.getElementById('map-status-badge');
  if (badge) {
    if (robotState.status === 'moving' || robotState.status === 'returning') {
      badge.style.display = 'inline-flex';
      badge.textContent = robotState.status === 'returning' ? 'Returning' : 'Moving';
      badge.className = `badge badge-${robotState.status === 'returning' ? 'returning' : 'moving'}`;
    } else {
      badge.style.display = 'none';
    }
  }
}

// ── Route builder ─────────────────────────────
function buildCampusRoute(fromCoord, toCoord) {
  // Simple L-shaped routing through roads
  const roadY1 = 151; // center of upper road
  const roadY2 = 281; // center of lower road
  const roadX1 = 171;
  const roadX2 = 391;
  const roadX3 = 571;

  const midY = Math.abs(fromCoord.y - 151) < 50 || Math.abs(toCoord.y - 151) < 50 ? roadY1 : roadY2;
  return [
    { ...fromCoord },
    { x: fromCoord.x, y: midY },
    { x: toCoord.x,   y: midY },
    { ...toCoord }
  ].filter((pt, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1];
    return Math.abs(pt.x - prev.x) > 2 || Math.abs(pt.y - prev.y) > 2;
  });
}

// ── Public API ────────────────────────────────
function startDeliveryOnMap(pickupId, destId, onComplete) {
  const pickup = CAMPUS_MAP.buildings.find(b => b.id === pickupId || b.label === pickupId || b.label.startsWith(pickupId));
  const dest   = CAMPUS_MAP.buildings.find(b => b.id === destId   || b.label === destId   || b.label.startsWith(destId));

  const pickupCoord = pickup
    ? { x: pickup.x + pickup.w / 2, y: pickup.y + pickup.h / 2 }
    : { x: 120, y: 50 };

  const destCoord = dest
    ? { x: dest.x + dest.w / 2, y: dest.y + dest.h / 2 }
    : { x: 480, y: 335 };

  pickupMarker = pickup ? { ...pickup, cx: pickupCoord.x, cy: pickupCoord.y } : null;
  destMarker   = dest   ? { ...dest,   cx: destCoord.x,   cy: destCoord.y   } : null;

  // Route: home → pickup → destination
  const homeCoord = { x: CAMPUS_MAP.homeBase.x, y: CAMPUS_MAP.homeBase.y };
  const legOne = buildCampusRoute(homeCoord, pickupCoord);
  const legTwo = buildCampusRoute(pickupCoord, destCoord);
  const legHome= buildCampusRoute(destCoord, homeCoord);

  robotState.currentRoute = legOne;
  robotState.routeIdx = 0;
  robotState.status = 'moving';
  updateMapBadge();

  robotState.onArrive = () => {
    // Arrived at pickup — brief pause then go to dest
    setTimeout(() => {
      robotState.currentRoute = legTwo;
      robotState.routeIdx = 0;
      robotState.status = 'moving';
      updateMapBadge();

      robotState.onArrive = () => {
        // Arrived at destination
        if (onComplete) onComplete();
        setTimeout(() => {
          robotState.currentRoute = legHome;
          robotState.routeIdx = 0;
          robotState.status = 'returning';
          updateMapBadge();

          robotState.onArrive = () => {
            robotState.status = 'idle';
            robotState.currentRoute = [];
            pickupMarker = null;
            destMarker   = null;
            updateMapBadge();
            window.dispatchEvent(new CustomEvent('robotHome'));
          };
        }, 1500);
      };
    }, 800);
  };
}

function recallRobotOnMap() {
  if (robotState.status === 'idle') return;
  const homeCoord = { x: CAMPUS_MAP.homeBase.x, y: CAMPUS_MAP.homeBase.y };
  const returnRoute = buildCampusRoute(
    { x: robotState.x, y: robotState.y },
    homeCoord
  );
  robotState.currentRoute = returnRoute;
  robotState.routeIdx = 0;
  robotState.status = 'returning';
  pickupMarker = null;
  destMarker   = null;
  updateMapBadge();

  robotState.onArrive = () => {
    robotState.status = 'idle';
    robotState.currentRoute = [];
    window.dispatchEvent(new CustomEvent('robotHome'));
  };
}

function resetMapView() {
  robotState.x = CAMPUS_MAP.homeBase.x;
  robotState.y = CAMPUS_MAP.homeBase.y;
  robotState.status = 'idle';
  robotState.currentRoute = [];
  robotState.trail = [];
  pickupMarker = null;
  destMarker   = null;
}

// ── Utility ───────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Expose
window.MapEngine = { initMap, startDeliveryOnMap, recallRobotOnMap, resetMapView, robotState };
