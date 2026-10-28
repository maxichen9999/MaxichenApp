'use strict';
/**
 * 💗 LoveChat Server
 * Dein eigener pinker Messenger — by maxi⁹¹⁰
 *
 * Start:        node server.js
 * Port:         PORT=7777 (Standard)  →  http://localhost:7777
 * Daten:        data/database.json
 * Web + PWA:    client/  (installierbar auf Android & iOS)
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { createModeration, ROLE_LABELS } = require('./moderation');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const contents = fs.readFileSync(file, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    let value = match[2].trim();
    if (value.length >= 2 && ((value[0] === '"' && value[value.length - 1] === '"')
      || (value[0] === "'" && value[value.length - 1] === "'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', 'owner', 'credentials.env'));
loadEnvFile(path.join(__dirname, '.env'));

const PORT = parseInt(process.env.PORT || '7777', 10);
const HOST = '0.0.0.0';
/* client/ liegt eine Ebene über server/ (Projektstruktur Lovechat/client) */
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

const MAX_MSG = 4000;
const MAX_IMAGE = 700 * 1024; // data-URL Größe (Bytes)
const MAX_AVATAR = 300 * 1024;
const PAGE_SIZE = 50;
const THEME_IDS = [
  // Web-Themes
  'pink-dream', 'lila-nacht', 'pastell', 'neon', 'sternen', 'rosen', 'kawaii', 'midnight',
  // V2-App-Wallpaper (8 Stück)
  'neon-dream', 'sakura', 'ocean', 'forest', 'sunset', 'galaxy', 'mono', 'candy',
];

/* ================= Datenbank ================= */
let db = { users: {}, tokens: {}, chats: {}, messages: {}, seq: 1 };
let saveTimer = null;

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = Object.assign(db, d);
    }
  } catch (e) {
    console.error('⚠️  Datenbank konnte nicht geladen werden:', e.message);
  }
  for (const k of ['users', 'tokens', 'chats', 'messages']) if (!db[k] || typeof db[k] !== 'object') db[k] = {};
}

function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DB_FILE);
    } catch (e) {
      console.error('⚠️  Datenbank-Speichern fehlgeschlagen:', e.message);
    }
  }, 60);
}

function nextId(prefix) {
  return prefix + crypto.randomBytes(6).toString('hex');
}

/* ================= Helfer ================= */
function hashPassword(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 64).toString('hex');
}

const onlineUsers = new Set();

/* 👑 V4.29 — eine Wahrheit für „ist VIP?": Modul vip.js entscheidet anhand
 * der Telefonnummer. Hier nur ein dünner Wrapper, damit publicUser nicht
 * bei jedem Aufruf neu lädt. */
function isVipAnywhere(u) {
  try {
    if (globalThis.__LC_VIP && typeof globalThis.__LC_VIP.isVip === 'function') return globalThis.__LC_VIP.isVip(u);
  } catch (e) {}
  return !!(u && u.vip && (!u.vipUntil || u.vipUntil > Date.now()));
}

function publicUser(u, extra = {}) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio || '',
    avatar: u.avatar || '',
    phone: u.phone || '',
    lastSeen: u.lastSeen || 0,
    online: onlineUsers.has(u.id),
    role: MOD.roleOf(u),
    owner: MOD.isOwner(u),
    roleLabel: ROLE_LABELS[MOD.roleOf(u)] || 'Benutzer',
    // 👑 V4.19/V4.29 — VIP-Status: Nummer zuerst, dann Einlösecode
    vip: isVipAnywhere(u),
    vipUntil: u.vipUntil || null,
    // ✅ V4.22 — die KI ist als KI erkennbar, nicht als Mensch verkleidet
    isAI: !!u.isAI,
    // ✅ V4.29 — Haken auch im Nutzerobjekt (vorher stand er nur im Badge)
    verified: u.verified === true || MOD.isOwner(u),
    phoneVerified: u.phoneVerified !== false,
    signature: u.signature || null,
    ...extra,
  };
}

function otherUser(chat, uid) {
  if (chat.type !== 'private') return null;
  const other = chat.memberIds.find((id) => id !== uid);
  return other ? db.users[other] || null : null;
}

function privateName(chat, uid) {
  const o = otherUser(chat, uid);
  return o ? o.displayName : 'Chat gelöscht';
}
function privateAvatar(chat, uid) {
  const o = otherUser(chat, uid);
  return o ? o.avatar || '💗' : '💬';
}

function senderName(uid, chat, m) {
  if (chat.type === 'private') return m.senderId === uid ? 'Du' : (db.users[m.senderId] || {}).displayName || '?';
  const u = db.users[m.senderId];
  return u ? u.displayName : 'Entferntes Mitglied';
}

function lastMessage(chatId) {
  const arr = db.messages[chatId] || [];
  return arr.length ? arr[arr.length - 1] : null;
}

function chatSummary(uid, chat) {
  const msgs = db.messages[chat.id] || [];
  let unread = 0;
  let last = null;
  for (const m of msgs) {
    if (!m.readBy.includes(uid)) unread++;
    last = m;
  }
  const me = db.users[uid] || {};
  const override = me.bg && me.bg.overrides && me.bg.overrides[chat.id];
  return {
    id: chat.id,
    type: chat.type,
    name: chat.type === 'private' ? privateName(chat, uid) : chat.name,
    avatar: chat.type === 'private' ? privateAvatar(chat, uid) : chat.avatar || '💬',
    // 🖼️ V4.31 — Titelbild eines Kanals (WhatsApp: Kanal-Header)
    banner: chat.banner || null,
    description: chat.description || '',
    ownerId: chat.ownerId,
    // 👑 V4.21: Rechte und Ankündigungsmodus müssen in der Chatliste stehen,
    // sonst kann die Oberfläche keine Knöpfe zeigen, ohne extra nachzufragen.
    adminIds: chat.adminIds || [],
    myRole: chat.ownerId === uid ? 'owner' : (chat.adminIds || []).includes(uid) ? 'admin' : 'member',
    announce: !!chat.announce,
    communityId: chat.communityId || null,
    members: chat.memberIds,
    count: chat.memberIds.length,
    unread,
    bg: override || null,
    wallpaper: (chat.wallpaperByUser && chat.wallpaperByUser[uid]) || chat.wallpaper || null,
    autoDelete: chat.autoDelete || 0,
    mutedUntil: (chat.mutedByUser && chat.mutedByUser[uid]) || 0,
    archived: !!(chat.archivedByUser && chat.archivedByUser[uid]),
    pinned: (msgs.filter((m) => m.pinned && !m.deleted).slice(-1)[0] || null)
      ? { id: msgs.filter((m) => m.pinned && !m.deleted).slice(-1)[0].id,
          text: (msgs.filter((m) => m.pinned && !m.deleted).slice(-1)[0].text || '').slice(0, 100),
          senderName: senderName(uid, chat, msgs.filter((m) => m.pinned && !m.deleted).slice(-1)[0]) }
      : null,
    last: last
      ? {
          text: last.text,
          image: !!last.image,
          senderId: last.senderId,
          senderName: senderName(uid, chat, last),
          createdAt: last.createdAt,
        }
      : null,
  };
}

function msgPublic(m) {
  return SEC.publicMsg({
    id: m.id,
    senderId: m.senderId,
    text: m.text || '',
    image: m.image || null,
    createdAt: m.createdAt,
    reactions: m.reactions || {},
    readBy: m.readBy || [],
    replyTo: m.replyTo || null,
    editedAt: m.editedAt || null,
    deleted: !!m.deleted,
    kind: m.kind || (m.image ? 'photo' : 'text'),
    bot: !!m.bot,
    scheduled: !!m.scheduled,
    attachment: m.attachment || null,
    enc: m.enc || null,
    secureDeleted: !!m.secureDeleted,
    mediaWipedAt: m.mediaWipedAt || null,
    pinned: !!m.pinned,
    forwarded: !!m.forwarded,
    forwardedFrom: m.forwardedFrom || null,
    // 🚦 V4.30 — „oft weitergeleitet"-Label (dieselbe Nachricht ≥ 5×)
    repeated: m.repeated || 0,
    spamLabel: !!m.spamLabel,
  });
}

function isChatAdmin(user, chat) {
  return chat.ownerId === user.id || (chat.adminIds || []).includes(user.id);
}

function findPrivateChat(a, b) {
  return Object.values(db.chats).find(
    (c) => c.type === 'private' && c.memberIds.length === 2 && c.memberIds.includes(a) && c.memberIds.includes(b)
  );
}

/* 🤖 LoveBot — einziger zugelassener Bot der Plattform */
function ensureLoveBot() {
  let bot = Object.values(db.users).find((u) => u.isBot && u.botType === 'lovebot');
  if (bot) return bot;
  const salt = crypto.randomBytes(16).toString('hex');
  bot = {
    id: nextId('u_'),
    username: 'lovebot',
    displayName: 'LoveBot 🤖',
    bio: 'Der offizielle Bot von MaxiChat 💗 Befehle: /help',
    avatar: '/assets/lovechen-avatar.png',
    phone: '',
    email: '',
    salt,
    pass: hashPassword(crypto.randomBytes(24).toString('hex'), salt),
    createdAt: Date.now(),
    lastSeen: Date.now(),
    isBot: true,
    botType: 'lovebot',
    role: 'user',
    bg: { default: 'lila-nacht' },
  };
  db.users[bot.id] = bot;
  saveDb();
  console.log('🤖 LoveBot angelegt:', bot.id);

  /* 🔴 V4.29 — Hier fehlte etwas: Wird der Bot ERST NACH dem Serverstart
   * angelegt (weil die Datenbank leer war und der erste Nutzer sich gerade
   * anmeldet), bekam er nie sein 2FA-Secret. V422.boot() läuft nur einmal
   * beim Start — der Haken der KI blieb dadurch dauerhaft aus.
   * Deshalb: 2FA + KI-Identität direkt hier nachziehen. */
  try {
    const V = globalThis.__LC_V422;
    if (V) {
      if (typeof V.provisionTwoFactor === 'function') V.provisionTwoFactor(bot, { writeSecretFile: false });
      if (typeof V.ensureKiIdentity === 'function') V.ensureKiIdentity();
    }
  } catch (e) {
    console.error('⚠️  KI-Haken konnte nicht eingerichtet werden:', e.message);
  }
  return bot;
}

function createWelcomeChannel(owner) {
  const chat = {
    id: nextId('c_'),
    type: 'channel',
    name: 'Willkommen bei LoveChat 💗',
    description: 'Dein eigener Messenger — pink, süß und von dir gemacht.',
    avatar: '💗',
    ownerId: owner.id,
    adminIds: [owner.id],
    memberIds: [owner.id],
    communityId: null,
    createdAt: Date.now(),
  };
  db.chats[chat.id] = chat;
  db.messages[chat.id] = [
    {
      id: nextId('m_'),
      chatId: chat.id,
      senderId: owner.id,
      text:
        'Willkommen bei LoveChat 💗\n\nDas ist deine eigene Messenger-App — wie WhatsApp, nur pinker und von dir gemacht. 💜\n\nSo geht’s weiter:\n1️⃣  Tippe unten rechts auf „+“\n2️⃣  Wähle „Private Nachricht“, „Gruppe“, „Community“ oder „Kanal“\n3️⃣  Lade Freunde ein (über @Benutzername)\n4️⃣  Tippe oben auf den Chat → ⋮ und änder den Hintergrund 🎀\n\nTräume groß, gib niemals auf und bleib immer du selbst. ✨',
      image: null,
      createdAt: Date.now(),
      reactions: {},
      readBy: [owner.id],
    },
  ];
  return chat;
}

