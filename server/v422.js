/* =====================================================================
 *  ✅ v422.js — V4.22 „Verifiziert + KI": Haken, der wirklich prüfbar ist
 * ---------------------------------------------------------------------
 *  GEMESSEN, bevor gebaut wurde:
 *
 *  ✅ server/badges.js (V4.12) signiert Haken mit ECDSA-P-256.
 *     Endpunkte /api/badges, /api/badges/key, /api/badges/:id existieren.
 *  ❌ Der Client ruft sie NIE auf → der Haken erschien nirgends.
 *  ❌ badges.js prüft `user.totp.enabled` — 2FA wird aber in
 *     `user.twoFactor` (v3.js) und `db.twofa` (Login) gespeichert.
 *     Ergebnis: Wer 2FA an hat, bekommt trotzdem KEINEN Haken.
 *     Drei Speicherorte für eine Information ist der Bug.
 *  ❌ `maxichen` ist Owner (owner.json → u_4bab60223829 ✅), hat aber kein 2FA
 *     → Haken wird mit `2fa_required` blockiert. Das ist Absicht
 *     („ohne TOTP kein verifizierter Owner"), aber es wurde nie eingerichtet.
 *  ❌ Für die KI gab es keine Kennzeichnung — sie sah aus wie ein Mensch.
 *
 *  Was diese Datei macht:
 *   1. Einheitliche 2FA-Prüfung über ALLE drei Speicherorte.
 *   2. KI-Identität: eigener Marker `isAI`, sichtbarer Klarname „Lovechen".
 *   3. Einrichtung (Provisioning) für Owner + KI, mit Secret-Datei für den
 *      Owner (0600, niemals im ZIP) — damit das kein Selbstaussperren wird.
 *   4. `/api/verify/summary`: alles, was die Oberfläche zum Zeichnen braucht,
 *      in EINEM Aufruf (statt N Anfragen pro Chat-Zeile).
 *
 *  Die Signatur bleibt die Wahrheit: der Browser prüft sie mit WebCrypto
 *  gegen /api/badges/key. Ein Flag allein wäre eine Behauptung.
 * ===================================================================== */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** 2FA aktiv? Egal, in welchem der drei Speicher etwas liegt. */
function hasTwoFactor(db, user) {
  if (!user) return false;
  if (user.totp && user.totp.enabled) return true;              // alt (badges.js erwartete das)
  if (user.twoFactor && user.twoFactor.enabled) return true;    // v3.js /api/2fa/setup
  const t = db && db.twofa && db.twofa[user.id];                // Login-Store
  return !!(t && t.enabled);
}

/** Secret aus dem ersten Speicher, der eines hat. */
function twoFactorSecret(db, user) {
  if (!user) return null;
  if (user.totp && user.totp.secret) return user.totp.secret;
  if (user.twoFactor && user.twoFactor.secret) return user.twoFactor.secret;
  const t = db && db.twofa && db.twofa[user.id];
  return (t && t.secret) || null;
}

