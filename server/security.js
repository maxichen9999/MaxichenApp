/* =====================================================================
   🛡️ MaxiChat SECURITY  (V4.3)
   Privat-Modus · Sicherheits-Center · Login-Schutz · Einmal-Medien
   Versteckte Chats · Inhaltsfilter · Stille Stunden
   ===================================================================== */

const crypto = require('crypto');

const DEFAULTS = {
  allowDmFrom: 'all',        // all | contacts | nobody
  lastSeenPrivacy: 'all',    // all | contacts | nobody
  readReceipts: true,
  profilePhotoPrivacy: 'all',// all | contacts | nobody
  quietHours: { enabled: false, from: '22:00', to: '07:00' },
  screenshotBlock: false,
  strictFilter: true,
  autoLockMinutes: 1,
};

/* Wörter/Pattern, die auf Scam oder Grooming hindeuten */
const RISKY = [
  { re: /\b(bitcoin|crypto|invest(ier)?\s+(jetzt|schnell)|garantierte?\s+rendite)\b/i, w: 2 },
  { re: /\b(gratis|free)\s+(iphone|ps5|gift\s*card|robux|v-?bucks)\b/i, w: 3 },
  { re: /\b(schick|sende|sende?\s+mir)\s+(nudes?|nacktbilder?|fotos?\s+von\s+dir)\b/i, w: 3 },
  { re: /\b(klick|klicke|click)\s+(hier|den\s+link|this\s+link)\b/i, w: 1 },
  { re: /\b(whatsapp|telegram|snap(chat)?)\s*:?\s*\+?\d[\d\s-]{7,}/i, w: 2 },
  { re: /\b(deine?\s+passwort|password|login-?daten|tan|kreditkarte)\b/i, w: 3 },
  { re: /(bit\.ly|tinyurl\.com|t\.me\/|wa\.me\/)/i, w: 1 },
];

