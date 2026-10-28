/* =====================================================================
 *  📢 v425.js — V4.25 „Offizieller Lovechen Kanal" (Oberfläche)
 * ---------------------------------------------------------------------
 *  Was diese Datei tut (und was sie NICHT tut):
 *    ✅ hängt den offiziellen Kanal GANZ OBEN in „Aktuelles" (gepinnt)
 *    ✅ zeigt den blauen Haken über das vorhandene window.LCVerify.tick()
 *       — der Haken kommt aus einer ECHTEN Signatur, nicht aus einem Flag
 *    ✅ öffnet eine Kanal-Ansicht: Header, Beiträge, Reaktionen, Folgen
 *    ✅ Inhaber sieht Eingabefeld · alle anderen „Nur Admins können schreiben"
 *    ✅ Inhaber kann einen Beitrag für ALLE löschen
 *
 *    ❌ fasst app.js NICHT an (kein Umbau des Renderers)
 *    ❌ färbt nichts grün — aktiv bleibt pink #ff4da6
 *
 *  Einhängen ohne app.js anzufassen: MutationObserver auf #tabHost. Sobald
 *  die Kanäle-Liste (#chList) gerendert ist, wird die Karte eingehängt.
 *  Das ist derselbe Weg wie beim Profil-Banner in V4.19 — bewährt.
 * ===================================================================== */
