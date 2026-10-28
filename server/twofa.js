/* =====================================================================
   🔢 V4.12 — TOTP-2FA + RECOVERY CODES (Server)
   ---------------------------------------------------------------------
   Regeln, die hier gelten:

     1. Das Secret wird erst gespeichert, wenn der Nutzer EINEN gültigen
        Code aus seiner App vorgelegt hat (`/totp/enable`). Vorher ist es
        nur "pending" — sonst sperrst du Leute mit einem Tippfehler aus.
     2. Abschalten geht nur mit Passwort UND gültigem Code.
        (Sonst knackt jemand das Handy, loggt sich ein, schaltet 2FA aus.)
     3. Recovery-Codes werden als Hash gespeichert und beim Benutzen
        verbraucht. Ein Code = ein Login.
     4. Der Login fragt NUR dann nach einem Code, wenn 2FA aktiv ist.
        Bestehende Konten funktionieren unverändert weiter.
   ===================================================================== */

const crypto = require('crypto');

function base32Encode(buf) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '', bits = 0, val = 0;
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += A[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0;
  const out = [];
  for (const ch of clean) {
    val = (val << 5) | A.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** HOTP nach RFC 4226 — identisch zu Totp.kt */
function hotp(secret, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const h = crypto.createHmac('sha1', secret).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) |
              ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return String(bin % Math.pow(10, digits)).padStart(digits, '0');
}

function totp(secret, unixSeconds, digits = 6, period = 30) {
  return hotp(secret, Math.floor(unixSeconds / period), digits);
}

function verifyTotp(secretB32, code, nowMs = Date.now(), window = 1) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const secret = base32Decode(secretB32);
  if (!secret.length) return false;
  const now = Math.floor(nowMs / 1000);
  let ok = false;
  for (let w = -window; w <= window; w++) {
    const expect = totp(secret, now + w * 30);
    // konstanter Vergleich
    if (expect.length === clean.length &&
        crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(clean))) ok = true;
  }
  return ok;
}

function newSecretB32() {
  return base32Encode(crypto.randomBytes(20));
}

/* ---------------- Recovery-Codes (Hash wie in der App) ---------------- */

const RC_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ234567';

function normalizeRc(input) {
  return String(input || '').toUpperCase().split('').filter((c) => RC_ALPHABET.includes(c)).join('');
}

function hashRc(code, saltB64) {
  return crypto.pbkdf2Sync(normalizeRc(code), Buffer.from(saltB64, 'base64'), 120000, 32, 'sha256').toString('base64');
}

function newRecoveryCodes(count = 10) {
  const plain = [];
  const stored = [];
  const seen = new Set();
  while (plain.length < count) {
    let c = '';
    for (let i = 0; i < 8; i++) c += RC_ALPHABET[crypto.randomInt(RC_ALPHABET.length)];
    if (seen.has(c)) continue;
    seen.add(c);
    const salt = crypto.randomBytes(16).toString('base64');
    plain.push(c.slice(0, 4) + '-' + c.slice(4));
    stored.push({ salt, hash: hashRc(c, salt), used: false });
  }
  return { plain, stored };
}

function matchRecovery(code, stored) {
  const norm = normalizeRc(code);
  if (norm.length !== 8) return -1;
  let found = -1;
  for (let i = 0; i < stored.length; i++) {
    const s = stored[i];
    if (s.used) continue;
    const h = hashRc(norm, s.salt);
    if (h.length === s.hash.length &&
        crypto.timingSafeEqual(Buffer.from(h), Buffer.from(s.hash))) {
      if (found < 0) found = i;    // nicht abbrechen: Laufzeit darf nichts verraten
    }
  }
  return found;
}

/* ===================================================================== */

