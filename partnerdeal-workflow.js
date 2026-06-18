/**
 * ZAM Club — Partnerdeal Freigabe-Workflow
 * Bidirektionaler Abstimmungsprozess zwischen zwei Händlern.
 * Ergänzt das bestehende _pd2* System ohne es zu verändern.
 */
'use strict';

// ============================================================
// DATA LAYER
// ============================================================
const PDW = (() => {
  const KEY = 'zam_pdw_deals';

  const STATUS = {
    DRAFT:                'draft',
    SENT:                 'sent',
    AWAITING_PARTNER:     'awaiting_partner',
    CHANGE_PROPOSED:      'change_proposed',
    AWAITING_CONFIRM:     'awaiting_confirmation',
    BOTH_CONFIRMED:       'both_confirmed',
    PUBLISHED:            'published',
    REJECTED:             'rejected',
  };

  const STATUS_LABEL = {
    draft:                 { text: 'Entwurf',                color: '#94a3b8' },
    sent:                  { text: 'Anfrage gesendet',        color: '#60a5fa' },
    awaiting_partner:      { text: 'Wartet auf Partner',      color: '#f59e0b' },
    change_proposed:       { text: 'Änderung vorgeschlagen',  color: '#a78bfa' },
    awaiting_confirmation: { text: 'Wartet auf Bestätigung',  color: '#f59e0b' },
    both_confirmed:        { text: 'Von beiden bestätigt',    color: '#34d399' },
    published:             { text: 'Veröffentlicht',          color: '#34d399' },
    rejected:              { text: 'Abgelehnt',               color: '#f87171' },
  };

  function _load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
  function _save(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  function _uid() { return 'pdw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function _now() { return new Date().toISOString(); }

  function getAll()    { return _load(); }
  function getById(id) { return _load().find(d => d.id === id); }

  function getForMerchant(merchantId) {
    return _load().filter(d => d.initiator.id === merchantId || d.partner.id === merchantId);
  }

  function create({ initiator, partner, title, description, initiatorOffer, initiatorCondition, periodStart, periodEnd, discount, message }) {
    const deal = {
      id: _uid(),
      status: STATUS.AWAITING_PARTNER,
      initiator,
      partner,
      current: { title, description, initiatorOffer, initiatorCondition, partnerOffer: '', partnerCondition: '', periodStart, periodEnd, discount, message },
      initiatorConfirmed: true,
      partnerConfirmed:   false,
      adminApproved:      false,
      versions: [{
        by: initiator.id, byName: initiator.name, at: _now(),
        changes: { title, description, initiatorOffer, initiatorCondition, periodStart, periodEnd, discount },
        comment: message || 'Anfrage erstellt',
        status: STATUS.AWAITING_PARTNER,
      }],
      createdAt: _now(), updatedAt: _now(),
    };
    const all = _load();
    all.unshift(deal);
    _save(all);
    return deal;
  }

  function _update(id, patch) {
    const all = _load();
    const idx = all.findIndex(d => d.id === id);
    if (idx < 0) return null;
    all[idx] = { ...all[idx], ...patch, updatedAt: _now() };
    _save(all);
    return all[idx];
  }

  function proposeChange(id, byMerchant, fields, comment) {
    const deal = getById(id);
    if (!deal) return null;
    const isInitiator = deal.initiator.id === byMerchant.id;
    const newStatus = isInitiator ? STATUS.AWAITING_PARTNER : STATUS.AWAITING_CONFIRM;
    const updated = _update(id, {
      status: newStatus,
      current: { ...deal.current, ...fields },
      initiatorConfirmed: isInitiator ? true  : false,
      partnerConfirmed:   isInitiator ? false : true,
      versions: [...deal.versions, {
        by: byMerchant.id, byName: byMerchant.name, at: _now(),
        changes: fields, comment, status: newStatus,
      }],
    });
    return updated;
  }

  function confirm(id, byMerchantId) {
    const deal = getById(id);
    if (!deal) return null;
    const isInitiator = deal.initiator.id === byMerchantId;
    const iConfirmed = isInitiator ? true  : deal.initiatorConfirmed;
    const pConfirmed = isInitiator ? deal.partnerConfirmed : true;
    const bothDone   = iConfirmed && pConfirmed;
    const newStatus  = bothDone ? STATUS.BOTH_CONFIRMED : deal.status;
    const all = _load();
    const idx = all.findIndex(d => d.id === id);
    all[idx] = {
      ...all[idx],
      initiatorConfirmed: iConfirmed,
      partnerConfirmed: pConfirmed,
      status: newStatus,
      updatedAt: _now(),
      versions: [...all[idx].versions, {
        by: byMerchantId, byName: isInitiator ? deal.initiator.name : deal.partner.name,
        at: _now(), changes: {}, comment: 'Bestätigt ✓', status: newStatus,
      }],
    };
    _save(all);
    if (bothDone) _publishToActive(all[idx]);
    return all[idx];
  }

  function reject(id, byMerchantId, reason) {
    const deal = getById(id);
    if (!deal) return null;
    const byName = deal.initiator.id === byMerchantId ? deal.initiator.name : deal.partner.name;
    return _update(id, {
      status: STATUS.REJECTED,
      versions: [...deal.versions, {
        by: byMerchantId, byName, at: _now(), changes: {}, comment: reason || 'Abgelehnt', status: STATUS.REJECTED,
      }],
    });
  }

  function adminPublish(id) {
    const deal = getById(id);
    if (!deal || deal.status === STATUS.REJECTED) return null;
    const updated = _update(id, { status: STATUS.PUBLISHED, adminApproved: true });
    _publishToActive(updated);
    return updated;
  }

  function adminReject(id) { return _update(id, { status: STATUS.REJECTED }); }

  function _publishToActive(deal) {
    const c = deal.current;
    const active = (() => { try { return JSON.parse(localStorage.getItem('zam_pd2_active_deals') || '[]'); } catch { return []; } })();
    if (active.find(d => d._pdwId === deal.id)) return;
    active.unshift({
      id: 'pd2_' + Date.now(),
      _pdwId: deal.id,
      title: c.title,
      description: c.description,
      a: { id: deal.initiator.id, name: deal.initiator.name, icon: deal.initiator.icon, benefit: c.initiatorOffer, condition: c.initiatorCondition || '' },
      b: { id: deal.partner.id,   name: deal.partner.name,   icon: deal.partner.icon,   benefit: c.partnerOffer,   condition: c.partnerCondition   || '' },
      expires_at: c.periodEnd || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      participants: 0,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem('zam_pd2_active_deals', JSON.stringify(active));
  }

  return { STATUS, STATUS_LABEL, getAll, getById, getForMerchant, create, proposeChange, confirm, reject, adminPublish, adminReject };
})();

// ============================================================
// MERCHANT LIST HELPER
// ============================================================
function _pdwGetMerchants() {
  try {
    const invites = JSON.parse(localStorage.getItem('zamclub_merchant_invites') || '[]').filter(i => i.status === 'approved');
    if (invites.length) return invites.map(i => ({ id: i.id, name: i.shopname || i.name, icon: i.icon || '🏪' }));
  } catch {}
  // Fallback: demo merchants
  return [
    { id: 'mer_010', name: "Pit's Stop Burger", icon: '🍔' },
    { id: 'mer_019', name: 'Fit Star',           icon: '🏋️' },
    { id: 'mer_021', name: 'Alnatura',            icon: '🌿' },
    { id: 'mer_030', name: 'H&M',                icon: '👗' },
    { id: 'mer_031', name: 'Lido',               icon: '🎬' },
    { id: 'mer_035', name: 'Dunkin\'',           icon: '🍩' },
  ];
}

// ============================================================
// OPEN MAIN WORKFLOW PANEL
// ============================================================
function openPartnerDealWorkflow() {
  const me = ZAMApi.auth.currentUser();
  if (!me) return;

  let modal = document.getElementById('modal-pdw-main');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-pdw-main';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-sheet" style="max-height:94vh;overflow-y:auto;padding:0">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:10px;padding:18px 18px 0">
          <button onclick="closeModal('modal-pdw-main')" class="back-btn" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
          <div style="flex:1">
            <div style="font-size:0.95rem;font-weight:900;color:#fff">🤝 Partner-Deal Anfragen</div>
            <div style="font-size:0.62rem;color:rgba(255,255,255,0.35)">Gemeinsame Aktionen mit anderen Händlern</div>
          </div>
          <button onclick="openNewPartnerDealModal()" style="background:linear-gradient(135deg,#c43510,#FA4615);border:none;border-radius:10px;padding:8px 14px;color:#fff;font-size:0.75rem;font-weight:700;font-family:var(--font);cursor:pointer">+ Neu</button>
        </div>
        <!-- Tabs -->
        <div style="display:flex;gap:0;padding:14px 18px 0;border-bottom:1px solid rgba(255,255,255,0.07);overflow-x:auto">
          ${['incoming','outgoing','negotiating','confirmed','rejected'].map((t,i) => {
            const labels = ['Eingehend','Ausgehend','In Abstimmung','Bestätigt','Abgelehnt'];
            return `<button id="pdw-tab-${t}" onclick="_pdwSetTab('${t}')" style="white-space:nowrap;background:none;border:none;border-bottom:2px solid ${i===0?'#FA4615':'transparent'};color:${i===0?'#FA4615':'rgba(255,255,255,0.4)'};font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer;padding:8px 12px 10px;transition:color .2s">${labels[i]}</button>`;
          }).join('')}
        </div>
        <div id="pdw-tab-body" style="padding:16px;min-height:200px"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-pdw-main'); });
  }
  modal.classList.add('open');
  _pdwSetTab('incoming');
}

let _pdwCurrentTab = 'incoming';
function _pdwSetTab(tab) {
  _pdwCurrentTab = tab;
  ['incoming','outgoing','negotiating','confirmed','rejected'].forEach(t => {
    const btn = document.getElementById('pdw-tab-' + t);
    if (!btn) return;
    const active = t === tab;
    btn.style.borderBottomColor = active ? '#FA4615' : 'transparent';
    btn.style.color = active ? '#FA4615' : 'rgba(255,255,255,0.4)';
  });
  _pdwRenderTabBody(tab);
}

function _pdwRenderTabBody(tab) {
  const body = document.getElementById('pdw-tab-body');
  if (!body) return;
  const me = ZAMApi.auth.currentUser();
  const all = PDW.getForMerchant(me.id);
  const S = PDW.STATUS;

  const groups = {
    incoming:    all.filter(d => d.partner.id === me.id && [S.AWAITING_PARTNER, S.AWAITING_CONFIRM].includes(d.status)),
    outgoing:    all.filter(d => d.initiator.id === me.id && [S.SENT, S.AWAITING_PARTNER].includes(d.status)),
    negotiating: all.filter(d => [S.CHANGE_PROPOSED, S.AWAITING_CONFIRM, S.AWAITING_PARTNER].includes(d.status) && (d.partner.id === me.id || d.initiator.id === me.id)),
    confirmed:   all.filter(d => [S.BOTH_CONFIRMED, S.PUBLISHED].includes(d.status)),
    rejected:    all.filter(d => d.status === S.REJECTED),
  };

  const deals = groups[tab] || [];
  if (!deals.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px 0;color:rgba(255,255,255,0.3);font-size:0.82rem">Keine Einträge in dieser Kategorie</div>';
    return;
  }
  body.innerHTML = deals.map(d => _pdwDealCard(d, me.id)).join('');
}

function _pdwDealCard(d, myId) {
  const sl = PDW.STATUS_LABEL[d.status] || { text: d.status, color: '#94a3b8' };
  const isInitiator = d.initiator.id === myId;
  const other = isInitiator ? d.partner : d.initiator;
  const c = d.current;
  const lastVersion = d.versions[d.versions.length - 1];
  const S = PDW.STATUS;

  // Which actions can I take?
  const canConfirm = (d.status === S.AWAITING_PARTNER && !isInitiator && !d.partnerConfirmed) ||
                     (d.status === S.AWAITING_CONFIRM  &&  isInitiator && !d.initiatorConfirmed) ||
                     (d.status === S.BOTH_CONFIRMED);
  const canChange  = [S.AWAITING_PARTNER, S.AWAITING_CONFIRM, S.CHANGE_PROPOSED].includes(d.status);
  const canReject  = [S.AWAITING_PARTNER, S.AWAITING_CONFIRM, S.CHANGE_PROPOSED, S.SENT].includes(d.status);

  return `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px;margin-bottom:10px">
      <!-- Status + partner -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div style="font-size:1.4rem">${other.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.82rem;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.title)}</div>
          <div style="font-size:0.64rem;color:rgba(255,255,255,0.4)">${isInitiator ? 'An' : 'Von'} ${escHtml(other.name)}</div>
        </div>
        <div style="padding:3px 9px;border-radius:20px;font-size:0.6rem;font-weight:800;background:${sl.color}18;color:${sl.color};border:1px solid ${sl.color}44;white-space:nowrap">${sl.text}</div>
      </div>
      <!-- Offers -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="background:rgba(250,70,21,0.07);border:1px solid rgba(250,70,21,0.18);border-radius:10px;padding:8px">
          <div style="font-size:0.56rem;color:rgba(255,255,255,0.35);margin-bottom:2px">${escHtml(d.initiator.name)}</div>
          <div style="font-size:0.72rem;font-weight:700;color:#FA4615">${escHtml(c.initiatorOffer || '—')}</div>
        </div>
        <div style="background:rgba(247,171,0,0.07);border:1px solid rgba(247,171,0,0.18);border-radius:10px;padding:8px">
          <div style="font-size:0.56rem;color:rgba(255,255,255,0.35);margin-bottom:2px">${escHtml(d.partner.name)}</div>
          <div style="font-size:0.72rem;font-weight:700;color:#F7AB00">${escHtml(c.partnerOffer || 'Noch nicht angegeben')}</div>
        </div>
      </div>
      <!-- Period + last change -->
      <div style="display:flex;gap:8px;font-size:0.62rem;color:rgba(255,255,255,0.35);margin-bottom:10px;flex-wrap:wrap">
        ${c.periodStart ? `<span>📅 ${c.periodStart} – ${c.periodEnd || '?'}</span>` : ''}
        ${lastVersion ? `<span>⏱ Letzte Änderung: ${new Date(lastVersion.at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} von ${escHtml(lastVersion.byName)}</span>` : ''}
      </div>
      <!-- Confirmation badges -->
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <div style="padding:3px 8px;border-radius:20px;font-size:0.6rem;font-weight:700;background:${d.initiatorConfirmed?'rgba(52,211,153,0.15)':'rgba(255,255,255,0.06)'};color:${d.initiatorConfirmed?'#34d399':'rgba(255,255,255,0.35)'};border:1px solid ${d.initiatorConfirmed?'rgba(52,211,153,0.3)':'rgba(255,255,255,0.1)'}">${d.initiatorConfirmed?'✓':'○'} ${escHtml(d.initiator.name)}</div>
        <div style="padding:3px 8px;border-radius:20px;font-size:0.6rem;font-weight:700;background:${d.partnerConfirmed?'rgba(52,211,153,0.15)':'rgba(255,255,255,0.06)'};color:${d.partnerConfirmed?'#34d399':'rgba(255,255,255,0.35)'};border:1px solid ${d.partnerConfirmed?'rgba(52,211,153,0.3)':'rgba(255,255,255,0.1)'}">${d.partnerConfirmed?'✓':'○'} ${escHtml(d.partner.name)}</div>
      </div>
      <!-- Action buttons -->
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button onclick="openPartnerDealDetail('${d.id}')" style="flex:1;min-width:80px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:#e2e8f0;border-radius:10px;padding:9px;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer">Details &amp; Verlauf</button>
        ${canConfirm && d.status !== S.BOTH_CONFIRMED ? `<button onclick="_pdwConfirm('${d.id}')" style="flex:2;min-width:100px;background:linear-gradient(135deg,rgba(52,211,153,0.25),rgba(52,211,153,0.12));border:1px solid rgba(52,211,153,0.4);color:#34d399;border-radius:10px;padding:9px;font-size:0.72rem;font-weight:800;font-family:var(--font);cursor:pointer">✅ Bestätigen</button>` : ''}
        ${canChange ? `<button onclick="openProposeChangeModal('${d.id}')" style="flex:2;min-width:100px;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;border-radius:10px;padding:9px;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer">✏️ Änderung</button>` : ''}
        ${canReject ? `<button onclick="_pdwReject('${d.id}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;border-radius:10px;padding:9px 11px;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer">✕</button>` : ''}
      </div>
    </div>`;
}

// ============================================================
// CREATE NEW DEAL MODAL
// ============================================================
function openNewPartnerDealModal() {
  const me = ZAMApi.auth.currentUser();
  const merchants = _pdwGetMerchants().filter(m => m.id !== me?.id);

  let modal = document.getElementById('modal-pdw-new');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-pdw-new';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-pdw-new'); });
  }

  const inp = s => `style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:11px 14px;color:#fff;font-family:var(--font);font-size:0.82rem;outline:none;${s||''}"`;
  const lbl = t => `<label style="display:block;font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:rgba(255,255,255,0.4);margin:12px 0 5px">${t}</label>`;

  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:94vh;overflow-y:auto;padding:0">
      <div style="display:flex;align-items:center;gap:10px;padding:18px 18px 0;margin-bottom:16px">
        <button onclick="closeModal('modal-pdw-new')" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
        <div style="flex:1;font-size:0.95rem;font-weight:900;color:#fff">Neue Partnerdeal-Anfrage</div>
      </div>
      <div style="padding:0 18px 24px">
        ${lbl('Partner-Händler *')}
        <select id="pdw-new-partner" ${inp()}>
          <option value="">— Händler auswählen —</option>
          ${merchants.map(m => `<option value="${escHtml(m.id)}" data-icon="${escHtml(m.icon)}" data-name="${escHtml(m.name)}">${m.icon} ${escHtml(m.name)}</option>`).join('')}
        </select>
        ${lbl('Deal-Titel *')}
        <input id="pdw-new-title" type="text" placeholder="z.B. Fitness + Burger Kombi-Aktion" ${inp()} />
        ${lbl('Beschreibung *')}
        <textarea id="pdw-new-desc" rows="3" placeholder="Was ist die Idee hinter diesem Deal?" ${inp('resize:none')}></textarea>
        ${lbl('Dein Angebot / Beitrag *')}
        <input id="pdw-new-offer" type="text" placeholder="z.B. 20% Rabatt auf Monatsbeitrag für Neukunden" ${inp()} />
        ${lbl('Bedingung (optional)')}
        <input id="pdw-new-cond" type="text" placeholder="z.B. Nur für Neukunden, min. 3 Monate" ${inp()} />
        ${lbl('Gewünschter Rabatt / Prämie')}
        <input id="pdw-new-discount" type="text" placeholder="z.B. 15% Rabatt, 1 Gratis-Menü, …" ${inp()} />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>${lbl('Zeitraum von')}<input id="pdw-new-start" type="date" ${inp()} /></div>
          <div>${lbl('Zeitraum bis')}<input id="pdw-new-end"   type="date" ${inp()} /></div>
        </div>
        ${lbl('Nachricht an Partner')}
        <textarea id="pdw-new-msg" rows="2" placeholder="Kurze persönliche Nachricht an den Partner-Händler …" ${inp('resize:none')}></textarea>
        <div style="margin-top:14px">
          <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:rgba(255,255,255,0.4);margin-bottom:8px">📎 Medien (optional)</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <label style="flex:1;min-width:70px"><input type="radio" name="pdw-new-media-type" value="text" checked onchange="_onPDWMediaTypeChange()" style="display:none"><div class="_pdw_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(250,70,21,0.4);background:rgba(250,70,21,0.15);color:#FA4615;font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">Nur Text</div></label>
            <label style="flex:1;min-width:70px"><input type="radio" name="pdw-new-media-type" value="image" onchange="_onPDWMediaTypeChange()" style="display:none"><div class="_pdw_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">🖼 Bild</div></label>
            <label style="flex:1;min-width:70px"><input type="radio" name="pdw-new-media-type" value="video" onchange="_onPDWMediaTypeChange()" style="display:none"><div class="_pdw_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">📹 Video</div></label>
            <label style="flex:1;min-width:70px"><input type="radio" name="pdw-new-media-type" value="instagram" onchange="_onPDWMediaTypeChange()" style="display:none"><div class="_pdw_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">📸 Instagram</div></label>
            <label style="flex:1;min-width:70px"><input type="radio" name="pdw-new-media-type" value="tiktok" onchange="_onPDWMediaTypeChange()" style="display:none"><div class="_pdw_mtype_btn" style="padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);font-size:0.72rem;font-weight:700;text-align:center;cursor:pointer">🎵 TikTok</div></label>
          </div>
          <div id="pdw-new-media-url-wrap" style="display:none">
            <input id="pdw-new-media-url" type="url" placeholder="Link / URL eingeben" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:11px 13px;color:#fff;font-family:var(--font);font-size:0.82rem;outline:none">
          </div>
        </div>
        <div id="pdw-new-error" style="display:none;color:#f87171;font-size:0.76rem;margin-top:10px;padding:10px;background:rgba(239,68,68,0.1);border-radius:8px"></div>
        <button onclick="_pdwSubmitNew()" style="width:100%;margin-top:16px;background:linear-gradient(135deg,#c43510,#FA4615);border:none;border-radius:12px;padding:14px;color:#fff;font-size:0.88rem;font-weight:800;font-family:var(--font);cursor:pointer;box-shadow:0 4px 16px rgba(196,53,16,0.35)">
          🤝 Anfrage senden
        </button>
        <button type="button" onclick="closeModal('modal-pdw-new');openVideoDrehModal()" style="width:100%;box-sizing:border-box;background:rgba(250,70,21,0.08);border:1.5px solid rgba(250,70,21,0.35);border-radius:12px;padding:12px;color:#FA4615;font-size:0.8rem;font-weight:700;font-family:var(--font);cursor:pointer;margin-top:8px">🎥 Passendes Reel produzieren lassen</button>
      </div>
    </div>`;
  modal.classList.add('open');
}

function _pdwSubmitNew() {
  const me = ZAMApi.auth.currentUser();
  const sel  = document.getElementById('pdw-new-partner');
  const opt  = sel?.options[sel?.selectedIndex];
  const err  = document.getElementById('pdw-new-error');
  const v    = id => document.getElementById(id)?.value?.trim();

  const partnerId   = v('pdw-new-partner');
  const partnerName = opt?.dataset?.name || '';
  const partnerIcon = opt?.dataset?.icon || '🏪';
  const title       = v('pdw-new-title');
  const description = v('pdw-new-desc');
  const initiatorOffer = v('pdw-new-offer');

  if (!partnerId)     { _pdwShowError(err, 'Bitte einen Händler auswählen.'); return; }
  if (!title)         { _pdwShowError(err, 'Bitte einen Deal-Titel eingeben.'); return; }
  if (!initiatorOffer){ _pdwShowError(err, 'Bitte dein Angebot / deinen Beitrag eintragen.'); return; }

  const myMerchants = _pdwGetMerchants();
  const myData = myMerchants.find(m => m.id === me.id) || { id: me.id, name: me.display_name || me.name || 'Händler', icon: '🏪' };

  const mediaType = document.querySelector('input[name="pdw-new-media-type"]:checked')?.value || 'text';
  const mediaUrl  = (document.getElementById('pdw-new-media-url')?.value || '').trim();

  const deal = PDW.create({
    initiator: myData,
    partner:   { id: partnerId, name: partnerName, icon: partnerIcon },
    title, description,
    initiatorOffer,
    initiatorCondition: v('pdw-new-cond'),
    periodStart: v('pdw-new-start'),
    periodEnd:   v('pdw-new-end'),
    discount:    v('pdw-new-discount'),
    message:     v('pdw-new-msg'),
    media_type:  mediaType !== 'text' ? mediaType : undefined,
    media_url:   mediaType !== 'text' && mediaUrl ? mediaUrl : undefined,
  });

  if (typeof ZAMNotif !== 'undefined') {
    ZAMNotif.push({ icon: '🤝', title: 'Partnerdeal-Anfrage gesendet', body: `An ${partnerName}: "${title}"`, type: 'info' });
  }

  closeModal('modal-pdw-new');
  if (typeof showToast === 'function') showToast(`✅ Anfrage an ${partnerName} gesendet!`, 'success');

  // Refresh main panel if open
  if (document.getElementById('modal-pdw-main')?.classList.contains('open')) _pdwSetTab('outgoing');
  // Refresh dashboard section
  _pdwRefreshDashboard();
}

function _pdwShowError(el, msg) {
  if (!el) return;
  el.style.display = '';
  el.textContent = msg;
}

function _onPDWMediaTypeChange() {
  const selected = document.querySelector('input[name="pdw-new-media-type"]:checked')?.value || 'text';
  document.querySelectorAll('._pdw_mtype_btn').forEach(b => {
    const isActive = b.parentElement.querySelector('input').value === selected;
    b.style.background = isActive ? 'rgba(250,70,21,0.15)' : 'rgba(255,255,255,0.05)';
    b.style.color = isActive ? '#FA4615' : 'rgba(255,255,255,0.55)';
    b.style.border = isActive ? '1px solid rgba(250,70,21,0.4)' : '1px solid rgba(255,255,255,0.12)';
  });
  const wrap = document.getElementById('pdw-new-media-url-wrap');
  if (!wrap) return;
  wrap.style.display = selected === 'text' ? 'none' : 'block';
  const urlInput = document.getElementById('pdw-new-media-url');
  if (!urlInput) return;
  const placeholders = { image: 'Bild-URL (https://...)', video: 'Video-URL (https://...)', instagram: 'Instagram Reel-Link', tiktok: 'TikTok-Video-Link' };
  urlInput.placeholder = placeholders[selected] || 'URL';
}

// ============================================================
// DEAL DETAIL + HISTORY MODAL
// ============================================================
function openPartnerDealDetail(dealId) {
  const deal = PDW.getById(dealId);
  if (!deal) return;
  const me = ZAMApi.auth.currentUser();

  let modal = document.getElementById('modal-pdw-detail');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-pdw-detail';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-pdw-detail'); });
  }

  const sl = PDW.STATUS_LABEL[deal.status] || { text: deal.status, color: '#94a3b8' };
  const c = deal.current;
  const S = PDW.STATUS;
  const isInitiator = deal.initiator.id === me.id;
  const canConfirm = (deal.status === S.AWAITING_PARTNER && !isInitiator && !deal.partnerConfirmed) ||
                     (deal.status === S.AWAITING_CONFIRM  &&  isInitiator && !deal.initiatorConfirmed);
  const canChange  = [S.AWAITING_PARTNER, S.AWAITING_CONFIRM, S.CHANGE_PROPOSED].includes(deal.status);
  const canReject  = [S.AWAITING_PARTNER, S.AWAITING_CONFIRM, S.CHANGE_PROPOSED, S.SENT].includes(deal.status);

  const historyHtml = [...deal.versions].reverse().map((v, i) => {
    const isLatest = i === 0;
    const changeEntries = Object.entries(v.changes || {}).filter(([, val]) => val);
    return `
      <div style="position:relative;padding-left:20px;margin-bottom:14px">
        <div style="position:absolute;left:0;top:5px;width:8px;height:8px;border-radius:50%;background:${isLatest ? '#FA4615' : 'rgba(255,255,255,0.2)'}"></div>
        <div style="position:absolute;left:3.5px;top:13px;bottom:-14px;width:1px;background:rgba(255,255,255,0.08)"></div>
        <div style="font-size:0.68rem;font-weight:700;color:${isLatest ? '#e2e8f0' : 'rgba(255,255,255,0.5)'}">
          ${escHtml(v.byName)} · ${new Date(v.at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
        </div>
        ${v.comment ? `<div style="font-size:0.7rem;color:${isLatest?'#F7AB00':'rgba(255,255,255,0.35)'};margin-top:2px;font-style:italic">"${escHtml(v.comment)}"</div>` : ''}
        ${changeEntries.length ? `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
          ${changeEntries.slice(0, 4).map(([k, val]) => `<div style="padding:2px 8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:0.6rem;color:rgba(255,255,255,0.5)">${k}: ${escHtml(String(val).slice(0, 40))}</div>`).join('')}
        </div>` : ''}
      </div>`;
  }).join('');

  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:94vh;overflow-y:auto;padding:0">
      <div style="display:flex;align-items:center;gap:10px;padding:18px 18px 12px;border-bottom:1px solid rgba(255,255,255,0.07)">
        <button onclick="closeModal('modal-pdw-detail')" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.9rem;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.title)}</div>
          <div style="font-size:0.62rem;margin-top:2px"><span style="padding:2px 8px;border-radius:20px;font-size:0.6rem;font-weight:800;background:${sl.color}18;color:${sl.color};border:1px solid ${sl.color}44">${sl.text}</span></div>
        </div>
      </div>
      <div style="padding:16px">
        <!-- Parties -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="background:rgba(250,70,21,0.07);border:1px solid rgba(250,70,21,0.18);border-radius:12px;padding:12px">
            <div style="font-size:1.4rem">${deal.initiator.icon}</div>
            <div style="font-size:0.75rem;font-weight:800;color:#FA4615;margin-top:4px">${escHtml(deal.initiator.name)}</div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);margin-top:3px">${escHtml(c.initiatorOffer || '—')}</div>
            ${c.initiatorCondition ? `<div style="font-size:0.6rem;color:rgba(255,255,255,0.3);margin-top:2px">${escHtml(c.initiatorCondition)}</div>` : ''}
            <div style="margin-top:8px;padding:3px 8px;border-radius:20px;display:inline-block;font-size:0.6rem;font-weight:700;background:${deal.initiatorConfirmed?'rgba(52,211,153,0.15)':'rgba(255,255,255,0.06)'};color:${deal.initiatorConfirmed?'#34d399':'rgba(255,255,255,0.4)'}">${deal.initiatorConfirmed?'✓ Bestätigt':'○ Ausstehend'}</div>
          </div>
          <div style="background:rgba(247,171,0,0.07);border:1px solid rgba(247,171,0,0.18);border-radius:12px;padding:12px">
            <div style="font-size:1.4rem">${deal.partner.icon}</div>
            <div style="font-size:0.75rem;font-weight:800;color:#F7AB00;margin-top:4px">${escHtml(deal.partner.name)}</div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);margin-top:3px">${escHtml(c.partnerOffer || 'Noch nicht angegeben')}</div>
            ${c.partnerCondition ? `<div style="font-size:0.6rem;color:rgba(255,255,255,0.3);margin-top:2px">${escHtml(c.partnerCondition)}</div>` : ''}
            <div style="margin-top:8px;padding:3px 8px;border-radius:20px;display:inline-block;font-size:0.6rem;font-weight:700;background:${deal.partnerConfirmed?'rgba(52,211,153,0.15)':'rgba(255,255,255,0.06)'};color:${deal.partnerConfirmed?'#34d399':'rgba(255,255,255,0.4)'}">${deal.partnerConfirmed?'✓ Bestätigt':'○ Ausstehend'}</div>
          </div>
        </div>
        <!-- Description + period -->
        ${c.description ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px;margin-bottom:12px;font-size:0.76rem;color:rgba(255,255,255,0.55);line-height:1.6">${escHtml(c.description)}</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:0.68rem;color:rgba(255,255,255,0.4);margin-bottom:14px">
          ${c.periodStart ? `<span>📅 ${c.periodStart} – ${c.periodEnd || 'offen'}</span>` : ''}
          ${c.discount ? `<span>🎁 ${escHtml(c.discount)}</span>` : ''}
        </div>
        <!-- Actions -->
        ${canConfirm || canChange || canReject ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
          ${canConfirm ? `<button onclick="_pdwConfirm('${dealId}');closeModal('modal-pdw-detail')" style="flex:2;min-width:100px;background:linear-gradient(135deg,rgba(52,211,153,0.25),rgba(52,211,153,0.12));border:1px solid rgba(52,211,153,0.4);color:#34d399;border-radius:10px;padding:11px;font-size:0.78rem;font-weight:800;font-family:var(--font);cursor:pointer">✅ Bestätigen</button>` : ''}
          ${canChange ? `<button onclick="closeModal('modal-pdw-detail');openProposeChangeModal('${dealId}')" style="flex:2;min-width:100px;background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;border-radius:10px;padding:11px;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer">✏️ Änderung vorschlagen</button>` : ''}
          ${canReject ? `<button onclick="_pdwReject('${dealId}');closeModal('modal-pdw-detail')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;border-radius:10px;padding:11px 14px;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer">✕ Ablehnen</button>` : ''}
        </div>` : ''}
        <!-- History -->
        <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:800;color:rgba(255,255,255,0.3);margin-bottom:12px">📋 Änderungsverlauf (${deal.versions.length})</div>
        <div style="padding-bottom:4px">${historyHtml}</div>
      </div>
    </div>`;
  modal.classList.add('open');
}

// ============================================================
// PROPOSE CHANGE MODAL
// ============================================================
function openProposeChangeModal(dealId) {
  const deal = PDW.getById(dealId);
  if (!deal) return;
  const me = ZAMApi.auth.currentUser();
  const isInitiator = deal.initiator.id === me.id;
  const c = deal.current;

  let modal = document.getElementById('modal-pdw-change');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-pdw-change';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-pdw-change'); });
  }

  const inp = s => `style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:10px 13px;color:#fff;font-family:var(--font);font-size:0.82rem;outline:none;${s||''}"`;
  const lbl = t => `<label style="display:block;font-size:0.64rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:rgba(255,255,255,0.4);margin:10px 0 4px">${t}</label>`;
  const myRole = isInitiator ? 'Dein Angebot (als Anfragender)' : 'Dein Angebot (als Partner)';
  const myOffer = isInitiator ? c.initiatorOffer : c.partnerOffer;
  const myCond  = isInitiator ? c.initiatorCondition : c.partnerCondition;

  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:94vh;overflow-y:auto;padding:0">
      <div style="display:flex;align-items:center;gap:10px;padding:18px 18px 14px">
        <button onclick="closeModal('modal-pdw-change')" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
        <div style="flex:1;font-size:0.9rem;font-weight:900;color:#a78bfa">✏️ Änderung vorschlagen</div>
      </div>
      <div style="padding:0 18px 24px">
        <div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:0.72rem;color:rgba(255,255,255,0.5);line-height:1.5">
          Änderungen werden zurückgesendet. Der Partner muss erneut bestätigen.
        </div>
        ${lbl('Titel')}
        <input id="pdwc-title" type="text" value="${escHtml(c.title)}" ${inp()} />
        ${lbl('Beschreibung')}
        <textarea id="pdwc-desc" rows="3" ${inp('resize:none')}>${escHtml(c.description || '')}</textarea>
        ${lbl(myRole)}
        <input id="pdwc-myoffer" type="text" value="${escHtml(myOffer || '')}" placeholder="Dein Beitrag zum Deal" ${inp()} />
        ${lbl('Deine Bedingung')}
        <input id="pdwc-mycond" type="text" value="${escHtml(myCond || '')}" placeholder="Optional" ${inp()} />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>${lbl('Von')}<input id="pdwc-start" type="date" value="${c.periodStart||''}" ${inp()} /></div>
          <div>${lbl('Bis')}<input id="pdwc-end"   type="date" value="${c.periodEnd||''}"   ${inp()} /></div>
        </div>
        ${lbl('Kommentar / Begründung *')}
        <textarea id="pdwc-comment" rows="2" placeholder="Warum schlägst du diese Änderung vor?" ${inp('resize:none')}></textarea>
        <div id="pdwc-error" style="display:none;color:#f87171;font-size:0.75rem;margin-top:8px;padding:8px 12px;background:rgba(239,68,68,0.1);border-radius:8px"></div>
        <button onclick="_pdwSubmitChange('${dealId}')" style="width:100%;margin-top:14px;background:linear-gradient(135deg,rgba(167,139,250,0.3),rgba(167,139,250,0.15));border:1px solid rgba(167,139,250,0.4);border-radius:12px;padding:13px;color:#a78bfa;font-size:0.86rem;font-weight:800;font-family:var(--font);cursor:pointer">
          📤 Änderung senden
        </button>
      </div>
    </div>`;
  modal.classList.add('open');
  modal._dealId = dealId;
}

function _pdwSubmitChange(dealId) {
  const me = ZAMApi.auth.currentUser();
  const deal = PDW.getById(dealId);
  if (!deal) return;
  const isInitiator = deal.initiator.id === me.id;
  const v = id => document.getElementById(id)?.value?.trim();
  const comment = v('pdwc-comment');
  const errEl = document.getElementById('pdwc-error');
  if (!comment) { _pdwShowError(errEl, 'Bitte einen Kommentar zur Änderung eintragen.'); return; }

  const fields = {
    title: v('pdwc-title') || deal.current.title,
    description: v('pdwc-desc') || deal.current.description,
  };
  if (isInitiator) {
    fields.initiatorOffer     = v('pdwc-myoffer');
    fields.initiatorCondition = v('pdwc-mycond');
  } else {
    fields.partnerOffer     = v('pdwc-myoffer');
    fields.partnerCondition = v('pdwc-mycond');
  }
  if (v('pdwc-start')) fields.periodStart = v('pdwc-start');
  if (v('pdwc-end'))   fields.periodEnd   = v('pdwc-end');

  const myData = isInitiator ? deal.initiator : deal.partner;
  const updated = PDW.proposeChange(dealId, myData, fields, comment);
  const other = isInitiator ? deal.partner : deal.initiator;

  if (typeof ZAMNotif !== 'undefined') {
    ZAMNotif.push({ icon: '✏️', title: 'Änderung vorgeschlagen', body: `"${updated.current.title}" — bitte prüfen`, type: 'warn' });
  }
  closeModal('modal-pdw-change');
  if (typeof showToast === 'function') showToast(`📤 Änderung an ${other.name} gesendet`, 'success');
  _pdwRefreshDashboard();
  if (document.getElementById('modal-pdw-main')?.classList.contains('open')) _pdwSetTab(_pdwCurrentTab);
}

// ============================================================
// CONFIRM / REJECT
// ============================================================
function _pdwConfirm(dealId) {
  const me = ZAMApi.auth.currentUser();
  const updated = PDW.confirm(dealId, me.id);
  if (!updated) return;

  const sl = PDW.STATUS_LABEL[updated.status] || {};
  if (updated.status === PDW.STATUS.BOTH_CONFIRMED) {
    if (typeof ZAMNotif !== 'undefined') ZAMNotif.push({ icon: '🎉', title: 'Partnerdeal bestätigt!', body: `"${updated.current.title}" ist von beiden Händlern bestätigt.`, type: 'success' });
    if (typeof showToast === 'function') showToast('🎉 Beide Händler haben bestätigt — Deal wird veröffentlicht!', 'success');
  } else {
    if (typeof showToast === 'function') showToast('✅ Bestätigung gespeichert', 'success');
  }
  _pdwRefreshDashboard();
  if (document.getElementById('modal-pdw-main')?.classList.contains('open')) _pdwSetTab(_pdwCurrentTab);
}

function _pdwReject(dealId) {
  const me = ZAMApi.auth.currentUser();
  const deal = PDW.getById(dealId);
  if (!deal) return;
  const reason = prompt('Ablehnungsgrund (optional):') || 'Abgelehnt';
  PDW.reject(dealId, me.id, reason);
  if (typeof showToast === 'function') showToast('Anfrage abgelehnt.', 'info');
  _pdwRefreshDashboard();
  if (document.getElementById('modal-pdw-main')?.classList.contains('open')) _pdwSetTab(_pdwCurrentTab);
}

// ============================================================
// DASHBOARD SECTION (injected into merchant dashboard)
// ============================================================
function _pdwRefreshDashboard() {
  const me = ZAMApi.auth.currentUser();
  if (!me || me.role !== 'merchant') return;
  _pdwRenderDashboardSection(me);
}

function _pdwRenderDashboardSection(me) {
  let wrap = document.getElementById('pdw-dashboard-section');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'pdw-dashboard-section';
    wrap.style.cssText = 'border-top:1px solid rgba(255,255,255,0.05);padding:16px';
    const partnerSection = document.getElementById('partner-deals-section');
    if (partnerSection) partnerSection.parentNode.insertBefore(wrap, partnerSection);
    else {
      const kpi = document.getElementById('merchant-kpi-grid');
      if (kpi) kpi.parentNode.appendChild(wrap);
      else return;
    }
  }

  const deals = PDW.getForMerchant(me.id);
  const S = PDW.STATUS;
  const incoming = deals.filter(d => d.partner.id === me.id && [S.AWAITING_PARTNER, S.AWAITING_CONFIRM].includes(d.status));
  const active   = deals.filter(d => [S.BOTH_CONFIRMED, S.PUBLISHED].includes(d.status));
  const pending  = deals.filter(d => [S.AWAITING_PARTNER, S.AWAITING_CONFIRM, S.CHANGE_PROPOSED].includes(d.status));
  const SL = PDW.STATUS_LABEL;

  const incomingBadge = incoming.length ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:9px;background:#FA4615;color:#fff;font-size:0.6rem;font-weight:800;padding:0 4px;margin-left:6px">${incoming.length}</span>` : '';

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div>
        <div style="font-size:0.9rem;font-weight:800;color:#fff">🤝 Partnerdeal-Workflow${incomingBadge}</div>
        <div style="font-size:0.63rem;color:rgba(255,255,255,0.35);margin-top:2px">Beidseitige Freigabe · ${deals.length} Deal${deals.length !== 1 ? 's' : ''} gesamt</div>
      </div>
      <button onclick="openPartnerDealWorkflow()" style="background:rgba(250,70,21,0.15);border:1px solid rgba(250,70,21,0.3);border-radius:10px;padding:7px 12px;color:#ffb399;font-size:0.72rem;font-weight:700;font-family:var(--font);cursor:pointer">Alle anzeigen</button>
    </div>
    <!-- KPI strip -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px">
      <div style="background:rgba(247,171,0,0.08);border:1px solid rgba(247,171,0,0.18);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:1.2rem;font-weight:900;color:#F7AB00">${incoming.length}</div>
        <div style="font-size:0.58rem;color:rgba(255,255,255,0.4)">Eingehend</div>
      </div>
      <div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.18);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:1.2rem;font-weight:900;color:#a78bfa">${pending.length}</div>
        <div style="font-size:0.58rem;color:rgba(255,255,255,0.4)">In Abstimmung</div>
      </div>
      <div style="background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.18);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:1.2rem;font-weight:900;color:#34d399">${active.length}</div>
        <div style="font-size:0.58rem;color:rgba(255,255,255,0.4)">Aktiv/Bestätigt</div>
      </div>
    </div>
    <!-- Incoming requests (quick action) -->
    ${incoming.length ? incoming.slice(0, 2).map(d => `
      <div style="background:rgba(247,171,0,0.06);border:1px solid rgba(247,171,0,0.2);border-radius:12px;padding:12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="font-size:1.2rem">${d.initiator.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:0.78rem;font-weight:800;color:#F7AB00">📬 Neue Anfrage</div>
            <div style="font-size:0.7rem;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">"${escHtml(d.current.title)}"</div>
            <div style="font-size:0.62rem;color:rgba(255,255,255,0.4)">von ${escHtml(d.initiator.name)}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="openPartnerDealDetail('${d.id}')" style="flex:2;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:#e2e8f0;border-radius:8px;padding:8px;font-size:0.7rem;font-weight:700;font-family:var(--font);cursor:pointer">Details</button>
          <button onclick="_pdwConfirm('${d.id}')" style="flex:2;background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.3);color:#34d399;border-radius:8px;padding:8px;font-size:0.7rem;font-weight:800;font-family:var(--font);cursor:pointer">✅ Annehmen</button>
          <button onclick="openProposeChangeModal('${d.id}')" style="background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;border-radius:8px;padding:8px 10px;font-size:0.7rem;font-weight:700;font-family:var(--font);cursor:pointer">✏️</button>
          <button onclick="_pdwReject('${d.id}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;border-radius:8px;padding:8px 10px;font-size:0.7rem;font-weight:700;font-family:var(--font);cursor:pointer">✕</button>
        </div>
      </div>`).join('') : ''}
    <button onclick="openNewPartnerDealModal()" style="width:100%;background:linear-gradient(135deg,rgba(250,70,21,0.15),rgba(250,70,21,0.05));border:1px solid rgba(250,70,21,0.25);border-radius:12px;padding:11px;color:#ffb399;font-size:0.78rem;font-weight:700;font-family:var(--font);cursor:pointer;margin-top:${incoming.length?4:0}px">
      + Neue Partnerdeal-Anfrage senden
    </button>`;
}

// ============================================================
// ADMIN VIEW
// ============================================================
function openAdminPartnerDeals() {
  const me = ZAMApi.auth.currentUser();
  if (me?.role !== 'admin') return;

  let modal = document.getElementById('modal-pdw-admin');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-pdw-admin';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-pdw-admin'); });
  }
  modal.classList.add('open');
  _renderAdminPDW();
}

function _renderAdminPDW() {
  const modal = document.getElementById('modal-pdw-admin');
  if (!modal) return;
  const all = PDW.getAll();
  const SL = PDW.STATUS_LABEL;
  const S = PDW.STATUS;

  modal.innerHTML = `
    <div class="modal-sheet" style="max-height:94vh;overflow-y:auto;padding:0">
      <div style="display:flex;align-items:center;gap:10px;padding:18px 18px 12px;border-bottom:1px solid rgba(255,255,255,0.07)">
        <button onclick="closeModal('modal-pdw-admin')" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">←</button>
        <div style="flex:1;font-size:0.9rem;font-weight:900;color:#fff">🛡 Admin: Partnerdeal-Anfragen</div>
      </div>
      <div style="padding:16px">
        <!-- Summary -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px">
          ${[
            { label: 'Gesamt',           val: all.length,                                                   color: '#94a3b8' },
            { label: 'In Abstimmung',    val: all.filter(d => [S.AWAITING_PARTNER,S.AWAITING_CONFIRM,S.CHANGE_PROPOSED].includes(d.status)).length, color: '#f59e0b' },
            { label: 'Veröffentlicht',   val: all.filter(d => d.status === S.PUBLISHED).length,             color: '#34d399' },
          ].map(k => `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:10px;text-align:center"><div style="font-size:1.3rem;font-weight:900;color:${k.color}">${k.val}</div><div style="font-size:0.6rem;color:rgba(255,255,255,0.35)">${k.label}</div></div>`).join('')}
        </div>
        ${all.length === 0 ? '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.3);font-size:0.82rem">Noch keine Partnerdeal-Anfragen</div>' :
          all.map(d => {
            const sl = SL[d.status] || { text: d.status, color: '#94a3b8' };
            const canPublish = d.status === S.BOTH_CONFIRMED && !d.adminApproved;
            return `
              <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px;margin-bottom:10px">
                <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:0.82rem;font-weight:800;color:#fff">${escHtml(d.current.title)}</div>
                    <div style="font-size:0.64rem;color:rgba(255,255,255,0.4);margin-top:2px">${d.initiator.icon} ${escHtml(d.initiator.name)} + ${d.partner.icon} ${escHtml(d.partner.name)}</div>
                    <div style="margin-top:4px"><span style="padding:2px 8px;border-radius:20px;font-size:0.6rem;font-weight:800;background:${sl.color}18;color:${sl.color};border:1px solid ${sl.color}44">${sl.text}</span></div>
                  </div>
                  <div style="font-size:0.6rem;color:rgba(255,255,255,0.25)">${new Date(d.createdAt).toLocaleDateString('de-DE')}</div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button onclick="openPartnerDealDetail('${d.id}')" style="flex:1;min-width:80px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:#e2e8f0;border-radius:8px;padding:8px;font-size:0.7rem;font-weight:700;font-family:var(--font);cursor:pointer">Details</button>
                  ${canPublish ? `<button onclick="PDW.adminPublish('${d.id}');_renderAdminPDW();showToast('✅ Deal veröffentlicht','success')" style="flex:2;background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.3);color:#34d399;border-radius:8px;padding:8px;font-size:0.7rem;font-weight:800;font-family:var(--font);cursor:pointer">🚀 Freigeben</button>` : ''}
                  ${d.status !== S.REJECTED && d.status !== S.PUBLISHED ? `<button onclick="PDW.adminReject('${d.id}');_renderAdminPDW();showToast('Deal pausiert','info')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;border-radius:8px;padding:8px 10px;font-size:0.7rem;font-weight:700;font-family:var(--font);cursor:pointer">✕ Ablehnen</button>` : ''}
                </div>
              </div>`;
          }).join('')}
      </div>
    </div>`;
}

// ============================================================
// WIRE INTO renderMerchantDashboard
// ============================================================
(function _pdwHookMerchantDash() {
  const _origRMD = typeof renderMerchantDashboard !== 'undefined' ? renderMerchantDashboard : null;
  if (!_origRMD) return;
  // Patch: append PDW section after existing render
  const _patchedRMD = function() {
    _origRMD.apply(this, arguments);
    const me = ZAMApi.auth.currentUser();
    if (me && me.role === 'merchant' && me.merchant_status !== 'pending') {
      setTimeout(() => _pdwRenderDashboardSection(me), 50);
    }
  };
  // Only override if not already patched
  if (typeof window !== 'undefined' && !window._pdwPatched) {
    window._pdwPatched = true;
    window.renderMerchantDashboard = _patchedRMD;
  }
})();

// ============================================================
// WIRE PUSH NOTIFICATIONS ON LOAD
// ============================================================
(function _pdwCheckIncoming() {
  setTimeout(() => {
    const me = typeof ZAMApi !== 'undefined' ? ZAMApi.auth.currentUser() : null;
    if (!me || me.role !== 'merchant') return;
    const S = PDW.STATUS;
    const incoming = PDW.getForMerchant(me.id).filter(d =>
      d.partner.id === me.id && [S.AWAITING_PARTNER].includes(d.status) && !d._notified
    );
    incoming.forEach(d => {
      if (typeof ZAMNotif !== 'undefined') {
        ZAMNotif.push({ icon: '🤝', title: 'Neue Partnerdeal-Anfrage', body: `${d.initiator.name}: "${d.current.title}"`, type: 'info' });
      }
      // Mark notified
      const all = PDW.getAll();
      const idx = all.findIndex(x => x.id === d.id);
      if (idx >= 0) { all[idx]._notified = true; localStorage.setItem('zam_pdw_deals', JSON.stringify(all)); }
    });
  }, 1200);
})();
