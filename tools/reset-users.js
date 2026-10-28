#!/usr/bin/env node
/* =====================================================================
 *  🧹 tools/reset-users.js — alle Nutzer löschen, Owner-Nummer vormerken
 * ---------------------------------------------------------------------
 *  Was passiert:
 *    · users, chats, messages, tokens, signups, phoneCodes, emailCodes,
 *      moments, calls, channels-Abos … werden GELEERT
 *    · server/data/media/ wird geleert (Dateien gehörten zu Nachrichten)
 *    · owner.json bleibt — die Owner-Nummer ist dort vorgemerkt
 *    · die Struktur der Datenbank bleibt intakt (Server startet normal)
 *
 *  Was NICHT passiert:
 *    · es wird KEIN Nutzer „nachgebaut". Der Owner meldet sich mit
 *      +4915155894714 ganz normal an (Nummer → WhatsApp-Code) und ist
 *      danach automatisch Owner + verifiziert.
 *
 *  Aufruf:
 *      node tools/reset-users.js --ja-ich-will     (schreibt)
 *      node tools/reset-users.js                   (zeigt nur, was weg wäre)
 *
 *  Sicherung: vorher wird server/data/database.json nach
 *  server/data/backups/database-<zeit>.json kopiert.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'server', 'data');
const DB_FILE = path.join(DATA, 'database.json');
const MEDIA = path.join(DATA, 'media');
const DRY = !process.argv.includes('--ja-ich-will');

/* Diese Schlüssel werden geleert. Alles andere bleibt (z. B. Einstellungen). */
const WIPE = [
  'users', 'chats', 'messages', 'tokens', 'tokenMeta', 'signups',
  'phoneCodes', 'emailCodes', 'rateBuckets', 'moments', 'calls',
  'callLog', 'blocks', 'reports', 'invites', 'media', 'usedVipCodes',
  'pushSubs', 'sessions', 'twofa', 'channels', 'communities', 'polls',
  'notifications', 'readMarks', 'pins', 'drafts', 'presence',
];

function human(n) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(1)) + ' ' + u[i];
}

function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error('❌ Keine Datei: ' + DB_FILE);
    process.exit(1);
  }
  const beforeSize = fs.statSync(DB_FILE).size;
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const db = JSON.parse(raw);

  const counts = {};
  for (const k of WIPE) {
    const v = db[k];
    if (Array.isArray(v)) counts[k] = v.length;
    else if (v && typeof v === 'object') counts[k] = Object.keys(v).length;
    else continue;
  }

  let mediaFiles = 0, mediaBytes = 0;
  try {
    for (const f of fs.readdirSync(MEDIA)) {
      const st = fs.statSync(path.join(MEDIA, f));
      if (st.isFile()) { mediaFiles++; mediaBytes += st.size; }
    }
  } catch (e) {}

  console.log('📊 Was in der Datenbank steht');
  console.log('   Datei: ' + human(beforeSize));
  for (const [k, n] of Object.entries(counts)) {
    if (n) console.log('   ' + k.padEnd(16) + n);
  }
  console.log('   media/          ' + mediaFiles + ' Dateien · ' + human(mediaBytes));

  if (DRY) {
    console.log('');
    console.log('🔍 Nur angeschaut — nichts geändert.');
    console.log('   Zum Löschen:  node tools/reset-users.js --ja-ich-will');
    return;
  }

  /* ---------- Sicherung ---------- */
  const bkDir = path.join(DATA, 'backups');
  fs.mkdirSync(bkDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bkFile = path.join(bkDir, 'database-' + stamp + '.json');
  fs.copyFileSync(DB_FILE, bkFile);
  fs.chmodSync(bkFile, 0o600);
  console.log('');
  console.log('💾 Sicherung: ' + path.relative(ROOT, bkFile) + ' (' + human(beforeSize) + ')');

  /* ---------- Leeren ---------- */
  for (const k of WIPE) {
    if (Array.isArray(db[k])) db[k] = [];
    else if (db[k] && typeof db[k] === 'object') db[k] = {};
  }
  db.media = {};
  db.seq = 1;

  // Medien-Dateien löschen (gehörten zu Nachrichten, die es nicht mehr gibt)
  let removed = 0;
  try {
    for (const f of fs.readdirSync(MEDIA)) {
      try { fs.unlinkSync(path.join(MEDIA, f)); removed++; } catch (e) {}
    }
  } catch (e) {}

  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
  fs.chmodSync(DB_FILE, 0o600);

  const afterSize = fs.statSync(DB_FILE).size;
  console.log('🧹 Geleert: ' + Object.keys(counts).filter((k) => counts[k]).join(', '));
  console.log('🗑️  ' + removed + ' Medien-Dateien gelöscht');
  console.log('📉 Datenbank: ' + human(beforeSize) + ' → ' + human(afterSize));
  console.log('');
  console.log('👑 Owner-Nummer vorgemerkt: +4915155894714');
  console.log('   Anmelden mit dieser Nummer → Code per WhatsApp → Konto ist Owner + verifiziert.');
}

main();
