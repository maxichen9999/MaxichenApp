#!/usr/bin/env node
/* =====================================================================
   📱 pair.js — WhatsApp-Brücke für MaxiChen (V4.13)
   ---------------------------------------------------------------------
   Was das hier ist:
   Ein eigener WhatsApp-Client, der auf deinem Server dauerhaft läuft.
   Er verschickt die 6-stelligen Anmeldecodes an die Nummer, die jemand
   bei der Registrierung eingibt — so wie WhatsApp selbst seine Codes
   schickt, nur dass wir es sind.

   Was das hier NICHT ist:
   Kein Bot, der Chats liest. Wir hören NUR auf Nachrichten, wenn du
   PRIVATE_CHAT=1 setzt — und selbst dann wird nichts gespeichert.
   Standard: nur senden.

   ---------------------------------------------------------------------
   ERSTER START (einmalig, auf DEINEM Server):
     cd /home/user/lovechat
     npm install                      # Baileys + qrcode-terminal
     node pair.js
   → Im Terminal erscheint ein QR-Code.
   → Handy: WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen
   → QR scannen. Fertig. Die Session liegt in data/wa-auth/ (creds.json)
     und bleibt gültig, bis du sie in WhatsApp entfernst.

   Danach (zweites Terminal):
     node server.js

   ---------------------------------------------------------------------
   SICHERHEIT — bitte einmal lesen:
   • Die HTTP-Schnittstelle hört NUR auf 127.0.0.1. Von außen ist sie
     nicht erreichbar, auch wenn der Server auf 0.0.0.0 lauscht.
   • Jede Anfrage braucht den Bearer-Token aus INTERNAL_TOKEN. Ist die
     Variable nicht gesetzt, wird beim Start ein zufälliger erzeugt und
     in data/internal-token.txt geschrieben (nur 0600) — den liest
     server.js beim Start selbst.
   • Der WhatsApp-Account, den du hier scannst, kann Nachrichten an
     beliebige Nummern senden. Behandle die Session wie ein Passwort:
     nie ins Repo, nie ins ZIP, nie in eine Chat-Verlaufsdatei.
   ===================================================================== */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ---------------- Konfiguration ---------------- */

const SESSION_NAME = process.env.WA_SESSION || 'Verifi';     // Name der WhatsApp-Session
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(__dirname, 'data', 'wa-auth');
const HOST = '127.0.0.1';                                    // NIE 0.0.0.0 — siehe oben
const PORT = Number(process.env.WA_PORT || 3100);
const SIMULATE = process.env.WA_SIMULATE === '1';
const DATA_DIR = path.join(__dirname, 'data');
const OUTBOX = path.join(DATA_DIR, 'wa-outbox.jsonl');

/* Profil, das beim Verbinden gesetzt wird — alles über ENV überschreibbar. */
const PROFILE = {
  name: process.env.WA_PROFILE_NAME || 'MaxiChen Verifizierung',
  about: process.env.WA_PROFILE_ABOUT || 'Dein Code kommt gleich 💗 Nicht weitergeben.',
  picture: process.env.WA_PROFILE_IMAGE || path.join(__dirname, 'app', 'wa-profile.png'),
};

/* ---------------- Interner Token ---------------- */

function internalToken() {
  if (process.env.INTERNAL_TOKEN) return process.env.INTERNAL_TOKEN;
  const f = path.join(DATA_DIR, 'internal-token.txt');
  try {
    const t = fs.readFileSync(f, 'utf8').trim();
    if (t.length >= 24) {
      // 🔴 V4.22: existierende Datei kann mit 644 entstanden sein (alter Lauf,
      // anderer umask) — die Rechte JETZT geradeziehen, nicht nur beim Anlegen.
      try { fs.chmodSync(f, 0o600); } catch (e) {}
      return t;
    }
  } catch (e) {}
  const t = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(f, t, { mode: 0o600 });
  } catch (e) {}
  console.log('🔑 Neuer INTERNAL_TOKEN erzeugt → data/internal-token.txt (0600)');
  return t;
}
const TOKEN = internalToken();

/* ---------------- Log mit Zeit ---------------- */

function log(...a) {
  console.log(new Date().toLocaleTimeString('de-DE'), ...a);
}

/* ---------------- Telefonnummern ---------------- */

/**
 * So, wie WhatsApp es tut: nur Ziffern, mit Ländercode davor, ohne +.
 * "+49 151 55894714" → "4915155894714"
 * Gibt null zurück, wenn es keine plausible Nummer ist.
 */