/* ================= Express Setup ================= */
/* ================= Moderation & Owner ================= */
function closeUserSockets(uid, message) {
  try {
    const set = wsByUser.get(uid);
    if (!set) return;
    for (const ws of [...set]) {
      try {
        const u = db.users[uid];
        const b = u ? MOD.activeAccountBan(u) : null;
        safeSend(ws, { type: 'account:blocked', message: message || 'Konto gesperrt', ban: MOD.banPublic(b) });
      } catch (e) {}
      try { ws.close(4003, 'banned'); } catch (e) {}
    }
    wsByUser.delete(uid);
  } catch (e) {}
}

/**
 * 🔧 V4.12: nur die Sockets EINES Geräts schließen.
 * `closeUserSockets` macht alle zu — richtig bei Sperre, falsch beim
 * Abmelden eines einzelnen Geräts (man würde sich selbst mit rauswerfen).
 */
function closeTokenSockets(token, message) {
  try {
    for (const [uid, set] of wsByUser) {
      for (const ws of [...set]) {
        if (ws.authToken !== token) continue;
        try { safeSend(ws, { type: 'session:revoked', message: message || 'Auf diesem Gerät abgemeldet.' }); } catch (e) {}
        try { ws.close(4002, 'session revocato'); } catch (e) {}
        try { set.delete(ws); } catch (e) {}
      }
      if (set.size === 0) wsByUser.delete(uid);
    }
  } catch (e) {}
}

const MOD = createModeration({
  dataDir: DATA_DIR,
  db,
  saveDb,
  nextId,
  sendToUser,
  closeUserSockets,
  closeTokenSockets,
  onlineUsers,
});
/* 📌 V4.30 — dieselbe Instanz für alle Module (v428 braucht z. B. die Sperre) */
globalThis.__LC_MOD = MOD;

MOD.loadOwner();
/* 🤖 LoveBot-Account sicherstellen (auch bei bestehender DB) */
try {
  const bot = ensureLoveBot();
  if (bot) console.log('🤖 LoveBot bereit:', bot.displayName);
} catch (e) { console.error('LoveBot-Init:', e.message); }

const app = express();
app.disable('x-powered-by');
// 🛡️ V4.12: Sicherheits-Header VOR allem anderen — jede Antwort bekommt sie
{
  const { securityHeaders } = require('./security-headers');
  app.use(securityHeaders());
  console.log('🛡️ Security-Header aktiv (CSP, HSTS, nosniff, frame-ancestors none)');
}
/* 🔴 V4.27 — GEMESSEN: hier stand `limit: '10mb'` für ALLES. Damit war das
   in v427.js angekündigte Dateilimit (25 MB) eine Lüge: express wies schon
   bei 10 MB ab — mit einem nackten PayloadTooLargeError und ohne `code`.
   Test D2/D3 hat es aufgedeckt.
   Jetzt: zwei Parser. Der Upload-Pfad bekommt eine eigene, größere Grenze
   (Base64 bläht um 33 % auf: 15 MB Datei = 20 MB JSON, 40 MB VIP = 53 MB),
   alles andere bleibt bei 10 MB. Die Grenze steht in v427.js als
   LIMIT.normal / LIMIT.vip — hier nur der Transport. */
const jsonStrict = express.json({
  limit: '10mb',
  // Roh-Bytes aufheben: die App-Signatur (V4.20) muss über EXAKT den
  // Text geprüft werden, den der Client signiert hat. Über das geparste
  // Objekt zu gehen würde bei Leerzeichen/Reihenfolge scheitern.
  verify: (req, res, buf) => { if (buf && buf.length) req.rawBody = buf.toString('utf8'); },
});
// 60 MB Transportgrenze = 40 MB Datei (VIP) + 33 % Base64 + Luft
const jsonUpload = express.json({
  limit: '60mb',
  verify: (req, res, buf) => { if (buf && buf.length) req.rawBody = buf.toString('utf8'); },
});
app.use((req, res, next) => {
  const p = req.path || '';
  if (p.startsWith('/api/v427/media')) return jsonUpload(req, res, next);
  return jsonStrict(req, res, next);
});

/* ✨ LoveAI — KI-Chat (nach der App-Erstellung!) */
{
  const { createLoveAI } = require('./loveai');
  createLoveAI(app, h);
}

/* 🚀 LoveChat V3 MAX — Wallpaper, 2FA, Sessions, Export, Auto-Delete */
{
  const { createV3 } = require('./v3');
  createV3(app, h, {
    db,
    saveDb,
    nextId,
    auth,
    getChatOr404,
    isChatAdmin,
    sendToChat,
    sendToUser,
    chatSummary,
    MOD,
    onlineUsers,
    checkPassword: (user, pw) => user.pass === hashPassword(pw, user.salt),
  });
  console.log('🚀 V4 aktiv — Momente · Umfragen · Planung · Blocken · LoveBot');
}

/* 🚀 LoveChat V4 „MaxiChat" — Momente, Umfragen, Planung, Blocken, LoveBot */
{
  const { createV4 } = require('./v4');
  createV4(app, h, {
    db,
    saveDb,
    nextId,
    auth,
    getChatOr404,
    isChatAdmin,
    sendToChat,
    sendToUser,
    chatSummary,
    MOD,
    onlineUsers,
    checkPassword: (user, pw) => user.pass === hashPassword(pw, user.salt),
  });
}

/* 🎨 V4.19 „Persönlich" — Hintergründe (3 Ebenen), 30 Töne, Sticker, VIP */
const V419 = (() => {
  const { createV419 } = require('./v419');
  return createV419(app, h, {
    db, saveDb, auth, chatSummary, sendToUser, nextId,
    publicUser, onlineUsers,
  });
})();

/* 📥 V4.20 „Verteilen" — Downloads mit echten Hashes, Range-Support */
/* 🛡️ V4.20-SEC — App-Signatur (X-App-Signature), Pins, ehrlicher Status.
 *    Steht VOR V420: die Signatur-Middleware hängt sich an /api/downloads,
 *    und Express arbeitet Middleware in Registrier-Reihenfolge ab. Andersherum
 *    würden die Download-Routen zuerst antworten und die Prüfung nie laufen —
 *    genau das war im ersten Anlauf der Fall (alle Anfragen kamen mit 200 durch). */
const V420SEC = (() => {
  const { createV420Sec } = require('./v420sec');
  return createV420Sec(app, h, {});
})();

const V420 = (() => {
  const { createV420 } = require('./v420');
  return createV420(app, h, { CLIENT_DIR, rateLimit });
})();

/* 📢 V4.25 — Offizieller Lovechen Kanal: verifiziert (ECDSA), nur Inhaber
 *    schreibt, 6 WhatsApp-Reaktionen, Folgen/Entfolgen, Löschen für alle.
 *    Braucht isChatAdmin/msgPublic/publicUser → steht nach den Basis-Routen. */
const V425 = (() => {
  const { createV425 } = require('./v425');
  const inst = createV425(app, h, { db, saveDb, auth, isChatAdmin, msgPublic, publicUser, nextId, hashPassword });
  /* 🔧 V4.31 — v428 muss den offiziellen Kanal anlegen können, sobald sich
   * der Inhaber anmeldet. `const` oben ist für spätere Module erreichbar,
   * für v428 (lädt früher) braucht es diesen Halter. */
  globalThis.__LC_V425 = inst;
  return inst;
})();

/* 👑 V4.21 Block C — Kick, Verwalter, Beschreibung, Ankündigungen,
 *    Chat-Einladungslinks, Communities. Steht NACH den Basis-Routen,
 *    weil es dieselben Pfade nur ergänzt (PUT/DELETE auf /api/chats/:id). */
/* ✅ V4.22 — Verifiziert (Inhaber) + KI-Kennzeichnung (Lovechen).
 *    Muss VOR V421/V420 stehen? Nein — eigene Pfade (/api/verify/*),
 *    Reihenfolge ist hier egal. Steht aber nach badges.js, weil es
 *    dessen 2FA-Prüfung korrigiert. */
const V422 = (() => {
  const { createV422 } = require('./v422');
  return createV422(app, h, { db, saveDb, auth, OWNER_DIR: path.join(__dirname, '..', 'owner') });
})();

/* 🧭 V4.23 — Anruf-Verlauf, Kanäle, /api/home für die vier Tabs. */
const V423 = (() => {
  const { createV423 } = require('./v423');
  return createV423(app, h, { db, saveDb, auth });
})();

const V421 = (() => {
  const { createV421 } = require('./v421');
  return createV421(app, h, {
    db, saveDb, nextId, auth, getChatOr404, sendToChat, sendToUser,
    chatSummary, publicUser, msgPublic,
  });
})();

/* 🔒🎵 V4.26 — Sicherheit (AES-Backup, Sicherheitscode, App-Sperre,
 *    Datenschutz-Erweiterung) + 10 neue Töne (40 gesamt). */
const V426 = (() => {
  const { createV426 } = require('./v426');
  return createV426(app, h, { db, saveDb, auth });
})();

/* 🖼️ V4.27 — Medien-Upload nach data/media/ statt Base64 in die DB,
 *    Medien-Galerie pro Chat, GIF-Katalog, Speicher-Übersicht. */
const V427 = (() => {
  const { createV427 } = require('./v427');
  return createV427(app, h, { db, saveDb, auth });
})();

/* 👑 V4.29 — VIP anhand der Telefonnummer.
 *    Muss VOR V419/V418 usw. stehen, weil publicUser() (oben) darauf
 *    zugreift und die Sticker-/Sound-Routen dieselbe Wahrheit nutzen. */
const VIP = (() => {
  const { createVip } = require('./vip');
  const inst = createVip(app, h, { db, saveDb, auth, isOwner: (u) => MOD.isOwner(u) });
  globalThis.__LC_VIP = inst;
  return inst;
})();

/* 📱 V4.28 — Anmeldung wie WhatsApp: Startbildschirm → Nummer → Code →
 *    Name + Profilbild → drin. Dazu der fünfte Reiter „Profil". */
const V428 = (() => {
  const { createV428 } = require('./v428');
  const inst = createV428(app, h, {
    db, saveDb, auth, nextId, publicUser, hashPassword,
    ensureLoveBot, createWelcomeChannel,
  });
  // ⚠️ Kein Zugriff auf `V428instance` (steht weiter unten als `let` und ist
  //    hier noch in der „temporal dead zone"). Stattdessen ein globaler Halter.
  globalThis.__LC_V428 = inst;
  return inst;
})();

/* 🛡️ V4.30 — Konto löschen · 20 Nachrichten/Minute · 5 Gruppen/Stunde ·
 *    Spam-Erkennung · Melden mit den letzten 5 Nachrichten. */
const V430 = (() => {
  const { createV430 } = require('./v430');
  const inst = createV430(app, h, { db, saveDb, auth, nextId, publicUser });
  globalThis.__LC_V430 = inst;
  return inst;
})();

/* 🔍 V4.31 — Nachrichten durchsuchen + „Gemerkt" (Sternchen). */
const V431 = (() => {
  const { createV431 } = require('./v431');
  const inst = createV431(app, h, { db, saveDb, auth, chatSummary });
  globalThis.__LC_V431 = inst;
  return inst;
})();

/* 🤖 V4.32 — Lovechen mit Befehlen (/ping, /help, /würfel, /rechne …). */
const V432 = (() => {
  const { createV432 } = require('./v432');
  const inst = createV432(app, h, { db, saveDb, auth, nextId });
  globalThis.__LC_V432 = inst;
  return inst;
})();

