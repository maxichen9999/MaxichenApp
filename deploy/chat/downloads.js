/* =====================================================================
 *  📥 downloads.js — V4.20
 * ---------------------------------------------------------------------
 *  Warum als eigene Datei und nicht inline: der Server schickt
 *  `Content-Security-Policy: script-src 'self'` (security-headers.js).
 *  Ein <script>…</script> im HTML wird davon BLOCKIERT — im Browser
 *  blieb die Seite bei „⏳ Prüfsummen werden geholt" stehen.
 *  Gemessen, nicht geraten: genau diese Konsolenmeldung kam bei der
 *  ersten Prüfung mit Playwright.
 * ===================================================================== */
/* ============================================================
   V4.20 — Diese Seite rät nichts mehr.
   Alle Größen und Prüfsummen kommen aus /api/downloads/latest.
   Und die Prüfsumme lässt sich im Browser nachrechnen.
   ============================================================ */
(function () {
  const shaBody = document.getElementById('shaBody');
  const shaNote = document.getElementById('shaNote');
  const verifyList = document.getElementById('verifyList');
  let items = [];

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const human = (n) => n == null ? '—'
    : n < 1024 ? n + ' B'
    : n < 1048576 ? (n / 1024).toFixed(0) + ' KB'
    : (n / 1048576).toFixed(1) + ' MB';

  function fail(msg) {
    shaBody.innerHTML = '<tr><td colspan="2" class="vres bad">🔴 ' + esc(msg) +
      '</td></tr>';
    if (shaNote) shaNote.textContent = 'Der Server antwortet nicht — deshalb steht hier keine Zahl. Lieber nichts als etwas Falsches.';
    verifyList.innerHTML = '<span class="vres bad">Prüfung nicht möglich: ' + esc(msg) + '</span>';
  }

  async function load() {
    let data;
    try {
      const r = await fetch('/api/downloads/latest', { headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      data = await r.json();
    } catch (e) {
      fail('Server nicht erreichbar (' + e.message + ')');
      return;
    }
    items = data.items || [];

    // ---- Prüfsummen-Tabelle ----
    const rows = [];
    for (const it of items) {
      if (!it.available) continue;
      const label = it.id === 'android' ? 'APK'
        : it.id === 'windows' ? 'EXE'
        : it.id === 'sources' ? 'QUELLEN'
        : it.id.toUpperCase();
      if (it.md5) rows.push('<tr><td>' + label + ' · MD5</td><td><code>' + esc(it.md5) + '</code></td></tr>');
      if (it.sha256) rows.push('<tr><td>' + label + ' · SHA-256</td><td><code>' + esc(it.sha256) + '</code></td></tr>');
      if (it.size) rows.push('<tr><td>' + label + ' · Größe</td><td><code>' +
        it.size.toLocaleString('de-DE') + ' Byte</code> (' + human(it.size) + ')</td></tr>');
    }
    for (const it of items) {
      if (it.available) continue;
      rows.push('<tr><td>' + esc(it.title) + '</td><td style="color:var(--soft)">nicht verfügbar — ' +
        esc(it.reason || 'kein Build') + '</td></tr>');
    }
    shaBody.innerHTML = rows.join('') || '<tr><td colspan="2" style="color:var(--soft)">Keine Dateien gemeldet.</td></tr>';
    const t = new Date();
    shaNote.innerHTML = 'Quelle: <code>/api/downloads/latest</code> — live gelesen am ' +
      t.toLocaleString('de-DE') + '. Version <b>' + esc(data.version || '?') + '</b>.';

    // ---- Live-Prüfung ----
    verifyList.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'verify-row';
      const icon = it.id === 'windows' ? '🪟'
        : it.id === 'ios' ? '🍎'
        : it.id === 'sources' ? '📦'
        : '🤖';
      const label = it.id === 'android' ? 'Android APK (v4.15)'
        : it.title + (it.id === 'windows' ? ' EXE' : '');
      const name = icon + ' ' + label;
      row.innerHTML = '<span class="nm">' + name + '</span><span class="sz">' +
        (it.available ? esc(it.file || '') + ' · ' + human(it.size) : 'nicht verfügbar') + '</span>';
      if (it.available && it.sha256) {
        const btn = document.createElement('button');
        btn.className = 'vbtn';
        btn.textContent = 'Nachrechnen';
        const res = document.createElement('span');
        res.className = 'vres';
        btn.addEventListener('click', () => verify(it, btn, res));
        row.appendChild(btn);
        row.appendChild(res);
      }
      verifyList.appendChild(row);
    }
    if (!verifyList.children.length) verifyList.innerHTML = '<span style="color:var(--soft)">Keine prüfbaren Dateien.</span>';
  }

  async function verify(item, btn, res) {
    btn.disabled = true;
    res.className = 'vres wait';
    res.textContent = '⏳ Lade ' + human(item.size) + ' und rechne …';
    try {
      const r = await fetch(item.url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = await r.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (hex === item.sha256.toLowerCase()) {
        res.className = 'vres ok';
        res.textContent = '✅ Stimmt — ' + hex.slice(0, 16) + '… (ganze Datei, ' + buf.byteLength.toLocaleString('de-DE') + ' Byte)';
      } else {
        res.className = 'vres bad';
        res.textContent = '🔴 Weicht ab! Server: ' + item.sha256.slice(0, 16) + '… / hier: ' + hex.slice(0, 16) + '… — Datei nicht installieren.';
      }
    } catch (e) {
      res.className = 'vres bad';
      res.textContent = '🔴 Konnte nicht prüfen: ' + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  load();
})();
