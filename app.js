/**
 * ZAM Club – app.js
 * SPA navigation, rendering, and interactions.
 * Structured to later swap mock data for Supabase API calls.
 */

// ── State ─────────────────────────────────────────────────────
const state = {
  activePage: 'home',
  eventFilter: 'all',
  likedPosts: new Set(communityPosts.filter(p => p.liked).map(p => p.id)),
  spinUsedToday: false,
};

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateStatusTime();
  setInterval(updateStatusTime, 60000);
  renderHome();
  renderCommunity();
  renderEvents('all');
  renderDeals();
  renderProfile();
  setupEventFilter();
});

// ── Navigation ────────────────────────────────────────────────
function navigateTo(page) {
  if (state.activePage === page) return;

  // Deactivate current page
  document.getElementById(`page-${state.activePage}`)?.classList.remove('active');

  // Activate new page
  const next = document.getElementById(`page-${page}`);
  if (next) {
    next.classList.add('active');
    state.activePage = page;
  }

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
}

// ── Status Bar Time ───────────────────────────────────────────
function updateStatusTime() {
  const el = document.getElementById('statusTime');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ── HOME Render ───────────────────────────────────────────────
function renderHome() {
  document.getElementById('homeGreeting').textContent = `${currentUser.name.split(' ')[0]} 👋`;
  document.getElementById('homeAvatar').textContent = currentUser.initials;
  document.getElementById('homePoints').textContent = currentUser.points.toLocaleString('de-DE');
  document.getElementById('homeTier').textContent = `🥇 ${currentUser.tier}`;

  // Horizontal event cards
  const eventsEl = document.getElementById('homeEvents');
  eventsEl.innerHTML = events.slice(0, 4).map(ev => `
    <div class="mini-event-card" onclick="navigateTo('events')">
      <span class="category-badge" style="background:${ev.categoryColor}22;color:${ev.categoryColor}">
        ${ev.category}
      </span>
      <p class="mini-event-date">${ev.dateDisplay}</p>
      <p class="mini-event-title">${ev.title}</p>
      <p class="mini-event-location">📍 ${ev.location}</p>
    </div>
  `).join('');

  // Horizontal deal cards
  const dealsEl = document.getElementById('homeDeals');
  dealsEl.innerHTML = homeStats.featuredDeals.map(deal => `
    <div class="mini-deal-card" onclick="navigateTo('deals')">
      <div class="mini-deal-store-icon">${deal.storeLogo}</div>
      <div class="mini-deal-discount">${deal.discount}</div>
      <div class="mini-deal-store">${deal.store}</div>
    </div>
  `).join('');
}

// ── COMMUNITY Render ──────────────────────────────────────────
function renderCommunity() {
  const feed = document.getElementById('communityFeed');
  feed.innerHTML = communityPosts.map(post => `
    <div class="post-card">
      <div class="post-header">
        <div class="post-avatar" style="background:${post.authorColor}">${post.authorInitials}</div>
        <div>
          <div class="post-author-name">${post.author}</div>
          <div class="post-time">${post.timeAgo}</div>
        </div>
      </div>
      <p class="post-text">${post.text}</p>
      ${post.hasImage ? `<div class="post-image-placeholder">${post.imagePlaceholder}</div>` : ''}
      <div class="post-actions">
        <button class="post-action-btn ${post.liked ? 'liked' : ''}" id="like-${post.id}" onclick="toggleLike('${post.id}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${post.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
          <span id="likes-${post.id}">${post.likes}</span>
        </button>
        <button class="post-action-btn" onclick="showToast('Kommentare kommen bald!')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <span>${post.comments}</span>
        </button>
      </div>
    </div>
  `).join('') + '<div style="height:24px"></div>';
}

function toggleLike(postId) {
  const post = communityPosts.find(p => p.id === postId);
  if (!post) return;

  const btn = document.getElementById(`like-${postId}`);
  const likesEl = document.getElementById(`likes-${postId}`);
  const svg = btn.querySelector('svg');

  if (state.likedPosts.has(postId)) {
    state.likedPosts.delete(postId);
    post.likes--;
    post.liked = false;
    btn.classList.remove('liked');
    svg.setAttribute('fill', 'none');
  } else {
    state.likedPosts.add(postId);
    post.likes++;
    post.liked = true;
    btn.classList.add('liked');
    svg.setAttribute('fill', 'currentColor');
  }

  likesEl.textContent = post.likes;
}

// ── EVENTS Render ─────────────────────────────────────────────
function renderEvents(filter) {
  state.eventFilter = filter;
  const filtered = filter === 'all' ? events : events.filter(e => e.filter === filter);
  const list = document.getElementById('eventsList');

  if (filtered.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0">Keine Events gefunden.</p>';
    return;
  }

  list.innerHTML = filtered.map(ev => `
    <div class="event-card">
      <div class="event-card-top">
        <h3 class="event-title">${ev.title}</h3>
        <span class="category-badge" style="background:${ev.categoryColor}22;color:${ev.categoryColor};flex-shrink:0">
          ${ev.category}
        </span>
      </div>
      <div class="event-meta">
        <div class="event-meta-row"><span class="event-meta-icon">📅</span> ${ev.dateDisplay}</div>
        <div class="event-meta-row"><span class="event-meta-icon">🕐</span> ${ev.time}</div>
        <div class="event-meta-row"><span class="event-meta-icon">📍</span> ${ev.location}</div>
      </div>
      <p class="event-desc">${ev.description}</p>
      <div class="event-footer">
        <div>
          ${ev.spotsLeft !== null
            ? `<p class="event-spots">🟢 Noch ${ev.spotsLeft} Plätze frei</p>`
            : `<p class="event-spots">🎟️ Freier Eintritt</p>`
          }
          <p class="event-points">+${ev.pointsReward} Punkte</p>
        </div>
        <button class="btn-primary" onclick="handleJoinEvent('${ev.id}', this)">Teilnehmen</button>
      </div>
    </div>
  `).join('') + '<div style="height:24px"></div>';
}

function setupEventFilter() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderEvents(tab.dataset.filter);
    });
  });
}

