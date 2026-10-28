#!/usr/bin/env node
'use strict';
/**
 * 💗 LoveChat — Server-Start direkt aus dem Hauptordner
 * =====================================================================
 *  Diese Datei ist absichtlich winzig: sie startet den echten Server aus
 *  `server/server.js`. Es gibt also **keine zweite Kopie** des Codes —
 *  wenn du etwas ändern willst, änderst du es in `server/server.js`.
 *
 *  Start:   npm i && npm start      (in diesem Ordner, npm i nur 1×)
 *  oder:    node server.js
 *  Windows: START-WINDOWS.bat doppelklicken
 *  Mac/Linux: ./START-MAC-LINUX.command
 *
 *  Danach im Browser:  http://localhost:7777
 * =====================================================================
 */
console.log('💗 LoveChat — starte den Server (echter Code liegt in server/server.js)\n');

try {
  require('./server/server.js');
} catch (e) {
  if (e && e.code === 'MODULE_NOT_FOUND') {
    console.error('');
    console.error('❌ Es fehlen noch die Pakete (das passiert beim allerersten Start).');
    console.error('');
    console.error('   Bitte EINMAL das hier ausführen — im Ordner Lovechat:');
    console.error('');
    console.error('       npm i');
    console.error('');
    console.error('   Danach wieder:  npm start');
    console.error('');
    console.error('   (Fehlendes Paket: ' + (e.message.split("'")[1] || '?') + ')');
    process.exit(1);
  }
  throw e;
}
