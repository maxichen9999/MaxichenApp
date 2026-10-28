/* =====================================================================
   📱 signup.js — Anmeldung wie bei WhatsApp (V4.13)
   ---------------------------------------------------------------------
   Der Ablauf, den jeder von WhatsApp kennt:

     ① Nummer eingeben
     ② Code per WhatsApp bekommen        (pair.js schickt ihn)
     ③ Code eingeben                     → Nummer gilt als bestätigt
     ④ Kontoname + Profilbild
     ⑤ E-Mail für Wiederherstellung
     ⑥ Code per E-Mail von contact@maxichen.de
     ⑦ fertig — Token, rein in die App

   Warum ZWEI Codes?
   Der WhatsApp-Code beweist: „Diese Nummer gehört dir." — wie bei WhatsApp.
   Der E-Mail-Code beweist: „Du kommst auch wieder rein, wenn das Handy weg
   ist." Ohne ihn wäre ein verlorenes Handy ein verlorenes Konto. Bei
   WhatsApp passiert genau das ständig.

   ---------------------------------------------------------------------
   SICHERHEIT (das ist der Teil, der zählt):
   • Codes liegen als SHA-256-Hash in der DB, nie im Klartext.
     (6 Ziffern sind nur 1 Mio. Möglichkeiten — deshalb zählt der
      Rate-Limit, nicht die Länge. 5 Versuche pro Code, dann tot.)
   • 3 Codes pro Nummer in 15 Minuten, sonst 429.
   • Ein Code gilt 5 Minuten (WhatsApp) bzw. 10 (E-Mail), danach nie wieder.
   • Ein „signupToken" gilt 30 Minuten und ist an die Nummer gebunden —
     man kann den Schritt ⑤ nicht mit einer anderen Nummer weiterführen.
   • Der Versand geht NUR über 127.0.0.1 an pair.js, mit eigenem Token.
   • Ist pair.js nicht da, sagt der Server das (code: 'wa_unavailable')
     statt „Code verschickt" zu lügen.
   ===================================================================== */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = function registerSignup(app, H) {
  const { db, saveDb, h, nextId, publicUser, hashPassword, normalizePhone, ipOf, ensureLoveBot, createWelcomeChannel } = H;

  const DATA_DIR = path.join(__dirname, 'data');
  const WA_PORT = Number(process.env.WA_PORT || 3100);
  const WA_URL = 'http://127.0.0.1:' + WA_PORT;

  /* ---------------- interner Token für pair.js ---------------- */

  function internalToken() {
    if (process.env.INTERNAL_TOKEN) return process.env.INTERNAL_TOKEN;
    try {
      const t = fs.readFileSync(path.join(DATA_DIR, 'internal-token.txt'), 'utf8').trim();
      if (t.length >= 24) return t;
    } catch (e) {}
    return '';
  }

  /* ---------------- Speicher ---------------- */

  function store() {
    db.signups = db.signups || {};       // Signup-Sessions nach Token
    db.phoneCodes = db.phoneCodes || {}; // offene WhatsApp-Codes
    db.emailCodes = db.emailCodes || {}; // offene E-Mail-Codes
    return db;
  }

  function sha(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex');
  }

  function sixDigits() {
    // crypto.randomInt ist gleichverteilt — Math.random wäre hier falsch
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  }

  /** Eigener Zähler: gibt true, wenn noch erlaubt. */
  function limit(key, max, ms) {
    store();
    db.rateBuckets = db.rateBuckets || {};
    const now = Date.now();
    const b = db.rateBuckets[key];
    if (!b || now > b.reset) { db.rateBuckets[key] = { n: 1, reset: now + ms }; return true; }
    if (b.n >= max) return false;
    b.n++;
    return true;
  }

  function newSignup(phone) {
    store();
    const token = crypto.randomBytes(24).toString('hex');
    const s = {
      token,
      phone,
      phoneVerified: false,
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
    store();
    const s = token ? db.signups[token] : null;
    if (!s) return null;
    if (s.expiresAt < Date.now()) { delete db.signups[token]; return null; }
    return s;
  }

  /* ---------------- pair.js ansprechen ---------------- */

  async function sendViaWhatsApp(phone, code) {
    const token = internalToken();
    if (!token) return { ok: false, error: 'wa_unavailable', detail: 'pair.js noch nie gestartet (data/internal-token.txt fehlt)' };
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(WA_URL + '/internal/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ phone, code, minutes: 5 }),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: 'wa_failed', detail: j.error || ('HTTP ' + r.status) };
      return { ok: true, id: j.id || null, simulated: !!j.simulated };
    } catch (e) {
      return { ok: false, error: 'wa_unavailable', detail: 'pair.js antwortet nicht auf Port ' + WA_PORT + ' — läuft es?' };
    }
  }

  /* ---------------- E-Mail ---------------- */

  function mailer() {
    try { return require('./mailer'); } catch (e) { return null; }
  }

  /* =================================================================
     ① Nummer prüfen und Code anfordern
     ================================================================= */

  app.post('/api/auth/request-code', h(async (req, res) => {
    const raw = String((req.body && req.body.phone) || '');
    const phone = normalizePhone(raw);
    if (!phone) return res.status(400).json({ error: 'Nummer unvollständig — mit Ländervorwahl eingeben, z. B. +49 151 55894714', code: 'bad_phone' });

    // Schon vergeben? Dann nicht „Code geschickt" lügen — WhatsApp sagt hier
    // ebenfalls, dass die Nummer existiert, aber wir bleiben ehrlich:
    const taken = Object.values(db.users).find((u) => {
      try { return normalizePhone(u.phone) === phone; } catch (e) { return false; }
    });
    if (taken) {
      return res.status(409).json({
        error: 'Diese Nummer hat schon ein Konto. Melde dich an.',
        code: 'phone_exists',
      });
    }

    // 3 Codes / 15 Min pro Nummer
    if (!limit('wa:' + phone, 3, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Zu viele Codes. Warte 15 Minuten.', code: 'too_many', retryAfterMs: 15 * 60 * 1000 });
    }
    // und ein gröberes Limit pro IP, damit niemand Nummern durchprobiert
    if (!limit('waip:' + ipOf(req), 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Zu viele Anfragen von hier.', code: 'too_many' });
    }

    store();
    // alten Code entwerten
    Object.keys(db.phoneCodes).forEach((k) => {
      if (db.phoneCodes[k].phone === phone) delete db.phoneCodes[k];
    });

    const code = sixDigits();
    const rec = {
      phone,
      hash: sha('maxichen-code·' + phone + '·' + code),   // Klartext verlässt den Speicher sofort
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      used: false,
    };
    db.phoneCodes[phone] = rec;

    const out = await sendViaWhatsApp(phone, code);
    saveDb();

    if (!out.ok) {
      // Ehrlich sein: der Nutzer soll wissen, dass KEIN Code unterwegs ist.
      delete db.phoneCodes[phone];
      saveDb();
      const simulate = process.env.WA_SIMULATE === '1';
      return res.status(503).json({
        error: 'WhatsApp-Versand ist gerade nicht bereit. Der Code wurde NICHT verschickt.',
        code: out.error,
        detail: out.detail || '',
        hint: 'Auf dem Server: node pair.js starten und den QR-Code scannen.',
        testMode: simulate,
      });
    }

    console.log('📨 WhatsApp-Code an ' + phone + ' raus' + (out.simulated ? ' (simuliert)' : ''));
    res.json({
      ok: true,
      phone,
      expiresInSec: 300,
      simulated: !!out.simulated,
      // Der Code steht NIEMALS in der Antwort. Auch nicht „nur für Tests".
      message: 'Code ist unterwegs. Schau in WhatsApp.',
    });
  }));

  /* =================================================================
     ② Code prüfen → signupToken
     ================================================================= */

  app.post('/api/auth/verify-code', h(async (req, res) => {
    const phone = normalizePhone(String((req.body && req.body.phone) || ''));
    const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ error: 'Nummer fehlt', code: 'bad_phone' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Der Code hat 6 Ziffern', code: 'bad_code' });

    store();
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
    const ok = rec.hash === sha('maxichen-code·' + phone + '·' + code);
    if (!ok) {
      saveDb();
      return res.status(401).json({
        error: 'Code stimmt nicht.',
        code: 'wrong_code',
        attemptsLeft: Math.max(0, 5 - rec.attempts),
      });
    }

    rec.used = true;
    delete db.phoneCodes[phone];

    const s = newSignup(phone);
    s.phoneVerified = true;
    s.ip = ipOf(req);
    saveDb();
    res.json({
      ok: true,
      signupToken: s.token,
      phone,
      expiresInSec: 1800,
      next: 'profile',
    });
  }));

  /* =================================================================
     ③ Profil: Kontoname + Anzeigename + Bild
     ================================================================= */

  app.post('/api/auth/profile', h(async (req, res) => {
    const b = req.body || {};
    const s = signupBy(String(b.signupToken || ''));
    if (!s) return res.status(401).json({ error: 'Sitzung abgelaufen — Nummer nochmal bestätigen', code: 'no_signup' });
    if (!s.phoneVerified) return res.status(403).json({ error: 'Nummer noch nicht bestätigt', code: 'phone_unverified' });

    const uname = String(b.username || '').trim().toLowerCase();
    const name = String(b.displayName || '').trim();
    const avatar = typeof b.avatar === 'string' && b.avatar.length <= 8 && !b.avatar.startsWith('data:') ? b.avatar.trim() : '';

    if (!/^[a-z0-9_]{3,20}$/.test(uname)) return res.status(400).json({ error: 'Kontoname: 3–20 Zeichen, nur a–z, 0–9 und _', code: 'bad_username' });
    if (Object.values(db.users).some((u) => u.username === uname)) return res.status(409).json({ error: 'Dieser Kontoname ist schon vergeben 💔', code: 'username_taken' });
    if (name.length < 2 || name.length > 30) return res.status(400).json({ error: 'Anzeigename: 2–30 Zeichen', code: 'bad_name' });

    s.username = uname;
    s.displayName = name;
    s.avatar = avatar || '💗';
    saveDb();
    res.json({ ok: true, username: uname, displayName: name, avatar: s.avatar, next: 'email' });
  }));

  /* =================================================================
     ④ E-Mail-Code anfordern
     ================================================================= */

  app.post('/api/auth/request-email-code', h(async (req, res) => {
    const b = req.body || {};
    const s = signupBy(String(b.signupToken || ''));
    if (!s) return res.status(401).json({ error: 'Sitzung abgelaufen — Nummer nochmal bestätigen', code: 'no_signup' });
    if (!s.phoneVerified) return res.status(403).json({ error: 'Nummer noch nicht bestätigt', code: 'phone_unverified' });
    if (!s.username) return res.status(400).json({ error: 'Erst Kontoname wählen', code: 'no_profile' });

    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'E-Mail sieht nicht richtig aus', code: 'bad_email' });
    if (Object.values(db.users).some((u) => u.email === email)) {
      return res.status(409).json({ error: 'Diese E-Mail ist schon an einem Konto', code: 'email_taken' });
    }
    if (!limit('mail:' + email, 3, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Zu viele Mails an diese Adresse. Warte 15 Minuten.', code: 'too_many' });
    }

    const M = mailer();
    if (!M) return res.status(503).json({ error: 'mailer.js fehlt', code: 'mailer_missing' });

    store();
    Object.keys(db.emailCodes).forEach((k) => { if (db.emailCodes[k].phone === s.phone) delete db.emailCodes[k]; });

    const code = sixDigits();
    db.emailCodes[s.phone] = {
      email,
      hash: sha('maxichen-mail·' + email + '·' + code),
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    };
    s.email = email;
    saveDb();

    try {
      const out = await M.sendCode(email, code, 10);
      console.log('✉️ Mail-Code an ' + email + (out.simulated ? ' (simuliert)' : ''));
      res.json({ ok: true, email, expiresInSec: 600, simulated: !!out.simulated, subject: M.SUBJECT, message: 'Schau in dein Postfach.' });
    } catch (e) {
      delete db.emailCodes[s.phone];
      saveDb();
      if (e.code === 'smtp_not_configured') {
        return res.status(503).json({
          error: 'E-Mail-Versand ist auf diesem Server noch nicht eingerichtet.',
          code: 'smtp_not_configured',
          hint: 'STRATO_SMTP_PASS als Umgebungsvariable setzen, dann Server neu starten.',
        });
      }
      return res.status(502).json({ error: 'Mail konnte nicht verschickt werden: ' + e.message, code: 'mail_failed' });
    }
  }));

  /* =================================================================
     ⑤ E-Mail-Code prüfen → Konto anlegen + Token
     ================================================================= */

  app.post('/api/auth/verify-email', h(async (req, res) => {
    const b = req.body || {};
    const s = signupBy(String(b.signupToken || ''));
    if (!s) return res.status(401).json({ error: 'Sitzung abgelaufen', code: 'no_signup' });
    if (!s.phoneVerified || !s.username) return res.status(400).json({ error: 'Schritte fehlen', code: 'incomplete' });

    const code = String(b.code || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Der Code hat 6 Ziffern', code: 'bad_code' });

    store();
    const rec = db.emailCodes[s.phone];
    if (!rec) return res.status(400).json({ error: 'Kein offener Mail-Code', code: 'no_code' });
    if (rec.expiresAt < Date.now()) {
      delete db.emailCodes[s.phone];
      saveDb();
      return res.status(400).json({ error: 'Mail-Code abgelaufen (10 Minuten)', code: 'expired' });
    }
    if (rec.attempts >= 5) {
      delete db.emailCodes[s.phone];
      saveDb();
      return res.status(429).json({ error: 'Zu viele Fehlversuche', code: 'too_many_attempts' });
    }
    rec.attempts++;
    if (rec.hash !== sha('maxichen-mail·' + rec.email + '·' + code)) {
      saveDb();
      return res.status(401).json({ error: 'Code stimmt nicht.', code: 'wrong_code', attemptsLeft: Math.max(0, 5 - rec.attempts) });
    }

    // ✅ alles bestätigt → Konto
    delete db.emailCodes[s.phone];

    const salt = crypto.randomBytes(16).toString('hex');
    // Passwort: bei der WhatsApp-Anmeldung gibt es keins. Wir setzen ein
    // zufälliges — der Weg rein ist die Nummer, nicht ein Passwort.
    const randomPass = crypto.randomBytes(24).toString('hex');
    const user = {
      id: nextId('u_'),
      username: s.username,
      displayName: s.displayName,
      bio: '',
      avatar: s.avatar || '💗',
      phone: s.phone,
      phoneVerified: true,
      email: rec.email,
      emailVerified: true,
      salt,
      pass: hashPassword(randomPass, salt),
      createdAt: Date.now(),
      lastSeen: 0,
      bgSound: true,
      bg: { default: 'pink-dream', overrides: {} },
      role: 'user',
      bans: [],
      warnings: [],
      signup: 'whatsapp',
    };
    db.users[user.id] = user;
    s.userId = user.id;

    const token = crypto.randomBytes(24).toString('hex');
    db.tokens[token] = user.id;
    db.tokenMeta = db.tokenMeta || {};
    db.tokenMeta[token] = {
      device: String(b.device || '📱 MaxiChen-App (WhatsApp-Anmeldung)').slice(0, 40),
      createdAt: Date.now(),
      lastSeen: Date.now(),
      ip: ipOf(req),
    };

    delete db.signups[s.token];

    // wie bei der normalen Registrierung: LoveBot da, erster echter Nutzer bekommt den Willkommens-Kanal
    let welcome = null;
    try {
      const realUsers = Object.values(db.users).filter((u) => !u.isBot).length;
      if (ensureLoveBot) ensureLoveBot();
      if (realUsers === 1 && createWelcomeChannel) welcome = createWelcomeChannel(user);
    } catch (e) {}

    saveDb();
    console.log('🌸 Neues Konto via WhatsApp-Anmeldung: ' + user.username);
    res.json({
      ok: true,
      token,
      user: publicUser(user, { email: user.email, bg: user.bg }),
      welcome: welcome ? welcome.id : null,
      phoneVerified: true,
      emailVerified: true,
    });
  }));

  /* =================================================================
     Status (damit die App weiß, was fehlt) + Diagnose für den Owner
     ================================================================= */

  app.get('/api/auth/signup-status', h(async (req, res) => {
    const s = signupBy(String(req.query.token || ''));
    if (!s) return res.status(401).json({ error: 'Sitzung abgelaufen', code: 'no_signup' });
    res.json({
      ok: true,
      phone: s.phone,
      step: !s.phoneVerified ? 'phone' : !s.username ? 'profile' : !s.emailVerified ? 'email' : 'done',
      phoneVerified: s.phoneVerified,
      profileDone: !!s.username,
      emailDone: s.emailVerified,
      expiresInSec: Math.max(0, Math.floor((s.expiresAt - Date.now()) / 1000)),
      attemptsLeft: (db.phoneCodes[s.phone] ? Math.max(0, 5 - db.phoneCodes[s.phone].attempts) : null),
    });
  }));

  /** Owner-Diagnose: läuft pair.js? ist SMTP eingerichtet? */
  app.get('/api/auth/signup-health', h(async (req, res) => {
    const M = mailer();
    const tok = internalToken();
    let wa = { reachable: false, connected: false, session: null, simulate: null };
    if (tok) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 2500);
        const r = await fetch(WA_URL + '/health', { signal: ctl.signal });
        clearTimeout(t);
        const j = await r.json().catch(() => ({}));
        wa = { reachable: true, connected: !!j.connected, session: j.session || null, simulate: !!j.simulate, qrPending: !!j.qrPending };
      } catch (e) {}
    }
    res.json({
      whatsapp: Object.assign(wa, { tokenPresent: !!tok }),
      mail: M ? { configured: M.isConfigured(), simulate: !!(M.CFG && M.CFG.simulate), from: M.CFG ? M.CFG.user : null } : { configured: false },
      codesOpen: { phone: Object.keys(db.phoneCodes || {}).length, email: Object.keys(db.emailCodes || {}).length },
      signupsOpen: Object.keys(db.signups || {}).length,
    });
  }));

  return { sixDigits };
};