function handleJoinEvent(eventId, btn) {
  const ev = events.find(e => e.id === eventId);
  if (!ev) return;
  btn.textContent = '✓ Angemeldet';
  btn.style.background = '#10b981';
  btn.style.boxShadow = '0 4px 16px rgba(16,185,129,0.35)';
  btn.disabled = true;
  showToast(`Angemeldet: ${ev.title} 🎉`);
}

// ── DEALS Render ──────────────────────────────────────────────
function renderDeals() {
  const list = document.getElementById('dealsList');
  list.innerHTML = deals.map(deal => `
    <div class="deal-card">
      <div class="deal-icon-wrap">${deal.storeLogo}</div>
      <div class="deal-info">
        <p class="deal-store">${deal.store}</p>
        <p class="deal-discount-title">${deal.discount}</p>
        <p class="deal-title-text">${deal.title}</p>
        <p class="deal-desc">${deal.description}</p>
        <div class="deal-footer">
          <span class="deal-expiry">Bis ${deal.expiryDate}</span>
          <button class="btn-outline" onclick="handleCoupon('${deal.id}')">Sichern</button>
        </div>
      </div>
    </div>
  `).join('') + '<div style="height:24px"></div>';
}

function handleCoupon(dealId) {
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;

  const code = 'ZAM' + Math.random().toString(36).substring(2, 7).toUpperCase();
  const body = document.getElementById('couponModalBody');
  body.innerHTML = `
    <div class="mini-deal-store-icon" style="font-size:40px;margin-bottom:8px">${deal.storeLogo}</div>
    <p style="font-size:18px;font-weight:700;margin-bottom:4px">${deal.store}</p>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">${deal.title}</p>
    <div class="barcode"></div>
    <p class="coupon-code">${code}</p>
    <p class="modal-text">Zeige diesen Code an der Kasse um deinen Rabatt zu erhalten.</p>
    <p class="deal-expiry" style="margin-top:8px">Gültig bis: ${deal.expiryDate}</p>
  `;
  openModal('couponModal');
}

