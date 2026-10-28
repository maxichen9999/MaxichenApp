// Rechnet dieselben Werte mit Node — unabhängig von Swift und Kotlin.
const crypto = require('crypto');
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function b32e(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function hotp(secret, counter, digits = 6) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(buf).digest();
  const off = h[19] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off+1] << 16) | (h[off+2] << 8) | h[off+3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
const secret = Buffer.from('12345678901234567890');
function norm(p) { let s = String(p).replace(/[^\d+]/g, ''); if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) s = '+'+s; return /^\+\d{7,15}$/.test(s) ? s : ''; }
const fox = crypto.createHash('sha256').update('🦊').digest('hex').slice(0, 32);
const cat = crypto.createHash('sha256').update('🐱').digest('hex').slice(0, 32);

const rows = [
  ['sha256_abc', crypto.createHash('sha256').update('abc').digest('hex')],
  ['sha1_abc', crypto.createHash('sha1').update('abc').digest('hex')],
  ['hmac1', crypto.createHmac('sha1', 'Jefe').update('what do ya want for nothing?').digest('hex')],
  ['pbkdf2_4096', crypto.pbkdf2Sync('password', 'salt', 4096, 32, 'sha256').toString('hex')],
  ['base32_foobar', b32e(Buffer.from('foobar'))],
  ['hotp_0', hotp(secret, 0)],
  ['hotp_9', hotp(secret, 9)],
  ['totp_59_8', hotp(secret, Math.floor(59 / 30), 8)],
  ['totp_1234567890_6', hotp(secret, Math.floor(1234567890 / 30), 6)],
  ['totp_1700000010', hotp(secret, Math.floor(1700000010 / 30), 6)],
  ['avatar_fox', fox],
  ['avatar_cat', cat],
  ['payload', `maxichat-badge-v1|u_maxi|owner|abcd1234|1790000000000`],
  ['phone', norm('+49 (151) 558-947-14')],
  ['phone_pretty', '+49 151 558 947 14'],
  ['recovery_alphabet', ALPHA],
  ['otpauth', `otpauth://totp/MaxiChen:maxi?secret=${b32e(secret)}&issuer=MaxiChen&algorithm=SHA1&digits=6&period=30`],
];
for (const [k, v] of rows) console.log(k + '\t' + v);
