/**
 * ZAM Club - Application Logic
 * SPA navigation, rendering, interactions
 * Supabase-ready: all data access via ZAMData namespace
 */

'use strict';

// =============================================
// State
// =============================================
const state = {
  currentPage: 'home',
  eventFilter: 'all',
  spinUsed: false,
  // Mutable copies of data
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
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  });
}

// =============================================
// Navigation
// =============================================
function navigateTo(pageId) {
  if (state.currentPage === pageId) return;

  // Hide current page
  const currentEl = $(`#page-${state.currentPage}`);
  if (currentEl) {
    currentEl.classList.remove('active');
  }

  state.currentPage = pageId;

  // Show new page
  const nextEl = $(`#page-${pageId}`);
  if (nextEl) {
    nextEl.classList.add('active');
    // Scroll to top
    nextEl.scrollTop = 0;
  }

  // Update nav tabs
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
  const { currentUser } = ZAMData;

  // Greeting
  const hour = new Date().getHours();
  let greeting = 'Guten Tag';
  if (hour < 12) greeting = 'Guten Morgen';
  else if (hour >= 18) greeting = 'Guten Abend';

  const greetingEl = $('#home-greeting');
  if (greetingEl) greetingEl.textContent = greeting + ',';

  const nameEl = $('#home-username');
  if (nameEl) nameEl.textContent = currentUser.name.split(' ')[0] + '! 👋';

  const pointsEl = $('#home-points-value');
  if (pointsEl) animateNumber(pointsEl, 0, currentUser.points, 1200);

  // Events horizontal scroll
  renderHomeEvents();
  // Deals horizontal scroll
  renderHomeDeals();
}

function animateNumber(el, from, to, duration) {
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3); // ease out cubic
    el.textContent = Math.round(from + (to - from) * ease).toLocaleString('de-DE');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderHomeEvents() {
  const container = $('#home-events-scroll');
  if (!container) return;
  container.innerHTML = '';

  ZAMData.events.forEach(evt => {
    const card = el('div', 'event-card-mini card-dark');
    card.innerHTML = `
      <div class="category-tag" style="background:${evt.categoryColor}22;color:${evt.categoryColor}">${evt.category}</div>
      <h3>${evt.title}</h3>
      <div class="event-meta">
        <span>📅 ${evt.dateFormatted}</span>
        <span>⏰ ${evt.time}</span>
        <span>📍 ${evt.location}</span>
      </div>
      <div class="event-points-badge">+${evt.pointsReward} Punkte</div>
    `;
    card.addEventListener('click', () => navigateTo('events'));
    container.appendChild(card);
  });
}

function renderHomeDeals() {
  const container = $('#home-deals-scroll');
  if (!container) return;
  container.innerHTML = '';

  ZAMData.deals.forEach(deal => {
    const card = el('div', 'deal-card-mini card-dark');
    card.innerHTML = `
      ${deal.isHot ? '<div class="hot-badge">🔥 Hot</div>' : ''}
      <div class="store-icon">${deal.storeIcon}</div>
      <div class="discount-badge">${deal.discount}</div>
      <div class="store-name">${deal.storeName}</div>
      <div class="deal-title">${deal.title}</div>
    `;
    card.addEventListener('click', () => navigateTo('deals'));
    container.appendChild(card);
  });
}

// =============================================
// Daily Spin
// =============================================
function initDailySpin() {
  const btn = $('#btn-daily-spin');
  if (!btn) return;
  btn.addEventListener('click', openSpinModal);
}

function openSpinModal() {
  const overlay = $('#modal-spin');
  if (!overlay) return;
  overlay.classList.add('open');
  // Reset state
  const wheel = $('#spin-wheel');
  const result = $('#spin-result');
  const spinBtn = $('#btn-spin-go');
  if (wheel) wheel.style.transform = '';
  if (result) result.classList.remove('show');
  if (spinBtn) {
    spinBtn.disabled = state.spinUsed;
    spinBtn.textContent = state.spinUsed ? 'Bereits gedreht!' : 'Drehen!';
    if (state.spinUsed) spinBtn.classList.add('claimed');
    else spinBtn.classList.remove('claimed');
  }
}

