/* =====================================================================
 *  🔒🎵 v426.js — V4.26 „Sicherheit + Töne"
 * ---------------------------------------------------------------------
 *  GEMESSEN vor dem Bau (nicht geraten):
 *
 *  ✅ 30 Töne liegen in v419.js (SOUNDS), /api/sounds GET+POST existiert
 *  ✅ Datenschutz-Grundlage in security.js (DEFAULTS, /api/privacy)
 *     → 8 Schlüssel: allowDmFrom, lastSeenPrivacy, readReceipts,
 *       profilePhotoPrivacy, quietHours, screenshotBlock, strictFilter,
 *       autoLockMinutes
 *  ✅ Blockieren/Melden in v4.js (/api/blocks)
 *  ✅ TOTP-2FA in v3.js, Recovery Codes in owner/
 *  ✅ X25519/AES-256-GCM in e2e.js (aber NICHT als Backup nutzbar)
 *
 *  ❌ 40 Töne gibt es NICHT — nur 30, keine Vibration, keine Anruf-Töne
 *  ❌ Kein verschlüsseltes Backup (kein /api/backup)
 *  ❌ Kein Sicherheitscode (Safety Number) sichtbar für den Nutzer
 *  ❌ Keine Biometrie-/App-Sperre-Einstellung (nur autoLockMinutes)
 *  ❌ Datenschutz kennt weder Status-, Gruppen- noch Anruf-Privatheit
 *
 *  Dieses Modul ergänzt — es ersetzt nichts. Die 30 alten Töne bleiben
 *  unverändert, 10 neue kommen dazu (40 gesamt).
 * ===================================================================== */
'use strict';

const crypto = require('crypto');

const VERSION = 426;

/* ---------------------------------------------------------------------
 *  🎵 Die 10 neuen Töne — „Lovechen Spezial" + Anruf/Ruf
 *  Gleiches Rezept-Format wie v419.js (WebAudio, keine MP3 nötig):
 *  { id, name, pack, type, notes: [[Hz, Versatz], …], dur, vib }
 *  `vib` = Vibrationsmuster in ms (0 = keine Vibration).
 * ------------------------------------------------------------------- */
const NEW_SOUNDS = [
  // 💗 Lovechen Spezial (10. Block — deine Vorgabe „pink Spezial")
  { id: 'lovechen-glow', name: 'Lovechen Glow 💗', pack: 'lovechen', type: 'sine', notes: [[880, 0], [1320, 0.1], [1760, 0.2], [1320, 0.32]], dur: 0.55, vib: [0, 35, 60, 35] },
  { id: 'pink-heart', name: 'Herz Pop 🩷', pack: 'lovechen', type: 'sine', notes: [[740, 0], [1108, 0.06], [1480, 0.12]], dur: 0.24, vib: [0, 25] },
  { id: 'lovechen-whisper', name: 'Lovechen Flüstern 🌸', pack: 'lovechen', type: 'sine', notes: [[440, 0], [554, 0.14], [659, 0.28]], dur: 0.6, vib: [0, 20, 40, 20] },
  { id: 'neon-pink', name: 'Neon Pink ⚡', pack: 'lovechen', type: 'square', notes: [[1046, 0], [1318, 0.05], [1046, 0.1], [1568, 0.16]], dur: 0.2, vib: [0, 18, 40, 18] },
  { id: 'lovechen-bell', name: 'Lovechen Glocke 🔔', pack: 'lovechen', type: 'triangle', notes: [[1568, 0], [2093, 0.1], [2637, 0.2]], dur: 0.5, vib: [0, 30, 80, 30] },
  { id: 'starlight', name: 'Sternenlicht ✨', pack: 'lovechen', type: 'triangle', notes: [[2093, 0], [2637, 0.07], [3136, 0.14], [2637, 0.22]], dur: 0.45, vib: [0, 22] },
  { id: 'lovechen-melody', name: 'Lovechen Melodie 🎶', pack: 'lovechen', type: 'sine', notes: [[659, 0], [784, 0.12], [880, 0.24], [987, 0.36], [1174, 0.5]], dur: 0.7, vib: [0, 25, 120, 25] },
  { id: 'bubble-love', name: 'Liebesblase 🫧', pack: 'lovechen', type: 'sine', notes: [[1000, 0], [1400, 0.05], [1800, 0.1]], dur: 0.18, vib: [0, 15] },
  { id: 'kawaii-giggle', name: 'Kawaii Kichern 🎀', pack: 'lovechen', type: 'triangle', notes: [[1318, 0], [1568, 0.06], [1318, 0.14], [1760, 0.2]], dur: 0.3, vib: [0, 20, 50, 20] },
  { id: 'lovechen-signature', name: 'Lovechen Signatur 💗', pack: 'lovechen', type: 'sine', notes: [[523, 0], [659, 0.16], [784, 0.32], [1046, 0.48], [784, 0.62]], dur: 0.85, vib: [0, 40, 200, 40] },
];

