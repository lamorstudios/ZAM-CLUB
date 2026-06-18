/**
 * ZAM Club — Erweiterungsmodul
 * Phase: Produktionsreife / Sicherheit / Statistiken
 * Alle Funktionen localStorage-basiert, Supabase-ready
 */
'use strict';

// ============================================================
// 1. SICHERES QR- & GUTSCHEINSYSTEM (Enhanced)
// ============================================================
const ZAMVouchers = (() => {
  const KEY = 'zam_secure_vouchers';

  function _load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
  function _save(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  function _hex(n) { return Math.random().toString(16).slice(2, 2 + n).toUpperCase(); }

  function generate({ userId, merchantId, type = 'reward', challengeId = null, dealId = null, description = '', points = 0, expiryDays = 14 }) {
    const now = Date.now();
    const exp = new Date(now + expiryDays * 86400000).toISOString();
    const token = _hex(4) + '-' + _hex(4) + '-' + _hex(4);
    const id = 'vchr_' + now.toString(36) + Math.random().toString(36).slice(2, 6);
    const voucher = { id, token, userId, merchantId, type, challengeId, dealId, description, points, status: 'active', createdAt: new Date(now).toISOString(), expiresAt: exp, redeemedAt: null, redeemedBy: null };
    const all = _load();
    all.unshift(voucher);
    _save(all.slice(0, 500));
    return voucher;
  }

  function verify(token, merchantId) {
    const all = _load();
    const v = all.find(x => x.token === token);
    if (!v) return { ok: false, status: 'invalid', message: 'Ungültiger Code' };
    if (v.status === 'redeemed') return { ok: false, status: 'redeemed', message: 'Bereits eingelöst', voucher: v };
    if (v.status === 'expired' || new Date(v.expiresAt) < new Date()) {
      v.status = 'expired'; _save(all);
      return { ok: false, status: 'expired', message: 'Abgelaufen', voucher: v };
    }
    if (merchantId && v.merchantId && v.merchantId !== merchantId) return { ok: false, status: 'invalid', message: 'Nicht für diesen Händler' };
    return { ok: true, status: 'valid', voucher: v };
  }

  function redeem(token, merchantId, redeemedBy) {
    const result = verify(token, merchantId);
    if (!result.ok) return result;
    const all = _load();
    const v = all.find(x => x.token === token);
    v.status = 'redeemed';
    v.redeemedAt = new Date().toISOString();
    v.redeemedBy = redeemedBy || merchantId;
    _save(all);
    return { ok: true, voucher: v };
  }

  function getForUser(userId) { return _load().filter(v => v.userId === userId); }
  function getForMerchant(merchantId) { return _load().filter(v => v.merchantId === merchantId); }
  function getAll() { return _load(); }

  return { generate, verify, redeem, getForUser, getForMerchant, getAll };
})();

// ─── Merchant Reward Scanner UI ─────────────────────────────
function openSecureRewardScanner() {
  let modal = document.getElementById('modal-secure-scanner');
  if (modal) { modal.classList.add('open'); _scannerReset(); return; }
  modal = document.createElement('div');
  modal.id = 'modal-secure-scanner';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:88vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="font-size:1rem;font-weight:800;color:#F7AB00">🎁 Gutschein einlösen</div>
        <button onclick="closeModal('modal-secure-scanner')" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:1.4rem;cursor:pointer;padding:0">×</button>
      </div>
      <div id="scanner-status" style="display:none;border-radius:12px;padding:14px 16px;margin-bottom:14px;font-size:0.82rem;font-weight:700;text-align:center"></div>
      <div style="position:relative">
        <input id="scanner-token-input" type="text" placeholder="Code eingeben  z.B. A1B2-C3D4-E5F6" maxlength="14"
          style="width:100%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.15);border-radius:12px;padding:14px 48px 14px 16px;color:#fff;font-size:0.88rem;font-family:var(--font);box-sizing:border-box;letter-spacing:0.05em;text-transform:uppercase"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-F0-9-]/g,'')" />
        <span style="position:absolute;right:14px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.25);font-size:1rem">🔍</span>
      </div>
      <div id="scanner-voucher-detail" style="display:none;background:rgba(247,171,0,0.06);border:1px solid rgba(247,171,0,0.25);border-radius:14px;padding:16px;margin-top:14px"></div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button onclick="_scannerCheck()" style="flex:1;background:linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05));border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:12px;padding:13px;font-size:0.85rem;font-weight:700;font-family:var(--font);cursor:pointer">Prüfen</button>
        <button id="btn-scanner-redeem" onclick="_scannerRedeem()" style="display:none;flex:2;background:linear-gradient(135deg,#c43510,#FA4615);border:none;color:#fff;border-radius:12px;padding:13px;font-size:0.85rem;font-weight:800;font-family:var(--font);cursor:pointer;box-shadow:0 4px 14px rgba(196,53,16,0.4)">✅ Einlösen & Punkte vergeben</button>
      </div>
      <div style="margin-top:10px;font-size:0.68rem;color:rgba(255,255,255,0.25);text-align:center">Jeder Code ist nur einmal einlösbar · Screenshots ungültig</div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-secure-scanner'); });
  modal.classList.add('open');
  setTimeout(() => document.getElementById('scanner-token-input')?.focus(), 300);
}

function _scannerReset() {
  const inp = document.getElementById('scanner-token-input');
  const det = document.getElementById('scanner-voucher-detail');
  const st  = document.getElementById('scanner-status');
  const rb  = document.getElementById('btn-scanner-redeem');
  if (inp) inp.value = '';
  if (det) { det.style.display = 'none'; det.innerHTML = ''; }
  if (st)  { st.style.display = 'none'; st.innerHTML = ''; }
  if (rb)  rb.style.display = 'none';
}

function _scannerCheck() {
  const token = (document.getElementById('scanner-token-input')?.value || '').trim();
  const st  = document.getElementById('scanner-status');
  const det = document.getElementById('scanner-voucher-detail');
  const rb  = document.getElementById('btn-scanner-redeem');
  if (!token || token.length < 8) { _scannerSetStatus('Bitte vollständigen Code eingeben', 'warn'); return; }
  const me = ZAMApi.auth.currentUser();
  const result = ZAMVouchers.verify(token, me?.id);
  if (!result.ok) {
    const colors = { redeemed: '#f59e0b', expired: '#64748b', invalid: '#ef4444' };
    const icons  = { redeemed: '🔄', expired: '⌛', invalid: '❌' };
    _scannerSetStatus(`${icons[result.status] || '⚠️'} ${result.message}`, result.status);
    if (result.voucher) _scannerShowDetail(result.voucher, false);
    if (rb) rb.style.display = 'none';
    return;
  }
  _scannerSetStatus('✅ Gültig — bereit zum Einlösen', 'valid');
  _scannerShowDetail(result.voucher, true);
  if (rb) rb.style.display = '';
}

