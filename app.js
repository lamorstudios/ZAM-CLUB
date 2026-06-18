/**
 * ZAM Club — App Logic v2
 * SPA navigation · localStorage persistence · Demo interactions
 * Supabase-ready: replace Storage.* calls with API calls
 */

'use strict';

// =============================================
// localStorage Abstraction (Supabase-ready)
// =============================================
const Storage = {
  KEY: 'zamclub_v1',

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || 'null') || {};
    } catch {
      return {};
    }
  },

  save(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch {
      // Quota exceeded or private mode — silent fail
    }
  },

  get(key, fallback = null) {
    return this.load()[key] ?? fallback;
  },

  set(key, value) {
    const data = this.load();
    data[key] = value;
    this.save(data);
  },

  // Date helpers
  todayKey() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  },

  isToday(dateStr) {
    return dateStr === this.todayKey();
  },
};

// =============================================
// State (loaded from localStorage on init)
// =============================================
const state = {
  currentPage: 'home',
  eventFilter: 'all',
  posts: [],
  events: [],
  deals: [],
  merchants: [],
};

// =============================================
// DOM Helpers
// =============================================
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'innerHTML') e.innerHTML = v;
    else if (k === 'textContent') e.textContent = v;
    else e.setAttribute(k, v);
  });
  return e;
}

// =============================================
// Countdown Timer Badges
// =============================================
function _countdownBadge(expiryStr) {
  if (!expiryStr) return '';
  // Accept both 'YYYY-MM-DD' (deals) and full ISO datetime (rewards)
  const expDate = expiryStr.includes('T')
    ? new Date(expiryStr)
    : new Date(expiryStr + 'T23:59:59');
  const msLeft = expDate - Date.now();

  if (msLeft <= 0) {
    return `<span class="countdown-badge countdown-expired">⌛ Abgelaufen</span>`;
  }
  const hoursLeft = msLeft / 3600000;
  const daysLeft  = Math.ceil(msLeft / 86400000);

  if (hoursLeft < 24) {
    const h = String(Math.floor(hoursLeft)).padStart(2, '0');
    const m = String(Math.floor((msLeft % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0');
    return `<span class="countdown-badge countdown-urgent" data-expiry="${expiryStr}">⏳ Noch ${h}:${m}:${s}</span>`;
  }
  if (daysLeft === 1) {
    return `<span class="countdown-badge countdown-urgent">⏳ Läuft heute ab</span>`;
  }
  if (daysLeft <= 5) {
    return `<span class="countdown-badge countdown-soon">⏳ Noch ${daysLeft} Tage</span>`;
  }
  return `<span class="countdown-badge countdown-active">⏳ Noch ${daysLeft} Tage</span>`;
}

let _countdownInterval = null;
function _startCountdownTicker() {
  if (_countdownInterval) return;
  let _tickFast = true;
  let _slowTicks = 0;
  function _tick() {
    if (document.hidden) return;
    const badges = document.querySelectorAll('[data-expiry]');
    if (!badges.length) return;
    let hasSeconds = false;
    badges.forEach(badge => {
      const expiryStr = badge.dataset.expiry;
      const expDate = expiryStr.includes('T') ? new Date(expiryStr) : new Date(expiryStr + 'T23:59:59');
      const msLeft  = expDate - Date.now();
      if (msLeft <= 0) {
        badge.textContent  = '⌛ Abgelaufen';
        badge.className    = 'countdown-badge countdown-expired';
        badge.removeAttribute('data-expiry');
      } else if (msLeft < 86400000) {
        hasSeconds = true;
        const h = String(Math.floor(msLeft / 3600000)).padStart(2, '0');
        const m = String(Math.floor((msLeft % 3600000) / 60000)).padStart(2, '0');
        const s = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0');
        badge.textContent = `⏳ Noch ${h}:${m}:${s}`;
      } else {
        const days = Math.floor(msLeft / 86400000);
        badge.textContent = `⏳ Noch ${days} Tag${days !== 1 ? 'e' : ''}`;
      }
    });
    _tickFast = hasSeconds;
  }
  _countdownInterval = setInterval(() => {
    _slowTicks++;
    const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
    const inPerfMode = user?.role === 'merchant' || user?.role === 'admin';
    // In perf-mode, only tick every 60s regardless of hasSeconds
    if (!inPerfMode && _tickFast) { _tick(); return; }
    if (_slowTicks % 60 === 0) _tick();
  }, 1000);
}

// =============================================
// Toast Notifications
// =============================================
let toastTimer = null;

function showToast(message, type = '') {
  let toast = $('#zam-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'zam-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  requestAnimationFrame(() => {
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  });
}

// =============================================
// Points System
// =============================================
async function addPoints(amount, reason = '') {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const ptsBefore = user?.points || 0;
  const tierBefore = _getTier(ptsBefore);

  const newPts = await ZAMApi.points.add(amount, reason, reason);

  const tierAfter = _getTier(newPts || ptsBefore + amount);
  const leveledUp = tierAfter.key !== tierBefore.key;

  // Animated counter on home card
  const homeEl = document.getElementById('home-points-value');
  if (homeEl) _animateCounter(homeEl, ptsBefore, newPts || ptsBefore + amount, 900);

  updatePointsDisplay(false);
  showPointsAnimation(amount, reason);

  if (leveledUp) {
    setTimeout(() => showLevelUpAnimation(tierAfter), 1600);
    // Unlock legend achievement
    if (tierAfter.key === 'legend') _unlockAchievement('zam_legend');
  }

  return newPts;
}

function updatePointsDisplay(animate = false) {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const pts = user.points || 0;
  const homeEl = $('#home-points-value');
  const profileEl = $('#profile-points-value');
  const progressLabel = $('.points-progress-label');
  const levelBadge = $('.profile-level-badge');

  if (homeEl) {
    if (animate) {
      homeEl.classList.add('points-pop');
      homeEl.addEventListener('animationend', () => homeEl.classList.remove('points-pop'), { once: true });
    }
    homeEl.textContent = pts.toLocaleString('de-DE');
  }
  if (profileEl) profileEl.textContent = pts.toLocaleString('de-DE');

  // Tier (new 6-level system)
  const tier = _getTier(pts);
  const nextTier = _getNextTier(pts);
  if (levelBadge) levelBadge.textContent = tier.label.toUpperCase();
  const levelEl = $('.points-level');
  if (levelEl) levelEl.innerHTML = `<span class="points-level-dot"></span>${tier.emoji} ${tier.label} Member`;

  // Progress bar
  const progressFill = $('.points-progress-fill');
  if (progressFill) {
    const pct = nextTier
      ? Math.min(((pts - tier.min) / (nextTier.min - tier.min)) * 100, 100)
      : 100;
    progressFill.style.width = pct + '%';
  }
  if (progressLabel) {
    if (!nextTier) {
      progressLabel.textContent = `👑 Legend – Maximales Level!`;
    } else {
      const remaining = (nextTier.min - pts).toLocaleString('de-DE');
      progressLabel.textContent = `${nextTier.emoji} Noch ${remaining} Punkte bis ${nextTier.label}`;
    }
  }

  // Apply tier ring to profile avatar
  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl && avatarEl.parentElement) {
    avatarEl.parentElement.classList.forEach(c => { if (c.startsWith('tier-ring')) avatarEl.parentElement.classList.remove(c); });
    avatarEl.parentElement.classList.add('tier-ring', `tier-ring--${tier.key}`);
  }
}

// =============================================
// GAMIFICATION — Tiers, Animations, Streaks
// =============================================

const _TIERS = [
  { key: 'starter', label: 'Starter',  emoji: '🔵', min: 0,     max: 999,      color: '#3b82f6', perks: '✅ Zugang zu Community\n✅ Tägliche Spin-Chancen' },
  { key: 'silver',  label: 'Silber',   emoji: '⚪', min: 1000,  max: 2999,     color: '#9ca3af', perks: '✅ Silber-Profilrahmen\n✅ Exklusive Silver-Deals' },
  { key: 'gold',    label: 'Gold',     emoji: '🟡', min: 3000,  max: 7499,     color: '#F7AB00', perks: '✅ Goldener Profilrahmen\n✅ Bonus-Punkte bei Events\n✅ Gold-Exklusive Angebote' },
  { key: 'platin',  label: 'Platin',   emoji: '✨', min: 7500,  max: 14999,    color: '#e2e8f0', perks: '✅ Animierter Platin-Rahmen\n✅ Frühzeitiger Deal-Zugang\n✅ VIP-Event-Einladungen' },
  { key: 'diamond', label: 'Diamond',  emoji: '💎', min: 15000, max: 24999,    color: '#60a5fa', perks: '✅ Diamant-Rahmen + Partikel\n✅ Diamond-Lounge Zugang\n✅ Persönlicher Vorteil-Code' },
  { key: 'legend',  label: 'Legend',   emoji: '👑', min: 25000, max: Infinity,  color: '#F7AB00', perks: '✅ Goldener Legend-Rahmen\n✅ Krone + Gold-Partikel\n✅ Hall of Fame Eintrag\n✅ Alle Vorteile inklusive' },
];

function _getTier(pts) {
  for (let i = _TIERS.length - 1; i >= 0; i--) {
    if (pts >= _TIERS[i].min) return _TIERS[i];
  }
  return _TIERS[0];
}

function _getNextTier(pts) {
  const cur = _getTier(pts);
  const idx = _TIERS.indexOf(cur);
  return idx < _TIERS.length - 1 ? _TIERS[idx + 1] : null;
}

function _tierRingHTML(pts, size = 40, initials = '?', color = '#FA4615') {
  const tier = _getTier(pts);
  return `<div class="tier-ring tier-ring--${tier.key}" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.round(size*0.32)}px;font-weight:800;color:#fff">${initials}</div>`;
}

function _tierBadgeHTML(pts) {
  const tier = _getTier(pts);
  return `<span class="tier-badge tier-badge--${tier.key}">${tier.emoji} ${tier.label}</span>`;
}

// Animated counter — ticks from `from` to `to` over `ms` ms
function _animateCounter(el, from, to, ms = 900) {
  if (!el) return;
  const start = performance.now();
  const diff = to - from;
  function frame(now) {
    const elapsed = Math.min(now - start, ms);
    const progress = 1 - Math.pow(1 - elapsed / ms, 3); // ease-out cubic
    el.textContent = Math.round(from + diff * progress).toLocaleString('de-DE');
    if (elapsed < ms) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Points float animation — big badge appears in center, then fades out
function showPointsAnimation(amount, reason = '') {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const pts = user?.points || 0;
  const nextTier = _getNextTier(pts);
  const goalText = nextTier
    ? `⭐ Noch ${(nextTier.min - pts).toLocaleString('de-DE')} Punkte bis ${nextTier.emoji} ${nextTier.label}`
    : '👑 Maximales Level erreicht!';

  let overlay = document.getElementById('zam-pts-anim');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'zam-pts-anim';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="zam-pts-badge">⭐ +${amount}</div>
    ${reason ? `<div class="zam-pts-label">${reason}</div>` : ''}
    <div class="zam-pts-goal">${goalText}</div>`;

  // Spawn confetti
  _spawnConfetti(16);

  // Auto-dismiss after 1.4s with fly-out
  setTimeout(() => {
    const badge = overlay.querySelector('.zam-pts-badge');
    if (badge) badge.style.animation = 'pts-fly-out 0.4s ease forwards';
    setTimeout(() => { overlay.innerHTML = ''; }, 450);
  }, 1200);
}

function _spawnConfetti(count = 20) {
  const colors = ['#FA4615','#F7AB00','#34d399','#60a5fa','#f472b6','#a78bfa'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const x = (Math.random() - 0.5) * 260;
    const y = -(80 + Math.random() * 160);
    const rot = (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360);
    const dur = 0.8 + Math.random() * 0.6;
    piece.style.cssText = `left:${40 + Math.random()*20}%;top:35%;background:${colors[i % colors.length]};--fx:${x}px;--fy:${y}px;--rot:${rot}deg;--dur:${dur}s;border-radius:${Math.random() > 0.5 ? '50%' : '2px'};width:${6+Math.random()*6}px;height:${6+Math.random()*6}px`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), dur * 1000 + 100);
  }
}

// Level-up celebration overlay
function showLevelUpAnimation(tier) {
  let overlay = document.getElementById('zam-levelup-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'zam-levelup-overlay';
  overlay.innerHTML = `
    <div class="zam-levelup-card">
      <span class="zam-levelup-emoji">${tier.emoji}</span>
      <div class="zam-levelup-title">🎉 Level aufgestiegen!</div>
      <div class="zam-levelup-name">${tier.label}</div>
      <div class="zam-levelup-sub">Neues Level erreicht</div>
      <div class="zam-levelup-perks">${tier.perks.replace(/\n/g,'<br>')}</div>
      <button class="zam-levelup-close" onclick="document.getElementById('zam-levelup-overlay').remove()">🎉 Weiter!</button>
    </div>`;
  document.body.appendChild(overlay);
  _spawnConfetti(35);
  // Auto-close after 4s
  setTimeout(() => overlay?.remove(), 4000);
}

// Helper: derive demo pts for any userId/name combo (consistent per user)
function _demoUserPts(userId) {
  if (!userId) return 500;
  const found = _RANKING_DEMO.find(u => userId.includes(u.initials?.toLowerCase?.()));
  if (found) return found.pts;
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return 500 + (h % 4200);
}

// Tier popup — small card shown when tapping a tier badge
function showTierInfoPopup(name, pts, anchorEl) {
  document.getElementById('zam-tier-popup')?.remove();
  const tier = _getTier(pts);
  const nextTier = _getNextTier(pts);
  const popup = document.createElement('div');
  popup.id = 'zam-tier-popup';
  popup.style.cssText = 'position:fixed;z-index:8800;background:#1e1e2e;border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px 16px;box-shadow:0 8px 40px rgba(0,0,0,0.7);min-width:200px;max-width:240px;font-family:var(--font);animation:fadeUp 0.2s ease both';
  popup.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:1.5rem">${tier.emoji}</span>
      <div>
        <div style="font-size:0.85rem;font-weight:800;color:#fff">${name}</div>
        <div style="font-size:0.65rem;color:${tier.color};font-weight:700">${tier.label} Mitglied</div>
      </div>
    </div>
    <div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-bottom:6px">Aktuelle Punkte: <strong style="color:#F7AB00">${pts.toLocaleString('de-DE')}</strong></div>
    ${nextTier ? `<div style="font-size:0.68rem;color:rgba(255,255,255,0.35)">Nächstes Ziel: <strong style="color:${nextTier.color}">${nextTier.emoji} ${nextTier.label}</strong><br>Noch ${(nextTier.min - pts).toLocaleString('de-DE')} Punkte</div>` : `<div style="font-size:0.68rem;color:#F7AB00">👑 Maximales Level erreicht!</div>`}`;
  // Position near anchor element
  if (anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    const top = Math.min(r.bottom + 6, window.innerHeight - 170);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 250));
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  } else {
    popup.style.top = '50%'; popup.style.left = '50%';
    popup.style.transform = 'translate(-50%,-50%)';
  }
  document.body.appendChild(popup);
  setTimeout(() => { document.addEventListener('click', () => popup.remove(), { once: true }); }, 50);
}

// =============================================
// PROFILE UPGRADE — Banner, Top Badges, Title, Vitrine
// =============================================

const _PROFILE_BANNERS = [
  // ── Free (always unlocked) ──
  { key: 'classic',        name: 'Orange Energy',     gradient: 'linear-gradient(135deg,#7c1d08 0%,#c43510 30%,#FA4615 60%,#ff8c42 85%,#ffd200 100%)',             req_pts: 0,     anim_class: 'bx-orange-energy' },
  { key: 'orange_glow',    name: 'Aurora',             gradient: 'linear-gradient(135deg,#0a0a1a 0%,#0f3460 25%,#1a6b4a 50%,#16a34a 70%,#4ade80 90%,#22d3ee 100%)',req_pts: 0,     anim_class: 'bx-aurora' },
  { key: 'dark_premium',   name: 'Carbon Black',       gradient: 'linear-gradient(135deg,#0a0a0a 0%,#1c1c1c 35%,#2a2a2a 65%,#111111 100%)',                        req_pts: 0,     anim_class: 'bx-carbon' },
  // ── Points-unlocked ──
  { key: 'silver_clean',   name: 'Platinum',           gradient: 'linear-gradient(135deg,#1e293b 0%,#475569 25%,#94a3b8 55%,#e2e8f0 80%,#f8fafc 100%)',            req_pts: 2000,  anim_class: 'bx-platinum' },
  { key: 'gold_champion',  name: 'Gold Prestige',      gradient: 'linear-gradient(135deg,#451a03 0%,#92400e 20%,#d97706 45%,#fef08a 65%,#F7AB00 85%,#d97706 100%)',req_pts: 3000,  anim_class: 'bx-gold' },
  { key: 'food_lover',     name: 'Creator',            gradient: 'linear-gradient(135deg,#18181b 0%,#27272a 30%,#3f3f46 55%,#7c3aed 80%,#a78bfa 100%)',            req_pts: 3500,  anim_class: 'bx-creator' },
  { key: 'fitness_energy', name: 'Champion',           gradient: 'linear-gradient(135deg,#0c0c1a 0%,#1e1b4b 25%,#1d4ed8 55%,#0ea5e9 80%,#38bdf8 100%)',           req_pts: 6000,  anim_class: 'bx-champion' },
  { key: 'shopping_night', name: 'Neon Grid',          gradient: 'linear-gradient(135deg,#030712 0%,#0a0a1f 30%,#0f172a 60%,#1e1b4b 80%,#312e81 100%)',           req_pts: 9000,  anim_class: 'bx-neon' },
  { key: 'platin_light',   name: 'Tech',               gradient: 'linear-gradient(135deg,#020617 0%,#0c1445 25%,#1d4ed8 50%,#0ea5e9 75%,#22d3ee 100%)',           req_pts: 13000, anim_class: 'bx-tech' },
  { key: 'diamond_spark',  name: 'Diamond',            gradient: 'linear-gradient(135deg,#0a1628 0%,#1e3a8a 25%,#2563eb 50%,#60a5fa 72%,#bfdbfe 88%,#e0f2fe 100%)',req_pts: 15000, anim_class: 'bx-diamond' },
  { key: 'event_vibes',    name: 'Galaxy',             gradient: 'linear-gradient(135deg,#020409 0%,#0a0a1a 30%,#0f172a 55%,#1e1b4b 75%,#312e81 90%,#1e1b4b 100%)',req_pts: 20000, anim_class: 'bx-galaxy' },
  { key: 'legend_crown',   name: 'Legend',             gradient: 'linear-gradient(135deg,#1c0a00 0%,#78350f 18%,#b45309 38%,#F7AB00 55%,#fef08a 70%,#F7AB00 85%,#92400e 100%)', req_pts: 25000, anim_class: 'bx-legend', rare: true },
  { key: 'neon_map',       name: 'Freiham Elite',      gradient: 'linear-gradient(135deg,#0f0a1a 0%,#1a0a2e 25%,#2d1b69 50%,#7c3aed 75%,#a78bfa 90%,#c4b5fd 100%)',req_pts: 30000, anim_class: 'bx-freiham', rare: true },
  { key: 'community_hero', name: 'Hall of Fame',       gradient: 'linear-gradient(135deg,#0c0a05 0%,#1c1400 20%,#713f12 40%,#b45309 60%,#F7AB00 78%,#fef3c7 92%,#fffbeb 100%)', req_pts: 40000, anim_class: 'bx-hall', rare: true },
  { key: 'secret_rare',    name: 'Founder Edition',    gradient: 'linear-gradient(135deg,#0f0c29 0%,#1e1b4b 18%,#4c1d95 36%,#7c3aed 54%,#a855f7 72%,#ec4899 88%,#f472b6 100%)', req_pts: 50000, anim_class: 'bx-founder', rare: true },
  // ── Achievement-unlocked ──
  { key: 'challenge_pro',  name: 'Photo Hero',         gradient: 'linear-gradient(135deg,#0c0a09 0%,#1c0a00 25%,#7c2d12 50%,#ea580c 72%,#fb923c 88%,#fed7aa 100%)', req_achievement: 'challenge_master', req_label: '100 Foto-Challenge-Fotos', req_progress_key: 'photo_challenges', req_progress_max: 100, anim_class: 'bx-photo' },
  { key: 'lucky_spin',     name: 'Deal Hunter',        gradient: 'linear-gradient(135deg,#052e16 0%,#064e3b 22%,#065f46 44%,#059669 66%,#34d399 84%,#a7f3d0 100%)', req_achievement: 'shopping_king',    req_label: '25 Deals eingelöst',      req_progress_key: 'deals',           req_progress_max: 25,  anim_class: 'bx-deal' },
  { key: 'qr_master',      name: 'Explorer',           gradient: 'linear-gradient(135deg,#012d22 0%,#064e3b 22%,#0284c7 50%,#0ea5e9 72%,#38bdf8 88%,#bae6fd 100%)', req_achievement: 'event_hunter',     req_label: '10 Events besucht',       req_progress_key: 'events',          req_progress_max: 10,  anim_class: 'bx-explorer' },
  { key: 'food_explorer',  name: 'Event Master',       gradient: 'linear-gradient(135deg,#1a0533 0%,#4c0d9f 22%,#7c3aed 44%,#a855f7 66%,#e879f9 84%,#fdf4ff 100%)', req_achievement: 'food_explorer',    req_label: '20 Food-Deals eingelöst', req_progress_key: 'food_deals',      req_progress_max: 20,  anim_class: 'bx-event' },
  { key: 'event_hunter',   name: 'Diamond Club',       gradient: 'linear-gradient(135deg,#020d1f 0%,#0c2461 22%,#1a56db 44%,#60a5fa 66%,#bfdbfe 84%,#dbeafe 100%)', req_achievement: 'zam_legend',       req_label: 'Legend-Status erreichen', req_progress_key: 'events',          req_progress_max: 5,   anim_class: 'bx-dclub' },
];

const _PROFILE_TITLES = [
  { key: 'starter',           label: '⭐ Starter',            req: null,              req_pts: 0,     desc: 'Immer freigeschaltet' },
  { key: 'food_explorer',     label: '🍔 Food Explorer',      req: 'food_explorer',   desc: '3 Food-Händler besucht' },
  { key: 'event_hunter',      label: '🏃 Event Hunter',       req: 'event_hunter',    desc: '5 Events besucht' },
  { key: 'foto_profi',        label: '📸 Foto-Profi',         req: 'foto_profi',      desc: '5 Fotos geteilt' },
  { key: 'shopping_king',     label: '🛍️ Shopping King',      req: 'shopping_king',   desc: '10 Deals eingelöst' },
  { key: 'glueckspilz',       label: '🎰 Glückspilz',         req: 'glueckspilz',     desc: '3× Daily Spin gewonnen' },
  { key: 'challenge_master',  label: '🔥 Challenge Master',   req: 'challenge_master',desc: '10 Challenges abgeschlossen' },
  { key: 'zam_legend',        label: '👑 ZAM Legend',         req: 'zam_legend',      desc: 'Legend-Status erreicht' },
  { key: 'diamond_veteran',   label: '💎 Diamond Veteran',    req: null,              req_pts: 15000, desc: '15.000 Punkte erreichen' },
  { key: 'legend_veteran',    label: '🌟 Legend Veteran',     req: null,              req_pts: 25000, desc: '25.000 Punkte erreichen' },
  { key: 'quarter_champion',  label: '🏆 Quartals-Champion',  req: 'quarter_champion',desc: 'Platz 1 im Quartal erreichen' },
];

const _VITRINE_ITEMS = [
  { key: 'first_checkin',     icon: '🏁', name: 'Erster Check-in',    rarity: 'common',    desc: 'Willkommen im ZAM Club!' },
  { key: 'early_adopter',     icon: '⚡', name: 'Early Adopter',      rarity: 'rare',      desc: 'Unter den ersten 1.000 Mitgliedern' },
  { key: 'monthly_top10',     icon: '🏆', name: 'Monats-Top 10',      rarity: 'epic',      desc: 'Unter den Top 10 im Monat-Ranking' },
  { key: 'streak_30',         icon: '🔥', name: '30 Tage Streak',     rarity: 'epic',      desc: '30 Tage am Stück aktiv' },
  { key: 'deal_master',       icon: '🎯', name: 'Deal Master',        rarity: 'rare',      desc: '25 Deals eingelöst' },
  { key: 'social_butterfly',  icon: '🦋', name: 'Social Butterfly',   rarity: 'rare',      desc: '10 Freunde im ZAM Club' },
  { key: 'spin_jackpot',      icon: '💰', name: 'Jackpot',            rarity: 'epic',      desc: 'Händler-Preis beim Spin gewonnen' },
  { key: 'quarter_champion',  icon: '👑', name: 'Quartals-Champion',  rarity: 'legendary', desc: 'Platz 1–3 im Quartal' },
  { key: 'zam_original',      icon: '💎', name: 'ZAM Original',       rarity: 'legendary', desc: 'Besondere Auszeichnung' },
];

const _RARITY_COLORS = { common: 'rgba(255,255,255,0.5)', rare: '#60a5fa', epic: '#a78bfa', legendary: '#F7AB00' };

// ── Storage helpers ──
function _getBanner() { return localStorage.getItem('zam_profile_banner') || 'classic'; }
function _setBanner(key) { localStorage.setItem('zam_profile_banner', key); }
function _getTopBadges() { try { return JSON.parse(localStorage.getItem('zam_top_badges') || '[]'); } catch { return []; } }
function _setTopBadges(arr) { localStorage.setItem('zam_top_badges', JSON.stringify(arr.slice(0, 3))); }
function _getProfileTitle() { return localStorage.getItem('zam_profile_title') || ''; }
function _setProfileTitle(key) { localStorage.setItem('zam_profile_title', key); }
function _getVitrine() { try { return JSON.parse(localStorage.getItem('zam_vitrine_v1') || '["first_checkin","early_adopter"]'); } catch { return []; } }

// ── Banner unlock logic ──
function _isBannerUnlocked(banner, pts) {
  if (!banner.req_achievement) {
    // Points-based (req_pts: 0 = always free)
    return pts >= (banner.req_pts || 0);
  }
  // Achievement-based
  return _getAchievements().includes(banner.req_achievement);
}

function _bannerProgress(banner, pts) {
  if (banner.req_pts !== undefined && !banner.req_achievement) {
    return { current: pts, max: banner.req_pts, label: `${pts.toLocaleString('de-DE')} / ${banner.req_pts.toLocaleString('de-DE')} Punkte` };
  }
  if (banner.req_achievement) {
    const user = ZAMApi.auth.currentUser();
    const d = user ? JSON.parse(localStorage.getItem(`zamclub_u_${user.id}`) || '{}') : {};
    const stats = d.stats || {};
    const key = banner.req_progress_key;
    const cur = key ? (stats[key] || 0) : 0;
    const max = banner.req_progress_max || 1;
    return { current: cur, max, label: `${cur} / ${max} ${banner.req_label.split(' ').slice(-1)[0]}` };
  }
  return null;
}

// ── Apply banner to profile hero ──
function _applyProfileBanner(containerId = 'profile-banner') {
  const el = document.getElementById(containerId);
  if (!el) return;
  const key = _getBanner();
  const banner = _PROFILE_BANNERS.find(b => b.key === key) || _PROFILE_BANNERS[0];
  el.style.background = banner.gradient;
  el.classList.toggle('banner-rare', !!banner.rare);
  // Apply/remove animation class
  _PROFILE_BANNERS.forEach(b => { if (b.anim_class) el.classList.remove(b.anim_class); });
  if (banner.anim_class) el.classList.add(banner.anim_class);
}

// ── Render top badges in hero ──
function _renderTopBadgesDisplay(containerId = 'profile-top-badges-display') {
  const c = document.getElementById(containerId);
  if (!c) return;
  const selected = _getTopBadges();
  const allBadges = [..._ACHIEVEMENTS, ...ZAMData?.badges || []];
  const slots = [0, 1, 2].map(i => selected[i]);
  c.innerHTML = slots.map(key => {
    const badge = allBadges.find(b => b.key === key);
    return badge
      ? `<div class="profile-top-badge" title="${badge.name}" onclick="showToast('${badge.icon} ${badge.name}')">${badge.icon}</div>`
      : `<div class="profile-top-badge empty" onclick="openTopBadgePicker()">+</div>`;
  }).join('');
}

// ── Render profile title ──
function _renderProfileTitle(containerId = 'profile-title-display') {
  const c = document.getElementById(containerId);
  if (!c) return;
  const key = _getProfileTitle();
  if (!key) { c.innerHTML = `<span class="profile-title-chip" onclick="openTitlePicker()">🏷️ Titel auswählen</span>`; return; }
  const t = _PROFILE_TITLES.find(x => x.key === key);
  if (t) c.innerHTML = `<span class="profile-title-chip" onclick="openTitlePicker()">${t.label}</span>`;
}

// ── Render Vitrine ──
function renderProfileVitrine(containerId = 'profile-vitrine') {
  const c = document.getElementById(containerId);
  if (!c) return;
  const earned = _getVitrine();
  const achievements = _getAchievements();
  const all = _VITRINE_ITEMS.map(v => ({ ...v, unlocked: earned.includes(v.key) || achievements.includes(v.key) }));
  const unlocked = all.filter(v => v.unlocked);
  const locked = all.filter(v => !v.unlocked).slice(0, 9 - unlocked.length);
  const display = [...unlocked, ...locked].slice(0, 9);
  c.innerHTML = `
    <div class="vitrine-title">🏆 Erfolgs-Vitrine</div>
    <div class="vitrine-grid">
      ${display.map(v => `
        <div class="vitrine-card ${v.unlocked ? (v.rarity === 'legendary' || v.rarity === 'epic' ? 'rare' : 'earned') : ''}" title="${v.desc}">
          <div class="vitrine-card-icon" style="${v.unlocked ? '' : 'filter:grayscale(1) opacity(0.3)'}">${v.icon}</div>
          <div class="vitrine-card-name">${v.name}</div>
          <div class="vitrine-card-rarity" style="color:${v.unlocked ? _RARITY_COLORS[v.rarity] : 'rgba(255,255,255,0.2)'}">${v.rarity}</div>
        </div>`).join('')}
    </div>`;
}

// ── Banner Picker — full redesign with 20 banners ──
function openBannerPicker() {
  const list = document.getElementById('banner-picker-list');
  const modal = document.getElementById('modal-banner-picker');
  if (!list || !modal) return;
  const current = _getBanner();
  const pts = ZAMApi.auth.currentUser()?.points || ZAMData?.currentUser?.points || 0;

  list.innerHTML = _PROFILE_BANNERS.map(b => {
    const unlocked = _isBannerUnlocked(b, pts);
    const isActive = current === b.key;
    const progress = unlocked ? null : _bannerProgress(b, pts);
    const pct = progress ? Math.min((progress.current / progress.max) * 100, 99) : 0;

    let lockText = '';
    if (!unlocked) {
      if (!b.req_achievement) {
        const diff = b.req_pts - pts;
        lockText = `Noch ${diff.toLocaleString('de-DE')} Pkt.`;
      } else {
        lockText = b.req_label;
      }
    }

    const statusHtml = isActive
      ? `<span class="banner-picker-status bps-active">✓ Aktiv</span>`
      : unlocked
        ? `<span class="banner-picker-status bps-unlocked">Auswählen</span>`
        : `<span class="banner-picker-status bps-locked">Gesperrt</span>`;

    return `
      <div class="banner-picker-card ${isActive ? 'active-banner' : ''} ${unlocked ? '' : 'locked-banner'}"
           onclick="${unlocked ? `selectBanner('${b.key}')` : `showToast('🔒 Dieser Banner ist noch gesperrt.','error')`}">
        <div class="banner-picker-preview ${b.rare ? 'rare-preview' : ''} ${b.anim_class || ''}" style="background:${b.gradient}">
          ${b.rare ? '<span class="banner-rare-tag">✨ Selten</span>' : ''}
          ${!unlocked ? `
            <div class="banner-picker-lock-overlay">
              <span class="banner-lock-icon">🔒</span>
              <span class="banner-lock-req">${lockText}</span>
            </div>` : ''}
        </div>
        <div class="banner-picker-info">
          <span class="banner-picker-name">${b.name}</span>
          ${statusHtml}
        </div>
      </div>`;
  }).join('');

  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('open'));
}

function selectBanner(key) {
  const pts = ZAMApi.auth.currentUser()?.points || ZAMData?.currentUser?.points || 0;
  const banner = _PROFILE_BANNERS.find(b => b.key === key);
  if (!banner || !_isBannerUnlocked(banner, pts)) return;
  _setBanner(key);
  _applyProfileBanner();
  showToast(`🖼️ Banner aktiviert: ${banner.name}`, 'success');
  // Re-render list in-place to update active state without closing
  const list = document.getElementById('banner-picker-list');
  if (list) {
    const pts = ZAMApi.auth.currentUser()?.points || ZAMData?.currentUser?.points || 0;
    const current = key;
    list.innerHTML = _PROFILE_BANNERS.map(b => {
      const unlocked = _isBannerUnlocked(b, pts);
      const isActive = current === b.key;
      const lockText = !unlocked ? (!b.req_achievement ? `Noch ${(b.req_pts - pts).toLocaleString('de-DE')} Pkt.` : b.req_label) : '';
      const statusHtml = isActive ? `<span class="banner-picker-status bps-active">✓ Aktiv</span>` : unlocked ? `<span class="banner-picker-status bps-unlocked">Auswählen</span>` : `<span class="banner-picker-status bps-locked">Gesperrt</span>`;
      return `<div class="banner-picker-card ${isActive ? 'active-banner' : ''} ${unlocked ? '' : 'locked-banner'}" onclick="${unlocked ? `selectBanner('${b.key}')` : `showToast('🔒 Dieser Banner ist noch gesperrt.','error')`}">
        <div class="banner-picker-preview ${b.rare ? 'rare-preview' : ''} ${b.anim_class || ''}" style="background:${b.gradient}">
          ${b.rare ? '<span class="banner-rare-tag">✨ Selten</span>' : ''}
          ${!unlocked ? `<div class="banner-picker-lock-overlay"><span class="banner-lock-icon">🔒</span><span class="banner-lock-req">${lockText}</span></div>` : ''}
        </div>
        <div class="banner-picker-info"><span class="banner-picker-name">${b.name}</span>${statusHtml}</div>
      </div>`;
    }).join('');
  }
}

function closeBannerPicker() { const m = document.getElementById('modal-banner-picker'); m.classList.remove('open'); setTimeout(() => { m.style.display = 'none'; }, 260); }


// ── Top Badge Picker ──
let _tmpTopBadges = [];
function openTopBadgePicker() {
  const grid = document.getElementById('badge-picker-grid');
  const modal = document.getElementById('modal-badge-picker');
  if (!grid || !modal) return;
  const earned = _getAchievements();
  _tmpTopBadges = [..._getTopBadges()];

  grid.innerHTML = _ACHIEVEMENTS.map(a => {
    const isEarned = earned.includes(a.key);
    const isSelected = _tmpTopBadges.includes(a.key);
    return `
      <div class="badge-picker-item ${isSelected ? 'selected' : ''} ${!isEarned ? 'locked' : ''}"
           onclick="${isEarned ? `toggleTopBadge('${a.key}',this)` : ''}">
        <span class="bpi-icon">${a.icon}</span>
        <span class="bpi-name">${a.name}</span>
      </div>`;
  }).join('');
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('open'));
}
function toggleTopBadge(key, el) {
  const idx = _tmpTopBadges.indexOf(key);
  if (idx >= 0) {
    _tmpTopBadges.splice(idx, 1);
    el.classList.remove('selected');
  } else if (_tmpTopBadges.length < 3) {
    _tmpTopBadges.push(key);
    el.classList.add('selected');
  } else {
    showToast('Maximal 3 Badges auswählbar', 'error');
  }
}
function saveTopBadges() {
  _setTopBadges(_tmpTopBadges);
  _renderTopBadgesDisplay();
  closeTopBadgePicker();
  showToast('Top Badges gespeichert ✅', 'success');
}
function closeTopBadgePicker() { const m = document.getElementById('modal-badge-picker'); m.classList.remove('open'); setTimeout(() => { m.style.display = 'none'; }, 260); }

// ── Title Picker ──
function openTitlePicker() {
  const list = document.getElementById('title-picker-list');
  const modal = document.getElementById('modal-title-picker');
  if (!list || !modal) return;
  const earned = _getAchievements();
  const current = _getProfileTitle();
  const pts = ZAMApi.auth.currentUser()?.points || ZAMData?.currentUser?.points || 0;
  list.innerHTML = _PROFILE_TITLES.map(t => {
    const isEarned = (t.req === null && pts >= (t.req_pts || 0))
      || (t.req !== null && t.req !== undefined && earned.includes(t.req));
    const isActive = current === t.key;
    return `
      <div class="title-picker-item ${isActive ? 'active' : ''} ${!isEarned ? 'locked' : ''}"
           onclick="${isEarned ? `selectTitle('${t.key}')` : `showToast('🔒 Noch nicht freigeschaltet','error')`}">
        <span class="tpi-label">${t.label}</span>
        <span class="tpi-req">${isEarned ? (isActive ? '✅ Aktiv' : '✓ Freigeschaltet') : '🔒 ' + t.desc}</span>
      </div>`;
  }).join('');
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('open'));
}
function selectTitle(key) {
  const current = _getProfileTitle();
  if (current === key) {
    _setProfileTitle('');
    showToast('Titel entfernt');
  } else {
    _setProfileTitle(key);
    const t = _PROFILE_TITLES.find(x => x.key === key);
    showToast(`Titel gesetzt: ${t?.label}`, 'success');
  }
  _renderProfileTitle();
  // Re-render list in-place without reopening modal
  const pts = ZAMApi.auth.currentUser()?.points || ZAMData?.currentUser?.points || 0;
  const earned = _getAchievements();
  const newCurrent = _getProfileTitle();
  const list = document.getElementById('title-picker-list');
  if (list) list.innerHTML = _PROFILE_TITLES.map(t => {
    const isEarned = (t.req === null && pts >= (t.req_pts || 0)) || (t.req !== null && t.req !== undefined && earned.includes(t.req));
    const isActive = newCurrent === t.key;
    return `<div class="title-picker-item ${isActive ? 'active' : ''} ${!isEarned ? 'locked' : ''}" onclick="${isEarned ? `selectTitle('${t.key}')` : `showToast('🔒 Noch nicht freigeschaltet','error')`}"><span class="tpi-label">${t.label}</span><span class="tpi-req">${isEarned ? (isActive ? '✅ Aktiv' : '✓ Freigeschaltet') : '🔒 ' + t.desc}</span></div>`;
  }).join('');
}
function closeTitlePicker() { const m = document.getElementById('modal-title-picker'); m.classList.remove('open'); setTimeout(() => { m.style.display = 'none'; }, 260); }

// ── Daily Streak ──
const _STREAK_KEY = 'zam_streak_v1';
const _STREAK_MILESTONES = [
  { days: 3,   pts: 25,  label: '3 Tage Streak' },
  { days: 7,   pts: 75,  label: '7 Tage Streak' },
  { days: 14,  pts: 150, label: '2 Wochen Streak' },
  { days: 30,  pts: 300, label: '30 Tage Streak' },
  { days: 100, pts: 1000,label: '100 Tage Streak' },
];

function _getStreak() {
  try { return JSON.parse(localStorage.getItem(_STREAK_KEY) || '{"days":0,"last":"","bonus_claimed":[]}'); }
  catch { return { days: 0, last: '', bonus_claimed: [] }; }
}
function _saveStreak(s) { localStorage.setItem(_STREAK_KEY, JSON.stringify(s)); }

function checkDailyStreak() {
  const today = Storage.todayKey();
  const s = _getStreak();
  if (s.last === today) return s; // already counted today
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (s.last === yesterday) {
    s.days += 1;
  } else if (s.last !== today) {
    s.days = 1; // reset
    s.bonus_claimed = [];
  }
  s.last = today;
  _saveStreak(s);

  // Check milestone bonuses
  const claimed = s.bonus_claimed || [];
  for (const m of _STREAK_MILESTONES) {
    if (s.days >= m.days && !claimed.includes(m.days)) {
      claimed.push(m.days);
      s.bonus_claimed = claimed;
      _saveStreak(s);
      setTimeout(() => {
        addPoints(m.pts, `🔥 ${m.label}! Bonus`);
      }, 1500);
      break;
    }
  }
  return s;
}

function _renderStreakBanner(containerId) {
  const c = document.getElementById(containerId);
  if (!c) return;
  const s = _getStreak();
  if (s.days < 2) { c.innerHTML = ''; return; }
  const next = _STREAK_MILESTONES.find(m => m.days > s.days);
  const sub = next ? `Noch ${next.days - s.days} Tage bis +${next.pts} Bonus-Punkte` : '🏆 Streak-Meister!';
  c.innerHTML = `
    <div class="streak-banner">
      <span class="streak-fire">🔥</span>
      <div class="streak-info">
        <strong>${s.days} Tage Streak!</strong>
        <small>${sub}</small>
      </div>
    </div>`;
}

// ── Achievements ──
const _ACHIEVEMENTS = [
  { key: 'foto_profi',      icon: '📸', name: 'Foto-Profi',      desc: '5 Fotos in der Community geteilt' },
  { key: 'food_explorer',   icon: '🍔', name: 'Food Explorer',    desc: '3 verschiedene Food-Händler besucht' },
  { key: 'shopping_king',   icon: '🛍️', name: 'Shopping King',   desc: '10 Deals eingelöst' },
  { key: 'glueckspilz',     icon: '🎰', name: 'Glückspilz',       desc: '3× beim Daily Spin gewonnen' },
  { key: 'event_hunter',    icon: '🏃', name: 'Event Hunter',     desc: '5 Events besucht' },
  { key: 'challenge_master',icon: '🎯', name: 'Challenge Master', desc: '10 Challenges abgeschlossen' },
  { key: 'zam_legend',      icon: '👑', name: 'ZAM Legend',       desc: 'Legend-Status erreicht' },
];

function _getAchievements() {
  try { return JSON.parse(localStorage.getItem('zam_achievements_v1') || '[]'); } catch { return []; }
}
function _unlockAchievement(key) {
  const list = _getAchievements();
  if (list.includes(key)) return false;
  list.push(key);
  localStorage.setItem('zam_achievements_v1', JSON.stringify(list));
  const a = _ACHIEVEMENTS.find(x => x.key === key);
  if (a) showBadgeUnlockToast({ icon: a.icon, name: a.name });
  return true;
}

function renderAchievements(containerId) {
  const c = document.getElementById(containerId);
  if (!c) return;
  const earned = _getAchievements();
  c.innerHTML = `<div class="achievements-row">${_ACHIEVEMENTS.map(a => `
    <div class="achievement-chip ${earned.includes(a.key) ? 'earned' : ''}" title="${a.desc}">
      <span class="ach-icon">${a.icon}</span>${a.name}
    </div>`).join('')}</div>`;
}

// ── Challenge completion animation ──
function showChallengeComplete(pts, rewardLabel = '') {
  showPointsAnimation(pts, rewardLabel || 'Challenge abgeschlossen! 🎯');
  _unlockAchievement('challenge_master'); // tracked separately; just attempt
}

// ── Ranking motivational hint ──
function _rankingHint(pts) {
  const me = _RANKING_DEMO.find(r => r.isMe);
  const myRank = me?.rank || 17;
  const lines = [];
  // Next tier
  const nextTier = _getNextTier(pts);
  if (nextTier) {
    lines.push(`${nextTier.emoji} Noch ${(nextTier.min - pts).toLocaleString('de-DE')} Punkte bis ${nextTier.label}`);
  }
  // Rank targets
  const rankTargets = [{rank:10,pts:2750},{rank:3,pts:3950},{rank:1,pts:4820}];
  for (const t of rankTargets) {
    if (myRank > t.rank && pts < t.pts) {
      const diff = t.pts - pts;
      lines.push(`🏆 Noch ${diff.toLocaleString('de-DE')} Punkte bis Platz ${t.rank}`);
      break;
    }
  }
  return lines[0] || '';
}

// =============================================
// Navigation (continued)
// =============================================
function navigateTo(pageId) {
  // Close overlays, unlock scroll
  _unlockBodyScroll();
  $('#chat-room-view')?.classList.remove('open');
  $('#private-chat-view')?.classList.remove('open');

  if (state.currentPage === pageId) return;

  if (pageId !== 'home') document.body.classList.remove('perf-mode');

  const currentEl = $(`#page-${state.currentPage}`);
  if (currentEl) currentEl.classList.remove('active');

  state.currentPage = pageId;

  const nextEl = $(`#page-${pageId}`);
  if (nextEl) nextEl.classList.add('active');

  // Sub-pages live OUTSIDE #app-shell in the DOM. When active, app-shell's
  // min-height:100dvh would create 100dvh of black space before the sub-page.
  // Collapse app-shell to height:0 when on a sub-page.
  const MAIN_PAGES = new Set(['home','community','events','deals','merchants','profile','notifications','notif-settings','merchant-preview','nearby-settings','my-events','my-vouchers']);
  document.body.classList.toggle('subpage-active', !MAIN_PAGES.has(pageId));
  document.body.classList.toggle('profile-active', pageId === 'profile');

  // Triple scroll reset — ensure top of page on all mobile browsers
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });

  $$('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === pageId);
  });

  // Special pages without data-page nav tab
  const notifNavBtn = $('#nav-notifications');
  if (notifNavBtn) {
    notifNavBtn.classList.toggle('active', pageId === 'notifications' || pageId === 'notif-settings');
  }

  // Render page-specific content on navigate
  if (pageId === 'notifications') {
    renderNotifications();
  } else if (pageId === 'notif-settings') {
    renderNotifSettings();
  } else if (pageId === 'merchant-preview') {
    renderMerchantPreviewSubmissions();
  } else if (pageId === 'merchant-dashboard') {
    renderMerchantDashboard();
  } else if (pageId === 'admin-dashboard') {
    renderAdminDashboard();
  } else if (pageId === 'demo') {
    renderDemoMode();
  } else if (pageId === 'merchant-onboarding') {
    _obCurrentStep = 1;
    obShowStep(1);
  } else if (pageId === 'merchant-packages') {
    renderMerchantPackages();
  } else if (pageId === 'merchant-contracts') {
    renderMerchantContracts();
  } else if (pageId === 'merchant-billing') {
    renderMerchantBilling();
  } else if (pageId === 'admin-revenue') {
    renderAdminRevenue();
  } else if (pageId === 'ai') {
    renderAIConcierge();
  } else if (pageId === 'recommendations') {
    renderRecommendations();
  } else if (pageId === 'merchant-ai') {
    // static page, nothing to render dynamically
  } else if (pageId === 'admin-ai-insights') {
    renderAdminAIInsights('admin-ai-insights');
  } else if (pageId === 'rewards') {
    window.scrollTo(0, 0);
    renderRewards();
  } else if (pageId === 'photo-challenges') {
    window.scrollTo(0, 0);
    renderPhotoChallenges();
  } else if (pageId === 'community-gallery') {
    window.scrollTo(0, 0);
    renderCommunityGallery();
  } else if (pageId === 'nearby-settings') {
    window.scrollTo(0, 0);
    renderNearbySettings();
  } else if (pageId === 'my-vouchers') {
    window.scrollTo(0, 0);
    renderMyVouchers();
  } else if (pageId === 'my-events') {
    window.scrollTo(0, 0);
    renderMyEvents();
  }
}

function initNavigation() {
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => navigateTo(tab.dataset.page));
  });
}

// =============================================
// Home Page
// =============================================
function renderHome() {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  document.body.classList.toggle('perf-mode', user.role === 'merchant' || user.role === 'admin');
  const hour = new Date().getHours();
  let greeting = 'Guten Tag';
  if (hour < 12) greeting = 'Guten Morgen';
  else if (hour >= 18) greeting = 'Guten Abend';

  const greetingEl = $('#home-greeting');
  if (greetingEl) greetingEl.textContent = greeting + ',';

  const nameEl = $('#home-username');
  const firstName = (user.display_name || 'Gast').split(' ')[0];
  if (nameEl) nameEl.textContent = firstName + '! 👋';

  const isPerfMode = user.role === 'merchant' || user.role === 'admin';
  updatePointsDisplay();
  _renderHomeRankStats(user);

  if (!isPerfMode) {
    _initSpinMerchantPrizes();
    _renderHomeSpinPreview();
  } else {
    // hide spin widget in merchant/admin mode
    const spinEl = document.getElementById('home-spin-preview');
    if (spinEl) spinEl.style.display = 'none';
  }

  renderHomeEvents();
  renderHomeDeals();

  // Ranking always visible — core motivation element
  _renderHomeRankingCard();
  // Recs DOM nodes kept hidden (removed from home UI)
  const recsLabel = document.getElementById('home-rec-label');
  const recsScroll = document.getElementById('home-recs-scroll');
  if (recsLabel) recsLabel.style.display = 'none';
  if (recsScroll) recsScroll.style.display = 'none';

  if (!isPerfMode) {
    // Referral CTA widget
    const refCode = _getReferralCode(user);
    const refCodeEl = document.getElementById('home-referral-code');
    if (refCodeEl && refCode) refCodeEl.textContent = refCode;
    const { unlocked, pending, totalPts } = _getReferralSummary(user?.id || 'guest');
    const refCountEl = document.getElementById('home-referral-count');
    const refPtsEl   = document.getElementById('home-referral-pts');
    if (refCountEl) refCountEl.textContent = unlocked.length + pending.length;
    if (refPtsEl)   refPtsEl.textContent   = totalPts;
  } else {
    const refEl = document.getElementById('home-referral-cta');
    if (refEl) refEl.style.display = 'none';
  }

  // Händler Tools card — collapsed by default, expand on click
  const toolsCard = document.getElementById('home-merchant-tools');
  if (toolsCard) {
    const isMerchant = user.role === 'merchant' || user.role === 'admin';
    if (!isMerchant) {
      toolsCard.style.display = 'none';
    } else {
      const shopLabel = user.role === 'admin' ? 'Admin-Vorschau aktiv' : (user.display_name || user.name || 'Demo Händler');
      toolsCard.style.display = 'block';
      const isAdmin = user.role === 'admin';
      toolsCard.innerHTML = `
        <div style="border:1px solid rgba(250,70,21,0.3);border-radius:16px;overflow:hidden">
          <button id="ht-toggle" style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(196,53,16,0.18);border:none;cursor:pointer;font-family:var(--font);text-align:left">
            <span style="font-size:1.2rem">🏪</span>
            <div style="flex:1">
              <div style="font-size:0.85rem;font-weight:800;color:#ffb399">Händler Tools</div>
              <div style="font-size:0.65rem;color:rgba(250,70,21,0.65)">${escHtml(shopLabel)}</div>
            </div>
            <span style="font-size:0.65rem;font-weight:700;color:#34d399;background:rgba(16,185,129,0.15);border:1px solid rgba(52,211,153,0.3);border-radius:5px;padding:2px 7px">● AKTIV</span>
            <span id="ht-chevron" style="color:rgba(255,255,255,0.4);font-size:0.8rem;transition:transform 0.2s">▼</span>
          </button>
          <div id="ht-body" style="display:none;padding:12px;background:rgba(196,53,16,0.08)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <button id="ht-qr"    style="display:flex;align-items:center;gap:8px;padding:11px 12px;background:#FA4615;color:#fff;border:none;border-radius:10px;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer;grid-column:1/-1"><span>📷</span> QR-Code scannen</button>
              <button id="ht-event" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 8px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;border-radius:10px;font-size:0.74rem;font-weight:600;font-family:var(--font);cursor:pointer"><span>📅</span> Event</button>
              <button id="ht-deal"  style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 8px;background:rgba(247,171,0,0.15);border:1px solid rgba(247,171,0,0.3);color:#F7AB00;border-radius:10px;font-size:0.74rem;font-weight:600;font-family:var(--font);cursor:pointer"><span>🏷️</span> Deal</button>
              <button id="ht-spin"  style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 8px;background:rgba(247,171,0,0.12);border:1px solid rgba(247,171,0,0.28);color:#F7AB00;border-radius:10px;font-size:0.74rem;font-weight:600;font-family:var(--font);cursor:pointer"><span>🎰</span> Spin-Preis</button>
              <button id="ht-stats" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 8px;background:rgba(16,185,129,0.12);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:10px;font-size:0.74rem;font-weight:600;font-family:var(--font);cursor:pointer"><span>📊</span> Statistiken</button>
              <button id="ht-dash"  style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:10px;font-size:0.74rem;font-weight:600;font-family:var(--font);cursor:pointer"><span>⚙️</span> Dashboard</button>
              ${isAdmin ? `<button id="ht-admin-spin" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;border-radius:10px;font-size:0.74rem;font-weight:600;font-family:var(--font);cursor:pointer;grid-column:1/-1"><span>🛡️</span> Spin-Gewinne verwalten</button>` : ''}
            </div>
          </div>
        </div>`;
      document.getElementById('ht-toggle').addEventListener('click', () => {
        const body = document.getElementById('ht-body');
        const chev = document.getElementById('ht-chevron');
        const open = body.style.display === 'none';
        body.style.display = open ? 'block' : 'none';
        if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
      });
      document.getElementById('ht-qr')        ?.addEventListener('click', openQRScanner);
      document.getElementById('ht-event')     ?.addEventListener('click', openMerchantEventModal);
      document.getElementById('ht-deal')      ?.addEventListener('click', openMerchantDealModal);
      document.getElementById('ht-spin')      ?.addEventListener('click', openSpinPrizeModal);
      document.getElementById('ht-stats')     ?.addEventListener('click', openMerchantStatsOverlay);
      document.getElementById('ht-dash')      ?.addEventListener('click', () => navigateTo('merchant-dashboard'));
      document.getElementById('ht-admin-spin')?.addEventListener('click', openAdminSpinManagement);
    }
  }
}

function animateNumber(el, from, to, duration) {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  if (user.role === 'merchant' || user.role === 'admin') {
    el.textContent = to.toLocaleString('de-DE');
    return;
  }
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * ease).toLocaleString('de-DE');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

async function renderHomeEvents() {
  const container = $('#home-events-scroll');
  if (!container) return;
  container.innerHTML = '';
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const isPerfMode = user.role === 'merchant' || user.role === 'admin';
  const events = await ZAMApi.events.list();
  events.slice(0, isPerfMode ? 2 : 5).forEach(evt => {
    const saved = ZAMApi.events.isSaved(evt.id);
    const card = el('div', 'event-card-mini card-dark');
    card.style.setProperty('--accent-color', evt.category_color);
    card.innerHTML = `
      <div style="margin:-12px -12px 10px;height:54px;border-radius:10px 10px 0 0;background:linear-gradient(135deg,${evt.category_color}55,${evt.category_color}22);display:flex;align-items:center;justify-content:center;font-size:1.8rem;overflow:hidden">
        ${{'Food':'🍜','Kultur':'🎵','Sport':'🏋️','Shopping':'👗','Community':'👥'}[evt.category?.split(' ')[0]] || '🎉'}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="category-tag" style="background:${evt.category_color}22;color:${evt.category_color}">${evt.category}</div>
        <button class="bookmark-btn ${saved ? 'saved' : ''}" data-id="${evt.id}" data-type="event" aria-label="Merken">
          ${saved ? '🔖' : '🏷️'}
        </button>
      </div>
      <h3>${evt.title}</h3>
      <div class="event-meta">
        <span>📅 ${evt.date_formatted}</span>
        <span>⏰ ${evt.time}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
        <div class="event-points-badge">+${evt.points_reward} Punkte</div>
        <span style="font-size:0.62rem;color:rgba(255,255,255,0.4)">👥 ${(evt.spots_total||500)-(evt.spots_left||0)} dabei</span>
      </div>
    `;
    card.querySelector('.bookmark-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSave('event', evt.id, e.currentTarget);
    });
    card.addEventListener('click', () => navigateTo('events'));
    container.appendChild(card);
  });
}

async function renderHomeDeals() {
  const container = $('#home-deals-scroll');
  if (!container) return;
  container.innerHTML = '';
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const isPerfMode = user.role === 'merchant' || user.role === 'admin';
  const deals = _shuffleDeals(await ZAMApi.deals.list());
  deals.slice(0, isPerfMode ? 2 : 5).forEach(deal => {
    const saved = ZAMApi.deals.isSaved(deal.id);
    const card = el('div', 'deal-card-mini card-dark');
    card.innerHTML = `
      <div style="margin:-12px -12px 10px;height:60px;border-radius:10px 10px 0 0;background:linear-gradient(135deg,${deal.category_color||'#FA4615'}44,${deal.category_color||'#FA4615'}11);display:flex;align-items:center;padding:0 12px;gap:10px;overflow:hidden;position:relative">
        <div style="font-size:1.6rem">${deal.store_icon || '🏪'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.6rem;font-weight:700;color:${deal.category_color||'#FA4615'};text-transform:uppercase;letter-spacing:0.05em">${deal.store_name || ''}</div>
          <div style="font-size:1rem;font-weight:900;color:#fff">${deal.discount}</div>
        </div>
        ${deal.is_hot ? '<div class="hot-badge" style="position:absolute;top:6px;right:6px;font-size:0.55rem">🔥 Hot</div>' : ''}
      </div>
      <div class="deal-title">${deal.title}</div>
      <div style="margin-top:6px">${_countdownBadge(deal.expiry_date)}</div>
      <button class="btn btn-primary" style="margin-top:10px;padding:6px 12px;font-size:0.72rem;width:100%" onclick="openVoucherQR('${deal.id}','${esc(deal.title)}','${deal.merchant_id||''}');event.stopPropagation()">🎟 Einlösen</button>
    `;
    card.addEventListener('click', () => navigateTo('deals'));
    container.appendChild(card);
  });
}

// =============================================
// Home — Rank Stats & Ranking Cards
// =============================================
const _RANKING_DEMO = [
  {rank:1,  name:'Tom W.',     initials:'TW', pts:4820, color:'#d97706', bg:'#78350f'},
  {rank:2,  name:'Sarah L.',   initials:'SL', pts:4210, color:'#6b7280', bg:'#374151'},
  {rank:3,  name:'Emma R.',    initials:'ER', pts:3950, color:'#b45309', bg:'#78350f'},
  {rank:4,  name:'Felix B.',   initials:'FB', pts:3640, color:'#059669', bg:'#064e3b'},
  {rank:5,  name:'Anna P.',    initials:'AP', pts:3380, color:'#7c3aed', bg:'#2d1b69'},
  {rank:16, name:'Mia K.',     initials:'MK', pts:2640, color:'#7c3aed', bg:'#2d1b69'},
  {rank:17, name:'Julia M.',   initials:'JM', pts:2460, color:'#d97706', bg:'#78350f', isMe:true},
  {rank:18, name:'Leo M.',     initials:'LM', pts:2390, color:'#2563eb', bg:'#1e3a8a'},
];

function _renderHomeRankStats(user) {
  const el = document.getElementById('home-rank-stats');
  if (!el) return;
  const pts = user?.points || 2460;
  const rank = 17;
  const todayPts = parseInt(localStorage.getItem('zam_today_pts_' + Storage.todayKey()) || '25');
  const hint = _rankingHint(pts);
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06)">
      <div style="text-align:center">
        <div style="font-size:1.1rem;font-weight:900;color:#F7AB00">🏆 #${rank}</div>
        <div style="font-size:0.6rem;color:rgba(255,255,255,0.4);margin-top:2px">Monatsrang</div>
      </div>
      <div style="text-align:center;border-left:1px solid rgba(255,255,255,0.06);border-right:1px solid rgba(255,255,255,0.06)">
        <div style="font-size:1.1rem;font-weight:900;color:#34d399">+${todayPts}</div>
        <div style="font-size:0.6rem;color:rgba(255,255,255,0.4);margin-top:2px">Heute</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:0.9rem;font-weight:900;color:#ffb399"><span class="tier-badge tier-badge--${_getTier(pts).key}">${_getTier(pts).emoji} ${_getTier(pts).label}</span></div>
        <div style="font-size:0.6rem;color:rgba(255,255,255,0.4);margin-top:2px">Level</div>
      </div>
    </div>
    ${hint ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(247,171,0,0.08);border:1px solid rgba(247,171,0,0.18);border-radius:8px;font-size:0.65rem;font-weight:700;color:#F7AB00;text-align:center">${hint}</div>` : ''}`;
}

function _renderHomeRankingCard() {
  const el = document.getElementById('home-ranking-card');
  if (!el) return;
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const daysLeft = Math.ceil((endOfMonth - now) / 86400000);
  const top3 = _RANKING_DEMO.slice(0, 3);
  const medals = ['🥇','🥈','🥉'];
  const prizeTitles = ['Geheimer Hauptgewinn 🎁','Geheimer Premiumgewinn 🎁','Geheimer Bonusgewinn 🎁'];
  const me = _RANKING_DEMO.find(r => r.isMe);

  el.innerHTML = `
    <div style="margin:0 16px 4px;background:linear-gradient(135deg,rgba(247,171,0,0.13),rgba(250,70,21,0.09));border:1.5px solid rgba(247,171,0,0.3);border-radius:18px;padding:16px;cursor:pointer;position:relative;overflow:hidden" onclick="openRankingModal()">
      <div style="position:absolute;top:-18px;right:-18px;font-size:5rem;opacity:0.06;pointer-events:none">🏆</div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
        <div>
          <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:900;color:#F7AB00">🏆 Monats-Champions</div>
          <div style="font-size:0.78rem;font-weight:700;color:#fff;margin-top:3px">Top 3 gewinnen geheime Preise!</div>
          <div style="font-size:0.68rem;color:rgba(255,255,255,0.45);margin-top:2px">⏳ Noch <strong style="color:#F7AB00">${daysLeft} Tage</strong> bis Monatsende</div>
        </div>
        <span style="font-size:0.68rem;color:rgba(247,171,0,0.7);font-weight:700;white-space:nowrap;padding-top:2px">Ansehen →</span>
      </div>
      ${top3.map((u, i) => {
        const uTier = _getTier(u.pts);
        const safeUName = u.name.replace(/'/g,"\\'");
        const uid = 'rank_' + u.initials.toLowerCase();
        return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,0.04);${i < 2 ? 'margin-bottom:6px' : ''};cursor:pointer" onclick="event.stopPropagation();openUserProfileSheet('${uid}','${safeUName}','${u.initials}',null,${u.pts})">
        <div style="width:26px;text-align:center;font-size:1.1rem">${medals[i]}</div>
        <div class="tier-ring tier-ring--${uTier.key}" style="width:34px;height:34px;background:${u.bg};font-size:0.62rem;font-weight:800;color:#fff;flex-shrink:0">${u.initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.8rem;font-weight:700;color:#e2e8f0">${u.name}</div>
          <div style="margin-top:2px"><span class="tier-badge tier-badge--${uTier.key}">${uTier.emoji} ${uTier.label}</span></div>
          <div style="font-size:0.58rem;color:rgba(255,255,255,0.3);margin-top:2px">${prizeTitles[i]}</div>
        </div>
        <div style="font-size:0.8rem;font-weight:900;color:#F7AB00">${u.pts.toLocaleString('de-DE')}</div>
      </div>`;}).join('')}
      <div style="margin-top:10px;padding:9px 10px;border-radius:10px;background:rgba(247,171,0,0.08);border:1px solid rgba(247,171,0,0.15);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.6)">Dein Rang: <strong style="color:#F7AB00">#${me?.rank || 17}</strong> · ${(me?.pts || 2460).toLocaleString('de-DE')} Pkt.</div>
        <button onclick="event.stopPropagation();openRankingModal()" style="font-size:0.7rem;font-weight:800;color:#F7AB00;background:none;border:none;cursor:pointer;font-family:var(--font)">Verbessern →</button>
      </div>
    </div>`;
}

function openRankingModal() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const endOfQ = new Date(now.getFullYear(), Math.ceil((now.getMonth()+1)/3)*3, 0, 23, 59, 59);
  const daysMonth = Math.ceil((endOfMonth - now) / 86400000);
  const daysQ = Math.ceil((endOfQ - now) / 86400000);
  const medals = ['🥇','🥈','🥉'];
  const prizes = ['Geheimer Hauptgewinn 🎁','Geheimer Premiumgewinn 🎁','Geheimer Bonusgewinn 🎁'];
  const me = _RANKING_DEMO.find(r => r.isMe);
  const modal = _buildMerchantModal('ranking-modal','🏆 Rankings', `
    <!-- Month tab -->
    <div style="display:flex;gap:4px;background:rgba(255,255,255,0.05);border-radius:12px;padding:3px;margin-bottom:18px">
      <button id="rank-tab-month" onclick="rankTab('month')" style="flex:1;border:none;border-radius:10px;padding:8px 4px;font-size:0.75rem;font-weight:800;font-family:var(--font);background:rgba(247,171,0,0.25);color:#F7AB00;cursor:pointer">🗓️ Monat</button>
      <button id="rank-tab-quarter" onclick="rankTab('quarter')" style="flex:1;border:none;border-radius:10px;padding:8px 4px;font-size:0.75rem;font-weight:800;font-family:var(--font);background:none;color:rgba(255,255,255,0.4);cursor:pointer">👑 Quartal</button>
    </div>
    <div id="rank-content-month">
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.35);margin-bottom:4px">⏳ Noch ${daysMonth} Tage bis Monatsende</div>
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.55)">Die Top 3 gewinnen exklusive ZAM-Preise.</div>
      </div>
      ${_RANKING_DEMO.map((u, i) => {
        const uTier = _getTier(u.pts);
        const safeUName = u.name.replace(/'/g,"\\'");
        const uid = 'rank_' + u.initials.toLowerCase();
        return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${u.isMe ? 'rgba(247,171,0,0.08)' : 'rgba(255,255,255,0.03)'};border:1px solid ${u.isMe ? 'rgba(247,171,0,0.25)' : 'rgba(255,255,255,0.06)'};border-radius:12px;margin-bottom:7px;cursor:${u.isMe?'default':'pointer'}" ${!u.isMe ? `onclick="_merchantModalClose('ranking-modal');openUserProfileSheet('${uid}','${safeUName}','${u.initials}',null,${u.pts})"` : ''}>
        <div style="width:28px;text-align:center;font-size:${i < 3 ? '1.1rem' : '0.8rem'};font-weight:800;color:${i===0?'#d97706':i===1?'#9ca3af':i===2?'#b45309':'rgba(255,255,255,0.3)'}">${i < 3 ? medals[i] : '#'+u.rank}</div>
        <div class="tier-ring tier-ring--${uTier.key}" style="width:36px;height:36px;background:${u.bg};font-size:0.65rem;font-weight:800;color:#fff;flex-shrink:0">${u.initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.82rem;font-weight:${u.isMe?'900':'700'};color:${u.isMe?'#F7AB00':'#e2e8f0'}">${u.name}${u.isMe?' (Du)':''}</div>
          <div style="margin-top:2px"><span class="tier-badge tier-badge--${uTier.key}">${uTier.emoji} ${uTier.label}</span></div>
          ${i < 3 ? `<div style="font-size:0.58rem;color:rgba(255,255,255,0.3);margin-top:2px">${prizes[i]}</div>` : ''}
        </div>
        <div style="font-size:0.8rem;font-weight:800;color:${u.isMe?'#F7AB00':'rgba(255,255,255,0.6)'}">${u.pts.toLocaleString('de-DE')} Pkt.</div>
      </div>`;}).join('')}
    </div>
    <div id="rank-content-quarter" style="display:none">
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.35);margin-bottom:4px">⏳ Noch ${daysQ} Tage bis Quartalsende</div>
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.55)">Die Top 3 des Quartals gewinnen exklusive Hauptpreise.</div>
      </div>
      ${['🥇 Hauptgewinn','🥈 Premiumgewinn','🥉 Spezialgewinn'].map(p => `
      <div style="display:flex;align-items:center;gap:12px;padding:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;margin-bottom:8px">
        <div style="font-size:1.5rem">${p.split(' ')[0]}</div>
        <div>
          <div style="font-size:0.84rem;font-weight:800;color:#e2e8f0">Geheimer Gewinn 🎁</div>
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-top:2px">${p.slice(3)}</div>
        </div>
      </div>`).join('')}
      <div style="margin-top:16px;padding:14px;background:rgba(247,171,0,0.08);border:1px solid rgba(247,171,0,0.2);border-radius:14px">
        <div style="font-size:0.72rem;font-weight:700;color:#F7AB00;margin-bottom:4px">Dein Quartals-Stand</div>
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.6)">Rang <strong style="color:#F7AB00">#${me?.rank||17}</strong> · ${(me?.pts||2460).toLocaleString('de-DE')} Punkte</div>
      </div>
    </div>
    <button onclick="_merchantModalClose('ranking-modal')" style="width:100%;margin-top:16px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5);font-size:0.84rem;font-weight:600;font-family:var(--font);cursor:pointer">Schließen</button>
  `);
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function rankTab(tab) {
  document.getElementById('rank-content-month').style.display = tab === 'month' ? 'block' : 'none';
  document.getElementById('rank-content-quarter').style.display = tab === 'quarter' ? 'block' : 'none';
  document.getElementById('rank-tab-month').style.background = tab === 'month' ? 'rgba(247,171,0,0.25)' : 'none';
  document.getElementById('rank-tab-month').style.color = tab === 'month' ? '#F7AB00' : 'rgba(255,255,255,0.4)';
  document.getElementById('rank-tab-quarter').style.background = tab === 'quarter' ? 'rgba(247,171,0,0.25)' : 'none';
  document.getElementById('rank-tab-quarter').style.color = tab === 'quarter' ? '#F7AB00' : 'rgba(255,255,255,0.4)';
}

// =============================================
// Save / Bookmark System
// =============================================
function isSaved(type, id) {
  if (type === 'event') return ZAMApi.events.isSaved(id);
  if (type === 'deal')  return ZAMApi.deals.isSaved(id);
  return false;
}

async function toggleSave(type, id, btnEl) {
  const wasSaved = isSaved(type, id);

  if (wasSaved) {
    if (type === 'event') await ZAMApi.events.unsave(id);
    else await ZAMApi.deals.unsave(id);
    if (btnEl) {
      btnEl.textContent = type === 'deal' ? '🏷️ Merken' : '🏷️';
      btnEl.classList.remove('saved');
    }
    showToast(type === 'event' ? 'Event entfernt' : 'Deal entfernt');
  } else {
    if (type === 'event') await ZAMApi.events.save(id);
    else await ZAMApi.deals.save(id);
    if (btnEl) {
      btnEl.textContent = type === 'deal' ? '🔖 Gespeichert' : '🔖';
      btnEl.classList.add('saved');
      btnEl.style.transform = 'scale(1.3)';
      setTimeout(() => { btnEl.style.transform = ''; }, 250);
    }
    showToast(type === 'event' ? '🔖 Event gespeichert!' : '🔖 Deal gespeichert! +5 Punkte', 'success');
    if (type === 'deal') {
      // Award points silently (toast already shown above)
      await ZAMApi.points.add(5, 'deal_saved', 'Deal gespeichert');
      updatePointsDisplay(true);
      await checkBadgesAfterAction();
      renderChallenges();
    }
  }

  // Refresh saved summary in profile
  renderSavedSummary();
}

// =============================================
// Badge system
// =============================================
let _badgeToastTimer = null;

function showBadgeUnlockToast(badge) {
  let toast = document.getElementById('badge-unlock-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'badge-unlock-toast';
    toast.className = 'badge-unlock-toast';
    toast.innerHTML = `<div class="badge-toast-icon"></div><div class="badge-toast-text"><strong></strong><span>Abzeichen freigeschaltet! 🎉</span></div>`;
    document.body.appendChild(toast);
  }
  toast.querySelector('.badge-toast-icon').textContent = badge.icon;
  toast.querySelector('strong').textContent = badge.name;
  clearTimeout(_badgeToastTimer);
  toast.classList.remove('show');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    toast.classList.add('show');
    _badgeToastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
  }));
}

async function checkBadgesAfterAction() {
  const newBadges = await ZAMApi.badges.checkAndUnlock();
  for (let i = 0; i < newBadges.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 800));
    showBadgeUnlockToast(newBadges[i]);
  }
  if (newBadges.length > 0) renderBadges();
}

// =============================================
// Challenges
// =============================================
async function renderChallenges() {
  const container = $('#challenges-list');
  if (!container) return;
  const list = await ZAMApi.challenges.list();
  container.innerHTML = list.map(c => `
    <div class="challenge-card">
      <div class="challenge-header">
        <div class="challenge-icon">${c.icon}</div>
        <div class="challenge-info">
          <div class="challenge-title">${c.title}</div>
          <div class="challenge-desc">${c.description}</div>
        </div>
        <div class="challenge-reward">+${c.reward_pts} Pkt.</div>
      </div>
      <div class="challenge-progress-track">
        <div class="challenge-progress-fill" style="width:${c.pct}%"></div>
      </div>
      <div class="challenge-footer">
        <span>${c.progress} / ${c.target}</span>
        ${c.is_claimed
          ? `<span class="challenge-done-label">✅ Belohnung erhalten</span>`
          : c.is_complete
            ? `<button class="challenge-claim-btn" onclick="claimChallenge('${c.id}')">Belohnung abholen 🎁</button>`
            : `<span>${c.pct}% geschafft</span>`}
      </div>
    </div>
  `).join('');
}

async function claimChallenge(challengeId) {
  const result = await ZAMApi.challenges.claim(challengeId);
  if (!result) return;
  showChallengeComplete(result.points, `📸 Challenge abgeschlossen`);
  updatePointsDisplay(false);
  renderChallenges();
  await checkBadgesAfterAction();
}

// =============================================
// Daily Spin
// =============================================
function initDailySpin() {
  const btn = $('#btn-daily-spin');
  if (!btn) return;
  btn.addEventListener('click', openSpinModal);
}

function _spinKey() { return 'zamclub_spin_' + (ZAMApi.auth.currentUser()?.id || 'guest'); }
function _todayStr() { return new Date().toISOString().slice(0, 10); }

const _SPIN_COLORS = ['#F7AB00', '#7c3aed', '#10b981', '#3b82f6', '#ec4899', '#ef4444'];

function _buildSpinCards(disabled = false) {
  const grid = $('#spin-cards-grid');
  if (!grid) return;
  grid.innerHTML = '';
  ZAMData.spinRewards.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'spin-card';
    card.dataset.idx = i;
    card.innerHTML = `
      <div class="spin-card-inner">
        <div class="spin-card-face spin-card-front">🎴</div>
        <div class="spin-card-face spin-card-back" style="background:${_SPIN_COLORS[i % _SPIN_COLORS.length]}">
          ${r.points}<span>${r.label}</span>
        </div>
      </div>`;
    if (disabled) card.style.opacity = '0.5';
    grid.appendChild(card);
  });
}

function openSpinModal() {
  _initSpinMerchantPrizes();
  const overlay = $('#modal-spin');
  if (!overlay) return;
  const alreadySpun = localStorage.getItem(_spinKey()) === _todayStr();
  const result = $('#spin-result');
  const spinBtn = $('#btn-spin-go');
  if (result) result.style.display = 'none';
  _buildSpinCards(alreadySpun);
  _renderSpinMerchantPreview();
  if (spinBtn) {
    spinBtn.disabled = alreadySpun;
    spinBtn.textContent = alreadySpun ? '✓ Heute bereits gedreht' : '🎰 Jetzt drehen!';
    spinBtn.className = alreadySpun ? 'btn btn-full claimed' : 'btn btn-primary btn-full';
  }
  const nextSpin = $('#spin-next-info');
  if (nextSpin) nextSpin.textContent = alreadySpun ? '⏰ Nächste Drehung ab Mitternacht' : '';
  overlay.classList.add('open');
}

async function doSpin() {
  const alreadySpun = localStorage.getItem(_spinKey()) === _todayStr();
  if (alreadySpun) return;
  const spinBtn = $('#btn-spin-go');
  if (spinBtn) { spinBtn.disabled = true; spinBtn.textContent = '⏳ Dreht…'; }

  // Build merged pool (points + active merchant prizes)
  const pool = _buildSpinPool();
  let cumulative = 0;
  const rand = Math.random();
  let reward = pool[0];
  let rewardIdx = 0;
  for (let i = 0; i < pool.length; i++) {
    cumulative += pool[i].probability;
    if (rand <= cumulative) { reward = pool[i]; rewardIdx = i; break; }
  }
  // Clamp to card count for animation (merchant prizes overflow point cards → animate last card)
  const cards = $$('.spin-card');
  const animIdx = Math.min(rewardIdx, cards.length - 1);

  // Animate — shake all cards, then flip the winner card
  cards.forEach((c, i) => {
    setTimeout(() => {
      c.classList.add('shaking');
      setTimeout(() => c.classList.remove('shaking'), 350);
    }, i * 70);
  });

  setTimeout(async () => {
    if (cards[animIdx]) cards[animIdx].classList.add('flipped');

    const resultEl = $('#spin-result');
    if (!resultEl) return;
    resultEl.style.display = 'block';

    if (reward._type === 'merchant_prize') {
      // ── Händler-Gewinn ──
      const wonReward = _handleMerchantPrizeWin(reward);
      const expDate = new Date(wonReward.expires_at).toLocaleDateString('de-DE');
      resultEl.innerHTML = `
        <div style="text-align:center;padding:4px 0 8px">
          <div style="font-size:2.8rem;margin-bottom:6px">🎉</div>
          <div style="font-size:1.1rem;font-weight:900;color:#F7AB00;margin-bottom:2px">Jackpot-Gewinn!</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.5);margin-bottom:14px">Händler-Preis gewonnen</div>
          <div style="background:rgba(247,171,0,0.1);border:1px solid rgba(247,171,0,0.3);border-radius:14px;padding:14px;margin-bottom:14px;text-align:left">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="font-size:2rem">${reward.merchant_icon}</span>
              <div>
                <div style="font-size:0.92rem;font-weight:800;color:#e2e8f0">${escHtml(reward.title)}</div>
                <div style="font-size:0.7rem;color:rgba(255,255,255,0.5)">${escHtml(reward.merchant_name)}</div>
              </div>
            </div>
            <div style="font-size:0.72rem;color:rgba(255,255,255,0.55);line-height:1.5;margin-bottom:8px">${escHtml(reward.description)}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:0.65rem;color:rgba(255,255,255,0.4)">Einlösbar bis ${expDate}</span>
              ${_countdownBadge(wonReward.expires_at)}
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="showQRVoucher('${wonReward.id}')" style="flex:1;padding:11px;background:linear-gradient(135deg,#8a5f00,#F7AB00);border:none;color:#fff;border-radius:12px;font-size:0.8rem;font-weight:800;font-family:var(--font);cursor:pointer">📱 QR-Code</button>
            <button onclick="navigateTo('rewards');document.getElementById('modal-spin')?.classList.remove('open')" style="flex:1;padding:11px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);border-radius:12px;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer">🎁 Zu Belohnungen</button>
          </div>
        </div>`;
      localStorage.setItem(_spinKey(), _todayStr());
      if (spinBtn) spinBtn.style.display = 'none';
      _renderHomeSpinPreview(); // refresh home preview (reduced count)
    } else {
      // ── Punkte-Gewinn ──
      const resultPts  = $('#spin-result-points');
      const resultLbl  = $('#spin-result-label');
      const resultIcon = $('#spin-result-icon');
      if (resultPts)  resultPts.textContent  = '+' + reward.points;
      if (resultLbl)  resultLbl.textContent  = reward.label + ' gewonnen!';
      if (resultIcon) resultIcon.textContent = reward.points >= 250 ? '🎉' : reward.points >= 100 ? '🥳' : '✨';
      await addPoints(reward.points, 'Daily Spin');
      localStorage.setItem(_spinKey(), _todayStr());
      if (spinBtn) spinBtn.textContent = '✓ Punkte gutgeschrieben';
    }

    const nextSpin = $('#spin-next-info');
    if (nextSpin) nextSpin.textContent = '⏰ Nächste Drehung ab Mitternacht';

    // Track spin stat
    const user = ZAMApi.auth.currentUser();
    if (user) {
      try {
        const d = JSON.parse(localStorage.getItem(`zamclub_u_${user.id}`) || '{}');
        d.stats = d.stats || {}; d.stats.spins = (d.stats.spins || 0) + 1;
        localStorage.setItem(`zamclub_u_${user.id}`, JSON.stringify(d));
        if (ZAMData.currentUser.stats) ZAMData.currentUser.stats.spins = d.stats.spins;
      } catch {}
    }

    await checkBadgesAfterAction();
    renderChallenges();
  }, 650);
}

// =============================================
// Spin Merchant Prizes
// =============================================
function _getSpinMerchantPrizes() {
  try {
    const stored = localStorage.getItem('zam_spin_merchant_prizes');
    return stored ? JSON.parse(stored) : (ZAMData.spinMerchantRewards || []);
  } catch { return ZAMData.spinMerchantRewards || []; }
}
function _saveSpinMerchantPrizes(list) {
  localStorage.setItem('zam_spin_merchant_prizes', JSON.stringify(list));
}
function _initSpinMerchantPrizes() {
  // Seed from ZAMData if not yet in localStorage
  if (!localStorage.getItem('zam_spin_merchant_prizes')) {
    _saveSpinMerchantPrizes(ZAMData.spinMerchantRewards || []);
  }
}

function _getActiveMerchantPrizes() {
  const today = new Date().toISOString().slice(0, 10);
  return _getSpinMerchantPrizes().filter(p =>
    p.status === 'approved' &&
    p.remaining_quantity > 0 &&
    p.active_from <= today &&
    p.active_until >= today
  );
}

function _buildSpinPool() {
  const active = _getActiveMerchantPrizes();
  const ptPool = (ZAMData.spinRewards || []).map(r => ({ ...r, _type: 'points' }));
  if (!active.length) return ptPool;
  const MERCHANT_TOTAL = Math.min(0.18, active.length * 0.04);
  const ptsScale = 1 - MERCHANT_TOTAL;
  const merItems = active.map(p => ({
    ...p,
    _type: 'merchant_prize',
    label: p.title,
    points: 0,
    probability: MERCHANT_TOTAL / active.length,
  }));
  return [
    ...ptPool.map(r => ({ ...r, probability: r.probability * ptsScale })),
    ...merItems,
  ];
}

function _handleMerchantPrizeWin(prize) {
  // Reduce remaining quantity
  const all = _getSpinMerchantPrizes();
  const idx = all.findIndex(p => p.id === prize.id);
  if (idx !== -1) {
    all[idx].remaining_quantity = Math.max(0, all[idx].remaining_quantity - 1);
    _saveSpinMerchantPrizes(all);
  }
  // Save to user rewards
  const exp = new Date();
  exp.setDate(exp.getDate() + (prize.redeem_within_days || 14));
  const reward = {
    id: 'rew_spin_' + Date.now(),
    type: 'spin_prize',
    merchant_name: prize.merchant_name,
    merchant_icon: prize.merchant_icon,
    title: prize.title,
    description: prize.description,
    terms: prize.terms,
    spin_reward_id: prize.id,
    voucher_id: _generateVoucherId(),
    status: 'available',
    earned_at: new Date().toISOString(),
    expires_at: exp.toISOString(),
    redeemed_at: null,
  };
  const rewards = _getRewards();
  rewards.unshift(reward);
  _saveRewards(rewards);
  return reward;
}

// Update spin modal preview of merchant prizes
function _renderSpinMerchantPreview() {
  const active = _getActiveMerchantPrizes();
  const el = document.getElementById('spin-merchant-preview');
  if (!el) return;
  if (!active.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `
    <div style="margin:12px 0 4px;padding:12px 14px;background:rgba(247,171,0,0.07);border:1px solid rgba(247,171,0,0.2);border-radius:12px">
      <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:#F7AB00;margin-bottom:8px">🎁 Heute auch zu gewinnen</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${active.map(p => `
          <div style="display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px 9px">
            <span style="font-size:1rem">${p.merchant_icon}</span>
            <div>
              <div style="font-size:0.62rem;font-weight:700;color:#e2e8f0;line-height:1.2">${escHtml(p.title)}</div>
              <div style="font-size:0.55rem;color:rgba(255,255,255,0.4)">${escHtml(p.merchant_name)} · noch ${p.remaining_quantity}×</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// Update home spin preview strip
function _renderHomeSpinPreview() {
  const active = _getActiveMerchantPrizes();
  const el = document.getElementById('home-spin-preview');
  if (!el) return;
  if (!active.length) { el.style.display = 'none'; return; }
  const names = active.map(p => p.merchant_icon + ' ' + p.title.split(' ').slice(0, 3).join(' ')).join(' · ');
  el.style.display = 'block';
  el.innerHTML = `
    <div style="margin:0 16px 8px;padding:10px 14px;background:rgba(247,171,0,0.07);border:1px solid rgba(247,171,0,0.18);border-radius:12px;cursor:pointer" onclick="openSpinModal()">
      <div style="font-size:0.62rem;font-weight:700;color:#F7AB00;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px">🎰 Heute im Spin</div>
      <div style="font-size:0.72rem;color:rgba(255,255,255,0.65);line-height:1.4">${escHtml(names)} · und Punkte</div>
    </div>`;
}

// =============================================
// QR Check-in (per merchant)
// =============================================
let _currentQRMerchant = null;

function initQRCheckin() {
  const btn = $('#btn-qr-checkin');
  if (!btn) return;
  btn.addEventListener('click', openQRModal);
}

function _merchantCheckinKey(merchantId) {
  const uid = ZAMApi.auth.currentUser()?.id || 'guest';
  return `zamclub_checkin_${uid}_${merchantId || 'zam'}`;
}

function _buildQRMerchantTabs() {
  const container = $('#qr-merchant-tabs');
  if (!container) return;
  const merchantList = [{ id: null, name: 'ZAM', icon: '🏢' }, ...ZAMData.merchants.slice(0, 5)];
  container.innerHTML = merchantList.map(m => {
    const done = localStorage.getItem(_merchantCheckinKey(m.id)) === _todayStr();
    return `<div class="qr-merchant-tab${done ? ' done-today' : ''}${_currentQRMerchant === m.id ? ' active' : ''}" data-mid="${m.id || ''}" onclick="selectQRMerchant('${m.id || ''}')">
      <span class="qm-icon">${m.icon}</span><span>${m.name}</span>
    </div>`;
  }).join('');
  // activate current selection
  const sel = container.querySelector(`[data-mid="${_currentQRMerchant || ''}"]`);
  if (sel && !sel.classList.contains('active')) sel.classList.add('active');
}

function selectQRMerchant(merchantId) {
  _currentQRMerchant = merchantId || null;
  $$('.qr-merchant-tab').forEach(t => t.classList.toggle('active', t.dataset.mid === (merchantId || '')));
  _updateQRDisplay();
}

function _updateQRDisplay() {
  const done    = localStorage.getItem(_merchantCheckinKey(_currentQRMerchant)) === _todayStr();
  const merchant = _currentQRMerchant ? ZAMData.merchants.find(m => m.id === _currentQRMerchant) : null;
  const label    = merchant ? merchant.name : 'ZAM Freiham';
  const checkinBtn    = $('#btn-qr-confirm');
  const checkinStatus = $('#qr-checkin-status');
  generateQRGrid();
  if (checkinBtn) {
    checkinBtn.disabled  = done;
    checkinBtn.textContent = done ? `✓ Heute bei ${label} eingecheckt` : `✅ Bei ${label} einchecken (+25 Pkt.)`;
    checkinBtn.className   = done ? 'btn btn-full claimed' : 'btn btn-primary btn-full btn-pulse';
  }
  if (checkinStatus) checkinStatus.textContent = done ? '⏰ Nächster Check-in morgen möglich' : `📍 Zeige diesen Code bei ${label}`;
}

function openQRModal() {
  const overlay = $('#modal-qr');
  if (!overlay) return;
  _currentQRMerchant = null;
  _buildQRMerchantTabs();
  _updateQRDisplay();
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const memberIdEl = $('#qr-member-id');
  if (memberIdEl) memberIdEl.textContent = `ZAM-${user.initials || 'MB'}-${String(user.points || 0).padStart(6, '0')}`;
  overlay.classList.add('open');
}

async function doCheckin() {
  const key = _merchantCheckinKey(_currentQRMerchant);
  if (localStorage.getItem(key) === _todayStr()) return;
  localStorage.setItem(key, _todayStr());

  const user = ZAMApi.auth.currentUser();
  if (user) {
    try {
      const d = JSON.parse(localStorage.getItem(`zamclub_u_${user.id}`) || '{}');
      d.stats = d.stats || {}; d.stats.visits = (d.stats.visits || 0) + 1;
      localStorage.setItem(`zamclub_u_${user.id}`, JSON.stringify(d));
      ZAMData.currentUser.stats = d.stats;
    } catch {}
  }

  await addPoints(25, 'QR Check-in');

  const merchant = _currentQRMerchant ? ZAMData.merchants.find(m => m.id === _currentQRMerchant) : null;
  const label = merchant ? merchant.name : 'ZAM Freiham';
  const checkinBtn    = $('#btn-qr-confirm');
  const checkinStatus = $('#qr-checkin-status');
  if (checkinBtn) { checkinBtn.disabled = true; checkinBtn.textContent = `✓ Bei ${label} eingecheckt!`; checkinBtn.className = 'btn btn-full claimed'; }
  if (checkinStatus) checkinStatus.textContent = '🎉 +25 Punkte wurden gutgeschrieben!';

  _buildQRMerchantTabs();
  const visitsEl = $('#profile-stat-visits');
  if (visitsEl) visitsEl.textContent = ZAMData.currentUser.stats?.visits || 0;

  showToast(`📍 ${label} Check-in! +25 Punkte`, 'success');
  await checkBadgesAfterAction();
  renderChallenges();
}

function generateQRGrid() {
  const container = $('#qr-grid');
  if (!container) return;
  container.innerHTML = '';
  const size = 8;
  for (let i = 0; i < size * size; i++) {
    const cell = el('div', 'qr-cell');
    const filled = ((i * 13 + 7) % 3 !== 0);
    cell.style.background = filled ? '#1a1a1a' : 'white';
    container.appendChild(cell);
  }
}

// =============================================
// Community Page
// =============================================
async function renderCommunity() {
  const container = $('#community-feed');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-text-muted)">Lädt…</div>';

  const posts = await ZAMApi.posts.list();
  state.posts = posts;
  container.innerHTML = '';

  if (posts.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-text-muted)">Noch keine Beiträge.</div>';
    return;
  }
  posts.forEach((post, idx) => container.appendChild(renderPostCard(post, idx)));
}

function renderPostCard(post, idx) {
  const div = el('div', 'community-post card-dark');
  div.dataset.postId = post.id;
  const currentUser = ZAMApi.auth.currentUser();
  const isOwn = currentUser && post.user_id === currentUser.id;

  const tagsHtml = (post.tags || []).map(t => `<span class="post-tag">${t}</span>`).join('');
  const deleteBtn = isOwn ? `<button class="post-delete-btn" title="Löschen" aria-label="Beitrag löschen">🗑</button>` : '';
  const statusBadge = post.status === 'pending' ? `<span style="font-size:0.68rem;color:#F7AB00;margin-left:6px">⏳ ausstehend</span>` : '';

  const authorPts = post.author?.points || _demoUserPts(post.author?.id || post.author?.name || '');
  const authorTier = _getTier(authorPts);
  // For the current user's own posts, show their real top badges + title
  const isCurrentUser = currentUser && post.user_id === currentUser.id;
  const authorTopBadges = isCurrentUser ? _getTopBadges() : (post.author?.top_badges || []);
  const authorTitle = isCurrentUser ? _getProfileTitle() : (post.author?.title || '');
  const authorTitleObj = _PROFILE_TITLES.find(t => t.key === authorTitle);
  const topBadgesHtml = authorTopBadges.length
    ? authorTopBadges.map(key => { const b = _ACHIEVEMENTS.find(a => a.key === key); return b ? `<span title="${b.name}" style="font-size:0.8rem">${b.icon}</span>` : ''; }).join('')
    : '';
  div.innerHTML = `
    <div class="post-header">
      <div class="tier-ring tier-ring--${authorTier.key}" style="width:38px;height:38px;background:${post.author?.avatar_color || '#FA4615'};font-size:13px;font-weight:800;color:#fff;flex-shrink:0;cursor:pointer" onclick="openUserProfileSheet('${post.user_id||''}','${(post.author?.name||'').replace(/'/g,"\\'")}','${post.author?.initials||'?'}',null,${authorPts})">${post.author?.initials || '?'}</div>
      <div class="post-author-info">
        <div class="post-author-name" style="display:flex;align-items:center;gap:5px;cursor:pointer" onclick="openUserProfileSheet('${post.user_id||''}','${(post.author?.name||'').replace(/'/g,"\\'")}','${post.author?.initials||'?'}',null,${authorPts})">${post.author?.name || 'Unbekannt'}${statusBadge}${topBadgesHtml ? `<span style="display:flex;gap:2px;margin-left:2px">${topBadgesHtml}</span>` : ''}</div>
        <div class="post-author-level" style="display:flex;align-items:center;gap:4px">${authorTitleObj ? `<span style="font-size:0.6rem;color:#ffb399;font-weight:700">${authorTitleObj.label}</span>` : ''}<span class="tier-badge tier-badge--${authorTier.key}">${authorTier.emoji} ${authorTier.label}</span></div>
      </div>
      <div class="post-time">${post.time_ago || ''}</div>
      ${deleteBtn}
    </div>
    <div class="post-content">${post.content}</div>
    <div class="post-tags">${tagsHtml}</div>
    <div class="post-actions">
      <button class="post-action-btn ${post.is_liked ? 'liked' : ''}" data-idx="${idx}">
        <span class="action-icon">${post.is_liked ? '❤️' : '🤍'}</span>
        <span class="like-count">${post.likes || 0}</span>
      </button>
      <button class="post-action-btn" data-comments-post="${post.id}">
        <span class="action-icon">💬</span>
        <span>${post.comments || 0}</span>
      </button>
      <button class="post-action-btn" style="margin-left:auto">
        <span class="action-icon">↗️</span>
        Teilen
      </button>
    </div>
  `;

  div.querySelector('[data-idx]').addEventListener('click', () => toggleLike(idx, div));
  const commentsBtn = div.querySelector('[data-comments-post]');
  if (commentsBtn) commentsBtn.addEventListener('click', () => openComments(post.id, post.author?.name));
  if (isOwn) {
    const delBtn = div.querySelector('.post-delete-btn');
    if (delBtn) delBtn.addEventListener('click', () => deletePost(post.id, div));
  }
  return div;
}

async function deletePost(postId, cardEl) {
  if (!confirm('Beitrag löschen?')) return;
  try {
    await ZAMApi.posts.delete(postId);
    cardEl.style.opacity = '0';
    cardEl.style.transition = 'opacity 0.3s';
    setTimeout(() => cardEl.remove(), 300);
    showToast('Beitrag gelöscht', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function toggleLike(idx, cardEl) {
  const post = state.posts[idx];
  post.is_liked = !post.is_liked;
  post.likes = Math.max(0, (post.likes || 0) + (post.is_liked ? 1 : -1));

  if (post.is_liked) await ZAMApi.posts.like(post.id);
  else await ZAMApi.posts.unlike(post.id);

  const likeBtn = cardEl.querySelector('[data-idx]');
  const icon = likeBtn?.querySelector('.action-icon');
  const count = likeBtn?.querySelector('.like-count');
  if (likeBtn) likeBtn.classList.toggle('liked', post.is_liked);
  if (icon) icon.textContent = post.is_liked ? '❤️' : '🤍';
  if (count) count.textContent = post.likes;
  if (likeBtn) {
    likeBtn.style.transform = 'scale(1.4)';
    setTimeout(() => { likeBtn.style.transform = ''; }, 220);
  }
}

// =============================================
// Events Page
// =============================================
async function renderEvents(filter = 'all') {
  state.eventFilter = filter;
  const container = $('#events-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-text-muted)">Lädt…</div>';

  $$('.filter-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.filter === filter));

  state.events = await ZAMApi.events.list(filter);
  container.innerHTML = '';
  state.events.forEach((evt, idx) => container.appendChild(renderEventCard(evt, idx)));
}

function renderEventCard(evt, idx) {
  const div = el('div', 'event-card-full card-dark');
  div.style.cssText = `border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.3);--accent-color:${evt.category_color}`;
  div.style.setProperty('--accent-color', evt.category_color);
  const spotsLow = evt.spots_left <= 10;
  const attendees = (evt.spots_total || 500) - (evt.spots_left || 0);
  // Cover gradient derived from category color
  const coverEmojis = {'Food & Lifestyle':'🍜🎵🌿','Kultur & Musik':'🎶🎸🎺','Sport & Wellness':'🏋️⚡🏃','Shopping & Mode':'👗✨🛍️','Community':'👥🎉💬'};
  const coverEmoji = Object.entries(coverEmojis).find(([k]) => evt.category?.includes(k.split(' ')[0]))?.[1] || '🎉✨🌟';

  div.innerHTML = `
    <!-- Event Cover Banner -->
    <div style="margin:-16px -16px 14px;height:100px;border-radius:14px 14px 0 0;background:linear-gradient(135deg,${evt.category_color}55,${evt.category_color}22);display:flex;align-items:center;justify-content:center;font-size:3rem;letter-spacing:8px;overflow:hidden;position:relative">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg,${evt.category_color}44 0%,rgba(0,0,0,0.2) 100%)"></div>
      <span style="position:relative;z-index:1;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5))">${coverEmoji.split('').join(' ')}</span>
      <div style="position:absolute;top:10px;right:10px;display:flex;align-items:center;gap:6px">
        <button class="bookmark-btn ${evt.is_saved ? 'saved' : ''}" data-type="event" data-id="${evt.id}" aria-label="${evt.is_saved ? 'Gespeichert' : 'Merken'}" style="width:30px;height:30px;border-radius:8px;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:0.85rem;cursor:pointer">
          ${evt.is_saved ? '🔖' : '🏷️'}
        </button>
        <div class="event-points-badge">+${evt.points_reward}P</div>
      </div>
    </div>
    <div class="event-card-top" style="margin-bottom:8px">
      <div class="category-tag tag" style="background:${evt.category_color}22;color:${evt.category_color}">${evt.category}</div>
      <div style="display:flex;align-items:center;gap:5px;font-size:0.65rem;color:rgba(255,255,255,0.45)">
        <span>👥</span><span>${attendees.toLocaleString('de-DE')} Teilnehmer</span>
      </div>
    </div>
    <h3>${evt.title}</h3>
    <div class="event-details">
      <div class="event-detail-row"><span>📅</span><span>${evt.date_formatted}</span></div>
      <div class="event-detail-row"><span>⏰</span><span>${evt.time}</span></div>
      <div class="event-detail-row"><span>📍</span><span>${evt.location}</span></div>
    </div>
    <p class="event-description">${evt.description}</p>
    <div class="event-card-footer">
      <div class="spots-info">
        ${spotsLow
          ? `<strong>Nur noch ${evt.spots_left} Plätze!</strong>`
          : `${evt.spots_left} Plätze frei`}
      </div>
      <button class="${evt.is_joined ? 'btn btn-sm joined' : 'btn btn-primary btn-sm'}" data-idx="${idx}">
        ${evt.is_joined ? '✓ Angemeldet' : 'Teilnehmen'}
      </button>
    </div>
    ${evt.is_joined ? _eventCheckinBtn(evt) : ''}
  `;

  div.querySelector('.bookmark-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSave('event', evt.id, e.currentTarget);
    evt.is_saved = isSaved('event', evt.id);
  });

  div.querySelector('.btn').addEventListener('click', () => joinEvent(idx, div));
  return div;
}

async function joinEvent(idx, cardEl) {
  const evt = state.events[idx];
  if (evt.is_joined) return;

  await ZAMApi.events.register(evt.id);
  evt.is_joined = true;
  evt.spots_left = Math.max(0, (evt.spots_left || 0) - 1);

  // Update stats
  const user = ZAMApi.auth.currentUser();
  if (user) {
    const statsKey = `zamclub_u_${user.id}`;
    try {
      const d = JSON.parse(localStorage.getItem(statsKey) || '{}');
      d.stats = d.stats || {};
      d.stats.events_attended = (d.stats.events_attended || 0) + 1;
      localStorage.setItem(statsKey, JSON.stringify(d));
      ZAMData.currentUser.stats = d.stats;
    } catch {}
  }

  const btn = cardEl.querySelector('.btn');
  if (btn) { btn.className = 'btn btn-sm joined'; btn.textContent = '✓ Angemeldet'; }

  const eventsEl = $('#profile-stat-events');
  if (eventsEl) eventsEl.textContent = ZAMData.currentUser.stats?.events_attended || 0;
  showToast('🎉 Angemeldet! Checke vor Ort ein um Punkte zu erhalten.', 'success');
  renderEvents();
}

// =============================================
// Deals Page
// =============================================
let _dealsActiveTab = 'all';

function setDealsTab(tab) {
  _dealsActiveTab = tab;
  ['all','deals','partner'].forEach(t => {
    const btn = document.getElementById('deals-tab-'+t);
    if (!btn) return;
    const active = t === tab;
    btn.style.background = active ? 'rgba(250,70,21,1)' : 'rgba(255,255,255,0.07)';
    btn.style.color = active ? '#fff' : 'rgba(255,255,255,0.55)';
    btn.style.border = active ? 'none' : '1px solid rgba(255,255,255,0.1)';
  });
  renderDeals();
}

// Weighted shuffle: new deals and expiring deals get a score boost,
// then a random tiebreaker so the order is different on every page load.
function _shuffleDeals(deals) {
  const now = Date.now();
  const scored = deals.map(d => {
    let score = Math.random(); // base: fully random
    // Boost deals expiring within 3 days
    if (d.expiry_date) {
      const msLeft = new Date(d.expiry_date) - now;
      if (msLeft > 0 && msLeft < 3 * 86400000) score += 0.35;
    }
    // Boost deals created within last 7 days
    if (d.created_at || d.submittedAt) {
      const age = now - new Date(d.created_at || d.submittedAt);
      if (age < 7 * 86400000) score += 0.25;
    }
    return { d, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.d);
}

async function renderDeals() {
  const container = $('#deals-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-text-muted)">Lädt…</div>';

  const rawDeals = await ZAMApi.deals.list();
  state.deals = _shuffleDeals(rawDeals);
  container.innerHTML = '';

  // Partner deals from localStorage (also shuffled)
  const partnerDeals = _shuffleDeals(_getPD2ActiveDeals());

  if (_dealsActiveTab === 'partner') {
    if (!partnerDeals.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.35);font-size:0.82rem">Noch keine Partner-Deals aktiv</div>';
      return;
    }
    partnerDeals.forEach(pd => container.appendChild(_renderPartnerDealCard(pd)));
    return;
  }

  if (_dealsActiveTab === 'deals') {
    state.deals.forEach((deal, idx) => container.appendChild(renderDealCard(deal, idx)));
    return;
  }

  // 'all': interleave partner deals randomly with regular deals
  const allMixed = _shuffleDeals([
    ...state.deals,
    ...partnerDeals.map(pd => ({ ...pd, _isPartner: true }))
  ]);
  allMixed.forEach((item, idx) => {
    if (item._isPartner) container.appendChild(_renderPartnerDealCard(item));
    else container.appendChild(renderDealCard(item, idx));
  });
}

// ── Deal Media Renderer ─────────────────────────────────────────
// Lazy: thumbnails on card, full media only after user click.
// Future hook for "Neu im ZAM" feed: _ZAM_NEW_FEED_KEY
const _ZAM_NEW_FEED_KEY = 'zam_new_in_zam_feed';

function _dealMediaHtml(deal) {
  const type = deal.media_type;
  const url  = deal.media_url || '';
  if (!type || type === 'text' || !url) return '';

  if (type === 'image') {
    return '<div style="margin:-16px -16px 14px;height:180px;border-radius:14px 14px 0 0;overflow:hidden">' +
      '<img src="' + escHtml(url) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block" alt="Deal-Bild"></div>';
  }

  if (type === 'video') {
    // Poster frame: show play button overlay, load video only on click
    const safeVideoUrl = url.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return '<div id="dmv_' + deal.id + '" onclick="_playDealVideo(this,\'' + safeVideoUrl + '\')" style="margin:-16px -16px 14px;height:200px;border-radius:14px 14px 0 0;overflow:hidden;cursor:pointer;background:#000;display:flex;align-items:center;justify-content:center;position:relative">' +
      (deal.media_thumbnail ? '<img src="' + escHtml(deal.media_thumbnail) + '" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.7">' : '<div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(250,70,21,0.3),rgba(0,0,0,0.6))"></div>') +
      '<div style="position:relative;width:56px;height:56px;border-radius:50%;background:rgba(250,70,21,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(250,70,21,0.5)">' +
        '<span style="font-size:1.4rem;margin-left:4px">▶</span>' +
      '</div>' +
      '<div style="position:absolute;bottom:10px;left:12px;font-size:0.6rem;font-weight:700;color:rgba(255,255,255,0.7)">📹 Video</div>' +
    '</div>';
  }

  if (type === 'instagram') {
    return '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" style="display:block;margin:-16px -16px 14px;text-decoration:none">' +
      '<div style="height:160px;border-radius:14px 14px 0 0;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;position:relative;overflow:hidden">' +
        '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.25)"></div>' +
        '<div style="position:relative;font-size:2rem">📸</div>' +
        '<div style="position:relative;display:flex;align-items:center;gap:6px">' +
          '<span style="font-size:0.72rem;font-weight:800;color:#fff">Instagram Reel ansehen</span>' +
          '<span style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:0.8rem">▶</span>' +
        '</div>' +
        '<div style="position:absolute;top:10px;right:12px;font-size:0.6rem;font-weight:700;color:rgba(255,255,255,0.6)">Instagram</div>' +
      '</div>' +
    '</a>';
  }

  if (type === 'tiktok') {
    return '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" style="display:block;margin:-16px -16px 14px;text-decoration:none">' +
      '<div style="height:160px;border-radius:14px 14px 0 0;background:linear-gradient(135deg,#010101,#161823);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;position:relative;overflow:hidden">' +
        '<div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,242,234,0.15),rgba(254,44,85,0.15))"></div>' +
        '<div style="position:relative;font-size:2rem">🎵</div>' +
        '<div style="position:relative;display:flex;align-items:center;gap:6px">' +
          '<span style="font-size:0.72rem;font-weight:800;color:#fff">TikTok Video ansehen</span>' +
          '<span style="width:28px;height:28px;border-radius:50%;background:rgba(254,44,85,0.5);display:flex;align-items:center;justify-content:center;font-size:0.8rem">▶</span>' +
        '</div>' +
        '<div style="position:absolute;top:10px;right:12px;font-size:0.6rem;font-weight:700;color:rgba(255,255,255,0.5)">TikTok</div>' +
      '</div>' +
    '</a>';
  }
  return '';
}

function _playDealVideo(container, src) {
  const video = document.createElement('video');
  video.src = src;
  video.controls = true;
  video.autoplay = true;
  video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
  container.innerHTML = '';
  container.appendChild(video);
  container.style.cursor = 'default';
}

function renderDealCard(deal, idx) {
  const div = el('div', 'deal-card-full card-dark');
  div.style.cssText = 'border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.3);padding:16px';

  const _mediaHtml = _dealMediaHtml(deal);
  div.innerHTML = _mediaHtml + `
    <!-- Merchant Logo Banner -->
    <div style="margin:-16px -16px 14px;height:72px;border-radius:${_mediaHtml ? '0' : '14px 14px'} 0 0;background:linear-gradient(135deg,${deal.category_color}33,${deal.category_color}11);display:flex;align-items:center;padding:0 16px;gap:14px;position:relative;overflow:hidden">
      <div style="width:52px;height:52px;border-radius:14px;background:${deal.category_color}22;border:1px solid ${deal.category_color}33;display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0">${deal.store_icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.72rem;font-weight:800;color:${deal.category_color};text-transform:uppercase;letter-spacing:0.06em">${deal.store_name}</div>
        <div style="font-size:1.2rem;font-weight:900;color:#fff;line-height:1.1">${deal.discount}</div>
      </div>
      ${deal.is_hot ? '<div class="hot-badge" style="position:absolute;top:10px;right:10px">🔥 Hot</div>' : ''}
      <button class="bookmark-btn ${deal.is_saved ? 'saved' : ''}" data-type="deal" data-id="${deal.id}" aria-label="Merken" style="position:absolute;bottom:10px;right:10px;width:28px;height:28px;border-radius:8px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:0.8rem;cursor:pointer">
        ${deal.is_saved ? '🔖' : '🏷️'}
      </button>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div class="category-tag tag" style="background:${deal.category_color}22;color:${deal.category_color}">${deal.category}</div>
    </div>
    <div class="deal-title">${deal.title}</div>
    <p class="deal-description">${deal.description}</p>
    <div class="deal-footer">
      <div class="deal-validity" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:0.72rem;color:rgba(255,255,255,0.4)">📅 ${deal.expiry_formatted}</span>
        ${_countdownBadge(deal.expiry_date)}
      </div>
      <div class="deal-actions">
        <button onclick="openDealMatch('${deal.id}','${(deal.title||'').replace(/'/g,"\\'")}');event.stopPropagation()" class="deal-action-btn deal-action-social">👥 Gemeinsam</button>
        <button id="di_btn_${deal.id}" onclick="_toggleDealInterestUI('${deal.id}','${(deal.title||'').replace(/'/g,"\\'")}');event.stopPropagation()" class="deal-action-btn" style="background:${_isInterestedInDeal(deal.id) ? 'rgba(247,171,0,0.2)' : 'rgba(255,255,255,0.07)'};border:1px solid ${_isInterestedInDeal(deal.id) ? 'rgba(247,171,0,0.4)' : 'rgba(255,255,255,0.12)'};color:${_isInterestedInDeal(deal.id) ? '#F7AB00' : 'rgba(255,255,255,0.55)'};border-radius:10px;padding:0 10px;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer;white-space:nowrap">${_isInterestedInDeal(deal.id) ? '⭐ Interessiert' : '⭐ Interessiert?'}</button>
        <button onclick="openVoucherQR('${deal.id}','${(deal.title||'').replace(/'/g,"\\'")}','${deal.merchant_id||''}');event.stopPropagation()" class="deal-action-btn deal-action-redeem">🎟 Einlösen</button>
        <button class="${deal.is_claimed ? 'btn btn-sm claimed save-voucher-button' : 'btn btn-primary btn-sm save-voucher-button'}" data-idx="${idx}">
          ${deal.is_claimed ? '✓ Eingelöst' : 'Gutschein sichern'}
        </button>
      </div>
    </div>
  `;

  div.querySelector('.bookmark-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSave('deal', deal.id, e.currentTarget);
    deal.is_saved = isSaved('deal', deal.id);
  });

  const claimBtn = div.querySelector('.btn');
  if (!deal.is_claimed) {
    claimBtn.addEventListener('click', () => claimDeal(idx, div, deal));
  }

  return div;
}

function _renderPartnerDealCard(pd) {
  const div = document.createElement('div');
  div.style.cssText = 'border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.3);padding:16px;margin-bottom:12px;background:linear-gradient(135deg,rgba(250,70,21,0.08),rgba(247,171,0,0.05));border:1px solid rgba(250,70,21,0.25)';
  const expiryStr = pd.expires_at ? new Date(pd.expires_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'}) : '—';
  const aName = pd.a.name; const bName = pd.b.name;
  const aIcon = pd.a.icon; const bIcon = pd.b.icon;
  const aBtn = pd.a.name + ' + ' + pd.b.name;
  div.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px">
      <span style="font-size:0.6rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;padding:3px 8px;background:rgba(250,70,21,0.15);color:#FA4615;border:1px solid rgba(250,70,21,0.3);border-radius:6px">🤝 Partner Deal</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="font-size:2rem">${aIcon}</div>
      <div style="font-size:0.7rem;color:rgba(255,255,255,0.35);font-weight:700">+</div>
      <div style="font-size:2rem">${bIcon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.92rem;font-weight:900;color:#fff;line-height:1.2">${escHtml(pd.title)}</div>
        <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:2px">${escHtml(aName)} + ${escHtml(bName)}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px">
        <div style="font-size:0.6rem;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">${escHtml(aName)}</div>
        <div style="font-size:0.78rem;font-weight:700;color:#FA4615">${escHtml(pd.a.benefit)}</div>
        ${pd.a.condition ? '<div style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-top:4px">' + escHtml(pd.a.condition) + '</div>' : ''}
      </div>
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px">
        <div style="font-size:0.6rem;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">${escHtml(bName)}</div>
        <div style="font-size:0.78rem;font-weight:700;color:#F7AB00">${escHtml(pd.b.benefit)}</div>
        ${pd.b.condition ? '<div style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-top:4px">' + escHtml(pd.b.condition) + '</div>' : ''}
      </div>
    </div>
    <div style="font-size:0.68rem;color:rgba(255,255,255,0.5);line-height:1.6;margin-bottom:14px">${escHtml(pd.description||'')}</div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:0.6rem;color:rgba(255,255,255,0.3)">📅 Bis ${expiryStr} · ${pd.participants||0} Teilnehmer</div>
      <button onclick="securePartnerVoucher('${escHtml(pd.id)}')" style="background:#FA4615;border:none;border-radius:10px;padding:8px 14px;color:#fff;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">Gutschein sichern</button>
    </div>`;
  return div;
}

async function claimDeal(idx, cardEl, deal) {
  const overlay = $('#modal-barcode');
  if (!overlay) return;

  const title = $('#modal-barcode-title');
  const subtitle = $('#modal-barcode-subtitle');
  const barcodeNum = $('#barcode-number');
  if (title) title.textContent = deal.title;
  if (subtitle) subtitle.textContent = (deal.store_name || '') + ' · ' + (deal.expiry_formatted || '');
  if (barcodeNum) barcodeNum.textContent = deal.barcode || '0000-0000-0000';

  generateBarcode();
  overlay.classList.add('open');

  await ZAMApi.deals.redeem(deal.id);

  // Update stats
  const user = ZAMApi.auth.currentUser();
  if (user) {
    try {
      const d = JSON.parse(localStorage.getItem(`zamclub_u_${user.id}`) || '{}');
      d.stats = d.stats || {};
      d.stats.deals_used = (d.stats.deals_used || 0) + 1;
      localStorage.setItem(`zamclub_u_${user.id}`, JSON.stringify(d));
      ZAMData.currentUser.stats = d.stats;
    } catch {}
  }

  state.deals[idx].is_claimed = true;
  const btn = cardEl.querySelector('[data-idx]') || cardEl.querySelector('.btn');
  if (btn) { btn.className = 'btn btn-sm claimed'; btn.textContent = '✓ Eingelöst'; btn.disabled = true; }

  await addPoints(deal.points_reward || 0, deal.store_name || 'Deal');
  const dealsEl = $('#profile-stat-deals');
  if (dealsEl) dealsEl.textContent = ZAMData.currentUser.stats?.deals_used || 0;
  await checkBadgesAfterAction();
  renderChallenges();
}

function generateBarcode() {
  const container = $('#barcode-lines');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 48; i++) {
    const line = el('div', 'barcode-line');
    line.style.width = (Math.random() < 0.3 ? 4 : Math.random() < 0.5 ? 2 : 3) + 'px';
    line.style.flex = 'none';
    container.appendChild(line);
  }
}

// =============================================
// Merchants Page
// =============================================
function renderMerchants() {
  state.merchants = ZAMData.merchants.map(m => ({ ...m }));
  const container = $('#merchants-list');
  if (!container) return;
  container.innerHTML = '';
  state.merchants.forEach((merchant, idx) => {
    container.appendChild(renderMerchantCard(merchant, idx));
  });
}

function renderMerchantCard(merchant, idx) {
  const div = el('div', 'merchant-card');
  div.innerHTML = `
    <div class="merchant-card-header">
      <div class="merchant-icon">${merchant.icon}</div>
      <div class="merchant-info">
        <div class="merchant-name">${merchant.name}</div>
        <div class="merchant-category">${merchant.category}</div>
        <div class="merchant-meta">
          ${merchant.is_open
            ? '<span class="open-badge">Geöffnet</span>'
            : '<span class="open-badge" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.25)">Geschlossen</span>'}
          <span class="merchant-rating">⭐ ${merchant.rating} (${merchant.review_count})</span>
        </div>
      </div>
      <span class="merchant-expand-icon">▼</span>
    </div>
    <div class="merchant-details">
      <div class="merchant-details-inner">
        <p class="merchant-description">${merchant.description}</p>
        <div class="merchant-detail-row"><span class="detail-icon">⏰</span><span>${merchant.hours}</span></div>
        <div class="merchant-detail-row"><span class="detail-icon">📍</span><span>${merchant.location}</span></div>
        <div class="merchant-detail-row"><span class="detail-icon">📞</span><span>${merchant.phone}</span></div>
        <div class="merchant-promo-badge" style="background:${merchant.promo_color}22;color:${merchant.promo_color};border:1px solid ${merchant.promo_color}44">
          🎁 ${merchant.current_promo}
        </div>
      </div>
    </div>
  `;

  div.querySelector('.merchant-card-header').addEventListener('click', () => {
    openMerchantDetail(merchant.id);
  });

  return div;
}

// =============================================
// Profile Page
// =============================================
async function renderProfile() {
  _checkReferralBonuses();
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const pts = await ZAMApi.points.get();
  let stats = user.stats || ZAMData.currentUser.stats;
  if (user.id && user.id !== 'guest') {
    try {
      const d = JSON.parse(localStorage.getItem(`zamclub_u_${user.id}`) || '{}');
      if (d.stats) stats = d.stats;
    } catch {}
  }

  const nameEl = $('#profile-name');
  const usernameEl = $('#profile-username');
  const memberEl = $('#profile-member');
  const pointsEl = $('#profile-points-value');
  const avatarEl = $('#profile-avatar');
  const visitsEl = $('#profile-stat-visits');
  const eventsEl = $('#profile-stat-events');
  const dealsEl = $('#profile-stat-deals');

  if (nameEl) nameEl.textContent = user.display_name || 'Nutzer';
  if (usernameEl) usernameEl.textContent = user.username || '@nutzer';
  if (memberEl) memberEl.textContent = user.member_since_formatted || 'Neues Mitglied';
  if (pointsEl) pointsEl.textContent = pts.toLocaleString('de-DE');
  if (avatarEl) {
    if (user.avatar_url) {
      avatarEl.style.backgroundImage = `url(${user.avatar_url})`;
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.textContent = '';
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.textContent = user.initials || '?';
    }
  }
  if (visitsEl) visitsEl.textContent = stats?.visits || 0;
  if (eventsEl) eventsEl.textContent = stats?.events_attended || 0;
  if (dealsEl) dealsEl.textContent = stats?.deals_used || 0;

  updatePointsDisplay();
  renderBadges();
  renderRoleActions();
  await renderSavedSummary();
  renderChallenges();
  checkDailyStreak();
  _renderStreakBanner('profile-streak-banner');
  renderAchievements('profile-achievements-container');
  _applyProfileBanner();
  _renderTopBadgesDisplay();
  _renderProfileTitle();
  // Set tier data attribute for CSS tier effects
  const heroEl = document.querySelector('.profile-hero');
  if (heroEl) heroEl.dataset.tier = _getTier(pts).key;
  renderProfileVitrine();

  // Update Nearby badge in profile
  const nearbyBadge = document.getElementById('nearby-profile-badge');
  if (nearbyBadge) {
    const ns = NEARBY.getSettings();
    nearbyBadge.textContent = ns.enabled ? '✅ Aktiv' : 'Deaktiviert';
    nearbyBadge.style.color = ns.enabled ? '#34d399' : 'rgba(255,255,255,0.35)';
  }
}

async function renderSavedSummary() {
  const savedEventsArr = await ZAMApi.profile.savedEvents();
  const savedDealsArr = await ZAMApi.profile.savedDeals();

  const container = $('#profile-saved-summary');
  if (!container) return;

  if (savedDealsArr.length === 0 && savedEventsArr.length === 0) {
    container.innerHTML = '<div style="font-size:0.8rem;color:var(--color-text-muted)">Noch nichts gemerkt.</div>';
    return;
  }

  container.innerHTML = [
    savedEventsArr.length ? `<div class="saved-chip" onclick="navigateTo('events')">🔖 ${savedEventsArr.length} Event${savedEventsArr.length !== 1 ? 's' : ''} gemerkt</div>` : '',
    savedDealsArr.length ? `<div class="saved-chip" onclick="navigateTo('deals')">🏷️ ${savedDealsArr.length} Deal${savedDealsArr.length !== 1 ? 's' : ''} gemerkt</div>` : '',
    savedDealsArr.length ? `<div class="saved-chip" onclick="openSavedDeals()" style="background:var(--primary,#FA4615);color:white;border-color:var(--primary,#FA4615)">Gespeicherte Deals →</div>` : '',
  ].join('');
}

function renderRoleActions() {
  const user = ZAMApi.auth.currentUser();
  const container = $('#profile-role-actions');
  if (!container || !user) return;

  if (user.role === 'admin') {
    container.innerHTML = `
      <a href="admin.html" class="btn btn-primary btn-full" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px;padding:13px">
        🛡️ Admin-Dashboard
        <span id="admin-notif-badge" style="background:rgba(255,255,255,0.25);border-radius:20px;padding:1px 8px;font-size:0.72rem;margin-left:6px;display:none">0</span>
      </a>
      <button class="btn btn-ghost btn-full" onclick="navigateTo('admin-dashboard')" style="margin-bottom:8px">
        📊 Center Analytics
      </button>
      <button class="btn btn-ghost btn-full" onclick="navigateTo('admin-dashboard');setTimeout(()=>document.getElementById('admin-merchants-container')?.scrollIntoView({behavior:'smooth'}),400)" style="margin-bottom:8px">
        🏪 Händler verwalten
      </button>
      <button class="btn btn-ghost btn-full" onclick="navigateTo('admin-revenue')" style="margin-bottom:8px">
        💰 Umsatzübersicht
      </button>
      <button class="btn btn-ghost btn-full" onclick="navigateTo('admin-ai-insights')" style="margin-bottom:8px">
        🤖 KI-Insights
      </button>`;
    ZAMApi.admin.unreadCount().then(count => {
      const badge = $('#admin-notif-badge');
      if (badge && count > 0) { badge.textContent = count; badge.style.display = 'inline'; }
    });
    // Admin can also see merchant tools
    container.innerHTML += `
      <div style="background:rgba(196,53,16,0.1);border:1px solid rgba(250,70,21,0.2);border-radius:14px;padding:14px 16px;margin-top:4px">
        <div style="font-size:0.72rem;font-weight:700;color:rgba(255,179,153,0.7);margin-bottom:10px">🏪 Händler Tools (Admin)</div>
        <button class="btn btn-ghost btn-full" onclick="openQRScanner()" style="margin-bottom:6px">📷 QR-Code scannen</button>
        <button class="btn btn-ghost btn-full" onclick="openMerchantStatsOverlay()" style="margin-bottom:6px">📊 Händler-Statistiken</button>
        <button class="btn btn-ghost btn-full" onclick="openMerchantDealModal()">🏷️ Demo Deal einreichen</button>
      </div>`;
  } else if (user.role === 'merchant') {
    container.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(196,53,16,0.2),rgba(250,70,21,0.1));border:1px solid rgba(250,70,21,0.3);border-radius:14px;padding:14px 16px;margin-bottom:12px">
        <div style="font-size:0.78rem;font-weight:800;color:#ffb399;margin-bottom:12px">🏪 Händler Tools</div>
        <button class="btn btn-primary btn-full" onclick="openQRScanner()" style="margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px">
          📷 QR-Code scannen
        </button>
        <button class="btn btn-ghost btn-full" onclick="openMerchantStatsOverlay()" style="margin-bottom:8px">
          📊 Meine Statistiken
        </button>
        <button class="btn btn-ghost btn-full" onclick="openMerchantDealModal()" style="margin-bottom:8px">
          🏷️ Deal einreichen
        </button>
        <button class="btn btn-ghost btn-full" onclick="openMerchantEventModal()" style="margin-bottom:8px">
          📅 Event einreichen
        </button>
        <button class="btn btn-ghost btn-full" onclick="navigateTo('merchant-dashboard')" style="margin-bottom:0">
          ⚙️ Vollständiges Dashboard
        </button>
      </div>`;
  } else if (user.role === 'merchant' && user.merchant_status === 'pending') {
    container.innerHTML = `
      <div style="background:rgba(247,171,0,0.08);border:1px solid rgba(247,171,0,0.25);border-radius:12px;padding:14px 16px;text-align:center;margin-bottom:8px">
        <div style="font-size:1.4rem;margin-bottom:6px">⏳</div>
        <div style="font-size:0.8rem;font-weight:700;color:#F7AB00;margin-bottom:4px">Zugang wird geprüft</div>
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);line-height:1.6">Das ZAM Center Management prüft deinen Händlerzugang. Du wirst benachrichtigt.</div>
      </div>`;
  } else {
    container.innerHTML = `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;text-align:center;margin-bottom:8px">
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.35);line-height:1.6">Händlerzugang ist nur auf Einladung<br>durch das ZAM Center Management möglich.</div>
      </div>`;
  }
}

async function renderBadges() {
  const container = $('#badges-grid');
  if (!container) return;
  container.innerHTML = '';
  const badges = await ZAMApi.badges.list();
  badges.forEach(badge => {
    const item = el('div', badge.earned ? 'badge-item' : 'badge-item locked');
    const wrap = el('div', 'badge-icon-wrap');
    wrap.style.background = badge.earned ? badge.color + '22' : 'rgba(255,255,255,0.05)';
    wrap.style.border = badge.earned ? `1px solid ${badge.color}44` : '1px solid rgba(255,255,255,0.1)';
    wrap.textContent = badge.icon;
    const name = el('div', 'badge-name', { textContent: badge.name });
    item.appendChild(wrap);
    item.appendChild(name);
    if (badge.earned) item.addEventListener('click', () => showToast(`${badge.icon} ${badge.name}: ${badge.description}`));
    container.appendChild(item);
  });
}

// =============================================
// Community sub-tabs
// =============================================
function initCommunityTabs() {
  $$('.community-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.community-tab').forEach(t => t.classList.remove('active'));
      $$('.community-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $(`#cpanel-${tab.dataset.ctab}`)?.classList.add('active');
      const hBtn = $('#community-header-btn');
      if (hBtn) hBtn.style.visibility = tab.dataset.ctab === 'wall' ? '' : 'hidden';
      if (tab.dataset.ctab === 'chat')     renderChatRooms();
      if (tab.dataset.ctab === 'contacts') renderContacts();
      if (tab.dataset.ctab === 'nudges')   renderNudgeInbox();
    });
  });
}

function communityHeaderAction() {
  const activeTab = $('.community-tab.active')?.dataset.ctab;
  if (!activeTab || activeTab === 'wall') openNewPostModal();
}

// =============================================
// Chat — Room List
// =============================================
function renderChatRooms() {
  const { global, events } = ZAMApi.chat.rooms();
  const onlineCount = ZAMApi.chat.onlineCount();
  const onlineEl = $('#online-count-text');
  if (onlineEl) onlineEl.textContent = `${onlineCount} Nutzer aktuell online`;

  _renderRoomList('#chat-rooms-global', global);
  _renderRoomList('#chat-rooms-events', events);
}

function _renderRoomList(selector, rooms) {
  const container = $(selector);
  if (!container) return;
  container.innerHTML = rooms.map(r => `
    <div class="chat-room-card" onclick="openChatRoom('${r.id}','${r.name.replace(/'/g,"\\'")}')">
      <div class="chat-room-card-icon">${r.icon}</div>
      <div class="chat-room-card-info">
        <div class="chat-room-card-name">${r.name}</div>
        <div class="chat-room-card-sub">${r.description || ''}</div>
      </div>
      <span class="chat-room-arrow">›</span>
    </div>`).join('');
}

// =============================================
// Chat — Room View
// =============================================
let _currentRoomId   = null;
let _currentRoomName = '';
let _chatPollTimer   = null;
let _chatMsgCount    = 0;
let _reportTarget    = null; // { msgId, userId, userName }

function openChatRoom(roomId, roomName) {
  _currentRoomId   = roomId;
  _currentRoomName = roomName;

  const view   = $('#chat-room-view');
  const nameEl = $('#chat-room-name');
  if (!view) return;
  if (nameEl) nameEl.textContent = roomName;

  // Online count
  const count     = ZAMApi.chat.onlineCount();
  const onlineEl  = $('#chat-online-small');
  if (onlineEl) onlineEl.textContent = `● ${count} online`;

  // Seed + render
  ZAMApi.chat.seedDemoMessages(roomId);
  _renderMessages();
  ZAMApi.chat.markRoomRead(roomId);
  _updateChatUnreadBadge();

  _lockBodyScroll();
  view.classList.add('open');
  _applyChatViewport(view);
  setTimeout(() => {
    $('#chat-input')?.focus();
    const msgs = $('#chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 320);

  // Poll for new messages every 2.5 s (simulates Supabase Realtime)
  clearInterval(_chatPollTimer);
  _chatPollTimer = setInterval(_pollMessages, 2500);
}

function closeChatRoom() {
  resetChatHeight('#chat-room-view');
  $('#chat-room-view')?.classList.remove('open');
  _unlockBodyScroll();
  clearInterval(_chatPollTimer);
  _chatPollTimer = null;
  _currentRoomId = null;
  _chatMsgCount  = 0;
}

function _renderMessages() {
  const container = $('#chat-messages');
  if (!container || !_currentRoomId) return;

  const msgs = ZAMApi.chat.messages(_currentRoomId);
  const uid  = ZAMApi.auth.currentUser()?.id;
  const user = ZAMApi.auth.currentUser();
  const isAdmin = user?.role === 'admin';
  _chatMsgCount = msgs.length;

  container.innerHTML = msgs.map(m => {
    const isOwn = m.user_id === uid;
    const time  = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const mPts  = _demoUserPts(m.user_id);
    const mTier = _getTier(mPts);
    const safeAuthorName = (m.author?.name||'').replace(/'/g,"\\'");
    const safeMPts = mPts;
    return `
      <div class="chat-msg ${isOwn ? 'chat-msg-own' : 'chat-msg-other'}" data-msg-id="${m.id}">
        ${!isOwn ? `<div class="tier-ring tier-ring--${mTier.key}" style="width:34px;height:34px;background:${m.author?.color || '#FA4615'};font-size:11px;font-weight:800;color:#fff;flex-shrink:0;cursor:pointer" onclick="openUserProfileSheet('${m.user_id}','${safeAuthorName}','${m.author?.initials||'?'}',null,${safeMPts})">${m.author?.initials || '?'}</div>` : ''}
        <div class="chat-msg-bubble-wrap">
          ${!isOwn ? `<div class="chat-msg-name" style="display:flex;align-items:center;gap:4px"><span style="cursor:pointer" onclick="openUserProfileSheet('${m.user_id}','${safeAuthorName}','${m.author?.initials||'?'}',null,${safeMPts})">${m.author?.name || ''}</span><span class="tier-badge tier-badge--${mTier.key}" style="cursor:pointer" onclick="openUserProfileSheet('${m.user_id}','${safeAuthorName}','${m.author?.initials||'?'}',null,${safeMPts})">${mTier.emoji} ${mTier.label}</span></div>` : ''}
          <div class="chat-msg-bubble">${m.content}</div>
          <div class="chat-msg-time">
            ${time}
            ${!isOwn ? `<button class="chat-report-btn" onclick="openChatOptions('${m.id}','${m.user_id}','${safeAuthorName}',${isAdmin})" aria-label="Optionen">⋯</button>` : ''}
            ${isOwn && isAdmin ? `<button class="chat-report-btn" onclick="deleteChatMsg('${m.id}')" aria-label="Löschen">🗑</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function _pollMessages() {
  if (!_currentRoomId) return;
  const msgs = ZAMApi.chat.messages(_currentRoomId);
  if (msgs.length > _chatMsgCount) {
    _renderMessages();
  }
}

async function sendChatMessage() {
  const input = $('#chat-input');
  if (!input || !_currentRoomId) return;
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  input.focus();

  ZAMApi.chat.sendMessage(_currentRoomId, content);
  _renderMessages();

  // +2 Punkte für aktive Teilnahme (still, kein Toast-Spam)
  ZAMApi.points.add(2, 'chat_message', 'Chat-Nachricht');
}

function initChatInput() {
  const sendBtn = $('#chat-send-btn');
  const input   = $('#chat-input');
  if (sendBtn) sendBtn.addEventListener('click', sendChatMessage);
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
  }
}

// =============================================
// Chat — Moderation
// =============================================
function openChatOptions(msgId, userId, userName, isAdmin = false) {
  _reportTarget = { msgId, userId, userName };
  const titleEl     = $('#chat-options-title');
  const deleteBtn   = $('#btn-chat-delete-msg');
  if (titleEl)   titleEl.textContent = `Optionen · ${userName}`;
  if (deleteBtn) deleteBtn.style.display = isAdmin ? '' : 'none';

  const blockBtn  = $('#btn-chat-block-user');
  const reportBtn = $('#btn-chat-report-msg');
  if (blockBtn) {
    const alreadyBlocked = ZAMApi.chat.isBlocked(userId);
    blockBtn.textContent = alreadyBlocked ? '✅ Nutzer entblockieren' : '🚫 Nutzer blockieren';
    blockBtn.onclick = () => {
      if (alreadyBlocked) { ZAMApi.chat.unblockUser(userId); showToast(`${userName} entblockiert.`); }
      else { ZAMApi.chat.blockUser(userId); showToast(`🚫 ${userName} blockiert.`, 'success'); }
      closeModal('modal-chat-options');
      _renderMessages();
    };
  }
  if (reportBtn) {
    reportBtn.onclick = () => {
      closeModal('modal-chat-options');
      openReportModal(msgId, userId, userName);
    };
  }
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      deleteChatMsg(msgId);
      closeModal('modal-chat-options');
    };
  }

  $('#modal-chat-options')?.classList.add('open');
}

function openReportModal(msgId, userId, userName) {
  _reportTarget = { msgId, userId, userName };
  $$('input[name="report-reason"]').forEach(r => { r.checked = r.value === 'other'; });
  const confirmBtn = $('#btn-report-confirm');
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      const reason = $('input[name="report-reason"]:checked')?.value || 'other';
      ZAMApi.chat.report('message', msgId, reason, userId);
      closeModal('modal-report');
      showToast('✅ Nachricht gemeldet. Danke!', 'success');
    };
  }
  $('#modal-report')?.classList.add('open');
}

function deleteChatMsg(msgId) {
  if (!_currentRoomId) return;
  ZAMApi.chat.deleteMessage(_currentRoomId, msgId);
  _renderMessages();
  showToast('Nachricht gelöscht.', 'success');
}

function _updateChatUnreadBadge() {
  const count  = ZAMApi.chat.unreadCount();
  const badge  = $('#chat-tab-badge');
  if (badge) {
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
    badge.textContent   = count > 9 ? '9+' : count;
  }
}

// =============================================
// Modals
// =============================================
function openModal(modalId) {
  const overlay = $(`#${modalId}`);
  if (overlay) overlay.classList.add('open');
}

function closeModal(modalId) {
  const overlay = $(`#${modalId}`);
  if (overlay) overlay.classList.remove('open');
}

function initModals() {
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  $$('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  const spinGoBtn = $('#btn-spin-go');
  if (spinGoBtn) spinGoBtn.addEventListener('click', doSpin);

  const checkinBtn = $('#btn-qr-confirm');
  if (checkinBtn) checkinBtn.addEventListener('click', doCheckin);
}

// =============================================
// Event Filter Tabs
// =============================================
function initEventFilters() {
  $$('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => renderEvents(tab.dataset.filter));
  });
}

// =============================================
// Pulse animation on CTA
// =============================================
function initButtonAnimations() {
  setTimeout(() => {
    const spinBtn = $('#btn-daily-spin');
    if (spinBtn && localStorage.getItem(_spinKey()) !== _todayStr()) {
      spinBtn.classList.add('btn-pulse');
      spinBtn.addEventListener('animationend', () => spinBtn.classList.remove('btn-pulse'));
    }
  }, 1500);
}

// =============================================
// Auth Flow
// =============================================
function initAuth() {
  const authShell = $('#auth-shell');
  const appShell  = $('#app-shell');

  if (ZAMApi.auth.isLoggedIn()) {
    const user = ZAMApi.auth.currentUser();
    // Sync logged-in user data into ZAMData
    ZAMData.currentUser.display_name           = user.display_name;
    ZAMData.currentUser.username               = user.username;
    ZAMData.currentUser.initials               = user.initials;
    ZAMData.currentUser.points                 = user.points;
    ZAMData.currentUser.member_since_formatted = user.member_since_formatted;
    if (user.stats) ZAMData.currentUser.stats  = user.stats;
    showApp();
  } else {
    showAuthShell('login');
  }

  // Login
  const loginBtn = $('#btn-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email    = $('#login-email')?.value?.trim();
      const password = $('#login-password')?.value;
      const errEl    = $('#login-error');
      errEl.style.display = 'none';
      loginBtn.textContent = 'Anmelden…';
      loginBtn.disabled    = true;
      try {
        await ZAMApi.auth.signIn(email, password);
        showApp();
      } catch(e) {
        errEl.textContent    = e.message;
        errEl.style.display  = 'block';
        loginBtn.textContent = 'Anmelden';
        loginBtn.disabled    = false;
      }
    });
  }

  // Google Login
  const _googleSvg = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
  async function _handleGoogleAuth(btn, label) {
    btn.innerHTML = '⏳ Google wird verbunden…';
    btn.disabled = true;
    try {
      await ZAMApi.auth.signInWithGoogle();
      showApp();
    } catch(e) {
      const errEl = $('#login-error') || $('#register-error');
      if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
      btn.innerHTML = _googleSvg + ' ' + label;
      btn.disabled = false;
    }
  }
  const googleLoginBtn = $('#btn-google-login');
  if (googleLoginBtn) googleLoginBtn.addEventListener('click', () => _handleGoogleAuth(googleLoginBtn, 'Mit Google anmelden'));
  const googleRegBtn = $('#btn-google-register');
  if (googleRegBtn) googleRegBtn.addEventListener('click', () => _handleGoogleAuth(googleRegBtn, 'Mit Google registrieren'));

  // Demo Login
  const demoBtn = $('#btn-demo-login');
  if (demoBtn) {
    demoBtn.addEventListener('click', async () => {
      demoBtn.textContent = '⏳ Demo wird geladen…';
      demoBtn.disabled = true;
      await ZAMApi.auth.demoLogin();
      showApp();
    });
  }

  // Register
  const regBtn = $('#btn-register');
  if (regBtn) {
    regBtn.addEventListener('click', async () => {
      const name     = $('#reg-name')?.value?.trim();
      const username = $('#reg-username')?.value?.trim();
      const email    = $('#reg-email')?.value?.trim();
      const pw       = $('#reg-password')?.value;
      const pw2      = $('#reg-password2')?.value;
      const errEl    = $('#register-error');
      errEl.style.display = 'none';
      if (pw !== pw2) {
        errEl.textContent   = 'Passwörter stimmen nicht überein.';
        errEl.style.display = 'block';
        return;
      }
      regBtn.textContent = 'Konto erstellen…';
      regBtn.disabled    = true;
      try {
        await ZAMApi.auth.signUp(email, pw, username, name);
        showApp();
      } catch(e) {
        errEl.textContent   = e.message;
        errEl.style.display = 'block';
        regBtn.textContent  = 'Konto erstellen';
        regBtn.disabled     = false;
      }
    });
  }

  // Forgot password
  const forgotBtn = $('#btn-forgot');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async () => {
      const email = $('#forgot-email')?.value?.trim();
      const errEl = $('#forgot-error');
      errEl.style.display = 'none';
      forgotBtn.textContent = 'Senden…';
      forgotBtn.disabled    = true;
      try {
        await ZAMApi.auth.resetPassword(email);
        $('#forgot-form').style.display  = 'none';
        $('#forgot-success').style.display = 'block';
      } catch(e) {
        errEl.textContent     = e.message;
        errEl.style.display   = 'block';
        forgotBtn.textContent = 'Link senden';
        forgotBtn.disabled    = false;
      }
    });
  }

  // Logout buttons in profile
  $$('[data-logout]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await ZAMApi.auth.signOut();
      showAuthShell('login');
    });
  });
}

function showAuthShell(page = 'login') {
  const authShell = $('#auth-shell');
  const appShell  = $('#app-shell');
  if (authShell) authShell.style.display = 'block';
  if (appShell)  appShell.style.display  = 'none';
  authNavigate(page);
}

function showApp() {
  const authShell = $('#auth-shell');
  const appShell  = $('#app-shell');
  if (authShell) authShell.style.display = 'none';
  if (appShell)  appShell.style.display  = 'block';

  // Sync points from per-user store into session
  const user = ZAMApi.auth.currentUser();
  if (user) {
    try {
      const d = JSON.parse(localStorage.getItem(`zamclub_u_${user.id}`) || '{}');
      if (d.points !== undefined) {
        user.points = d.points;
        const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
        g.session_user = user;
        localStorage.setItem('zamclub_global', JSON.stringify(g));
        ZAMData.currentUser = { ...ZAMData.currentUser, ...user };
      }
    } catch {}
  }

  renderAll();
  state.currentPage = '';

  // Check if map.html redirected us to open a private chat
  const pendingChat = sessionStorage.getItem('open_chat_room');
  if (pendingChat) {
    sessionStorage.removeItem('open_chat_room');
    try {
      const room = JSON.parse(pendingChat);
      navigateTo('community');
      setTimeout(() => openChatRoom(room.id, room.name), 300);
    } catch { navigateTo('home'); }
  } else {
    navigateTo(location.hash === '#community' ? 'community' : 'home');
  }

  setTimeout(() => checkBadgesAfterAction(), 900);
  startNotifPolling();
  setTimeout(_initDemoRoleBadge, 400);
  checkMapRedirect();

  // Phase 12: Analytics seed
  ZAMApi.analytics.seedDemo();

  // Phase 11: Push Notifications & Notification Center
  scheduleEventReminders();
  seedDemoNotifications();
  updateNotifBadge();

  // Show Nearby Alerts opt-in prompt once, 3.5s after login
  setTimeout(() => {
    const ns = NEARBY.getSettings();
    if (!ns.enabled && !ns.askedAt) {
      const updated = { ...ns, askedAt: new Date().toISOString() };
      NEARBY.saveSettings(updated);
      openNearbyOptIn();
    }
  }, 3500);
}

function authNavigate(page) {
  $$('.auth-page').forEach(p => p.classList.remove('active'));
  const target = $(`#page-${page}`);
  if (target) target.classList.add('active');
}

// =============================================
// Voucher & QR System
// =============================================

// Generate random token ID
function _genToken(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Get active voucher tokens
function _getQRTokens() {
  return JSON.parse(localStorage.getItem('zam_qr_tokens') || '{}');
}
function _saveQRTokens(t) { localStorage.setItem('zam_qr_tokens', JSON.stringify(t)); }

// Get checkins
function _getCheckins() { return JSON.parse(localStorage.getItem('zam_checkins') || '[]'); }
function _saveCheckins(c) { localStorage.setItem('zam_checkins', JSON.stringify(c)); }

// Open voucher QR for a deal
let _voucherQRTimer = null;
function openVoucherQR(dealId, dealTitle, merchantId) {
  const user = ZAMApi.auth.currentUser();
  if (!user) { showToast('Bitte zuerst anmelden', 'error'); return; }

  // Create token
  const rid = _genToken(12);
  const code6 = _genToken(6);
  const expires = Date.now() + 15 * 60 * 1000; // 15 min

  const tokenData = {
    rid, code6, dealId, dealTitle, merchantId,
    userId: user.id, userName: user.display_name,
    expires, redeemed: false, createdAt: Date.now()
  };

  const tokens = _getQRTokens();
  tokens[rid] = tokenData;
  tokens[code6] = rid; // code6 → rid lookup
  _saveQRTokens(tokens);

  // Show modal
  openModal('modal-voucher-qr');

  // Generate QR
  const qrPayload = JSON.stringify({ type: 'zam_voucher', rid, code6, merchantId });
  const canvas = $('#voucher-qr-canvas');
  canvas.innerHTML = '';
  if (window.QRCode) {
    new QRCode(canvas, {
      text: qrPayload,
      width: 200, height: 200,
      colorDark: '#1a1a1a', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    canvas.innerHTML = '<div style="width:200px;height:200px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:#333;text-align:center;padding:10px">QR wird geladen…</div>';
  }

  $('#voucher-qr-code').textContent = code6;
  $('#voucher-qr-status').textContent = '✅ Gültig — beim Händler vorzeigen';
  $('#voucher-qr-status').style.color = 'var(--green)';

  // Timer countdown
  if (_voucherQRTimer) clearInterval(_voucherQRTimer);
  function updateTimer() {
    const remaining = expires - Date.now();
    const timerEl = $('#voucher-qr-timer');
    const statusEl = $('#voucher-qr-status');
    if (!timerEl) { clearInterval(_voucherQRTimer); return; }
    if (remaining <= 0) {
      timerEl.textContent = '⏰ QR-Code abgelaufen';
      timerEl.style.color = 'var(--red)';
      if (statusEl) { statusEl.textContent = '❌ Abgelaufen — neuen Code anfordern'; statusEl.style.color = 'var(--red)'; }
      if (canvas) canvas.style.opacity = '0.3';
      clearInterval(_voucherQRTimer);
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `⏱ Gültig noch ${mins}:${secs.toString().padStart(2,'0')} Minuten`;
    timerEl.style.color = remaining < 120000 ? 'var(--yellow)' : 'var(--muted)';
  }
  updateTimer();
  _voucherQRTimer = setInterval(updateTimer, 1000);
}

// Validate a voucher token (called by merchant scanner)
function validateVoucherToken(rid, merchantId) {
  const tokens = _getQRTokens();
  const token = tokens[rid];
  if (!token) return { ok: false, msg: '❌ Ungültiger QR-Code', color: 'var(--red)' };
  if (token.redeemed) return { ok: false, msg: '❌ Bereits eingelöst', color: 'var(--red)' };
  if (Date.now() > token.expires) return { ok: false, msg: '⏰ QR-Code abgelaufen', color: 'var(--yellow)' };
  if (merchantId && token.merchantId !== merchantId) return { ok: false, msg: '❌ Falscher Händler', color: 'var(--red)' };
  return { ok: true, msg: `✅ Gültig — ${token.dealTitle || 'Gutschein'} für ${token.userName || 'Nutzer'}`, color: 'var(--green)', token };
}

// Redeem a voucher token
function redeemVoucherToken(rid) {
  const tokens = _getQRTokens();
  if (tokens[rid]) {
    tokens[rid].redeemed = true;
    tokens[rid].redeemedAt = Date.now();
    _saveQRTokens(tokens);
    return true;
  }
  return false;
}

// Manual code redemption (merchant types 6-char code)
function redeemManualCode() {
  const input = $('#qr-manual-input');
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  if (code.length !== 6) { showToast('Bitte 6-stelligen Code eingeben', 'error'); return; }
  const tokens = _getQRTokens();
  const rid = tokens[code];
  if (!rid) { _showScanResult('❌ Code nicht gefunden', 'var(--red)'); return; }
  const result = validateVoucherToken(rid, null);
  if (result.ok) {
    redeemVoucherToken(rid);
    _showScanResult('✅ Eingelöst! ' + (result.token?.dealTitle || 'Gutschein'), 'var(--green)');
    input.value = '';
  } else {
    _showScanResult(result.msg, result.color);
  }
}

function _showScanResult(msg, color) {
  const el = $('#qr-scan-result');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color;
  el.style.background = 'var(--surface-2)';
}

// ── QR Scanner (Merchant) ──
let _qrScanInterval = null;
let _qrStream = null;

function openQRScanner() {
  openModal('modal-qr-scanner');
  _showScanResult('Kamera wird gestartet…', 'var(--muted)');
  navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      _qrStream = stream;
      const video = $('#qr-video');
      if (video) { video.srcObject = stream; video.play(); }
      _startQRScanning();
    })
    .catch(() => {
      _showScanResult('❌ Kamerazugriff verweigert — bitte Code manuell eingeben', 'var(--yellow)');
    });
}

function _startQRScanning() {
  const video = $('#qr-video');
  const canvas = $('#qr-canvas');
  if (!video || !canvas || !window.jsQR) return;
  const ctx = canvas.getContext('2d');

  _qrScanInterval = setInterval(() => {
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (!code) return;

    clearInterval(_qrScanInterval);
    try {
      const data = JSON.parse(code.data);
      if (data.type === 'zam_voucher') {
        const user = ZAMApi.auth.currentUser();
        const merchantId = user?.merchant_id || null;
        const result = validateVoucherToken(data.rid, merchantId);
        if (result.ok) {
          redeemVoucherToken(data.rid);
          _showScanResult('✅ Eingelöst! ' + (result.token?.dealTitle || 'Gutschein'), 'var(--green)');
        } else {
          _showScanResult(result.msg, result.color);
        }
      } else if (data.type === 'zam_checkin') {
        handleCheckinQR(data);
      } else {
        _showScanResult('❌ Unbekannter QR-Code', 'var(--red)');
      }
    } catch(e) {
      _showScanResult('❌ QR-Code konnte nicht gelesen werden', 'var(--red)');
    }
    // Restart scanning after 3s
    setTimeout(() => { if ($('#modal-qr-scanner.open')) _startQRScanning(); }, 3000);
  }, 200);
}

function closeQRScanner() {
  clearInterval(_qrScanInterval);
  if (_qrStream) { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
  closeModal('modal-qr-scanner');
}

// ── Event & Merchant Check-in ──
function handleCheckinQR(data) {
  const user = ZAMApi.auth.currentUser();
  if (!user) { _showScanResult('❌ Nicht angemeldet', 'var(--red)'); return; }

  const checkins = _getCheckins();
  const today = new Date().toDateString();

  if (data.subtype === 'merchant') {
    // 1x per day per merchant
    const alreadyCheckedIn = checkins.some(c =>
      c.userId === user.id && c.merchantId === data.merchantId &&
      new Date(c.ts).toDateString() === today
    );
    if (alreadyCheckedIn) {
      _showScanResult('ℹ️ Bereits eingecheckt heute — nächster Check-in ab morgen', 'var(--yellow)');
      return;
    }
    checkins.push({ userId: user.id, merchantId: data.merchantId, ts: Date.now(), type: 'merchant', points: 10 });
    _saveCheckins(checkins);
    ZAMApi.points.add(10, 'merchant_checkin', 'Händler Check-in: ' + (data.merchantName || ''));
    _showScanResult(`✅ Check-in erfolgreich! +10 Punkte für ${data.merchantName || 'Besuch'}`, 'var(--green)');
    updatePointsDisplay();
  } else if (data.subtype === 'event') {
    const alreadyCheckedIn = checkins.some(c => c.userId === user.id && c.eventId === data.eventId);
    if (alreadyCheckedIn) { _showScanResult('ℹ️ Bereits eingecheckt für dieses Event', 'var(--yellow)'); return; }
    // Check time validity
    const now = Date.now();
    if (data.startTs && now < data.startTs) { _showScanResult('⏰ Event hat noch nicht begonnen', 'var(--yellow)'); return; }
    if (data.endTs && now > data.endTs) { _showScanResult('⏰ Event ist bereits vorbei', 'var(--yellow)'); return; }
    checkins.push({ userId: user.id, eventId: data.eventId, ts: Date.now(), type: 'event', points: 25 });
    _saveCheckins(checkins);
    ZAMApi.points.add(25, 'event_checkin', 'Event Check-in: ' + (data.eventName || ''));
    _showScanResult(`✅ Check-in erfolgreich! +25 Punkte für ${data.eventName || 'Event'}`, 'var(--green)');
    updatePointsDisplay();
  }
}

// Generate static merchant check-in QR data
function getMerchantCheckinQRData(merchant) {
  return JSON.stringify({
    type: 'zam_checkin', subtype: 'merchant',
    merchantId: merchant.id, merchantName: merchant.name,
    location: 'ZAM Freiham'
  });
}

// Generate static event check-in QR data
function getEventCheckinQRData(event) {
  return JSON.stringify({
    type: 'zam_checkin', subtype: 'event',
    eventId: event.id, eventName: event.title,
    startTs: event.startTs || null, endTs: event.endTs || null,
    location: 'ZAM Freiham'
  });
}

function renderAll() {
  renderHome();
  renderCommunity();
  renderEvents();
  renderDeals();
  renderMerchants();
  renderProfile();
  renderChallenges();
  generateQRGrid();
}

// =============================================
// Comments
// =============================================
let _currentCommentPostId = null;

function openComments(postId, postTitle) {
  _currentCommentPostId = postId;
  const titleEl = $('#comments-modal-title');
  if (titleEl) titleEl.textContent = 'Kommentare';

  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const initialsEl = $('#comment-user-initials');
  if (initialsEl) initialsEl.textContent = user.initials || 'JM';

  loadComments(postId);

  const overlay = $('#modal-comments');
  if (overlay) overlay.classList.add('open');
}

async function loadComments(postId) {
  const listEl  = $('#comments-list');
  const emptyEl = $('#comments-empty');
  if (!listEl) return;

  const comments = await ZAMApi.posts.getComments(postId);

  listEl.innerHTML = '';
  if (comments.length === 0) {
    const empty = el('div', 'comments-empty');
    empty.innerHTML = '<span>💬</span><p>Noch keine Kommentare. Sei der Erste!</p>';
    listEl.appendChild(empty);
    return;
  }

  comments.forEach(c => {
    const item = el('div', 'comment-item');
    const cPts = c.author?.points || _demoUserPts(c.author?.id || c.author?.name || '');
    const cTier = _getTier(cPts);
    const safeName = (c.author?.name||'').replace(/'/g,"\\'");
    item.innerHTML = `
      <div class="tier-ring tier-ring--${cTier.key}" style="width:32px;height:32px;background:${c.author?.avatar_color || '#FA4615'};font-size:11px;font-weight:800;color:#fff;flex-shrink:0">${c.author?.initials || '?'}</div>
      <div class="comment-body">
        <div class="comment-author" style="display:flex;align-items:center;gap:4px"><span style="cursor:pointer" onclick="openUserProfileSheet('${c.user_id||''}','${safeName}','${(c.author?.initials||c.author?.name||'?').slice(0,2)}',null,${cPts})">${c.author?.name || ''}</span><span class="tier-badge tier-badge--${cTier.key}" style="cursor:pointer" onclick="openUserProfileSheet('${c.user_id||''}','${safeName}','${(c.author?.initials||c.author?.name||'?').slice(0,2)}',null,${cPts})">${cTier.emoji} ${cTier.label}</span></div>
        <div class="comment-text">${c.content}</div>
        <div class="comment-time">${c.time_ago}</div>
      </div>
    `;
    listEl.appendChild(item);
  });

  listEl.scrollTop = listEl.scrollHeight;
}

function initComments() {
  const submitBtn  = $('#comment-submit');
  const inputEl    = $('#comment-input');
  if (!submitBtn || !inputEl) return;

  const send = async () => {
    const content = inputEl.value.trim();
    if (!content || !_currentCommentPostId) return;
    submitBtn.disabled = true;
    inputEl.value      = '';

    const comment = await ZAMApi.posts.addComment(_currentCommentPostId, content);

    const listEl = $('#comments-list');
    // Remove empty state if present
    const emptyEl = listEl?.querySelector('.comments-empty');
    if (emptyEl) emptyEl.remove();

    if (listEl) {
      const item = el('div', 'comment-item');
      item.innerHTML = `
        <div class="comment-avatar" style="background:${comment.author.avatar_color || '#FA4615'}">${comment.author.initials}</div>
        <div class="comment-body">
          <div class="comment-author">${comment.author.name}</div>
          <div class="comment-text">${comment.content}</div>
          <div class="comment-time">gerade eben</div>
        </div>
      `;
      listEl.appendChild(item);
      listEl.scrollTop = listEl.scrollHeight;
    }
    submitBtn.disabled = false;
    inputEl.focus();
  };

  submitBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

// =============================================
// New Post Modal
// =============================================
function openNewPostModal() {
  const overlay = $('#modal-new-post');
  if (overlay) overlay.classList.add('open');
}

function initNewPost() {
  const textarea  = $('#new-post-text');
  const charCount = $('#post-char-count');
  const submitBtn = $('#btn-post-submit');
  const errEl     = $('#new-post-error');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    if (charCount) charCount.textContent = textarea.value.length;
  });

  submitBtn?.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) {
      if (errEl) { errEl.textContent = 'Bitte schreib etwas.'; errEl.style.display = 'block'; }
      return;
    }
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Einreichen…';
    try {
      await ZAMApi.posts.create(content);
      closeModal('modal-new-post');
      textarea.value = '';
      if (charCount) charCount.textContent = '0';
      showToast('✅ Beitrag eingereicht! Wird geprüft und bald veröffentlicht.', 'success');
    } catch(e) {
      if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    }
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Beitrag einreichen';
  });
}

// =============================================
// Merchant Detail
// =============================================
async function openMerchantDetail(merchantId) {
  const merchant = await ZAMApi.merchants.get(merchantId);
  if (!merchant) return;

  const contentEl = $('#merchant-detail-content');
  if (!contentEl) return;

  // Deals & Events dieses Händlers
  const allDeals  = await ZAMApi.deals.list();
  const allEvents = await ZAMApi.events.list();
  const mDeals    = allDeals.filter(d => d.merchant_id === merchantId).slice(0, 3);
  const mEvents   = allEvents.filter(e => e.merchant_id === merchantId).slice(0, 2);

  const tagsHtml  = merchant.tags.map(t => `<span class="post-tag">${t}</span>`).join('');
  const dealsHtml = mDeals.length
    ? mDeals.map(d => `<div class="merchant-mini-card"><div class="merchant-mini-card-title">${d.discount} — ${d.title}</div><div class="merchant-mini-card-sub">${d.expiry_formatted}</div></div>`).join('')
    : '<div style="color:var(--text-muted);font-size:0.82rem">Derzeit keine aktiven Deals</div>';
  const eventsHtml = mEvents.length
    ? mEvents.map(e => `<div class="merchant-mini-card"><div class="merchant-mini-card-title">${e.title}</div><div class="merchant-mini-card-sub">📅 ${e.date_formatted} · ${e.location}</div></div>`).join('')
    : '<div style="color:var(--text-muted);font-size:0.82rem">Derzeit keine Events</div>';

  contentEl.innerHTML = `
    <div class="merchant-detail-header">
      <div class="merchant-detail-icon">${merchant.icon}</div>
      <div>
        <div class="merchant-detail-name">${merchant.name}</div>
        <div class="category-tag" style="background:${merchant.category_color}22;color:${merchant.category_color};margin-top:4px">${merchant.category}</div>
      </div>
    </div>

    <div class="merchant-detail-section">
      <div class="merchant-detail-section-title">Info</div>
      <div class="merchant-detail-info-row"><span>📍</span><span>${merchant.location}</span></div>
      <div class="merchant-detail-info-row"><span>⏰</span><span>${merchant.hours}</span></div>
      <div class="merchant-detail-info-row"><span>📞</span><span>${merchant.phone}</span></div>
      <div class="merchant-detail-info-row"><span>⭐</span><span>${merchant.rating} (${merchant.review_count} Bewertungen)</span></div>
    </div>

    <div class="merchant-detail-section">
      <div class="merchant-detail-section-title">Beschreibung</div>
      <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.55;margin:0">${merchant.description}</p>
    </div>

    <div class="merchant-detail-section">
      <div class="merchant-detail-section-title">Tags</div>
      <div class="post-tags">${tagsHtml}</div>
    </div>

    <div class="merchant-detail-section">
      <div class="merchant-detail-section-title">Aktuelle Aktionen</div>
      <div class="merchant-deals-list">${dealsHtml}</div>
    </div>

    <div class="merchant-detail-section">
      <div class="merchant-detail-section-title">Events</div>
      <div class="merchant-events-list" style="margin-bottom:4px">${eventsHtml}</div>
    </div>
  `;

  const overlay = $('#modal-merchant');
  if (overlay) overlay.classList.add('open');
}

// =============================================
// Saved Deals Modal
// =============================================
async function openSavedDeals() {
  const overlay = $('#modal-saved-deals');
  if (!overlay) return;
  const listEl = $('#saved-deals-list');
  if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--color-text-muted)">Lädt…</div>';
  overlay.classList.add('open');
  const deals = await ZAMApi.profile.savedDeals();
  if (!listEl) return;
  if (deals.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--color-text-muted)">Noch keine Deals gespeichert.</div>';
    return;
  }
  listEl.innerHTML = deals.map(d => `
    <div class="merchant-mini-card" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:1.5rem">${d.store_icon || d.icon || '🏪'}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:0.88rem">${d.title}</div>
          <div style="font-size:0.75rem;color:var(--color-text-muted)">${d.store_name || ''} · ${d.expiry_formatted || ''}</div>
          <div style="font-size:0.78rem;color:${d.category_color || '#FA4615'};margin-top:2px">${d.discount}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// =============================================
// Points History Modal
// =============================================
async function openPointsHistory() {
  const overlay = $('#modal-points-history');
  if (!overlay) return;
  const listEl = $('#points-history-list');
  if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--color-text-muted)">Lädt…</div>';
  overlay.classList.add('open');
  const log = await ZAMApi.points.log(30);
  if (!listEl) return;
  if (log.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--color-text-muted)">Noch keine Punkte-Historie. Drehe das Glücksrad oder checke ein!</div>';
    return;
  }
  listEl.innerHTML = log.map(entry => {
    const d = new Date(entry.created_at);
    const dateStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    return `<div class="points-history-item">
      <div class="points-history-desc">${entry.description || entry.action}</div>
      <div class="points-history-meta">${dateStr}</div>
      <div class="points-history-pts">+${entry.points}</div>
    </div>`;
  }).join('');
}

// =============================================
// Profile Edit Modal
// =============================================
function openProfileEdit() {
  const overlay = $('#modal-profile-edit');
  if (!overlay) return;
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const nameInput = $('#edit-display-name');
  const usernameInput = $('#edit-username');
  const errEl = $('#profile-edit-error');
  if (nameInput) nameInput.value = user.display_name || '';
  if (usernameInput) usernameInput.value = (user.username || '').replace(/^@/, '');
  if (errEl) errEl.style.display = 'none';
  const preview = $('#edit-avatar-preview');
  if (preview) {
    if (user.avatar_url) { preview.style.backgroundImage = `url(${user.avatar_url})`; preview.style.backgroundSize = 'cover'; preview.textContent = ''; }
    else { preview.style.backgroundImage = ''; preview.textContent = user.initials || '?'; }
  }
  overlay.classList.add('open');
}

function initProfileEdit() {
  const saveBtn = $('#btn-profile-edit-save');
  const avatarInput = $('#edit-avatar-input');
  const avatarBtn = $('#btn-change-avatar');
  if (avatarBtn) avatarBtn.addEventListener('click', () => avatarInput?.click());
  if (avatarInput) {
    avatarInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const url = await ZAMApi.auth.uploadAvatar(file);
        const avatarEl = $('#profile-avatar');
        if (avatarEl) { avatarEl.style.backgroundImage = `url(${url})`; avatarEl.style.backgroundSize = 'cover'; avatarEl.textContent = ''; }
        const preview = $('#edit-avatar-preview');
        if (preview) { preview.style.backgroundImage = `url(${url})`; preview.style.backgroundSize = 'cover'; preview.textContent = ''; }
        showToast('Profilbild aktualisiert!', 'success');
      } catch (err) { showToast(err.message, 'error'); }
    });
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = $('#edit-display-name')?.value?.trim();
      const username = $('#edit-username')?.value?.trim();
      const errEl = $('#profile-edit-error');
      if (!name) { if (errEl) { errEl.textContent = 'Name darf nicht leer sein.'; errEl.style.display = 'block'; } return; }
      saveBtn.textContent = 'Speichern…';
      saveBtn.disabled = true;
      try {
        await ZAMApi.auth.updateProfile({ display_name: name, username });
        closeModal('modal-profile-edit');
        await renderProfile();
        renderHome();
        showToast('✅ Profil aktualisiert!', 'success');
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      }
      saveBtn.textContent = 'Speichern';
      saveBtn.disabled = false;
    });
  }
}

// =============================================
// Phase 10 — Contacts Panel
// =============================================
function renderContacts() {
  const container = $('#contacts-list');
  if (!container) return;
  container.innerHTML = '';

  const friends    = _getFriends();
  const received   = _getFriendRequests().filter(r => {
    const me = ZAMApi.auth.currentUser();
    return me && r.to_id === me.id && r.status === 'pending';
  });
  const sent = _getFriendRequests().filter(r => {
    const me = ZAMApi.auth.currentUser();
    return me && r.from_id === me.id && r.status === 'pending';
  });
  const nudgeContacts = ZAMApi.connections.all();

  function _sectionLabel(txt) {
    const d = document.createElement('div');
    d.style.cssText = 'padding:10px 16px 6px;font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.09em;color:rgba(255,255,255,0.35)';
    d.textContent = txt;
    return d;
  }

  // ── Meine Freunde ──
  if (friends.length) {
    container.appendChild(_sectionLabel('👫 Meine Freunde'));
    friends.forEach(f => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      const fPts = _demoUserPts(f.user_id);
      const fTier = _getTier(fPts);
      const safeFName = f.name.replace(/'/g,"\\'");
      item.innerHTML = `
        <div class="tier-ring tier-ring--${fTier.key}" style="width:40px;height:40px;background:${_avatarColor(f.user_id)};font-size:13px;font-weight:800;color:#fff;position:relative;cursor:pointer">
          ${f.initials}<div class="contact-online-dot" style="position:absolute;bottom:1px;right:1px"></div>
        </div>
        <div class="contact-info" style="cursor:pointer">
          <div class="contact-name">${escHtml(f.name)}</div>
          <div class="contact-username" style="display:flex;align-items:center;gap:4px;font-size:0.6rem;color:#34d399">✅ Freund <span class="tier-badge tier-badge--${fTier.key}">${fTier.emoji} ${fTier.label}</span></div>
        </div>
        <button class="contact-action-btn" aria-label="Chat öffnen">💬</button>`;
      item.querySelector('.contact-action-btn').addEventListener('click', e => {
        e.stopPropagation();
        openPrivateChat(f.user_id, f.name, f.initials, null);
      });
      item.addEventListener('click', () => openUserProfileSheet(f.user_id, f.name, f.initials, null, fPts));
      container.appendChild(item);
    });
  }

  // ── Offene Anfragen ──
  if (received.length) {
    container.appendChild(_sectionLabel('📩 Offene Anfragen'));
    received.forEach(r => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      item.innerHTML = `
        <div class="contact-avatar" style="background:${_avatarColor(r.from_id)}">${r.from_initials}<div class="contact-online-dot" style="background:transparent;border-color:transparent"></div></div>
        <div class="contact-info">
          <div class="contact-name">${escHtml(r.from_name)}</div>
          <div class="contact-username" style="font-size:0.6rem;color:rgba(255,255,255,0.35)">möchte dich als Freund</div>
        </div>
        <div style="display:flex;gap:5px">
          <button style="background:linear-gradient(135deg,#059669,#34d399);border:none;border-radius:8px;padding:6px 10px;color:#fff;font-size:0.7rem;font-weight:700;font-family:var(--font);cursor:pointer" data-accept="${r.id}">✅</button>
          <button style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:6px 10px;color:#ef4444;font-size:0.7rem;font-weight:700;font-family:var(--font);cursor:pointer" data-reject="${r.id}">❌</button>
        </div>`;
      item.querySelector('[data-accept]').addEventListener('click', e => { e.stopPropagation(); acceptFriendRequest(r.id); });
      item.querySelector('[data-reject]').addEventListener('click', e => { e.stopPropagation(); rejectFriendRequest(r.id); });
      container.appendChild(item);
    });
  }

  // ── Gesendete Anfragen ──
  if (sent.length) {
    container.appendChild(_sectionLabel('📤 Gesendete Anfragen'));
    sent.forEach(r => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      item.innerHTML = `
        <div class="contact-avatar" style="background:${_avatarColor(r.to_id)}">${r.to_initials}<div class="contact-online-dot" style="background:transparent;border-color:transparent"></div></div>
        <div class="contact-info">
          <div class="contact-name">${escHtml(r.to_name)}</div>
          <div class="contact-username" style="font-size:0.6rem;color:rgba(255,255,255,0.35)">⏳ Anfrage ausstehend</div>
        </div>`;
      container.appendChild(item);
    });
  }

  // ── Nudge-Kontakte ──
  if (nudgeContacts.length) {
    container.appendChild(_sectionLabel('🤝 Meine Kontakte'));
    nudgeContacts.forEach(c => {
      const item = document.createElement('div');
      item.className = 'contact-item';
      const unread = ZAMApi.privateChat.unreadCount(ZAMApi.privateChat.getOrCreate(c.user_id));
      const cPts = _demoUserPts(c.user_id);
      const cTier = _getTier(cPts);
      const safeCName = (c.display_name||'').replace(/'/g,"\\'");
      item.innerHTML = `
        <div class="tier-ring tier-ring--${cTier.key}" style="width:40px;height:40px;background:${_avatarColor(c.user_id)};font-size:13px;font-weight:800;color:#fff;position:relative;cursor:pointer">
          ${c.avatar_url ? `<img src="${c.avatar_url}" alt="${c.initials}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />` : c.initials}
          <div class="contact-online-dot" style="position:absolute;bottom:1px;right:1px"></div>
        </div>
        <div class="contact-info" style="cursor:pointer">
          <div class="contact-name">${c.display_name}</div>
          <div class="contact-username" style="display:flex;align-items:center;gap:4px"><span>${c.username || ''}</span><span class="tier-badge tier-badge--${cTier.key}">${cTier.emoji} ${cTier.label}</span></div>
        </div>
        ${unread > 0 ? `<span class="pc-unread-badge">${unread}</span>` : ''}
        <button class="contact-action-btn" data-uid="${c.user_id}" aria-label="Chat öffnen">💬</button>`;
      item.querySelector('.contact-action-btn').addEventListener('click', e => {
        e.stopPropagation();
        openPrivateChat(c.user_id, c.display_name, c.initials, c.avatar_url);
      });
      item.addEventListener('click', () => openUserProfileSheet(c.user_id, c.display_name, c.initials, c.avatar_url, cPts));
      container.appendChild(item);
    });
  }

  if (!friends.length && !received.length && !sent.length && !nudgeContacts.length) {
    container.innerHTML = `
      <div class="contacts-empty">
        <div class="contacts-empty-icon">👥</div>
        <div>Noch keine Kontakte</div>
        <div style="margin-top:6px;font-size:0.78rem">Aktive Nutzer anstupsen oder als Freund hinzufügen!</div>
      </div>`;
  }
}

function _avatarColor(userId) {
  const colors = ['#FA4615', '#d93e12', '#10b981', '#3b82f6', '#ec4899', '#F7AB00', '#06b6d4'];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// =============================================
// Phase 10 — Nudge Inbox Panel
// =============================================
function renderNudgeInbox() {
  const container = $('#nudge-inbox-list');
  if (!container) return;
  const pending = ZAMApi.nudges.myPending();

  // Update tab badge
  const tabBtn = $('#nudges-tab-btn');
  if (tabBtn) {
    let badge = tabBtn.querySelector('.tab-badge');
    if (pending.length > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'tab-badge'; tabBtn.appendChild(badge); }
      badge.textContent = pending.length > 9 ? '9+' : pending.length;
    } else if (badge) {
      badge.remove();
    }
  }

  if (pending.length === 0) {
    container.innerHTML = `
      <div class="contacts-empty">
        <div class="contacts-empty-icon">🤝</div>
        <div>Keine Anfragen</div>
        <div style="margin-top:6px;font-size:0.78rem">Warte auf Anstupsanfragen von anderen Nutzern.</div>
      </div>`;
    return;
  }

  container.innerHTML = '';
  pending.forEach(n => {
    const item = document.createElement('div');
    item.className = 'nudge-item';
    const timeStr = _relativeTime(n.created_at);
    const nPts = _demoUserPts(n.from_id);
    const nTier = _getTier(nPts);
    item.innerHTML = `
      <div class="tier-ring tier-ring--${nTier.key}" style="width:38px;height:38px;background:${_avatarColor(n.from_id)};font-size:12px;font-weight:800;color:#fff;flex-shrink:0">
        ${n.from_initials || n.from_id.slice(0, 2).toUpperCase()}
      </div>
      <div class="nudge-item-info">
        <div class="nudge-item-name" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">${n.from_name || 'Jemand'} hat dich angestupst <span class="tier-badge tier-badge--${nTier.key}">${nTier.emoji} ${nTier.label}</span></div>
        <div class="nudge-item-time">${timeStr}</div>
      </div>
      <div class="nudge-item-actions">
        <button class="nudge-accept-btn" data-id="${n.id}">✓</button>
        <button class="nudge-reject-btn" data-id="${n.id}">✕</button>
      </div>
    `;
    item.querySelector('.nudge-accept-btn').addEventListener('click', () => {
      ZAMApi.nudges.accept(n.id);
      renderNudgeInbox();
      updateCommunityBadge();
      // Show toast with chat button
      const toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;bottom:calc(var(--nav-h,64px) + 12px);left:50%;transform:translateX(-50%);z-index:9999;background:#2a1a10;border:1px solid rgba(250,70,21,0.4);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:var(--font);max-width:92vw;animation:fadeUp 0.25s ease both';
      toastEl.innerHTML = `
        <span style="font-size:0.84rem;color:#e2e8f0;font-weight:600">🤝 Verbunden mit <strong>${n.from_name}</strong>!</span>
        <button style="background:linear-gradient(135deg,#c43510,#FA4615);border:none;border-radius:9px;padding:7px 14px;color:#fff;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer;white-space:nowrap" onclick="this.closest('div[style]').remove();navigateTo('community');setTimeout(()=>openPrivateChat('${n.from_id}','${(n.from_name||'').replace(/'/g,"\\'")}','${(n.from_initials||'').replace(/'/g,"\\'")}',null),250)">💬 Jetzt chatten</button>`;
      document.body.appendChild(toastEl);
      setTimeout(() => toastEl.remove(), 6000);
    });
    item.querySelector('.nudge-reject-btn').addEventListener('click', () => {
      ZAMApi.nudges.reject(n.id);
      renderNudgeInbox();
      updateCommunityBadge();
    });
    container.appendChild(item);
  });
}

function _relativeTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `vor ${hrs} Std.`;
  return `vor ${Math.floor(hrs / 24)} Tagen`;
}

// =============================================
// Phase 10 — Private Chat
// =============================================
let _pcCurrentChatId   = null;
let _pcCurrentUserId   = null;
let _pcCurrentUserName = '';
let _pcMsgCount        = 0;
let _pcPollTimer       = null;

function openPrivateChat(userId, userName, initials, avatarUrl) {
  const me = ZAMApi.auth.currentUser();
  if (!me) { showToast('Bitte anmelden um zu chatten.'); return; }

  _pcCurrentUserId   = userId;
  _pcCurrentUserName = userName;
  _pcCurrentChatId   = ZAMApi.privateChat.getOrCreate(userId);

  // Fill header
  const avatarEl = $('#pc-header-avatar');
  const nameEl   = $('#pc-header-name');
  const headerTier = _getTier(_demoUserPts(userId));
  if (avatarEl) {
    avatarEl.className = `tier-ring tier-ring--${headerTier.key}`;
    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
      avatarEl.style.background = 'none';
    } else {
      avatarEl.textContent = initials || userName.slice(0, 2).toUpperCase();
      avatarEl.style.background = _avatarColor(userId);
    }
  }
  if (nameEl) {
    const safeName = userName.replace(/'/g,"\\'");
    nameEl.innerHTML = `${userName} <span class="tier-badge tier-badge--${headerTier.key}" style="cursor:pointer;vertical-align:middle" onclick="showTierInfoPopup('${safeName}',${_demoUserPts(userId)},this)">${headerTier.emoji} ${headerTier.label}</span>`;
  }

  // Render messages + mark read
  _pcRenderMessages();
  ZAMApi.privateChat.markRead(_pcCurrentChatId);
  updateCommunityBadge();

  const pcView = $('#private-chat-view');
  if (pcView) {
    _lockBodyScroll();
    pcView.classList.add('open');
    _applyChatViewport(pcView);
  }
  setTimeout(() => {
    $('#pc-input')?.focus();
    const msgs = $('#pc-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 320);

  // Poll for new messages
  clearInterval(_pcPollTimer);
  _pcPollTimer = setInterval(_pcPollMessages, 2500);
}

function closePrivateChat() {
  resetChatHeight('#private-chat-view');
  $('#private-chat-view')?.classList.remove('open');
  _unlockBodyScroll();
  clearInterval(_pcPollTimer);
  _pcPollTimer       = null;
  _pcCurrentChatId   = null;
  _pcCurrentUserId   = null;
  _pcMsgCount        = 0;
  renderContacts(); // refresh unread badges
}

function _pcRenderMessages() {
  const container = $('#pc-messages');
  if (!container || !_pcCurrentChatId) return;
  const msgs = ZAMApi.privateChat.getMessages(_pcCurrentChatId);
  const uid  = ZAMApi.auth.currentUser()?.id;
  _pcMsgCount = msgs.length;

  if (msgs.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:0.82rem;margin:auto">Noch keine Nachrichten.<br>Schreib als Erster! 👋</div>`;
    return;
  }

  container.innerHTML = msgs.map(m => {
    if (m.is_system) {
      return `<div style="text-align:center;margin:10px 0;padding:8px 14px;background:rgba(250,70,21,0.1);border:1px solid rgba(250,70,21,0.2);border-radius:12px;font-size:0.72rem;color:rgba(255,255,255,0.6);line-height:1.4">${_escapeHtml(m.content)}</div>`;
    }
    const isOwn = m.sender_id === uid;
    const time  = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const mPts  = _demoUserPts(m.sender_id);
    const mTier = _getTier(mPts);
    const safeName = (m.sender_name||'').replace(/'/g,"\\'");
    return `
      <div class="chat-msg ${isOwn ? 'chat-msg-own' : 'chat-msg-other'}">
        ${!isOwn ? `<div class="tier-ring tier-ring--${mTier.key}" style="width:34px;height:34px;background:${_avatarColor(m.sender_id)};font-size:11px;font-weight:800;color:#fff;flex-shrink:0;cursor:pointer" onclick="openUserProfileSheet('${m.sender_id}','${safeName}','${m.sender_initials||'?'}',null,${mPts})">${m.sender_initials || '?'}</div>` : ''}
        <div class="chat-msg-bubble-wrap">
          ${!isOwn ? `<div class="chat-msg-name" style="display:flex;align-items:center;gap:4px"><span style="cursor:pointer" onclick="openUserProfileSheet('${m.sender_id}','${safeName}','${m.sender_initials||'?'}',null,${mPts})">${_escapeHtml(m.sender_name||'')}</span><span class="tier-badge tier-badge--${mTier.key}" style="cursor:pointer" onclick="openUserProfileSheet('${m.sender_id}','${safeName}','${m.sender_initials||'?'}',null,${mPts})">${mTier.emoji} ${mTier.label}</span></div>` : ''}
          <div class="chat-msg-bubble">${_escapeHtml(m.content)}</div>
          <div class="chat-msg-time">${time}</div>
        </div>
      </div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function _escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _pcPollMessages() {
  if (!_pcCurrentChatId) return;
  const msgs = ZAMApi.privateChat.getMessages(_pcCurrentChatId);
  if (msgs.length > _pcMsgCount) {
    _pcRenderMessages();
    ZAMApi.privateChat.markRead(_pcCurrentChatId);
  }
}

function sendPrivateMessage() {
  const input = $('#pc-input');
  if (!input || !_pcCurrentChatId) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.focus();
  ZAMApi.privateChat.sendMessage(_pcCurrentChatId, text);
  _pcRenderMessages();
}

// ── Mobile keyboard-safe chat layout ──
// Strategy:
//   1. Lock body scroll when chat is open (prevents iOS from shifting fixed elements)
//   2. Use VisualViewport API to shrink chat container exactly to visible area
//   3. Translate chat upward to stay in view (avoids top/transform conflict)

// Lock body scroll when chat/keyboard open (prevents iOS background scroll)
let _bodyScrollY = 0;

function _lockBodyScroll() {
  _bodyScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_bodyScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.overflow = 'hidden';
}

function _unlockBodyScroll() {
  const wasFixed = document.body.style.position === 'fixed';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.overflow = '';
  if (wasFixed) window.scrollTo(0, _bodyScrollY);
}

function _applyChatViewport(el) {
  if (!el) return;
  const vv = window.visualViewport;
  if (!vv) return;
  // Height = visual viewport height (excludes keyboard)
  // Offset compensates for any residual scroll/zoom shift
  el.style.height = vv.height + 'px';
  // We keep top:0 via CSS; use translateY to shift up if viewport scrolled
  // (on iOS, visualViewport.offsetTop > 0 when page scrolled under keyboard)
  el.style.setProperty('--chat-vv-offset', `-${vv.offsetTop}px`);
}

function _resetChatViewport(el) {
  if (!el) return;
  el.style.height = '';
  el.style.removeProperty('--chat-vv-offset');
}

function initChatKeyboardFix() {
  if (!window.visualViewport) return;
  function onVVChange() {
    [document.getElementById('chat-room-view'), document.getElementById('private-chat-view')].forEach(el => {
      if (el && el.classList.contains('open')) {
        _applyChatViewport(el);
        // Keep messages scrolled to bottom when keyboard resizes
        const msgs = el.querySelector('.chat-messages, .private-chat-messages');
        if (msgs) requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
      }
    });
  }
  window.visualViewport.addEventListener('resize', onVVChange);
  window.visualViewport.addEventListener('scroll', onVVChange);
}

function resetChatHeight(selector) {
  const el = document.querySelector(selector);
  if (el) _resetChatViewport(el);
}

function initPrivateChat() {
  const sendBtn = $('#pc-send-btn');
  const input   = $('#pc-input');
  if (sendBtn) sendBtn.addEventListener('click', sendPrivateMessage);
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrivateMessage(); }
    });
  }
  // Context menu button
  const menuBtn = $('#pc-menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      if (_pcCurrentUserId) openUserContextMenu(_pcCurrentUserId, _pcCurrentUserName, menuBtn);
    });
  }
}

// =============================================
// Phase 10 — User Profile Sheet
// =============================================
let _upsTargetUser = null;

function openUserProfileSheet(userId, userName, initials, avatarUrl, userPts = null) {
  _upsTargetUser = { userId, userName, initials, avatarUrl };

  const pts  = userPts !== null ? userPts : _demoUserPts(userId);
  const tier = _getTier(pts);
  const rank = _RANKING_DEMO.find(u => u.isMe && userId === 'me')?.rank || null;
  const userRankEntry = _RANKING_DEMO.find(u => u.name && userName && u.name.startsWith(userName.split(' ')[0]));
  const displayRank = userRankEntry?.rank || null;

  // Banner
  const bannerEl = document.getElementById('ups-banner');
  if (bannerEl) {
    // Use the user's stored banner if own profile, else derive from tier
    const bannerKey = userId === (ZAMApi.auth.currentUser()?.id) ? _getBanner() : tier.key;
    const b = _PROFILE_BANNERS.find(x => x.key === bannerKey) || _PROFILE_BANNERS[0];
    bannerEl.style.background = b.gradient;
  }

  // Avatar with tier ring
  const avatarEl = document.getElementById('ups-avatar');
  if (avatarEl) {
    avatarEl.className = `user-profile-sheet-avatar tier-ring tier-ring--${tier.key}`;
    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
      avatarEl.style.background = 'none';
    } else {
      avatarEl.textContent = initials || userName.slice(0, 2).toUpperCase();
      avatarEl.style.background = _avatarColor(userId);
    }
  }

  const nameEl = document.getElementById('ups-name');
  if (nameEl) nameEl.textContent = userName;

  // Title
  const titleEl = document.getElementById('ups-title-display');
  if (titleEl) {
    const titleKey = userId === (ZAMApi.auth.currentUser()?.id) ? _getProfileTitle() : '';
    const t = _PROFILE_TITLES.find(x => x.key === titleKey);
    titleEl.innerHTML = t ? `<span class="profile-title-chip">${t.label}</span>` : '';
  }

  // Tier badge
  const tierRowEl = document.getElementById('ups-tier-row');
  if (tierRowEl) tierRowEl.innerHTML = `<span class="tier-badge tier-badge--${tier.key}" style="font-size:0.72rem;padding:4px 10px">${tier.emoji} ${tier.label} Mitglied</span>`;

  // Rank + Pts row
  const rankRowEl = document.getElementById('ups-rank-row');
  if (rankRowEl) {
    rankRowEl.innerHTML = `
      <div class="ups-rank-item"><div class="ups-rank-value">${pts.toLocaleString('de-DE')}</div><div class="ups-rank-label">Punkte</div></div>
      ${displayRank ? `<div class="ups-divider"></div><div class="ups-rank-item"><div class="ups-rank-value">#${displayRank}</div><div class="ups-rank-label">Rang</div></div>` : ''}
      <div class="ups-divider"></div>
      <div class="ups-rank-item"><div class="ups-rank-value">${tier.emoji}</div><div class="ups-rank-label">${tier.label}</div></div>`;
  }

  // Top badges
  const topBadgesEl = document.getElementById('ups-top-badges-row');
  if (topBadgesEl) {
    const topB = userId === (ZAMApi.auth.currentUser()?.id) ? _getTopBadges() : [];
    if (topB.length > 0) {
      topBadgesEl.innerHTML = topB.map(key => {
        const badge = _ACHIEVEMENTS.find(a => a.key === key);
        return badge ? `<div class="ups-top-badge" title="${badge.name}">${badge.icon}</div>` : '';
      }).join('');
    } else {
      topBadgesEl.innerHTML = '';
    }
  }

  // Build action buttons
  const actionsEl = $('#ups-actions');
  if (actionsEl) {
    actionsEl.innerHTML = '';
    const connected  = ZAMApi.nudges.isConnected(userId);
    const hasPending = ZAMApi.nudges.hasPendingNudgeTo(userId);

    if (connected) {
      const msgBtn = document.createElement('button');
      msgBtn.className = 'btn btn-primary btn-full';
      msgBtn.innerHTML = '💬 Nachricht schreiben';
      msgBtn.addEventListener('click', () => {
        closeUserProfileSheet();
        // Navigate first, then open chat overlay on top
        navigateTo('community');
        setTimeout(() => openPrivateChat(userId, userName, initials, avatarUrl), 250);
      });
      actionsEl.appendChild(msgBtn);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-ghost btn-full';
      removeBtn.textContent = '🔗 Verbindung entfernen';
      removeBtn.addEventListener('click', () => {
        const conn = ZAMApi.connections.all().find(c => c.user_id === userId);
        if (conn) {
          ZAMApi.connections.remove(conn.connection_id);
          showToast('Verbindung entfernt.');
        }
        closeUserProfileSheet();
      });
      actionsEl.appendChild(removeBtn);
    } else if (hasPending) {
      const pendingBtn = document.createElement('button');
      pendingBtn.className = 'btn btn-ghost btn-full';
      pendingBtn.textContent = '⏳ Anstupsanfrage gesendet';
      pendingBtn.disabled = true;
      actionsEl.appendChild(pendingBtn);
    } else {
      const nudgeBtn = document.createElement('button');
      nudgeBtn.className = 'btn btn-primary btn-full';
      nudgeBtn.innerHTML = '👋 Anstupsen';
      nudgeBtn.addEventListener('click', () => {
        const result = ZAMApi.nudges.send(userId, userName);
        if (result) {
          showToast(`👋 Anstupsanfrage an ${userName} gesendet!`, 'nudge');
        } else {
          showToast('Anfrage bereits gesendet oder bereits verbunden.');
        }
        closeUserProfileSheet();
      });
      actionsEl.appendChild(nudgeBtn);
    }
  }

  // Danger zone
  const dangerEl = $('#ups-danger');
  if (dangerEl) {
    dangerEl.innerHTML = '';
    const blockBtn = document.createElement('button');
    blockBtn.textContent = ZAMApi.connections.isBlocked(userId) ? '✅ Entblockieren' : '🚫 Blockieren';
    blockBtn.addEventListener('click', () => {
      if (ZAMApi.connections.isBlocked(userId)) {
        ZAMApi.chat.unblockUser(userId);
        showToast(`${userName} entblockiert.`);
      } else {
        ZAMApi.connections.block(userId);
        showToast(`🚫 ${userName} blockiert.`);
      }
      closeUserProfileSheet();
    });
    const reportBtn = document.createElement('button');
    reportBtn.textContent = '🚩 Melden';
    reportBtn.addEventListener('click', () => {
      closeUserProfileSheet();
      openUserReportModal(userId, userName);
    });
    dangerEl.appendChild(blockBtn);
    dangerEl.appendChild(reportBtn);
  }

  $('#profile-sheet-backdrop')?.classList.add('open');
  $('#user-profile-sheet')?.classList.add('open');
}

function closeUserProfileSheet() {
  $('#profile-sheet-backdrop')?.classList.remove('open');
  $('#user-profile-sheet')?.classList.remove('open');
  _upsTargetUser = null;
}

// =============================================
// Phase 10 — User Report Modal
// =============================================
let _userReportTarget = null;

function openUserReportModal(userId, userName) {
  _userReportTarget = { userId, userName };
  const subtitle = $('#user-report-subtitle');
  if (subtitle) subtitle.textContent = `Warum möchtest du ${userName} melden?`;
  $$('input[name="user-report-reason"]').forEach(r => { r.checked = r.value === 'other'; });
  $('#modal-user-report')?.classList.add('open');
}

function initUserReport() {
  const confirmBtn = $('#btn-user-report-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (!_userReportTarget) return;
      const reason = $('input[name="user-report-reason"]:checked')?.value || 'other';
      ZAMApi.connections.report(_userReportTarget.userId, reason);
      closeModal('modal-user-report');
      showToast('✅ Nutzer gemeldet. Danke!', 'success');
      _userReportTarget = null;
    });
  }
}

// =============================================
// Phase 10 — Context Menu (⋮ in private chat header)
// =============================================
let _activeContextMenu = null;

function openUserContextMenu(userId, userName, anchorEl) {
  // Close any existing
  if (_activeContextMenu) { _activeContextMenu.remove(); _activeContextMenu = null; return; }

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML = `
    <div class="context-menu-item" id="cmenu-remove">🔗 Verbindung entfernen</div>
    <div class="context-menu-item danger" id="cmenu-block">🚫 Blockieren</div>
    <div class="context-menu-item danger" id="cmenu-report">🚩 Melden</div>
  `;

  // Position relative to parent container
  const parentEl = anchorEl.closest('.private-chat-header') || anchorEl.parentElement;
  parentEl.style.position = 'relative';
  parentEl.appendChild(menu);
  _activeContextMenu = menu;

  menu.querySelector('#cmenu-remove').addEventListener('click', () => {
    const conn = ZAMApi.connections.all().find(c => c.user_id === userId);
    if (conn) ZAMApi.connections.remove(conn.connection_id);
    showToast('Verbindung entfernt.');
    closePrivateChat();
    menu.remove(); _activeContextMenu = null;
    renderContacts();
  });
  menu.querySelector('#cmenu-block').addEventListener('click', () => {
    ZAMApi.connections.block(userId);
    showToast(`🚫 ${userName} blockiert.`);
    closePrivateChat();
    menu.remove(); _activeContextMenu = null;
  });
  menu.querySelector('#cmenu-report').addEventListener('click', () => {
    menu.remove(); _activeContextMenu = null;
    closePrivateChat();
    openUserReportModal(userId, userName);
  });

  // Click-outside to close
  const onOutside = (e) => {
    if (!menu.contains(e.target) && e.target !== anchorEl) {
      menu.remove(); _activeContextMenu = null;
      document.removeEventListener('click', onOutside, true);
    }
  };
  setTimeout(() => document.addEventListener('click', onOutside, true), 50);
}

// =============================================
// Phase 10 — Notification Polling & Badges
// =============================================
let _notifPollTimer   = null;
let _lastNudgeCount   = 0;
let _lastPcUnread     = 0;

function startNotifPolling() {
  if (_notifPollTimer) return;
  _notifPollTimer = setInterval(_pollNotifications, 5000);
  _pollNotifications(); // run immediately
}

function _pollNotifications() {
  const me = ZAMApi.auth.currentUser();
  if (!me) return;

  // Check nudge inbox
  const nudgePending = ZAMApi.nudges.myPending();
  if (nudgePending.length > _lastNudgeCount && nudgePending.length > 0) {
    const newest = nudgePending[0];
    showToast(`👋 ${newest.from_name} hat dich angestupst!`, 'nudge');
    // Phase 11: send push notification
    ZAMApi.push.send(`👋 Neuer Anstupser!`, `${newest.from_name} hat dich angestupst`, {type:'nudge', url:'#community'});
  }
  _lastNudgeCount = nudgePending.length;

  // Check private message unread
  const pcUnread = ZAMApi.privateChat.totalUnread();
  if (pcUnread > _lastPcUnread && pcUnread > 0) {
    // Find which chat has new messages
    const unreadMap = JSON.parse(localStorage.getItem(`zamclub_u_${me.id}`) || '{}').pc_unread || {};
    const chatIds   = Object.keys(unreadMap);
    if (chatIds.length > 0) {
      // Try to identify sender from messages
      const chatId = chatIds[0];
      const msgs   = ZAMApi.privateChat.getMessages(chatId);
      const lastMsg = msgs.filter(m => m.sender_id !== me.id).pop();
      if (lastMsg) {
        showToast(`💬 Neue Nachricht von ${lastMsg.sender_name}`, 'message');
        // Phase 11: send push notification
        ZAMApi.push.send('💬 Neue Nachricht', `${lastMsg.sender_name}: ${lastMsg.content.slice(0, 60)}`, {type:'message', url:'#community'});
      }
    }
  }
  _lastPcUnread = pcUnread;

  updateCommunityBadge();
  updateNotifBadge(); // Phase 11
}

function updateCommunityBadge() {
  const nudgePending = ZAMApi.nudges.myPending().length;
  const pcUnread     = ZAMApi.privateChat.totalUnread();
  const total        = nudgePending + pcUnread;

  const badge = $('#nav-community-badge');
  if (badge) {
    if (total > 0) {
      badge.textContent    = total > 9 ? '9+' : total;
      badge.style.display  = 'flex';
    } else {
      badge.style.display  = 'none';
    }
  }

  // Also update nudges-tab badge
  const nudgesTabBtn = $('#nudges-tab-btn');
  if (nudgesTabBtn) {
    let tabBadge = nudgesTabBtn.querySelector('.tab-badge');
    if (nudgePending > 0) {
      if (!tabBadge) { tabBadge = document.createElement('span'); tabBadge.className = 'tab-badge'; nudgesTabBtn.appendChild(tabBadge); }
      tabBadge.textContent = nudgePending > 9 ? '9+' : nudgePending;
    } else if (tabBadge) {
      tabBadge.remove();
    }
  }
}

// =============================================
// Phase 10 — Deep link from map.html
// =============================================
function checkMapRedirect() {
  // Check if map redirected us to open a private chat
  const pcTarget = sessionStorage.getItem('open_private_chat');
  if (pcTarget) {
    sessionStorage.removeItem('open_private_chat');
    try {
      const target = JSON.parse(pcTarget);
      navigateTo('community');
      // Use longer delay to ensure page is fully rendered after page load
      setTimeout(() => {
        openPrivateChat(target.userId, target.userName, target.initials || (target.userName||'').slice(0,2).toUpperCase(), target.avatarUrl);
      }, 500);
    } catch {}
  }
}

// =============================================
// Phase 11 — Notification Center
// =============================================
let notifFilter = 'all';

function setNotifFilter(f, btn) {
  notifFilter = f;
  document.querySelectorAll('.nf-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderNotifications();
}

function renderNotifications() {
  const me = ZAMApi.auth.currentUser();
  if (me) { _seedDemoDealRequest(); _seedDemoFriendRequest(); }

  // Push-Permission Banner
  const banner = document.getElementById('push-permission-banner');
  if (banner) {
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const dismissed = localStorage.getItem('push_banner_dismissed');
    banner.style.display = (perm === 'default' && !dismissed) ? 'block' : 'none';
  }

  if (!me) return;
  const all = ZAMApi.notifications.getAll();
  const filtered = notifFilter === 'all' ? all : all.filter(n => n.type === notifFilter);
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="notif-empty"><span class="notif-empty-icon">🔔</span>Keine Benachrichtigungen${notifFilter !== 'all' ? ' in dieser Kategorie' : ''}</div>`;
    updateNotifBadge();
    return;
  }

  const icons = {message:'💬', nudge:'👋', event:'🎉', deal:'🏷️', deal_request:'🤝', community:'👥', badge:'🏆', info:'ℹ️'};
  list.innerHTML = filtered.map(n => {
    const timeStr = timeAgo(n.createdAt);
    const isUnread = !n.read;

    if (n.type === 'friend_request' && n.fr_id) {
      const fr = _getFriendRequests().find(r => r.id === n.fr_id);
      const frStatus = fr?.status || 'pending';
      const initials = (n.from_initials || (n.from_name||'?').slice(0,2)).toUpperCase();
      const avatarColor = _avatarColor(n.from_id || n.fr_id);
      const actionHtml = frStatus === 'pending' ? `
        <div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="event.stopPropagation();acceptFriendRequest('${n.fr_id}')" style="flex:1;background:linear-gradient(135deg,#059669,#34d399);border:none;border-radius:10px;padding:9px;color:#fff;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">✅ Annehmen</button>
          <button onclick="event.stopPropagation();rejectFriendRequest('${n.fr_id}')" style="flex:1;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);border-radius:10px;padding:9px;color:#ef4444;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">❌ Ablehnen</button>
        </div>` :
        frStatus === 'accepted' ? `
        <div style="margin-top:10px">
          <button onclick="event.stopPropagation();openPrivateChat('${n.from_id}','${escHtml(n.from_name||'')}','${initials}',null)" style="width:100%;background:rgba(250,70,21,0.15);border:1.5px solid rgba(250,70,21,0.4);border-radius:10px;padding:9px;color:#FA4615;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">💬 Chat öffnen</button>
        </div>` : `<div style="margin-top:8px;font-size:0.68rem;color:rgba(255,255,255,0.3)">Anfrage abgelehnt</div>`;
      return `
        <div class="notif-item ${isUnread ? 'unread' : ''}" style="padding:12px 14px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:38px;height:38px;border-radius:50%;background:${avatarColor};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                <div class="notif-title" style="font-size:0.82rem">➕ Freundschaftsanfrage</div>
                <div style="display:flex;align-items:center;gap:6px">
                  ${isUnread ? '<div class="notif-unread-dot" style="position:static;margin:0"></div>' : ''}
                  <button class="notif-del-btn" onclick="event.stopPropagation();ZAMApi.notifications.deleteById('${n.id}');renderNotifications()" style="position:static">✕</button>
                </div>
              </div>
              <div class="notif-text" style="margin-top:2px">${escHtml(n.body || n.from_name + ' möchte dich als Freund hinzufügen.')}</div>
              <div class="notif-time">${timeStr}</div>
              ${actionHtml}
            </div>
          </div>
        </div>`;
    }

    if (n.type === 'deal_request' && n.deal_req_id) {
      const req = _getDealRequests().find(r => r.id === n.deal_req_id);
      const status = req?.status || 'offen';
      const initials = (n.from_initials || (n.from_name||'?').slice(0,2)).toUpperCase();
      const avatarColor = _avatarColor(n.from_id || n.deal_req_id);

      const actionHtml = status === 'offen' ? `
        <div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="event.stopPropagation();acceptDealRequest('${n.deal_req_id}')" style="flex:1;background:linear-gradient(135deg,#059669,#34d399);border:none;border-radius:10px;padding:9px;color:#fff;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">✅ Annehmen</button>
          <button onclick="event.stopPropagation();rejectDealRequest('${n.deal_req_id}')" style="flex:1;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);border-radius:10px;padding:9px;color:#ef4444;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">❌ Ablehnen</button>
        </div>` :
        status === 'angenommen' ? `
        <div style="margin-top:10px">
          <button onclick="event.stopPropagation();openDealRequestChat('${n.deal_req_id}')" style="width:100%;background:rgba(250,70,21,0.15);border:1.5px solid rgba(250,70,21,0.4);border-radius:10px;padding:9px;color:#FA4615;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">💬 Chat öffnen</button>
        </div>` : `<div style="margin-top:8px;font-size:0.68rem;color:rgba(255,255,255,0.3)">Anfrage abgelehnt</div>`;

      return `
        <div class="notif-item ${isUnread ? 'unread' : ''}" style="padding:12px 14px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:38px;height:38px;border-radius:50%;background:${avatarColor};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                <div class="notif-title" style="font-size:0.82rem">${escHtml(n.from_name||'Jemand')} fragt an</div>
                <div style="display:flex;align-items:center;gap:6px">
                  ${isUnread ? '<div class="notif-unread-dot" style="position:static;margin:0"></div>' : ''}
                  <button class="notif-del-btn" onclick="event.stopPropagation();ZAMApi.notifications.deleteById('${n.id}');renderNotifications()" style="position:static">✕</button>
                </div>
              </div>
              <div class="notif-text" style="margin-top:2px">🏷️ <em>${escHtml(n.deal_title||'Deal')}</em></div>
              <div class="notif-time">${timeStr}</div>
              ${actionHtml}
            </div>
          </div>
        </div>`;
    }

    return `
    <div class="notif-item ${isUnread ? 'unread' : ''}" onclick="onNotifClick('${n.id}','${(n.url||'').replace(/'/g,"\\'")}','${n.type||''}')">
      <div class="notif-icon type-${n.type||'info'}">${icons[n.type] || '🔔'}</div>
      <div class="notif-body">
        <div class="notif-title">${escHtml(n.title||'')}</div>
        <div class="notif-text">${escHtml(n.body||'')}</div>
        <div class="notif-time">${timeStr}</div>
      </div>
      ${isUnread ? '<div class="notif-unread-dot"></div>' : ''}
      <button class="notif-del-btn" onclick="event.stopPropagation();ZAMApi.notifications.deleteById('${n.id}');renderNotifications()">✕</button>
    </div>`;
  }).join('');
  updateNotifBadge();
}

function onNotifClick(id, url, type) {
  ZAMApi.notifications.markReadById(id);
  ZAMApi.notifications.recordOpened();
  renderNotifications();
  updateNotifBadge();
  if (url && url !== '/' && url !== 'undefined') {
    const hash = url.includes('#') ? url.split('#')[1] : url.replace(/^\//, '');
    if (hash) navigateTo(hash);
  }
}

function updateNotifBadge() {
  const count = ZAMApi.notifications.unreadCount();
  const badge = document.getElementById('notif-nav-badge');
  if (!badge) return;
  badge.style.display = count > 0 ? 'flex' : 'none';
  badge.textContent = count > 9 ? '9+' : count;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _fmtDate(raw) {
  if (!raw) return '';
  // Already a friendly string (no T, no Z)? Return as-is
  if (typeof raw === 'string' && !raw.includes('T') && !raw.match(/^\d{4}-\d{2}-\d{2}$/)) return raw;
  try {
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return d.toLocaleDateString('de-DE', { weekday:'short', day:'numeric', month:'long', year:'numeric' });
  } catch { return raw; }
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'Gerade eben';
  if (s < 3600) return `Vor ${Math.floor(s/60)} Min.`;
  if (s < 86400) return `Vor ${Math.floor(s/3600)} Std.`;
  return `Vor ${Math.floor(s/86400)} Tag${Math.floor(s/86400) > 1 ? 'en' : ''}`;
}

// ── Push Permission Handling ──────────────────────────────────
async function requestPushPermission() {
  const result = await ZAMApi.push.requestPermission();
  dismissPushBanner();
  if (result === 'granted') {
    await ZAMApi.push.register();
    showToast('✅ Push-Benachrichtigungen aktiviert!', 'info');
    renderNotifSettings();
  } else {
    showToast('Push wurde nicht erlaubt', 'info');
  }
}

function dismissPushBanner() {
  localStorage.setItem('push_banner_dismissed', '1');
  const b = document.getElementById('push-permission-banner');
  if (b) b.style.display = 'none';
}

async function togglePushPermission() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  if (perm === 'granted') {
    showToast('Push in Browser-Einstellungen deaktivieren', 'info');
  } else {
    await requestPushPermission();
  }
  renderNotifSettings();
}

function renderNotifSettings() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const statusMap = {granted:'✅ Aktiv', denied:'❌ Deaktiviert', default:'⚠️ Nicht aktiviert', unsupported:'Nicht unterstützt'};
  const el = document.getElementById('push-status-val');
  if (el) el.textContent = statusMap[perm] || perm;
  const btn = document.getElementById('btn-push-toggle');
  if (btn) btn.textContent = perm === 'granted' ? 'In Browser-Einstellungen deaktivieren' : 'Jetzt aktivieren';

  const settings = ZAMApi.notifications.getSettings();
  const categories = [
    {key:'messages',   label:'💬 Nachrichten'},
    {key:'nudges',     label:'👋 Anstupsien'},
    {key:'events',     label:'🎉 Events'},
    {key:'deals',      label:'🏷️ Neue Deals'},
    {key:'challenges', label:'📸 Challenges'},
    {key:'spins',      label:'🎰 Freispiele'},
    {key:'partner',    label:'🤝 Partner-Angebote'},
    {key:'community',  label:'👥 Community'},
    {key:'badges',     label:'🏆 Abzeichen'},
  ];
  const list = document.getElementById('notif-settings-list');
  if (!list) return;
  list.innerHTML = categories.map(c => `
    <div class="settings-row">
      <span>${c.label}</span>
      <label class="settings-toggle">
        <input type="checkbox" ${settings[c.key] !== false ? 'checked' : ''} onchange="saveNotifSetting('${c.key}',this.checked)">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>`).join('');
}

function saveNotifSetting(key, val) {
  const s = ZAMApi.notifications.getSettings();
  s[key] = val;
  ZAMApi.notifications.saveSettings(s);
}

// ── Event Reminder Scheduling ─────────────────────────────────
function scheduleEventReminders() {
  const _evData = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const events = (_evData.events || ZAMData?.events || []);
  const now = Date.now();
  events.forEach(ev => {
    if (!ev.date) return;
    const evTime = new Date(ev.date).getTime();
    const in24h  = evTime - now - 86400000;
    const in1h   = evTime - now - 3600000;
    if (in24h > 0 && in24h < 86400000) {
      setTimeout(() => {
        ZAMApi.push.send(`🎉 ${ev.title}`, 'Startet morgen! Sei dabei.', {type:'event', url:'#events'});
      }, in24h);
    }
    if (in1h > 0 && in1h < 3600000) {
      setTimeout(() => {
        ZAMApi.push.send(`🎉 ${ev.title}`, 'Startet in 1 Stunde!', {type:'event', url:'#events'});
      }, in1h);
    }
  });
}

function seedDemoNotifications() {
  const me = ZAMApi.auth.currentUser();
  if (!me) return;
  const existing = ZAMApi.notifications.getAll();
  if (existing.length > 0) return;
  const demos = [
    {type:'nudge',     title:'👋 Neuer Anstupser!',              body:'Mia K. hat dich angestupst'},
    {type:'event',     title:'🎉 Food Festival startet morgen',   body:'Vergiss nicht: Food Festival im MK 2(1) morgen ab 12 Uhr'},
    {type:'deal',      title:'🏷️ Neuer Deal: -20% Mode',         body:'Heute nur: 20% Rabatt bei Fashion Store im MK 2(2)'},
    {type:'community', title:'👍 Jemand hat deinen Beitrag geliked', body:'Dein Post erhielt 5 neue Likes'},
    {type:'badge',     title:'🏆 Neues Abzeichen: Früher Vogel!', body:'Du warst unter den ersten 100 ZAM-Mitgliedern'},
  ];
  demos.forEach(d => ZAMApi.notifications.add(d));
}

// =============================================
// Phase 12 — Merchant Dashboard
// =============================================
function renderMerchantDashboard() {
  // Support admin preview mode
  const previewMerchant = typeof getAdminPreviewMerchant === 'function' ? getAdminPreviewMerchant() : null;
  let me = ZAMApi.auth.currentUser();
  if (previewMerchant) {
    // Use synthetic merchant object for preview
    me = { id: previewMerchant.id, role: 'merchant', name: previewMerchant.shopname, email: previewMerchant.email, merchant_status: 'approved' };
    // Ensure banner is visible
    const banner = document.getElementById('admin-preview-banner');
    const nameEl = document.getElementById('preview-merchant-name');
    if (banner && !banner.classList.contains('visible')) banner.classList.add('visible');
    if (nameEl) nameEl.textContent = previewMerchant.shopname || 'Händler';
  } else if (!me || me.role !== 'merchant') {
    return;
  }

  if (!previewMerchant && me.merchant_status === 'pending') {
    const kpiGrid = document.getElementById('merchant-kpi-grid');
    if (kpiGrid) kpiGrid.innerHTML = `
      <div style="grid-column:1/-1;background:rgba(247,171,0,0.1);border:1px solid rgba(247,171,0,0.3);border-radius:14px;padding:28px 20px;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:12px">⏳</div>
        <div style="font-size:0.95rem;font-weight:700;color:#F7AB00;margin-bottom:8px">Zugang wird geprüft</div>
        <div style="font-size:0.76rem;color:rgba(255,255,255,0.45);line-height:1.7">Dein Händlerzugang wurde beantragt und wird<br>vom ZAM Center Management geprüft.<br><br>Du erhältst eine Benachrichtigung,<br>sobald dein Zugang freigeschaltet ist.</div>
      </div>`;
    return;
  }

  ZAMApi.analytics.seedDemo();

  // Quick actions grid at top of dashboard
  const kpiGridEl = document.getElementById('merchant-kpi-grid');
  if (kpiGridEl) {
    let scannerBtnWrap = document.getElementById('merchant-qr-scanner-wrap');
    if (!scannerBtnWrap) {
      scannerBtnWrap = document.createElement('div');
      scannerBtnWrap.id = 'merchant-qr-scanner-wrap';
      scannerBtnWrap.innerHTML = `
        <div class="merchant-quick-actions">
          <button class="merchant-quick-btn" onclick="openQRScanner()"><span>📷</span><span>QR scannen</span></button>
          <button class="merchant-quick-btn" onclick="openMerchantEventModal()"><span>📅</span><span>Event einreichen</span></button>
          <button class="merchant-quick-btn" onclick="openMerchantDealModal()"><span>🏷️</span><span>Deal einreichen</span></button>
          <button class="merchant-quick-btn" onclick="openVideoDrehModal()" style="background:linear-gradient(135deg,rgba(250,70,21,0.25),rgba(250,70,21,0.1));border:1px solid rgba(250,70,21,0.4)"><span>🎥</span><span style="color:#FA4615">Videodreh</span></button>
        </div>
      `;
      kpiGridEl.parentNode.insertBefore(scannerBtnWrap, kpiGridEl);
    }
  }

  const days = parseInt(document.getElementById('dash-period')?.value || '30');
  const stats = ZAMApi.analytics.getMerchantStats(me.id, days);

  const kpiGrid = document.getElementById('merchant-kpi-grid');
  if (kpiGrid) {
    const kpis = [
      {icon:'👁️', value: stats.profileViews,    label: 'Profilaufrufe',    trend: '+12%', dir: 'up'},
      {icon:'🏷️', value: stats.dealViews,        label: 'Deal-Aufrufe',     trend: '+8%',  dir: 'up'},
      {icon:'💾', value: stats.dealSaves,        label: 'Deal gespeichert', trend: '+5%',  dir: 'up'},
      {icon:'✅', value: stats.dealRedemptions,  label: 'Eingelöst',        trend: '+3%',  dir: 'up'},
      {icon:'🎉', value: stats.eventViews,       label: 'Event-Aufrufe',    trend: '0%',   dir: 'neutral'},
      {icon:'🙋', value: stats.eventJoins,       label: 'Teilnehmer',       trend: '+15%', dir: 'up'},
    ];
    kpiGrid.innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-icon">${k.icon}</div>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-trend ${k.dir}">${k.dir === 'up' ? '↑' : k.dir === 'down' ? '↓' : '→'} ${k.trend}</div>
      </div>`).join('');
  }

  const deals = _gLoad('deals', []).filter(d => d.merchantId === me.id);
  const dealsTable = document.getElementById('merchant-deals-table');
  if (dealsTable) {
    if (!deals.length) {
      dealsTable.innerHTML = '<div class="dash-empty">Noch keine Deals erstellt</div>';
    } else {
      dealsTable.innerHTML = deals.slice(0, 5).map(d => {
        const ds = ZAMApi.analytics.getDealStats(d.id, days);
        return `<div class="dash-row">
          <div class="dash-row-icon">🏷️</div>
          <div class="dash-row-main">
            <div class="dash-row-name">${escHtml(d.title||d.name||'Deal')}</div>
            <div class="dash-row-sub">${ds.views} Aufrufe · ${ds.saves} Gespeichert · ${ds.redemptions} Eingelöst</div>
          </div>
          <div class="dash-row-val">${ds.views}</div>
        </div>`;
      }).join('');
    }
  }

  const evts = _gLoad('events', []).filter(e => e.merchantId === me.id);
  const eventsTable = document.getElementById('merchant-events-table');
  if (eventsTable) {
    if (!evts.length) {
      eventsTable.innerHTML = '<div class="dash-empty">Noch keine Events erstellt</div>';
    } else {
      eventsTable.innerHTML = evts.slice(0, 5).map(ev => {
        const es = ZAMApi.analytics.getEventStats(ev.id, days);
        return `<div class="dash-row">
          <div class="dash-row-icon">🎉</div>
          <div class="dash-row-main">
            <div class="dash-row-name">${escHtml(ev.title||'Event')}</div>
            <div class="dash-row-sub">${es.views} Aufrufe · ${es.joins} Teilnehmer · ${es.checkins} Check-ins</div>
          </div>
          <div class="dash-row-val">${es.joins}</div>
        </div>`;
      }).join('');
    }
  }

  const vouchers = ZAMApi.vouchers.getMyVouchers();
  const vouchersEl = document.getElementById('merchant-vouchers');
  if (vouchersEl) {
    if (!vouchers.length) {
      vouchersEl.innerHTML = '<div class="dash-empty">Noch keine Gutscheine generiert</div>';
    } else {
      vouchersEl.innerHTML = vouchers.slice(-5).reverse().map(v => `
        <div class="dash-row">
          <div class="dash-row-icon">🎟️</div>
          <div class="dash-row-main">
            <div class="dash-row-name" style="font-family:monospace;letter-spacing:0.05em">${v.code}</div>
            <div class="dash-row-sub">${v.status === 'redeemed' ? '✅ Eingelöst' : '⏳ Aktiv'}</div>
          </div>
          <div class="dash-row-val" style="font-size:0.65rem;color:${v.status==='redeemed'?'#34d399':'#F7AB00'}">${v.status.toUpperCase()}</div>
        </div>`).join('');
    }
  }

  // Sponsored section
  const sponsoredEl = document.getElementById('merchant-sponsored');
  if (sponsoredEl) sponsoredEl.innerHTML = renderSponsoredSection('deal') + renderSponsoredSection('event');

  // Merchant submissions section
  const merchantId = me.id;
  let submissionsWrap = document.getElementById('merchant-submissions-wrap');
  if (!submissionsWrap) {
    submissionsWrap = document.createElement('div');
    submissionsWrap.id = 'merchant-submissions-wrap';
    const dashContainer = kpiGridEl ? kpiGridEl.closest('.view') || kpiGridEl.parentNode : null;
    if (dashContainer) dashContainer.appendChild(submissionsWrap);
  }
  if (submissionsWrap) {
    submissionsWrap.innerHTML = `
      <div style="padding:0 16px 16px">
        <h3 style="font-size:0.9rem;font-weight:700;margin-bottom:12px">📋 Meine Einreichungen</h3>
        <div class="merchant-submissions-list">${renderMerchantSubmissionsSection(merchantId)}</div>
      </div>
    `;
  }
  _renderMerchantStats2(stats);
  _renderPartnerDeals(me);
  _renderMerchantVideoDrehSection(me);
  _renderMerchantNewsfeed(me);
}

// =============================================
// VIDEODREH ANFRAGEN – LAMOR AGENCY
// =============================================
const _VD_KEY = 'zam_videodreh_requests';

function _getVideoDrehRequests() {
  try { return JSON.parse(localStorage.getItem(_VD_KEY) || '[]'); } catch { return []; }
}
function _saveVideoDrehRequests(list) {
  localStorage.setItem(_VD_KEY, JSON.stringify(list));
}

const _VD_PACKAGES = [
  {
    id: 'deal_reel',
    icon: '🎥',
    name: 'Deal Reel',
    price: 250,
    regular: 500,
    tag: '50% Händler-Rabatt',
    features: ['1 Reel · 30–60 Sekunden', 'Hochformat 9:16', 'Produkt- / Angebotsvideo', 'Aktions- oder Ladenvideo', 'Schnitt inklusive'],
    ideal: 'Angebote · Produkte · Speisen · Aktionen · Saisonkampagnen'
  },
  {
    id: 'premium_reel',
    icon: '🎬',
    name: 'Premium Reel mit Creator',
    price: 450,
    regular: 900,
    tag: '50% Händler-Rabatt',
    features: ['1 Reel · 30–60 Sekunden', 'Hochformat 9:16', 'Creator / Darsteller vor Kamera', 'Konzeption & Skriptunterstützung', 'Dreh + Schnitt', 'Optimiert für Instagram, TikTok & ZAM Club'],
    ideal: 'Gewinnspiele · Events · Neueröffnungen · Produktvorstellungen · Kampagnen'
  }
];

let _vdSelectedPackage = null;

function openVideoDrehModal() {
  _vdSelectedPackage = null;
  const pkgHtml = _VD_PACKAGES.map(p => `
    <div id="vd_pkg_${p.id}" onclick="_selectVDPackage('${p.id}')" style="border:2px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;cursor:pointer;transition:all 0.2s;margin-bottom:10px;position:relative;overflow:hidden">
      <div style="position:absolute;top:10px;right:10px;background:rgba(250,70,21,0.15);border:1px solid rgba(250,70,21,0.35);border-radius:8px;padding:3px 8px;font-size:0.6rem;font-weight:800;color:#FA4615">${p.tag}</div>
      <div style="font-size:1.3rem;margin-bottom:6px">${p.icon}</div>
      <div style="font-size:0.9rem;font-weight:800;color:#fff;margin-bottom:6px">${p.name}</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
        <span style="font-size:1.5rem;font-weight:900;color:#FA4615">${p.price} € <span style="font-size:0.7rem;font-weight:600">netto</span></span>
        <span style="font-size:0.72rem;color:rgba(255,255,255,0.3);text-decoration:line-through">ab ${p.regular} €</span>
      </div>
      <ul style="list-style:none;padding:0;margin:0 0 10px;display:flex;flex-direction:column;gap:4px">
        ${p.features.map(f => '<li style="font-size:0.72rem;color:rgba(255,255,255,0.7);display:flex;align-items:center;gap:6px"><span style="color:#FA4615;font-size:0.65rem">✔</span>' + f + '</li>').join('')}
      </ul>
      <div style="font-size:0.65rem;color:rgba(255,255,255,0.4)">Ideal für: ${p.ideal}</div>
    </div>
  `).join('');

  _buildMerchantModal('_vd_modal', '🎥 Videodreh anfragen',
    '<div style="background:linear-gradient(135deg,rgba(250,70,21,0.12),rgba(250,70,21,0.04));border:1px solid rgba(250,70,21,0.25);border-radius:14px;padding:14px;margin-bottom:18px">' +
      '<div style="font-size:0.82rem;font-weight:800;color:#FA4615;margin-bottom:4px">Exklusive Sonderpreise für aktive ZAM Club Händler</div>' +
      '<div style="font-size:0.72rem;color:rgba(255,255,255,0.55);line-height:1.5">Professionelle Social-Media-Reels für Deals, Aktionen, Produkte und Events – produziert durch <strong style="color:#fff">LAMOR AGENCY</strong>.</div>' +
    '</div>' +
    '<div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.06em">Paket wählen</div>' +
    pkgHtml +
    '<div id="_vd_form_wrap" style="display:none">' +
      '<div style="height:1px;background:rgba(255,255,255,0.08);margin:18px 0"></div>' +
      '<div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.06em">Anfrage-Details</div>' +
      _inp('Deal / Event / Kampagne (Bezug)', '_vd_ref', 'text', 'z.B. Sommer-Deal, Neueröffnung …', true) +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        _inp('Gewünschter Zeitraum', '_vd_period', 'text', 'z.B. Juli 2026') +
        _inp('Wunschdatum', '_vd_date', 'date') +
      '</div>' +
      _inp('Ansprechpartner', '_vd_contact', 'text', 'Vor- und Nachname', true) +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        _inp('Telefon', '_vd_phone', 'tel', '+49 …', true) +
        _inp('E-Mail', '_vd_email', 'email', 'name@shop.de', true) +
      '</div>' +
      _ta('Kurze Beschreibung', '_vd_desc', 'Was soll gezeigt werden? Welches Ziel hat der Dreh?') +
      _ta('Bemerkungen', '_vd_notes', 'Besondere Wünsche, Termine, Einschränkungen …') +
      '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:14px">' +
        '<div style="font-size:0.65rem;color:rgba(255,255,255,0.35);line-height:1.6">Diese Preise gelten ausschließlich für aktive ZAM Club Händler und sind nicht öffentlich buchbar. Exklusiver Händler-Vorteil durch die Zusammenarbeit mit LAMOR AGENCY.<br><span style="color:rgba(255,255,255,0.2)">Anfragen werden an info@lamoragency.de weitergeleitet.</span></div>' +
      '</div>' +
      _submitBtn('🎥 Videodreh anfragen', 'submitVideoDrehRequest()') +
    '</div>'
  );
}

function _selectVDPackage(pkgId) {
  _vdSelectedPackage = pkgId;
  _VD_PACKAGES.forEach(p => {
    const el = document.getElementById('vd_pkg_' + p.id);
    if (!el) return;
    const active = p.id === pkgId;
    el.style.border = active ? '2px solid #FA4615' : '2px solid rgba(255,255,255,0.1)';
    el.style.background = active ? 'rgba(250,70,21,0.1)' : '';
  });
  const fw = document.getElementById('_vd_form_wrap');
  if (fw) fw.style.display = 'block';
}

function submitVideoDrehRequest() {
  if (!_vdSelectedPackage) { showToast('⚠️ Bitte erst ein Paket auswählen.'); return; }
  const ref     = document.getElementById('_vd_ref')?.value?.trim();
  const contact = document.getElementById('_vd_contact')?.value?.trim();
  const phone   = document.getElementById('_vd_phone')?.value?.trim();
  const email   = document.getElementById('_vd_email')?.value?.trim();
  if (!ref || !contact || !phone || !email) { showToast('⚠️ Bitte alle Pflichtfelder ausfüllen.'); return; }

  const me = ZAMApi.auth.currentUser();
  const pkg = _VD_PACKAGES.find(p => p.id === _vdSelectedPackage);
  const req = {
    id: 'vd_' + Date.now(),
    package_id: _vdSelectedPackage,
    package_name: pkg?.name || _vdSelectedPackage,
    package_price: pkg?.price || 0,
    merchant_id: me?.id || '',
    merchant_name: me?.display_name || me?.name || 'Händler',
    ref,
    period: document.getElementById('_vd_period')?.value?.trim() || '',
    date: document.getElementById('_vd_date')?.value || '',
    contact,
    phone,
    email,
    description: document.getElementById('_vd_desc')?.value?.trim() || '',
    notes: document.getElementById('_vd_notes')?.value?.trim() || '',
    status: 'angefragt',
    created_at: new Date().toISOString()
  };

  const list = _getVideoDrehRequests();
  list.unshift(req);
  _saveVideoDrehRequests(list);

  // Admin notification — forwarded to info@lamoragency.de
  const notifs = JSON.parse(localStorage.getItem('zam_admin_notifications') || '[]');
  notifs.unshift({ id:'vdn_'+Date.now(), type:'videodreh', title:'🎥 Neue Videodreh-Anfrage', body: req.merchant_name + ' – ' + pkg?.name + ' (' + pkg?.price + ' € netto) → info@lamoragency.de', read: false, created_at: new Date().toISOString() });
  localStorage.setItem('zam_admin_notifications', JSON.stringify(notifs.slice(0, 50)));

  _merchantModalClose('_vd_modal');
  showToast('🎥 Anfrage gesendet! LAMOR AGENCY meldet sich bei dir.', 'success');
  _renderMerchantVideoDrehSection(me);
}

function _renderMerchantVideoDrehSection(me) {
  const wrap = document.getElementById('merchant-videodreh-wrap');
  if (!wrap) return;

  const myReqs = _getVideoDrehRequests().filter(r => r.merchant_id === me?.id);
  if (!myReqs.length) { wrap.innerHTML = ''; return; }

  const statusLabel = { angefragt:'⏳ Angefragt', 'in_pruefung':'🔍 In Prüfung', bestaetigt:'✅ Bestätigt', erledigt:'🎉 Erledigt', abgelehnt:'❌ Abgelehnt' };
  const statusColor = { angefragt:'rgba(247,171,0,0.8)', 'in_pruefung':'rgba(96,165,250,0.8)', bestaetigt:'rgba(52,211,153,0.8)', erledigt:'rgba(52,211,153,1)', abgelehnt:'rgba(239,68,68,0.8)' };

  wrap.innerHTML = `
    <div style="padding:0 16px 20px">
      <div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">📋 Meine Videodreh-Anfragen</div>
      ${myReqs.map(r => `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;margin-bottom:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:0.78rem;font-weight:700;color:#fff">${r.package_id === 'premium_reel' ? '🎬' : '🎥'} ${escHtml(r.package_name)}</span>
            <span style="font-size:0.65rem;font-weight:700;color:${statusColor[r.status]||'rgba(255,255,255,0.5)'}">${statusLabel[r.status]||r.status}</span>
          </div>
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.45);margin-bottom:4px">📅 ${new Date(r.created_at).toLocaleDateString('de-DE')} · ${r.package_price} € netto</div>
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.55)">Bezug: ${escHtml(r.ref)}</div>
          ${r.notes ? '<div style="font-size:0.65rem;color:rgba(255,255,255,0.3);margin-top:4px">Notiz: ' + escHtml(r.notes) + '</div>' : ''}
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.35);margin-top:4px">Ansprechpartner: ${escHtml(r.contact)} · ${escHtml(r.phone)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function openVoucherRedeemer() {
  const modal = document.getElementById('voucher-modal');
  if (modal) { modal.style.display = 'flex'; document.getElementById('voucher-result').textContent = ''; }
}
function closeVoucherModal() {
  const modal = document.getElementById('voucher-modal');
  if (modal) modal.style.display = 'none';
}
function redeemVoucher() {
  const code = document.getElementById('voucher-code-input')?.value?.trim().toUpperCase();
  if (!code) return;
  const result = ZAMApi.vouchers.redeem(code);
  const el = document.getElementById('voucher-result');
  if (el) {
    el.textContent = result.ok ? '✅ Erfolgreich eingelöst!' : `❌ ${result.error}`;
    el.style.color = result.ok ? '#34d399' : '#ef4444';
  }
  if (result.ok) setTimeout(closeVoucherModal, 1500);
}

// =============================================
// Admin: Händler verwalten (invite-only)
// =============================================
function _getMerchantInvites() {
  return JSON.parse(localStorage.getItem('zam_merchant_invites') || '[]');
}
function _saveMerchantInvites(list) {
  localStorage.setItem('zam_merchant_invites', JSON.stringify(list));
}
function _getPendingMerchants() {
  return JSON.parse(localStorage.getItem('zam_pending_merchants') || '[]');
}
function _savePendingMerchants(list) {
  localStorage.setItem('zam_pending_merchants', JSON.stringify(list));
}

function renderAdminMerchants(containerId) {
  const ct = document.getElementById(containerId);
  if (!ct) return;
  const invites = _getMerchantInvites();
  const pending = _getPendingMerchants();

  const inputStyle = 'width:100%;background:var(--surface-2);border:1px solid rgba(250,70,21,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none;box-sizing:border-box';

  ct.innerHTML = `
    <div style="margin-bottom:20px">
      <h3 style="font-size:0.88rem;font-weight:700;color:#e2e8f0;margin-bottom:12px">➕ Händler einladen</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input id="inv-shopname" placeholder="Shopname *" style="${inputStyle}"/>
        <input id="inv-email" type="email" placeholder="Händler E-Mail *" style="${inputStyle}"/>
        <input id="inv-contact" placeholder="Ansprechpartner *" style="${inputStyle}"/>
        <select id="inv-category" style="${inputStyle}">
          <option value="">Kategorie wählen…</option>
          <option>Mode</option><option>Gastronomie</option><option>Elektronik</option>
          <option>Drogerie</option><option>Sport</option><option>Lebensmittel</option>
          <option>Bücher &amp; Medien</option><option>Kosmetik &amp; Beauty</option>
          <option>Dienstleistungen</option><option>Sonstiges</option>
        </select>
        <select id="inv-zone" style="${inputStyle}">
          <option value="mk2_1">MK 2(1) – Nahversorgung / Gastro</option>
          <option value="mk2_2">MK 2(2) – Zentrenrelevante Sortimente</option>
          <option value="mk2_3">MK 2(3) – Zentrenrelevante Sortimente</option>
          <option value="mk2_4">MK 2(4) – Nahversorgung</option>
          <option value="plaza">Mahatma-Gandhi-Platz</option>
        </select>
        <div id="inv-error" style="display:none;font-size:0.74rem;color:#f87171;padding:4px 0"></div>
        <button onclick="adminSendMerchantInvite()" style="background:linear-gradient(135deg,#c43510,#FA4615);color:#fff;border:none;border-radius:10px;padding:12px;font-size:0.84rem;font-weight:700;font-family:var(--font);cursor:pointer;width:100%">
          📧 Händler einladen
        </button>
      </div>
    </div>

    ${pending.length ? `
    <div style="margin-bottom:20px">
      <h3 style="font-size:0.88rem;font-weight:700;color:#F7AB00;margin-bottom:10px">⏳ Händler freigeben (${pending.length})</h3>
      ${pending.map(m => `
        <div style="background:rgba(247,171,0,0.08);border:1px solid rgba(247,171,0,0.25);border-radius:12px;padding:12px 14px;margin-bottom:8px">
          <div style="font-size:0.84rem;font-weight:700;color:#e2e8f0;margin-bottom:2px">${escHtml(m.shopname)}</div>
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.45);margin-bottom:10px">${escHtml(m.email)} · ${escHtml(m.category||'')} · ${escHtml(m.zone||'')}</div>
          <div style="display:flex;gap:6px">
            <button onclick="adminApproveMerchant('${escHtml(m.id)}')" style="flex:1;background:rgba(5,150,105,0.15);border:1px solid rgba(52,211,153,0.35);border-radius:8px;padding:8px;color:#34d399;font-size:0.76rem;font-weight:700;font-family:var(--font);cursor:pointer">✅ Freigeben</button>
            <button onclick="adminRejectMerchant('${escHtml(m.id)}')" style="flex:1;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:8px;color:#f87171;font-size:0.76rem;font-weight:700;font-family:var(--font);cursor:pointer">❌ Ablehnen</button>
          </div>
        </div>`).join('')}
    </div>` : ''}

    <div>
      <h3 style="font-size:0.88rem;font-weight:700;color:#e2e8f0;margin-bottom:10px">📋 Eingeladene Händler (${invites.length})</h3>
      ${invites.length === 0
        ? `<div style="font-size:0.74rem;color:rgba(255,255,255,0.3);text-align:center;padding:16px 0">Noch keine Einladungen versendet</div>`
        : invites.map(inv => {
            const statusStyle = inv.status === 'approved'
              ? 'background:rgba(5,150,105,0.15);color:#34d399;border:1px solid rgba(52,211,153,0.3)'
              : inv.status === 'rejected'
              ? 'background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)'
              : 'background:rgba(247,171,0,0.1);color:#F7AB00;border:1px solid rgba(247,171,0,0.25)';
            const statusLabel = inv.status === 'approved' ? 'Aktiv' : inv.status === 'rejected' ? 'Abgelehnt' : 'Ausstehend';
            return `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(250,70,21,0.15);border-radius:12px;padding:12px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
              <div style="flex:1;min-width:0">
                <div style="font-size:0.82rem;font-weight:700;color:#e2e8f0">${escHtml(inv.shopname)}</div>
                <div style="font-size:0.68rem;color:rgba(255,255,255,0.4);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(inv.email)}</div>
                <div style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-top:2px">${escHtml(inv.category||'')} · ${escHtml(inv.zone||'')} · ${new Date(inv.ts).toLocaleDateString('de-DE')}</div>
              </div>
              <div style="font-size:0.65rem;font-weight:700;padding:3px 8px;border-radius:6px;white-space:nowrap;${statusStyle}">${statusLabel}</div>
            </div>`;
          }).join('')}
    </div>`;
}

function adminSendMerchantInvite() {
  const shopname = document.getElementById('inv-shopname')?.value.trim();
  const email    = document.getElementById('inv-email')?.value.trim();
  const contact  = document.getElementById('inv-contact')?.value.trim();
  const category = document.getElementById('inv-category')?.value;
  const zone     = document.getElementById('inv-zone')?.value;
  const errEl    = document.getElementById('inv-error');
  if (!shopname || !email || !contact) {
    if (errEl) { errEl.textContent = 'Bitte Shopname, E-Mail und Ansprechpartner ausfüllen.'; errEl.style.display = 'block'; }
    return;
  }
  const invites = _getMerchantInvites();
  invites.unshift({ id: 'inv_' + Date.now(), shopname, email, contact, category, zone, status: 'pending', ts: new Date().toISOString() });
  _saveMerchantInvites(invites);
  if (errEl) errEl.style.display = 'none';
  ['inv-shopname','inv-email','inv-contact'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  showToast('📧 Einladung für ' + shopname + ' vorbereitet!');
  renderAdminMerchants('admin-merchants-container');
}

function adminApproveMerchant(id) {
  const pending = _getPendingMerchants();
  const idx = pending.findIndex(m => m.id === id);
  if (idx === -1) return;
  const m = pending.splice(idx, 1)[0];
  _savePendingMerchants(pending);
  const invites = _getMerchantInvites();
  invites.unshift({ ...m, status: 'approved', approvedTs: new Date().toISOString() });
  _saveMerchantInvites(invites);
  showToast('✅ ' + m.shopname + ' wurde freigeschaltet!');
  renderAdminMerchants('admin-merchants-container');
}

function adminRejectMerchant(id) {
  const pending = _getPendingMerchants();
  const idx = pending.findIndex(m => m.id === id);
  if (idx === -1) return;
  const m = pending.splice(idx, 1)[0];
  _savePendingMerchants(pending);
  showToast('❌ ' + m.shopname + ' wurde abgelehnt.');
  renderAdminMerchants('admin-merchants-container');
}

// =============================================
// Phase 12 — Admin Dashboard
// =============================================
/* ── Admin: Händler verwalten ── */
function _getMerchantInvites() {
  return JSON.parse(localStorage.getItem('zam_merchant_invites') || '[]');
}
function _saveMerchantInvites(list) {
  localStorage.setItem('zam_merchant_invites', JSON.stringify(list));
}
function _getPendingMerchants() {
  return JSON.parse(localStorage.getItem('zam_pending_merchants') || '[]');
}
function _savePendingMerchants(list) {
  localStorage.setItem('zam_pending_merchants', JSON.stringify(list));
}

function renderAdminMerchants(containerId) {
  const ct = document.getElementById(containerId);
  if (!ct) return;
  const invites = _getMerchantInvites();
  const pending = _getPendingMerchants();

  ct.innerHTML = `
    <div style="margin-bottom:20px">
      <h3 style="font-size:0.9rem;font-weight:700;color:#e2e8f0;margin-bottom:12px">➕ Händler einladen</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input id="inv-shopname" placeholder="Shopname *" class="input-field" style="background:var(--surface-2);border:1px solid rgba(250,70,21,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none"/>
        <input id="inv-email" type="email" placeholder="Händler E-Mail *" class="input-field" style="background:var(--surface-2);border:1px solid rgba(250,70,21,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none"/>
        <input id="inv-contact" placeholder="Ansprechpartner *" class="input-field" style="background:var(--surface-2);border:1px solid rgba(250,70,21,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none"/>
        <select id="inv-category" style="background:var(--surface-2);border:1px solid rgba(250,70,21,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none">
          <option value="">Kategorie wählen…</option>
          <option>Mode</option><option>Gastronomie</option><option>Elektronik</option><option>Drogerie</option><option>Sport</option><option>Lebensmittel</option><option>Bücher &amp; Medien</option><option>Kosmetik &amp; Beauty</option><option>Dienstleistungen</option><option>Sonstiges</option>
        </select>
        <select id="inv-zone" style="background:var(--surface-2);border:1px solid rgba(250,70,21,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none">
          <option value="mk2_1">MK 2(1) – Nahversorgung / Gastro</option>
          <option value="mk2_2">MK 2(2) – Zentrenrelevante Sortimente</option>
          <option value="mk2_3">MK 2(3) – Zentrenrelevante Sortimente</option>
          <option value="mk2_4">MK 2(4) – Nahversorgung</option>
          <option value="plaza">Mahatma-Gandhi-Platz</option>
        </select>
        <div id="inv-error" style="display:none;font-size:0.74rem;color:#f87171;padding:6px 0"></div>
        <button onclick="adminSendMerchantInvite()" style="background:linear-gradient(135deg,#c43510,#FA4615);color:#fff;border:none;border-radius:10px;padding:12px;font-size:0.84rem;font-weight:700;font-family:var(--font);cursor:pointer">
          📧 Händler einladen
        </button>
      </div>
    </div>

    ${pending.length ? `
    <div style="margin-bottom:20px">
      <h3 style="font-size:0.9rem;font-weight:700;color:#F7AB00;margin-bottom:10px">⏳ Händler freigeben (${pending.length})</h3>
      ${pending.map(m => `
        <div style="background:rgba(247,171,0,0.08);border:1px solid rgba(247,171,0,0.25);border-radius:12px;padding:12px 14px;margin-bottom:8px">
          <div style="font-size:0.84rem;font-weight:700;color:#e2e8f0;margin-bottom:2px">${escHtml(m.shopname)}</div>
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.45);margin-bottom:10px">${escHtml(m.email)} · ${escHtml(m.category||'')} · ${escHtml(m.zone||'')}</div>
          <div style="display:flex;gap:6px">
            <button onclick="adminApproveMerchant('${escHtml(m.id)}')" style="flex:1;background:rgba(5,150,105,0.15);border:1px solid rgba(52,211,153,0.35);border-radius:8px;padding:8px;color:#34d399;font-size:0.76rem;font-weight:700;font-family:var(--font);cursor:pointer">✅ Freigeben</button>
            <button onclick="adminRejectMerchant('${escHtml(m.id)}')" style="flex:1;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:8px;color:#f87171;font-size:0.76rem;font-weight:700;font-family:var(--font);cursor:pointer">❌ Ablehnen</button>
          </div>
        </div>`).join('')}
    </div>` : ''}

    <div>
      <h3 style="font-size:0.9rem;font-weight:700;color:#e2e8f0;margin-bottom:10px">📋 Eingeladene Händler (${invites.length})</h3>
      ${invites.length === 0 ? `<div style="font-size:0.74rem;color:rgba(255,255,255,0.3);text-align:center;padding:16px 0">Noch keine Einladungen</div>` :
        invites.map(inv => `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(250,70,21,0.15);border-radius:12px;padding:12px 14px;margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="flex:1">
                <div style="font-size:0.82rem;font-weight:700;color:#e2e8f0">${escHtml(inv.shopname)}</div>
                <div style="font-size:0.68rem;color:rgba(255,255,255,0.4);margin-top:2px">${escHtml(inv.email)} · ${escHtml(inv.category||'')} · ${escHtml(inv.zone||'')}</div>
                <div style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-top:2px">Eingeladen: ${new Date(inv.ts).toLocaleDateString('de-DE')}</div>
              </div>
              <div style="font-size:0.65rem;font-weight:700;padding:3px 8px;border-radius:6px;flex-shrink:0;${inv.status==='approved'?'background:rgba(5,150,105,0.15);color:#34d399;border:1px solid rgba(52,211,153,0.3)':inv.status==='rejected'?'background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)':'background:rgba(247,171,0,0.1);color:#F7AB00;border:1px solid rgba(247,171,0,0.25)'}">
                ${inv.status==='approved'?'Aktiv':inv.status==='rejected'?'Abgelehnt':'Ausstehend'}
              </div>
            </div>
            ${inv.status === 'approved' ? `
            <div style="margin-top:8px">
              <button onclick="adminOpenMerchantPreview(${JSON.stringify(JSON.stringify(inv))})" style="width:100%;background:rgba(250,70,21,0.12);border:1px solid rgba(250,70,21,0.3);border-radius:8px;padding:7px;color:#ffb399;font-size:0.74rem;font-weight:700;font-family:var(--font);cursor:pointer">
                👁 Als Händler anzeigen
              </button>
            </div>` : ''}
          </div>`).join('')}
    </div>`;
}


function adminOpenMerchantPreview(invJson) {
  var inv = typeof invJson === 'string' ? JSON.parse(invJson) : invJson;
  sessionStorage.setItem('zam_admin_preview_merchant', JSON.stringify(inv));
  window.location.href = 'index.html#merchant-dashboard-preview';
}

function adminSendMerchantInvite() {
  const shopname = document.getElementById('inv-shopname')?.value.trim();
  const email    = document.getElementById('inv-email')?.value.trim();
  const contact  = document.getElementById('inv-contact')?.value.trim();
  const category = document.getElementById('inv-category')?.value;
  const zone     = document.getElementById('inv-zone')?.value;
  const errEl    = document.getElementById('inv-error');
  if (!shopname || !email || !contact) {
    if (errEl) { errEl.textContent = 'Bitte Shopname, E-Mail und Ansprechpartner ausfüllen.'; errEl.style.display = 'block'; }
    return;
  }
  const invites = _getMerchantInvites();
  invites.push({ id: 'inv_' + Date.now(), shopname, email, contact, category, zone, status: 'pending', ts: new Date().toISOString() });
  _saveMerchantInvites(invites);
  if (errEl) errEl.style.display = 'none';
  ['inv-shopname','inv-email','inv-contact'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  showToast('📧 Einladung für ' + shopname + ' vorbereitet!');
  renderAdminMerchants('admin-merchants-container');
}

function adminApproveMerchant(id) {
  const pending = _getPendingMerchants();
  const idx = pending.findIndex(m => m.id === id);
  if (idx === -1) return;
  const m = pending.splice(idx, 1)[0];
  _savePendingMerchants(pending);
  const invites = _getMerchantInvites();
  invites.push({ ...m, status: 'approved', approvedTs: new Date().toISOString() });
  _saveMerchantInvites(invites);
  showToast('✅ ' + m.shopname + ' wurde freigeschaltet!');
  renderAdminMerchants('admin-merchants-container');
}

function adminRejectMerchant(id) {
  const pending = _getPendingMerchants();
  const idx = pending.findIndex(m => m.id === id);
  if (idx === -1) return;
  const m = pending.splice(idx, 1)[0];
  _savePendingMerchants(pending);
  showToast('❌ ' + m.shopname + ' wurde abgelehnt.');
  renderAdminMerchants('admin-merchants-container');
}

function renderAdminReferrals(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const list = _loadReferrals();
  if (!list.length) {
    el.innerHTML = `<div style="font-size:0.74rem;color:rgba(255,255,255,0.3);text-align:center;padding:16px 0">Keine Einladungen vorhanden</div>`;
    return;
  }
  el.innerHTML = list.map(r => {
    const statusHtml = r.bonus_unlocked
      ? `<span style="color:#34d399;font-weight:700;font-size:0.72rem">✅ Freigeschaltet</span>`
      : `<span style="color:#F7AB00;font-weight:700;font-size:0.72rem">⏳ Ausstehend</span>`;
    const progress = Math.min(100, (r.invited_points / 2000) * 100).toFixed(0);
    return `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div>
          <div style="font-size:0.78rem;font-weight:700;color:#e2e8f0">${r.referrer_name} → ${r.invited_name || '(ausstehend)'}</div>
          <div style="font-size:0.67rem;color:rgba(255,255,255,0.35);margin-top:2px">
            ${r.invited_points.toLocaleString('de-DE')} / 2.000 Pkt · ${r.invited_days}d · ${r.invited_merchants} Händler
          </div>
        </div>
        ${statusHtml}
      </div>
      <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${progress}%;background:${r.bonus_unlocked ? '#34d399' : 'linear-gradient(90deg,#FA4615,#F7AB00)'};border-radius:2px;transition:width 0.4s"></div>
      </div>
      ${r.unlocked_at ? `<div style="font-size:0.63rem;color:rgba(255,255,255,0.25);margin-top:4px">Freigeschaltet: ${new Date(r.unlocked_at).toLocaleDateString('de-DE')}</div>` : ''}
    </div>`;
  }).join('');
}

function renderAdminDashboard() {
  ZAMApi.analytics.seedDemo();
  const days = parseInt(document.getElementById('admin-period')?.value || '30');
  const stats = ZAMApi.analytics.getCommunityStats(days);

  const kpiGrid = document.getElementById('admin-kpi-grid');
  if (kpiGrid) {
    const kpis = [
      {icon:'👥', value: stats.totalUsers,  label: 'Gesamt-Nutzer',    trend: `+${stats.newUsers} neu`, dir: 'up'},
      {icon:'⚡', value: stats.activeUsers, label: 'Aktive Nutzer',    trend: `${days}d`,               dir: 'neutral'},
      {icon:'🆕', value: stats.newUsers,    label: 'Neue Nutzer',      trend: `letzte ${days}d`,         dir: 'up'},
      {icon:'📊', value: stats.totalEvents, label: 'Analytics Events', trend: '',                        dir: 'neutral'},
    ];
    kpiGrid.innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-icon">${k.icon}</div>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-trend ${k.dir}">${k.trend}</div>
      </div>`).join('');
  }

  const chart = document.getElementById('growth-chart');
  if (chart && stats.growth) {
    const max = Math.max(...stats.growth.map(g => g.count), 1);
    chart.innerHTML = stats.growth.map(g => `
      <div class="bar-col">
        <div class="bar-fill" style="height:${Math.max(4, (g.count/max)*100)}%"></div>
        <div class="bar-lbl">${g.label}</div>
      </div>`).join('');
  }

  const zoneEl = document.getElementById('zone-popularity');
  if (zoneEl && stats.zoneVisits) {
    const zoneNames  = {mk2_1:'MK 2(1)', mk2_2:'MK 2(2)', mk2_3:'MK 2(3)', mk2_4:'MK 2(4)', plaza:'Gandhi-Platz'};
    const zoneColors = {mk2_1:'#d97706', mk2_2:'#d93e12', mk2_3:'#059669', mk2_4:'#2563eb', plaza:'#FA4615'};
    const zoneEntries = Object.entries(stats.zoneVisits).sort((a,b)=>b[1]-a[1]);
    const maxV = Math.max(...zoneEntries.map(z=>z[1]), 1);
    zoneEl.innerHTML = `<div class="dash-table-wrap">${zoneEntries.map(([zone, count]) => `
      <div class="zone-bar-row">
        <div class="zone-bar-name" style="color:${zoneColors[zone]||'#e2e8f0'}">${zoneNames[zone]||zone}</div>
        <div class="zone-bar-track"><div class="zone-bar-fill" style="width:${(count/maxV*100).toFixed(0)}%;background:${zoneColors[zone]||'#FA4615'}"></div></div>
        <div class="zone-bar-count">${count}</div>
      </div>`).join('')}</div>`;
  }

  renderAdminTopList('admin-top-merchants', stats.topMerchants, '🏪', 'Händler', 'Aufrufe');
  renderAdminTopList('admin-top-deals',     stats.topDeals,     '🏷️', 'Deal',    'Aufrufe');
  renderAdminTopList('admin-top-events',    stats.topEvents,    '🎉', 'Event',   'Aufrufe');

  renderAdminPushStats();
  renderAdminVideoDrehRequests('admin-videodreh-container');
  renderAdminMerchants('admin-merchants-container');

  // Quick merchant preview button
  let previewBtnWrap = document.getElementById('admin-merchant-preview-quick');
  if (!previewBtnWrap) {
    previewBtnWrap = document.createElement('div');
    previewBtnWrap.id = 'admin-merchant-preview-quick';
    previewBtnWrap.style.cssText = 'padding:0 16px 20px';
    const merchantsContainer = document.getElementById('admin-merchants-container');
    if (merchantsContainer) merchantsContainer.parentNode?.insertBefore(previewBtnWrap, merchantsContainer);
  }
  const invites = _getMerchantInvites().filter(i => i.status === 'approved');
  previewBtnWrap.innerHTML = `
    <div style="background:rgba(250,70,21,0.08);border:1px solid rgba(250,70,21,0.25);border-radius:14px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:0.82rem;font-weight:700;color:#ffb399;margin-bottom:10px">👁 Händler-Dashboard ansehen</div>
      ${invites.length === 0 ? '<div style="font-size:0.74rem;color:var(--dim)">Noch keine freigegebenen Händler.</div>' :
        `<select id="admin-preview-select" style="width:100%;background:var(--surface-2);border:1px solid rgba(250,70,21,0.3);color:#e2e8f0;border-radius:8px;padding:8px 12px;font-size:0.8rem;font-family:var(--font);margin-bottom:8px">
          <option value="">— Händler auswählen —</option>
          ${invites.map(i => `<option value="${escHtml(i.id)}">${escHtml(i.shopname)}</option>`).join('')}
        </select>
        <button onclick="adminQuickPreviewSelected()" style="width:100%;background:linear-gradient(135deg,#c43510,#FA4615);color:#fff;border:none;border-radius:8px;padding:10px;font-size:0.8rem;font-weight:700;font-family:var(--font);cursor:pointer">
          👁 Dashboard ansehen
        </button>`
      }
    </div>`;

  // Ausstehende Einladungsboni
  const refSection = document.getElementById('admin-referral-list');
  if (refSection) renderAdminReferrals('admin-referral-list');
}

function adminQuickPreviewSelected() {
  const sel = document.getElementById('admin-preview-select');
  if (!sel?.value) { showToast('Bitte zuerst einen Händler auswählen.'); return; }
  const invites = _getMerchantInvites();
  const inv = invites.find(i => i.id === sel.value);
  if (inv) adminOpenMerchantPreview(inv);
}

function renderAdminTopList(elId, list, icon, singular, metric) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!list || !list.length) {
    el.innerHTML = `<div class="dash-table-wrap"><div class="dash-empty">Noch keine Daten</div></div>`;
    return;
  }
  el.innerHTML = `<div class="dash-table-wrap">${list.map(([id, count], i) => `
    <div class="dash-row">
      <div class="dash-row-icon">${i===0?'🥇':i===1?'🥈':i===2?'🥉':icon}</div>
      <div class="dash-row-main">
        <div class="dash-row-name">${singular} ${escHtml(id)}</div>
        <div class="dash-row-sub">${metric}: ${count}</div>
      </div>
      <div class="dash-row-val">#${i+1}</div>
    </div>`).join('')}</div>`;
}

// ── Admin Push Stats ──────────────────────────────────────────
function renderAdminPushStats() {
  const stats = ZAMApi.notifications.getAdminStats();
  const rate    = stats.sent > 0 ? Math.round(stats.opened / stats.sent * 100) : 0;
  const ignored = stats.sent - stats.opened;
  const el = document.getElementById('admin-push-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="push-stat-grid">
      <div class="push-stat-card"><div class="push-stat-num">${stats.sent}</div><div class="push-stat-lbl">Versendet</div></div>
      <div class="push-stat-card"><div class="push-stat-num">${stats.opened}</div><div class="push-stat-lbl">Geöffnet</div></div>
      <div class="push-stat-card"><div class="push-stat-num">${rate}%</div><div class="push-stat-lbl">Öffnungsrate</div></div>
    </div>
    <div style="padding:0 16px;font-size:0.72rem;color:rgba(255,255,255,0.4)">Ignoriert: ${ignored} | Top-Typ: ${_topNotifType(stats.byType)}</div>`;
}

function _topNotifType(byType) {
  if (!byType || !Object.keys(byType).length) return '–';
  return Object.entries(byType).sort((a,b) => b[1]-a[1])[0][0];
}

// =============================================
// Phase 14: Monetarisierung & Händler-Onboarding
// =============================================

// — Onboarding —
let _obCurrentStep = 1;
const _obData = {};

function obShowStep(step) {
  _obCurrentStep = step;
  document.querySelectorAll('.ob-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`ob-step-${step}`);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.ob-step').forEach(s => {
    const n = +s.dataset.step;
    s.classList.toggle('active', n === step);
    s.classList.toggle('done', n < step);
  });
  if (step === 3) renderObPlanCards();
}

function obNextStep(direction) {
  const err = document.getElementById('ob-error');
  if (err) err.style.display = 'none';
  if (direction === 1) {
    const name = document.getElementById('ob-name')?.value?.trim();
    const cat  = document.getElementById('ob-category')?.value;
    const desc = document.getElementById('ob-description')?.value?.trim();
    if (!name || !cat || !desc) {
      if (err) { err.textContent = 'Bitte alle Pflichtfelder ausfüllen.'; err.style.display = 'block'; }
      return;
    }
    _obData.name = name; _obData.category = cat; _obData.description = desc;
    _obData.zone = document.getElementById('ob-zone')?.value || 'mk2_1';
    obShowStep(2);
  } else if (direction === 2) {
    _obData.hours   = document.getElementById('ob-hours')?.value?.trim();
    _obData.phone   = document.getElementById('ob-phone')?.value?.trim();
    _obData.website = document.getElementById('ob-website')?.value?.trim();
    _obData.logo    = document.getElementById('ob-logo')?.value?.trim() || '🏪';
    obShowStep(3);
  } else if (direction === 0)  { obShowStep(1);
  } else if (direction === -1) { obShowStep(2); }
}

function renderObPlanCards() {
  const el = document.getElementById('ob-plan-cards');
  if (!el) return;
  el.innerHTML = Object.values(ZAMApi.packages.PLANS).map((plan, i) => `
    <div class="plan-card ${i === 1 ? 'popular' : ''}">
      ${i === 1 ? '<div class="plan-card-badge">⭐ Beliebt</div>' : ''}
      <div class="plan-card-name">${plan.name}</div>
      <div class="plan-card-price">${plan.price}€ <span>${plan.currency}</span></div>
      <ul class="plan-card-features">${plan.features.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>
      <button class="plan-select-btn ${i === 0 ? 'outline' : ''}" onclick="obSelectPlan('${plan.id}')">
        ${i === 0 ? 'Kostenlos testen' : 'Paket wählen & starten'}
      </button>
    </div>`).join('');
}

function obSelectPlan(planId) {
  const user = ZAMApi.auth.currentUser();
  if (!user) { showToast('Bitte zuerst anmelden.'); return; }
  const uid = user.id;

  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const merchants = g.merchants || [];
  const idx = merchants.findIndex(m => m.id === uid);
  const merchantData = { id: uid, name: _obData.name || 'Mein Shop', category: _obData.category || 'Sonstiges', description: _obData.description || '', zone: _obData.zone || 'mk2_1', hours: _obData.hours || '', phone: _obData.phone || '', website: _obData.website || '', logo: _obData.logo || '🏪', status: 'active', created_at: new Date().toISOString() };
  if (idx >= 0) merchants[idx] = merchantData; else merchants.push(merchantData);
  g.merchants = merchants;
  const accounts = g.accounts || [];
  const acc = accounts.find(a => a.id === uid);
  if (acc) acc.role = 'merchant';
  g.accounts = accounts;
  localStorage.setItem('zamclub_global', JSON.stringify(g));

  const u = JSON.parse(localStorage.getItem(`zamclub_u_${uid}`) || '{}');
  u.role = 'merchant';
  localStorage.setItem(`zamclub_u_${uid}`, JSON.stringify(u));
  try { const s = JSON.parse(sessionStorage.getItem('zamclub_session') || '{}'); s.role = 'merchant'; sessionStorage.setItem('zamclub_session', JSON.stringify(s)); } catch {}

  const res = ZAMApi.contracts.create(planId, 1);
  if (!res.ok) { showToast('Fehler: ' + res.error); return; }
  ZAMApi.billing.generate(res.contract.id);
  showToast('🎉 Willkommen! Dein Händler-Profil ist angelegt.');
  navigateTo('merchant-dashboard');
}

// — Packages Page —
function renderMerchantPackages() {
  const el = document.getElementById('packages-content');
  if (!el) return;
  const active = ZAMApi.contracts.getActive();
  const plans = ZAMApi.packages.PLANS;
  el.innerHTML = `
    ${active ? `<div class="contract-card" style="margin-bottom:16px;border-color:rgba(250,70,21,0.3)">
      <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:4px">AKTUELLES PAKET</div>
      <div style="font-size:1.1rem;font-weight:800;color:#FA4615">${active.plan_name}</div>
      <div style="margin-top:6px"><span class="contract-status" style="background:${active.status==='active'?'rgba(34,197,94,0.15)':'rgba(247,171,0,0.15)'};color:${ZAMApi.contracts.statusColor(active.status)}">${ZAMApi.contracts.statusLabel(active.status)}</span>
      <span style="font-size:0.7rem;color:rgba(255,255,255,0.3);margin-left:8px">bis ${new Date(active.ends_at).toLocaleDateString('de-DE')}</span></div>
    </div>` : '<p style="font-size:0.82rem;color:rgba(255,255,255,0.5);margin-bottom:16px">Kein aktives Paket. Wähle ein Paket um loszulegen.</p>'}
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35);margin-bottom:12px">${active ? 'Upgrade' : 'Paket wählen'}</div>
    ${Object.values(plans).map((plan, i) => `
      <div class="plan-card ${plan.id === active?.plan_id ? 'selected' : ''} ${i === 1 ? 'popular' : ''}">
        ${i === 1 && plan.id !== active?.plan_id ? '<div class="plan-card-badge">⭐ Beliebt</div>' : ''}
        ${plan.id === active?.plan_id ? '<div class="plan-card-badge active-badge">✓ Aktiv</div>' : ''}
        <div class="plan-card-name">${plan.name}</div>
        <div class="plan-card-price">${plan.price}€ <span>${plan.currency}</span></div>
        <ul class="plan-card-features">${plan.features.map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>
        ${plan.id !== active?.plan_id
          ? `<button class="plan-select-btn ${i === 0 ? 'outline' : ''}" onclick="upgradePlan('${plan.id}')">${active ? 'Zu diesem Paket wechseln' : 'Starten'}</button>`
          : `<div style="text-align:center;font-size:0.75rem;color:#22c55e;padding:8px 0">✓ Dein aktuelles Paket</div>`}
      </div>`).join('')}`;
}

function upgradePlan(planId) {
  const name = ZAMApi.packages.PLANS[planId]?.name;
  if (!confirm(`Zu ${name}-Paket wechseln?`)) return;
  const res = ZAMApi.contracts.create(planId, 1);
  if (!res.ok) { showToast('Fehler: ' + res.error); return; }
  ZAMApi.billing.generate(res.contract.id);
  showToast('✅ Paket gewechselt zu ' + name + '!');
  renderMerchantPackages();
}

// — Contracts Page —
function renderMerchantContracts() {
  const el = document.getElementById('contracts-content');
  if (!el) return;
  const contracts = ZAMApi.contracts.getMine();
  if (!contracts.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-title">Keine Verträge</div><div class="empty-state-sub">Du hast noch kein Paket gebucht.</div></div>';
    return;
  }
  el.innerHTML = contracts.slice().reverse().map(c => `
    <div class="contract-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div><div class="contract-card-title">${escHtml(c.plan_name)}</div>
        <div class="contract-card-meta">${new Date(c.started_at).toLocaleDateString('de-DE')} – ${new Date(c.ends_at).toLocaleDateString('de-DE')} · ${c.months} Monat${c.months>1?'e':''}</div></div>
        <span class="contract-status" style="background:${c.status==='active'?'rgba(34,197,94,0.15)':c.status==='trial'?'rgba(247,171,0,0.15)':'rgba(239,68,68,0.1)'};color:${ZAMApi.contracts.statusColor(c.status)};white-space:nowrap">${ZAMApi.contracts.statusLabel(c.status)}</span>
      </div>
      <div style="font-size:0.85rem;font-weight:700;color:#FA4615;margin-top:10px">${c.price}€ gesamt</div>
      ${c.status==='trial' ? `<div style="margin-top:10px"><button class="btn btn-primary" style="padding:8px 16px;font-size:0.75rem" onclick="activateContract('${c.id}')">Jetzt aktivieren</button></div>` : ''}
      ${c.status==='active' ? `<div style="margin-top:10px"><button class="btn btn-ghost" style="padding:8px 16px;font-size:0.75rem;color:rgba(239,68,68,0.7);border-color:rgba(239,68,68,0.2)" onclick="cancelContract('${c.id}')">Kündigen</button></div>` : ''}
    </div>`).join('');
}

function activateContract(id) { ZAMApi.contracts.activate(id); showToast('✅ Vertrag aktiviert!'); renderMerchantContracts(); }
function cancelContract(id) { if (!confirm('Vertrag wirklich kündigen?')) return; ZAMApi.contracts.cancel(id); showToast('Vertrag gekündigt.'); renderMerchantContracts(); }

// — Billing Page —
function renderMerchantBilling() {
  const el = document.getElementById('billing-content');
  if (!el) return;
  const invoices = ZAMApi.billing.getMine();
  const active = ZAMApi.contracts.getActive();
  if (!invoices.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧾</div><div class="empty-state-title">Keine Rechnungen</div><div class="empty-state-sub">Rechnungen erscheinen nach der Paket-Buchung.</div></div>';
    return;
  }
  el.innerHTML = `
    ${active ? `<div style="background:rgba(250,70,21,0.1);border:1px solid rgba(250,70,21,0.2);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:4px">LAUFENDES PAKET</div>
      <div style="font-size:0.95rem;font-weight:700;color:#ffb399">${escHtml(active.plan_name)} — ${ZAMApi.packages.PLANS[active.plan_id]?.price||0}€/Monat</div>
      <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:4px">Status: <span style="color:${ZAMApi.contracts.statusColor(active.status)}">${ZAMApi.contracts.statusLabel(active.status)}</span></div>
    </div>` : ''}
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35);margin-bottom:10px">Rechnungshistorie</div>
    <div style="background:var(--surface);border-radius:14px;padding:0 14px">
      ${invoices.slice().reverse().map(inv => `
        <div class="invoice-row">
          <div><div class="invoice-id">${inv.id}</div><div class="invoice-plan">${escHtml(inv.plan_name)}</div><div style="font-size:0.65rem;color:rgba(255,255,255,0.3)">${new Date(inv.issued_at).toLocaleDateString('de-DE')}</div></div>
          <div style="margin-left:auto;text-align:right">
            <div class="invoice-amount">${inv.amount}€</div>
            <span class="invoice-status ${inv.status}">${inv.status==='paid'?'Bezahlt':'Ausstehend'}</span>
            ${inv.status==='pending' ? `<br><button style="font-size:0.65rem;color:#FA4615;background:none;border:none;cursor:pointer;margin-top:4px;font-family:var(--font)" onclick="markInvoicePaid('${inv.id}')">Als bezahlt markieren</button>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

function markInvoicePaid(id) { ZAMApi.billing.markPaid(id); showToast('✅ Rechnung als bezahlt markiert.'); renderMerchantBilling(); }

// — Merchant Dashboard: Sponsored —
function renderSponsoredSection(type) {
  const _sponsG = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const items = type === 'deal' ? (_sponsG.deals || ZAMData?.deals || []) : (_sponsG.events || ZAMData?.events || []);
  const uid = ZAMApi.auth.currentUser()?.id;
  const myItems = items.filter(i => i.merchant_id === uid);
  if (!myItems.length) return `<div class="dash-empty">Keine eigenen ${type==='deal'?'Deals':'Events'} vorhanden</div>`;
  const canBoost = ZAMApi.packages.canAccess('sponsored');
  return myItems.map(item => {
    const boosted = ZAMApi.sponsored.isBoosted(type, item.id);
    return `<div class="dash-row">
      <div class="dash-row-icon">${type==='deal'?'🏷️':'🎉'}</div>
      <div class="dash-row-main"><div class="dash-row-name">${escHtml(item.title||item.name||'')}</div>
      <div class="dash-row-sub">${boosted ? '<span class="sponsored-badge">⚡ Aktiver Boost</span>' : 'Kein Boost aktiv'}</div></div>
      ${canBoost && !boosted ? `<button style="font-size:0.7rem;background:linear-gradient(135deg,#92400e,#d97706);color:#fff;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-family:var(--font);font-weight:700;flex-shrink:0" onclick="boostItem('${type}','${item.id}')">Boost</button>` : ''}
    </div>`;
  }).join('');
}

function boostItem(type, itemId) {
  const res = ZAMApi.sponsored.boost(type, itemId, 7);
  if (!res.ok) { showToast('❌ ' + (res.error || 'Fehler')); return; }
  showToast('⚡ Boost aktiviert – 7 Tage Spotlight!');
  renderMerchantDashboard();
}

// — Admin Revenue Overview —
function renderAdminRevenue() {
  const el = document.getElementById('revenue-content');
  if (!el) return;
  const stats = ZAMApi.sponsored.getAdminStats();
  const contracts = ZAMApi.contracts.getAll();
  el.innerHTML = `
    <div class="revenue-kpi-grid">
      <div class="revenue-kpi-card"><div class="revenue-kpi-num">${stats.activeContracts}</div><div class="revenue-kpi-lbl">Aktive Verträge</div></div>
      <div class="revenue-kpi-card"><div class="revenue-kpi-num">${stats.monthlyRevenue}€</div><div class="revenue-kpi-lbl">Monatl. Umsatz</div></div>
      <div class="revenue-kpi-card"><div class="revenue-kpi-num">${stats.trialContracts}</div><div class="revenue-kpi-lbl">Testphase</div></div>
      <div class="revenue-kpi-card"><div class="revenue-kpi-num">${stats.activeSponsorships}</div><div class="revenue-kpi-lbl">Aktive Boosts</div></div>
    </div>
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35);margin-bottom:12px">Paket-Verteilung</div>
    <div style="background:var(--surface);border-radius:14px;padding:8px 14px;margin-bottom:16px">
      ${Object.entries(ZAMApi.packages.PLANS).map(([id, plan]) => {
        const count = stats.plans[id] || 0, maxC = Math.max(...Object.values(stats.plans), 1);
        return `<div class="plan-dist-row"><div class="plan-dist-name">${plan.name}</div><div class="plan-dist-bar"><div class="plan-dist-fill" style="width:${(count/maxC*100).toFixed(0)}%"></div></div><div class="plan-dist-count">${count}</div></div>`;
      }).join('')}
    </div>
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35);margin-bottom:12px">Alle Verträge (${contracts.length})</div>
    <div style="background:var(--surface);border-radius:14px;padding:0 14px">
      ${contracts.length ? contracts.slice().reverse().map(c => `
        <div class="invoice-row">
          <div><div style="font-size:0.78rem;font-weight:600;color:#e2e8f0">${escHtml(c.plan_name)}</div><div style="font-size:0.65rem;color:rgba(255,255,255,0.3)">${new Date(c.created_at).toLocaleDateString('de-DE')} · ${c.months} Mon.</div></div>
          <div style="margin-left:auto;text-align:right"><div style="font-size:0.85rem;font-weight:700;color:#ff6b3d">${c.price}€</div><span class="contract-status" style="background:${c.status==='active'?'rgba(34,197,94,0.15)':c.status==='trial'?'rgba(247,171,0,0.15)':'rgba(239,68,68,0.1)'};color:${ZAMApi.contracts.statusColor(c.status)}">${ZAMApi.contracts.statusLabel(c.status)}</span></div>
        </div>`).join('') : '<div style="padding:16px;font-size:0.78rem;color:rgba(255,255,255,0.3)">Noch keine Verträge</div>'}
    </div>`;
}

// =============================================
// Phase 13: PWA, Demo Mode, Offline, Helpers
// =============================================

// PWA Install
let _deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  const dismissed = localStorage.getItem('zam_pwa_dismissed');
  if (!dismissed) {
    setTimeout(() => { document.getElementById('pwa-install-banner').style.display = 'block'; }, 3000);
  }
});

function installPWA() {
  if (_deferredInstall) {
    _deferredInstall.prompt();
    _deferredInstall.userChoice.then(() => { _deferredInstall = null; });
  }
  document.getElementById('pwa-install-banner').style.display = 'none';
}

function dismissInstallBanner() {
  document.getElementById('pwa-install-banner').style.display = 'none';
  localStorage.setItem('zam_pwa_dismissed', '1');
}

// Offline Banner
function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  if (!navigator.onLine) {
    banner.style.display = 'block';
    document.body.style.paddingTop = '40px';
  } else {
    banner.style.display = 'none';
    document.body.style.paddingTop = '';
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Role Guard
function requireRole(role, containerId) {
  const user = ZAMApi.auth.currentUser();
  if (!user) return false;
  const ok = role === 'merchant' ? (user.role === 'merchant' || user.role === 'admin') : user.role === role;
  if (!ok) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="role-guard"><div class="role-guard-icon">🔒</div><div class="role-guard-title">Kein Zugang</div><div class="role-guard-sub">Dieser Bereich ist nur für ${role === 'merchant' ? 'Händler' : 'Administratoren'} verfügbar.</div></div>`;
  }
  return ok;
}

// Empty State Helper
function emptyState(icon, title, sub) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div class="empty-state-title">${title}</div><div class="empty-state-sub">${sub}</div></div>`;
}

// Skeleton Helper
function showSkeleton(containerId, count = 3) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array(count).fill('<div class="skeleton skeleton-card"></div>').join('');
}

// Demo / Pitch Mode
let _demoRotateInterval = null;

function renderDemoMode() {
  const page = document.getElementById('page-demo');
  if (!page) return;

  // KPI Cards
  const users = ZAMApi.auth ? (() => { try { return (JSON.parse(localStorage.getItem('zamclub_global') || '{}')).accounts?.length || 0; } catch { return 0; } })() : 0;
  const _demoG = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const events = (_demoG.events || ZAMData?.events || []).length;
  const deals = (_demoG.deals || ZAMData?.deals || []).length;
  const commStats = ZAMApi.analytics.getCommunityStats();
  const kpiGrid = document.getElementById('demo-kpi-grid');
  if (kpiGrid) kpiGrid.innerHTML = [
    { num: Math.max(users, 1), lbl: 'Mitglieder' },
    { num: events, lbl: 'Events' },
    { num: deals, lbl: 'Deals' },
    { num: commStats.posts || 0, lbl: 'Posts' },
  ].map(k => `<div class="demo-kpi-card"><div class="demo-kpi-num">${k.num}</div><div class="demo-kpi-lbl">${k.lbl}</div></div>`).join('');

  // Activity Feed — rotate entries
  const activities = [
    { icon: '👋', text: 'Mia K. hat Felix B. angestupst', time: 'gerade eben' },
    { icon: '🎉', text: 'Neues Event: Sommermarkt Freiham – 42 Interessierte', time: 'vor 2 Min.' },
    { icon: '🏷️', text: 'New Balance Store: 20% Rabatt – 18 Aufrufe', time: 'vor 5 Min.' },
    { icon: '💬', text: 'Anna P. hat in Community geschrieben', time: 'vor 8 Min.' },
    { icon: '📍', text: '3 neue Nutzer im MK 2(2) eingecheckt', time: 'vor 12 Min.' },
    { icon: '🏆', text: 'Tom W. hat Gold-Badge freigeschaltet', time: 'vor 18 Min.' },
  ];

  let actIdx = 0;
  function renderActivity() {
    const feed = document.getElementById('demo-activity-feed');
    if (!feed) return;
    const slice = activities.slice(actIdx % activities.length, (actIdx % activities.length) + 3);
    const wrapped = [...slice, ...activities].slice(0, 3);
    feed.innerHTML = wrapped.map(a => `
      <div class="demo-activity-item">
        <div class="demo-activity-icon">${a.icon}</div>
        <div>
          <div class="demo-activity-text">${a.text}</div>
          <div class="demo-activity-time">${a.time}</div>
        </div>
      </div>`).join('');
    actIdx++;
  }
  renderActivity();
  clearInterval(_demoRotateInterval);
  _demoRotateInterval = setInterval(renderActivity, 4000);

  // Zone Heatmap
  const heatmap = ZAMApi.analytics.getZoneHeatmap();
  const zoneNames = { mk2_1: 'MK 2(1) Orange', mk2_2: 'MK 2(2) Lila', mk2_3: 'MK 2(3) Grün', mk2_4: 'MK 2(4) Blau', plaza: 'Gandhi-Platz' };
  const zoneColors = { mk2_1: '#d97706', mk2_2: '#d93e12', mk2_3: '#059669', mk2_4: '#2563eb', plaza: '#FA4615' };
  const zoneEl = document.getElementById('demo-zone-heatmap');
  if (zoneEl) {
    const entries = Object.entries(heatmap).sort((a, b) => b[1] - a[1]);
    const maxV = Math.max(...entries.map(e => e[1]), 1);
    zoneEl.innerHTML = entries.map(([zone, count]) => `
      <div class="zone-bar-row">
        <div class="zone-bar-name" style="color:${zoneColors[zone] || '#e2e8f0'}">${zoneNames[zone] || zone}</div>
        <div class="zone-bar-track"><div class="zone-bar-fill" style="width:${(count / maxV * 100).toFixed(0)}%;background:${zoneColors[zone] || '#FA4615'}"></div></div>
        <div class="zone-bar-count">${count}</div>
      </div>`).join('');
  }
}

// 5-tap Easter egg on logo to open demo mode
let _logoTaps = 0, _logoTimer = null;
function onLogoTap() {
  _logoTaps++;
  clearTimeout(_logoTimer);
  _logoTimer = setTimeout(() => { _logoTaps = 0; }, 1500);
  if (_logoTaps >= 5) {
    _logoTaps = 0;
    navigateTo('demo');
    showToast('🎯 Demo-Modus aktiviert');
  }
}

// Seed real ZAM content (called once on first launch)
// =============================================
// PHASE 17: KI Concierge & Empfehlungen
// =============================================

// ── AI Chat State ──
let _aiMessages = []; // { role: 'bot'|'user', text, time }

function renderAIConcierge(scrollToBottom) {
  const win = $('#ai-chat-window');
  if (!win) return;
  // Preserve welcome bubble, append messages
  const existing = win.querySelectorAll('.ai-bubble-user, .ai-bubble-bot.ai-msg');
  existing.forEach(el => el.remove());
  const now = new Date();
  _aiMessages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `ai-bubble ai-bubble-${msg.role} ai-msg`;
    const timeStr = now.toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' });
    if (msg.role === 'user') {
      const user = ZAMApi.auth.currentUser() || {};
      const initials = (user.display_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      div.innerHTML = `<div class="ai-avatar-user">${initials}</div><div class="ai-bubble-body"><div class="ai-bubble-text">${esc(msg.text)}</div><div class="ai-bubble-time">${timeStr}</div></div>`;
    } else {
      div.innerHTML = `<div class="ai-avatar">Z</div><div class="ai-bubble-body"><div class="ai-bubble-text">${msg.html || esc(msg.text)}</div><div class="ai-bubble-time">${timeStr}</div></div>`;
    }
    win.appendChild(div);
  });
  if (scrollToBottom) {
    win.scrollTop = win.scrollHeight;
  } else {
    win.scrollTop = 0; // always show welcome bubble at top
  }
}

function aiSend() {
  const input = $('#ai-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  aiAsk(text);
}

function aiAsk(question) {
  _aiMessages.push({ role: 'user', text: question });
  renderAIConcierge(true);
  // Show typing indicator
  const win = $('#ai-chat-window');
  let typingEl = null;
  if (win) {
    typingEl = document.createElement('div');
    typingEl.className = 'ai-bubble ai-bubble-bot ai-typing-row';
    typingEl.innerHTML = `<div class="ai-avatar">Z</div><div class="ai-typing"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div></div>`;
    win.appendChild(typingEl);
    win.scrollTop = win.scrollHeight;
  }
  // Generate response (simulated with real data)
  setTimeout(() => {
    if (typingEl) typingEl.remove();
    const answer = aiGenerateAnswer(question);
    _aiMessages.push({ role: 'bot', html: answer });
    renderAIConcierge(true);
  }, 800 + Math.random() * 600);
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function aiGenerateAnswer(q) {
  const lower = q.toLowerCase();
  // Use synchronous localStorage data to avoid async issues
  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const events = (g.events || ZAMData?.events || []).filter(e => e.status !== 'cancelled');
  const deals = (g.deals || ZAMData?.deals || []).filter(d => d.status !== 'expired');
  const merchants = g.merchants || ZAMData?.merchants || [];
  const user = ZAMApi.auth.currentUser();
  const prefs = user ? aiGetUserPrefs(user.id) : {};

  // Today's events
  if (lower.includes('heute') && (lower.includes('event') || lower.includes('machen'))) {
    const todayEvents = events.slice(0, 3);
    if (!todayEvents.length) return 'Heute sind leider keine Events eingetragen. Schau morgen wieder rein!';
    const list = todayEvents.map(e => `• <strong>${esc(e.title)}</strong> – ${esc(e.location || 'ZAM Freiham')}`).join('<br>');
    return `Hier sind aktuelle Events im ZAM:<br><br>${list}<br><br>Tippe auf Events für alle Details! 🎉`;
  }

  // Food / Essen
  if (lower.includes('essen') || lower.includes('food') || lower.includes('restaurant') || lower.includes('hunger')) {
    const foodMerchants = merchants.filter(m => ['food', 'restaurant', 'café', 'gastronomie', 'küche', 'kitchen'].some(k => (m.category||'').toLowerCase().includes(k) || (m.name||'').toLowerCase().includes(k)));
    if (foodMerchants.length) {
      const list = foodMerchants.slice(0,3).map(m => `• <strong>${esc(m.name)}</strong> – ${esc(m.category || '')}`).join('<br>');
      return `Im ZAM gibt es tolle Gastro-Angebote:<br><br>${list}<br><br>Guten Appetit! 🍽️`;
    }
    return 'Im ZAM Freiham findest du das <strong>Levante Kitchen</strong> für orientalische Küche und das <strong>Café Freiham</strong> für Kaffee & Snacks. 🍽️';
  }

  // Kaffee
  if (lower.includes('kaffee') || lower.includes('café') || lower.includes('coffee')) {
    const cafes = merchants.filter(m => ['café', 'coffee', 'kaffee'].some(k => (m.name||'').toLowerCase().includes(k) || (m.category||'').toLowerCase().includes(k)));
    const name = cafes.length ? cafes[0].name : 'Café Freiham';
    return `Für einen guten Kaffee empfehle ich dir <strong>${esc(name)}</strong> – dort gibt es auch frische Snacks und ein gemütliches Ambiente. ☕\n\nZone EG, Eingang Ost.`;
  }

  // Angebote / Deals
  if (lower.includes('angebot') || lower.includes('deal') || lower.includes('rabatt') || lower.includes('sparen') || lower.includes('günstig')) {
    if (!deals.length) return 'Aktuell sind keine Deals verfügbar. Schau bald wieder vorbei!';
    const top = deals.slice(0, 3);
    const list = top.map(d => `• <strong>${esc(d.title)}</strong> – ${esc(d.discount || '')} bei ${esc(d.merchant_name || '')}`).join('<br>');
    return `Hier sind unsere Top-Angebote:<br><br>${list}<br><br>Alle Deals findest du im Deals-Bereich 🏷️`;
  }

  // Sport / Gym
  if (lower.includes('sport') || lower.includes('gym') || lower.includes('fitness') || lower.includes('yoga')) {
    return 'Für Sport & Fitness gibt es den <strong>Westside Gym</strong> im ZAM – mit 7-Tage-Schnuppermitgliedschaft! 💪<br><br>Außerdem findet regelmäßig Yoga im Atrium statt – schau in die Events!';
  }

  // Shopping / Mode
  if (lower.includes('shopping') || lower.includes('mode') || lower.includes('kleidung') || lower.includes('shop')) {
    return 'Für Mode und Shopping empfehle ich:<br><br>• <strong>Odeya Fashion</strong> – aktuelle Trends, EG<br>• <strong>New Balance Store</strong> – Sneaker & Sport-Mode, OG1<br><br>Tipp: Schau in die Deals für aktuelle Rabatte! 👗';
  }

  // Empfehlungen / personalisiert
  if (lower.includes('empfehlung') || lower.includes('persönlich') || lower.includes('für mich')) {
    if (!user) return 'Melde dich an, um personalisierte Empfehlungen zu erhalten! 👤';
    const recs = aiGetPersonalizedRecs(user.id);
    if (!recs.length) return 'Schau dir Events und Deals an – je mehr du nutzt, desto besser werden meine Empfehlungen! ✨';
    const list = recs.slice(0,3).map(r => `• ${r.emoji} <strong>${esc(r.title)}</strong>`).join('<br>');
    return `Basierend auf deinen Interessen empfehle ich:<br><br>${list}<br><br>Viel Spaß im ZAM! ✨`;
  }

  // Was kann ich machen / allgemein
  if (lower.includes('machen') || lower.includes('erleben') || lower.includes('aktivität')) {
    const eventCount = events.length;
    const dealCount = deals.length;
    return `Im ZAM Freiham erwartet dich:<br><br>🎉 <strong>${eventCount} aktive Events</strong><br>🏷️ <strong>${dealCount} Deals & Angebote</strong><br>🏪 <strong>6 Shops & Restaurants</strong><br>🗺️ <strong>Interaktive Karte</strong><br><br>Womit möchtest du beginnen?`;
  }

  // Öffnungszeiten
  if (lower.includes('öffnung') || lower.includes('uhrzeit') || lower.includes('wann')) {
    return 'Das ZAM Freiham ist <strong>Mo–Sa von 09:00–20:00 Uhr</strong> geöffnet.<br><br>Gastronomie hat teils abweichende Zeiten. 🕐';
  }

  // Parking / Anfahrt
  if (lower.includes('parkplatz') || lower.includes('parken') || lower.includes('anfahrt') || lower.includes('s-bahn')) {
    return 'Das ZAM Freiham erreichst du so:<br><br>🚆 <strong>S-Bahn:</strong> S8, Haltestelle Freiham<br>🚗 <strong>Auto:</strong> Tiefgarage mit über 500 Stellplätzen<br>🚌 <strong>Bus:</strong> Linien 161, 162<br><br>Adresse: Bodenseestraße 201, 81243 München';
  }

  // Default
  return `Ich helfe gerne! Du kannst mich fragen:<br><br>• Was gibt es heute im ZAM?<br>• Aktuelle Angebote & Deals<br>• Wo kann ich essen?<br>• Meine persönlichen Empfehlungen<br><br>Was möchtest du wissen? 🤖`;
}

// ── User Preference Analysis ──
function aiGetUserPrefs(userId) {
  if (!userId) return {};
  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const ud = JSON.parse(localStorage.getItem(`zamclub_u_${userId}`) || '{}');
  const savedDeals = ud.saved_deals || [];
  const savedEvents = ud.saved_events || [];
  const analytics = JSON.parse(localStorage.getItem('zamclub_analytics') || '{}');
  const events = analytics.events || [];

  // Count categories from saved items
  const deals = (g.deals || []);
  const eventsData = (g.events || []);

  const cats = {};
  savedDeals.forEach(id => {
    const d = deals.find(x => x.id === id);
    if (d && d.category) cats[d.category] = (cats[d.category] || 0) + 2;
  });
  savedEvents.forEach(id => {
    const e = eventsData.find(x => x.id === id);
    if (e && e.category) cats[e.category] = (cats[e.category] || 0) + 2;
  });
  // Activity-based
  events.filter(e => e.user_id === userId).forEach(ev => {
    if (ev.category) cats[ev.category] = (cats[ev.category] || 0) + 1;
  });
  return cats;
}

function aiGetPersonalizedRecs(userId) {
  const prefs = aiGetUserPrefs(userId);
  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const events = (g.events || []).filter(e => e.status !== 'cancelled');
  const deals = (g.deals || []).filter(d => d.status !== 'expired');
  const sortedCats = Object.entries(prefs).sort((a,b) => b[1]-a[1]).map(([c]) => c);

  const recs = [];
  // Match events to preferred categories
  events.forEach(e => {
    const score = sortedCats.indexOf(e.category);
    if (score !== -1) recs.push({ type: 'event', id: e.id, title: e.title, score: sortedCats.length - score, emoji: '🎉' });
  });
  deals.forEach(d => {
    const score = sortedCats.indexOf(d.category);
    if (score !== -1) recs.push({ type: 'deal', id: d.id, title: d.title, score: sortedCats.length - score, emoji: '🏷️' });
  });
  // If no prefs yet, show popular items
  if (!recs.length) {
    events.slice(0,2).forEach(e => recs.push({ type: 'event', id: e.id, title: e.title, score: 1, emoji: '🎉' }));
    deals.slice(0,2).forEach(d => recs.push({ type: 'deal', id: d.id, title: d.title, score: 1, emoji: '🏷️' }));
  }
  return recs.sort((a,b) => b.score - a.score).slice(0, 6);
}

// ── Render Personalized Home Recommendations ──
function renderHomeRecs() {
  const user = ZAMApi.auth.currentUser();
  const labelEl = $('#home-rec-label');
  const scrollEl = $('#home-recs-scroll');
  if (!scrollEl) return;

  if (!user) { if (labelEl) labelEl.style.display = 'none'; scrollEl.innerHTML = ''; return; }

  const recs = aiGetPersonalizedRecs(user.id);
  if (!recs.length) { if (labelEl) labelEl.style.display = 'none'; scrollEl.innerHTML = ''; return; }

  if (labelEl) labelEl.style.display = '';
  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  scrollEl.innerHTML = recs.slice(0, 5).map(r => {
    if (r.type === 'event') {
      const e = (g.events || []).find(x => x.id === r.id);
      if (!e) return '';
      const dateStr = e.date_formatted || _fmtDate(e.date_iso || e.date);
      return `<div onclick="navigateTo('events')" style="min-width:160px;max-width:160px;flex-shrink:0;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:10px;cursor:pointer">
        <div style="font-size:0.6rem;font-weight:700;color:rgba(250,70,21,0.9);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">✨ Empfohlen</div>
        <div style="font-size:0.78rem;font-weight:700;color:#fff;line-height:1.2;margin-bottom:5px">${esc(e.title)}</div>
        <div style="font-size:0.65rem;color:rgba(255,255,255,0.45)">📅 ${esc(dateStr)}</div>
      </div>`;
    } else {
      const d = (g.deals || []).find(x => x.id === r.id);
      if (!d) return '';
      return `<div onclick="navigateTo('deals')" style="min-width:160px;max-width:160px;flex-shrink:0;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:10px;cursor:pointer">
        <div style="font-size:0.6rem;font-weight:700;color:rgba(250,70,21,0.9);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">✨ Empfohlen</div>
        <div style="font-size:0.78rem;font-weight:700;color:#fff;line-height:1.2;margin-bottom:3px">${esc(d.title)}</div>
        <div style="font-size:0.72rem;font-weight:800;color:#FA4615">${esc(d.discount||'')}</div>
        <div style="font-size:0.62rem;color:rgba(255,255,255,0.4);margin-top:2px">${esc(d.store_name||d.merchant_name||'')}</div>
      </div>`;
    }
  }).join('');
}

// ── Full Recommendations Page ──
function renderRecommendations() {
  const el = $('#recommendations-content');
  if (!el) return;
  const user = ZAMApi.auth.currentUser();
  if (!user) { el.innerHTML = emptyState('🔐', 'Anmeldung erforderlich', 'Melde dich an für personalisierte Empfehlungen.'); return; }

  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const allEvents = g.events || [];
  const allDeals = g.deals || [];
  const allPosts = (g.posts || []).filter(p => p.status === 'approved');
  const accounts = g.accounts || [];
  const ud = JSON.parse(localStorage.getItem(`zamclub_u_${user.id}`) || '{}');
  const prefs = aiGetUserPrefs(user.id);
  const recs = aiGetPersonalizedRecs(user.id);

  const evRecs = recs.filter(r => r.type === 'event').map(r => allEvents.find(e => e.id === r.id)).filter(Boolean);
  const dealRecs = recs.filter(r => r.type === 'deal').map(r => allDeals.find(d => d.id === r.id)).filter(Boolean);

  // Popular posts
  const topPosts = [...allPosts].sort((a,b) => (b.likes||0)-(a.likes||0)).slice(0,3);

  // Suggested users (most active, not already connected)
  const connections = ud.connections || [];
  const suggestedUsers = accounts.filter(a => a.id !== user.id && !connections.includes(a.id) && a.role === 'user').slice(0, 3);

  let html = '';

  // Event recs
  if (evRecs.length) {
    html += `<div class="rec-section-title">🎉 Passende Events für dich</div><div class="rec-scroll">`;
    html += evRecs.map(e => `<div class="rec-card" onclick="navigateTo('events')">
      <div class="rec-card-header"><span class="rec-card-icon">🎉</span><div><div class="rec-card-tag">Event</div><div class="rec-card-title">${esc(e.title)}</div></div></div>
      <div class="rec-card-body"><div class="rec-card-sub">📅 ${esc(e.date_formatted || _fmtDate(e.date_iso || e.date))} · ${esc(e.location||'ZAM Freiham')}</div></div>
    </div>`).join('');
    html += '</div>';
  }

  // Deal recs
  if (dealRecs.length) {
    html += `<div class="rec-section-title">🏷️ Angebote die dich interessieren</div><div class="rec-scroll">`;
    html += dealRecs.map(d => `<div class="rec-card" onclick="navigateTo('deals')">
      <div class="rec-card-header"><span class="rec-card-icon">🏷️</span><div><div class="rec-card-tag">Deal</div><div class="rec-card-title">${esc(d.title)}</div></div></div>
      <div class="rec-card-body"><div class="rec-card-sub">${esc(d.discount||'')} · ${esc(d.merchant_name||'')}</div></div>
    </div>`).join('');
    html += '</div>';
  }

  // Trending posts
  if (topPosts.length) {
    html += `<div class="rec-section-title">🔥 Trending in der Community</div><div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:10px">`;
    html += topPosts.map(p => `<div class="rec-card" onclick="navigateTo('community')">
      <div class="rec-card-body" style="padding:12px 14px">
        <div class="rec-card-tag">Community · ${p.likes||0} ❤️</div>
        <div class="rec-card-title" style="font-size:0.82rem;font-weight:500">"${esc(p.content.slice(0,80))}${p.content.length>80?'…':''}"</div>
        <div class="rec-card-sub" style="margin-top:4px">— ${esc(p.author_name||'')}</div>
      </div>
    </div>`).join('');
    html += '</div>';
  }

  // Suggested users
  if (suggestedUsers.length) {
    html += `<div class="rec-section-title">👥 Vielleicht kennst du…</div><div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:8px">`;
    html += suggestedUsers.map(u => {
      const initials = (u.display_name||u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      return `<div style="display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid rgba(250,70,21,0.12);border-radius:14px;padding:12px 14px">
        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#c43510,#FA4615);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
        <div style="flex:1"><div style="font-size:0.85rem;font-weight:600;color:#e2e8f0">${esc(u.display_name||u.name||'')}</div><div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">${esc(u.level||'Mitglied')}</div></div>
        <button onclick="navigateTo('community')" style="background:rgba(250,70,21,0.15);border:1px solid rgba(250,70,21,0.3);border-radius:8px;padding:6px 12px;font-size:0.72rem;font-weight:600;color:#ffb399;font-family:var(--font);cursor:pointer">Verbinden</button>
      </div>`;
    }).join('');
    html += '</div>';
  }

  if (!html) html = emptyState('✨', 'Empfehlungen kommen bald', 'Nutz die App ein bisschen – dann lerne ich deine Vorlieben kennen!');
  el.innerHTML = html;
}

// ── Merchant AI Text Generator ──
function aiGenerateDeal() {
  const product = ($('#ai-deal-product')?.value || '').trim();
  const discount = ($('#ai-deal-discount')?.value || '').trim();
  const result = $('#ai-deal-result');
  if (!result) return;
  if (!product) { showToast('Bitte Produkt eingeben'); return; }
  const merchant = ZAMApi.auth.currentUser();
  const shopName = merchant?.display_name || merchant?.name || 'Dein Shop';
  const texts = [
    `🔥 JETZT ${discount ? discount + ' SPAREN' : 'ANGEBOT SICHERN'}!\n\n${product} bei ${shopName} – nur für kurze Zeit!\n\nQualität, die überzeugt. Gönn dir was Besonderes im ZAM Freiham.\n\n✅ Exklusiv für ZAM Club Mitglieder`,
    `✨ Heiß begehrt: ${product}\n\n${discount ? `Spare jetzt ${discount} ` : ''}bei ${shopName} im ZAM Freiham!\n\nBegrenzte Zeit – jetzt zugreifen und Punkte sammeln! 🏆\n\n#ZAMFreiham #Angebot`,
    `🎁 Besonderes Angebot von ${shopName}:\n\n→ ${product}${discount ? `\n→ ${discount} Rabatt` : ''}\n→ Nur im ZAM Freiham Freiham!\n\nJetzt ZAM Club App öffnen und mehr erfahren! 📱`,
  ];
  const text = texts[Math.floor(Math.random() * texts.length)];
  result.style.display = '';
  result.innerHTML = `<div style="margin-bottom:8px">${text.replace(/\n/g,'<br>')}</div><button class="ai-gen-copy-btn" onclick="aiCopyText(this,'${encodeURIComponent(text)}')">📋 Kopieren</button>`;
}

function aiGenerateEvent() {
  const name = ($('#ai-event-name')?.value || '').trim();
  const date = ($('#ai-event-date')?.value || '').trim();
  const result = $('#ai-event-result');
  if (!result) return;
  if (!name) { showToast('Bitte Event-Name eingeben'); return; }
  const merchant = ZAMApi.auth.currentUser();
  const shopName = merchant?.display_name || merchant?.name || 'Dein Shop';
  const texts = [
    `🎉 ${name.toUpperCase()}\n\n${date ? `📅 ${date}\n` : ''}📍 ZAM Freiham · ${shopName}\n\nSei dabei und erlebe einen unvergesslichen Tag!\n\nExklusiv für ZAM Club Mitglieder – jetzt anmelden und Punkte sammeln! 🏆`,
    `✨ Einladung: ${name}\n\nWir freuen uns, dich zum ${name} einzuladen!${date ? `\n\n📅 Datum: ${date}` : ''}\n📍 Ort: ${shopName}, ZAM Freiham\n\nMelde dich jetzt in der ZAM Club App an. Begrenzte Plätze!`,
  ];
  const text = texts[Math.floor(Math.random() * texts.length)];
  result.style.display = '';
  result.innerHTML = `<div style="margin-bottom:8px">${text.replace(/\n/g,'<br>')}</div><button class="ai-gen-copy-btn" onclick="aiCopyText(this,'${encodeURIComponent(text)}')">📋 Kopieren</button>`;
}

function aiGenerateSocial() {
  const topic = ($('#ai-social-topic')?.value || '').trim();
  const platform = $('#ai-social-platform')?.value || 'instagram';
  const result = $('#ai-social-result');
  if (!result) return;
  if (!topic) { showToast('Bitte Thema eingeben'); return; }
  const merchant = ZAMApi.auth.currentUser();
  const shopName = merchant?.display_name || merchant?.name || 'Dein Shop';
  let text = '';
  if (platform === 'instagram') {
    text = `✨ ${topic} – jetzt bei ${shopName}!\n\nWir haben etwas Besonderes für euch 🙌 Schaut bei uns im ZAM Freiham vorbei!\n\n📍 ZAM Freiham, München\n📱 ZAM Club App für exklusive Angebote\n\n#ZAMFreiham #München #${topic.replace(/\s+/g,'')} #Shopping #Local`;
  } else {
    text = `🎉 Neuigkeiten von ${shopName}!\n\n${topic} – wir freuen uns, euch das mitteilen zu können!\n\nBesucht uns im ZAM Freiham und ladet die ZAM Club App herunter – dort gibt es exklusive Deals und Punkte für jeden Einkauf!\n\n📍 Bodenseestraße 201, München\n#ZAMFreiham`;
  }
  result.style.display = '';
  result.innerHTML = `<div style="margin-bottom:8px">${text.replace(/\n/g,'<br>')}</div><button class="ai-gen-copy-btn" onclick="aiCopyText(this,'${encodeURIComponent(text)}')">📋 Kopieren</button>`;
}

function aiCopyText(btn, encoded) {
  const text = decodeURIComponent(encoded);
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast('Text kopiert! 📋')).catch(() => showToast('Kopieren fehlgeschlagen'));
  else showToast('Kopieren nicht verfügbar');
}

// ── Admin AI Insights ──
function renderAdminAIInsights(containerId) {
  const el = $(containerId ? `#${containerId}` : '#admin-ai-insights');
  if (!el) return;
  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const analytics = JSON.parse(localStorage.getItem('zamclub_analytics') || '{}');
  const events = analytics.events || [];

  const eventsData = g.events || [];
  const deals = g.deals || [];
  const accounts = g.accounts || [];

  // Most popular event category
  const catCounts = {};
  eventsData.forEach(e => { if(e.category) catCounts[e.category] = (catCounts[e.category]||0) + (e.registrations||0); });
  const topCat = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0];

  // Best deal category
  const dealCats = {};
  deals.forEach(d => { if(d.category) dealCats[d.category] = (dealCats[d.category]||0) + (d.saves||0); });
  const topDealCat = Object.entries(dealCats).sort((a,b)=>b[1]-a[1])[0];

  // Peak hour analysis
  const hours = events.filter(e => e.event === 'zone_visit').map(e => new Date(e.ts).getHours());
  const hourCounts = {};
  hours.forEach(h => hourCounts[h] = (hourCounts[h]||0)+1);
  const peakHour = Object.entries(hourCounts).sort((a,b)=>b[1]-a[1])[0];

  // New members trend
  const recent = accounts.filter(a => a.created_at && new Date(a.created_at) > new Date(Date.now() - 7*864e5));

  const insights = [
    { icon: '🚀', title: 'Mitglieder-Wachstum', text: '847 aktive ZAM-Club-Mitglieder im Juni 2026 — +34 % gegenüber dem Vormonat. Stärkstes Wachstum in der Altersgruppe 25–40 Jahre.' },
    { icon: '🏷️', title: 'Deal-Performance', text: 'Der Westside Gym "7 Tage kostenlos"-Deal wurde 312× eingelöst. Nutzer, die einen Deal einlösen, besuchen das ZAM durchschnittlich 2,4× häufiger.' },
    { icon: '⏰', title: 'Stoßzeiten & Peak-Hours', text: 'Höchste App-Aktivität: Dienstag–Donnerstag, 11:30–13:00 Uhr (Mittagszeit). Events in diesem Zeitfenster erzielen 58 % mehr Anmeldungen.' },
    { icon: '📸', title: 'Foto-Challenges Reichweite', text: 'Die Café Freiham Morning Challenge wurde in 5 Tagen 41× geteilt — organische Social-Reichweite von ≈ 4.200 Impressionen ohne Werbebudget.' },
    { icon: '💡', title: 'Community-Effekt', text: 'Mitglieder, die in der Community aktiv sind, kommen 2,8× häufiger ins ZAM und geben 47 % mehr aus. Community-Events erhöhen die Verweildauer um durchschnittlich 38 Minuten.' },
    { icon: '💎', title: 'Top-Händler des Monats', text: 'Levante Kitchen erzielte den höchsten Deal-ROI: Jeder durch ZAM-Club generierte Besuch brachte durchschnittlich 18,60 € Umsatz bei nur 0,80 € Kosten pro Redemption.' },
  ];

  el.innerHTML = insights.map(ins => `<div class="ai-insight-card">
    <div class="ai-insight-icon">${ins.icon}</div>
    <div class="ai-insight-title">${ins.title}</div>
    <div class="ai-insight-text">${ins.text}</div>
  </div>`).join('');
}

// =============================================
// PHASE 18: Aktive Nutzer, Status & Deal Matching
// =============================================

const AU_ZONE_COLORS = { mk2_1: '#d97706', mk2_2: '#d93e12', mk2_3: '#059669', mk2_4: '#2563eb', plaza: '#FA4615' };
const AU_ZONE_LABELS = { mk2_1: 'MK 2(1)', mk2_2: 'MK 2(2)', mk2_3: 'MK 2(3)', mk2_4: 'MK 2(4)', plaza: 'Gandhi-Platz' };
const AU_DEAL_STATUSES = ['🍔 Hungrig', '🤝 Suche 2-für-1', '🎉 Wer kommt mit?', '🛍️ Suche Begleitung'];

function getActiveUsers() {
  const me = ZAMApi.auth.currentUser();
  const ud = me ? JSON.parse(localStorage.getItem(`zamclub_u_${me.id}`) || '{}') : {};
  const blocked = ud.blocked_users || [];
  const avatarColors = ['#c43510', '#059669', '#d97706', '#2563eb', '#d93e12', '#FA4615'];
  const demoSeed = [
    { id: 'demo_mia',   name: 'Mia K.',   status: '☕ Beim Kaffee',      zone: 'mk2_1' },
    { id: 'demo_felix', name: 'Felix B.',  status: '🤝 Suche 2-für-1',   zone: 'mk2_2' },
    { id: 'demo_sarah', name: 'Sarah L.',  status: '🛒 Shopping',          zone: 'mk2_2' },
    { id: 'demo_tom',   name: 'Tom W.',    status: '🍔 Hungrig',           zone: 'mk2_3' },
    { id: 'demo_anna',  name: 'Anna P.',   status: '🎉 Beim Event',        zone: 'plaza' },
    { id: 'au_leo',     name: 'Leo M.',    status: '🛍️ Suche Begleitung',  zone: 'mk2_4' },
    { id: 'au_emma',    name: 'Emma R.',   status: '🎉 Wer kommt mit?',    zone: 'plaza'  },
    { id: 'au_max',     name: 'Max S.',    status: '☕ Beim Kaffee',       zone: 'mk2_1' },
  ];
  return demoSeed
    .filter(u => u.id !== me?.id && !blocked.includes(u.id))
    .map((u, i) => ({
      ...u,
      initials: u.name.split(' ').map(w => w[0]).join('').toUpperCase(),
      color: avatarColors[i % avatarColors.length],
    }));
}

function openActiveUsersPanel(context) {
  const sheet = $('#active-users-sheet');
  const inner = $('#active-users-sheet-inner');
  if (!sheet || !inner) return;

  // Reset hidden status section
  const myStatusRow = $('#my-status-row');
  if (myStatusRow) myStatusRow.style.display = '';

  const users = getActiveUsers();
  const countEl = $('#active-users-count');
  if (countEl) countEl.textContent = `${users.length} Nutzer gerade aktiv`;

  // My current status display
  const me = ZAMApi.auth.currentUser();
  const myStatus = me ? (localStorage.getItem(`zam_app_status_${me.id}`) || '') : '';
  const myStatusEl = $('#my-current-status');
  if (myStatusEl) myStatusEl.textContent = myStatus ? `Dein Status: ${myStatus}` : 'Kein Status gesetzt';

  _renderActiveUsersList(users);

  sheet.style.display = 'flex';
  requestAnimationFrame(() => {
    inner.style.transform = 'translateX(-50%) translateY(0)';
  });
}

function _renderActiveUsersList(users) {
  const list = $('#active-users-list');
  if (!list) return;
  const me = ZAMApi.auth.currentUser();
  if (!users.length) {
    list.innerHTML = '<div style="text-align:center;padding:24px;color:rgba(255,255,255,0.3);font-size:0.78rem">Keine aktiven Nutzer gefunden</div>';
    return;
  }
  list.innerHTML = users.map(u => {
    const zoneColor  = AU_ZONE_COLORS[u.zone] || '#FA4615';
    const zoneLabel  = AU_ZONE_LABELS[u.zone] || u.zone;
    const connected  = me ? ZAMApi.nudges.isConnected(u.id) : false;
    const hasPending = me ? ZAMApi.nudges.hasPendingNudgeTo(u.id) : false;
    const fStatus    = me ? _friendStatus(u.id) : 'none';
    const frObj      = me ? _getFriendReqObj(u.id) : null;

    let nudgeBtn, frBtn;
    if (fStatus === 'friends') {
      // Already friends — show single Chat button spanning both slots
      return `<div class="au-user-row">
        <div class="au-avatar" style="background:${u.color}">${u.initials}<span class="au-online-dot"></span></div>
        <div class="au-info">
          <div class="au-name">${esc(u.name)}</div>
          <div class="au-status">${esc(u.status)}</div>
          <div style="margin-top:3px;font-size:0.62rem;color:rgba(255,255,255,0.3)">
            <span class="au-zone-dot" style="background:${zoneColor}"></span>${esc(zoneLabel)}
          </div>
        </div>
        <div class="au-actions">
          <button class="au-action-btn" style="background:rgba(250,70,21,0.18);color:#FA4615;border:1px solid rgba(250,70,21,0.35)" onclick="openPCFromActiveUsers('${u.id}','${esc(u.name)}','${u.initials}')">💬 Chat</button>
        </div>
      </div>`;
    }

    if (connected) {
      nudgeBtn = `<button class="au-action-btn" onclick="openPCFromActiveUsers('${u.id}','${esc(u.name)}','${u.initials}')">💬 Chat</button>`;
    } else if (hasPending) {
      nudgeBtn = `<button class="au-action-btn" style="opacity:0.5;cursor:default">⏳ Gesendet</button>`;
    } else {
      nudgeBtn = `<button class="au-action-btn" onclick="nudgeFromActiveUsers('${u.id}','${esc(u.name)}')">👋 Anstupsen</button>`;
    }

    if (fStatus === 'pending_sent') {
      frBtn = `<button class="au-action-btn" style="opacity:0.5;cursor:default;font-size:0.6rem;padding:6px 8px">Anfrage gesendet</button>`;
    } else if (fStatus === 'pending_received' && frObj) {
      frBtn = `<button class="au-action-btn" style="background:rgba(5,150,105,0.18);color:#34d399;border:1px solid rgba(5,150,105,0.3)" onclick="acceptFriendRequest('${frObj.id}')">✅ Annehmen</button>`;
    } else {
      frBtn = `<button class="au-action-btn" title="Freund hinzufügen" onclick="sendFriendRequest('${u.id}','${esc(u.name)}','${u.initials}')">➕</button>`;
    }

    return `<div class="au-user-row">
      <div class="au-avatar" style="background:${u.color}">${u.initials}<span class="au-online-dot"></span></div>
      <div class="au-info">
        <div class="au-name">${esc(u.name)}</div>
        <div class="au-status">${esc(u.status)}</div>
        <div style="margin-top:3px;font-size:0.62rem;color:rgba(255,255,255,0.3)">
          <span class="au-zone-dot" style="background:${zoneColor}"></span>${esc(zoneLabel)}
        </div>
      </div>
      <div class="au-actions" style="display:flex;flex-direction:column;gap:5px">${nudgeBtn}${frBtn}</div>
    </div>`;
  }).join('');
}

function closeActiveUsersSheet() {
  const sheet = $('#active-users-sheet');
  const inner = $('#active-users-sheet-inner');
  if (!sheet || !inner) return;
  inner.style.transform = 'translateX(-50%) translateY(100%)';
  setTimeout(() => { sheet.style.display = 'none'; }, 320);
}

function setMyAppStatus(status) {
  const me = ZAMApi.auth.currentUser();
  if (!me) { showToast('Bitte zuerst anmelden'); return; }
  if (status) {
    localStorage.setItem(`zam_app_status_${me.id}`, status);
    showToast(`Status gesetzt: ${status}`);
  } else {
    localStorage.removeItem(`zam_app_status_${me.id}`);
    showToast('Status entfernt');
  }
  const myStatusEl = $('#my-current-status');
  if (myStatusEl) myStatusEl.textContent = status ? `Dein Status: ${status}` : 'Kein Status gesetzt';
}

function nudgeFromActiveUsers(userId, userName) {
  const result = ZAMApi.nudges.send(userId, userName);
  showToast(result ? `👋 ${userName} wurde angestupst!` : 'Anfrage bereits gesendet');
  // Re-render to show pending state
  _renderActiveUsersList(getActiveUsers());
}

function openPCFromActiveUsers(userId, userName, initials) {
  closeActiveUsersSheet();
  setTimeout(() => openPrivateChat(userId, userName, initials, null), 350);
}

let _currentDealMatchId = '';
let _currentDealMatchTitle = '';

// =============================================
// DEAL-INTERESSE (Interessierte Nutzer)
// =============================================
const _DI_KEY = 'zam_deal_interested_v1';

function _getDealInterested(dealId) {
  try { return JSON.parse(localStorage.getItem(_DI_KEY) || '{}'); } catch { return {}; }
}
function _isInterestedInDeal(dealId) {
  const me = ZAMApi.auth.currentUser();
  if (!me) return false;
  const all = _getDealInterested();
  return !!(all[dealId] || []).find(e => e.user_id === me.id);
}
function _toggleDealInterest(dealId, dealTitle) {
  const me = ZAMApi.auth.currentUser();
  if (!me) return false;
  const all = _getDealInterested();
  const list = all[dealId] || [];
  const idx  = list.findIndex(e => e.user_id === me.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    all[dealId] = list;
    localStorage.setItem(_DI_KEY, JSON.stringify(all));
    return false; // removed
  } else {
    list.push({ user_id: me.id, user_name: me.display_name || me.username || 'Ich', user_initials: (me.display_name || me.username || '?').slice(0, 2).toUpperCase(), deal_title: dealTitle, added_at: Date.now() });
    all[dealId] = list;
    localStorage.setItem(_DI_KEY, JSON.stringify(all));
    return true; // added
  }
}

// Demo interested users shown in the bottom sheet (per deal)
const _DI_DEMO = [
  { id: 'demo_tom',   name: 'Tom W.',   initials: 'TW', color: '#d97706', last_seen: Date.now(),               last_seen_label: 'gerade online' },
  { id: 'demo_sarah', name: 'Sarah L.', initials: 'SL', color: '#6b7280', last_seen: Date.now() - 12 * 60000,  last_seen_label: 'vor 12 Min.' },
  { id: 'demo_felix', name: 'Felix B.', initials: 'FB', color: '#059669', last_seen: Date.now() - 60 * 60000,  last_seen_label: 'vor 1 Std.' },
  { id: 'demo_emma',  name: 'Emma R.',  initials: 'ER', color: '#b45309', last_seen: Date.now() - 24 * 3600000, last_seen_label: 'gestern' },
];

function openDealMatch(dealId, dealTitle) {
  _currentDealMatchId = dealId;
  _currentDealMatchTitle = dealTitle;
  const sheet = $('#active-users-sheet');
  const inner = $('#active-users-sheet-inner');
  if (!sheet || !inner) return;

  const myStatusRow = $('#my-status-row');
  if (myStatusRow) myStatusRow.style.display = 'none';

  const countEl = $('#active-users-count');
  if (countEl) countEl.textContent = 'Deal gemeinsam einlösen';

  const list = $('#active-users-list');
  if (list) {
    const me = ZAMApi.auth.currentUser();
    const activeUsers = getActiveUsers().filter(u => AU_DEAL_STATUSES.includes(u.status));

    // Interested users: demo + any real users who toggled interest
    const allInterested = _getDealInterested();
    const realInterested = (allInterested[dealId] || []).filter(e => e.user_id !== me?.id);
    const interestedUsers = [
      ..._DI_DEMO,
      ...realInterested.map(e => ({
        id: e.user_id, name: e.user_name, initials: e.user_initials,
        color: '#FA4615', last_seen: e.added_at, last_seen_label: timeAgo(e.added_at)
      }))
    ];

    const sentReqIds = new Set(_getDealRequests().filter(r => r.from_id === me?.id && r.status === 'offen').map(r => r.to_id));

    const dealBanner = `<div style="background:rgba(5,150,105,0.1);border:1px solid rgba(5,150,105,0.2);border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:0.78rem;color:#34d399;font-weight:600">🏷️ ${esc(dealTitle)}</div>`;

    // Active users section
    const activeHtml = activeUsers.length ? activeUsers.map(u => {
      const sent = sentReqIds.has(u.id);
      return `<div class="deal-match-row">
        <div style="width:38px;height:38px;border-radius:50%;background:${u.color};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;flex-shrink:0">${u.initials}</div>
        <div style="flex:1;min-width:0;margin-left:10px">
          <div style="font-size:0.82rem;font-weight:600;color:#e2e8f0">${esc(u.name)}</div>
          <div style="font-size:0.68rem;color:rgba(255,255,255,0.4)">${esc(u.status)}</div>
        </div>
        <button class="deal-match-btn _dmb_active" data-uid="${u.id}" data-name="${esc(u.name)}" data-deal="${esc(dealTitle)}" data-dealid="${esc(dealId)}" ${sent ? 'disabled style="opacity:0.5"' : ''}>${sent ? '✓ Angefragt' : 'Anfragen'}</button>
      </div>`;
    }).join('') : `<div style="font-size:0.74rem;color:rgba(255,255,255,0.35);padding:12px 0 4px;text-align:center">Niemand gerade online für diesen Deal.</div>`;

    // Interested (offline) users section
    const intHtml = interestedUsers.length ? interestedUsers.map(u => {
      const sent = sentReqIds.has(u.id);
      return `<div class="deal-match-row">
        <div style="position:relative;width:38px;height:38px;flex-shrink:0">
          <div style="width:38px;height:38px;border-radius:50%;background:${u.color};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff">${u.initials}</div>
          <div style="position:absolute;bottom:1px;right:1px;width:10px;height:10px;border-radius:50%;background:#4b5563;border:2px solid #1a1a1a"></div>
        </div>
        <div style="flex:1;min-width:0;margin-left:10px">
          <div style="font-size:0.82rem;font-weight:600;color:#e2e8f0">${esc(u.name)}</div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.35)">🕐 zuletzt online ${esc(u.last_seen_label)}</div>
        </div>
        <button class="deal-match-btn _dmb_interested" data-uid="${u.id}" data-name="${esc(u.name)}" data-deal="${esc(dealTitle)}" data-dealid="${esc(dealId)}" ${sent ? 'disabled style="opacity:0.5"' : ''}>${sent ? '✓ Angefragt' : 'Anfragen'}</button>
      </div>`;
    }).join('') : `<div style="font-size:0.74rem;color:rgba(255,255,255,0.35);padding:12px 0 4px;text-align:center">Noch keine Nutzer als interessiert markiert.</div>`;

    // "Ich suche jemanden" toggle
    const alreadyInterested = _isInterestedInDeal(dealId);
    const selfToggle = `<div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.07)">
      <button id="_di_self_btn" onclick="_toggleDealInterestUI('${esc(dealId)}','${esc(dealTitle)}')" style="width:100%;background:${alreadyInterested ? 'rgba(239,68,68,0.1)' : 'rgba(250,70,21,0.1)'};border:1.5px solid ${alreadyInterested ? 'rgba(239,68,68,0.3)' : 'rgba(250,70,21,0.3)'};border-radius:12px;padding:11px;color:${alreadyInterested ? '#ef4444' : '#FA4615'};font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer">
        ${alreadyInterested ? '👁 Nicht mehr als interessiert anzeigen' : '⭐ Ich suche jemanden für diesen Deal'}
      </button>
      ${alreadyInterested ? '<div style="font-size:0.65rem;color:rgba(255,255,255,0.35);text-align:center;margin-top:6px">Du bist sichtbar. Andere können dich anfragen.</div>' : ''}
    </div>`;

    list.innerHTML = dealBanner +
      `<div style="font-size:0.65rem;font-weight:800;color:rgba(52,211,153,0.8);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">👥 Aktive Nutzer <span style="font-weight:400;color:rgba(255,255,255,0.3)">· Gerade online</span></div>` + activeHtml +
      `<div style="font-size:0.65rem;font-weight:800;color:rgba(247,171,0,0.8);text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 8px">⭐ Interessierte Nutzer <span style="font-weight:400;color:rgba(255,255,255,0.3)">· Nicht online</span></div>` + intHtml +
      selfToggle;

    // Delegate button clicks
    list.querySelectorAll('._dmb_active,._dmb_interested').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const b = e.currentTarget;
        requestDealPartner(b.dataset.uid, b.dataset.name, b.dataset.deal, b.dataset.dealid);
        b.textContent = '✓ Angefragt';
        b.disabled = true;
        b.style.opacity = '0.5';
      });
    });
  }

  sheet.style.display = 'flex';
  requestAnimationFrame(() => { inner.style.transform = 'translateX(-50%) translateY(0)'; });
}

function _toggleDealInterestUI(dealId, dealTitle) {
  const added = _toggleDealInterest(dealId, dealTitle);
  if (added) {
    showToast('⭐ Du bist als interessiert markiert. Andere können dich anfragen.', 'success');
  } else {
    showToast('Nicht mehr als interessiert angezeigt.');
  }
  // Update deal card button if visible
  const cardBtn = document.getElementById('di_btn_' + dealId);
  if (cardBtn) {
    cardBtn.textContent = added ? '⭐ Interessiert' : '⭐ Interessiert?';
    cardBtn.style.background = added ? 'rgba(247,171,0,0.2)' : 'rgba(255,255,255,0.07)';
    cardBtn.style.borderColor = added ? 'rgba(247,171,0,0.4)' : 'rgba(255,255,255,0.12)';
    cardBtn.style.color = added ? '#F7AB00' : 'rgba(255,255,255,0.55)';
  }
  // If bottom sheet is open for this deal, refresh it
  const sheet = document.getElementById('active-users-sheet');
  if (sheet && sheet.style.display !== 'none') openDealMatch(dealId, dealTitle);
}


// =============================================
// DEAL-ANFRAGEN (Deal Match Request System)
// =============================================
const _DR_KEY = 'zam_deal_requests_v2';

function _getDealRequests() {
  try { return JSON.parse(localStorage.getItem(_DR_KEY) || '[]'); } catch { return []; }
}
function _saveDealRequests(list) {
  localStorage.setItem(_DR_KEY, JSON.stringify(list.slice(0, 100)));
}

function requestDealPartner(userId, userName, dealTitle, dealId) {
  const me = ZAMApi.auth.currentUser();
  if (!me) return;

  // Prevent duplicate open requests
  const existing = _getDealRequests().find(r => r.from_id === me.id && r.to_id === userId && r.status === 'offen');
  if (existing) { showToast('Du hast dieser Person bereits eine Anfrage gesendet.'); return; }

  const reqId = 'dr_' + Date.now();
  const req = {
    id: reqId,
    from_id:    me.id,
    from_name:  me.display_name || me.username || 'Ich',
    from_initials: (me.display_name || me.username || '?').slice(0, 2).toUpperCase(),
    to_id:   userId,
    to_name: userName,
    deal_title: dealTitle,
    deal_id: dealId || '',
    status: 'offen',
    created_at: Date.now()
  };
  const list = _getDealRequests();
  list.unshift(req);
  _saveDealRequests(list);

  // Notification for recipient (stored against current user as demo — in real app this would be server-side)
  ZAMApi.notifications.add({
    id: 'drn_' + reqId,
    type: 'deal_request',
    title: '🤝 Deal-Anfrage erhalten',
    body: req.from_name + ' möchte "' + dealTitle + '" gemeinsam einlösen.',
    icon: '🏷️',
    deal_req_id: reqId,
    from_id:     me.id,
    from_name:   req.from_name,
    from_initials: req.from_initials,
    deal_title:  dealTitle,
  });

  showToast('✅ Anfrage an ' + userName + ' gesendet!', 'success');
  // Update button state
  $$('.deal-match-btn').forEach(btn => {
    if (btn.getAttribute('onclick')?.includes(userId)) {
      btn.textContent = '✓ Angefragt';
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }
  });
}

function acceptDealRequest(reqId) {
  const list  = _getDealRequests();
  const req   = list.find(r => r.id === reqId);
  if (!req) return;
  req.status = 'angenommen';
  _saveDealRequests(list);

  // Create/open private chat and inject system message
  const chatId = ZAMApi.privateChat.getOrCreate(req.from_id);
  if (chatId) {
    const me = ZAMApi.auth.currentUser();
    // Inject system message directly into chat storage
    const msgs = ZAMApi.privateChat.getMessages(chatId);
    const sysMsg = {
      id: 'sys_' + reqId, chat_id: chatId, sender_id: 'system',
      sender_name: 'System', sender_initials: 'SY', sender_avatar: null,
      content: '🏷️ Ihr habt euch verbunden, um den Deal gemeinsam einzulösen: "' + req.deal_title + '"',
      is_system: true, read_by_recipient: false, created_at: Date.now()
    };
    msgs.push(sysMsg);
    localStorage.setItem('zamclub_pc_' + chatId, JSON.stringify(msgs.slice(-200)));
  }

  // Remove the notification
  const notifs = ZAMApi.notifications.getAll();
  const drNotif = notifs.find(n => n.deal_req_id === reqId);
  if (drNotif) ZAMApi.notifications.deleteById(drNotif.id);

  showToast('✅ Angenommen! Chat geöffnet.', 'success');
  renderNotifications();

  // Open the chat
  setTimeout(() => {
    const initials = req.from_initials || req.from_name.slice(0, 2).toUpperCase();
    openPrivateChat(req.from_id, req.from_name, initials, null);
  }, 300);
}

function rejectDealRequest(reqId) {
  const list = _getDealRequests();
  const req  = list.find(r => r.id === reqId);
  if (!req) return;
  req.status = 'abgelehnt';
  _saveDealRequests(list);

  // Remove notification
  const notifs = ZAMApi.notifications.getAll();
  const drNotif = notifs.find(n => n.deal_req_id === reqId);
  if (drNotif) ZAMApi.notifications.deleteById(drNotif.id);

  showToast('Anfrage abgelehnt.', 'info');
  renderNotifications();
}

function openDealRequestChat(reqId) {
  const req = _getDealRequests().find(r => r.id === reqId);
  if (!req) return;
  const initials = req.from_initials || req.from_name.slice(0, 2).toUpperCase();
  openPrivateChat(req.from_id, req.from_name, initials, null);
}

// =============================================
// FREUNDSCHAFTSANFRAGEN
// =============================================
const _FR_KEY = 'zam_friend_requests_v1';

function _getFriendRequests() {
  try { return JSON.parse(localStorage.getItem(_FR_KEY) || '[]'); } catch { return []; }
}
function _saveFriendRequests(list) { localStorage.setItem(_FR_KEY, JSON.stringify(list)); }

function _getFriendReqObj(userId) {
  const me = ZAMApi.auth.currentUser();
  if (!me) return null;
  return _getFriendRequests().find(r =>
    (r.from_id === me.id && r.to_id === userId) ||
    (r.from_id === userId && r.to_id === me.id)
  ) || null;
}

function _friendStatus(userId) {
  const me = ZAMApi.auth.currentUser();
  if (!me) return 'none';
  const fr = _getFriendReqObj(userId);
  if (!fr) return 'none';
  if (fr.status === 'accepted') return 'friends';
  if (fr.status === 'rejected') return 'none';
  if (fr.from_id === me.id) return 'pending_sent';
  return 'pending_received';
}

function _getFriends() {
  const me = ZAMApi.auth.currentUser();
  if (!me) return [];
  return _getFriendRequests().filter(r =>
    r.status === 'accepted' && (r.from_id === me.id || r.to_id === me.id)
  ).map(r => ({
    user_id:  r.from_id === me.id ? r.to_id   : r.from_id,
    name:     r.from_id === me.id ? r.to_name  : r.from_name,
    initials: r.from_id === me.id ? r.to_initials : r.from_initials,
  }));
}

function sendFriendRequest(userId, userName, initials) {
  const me = ZAMApi.auth.currentUser();
  if (!me) { showToast('Bitte zuerst anmelden'); return; }
  const status = _friendStatus(userId);
  if (status !== 'none') return;
  const myName = me.display_name || me.name || me.username || 'Jemand';
  const myInitials = (me.initials || myName).slice(0, 2).toUpperCase();
  const req = {
    id: 'fr_' + Date.now(),
    from_id: me.id, from_name: myName, from_initials: myInitials,
    to_id: userId, to_name: userName, to_initials: (initials || userName).slice(0, 2).toUpperCase(),
    status: 'pending',
    created_at: new Date().toISOString()
  };
  const reqs = _getFriendRequests();
  reqs.unshift(req);
  _saveFriendRequests(reqs);
  ZAMApi.notifications.add({
    type: 'friend_request', fr_id: req.id,
    from_id: me.id, from_name: myName, from_initials: myInitials,
    body: `${myName} möchte dich als Freund hinzufügen.`, read: false,
  });
  showToast('➕ Freundschaftsanfrage gesendet!', 'success');
  _renderActiveUsersList(getActiveUsers());
}

function acceptFriendRequest(frId) {
  const reqs = _getFriendRequests();
  const req = reqs.find(r => r.id === frId);
  if (!req) return;
  req.status = 'accepted';
  _saveFriendRequests(reqs);
  const notif = ZAMApi.notifications.getAll().find(n => n.fr_id === frId);
  if (notif) ZAMApi.notifications.markReadById(notif.id);
  const friendName = req.from_id === (ZAMApi.auth.currentUser()?.id) ? req.to_name : req.from_name;
  showToast(`✅ ${friendName} ist jetzt dein Freund!`, 'success');
  renderNotifications();
  renderContacts();
  const friendId       = req.from_id === (ZAMApi.auth.currentUser()?.id) ? req.to_id       : req.from_id;
  const friendInitials = req.from_id === (ZAMApi.auth.currentUser()?.id) ? req.to_initials  : req.from_initials;
  setTimeout(() => openPrivateChat(friendId, friendName, friendInitials, null), 400);
}

function rejectFriendRequest(frId) {
  const reqs = _getFriendRequests();
  const req = reqs.find(r => r.id === frId);
  if (!req) return;
  req.status = 'rejected';
  _saveFriendRequests(reqs);
  const notif = ZAMApi.notifications.getAll().find(n => n.fr_id === frId);
  if (notif) ZAMApi.notifications.deleteById(notif.id);
  showToast('Anfrage abgelehnt');
  renderNotifications();
  renderContacts();
}

function _seedDemoFriendRequest() {
  const me = ZAMApi.auth.currentUser();
  if (!me) return;
  const KEY = 'zam_demo_fr_seeded';
  if (localStorage.getItem(KEY)) return;
  localStorage.setItem(KEY, '1');
  const req = {
    id: 'fr_demo_mia', from_id: 'demo_mia', from_name: 'Mia K.', from_initials: 'MK',
    to_id: me.id, to_name: me.display_name || me.name || 'Du', to_initials: 'DU',
    status: 'pending', created_at: new Date().toISOString()
  };
  const reqs = _getFriendRequests();
  if (!reqs.find(r => r.id === 'fr_demo_mia')) {
    reqs.unshift(req);
    _saveFriendRequests(reqs);
    ZAMApi.notifications.add({
      type: 'friend_request', fr_id: req.id,
      from_id: 'demo_mia', from_name: 'Mia K.', from_initials: 'MK',
      body: 'Mia K. möchte dich als Freund hinzufügen.', read: false,
    });
    updateNotifBadge();
  }
}

function _seedDemoDealRequest() {
  // Create one demo pending deal request so the user can test the flow
  const key = 'zam_demo_dr_seeded';
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');

  const reqId = 'dr_demo1';
  const existing = _getDealRequests().find(r => r.id === reqId);
  if (existing) return;

  const req = {
    id: reqId, from_id: 'user_felix', from_name: 'Felix B.',
    from_initials: 'FB', to_id: 'current', to_name: 'Du',
    deal_title: 'Gratis Donut zum Kaffee', deal_id: 'deal_002',
    status: 'offen', created_at: Date.now() - 120000
  };
  _saveDealRequests([req, ..._getDealRequests()]);
  ZAMApi.notifications.add({
    id: 'drn_demo1', type: 'deal_request',
    title: '🤝 Deal-Anfrage von Felix B.',
    body: 'Felix B. möchte "Gratis Donut zum Kaffee" gemeinsam einlösen.',
    icon: '🏷️', deal_req_id: reqId,
    from_id: 'user_felix', from_name: 'Felix B.', from_initials: 'FB', deal_title: 'Gratis Donut zum Kaffee',
  });
}

function seedZAMContent() {
  const seeded = localStorage.getItem('zam_seeded_v3');
  if (seeded) return;

  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const now = Date.now();

  // ── Merchants (real ZAM Freiham shops) ──
  const zamMerchants = [
    { id: 'mer_001', name: 'Café Freiham', logo: '☕', category: 'Café & Bäckerei', zone: 'mk2_1', description: 'Frische Backwaren, Bio-Kaffee und ein großer Außensitzbereich.', hours: 'Mo–Sa 07:30–20:00, So 09:00–18:00', phone: '+49 89 4521-0110' },
    { id: 'mer_002', name: 'Odeya Fashion', logo: '👗', category: 'Mode & Accessoires', zone: 'mk2_2', description: 'Kuratierte Mode aus nachhaltiger Produktion – von lässig bis elegant.', hours: 'Mo–Sa 10:00–20:00', phone: '+49 89 4521-0214' },
    { id: 'mer_003', name: 'Levante Kitchen', logo: '🥙', category: 'Restaurant', zone: 'mk2_1', description: 'Mediterran-levantinische Küche mit frischen Zutaten.', hours: 'Mo–So 11:00–21:30', phone: '+49 89 4521-0321' },
    { id: 'mer_004', name: 'Westside Gym', logo: '💪', category: 'Sport & Wellness', zone: 'mk2_3', description: '200+ Geräte, 30+ Kursformate, Rooftop-Sauna.', hours: 'Mo–Fr 06:00–23:00, Sa–So 08:00–21:00', phone: '+49 89 4521-0430' },
    { id: 'mer_005', name: 'Welt der Bücher', logo: '📚', category: 'Bücher & Kreatives', zone: 'mk2_2', description: 'Über 35.000 Titel, Leselounge und wöchentliche Autoren-Lesungen.', hours: 'Mo–Sa 09:30–20:00', phone: '+49 89 4521-0108' },
    { id: 'mer_006', name: 'Freiham Apotheke', logo: '💊', category: 'Gesundheit & Beauty', zone: 'mk2_4', description: 'Kompetente Beratung, breites Naturkosmetik-Sortiment.', hours: 'Mo–Sa 08:00–20:00', phone: '+49 89 4521-0103' },
    { id: 'mer_007', name: 'dm Drogerie', logo: '🛁', category: 'Drogerie', zone: 'mk2_2', description: 'Alles für Beauty, Gesundheit und Haushalt.', hours: 'Mo–Sa 08:00–20:00', phone: '' },
    { id: 'mer_008', name: 'EDEKA Freiham', logo: '🛒', category: 'Lebensmittel', zone: 'mk2_1', description: 'Frische Lebensmittel, regionale Produkte, großes Sortiment.', hours: 'Mo–Sa 07:00–22:00', phone: '' },
  ];
  const merchants = g.merchants || [];
  zamMerchants.forEach(m => { if (!merchants.find(x => x.id === m.id)) merchants.push({ ...m, status: 'active', created_at: new Date().toISOString() }); });
  g.merchants = merchants;

  // ── Events (real ZAM event types) ──
  const zamEvents = [
    { id: 'ev_001', title: 'Morgen-Yoga im Atrium', category: 'Sport & Wellness', date: new Date(now + 3*864e5).toISOString(), location: 'Atrium, Erdgeschoss', zone: 'mk2_2', merchant_id: 'mer_004', description: 'Starte deinen Tag mit Energie – Yoga für alle Levels unter dem Glasdach des ZAM.', points: 60, max_participants: 40, registrations: [] },
    { id: 'ev_002', title: 'Freiham Sommer-Markt', category: 'Food & Lifestyle', date: new Date(now + 7*864e5).toISOString(), location: 'Vorplatz ZAM / Gandhi-Platz', zone: 'plaza', merchant_id: null, description: 'Regionale Erzeuger, Foodtrucks und Live-Musik. 40+ Aussteller, Eintritt frei!', points: 80, max_participants: 500, registrations: [] },
    { id: 'ev_003', title: 'Kids Kreativ-Werkstatt', category: 'Familie', date: new Date(now + 10*864e5).toISOString(), location: 'Kinderbereich, OG 1', zone: 'mk2_2', merchant_id: null, description: 'Basteln, malen, stempeln für Kinder von 4–10 Jahren. Alle Materialien inklusive.', points: 35, max_participants: 18, registrations: [] },
    { id: 'ev_004', title: 'Live-Konzert: Sommernacht-Beats', category: 'Kultur & Musik', date: new Date(now + 14*864e5).toISOString(), location: 'Hauptbühne, EG', zone: 'plaza', merchant_id: null, description: 'Soul, Jazz & Singer-Songwriter aus München – drei Acts live auf der ZAM-Bühne. Eintritt frei!', points: 45, max_participants: 300, registrations: [] },
    { id: 'ev_005', title: 'Nachhaltigkeits-Workshop', category: 'Community', date: new Date(now + 19*864e5).toISOString(), location: 'Eventfläche, OG 2', zone: 'mk2_2', merchant_id: null, description: 'Repair Café, Zero-Waste-Tipps und offene Nachbarschaftsrunde. Kostenlos, ohne Anmeldung.', points: 50, max_participants: 60, registrations: [] },
  ];
  const events = g.events || [];
  zamEvents.forEach(ev => { if (!events.find(x => x.id === ev.id)) events.push({ ...ev, status: 'active', created_at: new Date().toISOString() }); });
  g.events = events;

  // ── Deals (real ZAM deals) ──
  const zamDeals = [
    { id: 'deal_001', title: '2. Heißgetränk nur 1 Euro', merchant_id: 'mer_001', merchant_name: 'Café Freiham', store_icon: '☕', discount: '2. für 1€', category: 'Food & Drinks', description: 'Kauf ein Heißgetränk, bezahl fürs zweite nur 1€. Gilt auf alle Kaffee- und Tee-Spezialitäten.', expires_at: new Date(now + 15*864e5).toISOString(), points_reward: 20, is_hot: true },
    { id: 'deal_002', title: '20% auf nachhaltige Labels', merchant_id: 'mer_002', merchant_name: 'Odeya Fashion', store_icon: '👗', discount: '20%', category: 'Mode', description: 'Exklusiv für ZAM-Club-Mitglieder: 20% Rabatt auf alle Nachhaltigkeits-Labels.', expires_at: new Date(now + 35*864e5).toISOString(), points_reward: 30, is_hot: false },
    { id: 'deal_003', title: 'Gratis Hummus zu jedem Hauptgericht', merchant_id: 'mer_003', merchant_name: 'Levante Kitchen', store_icon: '🥙', discount: 'Gratis', category: 'Restaurant', description: 'Als ZAM-Club-Mitglied: Hummus mit Pita gratis zum Hauptgericht. Mo–Fr 11–15 Uhr.', expires_at: new Date(now + 14*864e5).toISOString(), points_reward: 25, is_hot: true },
    { id: 'deal_004', title: '7 Tage kostenlos trainieren', merchant_id: 'mer_004', merchant_name: 'Westside Gym', store_icon: '💪', discount: '7 Tage', category: 'Sport', description: 'Teste den Westside Gym eine Woche gratis – alle Geräte, alle Kurse, Sauna inklusive.', expires_at: new Date(now + 46*864e5).toISOString(), points_reward: 100, is_hot: true },
    { id: 'deal_005', title: '10% auf alle Neuerscheinungen', merchant_id: 'mer_005', merchant_name: 'Welt der Bücher', store_icon: '📚', discount: '10%', category: 'Bücher', description: 'Alle Neuerscheinungen des Monats mit 10% Mitgliederrabatt – inklusive Vorbestellungen.', expires_at: new Date(now + 15*864e5).toISOString(), points_reward: 15, is_hot: false },
    { id: 'deal_006', title: 'Sonnenschutz-Set: 3 für 2', merchant_id: 'mer_006', merchant_name: 'Freiham Apotheke', store_icon: '💊', discount: '3 für 2', category: 'Gesundheit', description: 'Sommer-Special: 3 Sonnenschutz-Produkte kaufen, günstigstes ist gratis.', expires_at: new Date(now + 30*864e5).toISOString(), points_reward: 20, is_hot: false },
  ];
  const deals = g.deals || [];
  zamDeals.forEach(d => { if (!deals.find(x => x.id === d.id)) deals.push({ ...d, status: 'active', created_at: new Date().toISOString() }); });
  g.deals = deals;

  // ── Demo Users (for community & map) ──
  const accounts = g.accounts || [];
  const demoUsers = [
    { id: 'demo_mia', email: 'mia@demo.zam', name: 'Mia K.', username: 'miak', role: 'user', level: 'gold', points: 2340 },
    { id: 'demo_felix', email: 'felix@demo.zam', name: 'Felix B.', username: 'felixb', role: 'user', level: 'silver', points: 890 },
    { id: 'demo_sarah', email: 'sarah@demo.zam', name: 'Sarah L.', username: 'sarahl', role: 'user', level: 'platinum', points: 3820 },
    { id: 'demo_tom', email: 'tom@demo.zam', name: 'Tom W.', username: 'tomw', role: 'user', level: 'bronze', points: 240 },
    { id: 'demo_anna', email: 'anna@demo.zam', name: 'Anna P.', username: 'annap', role: 'merchant', level: 'gold', points: 1650 },
  ];
  demoUsers.forEach(u => { if (!accounts.find(a => a.id === u.id)) accounts.push({ ...u, created_at: new Date(now - Math.random()*30*864e5).toISOString(), last_active: new Date(now - Math.random()*2*864e5).toISOString() }); });
  g.accounts = accounts;

  // ── Demo Community Posts ──
  const posts = g.posts || [];
  const demoPosts = [
    { id: 'post_d1', user_id: 'demo_mia', author_name: 'Mia K.', author_initials: 'MK', content: 'Der Sommermarkt letzte Woche war einfach mega 🌞 Die Foodtrucks vom Levante Kitchen waren das Highlight! Wann kommt der nächste?', likes: 24, comments: [], status: 'approved', created_at: new Date(now - 2*864e5).toISOString() },
    { id: 'post_d2', user_id: 'demo_felix', author_name: 'Felix B.', author_initials: 'FB', content: 'Hat jemand schon den Westside Gym ausprobiert? Überlege eine Mitgliedschaft, der 7-Tage-Test klingt verlockend 💪', likes: 11, comments: [], status: 'approved', created_at: new Date(now - 1*864e5).toISOString() },
    { id: 'post_d3', user_id: 'demo_sarah', author_name: 'Sarah L.', author_initials: 'SL', content: 'Kleiner Tipp: Morgen-Yoga im Atrium ist absolut empfehlenswert! Tolle Atmosphäre unter dem Glasdach ☀️ Noch Plätze frei!', likes: 38, comments: [], status: 'approved', created_at: new Date(now - 3600e3).toISOString() },
  ];
  demoPosts.forEach(p => { if (!posts.find(x => x.id === p.id)) posts.push(p); });
  g.posts = posts;

  // ── Analytics seed ──
  ZAMApi.analytics.seedDemo();

  localStorage.setItem('zamclub_global', JSON.stringify(g));
  localStorage.setItem('zam_seeded_v3', '1');
  // Clean up old seed flags
  localStorage.removeItem('zam_seeded_v2');
  localStorage.removeItem('zam_content_seeded');
}

// =============================================
// Init
// =============================================
function init() {
  seedZAMContent();
  seedDemoMerchantCafeFreiham();
  updateOnlineStatus();
  initNavigation();
  initModals();
  initDailySpin();
  _startCountdownTicker();
  initNearbyAlerts();
  initQRCheckin();
  initEventFilters();
  initButtonAnimations();
  initComments();
  initNewPost();
  initProfileEdit();
  initCommunityTabs();
  initChatInput();
  initPrivateChat();
  initUserReport();
  initChatKeyboardFix();

  // Handle admin merchant preview BEFORE initAuth (so login screen doesn't block it)
  if (window.location.hash === '#merchant-dashboard-preview') {
    history.replaceState(null, '', window.location.pathname);
    const stored = sessionStorage.getItem('zam_admin_preview_merchant');
    if (stored) {
      sessionStorage.removeItem('zam_admin_preview_merchant');
      _adminPreviewMerchant = JSON.parse(stored);
      // Force-show the app shell (bypass login screen)
      const authShell = document.getElementById('auth-shell');
      const appShell  = document.getElementById('app-shell');
      if (authShell) authShell.style.display = 'none';
      if (appShell)  appShell.style.display  = 'block';
      // Show preview banner and navigate to merchant dashboard
      setTimeout(() => adminPreviewMerchant(_adminPreviewMerchant), 80);
      return; // skip initAuth entirely for preview mode
    }
  }

  initAuth();
  checkDailyStreak();
}

// Register Service Worker (Phase 11)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW:', e));
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'notif-click') {
      ZAMApi.notifications.recordOpened();
      const url = e.data.data?.url || '/';
      if (url.includes('#')) navigateTo(url.split('#')[1]);
    }
  });
}

// =============================================
// Merchant Stats Overlay
// =============================================
function openMerchantStatsOverlay() {
  const overlay = document.getElementById('merchant-stats-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  updateMerchantStats(30);
}
function closeMerchantStatsOverlay() {
  const overlay = document.getElementById('merchant-stats-overlay');
  if (overlay) overlay.style.display = 'none';
}
function updateMerchantStats(days) {
  days = parseInt(days);
  const label = document.getElementById('stats-period-label');
  if (label) label.textContent = `Letzte ${days} Tage`;

  const user = ZAMApi.auth.currentUser();
  const merchantId = user?.id || 'demo_cafe_freiham';
  let stats = { profileViews:0, dealViews:0, dealSaves:0, dealRedemptions:0, eventViews:0, eventJoins:0 };
  try { stats = ZAMApi.analytics.getMerchantStats(merchantId, days); } catch {}

  const kpiEl = document.getElementById('merchant-stats-kpis');
  if (kpiEl) {
    const kpis = [
      { icon:'👁️', val:stats.profileViews,   lbl:'Profilaufrufe',       color:'#ffb399' },
      { icon:'🏷️', val:stats.dealViews,       lbl:'Deal-Aufrufe',        color:'#F7AB00' },
      { icon:'💾', val:stats.dealSaves,       lbl:'Gespeicherte Deals',  color:'#60a5fa' },
      { icon:'✅', val:stats.dealRedemptions, lbl:'Eingelöste Gutscheine',color:'#34d399' },
      { icon:'🎉', val:stats.eventViews,      lbl:'Event-Aufrufe',       color:'#f472b6' },
      { icon:'🙋', val:stats.eventJoins,      lbl:'Event-Teilnahmen',    color:'#fb923c' },
    ];
    kpiEl.innerHTML = kpis.map(k => `
      <div style="background:#282828;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px">
        <div style="font-size:1.1rem;margin-bottom:4px">${k.icon}</div>
        <div style="font-size:1.3rem;font-weight:800;color:${k.color}">${k.val}</div>
        <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:2px">${k.lbl}</div>
      </div>`).join('');
  }

  // My submissions
  const dealsEl = document.getElementById('merchant-stats-deals');
  if (dealsEl) {
    const subs = getMerchantSubmissions().filter(s => s.merchantId === merchantId).slice(0, 5);
    if (!subs.length) { dealsEl.innerHTML = ''; return; }
    const statusLabel = { pending:'⏳ Wartet', approved:'✅ Freigegeben', live:'🟢 Live', rejected:'❌ Abgelehnt', draft:'📝 Entwurf' };
    const statusColor = { pending:'#F7AB00', approved:'#34d399', live:'#34d399', rejected:'#f87171', draft:'rgba(255,255,255,0.3)' };
    dealsEl.innerHTML = `<div style="font-size:0.78rem;font-weight:700;margin-bottom:8px">Meine Einreichungen</div>` +
      subs.map(s => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
          <span style="font-size:1rem">${s.type==='event'?'📅':'🏷️'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:0.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(s.title)}</div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.35)">${new Date(s.submittedAt).toLocaleDateString('de-DE')}</div>
          </div>
          <span style="font-size:0.65rem;font-weight:700;color:${statusColor[s.status]||'#888'}">${statusLabel[s.status]||s.status}</span>
        </div>`).join('');
  }
}

function renderMerchantPreviewSubmissions() {
  const el = document.getElementById('mp-submissions');
  if (!el) return;
  const all = getMerchantSubmissions ? getMerchantSubmissions() : [];
  const demoSubs = all.filter(s => s.merchantId === 'demo_cafe_freiham');
  if (!demoSubs.length) return; // keep static demo data
  const statusLabel = { pending:'⏳ Wartet', approved:'✅ Freigegeben', live:'🟢 Live', rejected:'❌ Abgelehnt', draft:'📝 Entwurf' };
  const statusClass = { pending:'status-pending', approved:'status-approved', live:'status-live', rejected:'status-rejected', draft:'status-draft' };
  el.innerHTML = demoSubs.map(s => `
    <div class="submission-card">
      <div class="submission-card-header">
        <span class="submission-type-badge submission-type-${s.type}">${s.type==='event'?'📅 Event':'🏷️ Deal'}</span>
        <span class="submission-status ${statusClass[s.status]||'status-draft'}">${statusLabel[s.status]||s.status}</span>
      </div>
      <div class="submission-card-title">${escHtml(s.title)}</div>
      <div class="submission-card-meta">${new Date(s.submittedAt).toLocaleDateString('de-DE')}${s.type==='event'&&s.date?' · '+s.date:''}${s.type==='deal'&&s.expiry?' · bis '+s.expiry:''}</div>
      ${s.adminNote?`<div class="submission-card-note">💬 ${escHtml(s.adminNote)}</div>`:''}
    </div>`).join('');
}

// =============================================
// Photo Challenges System
// =============================================
const ZAM_LAT = 48.1523, ZAM_LNG = 11.4386, ZAM_RADIUS_M = 500;

function _geoDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function _getChallenges() { try { return JSON.parse(localStorage.getItem('zam_photo_challenges')||'[]'); } catch { return []; } }
function _getPhotoSubs()  { try { return JSON.parse(localStorage.getItem('zam_photo_submissions')||'[]'); } catch { return []; } }
function _savePhotoSubs(l){ localStorage.setItem('zam_photo_submissions', JSON.stringify(l)); }
function _getGallery()    { try { return JSON.parse(localStorage.getItem('zam_community_gallery')||'[]'); } catch { return []; } }
function _saveGallery(l)  { localStorage.setItem('zam_community_gallery', JSON.stringify(l)); }
function _getModQueue()   { try { return JSON.parse(localStorage.getItem('zam_moderation_queue')||'[]'); } catch { return []; } }
function _saveModQueue(l) { localStorage.setItem('zam_moderation_queue', JSON.stringify(l)); }

function _seedChallenges() {
  const existing = _getChallenges();
  if (existing.length >= 4 && existing[0]?.id === 'zam_ch_001' && existing[0]?.rules) return;
  // Clear old submissions when re-seeding challenges
  localStorage.removeItem('zam_photo_submissions');
  localStorage.removeItem('zam_photo_gallery');
  localStorage.removeItem('zam_photo_challenges');
  localStorage.setItem('zam_photo_challenges', JSON.stringify([
    { id:'zam_ch_001', merchant_id:'mer_008', merchant_name:'Dunkin Donuts', merchant_icon:'🍩',
      banner_color:'#ea580c', demo_count:5,
      title:'Dunkin Donuts Challenge',
      description:'Zeig deine süßesten Momente bei Dunkin Donuts! 3 Besuche fotografieren – und beim 3. Besuch gibt es einen Gratis-Donut für dich.',
      reward_description:'Gratis Donut + 200 Punkte',
      rules:['1 Foto pro Tag zählt','Donut oder Kaffee muss im Bild sichtbar sein','Nur bei Dunkin Donuts im ZAM','Kein Upload aus der Galerie'],
      required_photos_count:3, max_per_day:1,
      location_required:true, radius_meters:500, status:'active', created_at:new Date().toISOString() },
    { id:'zam_ch_002', merchant_id:'mer_002', merchant_name:'KFC', merchant_icon:'🍗',
      banner_color:'#b91c1c', demo_count:2,
      title:'KFC Fan Challenge',
      description:'Bist du ein echter KFC-Fan? Fotografiere deinen Chicken-Moment an 3 verschiedenen Tagen und zeig, dass du der größte KFC-Fan im ZAM bist!',
      reward_description:'Gratis Hot Wings + 150 Punkte',
      rules:['1 Foto pro Tag zählt','Essen muss im Bild erkennbar sein','Nur bei KFC im ZAM Food Court','Kein Upload aus der Galerie'],
      required_photos_count:3, max_per_day:1,
      location_required:true, radius_meters:500, status:'active', created_at:new Date().toISOString() },
    { id:'zam_ch_003', merchant_id:'mer_023', merchant_name:'Fit Star', merchant_icon:'💪',
      banner_color:'#065f46', demo_count:1,
      title:'Fit Star Challenge',
      description:'Dokumentiere deine Trainings-Fortschritte bei Fit Star! 5 Check-ins sammeln – zeig dein Workout, die Sauna oder deinen Motivationsmoment.',
      reward_description:'1 Monat gratis + 300 Punkte',
      rules:['1 Foto pro Tag zählt','Foto muss im Fit Star aufgenommen werden','Training oder Wellness-Bereich erkennbar','Kein Upload aus der Galerie'],
      required_photos_count:5, max_per_day:1,
      location_required:true, radius_meters:500, status:'active', created_at:new Date().toISOString() },
    { id:'zam_ch_004', merchant_id:'mer_019', merchant_name:"L'Osteria", merchant_icon:'🍕',
      banner_color:'#b91c1c', demo_count:3,
      title:"L'Osteria Pizza Challenge",
      description:"Fotografiere deinen Pizzamoment bei L'Osteria! 2 Pizza-Fotos einreichen und den ZAM-Genießer-Bonus sichern – inklusive Rabatt auf deinen nächsten Besuch.",
      reward_description:"15 % Rabatt + 180 Punkte",
      rules:['1 Foto pro Tag zählt','Pizza muss deutlich sichtbar sein',"Nur bei L'Osteria im ZAM OG 1",'Kein Upload aus der Galerie'],
      required_photos_count:2, max_per_day:1,
      location_required:true, radius_meters:500, status:'active', created_at:new Date().toISOString() },
  ]));
  _seedDemoPhotoSubmissions();
}

function _makeDemoPhotoDataUrl(emoji, color, label) {
  const canvas = document.createElement('canvas');
  canvas.width = 400; canvas.height = 300;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,400,300);
  grad.addColorStop(0, color); grad.addColorStop(1, color+'88');
  ctx.fillStyle = grad; ctx.fillRect(0,0,400,300);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0,0,400,150);
  ctx.font = 'bold 80px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 200, 130);
  ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(label, 200, 230);
  ctx.font = '14px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('ZAM Freiham · Demo', 200, 262);
  return canvas.toDataURL('image/jpeg', 0.8);
}

function _seedDemoPhotoSubmissions() {
  if (_getPhotoSubs().length) return;
  const demos = [
    { id:'sub_d1', challenge_id:'zam_ch_001', challenge_name:'Dunkin Donuts Challenge', user_id:'demo_user1', username:'mia_k', image_data: _makeDemoPhotoDataUrl('🍩','#ea580c','Donut Moment'), lat:48.1523, lng:11.4386, submission_day:'2026-06-12', created_at:'2026-06-12T10:30:00Z', status:'auto_approved' },
    { id:'sub_d2', challenge_id:'zam_ch_001', challenge_name:'Dunkin Donuts Challenge', user_id:'demo_user2', username:'felix_b', image_data: _makeDemoPhotoDataUrl('🍩','#c2410c','Sweet Break'), lat:48.1524, lng:11.4387, submission_day:'2026-06-13', created_at:'2026-06-13T09:15:00Z', status:'auto_approved' },
    { id:'sub_d3', challenge_id:'zam_ch_003', challenge_name:'Fit Star Challenge', user_id:'demo_user3', username:'sarah_l', image_data: _makeDemoPhotoDataUrl('💪','#065f46','Workout'), lat:48.1522, lng:11.4385, submission_day:'2026-06-13', created_at:'2026-06-13T07:00:00Z', status:'auto_approved' },
    { id:'sub_d4', challenge_id:'zam_ch_002', challenge_name:'KFC Fan Challenge', user_id:'demo_user4', username:'tom_w', image_data: _makeDemoPhotoDataUrl('🍗','#b91c1c','Chicken Time'), lat:48.1523, lng:11.4386, submission_day:'2026-06-14', created_at:'2026-06-14T12:45:00Z', status:'auto_approved' },
    { id:'sub_d5', challenge_id:'zam_ch_004', challenge_name:"L'Osteria Pizza Challenge", user_id:'demo_user5', username:'anna_p', image_data: _makeDemoPhotoDataUrl('🍕','#b91c1c','Pizza Perfetta'), lat:48.1523, lng:11.4386, submission_day:'2026-06-14', created_at:'2026-06-14T13:30:00Z', status:'auto_approved' },
    { id:'sub_d6', challenge_id:'zam_ch_003', challenge_name:'Fit Star Challenge', user_id:'demo_user6', username:'julia_m', image_data: _makeDemoPhotoDataUrl('🧘','#064e3b','Yoga Flow'), lat:48.1523, lng:11.4386, submission_day:'2026-06-15', created_at:'2026-06-15T08:00:00Z', status:'auto_approved' },
  ];
  _savePhotoSubs(demos);
  const gallery = demos.map(s => ({ id:'gal_'+s.id, submission_id:s.id, image_data:s.image_data, username:s.username, challenge_name:s.challenge_name, likes:Math.floor(Math.random()*30), liked_by:[], created_at:s.created_at }));
  _saveGallery(gallery);
}

function renderPhotoChallenges() {
  _seedChallenges();
  const container = document.getElementById('photo-challenges-content');
  if (!container) return;

  const challenges = _getChallenges().filter(c => c.status === 'active');
  const user = ZAMApi.auth.currentUser();
  const uid = user?.id || 'guest';
  const allSubs = _getPhotoSubs();
  const gallery  = _getGallery();

  // ── Hero ──────────────────────────────────────────
  const totalPhotos = gallery.length + 41;
  const totalRedeemed = 12;
  const activeChallengesCount = challenges.length;
  const availableRewards = challenges.length;
  const hero = `
  <div style="background:linear-gradient(160deg,#1e1616 0%,#1a1a1a 60%,#1a1a1a 100%);padding:0 20px 20px;position:relative;overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;padding:14px 0 14px">
      <button onclick="navigateTo('community')" style="background:rgba(255,255,255,0.08);border:none;color:#fff;border-radius:10px;width:36px;height:36px;font-size:1.1rem;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:#ff6b3d">ZAM Community</span>
    </div>
    <div style="position:absolute;top:0;right:-20px;font-size:9rem;opacity:0.06;pointer-events:none">📸</div>
    <h1 style="font-size:1.45rem;font-weight:900;line-height:1.2;margin-bottom:14px;color:#fff">📸 Foto-Challenges</h1>
    <!-- Live Stats -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
      <div style="background:rgba(250,70,21,0.12);border:1px solid rgba(250,70,21,0.2);border-radius:12px;padding:10px 8px;text-align:center">
        <div style="font-size:1.1rem;font-weight:900;color:#ffb399">${totalPhotos}</div>
        <div style="font-size:0.54rem;color:rgba(255,255,255,0.4);margin-top:2px;font-weight:600;line-height:1.2">📸 Community<br>Fotos</div>
      </div>
      <div style="background:rgba(247,171,0,0.1);border:1px solid rgba(247,171,0,0.2);border-radius:12px;padding:10px 8px;text-align:center">
        <div style="font-size:1.1rem;font-weight:900;color:#F7AB00">${totalRedeemed}</div>
        <div style="font-size:0.54rem;color:rgba(255,255,255,0.4);margin-top:2px;font-weight:600;line-height:1.2">🏆 Belohnungen<br>eingelöst</div>
      </div>
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:10px 8px;text-align:center">
        <div style="font-size:1.1rem;font-weight:900;color:#f87171">${activeChallengesCount}</div>
        <div style="font-size:0.54rem;color:rgba(255,255,255,0.4);margin-top:2px;font-weight:600;line-height:1.2">🔥 Aktive<br>Challenges</div>
      </div>
      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:10px 8px;text-align:center">
        <div style="font-size:1.1rem;font-weight:900;color:#34d399">${availableRewards}</div>
        <div style="font-size:0.54rem;color:rgba(255,255,255,0.4);margin-top:2px;font-weight:600;line-height:1.2">🎁 Verfügbare<br>Prämien</div>
      </div>
    </div>
  </div>`;

  // ── How it works ──────────────────────────────────
  const steps = [
    ['1','Challenge auswählen','Wähle eine aktive Händler-Challenge aus der Liste'],
    ['2','Foto aufnehmen','Mach ein Foto direkt in der App – kein Upload erlaubt'],
    ['3','Standort bestätigen','Die App prüft automatisch, dass du im ZAM bist'],
    ['4','Fortschritt sammeln','Jeden Tag ein Foto – bis das Ziel erreicht ist'],
    ['5','Belohnung einlösen','Scanne deinen QR-Code beim Händler für die Prämie'],
  ];
  const howItWorks = `
  <div style="margin:0 16px 20px;background:rgba(250,70,21,0.07);border:1px solid rgba(250,70,21,0.18);border-radius:16px;padding:16px">
    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:#ff6b3d;margin-bottom:14px">💡 So funktioniert's</div>
    ${steps.map(([n,t,d]) => `
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px">
      <div style="width:24px;height:24px;border-radius:50%;background:rgba(250,70,21,0.25);border:1px solid rgba(250,70,21,0.4);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;color:#ffb399;flex-shrink:0">${n}</div>
      <div>
        <div style="font-size:0.8rem;font-weight:700;color:#e2e8f0;line-height:1.2">${t}</div>
        <div style="font-size:0.71rem;color:rgba(255,255,255,0.4);margin-top:2px;line-height:1.4">${d}</div>
      </div>
    </div>`).join('')}
  </div>`;

  // ── Challenge cards ────────────────────────────────
  const challengeCards = challenges.map(ch => {
    const mySubs = allSubs.filter(s => s.challenge_id===ch.id && s.user_id===uid && s.status!=='rejected');
    // Use real count if user has submissions, else demo_count for visual demo
    const count = mySubs.length > 0 ? mySubs.length : (ch.demo_count || 0);
    const total = ch.required_photos_count;
    const pct   = Math.min(100, Math.round((count / total) * 100));
    const done  = count >= total;
    const today = new Date().toISOString().slice(0,10);
    const doneToday = allSubs.some(s => s.challenge_id===ch.id && s.user_id===uid && s.submission_day===today && s.status!=='rejected');
    const c = ch.banner_color || '#c43510';

    const slots = Array.from({length: total}, (_, i) =>
      i < count
        ? `<div style="width:38px;height:38px;border-radius:9px;background:${c}33;border:2px solid ${c}88;display:flex;align-items:center;justify-content:center;font-size:1rem">✅</div>`
        : `<div style="width:38px;height:38px;border-radius:9px;background:rgba(255,255,255,0.04);border:1.5px dashed rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;font-size:0.9rem;color:rgba(255,255,255,0.2)">📷</div>`
    ).join('');

    return `
    <div style="background:#212121;border:1px solid rgba(255,255,255,0.07);border-radius:18px;overflow:hidden;margin-bottom:14px">
      <!-- Banner -->
      <div style="background:linear-gradient(135deg,${c},${c}99);padding:16px;display:flex;align-items:center;gap:14px">
        <div style="font-size:2.6rem;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5))">${ch.merchant_icon}</div>
        <div style="flex:1">
          <div style="font-size:1rem;font-weight:800;color:#fff;line-height:1.25">${escHtml(ch.title)}</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.65);margin-top:3px">${escHtml(ch.merchant_name)}</div>
        </div>
        <span style="font-size:0.6rem;font-weight:800;padding:4px 10px;border-radius:20px;white-space:nowrap;${done ? 'background:rgba(247,171,0,0.2);color:#F7AB00;border:1px solid rgba(247,171,0,0.3)' : 'background:rgba(255,255,255,0.15);color:#fff'}">${done ? '✅ Fertig' : '🔥 Aktiv'}</span>
      </div>
      <!-- Body -->
      <div style="padding:14px 16px">
        <p style="font-size:0.78rem;color:rgba(255,255,255,0.5);line-height:1.6;margin-bottom:14px">${escHtml(ch.description)}</p>

        <!-- Reward -->
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:12px;padding:11px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
          <span style="font-size:1.3rem">🎁</span>
          <div>
            <div style="font-size:0.63rem;text-transform:uppercase;letter-spacing:0.07em;font-weight:800;color:rgba(52,211,153,0.7);margin-bottom:2px">Deine Belohnung</div>
            <div style="font-size:0.85rem;font-weight:700;color:#34d399">${escHtml(ch.reward_description)}</div>
          </div>
        </div>

        <!-- Progress -->
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:0.75rem;font-weight:700;color:#e2e8f0">${count} / ${total} Fotos</span>
            <span style="font-size:0.72rem;font-weight:700;color:${c}">${pct}%</span>
          </div>
          <div style="height:8px;background:rgba(255,255,255,0.07);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${c},${c}cc);border-radius:99px;transition:width .5s ease"></div>
          </div>
        </div>

        <!-- Photo slots -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${slots}</div>

        <!-- Info chips -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
          <span style="font-size:0.63rem;padding:4px 9px;border-radius:20px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.08)">📅 Max. 1 Foto/Tag</span>
          <span style="font-size:0.63rem;padding:4px 9px;border-radius:20px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.08)">📍 Standort erforderlich</span>
          <span style="font-size:0.63rem;padding:4px 9px;border-radius:20px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.08)">🔍 Vor Veröffentlichung geprüft</span>
          ${doneToday ? '<span style="font-size:0.63rem;padding:4px 9px;border-radius:20px;background:rgba(247,171,0,0.1);color:#F7AB00;border:1px solid rgba(247,171,0,0.2)">⚠️ Heute bereits eingereicht</span>' : ''}
        </div>

        <!-- Actions -->
        ${done
          ? `<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:12px;padding:14px;text-align:center">
               <div style="font-size:1.3rem;margin-bottom:6px">🎉</div>
               <div style="font-size:0.9rem;font-weight:800;color:#34d399;margin-bottom:2px">Challenge abgeschlossen!</div>
               <div style="font-size:0.75rem;color:rgba(52,211,153,0.7)">${escHtml(ch.reward_description)}</div>
             </div>`
          : `<div style="display:flex;gap:8px">
               <button onclick="openChallengeDetail('${ch.id}')" style="flex:1;padding:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#e2e8f0;border-radius:12px;font-size:0.8rem;font-weight:700;font-family:var(--font);cursor:pointer">Details</button>
               <button onclick="${doneToday ? '' : `openCameraForChallenge('${ch.id}')`}" ${doneToday ? 'disabled' : ''} style="flex:2;padding:12px;background:${doneToday ? 'rgba(255,255,255,0.04)' : `linear-gradient(135deg,${c},${c}cc)`};border:none;color:${doneToday ? 'rgba(255,255,255,0.25)' : '#fff'};border-radius:12px;font-size:0.85rem;font-weight:700;font-family:var(--font);cursor:${doneToday ? 'default' : 'pointer'};display:flex;align-items:center;justify-content:center;gap:8px;${doneToday ? '' : `box-shadow:0 4px 14px ${c}44`}">
                 ${doneToday ? 'Morgen wieder verfügbar' : '📸 Foto aufnehmen'}
               </button>
             </div>`
        }
      </div>
    </div>`;
  }).join('');

  // ── Community Gallery section ──────────────────────
  const galleryItems = gallery.slice(0, 6);
  const galleryHtml = galleryItems.length
    ? galleryItems.map(item => {
        const imgSrc = item.image_data || item.image_url;
        const uname  = item.username || item.user_name || 'Gast';
        const cname  = item.challenge_name || item.challenge_title || '';
        const liked  = (item.liked_by||[]).includes(uid);
        const likes  = item.likes || item.likes_count || 0;
        return `
        <div style="background:#212121;border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden">
          <div style="aspect-ratio:1;overflow:hidden;background:#1a1a1a">
            ${imgSrc ? `<img src="${imgSrc}" alt="" style="width:100%;height:100%;object-fit:cover">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem">📷</div>'}
          </div>
          <div style="padding:8px 10px 10px">
            <div style="font-size:0.72rem;font-weight:700;color:#e2e8f0">@${escHtml(uname)}</div>
            <div style="font-size:0.63rem;color:rgba(255,255,255,0.35);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(cname)}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
              <span style="font-size:0.62rem;color:rgba(255,255,255,0.25)">${item.created_at ? new Date(item.created_at).toLocaleDateString('de-DE') : ''}</span>
              <button onclick="toggleGalleryLike('${item.id}',this)" style="display:flex;align-items:center;gap:3px;background:none;border:none;cursor:pointer;font-size:0.75rem;color:${liked ? '#f43f5e' : 'rgba(255,255,255,0.35)'}">
                ${liked ? '❤️' : '🤍'} <span>${likes}</span>
              </button>
            </div>
          </div>
        </div>`;
      }).join('')
    : `<div style="grid-column:1/-1;text-align:center;padding:30px;color:rgba(255,255,255,0.3)">
         <div style="font-size:2rem;margin-bottom:8px">📷</div>
         <div style="font-size:0.8rem">Noch keine Fotos in der Galerie.<br>Nimm an einer Challenge teil!</div>
       </div>`;

  const gallerySection = `
  <div style="margin:8px 16px 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-size:1rem;font-weight:800;color:#e2e8f0">🖼️ ZAM Community Galerie</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.35);margin-top:2px">Fotos aus bestätigten ZAM-Challenges</div>
      </div>
      <button onclick="navigateTo('community-gallery')" style="font-size:0.72rem;font-weight:700;color:#ff6b3d;background:rgba(250,70,21,0.1);border:1px solid rgba(250,70,21,0.2);border-radius:8px;padding:5px 10px;cursor:pointer;font-family:var(--font)">Alle →</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${galleryHtml}</div>
    <div style="margin-top:12px;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;display:flex;align-items:center;gap:8px">
      <span style="font-size:1rem">🔍</span>
      <span style="font-size:0.68rem;color:rgba(255,255,255,0.35);line-height:1.5">Alle öffentlichen Fotos werden vor Veröffentlichung automatisch geprüft und können vom Team abgelehnt werden.</span>
    </div>
  </div>`;

  container.innerHTML = hero + howItWorks
    + `<div style="padding:0 16px;margin-bottom:4px"><div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:12px">🔥 Aktive Challenges (${challenges.length})</div>${challengeCards}</div>`
    + gallerySection
;
}

function openChallengeDetail(challengeId) {
  const ch = _getChallenges().find(c => c.id === challengeId);
  if (!ch) return;
  const allSubs = _getPhotoSubs();
  const user = ZAMApi.auth.currentUser();
  const uid = user?.id || 'guest';
  const mySubs = allSubs.filter(s => s.challenge_id===ch.id && s.user_id===uid && s.status!=='rejected');
  const count = mySubs.length > 0 ? mySubs.length : (ch.demo_count || 0);
  const total = ch.required_photos_count;
  const pct = Math.min(100, Math.round((count/total)*100));
  const c = ch.banner_color || '#c43510';
  const today = new Date().toISOString().slice(0,10);
  const doneToday = allSubs.some(s => s.challenge_id===ch.id && s.user_id===uid && s.submission_day===today && s.status!=='rejected');

  const rules = (ch.rules || ['1 Foto pro Tag','Nur im ZAM Freiham','Kein Upload aus der Galerie','Foto wird geprüft'])
    .map(r => `<li style="margin-bottom:6px">${r}</li>`).join('');

  document.getElementById('challenge-detail-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <div style="width:56px;height:56px;border-radius:14px;background:${c}33;border:2px solid ${c}66;display:flex;align-items:center;justify-content:center;font-size:2rem;flex-shrink:0">${ch.merchant_icon}</div>
      <div>
        <div style="font-size:1.05rem;font-weight:800;color:#fff;line-height:1.2">${escHtml(ch.title)}</div>
        <div style="font-size:0.74rem;color:rgba(255,255,255,0.45);margin-top:3px">${escHtml(ch.merchant_name)}</div>
      </div>
    </div>

    <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:12px;padding:14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <span style="font-size:1.4rem">🎁</span>
      <div>
        <div style="font-size:0.63rem;text-transform:uppercase;letter-spacing:0.07em;font-weight:800;color:rgba(52,211,153,0.7);margin-bottom:3px">Deine Belohnung</div>
        <div style="font-size:0.9rem;font-weight:800;color:#34d399">${escHtml(ch.reward_description)}</div>
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">Dein Fortschritt</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:0.82rem;font-weight:700;color:#e2e8f0">${count} / ${total} Fotos</span>
        <span style="font-size:0.78rem;font-weight:700;color:${c}">${pct}%</span>
      </div>
      <div style="height:10px;background:rgba(255,255,255,0.07);border-radius:99px;overflow:hidden;margin-bottom:14px">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${c},${c}cc);border-radius:99px"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${Array.from({length:total},(_,i) => i < count
          ? `<div style="width:44px;height:44px;border-radius:10px;background:${c}33;border:2px solid ${c}99;display:flex;align-items:center;justify-content:center;font-size:1.1rem">✅</div>`
          : `<div style="width:44px;height:44px;border-radius:10px;background:rgba(255,255,255,0.04);border:1.5px dashed rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:0.9rem;color:rgba(255,255,255,0.2)">📷</div>`
        ).join('')}
      </div>
    </div>

    <div style="margin-bottom:16px">
      <div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">Challenge-Regeln</div>
      <ul style="list-style:none;padding:0;margin:0;font-size:0.78rem;color:rgba(255,255,255,0.55);line-height:1.5">
        ${rules}
      </ul>
    </div>

    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px">
      <div style="display:flex;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.4)"><span>📅</span> Max. 1 Foto pro Tag zählt zum Fortschritt</div>
      <div style="display:flex;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.4)"><span>📍</span> Standortfreigabe im ZAM Freiham erforderlich</div>
      <div style="display:flex;align-items:center;gap:8px;font-size:0.74rem;color:rgba(255,255,255,0.4)"><span>🔍</span> Foto wird vor Veröffentlichung automatisch geprüft</div>
    </div>

    <button onclick="${doneToday ? '' : `closeChallengeDetail();openCameraForChallenge('${ch.id}')`}" ${doneToday ? 'disabled' : ''} style="width:100%;padding:15px;background:${doneToday ? 'rgba(255,255,255,0.04)' : `linear-gradient(135deg,${c},${c}cc)`};border:none;color:${doneToday ? 'rgba(255,255,255,0.25)' : '#fff'};border-radius:14px;font-size:0.95rem;font-weight:800;font-family:var(--font);cursor:${doneToday ? 'default' : 'pointer'};${doneToday ? '' : `box-shadow:0 6px 20px ${c}44`}">
      ${doneToday ? '⏳ Heute bereits eingereicht – morgen wieder' : '📸 Heute Foto aufnehmen'}
    </button>`;

  document.getElementById('challenge-detail-sheet').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeChallengeDetail() {
  document.getElementById('challenge-detail-sheet').style.display = 'none';
  document.body.style.overflow = '';
}

// ── Camera ──
let _activeChallengeId = null, _cameraStream = null, _capturedDataUrl = null, _userLocation = null;

function openCameraForChallenge(challengeId) {
  _activeChallengeId = challengeId;
  _capturedDataUrl = null;
  _userLocation = null;
  const ch = _getChallenges().find(c => c.id === challengeId);
  const modal = document.getElementById('modal-camera');
  if (!modal) return;
  document.getElementById('camera-challenge-title').textContent = ch ? ch.title : 'Foto aufnehmen';
  // Reset to viewfinder state
  const preview = document.getElementById('camera-photo-preview');
  const shutterUi = document.getElementById('camera-shutter-ui');
  if (preview) preview.style.display = 'none';
  if (shutterUi) shutterUi.style.display = 'block';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _startCamera();
  _checkLocation();
}

function closeCameraModal() {
  _stopCamera();
  const m = document.getElementById('modal-camera');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
  // Remove demo placeholder for clean reopen
  document.querySelectorAll('.camera-demo-placeholder').forEach(el => el.remove());
  const video = document.getElementById('camera-video');
  if (video) video.style.display = '';
  const shutterBtn = document.getElementById('camera-shutter-btn');
  if (shutterBtn) shutterBtn.onclick = capturePhoto;
}

function _startCamera() {
  const video = document.getElementById('camera-video');
  if (!video || !navigator.mediaDevices?.getUserMedia) { _showCameraDemo(); return; }
  navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment', width:{ideal:1920}, height:{ideal:1080} }, audio:false })
    .then(stream => { _cameraStream = stream; video.srcObject = stream; })
    .catch(() => _showCameraDemo());
}

function _showCameraDemo() {
  const video = document.getElementById('camera-video');
  if (video) {
    video.style.display = 'none';
    const vf = document.getElementById('camera-viewfinder');
    if (vf && !vf.querySelector('.camera-demo-placeholder')) {
      const div = document.createElement('div');
      div.className = 'camera-demo-placeholder';
      div.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:linear-gradient(160deg,#1e1616,#1a1a1a)';
      div.innerHTML = `
        <div style="font-size:5rem;filter:drop-shadow(0 4px 20px rgba(250,70,21,0.5))">📷</div>
        <div style="font-size:1.1rem;font-weight:800;color:#fff">Kamera wird geöffnet</div>
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.45);text-align:center;padding:0 40px;line-height:1.6">Demo-Modus aktiv.<br>Tippe auf den Auslöser für ein Demo-Foto.</div>`;
      vf.appendChild(div);
    }
  }
  const shutterBtn = document.getElementById('camera-shutter-btn');
  if (shutterBtn) shutterBtn.onclick = _captureDemoPhoto;
}

function _captureDemoPhoto() {
  const ch = _getChallenges().find(c => c.id === _activeChallengeId);
  const colors = { ch_001:'#d93e12', ch_002:'#0891b2', ch_003:'#8a5f00', ch_004:'#059669' };
  const color = (ch && colors[ch.id]) || '#c43510';
  const emoji = ch?.merchant_icon || '📸';
  const label = ch?.merchant_name || 'ZAM';
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
  grad.addColorStop(0, color); grad.addColorStop(1, color + '66');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1920);
  // Light overlay
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, 1080, 900);
  // Big emoji
  ctx.font = '300px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 540, 820);
  // Text
  ctx.font = 'bold 72px sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText(label, 540, 1100);
  ctx.font = '48px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('ZAM Foto-Challenge', 540, 1190);
  ctx.fillText(new Date().toLocaleString('de-DE'), 540, 1270);
  _capturedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  _showPhotoPreview(_capturedDataUrl);
}

function _showPhotoPreview(dataUrl) {
  const img     = document.getElementById('camera-preview-img');
  const preview = document.getElementById('camera-photo-preview');
  const shutterUi = document.getElementById('camera-shutter-ui');
  if (img) img.src = dataUrl;
  if (preview) preview.style.display = 'flex';
  if (shutterUi) shutterUi.style.display = 'none';
}

function _stopCamera() {
  if (_cameraStream) { _cameraStream.getTracks().forEach(t => t.stop()); _cameraStream = null; }
}

function _checkLocation() {
  const el = document.getElementById('camera-location-status');
  if (!el) return;
  el.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 16px;border-radius:20px;font-size:0.74rem;font-weight:700;background:rgba(247,171,0,0.15);border:1px solid rgba(247,171,0,0.3);color:#F7AB00;width:fit-content;margin:0 auto 20px';
  el.innerHTML = '<span>📍</span><span>Standort wird geprüft…</span>';
  if (!navigator.geolocation) { _locationFallback(el); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    _userLocation = { lat:pos.coords.latitude, lng:pos.coords.longitude };
    const dist = Math.round(_geoDistance(_userLocation.lat, _userLocation.lng, ZAM_LAT, ZAM_LNG));
    if (dist <= ZAM_RADIUS_M) {
      el.style.background = 'rgba(16,185,129,0.15)'; el.style.border = '1px solid rgba(52,211,153,0.3)'; el.style.color = '#34d399';
      el.innerHTML = `<span>✅</span><span>Im ZAM-Bereich (${dist}m)</span>`;
    } else {
      _userLocation = null;
      el.style.background = 'rgba(239,68,68,0.12)'; el.style.border = '1px solid rgba(239,68,68,0.3)'; el.style.color = '#f87171';
      el.innerHTML = `<span>❌</span><span>Außerhalb ZAM (${dist}m / max ${ZAM_RADIUS_M}m)</span>`;
    }
  }, () => _locationFallback(el), { timeout:8000, maximumAge:60000 });
}

function _locationFallback(el) {
  _userLocation = { lat:ZAM_LAT, lng:ZAM_LNG, isDemo:true };
  el.style.background = 'rgba(16,185,129,0.15)'; el.style.border = '1px solid rgba(52,211,153,0.3)'; el.style.color = '#34d399';
  el.innerHTML = '<span>✅</span><span>Demo: Standort im ZAM simuliert</span>';
}

function capturePhoto() {
  const video  = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  if (!video || !canvas) return;
  canvas.width  = video.videoWidth  || 1080;
  canvas.height = video.videoHeight || 1920;
  canvas.getContext('2d').drawImage(video, 0, 0);
  _capturedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  _showPhotoPreview(_capturedDataUrl);
}

function retakePhoto() {
  _capturedDataUrl = null;
  const preview   = document.getElementById('camera-photo-preview');
  const shutterUi = document.getElementById('camera-shutter-ui');
  if (preview) preview.style.display = 'none';
  if (shutterUi) shutterUi.style.display = 'block';
}

function submitChallengePhoto() {
  if (!_capturedDataUrl) { showToast('Bitte zuerst ein Foto aufnehmen'); return; }
  if (!_userLocation) { showToast('❌ Nicht im ZAM-Bereich. Bitte näher kommen.'); return; }
  const user = ZAMApi.auth.currentUser();
  const uid = user?.id || 'guest';
  const today = new Date().toISOString().slice(0,10);
  const subs = _getPhotoSubs();
  if (subs.some(s => s.challenge_id===_activeChallengeId && s.user_id===uid && s.submission_day===today && s.status!=='rejected')) {
    showToast('Heute bereits ein Foto eingereicht!'); return;
  }
  const btn = document.getElementById('btn-submit-photo');
  if (btn) { btn.textContent = 'Wird eingereicht…'; btn.disabled = true; }

  setTimeout(() => {
    const subId = 'sub_' + Date.now();
    const sub = { id:subId, challenge_id:_activeChallengeId, user_id:uid,
      user_name:user?.display_name||user?.name||'Gast',
      image_url:_capturedDataUrl, location_lat:_userLocation.lat, location_lng:_userLocation.lng,
      submitted_at:new Date().toISOString(), submission_day:today, status:'approved' };
    subs.push(sub); _savePhotoSubs(subs);

    // Moderation queue entry
    const q = _getModQueue();
    q.unshift({ id:'mod_'+Date.now(), content_type:'photo_challenge', content_id:subId,
      status:'auto_approved', moderation_result:{ safe:true, flags:[] }, admin_notes:'', created_at:new Date().toISOString() });
    _saveModQueue(q);

    // Add to gallery
    const ch = _getChallenges().find(c => c.id===_activeChallengeId);
    const gallery = _getGallery();
    gallery.unshift({ id:'gal_'+Date.now(), submission_id:subId, image_url:_capturedDataUrl,
      user_id:uid, user_name:user?.display_name||'Gast',
      merchant_name:ch?.merchant_name||'', challenge_title:ch?.title||'',
      approved_at:new Date().toISOString(), likes_count:0, liked_by:[] });
    _saveGallery(gallery);

    // Check completion
    const approvedCount = subs.filter(s => s.challenge_id===_activeChallengeId && s.user_id===uid && s.status==='approved').length;
    const completed = ch && approvedCount >= ch.required_photos_count;

    closeCameraModal();
    if (completed) {
      showToast('🎉 Challenge abgeschlossen! ' + (ch?.reward_description||''));
      try { ZAMApi.points.add(200); } catch {}
    } else {
      showToast(`✅ Foto ${approvedCount}/${ch?.required_photos_count||5} eingereicht!`);
    }
    renderPhotoChallenges();
    if (btn) { btn.textContent = '✅ Einreichen'; btn.disabled = false; }
  }, 350);
}

function renderCommunityGallery() {
  _seedChallenges();
  const container = document.getElementById('gallery-grid-container');
  if (!container) return;
  const gallery = _getGallery();
  if (!gallery.length) {
    container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:var(--dim)"><div style="font-size:2.5rem;margin-bottom:10px">📷</div><div style="font-size:0.84rem">Noch keine Fotos.<br>Nimm an einer Challenge teil!</div></div>';
    return;
  }
  const user = ZAMApi.auth.currentUser();
  const uid = user?.id || 'guest';
  container.innerHTML = gallery.map(item => {
    const liked = (item.liked_by||[]).includes(uid);
    const imgSrc = item.image_data || item.image_url;
    const uname = item.username || item.user_name || 'Gast';
    const challengeName = item.challenge_name || item.challenge_title || '';
    const dateStr = item.created_at || item.approved_at;
    return `<div class="gallery-item">
      <div class="gallery-item-img" style="background:#111">${imgSrc ? `<img src="${imgSrc}" alt="" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:2rem">📷</span>'}</div>
      <div class="gallery-item-body">
        <div class="gallery-item-user" style="font-weight:700;font-size:0.78rem">@${escHtml(uname)}</div>
        <div class="gallery-item-meta" style="font-size:0.68rem;color:var(--dim)">${escHtml(challengeName)}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
          <span style="font-size:0.65rem;color:var(--dim)">${dateStr ? new Date(dateStr).toLocaleDateString('de-DE') : ''}</span>
          <button class="gallery-like-btn ${liked?'liked':''}" onclick="toggleGalleryLike('${item.id}',this)" style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;font-size:0.78rem;color:${liked?'#f43f5e':'var(--dim)'}">
            ${liked?'❤️':'🤍'} <span>${item.likes||item.likes_count||0}</span>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleGalleryLike(itemId, btn) {
  const gallery = _getGallery();
  const item = gallery.find(g => g.id===itemId);
  const uid = ZAMApi.auth.currentUser()?.id || 'guest';
  if (!item) return;
  item.liked_by = item.liked_by || [];
  const idx = item.liked_by.indexOf(uid);
  const likeField = 'likes' in item ? 'likes' : 'likes_count';
  if (idx === -1) { item.liked_by.push(uid); item[likeField] = (item[likeField]||0)+1; }
  else { item.liked_by.splice(idx,1); item[likeField] = Math.max(0,(item[likeField]||0)-1); }
  _saveGallery(gallery);
  btn.className = 'gallery-like-btn ' + (idx===-1?'liked':'');
  btn.innerHTML = `${idx===-1?'❤️':'🤍'} <span>${item.likes_count}</span>`;
}

// ═══════════════════════════════════════════════
// DEMO ROLE SWITCHER
// ═══════════════════════════════════════════════

const _DEMO_ROLE_META = {
  user:     { label:'👤 Nutzer',  color:'#ffb399', bg:'rgba(250,70,21,0.2)', border:'rgba(250,70,21,0.3)', btnColor:'#ff6b3d' },
  merchant: { label:'🏪 Händler', color:'#6ee7b7', bg:'rgba(16,185,129,0.2)', border:'rgba(16,185,129,0.3)', btnColor:'#34d399' },
  admin:    { label:'🛡️ Admin',   color:'#fca5a5', bg:'rgba(239,68,68,0.18)', border:'rgba(239,68,68,0.3)',  btnColor:'#f87171' },
};

const _DEMO_ROLE_ACTIONS = {
  merchant: `
    <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.35);margin-bottom:8px">Händler-Bereiche</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <button onclick="navigateTo('merchant-dashboard')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:10px;color:#6ee7b7;font-family:var(--font);font-size:0.8rem;font-weight:700;cursor:pointer;text-align:left">
        📊 <span>Händler Dashboard öffnen</span>
      </button>
      <button onclick="openMerchantStatsOverlay()" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;color:#6ee7b7;font-family:var(--font);font-size:0.8rem;font-weight:700;cursor:pointer;text-align:left">
        📈 <span>Händler-Statistiken</span>
      </button>
      <button onclick="openModal('modal-qr-scanner')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;color:#6ee7b7;font-family:var(--font);font-size:0.8rem;font-weight:700;cursor:pointer;text-align:left">
        🔍 <span>QR-Scanner öffnen</span>
      </button>
    </div>`,
  admin: `
    <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.35);margin-bottom:8px">Admin-Bereiche</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <button onclick="navigateTo('admin-dashboard')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;color:#fca5a5;font-family:var(--font);font-size:0.8rem;font-weight:700;cursor:pointer;text-align:left">
        🔧 <span>Admin Dashboard</span>
      </button>
      <button onclick="navigateTo('admin-revenue')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:10px;color:#fca5a5;font-family:var(--font);font-size:0.8rem;font-weight:700;cursor:pointer;text-align:left">
        💰 <span>Revenue & Analytics</span>
      </button>
      <button onclick="navigateTo('admin-ai-insights')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:10px;color:#fca5a5;font-family:var(--font);font-size:0.8rem;font-weight:700;cursor:pointer;text-align:left">
        🤖 <span>KI Insights</span>
      </button>
      <button onclick="navigateTo('merchant-dashboard')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:10px;color:#fca5a5;font-family:var(--font);font-size:0.8rem;font-weight:700;cursor:pointer;text-align:left">
        🏪 <span>Händler-Dashboard (Vorschau)</span>
      </button>
      <button onclick="window.open('admin.html','_blank')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:10px;color:#fca5a5;font-family:var(--font);font-size:0.8rem;font-weight:700;cursor:pointer;text-align:left">
        ↗ <span>Admin Panel öffnen</span>
      </button>
    </div>`,
  user: '',
};

function switchDemoRole(role) {
  const user = ZAMApi.auth.currentUser();
  if (!user) { showToast('Bitte zuerst einloggen'); return; }

  // Patch role in all storage locations
  user.role = role;
  ZAMData.currentUser = { ...ZAMData.currentUser, role };

  // Ensure merchant_status is set for merchant role
  if (role === 'merchant') {
    user.merchant_status = 'approved';
    user.shopname = user.shopname || 'Demo Händler';
    ZAMData.currentUser.merchant_status = 'approved';
    ZAMData.currentUser.shopname = ZAMData.currentUser.shopname || 'Demo Händler';
  }

  try {
    const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
    if (g.session_user) { g.session_user.role = role; if (role === 'merchant') { g.session_user.merchant_status = 'approved'; g.session_user.shopname = g.session_user.shopname || 'Demo Händler'; } }
    const accs = g.accounts || [];
    const acc = accs.find(a => a.id === user.id);
    if (acc) { acc.role = role; if (role === 'merchant') { acc.merchant_status = 'approved'; acc.shopname = acc.shopname || 'Demo Händler'; } }
    localStorage.setItem('zamclub_global', JSON.stringify(g));
  } catch {}

  // Update global badge
  const globalBadge = document.getElementById('global-role-badge');
  const globalBadgeText = document.getElementById('global-role-badge-text');
  const meta = _DEMO_ROLE_META[role] || _DEMO_ROLE_META.user;
  if (globalBadge) {
    if (role === 'user') {
      globalBadge.style.display = 'none';
    } else {
      globalBadge.style.display = 'flex';
      if (globalBadgeText) globalBadgeText.textContent = `🎭 Demo-Modus: ${meta.label}`;
    }
  }

  // Update profile badge
  const badge = document.getElementById('demo-role-badge');
  if (badge) {
    badge.textContent = meta.label;
    badge.style.color = meta.color;
    badge.style.background = meta.bg;
    badge.style.borderColor = meta.border;
  }

  // Update button highlights
  ['user','merchant','admin'].forEach(r => {
    const btn = document.getElementById(`demo-role-btn-${r}`);
    if (!btn) return;
    const m = _DEMO_ROLE_META[r];
    if (r === role) {
      btn.style.border = `2px solid ${m.btnColor}`;
      btn.style.background = m.bg;
      btn.style.color = m.color;
    } else {
      btn.style.border = '2px solid rgba(255,255,255,0.12)';
      btn.style.background = 'rgba(255,255,255,0.04)';
      btn.style.color = 'rgba(255,255,255,0.7)';
    }
  });

  // Show role-specific quick actions
  const actionsEl = document.getElementById('demo-role-actions');
  if (actionsEl) actionsEl.innerHTML = _DEMO_ROLE_ACTIONS[role] || '';

  // Re-render home (merchant tools card) and profile (role buttons)
  renderHome();
  renderProfile();

  showToast(`Rolle gewechselt: ${meta.label}`);
}

function _initDemoRoleBadge() {
  const user = ZAMApi.auth.currentUser();
  if (!user) return;
  switchDemoRole(user.role || 'user');
}

// ═══════════════════════════════════════════════
// REWARDS SYSTEM
// ═══════════════════════════════════════════════

function _getRewards() { try { return JSON.parse(localStorage.getItem('zam_rewards')||'[]'); } catch { return []; } }
function _saveRewards(l) { localStorage.setItem('zam_rewards', JSON.stringify(l)); }

const POINTS_CATALOG = [
  { id:'pc_001', points:500,  icon:'☕', title:'Gratis Kaffee',      merchant:'Café Freiham',   description:'Ein Heißgetränk deiner Wahl gratis.' },
  { id:'pc_002', points:1000, icon:'🍦', title:'Gratis Eis',         merchant:'Gelato World',   description:'Eine Kugel Eis nach Wahl gratis.' },
  { id:'pc_003', points:2500, icon:'🎟️', title:'Eventticket',        merchant:'ZAM Freiham',    description:'Freier Eintritt zu einem ZAM-Community-Event.' },
  { id:'pc_004', points:5000, icon:'💎', title:'Premium Vorteil',    merchant:'ZAM Freiham',    description:'Exklusiver Vorteil: VIP-Zugang + Händler-Rabatte.' },
];

function _seedRewards() {
  if (_getRewards().length) return;
  const demos = [
    { id:'rew_d1', type:'spin_prize', merchant_name:'Gelato di Monaco', merchant_icon:'🍦', title:'Gratis Eiskugel in der Waffel', description:'Eine Kugel Eis deiner Wahl gratis an der Gelato-Station im ZAM-EG. Gewonnen beim Daily Spin!', terms:'1 Kugel. Nicht kombinierbar.', voucher_id:'ZAM-GL3391', spin_reward_id:'spr_001', status:'available', expires_at: new Date(Date.now()+12*86400000).toISOString(), earned_at: new Date().toISOString() },
    { id:'rew_d2', type:'challenge',  merchant_name:'Asia Street Food', merchant_icon:'🥢', title:'Gratis Frühlingsrollen',          description:'Einzulösen bei Asia Street Food im Food Court OG 2.', voucher_id:'ZAM-AS7742', status:'available', challenge_id:'zam_ch_001', expires_at: new Date(Date.now()+20*86400000).toISOString(), earned_at: new Date().toISOString() },
    { id:'rew_d3', type:'points',     merchant_name:'Café Freiham',     merchant_icon:'☕', title:'Gratis Heißgetränk',              description:'Ein Heißgetränk deiner Wahl gratis.', voucher_id:'ZAM-CF4419', status:'available', points_cost:500, expires_at: new Date(Date.now()+14*86400000).toISOString(), earned_at: new Date().toISOString() },
    { id:'rew_d4', type:'event',      merchant_name:'ZAM Freiham',      merchant_icon:'🎫', title:'Summer Event Ticket',             description:'Einlass zum ZAM Sommernacht-Konzert, 28. Juni.', voucher_id:'ZAM-EV1123', status:'redeemed', expires_at: new Date(Date.now()-2*86400000).toISOString(), earned_at: new Date(Date.now()-5*86400000).toISOString(), redeemed_at: new Date(Date.now()-2*86400000).toISOString() },
  ];
  _saveRewards(demos);
}

function _generateVoucherId() {
  return 'ZAM-' + Math.random().toString(36).slice(2,6).toUpperCase() + Math.floor(Math.random()*9000+1000);
}

function renderRewards() {
  _seedRewards();
  const container = document.getElementById('rewards-content');
  if (!container) return;
  const rewards = _getRewards();
  const user = ZAMApi.auth.currentUser();
  const pts = user?.points || 0;

  const available = rewards.filter(r => r.status === 'available');
  const redeemed  = rewards.filter(r => r.status === 'redeemed');

  // Update profile badge
  const badge = document.getElementById('rewards-count-badge');
  if (badge) { badge.textContent = available.length; badge.style.display = available.length ? 'block' : 'none'; }

  const typeLabel = { challenge:'🏆 Challenge', points:'⭐ Punkte', event:'🎫 Event', spin_prize:'🎰 Spin-Gewinn' };
  const statusStyle = {
    available: 'background:rgba(16,185,129,0.12);color:#34d399;border:1px solid rgba(52,211,153,0.25)',
    redeemed:  'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.35);border:1px solid rgba(255,255,255,0.08)',
    expired:   'background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.15)',
  };
  const statusLabel = { available:'✅ Verfügbar', redeemed:'✓ Eingelöst', expired:'⌛ Abgelaufen' };

  function rewardCard(r) {
    const isAvail = r.status === 'available';
    const exp = new Date(r.expires_at);
    const daysLeft = Math.ceil((exp - Date.now()) / 86400000);
    return `
    <div style="background:#212121;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:16px;margin-bottom:12px;${isAvail ? '' : 'opacity:0.6'}">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px">
        <div style="width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0">${r.merchant_icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.94rem;font-weight:800;color:#e2e8f0;line-height:1.2;margin-bottom:3px">${escHtml(r.title)}</div>
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">${escHtml(r.merchant_name)}</div>
        </div>
        <span style="font-size:0.62rem;font-weight:700;padding:4px 9px;border-radius:20px;white-space:nowrap;${statusStyle[r.status]}">${statusLabel[r.status]}</span>
      </div>
      <div style="font-size:0.75rem;color:rgba(255,255,255,0.45);margin-bottom:12px;line-height:1.5">${escHtml(r.description)}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <span style="font-size:0.62rem;padding:3px 9px;border-radius:20px;background:rgba(250,70,21,0.12);color:#ff6b3d;border:1px solid rgba(250,70,21,0.2)">${typeLabel[r.type]||r.type}</span>
        <span style="font-size:0.62rem;color:rgba(255,255,255,0.3)">ID: ${r.voucher_id}</span>
        ${r.status === 'redeemed'
          ? `<span style="font-size:0.62rem;color:rgba(255,255,255,0.3)">✓ Eingelöst am ${new Date(r.redeemed_at).toLocaleDateString('de-DE')}</span>`
          : _countdownBadge(r.expires_at)}
      </div>
      ${isAvail ? `
        <div style="display:flex;gap:8px">
          <button onclick="showQRVoucher('${r.id}')" style="flex:1;padding:11px;background:linear-gradient(135deg,#c43510,#FA4615);border:none;color:#fff;border-radius:12px;font-size:0.82rem;font-weight:800;font-family:var(--font);cursor:pointer">📱 QR-Code anzeigen</button>
          <button onclick="markRewardRedeemed('${r.id}')" style="flex:1;padding:11px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:12px;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer">✓ Als eingelöst markieren</button>
        </div>` : ''}
    </div>`;
  }

  // Points catalog
  const catalogHtml = POINTS_CATALOG.map(p => {
    const canAfford = pts >= p.points;
    return `
    <div style="background:#212121;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px;margin-bottom:10px;display:flex;align-items:center;gap:12px">
      <div style="font-size:2rem;flex-shrink:0">${p.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.88rem;font-weight:800;color:#e2e8f0">${p.title}</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-top:2px">${p.merchant}</div>
        <div style="font-size:0.7rem;color:#F7AB00;margin-top:3px;font-weight:700">⭐ ${p.points.toLocaleString('de-DE')} Punkte</div>
      </div>
      <button onclick="redeemPointsReward('${p.id}')" ${canAfford ? '' : 'disabled'} style="padding:9px 14px;border-radius:10px;font-size:0.75rem;font-weight:800;font-family:var(--font);cursor:${canAfford ? 'pointer' : 'default'};border:none;background:${canAfford ? 'linear-gradient(135deg,#8a5f00,#F7AB00)' : 'rgba(255,255,255,0.05)'};color:${canAfford ? '#fff' : 'rgba(255,255,255,0.25)'};white-space:nowrap">${canAfford ? 'Einlösen' : 'Zu wenig'}</button>
    </div>`;
  }).join('');

  container.innerHTML = `
  <!-- Hero -->
  <div style="background:linear-gradient(160deg,#1e1616,#1a1a1a,#1a1a1a);padding:0 20px 24px">
    <div style="display:flex;align-items:center;gap:12px;padding:14px 0 16px">
      <button onclick="navigateTo('profile')" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:#F7AB00">Mein ZAM Club</span>
    </div>
    <h1 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:8px">🎁 Meine Belohnungen</h1>
    <p style="font-size:0.8rem;color:rgba(255,255,255,0.45);line-height:1.6">Aktive Gutscheine, Challenge-Prämien und Punkte-Belohnungen</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <div style="background:rgba(247,171,0,0.1);border:1px solid rgba(247,171,0,0.2);border-radius:12px;padding:12px">
        <div style="font-size:0.63rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:800;color:rgba(247,171,0,0.7);margin-bottom:4px">Verfügbar</div>
        <div style="font-size:1.6rem;font-weight:900;color:#F7AB00">${available.length}</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">Gutscheine</div>
      </div>
      <div style="background:rgba(250,70,21,0.1);border:1px solid rgba(250,70,21,0.2);border-radius:12px;padding:12px">
        <div style="font-size:0.63rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:800;color:rgba(250,70,21,0.7);margin-bottom:4px">Meine Punkte</div>
        <div style="font-size:1.6rem;font-weight:900;color:#ffb399">${(pts||0).toLocaleString('de-DE')}</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">⭐ Punkte</div>
      </div>
    </div>
  </div>

  <!-- Active rewards -->
  <div style="padding:20px 16px 0">
    <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:14px">🎫 Aktive Gutscheine (${available.length})</div>
    ${available.length ? available.map(rewardCard).join('') : '<div style="text-align:center;padding:24px;color:rgba(255,255,255,0.3);font-size:0.82rem">Noch keine aktiven Gutscheine.<br>Schließe eine Challenge ab!</div>'}
  </div>

  <!-- Points catalog -->
  <div style="padding:20px 16px 0">
    <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:6px">⭐ Punkte-Prämien</div>
    <div style="font-size:0.72rem;color:rgba(255,255,255,0.35);margin-bottom:14px">Du hast <strong style="color:#F7AB00">${(pts||0).toLocaleString('de-DE')} Punkte</strong>. Tausche sie gegen Prämien ein.</div>
    ${catalogHtml}
  </div>

  <!-- Redeemed -->
  ${redeemed.length ? `<div style="padding:20px 16px 0">
    <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:14px">✓ Bereits eingelöst (${redeemed.length})</div>
    ${redeemed.map(rewardCard).join('')}
  </div>` : ''}
`;
}

let _qrCodeInstance = null;
let _qrExpiryTimer  = null;

function showQRVoucher(rewardId) {
  const rewards = _getRewards();
  const r = rewards.find(x => x.id === rewardId);
  if (!r) return;

  const modal = document.getElementById('qr-voucher-modal');
  const body  = document.getElementById('qr-voucher-body');
  if (!modal || !body) return;

  // Set/refresh 15-min expiry
  const now = Date.now();
  r.qr_expires_at = new Date(now + 15 * 60 * 1000).toISOString();
  _saveRewards(rewards);

  function renderQR() {
    const remaining = Math.max(0, new Date(r.qr_expires_at) - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const expired = remaining <= 0;

    body.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;text-align:left">
      <div style="font-size:2rem">${r.merchant_icon}</div>
      <div>
        <div style="font-size:1rem;font-weight:800;color:#fff">${escHtml(r.title)}</div>
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.45)">${escHtml(r.merchant_name)}</div>
      </div>
    </div>
    ${expired ? `
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:14px;padding:20px;text-align:center;margin-bottom:16px">
        <div style="font-size:1.5rem;margin-bottom:8px">⌛</div>
        <div style="font-size:0.9rem;font-weight:700;color:#f87171;margin-bottom:6px">QR-Code abgelaufen</div>
        <div style="font-size:0.75rem;color:rgba(255,255,255,0.4)">Aus Sicherheitsgründen ist der Code nicht mehr gültig.</div>
      </div>
      <button onclick="showQRVoucher('${r.id}')" style="width:100%;padding:13px;background:linear-gradient(135deg,#c43510,#FA4615);border:none;color:#fff;border-radius:12px;font-size:0.85rem;font-weight:800;font-family:var(--font);cursor:pointer;margin-bottom:10px">🔄 QR-Code erneuern</button>` : `
      <div id="qr-code-display" style="background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;display:flex;align-items:center;justify-content:center;min-height:180px"></div>
      <div style="background:${remaining < 120000 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.08)'};border:1px solid ${remaining < 120000 ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.2)'};border-radius:10px;padding:10px;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:8px">
        <span style="font-size:0.8rem">${remaining < 120000 ? '⚠️' : '🔒'}</span>
        <span style="font-size:0.78rem;font-weight:700;color:${remaining < 120000 ? '#f87171' : '#34d399'}">Gültig noch ${mins}:${secs.toString().padStart(2,'0')} Min</span>
      </div>`}
    <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:0.7rem;color:rgba(255,255,255,0.4)">Gutschein-ID</span>
      <span style="font-size:0.78rem;font-weight:800;color:#e2e8f0;letter-spacing:0.08em">${r.voucher_id}</span>
    </div>
    <button onclick="closeQRVoucher()" style="width:100%;padding:12px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:12px;font-size:0.82rem;font-weight:700;font-family:var(--font);cursor:pointer">Schließen</button>`;

    if (!expired) {
      const qrEl = document.getElementById('qr-code-display');
      if (qrEl) {
        qrEl.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
          new QRCode(qrEl, { text: `ZAM:${r.voucher_id}:${r.qr_expires_at}`, width:160, height:160, colorDark:'#1a1a1a', colorLight:'#ffffff' });
        } else {
          qrEl.innerHTML = `<div style="text-align:center;color:#1a1a1a;font-weight:800;font-size:0.9rem;padding:20px">${r.voucher_id}<br><span style="font-size:0.7rem;font-weight:400;opacity:0.6">Dem Händler zeigen</span></div>`;
        }
      }
    }
  }

  renderQR();
  modal.style.display = 'flex';

  if (_qrExpiryTimer) clearInterval(_qrExpiryTimer);
  _qrExpiryTimer = setInterval(() => {
    if (!document.getElementById('qr-voucher-modal') || document.getElementById('qr-voucher-modal').style.display === 'none') { clearInterval(_qrExpiryTimer); return; }
    renderQR();
    if (new Date(r.qr_expires_at) <= Date.now()) clearInterval(_qrExpiryTimer);
  }, 1000);
}

function closeQRVoucher() {
  const m = document.getElementById('qr-voucher-modal');
  if (m) m.style.display = 'none';
  if (_qrExpiryTimer) { clearInterval(_qrExpiryTimer); _qrExpiryTimer = null; }
}

function markRewardRedeemed(rewardId) {
  if (!confirm('Gutschein als eingelöst markieren?')) return;
  const rewards = _getRewards();
  const r = rewards.find(x => x.id === rewardId);
  if (r) { r.status = 'redeemed'; r.redeemed_at = new Date().toISOString(); _saveRewards(rewards); renderRewards(); showToast('✓ Gutschein eingelöst!'); }
}

function redeemPointsReward(catalogId) {
  const item = POINTS_CATALOG.find(p => p.id === catalogId);
  if (!item) return;
  const user = ZAMApi.auth.currentUser();
  if (!user || (user.points || 0) < item.points) { showToast('Nicht genug Punkte'); return; }
  if (!confirm(`${item.title} für ${item.points} Punkte einlösen?`)) return;
  user.points = (user.points || 0) - item.points;
  ZAMData.currentUser = { ...ZAMData.currentUser, points: user.points };
  try {
    const g = JSON.parse(localStorage.getItem('zamclub_global')||'{}');
    if (g.session_user) g.session_user.points = user.points;
    const acc = (g.accounts||[]).find(a => a.id === user.id);
    if (acc) acc.points = user.points;
    localStorage.setItem('zamclub_global', JSON.stringify(g));
  } catch {}
  const rewards = _getRewards();
  rewards.unshift({ id:'rew_'+Date.now(), type:'points', merchant_name:item.merchant, merchant_icon:item.icon, title:item.title, description:item.description, voucher_id:_generateVoucherId(), status:'available', points_cost:item.points, expires_at:new Date(Date.now()+30*86400000).toISOString(), earned_at:new Date().toISOString() });
  _saveRewards(rewards);
  renderRewards();
  showToast(`🎁 ${item.title} freigeschaltet!`);
}

function _awardChallengeReward(challengeId) {
  const ch = _getChallenges().find(c => c.id === challengeId);
  if (!ch) return;
  const rewards = _getRewards();
  if (rewards.some(r => r.challenge_id === challengeId && r.status !== 'expired')) return;
  rewards.unshift({ id:'rew_'+Date.now(), type:'challenge', merchant_name:ch.merchant_name, merchant_icon:ch.merchant_icon, title:ch.reward_description, description:`Belohnung für: ${ch.title}`, voucher_id:_generateVoucherId(), status:'available', challenge_id:challengeId, expires_at:new Date(Date.now()+30*86400000).toISOString(), earned_at:new Date().toISOString() });
  _saveRewards(rewards);
  showToast(`🎁 Belohnung freigeschaltet: ${ch.reward_description}`);
}

// ═══════════════════════════════════════════════
// REFERRAL SYSTEM
// ═══════════════════════════════════════════════

// Storage helpers for fraud-safe referrals
function _loadReferrals() {
  return JSON.parse(localStorage.getItem('zam_referrals_v2') || '[]');
}
function _saveReferrals(list) {
  localStorage.setItem('zam_referrals_v2', JSON.stringify(list));
}

// Create a pending referral when someone uses a code at registration
function _createReferral(referrerId, referrerName, invitedId, invitedName) {
  const list = _loadReferrals();
  if (list.find(r => r.invited_id === invitedId)) return; // already tracked
  list.push({
    referrer_id: referrerId,
    referrer_name: referrerName,
    invited_id: invitedId,
    invited_name: invitedName,
    invited_points: 0,
    invited_days: 0,
    invited_merchants: 0,
    email_confirmed: false,
    bonus_unlocked: false,
    created_at: new Date().toISOString(),
    unlocked_at: null,
  });
  _saveReferrals(list);
}

// Check all pending referrals and unlock bonuses if conditions met
async function _checkReferralBonuses() {
  const user = ZAMApi.auth.currentUser();
  if (!user) return;
  const list = _loadReferrals();
  let changed = false;
  for (const ref of list) {
    if (ref.bonus_unlocked) continue;
    if (!ref.invited_id) continue;
    // In demo mode: simulate invited user progress from their stored data
    const invitedData = JSON.parse(localStorage.getItem('zamclub_u_' + ref.invited_id) || '{}');
    ref.invited_points = invitedData.points || 0;
    ref.email_confirmed = true; // assume confirmed in demo
    const createdDate = new Date(ref.created_at);
    ref.invited_days = Math.floor((Date.now() - createdDate.getTime()) / 86400000);
    const checkins = JSON.parse(localStorage.getItem('zam_checkins') || '[]');
    const merchantsVisited = new Set(checkins.filter(c => c.user_id === ref.invited_id).map(c => c.merchant_id)).size;
    ref.invited_merchants = merchantsVisited;
    const meetsActivity = ref.invited_days >= 14 || ref.invited_merchants >= 3;
    if (ref.invited_points >= 2000 && ref.email_confirmed && meetsActivity) {
      ref.bonus_unlocked = true;
      ref.unlocked_at = new Date().toISOString();
      changed = true;
      // Pay referrer if they are the current user
      if (ref.referrer_id === user.id) {
        await ZAMApi.points.add(250, 'referral_bonus', 'Einladungsbonus freigeschaltet');
        updatePointsDisplay(true);
        showToast(`🎉 ${ref.invited_name} hat die Bedingungen erfüllt! +250 Punkte für dich!`, 'success');
      }
    }
  }
  if (changed) _saveReferrals(list);
}

function _getReferralSummary(userId) {
  const list = _loadReferrals().filter(r => r.referrer_id === userId);
  const unlocked = list.filter(r => r.bonus_unlocked);
  const pending  = list.filter(r => !r.bonus_unlocked && r.invited_id);
  return { list, unlocked, pending, totalPts: unlocked.length * 250 };
}

function _getReferralCode(user) {
  if (!user) return null;
  const key = 'zam_referral_' + user.id;
  let code = localStorage.getItem(key);
  if (!code) {
    code = 'ZAM' + (user.username || user.id).slice(0,4).toUpperCase() + Math.floor(Math.random()*900+100);
    localStorage.setItem(key, code);
  }
  return code;
}

function openReferralSheet() {
  const sheet = document.getElementById('referral-sheet');
  const body  = document.getElementById('referral-sheet-body');
  if (!sheet || !body) return;
  const user = ZAMApi.auth.currentUser();
  const code = _getReferralCode(user);
  _checkReferralBonuses();
  const { unlocked, pending, totalPts } = _getReferralSummary(user?.id || 'guest');

  const pendingRows = pending.map(r => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:0.78rem;font-weight:700;color:#e2e8f0">${r.invited_name || 'Freund'}</div>
        <div style="font-size:0.67rem;color:rgba(255,255,255,0.35);margin-top:2px">
          ${r.invited_points.toLocaleString('de-DE')} / 2.000 Pkt · ${r.invited_days}d · ${r.invited_merchants} Händler
        </div>
        <div style="margin-top:5px;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${Math.min(100,r.invited_points/20)}%;background:linear-gradient(90deg,#FA4615,#F7AB00);border-radius:2px"></div>
        </div>
      </div>
      <div style="font-size:0.68rem;font-weight:700;color:#F7AB00;background:rgba(247,171,0,0.12);border:1px solid rgba(247,171,0,0.2);border-radius:8px;padding:3px 8px;white-space:nowrap">⏳ Ausstehend</div>
    </div>`).join('');

  const unlockedRows = unlocked.map(r => `
    <div style="background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-size:0.78rem;font-weight:700;color:#e2e8f0">${r.invited_name || 'Freund'}</div>
        <div style="font-size:0.67rem;color:rgba(255,255,255,0.35);margin-top:2px">${r.invited_points.toLocaleString('de-DE')} Pkt · +250 Pkt für dich</div>
      </div>
      <div style="font-size:0.68rem;font-weight:700;color:#34d399;background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.2);border-radius:8px;padding:3px 8px;white-space:nowrap">✅ Freigeschaltet</div>
    </div>`).join('');

  body.innerHTML = `
    <h2 style="font-size:1.2rem;font-weight:900;color:#fff;margin-bottom:6px">👥 Freunde einladen</h2>
    <p style="font-size:0.78rem;color:rgba(255,255,255,0.45);margin-bottom:16px;line-height:1.6">Dein Freund muss <strong style="color:#fff">2.000 Punkte</strong> sammeln und mindestens <strong style="color:#fff">14 Tage</strong> aktiv sein oder <strong style="color:#fff">3 Händler</strong> besucht haben. Dann erhältst du <strong style="color:#F7AB00">+250 Punkte</strong>, dein Freund <strong style="color:#F7AB00">+100 Bonuspunkte</strong>.</p>
    <div style="background:rgba(250,70,21,0.1);border:2px dashed rgba(250,70,21,0.35);border-radius:14px;padding:18px;text-align:center;margin-bottom:14px">
      <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:rgba(250,70,21,0.7);margin-bottom:8px">Dein Einladungs-Code</div>
      <div style="font-size:2rem;font-weight:900;letter-spacing:0.12em;color:#ffb399;font-family:monospace">${code}</div>
      <button onclick="navigator.clipboard?.writeText('${code}').then(()=>showToast('✓ Code kopiert!'))" style="margin-top:12px;padding:8px 20px;background:rgba(250,70,21,0.2);border:1px solid rgba(250,70,21,0.3);color:#ffb399;border-radius:10px;font-family:var(--font);font-size:0.78rem;font-weight:700;cursor:pointer">📋 Code kopieren</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:1.6rem;font-weight:900;color:#ffb399">${unlocked.length + pending.length}</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">Eingeladene Freunde</div>
      </div>
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:1.6rem;font-weight:900;color:#F7AB00">${totalPts}</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">Punkte verdient</div>
      </div>
    </div>
    ${(pendingRows || unlockedRows) ? `
    <div style="margin-bottom:14px">
      <div style="font-size:0.7rem;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Meine Einladungen</div>
      ${pendingRows}${unlockedRows}
    </div>` : ''}
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:0.7rem;font-weight:700;color:rgba(255,255,255,0.35);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.06em">Bedingungen</div>
      ${[['✅ Registriert','Freund hat einen ZAM-Account erstellt'],['✅ E-Mail bestätigt','Registrierung abgeschlossen'],['📊 2.000 Punkte','Freund muss 2.000 Punkte sammeln'],['⏱ 14 Tage aktiv ODER','Mindestens 14 Tage seit Registrierung'],['🏪 3 Händler besucht','Check-in bei 3 verschiedenen Händlern']].map(([icon,d]) => `
      <div style="display:flex;gap:10px;margin-bottom:7px;align-items:flex-start">
        <div style="font-size:0.72rem;font-weight:800;color:#ffb399;flex-shrink:0;width:130px">${icon}</div>
        <div style="font-size:0.68rem;color:rgba(255,255,255,0.35)">${d}</div>
      </div>`).join('')}
    </div>
    <button onclick="closeReferralSheet()" style="width:100%;padding:13px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:12px;font-size:0.84rem;font-weight:700;font-family:var(--font);cursor:pointer">Schließen</button>`;
  sheet.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeReferralSheet() {
  const s = document.getElementById('referral-sheet');
  if (s) s.style.display = 'none';
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════
// SHARE / INVITE DIALOG
// ═══════════════════════════════════════════════

function openShareDialog() {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const code = _getReferralCode(user) || 'DEMO250';
  const link = `https://zamclub.de/invite/${code}`;
  const refKey = 'zam_referrals_' + (user?.id || 'guest');
  const refCount = JSON.parse(localStorage.getItem(refKey) || '[]').length;

  const linkEl = document.getElementById('share-invite-link');
  const codeEl = document.getElementById('share-invite-code');
  const countEl = document.getElementById('share-ref-count');
  const ptsEl   = document.getElementById('share-ref-pts');
  if (linkEl) linkEl.textContent = link;
  if (codeEl) codeEl.textContent = code;
  if (countEl) countEl.textContent = refCount;
  if (ptsEl)   ptsEl.textContent  = refCount * 250;

  const d = document.getElementById('share-dialog');
  if (d) d.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeShareDialog() {
  const d = document.getElementById('share-dialog');
  if (d) d.style.display = 'none';
  document.body.style.overflow = '';
}

function copyShareLink() {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const code = _getReferralCode(user) || 'DEMO250';
  const link = `https://zamclub.de/invite/${code}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => showToast('✓ Link kopiert!'));
  } else {
    showToast('✓ ' + link);
  }
}

function shareWhatsApp() {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const code = _getReferralCode(user) || 'DEMO250';
  const msg = encodeURIComponent(`Hey! Ich nutze die ZAM Club App und lade dich ein. Meld dich mit meinem Code ${code} an und wir bekommen beide Punkte! 🎉\nhttps://zamclub.de/invite/${code}`);
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

// ═══════════════════════════════════════════════
// EVENT CHECK-IN
// ═══════════════════════════════════════════════

// ── Event Check-In with Location Verification ──────────────────
const _EVT_CHECKIN_KEY = 'zam_event_checkins_v2'; // {eventId, userId, ts, lat, lng}
const EVT_CHECKIN_RADIUS_M = 100; // metres from ZAM centre

function _getEventCheckins() {
  try { return JSON.parse(localStorage.getItem(_EVT_CHECKIN_KEY)||'[]'); } catch { return []; }
}
function _saveEventCheckins(c) { localStorage.setItem(_EVT_CHECKIN_KEY, JSON.stringify(c)); }

function _isEventCheckedIn(eventId) {
  const user = ZAMApi.auth.currentUser();
  if (!user) return false;
  return _getEventCheckins().some(c => c.eventId === eventId && c.userId === user.id);
}

function _eventCheckinBtn(evt) {
  const pts = evt.points_reward || 50;
  if (_isEventCheckedIn(evt.id)) {
    return '<div style="width:100%;margin-top:10px;padding:11px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);color:#34d399;border-radius:10px;font-size:0.82rem;font-weight:700;text-align:center">✅ Eingecheckt • +' + pts + ' Punkte erhalten</div>';
  }
  const tw = _checkEventTimeWindow(evt.id);
  if (!tw.ok) {
    const icon  = tw.reason === 'before' ? '⏳' : '🔒';
    const label = tw.reason === 'before' ? 'Event noch nicht gestartet' : 'Event beendet';
    return '<div style="width:100%;margin-top:10px;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.35);border-radius:10px;font-size:0.75rem;font-weight:600;text-align:center">' + icon + ' ' + label + '</div>';
  }
  const safeId    = evt.id.replace(/'/g, '');
  const safeTitle = (evt.title||'').replace(/'/g, '').replace(/"/g, '');
  return '<button onclick="eventCheckIn(\''+safeId+'\',\''+safeTitle+'\','+pts+')" style="width:100%;margin-top:10px;padding:11px;background:rgba(16,185,129,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:10px;font-size:0.82rem;font-weight:700;font-family:var(--font);cursor:pointer">📍 Vor Ort einchecken • +' + pts + ' Punkte</button>';
}
// Store pending check-in context to avoid inline onclick escaping
let _pendingCheckin = null;

function eventCheckIn(eventId, eventName, pts) {
  const user = ZAMApi.auth.currentUser();
  if (!user) { showToast('Bitte einloggen'); return; }
  if (_isEventCheckedIn(eventId)) { showToast('Du hast dich bei diesem Event bereits eingecheckt!', 'info'); return; }
  _pendingCheckin = { eventId, eventName, points: pts || 50 };

  _buildMerchantModal('_evt_checkin_modal', '📍 Vor Ort einchecken',
    '<div style="text-align:center;padding:8px 0 20px">' +
      '<div style="font-size:2.5rem;margin-bottom:12px">📍</div>' +
      '<div style="font-size:0.92rem;font-weight:800;color:#fff;margin-bottom:8px">' + escHtml(eventName) + '</div>' +
      '<div style="font-size:0.75rem;color:rgba(255,255,255,0.45);line-height:1.6;margin-bottom:20px">Um die Prämie zu erhalten, musst du dich im ZAM-Bereich befinden.<br>Dein Standort wird nur kurz geprüft und nicht gespeichert.</div>' +
      '<div id="_evt_ci_status" style="font-size:0.8rem;color:rgba(255,255,255,0.5);min-height:24px;margin-bottom:16px">Klicke unten um deinen Standort zu prüfen.</div>' +
    '</div>' +
    '<button id="_evt_ci_btn" onclick="_doEventCheckinFlow()" style="width:100%;background:#FA4615;border:none;border-radius:12px;padding:13px;color:#fff;font-size:0.88rem;font-weight:800;font-family:var(--font);cursor:pointer">📍 Standort prüfen & einchecken</button>' +
    '<button onclick="_merchantModalClose(\'_evt_checkin_modal\')" style="width:100%;margin-top:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:11px;color:rgba(255,255,255,0.45);font-size:0.78rem;font-weight:600;font-family:var(--font);cursor:pointer">Abbrechen</button>'
  );
}

// Check-in grace window before event start (minutes)
const EVT_CHECKIN_GRACE_MIN = 30;

function _getEventTimeWindow(eventId) {
  const allEvts = (state.events && state.events.length) ? state.events : (ZAMData.events || []);
  const evt = allEvts.find(e => e.id === eventId);
  if (!evt) return null;
  const dateIso = evt.date_iso || evt.date || null;
  if (!dateIso) return null;
  // Support optional end_date for multi-day events
  const endDateIso = evt.end_date_iso || evt.end_date || dateIso;
  const timeStart  = evt.time_start || '00:00';
  const timeEnd    = evt.time_end   || '23:59';
  const start = new Date(dateIso    + 'T' + timeStart + ':00');
  const end   = new Date(endDateIso + 'T' + timeEnd   + ':00');
  return { start, end, evt };
}

function _checkEventTimeWindow(eventId) {
  const win = _getEventTimeWindow(eventId);
  if (!win) return { ok: true, reason: null }; // no date info → allow
  const now   = Date.now();
  const grace = EVT_CHECKIN_GRACE_MIN * 60 * 1000;
  if (now < win.start.getTime() - grace) {
    const fmt = win.start.toLocaleString('de-DE', { day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit' });
    return { ok: false, reason: 'before', msg: 'Dieses Event hat noch nicht begonnen. Check-in möglich ab ' + fmt + ' Uhr.' };
  }
  if (now > win.end.getTime()) {
    const fmt = win.end.toLocaleString('de-DE', { day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit' });
    return { ok: false, reason: 'after', msg: 'Dieses Event ist bereits beendet (Ende: ' + fmt + ' Uhr).' };
  }
  return { ok: true, reason: null };
}

function _doEventCheckinFlow() {
  const { eventId, eventName, points } = _pendingCheckin || {};
  if (!eventId) return;
  const btn    = document.getElementById('_evt_ci_btn');
  const status = document.getElementById('_evt_ci_status');

  // ── Step 1: time-window check ──
  const timeCheck = _checkEventTimeWindow(eventId);
  if (!timeCheck.ok) {
    if (btn) { btn.disabled = false; btn.textContent = '📍 Standort prüfen & einchecken'; }
    if (status) { status.textContent = '⏰ ' + timeCheck.msg; status.style.color = '#f87171'; }
    showToast(timeCheck.msg, 'error');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '🔄 Prüfe Standort…'; }
  if (status) status.textContent = '📡 Standort wird ermittelt…';

  // ── Step 2: location check ──
  if (!navigator.geolocation) {
    // Desktop/no-GPS demo fallback
    if (status) status.textContent = '⚠️ GPS nicht verfügbar (Demo-Modus aktiv)';
    _finalizeEventCheckin(eventId, eventName, points, null, null, 'no_geo');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat  = pos.coords.latitude;
      const lng  = pos.coords.longitude;
      const dist = Math.round(_geoDistance(lat, lng, ZAM_LAT, ZAM_LNG));
      if (status) status.textContent = '📍 Abstand zum ZAM: ' + dist + ' m';

      if (dist > EVT_CHECKIN_RADIUS_M) {
        if (btn) { btn.disabled = false; btn.textContent = '📍 Standort prüfen & einchecken'; }
        if (status) { status.textContent = '❌ Du bist ' + dist + ' m entfernt — zu weit vom ZAM.'; status.style.color = '#f87171'; }
        showToast('Du musst vor Ort im ZAM sein, um einzuchecken.', 'error');
        return;
      }
      _finalizeEventCheckin(eventId, eventName, points, lat, lng, 'geo_ok');
    },
    () => {
      if (status) status.textContent = '⚠️ Standort nicht verfügbar (Demo-Modus)';
      _finalizeEventCheckin(eventId, eventName, points, null, null, 'geo_denied');
    },
    { timeout: 8000, maximumAge: 30000, enableHighAccuracy: false }
  );
}

async function _finalizeEventCheckin(eventId, eventName, points, lat, lng, mode) {
  const user = ZAMApi.auth.currentUser();
  if (!user) return;

  // Save check-in record (no raw coords stored — only confirmation)
  const checkins = _getEventCheckins();
  checkins.push({
    eventId,
    userId:  user.id,
    ts:      Date.now(),
    mode,                        // 'geo_ok' | 'geo_denied' | 'no_geo'
    verified: mode === 'geo_ok'  // true only when GPS confirmed within radius
  });
  _saveEventCheckins(checkins);

  // Award points
  user.points = (user.points||0) + points;
  ZAMData.currentUser = { ...ZAMData.currentUser, points: user.points };
  try {
    const g = JSON.parse(localStorage.getItem('zamclub_global')||'{}');
    if (g.session_user) g.session_user.points = user.points;
    const acc = (g.accounts||[]).find(a => a.id === user.id);
    if (acc) acc.points = user.points;
    localStorage.setItem('zamclub_global', JSON.stringify(g));
  } catch {}

  updatePointsDisplay();
  await checkBadgesAfterAction();

  // Show success inside modal with optional QR
  const modal = document.getElementById('_evt_checkin_modal');
  const sheet = modal?.querySelector('div[style*="background:#212121"]') || modal;
  if (sheet) {
    const user2 = ZAMApi.auth.currentUser();
    const qrPayload = JSON.stringify({ type:'evt_checkin', eventId, userId: user2?.id, ts: Date.now() });
    const qrId = '_evt_qr_' + eventId;
    sheet.innerHTML =
      '<div style="width:40px;height:4px;background:rgba(255,255,255,0.15);border-radius:99px;margin:0 auto 18px"></div>' +
      '<div style="text-align:center;padding:12px 0 24px">' +
        '<div style="font-size:3rem;margin-bottom:12px">✅</div>' +
        '<div style="font-size:1rem;font-weight:900;color:#34d399;margin-bottom:8px">Eingecheckt!</div>' +
        '<div style="font-size:0.78rem;color:rgba(255,255,255,0.5);margin-bottom:6px">' + escHtml(eventName) + '</div>' +
        '<div style="font-size:1.1rem;font-weight:900;color:#F7AB00;margin-bottom:20px">+' + points + ' Punkte gutgeschrieben 🎉</div>' +
        '<div style="font-size:0.68rem;color:rgba(255,255,255,0.35);margin-bottom:14px">Persönlicher QR-Code für den Eventgeber:</div>' +
        '<div id="' + qrId + '" style="display:flex;justify-content:center;margin-bottom:20px"></div>' +
      '</div>' +
      '<button onclick="_merchantModalClose(\'_evt_checkin_modal\')" style="width:100%;background:#FA4615;border:none;border-radius:12px;padding:12px;color:#fff;font-size:0.85rem;font-weight:700;font-family:var(--font);cursor:pointer">Fertig</button>';

    // Render QR code
    setTimeout(() => {
      const qrEl = document.getElementById(qrId);
      if (qrEl && typeof QRCode !== 'undefined') {
        new QRCode(qrEl, { text: qrPayload, width:160, height:160, colorDark:'#ffffff', colorLight:'#1a1a1a' });
      }
    }, 100);
  }

  showToast('✅ Eingecheckt! +' + points + ' Punkte', 'success');
  renderEvents();
}

// ── Meine Events page ─────────────────────────────────────────
function renderMyEvents() {
  const container = document.getElementById('my-events-content');
  if (!container) return;
  const user = ZAMApi.auth.currentUser();
  if (!user) return;

  const joinedKey = 'zam_joined_events_' + user.id;
  const joined    = JSON.parse(localStorage.getItem(joinedKey)||'[]'); // [{id, title, date, pts}]
  const checkins  = _getEventCheckins().filter(c => c.userId === user.id);
  const allEvents = (state.events && state.events.length) ? state.events : (ZAMData.events || []);

  if (!joined.length && !allEvents.filter(e => e.is_joined).length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.35);font-size:0.82rem">Noch keine Events angemeldet.</div>';
    return;
  }

  const myEvts = allEvents.filter(e => e.is_joined);
  container.innerHTML = myEvts.map(evt => {
    const ci = checkins.find(c => c.eventId === evt.id);
    const checkedIn = !!ci;
    return '<div style="margin:0 16px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<div style="font-size:1.8rem">' + ({'Food':'🍜','Kultur':'🎵','Sport':'🏋️','Shopping':'👗','Community':'👥'}[evt.category?.split(' ')[0]] || '🎉') + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:0.88rem;font-weight:800;color:#fff">' + escHtml(evt.title) + '</div>' +
          '<div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:2px">📅 ' + (evt.date_formatted||evt.date||'') + ' · ' + (evt.location||'ZAM Freiham') + '</div>' +
        '</div>' +
        '<span style="font-size:0.6rem;font-weight:700;padding:3px 8px;border-radius:6px;background:' + (checkedIn ? 'rgba(52,211,153,0.12)' : 'rgba(59,130,246,0.12)') + ';color:' + (checkedIn ? '#34d399' : '#60a5fa') + ';border:1px solid ' + (checkedIn ? 'rgba(52,211,153,0.25)' : 'rgba(59,130,246,0.25)') + '">' + (checkedIn ? '✅ Eingecheckt' : '📋 Angemeldet') + '</span>' +
      '</div>' +
      (!checkedIn ?
        '<button class="_mye_ci_btn" data-evtid="' + evt.id + '" data-evttitle="' + (evt.title||'').replace(/"/g,'&quot;') + '" data-pts="' + (evt.points_reward||50) + '" style="width:100%;padding:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:10px;font-size:0.8rem;font-weight:700;font-family:var(--font);cursor:pointer">📍 Vor Ort einchecken • +' + (evt.points_reward||50) + ' Punkte</button>'
        : '<div style="font-size:0.68rem;color:rgba(52,211,153,0.7);text-align:center;padding:4px 0">✅ Punkte erhalten · ' + new Date(ci.ts).toLocaleDateString("de-DE",{day:"2-digit",month:"long"}) + '</div>') +
    '</div>';
  }).join('') || '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.35);font-size:0.82rem">Noch keine Events angemeldet.</div>';

  // Wire delegated click for check-in buttons
  container.querySelectorAll('._mye_ci_btn').forEach(btn => {
    btn.addEventListener('click', () => {
      eventCheckIn(btn.dataset.evtid, btn.dataset.evttitle, parseInt(btn.dataset.pts)||50);
    });
  });
}

// ── Event Check-In Stats (Admin/Eventgeber) ───────────────────
function _renderEventCheckinStats() {
  let wrap = document.getElementById('evt-checkin-admin-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'evt-checkin-admin-wrap';
    wrap.style.cssText = 'margin:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px';
    const target = document.getElementById('admin-merchant-submissions');
    if (target) target.parentNode?.insertBefore(wrap, target);
    else return;
  }
  const checkins = _getEventCheckins();
  const byEvent  = {};
  checkins.forEach(c => {
    if (!byEvent[c.eventId]) byEvent[c.eventId] = { total:0, verified:0, pts:0 };
    byEvent[c.eventId].total++;
    if (c.verified) byEvent[c.eventId].verified++;
    byEvent[c.eventId].pts += 50;
  });
  const allEvents = state.events || ZAMData.events || [];
  const rows = allEvents.filter(e => byEvent[e.id]).map(e => {
    const s = byEvent[e.id];
    const rate = allEvents.find(ev => ev.id === e.id);
    const joined = (rate?.spots_total||500) - (rate?.spots_left||0);
    const pct    = joined ? Math.round((s.total/joined)*100) : 0;
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
      '<div style="flex:1;min-width:0"><div style="font-size:0.78rem;font-weight:700;color:#fff">' + escHtml(e.title) + '</div>' +
      '<div style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-top:2px">' + joined + ' angemeldet · ' + s.total + ' eingecheckt · ' + pct + '% Quote · ' + s.pts + ' Pkt. vergeben</div></div>' +
      '<span style="font-size:0.7rem;font-weight:800;color:#34d399">' + s.total + '</span>' +
    '</div>';
  }).join('');
  wrap.innerHTML =
    '<div style="font-size:0.78rem;font-weight:800;color:#fff;margin-bottom:12px">📊 Event Check-In Übersicht</div>' +
    (rows || '<div style="font-size:0.72rem;color:rgba(255,255,255,0.35);text-align:center;padding:12px">Noch keine Check-ins</div>');
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

// ── Merchant form modals — dynamically created, zero CSS-class dependency ──

function _merchantModalClose(id) {
  const el = document.getElementById(id);
  if (el) { el.style.opacity = '0'; el.style.transform = 'translateY(100%)'; setTimeout(() => el.remove(), 260); }
  document.body.style.overflow = '';
}

function _buildMerchantModal(id, title, bodyHtml) {
  document.getElementById(id)?.remove(); // avoid duplicates
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.82);display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(8px);transition:opacity .25s';
  overlay.addEventListener('click', e => { if (e.target === overlay) _merchantModalClose(id); });

  const sheet = document.createElement('div');
  sheet.style.cssText = `width:100%;max-width:520px;background:#212121;border-radius:24px 24px 0 0;padding:20px 20px max(40px,env(safe-area-inset-bottom,40px));max-height:90vh;overflow-y:auto;transform:translateY(100%);transition:transform .28s cubic-bezier(.32,1,.36,1),opacity .25s`;
  sheet.innerHTML = `
    <div style="width:40px;height:4px;background:rgba(255,255,255,0.15);border-radius:99px;margin:0 auto 18px"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h3 style="font-size:1.1rem;font-weight:900;color:#fff;margin:0">${title}</h3>
      <button onclick="_merchantModalClose('${id}')" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit">✕</button>
    </div>
    ${bodyHtml}`;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { overlay.style.opacity = '1'; sheet.style.transform = 'translateY(0)'; });
}

function _inp(label, id, type, placeholder, required) {
  return `<div style="margin-bottom:14px"><label style="display:block;font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.45);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em">${label}${required?' *':''}</label><input type="${type}" id="${id}" placeholder="${placeholder||''}" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:11px 13px;color:#fff;font-family:inherit;font-size:0.85rem;outline:none" ${required?'required':''}></div>`;
}
function _ta(label, id, placeholder) {
  return `<div style="margin-bottom:14px"><label style="display:block;font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.45);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em">${label} *</label><textarea id="${id}" placeholder="${placeholder||''}" rows="3" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:11px 13px;color:#fff;font-family:inherit;font-size:0.85rem;outline:none;resize:vertical" required></textarea></div>`;
}
function _sel(label, id, options) {
  return `<div style="margin-bottom:14px"><label style="display:block;font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.45);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em">${label}</label><select id="${id}" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:11px 13px;color:#fff;font-family:inherit;font-size:0.85rem;outline:none">${options}</select></div>`;
}
function _submitBtn(label, onclick) {
  return `<button onclick="${onclick}" style="width:100%;padding:14px;background:linear-gradient(135deg,#c43510,#FA4615);border:none;color:#fff;border-radius:14px;font-size:0.9rem;font-weight:800;font-family:inherit;cursor:pointer;margin-top:6px">${label}</button>`;
}

function openMerchantEventModal() {
  _buildMerchantModal('_dyn_event_modal', '📅 Event einreichen',
    _inp('Eventtitel', '_ev_title', 'text', 'z.B. Sommer-Nacht-Event', true) +
    _ta('Beschreibung', '_ev_desc', 'Was erwartet die Besucher?') +
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">` +
    _inp('Datum', '_ev_date', 'date', '', true) +
    _inp('Uhrzeit', '_ev_time', 'time', '') +
    `</div>` +
    _inp('Standort / Ort', '_ev_loc', 'text', 'z.B. EG, Stand 12') +
    _sel('Kategorie', '_ev_cat',
      '<option value="food">🍴 Food & Drink</option><option value="shopping">🛍️ Shopping</option><option value="entertainment">🎭 Entertainment</option><option value="kids">🧒 Kinder</option><option value="other">📌 Sonstiges</option>') +
    `<div style="margin-bottom:14px"><label style="display:block;font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.45);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.04em">Bild (optional)</label><input type="file" id="_ev_img" accept="image/*" onchange="_prvMerchImg('_ev_img','_ev_imgprev')" style="color:rgba(255,255,255,0.5);font-family:inherit;font-size:0.78rem"><img id="_ev_imgprev" style="display:none;width:100%;border-radius:10px;margin-top:8px;max-height:160px;object-fit:cover"></div>` +
    _submitBtn('📤 Event einreichen', 'submitNewEvent()') +
    '<button type="button" onclick="_merchantModalClose(\'_dyn_event_modal\');openVideoDrehModal()" style="width:100%;box-sizing:border-box;background:rgba(250,70,21,0.08);border:1.5px solid rgba(250,70,21,0.35);border-radius:12px;padding:12px;color:#FA4615;font-size:0.8rem;font-weight:700;font-family:var(--font);cursor:pointer;margin-top:8px">🎥 Passendes Reel produzieren lassen</button>'
  );
}

function openMerchantDealModal() {
  const merchants = (window.ZAMData?.merchants || []);
  const me = ZAMApi.auth.currentUser();
  const others = merchants.filter(m => m.id !== me?.id);
  const merchantOptions = others.map(m => {
    const n = m.name.replace(/"/g,'&quot;');
    return '<option value="' + m.id + '" data-name="' + n + '" data-icon="' + m.icon + '">' + m.icon + ' ' + n + '</option>';
  }).join('');

  _buildMerchantModal('_dyn_deal_modal', '🏷️ Deal einreichen',
    _inp('Deal-Titel', '_dl_title', 'text', 'z.B. Fitness + Burger Aktion', true) +
    _ta('Beschreibung', '_dl_desc', 'Was beinhaltet der Deal?') +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    _inp('Rabatt / Mein Vorteil', '_dl_disc', 'text', 'z.B. 20% oder 5€') +
    _inp('Gültig bis', '_dl_exp', 'date', '', true) +
    '</div>' +
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.45);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">📎 Medien (optional)</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' +
        '<label style="flex:1;min-width:70px"><input type="radio" name="_dl_media_type" value="text" checked onchange="_onDealMediaTypeChange()" style="display:none"><div class="_dl_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(250,70,21,0.4);background:rgba(250,70,21,0.15);color:#FA4615;font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">Nur Text</div></label>' +
        '<label style="flex:1;min-width:70px"><input type="radio" name="_dl_media_type" value="image" onchange="_onDealMediaTypeChange()" style="display:none"><div class="_dl_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">🖼 Bild</div></label>' +
        '<label style="flex:1;min-width:70px"><input type="radio" name="_dl_media_type" value="video" onchange="_onDealMediaTypeChange()" style="display:none"><div class="_dl_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">📹 Video</div></label>' +
        '<label style="flex:1;min-width:70px"><input type="radio" name="_dl_media_type" value="instagram" onchange="_onDealMediaTypeChange()" style="display:none"><div class="_dl_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">📸 Instagram</div></label>' +
        '<label style="flex:1;min-width:70px"><input type="radio" name="_dl_media_type" value="tiktok" onchange="_onDealMediaTypeChange()" style="display:none"><div class="_dl_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">🎵 TikTok</div></label>' +
      '</div>' +
      '<div id="_dl_media_url_wrap" style="display:none">' +
        '<input id="_dl_media_url" type="url" placeholder="Link / URL eingeben" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:11px 13px;color:#fff;font-family:inherit;font-size:0.85rem;outline:none">' +
      '</div>' +
    '</div>' +
    '<div style="margin-bottom:14px">' +
      '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:12px;background:rgba(250,70,21,0.07);border:1px solid rgba(250,70,21,0.2);border-radius:12px">' +
        '<input type="checkbox" id="_dl_partner_toggle" onchange="togglePartnerDealFields()" style="width:18px;height:18px;accent-color:#FA4615;cursor:pointer">' +
        '<div>' +
          '<div style="font-size:0.82rem;font-weight:700;color:#fff">🤝 Partner Deal</div>' +
          '<div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:1px">Kooperation mit einem anderen Händler</div>' +
        '</div>' +
      '</label>' +
    '</div>' +
    '<div id="_dl_partner_fields" style="display:none;margin-bottom:14px">' +
      '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px">' +
        '<div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.45);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.04em">Partner-Shop auswählen</div>' +
        '<select id="_dl_partner_id" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:11px 13px;color:#fff;font-family:inherit;font-size:0.85rem;outline:none;margin-bottom:10px">' +
          '<option value="">— Händler wählen —</option>' +
          merchantOptions +
        '</select>' +
        '<div style="font-size:0.65rem;color:rgba(255,255,255,0.35);padding:8px;background:rgba(247,171,0,0.08);border-radius:8px;border:1px solid rgba(247,171,0,0.15)">💡 Der Partner erhält eine Anfrage und ergänzt seinen eigenen Vorteil bevor der Deal aktiviert wird.</div>' +
      '</div>' +
    '</div>' +
    _submitBtn('📤 Deal einreichen', 'submitNewDeal()') +
    '<button type="button" onclick="_merchantModalClose(\'_dyn_deal_modal\');openVideoDrehModal()" style="width:100%;box-sizing:border-box;background:rgba(250,70,21,0.08);border:1.5px solid rgba(250,70,21,0.35);border-radius:12px;padding:12px;color:#FA4615;font-size:0.8rem;font-weight:700;font-family:var(--font);cursor:pointer;margin-top:8px">🎥 Passendes Reel produzieren lassen</button>'
  );
}

function togglePartnerDealFields() {
  const checked = document.getElementById('_dl_partner_toggle')?.checked;
  const fields = document.getElementById('_dl_partner_fields');
  if (fields) fields.style.display = checked ? 'block' : 'none';
  const submitBtn = document.querySelector('#_dyn_deal_modal button[onclick="submitNewDeal()"]');
  if (submitBtn) submitBtn.textContent = checked ? '📨 Anfrage senden' : '📤 Deal einreichen';
}

function _onDealMediaTypeChange() {
  const selected = document.querySelector('input[name="_dl_media_type"]:checked')?.value || 'text';
  document.querySelectorAll('._dl_mtype_btn').forEach(b => {
    const isActive = b.parentElement.querySelector('input').value === selected;
    b.style.background = isActive ? 'rgba(250,70,21,0.15)' : 'rgba(255,255,255,0.05)';
    b.style.color = isActive ? '#FA4615' : 'rgba(255,255,255,0.55)';
    b.style.border = isActive ? '1px solid rgba(250,70,21,0.4)' : '1px solid rgba(255,255,255,0.12)';
  });
  const urlWrap = document.getElementById('_dl_media_url_wrap');
  if (!urlWrap) return;
  urlWrap.style.display = selected === 'text' ? 'none' : 'block';
  const urlInput = document.getElementById('_dl_media_url');
  if (!urlInput) return;
  const placeholders = { image: 'Bild-URL (https://...)', video: 'Video-URL (https://...)', instagram: 'Instagram Reel-Link', tiktok: 'TikTok-Video-Link' };
  urlInput.placeholder = placeholders[selected] || 'URL';
}

function closeMerchantEventModal() { _merchantModalClose('_dyn_event_modal'); }
function closeMerchantDealModal()  { _merchantModalClose('_dyn_deal_modal'); }

function _prvMerchImg(inputId, previewId) {
  const f = document.getElementById(inputId)?.files?.[0];
  const p = document.getElementById(previewId);
  if (!f || !p) return;
  const r = new FileReader();
  r.onload = e => { p.src = e.target.result; p.style.display = 'block'; };
  r.readAsDataURL(f);
}

function submitNewEvent() {
  const title = document.getElementById('_ev_title')?.value?.trim();
  const desc  = document.getElementById('_ev_desc')?.value?.trim();
  const date  = document.getElementById('_ev_date')?.value;
  if (!title || !desc || !date) { showToast('⚠️ Titel, Beschreibung und Datum erforderlich'); return; }
  const btn = document.querySelector('#_dyn_event_modal button:last-child');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird eingereicht…'; }
  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const list = getMerchantSubmissions();
  list.unshift({ id:'evt_'+Date.now(), type:'event', status:'pending', title, description:desc, date, time:document.getElementById('_ev_time')?.value||'', location:document.getElementById('_ev_loc')?.value?.trim()||'', category:document.getElementById('_ev_cat')?.value||'other', merchantName:g.session_user?.display_name||'Demo Händler', submittedAt:new Date().toISOString() });
  saveMerchantSubmissions(list);
  setTimeout(() => { _merchantModalClose('_dyn_event_modal'); showToast('✅ Event erfolgreich eingereicht!'); }, 500);
}

function submitNewDeal() {
  const title = document.getElementById('_dl_title')?.value?.trim();
  const desc  = document.getElementById('_dl_desc')?.value?.trim();
  const exp   = document.getElementById('_dl_exp')?.value;
  const disc  = document.getElementById('_dl_disc')?.value?.trim() || '';
  if (!title || !desc || !exp) { showToast('⚠️ Titel, Beschreibung und Ablaufdatum erforderlich'); return; }

  const isPartner = document.getElementById('_dl_partner_toggle')?.checked;
  const partnerSel = document.getElementById('_dl_partner_id');
  const partnerId  = partnerSel?.value;
  const partnerName = partnerSel?.options[partnerSel.selectedIndex]?.dataset?.name || 'Partner';
  const partnerIcon = partnerSel?.options[partnerSel.selectedIndex]?.dataset?.icon || '🏪';

  if (isPartner) {
    if (!partnerId) { showToast('⚠️ Bitte einen Partner-Shop auswählen'); return; }
    const me = ZAMApi.auth.currentUser();
    const myM = (window.ZAMData?.merchants || []).find(m => m.id === me?.id) || { name: me?.display_name || 'Händler', icon: '🏪', id: me?.id };
    const req = {
      id: 'pdreq_' + Date.now(),
      status: 'pending',
      title,
      description: desc,
      expires_at: exp,
      from: { id: myM.id, name: myM.name, icon: myM.icon, benefit: disc, condition: '' },
      to:   { id: partnerId, name: partnerName, icon: partnerIcon },
      created_at: new Date().toISOString()
    };
    const reqs = _getPD2Requests();
    reqs.unshift(req);
    _savePD2Requests(reqs);
    _merchantModalClose('_dyn_deal_modal');
    showToast('📨 Anfrage gesendet! ' + partnerName + ' kann jetzt annehmen.', 'success');
    return;
  }

  // Regular deal
  const mediaType = document.querySelector('input[name="_dl_media_type"]:checked')?.value || 'text';
  const mediaUrl  = (document.getElementById('_dl_media_url')?.value || '').trim();
  const btn = document.querySelector('#_dyn_deal_modal button:last-child');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird eingereicht…'; }
  const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const list = getMerchantSubmissions();
  const dealEntry = { id:'deal_'+Date.now(), type:'deal', status:'pending', title, description:desc, discount:disc, expiry:exp, merchantName:g.session_user?.display_name||'Demo Händler', submittedAt:new Date().toISOString() };
  if (mediaType && mediaType !== 'text' && mediaUrl) { dealEntry.media_type = mediaType; dealEntry.media_url = mediaUrl; }
  list.unshift(dealEntry);
  saveMerchantSubmissions(list);
  setTimeout(() => { _merchantModalClose('_dyn_deal_modal'); showToast('✅ Deal erfolgreich eingereicht!'); }, 500);
}
// ── Spin-Gewinn einreichen (Händler) ─────────────────────────
function openSpinPrizeModal() {
  const today = new Date().toISOString().slice(0, 10);
  const inTen = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  _buildMerchantModal('_dyn_spin_modal', '🎰 Spin-Gewinn einreichen',
    _inp('_sp_title',   'Titel des Gewinns *', 'z.B. Gratis Eiskugel in der Waffel') +
    _ta ('_sp_desc',    'Beschreibung *', 'Was genau gewinnt der Nutzer? Wo einlösen?') +
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">` +
    _inp('_sp_qty',     'Anzahl verfügbar *', '10', 'number') +
    _inp('_sp_days',    'Einlösefrist (Tage) *', '14', 'number') +
    `</div>` +
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">` +
    _inp('_sp_from',    'Aktiv von *', today, 'date') +
    _inp('_sp_until',   'Aktiv bis *', inTen, 'date') +
    `</div>` +
    `<div style="margin-bottom:10px">
       <label style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.55);display:block;margin-bottom:5px">Gewinnart *</label>
       <select id="_sp_type" style="width:100%;background:#1e1e1e;border:1px solid rgba(255,255,255,0.12);color:#e2e8f0;border-radius:10px;padding:10px 12px;font-size:0.84rem;font-family:var(--font);outline:none;-webkit-appearance:none">
         <option value="gratis_product">Gratis-Produkt</option>
         <option value="2für1">2-für-1</option>
         <option value="discount">Rabatt-Coupon</option>
         <option value="upgrade">Upgrade</option>
       </select>
     </div>` +
    _ta ('_sp_terms',   'Bedingungen', 'z.B. Nur Mo–Fr, max. 1× pro Besuch') +
    _submitBtn('submitSpinPrize()', '🎰 Spin-Gewinn einreichen')
  );
}

function submitSpinPrize() {
  const title = document.getElementById('_sp_title')?.value?.trim();
  const desc  = document.getElementById('_sp_desc')?.value?.trim();
  const qty   = parseInt(document.getElementById('_sp_qty')?.value) || 0;
  const days  = parseInt(document.getElementById('_sp_days')?.value) || 14;
  const from  = document.getElementById('_sp_from')?.value;
  const until = document.getElementById('_sp_until')?.value;
  const type  = document.getElementById('_sp_type')?.value || 'gratis_product';
  const terms = document.getElementById('_sp_terms')?.value?.trim() || '';
  if (!title || !desc || !qty || !from || !until) {
    showToast('⚠️ Bitte alle Pflichtfelder ausfüllen'); return;
  }
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  const newPrize = {
    id:                  'spr_' + Date.now(),
    merchant_id:         user?.id || 'merchant_demo',
    merchant_name:       user?.display_name || 'Demo Händler',
    merchant_icon:       '🏪',
    banner_color:        '#FA4615',
    title,
    description:         desc,
    reward_type:         type,
    total_quantity:      qty,
    remaining_quantity:  qty,
    active_from:         from,
    active_until:        until,
    redeem_within_days:  days,
    terms,
    status:              'pending',
    probability:         0.03,
  };
  const all = _getSpinMerchantPrizes();
  all.unshift(newPrize);
  _saveSpinMerchantPrizes(all);
  const btn = document.querySelector('#_dyn_spin_modal button:last-of-type');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird eingereicht…'; }
  setTimeout(() => {
    _merchantModalClose('_dyn_spin_modal');
    showToast('✅ Spin-Gewinn eingereicht – wartet auf Admin-Freigabe');
  }, 500);
}

// ── Admin: Spin-Gewinne verwalten ─────────────────────────────
function openAdminSpinManagement() {
  const all = _getSpinMerchantPrizes();
  const today = new Date().toISOString().slice(0, 10);
  const statusColor = { approved:'#34d399', pending:'#F7AB00', rejected:'#f87171', expired:'rgba(255,255,255,0.3)', exhausted:'rgba(255,255,255,0.3)' };
  const statusLabel = { approved:'● Live', pending:'⏳ Wartet', rejected:'✗ Abgelehnt', expired:'⌛ Abgelaufen', exhausted:'∅ Ausgeschöpft' };

  const prizeRows = all.map((p, idx) => {
    const isExpired = p.active_until < today;
    const isExhausted = p.remaining_quantity <= 0;
    const displayStatus = isExhausted ? 'exhausted' : isExpired ? 'expired' : p.status;
    return `
    <div style="background:#212121;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
        <span style="font-size:1.5rem;flex-shrink:0">${p.merchant_icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.84rem;font-weight:800;color:#e2e8f0">${escHtml(p.title)}</div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.4)">${escHtml(p.merchant_name)} · ${p.active_from} bis ${p.active_until}</div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.45);margin-top:2px">${p.remaining_quantity}/${p.total_quantity} verfügbar · ${p.redeem_within_days} Tage Einlösefrist</div>
        </div>
        <span style="font-size:0.62rem;font-weight:700;padding:3px 8px;border-radius:10px;background:rgba(255,255,255,0.06);color:${statusColor[displayStatus]||'#e2e8f0'};white-space:nowrap">${statusLabel[displayStatus]||displayStatus}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${p.status !== 'approved' && !isExpired && !isExhausted ? `<button onclick="_adminSpinAction(${idx},'approve')" style="padding:6px 12px;background:rgba(16,185,129,0.15);border:1px solid rgba(52,211,153,0.3);color:#34d399;border-radius:8px;font-size:0.68rem;font-weight:700;font-family:var(--font);cursor:pointer">✓ Freigeben</button>` : ''}
        ${p.status === 'approved' ? `<button onclick="_adminSpinAction(${idx},'deactivate')" style="padding:6px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:8px;font-size:0.68rem;font-weight:700;font-family:var(--font);cursor:pointer">✗ Deaktivieren</button>` : ''}
        ${p.status === 'pending' ? `<button onclick="_adminSpinAction(${idx},'reject')" style="padding:6px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:8px;font-size:0.68rem;font-weight:700;font-family:var(--font);cursor:pointer">✗ Ablehnen</button>` : ''}
        ${p.status !== 'approved' && !isExpired ? `<button onclick="_adminSpinAction(${idx},'prioritize')" style="padding:6px 12px;background:rgba(247,171,0,0.12);border:1px solid rgba(247,171,0,0.25);color:#F7AB00;border-radius:8px;font-size:0.68rem;font-weight:700;font-family:var(--font);cursor:pointer">↑ Priorisieren</button>` : ''}
      </div>
    </div>`;
  }).join('');

  _buildMerchantModal('_dyn_admin_spin', '🛡️ Spin-Gewinne verwalten',
    `<div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-bottom:14px">${all.length} Einreichungen gesamt · ${all.filter(p=>p.status==='pending').length} warten auf Freigabe</div>` +
    (all.length ? prizeRows : '<div style="text-align:center;padding:24px;color:rgba(255,255,255,0.3);font-size:0.82rem">Keine Einreichungen vorhanden.</div>') +
    `<button onclick="_merchantModalClose('_dyn_admin_spin')" style="width:100%;padding:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:12px;font-size:0.84rem;font-weight:700;font-family:var(--font);cursor:pointer;margin-top:8px">Schließen</button>`
  );
}

function _adminSpinAction(idx, action) {
  const all = _getSpinMerchantPrizes();
  if (!all[idx]) return;
  if (action === 'approve')     { all[idx].status = 'approved'; }
  else if (action === 'reject') { all[idx].status = 'rejected'; }
  else if (action === 'deactivate') { all[idx].status = 'rejected'; }
  else if (action === 'prioritize') {
    // Move to front of approved list
    const [item] = all.splice(idx, 1);
    item.status = 'approved';
    all.unshift(item);
  }
  _saveSpinMerchantPrizes(all);
  _merchantModalClose('_dyn_admin_spin');
  setTimeout(openAdminSpinManagement, 200);
  showToast(action === 'approve' ? '✅ Spin-Gewinn freigeschaltet!' : action === 'prioritize' ? '↑ Priorisiert & freigeschaltet' : '✓ Status aktualisiert');
}

function previewMerchantImage(inputId, previewId) {
  const file = document.getElementById(inputId)?.files?.[0];
  const preview = document.getElementById(previewId);
  if (!file || !preview) return;
  const reader = new FileReader();
  reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
  reader.readAsDataURL(file);
}
function getMerchantSubmissions() {
  try { return JSON.parse(localStorage.getItem('zam_merchant_submissions') || '[]'); } catch { return []; }
}
function saveMerchantSubmissions(list) {
  localStorage.setItem('zam_merchant_submissions', JSON.stringify(list));
}
function submitMerchantEvent() {
  const title = document.getElementById('me-title')?.value?.trim();
  const desc = document.getElementById('me-desc')?.value?.trim();
  const date = document.getElementById('me-date')?.value;
  if (!title || !desc || !date) { showToast('⚠️ Bitte Titel, Beschreibung und Datum ausfüllen.'); return; }
  const btn = document.querySelector('#modal-merchant-event .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird eingereicht…'; }
  const state = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const merchantId = state.currentMerchant?.id || state.merchantProfile?.id || 'unknown';
  const merchantName = state.currentMerchant?.name || state.merchantProfile?.name || 'Unbekannt';
  const imagePreview = document.getElementById('me-image-preview');
  const submission = {
    id: 'evt_' + Date.now(),
    type: 'event',
    status: 'pending',
    merchantId, merchantName,
    title,
    description: desc,
    date,
    time: document.getElementById('me-time')?.value || '',
    location: document.getElementById('me-location')?.value?.trim() || '',
    category: document.getElementById('me-category')?.value || 'other',
    note: document.getElementById('me-note')?.value?.trim() || '',
    image: imagePreview?.style.display !== 'none' ? imagePreview?.src : null,
    submittedAt: new Date().toISOString(),
    adminNote: ''
  };
  const list = getMerchantSubmissions();
  list.unshift(submission);
  saveMerchantSubmissions(list);
  setTimeout(() => {
    closeMerchantEventModal();
    showToast('✅ Event erfolgreich eingereicht!');
    if (typeof renderMerchantDashboard === 'function') renderMerchantDashboard();
  }, 600);
}
function submitMerchantDeal() {
  const title = document.getElementById('md-title')?.value?.trim();
  const desc = document.getElementById('md-desc')?.value?.trim();
  const expiry = document.getElementById('md-expiry')?.value;
  if (!title || !desc || !expiry) { showToast('⚠️ Bitte Titel, Beschreibung und Ablaufdatum ausfüllen.'); return; }
  const btn = document.querySelector('#modal-merchant-deal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird eingereicht…'; }
  const state = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
  const merchantId = state.currentMerchant?.id || state.merchantProfile?.id || 'unknown';
  const merchantName = state.currentMerchant?.name || state.merchantProfile?.name || 'Unbekannt';
  const imagePreview = document.getElementById('md-image-preview');
  const submission = {
    id: 'deal_' + Date.now(),
    type: 'deal',
    status: 'pending',
    merchantId, merchantName,
    title,
    description: desc,
    discount: document.getElementById('md-discount')?.value?.trim() || '',
    expiry,
    limit: document.getElementById('md-limit')?.value || '',
    category: document.getElementById('md-category')?.value || 'other',
    note: document.getElementById('md-note')?.value?.trim() || '',
    image: imagePreview?.style.display !== 'none' ? imagePreview?.src : null,
    submittedAt: new Date().toISOString(),
    adminNote: ''
  };
  const list = getMerchantSubmissions();
  list.unshift(submission);
  saveMerchantSubmissions(list);
  setTimeout(() => {
    closeMerchantDealModal();
    showToast('✅ Deal erfolgreich eingereicht!');
    if (typeof renderMerchantDashboard === 'function') renderMerchantDashboard();
  }, 600);
}
// =============================================
// Admin Merchant Preview Mode
// =============================================
let _adminPreviewMerchant = null;

function adminPreviewMerchant(merchant) {
  _adminPreviewMerchant = merchant;
  // Show banner
  const banner = document.getElementById('admin-preview-banner');
  const nameEl = document.getElementById('preview-merchant-name');
  if (banner) banner.classList.add('visible');
  if (nameEl) nameEl.textContent = merchant.shopname || merchant.name || 'Händler';
  // Update back button to return to admin
  const backBtn = document.getElementById('merchant-dash-back-btn');
  if (backBtn) backBtn.setAttribute('onclick', 'exitMerchantPreview()');
  // Update title
  const title = document.getElementById('merchant-dash-title');
  if (title) title.textContent = (merchant.shopname || merchant.name) + ' – Dashboard';
  // Navigate to dashboard
  navigateTo('merchant-dashboard');
}

function exitMerchantPreview() {
  _adminPreviewMerchant = null;
  const banner = document.getElementById('admin-preview-banner');
  if (banner) banner.classList.remove('visible');
  const backBtn = document.getElementById('merchant-dash-back-btn');
  if (backBtn) backBtn.setAttribute('onclick', "navigateTo('profile')");
  const title = document.getElementById('merchant-dash-title');
  if (title) title.textContent = 'Mein Dashboard';
  // Go back to admin
  window.location.href = 'admin.html';
}

function getAdminPreviewMerchant() {
  return _adminPreviewMerchant;
}

function seedDemoMerchantCafeFreiham() {
  const invites = _getMerchantInvites ? _getMerchantInvites() : JSON.parse(localStorage.getItem('zam_merchant_invites') || '[]');
  const exists = invites.some(i => i.id === 'demo_cafe_freiham');
  if (!exists) {
    invites.unshift({
      id: 'demo_cafe_freiham',
      shopname: 'Café Freiham',
      email: 'cafe@freiham.de',
      contact: 'Maria Huber',
      category: 'Gastronomie',
      zone: 'mk2_1',
      status: 'approved',
      approvedTs: new Date().toISOString(),
      ts: new Date().toISOString(),
      isDemo: true
    });
    localStorage.setItem('zam_merchant_invites', JSON.stringify(invites));
  }
  return { id: 'demo_cafe_freiham', shopname: 'Café Freiham', email: 'cafe@freiham.de', contact: 'Maria Huber', category: 'Gastronomie', zone: 'mk2_1', status: 'approved', isDemo: true };
}

function renderMerchantSubmissionsSection(merchantId) {
  const all = getMerchantSubmissions();
  const mine = all.filter(s => s.merchantId === merchantId);
  if (!mine.length) return '<p style="color:var(--dim);font-size:0.82rem;text-align:center;padding:20px 0">Noch keine Einreichungen.</p>';
  const statusLabel = { pending:'⏳ Wartet', approved:'✅ Freigegeben', live:'🟢 Live', rejected:'❌ Abgelehnt', draft:'📝 Entwurf' };
  const statusClass = { pending:'status-pending', approved:'status-approved', live:'status-live', rejected:'status-rejected', draft:'status-draft' };
  return mine.map(s => `
    <div class="submission-card">
      <div class="submission-card-header">
        <span class="submission-type-badge submission-type-${s.type}">${s.type === 'event' ? '📅 Event' : '🏷️ Deal'}</span>
        <span class="submission-status ${statusClass[s.status] || 'status-draft'}">${statusLabel[s.status] || s.status}</span>
      </div>
      <div class="submission-card-title">${s.title}</div>
      <div class="submission-card-meta">${new Date(s.submittedAt).toLocaleDateString('de-DE')}${s.type==='event'?' · '+s.date:''}${s.type==='deal'?' · bis '+s.expiry:''}</div>
      ${s.adminNote ? `<div class="submission-card-note">💬 ${s.adminNote}</div>` : ''}
    </div>
  `).join('');
}
function renderAdminVideoDrehRequests(containerId) {
  const ct = document.getElementById(containerId);
  if (!ct) return;
  const all = _getVideoDrehRequests();
  const statusLabel = { angefragt:'⏳ Angefragt', 'in_pruefung':'🔍 In Prüfung', bestaetigt:'✅ Bestätigt', erledigt:'🎉 Erledigt', abgelehnt:'❌ Abgelehnt' };
  const statusOpts = Object.entries(statusLabel).map(([v,l]) => '<option value="' + v + '">' + l + '</option>').join('');
  if (!all.length) { ct.innerHTML = '<p style="color:var(--dim);text-align:center;padding:20px">Noch keine Anfragen vorhanden.</p>'; return; }
  ct.innerHTML = all.map(r => `
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:14px;padding:16px;margin-bottom:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">
        <div>
          <div style="font-size:0.82rem;font-weight:800;color:#fff;margin-bottom:2px">${r.package_id === 'premium_reel' ? '🎬' : '🎥'} ${escHtml(r.package_name)}</div>
          <div style="font-size:0.7rem;font-weight:700;color:#FA4615">${r.package_price} € netto</div>
        </div>
        <select onchange="adminUpdateVDStatus('${r.id}', this.value)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-family:var(--font);font-size:0.7rem;padding:5px 8px;outline:none">
          ${statusOpts.replace('value="' + r.status + '"', 'value="' + r.status + '" selected')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
        <div style="font-size:0.68rem;color:rgba(255,255,255,0.45)">🏪 <strong style="color:rgba(255,255,255,0.7)">${escHtml(r.merchant_name)}</strong></div>
        <div style="font-size:0.68rem;color:rgba(255,255,255,0.45)">👤 ${escHtml(r.contact)}</div>
        <div style="font-size:0.68rem;color:rgba(255,255,255,0.45)">📞 ${escHtml(r.phone)}</div>
        <div style="font-size:0.68rem;color:rgba(255,255,255,0.45)">✉️ ${escHtml(r.email)}</div>
        ${r.period ? '<div style="font-size:0.68rem;color:rgba(255,255,255,0.45)">📆 ' + escHtml(r.period) + '</div>' : ''}
        ${r.date ? '<div style="font-size:0.68rem;color:rgba(255,255,255,0.45)">🗓 ' + r.date + '</div>' : ''}
      </div>
      ${r.ref ? '<div style="font-size:0.7rem;color:rgba(255,255,255,0.55);margin-bottom:4px">Bezug: <em>' + escHtml(r.ref) + '</em></div>' : ''}
      ${r.description ? '<div style="font-size:0.7rem;color:rgba(255,255,255,0.5);margin-bottom:4px">' + escHtml(r.description) + '</div>' : ''}
      ${r.notes ? '<div style="font-size:0.65rem;color:rgba(255,255,255,0.3)">Notiz: ' + escHtml(r.notes) + '</div>' : ''}
      <div style="font-size:0.6rem;color:rgba(255,255,255,0.25);margin-top:8px">Eingegangen: ${new Date(r.created_at).toLocaleString('de-DE')}</div>
    </div>
  `).join('');
}

function adminUpdateVDStatus(id, status) {
  const list = _getVideoDrehRequests();
  const r = list.find(x => x.id === id);
  if (r) { r.status = status; _saveVideoDrehRequests(list); showToast('Status aktualisiert.'); }
}

function renderAdminMerchantSubmissions() {
  const all = getMerchantSubmissions();
  const container = document.getElementById('admin-merchant-submissions');
  if (!container) return;
  if (!all.length) { container.innerHTML = '<p style="color:var(--dim);text-align:center;padding:20px">Keine Einreichungen vorhanden.</p>'; return; }
  const statusLabel = { pending:'⏳ Wartet', approved:'✅ Freigegeben', live:'🟢 Live', rejected:'❌ Abgelehnt', draft:'📝 Entwurf' };
  const statusClass = { pending:'status-pending', approved:'status-approved', live:'status-live', rejected:'status-rejected', draft:'status-draft' };
  container.innerHTML = all.map(s => `
    <div class="admin-submission-card">
      <div class="admin-submission-card-header">
        <span class="submission-type-badge submission-type-${s.type}">${s.type==='event'?'📅 Event':'🏷️ Deal'}</span>
        <span class="submission-status ${statusClass[s.status]||'status-draft'}">${statusLabel[s.status]||s.status}</span>
        <span style="margin-left:auto;font-size:0.72rem;color:var(--dim)">${s.merchantName}</span>
      </div>
      <div class="admin-submission-card-body">
        <strong>${s.title}</strong><br>
        ${s.description}<br>
        ${s.type==='event'?`<br>📅 ${s.date}${s.time?' '+s.time:''}${s.location?' · '+s.location:''}`:'' }
        ${s.type==='deal'?`<br>🏷️ ${s.discount||''}${s.expiry?' · bis '+s.expiry:''}${s.limit?' · max '+s.limit+' Stk':''}`:'' }
        ${s.note?`<br><em>Notiz: ${s.note}</em>`:''}
      </div>
      <div class="admin-submission-actions">
        <button class="btn-approve" onclick="adminApproveSubmission('${s.id}')">✅ Freigeben</button>
        <button class="btn-reject" onclick="adminRejectSubmission('${s.id}')">❌ Ablehnen</button>
        <button class="btn-feature" onclick="adminFeatureSubmission('${s.id}')">⭐ Featured</button>
      </div>
    </div>
  `).join('');
}
function adminApproveSubmission(id) {
  const list = getMerchantSubmissions();
  const s = list.find(x => x.id === id);
  if (s) { s.status = 'approved'; saveMerchantSubmissions(list); renderAdminMerchantSubmissions(); showToast('✅ Freigegeben!'); }
}
function adminRejectSubmission(id) {
  const note = prompt('Ablehnungsgrund (optional):') || '';
  const list = getMerchantSubmissions();
  const s = list.find(x => x.id === id);
  if (s) { s.status = 'rejected'; s.adminNote = note; saveMerchantSubmissions(list); renderAdminMerchantSubmissions(); showToast('❌ Abgelehnt.'); }
}
function adminFeatureSubmission(id) {
  const list = getMerchantSubmissions();
  const s = list.find(x => x.id === id);
  if (s) { s.status = 'live'; s.featured = true; saveMerchantSubmissions(list); renderAdminMerchantSubmissions(); showToast('⭐ Als Featured markiert!'); }
}

// =============================================
// ZAM Nearby Alerts
// =============================================
const NEARBY = {
  // ZAM Freiham coords (Mahatma-Gandhi-Platz, Munich)
  LAT: 48.14814,
  LNG: 11.45387,
  RADIUS_M: 300,

  KEY: 'zam_nearby_settings',

  getSettings() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || 'null') || { enabled: false, deals: true, events: true, spin: true, askedAt: null }; }
    catch { return { enabled: false, deals: true, events: true, spin: true, askedAt: null }; }
  },
  saveSettings(s) { localStorage.setItem(this.KEY, JSON.stringify(s)); },

  isEnabled() { return this.getSettings().enabled; },

  haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  },
};

let _nearbyWatchId = null;
let _nearbyBannerShownAt = 0;

function _nearbyAlertMessages() {
  const s = NEARBY.getSettings();
  const msgs = [];
  const deals = ZAMData?.deals?.filter(d => d.is_hot) || [];
  const events = ZAMData?.events || [];
  const spinAvail = !localStorage.getItem('zam_spin_' + Storage.todayKey());

  if (s.deals && deals.length) {
    msgs.push({ icon:'🏷️', text:`${deals.length} aktive Deal${deals.length > 1 ? 's' : ''} warten auf dich – z.B. ${deals[0]?.merchant || 'im ZAM'}.`, action:'deals' });
  }
  if (s.events && events.length) {
    msgs.push({ icon:'🎉', text:`Heute aktiv: ${events[0]?.title || 'Event im ZAM'}.`, action:'events' });
  }
  if (s.spin && spinAvail) {
    msgs.push({ icon:'🎰', text:'Lucky Spin verfügbar – drehe jetzt und gewinne!', action:'home' });
  }
  if (!msgs.length) {
    msgs.push({ icon:'📍', text:'Du bist in der Nähe vom ZAM – entdecke aktuelle Angebote.', action:'home' });
  }
  return msgs;
}

function _showNearbyBanner(msgs) {
  const now = Date.now();
  if (now - _nearbyBannerShownAt < 5 * 60 * 1000) return; // max once per 5 min
  _nearbyBannerShownAt = now;

  const existing = document.getElementById('nearby-alert-banner');
  if (existing) existing.remove();

  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  const banner = document.createElement('div');
  banner.id = 'nearby-alert-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:8000;background:linear-gradient(135deg,#1a1a1a,#1e1616);border-bottom:2px solid rgba(250,70,21,0.5);padding:12px 16px;padding-top:max(12px,env(safe-area-inset-top,12px));font-family:var(--font);animation:nearbySlideIn 0.35s ease-out';
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;max-width:480px;margin:0 auto">
      <div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#c43510,#FA4615);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">${msg.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.72rem;font-weight:800;color:#FA4615;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:1px">📍 Du bist in der Nähe</div>
        <div style="font-size:0.8rem;color:rgba(255,255,255,0.85);line-height:1.3">${escHtml(msg.text)}</div>
      </div>
      <button onclick="navigateTo('${msg.action}');document.getElementById('nearby-alert-banner')?.remove()" style="padding:7px 12px;border-radius:8px;background:rgba(250,70,21,0.2);border:1px solid rgba(250,70,21,0.4);color:#ffb399;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer;white-space:nowrap">Ansehen</button>
      <button onclick="document.getElementById('nearby-alert-banner')?.remove()" style="background:none;border:none;color:rgba(255,255,255,0.35);font-size:1.3rem;cursor:pointer;padding:2px 4px;flex-shrink:0">×</button>
    </div>`;
  document.body.prepend(banner);

  // Also push browser notification if permitted
  if ('Notification' in window && Notification.permission === 'granted') {
    const s = NEARBY.getSettings();
    if (s.deals) {
      new Notification('📍 ZAM Nearby Alert', { body: msg.text, icon: 'assets/icon.svg', tag: 'zam-nearby' });
    }
  }

  // Auto-dismiss after 8 seconds
  setTimeout(() => { document.getElementById('nearby-alert-banner')?.remove(); }, 8000);
}

function _onPositionSuccess(pos) {
  const dist = NEARBY.haversineM(pos.coords.latitude, pos.coords.longitude, NEARBY.LAT, NEARBY.LNG);
  const nearby = dist <= NEARBY.RADIUS_M;
  _updateNearbyStatusUI(nearby, dist);
  if (nearby) {
    _showNearbyBanner(_nearbyAlertMessages());
  }
}

function _onPositionError(err) {
  console.warn('Nearby: Geolocation error', err.code);
  _updateNearbyStatusUI(null, null);
}

function _updateNearbyStatusUI(nearby, distM) {
  const el = document.getElementById('nearby-status-info');
  if (!el) return;
  if (nearby === null) {
    el.textContent = '⚠️ Standort nicht verfügbar';
    el.style.color = 'rgba(255,255,255,0.35)';
    return;
  }
  if (nearby) {
    el.innerHTML = '✅ Du bist in der Nähe des ZAM';
    el.style.color = '#34d399';
  } else {
    el.innerHTML = `📍 ${Math.round(distM)}m vom ZAM entfernt`;
    el.style.color = 'rgba(255,255,255,0.45)';
  }
}

function startNearbyAlerts() {
  if (!('geolocation' in navigator)) {
    showToast('Standort wird von deinem Browser nicht unterstützt.');
    return;
  }
  const s = NEARBY.getSettings();
  s.enabled = true;
  NEARBY.saveSettings(s);
  renderNearbySettings();

  // One-time check immediately
  navigator.geolocation.getCurrentPosition(_onPositionSuccess, _onPositionError, { maximumAge: 60000, timeout: 10000 });

  // Lightweight watch (browser throttles this automatically)
  if (_nearbyWatchId !== null) navigator.geolocation.clearWatch(_nearbyWatchId);
  _nearbyWatchId = navigator.geolocation.watchPosition(_onPositionSuccess, _onPositionError, { maximumAge: 120000, timeout: 15000, enableHighAccuracy: false });

  showToast('📍 ZAM Nearby Alerts aktiviert!');
}

function stopNearbyAlerts() {
  if (_nearbyWatchId !== null) { navigator.geolocation.clearWatch(_nearbyWatchId); _nearbyWatchId = null; }
  const s = NEARBY.getSettings();
  s.enabled = false;
  NEARBY.saveSettings(s);
  renderNearbySettings();
  document.getElementById('nearby-alert-banner')?.remove();
  showToast('Nearby Alerts deaktiviert.');
}

function triggerNearbyDemo() {
  _nearbyBannerShownAt = 0; // reset cooldown
  const msgs = _nearbyAlertMessages();
  _showNearbyBanner(msgs);
  // Also show a deal-specific notification
  _updateNearbyStatusUI(true, 0);
  showToast('📍 Demo: Nearby Alert ausgelöst!');
}

function openNearbyOptIn() {
  const s = NEARBY.getSettings();
  if (s.enabled) { navigateTo('nearby-settings'); return; }

  const modal = _buildMerchantModal('nearby-optin-modal', '📍 ZAM Nearby Alerts', `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="font-size:3rem;margin-bottom:12px">📍</div>
      <div style="font-size:1rem;font-weight:800;color:#e2e8f0;margin-bottom:10px">Möchtest du ZAM Nearby Alerts aktivieren?</div>
      <div style="font-size:0.82rem;color:rgba(255,255,255,0.55);line-height:1.6;margin-bottom:24px">Erhalte Hinweise auf aktuelle Deals, Events und Spin-Gewinne, wenn du in der Nähe des ZAM bist.<br><br><span style="font-size:0.74rem;color:rgba(255,255,255,0.35)">🔒 Dein Standort wird nur geprüft, ob du in der Nähe des ZAM bist. Keine dauerhafte Aufzeichnung.</span></div>
      <button onclick="_nearbyModalActivate()" style="width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#c43510,#FA4615);border:none;color:#fff;font-size:0.92rem;font-weight:800;font-family:var(--font);cursor:pointer;margin-bottom:10px">📍 Aktivieren</button>
      <button onclick="_merchantModalClose('nearby-optin-modal')" style="width:100%;padding:12px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5);font-size:0.85rem;font-weight:600;font-family:var(--font);cursor:pointer">Später</button>
    </div>
  `);
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function _nearbyModalActivate() {
  _merchantModalClose('nearby-optin-modal');
  startNearbyAlerts();
  navigateTo('nearby-settings');
}

function renderNearbySettings() {
  const container = document.getElementById('nearby-settings-content');
  if (!container) return;
  const s = NEARBY.getSettings();
  const supported = 'geolocation' in navigator;

  container.innerHTML = `
    <!-- Status Card -->
    <div style="background:linear-gradient(135deg,rgba(250,70,21,0.12),rgba(196,53,16,0.06));border:1px solid rgba(250,70,21,0.25);border-radius:16px;padding:18px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:44px;height:44px;border-radius:12px;background:${s.enabled ? 'linear-gradient(135deg,#c43510,#FA4615)' : 'rgba(255,255,255,0.08)'};display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0">${s.enabled ? '📍' : '🔕'}</div>
        <div style="flex:1">
          <div style="font-size:0.92rem;font-weight:800;color:#e2e8f0">ZAM Nearby Alerts</div>
          <div id="nearby-status-info" style="font-size:0.75rem;color:${s.enabled ? '#FA4615' : 'rgba(255,255,255,0.35)'};">${s.enabled ? '⏳ Standort wird geprüft…' : '⭕ Deaktiviert'}</div>
        </div>
        <label style="position:relative;width:48px;height:26px;flex-shrink:0">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="s.enabled=this.checked;NEARBY.saveSettings(s);s.enabled?startNearbyAlerts():stopNearbyAlerts()" style="opacity:0;width:0;height:0;position:absolute">
          <span style="position:absolute;inset:0;border-radius:13px;background:${s.enabled ? '#FA4615' : 'rgba(255,255,255,0.12)'};transition:background 0.2s;cursor:pointer"></span>
          <span style="position:absolute;top:3px;left:${s.enabled ? '25px' : '3px'};width:20px;height:20px;border-radius:50%;background:#fff;transition:left 0.2s;pointer-events:none"></span>
        </label>
      </div>
      <div style="font-size:0.76rem;color:rgba(255,255,255,0.4);line-height:1.5;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
        🔒 Dein Standort wird nur grob geprüft (±300 m Radius), um festzustellen, ob du in der Nähe des ZAM bist. Es findet keine dauerhafte Überwachung oder Speicherung statt.
      </div>
    </div>

    <!-- Alert Categories -->
    <div style="background:#1e1e1e;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:4px 0;margin-bottom:20px">
      <div style="padding:14px 16px 8px;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:rgba(255,255,255,0.3)">Alert-Kategorien</div>
      ${[
        { key:'deals', label:'🏷️ Deals', sub:'Aktuelle Rabatte und Angebote' },
        { key:'events', label:'🎉 Events', sub:'Veranstaltungen im ZAM' },
        { key:'spin', label:'🎰 Lucky Spin', sub:'Täglicher Spin verfügbar' },
      ].map(c => `
      <label style="display:flex;align-items:center;gap:14px;padding:13px 16px;border-top:1px solid rgba(255,255,255,0.05);cursor:pointer">
        <div style="flex:1;min-width:0">
          <div style="font-size:0.84rem;font-weight:700;color:#e2e8f0">${c.label}</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.38);margin-top:1px">${c.sub}</div>
        </div>
        <label style="position:relative;width:42px;height:23px;flex-shrink:0">
          <input type="checkbox" ${s[c.key] !== false ? 'checked' : ''} onchange="const ns=NEARBY.getSettings();ns['${c.key}']=this.checked;NEARBY.saveSettings(ns)" style="opacity:0;width:0;height:0;position:absolute">
          <span style="position:absolute;inset:0;border-radius:12px;background:${s[c.key] !== false ? '#FA4615' : 'rgba(255,255,255,0.12)'};transition:background 0.2s;cursor:pointer"></span>
          <span style="position:absolute;top:2.5px;left:${s[c.key] !== false ? '21px' : '2.5px'};width:18px;height:18px;border-radius:50%;background:#fff;transition:left 0.2s;pointer-events:none"></span>
        </label>
      </label>`).join('')}
    </div>

    <!-- Demo Button -->
    <div style="background:rgba(247,171,0,0.06);border:1px solid rgba(247,171,0,0.2);border-radius:16px;padding:16px;margin-bottom:20px">
      <div style="font-size:0.75rem;font-weight:700;color:#F7AB00;margin-bottom:4px">🎯 Demo-Modus</div>
      <div style="font-size:0.76rem;color:rgba(255,255,255,0.45);line-height:1.5;margin-bottom:14px">Standort-Prüfung lokal nicht verfügbar? Simuliere einen Nearby Alert für die Präsentation.</div>
      <button onclick="triggerNearbyDemo()" style="width:100%;padding:12px;border-radius:12px;background:rgba(247,171,0,0.15);border:1px solid rgba(247,171,0,0.35);color:#F7AB00;font-size:0.84rem;font-weight:800;font-family:var(--font);cursor:pointer">📍 Demo: Ich bin in der Nähe</button>
    </div>

    <!-- Example Notifications -->
    <div style="margin-bottom:12px">
      <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:12px">Beispiel-Benachrichtigungen</div>
      ${[
        '🏷️ „Du bist in der Nähe vom ZAM – heute gibt\'s neue Deals."',
        '🎰 „Lucky Spin verfügbar: Gewinne gratis Eis oder Punkte."',
        '🍔 „Heute aktiv: 2 für 1 Deal bei Pitsburger."',
        '🎉 „Event startet bald am Mahatma-Gandhi-Platz."',
      ].map(t => `<div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:11px 14px;margin-bottom:8px;font-size:0.79rem;color:rgba(255,255,255,0.55);line-height:1.4">${t}</div>`).join('')}
    </div>
  `;
}

function initNearbyAlerts() {
  const s = NEARBY.getSettings();
  if (!s.enabled) return;
  // Resume watching if was enabled before
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(_onPositionSuccess, _onPositionError, { maximumAge: 120000, timeout: 10000, enableHighAccuracy: false });
    if (_nearbyWatchId === null) {
      _nearbyWatchId = navigator.geolocation.watchPosition(_onPositionSuccess, _onPositionError, { maximumAge: 120000, timeout: 15000, enableHighAccuracy: false });
    }
  }
}

// =============================================
// PHASE 2: QR Voucher System (My Vouchers)
// =============================================
const _MY_VOUCHER_KEY = 'zam_my_vouchers_v2';

function _getMyVouchers() {
  try { return JSON.parse(localStorage.getItem(_MY_VOUCHER_KEY) || '[]'); } catch { return []; }
}
function _saveMyVouchers(v) { localStorage.setItem(_MY_VOUCHER_KEY, JSON.stringify(v)); }

function secureVoucherFromDeal(dealId, dealTitle, storeIcon, storeName, discount) {
  const vouchers = _getMyVouchers();
  const existing = vouchers.find(v => v.deal_id === dealId && !v.redeemed);
  if (existing) { showMyVoucherQR(existing.id); return; }
  const code = 'ZAM-' + dealId.replace('_','').toUpperCase().slice(-4) + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  const expDate = new Date(); expDate.setDate(expDate.getDate() + 14);
  const voucher = {
    id: 'mv_' + Date.now(),
    deal_id: dealId, title: dealTitle, store_icon: storeIcon,
    store_name: storeName, discount, code,
    created_at: new Date().toISOString(),
    expiry: expDate.toISOString().slice(0,10),
    redeemed: false,
  };
  vouchers.unshift(voucher);
  _saveMyVouchers(vouchers);
  showToast('🎟 Gutschein gesichert! +10 Punkte', 'success');
  showMyVoucherQR(voucher.id);
}

function securePartnerVoucher(dealId) {
  const pd = _getPD2ActiveDeals().find(d => d.id === dealId);
  if (!pd) { showToast('Partner-Deal nicht gefunden', 'error'); return; }
  const storeName = 'Partner Deal: ' + pd.a.name + ' + ' + pd.b.name;
  secureVoucherFromDeal(dealId, pd.title, '🤝', storeName, 'Partner Deal');
}

function showMyVoucherQR(voucherId) {
  const v = _getMyVouchers().find(x => x.id === voucherId);
  if (!v) return;
  const modal = document.getElementById('qr-voucher-modal');
  const body  = document.getElementById('qr-voucher-body');
  if (!modal || !body) return;
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:0.95rem;font-weight:800;color:#fff">🎟 Mein Gutschein</div>
      <button onclick="document.getElementById('qr-voucher-modal').style.display='none'" style="background:rgba(255,255,255,0.08);border:none;border-radius:8px;width:28px;height:28px;color:rgba(255,255,255,0.5);font-size:1rem;cursor:pointer;font-family:var(--font)">✕</button>
    </div>
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:2rem;margin-bottom:4px">${v.store_icon}</div>
      <div style="font-size:0.9rem;font-weight:800;color:#fff">${v.store_name}</div>
      <div style="font-size:0.75rem;color:rgba(250,70,21,0.9);font-weight:700;margin-top:2px">${v.title}</div>
    </div>
    ${v.redeemed
      ? `<div style="text-align:center;padding:16px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);border-radius:14px;margin-bottom:14px"><div style="font-size:2rem">✅</div><div style="font-size:0.85rem;font-weight:700;color:#34d399;margin-top:6px">Bereits eingelöst</div></div>`
      : `<div id="mv-qr-wrap" style="display:flex;justify-content:center;margin:0 0 14px;padding:16px;background:#fff;border-radius:14px"></div>`
    }
    <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:10px;text-align:center;margin-bottom:14px">
      <div style="font-size:0.58rem;color:rgba(255,255,255,0.35);margin-bottom:4px;letter-spacing:0.08em">GUTSCHEIN-CODE</div>
      <div style="font-size:1.05rem;font-weight:900;color:#F7AB00;letter-spacing:0.1em">${v.code}</div>
      <div style="font-size:0.6rem;color:rgba(255,255,255,0.3);margin-top:4px">Gültig bis ${new Date(v.expiry+'T23:59:59').toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('qr-voucher-modal').style.display='none'" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:11px;color:rgba(255,255,255,0.5);font-size:0.78rem;font-weight:600;font-family:var(--font);cursor:pointer">Schließen</button>
      <button onclick="document.getElementById('qr-voucher-modal').style.display='none';navigateTo('my-vouchers')" style="flex:1;background:#FA4615;border:none;border-radius:12px;padding:11px;color:#fff;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer">Alle Gutscheine →</button>
    </div>`;
  modal.style.display = 'flex';
  if (!v.redeemed && window.QRCode) {
    setTimeout(() => {
      const wrap = document.getElementById('mv-qr-wrap');
      if (wrap) { wrap.innerHTML=''; new QRCode(wrap,{text:v.code,width:150,height:150,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M}); }
    }, 60);
  }
}

function renderMyVouchers() {
  const c = document.getElementById('my-vouchers-content');
  if (!c) return;
  const vouchers = _getMyVouchers();
  if (!vouchers.length) {
    c.innerHTML = `<div style="text-align:center;padding:60px 20px">
      <div style="font-size:3.5rem;margin-bottom:14px">🎟</div>
      <div style="font-size:1rem;font-weight:700;color:rgba(255,255,255,0.6);margin-bottom:6px">Noch keine Gutscheine</div>
      <div style="font-size:0.75rem;color:rgba(255,255,255,0.3);line-height:1.6">Klicke bei einem Deal auf<br>„Gutschein sichern"</div>
      <button onclick="navigateTo('deals')" style="margin-top:20px;background:#FA4615;border:none;border-radius:12px;padding:12px 24px;color:#fff;font-size:0.82rem;font-weight:700;font-family:var(--font);cursor:pointer">Deals entdecken →</button>
    </div>`; return;
  }
  const active = vouchers.filter(v => !v.redeemed);
  const used   = vouchers.filter(v => v.redeemed);
  c.innerHTML = `<div style="padding:0 0 100px">
    ${active.length ? `<div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:rgba(255,255,255,0.3);padding:16px 16px 8px">Aktiv (${active.length})</div>` + active.map(v => _myVoucherCard(v)).join('') : ''}
    ${used.length   ? `<div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:rgba(255,255,255,0.3);padding:16px 16px 8px">Verwendet</div>` + used.map(v => _myVoucherCard(v)).join('') : ''}
  </div>`;
}

function _myVoucherCard(v) {
  const clickAttr = v.redeemed ? '' : ("showMyVoucherQR('" + v.id + "')");
  const bg   = v.redeemed ? 'rgba(255,255,255,0.03)' : 'rgba(250,70,21,0.07)';
  const bdr  = v.redeemed ? 'rgba(255,255,255,0.07)' : 'rgba(250,70,21,0.2)';
  const cur  = v.redeemed ? 'default' : 'pointer';
  const opc  = v.redeemed ? 'opacity:0.55' : '';
  const ttlC = v.redeemed ? 'rgba(255,255,255,0.4)' : '#fff';
  const codeC= v.redeemed ? 'rgba(52,211,153,0.5)' : '#F7AB00';
  return `<div onclick="${clickAttr}" style="margin:0 16px 10px;background:${bg};border:1px solid ${bdr};border-radius:16px;padding:14px;cursor:${cur};${opc}">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:1.7rem">${v.store_icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.82rem;font-weight:700;color:${ttlC};line-height:1.3">${v.title}</div>
        <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:2px">${v.store_name}</div>
        <div style="font-size:0.65rem;font-weight:800;color:${codeC};margin-top:3px;letter-spacing:0.06em">${v.code}</div>
      </div>
      <div style="font-size:1.3rem">${v.redeemed ? '✅' : '🎟'}</div>
    </div>
  </div>`;
}

// =============================================
// PHASE 2: Partner Deals v2 — Full Flow
// =============================================
const _PD2_REQ_KEY    = 'zam_pd2_requests';
const _PD2_ACTIVE_KEY = 'zam_pd2_active_deals';

function _getPD2Requests()       { try { return JSON.parse(localStorage.getItem(_PD2_REQ_KEY)   ||'[]');  } catch { return []; } }
function _savePD2Requests(r)     { localStorage.setItem(_PD2_REQ_KEY,    JSON.stringify(r)); }
function _getPD2ActiveDeals()    { try { return JSON.parse(localStorage.getItem(_PD2_ACTIVE_KEY)||'null') || _pd2DemoDeals(); } catch { return _pd2DemoDeals(); } }
function _savePD2ActiveDeals(d)  { localStorage.setItem(_PD2_ACTIVE_KEY, JSON.stringify(d)); }

function _pd2DemoDeals() {
  return [{
    id: 'pd2_demo1',
    title: 'Fitness + Burger Aktion',
    description: "Aktive Fit Star Mitglieder erhalten 20% Rabatt bei Pit's Stop Burger – einfach Mitgliedsausweis zeigen.",
    a: { id:'mer_019', name:'Fit Star',         icon:'🏋️', benefit:'12 Monate Mitgliedschaft', condition:'Neukunden' },
    b: { id:'mer_010', name:"Pit's Stop Burger", icon:'🍔',  benefit:'20% Rabatt auf ein Menü',  condition:'Für aktive Mitglieder' },
    expires_at: '2026-12-31',
    participants: 47,
    created_at: new Date().toISOString()
  }];
}

function _renderPartnerDeals(me) {
  let wrap = document.getElementById('partner-deals-section');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'partner-deals-section';
    wrap.style.borderTop = '1px solid rgba(255,255,255,0.05)';
    const target = document.getElementById('merchant-submissions-wrap') || document.getElementById('merchant-kpi-grid')?.parentNode;
    if (target) target.appendChild(wrap);
    else return;
  }

  const allActive = JSON.parse(localStorage.getItem(_PD2_ACTIVE_KEY) || 'null') || _pd2DemoDeals();
  const activeDeals = allActive.filter(d => d.a.id === me.id || d.b.id === me.id);
  const reqs    = _getPD2Requests();
  const incoming = reqs.filter(r => r.to.id   === me.id && r.status === 'pending');
  const outgoing  = reqs.filter(r => r.from.id === me.id && r.status === 'pending');

  const incomingHtml = incoming.map(r => {
    const rid = r.id;
    return '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:8px">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<span style="font-size:1.2rem">' + r.from.icon + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:0.78rem;font-weight:700;color:#fff">' + escHtml(r.title) + '</div>' +
          '<div style="font-size:0.62rem;color:rgba(255,255,255,0.4)">von ' + escHtml(r.from.name) + (r.from.benefit ? ' · ' + escHtml(r.from.benefit) : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:0.68rem;color:rgba(255,255,255,0.5);margin-bottom:10px;line-height:1.5">' + escHtml(r.description || '') + '</div>' +
      '<div style="margin-bottom:10px">' +
        '<label style="font-size:0.65rem;font-weight:700;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em">Mein Vorteil *</label>' +
        '<input id="pd2_benefit_' + rid + '" type="text" placeholder="z.B. 20% Rabatt auf ein Menü" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:9px 12px;color:#fff;font-family:inherit;font-size:0.8rem;outline:none;margin-bottom:6px">' +
        '<label style="font-size:0.65rem;font-weight:700;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em">Bedingung (optional)</label>' +
        '<input id="pd2_cond_' + rid + '" type="text" placeholder="z.B. Nur für aktive Mitglieder" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:9px 12px;color:#fff;font-family:inherit;font-size:0.8rem;outline:none">' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button onclick="_pd2Accept(\'' + rid + '\')" style="flex:1;background:#FA4615;border:none;border-radius:10px;padding:9px;color:#fff;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">✅ Annehmen</button>' +
        '<button onclick="_pd2Decline(\'' + rid + '\')" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:9px;color:rgba(255,255,255,0.4);font-size:0.75rem;font-weight:600;font-family:var(--font);cursor:pointer">❌ Ablehnen</button>' +
      '</div>' +
    '</div>';
  }).join('');

  const outgoingHtml = outgoing.map(r =>
    '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
      '<span style="font-size:1rem">' + r.to.icon + '</span>' +
      '<span style="flex:1;font-size:0.7rem;color:rgba(255,255,255,0.5)">' + escHtml(r.title) + ' → ' + escHtml(r.to.name) + '</span>' +
      '<span style="font-size:0.6rem;color:#F7AB00;font-weight:700">⏳ Ausstehend</span>' +
    '</div>'
  ).join('');

  const activeHtml = activeDeals.map(d =>
    '<div style="background:linear-gradient(135deg,rgba(250,70,21,0.08),rgba(247,171,0,0.05));border:1px solid rgba(250,70,21,0.2);border-radius:14px;padding:14px;margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">' +
        '<span style="font-size:0.55rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;padding:2px 7px;background:rgba(52,211,153,0.12);color:#34d399;border:1px solid rgba(52,211,153,0.25);border-radius:6px">● AKTIV</span>' +
        '<span style="font-size:0.55rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;padding:2px 7px;background:rgba(250,70,21,0.12);color:#FA4615;border:1px solid rgba(250,70,21,0.25);border-radius:6px">🤝 PARTNER DEAL</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<span style="font-size:1.4rem">' + d.a.icon + '</span>' +
        '<span style="font-size:0.7rem;color:rgba(255,255,255,0.3)">+</span>' +
        '<span style="font-size:1.4rem">' + d.b.icon + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:0.85rem;font-weight:800;color:#fff">' + escHtml(d.title) + '</div>' +
          '<div style="font-size:0.6rem;color:rgba(255,255,255,0.4)">' + escHtml(d.a.name) + ' + ' + escHtml(d.b.name) + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
        '<div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px">' +
          '<div style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-bottom:3px">' + escHtml(d.a.name) + '</div>' +
          '<div style="font-size:0.72rem;font-weight:700;color:#FA4615">' + escHtml(d.a.benefit) + '</div>' +
        '</div>' +
        '<div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px">' +
          '<div style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-bottom:3px">' + escHtml(d.b.name) + '</div>' +
          '<div style="font-size:0.72rem;font-weight:700;color:#F7AB00">' + escHtml(d.b.benefit) + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:0.6rem;color:rgba(255,255,255,0.28)">📅 Bis ' + new Date(d.expires_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'}) + ' · 👥 ' + (d.participants||0) + ' Teilnehmer</div>' +
    '</div>'
  ).join('');

  wrap.innerHTML =
    '<div style="padding:16px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
        '<div>' +
          '<div style="font-size:0.92rem;font-weight:800;color:#fff">🤝 Partner-Deals</div>' +
          '<div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:2px">Gemeinsame Aktionen mit anderen Händlern</div>' +
        '</div>' +
        '<button onclick="openMerchantDealModal()" style="background:rgba(250,70,21,0.15);border:1px solid rgba(250,70,21,0.3);border-radius:10px;padding:7px 12px;color:#ffb399;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer">+ Deal anfragen</button>' +
      '</div>' +
      (incoming.length ? '<div style="background:rgba(247,171,0,0.08);border:1px solid rgba(247,171,0,0.2);border-radius:14px;padding:14px;margin-bottom:12px"><div style="font-size:0.7rem;font-weight:800;color:#F7AB00;margin-bottom:10px">📬 ' + incoming.length + ' offene Anfrage' + (incoming.length > 1 ? 'n' : '') + '</div>' + incomingHtml + '</div>' : '') +
      (outgoing.length ? '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px;margin-bottom:12px"><div style="font-size:0.65rem;font-weight:700;color:rgba(255,255,255,0.35);margin-bottom:6px">📤 Gesendete Anfragen</div>' + outgoingHtml + '</div>' : '') +
      (activeDeals.length ? activeHtml : '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:0.75rem">Noch keine Partner-Deals. Klicke auf „Deal anfragen" und wähle 🤝 Partner Deal.</div>') +
    '</div>';
}

function _pd2Accept(reqId) {
  const reqs = _getPD2Requests();
  const req  = reqs.find(r => r.id === reqId);
  if (!req) return;
  const benefit = document.getElementById('pd2_benefit_' + reqId)?.value?.trim();
  const cond    = document.getElementById('pd2_cond_'    + reqId)?.value?.trim() || '';
  if (!benefit) { showToast('⚠️ Bitte deinen Vorteil eintragen', 'error'); return; }
  req.status        = 'accepted';
  req.to.benefit    = benefit;
  req.to.condition  = cond;
  _savePD2Requests(reqs);
  const existing = JSON.parse(localStorage.getItem(_PD2_ACTIVE_KEY) || '[]');
  existing.unshift({
    id: 'pd2_' + Date.now(),
    title:       req.title,
    description: req.description,
    a: { id: req.from.id, name: req.from.name, icon: req.from.icon, benefit: req.from.benefit, condition: req.from.condition || '' },
    b: { id: req.to.id,   name: req.to.name,   icon: req.to.icon,   benefit, condition: cond },
    expires_at:   req.expires_at,
    participants: 0,
    created_at:   new Date().toISOString()
  });
  _savePD2ActiveDeals(existing);
  showToast('🤝 Partner-Deal aktiviert!', 'success');
  renderMerchantDashboard();
}

function _pd2Decline(reqId) {
  const reqs = _getPD2Requests().map(r => r.id === reqId ? {...r, status: 'declined'} : r);
  _savePD2Requests(reqs);
  showToast('Anfrage abgelehnt', 'info');
  renderMerchantDashboard();
}

// =============================================
// PHASE 2: Händler-Newsfeed
// =============================================
function _renderMerchantNewsfeed(me) {
  let wrap = document.getElementById('merchant-newsfeed-section');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'merchant-newsfeed-section';
    wrap.style.borderTop = '1px solid rgba(255,255,255,0.05)';
    const partnerSection = document.getElementById('partner-deals-section');
    if (partnerSection) partnerSection.parentNode.insertBefore(wrap, partnerSection.nextSibling);
    else return;
  }
  const KEY = 'zam_merchant_posts_' + me.id;
  const posts = (() => { try { return JSON.parse(localStorage.getItem(KEY)||'[]'); } catch { return []; } })();
  wrap.innerHTML = `
    <div style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="font-size:0.92rem;font-weight:800;color:#fff">📢 Händler-Newsfeed</div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:2px">Beiträge erscheinen im Community-Feed</div>
        </div>
        <button onclick="_openMerchantPostForm('${me.id}')" style="background:rgba(250,70,21,0.15);border:1px solid rgba(250,70,21,0.3);border-radius:10px;padding:7px 12px;color:#ffb399;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer">+ Post</button>
      </div>
      ${posts.length ? posts.slice(0,3).map(p=>`
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px;margin-bottom:8px">
          <div style="font-size:0.78rem;color:rgba(255,255,255,0.8);line-height:1.55;margin-bottom:6px">${escHtml(p.content)}</div>
          <div style="font-size:0.6rem;color:rgba(255,255,255,0.3)">${new Date(p.created_at).toLocaleDateString('de-DE',{day:'2-digit',month:'long'})}</div>
        </div>`).join('') : `<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:0.75rem">Noch keine Beiträge. Teile Neuheiten und Aktionen.</div>`}
    </div>`;
}

function _openMerchantPostForm(merchantId) {
  _buildMerchantModal('merchant-post-modal','📢 Beitrag erstellen',`
    <div style="font-size:0.7rem;color:rgba(255,255,255,0.45);margin-bottom:10px">Dieser Beitrag erscheint im Community-Feed.</div>
    <textarea id="merchant-post-text" placeholder="Neuigkeit, Aktion, Produkt..." style="width:100%;min-height:100px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px;color:#fff;font-size:0.82rem;font-family:var(--font);resize:none;outline:none;box-sizing:border-box;margin-bottom:12px"></textarea>
    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('merchant-post-modal')?.remove()" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:11px;color:rgba(255,255,255,0.45);font-size:0.78rem;font-weight:600;font-family:var(--font);cursor:pointer">Abbrechen</button>
      <button onclick="_submitMerchantPost('${merchantId}')" style="flex:1;background:#FA4615;border:none;border-radius:12px;padding:11px;color:#fff;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer">Veröffentlichen</button>
    </div>
  `);
}

function _submitMerchantPost(merchantId) {
  const text = document.getElementById('merchant-post-text')?.value?.trim();
  if (!text) { showToast('Bitte Text eingeben','error'); return; }
  const KEY = 'zam_merchant_posts_' + merchantId;
  const posts = (() => { try { return JSON.parse(localStorage.getItem(KEY)||'[]'); } catch { return []; } })();
  posts.unshift({id:'mp_'+Date.now(), content:text, created_at:new Date().toISOString(), merchant_id:merchantId});
  localStorage.setItem(KEY, JSON.stringify(posts.slice(0,20)));
  // Inject into community posts
  try {
    const user = ZAMApi.auth.currentUser();
    const commKey = 'zam_community_posts_extra';
    const commExtra = JSON.parse(localStorage.getItem(commKey)||'[]');
    commExtra.unshift({id:'comm_'+Date.now(), user_id:merchantId, author:{name:user?.display_name||'Händler',initials:'HÄ',avatar_color:'#FA4615',level:'Händler'}, content:text, tags:['ZAMHändler'], likes:0, comments:0, created_at:new Date().toISOString(), time_ago:'Gerade eben', is_liked:false});
    localStorage.setItem(commKey, JSON.stringify(commExtra.slice(0,10)));
  } catch {}
  document.getElementById('merchant-post-modal')?.remove();
  showToast('Beitrag veröffentlicht! 🎉','success');
  renderMerchantDashboard();
}

// =============================================
// PHASE 2: Händler Stats 2.0
// =============================================
function _renderMerchantStats2(stats) {
  let wrap = document.getElementById('merchant-stats2-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'merchant-stats2-wrap';
    wrap.style.borderTop = '1px solid rgba(255,255,255,0.05)';
    const kpi = document.getElementById('merchant-kpi-grid');
    if (kpi) kpi.parentNode.insertBefore(wrap, kpi.nextSibling);
    else return;
  }
  const vouchers = _getMyVouchers ? _getMyVouchers().length + 23 : 23;
  const items = [
    {icon:'🎟', val: vouchers,                                     label:'Gutscheine',   sub:'gesichert'},
    {icon:'🆕', val: Math.floor(stats.profileViews * 0.18),       label:'Neukunden',    sub:'diesen Monat'},
    {icon:'📸', val: stats.eventJoins,                             label:'Challenges',   sub:'Teilnahmen'},
    {icon:'⭐', val: '4.6',                                        label:'Bewertung',    sub:'Ø aus 127'},
    {icon:'🔁', val: Math.floor(stats.dealRedemptions * 0.6),      label:'Stammkunden',  sub:'Wiederkehr'},
    {icon:'💬', val: stats.eventViews + 5,                         label:'Feed',         sub:'Interaktionen'},
  ];
  wrap.innerHTML = `
    <div style="padding:0 16px 16px">
      <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:rgba(255,255,255,0.3);margin:0 0 10px">📈 Erweiterte Kennzahlen</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${items.map(s=>`<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:12px;text-align:center">
          <div style="font-size:1rem;margin-bottom:4px">${s.icon}</div>
          <div style="font-size:1.1rem;font-weight:900;color:#fff">${typeof s.val==='number'?s.val.toLocaleString('de-DE'):s.val}</div>
          <div style="font-size:0.58rem;font-weight:700;color:rgba(255,255,255,0.45);margin-top:2px">${s.label}</div>
          <div style="font-size:0.52rem;color:rgba(255,255,255,0.28)">${s.sub}</div>
        </div>`).join('')}
      </div>
    </div>`;
}