/* Wird von den Routen weiter unten gerufen (die stehen VOR diesem Modul,
 * deshalb der Umweg über globalThis statt über eine Variable). */
function V430gate(user, text) {
  const V = globalThis.__LC_V430;
  if (!V) return { block: false, spamLabel: false, repeated: 0 };
  const lim = V.canSend(user);
  if (!lim.ok) {
    return {
      block: true, status: 429,
      body: {
        error: 'Zu viele Nachrichten auf einmal — warte kurz 💗 (höchstens 20 pro Minute)',
        code: 'too_fast',
        retryAfterMs: lim.retryAfterMs,
      },
    };
  }
  const sp = V.checkSpam(user, text);
  if (sp.blocked) {
    return {
      block: true, status: 429,
      body: {
        error: 'Dieselbe Nachricht zu oft — eine Minute Pause 💗',
        code: 'spam',
        retryAfterMs: sp.retryAfterMs,
      },
    };
  }
  return { block: false, spamLabel: !!sp.label, repeated: sp.repeated || 0 };
}

function V430groupGate(user) {
  const V = globalThis.__LC_V430;
  if (!V) return null;
  const lim = V.canCreateGroup(user);
  if (lim.ok) return null;
  return {
    error: 'Zu viele Gruppen auf einmal — höchstens 5 pro Stunde 💗',
    code: 'group_too_fast',
    retryAfterMs: lim.retryAfterMs,
  };
}

/* 🛡️ V4.3/V4.4 „Shield" — Sicherheits-Center, Privat-Modus, Einmal-Medien, Login-Schutz, Secure-Delete */
const SEC = (() => {
  const { createSecurity } = require('./security');
  return createSecurity(app, h, {
    db, saveDb, nextId, auth, sendToUser, chatSummary, MOD,
    dbFile: DB_FILE, publicUser, msgPublic, rateLimit, nextId,
  });
})();

/* 👥 V4.4 — Multi-Account (max 5) · UNIQUE phone · SMS-Code */
const ACCOUNTS = (() => {
  const { createAccounts } = require('./accounts');
  return createAccounts(app, h, {
    db, saveDb, nextId, auth, sendToUser, chatSummary, MOD, publicUser, makeToken,
    rateLimit, dbFile: DB_FILE, hashPassword,
    get checkPassword() { return (user, pw) => user.pass === hashPassword(pw, user.salt); },
  });
})();

/* 🔐 V4.4 — E2E-Vorbereitung (X3DH-Keys, Ciphertext-Umschläge) */
const E2E = (() => {
  const { createE2E } = require('./e2e');
  return createE2E(app, h, {
    db, saveDb, nextId, auth, sendToUser, getChatOr404, isChatAdmin, msgPublic,
  });
})();

/* 🔥 V4.7 — TURN-Credentials für Anrufe hinter NAT/Firewalls */
const TURN = (() => {
  const { createTurn } = require('./turn');
  return createTurn(app, h, { auth, rateLimit });
})();

/* ✅ V4.12 — verifizierte Haken (server-signiert, App prüft) */
const BADGES = (() => {
  const { createBadges } = require('./badges');
  return createBadges(app, h, { db, saveDb, auth });
})();

/* 🔢 V4.12 — TOTP-2FA + Recovery-Codes */
const TWOFA = (() => {
  const { createTwoFa } = require('./twofa');
  return createTwoFa(app, h, {
    db, saveDb, auth,
    checkPassword: (user, pw) => user.pass === hashPassword(pw, user.salt),
  });
})();

/* ✨ V4.4 — Standort live · Transkription · Gruppen-Calls · Einladungen · Backup · Themes */
const EXTRAS = (() => {
  const { createExtras } = require('./extras');
  return createExtras(app, h, {
    db, saveDb, nextId, auth, getChatOr404, isChatAdmin, chatSummary, sendToUser, MOD, onlineUsers,
  });
})();

function h(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((e) => {
      console.error('❌', req.method, req.path, e);
      if (!res.headersSent) res.status(500).json({ error: 'Interner Fehler. Versuch es noch mal 💗' });
    });
  };
}

function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : req.query.token || '';
  const uid = db.tokens[token];
  if (!uid || !db.users[uid]) return res.status(401).json({ error: 'Nicht angemeldet' });
  req.user = db.users[uid];
  req.token = token;
  // 👀 V4.12: lastSeen pflegen, aber höchstens alle 60 s schreiben
  try {
    db.tokenMeta = db.tokenMeta || {};
    const m = db.tokenMeta[token] || (db.tokenMeta[token] = { createdAt: Date.now(), device: '🌐 Gerät' });
    if (!m.device || m.device === '🌐 Gerät') {
      const ua = String(req.headers['user-agent'] || '');
      m.device = /okhttp|MaxiChat/i.test(ua) ? '📱 MaxiChat-App'
        : /Android/i.test(ua) ? '📱 Android' : /iPhone|iPad/i.test(ua) ? '📱 iPhone'
        : /Windows/i.test(ua) ? '💻 Windows' : /Mac/i.test(ua) ? '💻 Mac' : '🌐 Browser';
    }
    if (!m.lastSeen || Date.now() - m.lastSeen > 60000) m.lastSeen = Date.now();
  } catch (e) {}
  // 💤 V4: selbst deaktiviertes Konto
  if (req.user.deactivatedUntil && req.user.deactivatedUntil > Date.now()) {
    return res.status(403).json({
      error: 'Dein Konto ist vorübergehend deaktiviert 💤',
      code: 'deactivated',
      until: req.user.deactivatedUntil,
    });
  }
  // 👑 Serverseitige Sperrprüfung bei JEDER geschützten Anfrage
  if (MOD.roleOf(req.user) !== 'owner') {
    const ban = MOD.activeAccountBan(req.user);
    if (ban) {
      try { delete db.tokens[token]; saveDb(); } catch (e) {}
      const pub = MOD.banPublic(ban);
      return res.status(403).json({
        error: MOD.banText(pub),
        code: 'banned',
        ban: pub,
        reason: pub.reason || '',
        until: pub.until || null,
        appealAllowed: true,
      });
    }
  }
  next();
}

/* Simple Rate-Limiting */
const rl = {};
function rateLimit(key, max, ms) {
  const now = Date.now();
  const r = rl[key];
  if (!r || now > r.reset) {
    rl[key] = { count: 1, reset: now + ms };
    return true;
  }
  if (r.count >= max) return false;
  r.count++;
  return true;
}

const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

/* 📱 V4.13 — Anmeldung wie bei WhatsApp (Nummer → WhatsApp-Code → Profil → Mail-Code) */
const SIGNUP = require('./signup')(app, {
  db, saveDb, h, nextId, publicUser, hashPassword,
  normalizePhone: (p) => { try { return require('./accounts').normalizePhone(p); } catch (e) { return String(p || ''); } },
  ipOf, ensureLoveBot, createWelcomeChannel,
});

/* 📱 V4.28 wird weiter unten erzeugt — die Reset-Route oben braucht aber
 * schon einen Weg dorthin. Deshalb über eine Funktion, nicht über die
 * Variable (die wäre hier noch nicht initialisiert). */
const REF428 = () => globalThis.__LC_V428 || null;

/* ================= 🧪 Test-only: Rate-Limits zurücksetzen =================
   NUR aktiv, wenn der Server im Simulations-Modus läuft (MAIL_SIMULATE=1).
   In Produktion existiert diese Route gar nicht — sie wird nicht registriert.
   Zweck: Die Test-Suite ist wiederholbar. Der Limiter zählt in db.rateBuckets
   und speichert dort; ohne diesen Reset fällt der zweite Testlauf mit 429 aus,
   obwohl der Code stimmt.
   Zusätzlich abgesichert durch INTERNAL_TOKEN. */
if (process.env.MAIL_SIMULATE === '1') {
  app.post('/api/dev/reset-limits', (req, res) => {
    const want = process.env.INTERNAL_TOKEN || '';
    const got = String(req.headers['x-internal-token'] || '');
    if (!want || got !== want) return res.status(401).json({ error: 'nein' });
    // ⚠️ Es gibt ZWEI Limiter-Speicher:
    //   1. db.rateBuckets  → signup.js (in der Datenbank, übersteht Neustart)
    //   2. rl              → rateLimit() hier (nur im RAM)
    // Nur einen zu leeren hieß: der andere blockt weiter. Genau das war der Bug.
    const nDb = Object.keys(db.rateBuckets || {}).length;
    const nRam = Object.keys(rl || {}).length;
    db.rateBuckets = {};
    for (const k of Object.keys(rl)) delete rl[k];
    // 📱 V4.28: v428.js hat einen EIGENEN Limiter (BUCKETS, im Modul).
    // Ohne diesen Reset zählt er über Testläufe hinweg weiter und blockt
    // irgendwann alles mit „too_many" — auch bei korrektem Code.
    try {
      const V = (typeof REF428 === 'function') ? REF428() : null;
      if (V && typeof V.resetLimits === 'function') V.resetLimits();
    } catch (e) {}
    // 🎨 V4.19: Auch verbrannte VIP-Codes freigeben, sonst ist der zweite
    // Testlauf rot, obwohl der Code korrekt funktioniert hat.
    const nVip = Object.keys(db.usedVipCodes || {}).length;
    db.usedVipCodes = {};
    // 🛡️ V4.30: Nachrichten-/Gruppen-/Spam-Zähler (20 pro Minute) leeren —
    // sonst blockt der Testlauf sich selbst.
    let n430 = 0;
    try {
      const V = globalThis.__LC_V430;
      if (V && typeof V.resetLimits === 'function') n430 = V.resetLimits();
    } catch (e) {}
    // 🤖 V4.32: Befehls-Zähler von Lovechen (10/Minute) mit leeren
    let n432 = 0;
    try {
      const V = globalThis.__LC_V432;
      if (V && typeof V.resetCounters === 'function') n432 = V.resetCounters();
    } catch (e) {}
    saveDb();
    res.json({
      ok: true,
      cleared: nDb + nRam + nVip + n430 + n432,
      detail: { datenbank: nDb, ram: nRam, vipCodes: nVip, v430: n430, v432: n432 },
    });
  });
  console.log('🧪 Test-Route aktiv: POST /api/dev/reset-limits (nur MAIL_SIMULATE=1)');
}