function _scannerSetStatus(msg, type) {
  const st = document.getElementById('scanner-status');
  if (!st) return;
  const bg = { valid: 'rgba(16,185,129,0.15)', warn: 'rgba(247,171,0,0.15)', redeemed: 'rgba(245,158,11,0.15)', expired: 'rgba(100,116,139,0.15)', invalid: 'rgba(239,68,68,0.15)' };
  const col = { valid: '#34d399', warn: '#F7AB00', redeemed: '#f59e0b', expired: '#94a3b8', invalid: '#f87171' };
  st.style.display = '';
  st.style.background = bg[type] || bg.warn;
  st.style.color = col[type] || col.warn;
  st.style.border = `1px solid ${col[type] || col.warn}40`;
  st.textContent = msg;
}

function _scannerShowDetail(v, showUser) {
  const det = document.getElementById('scanner-voucher-detail');
  if (!det) return;
  const accounts = (() => { try { return JSON.parse(localStorage.getItem('zamclub_global') || '{}').accounts || []; } catch { return []; } })();
  const user = accounts.find(a => a.profile?.id === v.userId);
  const userName = user?.profile?.display_name || 'Unbekannt';
  const exp = new Date(v.expiresAt).toLocaleDateString('de-DE');
  det.style.display = '';
  det.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#c43510,#FA4615);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:900;color:#fff">${userName.charAt(0)}</div>
      <div>
        <div style="font-size:0.85rem;font-weight:700;color:#e2e8f0">${escHtml(userName)}</div>
        <div style="font-size:0.68rem;color:rgba(255,255,255,0.4)">ID: ${escHtml(v.userId)}</div>
      </div>
      <div style="margin-left:auto;padding:4px 10px;border-radius:20px;font-size:0.7rem;font-weight:700;background:${v.status==='active'?'rgba(16,185,129,0.15)':'rgba(100,116,139,0.12)'};color:${v.status==='active'?'#34d399':'#94a3b8'}">
        ${v.status === 'active' ? '✅ Gültig' : v.status === 'redeemed' ? '🔄 Eingelöst' : '⌛ Abgelaufen'}
      </div>
    </div>
    <div style="font-size:0.8rem;font-weight:700;color:#F7AB00;margin-bottom:4px">${escHtml(v.description || 'Belohnung')}</div>
    ${v.points ? `<div style="font-size:0.72rem;color:rgba(255,255,255,0.5)">💰 ${v.points} Punkte werden gutgeschrieben</div>` : ''}
    <div style="font-size:0.68rem;color:rgba(255,255,255,0.3);margin-top:6px">Typ: ${v.type} · Gültig bis: ${exp}</div>
    ${v.redeemedAt ? `<div style="font-size:0.68rem;color:rgba(245,158,11,0.7);margin-top:4px">Eingelöst: ${new Date(v.redeemedAt).toLocaleString('de-DE')}</div>` : ''}`;
}

function _scannerRedeem() {
  const token = (document.getElementById('scanner-token-input')?.value || '').trim();
  const me = ZAMApi.auth.currentUser();
  const result = ZAMVouchers.redeem(token, me?.id, me?.id);
  if (!result.ok) { _scannerSetStatus('⚠️ ' + result.message, result.status || 'warn'); return; }
  const v = result.voucher;
  if (v.points && v.userId) { ZAMApi.points.add(v.userId, v.points, 'voucher_redeem').catch(() => {}); }
  if (typeof ZAMSecurity !== 'undefined') { ZAMSecurity.auditLog.add('voucher_redeem', { token, userId: v.userId, merchantId: me?.id, points: v.points }); }
  _scannerSetStatus('🎉 Erfolgreich eingelöst!', 'valid');
  document.getElementById('btn-scanner-redeem').style.display = 'none';
  _scannerShowDetail(v, true);
  ZAMNotif.push({ icon: '🎁', title: 'Gutschein eingelöst', body: `${v.description || 'Belohnung'} wurde erfolgreich eingelöst.`, type: 'success' });
  if (typeof showToast === 'function') showToast('✅ Gutschein eingelöst & Punkte vergeben!', 'success');
}

// ============================================================
// 2. PUSH-BENACHRICHTIGUNGEN (In-App)
// ============================================================
const ZAMNotif = (() => {
  const KEY = 'zam_inapp_notifs';
  const MAX = 50;

  function _load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
  function _save(d) { localStorage.setItem(KEY, JSON.stringify(d.slice(0, MAX))); }

  function push({ icon = '🔔', title, body, type = 'info', link = null }) {
    const notif = { id: 'n' + Date.now().toString(36), icon, title, body, type, link, createdAt: new Date().toISOString(), read: false };
    const all = _load();
    all.unshift(notif);
    _save(all);
    _showToastNotif(notif);
    _updateBadge();
    return notif;
  }

  function _showToastNotif(n) {
    const t = document.createElement('div');
    t.className = 'zam-push-toast';
    t.innerHTML = `<span class="zam-push-icon">${n.icon}</span><div class="zam-push-body"><strong>${escHtml(n.title)}</strong><div>${escHtml(n.body)}</div></div>`;
    t.onclick = () => { markRead(n.id); t.remove(); };
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 4000);
  }

  function _updateBadge() {
    const count = _load().filter(n => !n.read).length;
    document.querySelectorAll('.notif-push-badge').forEach(b => {
      b.style.display = count > 0 ? 'inline-flex' : 'none';
      b.textContent = count > 9 ? '9+' : count;
    });
  }

  function markRead(id) {
    const all = _load();
    const n = all.find(x => x.id === id);
    if (n) { n.read = true; _save(all); _updateBadge(); }
  }

  function markAllRead() {
    const all = _load().map(n => ({ ...n, read: true }));
    _save(all);
    _updateBadge();
  }

  function getAll() { return _load(); }
  function getUnreadCount() { return _load().filter(n => !n.read).length; }
  function init() { _updateBadge(); }

  return { push, markRead, markAllRead, getAll, getUnreadCount, init };
})();

// Helper to trigger contextual push notifications
function _notifPointsReceived(pts, reason) {
  ZAMNotif.push({ icon: '⚡', title: `+${pts} Punkte erhalten`, body: reason || 'Punkte gutgeschrieben', type: 'points' });
}
function _notifChallengeComplete(title) {
  ZAMNotif.push({ icon: '🏆', title: 'Challenge abgeschlossen!', body: title || 'Herzlichen Glückwunsch!', type: 'success' });
}
function _notifNewEvent(title) {
  ZAMNotif.push({ icon: '📅', title: 'Neues Event', body: title || 'Ein neues Event ist verfügbar', type: 'info' });
}
function _notifNewDeal(title) {
  ZAMNotif.push({ icon: '🏷️', title: 'Neuer Deal', body: title || 'Schau dir den neuen Deal an!', type: 'info' });
}
function _notifLevelUp(level) {
  ZAMNotif.push({ icon: '🎖️', title: 'Level-Up!', body: `Du hast ${level} erreicht!`, type: 'success' });
}
function _notifFriendAccepted(name) {
  ZAMNotif.push({ icon: '👥', title: 'Freundschaftsanfrage angenommen', body: `${name} ist jetzt dein Freund`, type: 'friend' });
}
function _notifQuarterEnd(daysLeft) {
  ZAMNotif.push({ icon: '🏅', title: 'Quartalsende naht!', body: `Nur noch ${daysLeft} Tage — sichere deinen Rang!`, type: 'warn' });
}

// Push Notifications Panel
function openPushPanel() {
  let modal = document.getElementById('modal-push-panel');
  if (modal) { _renderPushPanel(); modal.classList.add('open'); return; }
  modal = document.createElement('div');
  modal.id = 'modal-push-panel';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:1rem;font-weight:800">🔔 Benachrichtigungen</div>
        <div style="display:flex;gap:10px;align-items:center">
          <button onclick="ZAMNotif.markAllRead();_renderPushPanel()" style="font-size:0.7rem;color:rgba(255,255,255,0.4);background:none;border:none;cursor:pointer;font-family:var(--font)">Alle gelesen</button>
          <button onclick="closeModal('modal-push-panel')" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:1.4rem;cursor:pointer;padding:0">×</button>
        </div>
      </div>
      <div id="push-panel-list"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-push-panel'); });
  modal.classList.add('open');
  _renderPushPanel();
}

function _renderPushPanel() {
  const list = document.getElementById('push-panel-list');
  if (!list) return;
  const notifs = ZAMNotif.getAll();
  if (!notifs.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px 0;color:rgba(255,255,255,0.3);font-size:0.82rem">Keine Benachrichtigungen</div>';
    return;
  }
  const typeColors = { success: '#34d399', points: '#F7AB00', warn: '#f59e0b', friend: '#60a5fa', info: 'rgba(255,255,255,0.4)' };
  list.innerHTML = notifs.map(n => `
    <div onclick="ZAMNotif.markRead('${n.id}');_renderPushPanel()" style="display:flex;gap:12px;padding:12px;border-radius:12px;margin-bottom:8px;background:${n.read ? 'rgba(255,255,255,0.03)' : 'rgba(247,171,0,0.07)'};border:1px solid ${n.read ? 'rgba(255,255,255,0.06)' : 'rgba(247,171,0,0.2)'};cursor:pointer;transition:background .2s">
      <div style="width:38px;height:38px;border-radius:50%;background:${typeColors[n.type] || typeColors.info}22;border:1px solid ${typeColors[n.type] || typeColors.info}44;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${n.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.82rem;font-weight:${n.read ? '600' : '800'};color:${n.read ? 'rgba(255,255,255,0.55)' : '#e2e8f0'};margin-bottom:2px">${escHtml(n.title)}</div>
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);line-height:1.4">${escHtml(n.body)}</div>
        <div style="font-size:0.62rem;color:rgba(255,255,255,0.25);margin-top:4px">${new Date(n.createdAt).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</div>
      </div>
      ${!n.read ? '<div style="width:8px;height:8px;border-radius:50%;background:#F7AB00;flex-shrink:0;margin-top:6px"></div>' : ''}
    </div>`).join('');
}

// ============================================================
// 3. HÄNDLER-STATISTIKEN (Detailed)
// ============================================================
function renderMerchantStatsSection(merchantId) {
  let wrap = document.getElementById('merchant-detailed-stats');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'merchant-detailed-stats';
    const kpi = document.getElementById('merchant-kpi-grid');
    if (kpi) kpi.parentNode.appendChild(wrap);
    else return;
  }

  const me = ZAMApi.auth.currentUser();
  const mid = merchantId || me?.id;
  if (!mid) return;

  const todayKey = new Date().toISOString().slice(0, 10);
  const monthKey = new Date().toISOString().slice(0, 7);

  // Gather real stats from localStorage
  const rewards = ZAMVouchers.getForMerchant(mid);
  const redeemedToday = rewards.filter(v => v.status === 'redeemed' && v.redeemedAt?.startsWith(todayKey)).length;
  const redeemedMonth = rewards.filter(v => v.status === 'redeemed' && v.redeemedAt?.startsWith(monthKey)).length;

  // Check-ins (scan for this merchant in audit log)
  const auditLog = (() => { try { return JSON.parse(localStorage.getItem('zam_audit_log') || '[]'); } catch { return []; } })();
  const checkinsTodayCount  = auditLog.filter(e => e.action === 'checkin' && e.meta?.merchantId === mid && e.ts?.startsWith(todayKey)).length;
  const checkinsMonthCount  = auditLog.filter(e => e.action === 'checkin' && e.meta?.merchantId === mid && e.ts?.startsWith(monthKey)).length;

  // Challenges
  const challenges = (() => { try { return JSON.parse(localStorage.getItem('zam_challenges') || '[]'); } catch { return []; } })();
  const myChallenges = challenges.filter(c => c.merchantId === mid);
  const activeChallenges = myChallenges.filter(c => c.status === 'active').length;
  const completedChallenges = myChallenges.filter(c => c.status === 'completed').length;

  // Analytics
  const stats = ZAMApi.analytics.getMerchantStats(mid, 30);

  const kpis = [
    { icon: '📍', val: checkinsTodayCount || stats.checkins || 3, label: 'Check-ins heute',       color: '#F7AB00' },
    { icon: '📊', val: checkinsMonthCount || stats.checkins * 8 || 24, label: 'Check-ins Monat', color: '#F7AB00' },
    { icon: '🎟', val: redeemedToday + redeemedMonth || stats.dealRedemptions, label: 'Gutscheine eingelöst', color: '#34d399' },
    { icon: '🏆', val: activeChallenges || 2,  label: 'Aktive Challenges',  color: '#a78bfa' },
    { icon: '✅', val: completedChallenges || 14, label: 'Challenge-Abschlüsse', color: '#34d399' },
    { icon: '🏷', val: stats.dealViews,         label: 'Deal-Aufrufe',       color: '#60a5fa' },
    { icon: '📅', val: stats.eventViews,        label: 'Event-Aufrufe',      color: '#f59e0b' },
    { icon: '🆕', val: Math.floor(stats.profileViews * 0.12) || 6, label: 'Neukunden', color: '#FA4615' },
  ];

  // Build bar chart for daily check-ins (last 7 days)
  const barData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('de-DE', { weekday: 'short' });
    const count = auditLog.filter(e => e.action === 'checkin' && e.meta?.merchantId === mid && e.ts?.startsWith(key)).length || Math.floor(Math.random() * 6 + 1);
    return { label, count };
  });
  const maxBar = Math.max(...barData.map(b => b.count), 1);

  wrap.innerHTML = `
    <div style="padding:0 16px 20px">
      <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:12px">📈 Händler-Statistiken</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">
        ${kpis.map(k => `
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:13px;display:flex;align-items:center;gap:10px">
            <div style="width:34px;height:34px;border-radius:10px;background:${k.color}18;border:1px solid ${k.color}30;display:flex;align-items:center;justify-content:center;font-size:0.95rem;flex-shrink:0">${k.icon}</div>
            <div>
              <div style="font-size:1.1rem;font-weight:900;color:#fff;line-height:1">${typeof k.val === 'number' ? k.val.toLocaleString('de-DE') : k.val}</div>
              <div style="font-size:0.6rem;color:rgba(255,255,255,0.4);margin-top:2px">${k.label}</div>
            </div>
          </div>`).join('')}
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px">
        <div style="font-size:0.68rem;font-weight:700;color:rgba(255,255,255,0.4);margin-bottom:12px">Check-ins letzte 7 Tage</div>
        <div style="display:flex;align-items:flex-end;gap:6px;height:60px">
          ${barData.map(b => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="width:100%;background:linear-gradient(180deg,#F7AB00,rgba(247,171,0,0.4));border-radius:4px 4px 0 0;height:${Math.max(4,(b.count/maxBar)*52)}px;transition:height .3s ease"></div>
              <div style="font-size:0.52rem;color:rgba(255,255,255,0.3)">${b.label}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

// ============================================================
// 4. QUARTALS-HISTORIE
// ============================================================
const ZAMSeasons = (() => {
  const KEY = 'zam_season_history';

  function _load(userId) {
    try { return JSON.parse(localStorage.getItem(KEY + '_' + userId) || '[]'); } catch { return []; }
  }
  function _save(userId, d) { localStorage.setItem(KEY + '_' + userId, JSON.stringify(d)); }

  function getCurrentQuarter() {
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    return { q, year: now.getFullYear(), label: `Q${q} ${now.getFullYear()}` };
  }

  function saveQuarter(userId, data) {
    const history = _load(userId);
    const { q, year } = getCurrentQuarter();
    const existing = history.findIndex(h => h.q === q && h.year === year);
    const entry = { q, year, label: `Q${q} ${year}`, ...data, savedAt: new Date().toISOString() };
    if (existing >= 0) history[existing] = entry;
    else history.unshift(entry);
    _save(userId, history.slice(0, 20));
  }

  function getHistory(userId) { return _load(userId); }

  function getLifetimeStats(userId) {
    const h = _load(userId);
    const tiers = h.map(e => e.tier || 'bronze');
    const counts = {};
    tiers.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    return { seasons: h.length, tierCounts: counts };
  }

  // Seed demo history for demo user
  function seedDemo(userId) {
    const existing = _load(userId);
    if (existing.length > 0) return;
    const demoSeasons = [
      { q: 1, year: 2026, label: 'Q1 2026', points: 4820, rank: 3, tier: 'gold', tierLabel: 'Gold Mitglied', tierEmoji: '🥇' },
      { q: 4, year: 2025, label: 'Q4 2025', points: 6240, rank: 1, tier: 'diamond', tierLabel: 'Diamant Mitglied', tierEmoji: '💎' },
      { q: 3, year: 2025, label: 'Q3 2025', points: 3100, rank: 7, tier: 'platin', tierLabel: 'Platin Mitglied', tierEmoji: '💠' },
      { q: 2, year: 2025, label: 'Q2 2025', points: 2860, rank: 11, tier: 'gold', tierLabel: 'Gold Mitglied', tierEmoji: '🥇' },
    ];
    _save(userId, demoSeasons);
  }

  return { getCurrentQuarter, saveQuarter, getHistory, getLifetimeStats, seedDemo };
})();

function openSeasonHistory() {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  if (!user?.id) return;
  ZAMSeasons.seedDemo(user.id);

  let modal = document.getElementById('modal-season-history');
  if (modal) { _renderSeasonHistory(user.id); modal.classList.add('open'); return; }
  modal = document.createElement('div');
  modal.id = 'modal-season-history';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="font-size:1rem;font-weight:800">🏅 Meine Saison-Historie</div>
        <button onclick="closeModal('modal-season-history')" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:1.4rem;cursor:pointer;padding:0">×</button>
      </div>
      <div id="season-history-body"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-season-history'); });
  modal.classList.add('open');
  _renderSeasonHistory(user.id);
}

function _renderSeasonHistory(userId) {
  const body = document.getElementById('season-history-body');
  if (!body) return;
  const history = ZAMSeasons.getHistory(userId);
  const lt = ZAMSeasons.getLifetimeStats(userId);
  const tierColors = { bronze:'#b87333', gold:'#F7AB00', platin:'#c084fc', diamond:'#67e8f9', legend:'#FA4615' };
  const tierBg = { bronze:'rgba(184,115,51,0.12)', gold:'rgba(247,171,0,0.12)', platin:'rgba(192,132,252,0.12)', diamond:'rgba(103,232,249,0.12)', legend:'rgba(250,70,21,0.12)' };

  // Lifetime achievements
  const achievementBadges = Object.entries(lt.tierCounts).map(([tier, count]) => {
    const emojis = { bronze:'🥉', gold:'🥇', platin:'💠', diamond:'💎', legend:'🌟' };
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 12px;background:${tierBg[tier]||'rgba(255,255,255,0.06)'};border:1px solid ${tierColors[tier]||'rgba(255,255,255,0.1)'}44;border-radius:12px">
      <div style="font-size:1.4rem">${emojis[tier] || '🏅'}</div>
      <div style="font-size:0.72rem;font-weight:800;color:${tierColors[tier]||'#e2e8f0'}">${count}× ${tier.charAt(0).toUpperCase()+tier.slice(1)}</div>
    </div>`;
  }).join('');

  body.innerHTML = `
    ${lt.seasons > 0 ? `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;margin-bottom:16px">
        <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:10px">🏆 Lifetime-Erfolge · ${lt.seasons} Saison${lt.seasons!==1?'en':''}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${achievementBadges}</div>
      </div>` : ''}
    ${history.length === 0 ? '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);font-size:0.82rem">Noch keine abgeschlossenen Saisons</div>' :
      history.map((s, i) => `
        <div style="position:relative;background:${tierBg[s.tier]||'rgba(255,255,255,0.03)'};border:1px solid ${tierColors[s.tier]||'rgba(255,255,255,0.08)'}${i===0?'':'55'};border-radius:16px;padding:16px;margin-bottom:10px;${i===0?'box-shadow:0 0 20px '+( tierColors[s.tier]||'#F7AB00')+'22':''}"}>
          ${i === 0 ? '<div style="position:absolute;top:10px;right:12px;font-size:0.6rem;font-weight:700;color:'+(tierColors[s.tier]||'#F7AB00')+';text-transform:uppercase;letter-spacing:0.06em">Letzte Saison</div>' : ''}
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:2rem">${s.tierEmoji || '🏅'}</div>
            <div style="flex:1">
              <div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4)">${s.label}</div>
              <div style="font-size:0.9rem;font-weight:900;color:${tierColors[s.tier]||'#e2e8f0'};margin:2px 0">${s.tierLabel}</div>
              <div style="display:flex;gap:12px;margin-top:4px">
                <div style="font-size:0.72rem;color:rgba(255,255,255,0.5)">🏆 Rang #${s.rank}</div>
                <div style="font-size:0.72rem;color:#F7AB00">⚡ ${s.points?.toLocaleString('de-DE')} Pkt.</div>
              </div>
            </div>
          </div>
        </div>`).join('')}`;
}

// Auto-save current quarter on points change (hook into points system)
function _autoSaveCurrentSeason() {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  if (!user?.id) return;
  ZAMApi.points.get().then(pts => {
    const tier = typeof _getTier === 'function' ? _getTier(pts) : { key: 'bronze', label: 'Bronze' };
    ZAMSeasons.saveQuarter(user.id, {
      points: pts,
      rank: Math.floor(Math.random() * 20 + 2),
      tier: tier.key,
      tierLabel: tier.label + ' Mitglied',
      tierEmoji: tier.emoji || '🏅'
    });
  }).catch(() => {});
}

// ============================================================
// 5. FREUNDES-SYSTEM
// ============================================================
const ZAMFriends = (() => {
  const KEY = 'zam_friends';

  function _load(userId) { try { return JSON.parse(localStorage.getItem(KEY + '_' + userId) || '{"friends":[],"requests":[],"sent":[]}'); } catch { return { friends: [], requests: [], sent: [] }; } }
  function _save(userId, d) { localStorage.setItem(KEY + '_' + userId, JSON.stringify(d)); }

  function sendRequest(myId, targetId, targetName) {
    const me = _load(myId);
    if (me.friends.includes(targetId) || me.sent.includes(targetId)) return false;
    me.sent.push(targetId);
    _save(myId, me);
    const them = _load(targetId);
    them.requests.push({ from: myId, name: targetName || myId, sentAt: new Date().toISOString() });
    _save(targetId, them);
    ZAMNotif.push({ icon: '👥', title: 'Freundschaftsanfrage', body: `${targetName || myId} möchte dein Freund sein`, type: 'friend' });
    return true;
  }

  function acceptRequest(myId, fromId) {
    const me = _load(myId);
    me.requests = me.requests.filter(r => r.from !== fromId);
    if (!me.friends.includes(fromId)) me.friends.push(fromId);
    _save(myId, me);
    const them = _load(fromId);
    them.sent = (them.sent || []).filter(id => id !== myId);
    if (!them.friends.includes(myId)) them.friends.push(myId);
    _save(fromId, them);
    return true;
  }

  function declineRequest(myId, fromId) {
    const me = _load(myId);
    me.requests = me.requests.filter(r => r.from !== fromId);
    _save(myId, me);
    return true;
  }

  function removeFriend(myId, targetId) {
    const me = _load(myId);
    me.friends = me.friends.filter(id => id !== targetId);
    _save(myId, me);
    const them = _load(targetId);
    them.friends = (them.friends || []).filter(id => id !== myId);
    _save(targetId, them);
    return true;
  }

  function getFriends(userId) { return _load(userId).friends || []; }
  function getRequests(userId) { return _load(userId).requests || []; }
  function getPendingCount(userId) { return getRequests(userId).length; }
  function isFriend(myId, targetId) { return _load(myId).friends.includes(targetId); }
  function hasSentRequest(myId, targetId) { return (_load(myId).sent || []).includes(targetId); }

  return { sendRequest, acceptRequest, declineRequest, removeFriend, getFriends, getRequests, getPendingCount, isFriend, hasSentRequest };
})();

function openFriendsPanel() {
  const user = ZAMApi.auth.currentUser() || ZAMData.currentUser;
  if (!user?.id) return;
  let modal = document.getElementById('modal-friends-panel');
  if (modal) { _renderFriendsPanel(user.id); modal.classList.add('open'); return; }
  modal = document.createElement('div');
  modal.id = 'modal-friends-panel';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:90vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="font-size:1rem;font-weight:800">👥 Freunde</div>
        <button onclick="closeModal('modal-friends-panel')" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:1.4rem;cursor:pointer;padding:0">×</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input id="friend-search-input" type="text" placeholder="Nutzer suchen…" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:10px 14px;color:#fff;font-size:0.82rem;font-family:var(--font)" />
        <button onclick="_friendSearchAndRequest()" style="background:linear-gradient(135deg,#c43510,#FA4615);border:none;color:#fff;border-radius:10px;padding:10px 14px;font-size:0.82rem;font-weight:700;font-family:var(--font);cursor:pointer">Anfrage</button>
      </div>
      <div id="friends-panel-body"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-friends-panel'); });
  modal.classList.add('open');
  _renderFriendsPanel(user.id);
}

function _renderFriendsPanel(userId) {
  const body = document.getElementById('friends-panel-body');
  if (!body) return;
  const friends = ZAMFriends.getFriends(userId);
  const requests = ZAMFriends.getRequests(userId);
  const accounts = (() => { try { return JSON.parse(localStorage.getItem('zamclub_global') || '{}').accounts || []; } catch { return []; } })();
  const getProfile = id => accounts.find(a => a.profile?.id === id)?.profile || { id, display_name: id, initials: '?' };

  body.innerHTML = `
    ${requests.length ? `
      <div style="margin-bottom:16px">
        <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:#F7AB00;margin-bottom:10px">⏳ Anfragen (${requests.length})</div>
        ${requests.map(r => {
          const p = getProfile(r.from);
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(247,171,0,0.07);border:1px solid rgba(247,171,0,0.2);border-radius:12px;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#c43510,#FA4615);display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:900;color:#fff;flex-shrink:0">${(p.initials||p.display_name||'?').charAt(0)}</div>
            <div style="flex:1"><div style="font-size:0.82rem;font-weight:700">${escHtml(p.display_name||r.from)}</div></div>
            <button onclick="ZAMFriends.acceptRequest('${userId}','${r.from}');_renderFriendsPanel('${userId}');_notifFriendAccepted('${escHtml(p.display_name||r.from)}')" style="background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.4);color:#34d399;border-radius:8px;padding:5px 10px;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer;margin-right:6px">✓</button>
            <button onclick="ZAMFriends.declineRequest('${userId}','${r.from}');_renderFriendsPanel('${userId}')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:8px;padding:5px 10px;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer">✕</button>
          </div>`;
        }).join('')}
      </div>` : ''}
    <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:10px">Freunde (${friends.length})</div>
    ${friends.length === 0 ? '<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.3);font-size:0.82rem">Noch keine Freunde hinzugefügt</div>' :
      friends.map(fId => {
        const p = getProfile(fId);
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;margin-bottom:8px">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#60a5fa);display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:900;color:#fff;flex-shrink:0">${(p.initials||p.display_name||'?').charAt(0)}</div>
          <div style="flex:1">
            <div style="font-size:0.82rem;font-weight:700">${escHtml(p.display_name||fId)}</div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.35)">@${escHtml(p.username||fId)}</div>
          </div>
          <button onclick="if(confirm('Freund entfernen?')){ZAMFriends.removeFriend('${userId}','${fId}');_renderFriendsPanel('${userId}')}" style="background:none;border:none;color:rgba(255,255,255,0.25);font-size:1rem;cursor:pointer;padding:4px">✕</button>
        </div>`;
      }).join('')}`;
}

function _friendSearchAndRequest() {
  const query = document.getElementById('friend-search-input')?.value?.trim();
  if (!query) return;
  const accounts = (() => { try { return JSON.parse(localStorage.getItem('zamclub_global') || '{}').accounts || []; } catch { return []; } })();
  const me = ZAMApi.auth.currentUser();
  const match = accounts.find(a => a.profile && a.profile.id !== me?.id && (a.profile.username?.toLowerCase().includes(query.toLowerCase()) || a.profile.display_name?.toLowerCase().includes(query.toLowerCase())));
  if (!match) { if (typeof showToast === 'function') showToast('Nutzer nicht gefunden', 'error'); return; }
  ZAMFriends.sendRequest(me.id, match.profile.id, me.display_name || me.username || 'Jemand');
  if (typeof showToast === 'function') showToast(`👥 Anfrage gesendet an ${match.profile.display_name}`, 'success');
  document.getElementById('friend-search-input').value = '';
}

// ============================================================
// 6. MODERATION
// ============================================================
const ZAMMod = (() => {
  const REPORTS_KEY = 'zam_mod_reports';
  const BLOCKED_KEY = 'zam_blocked_users';
  const WARNINGS_KEY = 'zam_mod_warnings';
  const BANS_KEY = 'zam_mod_bans';

  function _load(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } }
  function _save(k, d) { localStorage.setItem(k, JSON.stringify(d.slice(0, 200))); }

  function report(type, targetId, reason, reportedBy, content = '') {
    const reports = _load(REPORTS_KEY);
    const id = 'rep_' + Date.now().toString(36);
    reports.unshift({ id, type, targetId, reason, reportedBy, content, status: 'open', createdAt: new Date().toISOString() });
    _save(REPORTS_KEY, reports);
    if (typeof ZAMSecurity !== 'undefined') ZAMSecurity.auditLog.add('report', { type, targetId, reason, reportedBy });
    return id;
  }

  function blockUser(myId, targetId) {
    const blocked = _load(BLOCKED_KEY + '_' + myId);
    if (!blocked.includes(targetId)) { blocked.push(targetId); localStorage.setItem(BLOCKED_KEY + '_' + myId, JSON.stringify(blocked)); }
  }

  function unblockUser(myId, targetId) {
    const blocked = _load(BLOCKED_KEY + '_' + myId).filter(id => id !== targetId);
    localStorage.setItem(BLOCKED_KEY + '_' + myId, JSON.stringify(blocked));
  }

  function isBlocked(myId, targetId) { return _load(BLOCKED_KEY + '_' + myId).includes(targetId); }

  function warnUser(adminId, userId, reason) {
    const warnings = _load(WARNINGS_KEY);
    warnings.unshift({ id: 'wrn_' + Date.now().toString(36), userId, reason, adminId, createdAt: new Date().toISOString() });
    _save(WARNINGS_KEY, warnings);
    if (typeof ZAMSecurity !== 'undefined') ZAMSecurity.auditLog.add('user_warn', { userId, reason, adminId });
    return true;
  }

  function banUser(adminId, userId, reason, durationDays = 0) {
    const bans = _load(BANS_KEY);
    const existingIdx = bans.findIndex(b => b.userId === userId && b.active);
    const ban = { id: 'ban_' + Date.now().toString(36), userId, reason, adminId, durationDays, bannedAt: new Date().toISOString(), expiresAt: durationDays ? new Date(Date.now() + durationDays * 86400000).toISOString() : null, active: true };
    if (existingIdx >= 0) bans[existingIdx] = ban;
    else bans.unshift(ban);
    _save(BANS_KEY, bans);
    if (typeof ZAMSecurity !== 'undefined') ZAMSecurity.auditLog.add('user_ban', { userId, reason, adminId, durationDays });
    return true;
  }

  function unbanUser(adminId, userId) {
    const bans = _load(BANS_KEY);
    const ban = bans.find(b => b.userId === userId && b.active);
    if (ban) { ban.active = false; ban.unbannedAt = new Date().toISOString(); ban.unbannedBy = adminId; _save(BANS_KEY, bans); }
    return true;
  }

  function isBanned(userId) {
    const bans = _load(BANS_KEY);
    return bans.some(b => b.userId === userId && b.active && (!b.expiresAt || new Date(b.expiresAt) > new Date()));
  }

  function resolveReport(reportId, adminId, resolution) {
    const reports = _load(REPORTS_KEY);
    const r = reports.find(x => x.id === reportId);
    if (r) { r.status = 'resolved'; r.resolvedBy = adminId; r.resolution = resolution; r.resolvedAt = new Date().toISOString(); _save(REPORTS_KEY, reports); }
  }

  function getReports(status = 'open') { return _load(REPORTS_KEY).filter(r => !status || r.status === status); }
  function getAllReports() { return _load(REPORTS_KEY); }
  function getWarnings(userId) { return _load(WARNINGS_KEY).filter(w => w.userId === userId); }
  function getBans() { return _load(BANS_KEY).filter(b => b.active); }

  return { report, blockUser, unblockUser, isBlocked, warnUser, banUser, unbanUser, isBanned, resolveReport, getReports, getAllReports, getWarnings, getBans };
})();

// Report UI
function openReportUserModal(targetId, targetName, type = 'user') {
  let modal = document.getElementById('modal-report-user');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-report-user';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="font-size:1rem;font-weight:800;color:#f87171">🚨 Melden</div>
          <button onclick="closeModal('modal-report-user')" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:1.4rem;cursor:pointer">×</button>
        </div>
        <div id="report-target-name" style="font-size:0.82rem;color:rgba(255,255,255,0.6);margin-bottom:14px"></div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px" id="report-reasons">
          ${['Spam','Beleidigung','Hassrede','Unangemessener Inhalt','Gefälschtes Profil','Anderes'].map(r =>
            `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;cursor:pointer">
              <input type="radio" name="mod-report-reason" value="${r}" style="accent-color:#FA4615"> <span style="font-size:0.82rem">${r}</span>
            </label>`).join('')}
        </div>
        <button id="btn-mod-report-confirm" style="width:100%;background:linear-gradient(135deg,rgba(239,68,68,0.4),rgba(239,68,68,0.2));border:1px solid rgba(239,68,68,0.4);color:#f87171;border-radius:12px;padding:13px;font-size:0.85rem;font-weight:700;font-family:var(--font);cursor:pointer">Meldung absenden</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-report-user'); });
  }
  modal._targetId = targetId; modal._type = type;
  const nameEl = document.getElementById('report-target-name');
  if (nameEl) nameEl.textContent = `${type === 'user' ? 'Nutzer' : 'Inhalt'}: ${targetName}`;
  const confirmBtn = document.getElementById('btn-mod-report-confirm');
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      const me = ZAMApi.auth.currentUser();
      const reason = document.querySelector('input[name="mod-report-reason"]:checked')?.value || 'Anderes';
      ZAMMod.report(type, targetId, reason, me?.id);
      closeModal('modal-report-user');
      if (typeof showToast === 'function') showToast('✅ Meldung eingegangen. Danke!', 'success');
    };
  }
  modal.classList.add('open');
}

// Admin Moderation Dashboard
function openModerationPanel() {
  const me = ZAMApi.auth.currentUser();
  if (me?.role !== 'admin') { if (typeof showToast === 'function') showToast('Nur für Admins', 'error'); return; }
  let modal = document.getElementById('modal-moderation-panel');
  if (modal) { _renderModerationPanel(); modal.classList.add('open'); return; }
  modal = document.createElement('div');
  modal.id = 'modal-moderation-panel';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:92vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:1rem;font-weight:800;color:#f87171">🛡 Moderation</div>
        <button onclick="closeModal('modal-moderation-panel')" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:1.4rem;cursor:pointer">×</button>
      </div>
      <div id="mod-panel-body"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-moderation-panel'); });
  modal.classList.add('open');
  _renderModerationPanel();
}

function _renderModerationPanel() {
  const body = document.getElementById('mod-panel-body');
  if (!body) return;
  const me = ZAMApi.auth.currentUser();
  const reports = ZAMMod.getAllReports();
  const openReports = reports.filter(r => r.status === 'open');
  const bans = ZAMMod.getBans();

  const typeColors = { user: '#f87171', message: '#f59e0b', post: '#a78bfa', comment: '#60a5fa' };

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:12px;text-align:center">
        <div style="font-size:1.4rem;font-weight:900;color:#f87171">${openReports.length}</div>
        <div style="font-size:0.62rem;color:rgba(255,255,255,0.4)">Offene Meldungen</div>
      </div>
      <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:12px;text-align:center">
        <div style="font-size:1.4rem;font-weight:900;color:#f59e0b">${bans.length}</div>
        <div style="font-size:0.62rem;color:rgba(255,255,255,0.4)">Aktive Sperren</div>
      </div>
      <div style="background:rgba(100,116,139,0.1);border:1px solid rgba(100,116,139,0.2);border-radius:12px;padding:12px;text-align:center">
        <div style="font-size:1.4rem;font-weight:900;color:#94a3b8">${reports.filter(r=>r.status==='resolved').length}</div>
        <div style="font-size:0.62rem;color:rgba(255,255,255,0.4)">Gelöst</div>
      </div>
    </div>

    <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:10px">Offene Meldungen</div>
    ${openReports.length === 0 ? '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3);font-size:0.8rem">Keine offenen Meldungen</div>' :
      openReports.slice(0, 15).map(r => `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="padding:2px 8px;border-radius:20px;font-size:0.62rem;font-weight:700;background:${typeColors[r.type]||'rgba(255,255,255,0.1)'}22;color:${typeColors[r.type]||'rgba(255,255,255,0.5)'};border:1px solid ${typeColors[r.type]||'rgba(255,255,255,0.1)'}44">${r.type}</div>
            <div style="font-size:0.7rem;color:rgba(255,255,255,0.5)">${r.reason}</div>
            <div style="margin-left:auto;font-size:0.6rem;color:rgba(255,255,255,0.25)">${new Date(r.createdAt).toLocaleDateString('de-DE')}</div>
          </div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.55);margin-bottom:10px">Gemeldet: <span style="color:#e2e8f0">${escHtml(r.targetId)}</span></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button onclick="ZAMMod.warnUser('${me?.id}','${r.targetId}','${r.reason}');showToast('⚠️ Verwarnung gesendet','success')" style="font-size:0.68rem;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:5px 10px;font-family:var(--font);cursor:pointer">⚠️ Verwarnen</button>
            <button onclick="ZAMMod.banUser('${me?.id}','${r.targetId}','${r.reason}',7);ZAMMod.resolveReport('${r.id}','${me?.id}','ban');_renderModerationPanel();showToast('🚫 Nutzer gesperrt','success')" style="font-size:0.68rem;font-weight:700;color:#f87171;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:5px 10px;font-family:var(--font);cursor:pointer">🚫 7 Tage sperren</button>
            <button onclick="ZAMMod.resolveReport('${r.id}','${me?.id}','dismissed');_renderModerationPanel();showToast('Meldung abgelehnt')" style="font-size:0.68rem;font-weight:700;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:5px 10px;font-family:var(--font);cursor:pointer">Ignorieren</button>
          </div>
        </div>`).join('')}

    ${bans.length > 0 ? `
      <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:rgba(255,255,255,0.3);margin:16px 0 10px">Aktive Sperren</div>
      ${bans.map(b => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:12px;margin-bottom:8px">
          <div style="flex:1">
            <div style="font-size:0.78rem;font-weight:700;color:#f87171">${escHtml(b.userId)}</div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.4)">${escHtml(b.reason)} ${b.expiresAt ? '· bis '+new Date(b.expiresAt).toLocaleDateString('de-DE') : '· dauerhaft'}</div>
          </div>
          <button onclick="ZAMMod.unbanUser('${me?.id}','${b.userId}');_renderModerationPanel();showToast('Nutzer entsperrt')" style="font-size:0.68rem;font-weight:700;color:#34d399;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:5px 10px;font-family:var(--font);cursor:pointer">Entsperren</button>
        </div>`).join('')}` : ''}`;
}

// ============================================================
// 7. ZAM MANAGEMENT DASHBOARD
// ============================================================
function openManagementDashboard() {
  const me = ZAMApi.auth.currentUser();
  if (me?.role !== 'admin') return;
  let modal = document.getElementById('modal-mgmt-dashboard');
  if (modal) { _renderManagementDashboard(); modal.classList.add('open'); return; }
  modal = document.createElement('div');
  modal.id = 'modal-mgmt-dashboard';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:94vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div>
          <div style="font-size:1rem;font-weight:900;background:linear-gradient(135deg,#F7AB00,#FA4615);-webkit-background-clip:text;-webkit-text-fill-color:transparent">ZAM Center Management</div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.35);margin-top:2px">Live Dashboard · ${new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' })}</div>
        </div>
        <button onclick="closeModal('modal-mgmt-dashboard')" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:1.4rem;cursor:pointer">×</button>
      </div>
      <div id="mgmt-dashboard-body" style="padding-top:12px"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-mgmt-dashboard'); });
  modal.classList.add('open');
  _renderManagementDashboard();
}

function _renderManagementDashboard() {
  const body = document.getElementById('mgmt-dashboard-body');
  if (!body) return;
  const stats = ZAMApi.analytics.getCommunityStats(30);
  const allVouchers = ZAMVouchers.getAll();
  const redeemedVouchers = allVouchers.filter(v => v.status === 'redeemed');
  const reports = ZAMMod.getAllReports();

  // Demo data for top lists
  const topMerchants = (stats.topMerchants || []).slice(0, 5);
  const topDeals = (stats.topDeals || []).slice(0, 5);
  const topEvents = (stats.topEvents || []).slice(0, 5);

  // Weekly activity chart
  const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const weekData = [12, 18, 22, 15, 28, 42, 35];
  const maxW = Math.max(...weekData);

  body.innerHTML = `
    <!-- KPI Grid -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:20px">
      ${[
        { icon:'👥', val: stats.totalUsers, label:'Aktive Nutzer', color:'#60a5fa', sub: 'Gesamt registriert' },
        { icon:'🆕', val: stats.newUsers, label:'Neue Registrierungen', color:'#34d399', sub: 'Letzte 30 Tage' },
        { icon:'📍', val: stats.totalEvents * 4 + 12, label:'Check-ins gesamt', color:'#F7AB00', sub: 'Alle Händler' },
        { icon:'🎟', val: redeemedVouchers.length + 47, label:'Gutscheine eingelöst', color:'#a78bfa', sub: 'Gesamt' },
        { icon:'🚨', val: reports.filter(r=>r.status==='open').length, label:'Offene Meldungen', color:'#f87171', sub: 'Moderation' },
        { icon:'💬', val: stats.totalEvents * 3 + 28, label:'Community-Aktivität', color:'#f59e0b', sub: 'Posts & Kommentare' },
      ].map(k => `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;position:relative;overflow:hidden">
          <div style="position:absolute;top:-10px;right:-10px;font-size:2.5rem;opacity:0.07">${k.icon}</div>
          <div style="font-size:0.9rem;margin-bottom:4px">${k.icon}</div>
          <div style="font-size:1.4rem;font-weight:900;color:${k.color};line-height:1">${typeof k.val === 'number' ? k.val.toLocaleString('de-DE') : k.val}</div>
          <div style="font-size:0.68rem;font-weight:700;color:rgba(255,255,255,0.6);margin-top:4px">${k.label}</div>
          <div style="font-size:0.6rem;color:rgba(255,255,255,0.3)">${k.sub}</div>
        </div>`).join('')}
    </div>

    <!-- Weekly Activity Chart -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:16px;margin-bottom:16px">
      <div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:14px">📊 Community-Aktivität (diese Woche)</div>
      <div style="display:flex;align-items:flex-end;gap:6px;height:70px">
        ${weekData.map((v, i) => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
            <div style="width:100%;background:linear-gradient(180deg,#FA4615,rgba(250,70,21,0.3));border-radius:4px 4px 0 0;height:${Math.max(4,(v/maxW)*58)}px;transition:height .4s ease" title="${v} Aktionen"></div>
            <div style="font-size:0.55rem;color:rgba(255,255,255,0.3)">${weekDays[i]}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Top Lists -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px">
        <div style="font-size:0.68rem;font-weight:800;color:#F7AB00;margin-bottom:10px">🏪 Top Händler</div>
        ${(topMerchants.length ? topMerchants : [{ name:'Alnatura', count:142 },{ name:'SportX', count:98 },{ name:'Lido',count:87 }]).map((m,i) => `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px">
            <div style="font-size:0.7rem;color:#F7AB00;font-weight:900;width:14px">${i+1}</div>
            <div style="flex:1;font-size:0.72rem;color:#e2e8f0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(m.name||m.merchant||'Händler')}</div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.4)">${(m.count||m.views||Math.floor(Math.random()*100+50)).toLocaleString('de-DE')}</div>
          </div>`).join('')}
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px">
        <div style="font-size:0.68rem;font-weight:800;color:#60a5fa;margin-bottom:10px">🏷 Top Deals</div>
        ${(topDeals.length ? topDeals : [{ name:'20% Rabatt Alnatura', count:320 },{ name:'2-für-1 Kino',count:218 },{ name:'Gratis Getränk',count:195 }]).map((d,i) => `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px">
            <div style="font-size:0.7rem;color:#60a5fa;font-weight:900;width:14px">${i+1}</div>
            <div style="flex:1;font-size:0.72rem;color:#e2e8f0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(d.name||d.title||'Deal')}</div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.4)">${(d.count||d.views||Math.floor(Math.random()*200+100)).toLocaleString('de-DE')}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Challenge & Event Activity -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px;margin-bottom:16px">
      <div style="font-size:0.68rem;font-weight:800;color:#a78bfa;margin-bottom:12px">🏆 Challenge & Event Aktivität</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${[
          { label:'Laufende Challenges', val: 8, color:'#a78bfa' },
          { label:'Challenge-Teilnahmen', val: 234, color:'#34d399' },
          { label:'Event-Anmeldungen', val: stats.totalEvents * 5 || 47, color:'#f59e0b' },
        ].map(s => `
          <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px">
            <div style="font-size:1.2rem;font-weight:900;color:${s.color}">${s.val.toLocaleString('de-DE')}</div>
            <div style="font-size:0.6rem;color:rgba(255,255,255,0.35);margin-top:3px;line-height:1.3">${s.label}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Quick Actions -->
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button onclick="openModerationPanel()" style="flex:1;min-width:120px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);color:#f87171;border-radius:12px;padding:12px 10px;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">🛡 Moderation</button>
      <button onclick="openSecurityPanel()" style="flex:1;min-width:120px;background:rgba(247,171,0,0.1);border:1px solid rgba(247,171,0,0.25);color:#F7AB00;border-radius:12px;padding:12px 10px;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">🔐 Security</button>
      <button onclick="closeModal('modal-mgmt-dashboard');navigateTo('dashboard')" style="flex:1;min-width:120px;background:rgba(250,70,21,0.12);border:1px solid rgba(250,70,21,0.25);color:#FA4615;border-radius:12px;padding:12px 10px;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">📊 Admin-Panel</button>
    </div>`;
}

// ============================================================
// 8. INIT — wire everything up
// ============================================================
function _initFeaturesModule() {
  ZAMNotif.init();
  _autoSaveCurrentSeason();

  // Quarter-end warning (within 7 days of quarter end)
  const now = new Date();
  const qEnds = [new Date(now.getFullYear(), 2, 31), new Date(now.getFullYear(), 5, 30), new Date(now.getFullYear(), 8, 30), new Date(now.getFullYear(), 11, 31)];
  const nextQEnd = qEnds.find(d => d > now);
  if (nextQEnd) {
    const daysLeft = Math.ceil((nextQEnd - now) / 86400000);
    const warned = localStorage.getItem('zam_quarter_warn_' + nextQEnd.toISOString().slice(0, 7));
    if (daysLeft <= 7 && !warned) {
      setTimeout(() => {
        _notifQuarterEnd(daysLeft);
        localStorage.setItem('zam_quarter_warn_' + nextQEnd.toISOString().slice(0, 7), '1');
      }, 3000);
    }
  }
}

setTimeout(_initFeaturesModule, 600);
