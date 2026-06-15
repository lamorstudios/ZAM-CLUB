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
  const newPts = await ZAMApi.points.add(amount, reason, reason);
  updatePointsDisplay(true);
  if (reason) showToast(`+${amount} Punkte · ${reason}`, 'success');
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

  // Level
  const levelKey = pts >= 3000 ? 'platinum' : pts >= 1500 ? 'gold' : pts >= 500 ? 'silver' : 'bronze';
  const levelMap = { bronze: 'BRONZE', silver: 'SILBER', gold: 'GOLD', platinum: 'PLATIN' };
  const levelDisplay = { bronze: 'Bronze Member', silver: 'Silber Member', gold: 'Gold Member', platinum: 'Platin Member' };
  if (levelBadge) levelBadge.textContent = levelMap[levelKey];
  const levelEl = $('.points-level');
  if (levelEl) levelEl.innerHTML = `<span class="points-level-dot"></span>${levelDisplay[levelKey]}`;

  // Progress bar
  const thresholds = { bronze: [0, 500], silver: [500, 1500], gold: [1500, 3000], platinum: [3000, 3000] };
  const [min, max] = thresholds[levelKey];
  const progressFill = $('.points-progress-fill');
  if (progressFill) {
    const pct = levelKey === 'platinum' ? 100 : Math.min(((pts - min) / (max - min)) * 100, 100);
    progressFill.style.width = pct + '%';
  }
  if (progressLabel) {
    if (levelKey === 'platinum') {
      progressLabel.textContent = '🎉 Platin erreicht!';
    } else {
      const nextLevelName = { bronze: 'Silber', silver: 'Gold', gold: 'Platin' }[levelKey];
      progressLabel.textContent = `${pts.toLocaleString('de-DE')} / ${max.toLocaleString('de-DE')} Pkt. bis ${nextLevelName}`;
    }
  }
}

// =============================================
// Navigation
// =============================================
function navigateTo(pageId) {
  if (state.currentPage === pageId) return;

  const currentEl = $(`#page-${state.currentPage}`);
  if (currentEl) currentEl.classList.remove('active');

  state.currentPage = pageId;

  const nextEl = $(`#page-${pageId}`);
  if (nextEl) {
    nextEl.classList.add('active');
    nextEl.scrollTop = 0;
  }

  $$('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === pageId);
  });
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
  const hour = new Date().getHours();
  let greeting = 'Guten Tag';
  if (hour < 12) greeting = 'Guten Morgen';
  else if (hour >= 18) greeting = 'Guten Abend';

  const greetingEl = $('#home-greeting');
  if (greetingEl) greetingEl.textContent = greeting + ',';

  const nameEl = $('#home-username');
  const firstName = (user.display_name || 'Gast').split(' ')[0];
  if (nameEl) nameEl.textContent = firstName + '! 👋';

  updatePointsDisplay();
  renderHomeEvents();
  renderHomeDeals();
}