/* ================= Auth ================= */
app.post(
  '/api/register',
  h(async (req, res) => {
    const body = req.body || {};
    if (!rateLimit('reg:' + ipOf(req), 12, 3600 * 1000)) return res.status(429).json({ error: 'Zu viele Registrierungen — warte ein paar Minuten 💗' });

    const uname = String(body.username || '').trim().toLowerCase();
    const name = String(body.displayName || '').trim();
    const password = String(body.password || '');
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const avatar = typeof body.avatar === 'string' && body.avatar.length <= 8 && !body.avatar.startsWith('data:') ? body.avatar.trim() : '';

    if (!/^[a-z0-9_]{3,20}$/.test(uname)) return res.status(400).json({ error: 'Benutzername: 3–20 Zeichen (Buchstaben, Zahlen, _)' });
    if (Object.values(db.users).some((u) => u.username === uname)) return res.status(409).json({ error: 'Benutzername ist schon vergeben 💔' });
    if (name.length < 2 || name.length > 30) return res.status(400).json({ error: 'Anzeigename: 2–30 Zeichen' });
    if (password.length < 6) return res.status(400).json({ error: 'Passwort: mindestens 6 Zeichen' });
    if (phone && !/^\+?[0-9 /-]{6,20}$/.test(phone)) return res.status(400).json({ error: 'Telefonnummer sieht nicht richtig aus' });
    const normPhone = (() => {
      try { return require('./accounts').normalizePhone(phone); } catch (e) { return phone; }
    })();
    if (phone && Object.values(db.users).some((u) => {
      try { return require('./accounts').normalizePhone(u.phone) === normPhone; } catch (e) { return u.phone === phone; }
    })) {
      return res.status(409).json({
        error: 'Diese Telefonnummer ist schon registriert — nutze „Account hinzufügen" oder logge dich dort ein.',
        code: 'phone_exists',
      });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-Mail sieht nicht richtig aus' });
    if (email && Object.values(db.users).some((u) => u.email === email)) return res.status(409).json({ error: 'Diese E-Mail ist schon registriert' });

    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      id: nextId('u_'),
      username: uname,
      displayName: name,
      bio: '',
      avatar: avatar || '💗',
      phone: normPhone,
      phoneVerified: false,
      email,
      salt,
      pass: hashPassword(password, salt),
      createdAt: Date.now(),
      lastSeen: 0,
      bgSound: true,
      bg: { default: 'pink-dream', overrides: {} },
      role: 'user',
      bans: [],
      warnings: [],
    };
    db.users[user.id] = user;
    const token = crypto.randomBytes(24).toString('hex');
    db.tokens[token] = user.id;
    db.tokenMeta = db.tokenMeta || {};
    db.tokenMeta[token] = { device: '🌐 Neu registriert', createdAt: Date.now(), lastSeen: Date.now(), ip: req.ip || '' };

    let welcome = null;
    const realUsers = Object.values(db.users).filter((u) => !u.isBot).length;
    ensureLoveBot();
    if (realUsers === 1) welcome = createWelcomeChannel(user);

    saveDb();
    console.log('🌸 Neuer Account:', uname + (welcome ? ' (Erster Nutzer → Welcome-Kanal erstellt)' : ''));
    res.json({ token, user: publicUser(user, { email, bg: user.bg }), welcome: welcome ? welcome.id : null });
  })
);

app.post(
  '/api/login',
  h(async (req, res) => {
    const body = req.body || {};
    // grober Flut-Schutz pro IP (der feine 5-Versuche-Schutz läuft über SEC)
    if (!rateLimit('login:' + ipOf(req), 40, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Zu viele Versuche von diesem Gerät — warte 15 Minuten 💗', code: 'login_locked' });
    }

    const login = String(body.login || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!login || !password) return res.status(400).json({ error: 'Bitte Benutzername/Telefon/E-Mail und Passwort eingeben' });

    // 🛡️ Brute-Force-Schutz: 5 Fehlversuche pro Login+IP → 15 Min Pause
    const lock = SEC.checkLock(login);
    if (lock) {
      return res.status(429).json({
        error: 'Zu viele Fehlversuche für dieses Konto 🔒 Warte ' + Math.ceil(lock.remaining / 60) + ' Minuten.',
        code: 'login_locked',
        scope: lock.scope || 'account',
        retryAfter: lock.remaining,
        hint: 'Die Sperre gilt nur für diesen Account — andere Konten im selben WLAN sind nicht betroffen.',
      });
    }

    const user =
      db.users[login] && db.users[login].username === login
        ? db.users[login]
        : Object.values(db.users).find((u) => u.username === login || u.phone === login || u.email === login);
    if (!user || user.pass !== hashPassword(password, user.salt)) {
      const f = SEC.noteFail(login);
      const left = Math.max(0, 5 - f.fails);
      return res.status(401).json({
        error: left > 0
          ? 'Anmeldung fehlgeschlagen — noch ' + left + ' Versuch' + (left === 1 ? '' : 'e') + ' 💔'
          : 'Zu viele Fehlversuche 🔒 Warte 15 Minuten.',
        code: left > 0 ? 'bad_credentials' : 'login_locked',
        attemptsLeft: left,
      });
    }
    SEC.noteOk(login);

    // 💤 selbst deaktiviertes Konto
    if (user.deactivatedUntil && user.deactivatedUntil > Date.now()) {
      return res.status(403).json({
        error: 'Dein Konto ist vorübergehend deaktiviert 💤 Bis ' + new Date(user.deactivatedUntil).toLocaleDateString('de-DE') + '. Du kannst es mit Passwort wieder aktivieren.',
        code: 'deactivated',
        until: user.deactivatedUntil,
      });
    }

    // 🔐 2FA — V4.12: zwei Quellen, beide werden geprueft.
    //    (a) alter Speicher user.twoFactor  (b) neuer Speicher db.twofa  [TOTP-Store]
    const legacy2fa = user.twoFactor && user.twoFactor.enabled;
    const new2fa = db.twofa && db.twofa[user.id] && db.twofa[user.id].enabled;
    if (legacy2fa || new2fa) {
      const code = String(body.totp || '').replace(/\s/g, '');
      if (!code) {
        return res.status(401).json({
          error: 'Gib den 6-stelligen Code aus deiner Authenticator-App ein 🔐',
          code: '2fa_required',
          recoveryAllowed: !!(db.twofa && db.twofa[user.id] && db.twofa[user.id].recovery),
        });
      }
      let ok = false;
      if (legacy2fa) {
        try { ok = require('./v3').verifyTotp(user.twoFactor.secret, code); } catch (e) { ok = false; }
      }
      if (!ok && new2fa) {
        try {
          ok = require('./twofa').verifyTotp(db.twofa[user.id].secret, code);
        } catch (e) { ok = false; }
      }
      // 🎫 Recovery-Code als Notausgang — verbraucht genau einen Code
      let usedRecovery = false;
      if (!ok && new2fa && db.twofa[user.id].recovery) {
        const idx = require('./twofa').matchRecovery(code, db.twofa[user.id].recovery);
        if (idx >= 0) {
          db.twofa[user.id].recovery[idx].used = true;
          usedRecovery = true;
          ok = true;
        }
      }
      if (!ok) {
        return res.status(401).json({ error: 'Code falsch oder abgelaufen 🔐', code: '2fa_invalid' });
      }
      if (new2fa) db.twofa[user.id].lastUsedAt = Date.now();
      if (usedRecovery) {
        const left = db.twofa[user.id].recovery.filter((r) => !r.used).length;
        console.log('🎫 Recovery-Code benutzt von', user.username, '— übrig:', left);
      }
    }

    // 👑 Gesperrte Konten bekommen kein Token
    if (MOD.roleOf(user) !== 'owner') {
      const ban = MOD.activeAccountBan(user);
      if (ban) {
        const pub = MOD.banPublic(ban);
        return res.status(403).json({
          error: MOD.banText(pub),
          code: 'banned',
          ban: pub,
          reason: pub.reason || '',
          until: pub.until || null,
          appealAllowed: true,
        });
      }
    }

    const token = crypto.randomBytes(24).toString('hex');
    db.tokens[token] = user.id;
    db.tokenMeta = db.tokenMeta || {};
    db.tokenMeta[token] = {
      device: /Android/i.test(req.headers['user-agent'] || '') ? '📱 Android'
        : /iPhone|iPad/i.test(req.headers['user-agent'] || '') ? '📱 iOS'
        : /Windows/i.test(req.headers['user-agent'] || '') ? '💻 Windows'
        : /Macintosh/i.test(req.headers['user-agent'] || '') ? '💻 Mac'
        : '🌐 Web',
      createdAt: Date.now(),
      lastSeen: Date.now(),
      ip: req.ip || '',
    };
    user.lastSeen = Date.now();
    // 📜 Login-Verlauf + Warnung bei neuem Gerät
    let loginRec = null;
    try { loginRec = SEC.addLoginHistory(user, req, 'login'); } catch (e) {}
    saveDb();
    res.json({
      token,
      user: publicUser(user, { email: user.email, bg: user.bg, privacy: SEC.privacyOf(user) }),
      newDevice: loginRec ? !!loginRec.newDevice : false,
      device: loginRec ? loginRec.device : '',
    });
  })
);

app.post(
  '/api/logout',
  h(async (req, res) => {
    delete db.tokens[req.token];
    saveDb();
    res.json({ ok: true });
  })
);


/* ================= 👑 Owner & Moderation ================= */

const adminOnly = (minRank) => (req, res, next) => {
  const rank = MOD.rankOf(req.user);
  if (rank < minRank) return res.status(403).json({ error: 'Keine Berechtigung 👑' });
  next();
};

/* 🔒 V4.4 requireOwner — für ALLE Routen, die sperren/stummschalten/Rollen ändern */
const requireOwner = (req, res, next) => {
  if (!MOD.canBan(req.user)) {
    return res.status(403).json({
      error: 'Nur Owner maxichen darf sperren 👑',
      code: 'owner_only',
      yourRole: MOD.roleOf(req.user),
    });
  }
  next();
};

/* 🔒 V4.4 Defense-in-depth:
   Selbst wenn irgendwo versehentlich eine neue Ban-/Mute-/Rollen-Route ohne requireOwner
   gebaut wird, fängt dieser Wächter sie ab (prüft NUR den Pfad, nicht die Route selbst). */
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const p = String(req.path || '').toLowerCase();
  if (!/(^|\/)(ban|bans|permaban|tempban|futureban|groupban|unban|mute|mutes|warn|warnings|role|roles)(\/|$)/.test(p)) return next();
  const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const uid = raw ? db.tokens[raw] : null;
  const u = uid ? db.users[uid] : null;
  if (!u) return next();                    // ohne Login entscheidet später `auth`
  if (!MOD.canBan(u)) {
    return res.status(403).json({
      error: 'Nur Owner maxichen darf sperren 👑',
      code: 'owner_only',
      yourRole: MOD.roleOf(u),
      blockedBy: 'defense-in-depth',
    });
  }
  next();
});

/* 🎫 Token anlegen (überall gleich: Login, Register, Account-Wechsel) */
function makeToken(user, req) {
  const token = crypto.randomBytes(24).toString('hex');
  db.tokens[token] = user.id;
  db.tokenMeta = db.tokenMeta || {};
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  db.tokenMeta[token] = {
    device: /Android/i.test(ua) ? '📱 Android'
      : /iPhone|iPad/i.test(ua) ? '📱 iOS'
      : /Windows/i.test(ua) ? '💻 Windows'
      : /Macintosh/i.test(ua) ? '💻 Mac'
      : '🌐 Web',
    createdAt: Date.now(),
    lastSeen: Date.now(),
    ip: (req && (req.ip || '')) || '',
  };
  return token;
}

/* Owner-Status abfragen */
app.get('/api/owner/status', auth, h(async (req, res) => {
  const canClaimPhone = !!(req.user.phone && req.user.phone.replace(/\s/g, '') === MOD.ownerCfg.phone.replace(/\s/g, ''));
  const canClaimEmail = !!(req.user.email && String(req.user.email).toLowerCase() === MOD.ownerCfg.email.toLowerCase());
  const info = MOD.ownerInfo();
  // Volle Kontaktdaten nur für das Konto, das sie schon hat
  if (canClaimPhone) info.phoneHint = info.phoneFull;
  if (canClaimEmail) info.emailHint = info.emailFull;
  delete info.phoneFull;
  delete info.emailFull;
  res.json({
    owner: info,
    me: { role: MOD.roleOf(req.user), isOwner: MOD.isOwner(req.user) },
    canClaimPhone,
    canClaimEmail,
  });
}));