function doSpin() {
  if (state.spinUsed) return;
  state.spinUsed = true;

  const spinBtn = $('#btn-spin-go');
  if (spinBtn) {
    spinBtn.disabled = true;
    spinBtn.textContent = 'Dreht…';
  }

  // Pick reward
  const rand = Math.random();
  let cumulative = 0;
  let reward = ZAMData.spinRewards[0];
  for (const r of ZAMData.spinRewards) {
    cumulative += r.probability;
    if (rand <= cumulative) { reward = r; break; }
  }

  // Animate wheel
  const wheel = $('#spin-wheel');
  if (wheel) {
    const deg = 1440 + Math.floor(Math.random() * 360);
    wheel.style.transition = 'transform 2.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    wheel.style.transform = `rotate(${deg}deg)`;
  }

  setTimeout(() => {
    // Show result
    const resultEl = $('#spin-result');
    const resultPoints = $('#spin-result-points');
    const resultLabel = $('#spin-result-label');
    if (resultEl) resultEl.classList.add('show');
    if (resultPoints) resultPoints.textContent = '+' + reward.points;
    if (resultLabel) resultLabel.textContent = reward.label + ' gewonnen!';

    // Update user points (local state)
    ZAMData.currentUser.points += reward.points;

    // Update display
    const homePoints = $('#home-points-value');
    if (homePoints) homePoints.textContent = ZAMData.currentUser.points.toLocaleString('de-DE');
    const profilePoints = $('#profile-points-value');
    if (profilePoints) profilePoints.textContent = ZAMData.currentUser.points.toLocaleString('de-DE');

    if (spinBtn) {
      spinBtn.textContent = 'Morgen wieder!';
    }
  }, 2600);
}

function closeModal(modalId) {
  const overlay = $(`#${modalId}`);
  if (overlay) overlay.classList.remove('open');
}

// =============================================
// QR Check-in
// =============================================
function initQRCheckin() {
  const btn = $('#btn-qr-checkin');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const overlay = $('#modal-qr');
    if (overlay) overlay.classList.add('open');
  });
}

function generateQRGrid() {
  const container = $('#qr-grid');
  if (!container) return;
  container.innerHTML = '';
  const size = 8;
  for (let i = 0; i < size * size; i++) {
    const cell = el('div', 'qr-cell');
    // Deterministic pseudo-random from user id
    const filled = ((i * 13 + 7) % 3 !== 0);
    cell.style.background = filled ? '#1a1a2e' : 'white';
    container.appendChild(cell);
  }
}

// =============================================
// Community Page
// =============================================
function renderCommunity() {
  const container = $('#community-feed');
  if (!container) return;
  container.innerHTML = '';

  state.posts = ZAMData.communityPosts.map(p => ({ ...p }));

  state.posts.forEach((post, idx) => {
    const card = renderPostCard(post, idx);
    container.appendChild(card);
  });
}

function renderPostCard(post, idx) {
  const div = el('div', 'community-post');
  div.dataset.postId = post.id;

  const tagsHtml = post.tags.map(t => `<span class="post-tag">${t}</span>`).join('');
  const likeClass = post.isLiked ? 'post-action-btn liked' : 'post-action-btn';
  const likeIcon = post.isLiked ? '❤️' : '🤍';

  div.innerHTML = `
    <div class="post-header">
      <div class="post-avatar" style="background:${post.author.avatarColor}">${post.author.initials}</div>
      <div class="post-author-info">
        <div class="post-author-name">${post.author.name}</div>
        <div class="post-author-level">${post.author.level}</div>
      </div>
      <div class="post-time">${post.timeAgo}</div>
    </div>
    <div class="post-content">${post.content}</div>
    <div class="post-tags">${tagsHtml}</div>
    <div class="post-actions">
      <button class="${likeClass}" data-idx="${idx}">
        <span class="action-icon">${likeIcon}</span>
        <span class="like-count">${post.likes}</span>
      </button>
      <button class="post-action-btn">
        <span class="action-icon">💬</span>
        <span>${post.comments} Kommentare</span>
      </button>
      <button class="post-action-btn" style="margin-left:auto">
        <span class="action-icon">↗️</span>
        Teilen
      </button>
    </div>
  `;

  // Like button
  const likeBtn = div.querySelector('.post-action-btn');
  likeBtn.addEventListener('click', () => toggleLike(idx, div));

  return div;
}

