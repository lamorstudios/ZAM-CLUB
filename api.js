/**
 * ZAM Club — API-Abstraktionsschicht v3
 * ============================================================
 * Demo-Backend: localStorage mit echtem Multi-User-System.
 * Jede Methode enthält den Supabase-Äquivalent als Kommentar.
 * Migration: 4 Zeilen unten einkommentieren + Demo-Blöcke ersetzen.
 * ============================================================
 */

'use strict';

// ── Badge-Definitionen mit Auto-Unlock-Bedingungen ──────────────
const BADGE_DEFS = [
  { id: 'badge_zam_starter',   name: 'ZAM Starter',      icon: '🌟', color: '#8b5cf6', description: 'Im ZAM Club willkommen!',       check: ()       => true },
  { id: 'badge_deal_hunter',   name: 'Deal Hunter',       icon: '🎯', color: '#10b981', description: '3 Deals gespeichert oder gesichert', check: (s) => (s.deals_used||0)+(s.deals_saved||0) >= 3 },
  { id: 'badge_event_fan',     name: 'Event Fan',          icon: '🎟️', color: '#f59e0b', description: 'An 2 Events teilgenommen',      check: (s)      => (s.events_attended||0) >= 2 },
  { id: 'badge_community',     name: 'Community Member',   icon: '💬', color: '#3b82f6', description: 'Ersten Beitrag geteilt',        check: (s)      => (s.posts_created||0) >= 1 },
  { id: 'badge_daily_spinner', name: 'Daily Spinner',      icon: '🎰', color: '#a855f7', description: '3× am Glücksrad gedreht',       check: (s)      => (s.spins||0) >= 3 },
  { id: 'badge_checkin_star',  name: 'Check-in Star',      icon: '📍', color: '#06b6d4', description: '5× eingecheckt',               check: (s)      => (s.visits||0) >= 5 },
  { id: 'badge_platin_star',   name: 'Platin-Star',        icon: '💎', color: '#c084fc', description: '3.000 Punkte gesammelt',        check: (s, pts) => pts >= 3000 },
];

// ── Supabase Init (auskommentiert bis Zugangsdaten vorhanden) ──
// import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
// const SUPABASE_URL      = 'https://DEIN-PROJEKT.supabase.co'
// const SUPABASE_ANON_KEY = 'eyJ...'
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ============================================================
// Interne Helfer
// ============================================================

// Kommentare in memory (reset bei Reload — in Supabase persistent)
const _commentStore = {};

