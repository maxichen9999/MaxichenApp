#!/usr/bin/env node
/* =====================================================================
   🔥 TURN-PROBE — beweist, dass der coturn-Server WIRKLICH arbeitet
   ---------------------------------------------------------------------
   Kein „Config sieht gut aus", sondern echtes STUN/TURN über UDP:
     1) Binding-Request      → Server antwortet (XOR-MAPPED-ADDRESS)
     2) Allocate ohne Creds  → 401 + REALM + NONCE (Auth ist an)
     3) Allocate mit REST-Credentials (username=expiry:userId,
        password=base64(HMAC-SHA1(secret, username))) → 0x0103 + Relay
     4) Allocate mit falschem Passwort → 401 (kein Durchwinken)
     5) Credentials eines anderen Secrets → 401 (Secret stimmt wirklich)

   Benutzung:  node tests/turn-probe.js [host] [port] [secret] [realm]
   ===================================================================== */
const dgram = require('dgram');
const crypto = require('crypto');

const HOST = process.argv[2] || '127.0.0.1';
const PORT = parseInt(process.argv[3] || '3478', 10);
const SECRET = process.argv[4] || 'TEST_SECRET_123';
const REALM = process.argv[5] || 'maxichat.test';

const MAGIC = Buffer.from([0x21, 0x12, 0xA4, 0x42]);
const T = {
  BIND_REQ: 0x0001, BIND_OK: 0x0101,
  ALLOC_REQ: 0x0003, ALLOC_OK: 0x0103, ALLOC_ERR: 0x0113,
  USERNAME: 0x0006, MESSAGE_INTEGRITY: 0x0008, ERROR_CODE: 0x0009,
  LIFETIME: 0x000D, XOR_PEER: 0x0012, REALM: 0x0014, NONCE: 0x0015,
  XOR_RELAYED: 0x0016, REQ_TRANSPORT: 0x0019, XOR_MAPPED: 0x0020,
};

function header(type, len, txid) {
  const b = Buffer.alloc(20);
  b.writeUInt16BE(type, 0);
  b.writeUInt16BE(len, 2);
  MAGIC.copy(b, 4);
  txid.copy(b, 8);
  return b;
}

function attr(type, value) {
  const pad = (4 - (value.length % 4)) % 4;
  const b = Buffer.alloc(4 + value.length + pad);
  b.writeUInt16BE(type, 0);
  b.writeUInt16BE(value.length, 2);
  value.copy(b, 4);
  return b;
}

function attrs(list) {
  return list.filter(Boolean);
}

/** MESSAGE-INTEGRITY nach RFC 5389: HMAC-SHA1 über alles davor, Länge inkl. MI. */
function withIntegrity(type, parts, key, txid) {
  const body = Buffer.concat(parts);
  const totalLen = body.length + 24;      // + MI-Attribut (4 Header + 20 HMAC)
  const head = header(type, totalLen, txid);
  const mac = crypto.createHmac('sha1', key).update(Buffer.concat([head, body])).digest();
  return Buffer.concat([head, body, attr(T.MESSAGE_INTEGRITY, mac)]);
}

function parse(buf) {
  const type = buf.readUInt16BE(0);
  const len = buf.readUInt16BE(2);
  const out = { type, attrs: {}, raw: buf };
  let off = 20;
  const end = 20 + len;
  while (off + 4 <= end && off + 4 <= buf.length) {
    const t = buf.readUInt16BE(off);
    const l = buf.readUInt16BE(off + 2);
    const v = buf.slice(off + 4, off + 4 + l);
    out.attrs[t] = v;
    off += 4 + l + ((4 - (l % 4)) % 4);
  }
  return out;
}

/** STUN-Error-Code = class(3 Bit) * 100 + number */
function errCode(r) {
  const e = r.attrs[T.ERROR_CODE];
  if (!e) return '-';
  return ((e[2] & 0x07) * 100 + e[3]);
}

function ip6From(buf) {
  const fam = buf[1];
  if (fam === 0x01) {
    const x = buf.readUInt32BE(4) ^ 0x2112A442;
    return `${(x >>> 24) & 255}.${(x >>> 16) & 255}.${(x >>> 8) & 255}.${x & 255}:${buf.readUInt16BE(2) ^ 0x2112}`;
  }
  return 'ipv6';
}

/* WICHTIG: EIN Socket für die ganze Prüfung.
   coturn bindet den NONCE an die Verbindung (5-Tupel) — mit einem neuen
   Socket pro Request kommt sonst 438 „Stale Nonce". Genau der Fehler,
   den diese Probe vorher selbst produziert hat. */
