/* =====================================================================
 *  🖼️ v427.js — V4.27 „Medien richtig" (Upload statt Base64 in der DB)
 * ---------------------------------------------------------------------
 *  GEMESSEN vor dem Bau (nicht geraten):
 *
 *  ✅ Umfragen:  v4.js:266/310/317/340  (create, list, vote, close)
 *  ✅ Standort:  extras.js:22/55/68     (live start, stop, get)
 *  ✅ Sticker:   v419.js:246…286        (packs, pack/:id, search, fav)
 *  ✅ Anhänge:   server.js:1360         → `attachment.url` als DATA-URL
 *  ✅ JSON-Limit 10 MB                  (server.js:332)
 *
 *  ❌ KEIN /api/upload — jeder Anhang wird als Base64 **in die Datenbank**
 *     geschrieben. Messung: `server/data/database.json` ist 26,1 MB, davon
 *     26,0 MB `messages`. Ein einziges 5-MB-Bild bläht die DB um ~6,7 MB
 *     auf (Base64 = +33 %), und JEDER Lesevorgang lädt es mit.
 *  ❌ Keine Medien-Galerie pro Chat (WhatsApp: „Medien, Links, Docs")
 *  ❌ Kein GIF-Katalog
 *  ❌ Kein Papierkorb: ein gelöschtes Foto bleibt als Blob in der DB
 *
 *  Dieses Modul schreibt Dateien auf die Platte und in die DB nur einen
 *  Verweis. Bestehende Nachrichten mit Data-URL bleiben unverändert
 *  lesbar — nichts bricht.
 * ===================================================================== */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 427;

/* MIME-Allowlist. Kein SVG (kann Skripte enthalten), kein HTML. */
const MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/webm': 'weba',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'application/zip': 'zip',
};

const KIND_OF = (mime) =>
  mime.startsWith('image/') ? 'photo'
  : mime.startsWith('video/') ? 'video'
  : mime.startsWith('audio/') ? 'voice'
  : 'file';

/* Größenlimits — ehrlich benannt, nicht „2 GB wie WhatsApp".
   WhatsApp erlaubt 2 GB, aber dieser Server hat 1,9 GB RAM und eine
   JSON-Datenbank. Ein 2-GB-Upload würde ihn sofort umbringen. */
const LIMIT = {
  // 🔴 Ehrlich statt WhatsApp-nachgeplappert: WhatsApp erlaubt 2 GB, diese
  //    Maschine hat 1,9 GB RAM und hält den Base64-Upload im Speicher.
  //    15 MB Datei = ~20 MB JSON im RAM. Mehr wäre Selbstmord.
  normal: 15 * 1024 * 1024,        // 15 MB
  vip: 40 * 1024 * 1024,           // 40 MB (VIP)
  quotaPerUser: 500 * 1024 * 1024, // 500 MB pro Nutzer auf der Platte
};

/* Lokaler GIF-Katalog (kein Giphy: die Sandbox hat keinen API-Key und
   die CSP verbietet fremde Hosts — `script-src 'self'`). */
const GIFS = [
  { id: 'gif-heart', name: 'Herz 💗', tags: ['liebe', 'herz', 'pink'], emoji: '💗', color: '#ff4da6' },
  { id: 'gif-sparkle', name: 'Glitzer ✨', tags: ['glitzer', 'magic'], emoji: '✨', color: '#b06bff' },
  { id: 'gif-hug', name: 'Umarmung 🤗', tags: ['liebe', 'trost'], emoji: '🤗', color: '#ff8fc8' },
  { id: 'gif-laugh', name: 'Lachen 😂', tags: ['fun', 'lachen'], emoji: '😂', color: '#ffb347' },
  { id: 'gif-cry', name: 'Weinen 😢', tags: ['traurig'], emoji: '😢', color: '#7ec8ff' },
  { id: 'gif-cat', name: 'Katze 🐱', tags: ['tier', 'kawaii'], emoji: '🐱', color: '#ffd6ec' },
  { id: 'gif-dance', name: 'Tanzen 💃', tags: ['party', 'fun'], emoji: '💃', color: '#ff4da6' },
  { id: 'gif-thumbs', name: 'Daumen 👍', tags: ['ok', 'gut'], emoji: '👍', color: '#7bffb0' },
  { id: 'gif-fire', name: 'Feuer 🔥', tags: ['hot', 'fun'], emoji: '🔥', color: '#ff7043' },
  { id: 'gif-star', name: 'Stern ⭐', tags: ['magic', 'nacht'], emoji: '⭐', color: '#ffd76e' },
  { id: 'gif-coffee', name: 'Kaffee ☕', tags: ['morgen', 'chill'], emoji: '☕', color: '#c58b5f' },
  { id: 'gif-moon', name: 'Mond 🌙', tags: ['nacht', 'schlafen'], emoji: '🌙', color: '#8b7aff' },
];

