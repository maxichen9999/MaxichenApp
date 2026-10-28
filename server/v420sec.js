/* =====================================================================
 *  🛡️ v420sec.js — V4.20 Teil 3: was der Server wirklich prüfen kann
 * ---------------------------------------------------------------------
 *  Drei Dinge, die hier NICHT passieren (weil sie unehrlich wären):
 *
 *  ❌ „Play Integrity / DeviceCheck" — braucht Google- und Apple-Konten,
 *     die ich nicht habe. Ein selbstgebauter „Attestation"-Header ist
 *     kein Nachweis eines echten Geräts, sondern nur ein gemeinsames
 *     Geheimnis. Ich nenne es deshalb, was es ist: eine App-Signatur.
 *
 *  ❌ „Pinning am Server" — Pinning ist eine Client-Sache. Der Server
 *     kann nur sagen, welche Zertifikate GÜLTIG sind (siehe
 *     /api/security/pins), damit die App sie fest verdrahten kann.
 *
 *  ❌ „Screenshot-Schutz über HTTP prüfen" — FLAG_SECURE wirkt im
 *     Android-Fenster. Der Server sieht davon nichts.
 *
 *  Was hier wirklich passiert:
 *  ✅ X-App-Signature: HMAC-SHA256 über METHODE\nPFAD\nBODY\nZEIT.
 *     Aktiv, sobald APP_SIGNATURE_SECRET gesetzt ist. Zeitfenster 300 s
 *     gegen Replay. Die Prüfung ist dieselbe, die in der Web-App
 *     in `lib/services/secure.dart` steht (und dort getestet ist).
 *  ✅ /api/security/pins — die echten SPKI-/Zertifikat-Hashes der
 *     ausgelieferten Kette, damit niemand sie abtippen muss.
 *  ✅ /api/security/status — eine ehrliche Liste: was ist an, was nicht,
 *     und warum nicht.
 * ===================================================================== */
'use strict';

const crypto = require('crypto');

/* Die Werte stammen aus der echten Kette von maxichen.de (26.10.2026,
 * `openssl s_client -showcerts`), nicht aus einem Lehrbuch. */
const PINS = {
  host: 'maxichen.de',
  checkedOn: '2026-10-26',
  note: 'Blatt-Zertifikat + Zwischenzertifikat + Wurzeln. Wer nur das Blatt pinnt, hat beim nächsten Let\'s-Encrypt-Renewal (alle ~90 Tage) eine tote App.',
  certificates: [
    {
      role: 'leaf',
      subject: 'CN=maxichen.de',
      notBefore: '2026-10-20T13:05:53Z',
      notAfter: '2027-01-18T13:05:52Z',
      spkiSha256Base64: '71/FhLQQKqvW/Yd84ANEQAqcnFAWzwXyvLvMLwuKBVI=',
      derSha256Base64: '4Rzr2vpScwxloQ7W4hVaSdwGqzBnhJPfwIclyxrrBV0=',
    },
    {
      role: 'intermediate',
      subject: "C=US, O=Let's Encrypt, CN=YE2",
      notBefore: '2025-09-03T00:00:00Z',
      notAfter: '2028-09-02T23:59:59Z',
      spkiSha256Base64: 's/tdAOmUzd8syaTuqfgGvFcn6DzA5Cmb+Vby1ST+U3Y=',
      derSha256Base64: 'l2WN6MaN+pis4eUCimPVShqukRs+IUcQdsaFDNCMurQ=',
    },
    {
      role: 'root',
      subject: 'C=US, O=ISRG, CN=Root YE',
      notBefore: '2026-05-13T00:00:00Z',
      notAfter: '2032-09-02T23:59:59Z',
      spkiSha256Base64: 'sCkq5UWXjg+7mKu9lMhhYF5bGLsy7VI/UNW3tccdR7w=',
      derSha256Base64: 'D8CQHMorrp6f27AtUNAvEJT3s2ZyCGmRueiXYm3EhfA=',
    },
    {
      role: 'root-cross',
      subject: 'C=US, O=Internet Security Research Group, CN=ISRG Root X2',
      notBefore: '2026-05-13T00:00:00Z',
      notAfter: '2032-09-02T23:59:59Z',
      spkiSha256Base64: 'diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=',
      derSha256Base64: '7l96vWmBuwJVYyzY9JKDRRtLGIRNEgQLRO4A8HuP4sY=',
    },
  ],
};

/** Zeitunterschied in Sekunden, den eine Signatur alt sein darf. */
const MAX_SKEW = 300;

/**
 * Prüft den Header `lc1 <keyId> <ts> <hmac-hex>`.
 * Exakt dieselbe Rechnung wie in der App — deshalb kann man sie
 * gegeneinander testen (tests/v420test.js).
 */
function verifySignature({ header, secret, method, path, body, nowSeconds, maxSkew = MAX_SKEW }) {
  if (typeof header !== 'string') return { ok: false, why: 'header_missing' };
  const parts = header.trim().split(' ');
  if (parts.length !== 4) return { ok: false, why: 'header_malformed' };
  const [scheme, keyId, tsRaw, mac] = parts;
  if (scheme !== 'lc1') return { ok: false, why: 'scheme_unknown' };
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) return { ok: false, why: 'timestamp_invalid' };
  const now = nowSeconds == null ? Math.floor(Date.now() / 1000) : nowSeconds;
  if (Math.abs(now - ts) > maxSkew) return { ok: false, why: 'timestamp_skew' };
  const msg = `${String(method).toUpperCase()}\n${path}\n${body || ''}\n${ts}`;
  const expected = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(mac), 'hex');
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return ok ? { ok: true, keyId } : { ok: false, why: 'mac_mismatch' };
}