/* Owner einmalig einrichten (Setup-Code nötig) */
app.post('/api/owner/claim', auth, h(async (req, res) => {
  const key = String((req.body || {}).setupKey || '').trim();
  const r = MOD.claimOwner(req.user, key);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true, user: publicUser(req.user, { email: req.user.email, bg: req.user.bg }) });
}));

/* Eigene Sperre / Warnungen / Einspruch */
app.get('/api/moderation/me', auth, h(async (req, res) => {
  const u = req.user;
  MOD.refreshBans(u);
  const all = (u.bans || []).slice().sort((a, b) => b.at - a.at).slice(0, 20);
  res.json({
    warnings: (u.warnings || []).slice(-20),
    bans: all.map((b) => ({ ...MOD.banPublic(b), revoked: !!b.revoked, revokedAt: b.revokedAt || null })),
    appeals: (db.appeals || []).filter((a) => a.userId === u.id).slice(-10),
  });
}));

/* Einspruch einlegen (auch ohne gültiges Token möglich) */
app.post('/api/appeal', h(async (req, res) => {
  if (!rateLimit('appeal:' + ipOf(req), 3, 3600 * 1000)) return res.status(429).json({ error: 'Zu viele Einsprüche — versuch es später nochmal 💗' });
  const b = req.body || {};
  const login = String(b.login || '').trim().toLowerCase();
  const password = String(b.password || '');
  const text = String(b.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Bitte schreib kurz, warum du wieder rein möchtest' });
  /* 📞 V4.30 — Wer sich mit NUMMER anmeldet (V4.28-Weg), hat kein Passwort.
   * Vorher konnte genau dieser Mensch keinen Einspruch einlegen: der
   * Ban-Screen verlangte eins. Jetzt reicht die bestätigte Nummer. */
  const norm = (p) => { try { return require('./accounts').normalizePhone(p); } catch (e) { return String(p || ''); } };
  const looksLikePhone = /^\+?\d[\d /-]{6,18}$/.test(login);
  let user = null;
  if (looksLikePhone) {
    user = Object.values(db.users).find((u) => u.phone && norm(u.phone) === norm(login) && u.phoneVerified !== false) || null;
    if (!user) return res.status(401).json({ error: 'Zu dieser Nummer gibt es kein Konto' });
  } else {
    user = Object.values(db.users).find((u) => u.username === login || (u.email && u.email === login)) || null;
    if (!user || user.pass !== hashPassword(password, user.salt)) return res.status(401).json({ error: 'Anmeldung fehlgeschlagen' });
  }
  if (!Array.isArray(db.appeals)) db.appeals = [];
  const appeal = { id: nextId('ap_'), userId: user.id, username: user.username, text, at: Date.now(), status: 'open', decidedBy: null, decidedAt: null, note: '' };
  db.appeals.push(appeal);
  saveDb();
  MOD.logAction(null, user, 'APPEAL', text);
  for (const staff of Object.values(db.users)) {
    if (MOD.rankOf(staff) >= MOD.RANKS.admin) sendToUser(staff.id, { type: 'appeal:new', appeal: { id: appeal.id, username: user.username, text } });
  }
  res.json({ ok: true, message: 'Einspruch eingegangen 💗 Das Team schaut ihn sich an.' });
}));

/* Admin-Übersicht */
app.get('/api/admin/overview', auth, adminOnly(MOD.RANKS.moderator), h(async (req, res) => {
  const users = Object.values(db.users);
  const now = Date.now();
  const openAppeals = (db.appeals || []).filter((a) => a.status === 'open').length;
  const activeBans = users.filter((u) => !MOD.isOwner(u) && MOD.activeAccountBan(u)).length;
  const muted = users.filter((u) => MOD.activeMute(u)).length;
  const msgCount = Object.values(db.messages).reduce((n, arr) => n + arr.length, 0);
  res.json({
    stats: {
      users: users.length,
      activeBans,
      muted,
      openAppeals,
      messages: msgCount,
      chats: Object.keys(db.chats).length,
      online: onlineUsers.size,
      roleCounts: users.reduce((acc, u) => { const r = MOD.roleOf(u); acc[r] = (acc[r] || 0) + 1; return acc; }, {}),
    },
    me: { role: MOD.roleOf(req.user), rank: MOD.rankOf(req.user), isOwner: MOD.isOwner(req.user) },
    owner: MOD.ownerInfo(),
    roles: Object.entries(ROLE_LABELS).map(([id, label]) => ({ id, label, rank: MOD.RANKS[id] })),
    canPermaban: MOD.isOwner(req.user),
  });
}));

/* Nutzerliste fürs Admin-Panel */
app.get('/api/admin/users', auth, adminOnly(MOD.RANKS.moderator), h(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const filter = String(req.query.filter || 'all');
  const list = Object.values(db.users)
    .filter((u) => {
      if (q && !(u.username.includes(q) || String(u.displayName).toLowerCase().includes(q) || (u.email || '').includes(q) || (u.phone || '').includes(q))) return false;
      const ban = MOD.activeAccountBan(u);
      const mute = MOD.activeMute(u);
      if (filter === 'banned') return !!ban;
      if (filter === 'muted') return !!mute && !ban;
      if (filter === 'staff') return MOD.rankOf(u) >= MOD.RANKS.moderator;
      if (filter === 'warned') return (u.warnings || []).length > 0;
      return true;
    })
    .map((u) => ({
      id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar || '💗',
      email: u.email || '', phone: u.phone || '', online: onlineUsers.has(u.id),
      role: MOD.roleOf(u), roleLabel: ROLE_LABELS[MOD.roleOf(u)] || 'Benutzer',
      owner: MOD.isOwner(u),
      createdAt: u.createdAt || 0, lastSeen: u.lastSeen || 0,
      warnings: (u.warnings || []).length,
      ban: MOD.banPublic(MOD.activeAccountBan(u)),
      mute: MOD.banPublic(MOD.activeMute(u)),
      groups: Object.values(db.chats)
        .filter((c) => c.type !== 'private' && (c.memberIds || []).includes(u.id))
        .map((c) => ({ id: c.id, name: c.name, type: c.type })),
    }))
    .sort((a, b) => (b.ban ? 1 : 0) - (a.ban ? 1 : 0) || b.createdAt - a.createdAt);
  res.json({ users: list, me: { id: req.user.id, role: MOD.roleOf(req.user), rank: MOD.rankOf(req.user), isOwner: MOD.isOwner(req.user) } });
}));

/* Aktion ausführen */
/* 🔒 Sperren & Rollen: NUR der Owner. (V4.2) */
app.post('/api/admin/users/:id/action', auth, adminOnly(MOD.RANKS.moderator), h(async (req, res) => {
  if (!MOD.canBan(req.user)) {
    return res.status(403).json({
      error: 'Nur Owner maxichen darf sperren 👑',
      code: 'owner_only',
      yourRole: MOD.roleOf(req.user),
    });
  }
  const target = db.users[String(req.params.id)];
  if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  const body = req.body || {};
  const action = String(body.action || '');
  if (!MOD.BAN_ACTIONS.includes(action)) return res.status(400).json({ error: 'Unbekannte Aktion' });
  const r = MOD.applyAction(req.user, target, action, body);
  if (r.error) {
    // 🔒 Rechte-Fehler vs. normale Fehler (z. B. „Keine aktive Sperre")
    if (/^Nur Owner/.test(r.error)) {
      return res.status(403).json({ error: r.error, code: 'owner_only', yourRole: MOD.roleOf(req.user) });
    }
    if (/Owner-Konto|Dich selbst|Owner-Status/.test(r.error)) {
      return res.status(403).json({ error: r.error, code: 'protected' });
    }
    return res.status(400).json({ error: r.error, code: 'action_failed' });
  }
  res.json({ ok: true, message: r.message });
}));

/* Protokoll */
app.get('/api/admin/logs', auth, adminOnly(MOD.RANKS.moderator), h(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const action = String(req.query.action || '');
  let logs = (db.moderationLogs || []).slice().reverse();
  if (action) logs = logs.filter((l) => l.action === action);
  res.json({ logs: logs.slice(0, limit) });
}));

/* Einsprüche */
app.get('/api/admin/appeals', auth, adminOnly(MOD.RANKS.moderator), h(async (req, res) => {
  const list = (db.appeals || []).slice().reverse().map((a) => {
    const u = db.users[a.userId];
    return {
      ...a,
      user: u ? { id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar || '💗', ban: MOD.banPublic(MOD.activeAccountBan(u)) } : null,
    };
  });
  res.json({ appeals: list });
}));

app.post('/api/admin/appeals/:id/resolve', auth, adminOnly(MOD.RANKS.moderator), h(async (req, res) => {
  if (!MOD.canBan(req.user)) return res.status(403).json({ error: 'Nur Owner maxichen entscheidet über Einsprüche 👑', code: 'owner_only' });
  const appeal = (db.appeals || []).find((a) => a.id === String(req.params.id));
  if (!appeal) return res.status(404).json({ error: 'Einspruch nicht gefunden' });
  const decision = String((req.body || {}).decision || '');
  if (!['accept', 'deny'].includes(decision)) return res.status(400).json({ error: 'Ungültige Entscheidung' });
  const target = db.users[appeal.userId];
  if (!target) return res.status(404).json({ error: 'Konto existiert nicht mehr' });
  if (decision === 'accept') {
    const r = MOD.applyAction(req.user, target, 'unban', { reason: 'Einspruch angenommen: ' + (req.body.note || '') });
    if (r.error && !/Keine aktive Sperre/.test(r.error)) return res.status(403).json({ error: r.error });
  }
  appeal.status = decision === 'accept' ? 'accepted' : 'denied';
  appeal.decidedBy = req.user.id;
  appeal.decidedByName = req.user.displayName;
  appeal.decidedAt = Date.now();
  appeal.note = String((req.body || {}).note || '').slice(0, 300);
  MOD.logAction(req.user, target, decision === 'accept' ? 'APPEAL:ACCEPT' : 'APPEAL:DENY', appeal.note);
  sendToUser(target.id, { type: 'moderation', action: 'appeal:' + appeal.status, note: appeal.note });
  saveDb();
  res.json({ ok: true, message: decision === 'accept' ? 'Einspruch angenommen — Sperre aufgehoben 💗' : 'Einspruch abgelehnt' });
}));

/* ================= Profil ================= */
app.get(
  '/api/me',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const wantHidden = String(req.query.hidden || '') === '1';
    const hiddenIds = new Set((me.hiddenChats || []));
    const chats = Object.values(db.chats)
      // 📢 V4.25: Kanäle stehen NICHT in der Chat-Liste (wie WhatsApp).
      //    Sie leben im Tab „Aktuelles" — gefolgt oder nicht.
      .filter((c) => c.type !== 'channel')
      .filter((c) => c.memberIds.includes(me.id) && (wantHidden ? hiddenIds.has(c.id) : !hiddenIds.has(c.id)))
      .map((c) => chatSummary(me.id, c))
      .sort((a, b) => (b.last ? b.last.createdAt : 0) - (a.last ? a.last.createdAt : 0));
    res.json({ user: publicUser(me, { email: me.email, bg: me.bg, bio: me.bio || '', privacy: SEC.privacyOf(me), bgSound: me.bgSound !== false, sound: me.sound || 'chime', soundVol: me.soundVol === undefined ? 0.5 : me.soundVol, chatSounds: me.chatSounds || {}, backgrounds: me.backgrounds || {} }), chats });
  })
);