/* Vibrationen für die 30 alten Töne (standardisiert, WhatsApp-artig) */
const VIB_DEFAULT = [0, 40, 80, 40];

/* ---------------------------------------------------------------------
 *  Anruf-Töne (Klingeln) — separat, weil sie anders abgespielt werden
 *  (Schleife bis angenommen/abgelehnt).
 * ------------------------------------------------------------------- */
const RINGTONES = [
  { id: 'ring-love', name: 'Love Klingeln 💗', type: 'sine', notes: [[523, 0], [659, 0.25], [784, 0.5], [659, 0.75]], dur: 0.9, loop: 2.2 },
  { id: 'ring-soft', name: 'Sanft 🌸', type: 'sine', notes: [[440, 0], [554, 0.6]], dur: 1.1, loop: 2.6 },
  { id: 'ring-neon', name: 'Neon ⚡', type: 'square', notes: [[880, 0], [1174, 0.18], [880, 0.36], [1174, 0.54]], dur: 0.75, loop: 1.9 },
  { id: 'ring-classic', name: 'Klassisch ☎️', type: 'triangle', notes: [[698, 0], [698, 0.5], [880, 0.18], [880, 0.68]], dur: 0.85, loop: 2.4 },
  { id: 'ring-kawaii', name: 'Kawaii 🎀', type: 'sine', notes: [[1046, 0], [1318, 0.14], [1568, 0.28], [1318, 0.42]], dur: 0.55, loop: 1.7 },
];

/* ---------------------------------------------------------------------
 *  Datenschutz: die 6 Schlüssel, die WhatsApp zusätzlich hat
 *  (die 8 alten bleiben in security.js — hier kommen nur NEUE dazu)
 * ------------------------------------------------------------------- */
const PRIVACY_EXTRA = {
  statusPrivacy: 'contacts',      // all | contacts | selected | except | nobody
  groupAddPrivacy: 'contacts',    // all | contacts | nobody  („Wer kann mich hinzufügen")
  callsPrivacy: 'contacts',       // all | contacts | nobody  („Wer kann mich anrufen")
  liveLocationPrivacy: 'contacts',// all | contacts | nobody
  lastSeenHideFrom: [],           // Ausnahmen (User-IDs) — „Außer…"
  profilePhotoHideFrom: [],
  safetyCodeShown: true,          // Sicherheitscode im Profil zeigen
  screenshotBlock: false,         // (schon in security.js — hier NICHT doppelt schreiben)
};
/* Nur die Schlüssel, die es vorher NICHT gab */
const NEW_PRIVACY_KEYS = ['statusPrivacy', 'groupAddPrivacy', 'callsPrivacy', 'liveLocationPrivacy', 'lastSeenHideFrom', 'profilePhotoHideFrom', 'safetyCodeShown'];

const PRIVACY_CHOICES = {
  statusPrivacy: ['all', 'contacts', 'selected', 'except', 'nobody'],
  groupAddPrivacy: ['all', 'contacts', 'nobody'],
  callsPrivacy: ['all', 'contacts', 'nobody'],
  liveLocationPrivacy: ['all', 'contacts', 'nobody'],
};

const BACKUP_MAX = 24 * 1024 * 1024;  // 24 MB Klartext — Browser-limitiert