/** Signatur bauen — für Tests und zum Nachrechnen von Hand. */
function makeSignature({ secret, method, path, body, timestampSeconds, keyId = 'lovechat-420' }) {
  const ts = timestampSeconds == null ? Math.floor(Date.now() / 1000) : timestampSeconds;
  const msg = `${String(method).toUpperCase()}\n${path}\n${body || ''}\n${ts}`;
  const mac = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  return `lc1 ${keyId} ${ts} ${mac}`;
}

function createV420Sec(app, h, ctx) {
  const secret = process.env.APP_SIGNATURE_SECRET || '';
  const enabled = secret.length >= 16;
  const stats = { checked: 0, rejected: 0, accepted: 0, lastReject: null };

  /* ---------- Middleware: nur für /api/downloads/* ---------------------
   * Absichtlich nicht global: ein fehlender Header darf die Web-App
   * nicht lahmlegen. Die App schickt ihn, der Browser nicht. */
  function requireSignature(req, res, next) {
    if (!enabled) return next();               // aus → durchlassen
    // req.rawBody kommt aus dem express.json-verify-Hook (server.js).
    // Nur wenn wirklich Bytes da waren; sonst exakt leerer String.
    const bodyRaw = typeof req.rawBody === 'string' ? req.rawBody : '';
    // WICHTIG: In einer mit app.use('/api/downloads', …) eingehängten
    // Middleware ist req.path nur "/latest". Signiert wird aber der
    // vollständige Pfad — deshalb originalUrl ohne Querystring.
    const fullPath = String(req.originalUrl || req.url || '').split('?')[0];
    const r = verifySignature({
      header: req.get('X-App-Signature'),
      secret,
      method: req.method,
      path: fullPath,
      body: bodyRaw,
    });
    stats.checked++;
    if (!r.ok) {
      stats.rejected++;
      stats.lastReject = { why: r.why, at: Date.now(), path: fullPath };
      return res.status(401).json({
        error: 'App-Signatur fehlt oder ist ungültig',
        code: 'app_signature',
        why: r.why,
      });
    }
    stats.accepted++;
    req.appSignature = { keyId: r.keyId };
    return next();
  }

  /* ---------- Öffentliche Pins ------------------------------------- */
  app.get('/api/security/pins', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(PINS);
  });

  /* ---------- Selbstauskunft: was ist an, was nicht ---------------- */
  app.get('/api/security/status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      version: '4.20',
      appSignature: {
        enabled,
        reason: enabled
          ? 'APP_SIGNATURE_SECRET gesetzt — /api/downloads/* verlangt X-App-Signature'
          : 'APP_SIGNATURE_SECRET nicht gesetzt — Header wird angenommen, aber nicht geprüft',
        scheme: 'lc1 <keyId> <unix-ts> <hmac-sha256-hex>',
        signedParts: ['METHODE', 'PFAD (ohne Query)', 'BODY', 'TIMESTAMP'],
        maxSkewSeconds: MAX_SKEW,
        stats,
      },
      pinning: {
        // Der Server kann Pinning nicht erzwingen — er kann nur die
        // richtigen Werte liefern.
        enforceable: false,
        note: 'Pinning passiert im Client. Der Server liefert hier die Wahrheit: /api/security/pins',
        host: PINS.host,
        checkedOn: PINS.checkedOn,
        certificates: PINS.certificates.length,
      },
      screenshotProtection: {
        enforceable: false,
        note: 'FLAG_SECURE wirkt im Android-Fenster (MainActivity.kt). Der Server sieht davon nichts — jede andere Behauptung wäre gelogen.',
        implementedIn: 'client/app.js (Web) — es gibt nur noch die Web-App',
      },
      autoLock: {
        enforceable: false,
        note: 'Läuft im Client (lib/core/autolock.dart, 60 s, sperrt auch beim Wechsel in den Hintergrund).',
        seconds: 60,
      },
      attestation: {
        implemented: false,
        note: 'Play Integrity / DeviceCheck brauchen Google/Apple-Konten. Nicht gebaut, statt Attestation zu behaupten.',
      },
      e2e: {
        algorithms: ['X25519', 'AES-256-GCM'],
        serverSeesPlaintext: false,
        note: 'Server speichert nur Ciphertext (server/e2e.js). Testvektoren in tests/e2e-vectors.js.',
      },
    });
  });

  /* ---------- Prüf-Endpunkt: signiert die App richtig? ------------- */
  app.post('/api/security/verify-signature', (req, res) => {
    const b = req.body || {};
    if (!enabled) {
      return res.status(200).json({
        ok: false,
        enabled: false,
        reason: 'Kein APP_SIGNATURE_SECRET gesetzt — hier ist nichts zu prüfen.',
      });
    }
    const r = verifySignature({
      header: b.header,
      secret,
      method: b.method || 'POST',
      path: b.path || '/api/security/verify-signature',
      body: b.body || '',
    });
    res.status(r.ok ? 200 : 401).json({ ...r, enabled: true });
  });

  app.use('/api/downloads', requireSignature);

  console.log(
    enabled
      ? '🛡️ V4.20-SEC aktiv — /api/downloads/* verlangt X-App-Signature'
      : '🛡️ V4.20-SEC geladen — App-Signatur aus (kein APP_SIGNATURE_SECRET)'
  );

  return { verifySignature, makeSignature, PINS, enabled, stats };
}

module.exports = { createV420Sec, verifySignature, makeSignature, PINS, MAX_SKEW };