function toWaJid(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;   // E.164: max. 15
  if (digits.startsWith('00')) return digits.slice(2) + '@s.whatsapp.net';
  return digits + '@s.whatsapp.net';
}

/* ---------------- Simulation (für Tests ohne Handy) ---------------- */

function simulateSend(jid, text) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const line = JSON.stringify({ at: Date.now(), to: jid, text, simulated: true }) + '\n';
  fs.appendFileSync(OUTBOX, line, { mode: 0o600 });
  log('🧪 SIMULIERT an', jid, '|', text.split('\n')[0].slice(0, 60));
  return { ok: true, simulated: true, id: 'sim_' + crypto.randomBytes(6).toString('hex') };
}

/* ---------------- der echte WhatsApp-Client ---------------- */

let sock = null;
let connected = false;
let lastQr = '';
let startedAt = Date.now();
let sent = 0;
let failed = 0;

async function startWhatsApp() {
  const baileys = await import('@whiskeysockets/baileys');
  const {
    makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion,
  } = baileys;
  const makeWASocketFn = makeWASocket || baileys.default;

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  let version = undefined;
  try { version = (await fetchLatestBaileysVersion()).version; } catch (e) {}

  sock = makeWASocketFn({
    version,
    auth: state,
    // Der Name, der in WhatsApp unter "Verknüpfte Geräte" steht:
    browser: Browsers ? Browsers.ubuntu(SESSION_NAME) : [SESSION_NAME, 'Chrome', '1.0'],
    printQRInTerminal: false,          // wir rendern selbst (schöner + kontrolliert)
    syncFullHistory: false,            // 🔒 kein Verlaufs-Download
    markOnlineOnConnect: false,        // 🔒 nicht "online" anzeigen
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined, // 🔒 wir lesen nichts nach
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      lastQr = qr;
      console.log('\n');
      console.log('═'.repeat(64));
      console.log('  📱 WhatsApp verbinden — Session „' + SESSION_NAME + '"');
      console.log('  Handy: WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen');
      console.log('═'.repeat(64));
      try {
        require('qrcode-terminal').generate(qr, { small: true }, (code) => {
          console.log(code);
          console.log('  ⏳ QR gilt ~20 Sekunden und wird automatisch neu gezeigt.');
          console.log('═'.repeat(64) + '\n');
        });
      } catch (e) {
        console.log('  ⚠️ qrcode-terminal fehlt (npm i qrcode-terminal). Roher QR-String:');
        console.log('  ' + qr + '\n');
      }
    }

    if (connection === 'open') {
      connected = true;
      log('✅ WhatsApp verbunden als Session „' + SESSION_NAME + '"');
      await applyProfile();
    }

    if (connection === 'close') {
      connected = false;
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode : 0;
      const loggedOut = DisconnectReason && DisconnectReason.loggedOut;
      if (code === loggedOut) {
        log('🚪 Abgemeldet. Die Session in data/wa-auth ist tot.');
        log('   WhatsApp → Verknüpfte Geräte → dieses Gerät entfernen, dann neu starten.');
        process.exit(1);
      }
      log('🔄 Verbindung weg (Code ' + code + ') — neuer Versuch in 3 s');
      setTimeout(() => startWhatsApp().catch((e) => log('Start-Fehler:', e.message)), 3000);
    }
  });

  return sock;
}

/**
 * Profil setzen: Name, Info-Text, Bild.
 * Wenn WhatsApp eine Funktion nicht (mehr) anbietet, wird das gesagt — nicht
 * verschwiegen. Ein „hat geklappt" ohne Prüfung wäre gelogen.
 */
