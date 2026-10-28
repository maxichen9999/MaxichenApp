/* =====================================================================
 *  📱 v428.js — „Anmeldung wie WhatsApp" (V4.28)
 * ---------------------------------------------------------------------
 *  Der Ablauf, den jeder von WhatsApp kennt, in genau dieser Reihenfolge:
 *
 *    ① Startbildschirm  → „Zustimmen und fortfahren"
 *    ② Nummer eingeben  (+49 1234 56789)
 *    ③ Code per WhatsApp (6 Ziffern)
 *    ④ Name + Profilbild
 *    ⑤ drin — Startseite mit Chats · Aktuelles · Communitys · Anrufe · Profil
 *
 *  Was vorher anders war (gemessen):
 *    · Der Bildschirm verlangte Benutzername + Passwort — das gibt es bei
 *      WhatsApp nicht. Passwort-Login bleibt als Notausgang für alte Konten.
 *    · `/api/auth/request-code` antwortet bei vorhandener Nummer mit
 *      409 `phone_exists` (Test v44test prüft das). Bei WhatsApp bedeutet
 *      eine bekannte Nummer aber: **einloggen**. Genau das macht
 *      `/api/v428/onboarding/request` zusätzlich.
 *    · Der alte Fluss verlangte zwingend eine E-Mail samt zweitem Code
 *      (signup.js Schritt ⑤–⑦). WhatsApp fragt keine E-Mail.
 *      `/api/v428/onboarding/finish` schließt ohne E-Mail ab.
 *
 *  Der Code-Hash ist derselbe wie in signup.js
 *  (`sha256('maxichen-code·'+phone+'·'+code)`), damit beide Wege
 *  ineinandergreifen und nicht zwei Wahrheiten entstehen.
 * ===================================================================== */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const WA_PORT = Number(process.env.WA_PORT || 3100);
const WA_URL = 'http://127.0.0.1:' + WA_PORT;

const VERSION = 'V4.28';

/* eigene Kopie — `ipOf` in server.js steht weiter unten (const, nicht hoisted) */
function ipOf(req) {
  try {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  } catch (e) { return 'unknown'; }
}

/* 6 Ziffern, kryptografisch — kein Math.random */
function sixDigits() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}
function sha(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/* ---------------- Rate-Limit im Speicher ----------------
 * (bewusst nicht in der DB: ein Neustart setzt zurück, das ist bei
 *  3 Codes / 15 Minuten verkraftbar und hält die DB klein) */
const BUCKETS = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  let b = BUCKETS.get(key);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; BUCKETS.set(key, b); }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

