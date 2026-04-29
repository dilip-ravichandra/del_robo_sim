/* ═══════════════════════════════════════════════
   DELIVERYBOT — Analytics + LIDAR Engine
═══════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════
   LIDAR ENGINE
════════════════════════════════════════════ */

const LidarEngine = (() => {
  let canvas, ctx, W, H;
  let angle = 0;
  let obstacles = [];
  let scanHistory = [];
  const MAX_RANGE = 8.0;

  function initLidar() {
    canvas = document.getElementById('lidar-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;
    generateObstacles();
    requestAnimationFrame(lidarLoop);
  }

  function generateObstacles() {
    obstacles = [];
    for (let i = 0; i < 14; i++) {
      const a   = Math.random() * Math.PI * 2;
      const dist = 0.3 + Math.random() * 0.65;
      obstacles.push({ angle: a, dist, drift: (Math.random() - 0.5) * 0.003 });
    }
  }

  function lidarLoop() {
    // Drift obstacles slowly
    obstacles.forEach(o => {
      o.angle += o.drift;
      o.dist = Math.max(0.15, Math.min(0.9, o.dist + (Math.random() - 0.5) * 0.004));
    });

    angle = (angle + 0.04) % (Math.PI * 2);
    drawLidar();
    updateLidarStats();
    requestAnimationFrame(lidarLoop);
  }

  function drawLidar() {
    const cx = W / 2, cy = H / 2;
    const R  = W / 2 - 8;

    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, '#0d1f0d');
    bg.addColorStop(1, '#061406');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    // Concentric range rings
    [0.25, 0.5, 0.75, 1].forEach(f => {
      ctx.beginPath();
      ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(29,185,84,${f === 1 ? 0.25 : 0.1})`;
      ctx.lineWidth = f === 1 ? 1.5 : 0.75;
      ctx.stroke();
    });

    // Cross-hairs
    ctx.strokeStyle = 'rgba(29,185,84,0.1)';
    ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

    // Scan sweep (filled sector)
    const sweepAngle = Math.PI / 3;
    const grad = ctx.createConicalGradient
      ? null
      : (() => {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
          g.addColorStop(0, 'rgba(29,185,84,0.25)');
          g.addColorStop(1, 'rgba(29,185,84,0)');
          return g;
        })();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -sweepAngle / 2, sweepAngle / 2);
    ctx.closePath();
    ctx.fillStyle = grad || 'rgba(29,185,84,0.15)';
    ctx.fill();

    // Scan line
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(R, 0);
    ctx.strokeStyle = 'rgba(29,185,84,0.9)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#1db954';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Scan history (fading echo)
    scanHistory.push(angle);
    if (scanHistory.length > 80) scanHistory.shift();
    scanHistory.forEach((a, i) => {
      const alpha = (i / scanHistory.length) * 0.08;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(R, 0);
      ctx.strokeStyle = `rgba(29,185,84,${alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });

    // Obstacle dots
    obstacles.forEach(o => {
      const da = Math.abs(((o.angle - angle + Math.PI) % (Math.PI * 2)) - Math.PI);
      const visible = da < sweepAngle / 2 + 0.3;
      if (!visible) return;
      const px = cx + Math.cos(o.angle) * R * o.dist;
      const py = cy + Math.sin(o.angle) * R * o.dist;
      const alpha = 1 - da / (sweepAngle * 0.8);

      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(29,185,84,${Math.max(0, Math.min(1, alpha))})`;
      ctx.shadowColor = '#1db954';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Crosshair center
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#1db954';
    ctx.shadowColor = '#1db954'; ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Range label (ring markers)
    ctx.fillStyle = 'rgba(29,185,84,0.35)';
    ctx.font = `500 9px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    [0.25, 0.5, 0.75].forEach(f => {
      ctx.fillText(`${(MAX_RANGE * f).toFixed(1)}`, cx + R * f + 8, cy - 3);
    });
  }

  function updateLidarStats() {
    // Nearest obstacle
    const nearest = obstacles.reduce((min, o) => o.dist < min ? o.dist : min, Infinity);
    const rangeM  = (nearest * MAX_RANGE).toFixed(1);
    const el = document.getElementById('lidar-range');
    if (el) el.textContent = rangeM;

    // Obstacle count in forward 180°
    const frontCount = obstacles.filter(o => {
      const a = ((o.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return (a < Math.PI * 0.7 || a > Math.PI * 1.3);
    }).length;
    const countEl = document.getElementById('obstacle-count');
    if (countEl) countEl.textContent = frontCount;

    const prog = document.getElementById('lidar-progress');
    if (prog) prog.style.width = `${(frontCount / obstacles.length) * 100}%`;
  }

  return { initLidar };
})();

window.LidarEngine = LidarEngine;


/* ════════════════════════════════════════════
   ANALYTICS ENGINE
════════════════════════════════════════════ */

const AnalyticsEngine = (() => {

  // ── Counter animation ──────────────────────────
  function animateCounters() {
    document.querySelectorAll('[data-target]').forEach(el => {
      const target = parseInt(el.dataset.target, 10);
      const unit   = el.querySelector('.stat-unit')?.outerHTML || '';
      let current  = 0;
      const step   = target / 60;
      const timer  = setInterval(() => {
        current = Math.min(current + step, target);
        el.innerHTML = Math.floor(current) + unit;
        if (current >= target) clearInterval(timer);
      }, 16);
    });
  }

  // ── Mini analytics chart (dashboard view) ─────
  function initAnalytics() {
    animateCounters();
    drawMiniChart();
    populateAIRoutes();
    setInitialAI();
  }

  function drawMiniChart() {
    const canvas = document.getElementById('analytics-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.parentElement.clientWidth;
    const H   = 140;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const data = [12, 18, 9, 24, 31, 19, 28];
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    drawBarChart(ctx, W, H, data, labels, '#1db954');
  }

  function drawBarChart(ctx, W, H, data, labels, color) {
    const pad = { top: 16, right: 8, bottom: 28, left: 8 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const max    = Math.max(...data) * 1.2;
    const bw     = (chartW / data.length) * 0.55;
    const gap    = (chartW / data.length) * 0.45;

    ctx.clearRect(0, 0, W, H);

    // Y gridlines
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + chartH - (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    data.forEach((v, i) => {
      const barH = (v / max) * chartH;
      const x    = pad.left + (i * (bw + gap)) + gap / 2;
      const y    = pad.top + chartH - barH;

      // Bar fill gradient
      const g = ctx.createLinearGradient(0, y, 0, y + barH);
      g.addColorStop(0, color);
      g.addColorStop(1, color + '55');

      // Rounded top bar
      ctx.fillStyle = g;
      const r = Math.min(4, bw / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + bw - r, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
      ctx.lineTo(x + bw, y + barH);
      ctx.lineTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();

      // Label
      ctx.fillStyle = '#9ab89a';
      ctx.font = `500 10px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + bw / 2, H - pad.bottom + 14);
    });
  }

  // ── AI prediction update ───────────────────────
  function updateAIPrediction(etaMin, dest) {
    const conf = 88 + Math.floor(Math.random() * 10);
    const eff  = 82 + Math.floor(Math.random() * 15);

    animateValue('ai-eta', etaMin, ' min');
    animateValue('ai-conf', conf, '%');
    animateValue('ai-eff', eff, '%');
  }

  function animateValue(id, target, suffix) {
    const el = document.getElementById(id);
    if (!el) return;
    let cur = 0;
    const step = target / 30;
    const t = setInterval(() => {
      cur = Math.min(cur + step, target);
      el.textContent = Math.floor(cur) + suffix;
      if (cur >= target) clearInterval(t);
    }, 16);
  }

  function setInitialAI() {
    const el = document.getElementById('ai-eta');
    if (el) el.textContent = '— min';
  }

  function populateAIRoutes() {
    const container = document.getElementById('ai-routes');
    if (!container) return;
    const routes = [
      { label: 'Library → Hostel A', score: 94 },
      { label: 'Canteen → Engg',     score: 89 },
      { label: 'Admin → Lab A',      score: 91 },
      { label: 'Gate → Medical',     score: 87 },
    ];
    container.innerHTML = routes.map(r => `
      <div class="ai-route-item">
        <span>${r.label}</span>
        <span class="ai-route-score">${r.score}%</span>
      </div>
    `).join('');
  }

  // ── Full analytics view charts ─────────────────
  function initAnalyticsView() {
    draw30DayChart();
    drawHeatmapChart();
    drawDonutChart();
    drawTimeChart();
  }

  function draw30DayChart() {
    const canvas = document.getElementById('analytics-big-chart');
    if (!canvas || canvas._drawn) return;
    canvas._drawn = true;
    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.clientWidth, H = 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    // Generate 30-day data
    const data = Array.from({ length: 30 }, (_, i) => {
      const base = 8 + Math.sin(i * 0.4) * 4;
      return Math.max(1, Math.round(base + (Math.random() - 0.5) * 6));
    });

    drawAreaChart(ctx, W, H, data, '#1db954');
  }

  function drawAreaChart(ctx, W, H, data, color) {
    const pad = { top: 20, right: 12, bottom: 30, left: 32 };
    const cW  = W - pad.left - pad.right;
    const cH  = H - pad.top - pad.bottom;
    const max = Math.max(...data) * 1.1;
    const pts = data.map((v, i) => ({
      x: pad.left + (i / (data.length - 1)) * cW,
      y: pad.top + cH - (v / max) * cH,
    }));

    ctx.clearRect(0, 0, W, H);

    // Y axis labels
    ctx.fillStyle = '#9ab89a';
    ctx.font = '500 10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = Math.round((max / 4) * i);
      const y = pad.top + cH - (cH / 4) * i;
      ctx.fillText(v, pad.left - 5, y + 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    // Area fill
    const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    areaGrad.addColorStop(0, color + '30');
    areaGrad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.top + cH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.top + cH);
    ctx.closePath();
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Line
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots on peaks
    const peak = pts.reduce((m, p) => p.y < m.y ? p : m);
    ctx.beginPath();
    ctx.arc(peak.x, peak.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.fill(); ctx.shadowBlur = 0;
  }

  function drawHeatmapChart() {
    const canvas = document.getElementById('heatmap-chart');
    if (!canvas || canvas._drawn) return;
    canvas._drawn = true;
    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.clientWidth, H = 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const locations = ['Library','Canteen','Lab A','Admin','Hostel A','Medical','Engg','Gate'];
    const values = [87, 64, 92, 45, 71, 38, 83, 55];
    const bH = (H - 20) / locations.length - 4;

    ctx.clearRect(0, 0, W, H);

    locations.forEach((loc, i) => {
      const y = 10 + i * (bH + 4);
      const fillW = (values[i] / 100) * (W - 80);

      // Background track
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      roundRect2(ctx, 72, y, W - 80, bH, 3);
      ctx.fill();

      // Fill
      const h = Math.floor(120 * (values[i] / 100));
      ctx.fillStyle = `hsl(${h}, 60%, 45%)`;
      roundRect2(ctx, 72, y, fillW, bH, 3);
      ctx.fill();

      // Label
      ctx.fillStyle = '#6b8f6b';
      ctx.font = '500 10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(loc, 68, y + bH / 2 + 4);

      // Value
      ctx.fillStyle = '#0d1f0d';
      ctx.font = '600 10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(values[i], 72 + fillW + 5, y + bH / 2 + 4);
    });
  }

  function drawDonutChart() {
    const canvas = document.getElementById('donut-chart');
    if (!canvas || canvas._drawn) return;
    canvas._drawn = true;
    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.clientWidth, H = 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const cx = W / 2, cy = H / 2 - 10, R = Math.min(W, H) * 0.35, ri = R * 0.55;
    const segments = [
      { value: 96, color: '#1db954', label: 'Success' },
      { value: 3,  color: '#f59e0b', label: 'Delayed' },
      { value: 1,  color: '#ef4444', label: 'Failed'  },
    ];
    const total = segments.reduce((s, g) => s + g.value, 0);
    let startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, W, H);

    segments.forEach(seg => {
      const sweep = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, startAngle + sweep);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.shadowColor = seg.color; ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
      startAngle += sweep;
    });

    // Hole
    ctx.beginPath();
    ctx.arc(cx, cy, ri, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f4ef';
    ctx.fill();

    // Center text
    ctx.fillStyle = '#0d1f0d';
    ctx.font = 'bold 24px Syne, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('96%', cx, cy + 5);
    ctx.fillStyle = '#9ab89a';
    ctx.font = '500 10px JetBrains Mono, monospace';
    ctx.fillText('SUCCESS', cx, cy + 20);

    // Legend
    ctx.textAlign = 'left';
    segments.forEach((seg, i) => {
      const lx = W / 2 - 60 + i * 55, ly = H - 20;
      ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2);
      ctx.fillStyle = seg.color; ctx.fill();
      ctx.fillStyle = '#6b8f6b';
      ctx.font = '500 10px JetBrains Mono, monospace';
      ctx.fillText(seg.label, lx + 9, ly + 4);
    });
  }

  function drawTimeChart() {
    const canvas = document.getElementById('time-chart');
    if (!canvas || canvas._drawn) return;
    canvas._drawn = true;
    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.clientWidth, H = 220;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const data   = [6,8,7,12,9,7,8,10,6,7,9,8,11,7,8];
    const labels = data.map((_, i) => `D${i+1}`);
    drawBarChart(ctx, W, H, data, labels, '#0ea5e9');
  }

  // ── Helper: rounded rect ───────────────────────
  function roundRect2(ctx, x, y, w, h, r) {
    ctx.beginPath();
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

  return { initAnalytics, initAnalyticsView, updateAIPrediction };
})();

window.AnalyticsEngine = AnalyticsEngine;