function createV426(app, h, ctx) {
  const { db, saveDb, auth } = ctx;

  /* =====================================================================
   *  🎵 TÖNE — 40 gesamt
   * ===================================================================== */

  function v419sounds() {
    try {
      const { SOUNDS } = require('./v419');
      return Array.isArray(SOUNDS) ? SOUNDS : [];
    } catch (e) {
      return [];
    }
  }

  /** Alle 40 Töne, mit Vibration und Packs. Reihenfolge stabil. */
  function allSounds() {
    const old = v419sounds().map((s) => ({ ...s, vib: s.vib || VIB_DEFAULT, source: 'v419' }));
    const nu = NEW_SOUNDS.map((s) => ({ ...s, source: 'v426' }));
    return [...old, ...nu];
  }

  function soundById(id) {
    return allSounds().find((s) => s.id === id) || null;
  }

  app.get('/api/v426/sounds', auth, h(async (req, res) => {
    const all = allSounds();
    const packs = {};
    for (const s of all) packs[s.pack] = (packs[s.pack] || 0) + 1;
    res.json({
      sounds: all,
      total: all.length,
      packs,
      ringtones: RINGTONES,
      // Was der Nutzer gerade gewählt hat
      mine: { default: req.user.sound || 'chime', ringtone: req.user.ringtone || 'ring-love', vol: req.user.soundVol === undefined ? 0.5 : req.user.soundVol },
    });
  }));

  /** Ton wählen — ohne Absturz bei Unsinn. */
  app.post('/api/v426/sounds', auth, h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};
    if (b.default !== undefined) {
      const s = soundById(String(b.default));
      if (!s) return res.status(400).json({ error: 'Unbekannter Ton', code: 'bad_sound', known: allSounds().length });
      me.sound = s.id;
    }
    if (b.ringtone !== undefined) {
      const r = RINGTONES.find((x) => x.id === String(b.ringtone));
      if (!r) return res.status(400).json({ error: 'Unbekanntes Klingeln', code: 'bad_ringtone' });
      me.ringtone = r.id;
    }
    if (b.vol !== undefined) {
      const v = Number(b.vol);
      if (!Number.isFinite(v) || v < 0 || v > 1) return res.status(400).json({ error: 'Lautstärke 0–1', code: 'bad_vol' });
      me.soundVol = Math.round(v * 100) / 100;
    }
    if (b.vibrate !== undefined) me.vibrate = !!b.vibrate;
    saveDb();
    res.json({ ok: true, sound: me.sound, ringtone: me.ringtone || 'ring-love', vol: me.soundVol === undefined ? 0.5 : me.soundVol, vibrate: me.vibrate !== false });
  }));

  /* =====================================================================
   *  🔒 SICHERHEIT
   * ===================================================================== */

  /** Schlüssel für Backup-Verschlüsselung (AES-256-GCM).
   *  Kommt aus ENV, sonst aus der DB — aber NIE im Klartext an den Client. */
  function backupKey() {
    const env = process.env.BACKUP_SECRET;
    if (env && env.length >= 32) return crypto.createHash('sha256').update(env).digest();
    if (!db.backupSecret) {
      db.backupSecret = crypto.randomBytes(32).toString('base64');
      saveDb();
      console.log('🔐 Backup-Schlüssel erzeugt (db.backupSecret, 32 Byte)');
    }
    return crypto.createHash('sha256').update(Buffer.from(db.backupSecret, 'base64')).digest();
  }

  /** Verschlüsselt mit AES-256-GCM. Format: v1.iv.tag.cipher (base64url) */
  function seal(plainObj) {
    const key = backupKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.from(JSON.stringify(plainObj), 'utf8');
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
  }

  function open(sealed) {
    const parts = String(sealed || '').split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Format unbekannt');
    const key = backupKey();
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const enc = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  }

  /** Was ins Backup gehört — KEINE Passwörter, KEINE Token, KEIN Schlüssel. */
  function backupPayload(me) {
    const myChats = Object.values(db.chats).filter((c) => (c.memberIds || []).includes(me.id));
    const chatIds = new Set(myChats.map((c) => c.id));
    const msgs = {};
    for (const id of chatIds) {
      const list = db.messages[id] || [];
      msgs[id] = list.map((m) => ({
        id: m.id, senderId: m.senderId, text: m.text || '', kind: m.kind || 'text',
        createdAt: m.createdAt, reactionCount: Object.keys(m.reactions || {}).length,
      }));
    }
    return {
      v: VERSION,
      exportedAt: Date.now(),
      user: {
        id: me.id,
        username: me.username,
        displayName: me.displayName,
        bio: me.bio || '',
        avatar: me.avatar || '',
        // 🔴 NIE: password, passwordHash, tokens, twofa-Secret, badgeKeys
        privacy: me.privacy || {},
        sound: me.sound || 'chime',
        ringtone: me.ringtone || 'ring-love',
        soundVol: me.soundVol === undefined ? 0.5 : me.soundVol,
        vibrate: me.vibrate !== false,
        bgTheme: (me.bg && me.bg.default) || 'pink-dream',
      },
      chats: myChats.map((c) => ({ id: c.id, type: c.type, name: c.name || '', memberCount: (c.memberIds || []).length })),
      messages: msgs,
      counts: { chats: myChats.length, messages: Object.values(msgs).reduce((n, a) => n + a.length, 0) },
    };
  }

  /** Backup erzeugen — verschlüsselt zurückgeben. */
  app.post('/api/v426/backup', auth, h(async (req, res) => {
    const me = req.user;
    const payload = backupPayload(me);
    const raw = JSON.stringify(payload);
    if (raw.length > BACKUP_MAX) return res.status(413).json({ error: 'Backup zu groß', code: 'too_big', bytes: raw.length });

    const sealed = seal(payload);
    // Beweis für den Client: dasselbe nochmal aufschließen und vergleichen
    const check = open(sealed);
    if (JSON.stringify(check) !== raw) return res.status(500).json({ error: 'Selbstprüfung fehlgeschlagen', code: 'verify_failed' });

    me.lastBackupAt = Date.now();
    saveDb();
    res.set('Cache-Control', 'no-store');
    res.json({
      sealed,
      algorithm: 'AES-256-GCM',
      bytes: Buffer.byteLength(sealed),
      plainBytes: raw.length,
      counts: payload.counts,
      selfCheck: true,
      hint: 'Diese Datei ist verschlüsselt. Ohne den Server-Schlüssel ist sie nicht lesbar.',
    });
  }));

  /** Backup prüfen (ohne zu importieren) — zeigt nur, was drin ist. */
  app.post('/api/v426/backup/verify', auth, h(async (req, res) => {
    const sealed = String((req.body || {}).sealed || '');
    if (!sealed) return res.status(400).json({ error: 'Kein Backup übergeben', code: 'empty' });
    try {
      const p = open(sealed);
      res.json({ ok: true, version: p.v, exportedAt: p.exportedAt, counts: p.counts, user: (p.user || {}).displayName });
    } catch (e) {
      // Manipulation ODER falscher Schlüssel — beides ist ein Fehler, kein Absturz
      res.status(400).json({ error: 'Backup ist ungültig oder manipuliert', code: 'bad_backup' });
    }
  }));

  /** Backup einspielen — nur Einstellungen + Profil, keine fremden Chats. */
  app.post('/api/v426/backup/restore', auth, h(async (req, res) => {
    const me = req.user;
    const sealed = String((req.body || {}).sealed || '');
    if (!sealed) return res.status(400).json({ error: 'Kein Backup übergeben', code: 'empty' });
    let p;
    try {
      p = open(sealed);
    } catch (e) {
      return res.status(400).json({ error: 'Backup ist ungültig oder manipuliert', code: 'bad_backup' });
    }
    // Nur DIESELBE Person darf ihr Backup einspielen
    if (!p.user || p.user.id !== me.id) {
      return res.status(403).json({ error: 'Das ist nicht dein Backup', code: 'not_yours' });
    }
    const u = p.user;
    const applied = [];
    if (typeof u.displayName === 'string' && u.displayName.length >= 2) { me.displayName = u.displayName.slice(0, 30); applied.push('displayName'); }
    if (typeof u.bio === 'string') { me.bio = u.bio.slice(0, 300); applied.push('bio'); }
    if (typeof u.avatar === 'string') { me.avatar = u.avatar.slice(0, 300 * 1024); applied.push('avatar'); }
    if (u.privacy && typeof u.privacy === 'object') { me.privacy = { ...(me.privacy || {}), ...u.privacy }; applied.push('privacy'); }
    if (u.sound) { me.sound = u.sound; applied.push('sound'); }
    if (u.ringtone) { me.ringtone = u.ringtone; applied.push('ringtone'); }
    if (typeof u.soundVol === 'number') { me.soundVol = u.soundVol; applied.push('soundVol'); }
    if (u.bgTheme) { me.bg = me.bg || {}; me.bg.default = u.bgTheme; applied.push('bgTheme'); }
    // 🔴 Bewusst NICHT übernommen: Passwort, 2FA-Secret, Token, Schlüssel
    saveDb();
    res.json({ ok: true, applied, skipped: ['passwort', '2FA', 'sitzungen'], message: 'Profil und Einstellungen wiederhergestellt' });
  }));

  /* ---------------------------------------------------------------------
   *  🔑 Sicherheitscode (Safety Number) — wie WhatsApps 60 Ziffern
   *  Deterministisch aus beiden User-IDs + Server-Schlüssel.
   * ------------------------------------------------------------------- */

  function safetyNumber(aId, bId) {
    const key = backupKey();
    const sorted = [aId, bId].sort();
    // 🔴 Hier stand EIN sha256 (32 Byte) und eine Schleife bis 30 → 30 Ziffern.
    //    WhatsApp hat 60. Ein Hash liefert nur 32 Byte, also zwei Blöcke.
    //    Test F2 hat es aufgedeckt: „erwartet 60, war 30".
    const h = Buffer.concat([
      crypto.createHmac('sha256', key).update('SAFETY-A|' + sorted.join('|')).digest(),
      crypto.createHmac('sha256', key).update('SAFETY-B|' + sorted.join('|')).digest(),
    ]);
    let digits = '';
    for (let i = 0; i < 60; i++) digits += String(h[i] % 10);
    return digits.match(/.{5}/g).join(' ');
  }

  app.get('/api/v426/safety-code/:userId', auth, h(async (req, res) => {
    const me = req.user;
    const other = db.users[String(req.params.userId || '')];
    if (!other) return res.status(404).json({ error: 'Nutzer nicht gefunden', code: 'no_user' });
    if (other.id === me.id) return res.status(400).json({ error: 'Mit dir selbst? 😅', code: 'self' });
    const code = safetyNumber(me.id, other.id);
    res.set('Cache-Control', 'no-store');
    res.json({
      with: { id: other.id, displayName: other.displayName, verified: other.verified === true },
      code,
      digits: code.replace(/ /g, '').length,
      // QR-Nutzlast: gleicher Code, damit beide Seiten ihn scannen können
      qrPayload: 'LC-SAFETY:' + code.replace(/ /g, '') + ':' + [me.id, other.id].sort().join(','),
      note: 'Beide Seiten sehen denselben Code. Stimmt er nicht überein, ist etwas faul.',
    });
  }));

  /* ---------------------------------------------------------------------
   *  👤 App-Sperre / Biometrie — nur EINSTELLUNGEN, keine Gesichtsdaten
   *  Der Server speichert NIE Fingerabdrücke. Er merkt sich nur:
   *  „Sperre an? nach wie vielen Minuten? Biometrie erlaubt?"
   * ------------------------------------------------------------------- */

  const LOCK_CHOICES = [0, 1, 5, 30, 60];

  app.get('/api/v426/lock', auth, h(async (req, res) => {
    const me = req.user;
    const p = me.privacy || {};
    res.json({
      enabled: me.appLock === true,
      autoLockMinutes: typeof p.autoLockMinutes === 'number' ? p.autoLockMinutes : 1,
      allowBiometric: me.allowBiometric === true,
      allowPin: me.allowPin !== false,
      screenshotBlock: p.screenshotBlock === true,
      choices: LOCK_CHOICES,
      note: 'Der Server speichert keine Fingerabdrücke und kein Gesicht — nur diese Schalter.',
    });
  }));

  app.post('/api/v426/lock', auth, h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};
    if (b.enabled !== undefined) me.appLock = !!b.enabled;
    if (b.allowBiometric !== undefined) {
      // Biometrie nur, wenn die Sperre überhaupt an ist — sonst sinnlos
      if (b.allowBiometric && me.appLock !== true) {
        return res.status(400).json({ error: 'Erst die App-Sperre einschalten', code: 'lock_off' });
      }
      me.allowBiometric = !!b.allowBiometric;
    }
    if (b.allowPin !== undefined) me.allowPin = !!b.allowPin;
    if (b.autoLockMinutes !== undefined) {
      const m = Number(b.autoLockMinutes);
      if (!LOCK_CHOICES.includes(m)) return res.status(400).json({ error: 'Nur ' + LOCK_CHOICES.join('/') + ' Minuten', code: 'bad_minutes', choices: LOCK_CHOICES });
      me.privacy = me.privacy || {};
      me.privacy.autoLockMinutes = m;
    }
    if (b.screenshotBlock !== undefined) {
      me.privacy = me.privacy || {};
      me.privacy.screenshotBlock = !!b.screenshotBlock;
    }
    saveDb();
    res.json({ ok: true, enabled: me.appLock === true, autoLockMinutes: (me.privacy || {}).autoLockMinutes, allowBiometric: me.allowBiometric === true, allowPin: me.allowPin !== false });
  }));

  /* ---------------------------------------------------------------------
   *  🛡️ Datenschutz — die 6 NEUEN Schlüssel (alte bleiben in security.js)
   * ------------------------------------------------------------------- */

  function ensureExtra(u) {
    u.privacy = u.privacy || {};
    for (const k of NEW_PRIVACY_KEYS) {
      if (u.privacy[k] === undefined) u.privacy[k] = JSON.parse(JSON.stringify(PRIVACY_EXTRA[k]));
    }
    return u.privacy;
  }

  app.get('/api/v426/privacy', auth, h(async (req, res) => {
    const p = ensureExtra(req.user);
    const out = {};
    for (const k of NEW_PRIVACY_KEYS) out[k] = p[k];
    res.json({
      privacy: out,
      choices: PRIVACY_CHOICES,
      extra: {
        readReceipts: (req.user.privacy || {}).readReceipts !== false,
        lastSeenPrivacy: (req.user.privacy || {}).lastSeenPrivacy || 'all',
        screenshotBlock: (req.user.privacy || {}).screenshotBlock === true,
      },
    });
  }));

  app.post('/api/v426/privacy', auth, h(async (req, res) => {
    const me = req.user;
    ensureExtra(me);
    const b = req.body || {};
    const changed = [];

    for (const [k, allowed] of Object.entries(PRIVACY_CHOICES)) {
      if (b[k] === undefined) continue;
      const v = String(b[k]);
      if (!allowed.includes(v)) {
        return res.status(400).json({ error: `Ungültig für ${k}`, code: 'bad_choice', allowed });
      }
      me.privacy[k] = v;
      changed.push(k);
    }

    for (const k of ['lastSeenHideFrom', 'profilePhotoHideFrom']) {
      if (b[k] === undefined) continue;
      if (!Array.isArray(b[k])) return res.status(400).json({ error: k + ' muss eine Liste sein', code: 'bad_list' });
      // Nur existierende Nutzer, keine Dubletten, max 200
      const ids = Array.from(new Set(b[k].map(String))).filter((id) => db.users[id]).slice(0, 200);
      me.privacy[k] = ids;
      changed.push(k);
    }

    if (b.safetyCodeShown !== undefined) {
      me.privacy.safetyCodeShown = !!b.safetyCodeShown;
      changed.push('safetyCodeShown');
    }

    saveDb();
    const out = {};
    for (const k of NEW_PRIVACY_KEYS) out[k] = me.privacy[k];
    res.json({ ok: true, changed, privacy: out });
  }));

  /* ---------------------------------------------------------------------
   *  🚫 Blockieren/Melden — Prüfung, dass es wirklich existiert
   *  (v4.js hat die Routen; hier nur ein Sammel-Endpunkt für die UI,
   *   damit die Sicherheitsseite EINEN Aufruf braucht.)
   * ------------------------------------------------------------------- */
  app.get('/api/v426/blocked', auth, h(async (req, res) => {
    const me = req.user;
    const map = (db.blocks || {})[me.id] || {};
    const ids = Object.keys(map).filter((id) => db.users[id]);
    res.json({
      blocked: ids.map((id) => ({ id, displayName: db.users[id].displayName, username: db.users[id].username, avatar: db.users[id].avatar || '💗', at: map[id] || null })),
      count: ids.length,
    });
  }));

  /* ---------------------------------------------------------------------
   *  📊 Sicherheits-Übersicht: ein Aufruf für die Sicherheitsseite
   * ------------------------------------------------------------------- */
  app.get('/api/v426/security', auth, h(async (req, res) => {
    const me = req.user;
    const p = ensureExtra(me);
    const has2fa = !!(me.twoFactor && me.twoFactor.enabled) || !!(me.totp && me.totp.enabled) || !!(db.twofa && db.twofa[me.id]);
    const blockedMap = (db.blocks || {})[me.id] || {};
    const sessions = Object.entries(db.tokens || {}).filter(([, uid]) => uid === me.id).length;

    const items = [
      { id: 'twofa', label: '2-Step-Verifizierung (TOTP)', on: has2fa, weight: 30, hint: has2fa ? 'an' : 'einschalten — sonst kein Haken für Inhaber/Bot' },
      { id: 'appLock', label: 'App-Sperre', on: me.appLock === true, weight: 15, hint: 'PIN/Biometrie beim Öffnen' },
      { id: 'biometric', label: 'Biometrie erlaubt', on: me.allowBiometric === true, weight: 10, hint: 'Fingerabdruck/Face ID' },
      { id: 'screenshotBlock', label: 'Screenshots blockieren', on: (me.privacy || {}).screenshotBlock === true, weight: 10, hint: 'FLAG_SECURE in der App' },
      { id: 'readReceipts', label: 'Lesebestätigungen', on: (me.privacy || {}).readReceipts !== false, weight: 5, hint: 'blau = gelesen' },
      { id: 'lastSeen', label: 'Zuletzt online eingeschränkt', on: ((me.privacy || {}).lastSeenPrivacy || 'all') !== 'all', weight: 10, hint: 'nicht für alle sichtbar' },
      { id: 'backup', label: 'Verschlüsseltes Backup', on: !!me.lastBackupAt, weight: 10, hint: me.lastBackupAt ? 'zuletzt ' + new Date(me.lastBackupAt).toISOString().slice(0, 10) : 'noch keins' },
      { id: 'safetyCode', label: 'Sicherheitscode sichtbar', on: p.safetyCodeShown !== false, weight: 10, hint: '60 Ziffern zum Vergleichen' },
    ];
    const score = items.reduce((n, i) => n + (i.on ? i.weight : 0), 0);
    res.set('Cache-Control', 'no-store');
    res.json({
      score,
      maxScore: items.reduce((n, i) => n + i.weight, 0),
      grade: score >= 90 ? 'sehr sicher' : score >= 65 ? 'gut' : score >= 35 ? 'ausbaufähig' : 'schwach',
      items,
      sessions,
      blocked: Object.keys(blockedMap).length,
      sounds: allSounds().length,
      note: 'Diese Zahl ist aus den Schaltern gerechnet — nicht geschätzt.',
    });
  }));

  console.log(`🔒 V4.26 aktiv — ${allSounds().length} Töne (30 + 10 Lovechen) · 5 Klingeltöne · AES-256-GCM-Backup · Sicherheitscode · App-Sperre · 6 neue Datenschutz-Schalter`);

  return {
    init() { /* kein Anlauf nötig — alles hängt an req.user */ },
    allSounds,
    soundById,
    RINGTONES,
    seal,
    open,
    safetyNumber,
    backupPayload,
    NEW_SOUNDS,
    PRIVACY_EXTRA,
    ROUTES: [
      'GET  /api/v426/sounds            (40 Töne + 5 Klingeltöne)',
      'POST /api/v426/sounds            (default | ringtone | vol | vibrate)',
      'POST /api/v426/backup            (AES-256-GCM, Selbstprüfung)',
      'POST /api/v426/backup/verify     (nur prüfen)',
      'POST /api/v426/backup/restore    (nur eigenes Backup)',
      'GET  /api/v426/safety-code/:userId',
      'GET  /api/v426/lock  POST /api/v426/lock',
      'GET  /api/v426/privacy  POST /api/v426/privacy',
      'GET  /api/v426/blocked',
      'GET  /api/v426/security          (Punktzahl aus Schaltern)',
    ],
  };
}

module.exports = { createV426, NEW_SOUNDS, RINGTONES, PRIVACY_EXTRA, NEW_PRIVACY_KEYS, PRIVACY_CHOICES, VIB_DEFAULT };