function toggleLike(idx, cardEl) {
  const post = state.posts[idx];
  post.isLiked = !post.isLiked;
  post.likes += post.isLiked ? 1 : -1;

  const likeBtn = cardEl.querySelector('.post-action-btn');
  const icon = likeBtn.querySelector('.action-icon');
  const count = likeBtn.querySelector('.like-count');

  likeBtn.classList.toggle('liked', post.isLiked);
  icon.textContent = post.isLiked ? '❤️' : '🤍';
  count.textContent = post.likes;

  // Bounce animation
  likeBtn.style.transform = 'scale(1.3)';
  setTimeout(() => { likeBtn.style.transform = ''; }, 200);
}

// =============================================
// Events Page
// =============================================
function renderEvents(filter = 'all') {
  state.eventFilter = filter;
  state.events = ZAMData.events.map(e => ({ ...e }));

  const container = $('#events-list');
  if (!container) return;
  container.innerHTML = '';

  // Update filter tabs
  $$('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });

  let filtered = state.events;
  // For demo, "week" shows first 2, "month" shows all
  if (filter === 'week') filtered = state.events.slice(0, 2);
  if (filter === 'month') filtered = state.events;

  filtered.forEach((evt, idx) => {
    const card = renderEventCard(evt, idx);
    container.appendChild(card);
  });
}

function renderEventCard(evt, idx) {
  const div = el('div', 'event-card-full');

  const spotsLow = evt.spotsLeft <= 10;
  const joinedClass = evt.isJoined ? 'btn btn-sm joined' : 'btn btn-primary btn-sm';
  const joinText = evt.isJoined ? '✓ Angemeldet' : 'Teilnehmen';

  div.innerHTML = `
    <div class="event-card-top">
      <div class="category-tag tag" style="background:${evt.categoryColor}22;color:${evt.categoryColor}">${evt.category}</div>
      <div class="event-points-badge">+${evt.pointsReward}P</div>
    </div>
    <h3>${evt.title}</h3>
    <div class="event-details">
      <div class="event-detail-row"><span>📅</span><span>${evt.dateFormatted}</span></div>
      <div class="event-detail-row"><span>⏰</span><span>${evt.time}</span></div>
      <div class="event-detail-row"><span>📍</span><span>${evt.location}</span></div>
    </div>
    <p class="event-description">${evt.description}</p>
    <div class="event-card-footer">
      <div class="spots-info">
        ${spotsLow
          ? `<strong>Nur noch ${evt.spotsLeft} Plätze!</strong>`
          : `${evt.spotsLeft} Plätze frei`}
      </div>
      <button class="${joinedClass}" data-idx="${idx}">${joinText}</button>
    </div>
  `;

  const joinBtn = div.querySelector('button');
  joinBtn.addEventListener('click', () => joinEvent(idx, div));

  return div;
}

function joinEvent(idx, cardEl) {
  const evt = state.events[idx];
  if (evt.isJoined) return;

  evt.isJoined = true;
  evt.spotsLeft = Math.max(0, evt.spotsLeft - 1);

  const btn = cardEl.querySelector('button');
  btn.className = 'btn btn-sm joined';
  btn.textContent = '✓ Angemeldet';

  // Update points
  ZAMData.currentUser.points += evt.pointsReward;
  updatePointsDisplay();

  showToast(`🎉 Angemeldet! +${evt.pointsReward} Punkte gutgeschrieben`, 'success');
}

// =============================================
// Deals Page
// =============================================
function renderDeals() {
  state.deals = ZAMData.deals.map(d => ({ ...d }));
  const container = $('#deals-list');
  if (!container) return;
  container.innerHTML = '';

  state.deals.forEach((deal, idx) => {
    const card = renderDealCard(deal, idx);
    container.appendChild(card);
  });
}

function renderDealCard(deal, idx) {
  const div = el('div', 'deal-card-full');

  div.innerHTML = `
    ${deal.isHot ? '<div class="hot-badge" style="margin-bottom:10px">🔥 Beliebt</div>' : ''}
    <div class="deal-card-header">
      <div class="deal-store-icon">${deal.storeIcon}</div>
      <div class="deal-info">
        <div class="deal-store-name">${deal.storeName}</div>
        <div class="deal-discount-big">${deal.discount}</div>
      </div>
      <div class="category-tag tag" style="background:${deal.categoryColor}22;color:${deal.categoryColor}">${deal.category}</div>
    </div>
    <div class="deal-title">${deal.title}</div>
    <p class="deal-description">${deal.description}</p>
    <div class="deal-card-footer">
      <div class="deal-expiry">🗓 ${deal.expiryFormatted}</div>
      <button class="${deal.isClaimed ? 'btn btn-sm claimed' : 'btn btn-primary btn-sm'}" data-idx="${idx}">
        ${deal.isClaimed ? '✓ Eingelöst' : 'Gutschein sichern'}
      </button>
    </div>
  `;

  const claimBtn = div.querySelector('button');
  if (!deal.isClaimed) {
    claimBtn.addEventListener('click', () => claimDeal(idx, div, deal));
  }

  return div;
}

function claimDeal(idx, cardEl, deal) {
  // Open barcode modal
  const overlay = $('#modal-barcode');
  if (!overlay) return;

  const title = $('#modal-barcode-title');
  const subtitle = $('#modal-barcode-subtitle');
  const barcodeNum = $('#barcode-number');

  if (title) title.textContent = deal.title;
  if (subtitle) subtitle.textContent = deal.storeName + ' · ' + deal.expiryFormatted;
  if (barcodeNum) barcodeNum.textContent = deal.barcode;

  // Generate random-looking barcode lines
  generateBarcode();

  overlay.classList.add('open');

  // Mark as claimed after modal opens
  state.deals[idx].isClaimed = true;
  const btn = cardEl.querySelector('button');
  if (btn) {
    btn.className = 'btn btn-sm claimed';
    btn.textContent = '✓ Eingelöst';
    btn.disabled = true;
  }

  // Award points
  ZAMData.currentUser.points += deal.pointsReward;
  updatePointsDisplay();
  showToast(`+${deal.pointsReward} Punkte für diesen Deal!`, 'success');
}

function generateBarcode() {
  const container = $('#barcode-lines');
  if (!container) return;
  container.innerHTML = '';

  const lineCount = 48;
  for (let i = 0; i < lineCount; i++) {
    const line = el('div', 'barcode-line');
    const width = Math.random() < 0.3 ? 4 : Math.random() < 0.5 ? 2 : 3;
    line.style.width = width + 'px';
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
    const card = renderMerchantCard(merchant, idx);
    container.appendChild(card);
  });
}

