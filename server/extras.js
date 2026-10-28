/* =====================================================================
   ✨ MaxiChat EXTRAS (V4.4)
   Standort live (1 h) · Sprach-Transkription · Gruppen-Calls (bis 8)
   Kontakte importieren + Einladung · verschlüsseltes Backup
   Screenshot-Schutz-Flag · mehr Themes
   ===================================================================== */

const crypto = require('crypto');
const zlib = require('zlib');

function createExtras(app, h, ctx) {
  const { db, saveDb, nextId, auth, getChatOr404, isChatAdmin, chatSummary, sendToUser, MOD, onlineUsers } = ctx;

  /* =====================================================================
     📍 STANDORT LIVE (1 Stunde)
     ===================================================================== */
  function ensureLive() {
    if (!db.liveLocations) db.liveLocations = {};
    return db.liveLocations;
  }

  app.post('/api/chats/:id/location/live', auth, h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const b = req.body || {};
    const lat = parseFloat(b.lat);
    const lng = parseFloat(b.lng);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'Koordinaten ungültig', code: 'bad_coords' });
    }
    const minutes = Math.min(Math.max(parseInt(b.minutes, 10) || 60, 5), 60); // max 1 h
    const live = ensureLive();
    const entry = {
      id: nextId('loc_'),
      chatId: chat.id,
      userId: me.id,
      lat, lng,
      startedAt: Date.now(),
      expiresAt: Date.now() + minutes * 60 * 1000,
      minutes,
    };
    live[chat.id + ':' + me.id] = entry;
    saveDb();
    for (const uid of chat.memberIds) {
      if (uid === me.id) continue;
      sendToUser(uid, {
        type: 'location:live', chatId: chat.id, entry,
        text: me.displayName + ' teilt jetzt ' + minutes + ' Min lang den Standort 📍',
      });
    }
    res.json({ ok: true, live: entry });
  }));

  app.post('/api/chats/:id/location/stop', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const live = ensureLive();
    delete live[chat.id + ':' + req.user.id];
    saveDb();
    for (const uid of chat.memberIds) {
      if (uid === req.user.id) continue;
      sendToUser(uid, { type: 'location:stop', chatId: chat.id, userId: req.user.id });
    }
    res.json({ ok: true });
  }));

  app.get('/api/chats/:id/location/live', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const now = Date.now();
    const live = ensureLive();
    const list = Object.values(live)
      .filter((e) => e.chatId === chat.id && e.expiresAt > now)
      .map((e) => ({ ...e, name: (db.users[e.userId] || {}).displayName || '?' }));
    res.json({ live: list });
  }));

  /* =====================================================================
     🎙️ SPRACH-TRANSKRIPTION
     ===================================================================== */
  app.post('/api/chats/:id/messages/:mid/transcribe', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const m = (db.messages[chat.id] || []).find((x) => x.id === String(req.params.mid));
    if (!m) return res.status(404).json({ error: 'Nachricht nicht gefunden' });

    if (m.transcript) return res.json({ ok: true, transcript: m.transcript, cached: true });

    // Ohne echten Speech-to-Text-Provider: ehrlicher Platzhalter + Hinweis.
    const dur = (m.attachment && m.attachment.duration) || 0;
    const hint = m.enc
      ? '🔐 E2E-Nachricht — Transkription muss auf dem Gerät passieren (kommt mit V4.5).'
      : (dur ? '🎙️ Sprachnachricht · ' + Math.round(dur) + ' s' : '🎙️ Sprachnachricht') +
        ' — für echte Transkription braucht der Server einen Speech-Provider (z. B. Whisper). Der Platzhalter ist aktiv.';

    m.transcript = {
      text: hint,
      provider: 'placeholder',
      createdAt: Date.now(),
    };
    saveDb();
    res.json({ ok: true, transcript: m.transcript, needsProvider: true });
  }));

  /* =====================================================================
     👥 GRUPPEN-CALLS (bis 8 Personen, Mesh)
     ===================================================================== */
  function ensureCalls() {
    if (!db.groupCalls) db.groupCalls = {};
    return db.groupCalls;
  }

  app.post('/api/calls/:chatId/join', auth, h(async (req, res) => {
    const me = req.user;
    const chat = db.chats[String(req.params.chatId)];
    if (!chat || !chat.memberIds.includes(me.id)) return res.status(404).json({ error: 'Chat nicht gefunden' });
    if (chat.type === 'private') return res.status(400).json({ error: 'Für 1:1 den normalen Anruf nutzen' });

    const calls = ensureCalls();
    let call = calls[chat.id];
    if (!call) call = calls[chat.id] = { id: nextId('call_'), chatId: chat.id, startedAt: Date.now(), participants: [] };

    // alte Teilnehmer aufräumen (10 Min ohne Ping = raus)
    call.participants = call.participants.filter((p) => Date.now() - p.lastSeen < 10 * 60 * 1000);
    if (!call.participants.some((p) => p.userId === me.id)) {
      if (call.participants.length >= 8) {
        return res.status(409).json({ error: 'Der Gruppen-Call ist voll (max. 8) 👥', code: 'call_full' });
      }
      call.participants.push({ userId: me.id, name: me.displayName, joinedAt: Date.now(), lastSeen: Date.now(), muted: false });
      /* ✅ V4.23: Gruppen-Call landet im Anruf-Verlauf (Tab „Anrufe").
         Direkt in die DB geschrieben, damit extras.js nicht von v423 abhängt. */
      if (!Array.isArray(db.callLog)) db.callLog = [];
      db.callLog.push({
        id: 'cl_' + crypto.randomBytes(6).toString('hex'),
        chatId: chat.id, userId: me.id, peerId: null,
        kind: (req.body || {}).video ? 'video' : 'voice',
        direction: 'out', status: 'answered', group: true,
        startedAt: Date.now(), durationSec: 0,
      });
      if (db.callLog.length > 4000) db.callLog.splice(0, db.callLog.length - 4000);
    } else {
      call.participants.find((p) => p.userId === me.id).lastSeen = Date.now();
    }
    saveDb();
    // alle anderen informieren (Mesh: jeder ruft jeden direkt an)
    for (const p of call.participants) {
      if (p.userId === me.id) continue;
      sendToUser(p.userId, { type: 'call:peer-joined', chatId: chat.id, callId: call.id, peer: { userId: me.id, name: me.displayName } });
    }
    res.json({ ok: true, call, peers: call.participants.filter((p) => p.userId !== me.id), max: 8 });
  }));

  app.post('/api/calls/:chatId/leave', auth, h(async (req, res) => {
    const chat = db.chats[String(req.params.chatId)];
    if (!chat) return res.status(404).json({ error: 'Chat nicht gefunden' });
    const calls = ensureCalls();
    const call = calls[chat.id];
    if (!call) return res.json({ ok: true });
    call.participants = call.participants.filter((p) => p.userId !== req.user.id);
    /* ✅ V4.23: Dauer nachtragen — letzter Eintrag dieses Nutzers im Chat. */
    if (Array.isArray(db.callLog)) {
      const mine = db.callLog.filter((e) => e.userId === req.user.id && e.chatId === chat.id);
      const last = mine[mine.length - 1];
      if (last && !last.durationSec) last.durationSec = Math.max(0, Math.round((Date.now() - last.startedAt) / 1000));
    }
    if (call.participants.length === 0) delete calls[chat.id];
    saveDb();
    for (const p of (call.participants || [])) {
      sendToUser(p.userId, { type: 'call:peer-left', chatId: chat.id, userId: req.user.id });
    }
    res.json({ ok: true });
  }));

  app.get('/api/calls/:chatId', auth, h(async (req, res) => {
    const chat = db.chats[String(req.params.chatId)];
    if (!chat || !chat.memberIds.includes(req.user.id)) return res.status(404).json({ error: 'Chat nicht gefunden' });
    const call = ensureCalls()[chat.id];
    res.json({ call: call || null, max: 8 });
  }));

  /* =====================================================================
     📇 KONTAKTE IMPORTIEREN + EINLADUNG
     ===================================================================== */
  const phoneHash = (p) => crypto.createHash('sha256').update('lovechat·phone·' + String(p || '').replace(/[^\d+]/g, '')).digest('hex');

  app.post('/api/contacts/import', auth, h(async (req, res) => {
    const hashes = Array.isArray((req.body || {}).hashes) ? req.body.hashes.slice(0, 2000) : [];
    if (!hashes.length) return res.json({ matches: [], notFound: 0 });
    const map = new Map();
    for (const u of Object.values(db.users)) {
      if (!u.phone || u.id === req.user.id) continue;
      map.set(phoneHash(u.phone), u);
    }
    const matches = [];
    for (const h of hashes) {
      const u = map.get(String(h));
      if (u) {
        matches.push({ id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar || '💗' });
        map.delete(String(h));
      }
    }
    res.json({ matches, notFound: hashes.length - matches.length, hint: 'Telefonnummern werden nur als Hash verglichen.' });
  }));

  app.post('/api/invite', auth, h(async (req, res) => {
    const me = req.user;
    if (!db.invites) db.invites = {};
    const code = crypto.randomBytes(4).toString('hex');
    db.invites[code] = { code, byId: me.id, byName: me.displayName, createdAt: Date.now(), usedBy: [] };
    saveDb();
    res.json({
      ok: true, code,
      link: 'https://maxichen.de/invite/' + code,
      text: me.displayName + ' lädt dich zu MaxiChat ein 💗 ' + 'https://maxichen.de/invite/' + code,
    });
  }));

  app.get('/api/invite/:code', h(async (req, res) => {
    const inv = (db.invites || {})[String(req.params.code)];
    if (!inv) return res.status(404).json({ error: 'Einladung unbekannt' });
    res.json({ ok: true, byName: inv.byName, createdAt: inv.createdAt });
  }));

  /* =====================================================================
     🔐 VERSCHLÜSSELTES BACKUP
     scrypt(Passwort) → AES-256-GCM → base64
     ===================================================================== */
  app.post('/api/export/encrypted', auth, h(async (req, res) => {
    const me = req.user;
    const pass = String((req.body || {}).password || '');
    if (pass.length < 8) return res.status(400).json({ error: 'Backup-Passwort mindestens 8 Zeichen' });

    const payload = {
      version: 4,
      exportedAt: new Date().toISOString(),
      user: { id: me.id, username: me.username, displayName: me.displayName, phone: me.phone, email: me.email },
      chats: Object.values(db.chats).filter((c) => c.memberIds.includes(me.id)).map((c) => ({
        id: c.id, type: c.type, name: c.type === 'private' ? '' : c.name, memberIds: c.memberIds,
      })),
      messages: Object.entries(db.messages)
        .filter(([cid]) => db.chats[cid] && db.chats[cid].memberIds.includes(me.id))
        .map(([cid, list]) => ({ chatId: cid, messages: list })),
      privacy: me.privacy || {},
    };

    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(pass, salt, 32, { N: 16384, r: 8, p: 1 });
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(raw), cipher.final()]);
    const tag = cipher.getAuthTag();

    res.json({
      ok: true,
      format: 'maxichat-backup-v1',
      cipher: 'AES-256-GCM',
      kdf: 'scrypt(N=16384,r=8,p=1)',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: zlib.gzipSync(ct).toString('base64'),
      size: raw.length,
      hint: 'Nur mit deinem Backup-Passwort entschlüsselbar. Server kann es NICHT wiederherstellen.',
    });
  }));

  app.post('/api/export/decrypt', auth, h(async (req, res) => {
    const b = req.body || {};
    const pass = String(b.password || '');
    try {
      const salt = Buffer.from(b.salt || '', 'base64');
      const iv = Buffer.from(b.iv || '', 'base64');
      const tag = Buffer.from(b.tag || '', 'base64');
      const key = crypto.scryptSync(pass, salt, 32, { N: 16384, r: 8, p: 1 });
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      const ct = zlib.gunzipSync(Buffer.from(b.data || '', 'base64'));
      const out = Buffer.concat([d.update(ct), d.final()]);
      res.json({ ok: true, backup: JSON.parse(out.toString('utf8')) });
    } catch (e) {
      res.status(400).json({ error: 'Backup lässt sich nicht entschlüsseln — Passwort falsch?', code: 'backup_bad_password' });
    }
  }));

  /* =====================================================================
     📸 SCREENSHOT-SCHUTZ-FLAG pro Chat
     ===================================================================== */
  app.post('/api/chats/:id/screenshot-protect', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    chat.screenshotProtect = (req.body || {}).enabled !== false;
    saveDb();
    for (const uid of chat.memberIds) {
      sendToUser(uid, { type: 'chat:screenshot-protect', chatId: chat.id, enabled: !!chat.screenshotProtect });
    }
    res.json({ ok: true, enabled: !!chat.screenshotProtect });
  }));

  /* =====================================================================
     🎨 20 THEMES
     ===================================================================== */
  const THEMES = [
    'pink-dream', 'kawaii-cloud', 'lila-nacht', 'neon-city', 'sakura',
    'galaxy', 'ocean', 'forest', 'sunset', 'candy',
    'mono', 'aurora', 'peach', 'mint', 'lavender',
    'midnight', 'rose-gold', 'bubblegum', 'emerald', 'cherry',
  ];

  app.get('/api/themes', h(async (req, res) => {
    res.json({ themes: THEMES, count: THEMES.length });
  }));

  console.log('✨ V4.4 aktiv — Standort live · Transkription · Gruppen-Calls (8) · Einladungen · verschlüsseltes Backup · 20 Themes');
  return { THEMES };
}

module.exports = { createExtras };