app.put(
  '/api/me',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};

    if (b.displayName !== undefined) {
      const name = String(b.displayName).trim();
      if (name.length < 2 || name.length > 30) return res.status(400).json({ error: 'Anzeigename: 2–30 Zeichen' });
      me.displayName = name;
    }
    if (b.bio !== undefined) {
      const bio = String(b.bio).trim();
      if (bio.length > 120) return res.status(400).json({ error: 'Bio: max. 120 Zeichen' });
      me.bio = bio;
    }
    if (b.avatar !== undefined) {
      const av = String(b.avatar);
      if (av.length > 8 && !(av.startsWith('data:image/') && av.length <= MAX_AVATAR))
        return res.status(400).json({ error: 'Avatar: Emoji oder Bild (max. 300 KB)' });
      me.avatar = av;
    }
    if (b.phone !== undefined) {
      const phone = String(b.phone).trim();
      if (phone && !/^\+?[0-9 /-]{6,20}$/.test(phone)) return res.status(400).json({ error: 'Telefonnummer sieht nicht richtig aus' });
      if (phone && Object.values(db.users).some((u) => u.phone === phone && u.id !== me.id)) return res.status(409).json({ error: 'Nummer schon vergeben' });
      me.phone = phone;
    }
    if (b.email !== undefined) {
      const email = String(b.email).trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-Mail sieht nicht richtig aus' });
      if (email && Object.values(db.users).some((u) => u.email === email && u.id !== me.id)) return res.status(409).json({ error: 'E-Mail schon vergeben' });
      me.email = email;
    }
    if (b.bgTheme !== undefined) {
      if (!THEME_IDS.includes(b.bgTheme)) return res.status(400).json({ error: 'Unbekannter Hintergrund' });
      me.bg.default = b.bgTheme;
    }
    if (b.bgSound !== undefined) me.bgSound = !!b.bgSound;
    // 🔔 V4.18 — Benachrichtigungston + Lautstärke
    if (b.sound !== undefined) {
      // 🎨 V4.19: 30 Töne statt 5 — Liste kommt aus v419.js, damit es nur eine Quelle gibt
      const okSounds = (V419 && V419.SOUNDS) ? V419.SOUNDS.map((s) => s.id) : ['chime', 'pop', 'sparkle', 'soft', 'off'];
      if (!okSounds.includes(String(b.sound))) return res.status(400).json({ error: 'Unbekannter Ton' });
      me.sound = String(b.sound);
    }
    if (b.soundVol !== undefined) me.soundVol = Math.max(0, Math.min(1, Number(b.soundVol) || 0));

    saveDb();
    const pu = publicUser(me, { email: me.email, bg: me.bg, bio: me.bio || '', bgSound: me.bgSound !== false, sound: me.sound || 'chime', soundVol: me.soundVol === undefined ? 0.5 : me.soundVol });
    for (const uid of onlineUsers) if (uid !== me.id) sendToUser(uid, { type: 'profile:updated', user: pu });
    res.json({ user: pu });
  })
);

/* ================= Suche ================= */
app.get(
  '/api/search',
  auth,
  h(async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json({ users: [], channels: [] });
    const me = req.user;
    const users = Object.values(db.users)
      .filter((u) => u.id !== me.id && (u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)))
      .slice(0, 15)
      .map((u) => publicUser(u));
    const channels = Object.values(db.chats)
      .filter((c) => c.type === 'channel' && !c.memberIds.includes(me.id) && c.name.toLowerCase().includes(q))
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar || '📢',
        description: c.description || '',
        count: c.memberIds.length,
      }));
    res.json({ users, channels });
  })
);

/* ================= Chats anlegen ================= */
function pickAvatar(v, fallback) {
  const s = String(v || '');
  if (s.length <= 8 && s.trim()) return s.trim();
  if (s.startsWith('data:image/') && s.length <= MAX_AVATAR) return s;
  return fallback;
}

app.post(
  '/api/chats',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};
    let chat = null;

    if (b.type === 'private') {
      const target = db.users[String(b.userId || '')];
      if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden 💔' });
      if (target.id === me.id) return res.status(400).json({ error: 'Mit dir selbst chatten? 😅' });
      chat = findPrivateChat(me.id, target.id);
      // 🛡️ Privat-Modus: darf mir diese Person überhaupt schreiben?
      if (!chat) {
        const gate = SEC.canDm(me, target.id);
        if (!gate.ok) return res.status(403).json({ error: gate.error, code: gate.code || 'dm_blocked' });
      }
      if (!chat) {
        chat = {
          id: nextId('c_'),
          type: 'private',
          name: '',
          description: '',
          avatar: '',
          ownerId: me.id,
          adminIds: [me.id],
          memberIds: [me.id, target.id],
          communityId: null,
          createdAt: Date.now(),
        };
        db.chats[chat.id] = chat;
        db.messages[chat.id] = [];
        for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:created', summary: chatSummary(uid, chat) });
      }
    } else if (['group', 'community', 'channel'].includes(b.type)) {
      // 🚦 V4.30 — höchstens 5 Gruppen pro Stunde
      const glim = V430groupGate(me);
      if (glim) return res.status(429).json(glim);
      const name = String(b.name || '').trim();
      if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Name: 2–40 Zeichen' });
      const description = String(b.description || '').trim().slice(0, 200);
      const memberIds = new Set([me.id]);
      if (b.memberIds) {
        for (const id of b.memberIds) {
          if (db.users[id] && id !== me.id) memberIds.add(id);
        }
      }
      chat = {
        id: nextId('c_'),
        type: b.type,
        name,
        description,
        avatar: pickAvatar(b.avatar, b.type === 'channel' ? '📢' : b.type === 'community' ? '🏰' : '💬'),
        ownerId: me.id,
        adminIds: [me.id],
        memberIds: [...memberIds],
        communityId: null,
        createdAt: Date.now(),
      };
      db.chats[chat.id] = chat;
      db.messages[chat.id] = [];
      for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:created', summary: chatSummary(uid, chat) });
    } else {
      return res.status(400).json({ error: 'Unbekannter Chat-Typ' });
    }

    saveDb();
    res.json({ summary: chatSummary(me.id, chat) });
  })
);

function getChatOr404(req, res) {
  const chat = db.chats[String(req.params.id || '')];
  if (!chat) {
    res.status(404).json({ error: 'Chat nicht gefunden 💔' });
    return null;
  }
  if (!chat.memberIds.includes(req.user.id)) {
    res.status(403).json({ error: 'Du bist nicht in diesem Chat' });
    return null;
  }
  return chat;
}

/* ================= Chat-Details ================= */
app.get(
  '/api/chats/:id',
  auth,
  h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const members = chat.memberIds.map((id) => db.users[id]).filter(Boolean).map((u) => publicUser(u));
    const groups =
      chat.type === 'community'
        ? Object.values(db.chats)
            .filter((c) => c.communityId === chat.id)
            .map((c) => ({ id: c.id, name: c.name, avatar: c.avatar || '💬', count: c.memberIds.length, description: c.description || '' }))
        : [];
    res.json({
      chat: {
        id: chat.id,
        type: chat.type,
        name: chat.type === 'private' ? privateName(chat, req.user.id) : chat.name,
        avatar: chat.type === 'private' ? privateAvatar(chat, req.user.id) : chat.avatar || '💬',
        banner: chat.banner || null,
        description: chat.description || '',
        ownerId: chat.ownerId,
        adminIds: chat.adminIds || [],
        announce: !!chat.announce,
        kicked: chat.kicked || [],
        communityId: chat.communityId || null,
        createdAt: chat.createdAt,
      },
      // 📌 die aktuell angepinnte Nachricht (für die Leiste über dem Chat)
      pinned: (() => {
        const p = (db.messages[chat.id] || []).filter((m) => m.pinned && !m.deleted).pop();
        return p ? { id: p.id, text: (p.text || '').slice(0, 100), image: !!p.image, senderName: senderName(req.user.id, chat, p) } : null;
      })(),
      members,
      groups,
      summary: chatSummary(req.user.id, chat),
    });
  })
);

