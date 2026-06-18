/**
 * ZAM Club — Security Layer v1
 * ============================================================
 * Sicherheitsfunktionen für die Produktionsvorbereitung.
 *
 * HINWEIS: Diese Datei implementiert Sicherheitslogik, die im
 * Demo-Modus (localStorage) so weit wie möglich greift.
 * Für echten Produktivbetrieb MUSS ein Backend (z. B. Supabase)
 * alle kritischen Checks serverseitig wiederholen.
 * Kommentare mit [BACKEND] markieren, was serverseitig gehört.
 * ============================================================
 */

'use strict';

const ZAMSecurity = (() => {

  // ── Konstanten ───────────────────────────────────────────────
  const AUDIT_KEY   = 'zam_audit_log';
  const FRAUD_KEY   = 'zam_fraud_flags';
  const CONSENT_KEY = 'zam_consent';
  const RATE_KEY    = 'zam_rate_limits';
  const SESSION_SIG_KEY = 'zam_session_sig';

  // Maximale Einträge im Audit-Log (localStorage-Schutz)
  const MAX_AUDIT   = 500;
  const MAX_FRAUD   = 200;

  // Salz-Prefix für Passwort-Hashing (Demo; [BACKEND] Argon2/bcrypt serverseitig)
  const HASH_ITERATIONS = 100000;
  const HASH_ALGO       = 'PBKDF2';

  // ── Interner Speicher-Helfer ──────────────────────────────────
  function _load(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }
  function _save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  // ── PBKDF2 Passwort-Hashing (SubtleCrypto) ───────────────────
  // [BACKEND] In Produktion: Argon2id oder bcrypt serverseitig
  async function hashPassword(password) {
    if (!window.crypto?.subtle) {
      // Fallback: einfaches Base64 wenn SubtleCrypto nicht verfügbar (sollte nicht vorkommen)
      return 'plain:' + btoa(unescape(encodeURIComponent(password)));
    }
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const enc  = new TextEncoder();
    const key  = await window.crypto.subtle.importKey(
      'raw', enc.encode(password), HASH_ALGO, false, ['deriveBits']
    );
    const bits = await window.crypto.subtle.deriveBits(
      { name: HASH_ALGO, salt, iterations: HASH_ITERATIONS, hash: 'SHA-256' },
      key, 256
    );
    const hashArr = Array.from(new Uint8Array(bits));
    const saltArr = Array.from(salt);
    return 'pbkdf2:' + saltArr.map(b => b.toString(16).padStart(2,'0')).join('')
                     + ':' + hashArr.map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function verifyPassword(password, stored) {
    if (!stored) return false;
    if (stored.startsWith('plain:')) {
      // Legacy plain-text (nur Demo-Konten vor Migration)
      return btoa(unescape(encodeURIComponent(password))) === stored.slice(6);
    }
    if (!stored.startsWith('pbkdf2:')) {
      // Älteste Konten hatten Klartext — direkte Prüfung für Einmal-Migration
      return password === stored;
    }
    if (!window.crypto?.subtle) return false;
    const parts   = stored.split(':');
    if (parts.length !== 3) return false;
    const saltHex = parts[1];
    const salt    = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const enc     = new TextEncoder();
    const key     = await window.crypto.subtle.importKey(
      'raw', enc.encode(password), HASH_ALGO, false, ['deriveBits']
    );
    const bits    = await window.crypto.subtle.deriveBits(
      { name: HASH_ALGO, salt, iterations: HASH_ITERATIONS, hash: 'SHA-256' },
      key, 256
    );
    const hashArr = Array.from(new Uint8Array(bits));
    const newHash = hashArr.map(b => b.toString(16).padStart(2,'0')).join('');
    return newHash === parts[2];
  }

  // ── Session-Integritätsprüfung ────────────────────────────────
  // Schützt vor einfacher devtools-Manipulation des session_user
  // [BACKEND] Echte Lösung: JWT-Session vom Server signiert
  function _sessionSig(user) {
    if (!user) return '';
    // Nur sicherheitsrelevante Felder einbeziehen
    const str = [user.id, user.role, user.email, user.merchant_status || ''].join('|');
    // Einfacher Hash (kein kryptografischer Schutz, aber erkennt naives Editieren)
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  function signSession(user) {
    if (!user) return;
    const sig = _sessionSig(user);
    sessionStorage.setItem(SESSION_SIG_KEY, sig);
  }

  function verifySession(user) {
    if (!user) return false;
    const stored = sessionStorage.getItem(SESSION_SIG_KEY);
    if (!stored) {
      // Erste Prüfung nach Seitenladung — Signatur anlegen
      signSession(user);
      return true;
    }
    return stored === _sessionSig(user);
  }

  // ── Rate Limiting ─────────────────────────────────────────────
  // [BACKEND] Serverseitiges Rate-Limiting nach IP + User-ID
  const rateLimit = {
    check(key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
      const all   = _load(RATE_KEY, {});
      const now   = Date.now();
      const entry = all[key] || { attempts: 0, firstAt: now, blockedUntil: 0 };

      if (entry.blockedUntil && now < entry.blockedUntil) {
        const remaining = Math.ceil((entry.blockedUntil - now) / 1000);
        return { allowed: false, remaining, message: `Zu viele Versuche. Bitte ${remaining}s warten.` };
      }

      // Fenster zurücksetzen
      if (now - entry.firstAt > windowMs) {
        entry.attempts = 0;
        entry.firstAt  = now;
        entry.blockedUntil = 0;
      }

      entry.attempts++;
      if (entry.attempts > maxAttempts) {
        entry.blockedUntil = now + windowMs;
        entry.attempts     = 0;
        all[key] = entry;
        _save(RATE_KEY, all);
        const sec = Math.ceil(windowMs / 1000);
        return { allowed: false, remaining: sec, message: `Zu viele Versuche. Bitte ${sec}s warten.` };
      }

      all[key] = entry;
      _save(RATE_KEY, all);
      return { allowed: true, attemptsLeft: maxAttempts - entry.attempts };
    },

    reset(key) {
      const all = _load(RATE_KEY, {});
      delete all[key];
      _save(RATE_KEY, all);
    }
  };

  // ── Audit-Log ─────────────────────────────────────────────────
  // [BACKEND] Supabase: INSERT INTO audit_logs (actor_id, action, meta, created_at)
  const auditLog = {
    add(action, meta = {}) {
      const user  = (typeof ZAMApi !== 'undefined') ? ZAMApi.auth.currentUser() : null;
      const entry = {
        id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        actor_id:  user?.id || 'anonymous',
        actor_name:user?.display_name || '–',
        action,
        meta,
        ts:        new Date().toISOString(),
        ua:        navigator.userAgent.slice(0, 80),
      };
      let log = _load(AUDIT_KEY, []);
      log.unshift(entry);
      if (log.length > MAX_AUDIT) log = log.slice(0, MAX_AUDIT);
      _save(AUDIT_KEY, log);
      return entry;
    },

    get(limit = 50, filterAction = null) {
      const log = _load(AUDIT_KEY, []);
      return (filterAction ? log.filter(e => e.action === filterAction) : log).slice(0, limit);
    },

    getForUser(userId, limit = 50) {
      return _load(AUDIT_KEY, []).filter(e => e.actor_id === userId).slice(0, limit);
    }
  };

  // ── Betrugsschutz / Fraud Detection ──────────────────────────
  // [BACKEND] ML-Anomalie-Erkennung + Manuelle Review-Queue
  const fraud = {
    THRESHOLDS: {
      checkins_per_day:   10,   // max. Check-ins pro Tag
      points_per_day:     500,  // max. Punkte pro Tag
      qr_scans_per_hour:  20,   // max. QR-Scans pro Stunde
      spin_per_day:       1,    // max. Glücksrad pro Tag
    },

    _getFlags() { return _load(FRAUD_KEY, {}); },
    _saveFlags(f) { _save(FRAUD_KEY, f); },

    flag(userId, reason, severity = 'low') {
      const flags = this._getFlags();
      if (!flags[userId]) flags[userId] = { flags: [], flaggedAt: new Date().toISOString(), count: 0 };
      flags[userId].flags.push({ reason, severity, ts: new Date().toISOString() });
      flags[userId].count++;
      if (severity === 'high') flags[userId].blocked = true;
      this._saveFlags(flags);
      auditLog.add('fraud_flag', { userId, reason, severity });
    },

    isFlagged(userId) {
      const f = this._getFlags()[userId];
      return f ? { flagged: true, blocked: !!f.blocked, count: f.count, flags: f.flags } : { flagged: false };
    },

    check(userId, action, value = 1) {
      const today    = new Date().toISOString().slice(0, 10);
      const hourKey  = new Date().toISOString().slice(0, 13);
      const log      = _load(AUDIT_KEY, []);

      if (action === 'checkin') {
        const todayCount = log.filter(e => e.actor_id === userId && e.action === 'checkin' && e.ts.startsWith(today)).length;
        if (todayCount > this.THRESHOLDS.checkins_per_day) {
          this.flag(userId, 'Zu viele Check-ins heute: ' + todayCount, 'medium');
          return { blocked: false, warn: true, reason: 'Ungewöhnlich viele Check-ins' };
        }
      }

      if (action === 'points_add') {
        const todayPts = log.filter(e => e.actor_id === userId && e.action === 'points_add' && e.ts.startsWith(today))
                           .reduce((s, e) => s + (e.meta?.amount || 0), 0);
        if (todayPts + value > this.THRESHOLDS.points_per_day) {
          this.flag(userId, `Punktelimit überschritten: ${todayPts + value}`, 'medium');
          return { blocked: false, warn: true, reason: 'Tägliches Punktelimit fast erreicht' };
        }
      }

      if (action === 'qr_scan') {
        const hourCount = log.filter(e => e.actor_id === userId && e.action === 'qr_scan' && e.ts.startsWith(hourKey)).length;
        if (hourCount > this.THRESHOLDS.qr_scans_per_hour) {
          this.flag(userId, 'Zu viele QR-Scans: ' + hourCount, 'high');
          return { blocked: true, reason: 'Verdächtige QR-Scan-Aktivität' };
        }
      }

      if (action === 'spin') {
        const todaySpin = log.filter(e => e.actor_id === userId && e.action === 'spin' && e.ts.startsWith(today)).length;
        if (todaySpin >= this.THRESHOLDS.spin_per_day) {
          return { blocked: true, reason: 'Spin bereits heute genutzt' };
        }
      }

      return { blocked: false, warn: false };
    },

    // Admin: Liste aller verdächtigen Nutzer
    getReport() {
      const flags = this._getFlags();
      return Object.entries(flags).map(([uid, data]) => ({ userId: uid, ...data }))
        .sort((a, b) => b.count - a.count);
    }
  };

  // ── DSGVO-Einwilligungsverwaltung ─────────────────────────────
  const consent = {
    get() {
      return _load(CONSENT_KEY, {
        location: false,
        push:     false,
        analytics:false,
        accepted_at: null,
        version:  '1.0',
      });
    },

    set(key, value) {
      const c = this.get();
      c[key]       = value;
      c.updated_at = new Date().toISOString();
      _save(CONSENT_KEY, c);
      auditLog.add('consent_change', { key, value });
    },

    hasAccepted() {
      return !!this.get().accepted_at;
    },

    acceptAll() {
      const c = this.get();
      c.location   = true;
      c.push       = true;
      c.analytics  = true;
      c.accepted_at= new Date().toISOString();
      _save(CONSENT_KEY, c);
      auditLog.add('consent_accept_all', {});
    },

    rejectAll() {
      _save(CONSENT_KEY, {
        location: false, push: false, analytics: false,
        accepted_at: new Date().toISOString(),
        rejected: true, version: '1.0',
      });
      auditLog.add('consent_reject_all', {});
    }
  };

  // ── Eingabe-Sanitisierung ─────────────────────────────────────
  function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#x27;').replace(/\//g,'&#x2F;');
  }

  // Maximale Feldlängen prüfen
  function validateInput(value, { maxLen = 255, minLen = 0, pattern = null } = {}) {
    if (typeof value !== 'string') return { valid: false, error: 'Ungültiger Wert' };
    if (value.length < minLen) return { valid: false, error: `Mindestens ${minLen} Zeichen` };
    if (value.length > maxLen) return { valid: false, error: `Maximal ${maxLen} Zeichen` };
    if (pattern && !pattern.test(value)) return { valid: false, error: 'Ungültiges Format' };
    return { valid: true };
  }

  // ── Punkte-Integritäts-Hash ───────────────────────────────────
  // Vereinfachte Hash-Kette zum Erkennen von manuellen Eingriffen
  // [BACKEND] In Produktion: serverseitig signierte Punkte-Transaktionen
  function hashPointsEntry(entry, previousHash = '') {
    const str = previousHash + entry.id + entry.points + entry.action + entry.created_at;
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  function verifyPointsLog(log) {
    if (!log || log.length === 0) return true;
    let prev = '';
    for (const entry of [...log].reverse()) {
      if (entry._hash) {
        const expected = hashPointsEntry(entry, prev);
        if (entry._hash !== expected) return false;
      }
      prev = entry._hash || '';
    }
    return true;
  }

  // ── Account-Löschung (DSGVO Art. 17) ─────────────────────────
  function deleteAccount(userId) {
    if (!userId) return { ok: false, error: 'Keine User-ID' };
    // [BACKEND] Supabase: DELETE FROM users WHERE id = userId (CASCADE)

    auditLog.add('account_deletion', { userId, ts: new Date().toISOString() });

    // 1. Session beenden
    const g = JSON.parse(localStorage.getItem('zamclub_global') || '{}');
    g.session_user = null;

    // 2. Aus Accounts-Registry entfernen
    if (g.accounts) g.accounts = g.accounts.filter(a => a.profile?.id !== userId && a.id !== userId);
    localStorage.setItem('zamclub_global', JSON.stringify(g));

    // 3. Nutzerdaten löschen
    localStorage.removeItem('zamclub_u_' + userId);

    // 4. Consent-Daten löschen
    localStorage.removeItem(CONSENT_KEY);

    return { ok: true };
  }

  // ── CSP / Security-Meta (für index.html) ─────────────────────
  function injectSecurityHeaders() {
    // Content Security Policy als Meta-Tag (HTTP-Header bevorzugt in Produktion)
    if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
      const csp = document.createElement('meta');
      csp.httpEquiv = 'Content-Security-Policy';
      // Erlaubt: eigene Origin, QR-Code-API für QR-Bilder, Inline-Scripts (für Demo-SPA nötig)
      csp.content = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https://api.qrserver.com blob:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
      ].join('; ');
      document.head.insertBefore(csp, document.head.firstChild);
    }

    // Clickjacking-Schutz
    if (!document.querySelector('meta[http-equiv="X-Frame-Options"]')) {
      const xfo = document.createElement('meta');
      xfo.httpEquiv = 'X-Frame-Options';
      xfo.content   = 'DENY';
      document.head.appendChild(xfo);
    }
  }

  // ── Öffentliche API ───────────────────────────────────────────
  return {
    hashPassword,
    verifyPassword,
    signSession,
    verifySession,
    rateLimit,
    auditLog,
    fraud,
    consent,
    sanitize,
    validateInput,
    hashPointsEntry,
    verifyPointsLog,
    deleteAccount,
    injectSecurityHeaders,

    // Berechtigungsprüfungen
    can: {
      // Darf der aktuelle Nutzer auf einen bestimmten User-Datensatz schreiben?
      editUser(targetUserId) {
        const me = (typeof ZAMApi !== 'undefined') ? ZAMApi.auth.currentUser() : null;
        if (!me) return false;
        return me.id === targetUserId || me.role === 'admin';
      },
      // Darf der aktuelle Nutzer Händlerdaten lesen?
      accessMerchantData(merchantId) {
        const me = (typeof ZAMApi !== 'undefined') ? ZAMApi.auth.currentUser() : null;
        if (!me) return false;
        return me.id === merchantId || me.role === 'admin';
      },
      // Darf der aktuelle Nutzer Admin-Aktionen ausführen?
      adminAction() {
        const me = (typeof ZAMApi !== 'undefined') ? ZAMApi.auth.currentUser() : null;
        return me?.role === 'admin';
      },
      // Ist die Einwilligung für Standort vorhanden?
      useLocation() {
        return ZAMSecurity.consent.get().location;
      },
      // Ist die Einwilligung für Push vorhanden?
      usePush() {
        return ZAMSecurity.consent.get().push;
      }
    },

    // Sicherheits-Status für Admin-Panel
    getStatus() {
      const fraudReport = fraud.getReport();
      const auditCount  = (_load(AUDIT_KEY, [])).length;
      const rateData    = _load(RATE_KEY, {});
      const blockedKeys = Object.entries(rateData).filter(([,v]) => v.blockedUntil && Date.now() < v.blockedUntil);
      return {
        auditEntries: auditCount,
        fraudFlagged: fraudReport.length,
        fraudBlocked: fraudReport.filter(f => f.blocked).length,
        rateLimitedKeys: blockedKeys.length,
        consentAccepted: consent.hasAccepted(),
      };
    }
  };
})();