function createV427(app, h, ctx) {
  const { db, saveDb, auth } = ctx;

  /* ------------------------------------------------------------------
   *  Speicherort
   * ------------------------------------------------------------------ */
  const MEDIA_DIR = path.join(__dirname, 'data', 'media');
  try {
    if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true, mode: 0o700 });
  } catch (e) {
    console.error('⚠️ V4.27 — Medienordner nicht anlegbar:', e.message);
  }

  db.media = db.media || {};   // id → { id, ownerId, chatId, mime, ext, size, name, createdAt, kind }

  function isVip(me) {
    try {
      const { isVip } = require('./v419');
      return typeof isVip === 'function' ? isVip(me) : false;
    } catch (e) {
      return false;
    }
  }

  function limitFor(me) {
    return isVip(me) ? LIMIT.vip : LIMIT.normal;
  }

  /** Belegter Platz eines Nutzers. */
  function usedBy(uid) {
    let n = 0;
    for (const m of Object.values(db.media)) if (m.ownerId === uid) n += m.size || 0;
    return n;
  }

  function fileOf(media) {
    return path.join(MEDIA_DIR, media.id + '.' + media.ext);
  }

  /* ------------------------------------------------------------------
   *  Upload
   *  Nimmt `dataUrl` (data:image/png;base64,…) ODER `base64` + `mime`.
   *  Bewusst kein multipart/form-data: der Server hat keinen multer,
   *  und ein zusätzliches Paket wäre für 25 MB nicht nötig.
   * ------------------------------------------------------------------ */
  app.post('/api/v427/media', auth, h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};

    let mime = String(b.mime || '').toLowerCase().trim();
    let b64 = String(b.base64 || '');

    const dataUrl = String(b.dataUrl || '');
    if (!b64 && dataUrl.startsWith('data:')) {
      const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
      if (!m) return res.status(400).json({ error: 'Data-URL nicht lesbar', code: 'bad_data_url' });
      mime = m[1].toLowerCase();
      b64 = m[2];
    }

    if (!b64) return res.status(400).json({ error: 'Keine Daten (base64 oder dataUrl)', code: 'empty' });
    if (!MIME[mime]) {
      return res.status(415).json({
        error: 'Dateityp nicht erlaubt: ' + (mime || 'unbekannt'),
        code: 'bad_mime',
        allowed: Object.keys(MIME),
      });
    }

    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'Base64 kaputt', code: 'bad_base64' });
    }
    if (!buf.length) return res.status(400).json({ error: 'Datei ist leer', code: 'empty' });

    const max = limitFor(me);
    if (buf.length > max) {
      return res.status(413).json({
        error: `Datei zu groß (${(buf.length / 1048576).toFixed(1)} MB, erlaubt ${(max / 1048576).toFixed(0)} MB)`,
        code: 'too_big', maxBytes: max, vip: isVip(me),
      });
    }
    const used = usedBy(me.id);
    if (used + buf.length > LIMIT.quotaPerUser) {
      return res.status(413).json({
        error: 'Speicher voll', code: 'quota',
        usedBytes: used, quotaBytes: LIMIT.quotaPerUser,
      });
    }

    // Chat muss existieren UND ich muss drin sein
    const chatId = String(b.chatId || '');
    if (chatId) {
      const chat = db.chats[chatId];
      if (!chat) return res.status(404).json({ error: 'Chat nicht gefunden', code: 'no_chat' });
      if (!(chat.memberIds || []).includes(me.id)) return res.status(403).json({ error: 'Du bist nicht in diesem Chat', code: 'not_member' });
      if (chat.type === 'channel' && !(chat.ownerId === me.id || (chat.adminIds || []).includes(me.id))) {
        return res.status(403).json({ error: 'In Kanälen darf nur der Inhaber Medien senden', code: 'channel_readonly' });
      }
    }

    const id = 'md_' + crypto.randomBytes(9).toString('hex');
    const ext = MIME[mime];
    const rec = {
      id,
      ownerId: me.id,
      chatId: chatId || null,
      mime,
      ext,
      size: buf.length,
      name: String(b.name || ('datei.' + ext)).slice(0, 120),
      kind: KIND_OF(mime),
      width: parseInt(b.width, 10) || 0,
      height: parseInt(b.height, 10) || 0,
      duration: parseInt(b.duration, 10) || 0,
      createdAt: Date.now(),
    };
    fs.writeFileSync(fileOf(rec), buf, { mode: 0o600 });
    db.media[id] = rec;
    saveDb();

    res.status(201).json({
      media: rec,
      url: '/media/' + id + '.' + ext,
      // ⚠️ KEIN Base64 in der Antwort — die DB bleibt schlank
      limitBytes: max,
      usedBytes: usedBy(me.id),
      quotaBytes: LIMIT.quotaPerUser,
    });
  }));

  /* ------------------------------------------------------------------
   *  Ausliefern (mit Content-Type und Cache)
   * ------------------------------------------------------------------ */
  /* ⚠️ Diese Route bewusst OHNE auth:
     Ein <img src="/media/…"> kann keinen Authorization-Header senden.
     Schutz kommt daher aus der ID: 9 Zufallsbytes = 72 Bit — nicht ratbar.
     Genau so macht es WhatsApp mit seinen Blob-URLs. Preis: wer den Link
     hat, sieht das Bild (wie bei einem geteilten Link). Das steht hier,
     damit es niemand für ein Versehen hält. */
  function serveMedia(req, res) {
    const file = String(req.params.file || '');
    if (!/^md_[a-f0-9]{18}\.[a-z0-9]{2,4}$/.test(file)) return res.status(400).json({ error: 'Ungültiger Name' });
    const id = file.split('.')[0];
    const rec = db.media[id];
    if (!rec) return res.status(404).json({ error: 'Medium nicht gefunden', code: 'no_media' });
    const p = fileOf(rec);
    if (!fs.existsSync(p)) return res.status(410).json({ error: 'Datei fehlt auf der Platte', code: 'gone' });
    res.set('Content-Type', rec.mime);
    res.set('Content-Length', String(rec.size));
    res.set('Cache-Control', 'private, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    // Niemals als Download erzwingen — Bilder sollen inline zeigen
    res.sendFile(p, (err) => { if (err && !res.headersSent) res.status(500).end(); });
  }
  app.get('/api/v427/media/:file', serveMedia);
  app.get('/media/:file', serveMedia);

  /** Info ohne Bytes. */
  app.get('/api/v427/media/:id/info', auth, h(async (req, res) => {
    const rec = db.media[String(req.params.id || '')];
    if (!rec) return res.status(404).json({ error: 'Medium nicht gefunden', code: 'no_media' });
    res.json({ media: rec, url: '/media/' + rec.id + '.' + rec.ext, exists: fs.existsSync(fileOf(rec)) });
  }));

  /* ------------------------------------------------------------------
   *  Löschen — wirklich von der Platte
   * ------------------------------------------------------------------ */
  app.delete('/api/v427/media/:id', auth, h(async (req, res) => {
    const me = req.user;
    const rec = db.media[String(req.params.id || '')];
    if (!rec) return res.status(404).json({ error: 'Medium nicht gefunden', code: 'no_media' });
    const isAdmin = rec.chatId && db.chats[rec.chatId] && (
      db.chats[rec.chatId].ownerId === me.id || (db.chats[rec.chatId].adminIds || []).includes(me.id)
    );
    if (rec.ownerId !== me.id && !isAdmin) {
      return res.status(403).json({ error: 'Das gehört dir nicht', code: 'not_yours' });
    }
    let freed = 0;
    try {
      const p = fileOf(rec);
      if (fs.existsSync(p)) { freed = fs.statSync(p).size; fs.unlinkSync(p); }
    } catch (e) {}
    delete db.media[rec.id];
    saveDb();
    res.json({ ok: true, deleted: rec.id, freedBytes: freed });
  }));

  /* ------------------------------------------------------------------
   *  Galerie pro Chat — „Medien, Links, Docs" wie WhatsApp
   * ------------------------------------------------------------------ */
  app.get('/api/v427/chats/:id/media', auth, h(async (req, res) => {
    const me = req.user;
    const chat = db.chats[String(req.params.id || '')];
    if (!chat) return res.status(404).json({ error: 'Chat nicht gefunden', code: 'no_chat' });
    if (!(chat.memberIds || []).includes(me.id)) return res.status(403).json({ error: 'Du bist nicht in diesem Chat', code: 'not_member' });

    const msgs = db.messages[chat.id] || [];
    const photos = [], videos = [], voice = [], files = [], links = [];

    for (const m of msgs) {
      if (m.deleted) continue;
      const a = m.attachment || {};
      const url = a.url || m.image || '';

      // Neuer Weg: Verweis auf /media/<id>.<ext>
      const ref = /^\/media\/(md_[a-f0-9]+)\./.exec(String(url));
      const rec = ref ? db.media[ref[1]] : null;
      const kindOf = rec ? rec.kind : (m.image ? 'photo' : (a.mime ? KIND_OF(a.mime) : (m.kind || 'text')));
      const item = {
        messageId: m.id,
        at: m.createdAt,
        senderId: m.senderId,
        url,
        name: a.name || (rec && rec.name) || '',
        mime: a.mime || (rec && rec.mime) || '',
        size: a.size || (rec && rec.size) || 0,
        duration: a.duration || (rec && rec.duration) || 0,
        legacy: !!String(url).startsWith('data:'), // alt: Base64 in der DB
      };

      if (kindOf === 'photo' || m.kind === 'photo' || (a.sticker) || m.kind === 'sticker') photos.push(item);
      else if (kindOf === 'video' || m.kind === 'video') videos.push(item);
      else if (kindOf === 'voice' || m.kind === 'voice') voice.push(item);
      else if (kindOf === 'file' || m.kind === 'file') files.push(item);

      const text = String(m.text || '');
      const found = text.match(/https?:\/\/[^\s<>"']+/g);
      if (found) for (const u of found) links.push({ messageId: m.id, at: m.createdAt, url: u, senderId: m.senderId });
    }

    const sortDesc = (x, y) => y.at - x.at;
    res.set('Cache-Control', 'no-store');
    res.json({
      chatId: chat.id,
      photos: photos.sort(sortDesc),
      videos: videos.sort(sortDesc),
      voice: voice.sort(sortDesc),
      files: files.sort(sortDesc),
      links: links.sort(sortDesc).slice(0, 100),
      counts: { photos: photos.length, videos: videos.length, voice: voice.length, files: files.length, links: links.length },
    });
  }));

  /* ------------------------------------------------------------------
   *  GIF-Katalog (lokal, kein fremder Host)
   * ------------------------------------------------------------------ */
  app.get('/api/v427/gifs', auth, h(async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    let list = GIFS;
    if (q) list = GIFS.filter((g) => g.name.toLowerCase().includes(q) || g.tags.some((t) => t.includes(q)));
    res.json({ gifs: list, total: list.length, all: GIFS.length, source: 'lokal' });
  }));

  /* ------------------------------------------------------------------
   *  Speicher-Übersicht + Aufräumen
   * ------------------------------------------------------------------ */
  app.get('/api/v427/storage', auth, h(async (req, res) => {
    const me = req.user;
    const mine = Object.values(db.media).filter((m) => m.ownerId === me.id);
    const byKind = {};
    for (const m of mine) byKind[m.kind] = (byKind[m.kind] || 0) + m.size;
    let filesOnDisk = 0, bytesOnDisk = 0;
    try {
      for (const f of fs.readdirSync(MEDIA_DIR)) {
        try { filesOnDisk++; bytesOnDisk += fs.statSync(path.join(MEDIA_DIR, f)).size; } catch (e) {}
      }
    } catch (e) {}

    // Wie viel steckt noch als Base64 in der DB? (Altlast ehrlich zeigen)
    let legacyBytes = 0, legacyCount = 0, legacyMine = 0, legacyMineBytes = 0;
    for (const list of Object.values(db.messages)) {
      for (const m of list) {
        const u = (m.attachment && m.attachment.url) || m.image || '';
        if (String(u).startsWith('data:')) {
          legacyBytes += String(u).length; legacyCount++;
          // Nur eigene lassen sich umziehen — der Rest gehört anderen Nutzern.
          if (m.senderId === me.id && !m.deleted) { legacyMine++; legacyMineBytes += String(u).length; }
        }
      }
    }

    res.json({
      mine: { bytes: usedBy(me.id), limit: LIMIT.quotaPerUser, percent: Math.round(usedBy(me.id) / LIMIT.quotaPerUser * 100), byKind, count: mine.length },
      limits: { normal: LIMIT.normal, vip: LIMIT.vip, quota: LIMIT.quotaPerUser, isVip: isVip(me) },
      disk: { files: filesOnDisk, bytes: bytesOnDisk },
      legacy: { count: legacyCount, bytes: legacyBytes, mine: legacyMine, mineBytes: legacyMineBytes, note: 'alte Anhänge, noch als Base64 in der Datenbank' },
    });
  }));

  /** Alte Base64-Anhänge in echte Dateien umziehen (nur eigene). */
  app.post('/api/v427/storage/migrate', auth, h(async (req, res) => {
    const me = req.user;
    let moved = 0, bytes = 0, skipped = 0;
    for (const list of Object.values(db.messages)) {
      for (const m of list) {
        if (m.senderId !== me.id || m.deleted) continue;
        const a = m.attachment || {};
        const url = String(a.url || m.image || '');
        if (!url.startsWith('data:')) continue;
        const mm = /^data:([^;,]+);base64,(.+)$/s.exec(url);
        if (!mm || !MIME[mm[1].toLowerCase()]) { skipped++; continue; }
        let buf;
        try { buf = Buffer.from(mm[2], 'base64'); } catch (e) { skipped++; continue; }
        if (buf.length > limitFor(me)) { skipped++; continue; }
        const id = 'md_' + crypto.randomBytes(9).toString('hex');
        const mime = mm[1].toLowerCase();
        const rec = {
          id, ownerId: me.id, chatId: m.chatId, mime, ext: MIME[mime],
          size: buf.length, name: a.name || 'datei.' + MIME[mime],
          kind: KIND_OF(mime), createdAt: m.createdAt || Date.now(), migrated: true,
        };
        fs.writeFileSync(fileOf(rec), buf, { mode: 0o600 });
        db.media[id] = rec;
        const newUrl = '/media/' + id + '.' + rec.ext;
        if (a.url) a.url = newUrl;
        if (m.image && String(m.image).startsWith('data:')) m.image = newUrl;
        moved++; bytes += buf.length;
      }
    }
    if (moved) saveDb();
    res.json({ ok: true, moved, freedBytes: bytes, skipped, note: moved ? 'Anhänge liegen jetzt als Dateien — die Datenbank ist kleiner geworden' : 'nichts umzuziehen' });
  }));

  console.log(`🖼️ V4.27 aktiv — Upload nach data/media/ · ${Object.keys(MIME).length} Dateitypen · ${GIFS.length} GIFs · Quota ${LIMIT.quotaPerUser / 1048576} MB`);

  return {
    MIME,
    LIMIT,
    GIFS,
    MEDIA_DIR,
    usedBy,
    limitFor,
    ROUTES: [
      'POST   /api/v427/media                (base64 oder dataUrl)',
      'GET    /api/v427/media/:file          (mit Content-Type)',
      'GET    /api/v427/media/:id/info',
      'DELETE /api/v427/media/:id            (Platte + DB)',
      'GET    /api/v427/chats/:id/media      (Fotos/Videos/Voice/Docs/Links)',
      'GET    /api/v427/gifs?q=',
      'GET    /api/v427/storage',
      'POST   /api/v427/storage/migrate      (Base64 → Datei)',
    ],
  };
}

module.exports = { createV427, MIME, LIMIT, GIFS, KIND_OF, VERSION };
