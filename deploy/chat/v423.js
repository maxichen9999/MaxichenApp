/* =====================================================================
 *  🧭 v423.js — V4.23: Bottom-Nav mit vier Tabs (Struktur wie WhatsApp)
 * ---------------------------------------------------------------------
 *  ⚠️ Abweichung, bewusst und dokumentiert:
 *  Die STRUKTUR ist wie WhatsApp (Chats · Aktuelles · Communitys · Anrufe,
 *  runde Aktions-Buttons, „Aktiv"-Karte, „Letzte"-Liste). Die FARBEN sind
 *  NICHT wie WhatsApp: kein #00a884, kein #111b21 — aktiv ist pink
 *  (#ff4da6 mit Glow), inaktiv gedecktes Lila. Das ist deine Vorgabe
 *  vom 26.10., nicht meine Erfindung.
 *
 *  Vorgehen: app.js bleibt unangetastet. Diese Datei
 *   · tauscht die vier Nav-Knöpfe
 *   · legt eine Tab-Fläche (#tabHost) über die Chat-Liste
 *   ·zeichnet Aktuelles / Communitys / Anrufe mit echten Serverdaten
 *   · lässt den Chats-Tab exakt der bestehende Chat-Bildschirm sein
 * ===================================================================== */
(function () {
  'use strict';

  const NAV = {
    tab: 'chats',
    filter: 'all',
    home: null,
    communities: null,
    channels: null,
    calls: null,
    moments: null,
    busy: false,
  };

  const TABS = [
    { id: 'chats', icon: '💬', label: 'Chats' },
    { id: 'aktuelles', icon: '⭕', label: 'Aktuelles' },
    { id: 'communitys', icon: '👥', label: 'Communitys' },
    { id: 'anrufe', icon: '📞', label: 'Anrufe' },
    // 📱 V4.28: fünfter Reiter wie bei WhatsApp
    { id: 'profile', icon: '👤', label: 'Profil' },
  ];

  /* ---------------- Helfer ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const esc2 = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function timeShort(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    const same = d.toDateString() === now.toDateString();
    const y = new Date(now.getTime() - 86400000);
    const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (same) return 'Heute ' + hh;
    if (d.toDateString() === y.toDateString()) return 'Gestern ' + hh;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + hh;
  }
  function dur(sec) {
    const s = Math.max(0, Number(sec) || 0);
    if (!s) return 'keine Dauer';
    if (s < 60) return s + ' Sek';
    const m = Math.floor(s / 60), r = s % 60;
    return m + ' Min' + (r ? ' ' + r + ' Sek' : '');
  }

  /* ---------------- Navigation bauen ---------------- */
  function buildNav() {
    const nav = $('#glassNav');
    if (!nav) return;
    nav.innerHTML = TABS.map(
      (t) => `<button class="gnItem ${t.id === NAV.tab ? 'on' : ''}" data-gn="${t.id}">
        <span class="i">${t.icon}</span><span>${t.label}</span>
        <span class="gnBadge hidden" data-badge="${t.id}"></span>
      </button>`
    ).join('');
    nav.querySelectorAll('.gnItem').forEach((btn) => {
      btn.onclick = () => switchTab(btn.dataset.gn);
    });
  }

  function setBadge(id, n) {
    const el = document.querySelector(`[data-badge="${id}"]`);
    if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n || '');
    el.classList.toggle('hidden', !n);
  }

  function host() {
    let h = $('#tabHost');
    if (h) return h;
    h = document.createElement('div');
    h.id = 'tabHost';
    h.className = 'hidden';
    const app = $('#appScreen');
    (app || document.body).appendChild(h);
    return h;
  }

  function switchTab(id) {
    NAV.tab = id;
    document.querySelectorAll('#glassNav .gnItem').forEach((b) => b.classList.toggle('on', b.dataset.gn === id));
    const h = host();
    const app = $('#appScreen');

    // 📱 V4.28: Profil ist eine eigene Seite (v428.js), kein Tab-Host
    const profEl = document.getElementById('lcProfileTab');
    if (id === 'profile') {
      h.classList.add('hidden');
      if (app) { app.classList.add('tabbed'); app.classList.remove('show-chat'); }
      try { if (S.activeChat) closeChat(); } catch (e) {}
      if (window.LC428 && typeof window.LC428.profileTab === 'function') window.LC428.profileTab();
      return;
    }
    if (profEl) profEl.style.display = 'none';

    if (id === 'chats') {
      h.classList.add('hidden');
      if (app) app.classList.remove('tabbed');
      try { if (S.activeChat) closeChat(); } catch (e) {}
      try { renderChatList(); } catch (e) {}
      loadHome();
      return;
    }

    if (app) {
      app.classList.add('tabbed');
      app.classList.remove('show-chat');
    }
    try { if (S.activeChat) closeChat(); } catch (e) {}
    h.classList.remove('hidden');
    h.innerHTML = `<div class="tabLoading">${id === 'anrufe' ? '📞' : id === 'communitys' ? '👥' : '⭕'} lädt…</div>`;

    if (id === 'aktuelles') renderAktuelles(h);
    else if (id === 'communitys') renderCommunitys(h);
    else if (id === 'anrufe') renderAnrufe(h);
    loadHome();
  }

  /* ---------------- Daten laden ---------------- */
  async function loadHome() {
    try {
      const d = await api('/home');
      NAV.home = d.counts || {};
      setBadge('chats', NAV.home.unread || 0);
      setBadge('aktuelles', NAV.home.moments || 0);
      setBadge('communitys', NAV.home.communities || 0);
      setBadge('anrufe', NAV.home.missed || 0);
    } catch (e) {}
  }

  /* ================= TAB: AKTUELLES ================= */
  async function renderAktuelles(el) {
    /* Status kommt aus dem BESTEHENDEN System (app.js: loadStatus → ST.groups
       mit mine/allSeen, Viewer openStatusView, Composer openStatusComposer).
       Ich baue das nicht nach — sonst gäbe es zwei Wahrheiten. */
    let channels = { mine: [], discover: [] };
    try { if (typeof loadStatus === 'function') await loadStatus(); } catch (e) {}
    try { channels = await api('/channels'); } catch (e) {}
    NAV.channels = channels;

    const groups = (typeof ST !== 'undefined' && ST.groups) ? ST.groups : [];
    const mine = groups.find((g) => g.mine);
    const othersAll = groups.filter((g) => !g.mine);
    const others = othersAll.slice(0, 10); // Reihe bleibt lesbar; Rest über den Status-Bildschirm
    NAV.moments = groups;

    el.innerHTML = `
      <div class="tabHead"><b>Aktuelles</b></div>
      <div class="tabScroll">
        <div class="secLabel">Status</div>
        <div class="statusRow">
          <div class="stRing" data-st="mine">
            <div class="stAv ${mine && (mine.moments || []).length ? '' : 'seen'}">${S.user && String(S.user.avatar || '').startsWith('data:') ? `<img src="${esc2(S.user.avatar)}">` : esc2((S.user && S.user.avatar) || '💗')}${mine && (mine.moments || []).length ? '' : '<span class="stPlus">+</span>'}</div>
            <span>Mein Status</span>
          </div>
          ${others.map((g) => `<div class="stRing" data-st="${esc2(g.userId)}">
            <div class="stAv ${g.allSeen ? 'seen' : ''}">${esc2((g.user && g.user.avatar) || '💗')}</div>
            <span>${esc2(String((g.user && g.user.displayName) || 'Status').split(' ')[0])}</span>
          </div>`).join('')}
          ${othersAll.length > 10 ? `<div class="stRing"><div class="stAv seen">+${othersAll.length - 10}</div><span>mehr</span></div>` : ''}
        </div>
        ${others.length ? '' : '<div class="tabHint">Noch kein Status von anderen — tippe auf „Mein Status" 💗</div>'}

        <div class="secLabel row"><span>Kanäle</span><button class="miniGhost" id="chDiscover">⊞ Entdecken</button></div>
        <div id="chList" class="chList">${
          (channels.mine || []).length
            ? channels.mine.map((c) => channelRow(c)).join('')
            : '<div class="tabHint">Du folgst noch keinem Kanal. Tippe auf „Entdecken" ✨</div>'
        }</div>
        ${(channels.discover || []).length ? `<div class="secLabel">Zum Entdecken</div><div class="chList">${dedupeNames(channels.discover).slice(0, 3).map((c) => channelRow(c, true)).join('')}</div>` : ''}
      </div>`;

    // Klick auf einen Ring → vorhandener Viewer / Composer
    el.querySelectorAll('.stRing[data-st]').forEach((n) => {
      n.onclick = () => {
        const uid = n.dataset.st;
        try {
          if (uid === 'mine') {
            const g = (ST.groups || []).find((x) => x.mine);
            if (g && (g.moments || []).length) openStatusView('mine', 0);
            else openStatusComposer();
          } else openStatusView(uid, 0);
        } catch (e) { toast('🌸', 'Status', ''); }
      };
    });

    el.querySelectorAll('.chRow').forEach((r) => {
      r.onclick = async () => {
        const id = r.dataset.id;
        if (r.dataset.join === '1') {
          try { await api('/chats/' + id + '/join', { method: 'POST', body: {} }); toast('📢', 'Kanal', 'Du folgst jetzt 💗'); renderAktuelles(el); }
          catch (e) { toast('💔', 'Fehler', e.message); }
        } else { try { openChat(id); } catch (e) {} }
      };
    });
    const disc = $('#chDiscover', el);
    if (disc) disc.onclick = () => { try { openModal2 ? null : null; } catch (e) {} const inp = document.getElementById('searchInput'); if (inp) { document.querySelector('#glassNav [data-gn="chats"]').click(); inp.focus(); toast('📢', 'Kanäle entdecken', 'Suche nach einem Kanalnamen'); } };
  }

  /** Gleicher Name = gleicher Kanal. Test-Reste sollen die Liste nicht fluten. */
  function dedupeNames(list) {
    const seen = new Set();
    return (list || []).filter((c) => {
      const k = String(c.name || '').toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function channelRow(c, join) {
    return `<div class="chRow" data-id="${esc2(c.id)}" data-join="${join ? '1' : '0'}">
      <div class="chAv">${esc2(c.avatar || '📢')}</div>
      <div class="chBody"><b>${esc2(c.name)}</b><small>${c.lastText ? esc2(c.lastText) : esc2((c.followers || 0) + ' Abonnenten')}</small></div>
      <div class="chMeta">${c.lastAt ? timeShort(c.lastAt).split(' ')[1] || '' : join ? 'Folgen' : ''}</div>
    </div>`;
  }

  /* ================= TAB: COMMUNITYS ================= */
  async function renderCommunitys(el) {
    let data = { mine: [], discover: [] };
    try { data = await api('/communities'); } catch (e) {}
    NAV.communities = data;

    const card = (c) => `
      <div class="commBox">
        <div class="commHead">
          <div class="chAv">${esc2(c.avatar || '🏰')}</div>
          <div class="commTitle"><b>${esc2(c.name)}</b><small>${c.memberCount} Mitglieder · ${c.groupCount} Gruppen</small></div>
          ${c.isMember ? '<span class="commTag">dabei</span>' : `<button class="miniGhost joinComm" data-id="${esc2(c.id)}">Beitreten</button>`}
        </div>
        ${(c.groups || []).slice(0, 4).map((g) => `
          <div class="subRow" data-gid="${esc2(g.id)}">
            <div class="chAv sm">${esc2(g.avatar)}</div>
            <div class="chBody"><b>${esc2(g.name)}</b><small>${g.count} Mitglieder</small></div>
            <span class="chev">›</span>
          </div>`).join('')}
        ${c.isMember ? `<button class="miniGhost addGroup" data-id="${esc2(c.id)}">＋ Gruppe</button>` : ''}
        ${(c.groups || []).length > 4 ? `<button class="miniGhost allComm" data-id="${esc2(c.id)}">Alle ansehen ›</button>` : ''}
      </div>`;

    el.innerHTML = `
      <div class="tabHead"><b>Communitys</b><button class="miniGhost" id="commNew">＋ Neue Community</button></div>
      <div class="tabScroll">
        ${(data.mine || []).length ? dedupeNames(data.mine).map(card).join('') : '<div class="tabHint">Du bist in keiner Community.<br>Erstelle eine — Gruppen, Ankündigungen, alles an einem Ort 💗</div>'}
        ${(data.discover || []).length ? `<div class="secLabel">Entdecken</div>${dedupeNames(data.discover).slice(0, 3).map(card).join('')}` : ''}
      </div>`;

    el.querySelectorAll('.subRow').forEach((r) => (r.onclick = () => { try { openChat(r.dataset.gid); } catch (e) {} }));
    el.querySelectorAll('.joinComm').forEach((b) => (b.onclick = async (ev) => {
      ev.stopPropagation();
      try { await api('/communities/' + b.dataset.id + '/join', { method: 'POST', body: {} }); toast('🏰', 'Community', 'Du bist dabei 💗'); renderCommunitys(el); }
      catch (e) { toast('💔', 'Fehler', e.message); }
    }));
    el.querySelectorAll('.allComm').forEach((b) => (b.onclick = () => { try { modalCommunities(); } catch (e) {} }));
    el.querySelectorAll('.addGroup').forEach((b) => (b.onclick = async (ev) => {
      ev.stopPropagation();
      const name = prompt('Name der neuen Gruppe:', 'Neue Gruppe');
      if (!name) return;
      try { await api('/communities/' + b.dataset.id + '/groups', { method: 'POST', body: { name } }); toast('👥', 'Gruppe', '„' + name + '" ist da 💗'); renderCommunitys(el); }
      catch (e) { toast('💔', 'Gruppe', e.message); }
    }));
    const neu = $('#commNew', el);
    if (neu) neu.onclick = () => { try { modalCommunities(); } catch (e) { toast('🏰', 'Communitys', ''); } };
  }

  /* ================= TAB: ANRUFE ================= */
  async function renderAnrufe(el) {
    let hist = { calls: [] }, live = null;
    try { hist = await api('/calls/history?limit=50'); } catch (e) {}
    NAV.calls = hist;
    try {
      const d = await api('/calls/live');
      live = (d.calls || [])[0] || null;
    } catch (e) {}

    const row = (c) => {
      const miss = c.status === 'missed' && c.direction === 'in';
      const ico = c.kind === 'video' ? '📹' : '📞';
      const durTxt = c.status === 'answered' ? dur(c.durationSec) : c.status === 'missed' ? 'verpasst' : 'abgelehnt';
      return `<div class="callRow" data-chat="${esc2(c.chatId)}" data-peer="${esc2(c.peerId || '')}" data-kind="${c.kind}">
        <div class="chAv">${esc2(c.avatar)}</div>
        <div class="chBody">
          <b class="${miss ? 'missName' : ''}">${esc2(c.name)}${(window.LCVerify && c.peerId && LCVerify.isVerified(c.peerId)) ? LCVerify.tick(13) : ''}</b>
          <small>${c.direction === 'in' ? '↙ ' : '↗ '}${timeShort(c.startedAt)} · ${durTxt}</small>
        </div>
        <span class="callIco ${miss ? 'miss' : ''}">${ico}</span>
      </div>`;
    };

    el.innerHTML = `
      <div class="tabHead"><b>Anrufe</b></div>
      <div class="tabScroll">
        <div class="callActions">
          <button class="callAct" data-a="call"><span>📞</span>Anrufen</button>
          <button class="callAct" data-a="plan"><span>📅</span>Planen</button>
          <button class="callAct" data-a="pad"><span>⌨️</span>Tastenfeld</button>
          <button class="callAct" data-a="group"><span>👥</span>Gruppe</button>
        </div>

        ${live ? `<div class="liveCard" id="liveCard">
            <div class="liveTop"><span class="liveDot"></span><b>Aktiver ${live.kind === 'video' ? 'Videoanruf' : 'Anruf'}</b></div>
            <div class="liveName">${esc2(live.chatName || 'Gruppe')}</div>
            <div class="liveAvs">${(live.participants || []).slice(0, 7).map((p) => `<span class="liveAv">${esc2(p.avatar || '💗')}</span>`).join('')}</div>
            <button class="liveJoin" data-chat="${esc2(live.chatId)}">Beitreten</button>
          </div>` : ''}

        <div class="secLabel">Letzte</div>
        <div id="callList">${(hist.calls || []).length ? hist.calls.map(row).join('') : '<div class="tabHint">Noch keine Anrufe.<br>Tippe auf „Anrufen" 💗</div>'}</div>
      </div>`;

    el.querySelectorAll('.callAct').forEach((b) => (b.onclick = () => callAction(b.dataset.a, el)));
    const lj = $('#liveCard .liveJoin', el);
    if (lj) lj.onclick = () => { try { openChat(lj.dataset.chat); } catch (e) {} };
    el.querySelectorAll('.callRow').forEach((r) => (r.onclick = () => {
      const chatId = r.dataset.chat;
      if (!chatId) return;
      startCall(chatId, r.dataset.kind || 'voice');
    }));
  }

  function callAction(a, el) {
    if (a === 'call') {
      try { modalNewChat ? modalNewChat() : null; } catch (e) {}
      const b = document.querySelector('[data-act="newchat"]');
      if (b) b.click();
      return;
    }
    if (a === 'plan') { toast('📅', 'Anruf planen', 'Termin im Chat festlegen — öffne den Chat und tippe auf Termin'); return; }
    if (a === 'pad') { modalKeypad(); return; }
    if (a === 'group') {
      try { modalNewChat(); } catch (e) {}
      return;
    }
  }

  /** 1:1-Anruf starten und im Verlauf protokollieren. */
  async function startCall(chatId, kind) {
    const d = S.details[chatId];
    let peerId = null;
    if (d && d.chat && d.chat.type === 'private') peerId = (d.members || []).find((m) => m.id !== S.user.id)?.id || null;
    try {
      await api('/calls/log', { method: 'POST', body: { chatId, kind, direction: 'out', status: 'answered', peerId, durationSec: 0 } });
    } catch (e) {}
    try {
      if (typeof openChat === 'function') await openChat(chatId);
    } catch (e) {}
    try {
      if (typeof startWebRTCCall === 'function') startWebRTCCall(chatId, kind === 'video');
      else if (typeof callPeer === 'function') callPeer(chatId, kind === 'video');
      else toast('📞', 'Anruf', 'Anruf gestartet — Wähloberfläche im Chat');
    } catch (e) { toast('💔', 'Anruf', e.message); }
  }

  function modalKeypad() {
    openModal(`<div class="mTitle">⌨️ Tastenfeld</div>
      <input id="kpNum" inputmode="tel" placeholder="+49 …" style="width:100%;padding:14px;border-radius:16px;border:2px solid var(--line);font-size:20px;text-align:center;font-weight:800">
      <button class="btnMain" id="kpGo" style="margin-top:12px">📞 Anrufen</button>`);
    $('#kpGo').onclick = () => {
      const v = String($('#kpNum').value || '').replace(/[^\d+]/g, '');
      if (v.length < 6) return toast('💔', 'Nummer', 'Zu kurz');
      const hit = Object.values(S.details || {}).map((d) => (d.members || []).find((m) => (m.phone || '').replace(/[^\d+]/g, '') === v)).find(Boolean);
      if (!hit) return toast('🔍', 'Nicht gefunden', 'Kein Kontakt mit dieser Nummer');
      openModal(`<div class="mTitle">📞 ${esc2(hit.displayName)}</div><p style="text-align:center;color:var(--muted);font-weight:700">Anruf starten?</p>`);
      const go = document.createElement('button');
      go.className = 'btnMain'; go.textContent = '📞 Jetzt anrufen';
      go.onclick = () => { closeModal(); const chat = Object.values(S.details || {}).find((d) => (d.members || []).some((m) => m.id === hit.id)); if (chat) startCall(chat.chat.id, 'voice'); };
      document.querySelector('.modalCard').appendChild(go);
    };
  }

  /* ================= Chats-Tab: „Ungelesen" + Zähler ================= */
  const origData = window.chatListData;
  if (typeof origData === 'function') {
    window.chatListData = function () {
      let list = origData.apply(this, arguments);
      if (NAV.filter === 'unread') list = list.filter((c) => (c.unread || 0) > 0);
      return list;
    };
  }

  function decorateChatChips() {
    // Zähler auf die Filter-Chips schreiben (Alle · Ungelesen · Gruppen)
    const chips = document.querySelectorAll('#tabBar .tab, #chips .chip, .chips .chip');
    if (!chips.length) return;
    chips.forEach((ch) => {
      const label = ch.innerText.trim().split('\\n')[0];
      if (/^ungelesen/i.test(label)) ch.dataset.role = 'unread';
    });
  }

  /* ================= Start ================= */
  function boot() {
    buildNav();
    // Chats-Tab bleibt Standard; Zähler laden
    loadHome();
    setInterval(loadHome, 45000);

    // Profil-Banner („Maxichen × Lovechen") über den Wrapper in modalProfile
    ensureProfileBanner();

    // Deep-Link: #anrufe / #communitys / #aktuelles
    const h = (location.hash || '').replace('#', '');
    if (TABS.some((t) => t.id === h) && h !== 'chats') switchTab(h);
  }

  /**
   * Das Profil-Fenster wird mit `$('#btnMyProfile').onclick = modalProfile`
   * verdrahtet (app.js:3092) — der Klick hält die FUNKTION, nicht den Namen.
   * Ein Wrapper um window.modalProfile läuft deshalb nie. Also: den
   * Modal-Container beobachten und den Banner einhängen, wenn er auftaucht.
   */
  function watchProfileModal() {
    const root = document.getElementById('modalRoot');
    if (!root || root.__v423watch) return;
    root.__v423watch = true;
    const inject = () => {
      const card = root.querySelector('.mcard');
      if (!card || card.querySelector('.profBanner')) return;
      const t = card.querySelector('.mTitle');
      if (!t || !/Mein Profil/i.test(t.innerText || '')) return;
      // `const S` liegt nicht auf window (nur im Script-Scope) — gleicher Fehler wie in v422.
      const me = (typeof S !== 'undefined' && S.user) || {};
      card.insertAdjacentHTML('afterbegin', `<div class="profBanner">
        <div class="pbTop">MAXICHEN × LOVECHEN</div>
        <div class="pbSub">DEVELOPER · contact@maxichen.de</div>
        <div class="pbName">${esc2(me.displayName || '')} <span class="pbAt">@${esc2(me.username || '')}</span></div>
      </div>`);
    };
    new MutationObserver(inject).observe(root, { childList: true, subtree: true });
  }

  function ensureProfileBanner() {
    watchProfileModal();
    const orig = window.modalProfile;
    if (typeof orig !== 'function' || orig.__v423) return;
    const wrapped = function () {
      const r = orig.apply(this, arguments);
      try {
        const card = document.querySelector('#modalRoot .mcard');
        if (card && !card.querySelector('.profBanner')) {
          // `const S` liegt nicht auf window (nur im Script-Scope) — gleicher Fehler wie in v422.
      const me = (typeof S !== 'undefined' && S.user) || {};
          card.insertAdjacentHTML('afterbegin', `<div class="profBanner">
            <div class="pbTop">MAXICHEN × LOVECHEN</div>
            <div class="pbSub">DEVELOPER · contact@maxichen.de</div>
            <div class="pbName">${esc2(me.displayName || '')} <span class="pbAt">@${esc2(me.username || '')}</span></div>
          </div>`);
        }
      } catch (e) {}
      return r;
    };
    wrapped.__v423 = true;
    window.modalProfile = wrapped;
  }

  window.LCNav = { NAV, switchTab, loadHome, startCall, boot };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 800); // nach enterApp erneut (Nav kann neu gerendert sein)
})();