function animateNumber(el, from, to, duration) {
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
  const events = await ZAMApi.events.list();
  events.slice(0, 5).forEach(evt => {
    const saved = ZAMApi.events.isSaved(evt.id);
    const card = el('div', 'event-card-mini card-dark');
    card.style.setProperty('--accent-color', evt.category_color);
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="category-tag" style="background:${evt.category_color}22;color:${evt.category_color}">${evt.category}</div>
        <button class="bookmark-btn ${saved ? 'saved' : ''}" data-id="${evt.id}" data-type="event" aria-label="Merken">
          ${saved ? '🔖' : '🏷️'}
        </button>
      </div>
      <h3>${evt.title}</h3>
      <div class="event-meta">
        <span>📅 ${evt.date_formatted}</span>
        <span>⏰ ${evt.time}</span>
        <span>📍 ${evt.location}</span>
      </div>
      <div class="event-points-badge">+${evt.points_reward} Punkte</div>
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
  const deals = await ZAMApi.deals.list();
  deals.slice(0, 5).forEach(deal => {
    const saved = ZAMApi.deals.isSaved(deal.id);
    const card = el('div', 'deal-card-mini card-dark');
    card.innerHTML = `
      ${deal.is_hot ? '<div class="hot-badge">🔥 Hot</div>' : ''}
      <div class="store-icon">${deal.store_icon || deal.icon || '🏪'}</div>
      <div class="discount-badge">${deal.discount}</div>
      <div class="store-name">${deal.store_name || deal.merchant_name || ''}</div>
      <div class="deal-title">${deal.title}</div>
      <button class="bookmark-btn ${saved ? 'saved' : ''}" data-id="${deal.id}" data-type="deal" style="margin-top:8px" aria-label="Merken">
        ${saved ? '🔖 Gespeichert' : '🏷️ Merken'}
      </button>
    `;
    card.querySelector('.bookmark-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSave('deal', deal.id, e.currentTarget);
    });
    card.addEventListener('click', () => navigateTo('deals'));
    container.appendChild(card);
  });
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
  showToast(`🎉 +${result.points} Punkte! Challenge abgeschlossen!`, 'success');
  updatePointsDisplay(true);
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

const _SPIN_COLORS = ['#f59e0b', '#8b5cf6', '#10b981', '#3b82f6', '#ec4899', '#ef4444'];

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
  const overlay = $('#modal-spin');
  if (!overlay) return;
  const alreadySpun = localStorage.getItem(_spinKey()) === _todayStr();
  const result = $('#spin-result');
  const spinBtn = $('#btn-spin-go');
  if (result) result.style.display = 'none';
  _buildSpinCards(alreadySpun);
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

  // Pick reward by probability
  let cumulative = 0;
  const rand = Math.random();
  let reward = ZAMData.spinRewards[0];
  let rewardIdx = 0;
  for (let i = 0; i < ZAMData.spinRewards.length; i++) {
    cumulative += ZAMData.spinRewards[i].probability;
    if (rand <= cumulative) { reward = ZAMData.spinRewards[i]; rewardIdx = i; break; }
  }

  // Animate — shake all cards, then flip the winner
  const cards = $$('.spin-card');
  cards.forEach((c, i) => {
    setTimeout(() => {
      c.classList.add('shaking');
      setTimeout(() => c.classList.remove('shaking'), 350);
    }, i * 70);
  });

  setTimeout(async () => {
    if (cards[rewardIdx]) cards[rewardIdx].classList.add('flipped');

    const resultEl  = $('#spin-result');
    const resultPts = $('#spin-result-points');
    const resultLbl = $('#spin-result-label');
    const resultIcon = $('#spin-result-icon');
    if (resultEl)   resultEl.style.display = 'block';
    if (resultPts)  resultPts.textContent  = '+' + reward.points;
    if (resultLbl)  resultLbl.textContent  = reward.label + ' gewonnen!';
    if (resultIcon) resultIcon.textContent = reward.points >= 250 ? '🎉' : reward.points >= 100 ? '🥳' : '✨';

    await addPoints(reward.points, 'Daily Spin');
    localStorage.setItem(_spinKey(), _todayStr());

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

    if (spinBtn) spinBtn.textContent = '✓ Punkte gutgeschrieben';
    const nextSpin = $('#spin-next-info');
    if (nextSpin) nextSpin.textContent = '⏰ Nächste Drehung ab Mitternacht';

    await checkBadgesAfterAction();
    renderChallenges();
  }, 650);
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
    cell.style.background = filled ? '#1a1a2e' : 'white';
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
  const statusBadge = post.status === 'pending' ? `<span style="font-size:0.68rem;color:#f59e0b;margin-left:6px">⏳ ausstehend</span>` : '';

  div.innerHTML = `
    <div class="post-header">
      <div class="post-avatar" style="background:${post.author?.avatar_color || '#8b5cf6'}">${post.author?.initials || '?'}</div>
      <div class="post-author-info">
        <div class="post-author-name">${post.author?.name || 'Unbekannt'}${statusBadge}</div>
        <div class="post-author-level">${post.author?.level || 'Member'}</div>
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
  div.style.setProperty('--accent-color', evt.category_color);
  const spotsLow = evt.spots_left <= 10;

  div.innerHTML = `
    <div class="event-card-top">
      <div class="category-tag tag" style="background:${evt.category_color}22;color:${evt.category_color}">${evt.category}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="bookmark-btn ${evt.is_saved ? 'saved' : ''}" data-type="event" data-id="${evt.id}" aria-label="${evt.is_saved ? 'Gespeichert' : 'Merken'}">
          ${evt.is_saved ? '🔖' : '🏷️'}
        </button>
        <div class="event-points-badge">+${evt.points_reward}P</div>
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

  await addPoints(evt.points_reward || 0, evt.title);
  const eventsEl = $('#profile-stat-events');
  if (eventsEl) eventsEl.textContent = ZAMData.currentUser.stats?.events_attended || 0;
  showToast(`🎉 Angemeldet! +${evt.points_reward || 0} Punkte`, 'success');
  await checkBadgesAfterAction();
  renderChallenges();
}

// =============================================
// Deals Page
// =============================================
async function renderDeals() {
  const container = $('#deals-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-text-muted)">Lädt…</div>';

  state.deals = await ZAMApi.deals.list();
  container.innerHTML = '';
  state.deals.forEach((deal, idx) => container.appendChild(renderDealCard(deal, idx)));
}

function renderDealCard(deal, idx) {
  const div = el('div', 'deal-card-full card-dark');

  div.innerHTML = `
    ${deal.is_hot ? '<div class="hot-badge" style="margin-bottom:10px">🔥 Beliebt</div>' : ''}
    <div class="deal-card-header">
      <div class="deal-store-icon">${deal.store_icon}</div>
      <div class="deal-info">
        <div class="deal-store-name">${deal.store_name}</div>
        <div class="deal-discount-big">${deal.discount}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div class="category-tag tag" style="background:${deal.category_color}22;color:${deal.category_color}">${deal.category}</div>
        <button class="bookmark-btn ${deal.is_saved ? 'saved' : ''}" data-type="deal" data-id="${deal.id}" aria-label="Merken">
          ${deal.is_saved ? '🔖' : '🏷️'}
        </button>
      </div>
    </div>
    <div class="deal-title">${deal.title}</div>
    <p class="deal-description">${deal.description}</p>
    <div class="deal-card-footer">
      <div class="deal-expiry">🗓 ${deal.expiry_formatted}</div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="${deal.is_claimed ? 'btn btn-sm claimed' : 'btn btn-primary btn-sm'}" data-idx="${idx}">
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
    savedDealsArr.length ? `<div class="saved-chip" onclick="openSavedDeals()" style="background:var(--primary,#8b5cf6);color:white;border-color:var(--primary,#8b5cf6)">Gespeicherte Deals →</div>` : '',
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
      </a>`;
    // Load unread notification count
    ZAMApi.admin.unreadCount().then(count => {
      const badge = $('#admin-notif-badge');
      if (badge && count > 0) { badge.textContent = count; badge.style.display = 'inline'; }
    });
  } else if (user.role === 'merchant') {
    container.innerHTML = `
      <a href="merchant.html" class="btn btn-primary btn-full" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px;padding:13px">
        🏪 Händler-Dashboard
      </a>`;
  } else {
    container.innerHTML = '';
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

  view.classList.add('open');
  setTimeout(() => $('#chat-input')?.focus(), 320);

  // Poll for new messages every 2.5 s (simulates Supabase Realtime)
  clearInterval(_chatPollTimer);
  _chatPollTimer = setInterval(_pollMessages, 2500);
}

function closeChatRoom() {
  $('#chat-room-view')?.classList.remove('open');
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
    return `
      <div class="chat-msg ${isOwn ? 'chat-msg-own' : 'chat-msg-other'}" data-msg-id="${m.id}">
        ${!isOwn ? `<div class="chat-msg-avatar" style="background:${m.author.color || '#8b5cf6'}">${m.author.initials || '?'}</div>` : ''}
        <div class="chat-msg-bubble-wrap">
          ${!isOwn ? `<div class="chat-msg-name">${m.author.name}</div>` : ''}
          <div class="chat-msg-bubble">${m.content}</div>
          <div class="chat-msg-time">
            ${time}
            ${!isOwn ? `<button class="chat-report-btn" onclick="openChatOptions('${m.id}','${m.user_id}','${(m.author.name||'').replace(/'/g,"\\'")}',${isAdmin})" aria-label="Optionen">⋯</button>` : ''}
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
  checkMapRedirect();
}

function authNavigate(page) {
  $$('.auth-page').forEach(p => p.classList.remove('active'));
  const target = $(`#page-${page}`);
  if (target) target.classList.add('active');
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
    item.innerHTML = `
      <div class="comment-avatar" style="background:${c.author.avatar_color || '#8b5cf6'}">${c.author.initials}</div>
      <div class="comment-body">
        <div class="comment-author">${c.author.name}</div>
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
        <div class="comment-avatar" style="background:${comment.author.avatar_color || '#8b5cf6'}">${comment.author.initials}</div>
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
          <div style="font-size:0.78rem;color:${d.category_color || '#8b5cf6'};margin-top:2px">${d.discount}</div>
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
  const contacts = ZAMApi.connections.all();

  if (contacts.length === 0) {
    container.innerHTML = `
      <div class="contacts-empty">
        <div class="contacts-empty-icon">👥</div>
        <div>Noch keine Kontakte</div>
        <div style="margin-top:6px;font-size:0.78rem">Andere ZAM-Besucher auf der Map anstupsen!</div>
      </div>`;
    return;
  }

  container.innerHTML = '';
  contacts.forEach(c => {
    const item = document.createElement('div');
    item.className = 'contact-item';
    const unread = ZAMApi.privateChat.unreadCount(ZAMApi.privateChat.getOrCreate(c.user_id));
    item.innerHTML = `
      <div class="contact-avatar" style="background:${_avatarColor(c.user_id)}">
        ${c.avatar_url ? `<img src="${c.avatar_url}" alt="${c.initials}" />` : c.initials}
        <div class="contact-online-dot"></div>
      </div>
      <div class="contact-info">
        <div class="contact-name">${c.display_name}</div>
        <div class="contact-username">${c.username || ''}</div>
      </div>
      ${unread > 0 ? `<span class="pc-unread-badge">${unread}</span>` : ''}
      <button class="contact-action-btn" data-uid="${c.user_id}" data-name="${c.display_name}" aria-label="Chat öffnen">💬</button>
    `;
    item.querySelector('.contact-action-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openPrivateChat(c.user_id, c.display_name, c.initials, c.avatar_url);
    });
    item.addEventListener('click', () => {
      openPrivateChat(c.user_id, c.display_name, c.initials, c.avatar_url);
    });
    container.appendChild(item);
  });
}

function _avatarColor(userId) {
  const colors = ['#8b5cf6', '#7c3aed', '#10b981', '#3b82f6', '#ec4899', '#f59e0b', '#06b6d4'];
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
    item.innerHTML = `
      <div class="nudge-item-avatar" style="background:${_avatarColor(n.from_id)}">
        ${n.from_initials || n.from_id.slice(0, 2).toUpperCase()}
      </div>
      <div class="nudge-item-info">
        <div class="nudge-item-name">${n.from_name || 'Jemand'} hat dich angestupst</div>
        <div class="nudge-item-time">${timeStr}</div>
      </div>
      <div class="nudge-item-actions">
        <button class="nudge-accept-btn" data-id="${n.id}">✓</button>
        <button class="nudge-reject-btn" data-id="${n.id}">✕</button>
      </div>
    `;
    item.querySelector('.nudge-accept-btn').addEventListener('click', () => {
      ZAMApi.nudges.accept(n.id);
      showToast(`🤝 Verbunden mit ${n.from_name}!`, 'connection');
      renderNudgeInbox();
      updateCommunityBadge();
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
  if (avatarEl) {
    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
      avatarEl.style.background = 'none';
    } else {
      avatarEl.textContent = initials || userName.slice(0, 2).toUpperCase();
      avatarEl.style.background = _avatarColor(userId);
    }
  }
  if (nameEl) nameEl.textContent = userName;

  // Render messages + mark read
  _pcRenderMessages();
  ZAMApi.privateChat.markRead(_pcCurrentChatId);
  updateCommunityBadge();

  $('#private-chat-view')?.classList.add('open');
  setTimeout(() => $('#pc-input')?.focus(), 320);

  // Poll for new messages
  clearInterval(_pcPollTimer);
  _pcPollTimer = setInterval(_pcPollMessages, 2500);
}

function closePrivateChat() {
  $('#private-chat-view')?.classList.remove('open');
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
    const isOwn = m.sender_id === uid;
    const time  = new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="chat-msg ${isOwn ? 'chat-msg-own' : 'chat-msg-other'}">
        ${!isOwn ? `<div class="chat-msg-avatar" style="background:${_avatarColor(m.sender_id)}">${m.sender_initials || '?'}</div>` : ''}
        <div class="chat-msg-bubble-wrap">
          ${!isOwn ? `<div class="chat-msg-name">${m.sender_name}</div>` : ''}
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

function openUserProfileSheet(userId, userName, initials, avatarUrl) {
  _upsTargetUser = { userId, userName, initials, avatarUrl };

  const avatarEl   = $('#ups-avatar');
  const nameEl     = $('#ups-name');
  const usernameEl = $('#ups-username');
  if (avatarEl) {
    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
      avatarEl.style.background = 'none';
    } else {
      avatarEl.textContent = initials || userName.slice(0, 2).toUpperCase();
      avatarEl.style.background = _avatarColor(userId);
    }
  }
  if (nameEl) nameEl.textContent = userName;

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
        openPrivateChat(userId, userName, initials, avatarUrl);
        navigateTo('community');
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
      if (lastMsg) showToast(`💬 Neue Nachricht von ${lastMsg.sender_name}`, 'message');
    }
  }
  _lastPcUnread = pcUnread;

  updateCommunityBadge();
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
      setTimeout(() => {
        // Switch to contacts tab
        $$('.community-tab').forEach(t => t.classList.remove('active'));
        $$('.community-panel').forEach(p => p.classList.remove('active'));
        const contactsTab = $('.community-tab[data-ctab="contacts"]');
        if (contactsTab) contactsTab.classList.add('active');
        $('#cpanel-contacts')?.classList.add('active');
        renderContacts();
        setTimeout(() => openPrivateChat(target.userId, target.userName, target.initials, target.avatarUrl), 200);
      }, 300);
    } catch {}
  }
}

// =============================================
// Init
// =============================================
function init() {
  initNavigation();
  initModals();
  initDailySpin();
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
  initAuth();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