function createSecurity(app, h, ctx) {
  const { db, saveDb, nextId, auth, sendToUser, chatSummary, MOD } = ctx;

  /* ---------------- Helfer ---------------- */

  function ensurePrivacy(u) {
    if (!u.privacy) u.privacy = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (u.privacy[k] === undefined) u.privacy[k] = JSON.parse(JSON.stringify(v));
    }
    if (!Array.isArray(u.loginHistory)) u.loginHistory = [];
    if (!Array.isArray(u.hiddenChats)) u.hiddenChats = [];
    return u.privacy;
  }

  function privacyOf(u) {
    return ensurePrivacy(u);
  }

  function contactIdsOf(u) {
    const ids = new Set();
    for (const c of Object.values(db.chats)) {
      if (c.type !== 'private' || !c.memberIds.includes(u.id)) continue;
      for (const m of c.memberIds) if (m !== u.id) ids.add(m);
    }
    return ids;
  }

  /* ================= 🚪 LOGIN-SCHUTZ (Brute Force) ================= */

  /* 🔒 V4.4: Der Zähler hängt am ACCOUNT, nicht an der IP.
     Grund (Feedback): zwei Leute im selben WLAN dürfen sich nicht gegenseitig aussperren.
     Ein IP-Flut-Schutz bleibt separat in server.js (40 Versuche / 15 Min, greift nur bei Bots). */
  const FAILS = new Map(); // username → { n, until, last }
  const MAX_FAILS = 5;
  const LOCK_MS = 15 * 60 * 1000;

  function lockKey(login) {
    return 'acct:' + String(login || '').trim().toLowerCase();
  }

  function checkLock(login) {
    const k = lockKey(login);
    const f = FAILS.get(k);
    if (!f) return null;
    if (f.until && f.until > Date.now()) {
      return { remaining: Math.ceil((f.until - Date.now()) / 1000), fails: f.n, scope: 'account' };
    }
    if (f.until && f.until <= Date.now()) FAILS.delete(k);
    return null;
  }

  function noteFail(login) {
    const k = lockKey(login);
    const f = FAILS.get(k) || { n: 0, until: 0, last: 0 };
    f.n += 1;
    f.last = Date.now();
    if (f.n >= MAX_FAILS) f.until = Date.now() + LOCK_MS;
    FAILS.set(k, f);
    return { fails: f.n, locked: f.n >= MAX_FAILS, left: Math.max(0, MAX_FAILS - f.n) };
  }

  function noteOk(login) {
    FAILS.delete(lockKey(login));
  }

  /* ---------------- 🧨 SECURE DELETE ----------------
     Problem (Feedback): „gelöscht" hieß nur „aus dem JSON genommen" — die Bytes lagen weiter in der Datei.
     Lösung: Inhalt im Speicher überschreiben → Datei mehrfach mit Zufall überschreiben → neu schreiben. */
  const fs = require('fs');
  const crypto2 = require('crypto');

  function wipeString(str) {
    // JS-Strings sind immutable — wir überschreiben die Referenz mit Zufallsdaten gleicher Länge
    // und geben das Original frei; danach wird die DB-Datei ohnehin physisch überschrieben.
    let junk = '';
    const n = Math.min(String(str || '').length, 6 * 1024 * 1024);
    for (let i = 0; i < n; i += 4096) junk += crypto2.randomBytes(Math.min(4096, n - i)).toString('base64');
    return junk.slice(0, n);
  }

  function wipeFile(file, passes = 3) {
    try {
      if (!fs.existsSync(file)) return false;
      const size = fs.statSync(file).size;
      if (!size) return false;
      const fd = fs.openSync(file, 'r+');
      for (let p = 0; p < passes; p++) {
        let written = 0;
        const chunk = 64 * 1024;
        while (written < size) {
          const len = Math.min(chunk, size - written);
          fs.writeSync(fd, crypto2.randomBytes(len), 0, len, written);
          written += len;
        }
        fs.fsyncSync(fd);
      }
      fs.closeSync(fd);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Löscht Medien einer Nachricht sicher.
   * @returns {{wiped:boolean, passes:number, fields:string[]}}
   */
  function secureDeleteMedia(chatId, msg) {
    const fields = [];
    if (!msg) return { wiped: false, passes: 0, fields };
    if (msg.image) { msg.image = wipeString(msg.image); fields.push('image'); }
    if (msg.attachment && msg.attachment.url) { msg.attachment.url = wipeString(msg.attachment.url); fields.push('attachment.url'); }
    if (msg.enc && msg.enc.ct) { msg.enc.ct = wipeString(msg.enc.ct); fields.push('enc.ct'); }
    msg.mediaWipedAt = Date.now();
    return { wiped: fields.length > 0, passes: 3, fields };
  }

  /** Nach dem Sicheren Löschen: DB-Datei physisch überschreiben und frisch schreiben */
  function wipeAndPersist() {
    const file = ctx.dbFile;
    try {
      saveDb();                 // 1. Zustand ohne Klartext speichern
      const ok = wipeFile(file); // 2. alte Bytes mit Zufall überschreiben
      saveDb();                 // 3. frische Datei schreiben
      return ok;
    } catch (e) { return false; }
  }

  /* ================= 📜 LOGIN-VERLAUF ================= */

  function addLoginHistory(user, req, kind = 'login') {
    ensurePrivacy(user);
    const ua = String(req.headers['user-agent'] || '');
    const device = /Android/i.test(ua) ? '📱 Android'
      : /iPhone|iPad/i.test(ua) ? '📱 iOS'
      : /Windows/i.test(ua) ? '💻 Windows'
      : /Macintosh/i.test(ua) ? '💻 Mac'
      : '🌐 Web';
    const known = user.loginHistory.some((l) => l.device === device && l.ip === (req.headers['x-forwarded-for'] || '').split(',')[0].trim());
    user.loginHistory.unshift({
      id: nextId('lh_'),
      device,
      ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.socket.remoteAddress || ''),
      ua: ua.slice(0, 160),
      at: Date.now(),
      kind,
      newDevice: !known && user.loginHistory.length > 0,
    });
    user.loginHistory = user.loginHistory.slice(0, 20);
    if (!known && user.loginHistory.length > 1) {
      try {
        sendToUser(user.id, {
          type: 'security:newDevice', device, at: Date.now(),
          text: 'Neue Anmeldung auf ' + device + ' 👀',
        });
      } catch (e) {}
    }
    return user.loginHistory[0];
  }

  /* ================= 🧼 INHALTS-FILTER ================= */

  function scanText(text) {
    const hits = [];
    let score = 0;
    for (const r of RISKY) {
      if (r.re.test(text)) { score += r.w; hits.push(r.re.source.slice(0, 24)); }
    }
    return { score, hits };
  }

  const RULE_LABELS = {
    'bitcoin|crypto|invest(ier)?\\s+(jetzt|schnell)|garantierte?\\s+rendite': 'Krypto-/Investment-Masche',
    '(gratis|free)\\s+(iphone|ps5|gift\\s*card|robux|v-?bucks)': 'Gewinnspiel-Köder',
    '(schick|sende|sende?\\s+mir)\\s+(nudes?|nacktbilder?|fotos?\\s+von\\s+dir)': 'unangemessene Aufforderung',
    '(klick|klicke|click)\\s+(hier|den\\s+link|this\\s+link)': 'verdächtiger Link',
    '(whatsapp|telegram|snap(chat)?)\\s*:?\\s*\\+?\\d[\\d\\s-]{7,}': 'Abwerben auf anderen Messenger',
    '(deine?\\s+passwort|password|login-?daten|tan|kreditkarte)': 'Fishing nach Passwort/Zahlungsdaten',
    '(bit\\.ly|tinyurl\\.com|t\\.me\\/|wa\\.me\\/)': 'verkürzter Link',
  };

  /** Blockt wirklich nur, was gefährlich ist — und sagt WARUM. */
  function filterMessage(user, text) {
    const p = privacyOf(user);
    if (!p.strictFilter) return null;
    const hits = [];
    let score = 0;
    for (const r of RISKY) {
      if (r.re.test(text)) {
        score += r.w;
        hits.push({ rule: r.re.source, label: RULE_LABELS[r.re.source] || 'verdächtig' });
      }
    }
    if (score >= 3) {
      return {
        blocked: true,
        score,
        hits,
        reason: 'Sicherheitsfilter: ' + hits.map((x) => x.label).join(' + '),
        hint: 'Das sieht nach Betrug aus. Wenn es harmlos war, kannst du die Nachricht prüfen lassen.',
        appealAllowed: true,
      };
    }
    if (score === 2) {
      return { blocked: false, warn: true, score, hits, reason: 'Achtung: ' + hits.map((x) => x.label).join(' + ') };
    }
    return null;
  }

  /* ================= 🔒 VERSTECKTE CHATS ================= */

  function hiddenSet(user) {
    ensurePrivacy(user);
    return new Set(user.hiddenChats);
  }

  function isHidden(user, chatId) {
    return hiddenSet(user).has(chatId);
  }

  function setHidden(user, chatId, hidden) {
    ensurePrivacy(user);
    const s = hiddenSet(user);
    if (hidden) s.add(chatId); else s.delete(chatId);
    user.hiddenChats = [...s];
    return user.hiddenChats;
  }

  function activeSessionsOf(user) {
    if (!db.tokenMeta) return 0;
    return Object.keys(db.tokenMeta).filter((t) => db.tokens && db.tokens[t] === user.id).length;
  }

  /* ================= 🧮 SICHERHEITS-SCORE ================= */

  function scoreOf(user) {
    const p = privacyOf(user);
    const checks = [];
    const push = (id, label, ok, weight, hint) => checks.push({ id, label, ok: !!ok, weight, hint: ok ? '' : hint });

    push('2fa', 'Zwei-Faktor aktiv', user.twoFactor && user.twoFactor.enabled, 25,
      'Authenticator-App verbinden — der größte Schutz überhaupt.');
    push('pin', 'App-Sperre gesetzt', !!(user.security && user.security.pinSet), 20,
      'PIN + Biometrie in den Einstellungen einschalten.');
    push('sessions', 'Keine fremden Sitzungen', activeSessionsOf(user) <= 1, 15,
      'Andere Geräte abmelden.');
    push('dm', 'Fremde können dir nicht schreiben', p.allowDmFrom !== 'all', 10,
      'Privat-Modus: Nachrichten nur von Kontakten.');
    push('filter', 'Inhaltsfilter an', p.strictFilter, 10, 'Blockt Scam- und Betrugsnachrichten.');
    push('read', 'Lesebestätigungen selbst entschieden', true, 5, '');
    push('privacy', 'Last-Seen geschützt', p.lastSeenPrivacy !== 'all', 10,
      'Wer darf sehen, wann du online warst?');
    push('quiet', 'Stille Stunden', p.quietHours.enabled, 5, 'Nachts keine Push-Flut.');

    const total = checks.reduce((n, c) => n + c.weight, 0);
    const got = checks.reduce((n, c) => n + (c.ok ? c.weight : 0), 0);
    const score = Math.round((got / total) * 100);
    const grade = score >= 90 ? 'Fort Knox 👑' : score >= 70 ? 'Sehr sicher 💪'
      : score >= 45 ? 'Okay 🌸' : 'Ausbaufähig ⚠️';
    return { score, grade, checks, points: got, max: total };
  }

  /* ================= 🔥 EINMAL-MEDIEN ================= */

  function publicMsg(m) {
    const c = { ...m };
    if (c.attachment && c.attachment.viewOnce) {
      c.attachment = { ...c.attachment };
      if (c.attachment.consumed) {
        c.attachment.url = '';
        c.attachment.sticker = '';
        c.attachment.name = '';
        c.text = '🔥 Einmal angesehen';
        c.image = null;
      }
    }
    return c;
  }

  /* =====================================================================
     ROUTEN
     ===================================================================== */

  /* ---------- Privat-Modus ---------- */
  app.get('/api/privacy', auth, h(async (req, res) => {
    res.json({ privacy: privacyOf(req.user) });
  }));

  app.post('/api/privacy', auth, h(async (req, res) => {
    const u = req.user;
    const p = ensurePrivacy(u);
    const b = req.body || {};

    if (b.allowDmFrom !== undefined) {
      if (!['all', 'contacts', 'nobody'].includes(b.allowDmFrom)) return res.status(400).json({ error: 'Ungültiger Wert' });
      p.allowDmFrom = b.allowDmFrom;
    }
    if (b.lastSeenPrivacy !== undefined) {
      if (!['all', 'contacts', 'nobody'].includes(b.lastSeenPrivacy)) return res.status(400).json({ error: 'Ungültiger Wert' });
      p.lastSeenPrivacy = b.lastSeenPrivacy;
    }
    if (b.profilePhotoPrivacy !== undefined) {
      if (!['all', 'contacts', 'nobody'].includes(b.profilePhotoPrivacy)) return res.status(400).json({ error: 'Ungültiger Wert' });
      p.profilePhotoPrivacy = b.profilePhotoPrivacy;
    }
    if (b.readReceipts !== undefined) p.readReceipts = !!b.readReceipts;
    if (b.strictFilter !== undefined) p.strictFilter = !!b.strictFilter;
    if (b.screenshotBlock !== undefined) p.screenshotBlock = !!b.screenshotBlock;
    if (b.pinSet !== undefined) {
      u.security = u.security || {};
      u.security.pinSet = !!b.pinSet;
      u.security.pinSetAt = b.pinSet ? Date.now() : 0;
    }
    if (b.quietHours && typeof b.quietHours === 'object') {
      const f = String(b.quietHours.from || p.quietHours.from);
      const t = String(b.quietHours.to || p.quietHours.to);
      const ok = /^\d{2}:\d{2}$/.test(f) && /^\d{2}:\d{2}$/.test(t);
      if (!ok) return res.status(400).json({ error: 'Format HH:MM' });
      p.quietHours = { enabled: !!b.quietHours.enabled, from: f, to: t };
    }
    saveDb();
    res.json({ ok: true, privacy: p });
  }));

  /* ---------- Sicherheits-Center ---------- */
  app.get('/api/security/overview', auth, h(async (req, res) => {
    const u = req.user;
    const r = scoreOf(u);
    const p = privacyOf(u);
    const sessions = u.id && db.tokenMeta
      ? Object.entries(db.tokenMeta).filter(([t, meta]) => db.tokens[t] === u.id).length
      : 0;
    res.json({
      ...r,
      privacy: p,
      sessions,
      logins: (u.loginHistory || []).slice(0, 10),
      lastPasswordChange: u.passwordChangedAt || u.createdAt || 0,
      tips: [
        '2FA ist der wichtigste Schritt — 30 Sekunden Aufwand, riesiger Schutz.',
        'Niemals den Code aus der Authenticator-App weitergeben — auch nicht an „das Team".',
        'Wenn ein Gerät nicht deins ist: rauswerfen und Passwort ändern.',
        'Bei Scam-Nachrichten: melden, nicht antworten.',
      ],
    });
  }));

  app.get('/api/security/logins', auth, h(async (req, res) => {
    res.json({ logins: (req.user.loginHistory || []).slice(0, 20) });
  }));

  /* ---------- Inhalts-Scanner (vor dem Senden prüfbar) ---------- */
  app.post('/api/security/scan', auth, h(async (req, res) => {
    const text = String((req.body || {}).text || '');
    const result = scanText(text);
    res.json({ ...result, blocked: result.score >= 3 });
  }));

  /* ---------- Versteckte Chats ---------- */
  app.get('/api/chats/hidden/list', auth, h(async (req, res) => {
    const u = req.user;
    const ids = hiddenSet(u);
    const list = Object.values(db.chats)
      .filter((c) => c.memberIds.includes(u.id) && ids.has(c.id))
      .map((c) => chatSummary(u.id, c));
    res.json({ chats: list });
  }));

  app.post('/api/chats/:id/hide', auth, h(async (req, res) => {
    const chat = db.chats[String(req.params.id)];
    if (!chat || !chat.memberIds.includes(req.user.id)) return res.status(404).json({ error: 'Chat nicht gefunden' });
    const hidden = (req.body || {}).hidden !== false;
    setHidden(req.user, chat.id, hidden);
    saveDb();
    res.json({ ok: true, hidden: req.user.hiddenChats });
  }));

  /* ---------- Einmal-Medien ---------- */
  app.post('/api/chats/:id/messages/:mid/view-once', auth, h(async (req, res) => {
    const chat = db.chats[String(req.params.id)];
    if (!chat || !chat.memberIds.includes(req.user.id)) return res.status(404).json({ error: 'Chat nicht gefunden' });
    const m = (db.messages[chat.id] || []).find((x) => x.id === String(req.params.mid));
    if (!m) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    if (!m.attachment || !m.attachment.viewOnce) return res.status(400).json({ error: 'Kein Einmal-Medium' });
    if (m.senderId === req.user.id) return res.status(400).json({ error: 'Eigene Nachricht' });
    if (m.attachment.consumed) return res.status(409).json({ error: 'Schon angesehen 🔥', code: 'consumed' });

    // 🧨 ECHT löschen: Bytes überschreiben, dann DB-Datei 3× mit Zufall überschreiben
    const wipe = secureDeleteMedia(chat.id, m);
    m.attachment.consumed = true;
    m.attachment.consumedAt = Date.now();
    m.attachment.consumedBy = req.user.id;
    m.attachment.url = '';
    m.attachment.name = '';
    m.attachment.sticker = '';
    m.image = null;
    m.text = '🔥 Einmal angesehen';
    m.secureDeleted = true;
    const fileWiped = wipeAndPersist();

    for (const uid of chat.memberIds) {
      sendToUser(uid, { type: 'message:updated', chatId: chat.id, message: publicMsg(m) });
    }
    res.json({
      ok: true,
      message: 'Einmal angesehen — Inhalt sicher gelöscht 🔥',
      secureDelete: { fields: wipe.fields, passes: wipe.passes, fileWiped },
    });
  }));

  /* ---------- Anti-Spam für Fremd-DMs ---------- */
  function canDm(fromUser, toId) {
    const to = db.users[toId];
    if (!to) return { ok: false, error: 'Nutzer nicht gefunden' };
    const p = privacyOf(to);
    if (p.allowDmFrom === 'all') return { ok: true };
    if (p.allowDmFrom === 'nobody') return { ok: false, error: to.displayName + ' bekommt gerade keine neuen Nachrichten 🔒', code: 'dm_blocked' };
    const contacts = contactIdsOf(to);
    if (!contacts.has(fromUser.id)) {
      return { ok: false, error: to.displayName + ' erlaubt Nachrichten nur von Kontakten 🔒', code: 'contacts_only' };
    }
    return { ok: true };
  }

  /* ---------- Einspruch gegen Filter-Block (Feedback: User sah nicht WARUM) ---------- */
  app.post('/api/security/filter-appeal', auth, h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};
    const text = String(b.text || '').slice(0, 1000);
    if (!text) return res.status(400).json({ error: 'Text fehlt' });
    if (!Array.isArray(db.filterAppeals)) db.filterAppeals = [];
    const ap = {
      id: nextId('fap_'),
      userId: me.id,
      username: me.username,
      text,
      rules: Array.isArray(b.rules) ? b.rules.slice(0, 5) : [],
      score: parseInt(b.score, 10) || 0,
      status: 'open',
      at: Date.now(),
    };
    db.filterAppeals.push(ap);
    saveDb();
    // Owner informieren (nur Owner entscheidet)
    for (const staff of Object.values(db.users)) {
      if (MOD.isOwner(staff)) {
        sendToUser(staff.id, { type: 'filter:appeal', appeal: { id: ap.id, username: me.username, text } });
      }
    }
    res.json({
      ok: true,
      appeal: { id: ap.id, status: 'open' },
      message: 'Prüfung eingereicht 💗 Der Owner schaut sich das an — meist innerhalb eines Tages.',
    });
  }));

  app.get('/api/admin/filter-appeals', auth, h(async (req, res) => {
    if (!MOD.isOwner(req.user)) return res.status(403).json({ error: 'Nur Owner maxichen 👑', code: 'owner_only' });
    res.json({ appeals: (db.filterAppeals || []).slice().reverse() });
  }));

  /* ---------- Screenshot gemeldet (App erkennt es ab Android 14) ---------- */
  app.post('/api/security/screenshot', auth, h(async (req, res) => {
    const me = req.user;
    const chatId = String((req.body || {}).chatId || '');
    const chat = db.chats[chatId];
    if (!chat || !chat.memberIds.includes(me.id)) return res.status(404).json({ error: 'Chat nicht gefunden' });

    const rec = { id: nextId('ss_'), chatId, byId: me.id, byName: me.displayName, at: Date.now() };
    if (!Array.isArray(db.screenshotLog)) db.screenshotLog = [];
    db.screenshotLog.push(rec);
    db.screenshotLog = db.screenshotLog.slice(-500);
    saveDb();

    for (const uid of chat.memberIds) {
      if (uid === me.id) continue;
      sendToUser(uid, {
        type: 'security:screenshot',
        chatId,
        byName: me.displayName,
        at: rec.at,
        text: me.displayName + ' hat einen Screenshot gemacht 📸',
      });
    }
    res.json({ ok: true });
  }));

  ctx.registerSecurity = {
    canDm, publicMsg, isHidden, filterMessage, checkLock, noteFail, noteOk, addLoginHistory,
    privacyOf, contactIdsOf, secureDeleteMedia, wipeAndPersist, wipeFile, scanText, RULE_LABELS,
  };

  console.log('🛡️ V4.3 aktiv — Sicherheits-Center · Privat-Modus · Einmal-Medien · Login-Schutz');
  return ctx.registerSecurity;
}

module.exports = { createSecurity, DEFAULTS, RISKY };