function createTwoFa(app, h, ctx) {
  const { db, saveDb, auth } = ctx;

  function ensure() {
    if (!db.twofa) db.twofa = {};
    return db.twofa;
  }

  /** Öffentlicher Status — ohne Secret. */
  app.get('/api/auth/2fa', auth, h(async (req, res) => {
    const t = ensure()[req.user.id];
    res.json({
      enabled: !!(t && t.enabled),
      pending: !!(t && t.secret && !t.enabled),
      recoveryLeft: t && t.recovery ? t.recovery.filter((r) => !r.used).length : 0,
      requiredForBadge: req.user.username === 'maxichen' || req.user.isBot,
      lastUsedAt: (t && t.lastUsedAt) || null,
    });
  }));

  /** Schritt 1: Secret erzeugen (noch NICHT aktiv). */
  app.post('/api/auth/2fa/setup', auth, h(async (req, res) => {
    const me = req.user;
    const store = ensure();
    const secret = newSecretB32();
    store[me.id] = { ...(store[me.id] || {}), secret, enabled: false, createdAt: Date.now() };
    saveDb();

    const label = encodeURIComponent('MaxiChat') + ':' + encodeURIComponent(me.username);
    const url = 'otpauth://totp/' + label +
      '?secret=' + secret +
      '&issuer=' + encodeURIComponent('MaxiChat') +
      '&algorithm=SHA1&digits=6&period=30';

    res.json({
      ok: true,
      secret,
      secretPretty: secret.match(/.{1,4}/g).join(' '),
      otpauth: url,
      hint: 'Scanne den QR-Code, dann gib EINEN Code ein — erst dann ist 2FA aktiv.',
    });
  }));

  /** Schritt 2: Code prüfen und aktivieren — erst hier werden Recovery-Codes erzeugt. */
  app.post('/api/auth/2fa/enable', auth, h(async (req, res) => {
    const me = req.user;
    const store = ensure();
    const t = store[me.id];
    if (!t || !t.secret) return res.status(400).json({ error: 'Erst /2fa/setup aufrufen', code: 'no_setup' });

    const code = String((req.body || {}).code || '');
    if (!verifyTotp(t.secret, code)) {
      return res.status(401).json({ error: 'Code stimmt nicht — Uhrzeit am Handy prüfen?', code: 'totp_bad' });
    }

    const rc = newRecoveryCodes(10);
    t.enabled = true;
    t.enabledAt = Date.now();
    t.recovery = rc.stored;
    // 🔑 der Haken wird neu signiert, weil sich der 2FA-Status geändert hat
    saveDb();
    res.json({
      ok: true,
      recoveryCodes: rc.plain,
      hint: 'Diese 10 Codes werden NUR JETZT angezeigt. Jeder funktioniert genau einmal.',
    });
  }));

  /** Abschalten nur mit Passwort UND gültigem Code. */
  app.post('/api/auth/2fa/disable', auth, h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};
    if (!ctx.checkPassword || !ctx.checkPassword(me, String(b.password || ''))) {
      return res.status(401).json({ error: 'Passwort falsch' });
    }
    const t = ensure()[me.id];
    if (!t || !t.enabled) return res.status(400).json({ error: '2FA ist nicht aktiv' });
    if (!verifyTotp(t.secret, String(b.code || ''))) {
      return res.status(401).json({ error: 'Code stimmt nicht', code: 'totp_bad' });
    }
    await ctx.saveDbAsync ? ctx.saveDbAsync() : saveDb();
    delete ensure()[me.id];
    saveDb();
    res.json({ ok: true, hint: '2FA aus. Ein verifizierter Haken wird damit entzogen (Owner/Bot).' });
  }));

  /* ---------------- Recovery-Codes ---------------- */

  app.post('/api/auth/recovery', h(async (req, res) => {
    const b = req.body || {};
    const login = String(b.login || '').trim().toLowerCase();
    const code = String(b.code || '');
    const user = Object.values(db.users).find((u) => u.username === login);
    if (!user) return res.status(401).json({ error: 'Unbekannt' });
    const t = ensure()[user.id];
    if (!t || !t.enabled || !t.recovery) return res.status(400).json({ error: 'Keine Recovery-Codes', code: 'no_2fa' });

    const idx = matchRecovery(code, t.recovery);
    if (idx < 0) return res.status(401).json({ error: 'Code ungültig oder schon benutzt', code: 'rc_bad' });

    t.recovery[idx].used = true;
    t.lastUsedAt = Date.now();
    saveDb();
    res.json({
      ok: true,
      recoveryLeft: t.recovery.filter((r) => !r.used).length,
      hint: 'Code verbraucht. Melde dich jetzt mit Passwort an — 2FA ist für diesen einen Login übersprungen.',
      skipTotpOnce: true,
    });
  }));

  return { verifyTotp, totp, hotp, base32Encode, base32Decode, newRecoveryCodes, matchRecovery };
}

module.exports = { createTwoFa, verifyTotp, totp, hotp, base32Encode, base32Decode, newRecoveryCodes, matchRecovery };
