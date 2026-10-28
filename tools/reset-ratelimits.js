#!/usr/bin/env node
/* =====================================================================
   🧹 reset-ratelimits.js — NUR für Tests
   ---------------------------------------------------------------------
   Der Rate-Limiter (signup.js) zählt seine Treffer in db.rateBuckets
   und speichert sie IN der Datenbank. Ein Server-Neustart leert sie
   deshalb NICHT. Nach mehreren Testläufen antwortet der Server dann
   mit 429 "Zu viele Anfragen von hier" — und die Test-Suite fällt
   aus einem Grund durch, der nichts mit dem Code zu tun hat.

   Dieses Skript löscht AUSSCHLIESSLICH diese Zähler.
   Nutzer, Chats, Nachrichten bleiben unangetastet.

   ⚠️ Nicht im laufenden Betrieb gegen echte Daten laufen lassen —
      es hebt den Spam-Schutz auf, bis die Zähler wieder gefüllt sind.

   ⚠️ Es gibt ZWEI Zähler:
      · db.rateBuckets  (signup.js)  → dieses Skript leert sie
      · rl im RAM       (server.js)  → geht nur über
        POST /api/dev/reset-limits mit x-internal-token
        (existiert NUR bei MAIL_SIMULATE=1)
   Nur die Datei zu leeren reicht NICHT — der RAM-Zähler blockt weiter.
   Dieses Skript sagt dir am Ende, was noch zu tun ist.

   Benutzung:  node tools/reset-ratelimits.js
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const DB = process.argv[2] || path.join(__dirname, '..', 'server', 'data', 'database.json');

if (!fs.existsSync(DB)) {
  console.error('❌ Datenbank nicht gefunden: ' + DB);
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const before = Object.keys(db.rateBuckets || {}).length;

db.rateBuckets = {};

fs.writeFileSync(DB, JSON.stringify(db, null, 2));

console.log('🧹 ' + before + ' Rate-Limit-Zähler gelöscht.');
console.log('   Nutzer: ' + Object.keys(db.users || {}).length +
            ' · Chats: ' + Object.keys(db.chats || {}).length + ' (unverändert)');
console.log('   → Der RAM-Zähler (server.js) ist damit NICHT geleert.
     Entweder Server neu starten, oder:
       curl -X POST http://127.0.0.1:3000/api/dev/reset-limits \
            -H "x-internal-token: $INTERNAL_TOKEN"');
