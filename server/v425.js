/* =====================================================================
 *  📢 v425.js — V4.25 „Offizieller Lovechen Kanal"
 * ---------------------------------------------------------------------
 *  GEMESSEN vor dem Bau (nicht geraten):
 *
 *  ✅ Kanal = Chat mit type='channel'                 (seit V4, server.js)
 *  ✅ Nur Admin schreibt:  server.js:1303
 *       `if (chat.type === 'channel' && !isChatAdmin(me, chat)) → 403`
 *  ✅ Haken signiert:      badges.js ECDSA P-256, Schlüssel in db.badgeKeys
 *  ✅ /api/channels        mine/discover (V4.23, v423.js:203)
 *  ❌ Offizieller Kanal EXISTIERT NICHT (db: nur „Kanal-Test"-Reste)
 *  ❌ Kein Folgen/Entfolgen als eigene Aktion, keine Follower-Zahl-Pflege
 *  ❌ Keine Reaktionen auf Kanal-Beiträge (allgemeine Msg-Reactions
 *     gibt es, aber keine Emoji-Allowlist wie bei WhatsApp-Kanälen)
 *  ❌ Kein signierter KANAL-Haken (badges.js signiert nur NUTZER)
 *  ❌ Kanäle erscheinen in der Chat-Liste, wenn man folgt
 *     (server.js /api/me filtert nur nach memberIds)
 *
 *  Genau diese fünf Lücken schließt dieses Modul. Nichts wird ersetzt.
 * ===================================================================== */
'use strict';

const crypto = require('crypto');

const OFFICIAL_ID = 'c_lovechen_official';
const HANDLE = '@lovechen_official';
const OWNER_USERNAME = 'maxichen';

/* WhatsApp-Kanäle: genau diese sechs Reaktionen. Mehr nicht. */
const REACTIONS = ['❤️', '😍', '😂', '😮', '😢', '🙏'];

const CH_VERSION = 1; // Nutzlast-Version des Kanal-Hakens

