/* ═══════════════════════════════════════════════
   DELIVERYBOT — Login & Auth Controller
   Full backend auth via FastAPI + MongoDB
═══════════════════════════════════════════════ */

'use strict';

const _IS_LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname);
window.DELIVERYBOT_BACKEND = window.DELIVERYBOT_BACKEND || (
  _IS_LOCAL ? 'localhost:8001' : 'replace-detest-recycling.ngrok-free.dev'
);
const API = `${_IS_LOCAL ? 'http' : 'https'}://${window.DELIVERYBOT_BACKEND}`;

// ── State ─────────────────────────────────────
let pendingAuth = {
  email: null,
  name:  null,
  purpose: null,  // "register" | "login" | "reset"
};
let otpTimer  = null;
let rememberMe = false;

// ── Views: "login" | "signup" | "forgot" ─────
let currentView = 'login';

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  checkAutoLogin();
  wireForgotLink();
});

function checkAutoLogin() {
  const saved = localStorage.getItem('dbUser') || sessionStorage.getItem('dbUser');
  if (saved) {
    try {
      const u = JSON.parse(saved);
      if (u && u.token) { goToDashboard(); }
    } catch {}
  }
}

function wireForgotLink() {
  const link = document.querySelector('.forgot-link');
  if (link) {
    link.href = '#';
    link.onclick = (e) => { e.preventDefault(); showForgotPanel(); };
  }
}

