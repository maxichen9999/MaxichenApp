/* =====================================================================
   🚀 LoveChat V3 MAX — Server-Erweiterungen
   Wallpaper · App-Background · Sessions · 2FA · Export · Auto-Delete
   Pins · Weiterleiten · KI-Extras
   ===================================================================== */
'use strict';

const crypto = require('crypto');

/* ---------------- TOTP (RFC 6238, ohne externe Pakete) ---------------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secret, step = 30, at = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
  return String(bin % 1000000).padStart(6, '0');
}

/** prüft Code mit ±1 Zeitfenster (Uhrzeit-Toleranz) */
function verifyTotp(secret, code) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const now = Date.now();
  for (const delta of [-1, 0, 1]) {
    if (totpCode(secret, 30, now + delta * 30000) === c) return true;
  }
  return false;
}

/* ---------------- Hilfen ---------------- */
const tokenId = (tok) => crypto.createHash('sha256').update(String(tok)).digest('hex').slice(0, 12);

function uaLabel(ua) {
  const s = String(ua || '');
  if (/Android/i.test(s)) return '📱 Android';
  if (/iPhone|iPad/i.test(s)) return '📱 iOS';
  if (/Windows/i.test(s)) return '💻 Windows';
  if (/Macintosh/i.test(s)) return '💻 Mac';
  if (/Linux/i.test(s)) return '💻 Linux';
  return '🌐 Unbekannt';
}