(function () {
  'use strict';

  const OFFICIAL_ID = 'c_lovechen_official';
  const REACTIONS = ['❤️', '😍', '😂', '😮', '😢', '🙏'];
  const ST = { channel: null, messages: [], canPost: false, busy: false, open: false };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function tick(size) {
    try {
      if (window.LCVerify && window.LCVerify.tick) return window.LCVerify.tick(size || 15);
    } catch (e) {}
    // Fallback: gleicher Pfad, gleiche Farbe — falls v422.js nicht geladen ist
    const P = 'M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z';
    return `<svg class="vTick" width="${size || 15}" height="${size || 15}" viewBox="0 0 24 24" aria-label="Verifiziert" role="img"><path fill="#1D9BF0" d="${P}"/></svg>`;
  }

  function timeHi(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------------- CSS (pink, Glow, kein Grün) ---------------- */

  function injectCss() {
    if (document.getElementById('v425css')) return;
    const css = `
/* ===== V4.25 — Offizieller Kanal ===== */
.chPinned{display:flex;align-items:center;gap:12px;padding:12px;border-radius:20px;margin:6px 2px 10px;
  background:linear-gradient(135deg,#fff2f9 0%,#ffe6f4 55%,#f3e8ff 100%);
  border:2px solid #ff4da6;box-shadow:0 6px 20px rgba(255,77,166,.28),0 0 0 4px rgba(255,77,166,.10);
  cursor:pointer;position:relative;overflow:hidden}
.chPinned:active{transform:scale(.99)}
.chPinned::after{content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(circle at 12% 0%,rgba(255,77,166,.14),transparent 60%)}
.chPinAv{width:50px;height:50px;min-width:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:25px;background:linear-gradient(135deg,#ffd6ec,#e6ccff);border:2px solid #fff;
  box-shadow:0 0 14px rgba(255,77,166,.55)}
.chPinBody{flex:1;min-width:0}
.chPinRow{display:flex;align-items:center;gap:5px}
.chPinRow b{font-size:15px;color:#43203a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chPinSub{font-size:11.5px;color:#a5748f;font-weight:700;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chOffTag{position:absolute;top:8px;right:10px;font-size:9px;font-weight:900;letter-spacing:.5px;
  color:#fff;background:linear-gradient(135deg,#ff4da6,#b06bff);padding:3px 8px;border-radius:999px;
  box-shadow:0 2px 8px rgba(255,77,166,.45)}

/* ---- Kanal-Ansicht ---- */
#chView{position:fixed;inset:0;z-index:60;background:linear-gradient(170deg,#fff5fa 0%,#ffeaf5 45%,#f6ebff 100%);
  display:flex;flex-direction:column}
#chView.hidden{display:none}
.chHead{display:flex;align-items:center;gap:10px;padding:12px 14px;
  background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border-bottom:2px solid #ffd9ec;flex:0 0 auto}
.chBack{width:38px;height:38px;border-radius:12px;background:#ffeef5;font-size:19px;display:flex;align-items:center;justify-content:center}
.chHeadAv{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#ffd6ec,#e6ccff);
  display:flex;align-items:center;justify-content:center;font-size:22px;flex:0 0 auto;overflow:hidden}
.chHeadBody{flex:1;min-width:0}
.chHeadName{display:flex;align-items:center;gap:5px;font-weight:800;font-size:15.5px;color:#43203a;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chHeadSub{font-size:11.5px;color:#a5748f;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chFollow{border:2px solid #ff4da6;color:#e6197d;background:#fff;font-weight:900;font-size:12px;
  padding:8px 14px;border-radius:999px;box-shadow:0 3px 12px rgba(255,77,166,.25)}
.chFollow.on{background:linear-gradient(135deg,#ff4da6,#b06bff);color:#fff;border-color:transparent}
.chScroll{flex:1;overflow-y:auto;padding:14px 12px 22px}
.chInfoCard{background:#fff;border-radius:18px;padding:13px 14px;margin-bottom:14px;
  box-shadow:0 4px 16px rgba(255,77,148,.12);border:1.5px solid #ffe0ef}
.chInfoCard p{font-size:13px;color:#6d4a60;font-weight:600;line-height:1.5}
.chInfoMeta{display:flex;gap:14px;margin-top:9px;font-size:11.5px;color:#a5748f;font-weight:800}
.chMsg{background:#fff;border-radius:18px 18px 18px 6px;padding:12px 14px;margin-bottom:10px;
  box-shadow:0 4px 14px rgba(255,77,148,.12);border-left:3px solid #ff4da6}
.chMsgText{font-size:14px;color:#43203a;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.chMsgMeta{margin-top:7px;font-size:10.5px;color:#b58aa6;font-weight:800;display:flex;align-items:center;gap:6px}
.chDel{margin-left:auto;font-size:10.5px;color:#e6197d;font-weight:900;background:#fff0f6;
  border-radius:999px;padding:3px 9px}
.chReacts{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.chReact{display:inline-flex;align-items:center;gap:4px;background:#fff6fb;border:1.5px solid #ffd9ec;
  border-radius:999px;padding:4px 10px;font-size:13px;font-weight:800;color:#8b5a76;transition:.12s}
.chReact.on{background:linear-gradient(135deg,#ff4da6,#b06bff);color:#fff;border-color:transparent;
  box-shadow:0 0 10px rgba(255,77,166,.5)}
.chReact:active{transform:scale(.94)}
.chReadonly{margin:6px 2px 0;padding:12px 14px;border-radius:16px;text-align:center;
  background:rgba(255,255,255,.85);border:1.5px dashed #ffb8d9;font-size:12.5px;font-weight:800;color:#b2588e}
.chComposer{display:flex;gap:8px;padding:10px 12px;background:rgba(255,255,255,.95);
  border-top:2px solid #ffd9ec;flex:0 0 auto}
.chInput{flex:1;padding:11px 14px;border-radius:999px;border:2px solid #ffd9ec;background:#fff;
  font-size:14px;outline:none}
.chInput:focus{border-color:#ff8fc8;box-shadow:0 0 0 4px rgba(255,143,200,.18)}
.chSend{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#ff4da6,#b06bff);
  color:#fff;font-size:19px;display:flex;align-items:center;justify-content:center;
  box-shadow:0 6px 18px rgba(255,77,166,.42);flex:0 0 auto}
.chSend:active{transform:scale(.94)}
/* 🖼️ V4.31 — echtes Kanalbild + Titelbild */
.chHeadAv img,.chPinAv img{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block}
.chCover{margin:12px 14px 0;border-radius:18px;overflow:hidden;box-shadow:0 10px 26px rgba(255,77,166,.22);border:2px solid #ffd9ec}
.chCover img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover}
body.dark #chView{background:linear-gradient(170deg,#1a1220,#221630)}
body.dark .chMsg,body.dark .chInfoCard{background:rgba(255,255,255,.06);border-color:rgba(255,77,166,.3)}
body.dark .chMsgText,body.dark .chHeadName,body.dark .chPinRow b{color:#ffe6f4}
body.dark .chPinned{background:linear-gradient(135deg,rgba(255,77,166,.16),rgba(176,107,255,.12))}
body.dark .chHead{background:rgba(30,20,36,.92)}
`;
    const el = document.createElement('style');
    el.id = 'v425css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------------- Daten ---------------- */

  async function loadChannel() {
    const d = await api('/channels/' + OFFICIAL_ID);
    ST.channel = d.channel || null;
    return ST.channel;
  }

  async function loadMessages() {
    const d = await api('/channels/' + OFFICIAL_ID + '/messages?limit=50');
    ST.messages = (d.messages || []).slice().reverse();
    ST.canPost = !!d.canPost;
    return ST;
  }

  /* ---------------- Gepinnte Karte in „Aktuelles" ---------------- */

  function pinnedCard(ch) {
    const followers = ch.followers || 0;
    const sub = ch.lastText
      ? esc(ch.lastText)
      : `${followers} ${followers === 1 ? 'Follower' : 'Follower'} · ${esc(ch.handle || '')}`;
    return `
      <div class="chPinned" id="chPinnedOfficial" role="button" tabindex="0" data-channel="${esc(ch.id)}">
        <span class="chOffTag">OFFIZIELL</span>
        <div class="chPinAv">${chAv(ch.avatar)}</div>
        <div class="chPinBody">
          <div class="chPinRow"><b>${esc(ch.name)}</b>${ch.verified ? tick(16) : ''}</div>
          <div class="chPinSub">${sub}</div>
        </div>
      </div>`;
  }

  let inflight = false;
  async function mountPinned() {
    const list = document.getElementById('chList');
    if (!list || document.getElementById('chPinnedOfficial') || inflight) return;
    inflight = true;
    try {
      const ch = ST.channel || await loadChannel();
      if (!ch) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = pinnedCard(ch);
      const card = wrap.firstElementChild;
      card.onclick = () => openChannelView();
      // GANZ OBEN in der Kanäle-Sektion
      list.parentNode.insertBefore(card, list);
    } catch (e) {
      /* Server weg → keine Karte, aber keine kaputte Oberfläche */
    } finally {
      inflight = false;
    }
  }

  function watchTabs() {
    const obs = new MutationObserver(() => {
      if (document.getElementById('chList')) mountPinned();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Erster Versuch, falls „Aktuelles" schon steht
    setTimeout(mountPinned, 800);
    setTimeout(mountPinned, 2500);
  }

  /* ---------------- Kanal-Ansicht ---------------- */

  function msgHtml(m) {
    const reacts = m.reactions || {};
    // Zähler je Emoji
    const counts = {};
    for (const k of Object.keys(reacts)) {
      const slot = reacts[k];
      const n = slot && Array.isArray(slot.users) ? slot.users.length : 0;
      if (n) counts[k] = n;
    }
    const mine = (() => {
      const tok = (() => { try { return JSON.parse(localStorage.getItem('lc_me') || 'null'); } catch (e) { return null; } })();
      const uid = tok && tok.id;
      if (!uid) return null;
      for (const k of Object.keys(reacts)) {
        const slot = reacts[k];
        if (slot && Array.isArray(slot.users) && slot.users.includes(uid)) return k;
      }
      return null;
    })();

    const bar = REACTIONS.map((e) => {
      const n = counts[e] || 0;
      const on = mine === e ? ' on' : '';
      return `<button class="chReact${on}" data-react="${e}" data-mid="${esc(m.id)}" title="Reagieren">${e}${n ? ' <span>' + n + '</span>' : ''}</button>`;
    }).join('');

    return `
      <div class="chMsg" data-mid="${esc(m.id)}">
        ${m.image ? `<img src="${esc(m.image)}" alt="" style="max-width:100%;border-radius:14px;margin-bottom:8px">` : ''}
        ${m.text ? `<div class="chMsgText">${esc(m.text)}</div>` : ''}
        <div class="chMsgMeta">
          <span>📢 ${esc(m.bot ? 'Lovechen' : 'Maxichen')}</span>
          <span>·</span>
          <span>${esc(timeHi(m.createdAt))}</span>
          ${ST.canPost ? `<button class="chDel" data-del="${esc(m.id)}">Löschen</button>` : ''}
        </div>
        <div class="chReacts">${bar}</div>
      </div>`;
  }

  /** Bild oder Emoji? Seit V4.31 trägt der Kanal ein echtes Bild. */
  function chAv(av, cls) {
    const a = String(av || '💗');
    if (/^(data:image\/|\/media\/|\/assets\/|https?:)/.test(a)) return `<img src="${esc(a)}" alt="" class="${cls || ''}">`;
    return esc(a);
  }

  function viewHtml(ch) {
    const followers = ch.followers || 0;
    return `
      <div class="chHead">
        <button class="chBack" id="chBack" aria-label="Zurück">←</button>
        <div class="chHeadAv">${chAv(ch.avatar)}</div>
        <div class="chHeadBody">
          <div class="chHeadName">${esc(ch.name)}${ch.verified ? tick(15) : ''}</div>
          <div class="chHeadSub">${esc(ch.handle || '')} · ${followers} Follower</div>
        </div>
        ${ch.isOwner ? '' : `<button class="chFollow${ch.isFollowing ? ' on' : ''}" id="chFollow">${ch.isFollowing ? 'Folgt ✓' : 'Folgen'}</button>`}
      </div>
      <div class="chScroll">
        ${ch.banner ? `<div class="chCover"><img src="${esc(ch.banner)}" alt=""></div>` : ''}
        <div class="chInfoCard">
          <p>${esc(ch.description || '')}</p>
          <div class="chInfoMeta">
            <span>👑 ${esc(ch.ownerName || 'Maxichen')}</span>
            <span>👥 ${followers} Follower</span>
            <span>📢 ${ch.messageCount || 0} Beiträge</span>
          </div>
        </div>
        <div id="chMsgList">${ST.messages.map(msgHtml).join('') || '<div class="tabHint">Noch kein Beitrag 💗</div>'}</div>
        ${ST.canPost ? '' : '<div class="chReadonly">Nur Admins können schreiben 📢</div>'}
      </div>
      ${ST.canPost ? `<div class="chComposer">
        <input class="chInput" id="chInput" placeholder="Beitrag als Inhaber schreiben …" maxlength="4000">
        <button class="chSend" id="chSend" aria-label="Senden">➤</button>
      </div>` : ''}`;
  }

  async function openChannelView() {
    injectCss();
    let host = document.getElementById('chView');
    if (!host) {
      host = document.createElement('div');
      host.id = 'chView';
      document.body.appendChild(host);
    }
    host.innerHTML = '<div class="tabLoading">Kanal wird geladen …</div>';
    host.classList.remove('hidden');
    ST.open = true;
    try {
      const ch = await loadChannel();
      await loadMessages();
      if (!ch) throw new Error('Kanal nicht gefunden');
      // Für „meine Reaktion" brauchen wir die eigene ID
      if (typeof S !== 'undefined' && S.me && S.me.id) {
        try { localStorage.setItem('lc_me', JSON.stringify({ id: S.me.id })); } catch (e) {}
      } else if (typeof S !== 'undefined' && S.user && S.user.id) {
        try { localStorage.setItem('lc_me', JSON.stringify({ id: S.user.id })); } catch (e) {}
      }
      host.innerHTML = viewHtml(ch);
      wireView(host);
    } catch (e) {
      host.innerHTML = `<div class="chHead"><button class="chBack" id="chBack">←</button>
        <div class="chHeadBody"><div class="chHeadName">Kanal</div>
        <div class="chHeadSub">nicht erreichbar</div></div></div>
        <div class="chScroll"><div class="tabHint">${esc(e.message || 'Fehler')}</div></div>`;
      const b = document.getElementById('chBack');
      if (b) b.onclick = closeChannelView;
    }
  }

  function closeChannelView() {
    const host = document.getElementById('chView');
    if (host) host.classList.add('hidden');
    ST.open = false;
    // Karte aktualisieren (Follower-Zahl hat sich evtl. geändert)
    const old = document.getElementById('chPinnedOfficial');
    if (old) old.remove();
    mountPinned();
  }

  function wireView(host) {
    const back = document.getElementById('chBack');
    if (back) back.onclick = closeChannelView;

    const follow = document.getElementById('chFollow');
    if (follow) {
      follow.onclick = async () => {
        const on = follow.classList.contains('on');
        follow.disabled = true;
        try {
          await api('/channels/' + OFFICIAL_ID + (on ? '/unfollow' : '/follow'), { method: 'POST', body: {} });
          await openChannelView(); // neu zeichnen mit neuer Zahl
          toast('📢', 'Kanal', on ? 'Du folgst nicht mehr' : 'Du folgst jetzt 💗');
        } catch (e) {
          toast('💔', 'Fehler', e.message);
        } finally {
          follow.disabled = false;
        }
      };
    }

    // Reaktionen
    host.querySelectorAll('.chReact').forEach((b) => {
      b.onclick = async () => {
        try {
          await api(`/channels/${OFFICIAL_ID}/messages/${encodeURIComponent(b.dataset.mid)}/react`, {
            method: 'POST', body: { emoji: b.dataset.react },
          });
          await openChannelView();
        } catch (e) {
          toast('💔', 'Reaktion', e.message);
        }
      };
    });

    // Löschen (nur Inhaber — Server prüft es nochmal)
    host.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async (ev) => {
        ev.stopPropagation();
        if (!confirm('Diesen Beitrag für ALLE löschen?')) return;
        try {
          await api(`/channels/${OFFICIAL_ID}/messages/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
          await openChannelView();
          toast('🗑️', 'Gelöscht', 'Für alle sichtbar entfernt');
        } catch (e) {
          toast('💔', 'Löschen', e.message);
        }
      };
    });

    // Senden (nur Inhaber)
    const send = document.getElementById('chSend');
    const input = document.getElementById('chInput');
    if (send && input) {
      const doSend = async () => {
        const text = input.value.trim();
        if (!text || ST.busy) return;
        ST.busy = true;
        try {
          await api(`/channels/${OFFICIAL_ID}/messages`, { method: 'POST', body: { text } });
          input.value = '';
          await openChannelView();
          toast('📢', 'Gesendet', 'Dein Beitrag ist live 💗');
        } catch (e) {
          toast('💔', 'Senden', e.message);
        } finally {
          ST.busy = false;
        }
      };
      send.onclick = doSend;
      input.onkeydown = (e) => { if (e.key === 'Enter') doSend(); };
    }
  }

  /* ---------------- Start ---------------- */

  document.addEventListener('DOMContentLoaded', () => {
    injectCss();
    watchTabs();
  });
  setTimeout(() => { injectCss(); watchTabs(); }, 700);

  window.LC425 = {
    OFFICIAL_ID,
    REACTIONS,
    open: openChannelView,
    close: closeChannelView,
    loadChannel,
    loadMessages,
    state: ST,
    mountPinned,
  };
})();
