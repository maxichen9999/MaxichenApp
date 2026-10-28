/* =====================================================================
 *  🔍 v431.js — Suchen & Merken (Oberfläche, V4.31)
 * ---------------------------------------------------------------------
 *
 *   ① Suche im Chat   — Lupe im Chat-Kopf → Leiste mit Trefferzähler,
 *                       ▲/▼ zum Durchblättern, Treffer wird angesprungen
 *                       und kurz pink umrandet.
 *   ② Überall-Suche   — derselbe Balken, Umschalter „Überall": findet
 *                       Nachrichten in allen eigenen Chats.
 *   ③ Gemerkt (⭐)     — Bildschirm mit allen gemerkten Nachrichten,
 *                       liegt pro Nutzer auf dem Server (nicht im Browser).
 *
 *  Der Stern im Nachrichtenmenü rief vorher nur localStorage — jetzt
 *  landet er auf dem Server (POST /api/v431/star) und ist Geräte-übergreifend.
 * ===================================================================== */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const M = { open: false, scope: 'chat', q: '', hits: [], idx: -1, timer: null, lastTotal: 0 };

  /* app.js deklariert `const S` und `function api` im globalen Bereich.
   * `const` landet NICHT auf window — deshalb hier ueber den Namen gehen. */
  const apiFn = (...a) => (typeof api === 'function' ? api(...a) : Promise.reject(new Error('api fehlt')));
  const toastFn = (i, t, x) => { try { if (typeof toast === 'function') toast(i, t, x || ''); } catch (e) { /* egal */ } };
  const hasS = () => typeof S !== 'undefined' && !!S;

  /* ---------------- CSS (einmal einhängen) ---------------- */
  function injectCss() {
    if (document.getElementById('v431css')) return;
    const st = document.createElement('style');
    st.id = 'v431css';
    st.textContent = `
#chatSearchBar{background:rgba(255,255,255,.97);border-bottom:2px solid #ffd9ec;padding:8px 10px 10px;display:flex;flex-direction:column;gap:8px;z-index:6;box-shadow:0 8px 20px rgba(255,77,166,.10)}
#chatSearchBar.hidden{display:none}
.csbRow{display:flex;align-items:center;gap:7px}
#csbInput{flex:1;min-width:0;border:2px solid #ffd0e0;border-radius:12px;padding:9px 12px;font-family:inherit;font-size:14px;font-weight:700;color:#43203a;background:#fff8fc;outline:none}
#csbInput:focus{border-color:#ff4d94;box-shadow:0 0 0 3px rgba(255,77,148,.15)}
#csbCount{font-size:12px;font-weight:900;color:#c2187a;min-width:44px;text-align:center;white-space:nowrap}
.csbBtn{width:32px;height:32px;border-radius:10px;border:2px solid #ffd0e0;background:#fff;color:#c2187a;font-weight:900;cursor:pointer;font-size:13px;line-height:1}
.csbBtn:active{transform:scale(.94)}
#csbClose{border-color:#ffd0e0;background:#ffeef6}
.csbScope{display:flex;gap:6px}
.csbScope button{border:2px solid #ffd9ec;background:#fff;color:#a5748f;font-family:inherit;font-weight:900;font-size:11.5px;padding:5px 11px;border-radius:99px;cursor:pointer}
.csbScope button.on{background:linear-gradient(135deg,#ff4da6,#a855f7);border-color:transparent;color:#fff;box-shadow:0 6px 16px rgba(255,77,166,.30)}
#chatSearchHits{max-height:46vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
#chatSearchHits:empty{display:none}
.csbHit{display:flex;gap:9px;align-items:center;padding:8px 10px;border-radius:12px;background:#fff6fb;border:2px solid #ffe2f0;cursor:pointer}
.csbHit:hover{border-color:#ff8fc8}
.csbHit.on{border-color:#ff4d94;box-shadow:0 0 0 3px rgba(255,77,148,.16)}
.csbHit .av{width:32px;height:32px;border-radius:10px;background:#fff0f7;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:16px;flex:0 0 auto}
.csbHit .av img{width:100%;height:100%;object-fit:cover}
.csbHit .tx{flex:1;min-width:0}
.csbHit .tx b{display:block;font-size:12.5px;color:#43203a;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.csbHit .tx span{display:block;font-size:12px;color:#8b5a76;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.csbHit .tx span mark{background:#ffd6ec;color:#a3005c;border-radius:4px;padding:0 2px}
.csbEmpty{font-size:12.5px;font-weight:800;color:#a5748f;padding:10px 4px;text-align:center}
@keyframes hitFlash{0%{box-shadow:0 0 0 0 rgba(255,77,148,.85)}70%{box-shadow:0 0 0 10px rgba(255,77,148,0)}100%{box-shadow:0 0 0 0 rgba(255,77,148,0)}}
/* Treffer wird UMRANDET, nicht übermalt — sonst verschwindet die weiße Schrift. */
.msgRow.msgHit .bubble{outline:3px solid #ff2d78;outline-offset:2px;animation:hitFlash 1.3s ease-out 2}
/* ---- Gemerkt-Bildschirm ---- */
#lcStarred{position:fixed;inset:0;z-index:70;background:linear-gradient(170deg,#fff5fa,#ffeaf6 55%,#f6ebff);overflow-y:auto;display:none}
#lcStarred .stHead{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:14px 14px;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);border-bottom:2px solid #ffd9ec}
#lcStarred .stHead b{font-family:'Baloo 2',cursive;font-size:17px;font-weight:900;color:#43203a}
#lcStarred .stHead small{margin-left:auto;font-size:12px;font-weight:900;color:#c2187a}
#lcStarred .stBack{width:34px;height:34px;border-radius:11px;border:2px solid #ffd0e0;background:#fff;color:#c2187a;font-size:16px;cursor:pointer}
.stItem{display:flex;gap:10px;padding:11px 14px;border-bottom:1px solid #ffe2f0;cursor:pointer;background:#fff}
.stItem:active{background:#fff2f9}
.stItem .av{width:40px;height:40px;border-radius:12px;background:#fff0f7;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:19px;flex:0 0 auto}
.stItem .av img{width:100%;height:100%;object-fit:cover}
.stItem .tx{flex:1;min-width:0}
.stItem .tx b{display:block;font-size:13px;color:#43203a;font-weight:900}
.stItem .tx p{margin:2px 0 0;font-size:12.5px;color:#7a5b6e;font-weight:700;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.stItem .tx i{font-style:normal;font-size:11px;color:#b98aab;font-weight:800}
.stItem .del{border:none;background:none;font-size:15px;cursor:pointer;color:#d9a8c4;padding:4px}
.stFoot{text-align:center;font-size:11.5px;font-weight:800;color:#b98aab;padding:16px 20px 40px}
`;
    document.head.appendChild(st);
  }

  /* ---------------- Bausteine ---------------- */
  function ava(av) {
    const a = String(av || '💬');
    if (/^(data:image\/|\/media\/|\/assets\/|https?:)/.test(a)) return `<img src="${esc(a)}" alt="">`;
    return esc(a);
  }

  function mark(text, q) {
    const t = esc(text);
    if (!q) return t;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return t.replace(re, '<mark>$1</mark>');
  }

  function fmtAgo(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const heute = new Date().toDateString() === d.toDateString();
    const zeit = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (heute) return zeit;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' · ' + zeit;
  }

  /* ---------------- ① Suche im Chat: Leiste ---------------- */
  function ensureBar() {
    if (document.getElementById('chatSearchBar')) return;
    const view = document.getElementById('chatView');
    if (!view) return;
    const head = document.getElementById('chatHeader');
    const bar = document.createElement('div');
    bar.id = 'chatSearchBar';
    bar.className = 'hidden';
    bar.innerHTML = `
      <div class="csbRow">
        <input id="csbInput" placeholder="Suche in Nachrichten …" autocomplete="off">
        <span id="csbCount">—</span>
        <button class="csbBtn" id="csbUp" title="Vorheriger Treffer">▲</button>
        <button class="csbBtn" id="csbDown" title="Nächster Treffer">▼</button>
        <button class="csbBtn" id="csbClose" title="Suche schließen">✕</button>
      </div>
      <div class="csbScope">
        <button data-scope="chat" class="on">Dieser Chat</button>
        <button data-scope="all">Überall</button>
      </div>
      <div id="chatSearchHits"></div>`;
    head.insertAdjacentElement('afterend', bar);

    const inp = bar.querySelector('#csbInput');
    inp.addEventListener('input', () => {
      clearTimeout(M.timer);
      M.timer = setTimeout(() => run(inp.value), 260);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    });
    bar.querySelector('#csbClose').onclick = close;
    bar.querySelector('#csbUp').onclick = () => step(-1);
    bar.querySelector('#csbDown').onclick = () => step(1);
    bar.querySelectorAll('.csbScope button').forEach((b) => {
      b.onclick = () => {
        M.scope = b.dataset.scope;
        bar.querySelectorAll('.csbScope button').forEach((x) => x.classList.toggle('on', x === b));
        run(inp.value);
      };
    });
  }

  function open() {
    injectCss();
    ensureBar();
    const bar = $('#chatSearchBar');
    if (!bar) return;
    M.open = true;
    bar.classList.remove('hidden');
    const inp = $('#csbInput');
    inp.value = '';
    $('#chatSearchHits').innerHTML = '';
    $('#csbCount').textContent = '—';
    M.hits = []; M.idx = -1;
    setTimeout(() => inp.focus(), 60);
  }

  function close() {
    M.open = false;
    const bar = $('#chatSearchBar');
    if (bar) bar.classList.add('hidden');
    document.querySelectorAll('.msgRow.msgHit').forEach((r) => r.classList.remove('msgHit'));
  }

  function setCount() {
    const el = $('#csbCount');
    if (!el) return;
    if (!M.q) { el.textContent = '—'; return; }
    if (!M.hits.length) { el.textContent = '0'; return; }
    el.textContent = (M.idx >= 0 ? (M.idx + 1) : '–') + '/' + (M.lastTotal || M.hits.length);
  }

  function renderHits() {
    const box = $('#chatSearchHits');
    if (!box) return;
    if (!M.q) { box.innerHTML = ''; return; }
    if (!M.hits.length) {
      box.innerHTML = `<div class="csbEmpty">Nichts gefunden 💔 — anderer Begriff?</div>`;
      return;
    }
    box.innerHTML = M.hits.map((h, i) => `
      <div class="csbHit ${i === M.idx ? 'on' : ''}" data-i="${i}">
        <div class="av">${ava(h.chatAvatar)}</div>
        <div class="tx">
          <b>${esc(M.scope === 'all' ? h.chatName : (h.senderName || h.chatName))} · ${fmtAgo(h.createdAt)}</b>
          <span>${mark(h.text, M.q)}</span>
        </div>
      </div>`).join('') + (M.lastTotal > M.hits.length
      ? `<div class="csbEmpty">${M.lastTotal - M.hits.length} weitere — Begriff eingrenzen 🔍</div>` : '');
    box.querySelectorAll('.csbHit').forEach((el) => {
      el.onclick = () => { M.idx = Number(el.dataset.i); renderHits(); goTo(M.hits[M.idx]); };
    });
  }

  async function run(q) {
    const text = String(q || '').trim();
    M.q = text;
    if (text.length < 2) { M.hits = []; M.idx = -1; M.lastTotal = 0; renderHits(); setCount(); return; }
    const chatId = (hasS() && S.activeChat) || '';
    if (M.scope === 'chat' && !chatId) return;
    try {
      const url = '/v431/search?q=' + encodeURIComponent(text) + (M.scope === 'chat' ? '&chatId=' + encodeURIComponent(chatId) : '');
      const d = await apiFn(url);
      M.hits = d.hits || [];
      M.lastTotal = d.total || M.hits.length;
    } catch (e) {
      M.hits = []; M.lastTotal = 0;
      toastFn('💔', 'Suche fehlgeschlagen', e.message || '');
    }
    M.idx = M.hits.length ? 0 : -1;
    renderHits(); setCount();
    if (M.idx === 0) goTo(M.hits[0], true);
  }

  function step(dir) {
    if (!M.hits.length) return;
    M.idx = (M.idx + dir + M.hits.length) % M.hits.length;
    renderHits(); setCount();
    goTo(M.hits[M.idx]);
  }

  /* ---------------- Springen + Markieren ---------------- */
  async function goTo(hit, still) {
    if (!hit) return;
    if (!hasS()) return;
    if (S.activeChat !== hit.chatId) {
      try { await openChat(hit.chatId); } catch (e) { /* egal */ }
    }
    let row = document.querySelector(`.msgRow[data-mid="${hit.msgId}"]`);
    if (!row) {
      // ältere Nachricht: einmal frisch laden (bis 100) und erneut versuchen
      try {
        const d = await apiFn('/chats/' + hit.chatId + '/messages?limit=100');
        S.messages[hit.chatId] = d.messages;
        renderMessages(hit.chatId, false);
        row = document.querySelector(`.msgRow[data-mid="${hit.msgId}"]`);
      } catch (e) { /* egal */ }
    }
    if (!row) {
      if (!still) toastFn('⬆️', 'Weiter oben im Chat', 'Sie liegt außerhalb der geladenen Nachrichten — bitte nach oben scrollen 💗');
      return;
    }
    document.querySelectorAll('.msgRow.msgHit').forEach((r) => r.classList.remove('msgHit'));
    row.classList.add('msgHit');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => row.classList.remove('msgHit'), 3200);
  }

  /* ---------------- ③ Gemerkt (⭐) ---------------- */
  function ensureStarredHost() {
    let host = document.getElementById('lcStarred');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lcStarred';
      document.body.appendChild(host);
    }
    return host;
  }

  async function starredScreen() {
    injectCss();
    const host = ensureStarredHost();
    host.style.display = 'block';
    host.innerHTML = `
      <div class="stHead">
        <button class="stBack" id="stBack">←</button>
        <b>⭐ Gemerkt</b>
        <small id="stCount">…</small>
      </div>
      <div id="stList"><div class="stFoot">Lade …</div></div>`;
    host.querySelector('#stBack').onclick = () => { host.style.display = 'none'; };

    let items = [];
    try {
      const d = await apiFn('/v431/starred');
      items = d.items || [];
    } catch (e) {
      host.querySelector('#stList').innerHTML = `<div class="stFoot">Konnte nicht laden: ${esc(e.message || '')}</div>`;
      return;
    }
    host.querySelector('#stCount').textContent = items.length + (items.length === 1 ? ' Nachricht' : ' Nachrichten');
    const list = host.querySelector('#stList');
    if (!items.length) {
      list.innerHTML = `<div class="stFoot">Noch nichts gemerkt ⭐<br>Nachricht lange drücken → „Merken"</div>`;
      return;
    }
    list.innerHTML = items.map((it, i) => `
      <div class="stItem" data-i="${i}">
        <div class="av">${ava(it.chatAvatar)}</div>
        <div class="tx">
          <b>${esc(it.chatName)}${it.chatType === 'channel' ? ' 📢' : ''}</b>
          <p>${esc(it.text)}</p>
          <i>${esc(it.senderName)} · ${fmtAgo(it.createdAt)}</i>
        </div>
        <button class="del" data-del="${i}" title="Nicht mehr merken">🗑</button>
      </div>`).join('') + `<div class="stFoot">${items.length} gemerkt · gespeichert auf dem Server 💗</div>`;

    list.querySelectorAll('.stItem').forEach((el) => {
      el.onclick = async (e) => {
        if (e.target.closest('[data-del]')) return;
        host.style.display = 'none';
        const it = items[Number(el.dataset.i)];
        await goTo({ chatId: it.chatId, msgId: it.msgId });
      };
    });
    list.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const it = items[Number(b.dataset.del)];
        await apiFn(`/v431/star/${encodeURIComponent(it.chatId)}/${encodeURIComponent(it.msgId)}`, { method: 'DELETE' });
        toastFn('🗑', 'Nicht mehr gemerkt', '');
        starredScreen();
      };
    });
  }

  /* ---------------- Stern an/aus ---------------- */
  async function toggleStar(chatId, msgId) {
    try {
      const d = await apiFn('/v431/star', { method: 'POST', body: { chatId, msgId } });
      toastFn('⭐', d.starred ? 'Gemerkt' : 'Nicht mehr gemerkt', d.starred ? 'Profil → ⭐ Gemerkt' : '');
      return d;
    } catch (e) {
      toastFn('💔', 'Merken fehlgeschlagen', e.message || '');
      return null;
    }
  }

  /* ---------------- Start ---------------- */
  function boot() {
    injectCss();
    const btn = document.getElementById('btnChatSearch');
    if (btn) btn.onclick = () => (M.open ? close() : open());
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && hasS() && S.activeChat) {
        e.preventDefault(); open();
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.LC431 = { open, close, run, step, goTo, starredScreen, toggleStar, state: M };
})();