// ── PROFILE Render ────────────────────────────────────────────
function renderProfile() {
  const content = document.getElementById('profileContent');
  const earnedBadges = badges.filter(b => b.earned);
  const lockedBadges = badges.filter(b => !b.earned);

  content.innerHTML = `
    <div class="profile-hero">
      <div class="profile-avatar">${currentUser.initials}</div>
      <p class="profile-name">${currentUser.name}</p>
      <p class="profile-username">${currentUser.username}</p>
      <span class="profile-tier-badge">🥇 ${currentUser.tier}</span>
    </div>

    <div class="profile-points-card">
      <p class="profile-points-num">${currentUser.points.toLocaleString('de-DE')}</p>
      <p class="profile-points-lbl">Punkte</p>
    </div>

    <div class="stats-row">
      <div class="stat-item">
        <p class="stat-value">${currentUser.stats.visits}</p>
        <p class="stat-label">Besuche</p>
      </div>
      <div class="stat-item">
        <p class="stat-value">${currentUser.stats.eventsAttended}</p>
        <p class="stat-label">Events</p>
      </div>
      <div class="stat-item">
        <p class="stat-value">${currentUser.stats.dealsUsed}</p>
        <p class="stat-label">Deals</p>
      </div>
    </div>

    <div class="section-header">
      <h2 class="section-title">Meine Badges</h2>
      <span style="font-size:13px;color:var(--text-muted)">${earnedBadges.length}/${badges.length}</span>
    </div>

    <div class="badges-grid">
      ${[...earnedBadges, ...lockedBadges].map(badge => `
        <div class="badge-item ${badge.earned ? '' : 'locked'}">
          <div class="badge-icon-wrap" style="background:${badge.color}22">${badge.icon}</div>
          <div>
            <p class="badge-name">${badge.name}</p>
            <p class="badge-desc">${badge.description}</p>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="section-header">
      <h2 class="section-title">Händler</h2>
    </div>
    ${merchants.map(m => `
      <div class="merchant-card" id="merchant-card-${m.id}">
        <div class="merchant-header" onclick="toggleMerchant('${m.id}')">
          <div class="merchant-icon">${m.icon}</div>
          <div>
            <p class="merchant-name">${m.name}</p>
            <p class="merchant-category">${m.category}</p>
            <div class="rating">★ ${m.rating} <span style="color:var(--text-dim);font-weight:400">(${m.reviewCount})</span></div>
          </div>
          <span class="merchant-arrow" id="arrow-${m.id}">›</span>
        </div>
        <div class="merchant-body" id="body-${m.id}">
          <div class="merchant-details">
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:10px;line-height:1.5">${m.description}</p>
            <div class="merchant-detail-row"><span class="merchant-detail-icon">🕐</span><span>${m.hours}</span></div>
            <div class="merchant-detail-row"><span class="merchant-detail-icon">📍</span><span>${m.floor}</span></div>
            <div class="merchant-detail-row"><span class="merchant-detail-icon">📞</span><span>${m.phone}</span></div>
            <div class="merchant-promo">🎉 ${m.currentPromo}</div>
          </div>
        </div>
      </div>
    `).join('')}
    <div style="height:24px"></div>
  `;
}

function toggleMerchant(id) {
  const body = document.getElementById(`body-${id}`);
  const arrow = document.getElementById(`arrow-${id}`);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  arrow.classList.toggle('open', !isOpen);
}

// ── Modal Helpers ─────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ── QR Check-in ───────────────────────────────────────────────
function handleQR() {
  openModal('qrModal');
}

// ── Daily Spin ────────────────────────────────────────────────
const spinPrizes = [
  { emoji: '🎉', label: '+50 Punkte', points: 50 },
  { emoji: '☕', label: 'Café Crema Gutschein!', points: 0 },
  { emoji: '💎', label: '+100 Punkte', points: 100 },
  { emoji: '🎫', label: 'Event-Ticket', points: 0 },
  { emoji: '⭐', label: '+25 Punkte', points: 25 },
  { emoji: '🛍️', label: '5% Rabatt-Code', points: 0 },
];

function handleSpin() {
  // Reset spin modal state
  const wheel = document.getElementById('spinWheel');
  const result = document.getElementById('spinResult');
  const btn = document.getElementById('spinActionBtn');
  wheel.textContent = '🎰';
  result.textContent = 'Drücke Spin um dein Glück zu versuchen!';
  btn.textContent = 'Spin!';
  btn.disabled = state.spinUsedToday;
  if (state.spinUsedToday) {
    result.textContent = 'Du hast heute bereits gespinnt. Komm morgen wieder!';
  }
  openModal('spinModal');
}

function doSpin() {
  if (state.spinUsedToday) return;

  const wheel = document.getElementById('spinWheel');
  const result = document.getElementById('spinResult');
  const btn = document.getElementById('spinActionBtn');

  btn.disabled = true;
  wheel.classList.add('spinning');

  setTimeout(() => {
    wheel.classList.remove('spinning');
    const prize = spinPrizes[Math.floor(Math.random() * spinPrizes.length)];
    wheel.textContent = prize.emoji;
    result.textContent = `Glückwunsch! Du gewinnst: ${prize.label}`;
    result.style.color = 'var(--accent-light)';
    result.style.fontWeight = '700';
    state.spinUsedToday = true;
    btn.textContent = 'Morgen wieder!';
    if (prize.points > 0) {
      currentUser.points += prize.points;
      document.getElementById('homePoints').textContent = currentUser.points.toLocaleString('de-DE');
    }
    showToast(`${prize.emoji} ${prize.label}`);
  }, 1600);
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