function createV3(app, h, ctx) {
  const { db, saveDb, nextId, auth, getChatOr404, isChatAdmin, sendToChat, sendToUser, chatSummary, MOD, onlineUsers } = ctx;

  /* ============================================================
     🎨 GLOBALER APP-HINTERGRUND
     ============================================================ */
  app.get('/api/app-background', auth, h(async (req, res) => {
    const bg = req.user.appBackground || { type: 'preset', value: 'pink-dream' };
    res.json({ background: bg });
  }));

  app.post('/api/app-background', auth, h(async (req, res) => {
    const b = req.body || {};
    const type = String(b.type || 'preset');
    const value = String(b.value || '');
    if (!['preset', 'custom', 'animated'].includes(type)) return res.status(400).json({ error: 'Unbekannter Typ' });
    if (type === 'custom') {
      if (!value.startsWith('data:image/')) return res.status(400).json({ error: 'Bild fehlt' });
      if (value.length > 3.5 * 1024 * 1024) return res.status(400).json({ error: 'Bild zu groß (max. 2,5 MB)' });
    }
    if (type === 'preset' && !value) return res.status(400).json({ error: 'Preset fehlt' });
    if (type === 'animated' && !['stars', 'hearts', 'bubbles', 'aurora'].includes(value)) {
      return res.status(400).json({ error: 'Unbekannte Animation' });
    }
    req.user.appBackground = { type, value, updatedAt: Date.now() };
    saveDb();
    res.json({ ok: true, background: req.user.appBackground });
  }));

  /* ============================================================
     🖼️ CHAT-WALLPAPER (pro Chat, synchron zwischen Web + App)
     ============================================================ */
  app.post('/api/chats/:id/wallpaper', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const me = req.user;
    const b = req.body || {};
    const type = String(b.type || 'default');
    const value = String(b.value || '');
    const personal = !!b.personal;

    if (!['default', 'preset', 'custom', 'per-contact'].includes(type)) {
      return res.status(400).json({ error: 'Unbekannter Typ' });
    }
    if (type === 'custom') {
      if (!value.startsWith('data:image/')) return res.status(400).json({ error: 'Bild fehlt' });
      if (value.length > 2.5 * 1024 * 1024) return res.status(400).json({ error: 'Bild zu groß (max. 1,8 MB)' });
    }

    const entry = { type, value, updatedAt: Date.now(), updatedBy: me.id };
    if (personal) {
      chat.wallpaperByUser = chat.wallpaperByUser || {};
      chat.wallpaperByUser[me.id] = entry;
    } else {
      chat.wallpaper = entry;
      chat.wallpaperByUser = {};
    }
    saveDb();

    // alle Mitglieder bekommen das neue Wallpaper live
    for (const uid of chat.memberIds) {
      sendToUser(uid, {
        type: 'chat:wallpaper',
        chatId: chat.id,
        wallpaper: chat.wallpaper || null,
        personal: chat.wallpaperByUser?.[uid] || null,
      });
    }
    res.json({ ok: true, wallpaper: chat.wallpaper || null, personal: chat.wallpaperByUser?.[me.id] || null });
  }));

  /* ============================================================
     📌 NACHHALTIG: PIN · WEITERLEITEN · AUTO-DELETE
     ============================================================ */
  app.post('/api/chats/:id/messages/:mid/pin', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const msg = (db.messages[chat.id] || []).find((m) => m.id === String(req.params.mid));
    if (!msg) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    if (!isChatAdmin(req.user, chat) && MOD.rankOf(req.user) < MOD.RANKS.moderator && msg.senderId !== req.user.id) {
      return res.status(403).json({ error: 'Nur Verwalter können fremde Nachrichten anpinnen' });
    }
    // Pro Chat nur EINE angepinnte Nachricht — wie WhatsApp.
    // Ohne gepinnnten Wert: umschalten.
    const want = (req.body || {}).pinned;
    const next = typeof want === 'boolean' ? want : !msg.pinned;
    if (next) for (const m of db.messages[chat.id] || []) if (m.id !== msg.id) m.pinned = false;
    msg.pinned = next;
    msg.pinnedBy = req.user.displayName;
    saveDb();
    sendToChat(chat.id, { type: 'message:updated', chatId: chat.id, message: msgPublicLite(msg) });
    res.json({ ok: true, pinned: msg.pinned, message: msg.pinned ? 'Angepinnt 📌' : 'Pin gelöst' });
  }));

  app.post('/api/chats/:id/messages/:mid/forward', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const msg = (db.messages[chat.id] || []).find((m) => m.id === String(req.params.mid));
    if (!msg || msg.deleted) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    const target = db.chats[String((req.body || {}).toChatId || '')];
    if (!target) return res.status(404).json({ error: 'Ziel-Chat nicht gefunden' });
    if (!target.memberIds.includes(req.user.id)) return res.status(403).json({ error: 'Du bist nicht in diesem Chat' });

    const copy = {
      id: nextId('m_'),
      chatId: target.id,
      senderId: req.user.id,
      text: msg.text || '',
      image: msg.image || null,
      kind: msg.kind || 'text',
      attachment: msg.attachment ? { ...msg.attachment } : null,
      createdAt: Date.now(),
      reactions: {},
      readBy: [req.user.id],
      forwarded: true,
      forwardedFrom: (db.users[msg.senderId] || {}).displayName || 'Unbekannt',
    };
    (db.messages[target.id] = db.messages[target.id] || []).push(copy);
    saveDb();
    sendToChat(target.id, { type: 'message:new', chatId: target.id, message: msgPublicLite(copy) });
    for (const uid of target.memberIds) sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, target) });
    res.json({ ok: true, message: 'Weitergeleitet ➡️', chatId: target.id });
  }));

  app.post('/api/chats/:id/auto-delete', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    if (!isChatAdmin(req.user, chat)) return res.status(403).json({ error: 'Nur Verwalter dürfen das einstellen' });
    const sec = Math.max(0, Math.min(30 * 86400, parseInt((req.body || {}).seconds, 10) || 0));
    chat.autoDelete = sec || 0;
    saveDb();
    res.json({ ok: true, autoDelete: chat.autoDelete });
  }));

  /* ============================================================
     🔐 2FA (TOTP)
     ============================================================ */
  app.get('/api/2fa', auth, h(async (req, res) => {
    const t = req.user.twoFactor || {};
    res.json({ enabled: !!t.enabled, pending: !!t.secret && !t.enabled, createdAt: t.enabledAt || null });
  }));

  app.post('/api/2fa/setup', auth, h(async (req, res) => {
    const secret = base32Encode(crypto.randomBytes(20));
    req.user.twoFactor = { secret, enabled: false, createdAt: Date.now() };
    saveDb();
    const label = encodeURIComponent(`LoveChat:${req.user.username}`);
    res.json({
      secret,
      otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=LoveChat&algorithm=SHA1&digits=6&period=30`,
      hint: 'Scanne den Code in einer Authenticator-App (Aegis, Google Authenticator) und gib die 6 Ziffern ein.',
    });
  }));

  app.post('/api/2fa/enable', auth, h(async (req, res) => {
    const t = req.user.twoFactor || {};
    if (!t.secret) return res.status(400).json({ error: 'Erst Setup starten' });
    if (!verifyTotp(t.secret, (req.body || {}).code)) return res.status(400).json({ error: 'Code falsch — versuch es nochmal' });
    req.user.twoFactor = { ...t, enabled: true, enabledAt: Date.now() };
    saveDb();
    MOD.logAction(req.user, req.user, '2FA', 'Zwei-Faktor aktiviert');
    res.json({ ok: true, message: '2FA ist aktiv 🔐' });
  }));

  app.post('/api/2fa/disable', auth, h(async (req, res) => {
    const t = req.user.twoFactor || {};
    if (!t.enabled) return res.status(400).json({ error: '2FA ist nicht aktiv' });
    if (!verifyTotp(t.secret, (req.body || {}).code)) return res.status(400).json({ error: 'Code falsch' });
    delete req.user.twoFactor;
    saveDb();
    MOD.logAction(req.user, req.user, '2FA', 'Zwei-Faktor deaktiviert');
    res.json({ ok: true, message: '2FA deaktiviert' });
  }));

  /* ============================================================
     🖥️ SITZUNGEN
     ============================================================ */
  app.get('/api/sessions', auth, h(async (req, res) => {
    const meta = (db.tokenMeta = db.tokenMeta || {});
    const current = String(req.headers.authorization || '').replace('Bearer ', '');
    const list = [];
    for (const [tok, uid] of Object.entries(db.tokens)) {
      if (uid !== req.user.id) continue;
      const id = tokenId(tok);
      const m = meta[tok] || {};
      list.push({
        id,
        current: tok === current,
        device: m.device || '🌐 Unbekannt',
        ip: m.ip || '',
        createdAt: m.createdAt || 0,
        lastSeen: m.lastSeen || 0,
      });
    }
    list.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || b.lastSeen - a.lastSeen);
    res.json({ sessions: list });
  }));

  /**
   * 🔧 V4.12 FIX: vorher rief das hier MOD.kick(req.user.id) auf — und das
   * löscht ALLE Tokens des Nutzers. Wer ein fremdes Gerät abgemeldet hat,
   * flog gleich selbst mit raus. Einzelne Sitzung heißt jetzt auch einzelne.
   */
  app.delete('/api/sessions/:id', auth, h(async (req, res) => {
    const want = String(req.params.id);
    const self = String(req.headers.authorization || '').replace('Bearer ', '');
    for (const [tok, uid] of Object.entries(db.tokens)) {
      if (uid === req.user.id && tokenId(tok) === want) {
        delete db.tokens[tok];
        if (db.tokenMeta) delete db.tokenMeta[tok];
        saveDb();
        const isSelf = tok === self;
        if (isSelf) {
          return res.json({ ok: true, self: true, message: 'Diese Sitzung wurde abgemeldet 👋' });
        }
        // Nur den betroffenen Socket schließen, nicht den des Nutzers überall
        try { MOD.closeTokenSockets(tok, 'Du wurdest auf einem anderen Gerät abgemeldet.'); } catch (e) {}
        return res.json({ ok: true, message: 'Sitzung beendet 🔒' });
      }
    }
    res.status(404).json({ error: 'Sitzung nicht gefunden' });
  }));

  app.delete('/api/sessions', auth, h(async (req, res) => {
    const current = String(req.headers.authorization || '').replace('Bearer ', '');
    let n = 0;
    for (const [tok, uid] of Object.entries(db.tokens)) {
      if (uid === req.user.id && tok !== current) { delete db.tokens[tok]; n++; }
    }
    saveDb();
    res.json({ ok: true, message: `${n} andere Sitzungen beendet 🔒`, count: n });
  }));

  /* ============================================================
     📦 EXPORT · KONTO LÖSCHEN
     ============================================================ */
  app.get('/api/export', auth, h(async (req, res) => {
    const me = req.user;
    const chats = Object.values(db.chats)
      .filter((c) => c.memberIds.includes(me.id))
      .map((c) => ({
        id: c.id, name: c.name, type: c.type, createdAt: c.createdAt,
        messages: (db.messages[c.id] || []).filter((m) => !m.deleted).map(msgPublicLite),
      }));
    res.json({
      exportedAt: new Date().toISOString(),
      user: { id: me.id, username: me.username, displayName: me.displayName, phone: me.phone, email: me.email, createdAt: me.createdAt },
      chats,
      warnings: me.warnings || [],
      settings: { appBackground: me.appBackground || null },
    });
  }));

  app.delete('/api/me', auth, h(async (req, res) => {
    const me = req.user;
    if (MOD.isOwner(me)) return res.status(403).json({ error: 'Das Owner-Konto kann nicht gelöscht werden 👑' });
    const pw = String((req.body || {}).password || '');
    if (!ctx.checkPassword(me, pw)) return res.status(401).json({ error: 'Passwort falsch' });

    for (const [tok, uid] of Object.entries(db.tokens)) if (uid === me.id) delete db.tokens[tok];
    for (const chat of Object.values(db.chats)) {
      chat.memberIds = (chat.memberIds || []).filter((x) => x !== me.id);
      chat.adminIds = (chat.adminIds || []).filter((x) => x !== me.id);
      if (!chat.memberIds.length) delete db.chats[chat.id];
    }
    for (const cid of Object.keys(db.messages)) {
      db.messages[cid] = db.messages[cid].filter((m) => m.senderId !== me.id);
    }
    delete db.users[me.id];
    saveDb();
    MOD.logAction(null, { id: me.id, displayName: me.displayName }, 'KONTO-LÖSCHUNG', 'Konto auf eigenen Wunsch gelöscht');
    res.json({ ok: true, message: 'Dein Konto wurde gelöscht 💔' });
  }));

  /* ============================================================
     ✨ KI-EXTRAS: Zusammenfassen · Übersetzen · Antwortvorschläge
     ============================================================ */
  app.post('/api/ai/summary', auth, h(async (req, res) => {
    const chat = db.chats[String((req.body || {}).chatId || '')];
    if (!chat || !chat.memberIds.includes(req.user.id)) return res.status(404).json({ error: 'Chat nicht gefunden' });
    const msgs = (db.messages[chat.id] || []).filter((m) => !m.deleted).slice(-60);
    if (!msgs.length) return res.json({ summary: 'Hier ist noch nichts passiert 💗' });
    const byUser = {};
    for (const m of msgs) {
      const n = (db.users[m.senderId] || {}).displayName || 'Unbekannt';
      byUser[n] = (byUser[n] || 0) + 1;
    }
    const topics = msgs.map((m) => m.text || '').join(' ').toLowerCase();
    const words = topics.split(/[^a-zäöüß0-9]+/).filter((w) => w.length > 4);
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
    const parts = Object.entries(byUser).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c})`);
    const summary =
      `📨 ${msgs.length} Nachrichten, ${Object.keys(byUser).length} Leute.\n` +
      `Am aktivsten: ${parts.slice(0, 3).join(', ')}.\n` +
      (top.length ? `Häufige Wörter: ${top.join(', ')}.\n` : '') +
      `Letzte Nachricht: „${(msgs[msgs.length - 1].text || '📎 Anhang').slice(0, 90)}“`;
    res.json({ summary, count: msgs.length, engine: 'loveai-lokal' });
  }));

  app.post('/api/ai/suggest', auth, h(async (req, res) => {
    const chat = db.chats[String((req.body || {}).chatId || '')];
    if (!chat || !chat.memberIds.includes(req.user.id)) return res.status(404).json({ error: 'Chat nicht gefunden' });
    const last = (db.messages[chat.id] || []).filter((m) => !m.deleted).slice(-1)[0];
    const t = (last?.text || '').toLowerCase();
    let out;
    if (/\?$/.test(t) || /^(was|wie|wo|wann|wer|warum|kannst|hast|bist)/.test(t)) {
      out = ['Ja, klar! 💗', 'Hmm, lass mich kurz überlegen ✨', 'Erzähl mir mehr davon 🎀'];
    } else if (/danke/.test(t)) {
      out = ['Immer doch 💗', 'Gern! ✨', 'Kein Ding 🎀'];
    } else if (/hallo|hi|hey|na\b/.test(t)) {
      out = ['Hey! 💗 Wie geht’s dir?', 'Hallo du ✨', 'Na, alles gut bei dir? 🎀'];
    } else {
      out = ['Haha 😂', 'Das klingt gut! 💗', 'Bin dabei ✨'];
    }
    res.json({ suggestions: out });
  }));

  app.post('/api/ai/translate', auth, h(async (req, res) => {
    const b = req.body || {};
    const text = String(b.text || '').slice(0, 2000);
    if (!text) return res.status(400).json({ error: 'Kein Text' });
    const key = (process.env.OPENAI_API_KEY || '').trim();
    if (key) {
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Übersetze den Text. Antworte NUR mit der Übersetzung.' },
              { role: 'user', content: `Nach ${b.lang || 'Englisch'}: ${text}` },
            ],
            max_tokens: 600,
          }),
        });
        const d = await r.json();
        const out = d.choices?.[0]?.message?.content?.trim();
        if (out) return res.json({ translation: out, engine: 'openai' });
      } catch (e) {}
    }
    res.json({
      translation: null,
      engine: 'loveai-lokal',
      message: 'Für echte Übersetzungen braucht LoveAI einen API-Key (OPENAI_API_KEY) 🔑',
    });
  }));

  /* ============================================================
     ⏱️ AUTO-DELETE + SITZUNGS-METADATEN (Hintergrund-Jobs)
     ============================================================ */
  setInterval(() => {
    let changed = false;
    for (const chat of Object.values(db.chats)) {
      if (!chat.autoDelete) continue;
      const arr = db.messages[chat.id] || [];
      const cutoff = Date.now() - chat.autoDelete * 1000;
      const keep = arr.filter((m) => m.createdAt > cutoff);
      if (keep.length !== arr.length) {
        db.messages[chat.id] = keep;
        changed = true;
      }
    }
    // Sitzungs-Metadaten nachziehen
    const meta = (db.tokenMeta = db.tokenMeta || {});
    for (const [tok, uid] of Object.entries(db.tokens)) {
      if (!meta[tok]) {
        meta[tok] = { device: '🌐 Unbekannt', createdAt: Date.now(), lastSeen: Date.now(), ip: '' };
        changed = true;
      }
    }
    if (changed) saveDb();
  }, 60000).unref?.();

  console.log('🚀 V3 aktiv — Wallpaper · 2FA · Sessions · Auto-Delete · KI-Extras');
}

/** kompakte Nachricht (ohne Zirkelbezug) */
function msgPublicLite(m) {
  return {
    id: m.id,
    senderId: m.senderId,
    text: m.text || '',
    image: m.image || null,
    kind: m.kind || (m.image ? 'photo' : 'text'),
    attachment: m.attachment || null,
    createdAt: m.createdAt,
    reactions: m.reactions || {},
    readBy: m.readBy || [],
    replyTo: m.replyTo || null,
    editedAt: m.editedAt || null,
    deleted: !!m.deleted,
    pinned: !!m.pinned,
    forwarded: !!m.forwarded,
    forwardedFrom: m.forwardedFrom || null,
  };
}

module.exports = { createV3, verifyTotp, totpCode, base32Encode, msgPublicLite };