function renderMerchantCard(merchant, idx) {
  const div = el('div', 'merchant-card');
  div.dataset.idx = idx;

  div.innerHTML = `
    <div class="merchant-card-header">
      <div class="merchant-icon">${merchant.icon}</div>
      <div class="merchant-info">
        <div class="merchant-name">${merchant.name}</div>
        <div class="merchant-category">${merchant.category}</div>
        <div class="merchant-meta">
          ${merchant.isOpen ? '<span class="open-badge">Geöffnet</span>' : '<span class="open-badge" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.25)">Geschlossen</span>'}
          <span class="merchant-rating">⭐ ${merchant.rating} (${merchant.reviewCount})</span>
        </div>
      </div>
      <span class="merchant-expand-icon">▼</span>
    </div>
    <div class="merchant-details">
      <div class="merchant-details-inner">
        <p class="merchant-description">${merchant.description}</p>
        <div class="merchant-detail-row">
          <span class="detail-icon">⏰</span>
          <span>${merchant.hours}</span>
        </div>
        <div class="merchant-detail-row">
          <span class="detail-icon">📍</span>
          <span>${merchant.location}</span>
        </div>
        <div class="merchant-detail-row">
          <span class="detail-icon">📞</span>
          <span>${merchant.phone}</span>
        </div>
        <div class="merchant-promo-badge" style="background:${merchant.promoColor}22;color:${merchant.promoColor};border:1px solid ${merchant.promoColor}44">
          🎁 ${merchant.currentPromo}
        </div>
      </div>
    </div>
  `;

  const header = div.querySelector('.merchant-card-header');
  header.addEventListener('click', () => toggleMerchant(div, idx));

  return div;
}

function toggleMerchant(cardEl, idx) {
  const isExpanded = cardEl.classList.contains('expanded');

  // Collapse all
  $$('.merchant-card').forEach(c => c.classList.remove('expanded'));
  state.merchants.forEach(m => { m.isExpanded = false; });

  if (!isExpanded) {
    cardEl.classList.add('expanded');
    state.merchants[idx].isExpanded = true;
  }
}