// ── Tab switching ─────────────────────────────
function switchTab(tab) {
  document.getElementById('tab-login').classList.toggle('active',  tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('panel-login').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('panel-signup').style.display = tab === 'signup' ? 'block' : 'none';

  const fp = document.getElementById('panel-forgot');
  if (fp) fp.style.display = 'none';

  currentView = tab;
  clearError();
}

// ── Forgot Password panel ─────────────────────
function showForgotPanel() {
  // Ensure panel exists (inject once)
  if (!document.getElementById('panel-forgot')) {
    const panel = document.createElement('div');
    panel.id = 'panel-forgot';
    panel.innerHTML = `
      <p style="font-size:13px;color:var(--text-muted,#888);margin-bottom:18px;text-align:center">
        Enter your registered email and we'll send a reset code.
      </p>
      <div class="form-group">
        <label class="form-label">Registered Email</label>
        <div class="form-input-wrap">
          <span class="form-input-icon">✉</span>
          <input type="email" class="form-input" id="forgot-email" placeholder="you@university.edu">
          <div class="input-focus-bar"></div>
        </div>
      </div>
      <button class="btn-login" id="btn-forgot" onclick="handleForgotPassword()">
        <span class="btn-text">Send Reset Code</span>
        <div class="btn-spinner"><div class="spinner-ring"></div></div>
      </button>
      <div style="text-align:center;margin-top:14px">
        <a href="#" style="font-size:12px;color:var(--accent,#1db954);cursor:pointer" onclick="switchTab('login')">
          ← Back to Sign In
        </a>
      </div>
    `;
    document.getElementById('panel-login').after(panel);
  }

  document.getElementById('panel-login').style.display  = 'none';
  document.getElementById('panel-signup').style.display = 'none';
  document.getElementById('panel-forgot').style.display = 'block';
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('tab-signup').classList.remove('active');
  currentView = 'forgot';
  clearError();
}

// ── Register ──────────────────────────────────
async function handleSignup() {
  const name  = document.getElementById('signup-name')?.value.trim();
  const email = document.getElementById('signup-email')?.value.trim().toLowerCase();
  const pass  = document.getElementById('signup-pass')?.value;
  const role  = document.getElementById('signup-role')?.value || 'student';
  clearError();

  if (!name || !email || !pass) return showError('Please fill in all fields.');
  if (!isValidEmail(email))     return showError('Enter a valid email address.');
  if (pass.length < 6)          return showError('Password must be at least 6 characters.');

  setLoading('btn-signup', true);
  try {
    const res  = await apiFetch('/auth/register', 'POST', { name, email, password: pass, role });
    pendingAuth = { email, name, purpose: 'register' };
    setLoading('btn-signup', false);
    showOTPModal(email, 'register', res.masked_email, res.dev_otp);
  } catch (err) {
    setLoading('btn-signup', false);
    showError(err.message || 'Registration failed. Is the server running?');
  }
}

// ── Login ─────────────────────────────────────
async function handleLogin() {
  const email = document.getElementById('login-email')?.value.trim().toLowerCase();
  const pass  = document.getElementById('login-pass')?.value;
  clearError();

  if (!email || !pass) return showError('Please fill in all fields.');

  setLoading('btn-login', true);
  try {
    const res = await apiFetch('/auth/login', 'POST', { email, password: pass });
    pendingAuth = { email, name: null, purpose: 'login' };
    setLoading('btn-login', false);
    showOTPModal(email, 'login', res.masked_email, res.dev_otp);
  } catch (err) {
    setLoading('btn-login', false);
    showError(err.message || 'Login failed. Is the server running?');
  }
}

// ── Forgot Password ───────────────────────────
async function handleForgotPassword() {
  const email = document.getElementById('forgot-email')?.value.trim().toLowerCase();
  clearError();
  if (!email) return showError('Enter your email address.');
  if (!isValidEmail(email)) return showError('Enter a valid email address.');

  setLoading('btn-forgot', true);
  try {
    const res = await apiFetch('/auth/forgot-password', 'POST', { email });
    pendingAuth = { email, name: null, purpose: 'reset' };
    setLoading('btn-forgot', false);
    showOTPModal(email, 'reset', res.masked_email, res.dev_otp);
  } catch (err) {
    setLoading('btn-forgot', false);
    showError(err.message || 'Request failed. Is the server running?');
  }
}

// ── OTP Modal ─────────────────────────────────
function showOTPModal(email, purpose, maskedEmail, devOtp) {
  const overlay = document.getElementById('otp-overlay') || (() => {
    const el = document.createElement('div');
    el.id = 'otp-overlay';
    el.className = 'otp-modal-overlay';
    document.body.appendChild(el);
    return el;
  })();

  const isReset = purpose === 'reset';

  overlay.innerHTML = `
    <div class="otp-modal">
      <div class="otp-icon">${isReset ? '🔑' : '📨'}</div>
      <div class="otp-title">${isReset ? 'Reset Password' : 'Check Your Inbox'}</div>
      <div class="otp-sub">
        We sent a 6-digit code to<br>
        <span>${maskedEmail || email}</span>
        ${devOtp ? `<br><small style="color:#1db954;opacity:.8">DEV: <strong>${devOtp}</strong></small>` : ''}
      </div>
      <div class="otp-inputs" id="otp-inputs">
        ${Array(6).fill('<input class="otp-digit" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]">').join('')}
      </div>
      ${isReset ? `
      <div class="form-group" style="margin-top:14px;width:100%">
        <label class="form-label" style="font-size:11px">New Password</label>
        <div class="form-input-wrap">
          <span class="form-input-icon">🔒</span>
          <input type="password" class="form-input" id="new-password" placeholder="Min 6 characters">
          <div class="input-focus-bar"></div>
        </div>
      </div>
      ` : ''}
      <div class="otp-error" id="otp-error"></div>
      <button class="otp-verify-btn" onclick="verifyOTP()">
        ${isReset ? 'Reset Password' : 'Verify & Continue'}
      </button>
      <div class="otp-resend">
        Didn't receive it?
        <a onclick="resendOTP()">Resend</a>
        &nbsp;·&nbsp; Expires in <span class="otp-timer" id="otp-timer">10:00</span>
      </div>
    </div>
  `;

  wireOTPInputs();
  setTimeout(() => overlay.querySelector('.otp-digit')?.focus(), 100);
  startOTPCountdown(10 * 60);
}

function wireOTPInputs() {
  const digits = document.querySelectorAll('.otp-digit');
  digits.forEach((el, i) => {
    el.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val;
      if (val && i < digits.length - 1) digits[i + 1].focus();
      el.classList.toggle('filled', !!val);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !el.value && i > 0) digits[i - 1].focus();
      if (e.key === 'Enter') verifyOTP();
    });
    el.addEventListener('paste', (e) => {
      const data = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (data.length >= 6) {
        digits.forEach((d, j) => { d.value = data[j] || ''; d.classList.toggle('filled', !!data[j]); });
        e.preventDefault();
        setTimeout(verifyOTP, 200);
      }
    });
  });
}

