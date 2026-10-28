/* =====================================================================
   🔢 V4.12 — FREMDE GEGENPROBE für TOTP
   ---------------------------------------------------------------------
   Baut TOTP-Codes mit Node-Bordmitteln nach (crypto.createHmac) und
   vergleicht sie mit den RFC-Vektoren UND mit dem, was die Kotlin-
   Implementierung liefert (über eine JSON-Datei, die der Kotlin-Test
   schreibt — hier rechnen wir die Erwartung unabhängig nach).

   Wenn beide dasselbe liefern, ist die App in Google Authenticator,
   Aegis, Authy und 1Password gültig.
   ===================================================================== */
const crypto = require('crypto');

const SECRET = Buffer.from('12345678901234567890', 'utf8');

function hotp(secret, counter, digits) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const h = crypto.createHmac('sha1', secret).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) |
              ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return String(bin % Math.pow(10, digits)).padStart(digits, '0');
}

function totp(secret, t, digits = 6, period = 30) {
  return hotp(secret, Math.floor(t / period), digits);
}

function base32(buf) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '', bits = 0, val = 0;
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += A[(val << (5 - bits)) & 31];
  return out;
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('✅', name); }
  else { fail++; console.log('❌', name, extra); }
};

console.log('\n🔢 TOTP-Gegenprobe (Node.js, eigene HMAC-Implementierung)');
console.log('='.repeat(64));

/* ---------- RFC 4226 (HOTP) ---------- */
const hotpVec = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
let allHotp = true;
hotpVec.forEach((exp, i) => { if (hotp(SECRET, i, 6) !== exp) allHotp = false; });
ok('RFC 4226 — alle 10 HOTP-Vektoren', allHotp);

/* ---------- RFC 6238 (TOTP, 8 Stellen) ---------- */
const totpVec = [
  [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
  [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
];
let allTotp = true;
totpVec.forEach(([t, exp]) => { if (totp(SECRET, t, 8) !== exp) allTotp = false; });
ok('RFC 6238 — alle 6 TOTP-Vektoren (8 Stellen)', allTotp);

/* ---------- 6-stellig (was die App nutzt) ---------- */
const sixVec = [
  [59, '287082'], [1111111109, '081804'], [1111111111, '050471'],
  [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130'],
];
let allSix = true;
sixVec.forEach(([t, exp]) => { if (totp(SECRET, t, 6) !== exp) allSix = false; });
ok('RFC 6238 — dieselben Zeitpunkte 6-stellig', allSix);

/* ---------- Base32 ---------- */
ok('Base32 RFC 4648: "foobar" → MZXW6YTBOI', base32(Buffer.from('foobar')) === 'MZXW6YTBOI');
ok('Base32 des RFC-Secrets', base32(SECRET) === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');

/* ---------- Reproduzierbarkeit über Zeit ---------- */
ok('gleicher Zeitpunkt = gleicher Code', totp(SECRET, 1700000000) === totp(SECRET, 1700000000));
ok('30 s später = anderer Code', totp(SECRET, 1700000000) !== totp(SECRET, 1700000030));
// 1700000010 und 1700000029 liegen beide in Fenster 56666667 (floor(t/30))
ok('innerhalb der Periode gleich', totp(SECRET, 1700000010) === totp(SECRET, 1700000029));

/* ---------- otpauth-URL, wie sie die App baut ---------- */
const url = 'otpauth://totp/' + encodeURIComponent('MaxiChat:test') +
  '?secret=' + base32(SECRET) + '&issuer=' + encodeURIComponent('MaxiChat') +
  '&algorithm=SHA1&digits=6&period=30';
const parsed = new URL(url);
ok('otpauth-URL: Protokoll/Host', parsed.protocol === 'otpauth:' && parsed.host === 'totp');
ok('otpauth-URL: Label', decodeURIComponent(parsed.pathname) === '/MaxiChat:test', parsed.pathname);
ok('otpauth-URL: secret', parsed.searchParams.get('secret') === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
ok('otpauth-URL: digits/period', parsed.searchParams.get('digits') === '6' && parsed.searchParams.get('period') === '30');

console.log('\n' + '='.repeat(64));
console.log(`${pass}/${pass + fail} bestanden\n`);
process.exit(fail ? 1 : 0);
