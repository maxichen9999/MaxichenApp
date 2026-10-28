#!/usr/bin/env node
/* 🔓 Notausgang: 2FA eines Kontos zurücksetzen, wenn das Handy weg ist.
 *
 *   node tools/2fa-owner-reset.js maxichen          → 2FA aus (Login ohne Code)
 *   node tools/2fa-owner-reset.js maxichen --show    → Secret nur anzeigen
 *   node tools/2fa-owner-reset.js maxichen --new     → neues Secret + neue Codes
 *
 * Muss auf dem SERVER laufen (Dateizugriff). Kein HTTP-Weg, damit niemand
 * per Web den zweiten Faktor abschalten kann.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', 'server', 'data', 'database.json');
const name = (process.argv[2] || '').replace(/^@/, '');
const flag = process.argv[3] || '';

if (!name) {
  console.log('Aufruf: node tools/2fa-owner-reset.js <username> [--show|--new]');
  process.exit(1);
}
if (!fs.existsSync(DB)) {
  console.error('❌ Datenbank nicht gefunden:', DB);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const user = Object.values(db.users || {}).find((u) => u.username === name);
if (!user) {
  console.error('❌ Konto nicht gefunden:', name);
  process.exit(1);
}

const tf = require('../server/twofa');

if (flag === '--show') {
  const s = (db.twofa && db.twofa[user.id] && db.twofa[user.id].secret) ||
            (user.twoFactor && user.twoFactor.secret) || null;
  console.log(s ? `Secret für ${name}: ${s}` : `Kein 2FA-Secret für ${name}.`);
  process.exit(0);
}

if (flag === '--new') {
  const secret = tf.base32Encode(require('crypto').randomBytes(20));
  const rc = tf.newRecoveryCodes(10);
  db.twofa = db.twofa || {};
  db.twofa[user.id] = { secret, enabled: true, createdAt: Date.now(), recovery: rc.stored };
  user.twoFactor = { secret, enabled: true, createdAt: Date.now() };
  user.totp = { secret, enabled: true, createdAt: Date.now() };
  fs.writeFileSync(DB, JSON.stringify(db));
  const out = path.join(__dirname, '..', 'owner', 'totp-secret.txt');
  fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
  fs.writeFileSync(out, [
    `🔐 2FA für ${user.username} (neu eingerichtet ${new Date().toISOString()})`,
    '',
    `Secret (Base32): ${secret}`,
    `otpauth://totp/LoveChat%3A${user.username}?secret=${secret}&issuer=LoveChat&algorithm=SHA1&digits=6&period=30`,
    '',
    ...rc.plain.map((c, i) => `${String(i + 1).padStart(2)}. ${c}`),
  ].join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(out, 0o600);
  console.log(`✅ Neues Secret für ${name} → owner/totp-secret.txt (0600)`);
  console.log(`   6 Ziffern jetzt: ${tf.totp(secret)}`);
  process.exit(0);
}

/* Standard: abschalten */
const had = !!((db.twofa && db.twofa[user.id]) || user.twoFactor || user.totp);
delete db.twofa?.[user.id];
delete user.twoFactor;
delete user.totp;
fs.writeFileSync(DB, JSON.stringify(db));
console.log(had
  ? `✅ 2FA für ${name} ist AUS. Login wieder mit Passwort. Haken verschwindet dabei — neu setzen mit --new.`
  : `ℹ️  ${name} hatte gar kein 2FA.`);