async function applyProfile() {
  if (!sock) return;
  const results = [];

  try {
    await sock.updateProfileStatus(PROFILE.about);
    results.push('✅ Info-Text: ' + PROFILE.about);
  } catch (e) { results.push('⚠️ Info-Text nicht gesetzt: ' + e.message.slice(0, 60)); }

  try {
    await sock.updateProfileName(PROFILE.name);
    results.push('✅ Name: ' + PROFILE.name);
  } catch (e) { results.push('⚠️ Name nicht gesetzt: ' + e.message.slice(0, 60)); }

  try {
    if (fs.existsSync(PROFILE.picture)) {
      const buf = fs.readFileSync(PROFILE.picture);
      const me = sock.user && sock.user.id ? sock.user.id : null;
      if (me) {
        await sock.updateProfilePicture(me, buf);
        results.push('✅ Profilbild gesetzt (' + Math.round(buf.length / 1024) + ' KB)');
      } else {
        results.push('⚠️ Profilbild: eigene ID noch unbekannt, beim nächsten Start erneut');
      }
    } else {
      results.push('ℹ️ Profilbild übersprungen — ' + PROFILE.picture + ' fehlt');
    }
  } catch (e) { results.push('📷 Bild nicht gesetzt (WhatsApp erlaubt das manchmal nicht): ' + e.message.slice(0, 50)); }

  console.log('\n👤 WhatsApp-Profil:');
  results.forEach((r) => console.log('   ' + r));
  console.log('');
}

/* ---------------- Sendetext ---------------- */

function codeText(code, minutes) {
  return [
    'Dein MaxiChen Code: *' + code + '*',
    '',
    'Teile diesen Code niemals. MaxiChen fragt dich nie danach.',
    'Gültig für ' + minutes + ' Minuten.',
    '',
    '— Team MaxiChen',
  ].join('\n');
}

async function sendCode(phone, code, minutes) {
  const jid = toWaJid(phone);
  if (!jid) throw new Error('Ungültige Nummer');
  if (SIMULATE) return simulateSend(jid, codeText(code, minutes));
  if (!sock || !connected) throw new Error('WhatsApp nicht verbunden — QR in pair.js scannen');
  const res = await sock.sendMessage(jid, { text: codeText(code, minutes) });
  sent++;
  return { ok: true, id: res && res.key ? res.key.id : null, to: jid };
}

/* ---------------- HTTP-Schnittstelle (nur localhost) ---------------- */

function readBody(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('zu groß')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('kein JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  // Doppelte Absicherung: nicht nur 127.0.0.1-Binding, sondern auch Remote-IP prüfen
  const remote = req.socket.remoteAddress || '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
    return send(403, { error: 'nur lokal' });
  }

  if (req.method === 'GET' && req.url === '/health') {
    return send(200, {
      ok: true, session: SESSION_NAME, connected, simulate: SIMULATE,
      qrPending: !!lastQr && !connected, sent, failed,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    });
  }

  const auth = String(req.headers.authorization || '');
  if (auth !== 'Bearer ' + TOKEN) return send(401, { error: 'Token falsch' });

  if (req.method === 'POST' && req.url === '/internal/send-code') {
    let body;
    try { body = await readBody(req); } catch (e) { return send(400, { error: e.message }); }
    const phone = String(body.phone || '');
    const code = String(body.code || '');
    const minutes = Number(body.minutes || 5);
    if (!/^\d{6}$/.test(code)) return send(400, { error: 'Code muss 6 Ziffern haben' });
    if (!toWaJid(phone)) return send(400, { error: 'Nummer ungültig' });
    try {
      const r = await sendCode(phone, code, minutes);
      log('📤 Code an +' + String(phone).replace(/[^\d]/g, '') + ' raus');
      return send(200, r);
    } catch (e) {
      failed++;
      log('❌ Senden fehlgeschlagen:', e.message);
      return send(502, { error: e.message });
    }
  }

  if (req.method === 'POST' && req.url === '/internal/profile') {
    return send(200, { ok: true, applied: await applyProfile().then(() => true).catch(() => false) });
  }

  send(404, { error: 'unbekannt' });
});

/* ---------------- Start ---------------- */

if (SIMULATE) {
  log('🧪 SIMULATIONS-MODUS (WA_SIMULATE=1) — nichts geht an WhatsApp');
  log('   Nachrichten landen in data/wa-outbox.jsonl');
  server.listen(PORT, HOST, () => log('🌐 pair.js hört auf http://' + HOST + ':' + PORT));
} else {
  server.listen(PORT, HOST, () => log('🌐 pair.js hört auf http://' + HOST + ':' + PORT));
  startWhatsApp().catch((e) => {
    log('❌ WhatsApp-Start fehlgeschlagen:', e.message);
    log('   npm install @whiskeysockets/baileys qrcode-terminal');
    log('   Der HTTP-Teil läuft weiter, /health sagt connected:false');
  });
}

process.on('SIGINT', () => { log('👋 pair.js beendet'); process.exit(0); });

module.exports = { toWaJid, codeText, PROFILE, SESSION_NAME };
