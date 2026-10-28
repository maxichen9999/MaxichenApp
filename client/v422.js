/* =====================================================================
 *  ✅ v422.js — Haken + KI-Label in der Oberfläche  (V4.22)
 * ---------------------------------------------------------------------
 *  Warum eine eigene Datei und keine Änderungen in app.js?
 *  app.js hat 3819 Zeilen und rendert an ~12 Stellen Namen. Statt überall
 *  Template-Strings anzufassen, umhüllen wir die vier Funktionen, die
 *  Namen zeichnen (renderChatList, renderHeader, renderSub, bubbleHtml).
 *  Ein Fehler hier kann die Oberfläche nicht zerlegen — im schlimmsten
 *  Fall fehlt der Haken.
 *
 *  Die Wahrheit kommt vom Server: /api/verify/summary liefert nur Konten,
 *  deren Haken serverseitig signierbar ist (2FA vorhanden, ECDSA-Schlüssel).
 *  Der Browser glaubt keinem Flag aus dem HTML.
 * ===================================================================== */
(function () {
  'use strict';

  const VF = { map: {}, ki: null, ready: false, tries: 0 };

  /* Das Material-„verified"-Siegel (Apache-2.0), 1:1 wie WhatsApp. */
  const TICK_PATH =
    'M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z';

  function tickSvg(size) {
    const s = size || 15;
    return `<svg class="vTick" width="${s}" height="${s}" viewBox="0 0 24 24" aria-label="Verifiziert" role="img"><path fill="#1D9BF0" d="${TICK_PATH}"/></svg>`;
  }
  function kiPill(small) {
    return `<span class="kiPill${small ? ' small' : ''}" title="Künstliche Intelligenz — kein Mensch">✨ KI</span>`;
  }

  function info(userId) { return (userId && VF.map[userId]) || null; }
  function isVerified(userId) { return !!info(userId); }
  function isAI(userId) { const i = info(userId); return !!(i && i.isAI); }

  /* ---------- Server fragen ---------- */
  async function loadVerify() {
    // `const S` aus app.js liegt NICHT auf window — nur im Script-Scope.
    if (typeof S === 'undefined' || !S.token) return;
    try {
      const d = await api('/verify/summary');
      VF.map = d.verified || {};
      VF.ki = d.ki || null;
      VF.ready = true;
      paint();
    } catch (e) {
      // Still: kein Haken ist besser als ein falscher Haken.
      if (VF.tries++ < 3) setTimeout(loadVerify, 1500);
    }
  }

  /* ---------- Nachzeichnen ---------- */
  function paint() {
    try { if (typeof renderChatList === 'function') renderChatList(); } catch (e) {}
    try { if (S.activeChat && typeof renderHeader === 'function') renderHeader(); } catch (e) {}
    try { if (S.activeChat && typeof renderMessages === 'function') renderMessages(S.activeChat, false); } catch (e) {}
  }

  /* ---------- 1. Chat-Liste ---------- */
  const origChatList = window.renderChatList;
  window.renderChatList = function () {
    const r = origChatList.apply(this, arguments);
    try {
      document.querySelectorAll('#chatList .chatItem').forEach((el) => {
        const c = S.chats.find((x) => x.id === el.dataset.id);
        if (!c) return;
        const otherId = (c.type === 'private')
          ? (c.members || []).find((id) => id !== S.user.id)
          : null;
        if (!otherId || !isVerified(otherId)) return;
        const b = el.querySelector('.crow1 b');
        if (!b || b.querySelector('.vTick')) return;
        b.insertAdjacentHTML('beforeend', tickSvg(14) + (isAI(otherId) ? kiPill(true) : ''));
      });
    } catch (e) {}
    return r;
  };

  /* ---------- 2. Chat-Kopf ---------- */
  const origHeader = window.renderHeader;
  window.renderHeader = function () {
    const r = origHeader.apply(this, arguments);
    try {
      const d = activeDetails();
      if (!d) return r;
      const nameEl = document.getElementById('chatName');
      const other = d.chat.type === 'private' ? d.members.find((m) => m.id !== S.user.id) : null;
      if (!nameEl || !other || !isVerified(other.id)) return r;
      nameEl.innerHTML = `<span class="cnWrap">${esc(d.chat.name)}${tickSvg(17)}${isAI(other.id) ? kiPill(false) : ''}</span>`;
    } catch (e) {}
    return r;
  };

  /* ---------- 3. Untertitel: „Offizielles Konto" ---------- */
  const origSub = window.renderSub;
  window.renderSub = function () {
    const r = origSub.apply(this, arguments);
    try {
      const d = activeDetails();
      if (!d || d.chat.type !== 'private') return r;
      const other = d.members.find((m) => m.id !== S.user.id);
      const sub = document.getElementById('chatSub');
      if (!other || !sub || !isVerified(other.id)) return r;
      const online = !!other.online;
      sub.innerHTML = isAI(other.id)
        ? `<span class="subOfficial">KI &middot; Offizielles Konto</span>${online ? ' · <span class="subOnline">online 💗</span>' : ''}`
        : `<span class="subOfficial">Offizielles Konto</span>${online ? ' · <span class="subOnline">online 💗</span>' : ''}`;
    } catch (e) {}
    return r;
  };

  /* ---------- 4. Sprechblasen: Name + Fußzeile ---------- */
  const origBubble = window.bubbleHtml;
  window.bubbleHtml = function (m) {
    const html = origBubble.apply(this, arguments);
    try {
      if (!m || m.deleted || !isVerified(m.senderId)) return html;
      const box = document.createElement('div');
      box.innerHTML = html;

      // Name (nur in Gruppen sichtbar) → Haken + KI davor
      const nm = box.querySelector('.msgName');
      if (nm) nm.insertAdjacentHTML('beforeend', tickSvg(13) + (isAI(m.senderId) ? kiPill(true) : ''));

      // Fußzeile: „KI ✨ 17:23" — genau wie im Screenshot
      const meta = box.querySelector('.mmeta');
      if (meta && isAI(m.senderId) && !meta.querySelector('.kiFoot')) {
        meta.insertAdjacentHTML('afterbegin', '<span class="kiFoot">KI ✨</span> ');
        const bubble = box.querySelector('.bubble');
        if (bubble && !bubble.querySelector('.kiSign')) {
          bubble.insertAdjacentHTML('beforeend', `<div class="kiSign">${esc((VF.ki && VF.ki.signature) || '© Maxichen 2026')}</div>`);
        }
      }
      return box.innerHTML;
    } catch (e) {
      return html;
    }
  };

  /* ---------- 5. Eigenes Profil ---------- */
  const origProfile = window.modalProfile;
  window.modalProfile = function () {
    const r = origProfile.apply(this, arguments);
    try {
      const me = S.user;
      if (!me || !isVerified(me.id)) return r;
      const t = document.querySelector('.modalCard .mTitle');
      if (t && !t.querySelector('.vTick')) {
        t.insertAdjacentHTML('beforeend', ' ' + tickSvg(19) + (isAI(me.id) ? ' ' + kiPill(false) : ''));
      }
    } catch (e) {}
    return r;
  };

  /* ---------- 6. Nach dem Login automatisch laden ---------- */
  const origEnter = window.enterApp;
  if (typeof origEnter === 'function') {
    window.enterApp = function () {
      const r = origEnter.apply(this, arguments);
      loadVerify();
      return r;
    };
  }
  // Schon eingeloggt (Seite neu geladen)? Dann direkt.
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof S !== 'undefined' && S.token) setTimeout(loadVerify, 300);
  });
  setTimeout(() => { if (typeof S !== 'undefined' && S.token && !VF.ready) loadVerify(); }, 600);

  window.LCVerify = { load: loadVerify, info, isVerified, isAI, map: () => VF.map, tick: tickSvg, state: VF };
})();