// =============================================
// Profile Page
// =============================================
function renderProfile() {
  const { currentUser } = ZAMData;

  const nameEl = $('#profile-name');
  const usernameEl = $('#profile-username');
  const memberEl = $('#profile-member');
  const pointsEl = $('#profile-points-value');
  const avatarEl = $('#profile-avatar');
  const visitsEl = $('#profile-stat-visits');
  const eventsEl = $('#profile-stat-events');
  const dealsEl = $('#profile-stat-deals');

  if (nameEl) nameEl.textContent = currentUser.name;
  if (usernameEl) usernameEl.textContent = currentUser.username;
  if (memberEl) memberEl.textContent = currentUser.memberSinceFormatted;
  if (pointsEl) pointsEl.textContent = currentUser.points.toLocaleString('de-DE');
  if (avatarEl) avatarEl.textContent = currentUser.initials;
  if (visitsEl) visitsEl.textContent = currentUser.stats.visits;
  if (eventsEl) eventsEl.textContent = currentUser.stats.eventsAttended;
  if (dealsEl) dealsEl.textContent = currentUser.stats.dealsUsed;

  renderBadges();
}

function renderBadges() {
  const container = $('#badges-grid');
  if (!container) return;
  container.innerHTML = '';

  ZAMData.badges.forEach(badge => {
    const item = el('div', badge.earned ? 'badge-item' : 'badge-item locked');

    const wrap = el('div', 'badge-icon-wrap');
    wrap.style.background = badge.earned ? badge.color + '22' : 'rgba(255,255,255,0.05)';
    wrap.style.border = badge.earned ? `1px solid ${badge.color}44` : '1px solid rgba(255,255,255,0.1)';
    wrap.textContent = badge.icon;

    const name = el('div', 'badge-name', { textContent: badge.name });

    item.appendChild(wrap);
    item.appendChild(name);

    // Tooltip-like description on tap
    if (badge.earned) {
      item.addEventListener('click', () => showToast(badge.description));
    }

    container.appendChild(item);
  });
}

// =============================================
// Shared: update points everywhere
// =============================================
function updatePointsDisplay() {
  const pts = ZAMData.currentUser.points;
  const homeEl = $('#home-points-value');
  const profileEl = $('#profile-points-value');
  if (homeEl) homeEl.textContent = pts.toLocaleString('de-DE');
  if (profileEl) profileEl.textContent = pts.toLocaleString('de-DE');
}

// =============================================
// Modal close handlers
// =============================================
function initModals() {
  // Close on overlay click
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });

  // Close buttons
  $$('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.closeModal;
      closeModal(modalId);
    });
  });

  // Spin button
  const spinGoBtn = $('#btn-spin-go');
  if (spinGoBtn) spinGoBtn.addEventListener('click', doSpin);
}

// =============================================
// Event filter tabs
// =============================================
function initEventFilters() {
  $$('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => renderEvents(tab.dataset.filter));
  });
}

// =============================================
// Pulse animation on CTA buttons
// =============================================
function initButtonAnimations() {
  setTimeout(() => {
    const spinBtn = $('#btn-daily-spin');
    if (spinBtn) {
      spinBtn.classList.add('btn-pulse');
      spinBtn.addEventListener('animationend', () => spinBtn.classList.remove('btn-pulse'));
    }
  }, 1500);
}

// =============================================
// Init
// =============================================
function init() {
  // Deep-copy mutable data
  state.posts = ZAMData.communityPosts.map(p => ({ ...p }));
  state.events = ZAMData.events.map(e => ({ ...e }));
  state.deals = ZAMData.deals.map(d => ({ ...d }));
  state.merchants = ZAMData.merchants.map(m => ({ ...m }));

  // Render all pages
  renderHome();
  renderCommunity();
  renderEvents();
  renderDeals();
  renderMerchants();
  renderProfile();

  // Generate QR grid
  generateQRGrid();

  // Init interactions
  initNavigation();
  initModals();
  initDailySpin();
  initQRCheckin();
  initEventFilters();
  initButtonAnimations();

  // Show home page
  navigateTo('home');
  // Force active since navigateTo guards against same-page
  const homePage = $('#page-home');
  if (homePage) homePage.classList.add('active');
  $$('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === 'home');
  });
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
