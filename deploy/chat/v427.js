/* =====================================================================
 *  🖼️ v427.js — V4.27 „Medien" (Oberfläche)
 * ---------------------------------------------------------------------
 *  Was diese Datei kann:
 *    · Datei wählen (Bild, Video, PDF …) → hochladen → als Nachricht senden
 *    · Medien-Galerie pro Chat (Fotos · Videos · Voice · Docs · Links)
 *    · GIF-Picker (lokaler Katalog, KEIN fremder Host — die CSP erlaubt
 *      nur 'self', ein Giphy-Aufruf würde scheitern)
 *    · Speicher-Anzeige inkl. der ehrlichen Base64-Altlast
 *
 *  Was sie NICHT tut: app.js umbauen. Der 📎-Knopf wird über einen
 *  MutationObserver an den Composer gehängt und ruft den bestehenden
 *  Sende-Weg (`api('/chats/:id/messages')`) — keine zweite Wahrheit.
 * ===================================================================== */
(function () {
  'use strict';

  const ST = { chatId: null, busy: false, lastUpload: null, gifs: [], gallery: null };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function kb(n) {
    const b = Number(n) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  /* ---------------- CSS ---------------- */
  function css() {
    if (document.getElementById('v427css')) return;
    const el = document.createElement('style');
    el.id = 'v427css';
    el.textContent = `
#lcMedia{position:fixed;inset:0;z-index:63;background:rgba(60,20,50,.55);
  display:flex;flex-direction:column;justify-content:flex-end}
#lcMedia.hidden{display:none}
.lcSheet{background:linear-gradient(170deg,#fff5fa,#ffeaf5 55%,#f6ebff);
  border-radius:26px 26px 0 0;box-shadow:0 -12px 40px rgba(90,20,70,.3);
  max-height:88vh;display:flex;flex-direction:column;overflow:hidden}
.lcSheetH{display:flex;align-items:center;gap:10px;padding:14px 16px 10px;
  border-bottom:2px solid #ffd9ec;flex:0 0 auto}
.lcSheetH b{flex:1;font-family:'Baloo 2',cursive;font-size:17px;color:#7b2ff7}
.lcSheetX{width:36px;height:36px;border-radius:12px;background:#ffeef5;font-size:17px}
.lcTabs{display:flex;gap:6px;padding:10px 14px;flex-wrap:wrap;flex:0 0 auto}
.lcTab{padding:7px 13px;border-radius:999px;background:#fff0f5;color:#a5748f;
  font-size:12px;font-weight:800;border:none}
.lcTab.on{background:linear-gradient(135deg,#ff4da6,#b06bff);color:#fff;
  box-shadow:0 3px 10px rgba(255,77,166,.35)}
.lcSheetBody{flex:1;overflow-y:auto;padding:0 14px 20px}
.lcGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:6px 0}
.lcTile{aspect-ratio:1;border-radius:14px;overflow:hidden;background:#fff;
  display:flex;align-items:center;justify-content:center;position:relative;
  box-shadow:0 3px 10px rgba(255,77,148,.14);border:1.5px solid #ffe0ef}
.lcTile img{width:100%;height:100%;object-fit:cover}
.lcTile .badge{position:absolute;bottom:4px;right:4px;font-size:9px;font-weight:900;
  background:rgba(255,77,166,.92);color:#fff;padding:2px 6px;border-radius:999px}
.lcFileRow{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;
  background:#fff;margin-bottom:8px;box-shadow:0 3px 10px rgba(255,77,148,.12)}
.lcFileIco{width:38px;height:38px;min-width:38px;border-radius:12px;display:flex;
  align-items:center;justify-content:center;font-size:18px;background:#fff0f7}
.lcFileBody{flex:1;min-width:0}
.lcFileBody b{display:block;font-size:13px;color:#43203a;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.lcFileBody small{font-size:11px;color:#a5748f;font-weight:700}
.lcEmpty{text-align:center;color:#a5748f;font-weight:800;font-size:12.5px;padding:34px 10px}
.lcUp{display:flex;flex-direction:column;gap:8px;padding:12px 2px}
.lcUpRow{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:800;color:#8b5a76}
.lcBar{flex:1;height:8px;border-radius:99px;background:#ffe3f0;overflow:hidden}
.lcBar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff4da6,#b06bff);
  transition:width .16s}
.lcBtn{width:100%;padding:12px;border-radius:14px;font-weight:900;font-size:13.5px;
  background:linear-gradient(135deg,#ff4da6,#b06bff);color:#fff;border:none;
  box-shadow:0 6px 18px rgba(255,77,166,.4)}
.lcBtn.ghost{background:#fff;color:#e6197d;border:2px solid #ffd9ec;box-shadow:none}
.lcGif{aspect-ratio:1;border-radius:16px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;font-size:30px;border:2px solid #fff;cursor:pointer;
  box-shadow:0 4px 14px rgba(255,77,148,.2)}
.lcGif span{font-size:9.5px;font-weight:900;color:#fff;margin-top:5px;text-shadow:0 1px 3px rgba(0,0,0,.3)}
.lcSearch{width:100%;padding:10px 14px;border-radius:999px;border:2px solid #ffd9ec;
  background:#fff;font-size:13px;outline:none;margin-bottom:10px}
.lcSearch:focus{border-color:#ff8fc8}
.lcHint{font-size:11px;color:#a5748f;font-weight:700;text-align:center;padding:8px 4px;line-height:1.5}
body.dark .lcSheet{background:linear-gradient(170deg,#1a1220,#221630)}
body.dark .lcFileRow,body.dark .lcTile{background:rgba(255,255,255,.06);border-color:rgba(255,77,166,.3)}
body.dark .lcFileBody b{color:#ffe6f4}
`;
    document.head.appendChild(el);
  }

  /* ---------------- Sheet ---------------- */
  function openSheet(tab) {
    css();
    let host = document.getElementById('lcMedia');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lcMedia';
      document.body.appendChild(host);
    }
    host.classList.remove('hidden');
    host.onclick = (e) => { if (e.target === host) closeSheet(); };
    render(tab || 'upload');
  }
  function closeSheet() {
    const h = document.getElementById('lcMedia');
    if (h) h.classList.add('hidden');
  }

  async function render(tab) {
    const host = document.getElementById('lcMedia');
    if (!host) return;
    const TABS = [
      ['upload', '📎 Datei'],
      ['gallery', '🖼️ Galerie'],
      ['gifs', '✨ GIFs'],
      ['storage', '💾 Speicher'],
    ];
    host.innerHTML = `
      <div class="lcSheet">
        <div class="lcSheetH">
          <b>Medien</b>
          <button class="lcSheetX" id="lcMX">✕</button>
        </div>
        <div class="lcTabs">${TABS.map(([id, label]) =>
          `<button class="lcTab${tab === id ? ' on' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>
        <div class="lcSheetBody" id="lcBody"><div class="lcEmpty">wird geladen …</div></div>
      </div>`;
    document.getElementById('lcMX').onclick = closeSheet;
    host.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => render(b.dataset.tab); });

    const body = document.getElementById('lcBody');
    try {
      if (tab === 'upload') body.innerHTML = uploadHtml();
      else if (tab === 'gallery') body.innerHTML = await galleryHtml();
      else if (tab === 'gifs') body.innerHTML = await gifsHtml();
      else body.innerHTML = await storageHtml();
      wire(tab, body);
    } catch (e) {
      body.innerHTML = `<div class="lcEmpty">${esc(e.message || 'Fehler')}</div>`;
    }
  }

  /* ---------------- Upload ---------------- */
  function uploadHtml() {
    return `
      <div class="lcUp">
        <input type="file" id="lcFile" accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt,.zip"
               style="display:none">
        <div class="lcUpRow"><span id="lcFileName">Keine Datei gewählt</span></div>
        <div class="lcUpRow"><div class="lcBar"><i id="lcBar"></i></div><span id="lcPct">0 %</span></div>
        <button class="lcBtn" id="lcPick">Datei wählen</button>
        <button class="lcBtn ghost" id="lcSend" disabled>Hochladen &amp; senden</button>
        <div class="lcHint" id="lcUpHint">Bilder, Videos, Sprache, PDF, DOC(X), TXT, ZIP — bis 15 MB (VIP 40 MB).<br>
          Die Datei landet auf der Platte, nicht als Base64 in der Datenbank.</div>
      </div>`;
  }

  function readAsDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error('Datei nicht lesbar'));
      r.readAsDataURL(file);
    });
  }

  function wire(tab, body) {
    if (tab === 'upload') {
      const fileInput = document.getElementById('lcFile');
      const nameEl = document.getElementById('lcFileName');
      const sendBtn = document.getElementById('lcSend');
      let picked = null;

      document.getElementById('lcPick').onclick = () => fileInput.click();
      fileInput.onchange = () => {
        picked = fileInput.files && fileInput.files[0];
        if (!picked) return;
        nameEl.textContent = picked.name + ' · ' + kb(picked.size);
        sendBtn.disabled = false;
      };

      sendBtn.onclick = async () => {
        if (!picked || ST.busy) return;
        ST.busy = true;
        sendBtn.disabled = true;
        const bar = document.getElementById('lcBar');
        const pct = document.getElementById('lcPct');
        const hint = document.getElementById('lcUpHint');
        try {
          hint.textContent = 'lese …';
          const dataUrl = await readAsDataUrl(picked);
          if (bar) bar.style.width = '30%';
          if (pct) pct.textContent = '30 %';

          const up = await api('/v427/media', {
            method: 'POST',
            body: {
              dataUrl,
              name: picked.name,
              chatId: ST.chatId || undefined,
              mime: picked.type || undefined,
            },
          });
          if (bar) bar.style.width = '75%';
          if (pct) pct.textContent = '75 %';
          ST.lastUpload = up;

          // Als Nachricht senden — bestehender Weg, keine zweite Wahrheit
          if (ST.chatId) {
            const kind = up.media.kind;
            await api('/chats/' + ST.chatId + '/messages', {
              method: 'POST',
              body: {
                kind,
                text: '',
                attachment: {
                  url: up.url,
                  name: up.media.name,
                  mime: up.media.mime,
                  size: up.media.size,
                },
              },
            });
          }
          if (bar) bar.style.width = '100%';
          if (pct) pct.textContent = '100 %';
          hint.innerHTML = '✅ Hochgeladen: <b>' + esc(up.url) + '</b><br>' +
            kb(up.media.size) + ' · Speicher ' + kb(up.usedBytes) + ' von ' + kb(up.quotaBytes);
          setTimeout(() => { closeSheet(); try { if (typeof openChat === 'function' && ST.chatId) openChat(ST.chatId); } catch (e) {} }, 1200);
        } catch (e) {
          hint.innerHTML = '❌ ' + esc(e.message || 'Fehler');
          sendBtn.disabled = false;
        } finally {
          ST.busy = false;
        }
      };
    }

    if (tab === 'gallery') {
      body.querySelectorAll('[data-media]').forEach((n) => {
        n.onclick = () => {
          const url = n.dataset.media;
          if (url) window.open(url, '_blank', 'noopener');
        };
      });
    }

    if (tab === 'storage') {
      const mb = document.getElementById('lcMigrate');
      if (mb) mb.onclick = async () => {
        mb.disabled = true; mb.textContent = 'ziehe um …';
        try {
          const r = await api('/v427/storage/migrate', { method: 'POST', body: {} });
          render('storage');
          setTimeout(() => {
            const b2 = document.getElementById('lcBody');
            if (b2) b2.insertAdjacentHTML('afterbegin',
              `<div class="lcHint" style="background:#fff6fb;border-radius:14px;padding:10px;margin-bottom:8px">
                 ✅ ${r.moved} umgezogen · ${kb(r.freedBytes)} aus der Datenbank${r.skipped ? ' · ' + r.skipped + ' übersprungen' : ''}</div>`);
          }, 60);
        } catch (e) { mb.disabled = false; mb.textContent = '❌ ' + (e.message || 'Fehler'); }
      };
    }

    if (tab === 'gifs') {
      const inp = document.getElementById('lcGifQ');
      if (inp) {
        let t = null;
        inp.oninput = () => {
          clearTimeout(t);
          t = setTimeout(async () => {
            const q = inp.value.trim();
            const list = await api('/v427/gifs' + (q ? '?q=' + encodeURIComponent(q) : ''));
            const grid = document.getElementById('lcGifGrid');
            if (grid) grid.innerHTML = gifGrid(list.gifs);
            wireGifClicks();
          }, 220);
        };
      }
      wireGifClicks();
    }
  }

  function wireGifClicks() {
    document.querySelectorAll('[data-gif]').forEach((n) => {
      n.onclick = async () => {
        const [id, emoji] = n.dataset.gif.split('|');
        try {
          if (ST.chatId) {
            await api('/chats/' + ST.chatId + '/messages', {
              method: 'POST',
              body: { kind: 'sticker', text: '', attachment: { sticker: emoji, name: id, mime: 'image/gif' } },
            });
          }
          closeSheet();
          try { if (typeof openChat === 'function' && ST.chatId) openChat(ST.chatId); } catch (e) {}
        } catch (e) { alert(e.message); }
      };
    });
  }

  /* ---------------- Galerie ---------------- */
  async function galleryHtml() {
    if (!ST.chatId) return '<div class="lcEmpty">Öffne zuerst einen Chat 💬</div>';
    const g = await api('/v427/chats/' + ST.chatId + '/media');
    ST.gallery = g;
    const parts = [];

    if (g.counts.photos) {
      parts.push(`<div class="lcTab on" style="display:inline-block;margin:8px 0">Fotos ${g.counts.photos}</div>
        <div class="lcGrid">${g.photos.map((p) =>
          `<div class="lcTile" data-media="${esc(p.url)}">
             ${p.url && !p.legacy ? `<img src="${esc(p.url)}" alt="" loading="lazy">`
                                 : (p.url ? `<img src="${esc(p.url)}" alt="" loading="lazy">` : '🖼️')}
             ${p.legacy ? '<span class="badge">alt</span>' : ''}
           </div>`).join('')}</div>`);
    }
    if (g.counts.videos) {
      parts.push(`<div class="lcTab on" style="display:inline-block;margin:8px 0">Videos ${g.counts.videos}</div>
        ${g.videos.map((v) => fileRow('🎬', v)).join('')}`);
    }
    if (g.counts.voice) {
      parts.push(`<div class="lcTab on" style="display:inline-block;margin:8px 0">Sprachnachrichten ${g.counts.voice}</div>
        ${g.voice.map((v) => fileRow('🎙️', v)).join('')}`);
    }
    if (g.counts.files) {
      parts.push(`<div class="lcTab on" style="display:inline-block;margin:8px 0">Dokumente ${g.counts.files}</div>
        ${g.files.map((f) => fileRow('📄', f)).join('')}`);
    }
    if (g.counts.links) {
      parts.push(`<div class="lcTab on" style="display:inline-block;margin:8px 0">Links ${g.counts.links}</div>
        ${g.links.slice(0, 20).map((l) => fileRow('🔗', { name: l.url, size: 0, at: l.at })).join('')}`);
    }
    if (!parts.length) return '<div class="lcEmpty">Noch keine Medien in diesem Chat 💗<br>Nimm oben „Datei" und schick das erste Bild.</div>';
    return parts.join('');
  }

  function fileRow(ico, m) {
    const when = m.at ? new Date(m.at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
    return `<div class="lcFileRow" ${m.url ? `data-media="${esc(m.url)}"` : ''}>
      <div class="lcFileIco">${ico}</div>
      <div class="lcFileBody"><b>${esc(m.name || 'Datei')}</b>
        <small>${m.size ? kb(m.size) : ''}${m.size && when ? ' · ' : ''}${when}${m.legacy ? ' · alt (Base64)' : ''}</small></div>
      ${m.url && m.url.startsWith('/media/') ? '<span class="lcTab on">öffnen</span>' : ''}
    </div>`;
  }

  /* ---------------- GIFs ---------------- */
  /* Helle Kacheln brauchen dunkle Schrift — weiß auf Hellblau war unlesbar. */
  function inkFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#fff';
    const n = parseInt(m[1], 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.62 ? '#7a2f5a' : '#fff';
  }

  function gifGrid(list) {
    if (!list || !list.length) return '<div class="lcEmpty">Nichts gefunden 💔</div>';
    return `<div class="lcGrid">${list.map((g) => {
      const ink = inkFor(g.color);
      return `<div class="lcGif" data-gif="${esc(g.id)}|${esc(g.emoji)}" style="background:${esc(g.color)}">
         ${esc(g.emoji)}<span style="color:${ink};text-shadow:${ink === '#fff' ? '0 1px 3px rgba(0,0,0,.35)' : 'none'}">${esc(g.name)}</span></div>`;
    }).join('')}</div>`;
  }

  async function gifsHtml() {
    const d = await api('/v427/gifs');
    ST.gifs = d.gifs;
    return `<input class="lcSearch" id="lcGifQ" placeholder="GIF suchen … (Herz, Katze, Party)">
      <div id="lcGifGrid">${gifGrid(d.gifs)}</div>
      <div class="lcHint">${d.all} GIFs · Katalog liegt auf <b>diesem</b> Server.
        Giphy geht nicht: die CSP erlaubt nur eigene Skripte (<code>script-src 'self'</code>).</div>`;
  }

  /* ---------------- Speicher ---------------- */
  async function storageHtml() {
    const s = await api('/v427/storage');
    const kinds = Object.entries(s.mine.byKind || {});
    const KINDNAME = { photo: '🖼️ Fotos', video: '🎬 Videos', voice: '🎙️ Sprache', file: '📄 Dateien' };
    return `
      <div style="padding:10px 2px">
        <div class="lcUpRow"><div class="lcBar"><i style="width:${s.mine.percent}%"></i></div>
          <span>${s.mine.percent} %</span></div>
        <div class="lcHint">${kb(s.mine.bytes)} von ${kb(s.mine.limit)} belegt · ${s.mine.count} Dateien</div>
      </div>
      ${kinds.length ? kinds.map(([k, v]) =>
        `<div class="lcFileRow"><div class="lcFileIco">${KINDNAME[k] ? KINDNAME[k].split(' ')[0] : '📄'}</div>
          <div class="lcFileBody"><b>${esc(KINDNAME[k] || k)}</b><small>${kb(v)}</small></div></div>`).join('')
        : '<div class="lcEmpty">Du hast noch keine Dateien hochgeladen 💗</div>'}
      <div class="lcHint" style="text-align:left;background:#fff6fb;border-radius:14px;padding:12px;margin-top:10px">
        <b>Auf der Platte:</b> ${s.disk.files} Dateien, ${kb(s.disk.bytes)}<br>
        <b>Altlast in der Datenbank:</b> ${s.legacy.count} Anhänge als Base64, ${kb(s.legacy.bytes)}<br>
        <span style="font-size:10.5px">davon <b>${s.legacy.mine}</b> von dir (${kb(s.legacy.mineBytes)}) — nur die kann ich umziehen.
        Der Rest gehört anderen Nutzern und wird nicht angefasst.</span>
      </div>
      ${s.legacy.mine ? '<button class="lcBtn" id="lcMigrate" style="margin-top:10px">Meine Altlast umziehen (' + kb(s.legacy.mineBytes) + ')</button>' : ''}
      <div class="lcHint" style="margin-top:10px">Limit pro Datei: ${kb(s.limits.normal)}${s.limits.isVip ? ' (VIP ' + kb(s.limits.vip) + ')' : ''}</div>`;
  }

  /* ---------------- Einhängen ins bestehende ➕-Menü ---------------- */
  /*  Kein fünftes Icon im Composer: das ➕-Menü (V4.18) hat schon
   *  8 Einträge — dort hängen wir unsere drei dazu.  */
  const EXTRA = [
    ['🗂️', 'Galerie', 'gallery'],
    ['✨', 'GIFs', 'gifs'],
    ['💾', 'Speicher', 'storage'],
  ];

  function mountIntoAttPop() {
    const pop = document.getElementById('attPop');
    if (!pop) return;
    const sync = () => {
      try { if (typeof S !== 'undefined' && S.activeChat) ST.chatId = S.activeChat; } catch (e) {}
    };
    if (pop.dataset.v427 === '1') { sync(); return; }
    pop.dataset.v427 = '1';
    for (const [ico, label, tab] of EXTRA) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v427tab = tab;
      b.innerHTML = ico + ' <span>' + label + '</span>';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        sync();
        pop.classList.add('hidden');
        openSheet(tab);
      }, true);
      pop.appendChild(b);
    }
    sync();
  }

  function watch() {
    const obs = new MutationObserver(() => mountIntoAttPop());
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(mountIntoAttPop, 400);
    setTimeout(mountIntoAttPop, 1500);
    setTimeout(mountIntoAttPop, 3500);
  }

  document.addEventListener('DOMContentLoaded', () => { css(); watch(); });
  setTimeout(() => { css(); watch(); }, 800);

  window.LC427 = {
    open: openSheet,
    close: closeSheet,
    state: ST,
    setChat: (id) => { ST.chatId = id; },
    mount: mountIntoAttPop,
  };
})();