function startOTPCountdown(seconds) {
  if (otpTimer) clearInterval(otpTimer);
  let remaining = seconds;
  const timerEl = () => document.getElementById('otp-timer');
  otpTimer = setInterval(() => {
    remaining--;
    const el = timerEl();
    if (!el) { clearInterval(otpTimer); return; }
    if (remaining <= 0) {
      clearInterval(otpTimer);
      el.textContent = 'EXPIRED';
      el.style.color = '#ef4444';
      return;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

async function verifyOTP() {
  const digits  = document.querySelectorAll('.otp-digit');
  const entered = Array.from(digits).map(d => d.value).join('');
  if (entered.length < 6) { showOTPError('Enter all 6 digits.'); return; }

  const { email, purpose } = pendingAuth;

  try {
    if (purpose === 'register') {
      await apiFetch('/auth/verify-email', 'POST', { email, otp: entered });
      closeOTPModal();
      showError(''); // clear any old error
      switchTab('login');
      // Show success toast style in the error area as success
      const el = document.getElementById('form-error');
      if (el) {
        el.style.display = 'flex';
        el.style.background = 'rgba(29,185,84,0.12)';
        el.style.borderColor = 'rgba(29,185,84,0.3)';
        el.style.color = '#1db954';
        document.getElementById('error-text').textContent = 'Account verified — sign in now!';
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 4000);
      }

    } else if (purpose === 'login') {
      const res = await apiFetch('/auth/verify-login', 'POST', { email, otp: entered });
      closeOTPModal();
      saveAndRedirect(res);

    } else if (purpose === 'reset') {
      const newPass = document.getElementById('new-password')?.value;
      if (!newPass || newPass.length < 6) { showOTPError('Enter a new password (min 6 chars).'); return; }
      await apiFetch('/auth/reset-password', 'POST', { email, otp: entered, new_password: newPass });
      closeOTPModal();
      switchTab('login');
      const el = document.getElementById('form-error');
      if (el) {
        el.style.display = 'flex';
        el.style.background = 'rgba(29,185,84,0.12)';
        el.style.borderColor = 'rgba(29,185,84,0.3)';
        el.style.color = '#1db954';
        document.getElementById('error-text').textContent = 'Password reset! Sign in with your new password.';
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 5000);
      }
    }
  } catch (err) {
    showOTPError(err.message || 'Invalid code. Try again.');
    digits.forEach(d => { d.value = ''; d.classList.remove('filled'); });
    digits[0]?.focus();
  }
}

async function resendOTP() {
  const { email, purpose } = pendingAuth;
  if (!email || !purpose) return;
  try {
    const res = await apiFetch('/auth/resend-otp', 'POST', { email, purpose });
    const digits = document.querySelectorAll('.otp-digit');
    digits.forEach(d => { d.value = ''; d.classList.remove('filled'); });
    digits[0]?.focus();
    hideOTPError();
    startOTPCountdown(10 * 60);

    // If email not configured, show dev OTP in modal
    if (res.dev_otp) {
      const sub = document.querySelector('.otp-sub');
      if (sub) {
        const existing = sub.querySelector('.dev-otp');
        if (existing) existing.remove();
        const el = document.createElement('small');
        el.className = 'dev-otp';
        el.style.cssText = 'display:block;color:#1db954;margin-top:6px';
        el.innerHTML = `DEV: <strong>${res.dev_otp}</strong>`;
        sub.appendChild(el);
      }
    }
  } catch {}
}

function showOTPError(msg) {
  const el = document.getElementById('otp-error');
  if (el) { el.textContent = msg; el.classList.add('show'); }
}
function hideOTPError() {
  const el = document.getElementById('otp-error');
  if (el) el.classList.remove('show');
}
function closeOTPModal() {
  const overlay = document.getElementById('otp-overlay');
  if (overlay) overlay.innerHTML = '';
  clearInterval(otpTimer);
}

// ── Redirect after login ──────────────────────
function saveAndRedirect(userData) {
  // userData: { token, name, email, role }
  const payload = JSON.stringify(userData);
  sessionStorage.setItem('dbUser', payload);
  if (rememberMe) localStorage.setItem('dbUser', payload);

  document.body.style.transition = 'opacity 0.5s ease';
  document.body.style.opacity = '0';
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
}

function goToDashboard() {
  window.location.href = 'dashboard.html';
}

// ── API helper ────────────────────────────────
async function apiFetch(path, method, body) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach server at ${API} — is the Python backend running?`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || `HTTP ${res.status}`);
  }
  return data;
}

// ── Error helpers ─────────────────────────────
function showError(msg) {
  const el   = document.getElementById('form-error');
  const text = document.getElementById('error-text');
  if (!el || !text) return;
  if (!msg) { el.classList.remove('show'); el.style.display = 'none'; return; }
  // Reset style for error
  el.style.background   = '';
  el.style.borderColor  = '';
  el.style.color        = '';
  text.textContent      = msg;
  el.style.display      = 'flex';
  el.classList.add('show');
}
function clearError() {
  showError('');
}

// ── Button loading state ──────────────────────
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

// ── Utilities ─────────────────────────────────
function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function togglePwd() {
  const inp = document.getElementById('login-pass');
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}
function toggleRemember() {
  rememberMe = !rememberMe;
  document.getElementById('remember-check')?.classList.toggle('checked', rememberMe);
}
function fillDemo(email, pass) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-pass').value  = pass;
  switchTab('login');
  clearError();
  showError('Demo credentials filled — tap "Access System" to continue (server must be running).');
  setTimeout(clearError, 4000);
}

// ── Particle animation ─────────────────────────
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.8 + 0.4,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.5 + 0.1,
      pulse: Math.random() * Math.PI * 2,
    };
  }

  function init() { resize(); particles = Array.from({ length: 100 }, makeParticle); }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.pulse += 0.02;
      const alpha = p.opacity * (0.7 + 0.3 * Math.sin(p.pulse));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(29,185,84,${alpha})`; ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
    });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx*dx + dy*dy);
        if (d < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(29,185,84,${0.07*(1-d/100)})`;
          ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init(); draw();
}
