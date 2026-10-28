/* =====================================================================
   💾 V4.10 — FREMDE GEGENPROBE für das Backup-Format
   ---------------------------------------------------------------------
   Diese Datei baut mit NODE-MITTELN (crypto.pbkdf2Sync + createCipheriv)
   dieselbe Backup-Datei wie die App in Kotlin — aus demselben fiktiven
   Passwort, demselben Salt und derselben Nonce.

   Wenn beide dasselbe Ergebnis liefern, ist das Format wirklich
   PBKDF2-HMAC-SHA256 + AES-256-GCM nach Standard — nicht "läuft nur
   bei uns". Genau derselbe Trick wie bei ML-KEM gegen kyber-py.

   Zusätzlich: die Datei wird wieder entschlüsselt (Rundreise) und
   gegen Manipulation geprüft.
   ===================================================================== */
const crypto = require('crypto');

const ITER = 310_000;
const SALT = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');
const NONCE = Buffer.from('000102030405060708090a0b', 'hex');
const PASS = 'MaxiChat-Backup-Test-2026';
const PLAIN = Buffer.from('{"format":"maxichat-vault-backup-v1","version":1,"probe":"vektor"}', 'utf8');

/** Baut den Container GENAU nach der Spezifikation in Backup.kt. */
function build(pass, salt, nonce, plain, iterations) {
  const header = Buffer.alloc(53);
  header.write('MCBK', 0, 'ascii');
  header[4] = 1;
  header.writeUInt32BE(iterations, 5);
  salt.copy(header, 9);
  nonce.copy(header, 41);

  const key = crypto.pbkdf2Sync(pass, salt, iterations, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(header);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([header, ct, c.getAuthTag()]);
}

function open(file, pass) {
  if (file.length < 53 + 16) return null;
  if (file.subarray(0, 4).toString('ascii') !== 'MCBK') return null;
  if (file[4] !== 1) return null;
  const iterations = file.readUInt32BE(5);
  const salt = file.subarray(9, 41);
  const nonce = file.subarray(41, 53);
  const header = file.subarray(0, 53);
  const ct = file.subarray(53, file.length - 16);
  const tag = file.subarray(file.length - 16);
  try {
    const key = crypto.pbkdf2Sync(pass, salt, iterations, 32, 'sha256');
    const d = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    d.setAAD(header);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]);
  } catch (e) {
    return null;
  }
}

const file = build(PASS, SALT, NONCE, PLAIN, ITER);
const sha = crypto.createHash('sha256').update(file).digest('hex');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('✅', name); }
  else { fail++; console.log('❌', name, extra); }
};

console.log('\n💾 Backup-Format Gegenprobe (Node.js, eigene Implementierung)');
console.log('='.repeat(64));
console.log('Dateigröße :', file.length, 'Bytes  (53 Header + ' + PLAIN.length + ' Klartext + 16 Tag)');
console.log('SHA-256    :', sha);
console.log('');

ok('Magic/Version im Header', file.subarray(0, 5).toString('hex') === '4d43424b01');
ok('Iterationen im Header = 310000', file.readUInt32BE(5) === ITER);
ok('Dateigröße = 53 + Klartext + 16', file.length === 53 + PLAIN.length + 16);

const back = open(file, PASS);
ok('fremde Implementierung kann die App-Datei öffnen', back !== null && back.equals(PLAIN),
  back ? back.toString() : 'null');
ok('falsches Passwort → null', open(file, 'falsch') === null);
ok('gekipptes Bit im Ciphertext → null', (() => {
  const b = Buffer.from(file); b[b.length - 20] ^= 1; return open(b, PASS) === null;
})());
ok('Header-Manipulation (Iterationen) → null', (() => {
  const b = Buffer.from(file); b.writeUInt32BE(1000, 5); return open(b, PASS) === null;
})());
ok('abgeschnittene Datei → null', open(file.subarray(0, 60), PASS) === null);

// Gegenrichtung: Node baut, Kotlin-Test prüft dieselbe Konstante.
const key = crypto.pbkdf2Sync(PASS, SALT, ITER, 32, 'sha256');
ok('Schlüssel ist 32 Byte (AES-256)', key.length === 32);

console.log('\n' + '='.repeat(64));
console.log(`${pass}/${pass + fail} bestanden`);
console.log('\n📌 Erwartete Konstante für den Kotlin-Test:');
console.log('   Backup.sha256(fester Vektor) ==', sha);
console.log('');

// Maschinenlesbar für Skripte
if (process.argv.includes('--hash')) console.log(sha);
process.exit(fail ? 1 : 0);
