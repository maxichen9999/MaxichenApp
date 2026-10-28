/* =====================================================================
   👥 MaxiChat ACCOUNTS (V4.4)
   Multi-Account mit UNIQUE phone + SMS-Verifizierung
   - 5 Accounts pro Gerätegruppe
   - gleiche Nummer → 409 { code: 'phone_exists' }
   - SMS-Code: 6 Ziffern, gehasht, 10 Min gültig, max 5 Versuche
   - Adapter: Twilio (wenn ENV gesetzt) oder Dev-Outbox (data/sms-outbox.log)
   ===================================================================== */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_ACCOUNTS = 5;
const CODE_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizePhone(raw) {
  let p = String(raw || '').trim();
  if (!p) return '';
  // alles außer Ziffern und führendem + weg
  p = p.replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) p = '+' + p;      // 49151… → +49151…
  if (!/^\+\d{7,15}$/.test(p)) return '';
  return p;
}

function hashPhone(phone) {
  return crypto.createHash('sha256').update('lovechat·phone·' + normalizePhone(phone)).digest('hex');
}

function maskPhone(phone) {
  const p = normalizePhone(phone);
  if (!p) return '';
  return p.slice(0, 4) + ' •••• ' + p.slice(-2);
}

function createAccounts(app, h, ctx) {
  const { db, saveDb, nextId, auth, getChatOr404, isChatAdmin, chatSummary, sendToUser, MOD, makeToken, checkPassword } = ctx;

  const OUTBOX = path.join(path.dirname(ctx.dbFile || path.join(__dirname, 'data', 'database.json')), 'sms-outbox.log');
  const DEV = process.env.SMS_PROVIDER !== 'twilio';

  /* ---------------- SMS-Adapter ---------------- */

  async function sendSms(phone, text) {
    if (!DEV && process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM) {
      const auth64 = Buffer.from(process.env.TWILIO_SID + ':' + process.env.TWILIO_TOKEN).toString('base64');
      const body = new URLSearchParams({
        To: normalizePhone(phone),
        From: process.env.TWILIO_FROM,
        Body: text,
      });
      const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + process.env.TWILIO_SID + '/Messages.json', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + auth64, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      return { ok: r.ok, provider: 'twilio', status: r.status };
    }
    // Dev-Modus: in Datei schreiben, damit man den Code wirklich "empfangen" kann
    try {
      fs.mkdirSync(path.dirname(OUTBOX), { recursive: true });
      fs.appendFileSync(OUTBOX, `[${new Date().toISOString()}] ${normalizePhone(phone)} :: ${text}\n`);
    } catch (e) {}
    return { ok: true, provider: 'outbox', file: OUTBOX };
  }

  /* ---------------- Nummern-Registry (UNIQUE) ---------------- */

  function userByPhone(phone) {
    const p = normalizePhone(phone);
    if (!p) return null;
    return Object.values(db.users).find((u) => normalizePhone(u.phone) === p) || null;
  }

  /** Wirft nie, liefert { ok, code?, error? } */
  function claimPhone(phone, userId) {
    const p = normalizePhone(phone);
    if (!p) return { ok: false, error: 'Telefonnummer sieht nicht richtig aus', code: 'phone_invalid' };
    const other = userByPhone(p);
    if (other && other.id !== userId) {
      return {
        ok: false,
        code: 'phone_exists',
        error: 'Diese Nummer gehört schon zu @' + other.username + ' — nimm eine andere oder logge dich dort ein.',
        owner: { id: other.id, username: other.username },
      };
    }
    return { ok: true, phone: p };
  }

  /* ---------------- Codes ---------------- */

  function codeKey(phone) { return hashPhone(phone); }

  function ensureSms() {
    if (!db.smsCodes) db.smsCodes = {};
    if (!db.accountGroups) db.accountGroups = {};
    return db.smsCodes;
  }

  function issueCode(phone, purpose) {
    ensureSms();
    const p = normalizePhone(phone);
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = crypto.randomBytes(8).toString('hex');
    db.smsCodes[codeKey(p)] = {
      phone: p,
      salt,
      hash: crypto.createHash('sha256').update(salt + code).digest('hex'),
      purpose: purpose || 'add',
      createdAt: Date.now(),
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
    };
    saveDb();
    return code;
  }

  function verifyCode(phone, code) {
    ensureSms();
    const p = normalizePhone(phone);
    const rec = db.smsCodes[codeKey(p)];
    if (!rec) return { ok: false, code: 'no_code', error: 'Kein Code angefordert — fordere erst einen an.' };
    if (rec.expiresAt < Date.now()) {
      delete db.smsCodes[codeKey(p)];
      saveDb();
      return { ok: false, code: 'code_expired', error: 'Code abgelaufen — fordere einen neuen an.' };
    }
    rec.attempts = (rec.attempts || 0) + 1;
    if (rec.attempts > MAX_ATTEMPTS) {
      delete db.smsCodes[codeKey(p)];
      saveDb();
      return { ok: false, code: 'too_many_attempts', error: 'Zu viele falsche Codes — fordere einen neuen an.' };
    }
    const hash = crypto.createHash('sha256').update(rec.salt + String(code || '').trim()).digest('hex');
    if (hash !== rec.hash) {
      saveDb();
      return { ok: false, code: 'code_wrong', error: 'Code stimmt nicht — noch ' + (MAX_ATTEMPTS - rec.attempts) + ' Versuche.' };
    }
    delete db.smsCodes[codeKey(p)];
    saveDb();
    // Ticket: signiertes Kurz-Token, 15 Min gültig
    const ticket = crypto.randomBytes(24).toString('hex');
    db.smsTickets = db.smsTickets || {};
    db.smsTickets[ticket] = { phone: p, userId: ctx.currentUserId || null, expiresAt: Date.now() + TICKET_TTL_MS };
    saveDb();
    return { ok: true, ticket, phone: p };
  }

  function consumeTicket(ticket, phone) {
    if (!db.smsTickets || !db.smsTickets[ticket]) return false;
    const t = db.smsTickets[ticket];
    if (t.expiresAt < Date.now()) { delete db.smsTickets[ticket]; saveDb(); return false; }
    if (normalizePhone(phone) !== t.phone) return false;
    return true;
  }

  /* ---------------- Konten-Gruppe (max 5) ---------------- */

  function groupOf(user) {
    ensureSms();
    if (user.accountGroup && db.accountGroups[user.accountGroup]) return db.accountGroups[user.accountGroup];
    const gid = 'g_' + crypto.randomBytes(6).toString('hex');
    db.accountGroups[gid] = { id: gid, createdBy: user.id, memberIds: [user.id], createdAt: Date.now() };
    user.accountGroup = gid;
    saveDb();
    return db.accountGroups[gid];
  }

  function membersOf(user) {
    const g = groupOf(user);
    return g.memberIds.map((id) => db.users[id]).filter(Boolean);
  }

  /* =====================================================================
     ROUTEN
     ===================================================================== */

  /* --- öffentlich: ist die Nummer frei? --- */
  app.get('/api/accounts/phone-available', h(async (req, res) => {
    const raw = String(req.query.phone || '');
    const p = normalizePhone(raw);
    if (!p) return res.status(400).json({ available: false, code: 'phone_invalid', error: 'Nummer ungültig' });
    const other = userByPhone(p);
    if (other) {
      return res.json({ available: false, code: 'phone_exists', error: 'Nummer ist schon registriert', owner: { username: other.username } });
    }
    res.json({ available: true, phone: p, masked: maskPhone(p) });
  }));

  /* --- SMS-Code anfordern (auch ohne Login: für 2. Account) --- */
  app.post('/api/accounts/sms/request', h(async (req, res) => {
    const p = normalizePhone((req.body || {}).phone);
    const purpose = String((req.body || {}).purpose || 'add');
    if (!p) return res.status(400).json({ error: 'Telefonnummer sieht nicht richtig aus', code: 'phone_invalid' });

    // 🚦 3 Codes pro Nummer / 10 Min
    const key = 'sms:' + codeKey(p);
    if (!ctx.rateLimit(key, 3, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Zu viele Codes angefordert — warte 10 Minuten 💗', code: 'sms_rate_limited' });
    }

    const claim = claimPhone(p, ctx.currentUserId || null);
    // Nummer darf vergeben sein, wenn der Besitzer selbst sein Konto verifiziert
    if (!claim.ok && purpose !== 'verify') {
      return res.status(409).json({ error: claim.error, code: claim.code, owner: claim.owner || null });
    }

    const code = issueCode(p, purpose);
    const sent = await sendSms(p, 'MaxiChat Code: ' + code + ' (10 Min gültig). Wenn du das nicht warst, ignoriere die SMS.');
    res.json({
      ok: true,
      phone: p,
      masked: maskPhone(p),
      expiresIn: CODE_TTL_MS / 1000,
      provider: sent.provider,
      // ⚠️ nur im Dev-Modus: Code direkt zurückgeben
      devCode: DEV ? code : undefined,
      hint: DEV
        ? 'Dev-Modus: Code steht auch in data/sms-outbox.log'
        : 'Code per SMS unterwegs 📲',
    });
  }));

  /* --- Code prüfen → Ticket --- */
  app.post('/api/accounts/sms/verify', h(async (req, res) => {
    const b = req.body || {};
    const p = normalizePhone(b.phone);
    const code = String(b.code || '').trim();
    if (!p || !code) return res.status(400).json({ error: 'Nummer und Code nötig' });
    const r = verifyCode(p, code);
    if (!r.ok) return res.status(400).json({ error: r.error, code: r.code });
    res.json({ ok: true, ticket: r.ticket, phone: r.phone, masked: maskPhone(r.phone), validFor: TICKET_TTL_MS / 1000 });
  }));

  /* --- zweiten Account anlegen --- */
  app.post('/api/accounts/add', auth, h(async (req, res) => {
    const me = req.user;
    const g = groupOf(me);
    if (g.memberIds.length >= MAX_ACCOUNTS) {
      return res.status(409).json({ error: 'Maximal ' + MAX_ACCOUNTS + ' Accounts pro Gerät 👥', code: 'max_accounts' });
    }

    const b = req.body || {};
    const ticket = String(b.ticket || '');
    const phone = normalizePhone(b.phone);
    const uname = String(b.username || '').trim().toLowerCase();
    const name = String(b.displayName || '').trim();
    const password = String(b.password || '');

    if (!consumeTicket(ticket, phone)) {
      return res.status(403).json({ error: 'Nummer nicht bestätigt — SMS-Code fehlt oder ist abgelaufen 🔒', code: 'phone_unverified' });
    }
    const claim = claimPhone(phone, null);
    if (!claim.ok) return res.status(409).json({ error: claim.error, code: claim.code, owner: claim.owner || null });

    if (!/^[a-z0-9_]{3,20}$/.test(uname)) return res.status(400).json({ error: 'Benutzername: 3–20 Zeichen', code: 'username_invalid' });
    if (Object.values(db.users).some((u) => u.username === uname)) {
      return res.status(409).json({ error: 'Benutzername ist schon vergeben 💔', code: 'username_taken' });
    }
    if (name.length < 2 || name.length > 30) return res.status(400).json({ error: 'Anzeigename: 2–30 Zeichen' });
    if (password.length < 6) return res.status(400).json({ error: 'Passwort: mindestens 6 Zeichen' });

    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      id: nextId('u_'),
      username: uname,
      displayName: name,
      bio: '',
      avatar: String(b.avatar || '🌸').slice(0, 8),
      phone,
      phoneVerified: true,
      phoneVerifiedAt: Date.now(),
      email: '',
      salt,
      pass: (ctx.hashPassword || ((pw, sl) => crypto.createHash('sha256').update(sl + pw).digest('hex')))(password, salt),
      createdAt: Date.now(),
      lastSeen: 0,
      bgSound: true,
      bg: { default: 'pink-dream', overrides: {} },
      role: 'user',
      bans: [],
      warnings: [],
      accountGroup: g.id,
      privacy: {},
    };
    db.users[user.id] = user;
    g.memberIds.push(user.id);
    delete db.smsTickets[ticket];
    saveDb();

    const token = makeToken(user, req);
    res.json({
      ok: true,
      token,
      user: ctx.publicUser(user, { privacy: user.privacy }),
      accounts: membersOf(user).map((u) => ({
        id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar,
        phone: maskPhone(u.phone), phoneVerified: !!u.phoneVerified, active: u.id === user.id,
      })),
    });
  }));

  /* --- Liste meiner Accounts --- */
  app.get('/api/accounts', auth, h(async (req, res) => {
    const me = req.user;
    const members = membersOf(me);
    res.json({
      accounts: members.map((u) => ({
        id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar,
        phone: maskPhone(u.phone), phoneVerified: !!u.phoneVerified,
        active: u.id === me.id, role: MOD.roleOf(u), lastSeen: u.lastSeen || 0,
      })),
      max: MAX_ACCOUNTS,
      groupId: groupOf(me).id,
    });
  }));

  /* --- Account wechseln (Token für anderen Account der Gruppe) --- */
  app.post('/api/accounts/switch', auth, h(async (req, res) => {
    const me = req.user;
    const targetId = String((req.body || {}).userId || '');
    const g = groupOf(me);
    if (!g.memberIds.includes(targetId)) {
      return res.status(403).json({ error: 'Dieser Account gehört nicht zu deinen Accounts 🔒', code: 'not_in_group' });
    }
    const target = db.users[targetId];
    if (!target) return res.status(404).json({ error: 'Account nicht gefunden' });

    // 👑 Sperre gilt weiter: gesperrter Account kann nicht aktiv werden
    if (MOD.roleOf(target) !== 'owner' && MOD.activeAccountBan(target)) {
      return res.status(403).json({ error: MOD.banText(MOD.banPublic(MOD.activeAccountBan(target))), code: 'banned' });
    }

    const token = makeToken(target, req);
    res.json({
      ok: true, token,
      user: ctx.publicUser(target, { email: target.email, bg: target.bg, bio: target.bio, privacy: target.privacy || {} }),
    });
  }));

  /* --- Account aus der Gruppe entfernen (Konto bleibt bestehen) --- */
  app.delete('/api/accounts/:id/link', auth, h(async (req, res) => {
    const me = req.user;
    const g = groupOf(me);
    const id = String(req.params.id || '');
    if (id === me.id) return res.status(400).json({ error: 'Der aktive Account kann nicht entfernt werden' });
    if (!g.memberIds.includes(id)) return res.status(404).json({ error: 'Nicht in deiner Gruppe' });
    g.memberIds = g.memberIds.filter((x) => x !== id);
    const u = db.users[id];
    if (u) delete u.accountGroup;
    saveDb();
    res.json({ ok: true, accounts: g.memberIds });
  }));

  /* --- Eigenen Account mit Nummer verifizieren (bestehendes Konto) --- */
  app.post('/api/accounts/verify-own', auth, h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};
    const phone = normalizePhone(b.phone);
    if (!consumeTicket(String(b.ticket || ''), phone)) {
      return res.status(403).json({ error: 'Nummer nicht bestätigt 🔒', code: 'phone_unverified' });
    }
    const claim = claimPhone(phone, me.id);
    if (!claim.ok) return res.status(409).json({ error: claim.error, code: claim.code });
    me.phone = phone;
    me.phoneVerified = true;
    me.phoneVerifiedAt = Date.now();
    saveDb();
    res.json({ ok: true, phone: maskPhone(phone), verified: true });
  }));

  console.log('👥 V4.4 aktiv — Multi-Account (max ' + MAX_ACCOUNTS + ') · UNIQUE phone · SMS (' + (DEV ? 'Dev-Outbox' : 'Twilio') + ')');

  return { normalizePhone, hashPhone, maskPhone, claimPhone, userByPhone, sendSms, groupOf, membersOf, MAX_ACCOUNTS, hashPhoneOf: hashPhone };
}

module.exports = { createAccounts, normalizePhone, hashPhone, maskPhone, MAX_ACCOUNTS };
