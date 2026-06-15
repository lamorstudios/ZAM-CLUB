/**
 * ZAM Club — API-Abstraktionsschicht
 * ============================================================
 * Alle Datenzugriffe laufen über window.ZAMApi.
 * Jetzt: localStorage + ZAMData als Demo-Backend.
 * Später: Supabase — kommentierte Aufrufe stehen bei jeder Methode.
 *
 * Supabase aktivieren:
 *   1. Drei Zeilen unten einkommentieren
 *   2. Pro Methode den "// Supabase:"-Block einkommentieren
 *      und den "// Demo:"-Block entfernen
 * ============================================================
 */

'use strict';

// ── Supabase Init (auskommentiert bis Zugangsdaten vorhanden) ──
// import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
// const SUPABASE_URL     = 'https://DEIN-PROJEKT.supabase.co'
// const SUPABASE_ANON_KEY = 'eyJ...'
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Demo-Kommentar-Posts (in memory, reset bei Reload) ────────
const _commentStore = {};
const _notifStore   = [];

function _todayKey() { return new Date().toISOString().slice(0, 10); }
function _uuid()     { return 'demo_' + Math.random().toString(36).slice(2, 11); }
function _now()      { return new Date().toISOString(); }

function _loadStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}
function _saveStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Haupt-localStorage-Key
const _KEY = 'zamclub_v1';
function _s(k, fb = null) {
  const d = _loadStore(_KEY, {});
  return d[k] ?? fb;
}
function _set(k, v) {
  const d = _loadStore(_KEY, {});
  d[k] = v;
  _saveStore(_KEY, d);
}