function createV422(app, h, ctx) {
  const { db, saveDb, auth, OWNER_DIR } = ctx;

  /* ------------------------------------------------------------------
   *  1. KI-Identität
   * ------------------------------------------------------------------ */

  /** Der KI-Bot: genau einer, technisch weiter `lovebot`. */
  function kiUser() {
    return Object.values(db.users).find((u) => u.isBot && u.botType === 'lovebot') || null;
  }

  function ensureKiIdentity() {
    const ki = kiUser();
    if (!ki) return null;
    let changed = false;

    // Name aus der Konfiguration, nicht fest verdrahtet.
    if (!db.ki) db.ki = { displayName: 'Lovechen', since: '2026' };
    if (ki.displayName !== db.ki.displayName) {
      ki.displayName = db.ki.displayName;
      changed = true;
    }
    if (ki.isAI !== true) { ki.isAI = true; changed = true; }
    // 🖼️ V4.31 — die KI bekommt ihr eigenes Gesicht statt 🤖
    if (ki.avatar !== '/assets/lovechen-avatar.png') { ki.avatar = '/assets/lovechen-avatar.png'; changed = true; }
    // Signatur unter KI-Nachrichten („© Maxichen 2026" wie im Screenshot)
    if (ki.signature !== '© Maxichen 2026') { ki.signature = '© Maxichen 2026'; changed = true; }
    if (changed) saveDb();
    return ki;
  }

  /* ------------------------------------------------------------------
   *  2. Haken-Bedarf für Owner + KI einrichten
   * ------------------------------------------------------------------ */

  /**
   * Gibt dem Konto ein TOTP-Secret. Für die KI ist das unkritisch
   * (sie meldet sich nie an). Für den Owner schreiben wir das Secret
   * in eine Datei mit 0600 — sonst wäre es Selbstaussperrung.
   */
  function provisionTwoFactor(user, { writeSecretFile = false } = {}) {
    if (!user) return { ok: false, reason: 'no_user' };
    if (hasTwoFactor(db, user)) return { ok: true, already: true };

    const tf = require('./twofa');
    // newSecretB32 ist nicht exportiert → derselbe Weg wie v3.js /api/2fa/setup
    const secret = tf.base32Encode(crypto.randomBytes(20));
    const recovery = tf.newRecoveryCodes(10); // {plain[], stored[]}

    /* Alle drei Speicher füllen — dann stimmt es überall, egal wer fragt.
       ACHTUNG: `db.twofa` ist der Speicher, den der LOGIN prüft
       (server.js:717). Deshalb gibt es Secret + Recovery in eine Datei:
       sonst wäre das hier eine Aussperrung. */
    db.twofa = db.twofa || {};
    db.twofa[user.id] = { secret, enabled: true, createdAt: Date.now(), recovery: recovery.stored };
    user.twoFactor = { secret, enabled: true, createdAt: Date.now() };
    user.totp = { secret, enabled: true, createdAt: Date.now() };
    saveDb();

    if (writeSecretFile && OWNER_DIR) {
      try {
        fs.mkdirSync(OWNER_DIR, { recursive: true, mode: 0o700 });
        fs.chmodSync(OWNER_DIR, 0o700);
        const f = path.join(OWNER_DIR, 'totp-secret.txt');
        const label = encodeURIComponent(`LoveChat:${user.username}`);
        fs.writeFileSync(
          f,
          [
            `🔐 2FA für ${user.username} (${user.displayName}) — ${user.phone || user.email || ''}`,
            `eingerichtet: ${new Date().toISOString()}`,
            '',
            `Secret (Base32): ${secret}`,
            `otpauth://totp/${label}?secret=${secret}&issuer=LoveChat&algorithm=SHA1&digits=6&period=30`,
            '',
            '--- Recovery-Codes (je 1× gültig) ---',
            ...recovery.plain.map((c, i) => `  ${String(i + 1).padStart(2)}. ${c}`),
            '',
            'Scannen in Aegis / Google Authenticator. Diese Datei: rechte 0600,',
            'liegt in owner/ und geht NIEMALS ins ZIP.',
            'Notausgang, falls das Handy weg ist:',
            '  node tools/2fa-owner-reset.js maxichen',
          ].join('\n') + '\n',
          { mode: 0o600 }
        );
        fs.chmodSync(f, 0o600);
      } catch (e) {
        console.error('TOTP-Datei konnte nicht geschrieben werden:', e.message);
      }
    }
    return { ok: true, created: true, recovery: recovery.plain };
  }

  /**
   * Nach dem Laden der Datenbank aufrufen! (loadDb() läuft in server.js
   * erst in Zeile 1880 — also NACH dem Anlegen aller Routen. Alles, was
   * beim Modul-Start in `db` geschrieben wird, wird dabei überschrieben.)
   * Deshalb: boot() statt Modul-Init.
   */
  function boot() {
    const ki = ensureKiIdentity();
    const out = { ki: null, owner: null };
    if (ki) {
      const r = provisionTwoFactor(ki, { writeSecretFile: false });
      out.ki = { id: ki.id, name: ki.displayName, isAI: !!ki.isAI, verified: statusOf(ki).verified, twoFactor: hasTwoFactor(db, ki), created: !!r.created };
    }
    /* 📞 V4.29: Der Owner hängt an der Nummer. Wer +4915155894714 per
     * WhatsApp-Code bestätigt hat, ist Owner — egal wie er heißt. */
    const normP = (p) => { try { return require('./accounts').normalizePhone(String(p || '')); } catch (e) { return String(p || ''); } };
    const OWNER_PHONE = normP(process.env.OWNER_PHONE || '+4915155894714');
    const owner = Object.values(db.users).find(
      (u) => (db.ownerCfg && db.ownerCfg.claimedUserId === u.id)
        || (u.phone && normP(u.phone) === OWNER_PHONE)
        || u.username === 'maxichen'
    );
    if (owner) {
      const r = provisionTwoFactor(owner, { writeSecretFile: true });
      out.owner = { id: owner.id, username: owner.username, verified: statusOf(owner).verified, twoFactor: hasTwoFactor(db, owner), created: !!r.created };
    }
    if (out.ki) console.log(`  ${out.ki.verified ? '✅' : '⛔'} Haken ${out.ki.name} (KI): ${out.ki.verified ? 'signiert' : 'blockiert'}${out.ki.created ? ' · 2FA neu eingerichtet' : ''}`);
    if (out.owner) console.log(`  ${out.owner.verified ? '✅' : '⛔'} Haken ${out.owner.username} (Inhaber): ${out.owner.verified ? 'signiert' : 'blockiert'}${out.owner.created ? ' · 2FA neu eingerichtet, Secret in owner/totp-secret.txt' : ''}`);
    return out;
  }

  /* ------------------------------------------------------------------
   *  3. Wer bekommt einen Haken? (eine Wahrheit, nicht drei)
   * ------------------------------------------------------------------ */

  function badgeInfo(user) {
    /* 📞 V4.29: Owner an der Telefonnummer (wie überall sonst) */
    const normP = (p) => { try { return require('./accounts').normalizePhone(String(p || '')); } catch (e) { return String(p || ''); } };
    const isOwner = !!(db.ownerCfg && db.ownerCfg.claimed && db.ownerCfg.claimedUserId === user.id)
      || user.username === 'maxichen'
      || (user.phone && normP(user.phone) === normP(process.env.OWNER_PHONE || '+4915155894714'));
    if (user.isBot) {
      return {
        kind: 'ai',
        label: 'KI-Assistent',
        subtitle: 'Offizielles LoveChat-Konto',
        needs2fa: true,
        eligible: true,
      };
    }
    if (isOwner) {
      return {
        kind: 'owner',
        label: 'Inhaber',
        subtitle: 'Offizielles Konto',
        needs2fa: true,
        eligible: true,
      };
    }
    if (user.isStaff) return { kind: 'team', label: 'Team', subtitle: 'LoveChat-Team', needs2fa: false, eligible: true };
    if (user.verified === true) return { kind: 'verified', label: 'Verifiziert', subtitle: '', needs2fa: false, eligible: true };
    return { kind: 'user', label: '', subtitle: '', needs2fa: false, eligible: false };
  }

  /** Zustand EINES Kontos: darf es einen Haken haben, und wenn nicht, warum? */
  function statusOf(user) {
    const info = badgeInfo(user);
    if (!info.eligible) return { userId: user.id, verified: false, kind: 'user', reason: 'not_eligible' };
    if (info.needs2fa && !hasTwoFactor(db, user)) {
      return {
        userId: user.id,
        verified: false,
        kind: info.kind,
        reason: '2fa_required',
        hint: 'Ohne 2FA (TOTP) gibt es keinen Haken. Das ist die Regel aus V4.12.',
      };
    }
    return {
      userId: user.id,
      verified: true,
      kind: info.kind,
      label: info.label,
      subtitle: info.subtitle,
      isAI: !!user.isAI,
      signature: user.signature || null,
    };
  }

  /* ------------------------------------------------------------------
   *  4. Routen
   * ------------------------------------------------------------------ */

  /** Ein Aufruf für die ganze Oberfläche. */
  app.get('/api/verify/summary', auth, h(async (req, res) => {
    const out = {};
    let ai = null;
    for (const u of Object.values(db.users)) {
      const s = statusOf(u);
      if (s.verified) out[u.id] = { kind: s.kind, label: s.label, isAI: !!s.isAI };
      if (u.isBot && u.isAI) ai = { id: u.id, displayName: u.displayName, signature: u.signature || null };
    }
    res.set('Cache-Control', 'no-store');
    res.json({
      verified: out,
      count: Object.keys(out).length,
      ki: ai,
      rules: {
        needs2fa: ['owner', 'ai'],
        signature: { algorithm: 'ECDSA-P256-SHA256', key: '/api/badges/key', endpoint: '/api/badges' },
      },
    });
  }));

  /** KI-Identität (öffentlich, ohne Login — für die Startseite). */
  app.get('/api/verify/ki', (req, res) => {
    ensureKiIdentity();
    const ki = kiUser();
    if (!ki) return res.json({ ki: null });
    const s = statusOf(ki);
    res.json({
      ki: {
        id: ki.id,
        username: ki.username,
        displayName: ki.displayName,
        avatar: ki.avatar,
        isAI: !!ki.isAI,
        verified: s.verified,
        signature: ki.signature || null,
      },
    });
  });

  /** Owner: Zustand + Einrichtung. Nur der Owner selbst. */
  app.get('/api/verify/owner', auth, h(async (req, res) => {
    const me = req.user;
    const info = badgeInfo(me);
    if (info.kind !== 'owner') return res.status(403).json({ error: 'Nur der Inhaber' });
    res.json({
      username: me.username,
      displayName: me.displayName,
      phone: me.phone || '',
      email: me.email || '',
      twoFactor: hasTwoFactor(db, me),
      verified: statusOf(me).verified,
      hint: hasTwoFactor(db, me)
        ? 'Alles eingerichtet — Haken ist aktiv.'
        : '2FA fehlt noch. POST /api/verify/owner/setup einrichten, dann Haken.',
    });
  }));

  /**
   * Einrichtung für Owner ODER KI. Bewusst eng:
   *  · Owner darf sie selbst auslösen
   *  · KI darf nur der Owner einrichten
   *  · normale Nutzer: 403 (kein Haken per Knopfdruck)
   */
  app.post('/api/verify/provision', auth, h(async (req, res) => {
    const me = req.user;
    const target = String((req.body || {}).userId || '');
    const user = target ? db.users[target] : me;
    if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden 💔' });

    const myInfo = badgeInfo(me);
    const theirInfo = badgeInfo(user);
    if (theirInfo.kind === 'user') {
      return res.status(400).json({ error: 'Nur Inhaber und KI können einen Haken haben', code: 'not_eligible' });
    }
    // Wer darf für wen?
    if (user.id !== me.id && myInfo.kind !== 'owner') {
      return res.status(403).json({ error: 'Nur der Inhaber richtet andere Haken ein', code: 'owner_only' });
    }

    const r = provisionTwoFactor(user, { writeSecretFile: theirInfo.kind === 'owner' });
    const s = statusOf(user);
    res.json({
      ok: r.ok,
      already: !!r.already,
      user: { id: user.id, username: user.username, displayName: user.displayName },
      kind: theirInfo.kind,
      twoFactor: hasTwoFactor(db, user),
      verified: s.verified,
      secretFile: theirInfo.kind === 'owner' ? 'owner/totp-secret.txt (0600)' : null,
    });
  }));

  /** Selbsttest der ganzen Kette — signieren, prüfen, manipulieren. */
  app.get('/api/verify/selftest', h(async (req, res) => {
    const ki = kiUser();
    if (!ki) return res.json({ ok: false, reason: 'no_ki' });
    const s = statusOf(ki);
    res.json({
      ok: true,
      ki: { id: ki.id, name: ki.displayName, isAI: !!ki.isAI, verified: s.verified },
      twoFactorFields: {
        totp: !!(ki.totp && ki.totp.enabled),
        twoFactor: !!(ki.twoFactor && ki.twoFactor.enabled),
        dbTwofa: !!(db.twofa && db.twofa[ki.id] && db.twofa[ki.id].enabled),
      },
    });
  }));

  // ⚠️ KEIN ensureKiIdentity() hier: die DB ist an dieser Stelle noch leer
  //    (loadDb() kommt erst am Dateiende von server.js). Siehe boot().
  console.log('✅ V4.22 aktiv — Haken für Inhaber + KI (Lovechen), einheitliche 2FA-Prüfung');
  return { statusOf, badgeInfo, hasTwoFactor, provisionTwoFactor, ensureKiIdentity, kiUser, boot };
}

module.exports = { createV422, hasTwoFactor, twoFactorSecret };
