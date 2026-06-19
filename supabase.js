/**
 * ZAM Club — Supabase Client Konfiguration
 * ============================================================
 * SETUP:
 *   1. Supabase-Projekt anlegen: https://supabase.com/dashboard
 *   2. Settings → API → URL und anon key kopieren
 *   3. SUPABASE_URL und SUPABASE_ANON_KEY unten eintragen
 *   4. SQL-Migrationen ausführen: supabase/01_schema.sql bis 04_seed.sql
 *
 * MODUS:
 *   - Leer gelassen → App läuft weiterhin mit localStorage (Demo-Modus)
 *   - Ausgefüllt     → App nutzt echtes Supabase-Backend
 * ============================================================
 */

'use strict';

const SUPABASE_URL      = ''; // 'https://DEIN-PROJEKT.supabase.co'
const SUPABASE_ANON_KEY = ''; // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

// ── Modus-Flag ────────────────────────────────────────────────
// 'supabase' = echtes Backend | 'localStorage' = Demo-Modus
window._sbMode    = 'localStorage';
window._sb        = null;
window._sbSession = null; // gecachte Supabase-Session (synchron lesbar)

// ── Initialisierung ───────────────────────────────────────────
(function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.info('[ZAM] Supabase nicht konfiguriert — Demo-Modus (localStorage) aktiv.');
    return;
  }

  // Supabase SDK muss vor diesem Script geladen sein (via index.html)
  if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
    console.error('[ZAM] Supabase SDK nicht gefunden. Prüfe index.html Script-Reihenfolge.');
    return;
  }

  try {
    window._sb   = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken:    true,
        persistSession:      true,
        detectSessionInUrl:  true,
        storageKey:          'zam_sb_session',
      },
    });
    window._sbMode = 'supabase';

    // Session beim Start laden und cachen
    window._sb.auth.getSession().then(({ data, error }) => {
      if (error) { console.warn('[ZAM] Session-Fehler:', error.message); return; }
      window._sbSession = data.session ? _mapSbUser(data.session.user) : null;
      console.info('[ZAM] Supabase-Modus aktiv.', window._sbSession ? 'Eingeloggt als: ' + window._sbSession.email : 'Nicht eingeloggt.');
    });

    // Auth-State-Änderungen verfolgen (Login, Logout, Token-Refresh)
    window._sb.auth.onAuthStateChange((event, session) => {
      window._sbSession = session ? _mapSbUser(session.user) : null;

      if (event === 'SIGNED_IN' && window._sbSession) {
        // Vollständiges Profil aus users-Tabelle nachladen
        _loadFullProfile(session.user.id);
      }
      if (event === 'SIGNED_OUT') {
        window._sbSession = null;
      }
    });

  } catch (err) {
    console.error('[ZAM] Supabase-Initialisierung fehlgeschlagen:', err);
    window._sbMode = 'localStorage';
    window._sb     = null;
  }
})();

// ── Hilfsfunktionen ───────────────────────────────────────────

/**
 * Supabase-User-Objekt auf ZAM-Profil-Format mappen.
 * Basis-Info kommt aus auth.users, vollständige Profil-Daten aus public.users.
 */
function _mapSbUser(sbUser) {
  if (!sbUser) return null;
  const meta = sbUser.user_metadata || {};
  return {
    id:                     sbUser.id,
    email:                  sbUser.email,
    display_name:           meta.display_name || sbUser.email.split('@')[0],
    username:               meta.username     || ('@' + sbUser.email.split('@')[0]),
    initials:               meta.initials     || (sbUser.email.slice(0,2).toUpperCase()),
    avatar_url:             meta.avatar_url   || null,
    role:                   meta.role         || 'user',
    merchant_status:        meta.merchant_status || null,
    level:                  meta.tier         || 'bronze',
    points:                 meta.points       || 0,
    member_since_formatted: 'Mitglied seit ' + new Date(sbUser.created_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
    stats:                  meta.stats        || { visits: 0, events_attended: 0, deals_used: 0 },
    _source: 'supabase',
  };
}

/**
 * Vollständiges Profil aus public.users laden und _sbSession aktualisieren.
 * Wird nach Login aufgerufen, um role, points, tier etc. aus der DB zu holen.
 */
async function _loadFullProfile(userId) {
  if (!window._sb) return;
  try {
    const { data, error } = await window._sb
      .from('users')
      .select('id, email, display_name, username, initials, avatar_url, role, merchant_status, points, tier, created_at, stats')
      .eq('id', userId)
      .single();

    if (error || !data) return;

    window._sbSession = {
      id:                     data.id,
      email:                  data.email,
      display_name:           data.display_name,
      username:               data.username,
      initials:               data.initials,
      avatar_url:             data.avatar_url,
      role:                   data.role,
      merchant_status:        data.merchant_status,
      level:                  data.tier,
      points:                 data.points,
      member_since_formatted: 'Mitglied seit ' + new Date(data.created_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
      stats:                  data.stats || { visits: 0, events_attended: 0, deals_used: 0 },
      _source: 'supabase',
    };

    // ZAMData ebenfalls aktualisieren
    if (typeof ZAMData !== 'undefined') {
      ZAMData.currentUser = { ...ZAMData.currentUser, ...window._sbSession };
    }

    // App neu rendern falls bereits sichtbar
    if (typeof renderAll === 'function') {
      try { renderAll(); } catch {}
    }
  } catch (err) {
    console.warn('[ZAM] Profil-Laden fehlgeschlagen:', err);
  }
}

// ── Öffentliche Helfer (für api.js und app.js) ────────────────

/** Gibt true zurück wenn Supabase aktiv ist */
window._sbActive = () => window._sbMode === 'supabase' && window._sb !== null;

/** Wirft Fehler in lesbarem Format */
window._sbError = (error) => {
  const map = {
    'Invalid login credentials':     'E-Mail oder Passwort falsch.',
    'Email not confirmed':            'Bitte bestätige zuerst deine E-Mail-Adresse.',
    'User already registered':        'Diese E-Mail-Adresse ist bereits registriert.',
    'Password should be at least 6':  'Passwort muss mindestens 6 Zeichen lang sein.',
    'Rate limit exceeded':            'Zu viele Versuche. Bitte warte einige Minuten.',
    'Email rate limit exceeded':      'Zu viele E-Mail-Anfragen. Bitte warte.',
  };
  const msg = error?.message || 'Unbekannter Fehler.';
  for (const [key, val] of Object.entries(map)) {
    if (msg.includes(key)) return new Error(val);
  }
  return new Error(msg);
};
