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
function addPoints(amount, reason = '') {
  ZAMData.currentUser.points += amount;
  Storage.set('points', ZAMData.currentUser.points);

  // Update stats
  const stats = Storage.get('stats', { visits: ZAMData.currentUser.stats.visits, events_attended: ZAMData.currentUser.stats.events_attended, deals_used: ZAMData.currentUser.stats.deals_used });
  Storage.set('stats', stats);

  updatePointsDisplay(true);

  if (reason) showToast(`+${amount} Punkte${reason ? ' · ' + reason : ''}`, 'success');
}

function updatePointsDisplay(animate = false) {
  const pts = ZAMData.currentUser.points;
  const homeEl = $('#home-points-value');
  const profileEl = $('#profile-points-value');
  const progressLabel = $('.points-progress-label');

  if (homeEl) {
    if (animate) {
      homeEl.classList.add('points-pop');
      homeEl.addEventListener('animationend', () => homeEl.classList.remove('points-pop'), { once: true });
    }
    homeEl.textContent = pts.toLocaleString('de-DE');
  }
  if (profileEl) profileEl.textContent = pts.toLocaleString('de-DE');

  // Progress bar update (Gold: 0–2000, Platin: 2000+)
  const progressFill = $('.points-progress-fill');
  if (progressFill) {
    const pct = Math.min((pts / 2000) * 100, 100);
    progressFill.style.width = pct + '%';
  }
  if (progressLabel) {
    const remaining = Math.max(0, 2000 - pts);
    progressLabel.textContent = remaining > 0
      ? `${pts.toLocaleString('de-DE')} / 2.000 Pkt. bis Platin`
      : '🎉 Platin erreicht!';
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
  const { currentUser } = ZAMData;
  const hour = new Date().getHours();
  let greeting = 'Guten Tag';
  if (hour < 12) greeting = 'Guten Morgen';
  else if (hour >= 18) greeting = 'Guten Abend';

  const greetingEl = $('#home-greeting');
  if (greetingEl) greetingEl.textContent = greeting + ',';

  const nameEl = $('#home-username');
  if (nameEl) nameEl.textContent = currentUser.display_name.split(' ')[0] + '! 👋';

  const pointsEl = $('#home-points-value');
  if (pointsEl) animateNumber(pointsEl, 0, currentUser.points, 1200);

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

function renderHomeEvents() {
  const container = $('#home-events-scroll');
  if (!container) return;
  container.innerHTML = '';

  ZAMData.events.forEach(evt => {
    const saved = isSaved('event', evt.id);
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

function renderHomeDeals() {
  const container = $('#home-deals-scroll');
  if (!container) return;
  container.innerHTML = '';

  ZAMData.deals.forEach(deal => {
    const saved = isSaved('deal', deal.id);
    const card = el('div', 'deal-card-mini card-dark');
    card.innerHTML = `
      ${deal.is_hot ? '<div class="hot-badge">🔥 Hot</div>' : ''}
      <div class="store-icon">${deal.store_icon}</div>
      <div class="discount-badge">${deal.discount}</div>
      <div class="store-name">${deal.store_name}</div>
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
  const saved = Storage.get(`saved_${type}s`, []);
  return saved.includes(id);
}

function toggleSave(type, id, btnEl) {
  const key = `saved_${type}s`;
  let saved = Storage.get(key, []);
  const wasSaved = saved.includes(id);

  if (wasSaved) {
    saved = saved.filter(x => x !== id);
    if (btnEl) {
      btnEl.textContent = type === 'deal' ? '🏷️ Merken' : '🏷️';
      btnEl.classList.remove('saved');
    }
    showToast(type === 'event' ? 'Event entfernt' : 'Deal entfernt');
  } else {
    saved.push(id);
    if (btnEl) {
      btnEl.textContent = type === 'deal' ? '🔖 Gespeichert' : '🔖';
      btnEl.classList.add('saved');
      // Spring animation
      btnEl.style.transform = 'scale(1.3)';
      setTimeout(() => { btnEl.style.transform = ''; }, 250);
    }
    showToast(type === 'event' ? '🔖 Event gespeichert!' : '🔖 Deal gespeichert!', 'success');
  }

  Storage.set(key, saved);
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

  const lastSpin = Storage.get('last_spin_date', null);
  const alreadySpun = Storage.isToday(lastSpin);

  const wheel = $('#spin-wheel');
  const result = $('#spin-result');
  const spinBtn = $('#btn-spin-go');

  if (wheel) wheel.style.transform = '';
  if (result) result.classList.remove('show');

  if (spinBtn) {
    spinBtn.disabled = alreadySpun;
    spinBtn.textContent = alreadySpun ? '✓ Heute bereits gedreht' : '🎰 Jetzt drehen!';
    spinBtn.className = alreadySpun ? 'btn btn-full claimed' : 'btn btn-primary btn-full';
  }

  // Show next available time if already spun
  const nextSpin = $('#spin-next-info');
  if (nextSpin) {
    nextSpin.textContent = alreadySpun ? '⏰ Nächste Drehung ab Mitternacht' : '';
  }

  overlay.classList.add('open');
}

function doSpin() {
  const alreadySpun = Storage.isToday(Storage.get('last_spin_date', null));
  if (alreadySpun) return;

  const spinBtn = $('#btn-spin-go');
  if (spinBtn) {
    spinBtn.disabled = true;
    spinBtn.textContent = '⏳ Dreht…';
  }

  // Weighted random reward
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
    if (resultLabel) resultLabel.textContent = reward.label + ' gewonnen! 🎉';

    // Award points + persist
    addPoints(reward.points, 'Daily Spin');
    Storage.set('last_spin_date', Storage.todayKey());

    if (spinBtn) {
      spinBtn.textContent = '✓ Punkte gutgeschrieben';
    }

    // Update next-spin info
    const nextSpin = $('#spin-next-info');
    if (nextSpin) nextSpin.textContent = '⏰ Nächste Drehung ab Mitternacht';
  }, 2600);
}

// =============================================
// QR Check-in
// =============================================
function initQRCheckin() {
  const btn = $('#btn-qr-checkin');
  if (!btn) return;
  btn.addEventListener('click', openQRModal);
}

function openQRModal() {
  const overlay = $('#modal-qr');
  if (!overlay) return;

  const lastCheckin = Storage.get('last_checkin_date', null);
  const alreadyCheckedIn = Storage.isToday(lastCheckin);

  // Update the checkin button in the modal
  const checkinBtn = $('#btn-qr-confirm');
  const checkinStatus = $('#qr-checkin-status');

  generateQRGrid();

  if (checkinBtn) {
    checkinBtn.disabled = alreadyCheckedIn;
    checkinBtn.textContent = alreadyCheckedIn ? '✓ Heute bereits eingecheckt' : '✅ Jetzt einchecken (+25 Punkte)';
    checkinBtn.className = alreadyCheckedIn
      ? 'btn btn-full claimed'
      : 'btn btn-primary btn-full btn-pulse';
  }

  if (checkinStatus) {
    checkinStatus.textContent = alreadyCheckedIn
      ? '⏰ Nächster Check-in morgen möglich'
      : '📍 Zeige diesen Code an der Info-Theke';
  }

  overlay.classList.add('open');
}

function doCheckin() {
  const alreadyCheckedIn = Storage.isToday(Storage.get('last_checkin_date', null));
  if (alreadyCheckedIn) return;

  Storage.set('last_checkin_date', Storage.todayKey());

  // Increment visit count
  const stats = Storage.get('stats', { ...ZAMData.currentUser.stats });
  stats.visits = (stats.visits || 0) + 1;
  Storage.set('stats', stats);
  ZAMData.currentUser.stats.visits = stats.visits;

  addPoints(25, 'QR Check-in');

  // Update modal
  const checkinBtn = $('#btn-qr-confirm');
  const checkinStatus = $('#qr-checkin-status');
  if (checkinBtn) {
    checkinBtn.disabled = true;
    checkinBtn.textContent = '✓ Eingecheckt!';
    checkinBtn.className = 'btn btn-full claimed';
  }
  if (checkinStatus) {
    checkinStatus.textContent = '🎉 +25 Punkte wurden gutgeschrieben!';
  }

  // Update profile stats
  const visitsEl = $('#profile-stat-visits');
  if (visitsEl) visitsEl.textContent = stats.visits;

  showToast('📍 Eingecheckt! +25 Punkte', 'success');
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
function renderCommunity() {
  const container = $('#community-feed');
  if (!container) return;
  container.innerHTML = '';

  const likedPosts = Storage.get('liked_posts', []);
  state.posts = ZAMData.communityPosts.map(p => ({
    ...p,
    isLiked: likedPosts.includes(p.id),
    likes: p.likes + (likedPosts.includes(p.id) && !p.is_liked ? 1 : 0),
  }));

  state.posts.forEach((post, idx) => {
    container.appendChild(renderPostCard(post, idx));
  });
}

function renderPostCard(post, idx) {
  const div = el('div', 'community-post card-dark');
  div.dataset.postId = post.id;

  const tagsHtml = post.tags.map(t => `<span class="post-tag">${t}</span>`).join('');

  div.innerHTML = `
    <div class="post-header">
      <div class="post-avatar" style="background:${post.author.avatar_color}">${post.author.initials}</div>
      <div class="post-author-info">
        <div class="post-author-name">${post.author.name}</div>
        <div class="post-author-level">${post.author.level}</div>
      </div>
      <div class="post-time">${post.time_ago}</div>
    </div>
    <div class="post-content">${post.content}</div>
    <div class="post-tags">${tagsHtml}</div>
    <div class="post-actions">
      <button class="post-action-btn ${post.is_liked ? 'liked' : ''}" data-idx="${idx}">
        <span class="action-icon">${post.is_liked ? '❤️' : '🤍'}</span>
        <span class="like-count">${post.likes}</span>
      </button>
      <button class="post-action-btn" data-comments-post="${post.id}">
        <span class="action-icon">💬</span>
        <span>${post.comments}</span>
      </button>
      <button class="post-action-btn" style="margin-left:auto">
        <span class="action-icon">↗️</span>
        Teilen
      </button>
    </div>
  `;

  div.querySelector('.post-action-btn').addEventListener('click', () => toggleLike(idx, div));
  const commentsBtn = div.querySelector('[data-comments-post]');
  if (commentsBtn) commentsBtn.addEventListener('click', () => openComments(post.id, post.author.name));
  return div;
}

function toggleLike(idx, cardEl) {
  const post = state.posts[idx];
  post.is_liked = !post.is_liked;
  post.likes += post.is_liked ? 1 : -1;

  // Persist
  let liked = Storage.get('liked_posts', []);
  if (post.is_liked) liked.push(post.id);
  else liked = liked.filter(id => id !== post.id);
  Storage.set('liked_posts', liked);

  const likeBtn = cardEl.querySelector('.post-action-btn');
  const icon = likeBtn.querySelector('.action-icon');
  const count = likeBtn.querySelector('.like-count');

  likeBtn.classList.toggle('liked', post.is_liked);
  icon.textContent = post.is_liked ? '❤️' : '🤍';
  count.textContent = post.likes;

  likeBtn.style.transform = 'scale(1.4)';
  setTimeout(() => { likeBtn.style.transform = ''; }, 220);
}

// =============================================
// Events Page
// =============================================
function renderEvents(filter = 'all') {
  state.eventFilter = filter;

  const joinedEvents = Storage.get('joined_events', []);
  const savedEvents = Storage.get('saved_events', []);

  state.events = ZAMData.events.map(e => ({
    ...e,
    isJoined: joinedEvents.includes(e.id),
    isSaved: savedEvents.includes(e.id),
  }));

  const container = $('#events-list');
  if (!container) return;
  container.innerHTML = '';

  $$('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });

  let filtered = state.events;
  if (filter === 'week') filtered = state.events.slice(0, 2);

  filtered.forEach((evt, idx) => {
    container.appendChild(renderEventCard(evt, idx));
  });
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

function joinEvent(idx, cardEl) {
  const evt = state.events[idx];
  if (evt.is_joined) return;

  evt.is_joined = true;
  evt.spots_left = Math.max(0, evt.spots_left - 1);

  // Persist
  const joined = Storage.get('joined_events', []);
  if (!joined.includes(evt.id)) joined.push(evt.id);
  Storage.set('joined_events', joined);

  // Update stats
  const stats = Storage.get('stats', { ...ZAMData.currentUser.stats });
  stats.events_attended = (stats.events_attended || 0) + 1;
  Storage.set('stats', stats);
  ZAMData.currentUser.stats.events_attended = stats.events_attended;

  const btn = cardEl.querySelector('.btn');
  btn.className = 'btn btn-sm joined';
  btn.textContent = '✓ Angemeldet';

  addPoints(evt.points_reward, evt.title);

  // Update profile
  const eventsEl = $('#profile-stat-events');
  if (eventsEl) eventsEl.textContent = stats.events_attended;

  showToast(`🎉 Angemeldet! +${evt.points_reward} Punkte`, 'success');
}

// =============================================
// Deals Page
// =============================================
function renderDeals() {
  const claimedDeals = Storage.get('claimed_deals', []);
  const savedDeals = Storage.get('saved_deals', []);

  state.deals = ZAMData.deals.map(d => ({
    ...d,
    isClaimed: claimedDeals.includes(d.id),
    isSaved: savedDeals.includes(d.id),
  }));

  const container = $('#deals-list');
  if (!container) return;
  container.innerHTML = '';

  state.deals.forEach((deal, idx) => {
    container.appendChild(renderDealCard(deal, idx));
  });
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

function claimDeal(idx, cardEl, deal) {
  const overlay = $('#modal-barcode');
  if (!overlay) return;

  const title = $('#modal-barcode-title');
  const subtitle = $('#modal-barcode-subtitle');
  const barcodeNum = $('#barcode-number');

  if (title) title.textContent = deal.title;
  if (subtitle) subtitle.textContent = deal.store_name + ' · ' + deal.expiry_formatted;
  if (barcodeNum) barcodeNum.textContent = deal.barcode;

  generateBarcode();
  overlay.classList.add('open');

  // Persist
  const claimed = Storage.get('claimed_deals', []);
  if (!claimed.includes(deal.id)) claimed.push(deal.id);
  Storage.set('claimed_deals', claimed);

  // Update stats
  const stats = Storage.get('stats', { ...ZAMData.currentUser.stats });
  stats.deals_used = (stats.deals_used || 0) + 1;
  Storage.set('stats', stats);
  ZAMData.currentUser.stats.deals_used = stats.deals_used;

  state.deals[idx].isClaimed = true;
  const btn = cardEl.querySelector('.btn');
  if (btn) {
    btn.className = 'btn btn-sm claimed';
    btn.textContent = '✓ Eingelöst';
    btn.disabled = true;
  }

  addPoints(deal.points_reward, deal.store_name);

  // Update profile
  const dealsEl = $('#profile-stat-deals');
  if (dealsEl) dealsEl.textContent = stats.deals_used;
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
function renderProfile() {
  const { currentUser } = ZAMData;

  // Load persisted stats
  const stats = Storage.get('stats', currentUser.stats);
  currentUser.stats = stats;

  const nameEl = $('#profile-name');
  const usernameEl = $('#profile-username');
  const memberEl = $('#profile-member');
  const pointsEl = $('#profile-points-value');
  const avatarEl = $('#profile-avatar');
  const visitsEl = $('#profile-stat-visits');
  const eventsEl = $('#profile-stat-events');
  const dealsEl = $('#profile-stat-deals');

  if (nameEl)    nameEl.textContent    = currentUser.display_name;
  if (usernameEl) usernameEl.textContent = currentUser.username;
  if (memberEl)  memberEl.textContent  = currentUser.member_since_formatted;
  if (pointsEl)  pointsEl.textContent  = currentUser.points.toLocaleString('de-DE');
  if (avatarEl)  avatarEl.textContent  = currentUser.initials;
  if (visitsEl)  visitsEl.textContent  = stats.visits;
  if (eventsEl)  eventsEl.textContent  = stats.events_attended;
  if (dealsEl)   dealsEl.textContent   = stats.deals_used;

  renderBadges();
  renderSavedSummary();
}

function renderSavedSummary() {
  const savedEvents = Storage.get('saved_events', []);
  const savedDeals  = Storage.get('saved_deals', []);

  const el = $('#profile-saved-summary');
  if (!el) return;

  el.innerHTML = `
    <div class="saved-chip" onclick="navigateTo('events')">
      🔖 ${savedEvents.length} Events gemerkt
    </div>
    <div class="saved-chip" onclick="navigateTo('deals')">
      🏷️ ${savedDeals.length} Deals gemerkt
    </div>
  `;
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
    if (badge.earned) {
      item.addEventListener('click', () => showToast(badge.description));
    }
    container.appendChild(item);
  });
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
    if (spinBtn && !Storage.isToday(Storage.get('last_spin_date', null))) {
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
      await ZAMApi.auth.signIn('demo@zamclub.de', 'demo1234');
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
  renderAll();
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
// Init (updated)
// =============================================
function init() {
  // Load persisted points
  const savedPoints = Storage.get('points', null);
  if (savedPoints !== null) ZAMData.currentUser.points = savedPoints;

  // Merge admin-created items with mock data
  const adminData = JSON.parse(localStorage.getItem('zamclub_admin') || '{}');
  if (adminData.events?.length) ZAMData.events = [...ZAMData.events, ...adminData.events];
  if (adminData.deals?.length)  ZAMData.deals  = [...ZAMData.deals,  ...adminData.deals];

  // Init interactions
  initNavigation();
  initModals();
  initDailySpin();
  initQRCheckin();
  initEventFilters();
  initButtonAnimations();
  initComments();
  initNewPost();

  // Auth — decides whether to show app or auth screens
  initAuth();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
