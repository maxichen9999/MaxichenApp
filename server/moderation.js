'use strict';
/**
 * 👑 LoveChat — Owner- & Moderationssystem
 * by maxi⁹¹⁰
 *
 * Regeln:
 *  - Es gibt genau EINEN Owner. Er wird NICHT über ein Formular/HTTP-Feld gesetzt,
 *    sondern nur einmalig über den Setup-Key + passende Telefonnummer/E-Mail.
 *  - Jede geschützte Aktion prüft den Kontostatus serverseitig.
 *  - Sperren beenden Sitzungen sofort (Token weg + WebSocket zu).
 *  - Alles wird protokolliert (wer, was, wann, warum).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ---------- Rollen ---------- */
const RANKS = { user: 0, support: 20, moderator: 40, admin: 60, superadmin: 80, owner: 100 };
const ROLE_LABELS = {
  user: 'Benutzer',
  support: 'Support',
  moderator: 'Moderator',
  admin: 'Admin',
  superadmin: 'Superadmin',
  owner: 'Owner',
};
const ASSIGNABLE = ['support', 'moderator', 'admin', 'superadmin']; // owner nie per API

/* ---------- Owner-Konfiguration ---------- */
const OWNER_USERNAME = 'maxichen';   // 👑 NUR dieser Account darf sperren
const OWNER_PHONE = '+91515589471';
const OWNER_EMAIL = 'owner@maxichen.de';

/* Alles, was eine Sperre ist – darf NUR der Owner. */
const BAN_ACTIONS = ['warn', 'mute', 'tempban', 'futureban', 'permaban', 'unban', 'groupban', 'role'];