/* ================= Nachrichten ================= */
app.post(
  '/api/chats/:id/messages',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    // 📢 Kanäle sind immer Ankündigung; Gruppen nur, wenn es eingeschaltet ist.
    if (chat.type === 'channel' && !isChatAdmin(me, chat)) return res.status(403).json({ error: 'In Kanälen darf nur der Inhaber schreiben 📢' });
    if (chat.announce && chat.type !== 'channel' && !isChatAdmin(me, chat)) {
      return res.status(403).json({
        error: 'Ankündigungsmodus: Hier schreiben nur Verwalter 📢',
        code: 'announce_only',
      });
    }
    // 🚫 Gruppen-Sperre durchsetzen
    const gb = MOD.groupBanFor(me, chat.id);
    if (gb) return res.status(403).json({ error: 'Du bist aus diesem Chat ausgeschlossen.', code: 'groupbanned', ban: MOD.banPublic(gb) });
    // 🔇 Stummschaltung: nur Senden blocken
    const mute = MOD.activeMute(me);
    if (mute) return res.status(403).json({ error: 'Du bist gerade stummgeschaltet.', code: 'muted', mute: MOD.banPublic(mute) });

    // 🚫 V4: Blockierung (nur in privaten Chats)
    if (chat.type === 'private') {
      const otherId = chat.memberIds.find((x) => x !== me.id);
      const blocks = db.blocks || {};
      if ((blocks[me.id] && blocks[me.id][otherId]) || (blocks[otherId] && blocks[otherId][me.id])) {
        return res.status(403).json({ error: 'Zwischen euch ist eine Blockierung aktiv 🚫', code: 'blocked' });
      }
    }

    const b = req.body || {};
    const text = String(b.text || '').trim().slice(0, MAX_MSG);
    const image = typeof b.image === 'string' && b.image.startsWith('data:image/') ? b.image : '';

    // 🚦 V4.30 — 20 Nachrichten/Minute + Spam-Bremse (gleiche Nachricht 12×)
    const gate = V430gate(me, text || (image ? '[Foto]' : ''));
    if (gate.block) return res.status(gate.status).json(gate.body);

    // 🔥 Einmal-Medium (view once)
    const viewOnce = !!(b.viewOnce || (b.attachment && b.attachment.viewOnce));

    // 📎 V3: Anhänge (Sticker, GIF, Voice, Datei, Standort, Video)
    const KINDS = ['text', 'sticker', 'gif', 'photo', 'video', 'voice', 'file', 'location', 'poll', 'contact'];
    const kind = KINDS.includes(b.kind) ? b.kind : (image ? 'photo' : 'text');
    let attachment = null;
    if (b.attachment && typeof b.attachment === 'object') {
      const raw = JSON.stringify(b.attachment);
      const attLimit = V419 && V419.isVip(me) ? V419.VIP_LIMITS.uploadBytes.vip * 4 : 6 * 1024 * 1024;
      if (raw.length > attLimit) return res.status(400).json({ error: 'Anhang zu groß (max. ' + Math.round(attLimit / 1024 / 1024 * 10) / 10 + ' MB)' });
      attachment = {
        url: typeof b.attachment.url === 'string' ? b.attachment.url.slice(0, (V419 && V419.isVip(me)) ? 12 * 1024 * 1024 : 5 * 1024 * 1024) : '',
        name: String(b.attachment.name || '').slice(0, 120),
        mime: String(b.attachment.mime || '').slice(0, 80),
        size: parseInt(b.attachment.size, 10) || 0,
        duration: parseInt(b.attachment.duration, 10) || 0,
        lat: parseFloat(b.attachment.lat) || 0,
        lng: parseFloat(b.attachment.lng) || 0,
        sticker: String(b.attachment.sticker || '').slice(0, 16),
        viewOnce: viewOnce || !!b.attachment.viewOnce,
        consumed: false,
        // 🎙️ Wellenform (32 Werte 0–1) für Sprachnachrichten
        wave: Array.isArray(b.attachment.wave)
          ? b.attachment.wave.slice(0, 48).map((v) => Math.max(0, Math.min(1, Number(v) || 0)))
          : undefined,
        // 👤 vCard-Felder
        vname: String(b.attachment.vname || '').slice(0, 60) || undefined,
        vuser: String(b.attachment.vuser || '').slice(0, 40) || undefined,
        vphone: String(b.attachment.vphone || '').slice(0, 30) || undefined,
        vavatar: String(b.attachment.vavatar || '').slice(0, 16) || undefined,
      };
    }
    // 🔥 Einmal-Foto ohne extra attachment → aus dem Bild bauen
    if (viewOnce && !attachment && image) {
      attachment = { url: image, name: 'Einmal-Foto', mime: 'image/jpeg', size: image.length, duration: 0, lat: 0, lng: 0, sticker: '', viewOnce: true, consumed: false };
    }
    if (viewOnce && attachment) { attachment.viewOnce = true; attachment.consumed = false; }
    if (!text && !image && !attachment) return res.status(400).json({ error: 'Nachricht ist leer' });
    // 👑 V4.19: VIP darf größere Bilder schicken (2,45 MB statt 700 KB)
    const imgLimit = V419 && V419.isVip(me) ? V419.VIP_LIMITS.uploadBytes.vip : MAX_IMAGE;
    if (image.length > imgLimit) {
      return res.status(400).json({
        error: 'Bild zu groß (max. ' + Math.round(imgLimit / 1024) + ' KB)' + (V419 && !V419.isVip(me) ? ' — VIP bekommt mehr 👑' : ''),
        code: 'image_too_big', limit: imgLimit, vip: V419 && V419.isVip(me),
      });
    }

    // 🛡️ V4.3 Inhaltsfilter (Scam / Betrug / Grooming)
    if (text) {
      const scan = SEC.filterMessage(me, text);
      if (scan && scan.blocked) {
        const hitLabels = (scan.hits || []).map((x) => (x && x.label) || String(x));
        return res.status(403).json({
          error: 'Der Sicherheitsfilter hat diese Nachricht gestoppt 🛡️ Grund: ' + (hitLabels.join(' + ') || 'verdächtiger Inhalt'),
          code: 'filtered',
          score: scan.score,
          // 🔎 V4.4: Grund sichtbar + Einspruch möglich (kein stummer 403 mehr)
          reason: scan.reason || '',
          label: hitLabels.join(' + '),
          hint: scan.hint || '',
          rules: (scan.hits || []).map((x) => (x && x.rule) || String(x)),
          ruleLabels: hitLabels,
          appealAllowed: scan.appealAllowed !== false,
          appealEndpoint: '/api/security/filter-appeal',
          canDisableFilter: true,
        });
      }
    }

    // ↪️ Weitergeleitet — nur wenn der Client es ehrlich mitschickt
    const forwarded = !!b.forwarded;
    let forwardedFrom = null;
    if (forwarded && b.forwardedFrom) {
      forwardedFrom = {
        chatId: String(b.forwardedFrom.chatId || '').slice(0, 40) || null,
        chatName: String(b.forwardedFrom.chatName || '').slice(0, 80) || null,
        senderName: String(b.forwardedFrom.senderName || '').slice(0, 80) || null,
      };
    }

    // ↩️ Antwort auf eine andere Nachricht
    let replyTo = null;
    if (b.replyTo) {
      const target = (db.messages[chat.id] || []).find((m) => m.id === String(b.replyTo));
      if (target && !target.deleted) {
        replyTo = {
          id: target.id,
          senderId: target.senderId,
          senderName: (db.users[target.senderId] || {}).displayName || 'Unbekannt',
          text: (target.text || '').slice(0, 140),
          image: !!target.image,
        };
      }
    }

    const msg = {
      id: nextId('m_'),
      chatId: chat.id,
      senderId: me.id,
      text,
      image: image || null,
      kind,
      attachment,
      createdAt: Date.now(),
      reactions: {},
      readBy: [me.id],
      replyTo,
      forwarded,
      forwardedFrom,
      // 🚦 V4.30 — „oft weitergeleitet", wenn dieselbe Nachricht mehrfach kommt
      repeated: gate.repeated || 0,
      spamLabel: !!gate.spamLabel,
    };
    (db.messages[chat.id] = db.messages[chat.id] || []).push(msg);
    saveDb();

    sendToChat(chat.id, { type: 'message:new', chatId: chat.id, message: msgPublic(msg) });
    for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, chat) });
    // 🤖 V4.32: erst die neuen Befehle (/ping, /würfel …), dann die alten.
    //    Antwortet der neue Handler, bleibt der alte still — sonst kämen
    //    auf ein /help zwei Antworten.
    let cmdHandled = false;
    try { if (app.locals.v432Handle) cmdHandled = app.locals.v432Handle(chat, msg) === true; } catch (e) {}
    try { if (!cmdHandled && app.locals.lovebotHandle) app.locals.lovebotHandle(chat, msg); } catch (e) {}
    res.json({ message: msgPublic(msg) });
  })
);

app.get(
  '/api/chats/:id/messages',
  auth,
  h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const all = db.messages[chat.id] || [];
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || PAGE_SIZE, 10), 100);
    const slice = all.slice(-limit);
    res.json({ messages: slice.map(msgPublic), hasMore: all.length > slice.length, total: all.length });
  })
);

/* ✏️ Nachricht bearbeiten (nur eigene) */
app.patch(
  '/api/chats/:id/messages/:mid',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const gb = MOD.groupBanFor(me, chat.id);
    if (gb) return res.status(403).json({ error: 'Du bist aus diesem Chat ausgeschlossen.', code: 'groupbanned' });
    const all = db.messages[chat.id] || [];
    const msg = all.find((m) => m.id === String(req.params.mid));
    if (!msg) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    if (msg.senderId !== me.id) return res.status(403).json({ error: 'Nur deine eigene Nachricht kannst du bearbeiten' });
    if (msg.deleted) return res.status(400).json({ error: 'Diese Nachricht ist gelöscht' });
    if (msg.image) return res.status(400).json({ error: 'Bilder kann man nicht bearbeiten' });
    const text = String((req.body || {}).text || '').trim().slice(0, MAX_MSG);
    if (!text) return res.status(400).json({ error: 'Nachricht ist leer' });
    msg.text = text;
    msg.editedAt = Date.now();
    saveDb();
    sendToChat(chat.id, { type: 'message:updated', chatId: chat.id, message: msgPublic(msg) });
    res.json({ message: msgPublic(msg) });
  })
);

/* 🗑️ Nachricht löschen (eigene oder als Chat-Admin) */
app.delete(
  '/api/chats/:id/messages/:mid',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const all = db.messages[chat.id] || [];
    const msg = all.find((m) => m.id === String(req.params.mid));
    if (!msg) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    const mine = msg.senderId === me.id;
    if (!mine && !isChatAdmin(me, chat) && MOD.rankOf(me) < MOD.RANKS.moderator) {
      return res.status(403).json({ error: 'Nur deine eigene Nachricht kannst du löschen' });
    }
    msg.deleted = true;
    msg.text = '';
    msg.image = null;
    msg.pinned = false;          // 🗑️ eine gelöschte Nachricht bleibt nicht angepinnt
    msg.replyTo = null;          // Zitate auf gelöschte Nachrichten sind sinnlos
    msg.deletedAt = Date.now();
    msg.deletedBy = me.displayName;
    saveDb();
    sendToChat(chat.id, { type: 'message:updated', chatId: chat.id, message: msgPublic(msg) });
    res.json({ ok: true, message: 'Nachricht gelöscht 🗑️' });
  })
);

app.post(
  '/api/chats/:id/read',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const all = db.messages[chat.id] || [];
    let changed = false;
    for (const m of all) {
      if (m.senderId !== me.id && !m.readBy.includes(me.id)) {
        m.readBy.push(me.id);
        changed = true;
      }
    }
    if (changed) {
      saveDb();
      sendToChat(chat.id, { type: 'messages:read', chatId: chat.id, userId: me.id, upTo: Date.now() }, me.id);
      for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, chat) });
    }
    res.json({ ok: true });
  })
);

/* Reaktionen */
app.post(
  '/api/chats/:id/messages/:mid/reaction',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const all = db.messages[chat.id] || [];
    const msg = all.find((m) => m.id === String(req.params.mid));
    if (!msg) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    const emoji = String(req.body && req.body.emoji || '').slice(0, 8);
    if (!emoji) return res.status(400).json({ error: 'Kein Emoji' });
    msg.reactions = msg.reactions || {};
    if (msg.reactions[me.id] === emoji) delete msg.reactions[me.id];
    else msg.reactions[me.id] = emoji;
    saveDb();
    sendToChat(chat.id, { type: 'reaction:new', chatId: chat.id, message: msgPublic(msg) });
    res.json({ message: msgPublic(msg) });
  })
);

/* ================= Mitglieder ================= */
app.post(
  '/api/chats/:id/members',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    if (chat.type === 'private') return res.status(400).json({ error: 'In privaten Chats kann niemand hinzukommen 😅' });
    if (!isChatAdmin(me, chat)) return res.status(403).json({ error: 'Nur Inhaber/Verwalter können Mitglieder hinzufügen' });
    const target = db.users[String(req.body && req.body.userId || '')];
    if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden 💔' });
    if (chat.memberIds.includes(target.id)) return res.status(409).json({ error: 'Ist schon dabei 💗' });
    chat.memberIds.push(target.id);
    saveDb();
    sendToChat(chat.id, { type: 'member:added', chatId: chat.id, userId: target.id, name: target.displayName, byId: me.id });
    // 🤖 LoveBot-Begrüßung
    try {
      const bot = Object.values(db.users).find((u) => u.isBot && u.botType === 'lovebot');
      const cfg = db.lovebotConfig || {};
      const wants = chat.type === 'group' ? cfg.greetGroups !== false : chat.type === 'community' ? cfg.greetCommunities !== false : false;
      if (bot && cfg.enabled !== false && wants && !chat.memberIds.includes(bot.id)) {
        chat.memberIds.push(bot.id);
        saveDb();
        sendToChat(chat.id, { type: 'member:added', chatId: chat.id, userId: bot.id, name: bot.displayName, byId: bot.id });
      }
      if (bot && cfg.enabled !== false && wants && chat.memberIds.includes(bot.id)) {
                const text = 'Willkommen ' + target.displayName + ' 💗 Schön, dass du in **' + chat.name + '** bist! Schreib /help wenn du wissen willst, was ich kann 🤖';
        const msg = { id: nextId('m_'), chatId: chat.id, senderId: bot.id, text, kind: 'text', attachment: null, createdAt: Date.now(), reactions: {}, readBy: [bot.id], bot: true };
        (db.messages[chat.id] = db.messages[chat.id] || []).push(msg);
        saveDb();
        sendToChat(chat.id, { type: 'message:new', chatId: chat.id, message: msgPublic(msg) });
      }
    } catch (e) { console.error('LoveBot greet:', e.message); }
    for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, chat) });
    res.json({ summary: chatSummary(me.id, chat) });
  })
);

