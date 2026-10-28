/* =====================================================================
   ✅ V4.12 — VERIFIED BADGES auf dem Server
   ---------------------------------------------------------------------
   Der Server hält EINEN ECDSA-P-256-Schlüssel. Mit ihm signiert er
   Haken. Die App hat den Public-Key fest eingebaut und prüft.

   Regeln, die hier durchgesetzt werden:
     1. Nur der Server kann signieren — der private Key verlässt die
        DB-Datei nie und geht über keinen Endpunkt raus.
     2. Ein Haken wird bei JEDER Änderung von Rolle, Bild oder 2FA-Status
        neu signiert (das ist der Grund, warum ein Bild-Tausch auffällt).
     3. Owner und Bot MÜSSEN 2FA an haben, sonst gibt es keinen Haken.
        (Ohne TOTP kein verifizierter Owner — das ist der Punkt.)
     4. Ein Nutzer kann seinen Haken NICHT selbst setzen: es gibt keinen
        POST-Endpunkt, der role schreibt. Nur dieser Code hier.
   ===================================================================== */

const crypto = require('crypto');

const VERSION = 'maxichat-badge-v1';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function createBadges(app, h, ctx) {
  const { db, saveDb, auth } = ctx;
  const { hasTwoFactor } = require('./v422');

  /* ---------- Server-Schlüssel (einmal erzeugt, dann fest) ---------- */

  function ensureKeys() {
    if (db.badgeKeys && db.badgeKeys.privatePem && db.badgeKeys.publicB64) return db.badgeKeys;
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    db.badgeKeys = {
      privatePem: privateKey.toString('base64'),
      publicB64: publicKey.toString('base64'),
      createdAt: Date.now(),
    };
    saveDb();
    console.log('✅ Badge-Signing-Key erzeugt');
    return db.badgeKeys;
  }

  function privateKey() {
    const k = ensureKeys();
    return crypto.createPrivateKey({
      key: Buffer.from(k.privatePem, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  }

  /* ---------- Nutzlast — MUSS identisch zu VerifiedBadge.kt sein ---------- */

  function payload(userId, role, avatarHash, issuedAt) {
    return Buffer.from(`${VERSION}|${userId}|${role}|${avatarHash}|${issuedAt}`, 'utf8');
  }

  function avatarHash(avatar) {
    const a = String(avatar || '').trim();
    if (!a) return '';
    return crypto.createHash('sha256').update(a, 'utf8').digest('hex').slice(0, 32);
  }

  /* ---------- Rolle bestimmen (die einzige Wahrheit) ---------- */

  /* 📞 V4.29: Owner wird an der Telefonnummer erkannt (wie in moderation.js).
   * Der Benutzername ist nur noch Altlast für alte Konten. */
  const OWNER_PHONE = (() => {
    try { return require('./accounts').normalizePhone(String(process.env.OWNER_PHONE || '+4915155894714')); }
    catch (e) { return '+4915155894714'; }
  })();
  function isOwnerUser(user) {
    if (!user) return false;
    if (user.username === 'maxichen' || user.role === 'owner' || user.isOwner) return true;
    if (!user.phone) return false;
    try { return require('./accounts').normalizePhone(String(user.phone)) === OWNER_PHONE; }
    catch (e) { return String(user.phone) === OWNER_PHONE; }
  }

  function roleOf(user) {
    if (!user) return 'user';
    if (user.isBot) return 'bot';
    if (isOwnerUser(user)) return 'owner';
    if (user.isStaff) return 'team';
    if (user.verified === true) return 'verified';
    return 'user';
  }

  /** Owner und Bot brauchen 2FA — sonst kein Haken. Das ist die Regel. */
  function needs2fa(role) {
    return role === 'owner' || role === 'bot';
  }

  /* ---------- Signieren ---------- */

  function badgeFor(user, now = Date.now()) {
    const role = roleOf(user);
    if (role === 'user') return null;

    /* 🔴 V4.22 — Hier stand `!(user.totp && user.totp.enabled)`.
       Das Feld `totp` wurde von KEINEM Code geschrieben: /api/2fa/setup
       (v3.js) schreibt `user.twoFactor`, der Login prüft `db.twofa`.
       Drei Speicherorte für eine Information — deshalb hat der Haken
       nie funktioniert, auch nicht mit aktivem 2FA.
       Jetzt: einer Prüfung, alle drei Quellen. */
    if (needs2fa(role) && !hasTwoFactor(ctx.db, user)) {
      return { blocked: true, reason: '2fa_required', role };
    }

    const aHash = avatarHash(user.avatar);
    const issuedAt = now;
    const data = payload(user.id, role, aHash, issuedAt);
    const sig = crypto.sign('sha256', data, privateKey());   // ECDSA P-256
    return {
      userId: user.id,
      role,
      avatarHash: aHash,
      issuedAt,
      signature: sig.toString('base64'),
      blocked: false,
    };
  }

  function encodeBadge(b) {
    return [b.userId, b.role, b.avatarHash, b.issuedAt, b.signature].join('|');
  }

  /* ---------- Endpunkte ---------- */

  /** Öffentlicher Schlüssel — die App braucht ihn zum Prüfen (und darf ihn haben). */
  app.get('/api/badges/key', (req, res) => {
    const k = ensureKeys();
    res.json({
      publicKey: k.publicB64,
      algorithm: 'ECDSA-P256-SHA256',
      version: VERSION,
      maxAgeDays: 30,
    });
  });

  /** Eigener Haken — wird bei jedem Aufruf frisch signiert (kurzlebig, aber gültig). */
  app.get('/api/badges/me', auth, h(async (req, res) => {
    const me = req.user;
    const b = badgeFor(me);
    if (!b) return res.json({ badge: null, role: 'user' });
    if (b.blocked) {
      return res.json({
        badge: null,
        role: b.role,
        blocked: true,
        reason: b.reason,
        hint: 'Owner und Bot brauchen 2FA (TOTP), sonst gibt es keinen verifizierten Haken.',
      });
    }
    res.json({ badge: encodeBadge(b), role: b.role });
  }));

  /** Selbsttest: Server signiert, Server prüft wieder — und ein manipuliertes
   *  Feld MUSS scheitern. Wird von tests/v412test.js aufgerufen. */
  app.get('/api/badges/selfcheck', auth, h(async (req, res) => {
    const k = ensureKeys();
    const pub = Buffer.from(k.publicB64, 'base64');
    const now = Date.now();
    const data = payload('u_probe', 'owner', 'abc123', now);
    const sig = crypto.sign('sha256', data, privateKey());

    const good = crypto.verify('sha256', data, { key: pub, format: 'der', type: 'spki' }, sig);
    const tampered = crypto.verify('sha256',
      payload('u_probe', 'owner', 'abc124', now),   // ein Zeichen anders
      { key: pub, format: 'der', type: 'spki' }, sig);

    res.json({
      good,
      tamperedAccepted: tampered,        // muss false sein
      algorithm: 'ECDSA-P256-SHA256',
      publicKeyBytes: pub.length,
    });
  }));

  /** Fremder Haken (öffentlich, aber signiert — jeder kann ihn prüfen). */
  app.get('/api/badges/:userId', auth, h(async (req, res) => {
    const u = db.users[String(req.params.userId || '')];
    if (!u) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    const b = badgeFor(u);
    if (!b || b.blocked) {
      return res.json({ badge: null, role: b ? b.role : 'user', blocked: !!(b && b.blocked) });
    }
    res.json({ badge: encodeBadge(b), role: b.role });
  }));

  /** Alle Haken auf einmal — für Chat-Listen (ein Request statt N). */
  app.get('/api/badges', auth, h(async (req, res) => {
    const out = {};
    for (const u of Object.values(db.users)) {
      const b = badgeFor(u);
      if (b && !b.blocked) out[u.id] = encodeBadge(b);
    }
    res.json({ badges: out, count: Object.keys(out).length });
  }));

  return { badgeFor, roleOf, ensureKeys, avatarHash, payload, isOwnerUser };
}

module.exports = { createBadges, VERSION, MAX_AGE };
