/* =====================================================================
   🔥 V4.7 — TURN-Credentials (coturn „TURN REST API")
   ---------------------------------------------------------------------
   Warum nicht einfach user/pass in die App schreiben?
   • dann könnte jeder die Zugangsdaten aus der APK lesen und über deinen
     Server fremden Traffic relayen (Bandbreiten-Diebstahl)
   • deshalb: kurzlebige, pro Nutzer erzeugte Credentials

   Verfahren (Standard, coturn: `use-auth-secret`):
     username   = "<ablauf-unixzeit>:<userId>"
     credential = base64( HMAC-SHA1( TURN_SECRET, username ) )

   Der Server kennt nur das Secret, coturn rechnet dasselbe. Nach Ablauf
   (Standard 1 h) holt sich die App neue — ein Leak ist dann wertlos.

   Ohne TURN_SECRET antwortet der Endpunkt ehrlich mit STUN-only und
   einem Hinweis, statt eine Verbindung zu versprechen, die nicht kommt.
   ===================================================================== */

const crypto = require('crypto');

function createTurn(app, h, ctx) {
  const { auth, rateLimit } = ctx;

  const HOST = (process.env.TURN_HOST || '').trim();
  const HOST2 = (process.env.TURN_HOST_2 || '').trim();
  const PORT = parseInt(process.env.TURN_PORT || '3478', 10);
  const TLS = process.env.TURN_TLS === '1';
  const SECRET = process.env.TURN_SECRET || '';
  const REALM = process.env.TURN_REALM || 'maxichat';
  const TTL = Math.max(300, Math.min(86400, parseInt(process.env.TURN_TTL || '3600', 10)));
  const STUN_FALLBACK = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302').split(',').map((s) => s.trim()).filter(Boolean);

  const enabled = !!(HOST && SECRET);

  /** coturn-kompatibel: base64(HMAC-SHA1(secret, username)) */
  function credential(username) {
    return crypto.createHmac('sha1', SECRET).update(username).digest('base64');
  }

  function urlsFor(host, port) {
    const list = [`turn:${host}:${port}?transport=udp`, `turn:${host}:${port}?transport=tcp`];
    if (TLS) list.push(`turns:${host}:5349?transport=tcp`);
    return list;
  }

  app.get('/api/rtc/ice', auth, h(async (req, res) => {
    const me = req.user;

    // grober Schutz gegen Credential-Spam (nicht pro IP, pro Account)
    if (rateLimit && rateLimit('ice:' + me.id, 60, 60 * 1000) === false) {
      return res.status(429).json({ error: 'Zu viele Anfragen — kurz warten 💗', code: 'ice_rate' });
    }

    const stun = STUN_FALLBACK.map((u) => ({ urls: [u] }));

    if (!enabled) {
      return res.json({
        turn: false,
        ttl: 0,
        iceServers: stun,
        hint: 'Kein TURN konfiguriert — Anrufe gehen nur bei offenen NATs. ' +
          'Setze TURN_HOST + TURN_SECRET (deploy/install-turn.sh) für „geht immer".',
      });
    }

    const expiry = Math.floor(Date.now() / 1000) + TTL;
    const username = `${expiry}:${me.id}`;
    const base = { urls: urlsFor(HOST, PORT), username, credential: credential(username) };
    const servers = [...stun, base];
    if (HOST2) {
      const u2 = `${expiry}:${me.id}`;
      servers.push({ urls: urlsFor(HOST2, PORT), username: u2, credential: credential(u2) });
    }

    res.json({
      turn: true,
      ttl: TTL,
      expiresAt: expiry * 1000,
      realm: REALM,
      iceServers: servers,
      hint: 'Credentials sind kurzlebig — App holt automatisch neue.',
    });
  }));

  /* ---------- Selbsttest: ist der Relay wirklich erreichbar? ----------
     Kein Fake-Ping: schickt ein echtes STUN-Binding über UDP an den
     TURN-Port und misst, ob der Server antwortet. */
  app.get('/api/rtc/turn-health', auth, h(async (req, res) => {
    if (!enabled) return res.json({ ok: false, configured: false, hint: 'TURN nicht konfiguriert' });

    const dgram = require('dgram');
    const sock = dgram.createSocket('udp4');
    const txid = crypto.randomBytes(12);
    const msg = Buffer.alloc(20);
    msg.writeUInt16BE(0x0001, 0);            // Binding Request
    msg.writeUInt16BE(0, 2);
    Buffer.from([0x21, 0x12, 0xa4, 0x42]).copy(msg, 4);
    txid.copy(msg, 8);

    const targetHost = HOST.startsWith('turn:') ? HOST.slice(5) : HOST;
    const done = new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 2500);
      sock.on('message', (m) => {
        clearTimeout(timer);
        resolve({ ok: m.length >= 20 && m.readUInt16BE(0) === 0x0101, bytes: m.length });
      });
      sock.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, reason: e.message }); });
      try {
        sock.send(msg, PORT, targetHost);
      } catch (e) {
        clearTimeout(timer);
        resolve({ ok: false, reason: e.message });
      }
    });

    const result = await done;
    try { sock.close(); } catch (e) {}
    res.json({
      configured: true, host: targetHost, port: PORT, tls: TLS, ...result,
      hint: result.ok ? 'TURN antwortet ✅' : 'TURN nicht erreichbar — Port/Firewall prüfen 🔥',
    });
  }));

  console.log(enabled
    ? `🔥 V4.7 aktiv — TURN ${HOST}:${PORT}${TLS ? ' + TLS/5349' : ''} · Credentials ${TTL}s gültig`
    : '🔥 V4.7 aktiv — TURN NICHT konfiguriert (nur STUN) · /api/rtc/ice sagt es ehrlich');

  return { enabled, credential, TTL };
}

module.exports = { createTurn };