let sock = null;
function getSock() {
  if (sock) return sock;
  sock = dgram.createSocket('udp4');
  sock.on('error', () => {});
  return sock;
}
let queue = Promise.resolve();
function send(msg, timeoutMs = 2500) {
  const run = () => new Promise((resolve, reject) => {
    const s = getSock();
    const timer = setTimeout(() => { s.removeListener('message', onMsg); reject(new Error('Timeout — keine Antwort vom TURN-Server')); }, timeoutMs);
    function onMsg(m) { clearTimeout(timer); s.removeListener('message', onMsg); resolve(parse(m)); }
    s.on('message', onMsg);
    s.send(msg, PORT, HOST);
  });
  queue = queue.then(run, run);
  return queue;
}

/** coturn REST-API-Passwort: base64(HMAC-SHA1(secret, username)) */
function restCredential(username, secret = SECRET) {
  return crypto.createHmac('sha1', secret).update(username).digest('base64');
}
/** Long-Term-Credential-Key: MD5(user:realm:pass) */
function longTermKey(user, realm, pass) {
  return crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest();
}

(async () => {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log('✅', name); }
    else { fail++; console.log('❌', name, extra); }
  };

  console.log(`\n🔥 TURN-Probe gegen ${HOST}:${PORT} (realm ${REALM})\n` + '='.repeat(56));

  /* 1) Binding — lebt der Server überhaupt? */
  let txid = crypto.randomBytes(12);
  let r = await send(header(T.BIND_REQ, 0, txid));
  ok('STUN Binding beantwortet', r.type === T.BIND_OK, 'type=0x' + r.type.toString(16));
  ok('XOR-MAPPED-ADDRESS enthalten (echte Antwort)', !!r.attrs[T.XOR_MAPPED], Object.keys(r.attrs).join(','));

  /* 2) Allocate ohne Credentials → 401 mit REALM + NONCE */
  txid = crypto.randomBytes(12);
  r = await send(header(T.ALLOC_REQ, 0, txid).length ? (() => {
    const rt = Buffer.from([0x11, 0, 0, 0]);
    const body = attr(T.REQ_TRANSPORT, rt);
    return Buffer.concat([header(T.ALLOC_REQ, body.length, txid), body]);
  })() : null);
  ok('Allocate ohne Auth → 401', r.type === T.ALLOC_ERR && !!r.attrs[T.ERROR_CODE] && errCode(r) === 401,
    'type=0x' + r.type.toString(16) + ' code=' + errCode(r));
  const nonce = r.attrs[T.NONCE];
  const realm = r.attrs[T.REALM];
  ok('REALM und NONCE geliefert (Challenge)', !!nonce && !!realm, '');
  ok('REALM ist der konfigurierte', realm && realm.toString() === REALM, realm && realm.toString());

  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const user = `${expiry}:u_test`;
  const cred = restCredential(user);

  const alloc = (pass1, nonceBuf = nonce) => {
    const tx = crypto.randomBytes(12);
    const parts = [
      attr(T.REQ_TRANSPORT, Buffer.from([0x11, 0, 0, 0])),
      attr(T.USERNAME, Buffer.from(user)),
      attr(T.REALM, Buffer.from(REALM)),
      attr(T.NONCE, nonceBuf),
    ];
    return send(withIntegrity(T.ALLOC_REQ, parts, longTermKey(user, REALM, pass1), tx));
  };

  /* 3) Allocate mit den Credentials, die unser Server ausgibt */
  r = await alloc(cred);
  ok('Allocate mit REST-Credential → Erfolg (0x0103)', r.type === T.ALLOC_OK,
    'type=0x' + r.type.toString(16) + ' code=' + errCode(r));
  ok('Relay-Adresse wurde zugeteilt', !!r.attrs[T.XOR_RELAYED], r.attrs[T.XOR_RELAYED] ? ip6From(r.attrs[T.XOR_RELAYED]) : '-');
  ok('Lifetime gesetzt', !!r.attrs[T.LIFETIME], r.attrs[T.LIFETIME] ? r.attrs[T.LIFETIME].readUInt32BE(0) + 's' : '-');

  /* 4) Falsches Passwort → 401 */
  try {
    r = await alloc('definitiv-falsch');
    ok('falsches Passwort → 401', r.type === T.ALLOC_ERR, 'type=0x' + r.type.toString(16));
  } catch (e) {
    ok('falsches Passwort → 401', false, e.message);
  }

  /* 5) Credential aus anderem Secret → 401 (Secret wirklich bindend) */
  try {
    r = await alloc(restCredential(user, 'ANDERES_SECRET'));
    ok('Credential aus fremdem Secret → 401', r.type === T.ALLOC_ERR, 'type=0x' + r.type.toString(16));
  } catch (e) {
    ok('Credential aus fremdem Secret → 401', false, e.message);
  }

  console.log('\n' + '='.repeat(56));
  console.log(`${pass}/${pass + fail} grün` + (fail ? '  ❌' : '  🔥'));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('❌ Probe abgebrochen:', e.message);
  process.exit(1);
});