function createV425(app, h, ctx) {
  const { db, saveDb, auth, isChatAdmin, msgPublic, publicUser } = ctx;

  /* ------------------------------------------------------------------
   *  Kanal-Haken (ECDSA P-256) — derselbe Schlüssel wie badges.js.
   *  Nutzlast bewusst DOMÄNENGETRENNT von Nutzer-Haken (Präfix LC-CH),
   *  damit eine Nutzer-Signatur nie als Kanal-Signatur durchgeht und
   *  umgekehrt.
   * ------------------------------------------------------------------ */

  function keys() {
    if (db.badgeKeys && db.badgeKeys.privatePem && db.badgeKeys.publicB64) return db.badgeKeys;
    return null; // badges.js erzeugt sie beim ersten /api/badges-Aufruf
  }

  function channelPayload(channelId, ownerId, avatarHash, issuedAt) {
    return Buffer.from(`LC-CH|${CH_VERSION}|${channelId}|${ownerId}|${avatarHash}|${issuedAt}`, 'utf8');
  }

  function avatarHash(avatar) {
    const a = String(avatar || '').trim();
    if (!a) return '';
    return crypto.createHash('sha256').update(a, 'utf8').digest('hex').slice(0, 32);
  }

  /** Signiert den Kanal. Fehlt der Schlüssel, wird er NICHT erfunden. */
  function signChannel(chat, now = Date.now()) {
    const k = keys();
    if (!k) return null;
    const aHash = avatarHash(chat.avatar);
    const data = channelPayload(chat.id, chat.ownerId, aHash, now);
    const sig = crypto.sign('sha256', data, crypto.createPrivateKey({
      key: Buffer.from(k.privatePem, 'base64'),
      format: 'der',
      type: 'pkcs8',
    }));
    return {
      channelId: chat.id,
      ownerId: chat.ownerId,
      avatarHash: aHash,
      issuedAt: now,
      signature: sig.toString('base64'),
      algorithm: 'ECDSA-P256-SHA256',
      version: CH_VERSION,
      payloadFormat: 'LC-CH|version|channelId|ownerId|avatarHash|issuedAt',
    };
  }

  /** Selbsttest: signieren → prüfen → manipulieren. Muss scheitern. */
  function selfTest() {
    const k = keys();
    if (!k) return { ok: false, reason: 'kein_schluessel' };
    const now = Date.now();
    const data = channelPayload(OFFICIAL_ID, 'u_test', 'abc', now);
    const key = crypto.createPrivateKey({ key: Buffer.from(k.privatePem, 'base64'), format: 'der', type: 'pkcs8' });
    const pub = crypto.createPublicKey({ key: Buffer.from(k.publicB64, 'base64'), format: 'der', type: 'spki' });
    const sig = crypto.sign('sha256', data, key);
    const good = crypto.verify('sha256', data, pub, sig);
    const bad = crypto.verify('sha256', channelPayload(OFFICIAL_ID, 'u_evil', 'abc', now), pub, sig);
    return { ok: good === true && bad === false };
  }

  /* ------------------------------------------------------------------
   *  Offizieller Kanal — idempotent anlegen
   * ------------------------------------------------------------------ */

  const OFFICIAL_DESC = 'Offizieller Lovechen Kanal 💗 — hier schreibt nur Maxichen. Reaktionen sind erlaubt, Antworten nicht.';

  function ownerUser() {
    const normalizePhone = (value) => {
      try { return require('./accounts').normalizePhone(String(value || '')); }
      catch (e) { return String(value || '').replace(/[^\d+]/g, ''); }
    };
    const ownerPhone = process.env.OWNER_PHONE || '';
    return Object.values(db.users).find((u) =>
      u.username === OWNER_USERNAME || (ownerPhone && normalizePhone(u.phone) === normalizePhone(ownerPhone))
    ) || null;
  }

  function officialChannel() {
    db.chats = db.chats || {};
    let ch = db.chats[OFFICIAL_ID];
    const owner = ownerUser();
    if (!owner) return null; // ohne Inhaber kein offizieller Kanal

    if (!ch) {
      ch = db.chats[OFFICIAL_ID] = {
        id: OFFICIAL_ID,
        type: 'channel',
        name: 'Lovechen 💗',
        handle: HANDLE,
        avatar: '/assets/lovechen-avatar.png',
        banner: '/assets/kanal-lovechen.png',
        description: OFFICIAL_DESC,
        ownerId: owner.id,
        adminIds: [owner.id],
        memberIds: [],          // = Follower
        official: true,
        verified: true,
        createdAt: Date.now(),
        settings: { allowReactions: true, allowForward: true, showFollowers: true },
      };
      db.messages[OFFICIAL_ID] = [
        {
          id: 'm_ch_welcome_' + crypto.randomBytes(4).toString('hex'),
          chatId: OFFICIAL_ID,
          senderId: owner.id,
          text: 'Willkommen im offiziellen Lovechen Kanal 💗 Hier bekommst du Neuigkeiten zu LoveChat — direkt von Maxichen.',
          createdAt: Date.now(),
          readBy: [owner.id],
          reactions: {},
          kind: 'text',
          broadcast: true,
        },
      ];
      saveDb();
      console.log('📢 Offizieller Lovechen-Kanal angelegt:', OFFICIAL_ID);
    } else {
      // Felder nachziehen, falls der Kanal aus einer älteren Version stammt
      let dirty = false;
      if (ch.verified !== true) { ch.verified = true; dirty = true; }
      if (ch.official !== true) { ch.official = true; dirty = true; }
      if (ch.handle !== HANDLE) { ch.handle = HANDLE; dirty = true; }
      if (!Array.isArray(ch.memberIds)) { ch.memberIds = []; dirty = true; }
      /* 🖼️ V4.31 — altes Emoji-Bild durch das neue Kanalbild ersetzen */
      if (ch.avatar !== '/assets/lovechen-avatar.png') { ch.avatar = '/assets/lovechen-avatar.png'; dirty = true; }
      if (ch.banner !== '/assets/kanal-lovechen.png') { ch.banner = '/assets/kanal-lovechen.png'; dirty = true; }
      if (ch.description !== OFFICIAL_DESC) { ch.description = OFFICIAL_DESC; dirty = true; }
      ch.ownerId = owner.id;
      ch.adminIds = [owner.id];
      if (dirty) saveDb();
    }
    return ch;
  }

  /** Einheitliche Sicht auf einen Kanal. */
  function channelView(ch, me) {
    const msgs = (db.messages[ch.id] || []).filter((m) => !m.deleted);
    const last = msgs.slice().sort((a, b) => b.createdAt - a.createdAt)[0] || null;
    const owner = db.users[ch.ownerId] || {};
    return {
      id: ch.id,
      name: ch.name,
      handle: ch.handle || '',
      avatar: ch.avatar || '📢',
      banner: ch.banner || null,
      description: ch.description || '',
      followers: (ch.memberIds || []).length,
      isFollowing: (ch.memberIds || []).includes(me.id),
      isOwner: ch.ownerId === me.id,
      ownerId: ch.ownerId || null,
      canPost: isChatAdmin(me, ch),
      verified: ch.verified === true,
      official: ch.official === true,
      ownerName: owner.displayName || '',
      createdAt: ch.createdAt || null,
      messageCount: msgs.length,
      lastText: last ? String(last.text || '').slice(0, 120) : '',
      lastAt: last ? last.createdAt : null,
      settings: ch.settings || { allowReactions: true, allowForward: true, showFollowers: true },
      reactions: REACTIONS,
    };
  }

  /** Kanal oder 404 — mit Typ-Prüfung, damit niemand eine Gruppe als Kanal liest. */
  function channelOr404(req, res) {
    const wantId = String(req.params.id || '');
    /* 🔧 V4.31 — gefunden beim Dreh, nicht geraten:
     * Der offizielle Kanal wurde NUR von /api/channels/official angelegt.
     * Der Client fragt aber als Erstes /api/channels/c_lovechen_official an —
     * bekam 404, zeigte keine Karte, und der Kanal existierte nie.
     * Jetzt wird er beim ersten Zugriff angelegt. */
    if (wantId === OFFICIAL_ID && !db.chats[wantId]) officialChannel();
    const ch = db.chats[wantId];
    if (!ch || ch.type !== 'channel') {
      res.status(404).json({ error: 'Kanal nicht gefunden 📢', code: 'no_channel' });
      return null;
    }
    return ch;
  }

  /* ------------------------------------------------------------------
   *  Endpunkte
   * ------------------------------------------------------------------ */

  /** Offizieller Kanal + frisch signierter Haken. */
  app.get('/api/channels/official', auth, h(async (req, res) => {
    const ch = officialChannel();
    if (!ch) return res.status(503).json({ error: 'Inhaber fehlt — Kanal nicht verfügbar', code: 'no_owner' });
    res.set('Cache-Control', 'no-store');
    res.json({ channel: channelView(ch, req.user), badge: signChannel(ch) });
  }));

  /** Kanal-Info (jeder angemeldete Nutzer — Kanäle sind öffentlich lesbar). */
  app.get('/api/channels/:id', auth, h(async (req, res) => {
    const ch = channelOr404(req, res);
    if (!ch) return;
    res.set('Cache-Control', 'no-store');
    res.json({ channel: channelView(ch, req.user) });
  }));

  /** Signierter Kanal-Haken, separat prüfbar. */
  app.get('/api/channels/:id/badge', auth, h(async (req, res) => {
    const ch = channelOr404(req, res);
    if (!ch) return;
    if (ch.verified !== true) return res.status(404).json({ error: 'Dieser Kanal ist nicht verifiziert', code: 'not_verified' });
    res.set('Cache-Control', 'no-store');
    res.json({ badge: signChannel(ch) });
  }));

  /** Beiträge lesen. Kanäle sind öffentlich: auch ohne Folgen lesbar. */
  app.get('/api/channels/:id/messages', auth, h(async (req, res) => {
    const ch = channelOr404(req, res);
    if (!ch) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const all = (db.messages[ch.id] || []).filter((m) => !m.deleted);
    const slice = all.slice(-limit);
    res.set('Cache-Control', 'no-store');
    res.json({
      messages: slice.map((m) => ({ ...msgPublic(m), broadcast: true })),
      total: all.length,
      canPost: isChatAdmin(req.user, ch),
      reactions: REACTIONS,
      readonlyHint: isChatAdmin(req.user, ch) ? '' : 'Nur Admins können schreiben 📢',
    });
  }));

  /**
   * Beitrag schreiben — NUR Inhaber/Verwalter.
   * Die allgemeine Route (POST /api/chats/:id/messages) prüft das schon;
   * hier zusätzlich, damit die Kanal-Route nicht davon abhängt.
   */
  app.post('/api/channels/:id/messages', auth, h(async (req, res) => {
    const ch = channelOr404(req, res);
    if (!ch) return;
    const me = req.user;
    if (!isChatAdmin(me, ch)) {
      return res.status(403).json({
        error: 'In Kanälen darf nur der Inhaber schreiben 📢',
        code: 'channel_readonly',
      });
    }
    const text = String((req.body || {}).text || '').trim().slice(0, 4000);
    const image = typeof (req.body || {}).image === 'string' && req.body.image.startsWith('data:image/') ? req.body.image : '';
    if (!text && !image) return res.status(400).json({ error: 'Beitrag ist leer', code: 'empty' });

    const m = {
      id: 'm_' + crypto.randomBytes(8).toString('hex'),
      chatId: ch.id,
      senderId: me.id,
      text,
      image: image || null,
      createdAt: Date.now(),
      readBy: [me.id],
      reactions: {},
      kind: image ? 'photo' : 'text',
      broadcast: true,
    };
    db.messages[ch.id] = db.messages[ch.id] || [];
    db.messages[ch.id].push(m);
    saveDb();
    res.status(201).json({ message: msgPublic(m) });
  }));

  /** Reaktion — nur aus der WhatsApp-Liste, nur ein Emoji. */
  app.post('/api/channels/:id/messages/:mid/react', auth, h(async (req, res) => {
    const ch = channelOr404(req, res);
    if (!ch) return;
    if (ch.settings && ch.settings.allowReactions === false) {
      return res.status(403).json({ error: 'Reaktionen sind in diesem Kanal aus', code: 'reactions_off' });
    }
    const mid = String(req.params.mid || '');
    const msg = (db.messages[ch.id] || []).find((m) => m.id === mid && !m.deleted);
    if (!msg) return res.status(404).json({ error: 'Beitrag nicht gefunden', code: 'no_message' });

    const emoji = String((req.body || {}).emoji || '');
    if (!REACTIONS.includes(emoji)) {
      return res.status(400).json({
        error: 'Nur diese Reaktionen: ' + REACTIONS.join(' '),
        code: 'bad_emoji',
        allowed: REACTIONS,
      });
    }

    // Eine Reaktion pro Nutzer: neu wählen ersetzt die alte, gleiche wählt ab.
    // 🔴 Hier stand erst `msg.reactions[req.user.id]` — FALSCH. Reaktionen sind
    //    als `{emoji: {users:[...]}}` gespeichert, nicht `{userId: emoji}`.
    //    Der Test D14 hat es aufgedeckt: Abwählen ging nie.
    msg.reactions = msg.reactions || {};
    let previous = null;
    for (const key of Object.keys(msg.reactions)) {
      const slot = msg.reactions[key];
      if (slot && typeof slot === 'object' && Array.isArray(slot.users) && slot.users.includes(req.user.id)) previous = key;
    }
    for (const key of Object.keys(msg.reactions)) {
      if (typeof msg.reactions[key] === 'object' && msg.reactions[key] && msg.reactions[key].users) {
        msg.reactions[key].users = msg.reactions[key].users.filter((u) => u !== req.user.id);
        if (!msg.reactions[key].users.length) delete msg.reactions[key];
      }
    }
    let mine = null;
    if (previous !== emoji) {
      const slot = (msg.reactions[emoji] && typeof msg.reactions[emoji] === 'object') ? msg.reactions[emoji] : { users: [] };
      slot.users = Array.from(new Set([...(slot.users || []), req.user.id]));
      msg.reactions[emoji] = slot;
      mine = emoji;
    }
    saveDb();
    res.json({ messageId: mid, reactions: msg.reactions, mine, allowed: REACTIONS });
  }));

  /** Follower werden (folgen). Idempotent — zweimal folgen zählt nicht doppelt. */
  app.post('/api/channels/:id/follow', auth, h(async (req, res) => {
    const ch = channelOr404(req, res);
    if (!ch) return;
    if (ch.ownerId === req.user.id) return res.status(400).json({ error: 'Dir gehört der Kanal schon 👑', code: 'is_owner' });
    ch.memberIds = ch.memberIds || [];
    const before = ch.memberIds.length;
    if (!ch.memberIds.includes(req.user.id)) {
      ch.memberIds.push(req.user.id);
      saveDb();
    }
    res.json({
      ok: true,
      isFollowing: true,
      followers: ch.memberIds.length,
      added: ch.memberIds.length - before,
      channel: channelView(ch, req.user),
    });
  }));

  /** Entfolgen. Idempotent. */
  app.post('/api/channels/:id/unfollow', auth, h(async (req, res) => {
    const ch = channelOr404(req, res);
    if (!ch) return;
    ch.memberIds = ch.memberIds || [];
    const before = ch.memberIds.length;
    ch.memberIds = ch.memberIds.filter((id) => id !== req.user.id);
    if (ch.memberIds.length !== before) saveDb();
    res.json({ ok: true, isFollowing: false, followers: ch.memberIds.length, removed: before - ch.memberIds.length, channel: channelView(ch, req.user) });
  }));

  /** Beitrag löschen für ALLE — nur Inhaber/Verwalter. */
  app.delete('/api/channels/:id/messages/:mid', auth, h(async (req, res) => {
    const ch = channelOr404(req, res);
    if (!ch) return;
    if (!isChatAdmin(req.user, ch)) {
      return res.status(403).json({ error: 'Nur Admins können Beiträge löschen 📢', code: 'channel_readonly' });
    }
    const msg = (db.messages[ch.id] || []).find((m) => m.id === String(req.params.mid || ''));
    if (!msg) return res.status(404).json({ error: 'Beitrag nicht gefunden', code: 'no_message' });
    msg.deleted = true;
    msg.deletedAt = Date.now();
    msg.deletedBy = req.user.id;
    saveDb();
    res.json({ ok: true, deletedForEveryone: true, messageId: msg.id });
  }));

  /* ------------------------------------------------------------------
   *  🧪 Test-Haken: Session für den Inhaber.
   *  NUR mit MAIL_SIMULATE=1 registriert (wie /api/dev/reset-limits) und
   *  zusätzlich nur mit passendem INTERNAL_TOKEN. In Produktion existiert
   *  die Route nicht — sie wird nicht angelegt.
   * ------------------------------------------------------------------ */
  if (process.env.MAIL_SIMULATE === '1') {
    app.post('/api/dev/session', (req, res) => {
      const want = process.env.INTERNAL_TOKEN || '';
      const got = String(req.headers['x-internal-token'] || '');
      if (!want || got !== want) return res.status(401).json({ error: 'nein' });
      const username = String((req.body || {}).username || '').toLowerCase();
      let user = Object.values(db.users).find((u) => u.username === username);
      /* 📞 V4.29: Nach dem Leeren der Datenbank gibt es keinen „maxichen"
       * mehr. Der Owner existiert erst, wenn er sich mit seiner Nummer
       * anmeldet. Damit die Testsuite (v425/v427) trotzdem läuft, legt
       * dieser TEST-Haken (nur MAIL_SIMULATE=1 + Token) den Owner an —
       * mit der echten Owner-Nummer, also mit echten Owner-Rechten. */
      if (!user && username === 'maxichen') {
        const salt = crypto.randomBytes(16).toString('hex');
        user = {
          id: nextId('u_'),
          username: 'maxichen',
          displayName: 'Maxichen 💗',
          bio: '', avatar: '💗',
          phone: process.env.OWNER_PHONE || '+4915155894714',
          phoneVerified: true,
          email: 'owner@maxichen.de', emailVerified: true,
          salt, pass: hashPassword(crypto.randomBytes(24).toString('hex'), salt),
          createdAt: Date.now(), lastSeen: Date.now(),
          bgSound: true, bg: { default: 'pink-dream', overrides: {} },
          role: 'user', bans: [], warnings: [],
          signup: 'test',
        };
        db.users[user.id] = user;
        saveDb();
        console.log('🧪 Test-Owner angelegt: @maxichen (' + user.phone + ')');
      }
      if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
      const token = crypto.randomBytes(24).toString('hex');
      db.tokens[token] = user.id;
      db.tokenMeta = db.tokenMeta || {};
      db.tokenMeta[token] = { device: '🧪 Test-Session', createdAt: Date.now(), lastSeen: Date.now() };
      saveDb();
      return res.json({ token, user: publicUser(user), testOnly: true });
    });
    console.log('🧪 Test-Route aktiv: POST /api/dev/session (nur MAIL_SIMULATE=1 + INTERNAL_TOKEN)');
  }

  /* ------------------------------------------------------------------
   *  Start: offiziellen Kanal sicherstellen, Haken selbst prüfen
   * ------------------------------------------------------------------ */
  /* ⚠️ WICHTIG: loadDb() läuft in server.js ERST nach allen Modulen (Zeile
     ~1897). Beim Bauen dieses Moduls ist db.users also noch LEER. Deshalb
     wird der Kanal nicht hier, sondern in init() angelegt — server.js ruft
     init() direkt nach loadDb() auf. (Vorher stand hier ein Aufruf und die
     Meldung war „kein Inhaber gefunden" — gemessen, nicht vermutet.) */
  function init() {
    const ch = officialChannel();
    if (ch) {
      const st = selfTest();
      console.log(st.ok
        ? `📢 V4.25 aktiv — Offizieller Kanal ${HANDLE} · verifiziert (ECDSA) · nur ${OWNER_USERNAME} schreibt`
        : '⚠️ V4.25 — Kanal-Haken-Selbsttest FEHLGESCHLAGEN: ' + (st.reason || 'Signatur'));
      return { ok: true, channelId: ch.id, selfTest: st };
    }
    console.log('⚠️ V4.25 — kein Inhaber gefunden, offizieller Kanal bleibt aus');
    return { ok: false, reason: 'no_owner' };
  }

  return {
    init,
    OFFICIAL_ID,
    HANDLE,
    REACTIONS,
    officialChannel,
    signChannel,
    selfTest,
    ROUTES: [
      'GET /api/channels/official',
      'GET /api/channels/:id',
      'GET /api/channels/:id/badge',
      'GET /api/channels/:id/messages',
      'POST /api/channels/:id/messages      (nur Inhaber → sonst 403 channel_readonly)',
      'POST /api/channels/:id/messages/:mid/react  (6 Emojis)',
      'POST /api/channels/:id/follow | /unfollow',
      'DELETE /api/channels/:id/messages/:mid      (nur Inhaber)',
    ],
  };
}

module.exports = { createV425, OFFICIAL_ID, HANDLE, REACTIONS };
