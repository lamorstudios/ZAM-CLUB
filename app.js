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
  // Close overlays, unlock scroll
  _unlockBodyScroll();
  $('#chat-room-view')?.classList.remove('open');
  $('#private-chat-view')?.classList.remove('open');

  if (state.currentPage === pageId) return;

  const currentEl = $(`#page-${state.currentPage}`);
  if (currentEl) currentEl.classList.remove('active');

  state.currentPage = pageId;

  const nextEl = $(`#page-${pageId}`);
  if (nextEl) nextEl.classList.add('active');

  // Sub-pages live OUTSIDE #app-shell in the DOM. When active, app-shell's
  // min-height:100dvh would create 100dvh of black space before the sub-page.
  // Collapse app-shell to height:0 when on a sub-page.
  const MAIN_PAGES = new Set(['home','community','events','deals','merchants','profile','notifications','notif-settings','merchant-preview']);
  document.body.classList.toggle('subpage-active', !MAIN_PAGES.has(pageId));

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
  renderHomeRecs();
  renderHomeEvents();
  renderHomeDeals();

  // Referral CTA widget
  const refCode = _getReferralCode(user);
  const refCodeEl = document.getElementById('home-referral-code');
  if (refCodeEl && refCode) refCodeEl.textContent = refCode;
  const refKey = 'zam_referrals_' + (user?.id || 'guest');
  const refCount = JSON.parse(localStorage.getItem(refKey) || '[]').length;
  const refCountEl = document.getElementById('home-referral-count');
  const refPtsEl   = document.getElementById('home-referral-pts');
  if (refCountEl) refCountEl.textContent = refCount;
  if (refPtsEl)   refPtsEl.textContent   = refCount * 250;

  // Show Händler Tools card for merchant/admin
  const toolsCard = document.getElementById('home-merchant-tools');
  if (toolsCard) {
    const isMerchant = user.role === 'merchant' || user.role === 'admin';
    toolsCard.style.display = isMerchant ? 'block' : 'none';
    const shopName = document.getElementById('home-merchant-shopname');
    if (shopName && user.role === 'merchant') {
      shopName.textContent = user.display_name || user.name || 'Mein Shop';
    } else if (shopName && user.role === 'admin') {
      shopName.textContent = 'Admin-Vorschau aktiv';
    }
  }
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
      <button class="btn btn-primary" style="margin-top:10px;padding:6px 12px;font-size:0.72rem;width:100%" onclick="openVoucherQR('${deal.id}','${esc(deal.title)}','${deal.merchant_id||''}');event.stopPropagation()">🎟 Einlösen</button>
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
    ${evt.is_joined ? `<button onclick="eventCheckIn('${evt.id}','${(evt.title||'').replace(/'/g,"\\'")}')" style="width:100%;margin-top:10px;padding:11px;background:rgba(16,185,129,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:10px;font-size:0.82rem;font-weight:700;font-family:var(--font);cursor:pointer">📍 Beim Event einchecken • +50 Punkte</button>` : ''}
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
    <div class="deal-footer">
      <div class="deal-validity">📅 ${deal.expiry_formatted}</div>
      <div class="deal-actions">
        <button onclick="openDealMatch('${deal.id}','${(deal.title||'').replace(/'/g,"\\'")}');event.stopPropagation()" class="deal-action-btn deal-action-social">👥 Gemeinsam</button>
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
      <div style="background:rgba(109,40,217,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:14px;padding:14px 16px;margin-top:4px">
        <div style="font-size:0.72rem;font-weight:700;color:rgba(196,181,253,0.7);margin-bottom:10px">🏪 Händler Tools (Admin)</div>
        <button class="btn btn-ghost btn-full" onclick="openQRScanner()" style="margin-bottom:6px">📷 QR-Code scannen</button>
        <button class="btn btn-ghost btn-full" onclick="openMerchantStatsOverlay()" style="margin-bottom:6px">📊 Händler-Statistiken</button>
        <button class="btn btn-ghost btn-full" onclick="openMerchantDealModal()">🏷️ Demo Deal einreichen</button>
      </div>`;
  } else if (user.role === 'merchant') {
    container.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(109,40,217,0.2),rgba(139,92,246,0.1));border:1px solid rgba(139,92,246,0.3);border-radius:14px;padding:14px 16px;margin-bottom:12px">
        <div style="font-size:0.78rem;font-weight:800;color:#c4b5fd;margin-bottom:12px">🏪 Händler Tools</div>
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
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px 16px;text-align:center;margin-bottom:8px">
        <div style="font-size:1.4rem;margin-bottom:6px">⏳</div>
        <div style="font-size:0.8rem;font-weight:700;color:#fbbf24;margin-bottom:4px">Zugang wird geprüft</div>
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
  setTimeout(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default' && !localStorage.getItem('push_banner_dismissed')) {
      // Banner is shown when user navigates to notifications page
    }
  }, 2000);
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
      colorDark: '#090910', colorLight: '#ffffff',
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
      renderNudgeInbox();
      updateCommunityBadge();
      // Show toast with chat button
      const toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;bottom:calc(var(--nav-h,64px) + 12px);left:50%;transform:translateX(-50%);z-index:9999;background:#1a0533;border:1px solid rgba(139,92,246,0.4);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:var(--font);max-width:92vw;animation:fadeUp 0.25s ease both';
      toastEl.innerHTML = `
        <span style="font-size:0.84rem;color:#e2e8f0;font-weight:600">🤝 Verbunden mit <strong>${n.from_name}</strong>!</span>
        <button style="background:linear-gradient(135deg,#6d28d9,#8b5cf6);border:none;border-radius:9px;padding:7px 14px;color:#fff;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer;white-space:nowrap" onclick="this.closest('div[style]').remove();navigateTo('community');setTimeout(()=>openPrivateChat('${n.from_id}','${(n.from_name||'').replace(/'/g,"\\'")}','${(n.from_initials||'').replace(/'/g,"\\'")}',null),250)">💬 Jetzt chatten</button>`;
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

  const icons = {message:'💬', nudge:'👋', event:'🎉', deal:'🏷️', community:'👥', badge:'🏆', info:'ℹ️'};
  list.innerHTML = filtered.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="onNotifClick('${n.id}','${(n.url||'').replace(/'/g,"\\'")}','${n.type||''}')">
      <div class="notif-icon type-${n.type||'info'}">${icons[n.type] || '🔔'}</div>
      <div class="notif-body">
        <div class="notif-title">${escHtml(n.title||'')}</div>
        <div class="notif-text">${escHtml(n.body||'')}</div>
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
      ${n.read ? '' : '<div class="notif-unread-dot"></div>'}
      <button class="notif-del-btn" onclick="event.stopPropagation();ZAMApi.notifications.deleteById('${n.id}');renderNotifications()">✕</button>
    </div>`).join('');
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
    {key:'messages', label:'💬 Nachrichten'},
    {key:'nudges',   label:'👋 Anstupsien'},
    {key:'events',   label:'🎉 Events'},
    {key:'deals',    label:'🏷️ Deals'},
    {key:'community',label:'👥 Community'},
    {key:'badges',   label:'🏆 Abzeichen'},
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
      <div style="grid-column:1/-1;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:14px;padding:28px 20px;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:12px">⏳</div>
        <div style="font-size:0.95rem;font-weight:700;color:#fbbf24;margin-bottom:8px">Zugang wird geprüft</div>
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
          <div class="dash-row-val" style="font-size:0.65rem;color:${v.status==='redeemed'?'#34d399':'#f59e0b'}">${v.status.toUpperCase()}</div>
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

  const inputStyle = 'width:100%;background:var(--surface-2);border:1px solid rgba(139,92,246,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none;box-sizing:border-box';

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
        <button onclick="adminSendMerchantInvite()" style="background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;border:none;border-radius:10px;padding:12px;font-size:0.84rem;font-weight:700;font-family:var(--font);cursor:pointer;width:100%">
          📧 Händler einladen
        </button>
      </div>
    </div>

    ${pending.length ? `
    <div style="margin-bottom:20px">
      <h3 style="font-size:0.88rem;font-weight:700;color:#fbbf24;margin-bottom:10px">⏳ Händler freigeben (${pending.length})</h3>
      ${pending.map(m => `
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:12px 14px;margin-bottom:8px">
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
              : 'background:rgba(245,158,11,0.1);color:#fbbf24;border:1px solid rgba(245,158,11,0.25)';
            const statusLabel = inv.status === 'approved' ? 'Aktiv' : inv.status === 'rejected' ? 'Abgelehnt' : 'Ausstehend';
            return `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(139,92,246,0.15);border-radius:12px;padding:12px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
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
        <input id="inv-shopname" placeholder="Shopname *" class="input-field" style="background:var(--surface-2);border:1px solid rgba(139,92,246,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none"/>
        <input id="inv-email" type="email" placeholder="Händler E-Mail *" class="input-field" style="background:var(--surface-2);border:1px solid rgba(139,92,246,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none"/>
        <input id="inv-contact" placeholder="Ansprechpartner *" class="input-field" style="background:var(--surface-2);border:1px solid rgba(139,92,246,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none"/>
        <select id="inv-category" style="background:var(--surface-2);border:1px solid rgba(139,92,246,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none">
          <option value="">Kategorie wählen…</option>
          <option>Mode</option><option>Gastronomie</option><option>Elektronik</option><option>Drogerie</option><option>Sport</option><option>Lebensmittel</option><option>Bücher &amp; Medien</option><option>Kosmetik &amp; Beauty</option><option>Dienstleistungen</option><option>Sonstiges</option>
        </select>
        <select id="inv-zone" style="background:var(--surface-2);border:1px solid rgba(139,92,246,0.25);color:#e2e8f0;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-family:var(--font);outline:none">
          <option value="mk2_1">MK 2(1) – Nahversorgung / Gastro</option>
          <option value="mk2_2">MK 2(2) – Zentrenrelevante Sortimente</option>
          <option value="mk2_3">MK 2(3) – Zentrenrelevante Sortimente</option>
          <option value="mk2_4">MK 2(4) – Nahversorgung</option>
          <option value="plaza">Mahatma-Gandhi-Platz</option>
        </select>
        <div id="inv-error" style="display:none;font-size:0.74rem;color:#f87171;padding:6px 0"></div>
        <button onclick="adminSendMerchantInvite()" style="background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;border:none;border-radius:10px;padding:12px;font-size:0.84rem;font-weight:700;font-family:var(--font);cursor:pointer">
          📧 Händler einladen
        </button>
      </div>
    </div>

    ${pending.length ? `
    <div style="margin-bottom:20px">
      <h3 style="font-size:0.9rem;font-weight:700;color:#fbbf24;margin-bottom:10px">⏳ Händler freigeben (${pending.length})</h3>
      ${pending.map(m => `
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:12px 14px;margin-bottom:8px">
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
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(139,92,246,0.15);border-radius:12px;padding:12px 14px;margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="flex:1">
                <div style="font-size:0.82rem;font-weight:700;color:#e2e8f0">${escHtml(inv.shopname)}</div>
                <div style="font-size:0.68rem;color:rgba(255,255,255,0.4);margin-top:2px">${escHtml(inv.email)} · ${escHtml(inv.category||'')} · ${escHtml(inv.zone||'')}</div>
                <div style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-top:2px">Eingeladen: ${new Date(inv.ts).toLocaleDateString('de-DE')}</div>
              </div>
              <div style="font-size:0.65rem;font-weight:700;padding:3px 8px;border-radius:6px;flex-shrink:0;${inv.status==='approved'?'background:rgba(5,150,105,0.15);color:#34d399;border:1px solid rgba(52,211,153,0.3)':inv.status==='rejected'?'background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)':'background:rgba(245,158,11,0.1);color:#fbbf24;border:1px solid rgba(245,158,11,0.25)'}">
                ${inv.status==='approved'?'Aktiv':inv.status==='rejected'?'Abgelehnt':'Ausstehend'}
              </div>
            </div>
            ${inv.status === 'approved' ? `
            <div style="margin-top:8px">
              <button onclick="adminOpenMerchantPreview(${JSON.stringify(JSON.stringify(inv))})" style="width:100%;background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.3);border-radius:8px;padding:7px;color:#c4b5fd;font-size:0.74rem;font-weight:700;font-family:var(--font);cursor:pointer">
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
    const zoneColors = {mk2_1:'#d97706', mk2_2:'#7c3aed', mk2_3:'#059669', mk2_4:'#2563eb', plaza:'#8b5cf6'};
    const zoneEntries = Object.entries(stats.zoneVisits).sort((a,b)=>b[1]-a[1]);
    const maxV = Math.max(...zoneEntries.map(z=>z[1]), 1);
    zoneEl.innerHTML = `<div class="dash-table-wrap">${zoneEntries.map(([zone, count]) => `
      <div class="zone-bar-row">
        <div class="zone-bar-name" style="color:${zoneColors[zone]||'#e2e8f0'}">${zoneNames[zone]||zone}</div>
        <div class="zone-bar-track"><div class="zone-bar-fill" style="width:${(count/maxV*100).toFixed(0)}%;background:${zoneColors[zone]||'#8b5cf6'}"></div></div>
        <div class="zone-bar-count">${count}</div>
      </div>`).join('')}</div>`;
  }

  renderAdminTopList('admin-top-merchants', stats.topMerchants, '🏪', 'Händler', 'Aufrufe');
  renderAdminTopList('admin-top-deals',     stats.topDeals,     '🏷️', 'Deal',    'Aufrufe');
  renderAdminTopList('admin-top-events',    stats.topEvents,    '🎉', 'Event',   'Aufrufe');

  renderAdminPushStats();
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
    <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);border-radius:14px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:0.82rem;font-weight:700;color:#c4b5fd;margin-bottom:10px">👁 Händler-Dashboard ansehen</div>
      ${invites.length === 0 ? '<div style="font-size:0.74rem;color:var(--dim)">Noch keine freigegebenen Händler.</div>' :
        `<select id="admin-preview-select" style="width:100%;background:var(--surface-2);border:1px solid rgba(139,92,246,0.3);color:#e2e8f0;border-radius:8px;padding:8px 12px;font-size:0.8rem;font-family:var(--font);margin-bottom:8px">
          <option value="">— Händler auswählen —</option>
          ${invites.map(i => `<option value="${escHtml(i.id)}">${escHtml(i.shopname)}</option>`).join('')}
        </select>
        <button onclick="adminQuickPreviewSelected()" style="width:100%;background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;border:none;border-radius:8px;padding:10px;font-size:0.8rem;font-weight:700;font-family:var(--font);cursor:pointer">
          👁 Dashboard ansehen
        </button>`
      }
    </div>`;
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
    ${active ? `<div class="contract-card" style="margin-bottom:16px;border-color:rgba(139,92,246,0.3)">
      <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:4px">AKTUELLES PAKET</div>
      <div style="font-size:1.1rem;font-weight:800;color:#8b5cf6">${active.plan_name}</div>
      <div style="margin-top:6px"><span class="contract-status" style="background:${active.status==='active'?'rgba(34,197,94,0.15)':'rgba(245,158,11,0.15)'};color:${ZAMApi.contracts.statusColor(active.status)}">${ZAMApi.contracts.statusLabel(active.status)}</span>
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
        <span class="contract-status" style="background:${c.status==='active'?'rgba(34,197,94,0.15)':c.status==='trial'?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.1)'};color:${ZAMApi.contracts.statusColor(c.status)};white-space:nowrap">${ZAMApi.contracts.statusLabel(c.status)}</span>
      </div>
      <div style="font-size:0.85rem;font-weight:700;color:#8b5cf6;margin-top:10px">${c.price}€ gesamt</div>
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
    ${active ? `<div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:4px">LAUFENDES PAKET</div>
      <div style="font-size:0.95rem;font-weight:700;color:#c4b5fd">${escHtml(active.plan_name)} — ${ZAMApi.packages.PLANS[active.plan_id]?.price||0}€/Monat</div>
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
            ${inv.status==='pending' ? `<br><button style="font-size:0.65rem;color:#8b5cf6;background:none;border:none;cursor:pointer;margin-top:4px;font-family:var(--font)" onclick="markInvoicePaid('${inv.id}')">Als bezahlt markieren</button>` : ''}
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
          <div style="margin-left:auto;text-align:right"><div style="font-size:0.85rem;font-weight:700;color:#a78bfa">${c.price}€</div><span class="contract-status" style="background:${c.status==='active'?'rgba(34,197,94,0.15)':c.status==='trial'?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.1)'};color:${ZAMApi.contracts.statusColor(c.status)}">${ZAMApi.contracts.statusLabel(c.status)}</span></div>
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
  const zoneColors = { mk2_1: '#d97706', mk2_2: '#7c3aed', mk2_3: '#059669', mk2_4: '#2563eb', plaza: '#8b5cf6' };
  const zoneEl = document.getElementById('demo-zone-heatmap');
  if (zoneEl) {
    const entries = Object.entries(heatmap).sort((a, b) => b[1] - a[1]);
    const maxV = Math.max(...entries.map(e => e[1]), 1);
    zoneEl.innerHTML = entries.map(([zone, count]) => `
      <div class="zone-bar-row">
        <div class="zone-bar-name" style="color:${zoneColors[zone] || '#e2e8f0'}">${zoneNames[zone] || zone}</div>
        <div class="zone-bar-track"><div class="zone-bar-fill" style="width:${(count / maxV * 100).toFixed(0)}%;background:${zoneColors[zone] || '#8b5cf6'}"></div></div>
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
      return `<div class="event-card" style="min-width:200px;flex-shrink:0" onclick="navigateTo('events')">
        <div class="event-card-header"><span class="event-tag">Empfohlen ✨</span></div>
        <div class="event-card-content"><div class="event-card-title">${esc(e.title)}</div><div class="event-card-meta">📅 ${esc(e.date||'')}</div></div>
      </div>`;
    } else {
      const d = (g.deals || []).find(x => x.id === r.id);
      if (!d) return '';
      return `<div class="deal-card" style="min-width:200px;flex-shrink:0" onclick="navigateTo('deals')">
        <div class="deal-tag-row"><span class="deal-tag deal-tag-new">Empfohlen ✨</span></div>
        <div class="deal-card-title">${esc(d.title)}</div>
        <div class="deal-card-merchant">${esc(d.merchant_name||'')}</div>
        <div class="deal-discount">${esc(d.discount||'')}</div>
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
      <div class="rec-card-body"><div class="rec-card-sub">📅 ${esc(e.date||'')} · ${esc(e.location||'ZAM Freiham')}</div></div>
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
      return `<div style="display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid rgba(139,92,246,0.12);border-radius:14px;padding:12px 14px">
        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6d28d9,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
        <div style="flex:1"><div style="font-size:0.85rem;font-weight:600;color:#e2e8f0">${esc(u.display_name||u.name||'')}</div><div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">${esc(u.level||'Mitglied')}</div></div>
        <button onclick="navigateTo('community')" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:8px;padding:6px 12px;font-size:0.72rem;font-weight:600;color:#c4b5fd;font-family:var(--font);cursor:pointer">Verbinden</button>
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
    topCat ? { icon: '🎯', title: 'Beliebteste Event-Kategorie', text: `"${topCat[0]}" Events haben die meisten Anmeldungen (${topCat[1]}). Plane mehr Events in dieser Kategorie!` } : null,
    topDealCat ? { icon: '🏷️', title: 'Meistgesparte Deal-Kategorie', text: `Nutzer speichern besonders viele "${topDealCat[0]}" Deals. Gewinne mehr Händler aus dieser Kategorie!` } : null,
    peakHour ? { icon: '⏰', title: 'Stoßzeit', text: `Die meiste App-Aktivität findet gegen ${peakHour[0]}:00 Uhr statt. Events & Deals zu dieser Zeit performen besser.` } : null,
    { icon: '👥', title: 'Neue Mitglieder', text: `${recent.length} neue Mitglieder in den letzten 7 Tagen. ${recent.length > 5 ? 'Starkes Wachstum! 🚀' : 'Aktiviere mehr Marketing-Maßnahmen.'}` },
    { icon: '💡', title: 'Community-Tipp', text: 'Nutzer die in der Community aktiv sind, besuchen das ZAM 2x häufiger. Fördere Community-Events!' },
  ].filter(Boolean);

  el.innerHTML = insights.map(ins => `<div class="ai-insight-card">
    <div class="ai-insight-icon">${ins.icon}</div>
    <div class="ai-insight-title">${ins.title}</div>
    <div class="ai-insight-text">${ins.text}</div>
  </div>`).join('');
}

// =============================================
// PHASE 18: Aktive Nutzer, Status & Deal Matching
// =============================================

const AU_ZONE_COLORS = { mk2_1: '#d97706', mk2_2: '#7c3aed', mk2_3: '#059669', mk2_4: '#2563eb', plaza: '#8b5cf6' };
const AU_ZONE_LABELS = { mk2_1: 'MK 2(1)', mk2_2: 'MK 2(2)', mk2_3: 'MK 2(3)', mk2_4: 'MK 2(4)', plaza: 'Gandhi-Platz' };
const AU_DEAL_STATUSES = ['🍔 Hungrig', '🤝 Suche 2-für-1', '🎉 Wer kommt mit?', '🛍️ Suche Begleitung'];

function getActiveUsers() {
  const me = ZAMApi.auth.currentUser();
  const ud = me ? JSON.parse(localStorage.getItem(`zamclub_u_${me.id}`) || '{}') : {};
  const blocked = ud.blocked_users || [];
  const avatarColors = ['#6d28d9', '#059669', '#d97706', '#2563eb', '#7c3aed', '#8b5cf6'];
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
    const zoneColor = AU_ZONE_COLORS[u.zone] || '#8b5cf6';
    const zoneLabel = AU_ZONE_LABELS[u.zone] || u.zone;
    const connected = me ? ZAMApi.nudges.isConnected(u.id) : false;
    const hasPending = me ? ZAMApi.nudges.hasPendingNudgeTo(u.id) : false;
    let actionBtn;
    if (connected) {
      actionBtn = `<button class="au-action-btn" onclick="openPCFromActiveUsers('${u.id}','${esc(u.name)}','${u.initials}')">💬 Chat</button>`;
    } else if (hasPending) {
      actionBtn = `<button class="au-action-btn" style="opacity:0.5;cursor:default">⏳ Gesendet</button>`;
    } else {
      actionBtn = `<button class="au-action-btn" onclick="nudgeFromActiveUsers('${u.id}','${esc(u.name)}')">👋 Anstupsen</button>`;
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
      <div class="au-actions">${actionBtn}</div>
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

function openDealMatch(dealId, dealTitle) {
  const sheet = $('#active-users-sheet');
  const inner = $('#active-users-sheet-inner');
  if (!sheet || !inner) return;

  // Hide my-status section, show deal context
  const myStatusRow = $('#my-status-row');
  if (myStatusRow) myStatusRow.style.display = 'none';

  const users = getActiveUsers().filter(u => AU_DEAL_STATUSES.includes(u.status));
  const countEl = $('#active-users-count');
  if (countEl) countEl.textContent = `${users.length} Nutzer suchen einen Deal-Partner`;

  const list = $('#active-users-list');
  if (list) {
    const header = `<div style="background:rgba(5,150,105,0.1);border:1px solid rgba(5,150,105,0.2);border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:0.78rem;color:#34d399;font-weight:600">🏷️ ${esc(dealTitle)}</div>`;
    if (!users.length) {
      list.innerHTML = header + `<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.35);font-size:0.75rem;line-height:1.5">Niemand sucht gerade einen Deal-Partner.<br><br>Setze deinen Status auf<br>„🤝 Suche 2-für-1" um sichtbar zu werden!</div>
        <button class="btn btn-ghost btn-full" onclick="setMyAppStatus('🤝 Suche 2-für-1')" style="margin-top:8px">Status setzen</button>`;
    } else {
      list.innerHTML = header + users.map(u => `<div class="deal-match-row">
        <div style="width:38px;height:38px;border-radius:50%;background:${u.color};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;flex-shrink:0">${u.initials}</div>
        <div style="flex:1;min-width:0;margin-left:10px">
          <div style="font-size:0.82rem;font-weight:600;color:#e2e8f0">${esc(u.name)}</div>
          <div style="font-size:0.68rem;color:rgba(255,255,255,0.4)">${esc(u.status)}</div>
        </div>
        <button class="deal-match-btn" onclick="requestDealPartner('${u.id}','${esc(u.name)}',\`${esc(dealTitle)}\`)">Anfragen</button>
      </div>`).join('');
    }
  }

  sheet.style.display = 'flex';
  requestAnimationFrame(() => { inner.style.transform = 'translateX(-50%) translateY(0)'; });
}

function requestDealPartner(userId, userName, dealTitle) {
  ZAMApi.nudges.send(userId, userName);
  ZAMApi.notifications.add({
    type: 'deal',
    title: 'Deal-Anfrage',
    body: `${ZAMApi.auth.currentUser()?.display_name || 'Jemand'} möchte "${dealTitle}" gemeinsam einlösen`,
    icon: '🏷️',
  });
  showToast(`✅ Anfrage an ${userName} gesendet!`, 'success');
  // Update button
  const btns = $$('.deal-match-btn');
  btns.forEach(btn => {
    if (btn.getAttribute('onclick')?.includes(userId)) {
      btn.textContent = '✓ Gesendet';
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }
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
      { icon:'👁️', val:stats.profileViews,   lbl:'Profilaufrufe',       color:'#c4b5fd' },
      { icon:'🏷️', val:stats.dealViews,       lbl:'Deal-Aufrufe',        color:'#fbbf24' },
      { icon:'💾', val:stats.dealSaves,       lbl:'Gespeicherte Deals',  color:'#60a5fa' },
      { icon:'✅', val:stats.dealRedemptions, lbl:'Eingelöste Gutscheine',color:'#34d399' },
      { icon:'🎉', val:stats.eventViews,      lbl:'Event-Aufrufe',       color:'#f472b6' },
      { icon:'🙋', val:stats.eventJoins,      lbl:'Event-Teilnahmen',    color:'#fb923c' },
    ];
    kpiEl.innerHTML = kpis.map(k => `
      <div style="background:#18181f;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px">
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
    const statusColor = { pending:'#fbbf24', approved:'#34d399', live:'#34d399', rejected:'#f87171', draft:'rgba(255,255,255,0.3)' };
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
  if (existing.length >= 4 && existing[0].rules) return; // already seeded with full data
  localStorage.removeItem('zam_photo_challenges');
  localStorage.setItem('zam_photo_challenges', JSON.stringify([
    { id:'ch_001', merchant_id:'demo_pitsburger', merchant_name:'Pitsburger', merchant_icon:'🍔',
      banner_color:'#7c3aed', demo_count:2,
      title:'Pitsburger Fan Challenge',
      description:'Fotografiere dein Burger-Menü bei Pitsburger an 5 verschiedenen Tagen und sichere dir deinen Gratis-Bonus.',
      reward_description:'Gratis Pommes oder 20 % auf dein nächstes Menü',
      rules:['1 Foto pro Tag zählt','Foto muss im ZAM aufgenommen werden','Burger oder Menü muss sichtbar sein','Kein Upload aus der Galerie'],
      required_photos_count:5, max_per_day:1,
      location_required:true, radius_meters:500, status:'active', created_at:new Date().toISOString() },
    { id:'ch_002', merchant_id:'demo_gelato', merchant_name:'Gelato World', merchant_icon:'🍦',
      banner_color:'#0891b2', demo_count:1,
      title:'Gelato Summer Challenge',
      description:'Zeig deine Lieblingssorte von Gelato World! 3 Fotos an verschiedenen Tagen und du bekommst eine Kugel gratis.',
      reward_description:'1 Kugel gratis + 150 Punkte',
      rules:['1 Foto pro Tag zählt','Gelato muss im Bild sichtbar sein','Nur im ZAM Freiham','Kein Upload aus der Galerie'],
      required_photos_count:3, max_per_day:1,
      location_required:true, radius_meters:500, status:'active', created_at:new Date().toISOString() },
    { id:'ch_003', merchant_id:'demo_cafe_freiham', merchant_name:'Café Freiham', merchant_icon:'☕',
      banner_color:'#b45309', demo_count:0,
      title:'Coffee Moments Challenge',
      description:'5 Coffee-Moments an 5 verschiedenen Tagen im Café Freiham. Dein zweites Heißgetränk bekommst du für nur 1 €!',
      reward_description:'2. Heißgetränk für 1 € + 200 Punkte',
      rules:['1 Foto pro Tag zählt','Heißgetränk muss sichtbar sein','Nur im Café Freiham','Kein Upload aus der Galerie'],
      required_photos_count:5, max_per_day:1,
      location_required:true, radius_meters:500, status:'active', created_at:new Date().toISOString() },
    { id:'ch_004', merchant_id:'demo_asia', merchant_name:'Asia Street Food', merchant_icon:'🥢',
      banner_color:'#059669', demo_count:3,
      title:'Asia Street Food Challenge',
      description:'4 Lunch-Fotos aus der asiatischen Küche im ZAM. Fast geschafft – der Gutschein für Gratis-Frühlingsrollen wartet!',
      reward_description:'Gratis Frühlingsrollen + 100 Punkte',
      rules:['1 Foto pro Tag zählt','Gericht muss erkennbar sein','Nur bei Asia Street Food im ZAM','Kein Upload aus der Galerie'],
      required_photos_count:4, max_per_day:1,
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
    { id:'sub_d1', challenge_id:'ch_001', challenge_name:'Pitsburger Fan Challenge', user_id:'demo_user1', username:'julia_m', image_data: _makeDemoPhotoDataUrl('🍔','#7c3aed','Pitsburger Fan'), lat:48.1523, lng:11.4386, submission_day:'2026-06-10', created_at:'2026-06-10T12:00:00Z', status:'auto_approved' },
    { id:'sub_d2', challenge_id:'ch_002', challenge_name:'Gelato Summer Challenge', user_id:'demo_user2', username:'max_k', image_data: _makeDemoPhotoDataUrl('🍦','#0891b2','Gelato Moment'), lat:48.1524, lng:11.4387, submission_day:'2026-06-11', created_at:'2026-06-11T14:30:00Z', status:'auto_approved' },
    { id:'sub_d3', challenge_id:'ch_003', challenge_name:'Asia Street Food Challenge', user_id:'demo_user3', username:'sarah_l', image_data: _makeDemoPhotoDataUrl('🥢','#059669','Asian Food'), lat:48.1522, lng:11.4385, submission_day:'2026-06-12', created_at:'2026-06-12T13:00:00Z', status:'auto_approved' },
    { id:'sub_d4', challenge_id:'ch_001', challenge_name:'Pitsburger Fan Challenge', user_id:'demo_user4', username:'tom_w', image_data: _makeDemoPhotoDataUrl('🍔','#dc2626','Burger Moment'), lat:48.1523, lng:11.4386, submission_day:'2026-06-13', created_at:'2026-06-13T18:00:00Z', status:'auto_approved' },
    { id:'sub_d5', challenge_id:'ch_004', challenge_name:'ZAM Entdecker', user_id:'demo_user5', username:'anna_p', image_data: _makeDemoPhotoDataUrl('🏪','#d97706','ZAM Highlight'), lat:48.1523, lng:11.4386, submission_day:'2026-06-14', created_at:'2026-06-14T11:00:00Z', status:'auto_approved' },
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
  const hero = `
  <div style="background:linear-gradient(160deg,#1e1040 0%,#0f172a 60%,#090910 100%);padding:0 20px 24px;position:relative;overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;padding:14px 0 16px">
      <button onclick="navigateTo('community')" style="background:rgba(255,255,255,0.08);border:none;color:#fff;border-radius:10px;width:36px;height:36px;font-size:1.1rem;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:#a78bfa">ZAM Community</span>
    </div>
    <div style="position:absolute;top:0;right:-20px;font-size:9rem;opacity:0.06;pointer-events:none">📸</div>
    <h1 style="font-size:1.55rem;font-weight:900;line-height:1.2;margin-bottom:10px;color:#fff">📸 Foto-Challenges</h1>
    <p style="font-size:0.82rem;color:rgba(255,255,255,0.55);line-height:1.65;max-width:320px">Mach Fotos im ZAM, sammle Fortschritt und sichere dir exklusive Belohnungen von teilnehmenden Händlern.</p>
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
  <div style="margin:0 16px 20px;background:rgba(139,92,246,0.07);border:1px solid rgba(139,92,246,0.18);border-radius:16px;padding:16px">
    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:#a78bfa;margin-bottom:14px">💡 So funktioniert's</div>
    ${steps.map(([n,t,d]) => `
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px">
      <div style="width:24px;height:24px;border-radius:50%;background:rgba(139,92,246,0.25);border:1px solid rgba(139,92,246,0.4);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;color:#c4b5fd;flex-shrink:0">${n}</div>
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
    const c = ch.banner_color || '#6d28d9';

    const slots = Array.from({length: total}, (_, i) =>
      i < count
        ? `<div style="width:38px;height:38px;border-radius:9px;background:${c}33;border:2px solid ${c}88;display:flex;align-items:center;justify-content:center;font-size:1rem">✅</div>`
        : `<div style="width:38px;height:38px;border-radius:9px;background:rgba(255,255,255,0.04);border:1.5px dashed rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;font-size:0.9rem;color:rgba(255,255,255,0.2)">📷</div>`
    ).join('');

    return `
    <div style="background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:18px;overflow:hidden;margin-bottom:14px">
      <!-- Banner -->
      <div style="background:linear-gradient(135deg,${c},${c}99);padding:16px;display:flex;align-items:center;gap:14px">
        <div style="font-size:2.6rem;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5))">${ch.merchant_icon}</div>
        <div style="flex:1">
          <div style="font-size:1rem;font-weight:800;color:#fff;line-height:1.25">${escHtml(ch.title)}</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.65);margin-top:3px">${escHtml(ch.merchant_name)}</div>
        </div>
        <span style="font-size:0.6rem;font-weight:800;padding:4px 10px;border-radius:20px;white-space:nowrap;${done ? 'background:rgba(251,191,36,0.2);color:#fbbf24;border:1px solid rgba(251,191,36,0.3)' : 'background:rgba(255,255,255,0.15);color:#fff'}">${done ? '✅ Fertig' : '🔥 Aktiv'}</span>
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
          ${doneToday ? '<span style="font-size:0.63rem;padding:4px 9px;border-radius:20px;background:rgba(245,158,11,0.1);color:#fbbf24;border:1px solid rgba(245,158,11,0.2)">⚠️ Heute bereits eingereicht</span>' : ''}
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
        <div style="background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden">
          <div style="aspect-ratio:1;overflow:hidden;background:#0d0d18">
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
      <button onclick="navigateTo('community-gallery')" style="font-size:0.72rem;font-weight:700;color:#a78bfa;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:8px;padding:5px 10px;cursor:pointer;font-family:var(--font)">Alle →</button>
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
  const c = ch.banner_color || '#6d28d9';
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
      div.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:linear-gradient(160deg,#1a1040,#0a0a1a)';
      div.innerHTML = `
        <div style="font-size:5rem;filter:drop-shadow(0 4px 20px rgba(139,92,246,0.5))">📷</div>
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
  const colors = { ch_001:'#7c3aed', ch_002:'#0891b2', ch_003:'#b45309', ch_004:'#059669' };
  const color = (ch && colors[ch.id]) || '#6d28d9';
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
  el.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 16px;border-radius:20px;font-size:0.74rem;font-weight:700;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#fbbf24;width:fit-content;margin:0 auto 20px';
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
  user:     { label:'👤 Nutzer',  color:'#c4b5fd', bg:'rgba(139,92,246,0.2)', border:'rgba(139,92,246,0.3)', btnColor:'#a78bfa' },
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
    { id:'rew_d1', type:'challenge', merchant_name:'Asia Street Food', merchant_icon:'🥢', title:'Gratis Frühlingsrollen', description:'Einzulösen bei Asia Street Food im ZAM.', voucher_id:'ZAM-AS7742', status:'available', challenge_id:'ch_004', expires_at: new Date(Date.now()+30*86400000).toISOString(), earned_at: new Date().toISOString() },
    { id:'rew_d2', type:'points',    merchant_name:'Café Freiham',     merchant_icon:'☕', title:'Gratis Kaffee',         description:'Ein Heißgetränk deiner Wahl gratis.',   voucher_id:'ZAM-CF4419', status:'available', points_cost:500, expires_at: new Date(Date.now()+14*86400000).toISOString(), earned_at: new Date().toISOString() },
    { id:'rew_d3', type:'event',     merchant_name:'ZAM Freiham',      merchant_icon:'🎫', title:'Summer Event Ticket',  description:'Einlass zum ZAM Summer Community Event.', voucher_id:'ZAM-EV1123', status:'redeemed',  expires_at: new Date(Date.now()-2*86400000).toISOString(), earned_at: new Date(Date.now()-5*86400000).toISOString(), redeemed_at: new Date(Date.now()-2*86400000).toISOString() },
    { id:'rew_d4', type:'challenge', merchant_name:'Pitsburger',       merchant_icon:'🍔', title:'Gratis Pommes',        description:'Beilage deiner Wahl bei Pitsburger gratis.', voucher_id:'ZAM-PB9931', status:'available', challenge_id:'ch_001', expires_at: new Date(Date.now()+21*86400000).toISOString(), earned_at: new Date().toISOString() },
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

  const typeLabel = { challenge:'🏆 Challenge', points:'⭐ Punkte', event:'🎫 Event' };
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
    <div style="background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:16px;margin-bottom:12px;${isAvail ? '' : 'opacity:0.6'}">
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
        <span style="font-size:0.62rem;padding:3px 9px;border-radius:20px;background:rgba(139,92,246,0.12);color:#a78bfa;border:1px solid rgba(139,92,246,0.2)">${typeLabel[r.type]||r.type}</span>
        <span style="font-size:0.62rem;color:rgba(255,255,255,0.3)">ID: ${r.voucher_id}</span>
        <span style="font-size:0.62rem;color:${daysLeft < 5 && isAvail ? '#f59e0b' : 'rgba(255,255,255,0.3)'}">
          ${r.status === 'redeemed' ? '✓ Eingelöst am '+new Date(r.redeemed_at).toLocaleDateString('de-DE') : daysLeft > 0 ? `Gültig noch ${daysLeft} Tag${daysLeft!==1?'e':''}` : 'Abgelaufen'}
        </span>
      </div>
      ${isAvail ? `
        <div style="display:flex;gap:8px">
          <button onclick="showQRVoucher('${r.id}')" style="flex:1;padding:11px;background:linear-gradient(135deg,#6d28d9,#8b5cf6);border:none;color:#fff;border-radius:12px;font-size:0.82rem;font-weight:800;font-family:var(--font);cursor:pointer">📱 QR-Code anzeigen</button>
          <button onclick="markRewardRedeemed('${r.id}')" style="flex:1;padding:11px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:12px;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer">✓ Als eingelöst markieren</button>
        </div>` : ''}
    </div>`;
  }

  // Points catalog
  const catalogHtml = POINTS_CATALOG.map(p => {
    const canAfford = pts >= p.points;
    return `
    <div style="background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px;margin-bottom:10px;display:flex;align-items:center;gap:12px">
      <div style="font-size:2rem;flex-shrink:0">${p.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.88rem;font-weight:800;color:#e2e8f0">${p.title}</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.4);margin-top:2px">${p.merchant}</div>
        <div style="font-size:0.7rem;color:#fbbf24;margin-top:3px;font-weight:700">⭐ ${p.points.toLocaleString('de-DE')} Punkte</div>
      </div>
      <button onclick="redeemPointsReward('${p.id}')" ${canAfford ? '' : 'disabled'} style="padding:9px 14px;border-radius:10px;font-size:0.75rem;font-weight:800;font-family:var(--font);cursor:${canAfford ? 'pointer' : 'default'};border:none;background:${canAfford ? 'linear-gradient(135deg,#b45309,#f59e0b)' : 'rgba(255,255,255,0.05)'};color:${canAfford ? '#fff' : 'rgba(255,255,255,0.25)'};white-space:nowrap">${canAfford ? 'Einlösen' : 'Zu wenig'}</button>
    </div>`;
  }).join('');

  container.innerHTML = `
  <!-- Hero -->
  <div style="background:linear-gradient(160deg,#1a1040,#0f172a,#090910);padding:0 20px 24px">
    <div style="display:flex;align-items:center;gap:12px;padding:14px 0 16px">
      <button onclick="navigateTo('profile')" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
      <span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:#fbbf24">Mein ZAM Club</span>
    </div>
    <h1 style="font-size:1.5rem;font-weight:900;color:#fff;margin-bottom:8px">🎁 Meine Belohnungen</h1>
    <p style="font-size:0.8rem;color:rgba(255,255,255,0.45);line-height:1.6">Aktive Gutscheine, Challenge-Prämien und Punkte-Belohnungen</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:12px">
        <div style="font-size:0.63rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:800;color:rgba(251,191,36,0.7);margin-bottom:4px">Verfügbar</div>
        <div style="font-size:1.6rem;font-weight:900;color:#fbbf24">${available.length}</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">Gutscheine</div>
      </div>
      <div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:12px;padding:12px">
        <div style="font-size:0.63rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:800;color:rgba(139,92,246,0.7);margin-bottom:4px">Meine Punkte</div>
        <div style="font-size:1.6rem;font-weight:900;color:#c4b5fd">${(pts||0).toLocaleString('de-DE')}</div>
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
    <div style="font-size:0.72rem;color:rgba(255,255,255,0.35);margin-bottom:14px">Du hast <strong style="color:#fbbf24">${(pts||0).toLocaleString('de-DE')} Punkte</strong>. Tausche sie gegen Prämien ein.</div>
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
      <button onclick="showQRVoucher('${r.id}')" style="width:100%;padding:13px;background:linear-gradient(135deg,#6d28d9,#8b5cf6);border:none;color:#fff;border-radius:12px;font-size:0.85rem;font-weight:800;font-family:var(--font);cursor:pointer;margin-bottom:10px">🔄 QR-Code erneuern</button>` : `
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
          new QRCode(qrEl, { text: `ZAM:${r.voucher_id}:${r.qr_expires_at}`, width:160, height:160, colorDark:'#1a1a2e', colorLight:'#ffffff' });
        } else {
          qrEl.innerHTML = `<div style="text-align:center;color:#1a1a2e;font-weight:800;font-size:0.9rem;padding:20px">${r.voucher_id}<br><span style="font-size:0.7rem;font-weight:400;opacity:0.6">Dem Händler zeigen</span></div>`;
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
  const refKey = 'zam_referrals_' + (user?.id || 'guest');
  const refCount = JSON.parse(localStorage.getItem(refKey) || '[]').length;
  body.innerHTML = `
    <h2 style="font-size:1.2rem;font-weight:900;color:#fff;margin-bottom:6px">👥 Freunde einladen</h2>
    <p style="font-size:0.78rem;color:rgba(255,255,255,0.45);margin-bottom:20px;line-height:1.6">Für jeden Freund der sich mit deinem Code anmeldet bekommst du <strong style="color:#fbbf24">+100 Punkte</strong>. Dein Freund erhält ebenfalls 100 Punkte!</p>
    <div style="background:rgba(139,92,246,0.1);border:2px dashed rgba(139,92,246,0.35);border-radius:14px;padding:18px;text-align:center;margin-bottom:16px">
      <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:800;color:rgba(139,92,246,0.7);margin-bottom:8px">Dein Referral-Code</div>
      <div style="font-size:2rem;font-weight:900;letter-spacing:0.12em;color:#c4b5fd;font-family:monospace">${code}</div>
      <button onclick="navigator.clipboard?.writeText('${code}').then(()=>showToast('✓ Code kopiert!'))" style="margin-top:12px;padding:8px 20px;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.3);color:#c4b5fd;border-radius:10px;font-family:var(--font);font-size:0.78rem;font-weight:700;cursor:pointer">📋 Code kopieren</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:1.6rem;font-weight:900;color:#c4b5fd">${refCount}</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">Eingeladene Freunde</div>
      </div>
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:1.6rem;font-weight:900;color:#fbbf24">${refCount * 100}</div>
        <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">Punkte verdient</div>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="font-size:0.7rem;font-weight:700;color:rgba(255,255,255,0.35);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.06em">So funktioniert's</div>
      ${[['1','Deinen Code teilen','Sende deinen persönlichen Code an Freunde'],['2','Freund registriert sich','Mit deinem Code im ZAM Club anmelden'],['3','Beide erhalten Punkte','+100 Punkte für dich, +100 Punkte für den Freund']].map(([n,t,d]) => `
      <div style="display:flex;gap:10px;margin-bottom:8px">
        <div style="width:20px;height:20px;border-radius:50%;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.3);display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:800;color:#c4b5fd;flex-shrink:0;margin-top:1px">${n}</div>
        <div><div style="font-size:0.78rem;font-weight:700;color:#e2e8f0">${t}</div><div style="font-size:0.68rem;color:rgba(255,255,255,0.35);margin-top:1px">${d}</div></div>
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

function eventCheckIn(eventId, eventName) {
  const user = ZAMApi.auth.currentUser();
  if (!user) { showToast('Bitte einloggen'); return; }
  const key = 'zam_checkins_' + user.id;
  const checkins = JSON.parse(localStorage.getItem(key)||'[]');
  if (checkins.includes(eventId)) { showToast('Du hast dich bereits eingecheckt!'); return; }
  navigator.geolocation?.getCurrentPosition(pos => {
    const dist = typeof _geoDistance === 'function' ? Math.round(_geoDistance(pos.coords.latitude, pos.coords.longitude, ZAM_LAT, ZAM_LNG)) : 0;
    if (dist > 1000) { showToast('❌ Du bist nicht im ZAM-Bereich'); return; }
    _doEventCheckin(eventId, key, checkins, user);
  }, () => _doEventCheckin(eventId, key, checkins, user));
}

function _doEventCheckin(eventId, key, checkins, user) {
  checkins.push(eventId);
  localStorage.setItem(key, JSON.stringify(checkins));
  try { ZAMApi.points?.add(50, 'Event Check-In').catch(()=>{}); } catch {}
  user.points = (user.points||0) + 50;
  ZAMData.currentUser = {...ZAMData.currentUser, points: user.points};
  try {
    const g = JSON.parse(localStorage.getItem('zamclub_global')||'{}');
    if (g.session_user) g.session_user.points = user.points;
    const acc = (g.accounts||[]).find(a => a.id === user.id);
    if (acc) acc.points = user.points;
    localStorage.setItem('zamclub_global', JSON.stringify(g));
  } catch {}
  showToast('✅ Eingecheckt! +50 Punkte');
  if (typeof renderEvents === 'function') renderEvents();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

function openMerchantEventModal() {
  const m = document.getElementById('modal-merchant-event');
  if (!m) return;
  ['me-title','me-desc','me-date','me-time','me-location','me-note'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const prev = document.getElementById('me-image-preview'); if (prev) prev.style.display = 'none';
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMerchantEventModal() {
  const m = document.getElementById('modal-merchant-event');
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
}
function openMerchantDealModal() {
  const m = document.getElementById('modal-merchant-deal');
  if (!m) return;
  ['md-title','md-desc','md-discount','md-expiry','md-limit','md-note'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const prev = document.getElementById('md-image-preview'); if (prev) prev.style.display = 'none';
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMerchantDealModal() {
  const m = document.getElementById('modal-merchant-deal');
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
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
