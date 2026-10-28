#!/usr/bin/env node
'use strict';
/**
 * 📱 LoveChat — WhatsApp-Brücke starten (direkt aus dem Hauptordner)
 * =====================================================================
 *  Startet den echten `server/pair.js`. Keine zweite Kopie — der Code
 *  bleibt an einer Stelle.
 *
 *  Start:  npm run pair      (in diesem Ordner)
 *  oder:   node pair.js
 *  Dann:   QR-Code mit WhatsApp scannen (Verknüpfte Geräte)
 * =====================================================================
 */
console.log('📱 LoveChat — starte die WhatsApp-Brücke (echter Code: server/pair.js)\n');

try {
  require('./server/pair.js');
} catch (e) {
  if (e && e.code === 'MODULE_NOT_FOUND') {
    console.error('');
    console.error('❌ Es fehlen noch die Pakete. Bitte EINMAL im Ordner Lovechat:');
    console.error('       npm i');
    console.error('   Danach:  npm run pair');
    console.error('');
    process.exit(1);
  }
  throw e;
}