function createModeration(ctx) {
  const { dataDir, db, saveDb, nextId, sendToUser, closeUserSockets, closeTokenSockets, onlineUsers } = ctx;
  const OWNER_FILE = path.join(dataDir, 'owner.json');

  let ownerCfg = {
    phone: OWNER_PHONE,
    email: OWNER_EMAIL,
    claimed: false,
    claimedUserId: null,
    setupKey: null,
    claimedAt: null,
  };

  function loadOwner() {
    try {
      if (fs.existsSync(OWNER_FILE)) {
        const d = JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8'));
        ownerCfg = Object.assign(ownerCfg, d);
      }
    } catch (e) {
      console.error('⚠️  owner.json konnte nicht geladen werden:', e.message);
    }
    /* 📞 V4.29: kein Setup-Code mehr. Wer die Owner-Nummer beweist, ist
     * Owner. `claimed` bleibt für alte Installationen lesbar. */
    ownerCfg.phone = process.env.OWNER_PHONE || ownerCfg.phone || OWNER_PHONE;
    ownerCfg.email = ownerCfg.email || OWNER_EMAIL;
    ownerCfg.boundTo = 'phone';
    saveOwner();
    printOwnerInstructions();
  }

  function saveOwner() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = OWNER_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(ownerCfg, null, 2));
      fs.renameSync(tmp, OWNER_FILE);
    } catch (e) {
      console.error('⚠️  owner.json speichern fehlgeschlagen:', e.message);
    }
  }

  function printOwnerInstructions() {
    /* 📞 V4.29: Der Owner wird nicht mehr „beansprucht", sondern erkennt
     * sich beim Anmelden an der Nummer. Ein Setup-Code ist nicht nötig. */
    const holder = Object.values(db.users || {}).find((u) => isOwnerPhone(u));
    if (holder) {
      console.log(`👑 Owner: @${holder.username} (${holder.id}) — erkannt an der Nummer ${ownerPhoneWant()}`);
      return;
    }
    console.log(`  📞 Owner-Nummer vorgemerkt: ${ownerPhoneWant()}`);
    console.log('     Wer sich mit dieser Nummer anmeldet, ist automatisch Owner 👑');
    console.log('     (kein Setup-Code nötig — die Nummer ist der Beweis).');
    if (ownerCfg.setupKey) console.log('     Alternativ der alte Setup-Code: ' + ownerCfg.setupKey);
    return;
    /* eslint-disable no-unreachable */
    console.log('');
    console.log('  👑 ───────────── OWNER-SETUP ─────────────');
    console.log('   Registriere dich mit dieser Telefonnummer oder E-Mail:');
    console.log('     📞 ' + ownerCfg.phone);
    console.log('     ✉️  ' + ownerCfg.email);
    console.log('   Danach im Profil „👑 Owner werden“ öffnen und diesen Code eingeben:');
    console.log('     ' + ownerCfg.setupKey);
    console.log('   (Code steht auch in: data/owner-setup.txt)');
    console.log('  ──────────────────────────────────────────');
    console.log('');
    try {
      fs.writeFileSync(path.join(dataDir, 'owner-setup.txt'),
        `LoveChat Owner-Setup\n\nTelefon: ${ownerCfg.phone}\nE-Mail:  ${ownerCfg.email}\nSetup-Code: ${ownerCfg.setupKey}\n\nNach dem Einlösen wird dieser Code ungültig.\n`);
    } catch (e) {}
  }

  /* ---------- Rollen / Rechte ---------- */
  /* 📞 V4.29: Der Owner hängt an der TELEFONNUMMER, nicht an einem
   * Nutzerkonto. Grund: der Owner soll sich ganz normal mit Nummer +
   * WhatsApp-Code anmelden können — auch nachdem die Datenbank geleert
   * wurde. Die Nummer hat er bewiesen (er hat den Code bekommen), also ist
   * sie der Schlüssel.
   *
   * Reihenfolge:
   *   1. Nummer == OWNER_PHONE               → owner   (neu, ab V4.29)
   *   2. alter Weg: eingelöster Setup-Code    → owner   (bleibt gültig)
   *   3. `role`-Feld in der DB                → NIE owner
   */
  function normPhone(p) {
    try {
      const acc = require('./accounts');
      if (typeof acc.normalizePhone === 'function') return acc.normalizePhone(String(p || ''));
    } catch (e) {}
    return String(p || '').replace(/[^\d+]/g, '');
  }
  function ownerPhoneWant() {
    return normPhone(process.env.OWNER_PHONE || ownerCfg.phone || OWNER_PHONE);
  }

  function isOwnerPhone(u) {
    return !!(u && u.phone && normPhone(u.phone) === ownerPhoneWant());
  }

  function roleOf(u) {
    if (!u) return 'user';
    if (ownerCfg.claimed && u.id === ownerCfg.claimedUserId && u.username === OWNER_USERNAME) return 'owner';
    if (isOwnerPhone(u)) return 'owner';
    if (u.role === 'owner') return 'user'; // "owner" per DB-Feld ist wertlos
    return RANKS[u.role] !== undefined ? u.role : 'user';
  }
  const rankOf = (u) => RANKS[roleOf(u)] || 0;
  const isOwner = (u) => !!u && roleOf(u) === 'owner';
  const isStaff = (u) => rankOf(u) >= RANKS.moderator || isOwner(u);

  /** 🔒 Die eine Regel: bannen darf ausschließlich der Owner. */
  const canBan = (u) => isOwner(u);

  /* ---------- Sperren ---------- */
  function bansOf(u) {
    if (!Array.isArray(u.bans)) u.bans = [];
    return u.bans;
  }

  /** Läuft durch alle Sperren: aktiviert Future-Bans, hebt abgelaufene Temp-Bans automatisch auf. */
  function refreshBans(u) {
    if (!u) return false;
    let changed = false;
    const now = Date.now();
    for (const b of bansOf(u)) {
      if (b.revoked) continue;
      if (b.type === 'temp' && b.until && b.until <= now) {
        b.revoked = true;
        b.revokedAt = now;
        b.revokedBy = 'system';
        b.autoUnban = true;
        changed = true;
        logAction(null, u, 'AUTO-UNBAN', 'Zeitstrafe abgelaufen');
      }
      if (b.type === 'mute' && b.until && b.until <= now) {
        b.revoked = true;
        b.revokedAt = now;
        b.revokedBy = 'system';
        b.autoUnban = true;
        changed = true;
        logAction(null, u, 'AUTO-UNMUTE', 'Stummschaltung abgelaufen');
      }
      if (b.type === 'future' && !b.activated && b.startsAt && b.startsAt <= now) {
        b.activated = true;
        changed = true;
        logAction(null, u, 'FUTUREBAN:AKTIV', b.reason || 'geplante Sperre');
        kick(u.id, 'Deine geplante Sperre ist jetzt aktiv.');
      }
    }
    return changed;
  }

  /** Voll-Konto-Sperre (perm / temp / aktivierter future) */
  function activeAccountBan(u) {
    refreshBans(u);
    const now = Date.now();
    let best = null;
    for (const b of bansOf(u)) {
      if (b.revoked) continue;
      const active = b.type === 'perm'
        || (b.type === 'temp' && b.until > now)
        || (b.type === 'future' && b.activated && b.until > now);
      if (!active) continue;
      if (!best) { best = b; continue; }
      if (b.type === 'perm') best = b;                       // dauerhaft schlägt alles
      else if (best.type !== 'perm' && (b.until || 0) > (best.until || 0)) best = b; // sonst: läuft am längsten
    }
    return best;
  }

  function activeMute(u) {
    refreshBans(u);
    const now = Date.now();
    for (const b of bansOf(u)) {
      if (b.revoked) continue;
      if (b.type === 'mute' && b.until > now) return b;
    }
    return null;
  }

  function groupBanFor(u, chatId) {
    refreshBans(u);
    for (const b of bansOf(u)) {
      if (b.revoked) continue;
      if (b.type === 'groupban' && b.chatId === chatId) return b;
    }
    return null;
  }

  function banPublic(b) {
    if (!b) return null;
    return {
      id: b.id,
      type: b.type,
      reason: b.reason || '',
      until: b.until || null,
      startsAt: b.startsAt || null,
      activated: !!b.activated,
      chatId: b.chatId || null,
      byName: b.byName || 'Team',
      at: b.at,
    };
  }

  /** 🚫 Klartext für den Ban-Screen: Grund + Dauer. */
  function banText(b) {
    if (!b) return 'Dein Konto ist gesperrt.';
    const reason = b.reason ? ` Grund: ${b.reason}` : '';
    const fmt = (ts) => {
      try {
        return new Date(ts).toLocaleString('de-DE', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
      } catch (e) { return ''; }
    };
    if (b.type === 'perm') return `Dein Konto wurde dauerhaft gesperrt.${reason} Du kannst Einspruch einlegen. 💗`;
    if (b.type === 'future') {
      const start = b.startsAt ? `Deine Sperre beginnt am ${fmt(b.startsAt)}` : 'Deine Sperre ist geplant';
      const end = b.until ? ` und endet am ${fmt(b.until)}` : '';
      return `${start}${end}.${reason}`;
    }
    if (b.until) return `Dein Konto ist gesperrt bis ${fmt(b.until)}.${reason}`;
    return `Dein Konto ist gesperrt.${reason}`;
  }

  /** Sitzungen sofort beenden */
  function kick(uid, message) {
    try {
      for (const [tok, id] of Object.entries(db.tokens)) {
        if (id === uid) delete db.tokens[tok];
      }
      if (onlineUsers) onlineUsers.delete(uid);
      if (closeUserSockets) closeUserSockets(uid, message);
      sendToUser(uid, { type: 'account:kicked', message: message || 'Dein Konto wurde gesperrt.' });
      saveDb();
    } catch (e) {}
  }

  /**
   * 🔧 V4.12: nur EIN Gerät abmelden. Nutzt die Token→Sockets-Zuordnung
   * aus server.js; fehlt sie (ältere Aufrufe), passiert einfach nichts —
   * der Token ist dann trotzdem schon ungültig.
   */
  function kickSocketOnly(token, message) {
    try { if (closeTokenSockets) closeTokenSockets(token, message); } catch (e) {}
  }

  /* ---------- Protokoll ---------- */
  function logAction(actor, target, action, reason, meta) {
    if (!Array.isArray(db.moderationLogs)) db.moderationLogs = [];
    const entry = {
      id: nextId('log_'),
      at: Date.now(),
      action,
      actorId: actor ? actor.id : null,
      actorName: actor ? actor.displayName : 'System',
      actorRole: actor ? roleOf(actor) : 'system',
      targetId: target ? target.id : null,
      targetName: target ? target.displayName : null,
      reason: reason || '',
      meta: meta || null,
    };
    db.moderationLogs.push(entry);
    if (db.moderationLogs.length > 5000) db.moderationLogs = db.moderationLogs.slice(-5000);
    saveDb();
    return entry;
  }

  /* ---------- Middleware ---------- */
  function banGate(req, res, next) {
    const u = req.user;
    if (!u) return next();
    if (isOwner(u)) return next();
    const ban = activeAccountBan(u);
    if (ban) {
      // Token sofort ungültig machen
      try { delete db.tokens[req.token]; saveDb(); } catch (e) {}
      return res.status(403).json({
        error: 'Dein Konto ist gesperrt.',
        code: 'banned',
        ban: banPublic(ban),
        appealAllowed: true,
      });
    }
    const mute = activeMute(u);
    if (mute && req.method !== 'GET') {
      const isReadOnly = /\/read$/.test(req.path) || /\/reaction$/.test(req.path);
      if (!isReadOnly) {
        return res.status(403).json({
          error: 'Du bist gerade stummgeschaltet.',
          code: 'muted',
          mute: banPublic(mute),
        });
      }
    }
    next();
  }

  /* ---------- Aktionen ---------- */
  const DUR = { '1h': 3600e3, '6h': 6 * 3600e3, '1d': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 };

  function canAct(actor, target, action, opts = {}) {
    if (!actor || !target) return 'Ungültig';
    if (!BAN_ACTIONS.includes(action)) return 'Unbekannte Aktion';

    // 🔒 Harte Regel: NUR der Owner darf sperren / verwarnen / stummschalten / Rollen ändern.
    if (!canBan(actor)) {
      return 'Nur Owner ' + OWNER_USERNAME + ' darf sperren 👑 (deine Rolle: ' + ROLE_LABELS[roleOf(actor)] + ')';
    }

    if (isOwner(target)) return 'Das Owner-Konto ist geschützt 👑';
    if (actor.id === target.id) {
      return 'Dich selbst kannst du nicht sperren 😅';
    }

    if (action === 'role') {
      const newRole = opts.role;
      if (newRole === 'owner') return 'Den Owner-Status kann man nicht vergeben 👑';
      if (!ASSIGNABLE.includes(newRole) && newRole !== 'user') return 'Ungültige Rolle';
    }
    return null;
  }

  /** Alte aktive Sperren aufheben, wenn eine neue gesetzt wird */
  function revokeActive(u, actor, now) {
    for (const b of bansOf(u)) {
      if (b.revoked) continue;
      const active = b.type === 'perm'
        || (b.type === 'temp' && b.until > now)
        || (b.type === 'future' && b.activated && b.until > now);
      if (!active) continue;
      b.revoked = true;
      b.revokedAt = now;
      b.revokedBy = actor ? actor.id : 'system';
      b.replacedBy = 'neue Sperre';
      logAction(actor, u, 'UNBAN', 'ersetzt durch neue Sperre');
    }
  }

  function applyAction(actor, target, action, body = {}) {
    refreshBans(target);
    const now = Date.now();
    const reason = String(body.reason || '').trim().slice(0, 300);
    const dur = DUR[body.duration] || (Number(body.days) ? Number(body.days) * DUR['1d'] : 0);

    let opts = {};
    if (action === 'tempban') opts.until = body.until ? new Date(body.until).getTime() : now + (dur || DUR['1d']);
    if (action === 'futureban') {
      opts.until = body.until ? new Date(body.until).getTime() : now + (dur || DUR['7d']);
      opts.startsAt = body.startsAt ? new Date(body.startsAt).getTime() : now;
    }
    if (action === 'role') opts.role = String(body.role || '');

    const err = canAct(actor, target, action, opts);
    if (err) return { error: err };

    switch (action) {
      case 'warn': {
        if (!Array.isArray(target.warnings)) target.warnings = [];
        target.warnings.push({ id: nextId('w_'), at: now, by: actor.id, byName: actor.displayName, reason });
        logAction(actor, target, 'WARN', reason);
        sendToUser(target.id, { type: 'moderation', action: 'warn', reason, byName: actor.displayName });
        saveDb();
        return { ok: true, message: `Verwarnung an ${target.displayName} gesendet` };
      }
      case 'mute': {
        bansOf(target).push({
          id: nextId('b_'), type: 'mute', reason, by: actor.id, byName: actor.displayName,
          at: now, until: now + (dur || DUR['1h']), revoked: false,
        });
        logAction(actor, target, 'MUTE', reason, { duration: body.duration || '1h' });
        sendToUser(target.id, { type: 'moderation', action: 'mute', reason, until: now + (dur || DUR['1h']) });
        saveDb();
        return { ok: true, message: `${target.displayName} ist jetzt stummgeschaltet` };
      }
      case 'tempban': {
        revokeActive(target, actor, now);
        bansOf(target).push({
          id: nextId('b_'), type: 'temp', reason, by: actor.id, byName: actor.displayName,
          at: now, until: opts.until, revoked: false,
        });
        logAction(actor, target, 'TEMPBAN', reason, { until: opts.until });
        kick(target.id, 'Dein Konto wurde vorübergehend gesperrt.');
        return { ok: true, message: `${target.displayName} ist bis ${new Date(opts.until).toLocaleString('de-DE')} gesperrt` };
      }
      case 'futureban': {
        revokeActive(target, actor, now);
        bansOf(target).push({
          id: nextId('b_'), type: 'future', reason, by: actor.id, byName: actor.displayName,
          at: now, startsAt: opts.startsAt, until: opts.until, activated: false, revoked: false,
        });
        logAction(actor, target, 'FUTUREBAN', reason, { startsAt: opts.startsAt, until: opts.until });
        sendToUser(target.id, { type: 'moderation', action: 'futureban', startsAt: opts.startsAt, until: opts.until, reason });
        saveDb();
        return { ok: true, message: `Geplante Sperre für ${target.displayName} gespeichert` };
      }
      case 'permaban': {
        revokeActive(target, actor, now);
        bansOf(target).push({
          id: nextId('b_'), type: 'perm', reason, by: actor.id, byName: actor.displayName,
          at: now, until: null, revoked: false,
        });
        logAction(actor, target, 'PERMABAN', reason);
        kick(target.id, 'Dein Konto wurde dauerhaft gesperrt.');
        return { ok: true, message: `${target.displayName} wurde dauerhaft gesperrt` };
      }
      case 'groupban': {
        const chat = db.chats[body.chatId];
        if (!chat) return { error: 'Chat nicht gefunden' };
        if (!chat.memberIds.includes(target.id)) return { error: 'Person ist nicht in diesem Chat' };
        chat.memberIds = chat.memberIds.filter((id) => id !== target.id);
        bansOf(target).push({
          id: nextId('b_'), type: 'groupban', chatId: chat.id, reason,
          by: actor.id, byName: actor.displayName, at: now, revoked: false,
        });
        logAction(actor, target, 'GROUPBAN', reason, { chatId: chat.id, chatName: chat.name });
        for (const uid of chat.memberIds) {
          sendToUser(uid, { type: 'chat:deleted', chatId: chat.id });
        }
        sendToUser(target.id, { type: 'chat:deleted', chatId: chat.id });
        saveDb();
        return { ok: true, message: `${target.displayName} aus „${chat.name}“ entfernt` };
      }
      case 'unban': {
        let n = 0;
        for (const b of bansOf(target)) {
          if (!b.revoked && ['perm', 'temp', 'future', 'mute', 'groupban'].includes(b.type)) {
            b.revoked = true; b.revokedAt = now; b.revokedBy = actor.id; n++;
          }
        }
        if (!n) return { error: 'Keine aktive Sperre vorhanden' };
        logAction(actor, target, 'UNBAN', reason || 'Sperre aufgehoben');
        sendToUser(target.id, { type: 'moderation', action: 'unban', byName: actor.displayName });
        saveDb();
        return { ok: true, message: `Sperre(n) von ${target.displayName} aufgehoben` };
      }
      case 'role': {
        const oldRole = roleOf(target);
        if (opts.role === 'user') delete target.role;
        else target.role = opts.role;
        logAction(actor, target, 'ROLE', reason, { from: oldRole, to: opts.role });
        sendToUser(target.id, { type: 'moderation', action: 'role', role: opts.role, byName: actor.displayName });
        saveDb();
        return { ok: true, message: `Rolle von ${target.displayName}: ${ROLE_LABELS[opts.role] || opts.role}` };
      }
      default:
        return { error: 'Unbekannte Aktion' };
    }
  }

  /* ---------- Owner claim ---------- */
  function claimOwner(user, key) {
    if (ownerCfg.claimed) return { error: 'Owner ist bereits eingerichtet 👑' };
    if (!key || !ownerCfg.setupKey) return { error: 'Kein Setup-Code angegeben' };
    const a = Buffer.from(String(key));
    const b = Buffer.from(String(ownerCfg.setupKey));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { error: 'Setup-Code falsch' };
    const phoneOk = user.phone && user.phone.replace(/\s/g, '') === ownerCfg.phone.replace(/\s/g, '');
    const mailOk = user.email && String(user.email).toLowerCase() === ownerCfg.email.toLowerCase();
    if (!phoneOk && !mailOk) {
      return { error: `Dein Konto braucht zuerst die Owner-Telefonnummer (${ownerCfg.phone}) oder E-Mail (${ownerCfg.email}).` };
    }
    ownerCfg.claimed = true;
    ownerCfg.claimedUserId = user.id;
    ownerCfg.claimedAt = Date.now();
    ownerCfg.setupKey = null;
    saveOwner();
    try { fs.unlinkSync(path.join(dataDir, 'owner-setup.txt')); } catch (e) {}
    delete user.role;
    logAction(null, user, 'OWNER-CLAIM', 'Owner-Konto eingerichtet');
    saveDb();
    console.log('👑 Owner eingerichtet: @' + user.username);
    return { ok: true };
  }

  /** +4915155894714 -> +4915•••••714  (nur fürs Anzeigen) */
  function maskPhone(p) {
    const s = String(p || '');
    if (s.length < 8) return s;
    return s.slice(0, 5) + '•••••' + s.slice(-3);
  }
  function maskEmail(e) {
    const s = String(e || '');
    const at = s.indexOf('@');
    if (at < 2) return s;
    return s[0] + '•••' + s.slice(at);
  }

  function ownerInfo() {
    const u = ownerCfg.claimedUserId ? db.users[ownerCfg.claimedUserId] : null;
    return {
      claimed: ownerCfg.claimed,
      username: u ? u.username : null,
      displayName: u ? u.displayName : null,
      phoneHint: maskPhone(ownerCfg.phone),
      emailHint: maskEmail(ownerCfg.email),
      phoneFull: ownerCfg.phone,
      emailFull: ownerCfg.email,
    };
  }

  /* ---------- Periodischer Check ---------- */
  function startScheduler() {
    setInterval(() => {
      let changed = false;
      for (const u of Object.values(db.users)) {
        if (refreshBans(u)) changed = true;
      }
      if (changed) saveDb();
    }, 30000).unref?.();
  }

  return {
    RANKS, ROLE_LABELS, ASSIGNABLE, OWNER_USERNAME, BAN_ACTIONS, canBan,
    loadOwner, printOwnerInstructions, ownerInfo, claimOwner,
    roleOf, rankOf, isOwner, isStaff,
    refreshBans, activeAccountBan, activeMute, groupBanFor, banPublic,
    banGate, logAction, applyAction, canAct, kick, closeTokenSockets, startScheduler, banText,
    get ownerCfg() { return ownerCfg; },
  };
}

module.exports = { createModeration, RANKS, ROLE_LABELS, RANKS_LIST: Object.keys(RANKS), OWNER_USERNAME, BAN_ACTIONS };