// ============================================================
const ZAMApi = {

  // ──────────────────────────────────────────────────────────
  // AUTH
  // ──────────────────────────────────────────────────────────
  auth: {

    /**
     * Aktuellen Nutzer zurückgeben oder null.
     * Supabase: const { data: { user } } = await supabase.auth.getUser()
     *           + profiles.select('*').eq('id', user.id).single()
     */
    currentUser() {
      // Demo:
      const stored = _s('auth_user', null);
      if (stored) return stored;
      return null;
    },

    isLoggedIn() {
      return this.currentUser() !== null;
    },

    /**
     * Einloggen.
     * Supabase: const { data, error } = await supabase.auth.signInWithPassword({ email, password })
     */
    async signIn(email, password) {
      // Demo: akzeptiert beliebige Kombination, loggt Demo-User ein
      if (!email || !password) throw new Error('E-Mail und Passwort erforderlich.');
      const profile = {
        id:                     'usr_001',
        email,
        display_name:           ZAMData.currentUser.display_name,
        username:               ZAMData.currentUser.username,
        initials:               ZAMData.currentUser.initials,
        avatar_url:             null,
        level:                  ZAMData.currentUser.level,
        points:                 _s('points', ZAMData.currentUser.points),
        member_since_formatted: ZAMData.currentUser.member_since_formatted,
        stats:                  _s('stats', ZAMData.currentUser.stats),
      };
      _set('auth_user', profile);
      // Supabase würde hier das Session-Token speichern (automatisch über supabase-js).
      return { user: profile };
    },

    /**
     * Registrieren.
     * Supabase: await supabase.auth.signUp({ email, password, options: { data: { display_name, username } } })
     *           → Trigger handle_new_user() legt Profil automatisch an
     */
    async signUp(email, password, username, displayName) {
      if (!email || !password || !username || !displayName)
        throw new Error('Alle Felder ausfüllen.');
      if (password.length < 6) throw new Error('Passwort muss mindestens 6 Zeichen lang sein.');

      const parts    = displayName.trim().split(' ');
      const initials = (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
      const profile  = {
        id:                     _uuid(),
        email,
        display_name:           displayName,
        username:               '@' + username.replace(/^@/, ''),
        initials,
        avatar_url:             null,
        level:                  'bronze',
        points:                 0,
        member_since_formatted: 'Mitglied seit ' + new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
        stats:                  { visits: 0, events_attended: 0, deals_used: 0 },
      };
      _set('auth_user', profile);
      _set('points', 0);
      _set('stats', profile.stats);
      return { user: profile };
    },

    /**
     * Ausloggen.
     * Supabase: await supabase.auth.signOut()
     */
    async signOut() {
      // Demo: Auth-User aus localStorage löschen
      const d = _loadStore(_KEY, {});
      delete d.auth_user;
      _saveStore(_KEY, d);
      // ZAMData auf Demo-Nutzer zurücksetzen
      ZAMData.currentUser = ZAMData.profiles[0];
    },

    /**
     * Passwort-Reset-Mail senden.
     * Supabase: await supabase.auth.resetPasswordForEmail(email, { redirectTo: '...' })
     */
    async resetPassword(email) {
      if (!email) throw new Error('E-Mail erforderlich.');
      // Demo: tut nichts, simuliert Erfolg
      return { success: true };
    },

    /**
     * Nutzerprofil aktualisieren.
     * Supabase: await supabase.from('profiles').update(data).eq('id', userId)
     */
    async updateProfile(data) {
      const user = this.currentUser();
      if (!user) throw new Error('Nicht eingeloggt.');
      const updated = { ...user, ...data };
      _set('auth_user', updated);
      ZAMData.currentUser = { ...ZAMData.currentUser, ...data };
      return updated;
    },

    /**
     * Avatar hochladen (Vorbereitung).
     * Supabase: await supabase.storage.from('avatars').upload(`${userId}.jpg`, file)
     *           const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
     *           await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
     */
    async uploadAvatar(file) {
      // Demo: DataURL als avatar_url speichern
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.updateProfile({ avatar_url: e.target.result }).then(resolve).catch(reject);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
  },

  // ──────────────────────────────────────────────────────────
  // POSTS / COMMUNITY
  // ──────────────────────────────────────────────────────────
  posts: {

    /**
     * Alle freigegebenen Posts laden.
     * Supabase: const { data } = await supabase
     *   .from('posts').select('*, profiles(*)')
     *   .eq('status', 'approved').order('created_at', { ascending: false })
     */
    async list() {
      // Demo:
      const adminPosts  = _s('community_user_posts', []);
      const liked       = _s('liked_posts', []);
      const allPosts    = [...adminPosts.filter(p => p.status === 'approved'), ...ZAMData.communityPosts];
      return allPosts.map(p => ({ ...p, is_liked: liked.includes(p.id) }));
    },

    /**
     * Neuen Post erstellen (wartet auf Freigabe).
     * Supabase: await supabase.from('posts').insert({ user_id, content, image_url, tags })
     */
    async create(content, tags = [], imageUrl = null) {
      const user = ZAMApi.auth.currentUser();
      if (!user) throw new Error('Nicht eingeloggt.');
      const post = {
        id:         _uuid(),
        user_id:    user.id,
        author: {
          name:         user.display_name,
          initials:     user.initials,
          avatar_color: '#8b5cf6',
          level:        user.level.charAt(0).toUpperCase() + user.level.slice(1) + ' Member',
        },
        content,
        tags,
        image_url:  imageUrl,
        likes:      0,
        comments:   0,
        status:     'pending',
        created_at: _now(),
        time_ago:   'gerade eben',
        is_liked:   false,
      };
      const posts = _s('community_user_posts', []);
      posts.unshift(post);
      _set('community_user_posts', posts);

      // Admin-Pending benachrichtigen
      const pending = _s('pending_posts', []);
      pending.unshift({ ...post });
      _set('pending_posts', pending);

      return post;
    },

    /**
     * Post liken.
     * Supabase: await supabase.from('post_likes').insert({ post_id, user_id })
     *           await supabase.rpc('increment_likes', { post_id })
     */
    async like(postId) {
      let liked = _s('liked_posts', []);
      if (!liked.includes(postId)) { liked.push(postId); _set('liked_posts', liked); }
    },

    /**
     * Like entfernen.
     * Supabase: await supabase.from('post_likes').delete().match({ post_id, user_id })
     */
    async unlike(postId) {
      _set('liked_posts', _s('liked_posts', []).filter(id => id !== postId));
    },

    /**
     * Kommentare zu einem Post laden.
     * Supabase: const { data } = await supabase
     *   .from('comments').select('*, profiles(display_name, initials, avatar_url)')
     *   .eq('post_id', postId).order('created_at')
     */
    async getComments(postId) {
      if (!_commentStore[postId]) _commentStore[postId] = [];
      return _commentStore[postId];
    },

    /**
     * Kommentar hinzufügen.
     * Supabase: await supabase.from('comments').insert({ post_id, user_id, content })
     */
    async addComment(postId, content) {
      const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
      const comment = {
        id:         _uuid(),
        post_id:    postId,
        user_id:    user.id || 'usr_001',
        author: {
          name:         user.display_name,
          initials:     user.initials,
          avatar_color: '#8b5cf6',
        },
        content,
        created_at: _now(),
        time_ago:   'gerade eben',
      };
      if (!_commentStore[postId]) _commentStore[postId] = [];
      _commentStore[postId].push(comment);
      return comment;
    },
  },

  // ──────────────────────────────────────────────────────────
  // EVENTS
  // ──────────────────────────────────────────────────────────
  events: {

    /**
     * Supabase: const { data } = await supabase.from('events')
     *   .select('*, merchants(name, icon)').eq('status', 'approved').order('date_iso')
     */
    async list(filter = 'all') {
      const adminData = _loadStore('zamclub_admin', {});
      const adminEvts = (adminData.events || []).map(e => ({ ...e, status: 'approved' }));
      let all = [...ZAMData.events, ...adminEvts];
      if (filter === 'week') all = all.slice(0, 2);
      const joined = _s('joined_events', []);
      const saved  = _s('saved_events',  []);
      return all.map(e => ({ ...e, is_joined: joined.includes(e.id), is_saved: saved.includes(e.id) }));
    },

    /** Supabase: await supabase.from('event_registrations').insert({ event_id, user_id }) */
    async register(eventId) {
      const joined = _s('joined_events', []);
      if (!joined.includes(eventId)) { joined.push(eventId); _set('joined_events', joined); }
    },

    /** Supabase: await supabase.from('event_registrations').delete().match({ event_id, user_id }) */
    async unregister(eventId) {
      _set('joined_events', _s('joined_events', []).filter(id => id !== eventId));
    },

    /** Supabase: await supabase.from('saved_events').insert({ event_id, user_id }) */
    async save(eventId) {
      const saved = _s('saved_events', []);
      if (!saved.includes(eventId)) { saved.push(eventId); _set('saved_events', saved); }
    },

    /** Supabase: await supabase.from('saved_events').delete().match({ event_id, user_id }) */
    async unsave(eventId) {
      _set('saved_events', _s('saved_events', []).filter(id => id !== eventId));
    },

    isSaved(eventId)      { return _s('saved_events',  []).includes(eventId); },
    isRegistered(eventId) { return _s('joined_events', []).includes(eventId); },
  },

  // ──────────────────────────────────────────────────────────
  // DEALS
  // ──────────────────────────────────────────────────────────
  deals: {

    /** Supabase: const { data } = await supabase.from('deals')
     *   .select('*, merchants(name, icon)').eq('status', 'approved').order('created_at', { ascending: false }) */
    async list() {
      const adminData  = _loadStore('zamclub_admin', {});
      const adminDeals = (adminData.deals || []).map(d => ({ ...d, status: 'approved' }));
      const all        = [...ZAMData.deals, ...adminDeals];
      const claimed    = _s('claimed_deals', []);
      const saved      = _s('saved_deals',   []);
      return all.map(d => ({ ...d, is_claimed: claimed.includes(d.id), is_saved: saved.includes(d.id) }));
    },

    /** Supabase: await supabase.from('saved_deals').insert({ deal_id, user_id }) */
    async save(dealId) {
      const saved = _s('saved_deals', []);
      if (!saved.includes(dealId)) { saved.push(dealId); _set('saved_deals', saved); }
    },

    /** Supabase: await supabase.from('saved_deals').delete().match({ deal_id, user_id }) */
    async unsave(dealId) {
      _set('saved_deals', _s('saved_deals', []).filter(id => id !== dealId));
    },

    /** Supabase: await supabase.from('deal_redemptions').insert({ deal_id, user_id }) */
    async redeem(dealId) {
      const claimed = _s('claimed_deals', []);
      if (!claimed.includes(dealId)) { claimed.push(dealId); _set('claimed_deals', claimed); }
    },

    isSaved(dealId)   { return _s('saved_deals',   []).includes(dealId); },
    isClaimed(dealId) { return _s('claimed_deals',  []).includes(dealId); },
  },

  // ──────────────────────────────────────────────────────────
  // MERCHANTS
  // ──────────────────────────────────────────────────────────
  merchants: {

    /** Supabase: const { data } = await supabase.from('merchants').select('*').order('name') */
    async list() {
      return ZAMData.merchants;
    },

    /** Supabase: const { data } = await supabase.from('merchants').select('*').eq('id', id).single() */
    async get(merchantId) {
      return ZAMData.merchants.find(m => m.id === merchantId) || null;
    },

    /**
     * Händler erstellt neues Deal (wartet auf Admin-Freigabe).
     * Supabase: await supabase.from('deals').insert({ ...dealData, merchant_id, created_by, status: 'pending' })
     */
    async createDeal(merchantId, dealData) {
      const deal = { ...dealData, id: _uuid(), merchant_id: merchantId, status: 'pending', created_at: _now() };
      const pending = _s('merchant_pending_deals', []);
      pending.push(deal);
      _set('merchant_pending_deals', pending);
      // Auch in Admin-Pending speichern
      const ap = _s('pending_deals', []);
      ap.push(deal);
      _set('pending_deals', ap);
      return deal;
    },

    /**
     * Händler erstellt neues Event (wartet auf Admin-Freigabe).
     * Supabase: await supabase.from('events').insert({ ...eventData, merchant_id, created_by, status: 'pending' })
     */
    async createEvent(merchantId, eventData) {
      const event = { ...eventData, id: _uuid(), merchant_id: merchantId, status: 'pending', created_at: _now() };
      const pending = _s('merchant_pending_events', []);
      pending.push(event);
      _set('merchant_pending_events', pending);
      const ap = _s('pending_events', []);
      ap.push(event);
      _set('pending_events', ap);
      return event;
    },
  },

  // ──────────────────────────────────────────────────────────
  // POINTS
  // ──────────────────────────────────────────────────────────
  points: {

    /** Supabase: const { data } = await supabase.from('profiles').select('points').eq('id', userId).single() */
    async get() {
      return _s('points', ZAMData.currentUser.points);
    },

    /**
     * Punkte gutschreiben.
     * Supabase: await supabase.from('points_log').insert({ user_id, points, action, reference_id })
     *           (Trigger sync_points() aktualisiert profiles.points automatisch)
     */
    async add(amount, action, referenceId = null) {
      const current = _s('points', ZAMData.currentUser.points);
      const newPts  = current + amount;
      _set('points', newPts);
      ZAMData.currentUser.points = newPts;

      // Log
      const log = _s('points_log', []);
      log.unshift({ id: _uuid(), points: amount, action, reference_id: referenceId, created_at: _now() });
      _set('points_log', log.slice(0, 100)); // max. 100 Einträge lokal
      return newPts;
    },

    /** Supabase: const { data } = await supabase.from('points_log').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50) */
    async log() {
      return _s('points_log', []);
    },
  },

  // ──────────────────────────────────────────────────────────
  // PROFILE
  // ──────────────────────────────────────────────────────────
  profile: {

    /** Supabase: const { data } = await supabase.from('profiles').select('*').eq('id', userId).single() */
    async get(userId = null) {
      const user = ZAMApi.auth.currentUser();
      return user || ZAMData.currentUser;
    },

    /** Supabase: await supabase.from('profiles').update(data).eq('id', userId) */
    async update(data) {
      return ZAMApi.auth.updateProfile(data);
    },

    /** Supabase: await supabase.storage.from('avatars').upload(...) */
    async uploadAvatar(file) {
      return ZAMApi.auth.uploadAvatar(file);
    },

    /**
     * Verdiente Badges des Nutzers.
     * Supabase: const { data } = await supabase.from('user_badges')
     *   .select('*, badges(*)').eq('user_id', userId)
     */
    async badges() {
      return ZAMData.badges;
    },

    /**
     * Nutzer-Statistiken.
     * Supabase: abgeleitet aus event_registrations, deal_redemptions, checkins
     */
    async stats() {
      return _s('stats', ZAMData.currentUser.stats);
    },
  },

  // ──────────────────────────────────────────────────────────
  // ADMIN
  // ──────────────────────────────────────────────────────────
  admin: {

    /** Supabase: await supabase.from('posts').select('*, profiles(*)').eq('status', 'pending').order('created_at') */
    async pendingPosts() { return _s('pending_posts', []); },

    /** Supabase: await supabase.from('posts').update({ status: 'approved' }).eq('id', postId) */
    async approvePost(postId) {
      _updatePendingStatus('pending_posts', 'community_user_posts', postId, 'approved');
    },

    /** Supabase: await supabase.from('posts').update({ status: 'rejected', reject_reason: reason }).eq('id', postId) */
    async rejectPost(postId, reason = '') {
      _updatePendingStatus('pending_posts', 'community_user_posts', postId, 'rejected', reason);
    },

    /** Supabase: await supabase.from('deals').select('*, merchants(*)').eq('status', 'pending') */
    async pendingDeals() { return _s('pending_deals', []); },

    /** Supabase: await supabase.from('deals').update({ status: 'approved' }).eq('id', dealId) */
    async approveDeal(dealId) {
      _updatePendingStatus('pending_deals', 'merchant_pending_deals', dealId, 'approved');
    },

    /** Supabase: await supabase.from('deals').update({ status: 'rejected' }).eq('id', dealId) */
    async rejectDeal(dealId, reason = '') {
      _updatePendingStatus('pending_deals', 'merchant_pending_deals', dealId, 'rejected', reason);
    },

    /** Supabase: await supabase.from('events').select('*, merchants(*)').eq('status', 'pending') */
    async pendingEvents() { return _s('pending_events', []); },

    /** Supabase: await supabase.from('events').update({ status: 'approved' }).eq('id', eventId) */
    async approveEvent(eventId) {
      _updatePendingStatus('pending_events', 'merchant_pending_events', eventId, 'approved');
    },

    /** Supabase: await supabase.from('events').update({ status: 'rejected' }).eq('id', eventId) */
    async rejectEvent(eventId, reason = '') {
      _updatePendingStatus('pending_events', 'merchant_pending_events', eventId, 'rejected', reason);
    },
  },

  // ──────────────────────────────────────────────────────────
  // NOTIFICATIONS (In-App, kein Push)
  // ──────────────────────────────────────────────────────────
  notifications: {

    /** Supabase: await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }) */
    async list() { return _s('notifications', []); },

    /** Supabase: await supabase.from('notifications').update({ is_read: true }).eq('id', id) */
    async markRead(id) {
      const notifs = _s('notifications', []);
      const i = notifs.findIndex(n => n.id === id);
      if (i !== -1) { notifs[i].is_read = true; _set('notifications', notifs); }
    },

    /** Supabase: await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId) */
    async markAllRead() {
      const notifs = _s('notifications', []).map(n => ({ ...n, is_read: true }));
      _set('notifications', notifs);
    },

    // Intern: Benachrichtigung erstellen
    _add(title, body, type = 'info', actionUrl = null) {
      const notifs = _s('notifications', []);
      notifs.unshift({ id: _uuid(), title, body, type, action_url: actionUrl, is_read: false, created_at: _now() });
      _set('notifications', notifs.slice(0, 50));
    },
  },
};

// ── Hilfsfunktion für Admin-Status-Updates ────────────────────
function _updatePendingStatus(pendingKey, listKey, itemId, status, reason = '') {
  const pending = _s(pendingKey, []);
  const idx = pending.findIndex(i => i.id === itemId);
  if (idx !== -1) { pending[idx].status = status; if (reason) pending[idx].reject_reason = reason; }
  _set(pendingKey, pending);

  const list = _s(listKey, []);
  const li = list.findIndex(i => i.id === itemId);
  if (li !== -1) { list[li].status = status; _set(listKey, list); }
}

window.ZAMApi = ZAMApi;