app.post(
  '/api/chats/:id/leave',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    if (chat.type === 'private') return res.status(400).json({ error: 'Private Chats kann man nicht verlassen' });
    if (chat.ownerId === me.id) return res.status(400).json({ error: 'Als Inhaber kannst du nicht verlassen — lösche den Chat stattdessen' });
    chat.memberIds = chat.memberIds.filter((id) => id !== me.id);
    if (!chat.memberIds.length) {
      delete db.chats[chat.id];
      delete db.messages[chat.id];
      sendToChat(chat.id, { type: 'chat:deleted', chatId: chat.id });
    } else {
      for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, chat) });
    }
    saveDb();
    res.json({ ok: true });
  })
);

app.delete(
  '/api/chats/:id',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    if (!isChatAdmin(me, chat)) return res.status(403).json({ error: 'Nur Inhaber/Verwalter können löschen' });
    if (chat.type === 'private') chat.memberIds = chat.memberIds.filter((id) => id !== me.id);
    else if (chat.memberIds.length === 1) chat.memberIds = [];
    if (!chat.memberIds.length || chat.type === 'private' && chat.memberIds.length < 2) {
      // Für private: wenn nur ich übrig bin → für mich "gelöscht"
    }
    if (chat.type !== 'private' && !chat.memberIds.length) {
      delete db.chats[chat.id];
      delete db.messages[chat.id];
      // 🔐 V4.8: mit dem Chat muss ALLES weg sein, was Schlüsselmaterial enthielt.
      // Vorher blieben senderKeys (Chain-Keys!), senderKeyOwners und groupCalls zurück.
      if (db.senderKeys) delete db.senderKeys[chat.id];
      if (db.senderKeyOwners) delete db.senderKeyOwners[chat.id];
      if (db.groupCalls) delete db.groupCalls[chat.id];
      if (db.pins) delete db.pins[chat.id];
      if (db.scheduledMessages) {
        for (const [uid, list] of Object.entries(db.scheduledMessages)) {
          if (Array.isArray(list)) db.scheduledMessages[uid] = list.filter((m) => m.chatId !== chat.id);
        }
      }
      sendToChat(chat.id, { type: 'chat:deleted', chatId: chat.id });
    }
    // 👑 Inhaber/Admin löscht eine Gruppe für ALLE (Mitglieder werden informiert).
    //    Vorher blieb eine 2-Personen-Gruppe bestehen — und ihr Schlüsselmaterial auch.
    if ((chat.type === 'group' || chat.type === 'community' || chat.type === 'channel')
        && chat.ownerId === me.id && db.chats[chat.id]) {
      const members = [...chat.memberIds];
      delete db.chats[chat.id];
      delete db.messages[chat.id];
      if (db.senderKeys) delete db.senderKeys[chat.id];
      if (db.senderKeyOwners) delete db.senderKeyOwners[chat.id];
      if (db.groupCalls) delete db.groupCalls[chat.id];
      for (const uid of members) sendToUser(uid, { type: 'chat:deleted', chatId: chat.id });
    }
    saveDb();
    res.json({ ok: true });
  })
);

/* Kanal beitreten */
app.post(
  '/api/chats/:id/join',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = db.chats[String(req.params.id || '')];
    if (!chat) return res.status(404).json({ error: 'Chat nicht gefunden 💔' });
    if (chat.type !== 'channel') return res.status(400).json({ error: 'Nur Kanäle kann man sich suchen' });
    if (!chat.memberIds.includes(me.id)) {
      chat.memberIds.push(me.id);
      saveDb();
      sendToChat(chat.id, { type: 'member:added', chatId: chat.id, userId: me.id, name: me.displayName, byId: me.id });
      for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, chat) });
    }
    res.json({ summary: chatSummary(me.id, chat) });
  })
);

/* Community: Untergruppen anlegen */
app.post(
  '/api/chats/:id/groups',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    if (chat.type !== 'community') return res.status(400).json({ error: 'Nur Communities haben Untergruppen' });
    if (!isChatAdmin(me, chat)) return res.status(403).json({ error: 'Nur Inhaber/Verwalter können Gruppen anlegen' });
    const name = String((req.body || {}).name || '').trim();
    if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Name: 2–40 Zeichen' });
    const group = {
      id: nextId('c_'),
      type: 'group',
      name,
      description: String((req.body || {}).description || '').trim().slice(0, 200),
      avatar: pickAvatar((req.body || {}).avatar, '💬'),
      ownerId: me.id,
      adminIds: [me.id],
      memberIds: [me.id],
      communityId: chat.id,
      createdAt: Date.now(),
    };
    db.chats[group.id] = group;
    db.messages[group.id] = [];
    for (const uid of group.memberIds) sendToUser(uid, { type: 'chat:created', summary: chatSummary(uid, group) });
    saveDb();
    res.json({ summary: chatSummary(me.id, group) });
  })
);

/* Hintergrund (pro Chat) */
app.put(
  '/api/chats/:id/background',
  auth,
  h(async (req, res) => {
    const me = req.user;
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const theme = (req.body || {}).theme;
    me.bg = me.bg || { default: 'pink-dream', overrides: {} };
    me.bg.overrides = me.bg.overrides || {};
    if (theme === null || theme === '') delete me.bg.overrides[chat.id];
    else if (THEME_IDS.includes(theme)) me.bg.overrides[chat.id] = theme;
    else if (typeof theme === 'string' && theme.startsWith('custom:data:image/') && theme.length <= 320 * 1024) me.bg.overrides[chat.id] = theme;
    else return res.status(400).json({ error: 'Unbekannter Hintergrund' });
    saveDb();
    res.json({ bg: me.bg });
  })
);

/* ================= WebSocket ================= */
function sendToUser(uid, obj) {
  const set = wsByUser.get(uid);
  if (!set) return;
  const data = JSON.stringify(obj);
  for (const ws of set) if (ws.readyState === 1) ws.send(data);
}
function sendToChat(chatId, obj, exceptUid) {
  const chat = db.chats[chatId];
  if (!chat) return;
  for (const uid of chat.memberIds) if (uid !== exceptUid) sendToUser(uid, obj);
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const wsByUser = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const uid = db.tokens[url.searchParams.get('token') || ''];
  if (!uid || !db.users[uid]) {
    ws.close(4001, 'Nicht angemeldet');
    return;
  }
  const user = db.users[uid];
  ws.authToken = url.searchParams.get('token') || '';   // 🔧 V4.12: welches Gerät ist das?
  // 🚫 Gesperrte Konten dürfen keine Echtzeit-Verbindung aufbauen
  if (MOD.roleOf(user) !== 'owner') {
    const ban = MOD.activeAccountBan(user);
    if (ban) {
      try { delete db.tokens[url.searchParams.get('token')]; saveDb(); } catch (e) {}
      safeSend(ws, { type: 'account:blocked', ban: MOD.banPublic(ban) });
      ws.close(4003, 'banned');
      return;
    }
  }
  ws.userId = uid;
  if (!wsByUser.has(uid)) wsByUser.set(uid, new Set());
  wsByUser.get(uid).add(ws);
  if (!onlineUsers.has(uid)) {
    onlineUsers.add(uid);
    for (const o of onlineUsers) if (o !== uid) sendToUser(o, { type: 'presence', userId: uid, online: true });
  }
  safeSend(ws, { type: 'hello', user: publicUser(user), online: [...onlineUsers] });

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const u = db.users[ws.userId];
    if (!u) return;
    if (data.type === 'ping') safeSend(ws, { type: 'pong' });
    if (data.type === 'typing' && data.chatId && db.chats[data.chatId] && db.chats[data.chatId].memberIds.includes(u.id)) {
      sendToChat(data.chatId, { type: 'typing', chatId: data.chatId, userId: u.id, name: u.displayName });
    }
    if (data.type === 'chat:open' && data.chatId && db.chats[data.chatId] && db.chats[data.chatId].memberIds.includes(u.id)) {
      const chat = db.chats[data.chatId];
      const all = db.messages[chat.id] || [];
      let changed = false;
      for (const m of all) {
        if (m.senderId !== u.id && !m.readBy.includes(u.id)) {
          m.readBy.push(u.id);
          changed = true;
        }
      }
      if (changed) {
        saveDb();
        sendToChat(chat.id, { type: 'messages:read', chatId: chat.id, userId: u.id, upTo: Date.now() }, u.id);
        for (const oid of chat.memberIds) sendToUser(oid, { type: 'chat:updated', summary: chatSummary(oid, chat) });
      }
    }
    // Anruf-Signaling (WebRTC): nur an Mitglieder desselben Chats weiterleiten
    if (data.type === 'signal' && data.chatId && data.to && db.chats[data.chatId]
        && db.chats[data.chatId].memberIds.includes(u.id)
        && db.chats[data.chatId].memberIds.includes(data.to)) {
      sendToUser(data.to, { type: 'signal', chatId: data.chatId, from: u.id, data: data.data });
    }
  });

  const cleanup = () => {
    const set = wsByUser.get(ws.userId);
    if (set) {
      set.delete(ws);
      if (!set.size) {
        wsByUser.delete(ws.userId);
        if (onlineUsers.delete(ws.userId)) {
          const u = db.users[ws.userId];
          if (u) u.lastSeen = Date.now();
          saveDb();
          for (const o of onlineUsers) sendToUser(o, { type: 'presence', userId: ws.userId, online: false });
        }
      }
    }
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

function safeSend(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {}
}

/* ================= Static (Web + PWA) ================= */
app.get('/api/health', (req, res) => res.json({ ok: true, name: 'LoveChat', time: Date.now() }));
app.use(
  express.static(CLIENT_DIR, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js') || filePath.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
      else if (filePath.endsWith('.png')) res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  })
);
/* 👑 Owner-Anleitung (liegt im Projektordner, nicht im Client-Ordner) */
/* ⬇︎ Download-Seite: /downloads (ohne .html) */
app.get(['/downloads', '/downloads.html'], (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'downloads.html'));
});
app.get('/anleitung', (req, res) => res.sendFile(path.join(__dirname, 'OWNER-ANLEITUNG.html')));
app.get('/anleitung.html', (req, res) => res.sendFile(path.join(__dirname, 'OWNER-ANLEITUNG.html')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/ws') return next();

  /* 🚨 Datei-Anfragen NIEMALS mit der Startseite beantworten.
     Vorher: /app/maxichen-v4.13.apk (gelöscht) → 200 + HTML.
     Wer das herunterlädt, hat eine Datei namens .apk, die HTML ist
     → Android: "Paket ungültig". Genau diese Falle machen wir zu.
     Eine ausgelaufene Download-URL muss ehrlich 404 sagen. */
  if (/\.[a-z0-9]{2,5}$/i.test(req.path)) {
    return res.status(404).type('text/plain; charset=utf-8')
      .send('404 — Diese Datei gibt es nicht mehr.\n' +
            'Aktuelle Downloads: https://maxichen.de/downloads\n');
  }

  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

/* ================= Start ================= */
loadDb();

/* 📢 V4.25 — erst JETZT, nach dem Laden der Datenbank, den offiziellen
 *    Kanal sicherstellen (vorher ist db.users leer — siehe v425.js). */
try { if (V425 && V425.init) V425.init(); } catch (e) { console.error('⚠️ V4.25 init:', e.message); }
/* ✅ V4.22 — läuft bewusst NACH loadDb(): vorher ist `db` leer. */
V422.boot();
/* 👑 V4.29: v428 kann den Owner direkt nach der Anmeldung einrichten
 * (2FA + Haken), ohne dass der Server neu gestartet werden muss. */
globalThis.__LC_V422 = V422;
MOD.startScheduler();

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  💗 LoveChat läuft!');
  console.log(`  🌐 Lokal:  http://localhost:${PORT}`);
  console.log('  💗 by maxi⁹¹⁰ — träume groß ✨');
  console.log('');
});