function _uuid() { return 'demo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _notifUid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function _now()  { return new Date().toISOString(); }
function _todayKey() { return new Date().toISOString().slice(0, 10); }

// Haupt-Nutzer-Namespace (per User-ID isoliert)
const _GLOBAL_KEY = 'zamclub_global';   // Accounts-Registry
const _KEY_PREFIX = 'zamclub_u_';       // Pro-Nutzer-Daten

function _gLoad(k, fb = null) {
  try { return JSON.parse(localStorage.getItem(_GLOBAL_KEY) || '{}')[k] ?? fb; }
  catch { return fb; }
}
function _gSet(k, v) {
  try {
    const d = JSON.parse(localStorage.getItem(_GLOBAL_KEY) || '{}');
    d[k] = v; localStorage.setItem(_GLOBAL_KEY, JSON.stringify(d));
  } catch {}
}

// Pro-Nutzer-Store (Punkte, Stats, gespeicherte Items — getrennt pro Account)
function _uKey(userId) { return _KEY_PREFIX + (userId || 'guest'); }
function _uLoad(userId, k, fb = null) {
  try { return JSON.parse(localStorage.getItem(_uKey(userId)) || '{}')[k] ?? fb; }
  catch { return fb; }
}
function _uSet(userId, k, v) {
  try {
    const d = JSON.parse(localStorage.getItem(_uKey(userId)) || '{}');
    d[k] = v; localStorage.setItem(_uKey(userId), JSON.stringify(d));
  } catch {}
}

// Aktuellen User-ID aus Session holen
function _uid() {
  const u = ZAMApi.auth.currentUser();
  return u ? u.id : null;
}
// Shorthand: lade/setze aktuellen Nutzer-Store
function _s(k, fb = null) { return _uLoad(_uid(), k, fb); }
function _set(k, v)        { _uSet(_uid(), k, v); }

// Kompatibilität: altes zamclub_v1 auslesen (einmalig migrieren)
function _migrateLegacy(userId) {
  try {
    const legacy = JSON.parse(localStorage.getItem('zamclub_v1') || '{}');
    if (Object.keys(legacy).length === 0) return;
    const existing = JSON.parse(localStorage.getItem(_uKey(userId)) || '{}');
    if (Object.keys(existing).length === 0) {
      localStorage.setItem(_uKey(userId), JSON.stringify(legacy));
    }
  } catch {}
}

// ============================================================
const ZAMApi = {

  // ──────────────────────────────────────────────────────────
  // AUTH
  // ──────────────────────────────────────────────────────────
  auth: {

    /** Session des aktuellen Nutzers
     * Supabase: const { data: { user } } = await supabase.auth.getUser() */
    currentUser() {
      return _gLoad('session_user', null);
    },

    isLoggedIn() { return this.currentUser() !== null; },

    /**
     * Einloggen mit E-Mail + Passwort.
     * Supabase: const { data, error } = await supabase.auth.signInWithPassword({ email, password })
     */
    async signIn(email, password) {
      if (!email || !password) throw new Error('E-Mail und Passwort erforderlich.');
      // Demo: Accounts-Registry prüfen
      const accounts = _gLoad('accounts', []);
      const account  = accounts.find(a => a.email.toLowerCase() === email.toLowerCase() && a.password === password);
      if (!account) throw new Error('E-Mail oder Passwort falsch.');
      _gSet('session_user', account.profile);
      ZAMData.currentUser = { ...ZAMData.currentUser, ...account.profile };
      _migrateLegacy(account.profile.id);
      return { user: account.profile };
    },

    /**
     * Demo-Schnelllogin (für Präsentationen, kein Passwort nötig).
     */
    async demoLogin() {
      const profile = {
        id:                     'demo_julia',
        email:                  'julia@zamclub.de',
        display_name:           ZAMData.currentUser.display_name,
        username:               ZAMData.currentUser.username,
        initials:               ZAMData.currentUser.initials,
        avatar_url:             null,
        role:                   'user',
        level:                  ZAMData.currentUser.level,
        points:                 _uLoad('demo_julia', 'points', ZAMData.currentUser.points),
        member_since_formatted: ZAMData.currentUser.member_since_formatted,
        stats:                  _uLoad('demo_julia', 'stats', ZAMData.currentUser.stats),
      };
      _gSet('session_user', profile);
      ZAMData.currentUser = { ...ZAMData.currentUser, ...profile };
      _migrateLegacy('demo_julia');
      return { user: profile };
    },

    /**
     * Registrieren — legt neuen Account an.
     * Supabase: await supabase.auth.signUp({ email, password, options:{ data:{ display_name, username } } })
     *           Trigger fn_handle_new_user() legt Profil automatisch an.
     */
    async signUp(email, password, username, displayName) {
      if (!email || !password || !username || !displayName)
        throw new Error('Alle Felder ausfüllen.');
      if (password.length < 6)
        throw new Error('Passwort muss mindestens 6 Zeichen lang sein.');

      const cleanUsername = username.replace(/^@/, '').replace(/[^a-zA-Z0-9_.]/g, '');
      if (cleanUsername.length < 3)
        throw new Error('Benutzername muss mindestens 3 Zeichen haben (nur Buchstaben, Zahlen, _ erlaubt).');

      const accounts = _gLoad('accounts', []);
      if (accounts.find(a => a.email.toLowerCase() === email.toLowerCase()))
        throw new Error('Diese E-Mail-Adresse ist bereits registriert.');
      if (accounts.find(a => a.profile.username.toLowerCase() === ('@' + cleanUsername).toLowerCase()))
        throw new Error('Dieser Benutzername ist bereits vergeben.');

      const parts    = displayName.trim().split(' ');
      const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || displayName.slice(0, 2).toUpperCase();
      const profile  = {
        id:                     _uuid(),
        email,
        display_name:           displayName.trim(),
        username:               '@' + cleanUsername,
        initials,
        avatar_url:             null,
        role:                   'user',
        level:                  'bronze',
        points:                 50,    // Willkommens-Bonus
        member_since_formatted: 'Mitglied seit ' + new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
        stats:                  { visits: 0, events_attended: 0, deals_used: 0 },
      };

      accounts.push({ email, password, profile });
      _gLoad('accounts') !== undefined; // ensure global initialized
      _gSet('accounts', accounts);
      _gSet('session_user', profile);

      // Willkommens-Bonus in Punkte-Log
      _uSet(profile.id, 'points', 50);
      _uSet(profile.id, 'points_log', [{
        id: _uuid(), points: 50, action: 'welcome_bonus',
        description: '🎉 Willkommen im ZAM Club!', created_at: _now(),
      }]);
      _uSet(profile.id, 'stats', profile.stats);

      ZAMData.currentUser = { ...ZAMData.currentUser, ...profile };
      return { user: profile };
    },

    /**
     * Ausloggen.
     * Supabase: await supabase.auth.signOut()
     */
    async signOut() {
      _gSet('session_user', null);
      ZAMData.currentUser = ZAMData.profiles[0];
    },

    /**
     * Passwort-Reset-Mail senden.
     * Supabase: await supabase.auth.resetPasswordForEmail(email, { redirectTo })
     */
    async resetPassword(email) {
      if (!email) throw new Error('E-Mail erforderlich.');
      const accounts = _gLoad('accounts', []);
      if (!accounts.find(a => a.email.toLowerCase() === email.toLowerCase()))
        throw new Error('Keine Konto mit dieser E-Mail gefunden.');
      // Demo: zeige Erfolgsmeldung (in Supabase wird echte Mail versendet)
      return { success: true };
    },

    /**
     * Profil aktualisieren.
     * Supabase: await supabase.from('profiles').update(data).eq('id', userId)
     */
    async updateProfile(data) {
      const user = this.currentUser();
      if (!user) throw new Error('Nicht eingeloggt.');

      // Username-Eindeutigkeit prüfen
      if (data.username) {
        const clean = ('@' + data.username.replace(/^@/, '').replace(/[^a-zA-Z0-9_.]/g, ''));
        const accounts = _gLoad('accounts', []);
        if (accounts.find(a => a.profile.username.toLowerCase() === clean.toLowerCase() && a.profile.id !== user.id))
          throw new Error('Dieser Benutzername ist bereits vergeben.');
        data.username = clean;
        data.initials = ((data.display_name || user.display_name).trim().split(' '))
          .slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
      }

      const updated = { ...user, ...data };
      _gSet('session_user', updated);
      ZAMData.currentUser = { ...ZAMData.currentUser, ...updated };

      // In Accounts-Registry synchronisieren
      const accounts = _gLoad('accounts', []);
      const idx = accounts.findIndex(a => a.profile.id === user.id);
      if (idx !== -1) {
        accounts[idx].profile = updated;
        _gSet('accounts', accounts);
      }
      return updated;
    },

    /**
     * Avatar hochladen (DataURL für Demo, Supabase Storage später).
     * Supabase: await supabase.storage.from('avatars').upload(`${userId}/avatar.jpg`, file)
     */
    async uploadAvatar(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          await this.updateProfile({ avatar_url: e.target.result });
          resolve(e.target.result);
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
     * Alle freigegebenen Posts + eigene Posts des Nutzers.
     * Supabase: await supabase.from('posts')
     *   .select('*, profiles(display_name, initials, avatar_url)')
     *   .eq('status','approved').order('created_at',{ascending:false})
     */
    async list() {
      const uid        = _uid();
      const liked      = _s('liked_posts', []);
      const userPosts  = _gLoad('all_posts', []);
      const approved   = userPosts.filter(p => p.status === 'approved' || p.user_id === uid);
      const merged     = [...approved, ...ZAMData.communityPosts];
      // Deduplizieren nach id
      const seen = new Set();
      return merged.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
        .map(p => ({ ...p, is_liked: liked.includes(p.id) }));
    },

    /**
     * Eigene Posts des aktuellen Nutzers.
     * Supabase: .from('posts').select('*').eq('user_id', uid).order('created_at',{ascending:false})
     */
    async myPosts() {
      const uid = _uid();
      return _gLoad('all_posts', []).filter(p => p.user_id === uid);
    },

    /**
     * Neuen Post erstellen (status=pending bis Admin freigibt).
     * Supabase: await supabase.from('posts').insert({ user_id, content, tags, image_url })
     */
    async create(content, tags = [], imageUrl = null) {
      const user = ZAMApi.auth.currentUser();
      if (!user) throw new Error('Nicht eingeloggt.');
      if (!content.trim()) throw new Error('Inhalt darf nicht leer sein.');

      const post = {
        id:         _uuid(),
        user_id:    user.id,
        author: {
          name:         user.display_name,
          initials:     user.initials,
          avatar_url:   user.avatar_url,
          avatar_color: '#8b5cf6',
          level:        _levelLabel(user.level),
        },
        content: content.trim(),
        tags,
        image_url:  imageUrl,
        likes:      0,
        comments:   0,
        status:     'pending',
        created_at: _now(),
        time_ago:   'gerade eben',
        is_liked:   false,
      };

      const posts = _gLoad('all_posts', []);
      posts.unshift(post);
      _gSet('all_posts', posts);

      // Track post count for badges/challenges
      const cStats = _s('stats', {}); cStats.posts_created = (cStats.posts_created||0) + 1; _set('stats', cStats);

      // Pending-Queue für Admin
      const pending = _gLoad('pending_posts', []);
      pending.unshift({ ...post });
      _gSet('pending_posts', pending);

      return post;
    },

    /**
     * Eigenen Post löschen.
     * Supabase: await supabase.from('posts').delete().eq('id', postId).eq('user_id', uid)
     */
    async delete(postId) {
      const uid  = _uid();
      const posts = _gLoad('all_posts', []);
      const post  = posts.find(p => p.id === postId);
      if (!post) throw new Error('Post nicht gefunden.');
      if (post.user_id !== uid) throw new Error('Keine Berechtigung.');
      _gSet('all_posts', posts.filter(p => p.id !== postId));
      _gSet('pending_posts', _gLoad('pending_posts',[]).filter(p => p.id !== postId));
    },

    /** Supabase: await supabase.from('post_likes').insert({ post_id, user_id }) */
    async like(postId) {
      const liked = _s('liked_posts', []);
      if (!liked.includes(postId)) { liked.push(postId); _set('liked_posts', liked); }
      // Likes-Count im globalen Post erhöhen
      const posts = _gLoad('all_posts', []);
      const p = posts.find(x => x.id === postId);
      if (p) { p.likes = (p.likes || 0) + 1; _gSet('all_posts', posts); }
    },

    /** Supabase: await supabase.from('post_likes').delete().match({ post_id, user_id }) */
    async unlike(postId) {
      _set('liked_posts', _s('liked_posts', []).filter(id => id !== postId));
      const posts = _gLoad('all_posts', []);
      const p = posts.find(x => x.id === postId);
      if (p) { p.likes = Math.max(0, (p.likes || 1) - 1); _gSet('all_posts', posts); }
    },

    /** Supabase: await supabase.from('comments').select('*,profiles(*)').eq('post_id', postId) */
    async getComments(postId) {
      if (!_commentStore[postId]) _commentStore[postId] = [];
      return _commentStore[postId];
    },

    /** Supabase: await supabase.from('comments').insert({ post_id, user_id, content }) */
    async addComment(postId, content) {
      const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
      const comment = {
        id: _uuid(), post_id: postId, user_id: user.id,
        author: { name: user.display_name, initials: user.initials, avatar_color: '#8b5cf6', avatar_url: user.avatar_url },
        content, created_at: _now(), time_ago: 'gerade eben',
      };
      if (!_commentStore[postId]) _commentStore[postId] = [];
      _commentStore[postId].push(comment);
      // comments_count hochzählen
      const posts = _gLoad('all_posts', []);
      const p = posts.find(x => x.id === postId);
      if (p) { p.comments = (p.comments || 0) + 1; _gSet('all_posts', posts); }
      return comment;
    },
  },

  // ──────────────────────────────────────────────────────────
  // EVENTS
  // ──────────────────────────────────────────────────────────
  events: {

    /** Supabase: await supabase.from('events').select('*').eq('status','approved').order('date_iso') */
    async list(filter = 'all') {
      const adminData = JSON.parse(localStorage.getItem('zamclub_admin') || '{}');
      const adminEvts = (adminData.events || []).map(e => ({ ...e, status: 'approved' }));
      let all = [...ZAMData.events, ...adminEvts];
      if (filter === 'week') all = all.slice(0, 2);
      if (filter === 'month') all = all.slice(0, 4);
      const joined = _s('joined_events', []);
      const saved  = _s('saved_events',  []);
      return all.map(e => ({ ...e, is_joined: joined.includes(e.id), is_saved: saved.includes(e.id) }));
    },

    /** Supabase: await supabase.from('events').select('*').eq('id', id).single() */
    async get(eventId) {
      const all = await this.list();
      return all.find(e => e.id === eventId) || null;
    },

    /** Supabase: await supabase.from('event_participants').insert({ event_id, user_id }) */
    async register(eventId) {
      const joined = _s('joined_events', []);
      if (!joined.includes(eventId)) { joined.push(eventId); _set('joined_events', joined); }
    },

    /** Supabase: await supabase.from('event_participants').delete().match({ event_id, user_id }) */
    async unregister(eventId) {
      _set('joined_events', _s('joined_events', []).filter(id => id !== eventId));
    },

    /** Supabase: await supabase.from('saved_events').insert({ event_id, user_id }) */
    async save(eventId) {
      const saved = _s('saved_events', []);
      if (!saved.includes(eventId)) { saved.push(eventId); _set('saved_events', saved); }
    },
    async unsave(eventId) { _set('saved_events', _s('saved_events', []).filter(id => id !== eventId)); },

    isSaved(eventId)      { return _s('saved_events',  []).includes(eventId); },
    isRegistered(eventId) { return _s('joined_events', []).includes(eventId); },
  },

  // ──────────────────────────────────────────────────────────
  // DEALS
  // ──────────────────────────────────────────────────────────
  deals: {

    /** Supabase: await supabase.from('deals').select('*,merchants(name,icon)').eq('status','approved') */
    async list() {
      const adminData  = JSON.parse(localStorage.getItem('zamclub_admin') || '{}');
      const adminDeals = (adminData.deals || []).map(d => ({ ...d, status: 'approved' }));
      const all        = [...ZAMData.deals, ...adminDeals];
      const claimed    = _s('claimed_deals', []);
      const saved      = _s('saved_deals',   []);
      return all.map(d => ({ ...d, is_claimed: claimed.includes(d.id), is_saved: saved.includes(d.id) }));
    },

    async savedList() {
      const all   = await this.list();
      const saved = _s('saved_deals', []);
      return all.filter(d => saved.includes(d.id));
    },

    async save(dealId)  {
      const saved = _s('saved_deals', []);
      if (!saved.includes(dealId)) {
        saved.push(dealId); _set('saved_deals', saved);
        const stats = _s('stats', {}); stats.deals_saved = (stats.deals_saved||0) + 1; _set('stats', stats);
      }
    },
    async unsave(dealId) { _set('saved_deals', _s('saved_deals', []).filter(id => id !== dealId)); },

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
    async list() { return ZAMData.merchants; },
    async get(id) { return ZAMData.merchants.find(m => m.id === id) || null; },

    /** Händler des aktuellen Nutzers (via merchant_staff) */
    async myMerchant() {
      const uid = _uid();
      if (!uid) return null;
      // Supabase: .from('merchant_staff').select('merchants(*)').eq('user_id', uid).single()
      const staff = _gLoad('merchant_staff', []);
      const entry = staff.find(s => s.user_id === uid);
      if (entry) return ZAMData.merchants.find(m => m.id === entry.merchant_id) || null;
      // Fallback: Demo-Händler für Demo-User
      if (uid === 'demo_julia') return null;
      return null;
    },

    /** Eigene Deals des Händlers (alle Status) */
    async myDeals(merchantId) {
      const allPending = _gLoad('pending_deals', []);
      const fromData   = ZAMData.deals.filter(d => d.merchant_id === merchantId);
      const fromPending = allPending.filter(d => d.merchant_id === merchantId);
      // Merge, deduplizieren
      const seen = new Set(fromPending.map(d => d.id));
      return [...fromPending, ...fromData.filter(d => !seen.has(d.id))];
    },

    /** Eigene Events des Händlers (alle Status) */
    async myEvents(merchantId) {
      const allPending = _gLoad('pending_events', []);
      const fromData   = ZAMData.events.filter(e => e.merchant_id === merchantId);
      const fromPending = allPending.filter(e => e.merchant_id === merchantId);
      const seen = new Set(fromPending.map(e => e.id));
      return [...fromPending, ...fromData.filter(e => !seen.has(e.id))];
    },

    /** Deal erstellen (status=pending) */
    async createDeal(merchantId, dealData) {
      const merchant = await this.get(merchantId);
      const deal = {
        ...dealData,
        id:           _uuid(),
        merchant_id:  merchantId,
        store_name:   merchant?.name || '',
        store_icon:   merchant?.icon || '🏪',
        category_color: merchant?.category_color || '#8b5cf6',
        status:       'pending',
        created_at:   _now(),
        created_by:   _uid(),
      };
      const pend = _gLoad('pending_deals', []);
      pend.unshift(deal);
      _gSet('pending_deals', pend);
      // Admin-Benachrichtigung
      _addAdminNotif('Neuer Deal eingereicht', `${deal.title} von ${merchant?.name || 'Händler'}`, 'deal', deal.id);
      return deal;
    },

    /** Event erstellen (status=pending) */
    async createEvent(merchantId, eventData) {
      const merchant = await this.get(merchantId);
      const event = {
        ...eventData,
        id:          _uuid(),
        merchant_id: merchantId,
        status:      'pending',
        created_at:  _now(),
        created_by:  _uid(),
      };
      const pend = _gLoad('pending_events', []);
      pend.unshift(event);
      _gSet('pending_events', pend);
      // Admin-Benachrichtigung
      _addAdminNotif('Neues Event eingereicht', `${event.title} von ${merchant?.name || 'Händler'}`, 'event', event.id);
      return event;
    },

    /** Deal aktualisieren */
    async updateDeal(dealId, data) {
      const pending = _gLoad('pending_deals', []);
      const i = pending.findIndex(d => d.id === dealId);
      if (i !== -1) { pending[i] = { ...pending[i], ...data, updated_at: _now() }; _gSet('pending_deals', pending); return pending[i]; }
      throw new Error('Deal nicht gefunden.');
    },

    /** Event aktualisieren */
    async updateEvent(eventId, data) {
      const pending = _gLoad('pending_events', []);
      const i = pending.findIndex(e => e.id === eventId);
      if (i !== -1) { pending[i] = { ...pending[i], ...data, updated_at: _now() }; _gSet('pending_events', pending); return pending[i]; }
      throw new Error('Event nicht gefunden.');
    },

    /** Deal deaktivieren */
    async deactivateDeal(dealId) {
      const pending = _gLoad('pending_deals', []);
      const i = pending.findIndex(d => d.id === dealId);
      if (i !== -1) { pending[i].status = 'inactive'; _gSet('pending_deals', pending); }
    },

    /** Event deaktivieren */
    async deactivateEvent(eventId) {
      const pending = _gLoad('pending_events', []);
      const i = pending.findIndex(e => e.id === eventId);
      if (i !== -1) { pending[i].status = 'inactive'; _gSet('pending_events', pending); }
    },

    /** Händler-Staff zuweisen (Demo) */
    async assignStaff(merchantId, userId) {
      const staff = _gLoad('merchant_staff', []);
      if (!staff.find(s => s.merchant_id === merchantId && s.user_id === userId)) {
        staff.push({ merchant_id: merchantId, user_id: userId, role: 'owner' });
        _gSet('merchant_staff', staff);
      }
    },
  },

  // ──────────────────────────────────────────────────────────
  // POINTS
  // ──────────────────────────────────────────────────────────
  points: {

    /** Supabase: .from('profiles').select('points').eq('id', uid).single() */
    async get() { return _s('points', ZAMData.currentUser.points); },

    /**
     * Punkte gutschreiben + Log-Eintrag.
     * Supabase: await supabase.from('points_transactions').insert({ user_id, points, action, description })
     *   (Trigger sync_points aktualisiert profiles.points automatisch)
     */
    async add(amount, action, description = '') {
      const current = _s('points', ZAMData.currentUser.points);
      const newPts  = current + amount;
      _set('points', newPts);
      ZAMData.currentUser.points = newPts;

      // Level aktualisieren
      const level = newPts >= 3000 ? 'platinum' : newPts >= 1500 ? 'gold' : newPts >= 500 ? 'silver' : 'bronze';
      const user  = ZAMApi.auth.currentUser();
      if (user) { user.level = level; _gSet('session_user', user); ZAMData.currentUser.level = level; }

      // Log-Eintrag
      const log = _s('points_log', []);
      log.unshift({ id: _uuid(), points: amount, action, description: description || action, created_at: _now() });
      _set('points_log', log.slice(0, 100));

      return newPts;
    },

    /** Supabase: .from('points_transactions').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(50) */
    async log(limit = 30) {
      return (_s('points_log', [])).slice(0, limit);
    },
  },

  // ──────────────────────────────────────────────────────────
  // PROFILE
  // ──────────────────────────────────────────────────────────
  profile: {
    async get()            { return ZAMApi.auth.currentUser() || ZAMData.currentUser; },
    async update(data)     { return ZAMApi.auth.updateProfile(data); },
    async uploadAvatar(f)  { return ZAMApi.auth.uploadAvatar(f); },
    async badges()         { return ZAMData.badges; },
    async stats()          { return _s('stats', ZAMData.currentUser.stats); },

    async savedEvents() {
      const all   = await ZAMApi.events.list();
      const saved = _s('saved_events', []);
      return all.filter(e => saved.includes(e.id));
    },
    async savedDeals() { return ZAMApi.deals.savedList(); },
  },

  // ──────────────────────────────────────────────────────────
  // ADMIN
  // ──────────────────────────────────────────────────────────
  admin: {
    async pendingPosts()   { return _gLoad('pending_posts',  []); },
    async pendingDeals()   { return _gLoad('pending_deals',  []); },
    async pendingEvents()  { return _gLoad('pending_events', []); },
    async allDeals()       { return [..._gLoad('pending_deals', []), ...ZAMData.deals]; },
    async allEvents()      { return [..._gLoad('pending_events', []), ...ZAMData.events]; },
    async allPosts()       { return [..._gLoad('pending_posts', []), ...ZAMData.communityPosts]; },

    async approvePost(postId) {
      _updateGlobalStatus('pending_posts', 'all_posts', postId, 'approved');
      const posts = _gLoad('all_posts', []);
      const post  = posts.find(p => p.id === postId);
      if (post) {
        const log = _uLoad(post.user_id, 'points_log', []);
        log.unshift({ id: _uuid(), points: 10, action: 'post_approved', description: '✅ Beitrag freigegeben', created_at: _now() });
        _uSet(post.user_id, 'points_log', log.slice(0, 100));
        _uSet(post.user_id, 'points', (_uLoad(post.user_id, 'points', 0)) + 10);
      }
      _markAdminNotifHandled('post', postId);
    },
    async rejectPost(postId, reason)  {
      _updateGlobalStatus('pending_posts', 'all_posts', postId, 'rejected', reason);
      _markAdminNotifHandled('post', postId);
    },
    async approveDeal(dealId) {
      _updateGlobalStatus('pending_deals', null, dealId, 'approved');
      _markAdminNotifHandled('deal', dealId);
    },
    async rejectDeal(dealId, reason)  {
      _updateGlobalStatus('pending_deals', null, dealId, 'rejected', reason);
      _markAdminNotifHandled('deal', dealId);
    },
    async approveEvent(eventId) {
      _updateGlobalStatus('pending_events', null, eventId, 'approved');
      _markAdminNotifHandled('event', eventId);
    },
    async rejectEvent(eventId, reason) {
      _updateGlobalStatus('pending_events', null, eventId, 'rejected', reason);
      _markAdminNotifHandled('event', eventId);
    },
    async updateDeal(dealId, data) {
      const pending = _gLoad('pending_deals', []);
      const i = pending.findIndex(d => d.id === dealId);
      if (i !== -1) { pending[i] = { ...pending[i], ...data }; _gSet('pending_deals', pending); return pending[i]; }
    },
    async updateEvent(eventId, data) {
      const pending = _gLoad('pending_events', []);
      const i = pending.findIndex(e => e.id === eventId);
      if (i !== -1) { pending[i] = { ...pending[i], ...data }; _gSet('pending_events', pending); return pending[i]; }
    },
    async deactivateDeal(dealId)  { _updateGlobalStatus('pending_deals',  null, dealId,  'inactive'); },
    async deactivateEvent(eventId){ _updateGlobalStatus('pending_events', null, eventId, 'inactive'); },
    async deactivatePost(postId)  { _updateGlobalStatus('pending_posts', 'all_posts', postId, 'inactive'); },

    // Admin-Benachrichtigungen
    async notifications()  { return _gLoad('admin_notifications', []); },
    async unreadCount()    { return _gLoad('admin_notifications', []).filter(n => !n.is_read).length; },
    async markRead(id)     {
      const notifs = _gLoad('admin_notifications', []);
      const i = notifs.findIndex(n => n.id === id);
      if (i !== -1) { notifs[i].is_read = true; _gSet('admin_notifications', notifs); }
    },
    async markAllRead() {
      _gSet('admin_notifications', _gLoad('admin_notifications', []).map(n => ({ ...n, is_read: true })));
    },
  },

  // ──────────────────────────────────────────────────────────
  // CHAT
  // Supabase: supabase.from('chat_messages').on('INSERT', cb).subscribe()
  // ──────────────────────────────────────────────────────────
  chat: {
    // Room definitions (static + event-based)
    // Supabase: .from('chat_rooms').select('*').order('type').order('created_at')
    rooms() {
      const global = [
        { id: 'room_allgemein', name: 'Allgemein',        icon: '💬', type: 'global', description: 'Allgemeine Unterhaltungen' },
        { id: 'room_food',      name: 'Essen & Gastro',   icon: '🍕', type: 'global', description: 'Restaurants, Cafés & Foodtrends' },
        { id: 'room_events',    name: 'Events',           icon: '📅', type: 'global', description: 'Veranstaltungen & Aktivitäten' },
        { id: 'room_deals',     name: 'Deals & Aktionen', icon: '🏷️', type: 'global', description: 'Angebote & Empfehlungen' },
      ];
      const eventRooms = (ZAMData.events || []).slice(0, 4).map(e => ({
        id: `room_evt_${e.id}`,
        name: e.title,
        icon: '📅',
        type: 'event',
        event_id: e.id,
        description: `${e.date_formatted} · ${e.location}`,
      }));
      return { global, events: eventRooms };
    },

    // Load messages for a room (localStorage, filter blocked users)
    // Supabase: .from('chat_messages').select('*, profiles(*)').eq('room_id', roomId).order('created_at').limit(60)
    messages(roomId) {
      try {
        const key   = `zamclub_chat_${roomId}`;
        const msgs  = JSON.parse(localStorage.getItem(key) || '[]');
        const blocked = _s('blocked_users', []);
        return msgs.filter(m => !m.is_deleted && !blocked.includes(m.user_id)).slice(-60);
      } catch { return []; }
    },

    // Send a message
    // Supabase: .from('chat_messages').insert({ room_id, user_id, content })
    sendMessage(roomId, content) {
      const user = ZAMApi.auth.currentUser();
      if (!user) throw new Error('Nicht eingeloggt.');
      content = content.trim();
      if (!content) return null;
      const msg = {
        id: _uuid(), room_id: roomId, user_id: user.id,
        author: { name: user.display_name, initials: user.initials, color: user.avatar_color || '#8b5cf6' },
        content, created_at: _now(), is_deleted: false,
      };
      const key  = `zamclub_chat_${roomId}`;
      const msgs = JSON.parse(localStorage.getItem(key) || '[]');
      msgs.push(msg);
      localStorage.setItem(key, JSON.stringify(msgs.slice(-200)));
      return msg;
    },

    // Delete a message (admin or own)
    // Supabase: .from('chat_messages').update({ is_deleted: true, deleted_by: uid }).eq('id', msgId)
    deleteMessage(roomId, msgId) {
      const key  = `zamclub_chat_${roomId}`;
      const msgs = JSON.parse(localStorage.getItem(key) || '[]');
      const m    = msgs.find(x => x.id === msgId);
      if (m) { m.is_deleted = true; localStorage.setItem(key, JSON.stringify(msgs)); }
    },

    // Report a message or user
    // Supabase: .from('reports').insert({ reporter_id, content_type, content_id, reason })
    report(contentType, contentId, reason = '', reportedUserId = null) {
      const reports = _gLoad('reports', []);
      reports.unshift({ id: _uuid(), reporter_id: _uid(), content_type: contentType, content_id: contentId, reported_user_id: reportedUserId, reason, created_at: _now() });
      _gSet('reports', reports.slice(0, 500));
    },

    // Block / unblock a user
    // Supabase: .from('blocked_users').insert({ blocker_id, blocked_id })
    blockUser(userId) {
      const blocked = _s('blocked_users', []);
      if (!blocked.includes(userId)) { blocked.push(userId); _set('blocked_users', blocked); }
    },
    unblockUser(userId) {
      _set('blocked_users', _s('blocked_users', []).filter(id => id !== userId));
    },
    isBlocked(userId) { return _s('blocked_users', []).includes(userId); },

    // Ban a user (admin only)
    // Supabase: .from('profiles').update({ is_banned: true }).eq('id', userId)
    banUser(userId) {
      const banned = _gLoad('banned_users', []);
      if (!banned.includes(userId)) { banned.push(userId); _gSet('banned_users', banned); }
    },

    // Online user simulation
    // Supabase: presence via supabase.channel('room').track({ user_id, online_at })
    onlineUsers() {
      return [
        { id: 'usr_042', name: 'Mia K.',   initials: 'MK', color: '#7c3aed', status: 'online' },
        { id: 'usr_017', name: 'Felix B.', initials: 'FB', color: '#10b981', status: 'online' },
        { id: 'usr_088', name: 'Sarah L.', initials: 'SL', color: '#ec4899', status: 'online' },
        { id: 'usr_031', name: 'Tom W.',   initials: 'TW', color: '#f59e0b', status: 'recent' },
        { id: 'usr_055', name: 'Anna P.',  initials: 'AP', color: '#3b82f6', status: 'recent' },
      ];
    },

    onlineCount() {
      // Simulated: 6-14 users online. Stable per minute so it doesn't flicker wildly.
      const base = Math.floor(Date.now() / 60000) % 9;
      return base + 6;
    },

    // Unread count
    unreadCount() { return _s('chat_unread', 0); },
    markRoomRead(roomId) {
      const unread = _s('chat_unread_rooms', {});
      delete unread[roomId];
      _set('chat_unread_rooms', unread);
      _set('chat_unread', Object.values(unread).reduce((a, b) => a + b, 0));
    },
    addUnread(roomId, count = 1) {
      const unread = _s('chat_unread_rooms', {});
      unread[roomId] = (unread[roomId] || 0) + count;
      _set('chat_unread_rooms', unread);
      _set('chat_unread', Object.values(unread).reduce((a, b) => a + b, 0));
    },

    // Seed demo messages into an empty room
    seedDemoMessages(roomId) {
      const key = `zamclub_chat_${roomId}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      if (existing.length > 0) return;
      const now = Date.now();
      const seeds = {
        room_allgemein: [
          { uid: 'usr_042', a: { name: 'Mia K.',   initials: 'MK', color: '#7c3aed' }, c: 'Hey Leute! 👋 Freue mich auf den Sommer-Markt diese Woche!', ago: 18 },
          { uid: 'usr_017', a: { name: 'Felix B.', initials: 'FB', color: '#10b981' }, c: 'Ich bin schon gespannt! Kommt jemand zum Yoga-Event?', ago: 12 },
          { uid: 'usr_088', a: { name: 'Sarah L.', initials: 'SL', color: '#ec4899' }, c: 'Bin dabei! Das Morgen-Yoga im Atrium war letztes Mal mega 🧘‍♀️', ago: 7 },
        ],
        room_food: [
          { uid: 'usr_031', a: { name: 'Tom W.',   initials: 'TW', color: '#f59e0b' }, c: 'Hat jemand den neuen Hummus bei Levante Kitchen probiert? 🤤', ago: 30 },
          { uid: 'usr_088', a: { name: 'Sarah L.', initials: 'SL', color: '#ec4899' }, c: 'JA! Der ist der beste den ich je gegessen habe!! 🥙', ago: 22 },
          { uid: 'usr_042', a: { name: 'Mia K.',   initials: 'MK', color: '#7c3aed' }, c: 'Danke – steht jetzt auf meiner Liste für morgen 😍', ago: 15 },
        ],
        room_events: [
          { uid: 'usr_055', a: { name: 'Anna P.',  initials: 'AP', color: '#3b82f6' }, c: 'Wer kommt zum Sommer-Markt am Samstag? Wir könnten uns treffen!', ago: 45 },
          { uid: 'usr_017', a: { name: 'Felix B.', initials: 'FB', color: '#10b981' }, c: 'Ich komme auf jeden Fall! Ab wann bist du da?', ago: 38 },
          { uid: 'usr_055', a: { name: 'Anna P.',  initials: 'AP', color: '#3b82f6' }, c: 'Ich plane ab 11 Uhr – dann beim Food-Truck-Bereich 🎉', ago: 20 },
        ],
        room_deals: [
          { uid: 'usr_031', a: { name: 'Tom W.',   initials: 'TW', color: '#f59e0b' }, c: '7 Tage gratis Gym war SO eine gute Entscheidung – jetzt hab ich Jahresmitgliedschaft 😅', ago: 60 },
          { uid: 'usr_042', a: { name: 'Mia K.',   initials: 'MK', color: '#7c3aed' }, c: 'Haha ja das kenne ich! Die Rooftop-Sauna ist einfach unschlagbar 💪', ago: 52 },
        ],
      };
      const roomSeeds = seeds[roomId] || [];
      const msgs = roomSeeds.map((s, i) => ({
        id: `seed_${i}`, room_id: roomId, user_id: s.uid, author: s.a,
        content: s.c, created_at: new Date(now - s.ago * 60000).toISOString(),
        is_deleted: false,
      }));
      localStorage.setItem(key, JSON.stringify(msgs));
    },
  },

  // ──────────────────────────────────────────────────────────
  // BADGES
  // ──────────────────────────────────────────────────────────
  badges: {
    async list() {
      const earned = _s('earned_badges', []);
      const dates  = _s('badge_dates',   {});
      return BADGE_DEFS.map(b => ({ ...b, earned: earned.includes(b.id), earned_date: dates[b.id] || null }));
    },

    async checkAndUnlock() {
      const stats = _s('stats', {});
      const pts   = _s('points', ZAMData.currentUser.points || 0);
      const earned  = _s('earned_badges', []);
      const dates   = _s('badge_dates',   {});
      const newBadges = [];
      for (const b of BADGE_DEFS) {
        if (!earned.includes(b.id) && b.check(stats, pts)) {
          earned.push(b.id); dates[b.id] = _now(); newBadges.push(b);
        }
      }
      if (newBadges.length) { _set('earned_badges', earned); _set('badge_dates', dates); }
      return newBadges;
    },
  },

  // ──────────────────────────────────────────────────────────
  // CHALLENGES
  // ──────────────────────────────────────────────────────────
  challenges: {
    async list() {
      const stats   = _s('stats', {});
      const claimed = _s('claimed_challenges', []);
      return ZAMData.challenges.map(c => {
        const progress = Math.min(stats[c.stat] || 0, c.target);
        return { ...c, progress, pct: Math.round((progress / c.target) * 100), is_complete: progress >= c.target, is_claimed: claimed.includes(c.id) };
      });
    },
    async claim(challengeId) {
      const all = await this.list();
      const c = all.find(x => x.id === challengeId);
      if (!c || !c.is_complete || c.is_claimed) return null;
      const claimed = _s('claimed_challenges', []);
      claimed.push(challengeId); _set('claimed_challenges', claimed);
      await ZAMApi.points.add(c.reward_pts, 'challenge_reward', `✅ Challenge: ${c.title}`);
      return { points: c.reward_pts };
    },
  },

  // ──────────────────────────────────────────────────────────
  // NUDGES & CONNECTIONS (Phase 10)
  // ──────────────────────────────────────────────────────────
  nudges: {
    privateChatRoomId(userId) {
      const me = ZAMApi.auth.currentUser();
      if (!me) return null;
      const pair = [me.id, userId].sort().join('_');
      return `room_priv_${pair}`;
    },

    hasPendingNudgeTo(toUserId) {
      const me = ZAMApi.auth.currentUser();
      if (!me) return false;
      const nudges = _gLoad('nudges', []);
      return nudges.some(n => n.from_id === me.id && n.to_id === toUserId && n.status === 'pending');
    },

    isConnected(userId) {
      const me = ZAMApi.auth.currentUser();
      if (!me) return false;
      const connections = _gLoad('connections', []);
      return connections.some(c =>
        (c.user_a === me.id && c.user_b === userId) ||
        (c.user_a === userId && c.user_b === me.id)
      );
    },

    send(toUserId, toUserName) {
      const me = ZAMApi.auth.currentUser();
      if (!me) return null;
      if (this.hasPendingNudgeTo(toUserId) || this.isConnected(toUserId)) return null;
      const nudgeId  = _uuid();
      const fromName = me.display_name || me.username || me.name || 'Jemand';
      const nudge = {
        id: nudgeId, from_id: me.id, from_name: fromName,
        from_initials: me.initials || '?', from_avatar: me.avatar_url || null,
        to_id: toUserId, to_name: toUserName, status: 'pending', created_at: _now(),
      };
      const nudges = _gLoad('nudges', []);
      nudges.push(nudge);
      _gSet('nudges', nudges);
      // Add to recipient's nudge_inbox
      try {
        const rData = JSON.parse(localStorage.getItem(_uKey(toUserId)) || '{}');
        const inbox  = rData.nudge_inbox || [];
        inbox.unshift({ id: nudgeId, from_id: me.id, from_name: fromName, from_initials: me.initials || '?', from_avatar: me.avatar_url || null, created_at: _now() });
        rData.nudge_inbox = inbox.slice(0, 30);
        localStorage.setItem(_uKey(toUserId), JSON.stringify(rData));
      } catch {}
      return nudgeId;
    },

    // Pending nudges I received (from my nudge_inbox)
    myPending() {
      const inbox  = _s('nudge_inbox', []);
      const nudges = _gLoad('nudges', []);
      return inbox.map(n => {
        const global = nudges.find(g => g.id === n.id);
        return { ...n, status: global ? global.status : 'pending' };
      }).filter(n => n.status === 'pending');
    },

    // Nudges I sent that are still pending
    mySent() {
      const me = ZAMApi.auth.currentUser();
      if (!me) return [];
      return _gLoad('nudges', []).filter(n => n.from_id === me.id);
    },

    // Legacy alias
    myNudges() { return this.myPending(); },

    accept(nudgeId) {
      const me = ZAMApi.auth.currentUser();
      if (!me) return;
      const nudges = _gLoad('nudges', []);
      const nudge  = nudges.find(n => n.id === nudgeId);
      if (nudge) {
        nudge.status = 'accepted';
        _gSet('nudges', nudges);
        // Create connection (canonical order: user_a < user_b)
        const connections = _gLoad('connections', []);
        const alreadyConnected = connections.some(c =>
          (c.user_a === nudge.from_id && c.user_b === nudge.to_id) ||
          (c.user_a === nudge.to_id   && c.user_b === nudge.from_id)
        );
        if (!alreadyConnected) {
          const [ua, ub] = [nudge.from_id, nudge.to_id].sort();
          connections.push({ id: _uuid(), user_a: ua, user_b: ub, connected_at: _now() });
          _gSet('connections', connections);
        }
        // Notify the sender
        try {
          const toName = me.display_name || nudge.to_name || 'Jemand';
          const sData  = JSON.parse(localStorage.getItem(_uKey(nudge.from_id)) || '{}');
          const sNotifs = sData.notifications || [];
          sNotifs.unshift({
            id: _uuid(), title: 'Anstupsen angenommen!',
            body: `${toName} hat deinen Anstoß angenommen. Ihr könnt jetzt chatten!`,
            type: 'nudge_accepted', is_read: false, created_at: _now(),
            related_user_id: me.id, related_user_name: toName,
          });
          sData.notifications = sNotifs.slice(0, 50);
          localStorage.setItem(_uKey(nudge.from_id), JSON.stringify(sData));
        } catch {}
      }
      // Remove from own nudge_inbox
      _set('nudge_inbox', (_s('nudge_inbox', [])).filter(n => n.id !== nudgeId));
    },

    reject(nudgeId) {
      const nudges = _gLoad('nudges', []);
      const nudge  = nudges.find(n => n.id === nudgeId);
      if (nudge) { nudge.status = 'rejected'; _gSet('nudges', nudges); }
      _set('nudge_inbox', (_s('nudge_inbox', [])).filter(n => n.id !== nudgeId));
    },
  },

  // ──────────────────────────────────────────────────────────
  // CONNECTIONS (Phase 10)
  // ──────────────────────────────────────────────────────────
  connections: {
    all() {
      const me = ZAMApi.auth.currentUser();
      if (!me) return [];
      const connections = _gLoad('connections', []);
      const accounts    = _gLoad('accounts',    []);
      const nudges      = _gLoad('nudges',       []);
      return connections
        .filter(c => c.user_a === me.id || c.user_b === me.id)
        .map(c => {
          const otherId = c.user_a === me.id ? c.user_b : c.user_a;
          const acct    = accounts.find(a => a.profile.id === otherId);
          const profile = acct ? acct.profile : null;
          const nudge   = nudges.find(n =>
            (n.from_id === otherId && n.to_id === me.id) ||
            (n.from_id === me.id  && n.to_id === otherId)
          );
          return {
            connection_id: c.id,
            user_id:      otherId,
            display_name: profile?.display_name || nudge?.from_name || nudge?.to_name || 'Nutzer',
            username:     profile?.username || '',
            initials:     profile?.initials || nudge?.from_initials || otherId.slice(0, 2).toUpperCase(),
            avatar_url:   profile?.avatar_url || nudge?.from_avatar || null,
            level:        profile?.level || 'bronze',
            connected_at: c.connected_at,
          };
        });
    },

    remove(connectionId) {
      _gSet('connections', _gLoad('connections', []).filter(c => c.id !== connectionId));
    },

    block(userId) {
      const blocked = _s('blocked', []);
      if (!blocked.includes(userId)) { blocked.push(userId); _set('blocked', blocked); }
      ZAMApi.chat.blockUser(userId);
    },

    report(userId, reason = 'other') {
      const me = ZAMApi.auth.currentUser();
      const reports = _gLoad('reports', []);
      reports.unshift({ id: _uuid(), reporter_id: me?.id, reported_user_id: userId, content_type: 'user', reason, created_at: _now() });
      _gSet('reports', reports.slice(0, 500));
    },

    isBlocked(userId) { return _s('blocked', []).includes(userId); },
  },

  // ──────────────────────────────────────────────────────────
  // PRIVATE CHAT (Phase 10)
  // ──────────────────────────────────────────────────────────
  privateChat: {
    _chatKey(chatId) { return `zamclub_pc_${chatId}`; },

    getOrCreate(otherUserId) {
      const me = ZAMApi.auth.currentUser();
      if (!me) return null;
      const pair   = [me.id, otherUserId].sort().join('_');
      const chatId = `pc_${pair}`;
      const chats  = _gLoad('private_chats', {});
      if (!chats[chatId]) {
        chats[chatId] = { id: chatId, participants: [me.id, otherUserId], created_at: _now() };
        _gSet('private_chats', chats);
      }
      return chatId;
    },

    getMessages(chatId) {
      try { return JSON.parse(localStorage.getItem(this._chatKey(chatId)) || '[]'); }
      catch { return []; }
    },

    sendMessage(chatId, text) {
      const me = ZAMApi.auth.currentUser();
      if (!me || !text.trim()) return null;
      const msg = {
        id: _uuid(), chat_id: chatId, sender_id: me.id,
        sender_name:     me.display_name || me.username || 'Ich',
        sender_initials: me.initials || '?',
        sender_avatar:   me.avatar_url || null,
        content: text.trim(), read_by_recipient: false, created_at: _now(),
      };
      const msgs = this.getMessages(chatId);
      msgs.push(msg);
      localStorage.setItem(this._chatKey(chatId), JSON.stringify(msgs.slice(-200)));

      // Notify the other participant
      const chats  = _gLoad('private_chats', {});
      const chat   = chats[chatId];
      if (chat) {
        const otherId = chat.participants.find(p => p !== me.id);
        if (otherId) {
          try {
            const oData  = JSON.parse(localStorage.getItem(_uKey(otherId)) || '{}');
            const unread = oData.pc_unread || {};
            unread[chatId] = (unread[chatId] || 0) + 1;
            oData.pc_unread = unread;
            const notifs = oData.notifications || [];
            notifs.unshift({
              id: _uuid(), type: 'private_message',
              title: `Neue Nachricht von ${msg.sender_name}`,
              body: text.trim().slice(0, 80),
              chat_id: chatId, sender_id: me.id, is_read: false, created_at: _now(),
            });
            oData.notifications = notifs.slice(0, 50);
            localStorage.setItem(_uKey(otherId), JSON.stringify(oData));
          } catch {}
        }
      }
      return msg;
    },

    markRead(chatId) {
      const me = ZAMApi.auth.currentUser();
      if (!me) return;
      const msgs = this.getMessages(chatId).map(m => ({
        ...m, read_by_recipient: m.sender_id !== me.id ? true : m.read_by_recipient,
      }));
      localStorage.setItem(this._chatKey(chatId), JSON.stringify(msgs));
      const unread = _s('pc_unread', {});
      delete unread[chatId];
      _set('pc_unread', unread);
    },

    unreadCount(chatId) { return (_s('pc_unread', {}))[chatId] || 0; },

    totalUnread() {
      return Object.values(_s('pc_unread', {})).reduce((a, b) => a + b, 0);
    },
  },

  // ──────────────────────────────────────────────────────────
  // NOTIFICATIONS (Phase 11 — Notification Center)
  // ──────────────────────────────────────────────────────────
  notifications: {
    // Legacy admin notifications (keep working)
    async list()         { return _s('notifications', []); },
    async markRead(id)   {
      const n = _s('notifications', []);
      const i = n.findIndex(x => x.id === id);
      if (i !== -1) { n[i].is_read = true; _set('notifications', n); }
    },
    async markAllRead()  { _set('notifications', _s('notifications', []).map(n => ({ ...n, is_read: true }))); },
    _add(title, body, type = 'info', actionUrl = null) {
      const n = _s('notifications', []);
      n.unshift({ id: _uuid(), title, body, type, action_url: actionUrl, is_read: false, created_at: _now() });
      _set('notifications', n.slice(0, 50));
    },

    // ── Settings ─────────────────────────────────────────────
    getSettings() {
      const uid = _uid();
      if (!uid) return {all:true,messages:true,nudges:true,events:true,deals:true,community:true,badges:true};
      return _uLoad(uid, 'notif_settings', {all:true,messages:true,nudges:true,events:true,deals:true,community:true,badges:true});
    },
    saveSettings(s) {
      const uid = _uid();
      if (uid) _uSet(uid, 'notif_settings', s);
    },

    // ── History ───────────────────────────────────────────────
    getAll() {
      const uid = _uid();
      return uid ? _uLoad(uid, 'notif_history', []) : [];
    },
    add(notif) {
      const uid = _uid();
      if (!uid) return;
      const h = _uLoad(uid, 'notif_history', []);
      h.unshift({...notif, id: notif.id || _notifUid(), read: false, createdAt: Date.now()});
      if (h.length > 100) h.splice(100);
      _uSet(uid, 'notif_history', h);
      _uSet(uid, 'notif_unread_count', (parseInt(_uLoad(uid, 'notif_unread_count', 0))||0) + 1);
    },
    markReadById(id) {
      const uid = _uid();
      if (!uid) return;
      const h = _uLoad(uid, 'notif_history', []);
      const n = h.find(x => x.id === id);
      if (n && !n.read) {
        n.read = true;
        _uSet(uid, 'notif_history', h);
        const c = Math.max(0, (parseInt(_uLoad(uid, 'notif_unread_count', 0))||0) - 1);
        _uSet(uid, 'notif_unread_count', c);
      }
    },
    markAllRead() {
      const uid = _uid();
      if (!uid) return;
      const h = _uLoad(uid, 'notif_history', []).map(n => ({...n, read: true}));
      _uSet(uid, 'notif_history', h);
      _uSet(uid, 'notif_unread_count', 0);
    },
    unreadCount() {
      const uid = _uid();
      return uid ? (parseInt(_uLoad(uid, 'notif_unread_count', 0))||0) : 0;
    },
    deleteById(id) {
      const uid = _uid();
      if (!uid) return;
      const h = _uLoad(uid, 'notif_history', []).filter(x => x.id !== id);
      _uSet(uid, 'notif_history', h);
    },
    clear() {
      const uid = _uid();
      if (!uid) return;
      _uSet(uid, 'notif_history', []);
      _uSet(uid, 'notif_unread_count', 0);
    },

    // ── Admin stats (global) ──────────────────────────────────
    recordSent(type) {
      const s = _gLoad('push_stats', {sent:0, opened:0, ignored:0, byType:{}});
      s.sent++; s.byType[type] = (s.byType[type]||0)+1;
      _gSet('push_stats', s);
    },
    recordOpened() {
      const s = _gLoad('push_stats', {sent:0, opened:0, ignored:0, byType:{}});
      s.opened++; _gSet('push_stats', s);
    },
    getAdminStats() { return _gLoad('push_stats', {sent:0, opened:0, ignored:0, byType:{}}); },
  },

  // ──────────────────────────────────────────────────────────
  // ANALYTICS (Phase 12)
  // ──────────────────────────────────────────────────────────
  analytics: {
    trackDealView(dealId, merchantId) { _track('deal_view', {dealId, merchantId}); },
    trackDealSave(dealId, merchantId) { _track('deal_save', {dealId, merchantId}); },
    trackDealRedeem(dealId, merchantId) { _track('deal_redeem', {dealId, merchantId}); },
    trackEventView(eventId, merchantId) { _track('event_view', {eventId, merchantId}); },
    trackEventJoin(eventId) { _track('event_join', {eventId}); },
    trackEventCheckin(eventId) { _track('event_checkin', {eventId}); },
    trackMerchantView(merchantId) { _track('merchant_view', {merchantId}); },
    trackPostView(postId) { _track('post_view', {postId}); },
    trackPostLike(postId) { _track('post_like', {postId}); },
    trackZoneVisit(zone) { _track('zone_visit', {zone}); },

    getAllEvents() {
      return JSON.parse(localStorage.getItem('zamclub_analytics') || '[]');
    },

    _since(days) { return Date.now() - days * 86400000; },
    _filter(type, since) {
      return this.getAllEvents().filter(e => e.type === type && e.t > since);
    },

    getMerchantStats(merchantId, days = 30) {
      const since = this._since(days);
      const all = this.getAllEvents().filter(e => e.t > since && e.merchantId === merchantId);
      return {
        profileViews:     all.filter(e => e.type === 'merchant_view').length,
        dealViews:        all.filter(e => e.type === 'deal_view').length,
        dealSaves:        all.filter(e => e.type === 'deal_save').length,
        dealRedemptions:  all.filter(e => e.type === 'deal_redeem').length,
        eventViews:       all.filter(e => e.type === 'event_view').length,
        eventJoins:       all.filter(e => e.type === 'event_join').length,
        eventCheckins:    all.filter(e => e.type === 'event_checkin').length,
      };
    },

    getDealStats(dealId, days = 30) {
      const since = this._since(days);
      const all = this.getAllEvents().filter(e => e.t > since && e.dealId === dealId);
      return {
        views:       all.filter(e => e.type === 'deal_view').length,
        saves:       all.filter(e => e.type === 'deal_save').length,
        redemptions: all.filter(e => e.type === 'deal_redeem').length,
      };
    },

    getEventStats(eventId, days = 90) {
      const since = this._since(days);
      const all = this.getAllEvents().filter(e => e.t > since && e.eventId === eventId);
      return {
        views:    all.filter(e => e.type === 'event_view').length,
        joins:    all.filter(e => e.type === 'event_join').length,
        checkins: all.filter(e => e.type === 'event_checkin').length,
      };
    },

    getCommunityStats(days = 30) {
      const since = this._since(days);
      const accounts = _gLoad('accounts', []);
      const recentAccounts = accounts.filter(a => a.createdAt > since);
      const allEvents = this.getAllEvents();
      const recentEvents = allEvents.filter(e => e.t > since);

      const activeUsers = new Set(recentEvents.map(e => e.userId).filter(Boolean)).size;

      const zoneVisits = {};
      recentEvents.filter(e => e.type === 'zone_visit').forEach(e => {
        zoneVisits[e.zone] = (zoneVisits[e.zone] || 0) + 1;
      });

      const dealViews = {};
      recentEvents.filter(e => e.type === 'deal_view').forEach(e => {
        if (e.dealId) dealViews[e.dealId] = (dealViews[e.dealId] || 0) + 1;
      });
      const topDeals = Object.entries(dealViews).sort((a,b)=>b[1]-a[1]).slice(0,5);

      const eventViews = {};
      recentEvents.filter(e => e.type === 'event_view').forEach(e => {
        if (e.eventId) eventViews[e.eventId] = (eventViews[e.eventId] || 0) + 1;
      });
      const topEvents = Object.entries(eventViews).sort((a,b)=>b[1]-a[1]).slice(0,5);

      const merchantViews = {};
      recentEvents.filter(e => e.type === 'merchant_view').forEach(e => {
        if (e.merchantId) merchantViews[e.merchantId] = (merchantViews[e.merchantId] || 0) + 1;
      });
      const topMerchants = Object.entries(merchantViews).sort((a,b)=>b[1]-a[1]).slice(0,5);

      const growth = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = Date.now() - i * 86400000;
        const dayEnd = dayStart + 86400000;
        const count = accounts.filter(a => a.createdAt >= dayStart && a.createdAt < dayEnd).length;
        const d = new Date(dayStart);
        growth.push({ label: `${d.getDate()}.${d.getMonth()+1}`, count });
      }

      return {
        totalUsers: accounts.length,
        newUsers: recentAccounts.length,
        activeUsers,
        totalEvents: allEvents.length,
        zoneVisits,
        topDeals,
        topEvents,
        topMerchants,
        growth,
      };
    },

    getZoneHeatmap() {
      const since = this._since(7);
      const events = this.getAllEvents().filter(e => e.t > since && e.type === 'zone_visit');
      const heat = {mk2_1: 0, mk2_2: 0, mk2_3: 0, mk2_4: 0, plaza: 0};
      events.forEach(e => { if (heat[e.zone] !== undefined) heat[e.zone]++; });
      return heat;
    },

    seedDemo() {
      const key = 'zamclub_analytics';
      if (localStorage.getItem(key + '_seeded')) return;
      const zones = ['mk2_1','mk2_2','mk2_3','mk2_4','plaza'];
      const merchants = ['m1','m2','m3','m4','m5'];
      const deals = ['d1','d2','d3','d4','d5'];
      const events = ['ev1','ev2','ev3'];
      const now = Date.now();
      const seed = [];
      for (let i = 0; i < 200; i++) {
        const daysAgo = Math.floor(Math.random() * 30);
        const t = now - daysAgo * 86400000 - Math.random() * 3600000;
        const types = ['zone_visit','deal_view','deal_save','deal_redeem','event_view','event_join','merchant_view','post_like'];
        const type = types[Math.floor(Math.random() * types.length)];
        const zone = zones[Math.floor(Math.random() * zones.length)];
        const merchantId = merchants[Math.floor(Math.random() * merchants.length)];
        const dealId = deals[Math.floor(Math.random() * deals.length)];
        const eventId = events[Math.floor(Math.random() * events.length)];
        seed.push({ t, type, zone, merchantId, dealId, eventId });
      }
      localStorage.setItem(key, JSON.stringify(seed));
      localStorage.setItem(key + '_seeded', '1');
    },
  },

  // ──────────────────────────────────────────────────────────
  // VOUCHERS (Phase 12)
  // ──────────────────────────────────────────────────────────
  vouchers: {
    generate(dealId, userId) {
      const code = 'ZAM-' + Math.random().toString(36).slice(2,6).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
      const vouchers = _gLoad('vouchers', []);
      const v = {
        id: Date.now().toString(36),
        code,
        dealId,
        userId,
        createdAt: Date.now(),
        redeemedAt: null,
        status: 'active',
      };
      vouchers.push(v);
      _gSet('vouchers', vouchers);
      return v;
    },
    getMyVouchers() {
      const me = ZAMApi.auth.currentUser();
      if (!me) return [];
      return _gLoad('vouchers', []).filter(v => v.userId === me.id);
    },
    redeem(code) {
      const vouchers = _gLoad('vouchers', []);
      const v = vouchers.find(x => x.code === code && x.status === 'active');
      if (!v) return {ok: false, error: 'Ungültiger oder bereits eingelöster Code'};
      v.status = 'redeemed';
      v.redeemedAt = Date.now();
      _gSet('vouchers', vouchers);
      ZAMApi.analytics.trackDealRedeem(v.dealId, null);
      return {ok: true, voucher: v};
    },
    getAll() { return _gLoad('vouchers', []); },
  },

  // ──────────────────────────────────────────────────────────
  // PUSH (Phase 11)
  // ──────────────────────────────────────────────────────────
  push: {
    async requestPermission() {
      if (!('Notification' in window)) return 'unsupported';
      if (Notification.permission === 'granted') return 'granted';
      if (Notification.permission === 'denied') return 'denied';
      const result = await Notification.requestPermission();
      return result;
    },
    getPermission() {
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission;
    },
    async register() {
      if (!('serviceWorker' in navigator)) return null;
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        return reg;
      } catch(e) { console.warn('SW register failed', e); return null; }
    },
    async send(title, body, options = {}) {
      const settings = ZAMApi.notifications.getSettings();
      const typeMap = {message:'messages', nudge:'nudges', event:'events', deal:'deals', badge:'badges', community:'community'};
      const settingKey = typeMap[options.type] || 'all';
      if (!settings.all || settings[settingKey] === false) return;
      ZAMApi.notifications.recordSent(options.type || 'info');
      ZAMApi.notifications.add({
        type: options.type || 'info',
        title, body,
        url: options.url || '/',
      });
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg) {
        reg.showNotification(title, {
          body, icon: '/assets/zam-map.jpg',
          tag: options.tag || 'zam',
          data: {url: options.url || '/', type: options.type},
          vibrate: [200, 100, 200],
        });
      } else {
        new Notification(title, {body, icon: '/assets/zam-map.jpg'});
      }
    },
  },
};

// ── Analytics Tracking Helper ─────────────────────────────────
function _track(eventType, data) {
  const key = 'zamclub_analytics';
  const events = JSON.parse(localStorage.getItem(key) || '[]');
  events.push({ t: Date.now(), type: eventType, ...data });
  if (events.length > 1000) events.splice(0, events.length - 1000);
  localStorage.setItem(key, JSON.stringify(events));
}

// ── Hilfsfunktionen ───────────────────────────────────────────
function _updateGlobalStatus(pendingKey, listKey, itemId, status, reason = '') {
  const pending = _gLoad(pendingKey, []);
  const pi = pending.findIndex(i => i.id === itemId);
  if (pi !== -1) { pending[pi].status = status; if (reason) pending[pi].reject_reason = reason; }
  _gSet(pendingKey, pending);
  if (listKey) {
    const list = _gLoad(listKey, []);
    const li = list.findIndex(i => i.id === itemId);
    if (li !== -1) { list[li].status = status; _gSet(listKey, list); }
  }
}

function _addAdminNotif(title, body, type = 'info', refId = null) {
  const notifs = _gLoad('admin_notifications', []);
  notifs.unshift({ id: _uuid(), title, body, type, ref_id: refId, is_read: false, created_at: _now() });
  _gSet('admin_notifications', notifs.slice(0, 100));
}

function _markAdminNotifHandled(type, refId) {
  const notifs = _gLoad('admin_notifications', []);
  notifs.forEach(n => { if (n.type === type && n.ref_id === refId) n.is_read = true; });
  _gSet('admin_notifications', notifs);
}

function _levelLabel(level) {
  return { bronze: 'Bronze Member', silver: 'Silber Member', gold: 'Gold Member', platinum: 'Platin Member' }[level] || 'Member';
}

// ──────────────────────────────────────────────────────────
// PRIVACY (Phase 13)
// ──────────────────────────────────────────────────────────
ZAMApi.privacy = {
  getSettings() {
    const uid = _uid();
    if (!uid) return { showOnMap: true, showStatus: true, allowNudges: true };
    const u = _uLoad(uid);
    return u.privacy || { showOnMap: true, showStatus: true, allowNudges: true };
  },
  saveSettings(settings) {
    const uid = _uid();
    if (!uid) return;
    const u = _uLoad(uid);
    u.privacy = { ...this.getSettings(), ...settings };
    _uSave(uid, u);
  },
  canSeeOnMap(userId) {
    if (!userId) return false;
    const u = _uLoad(userId);
    const priv = u.privacy || {};
    if (priv.showOnMap === false) return false;
    if (ZAMApi.connections.isBlocked(userId)) return false;
    return true;
  },
};

window.ZAMApi = ZAMApi;
window._levelLabel = _levelLabel;