function createV428(app, h, H) {
  const { db, saveDb, nextId, publicUser, hashPassword, ensureLoveBot, createWelcomeChannel } = H;

  /* normalizePhone aus accounts.js — dieselbe Funktion wie überall sonst */
  let normalizePhone = (p) => String(p || '').trim();
  try {
    const acc = require('./accounts');
    if (typeof acc.normalizePhone === 'function') normalizePhone = acc.normalizePhone;
  } catch (e) {}

  /* ---------------- interner Token für pair.js ---------------- */
  function internalToken() {
    if (process.env.INTERNAL_TOKEN) return process.env.INTERNAL_TOKEN;
    try {
      const t = fs.readFileSync(path.join(DATA_DIR, 'internal-token.txt'), 'utf8').trim();
      if (t.length >= 24) return t;
    } catch (e) {}
    return '';
  }

  /* ---------------- Code per WhatsApp verschicken ---------------- */
  async function sendViaWhatsApp(phone, code) {
    const tok = internalToken();
    if (!tok) return { ok: false, error: 'no_internal_token', detail: 'INTERNAL_TOKEN fehlt oder internal-token.txt nicht lesbar' };
    try {
      // 🔴 pair.js verlangt `Authorization: Bearer …` (nicht x-internal-token) —
      //    genau wie signup.js. Mit dem falschen Header kam „Token falsch".
      const r = await fetch(WA_URL + '/internal/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ phone, code, minutes: 5 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j.code || 'wa_error', detail: j.error || ('HTTP ' + r.status) };
      return { ok: true, simulated: !!j.simulated };
    } catch (e) {
      return { ok: false, error: 'wa_unavailable', detail: 'pair.js antwortet nicht (' + e.message + ')' };
    }
  }

  /* ---------------- Owner-Nummer (V4.29) ----------------
   * Wer die Nummer +4915155894714 per WhatsApp-Code beweist, ist Owner.
   * Kein Setup-Code, kein Sonderweg — die Nummer ist der Beweis. */
  function isOwnerPhone(phone) {
    const want = String(process.env.OWNER_PHONE || '+4915155894714');
    try {
      return normalizePhone(String(phone || '')) === normalizePhone(want);
    } catch (e) {
      return String(phone || '') === want;
    }
  }

  /** Owner sofort einrichten: 2FA + Haken. Läuft nach Login UND nach Signup. */
  function makeOwnerReady(user, req) {
    const out = { owner: false, twoFactor: false };
    try {
      const want = String(process.env.OWNER_PHONE || '+4915155894714');
      if (normalizePhone(String(user.phone || '')) !== normalizePhone(want)) return out;
      out.owner = true;
      const V422 = globalThis.__LC_V422;
      if (V422 && typeof V422.provisionTwoFactor === 'function') {
        const r = V422.provisionTwoFactor(user, { writeSecretFile: true });
        out.twoFactor = !!(r && r.ok);
      }
      /* Haken: die Nummer wurde per WhatsApp-Code bewiesen — das IST die
       * Verifizierung. badges.js zeigt den blauen Haken, sobald 2FA steht
       * (bei Bot/Owner Pflicht, siehe v422). */
      user.verified = true;
      saveDb();
      console.log('👑 Owner angemeldet: @' + user.username + ' · 2FA ' + (out.twoFactor ? 'eingerichtet' : 'offen') + (req ? ' · ' + ipOf(req) : ''));
    } catch (e) {
      console.error('Owner-Einrichtung:', e.message);
    }
    return out;
  }

  /* ---------------- Nutzer zur Nummer finden ---------------- */
  function userByPhone(phone) {
    const p = normalizePhone(phone);
    if (!p) return null;
    return Object.values(db.users).find((u) => {
      try { return normalizePhone(u.phone) === p; } catch (e) { return false; }
    }) || null;
  }

  /* ---------------- Signup-Datensatz (gleiche Form wie signup.js) ---------------- */
  function newSignup(phone) {
    db.signups = db.signups || {};
    const token = crypto.randomBytes(24).toString('hex');
    const s = {
      token,
      phone,
      phoneVerified: true,       // wir sind hier NUR nach bestätigtem Code
      email: '',
      emailVerified: false,
      userId: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
      ip: '',
    };
    db.signups[token] = s;
    return s;
  }
  function signupBy(token) {
    db.signups = db.signups || {};
    const s = token ? db.signups[token] : null;
    if (!s) return null;
    if (s.expiresAt < Date.now()) { delete db.signups[token]; return null; }
    return s;
  }

  /* ---------------- Anzeigename → brauchbarer Kontoname ---------------- */
  function usernameFrom(name, phone) {
    const base = String(name || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 14);
    const taken = (u) => Object.values(db.users).some((x) => x.username === u);
    let cand = base.length >= 3 ? base : 'love' + String(phone || '').replace(/\D/g, '').slice(-4);
    if (!taken(cand)) return cand;
    for (let i = 2; i < 500; i++) {
      const c = (base.length >= 3 ? base : 'love').slice(0, 16) + i;
      if (!taken(c)) return c;
    }
    return 'lc_' + crypto.randomBytes(3).toString('hex');
  }

  /* ---------------- Token anlegen (wie login/verify-email) ---------------- */
  function makeToken(user, req, device) {
    db.tokens = db.tokens || {};
    db.tokenMeta = db.tokenMeta || {};
    const token = crypto.randomBytes(24).toString('hex');
    db.tokens[token] = user.id;
    db.tokenMeta[token] = {
      device: String(device || '📱 LoveChat (WhatsApp-Anmeldung)').slice(0, 40),
      createdAt: Date.now(),
      lastSeen: Date.now(),
      ip: ipOf(req),
    };
    user.lastSeen = Date.now();
    return token;
  }

  /* =================================================================
     ① Startbildschirm — was die App dem Neuankömmling sagen muss
     ================================================================= */
  app.get('/api/v428/onboarding/start', h(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      version: VERSION,
      app: 'LoveChat',
      claim: 'Einfach. Sicher. Pink. 💗',
      legal: [
        'LoveChat ist ein eigener Messenger von maxichen.de.',
        'Deine Nummer wird nur zur Anmeldung benutzt — sie steht in keinem Profil.',
        'Der Code kommt per WhatsApp. Wir speichern ihn nur als Hash.',
      ],
      steps: ['start', 'phone', 'code', 'profile'],
      tabs: ['Chats', 'Aktuelles', 'Communitys', 'Anrufe', 'Profil'],
    });
  }));

  /* =================================================================
     ② Nummer → Code per WhatsApp
     ================================================================= */
  app.post('/api/v428/onboarding/request', h(async (req, res) => {
    const b = req.body || {};
    const phone = normalizePhone(String(b.phone || ''));
    if (!phone) {
      return res.status(400).json({
        error: 'Nummer unvollständig — mit Ländervorwahl, z. B. +49 151 55894714',
        code: 'bad_phone',
      });
    }
    if (!limit('v428:' + phone, 3, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Zu viele Codes an diese Nummer. Warte 15 Minuten.', code: 'too_many', retryAfterMs: 15 * 60 * 1000 });
    }
    if (!limit('v428ip:' + ipOf(req), 12, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Zu viele Anfragen von hier.', code: 'too_many' });
    }

    /* Gibt es die Nummer schon? → WhatsApp fragt nicht, es loggt ein. */
    const existing = userByPhone(phone);

    db.phoneCodes = db.phoneCodes || {};
    Object.keys(db.phoneCodes).forEach((k) => {
      if (db.phoneCodes[k].phone === phone) delete db.phoneCodes[k];
    });

    const code = sixDigits();
    db.phoneCodes[phone] = {
      phone,
      hash: sha('maxichen-code·' + phone + '·' + code),
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      used: false,
    };

    const out = await sendViaWhatsApp(phone, code);
    saveDb();

    if (!out.ok) {
      delete db.phoneCodes[phone];
      saveDb();
      return res.status(503).json({
        error: 'WhatsApp-Versand ist gerade nicht bereit. Der Code wurde NICHT verschickt.',
        code: out.error,
        detail: out.detail || '',
        hint: 'Auf dem Server: node pair.js starten und den QR-Code scannen.',
        testMode: process.env.WA_SIMULATE === '1',
      });
    }

    res.json({
      ok: true,
      phone,
      mode: existing ? 'login' : 'signup',   // ← wie WhatsApp: bekannte Nummer = anmelden
      newAccount: !existing,
      expiresInSec: 300,
      simulated: !!out.simulated,
      message: 'Code ist unterwegs. Schau in WhatsApp.',
    });
  }));

  /* =================================================================
     ③ Code eingeben → entweder drin (bekannt) oder weiter zum Profil
     ================================================================= */
  app.post('/api/v428/onboarding/verify', h(async (req, res) => {
    const b = req.body || {};
    const phone = normalizePhone(String(b.phone || ''));
    const code = String(b.code || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ error: 'Nummer fehlt', code: 'bad_phone' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Der Code hat 6 Ziffern', code: 'bad_code' });

    db.phoneCodes = db.phoneCodes || {};
    const rec = db.phoneCodes[phone];
    if (!rec) return res.status(400).json({ error: 'Kein offener Code für diese Nummer. Fordere einen neuen an.', code: 'no_code' });
    if (rec.used) return res.status(400).json({ error: 'Dieser Code wurde schon benutzt.', code: 'used' });
    if (rec.expiresAt < Date.now()) {
      delete db.phoneCodes[phone];
      saveDb();
      return res.status(400).json({ error: 'Der Code ist abgelaufen. Fordere einen neuen an.', code: 'expired' });
    }
    if (rec.attempts >= 5) {
      delete db.phoneCodes[phone];
      saveDb();
      return res.status(429).json({ error: 'Zu viele Fehlversuche. Fordere einen neuen Code an.', code: 'too_many_attempts' });
    }

    rec.attempts++;
    if (rec.hash !== sha('maxichen-code·' + phone + '·' + code)) {
      saveDb();
      return res.status(401).json({
        error: 'Code stimmt nicht.',
        code: 'wrong_code',
        attemptsLeft: Math.max(0, 5 - rec.attempts),
      });
    }

    delete db.phoneCodes[phone];

    /* ---- bekannte Nummer → direkt rein ---- */
    const existing = userByPhone(phone);
    if (existing) {
      /* 🚫 V4.30 — Ein gesperrtes Konto bekommt KEIN Token. Vorher kam hier
       * ein Token heraus und die Sperre erst beim nächsten Aufruf — der
       * Ban-Screen mit Grund und Dauer wurde so nie erreicht. */
      try {
        /* moderation.js exportiert eine FABRIK, kein fertiges Objekt — die
         * eine gemeinsame Instanz liegt in server.js und wird dort abgelegt. */
        const MOD = globalThis.__LC_MOD;
        if (MOD && MOD.roleOf(existing) !== 'owner') {
          const ban = MOD.activeAccountBan(existing);
          if (ban) {
            const pub = MOD.banPublic(ban);
            return res.status(403).json({
              error: MOD.banText(pub),
              code: 'banned',
              ban: pub,
              reason: pub.reason || '',
              until: pub.until || null,
              appealAllowed: true,
              phone,
            });
          }
        }
      } catch (e) {}
      const token = makeToken(existing, req, b.device);
      // 👑 V4.29: Owner-Nummer → sofort 2FA + Haken (ohne Neustart)
      const own = makeOwnerReady(existing, req);
      saveDb();
      console.log('🔑 Anmeldung per WhatsApp-Nummer: ' + existing.username);
      return res.json({
        ok: true,
        mode: 'login',
        token,
        user: publicUser(existing),
        phone,
        owner: own.owner,
        twoFactor: own.twoFactor,
        next: 'done',
      });
    }

    /* ---- neue Nummer → Profil-Schritt ---- */
    const s = newSignup(phone);
    s.ip = ipOf(req);
    saveDb();
    res.json({
      ok: true,
      mode: 'signup',
      signupToken: s.token,
      phone,
      expiresInSec: 1800,
      next: 'profile',
    });
  }));

  /* =================================================================
     ④ Name + Profilbild  (WhatsApp: „Name", Foto optional)
     ================================================================= */
  app.post('/api/v428/onboarding/profile', h(async (req, res) => {
    const b = req.body || {};
    const s = signupBy(String(b.signupToken || ''));
    if (!s) return res.status(401).json({ error: 'Sitzung abgelaufen — Nummer nochmal bestätigen', code: 'no_signup' });

    const name = String(b.displayName || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 30) {
      return res.status(400).json({ error: 'Name: 2–30 Zeichen', code: 'bad_name' });
    }

    /* Foto: entweder ein hochgeladenes /media/-Bild (V4.27) oder ein Emoji.
     * Bewusst KEIN data:-URL mehr — die hat die DB früher auf 30 MB gebracht. */
    let avatar = '💗';
    const a = String(b.avatar || '').trim();
    if (/^\/media\/[a-z0-9_]+\.[a-z0-9]+$/i.test(a)) {
      const id = (a.match(/^\/media\/([^.]+)\./) || [])[1];
      if (db.media && db.media[id]) avatar = a;
      else return res.status(400).json({ error: 'Das Bild ist nicht (mehr) da', code: 'bad_avatar' });
    } else if (a && Array.from(a).length <= 8) {
      avatar = a;
    }

    /* Kontoname: WhatsApp fragt ihn nicht. Wir nehmen ihn aus dem Namen
     * und machen ihn eindeutig — er ist nur noch die interne Kennung. */
    let uname = String(b.username || '').trim().toLowerCase();
    if (uname) {
      if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
        return res.status(400).json({ error: 'Kontoname: 3–20 Zeichen, nur a–z, 0–9 und _', code: 'bad_username' });
      }
      if (Object.values(db.users).some((u) => u.username === uname)) {
        return res.status(409).json({ error: 'Dieser Kontoname ist schon vergeben 💔', code: 'username_taken' });
      }
    } else {
      uname = usernameFrom(name, s.phone);
    }

    s.username = uname;
    s.displayName = name;
    s.avatar = avatar;
    saveDb();
    res.json({ ok: true, username: uname, displayName: name, avatar, next: 'finish' });
  }));

  /* =================================================================
     ⑤ Fertig — Konto anlegen, Token, rein in die App
     (ohne E-Mail. Wer eine will, kann sie später im Profil eintragen.)
     ================================================================= */
  app.post('/api/v428/onboarding/finish', h(async (req, res) => {
    const b = req.body || {};
    const s = signupBy(String(b.signupToken || ''));
    if (!s) return res.status(401).json({ error: 'Sitzung abgelaufen', code: 'no_signup' });
    if (!s.username) return res.status(400).json({ error: 'Name fehlt noch', code: 'incomplete' });
    if (userByPhone(s.phone)) {
      return res.status(409).json({ error: 'Diese Nummer hat inzwischen ein Konto — bitte anmelden', code: 'phone_exists' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const randomPass = crypto.randomBytes(24).toString('hex');
    const user = {
      id: nextId('u_'),
      username: s.username,
      displayName: s.displayName,
      bio: '',
      avatar: s.avatar || '💗',
      phone: s.phone,
      phoneVerified: true,
      email: '',
      emailVerified: false,
      salt,
      pass: hashPassword(randomPass, salt),
      createdAt: Date.now(),
      lastSeen: Date.now(),
      bgSound: true,
      bg: { default: 'pink-dream', overrides: {} },
      role: 'user',
      bans: [],
      warnings: [],
      signup: 'whatsapp',
      onboardedBy: VERSION,
    };
    db.users[user.id] = user;
    s.userId = user.id;

    const token = makeToken(user, req, b.device);
    delete db.signups[s.token];

    /* Wie beim alten Weg: LoveBot anlegen, erster echter Nutzer bekommt den Willkommens-Kanal */
    let welcome = null;
    try {
      const realUsers = Object.values(db.users).filter((u) => !u.isBot).length;
      if (ensureLoveBot) ensureLoveBot();
      if (createWelcomeChannel && realUsers === 1) welcome = createWelcomeChannel(user);
    } catch (e) {}

    // 👑 V4.29: Wenn das die Owner-Nummer ist, ist dieses Konto ab jetzt Owner
    const own = makeOwnerReady(user, req);

    /* 📢 V4.31 — der offizielle Kanal entstand bisher nur beim Serverstart.
     * Wer sich also NACH dem Start als Inhaber anmeldete, sah nie einen
     * Lovechen-Kanal. Jetzt entsteht er in dem Moment, in dem es einen
     * Inhaber gibt. */
    if (own.owner) {
      try {
        const V = globalThis.__LC_V425;
        if (V && V.officialChannel) V.officialChannel();
      } catch (e) { /* Kanal ist Beiwerk — Anmeldung darf nie daran scheitern */ }
    }

    saveDb();
    console.log('🌸 Neues Konto wie WhatsApp (Nummer → Code → Name): ' + user.username + (own.owner ? ' 👑 OWNER' : ''));

    res.json({
      ok: true,
      mode: 'signup',
      token,
      user: publicUser(user, { email: '', bg: user.bg }),
      welcome: welcome ? welcome.id : null,
      phoneVerified: true,
      emailVerified: false,
      owner: own.owner,
      twoFactor: own.twoFactor,
      next: 'done',
    });
  }));

  /* =================================================================
     Profil-Reiter (der fünfte unten): eigene Daten + ändern
     ================================================================= */
  app.get('/api/v428/profile', H.auth, h(async (req, res) => {
    const u = req.user;
    res.set('Cache-Control', 'no-store');
    res.json({
      user: publicUser(u, { email: u.email || '', emailVerified: !!u.emailVerified, hasPassword: !!u.pass }),
      account: {
        phone: u.phone || '',
        phoneVerified: !!u.phoneVerified,
        email: u.email || '',
        emailVerified: !!u.emailVerified,
        method: u.signup === 'whatsapp' ? 'Nummer + WhatsApp-Code' : 'Passwort',
        username: u.username,
        created: u.createdAt || 0,
      },
      counts: {
        chats: Object.values(db.chats || {}).filter((c) => (c.memberIds || []).includes(u.id)).length,
        media: Object.values(db.media || {}).filter((m) => m.ownerId === u.id).length,
      },
      // 👑 V4.29
      role: { owner: isOwnerPhone(u.phone), verified: u.verified === true },
      vip: (() => {
        try {
          const V = globalThis.__LC_VIP;
          return V ? { vip: V.isVip(u), source: V.sourceOf(u) } : { vip: !!u.vip, source: u.vip ? 'code' : null };
        } catch (e) { return { vip: false, source: null }; }
      })(),
    });
  }));

  app.patch('/api/v428/profile', H.auth, h(async (req, res) => {
    const u = req.user;
    const b = req.body || {};
    const changed = [];

    if (typeof b.displayName === 'string') {
      const name = b.displayName.trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 30) return res.status(400).json({ error: 'Name: 2–30 Zeichen', code: 'bad_name' });
      u.displayName = name; changed.push('displayName');
    }
    if (typeof b.avatar === 'string') {
      const a = b.avatar.trim();
      if (/^\/media\/[a-z0-9_]+\.[a-z0-9]+$/i.test(a)) {
        const id = (a.match(/^\/media\/([^.]+)\./) || [])[1];
        if (!db.media || !db.media[id]) return res.status(400).json({ error: 'Bild nicht gefunden', code: 'bad_avatar' });
        u.avatar = a; changed.push('avatar');
      } else if (a && Array.from(a).length <= 8) {
        u.avatar = a; changed.push('avatar');
      }
    }
    if (typeof b.bio === 'string') {
      u.bio = b.bio.slice(0, 139); changed.push('bio');
    }

    if (changed.length) saveDb();
    res.json({ ok: true, changed, user: publicUser(u) });
  }));

  console.log(`📱 ${VERSION} aktiv — Start · Nummer · WhatsApp-Code · Name+Foto · 5 Reiter (Profil neu)`);

  /* Nur für Testläufe: eigene Zähler leeren (Route /api/dev/reset-limits) */
  return {
    resetLimits() { const n = BUCKETS.size; BUCKETS.clear(); return n; },
    buckets: BUCKETS,
  };
}

module.exports = { createV428, VERSION, sixDigits, sha };
