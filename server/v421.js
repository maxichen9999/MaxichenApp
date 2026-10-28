/* =====================================================================
 *  👑 v421.js — V4.21 Block C: Rechte, Einladungen, Communities
 * ---------------------------------------------------------------------
 *  Vorgeschichte (gemessen, nicht geraten — `grep -R` über server/):
 *
 *  Der Server konnte schon mehr, als die Oberfläche zeigte:
 *    ✅ Chat-Typen private/group/channel/community
 *    ✅ Untergruppen in Communities      POST /api/chats/:id/groups
 *    ✅ Felder description + adminIds     (gespeichert UND ausgeliefert)
 *    ✅ isChatAdmin() liest adminIds
 *    ✅ Mitglieder hinzufügen             POST /api/chats/:id/members
 *    ✅ Kanäle: nur Admin schreibt
 *
 *  Was WIRKLICH fehlte — und der Grund für diese Datei:
 *    ❌ Mitglied rauswerfen               → DELETE /api/chats/:id/members/:uid
 *    ❌ Admin geben/nehmen                → POST   /api/chats/:id/admins
 *    ❌ Name + Beschreibung ändern        → PUT    /api/chats/:id
 *    ❌ Ankündigungsmodus für GRUPPEN     → PUT    /api/chats/:id/announce
 *    ❌ Einladungslink PRO CHAT           → POST   /api/chats/:id/invite
 *      (das alte /api/invite ist eine PLATTFORM-Einladung zur Registrierung,
 *       nicht zum Beitritt in einen Chat — das war eine Verwechslung)
 *    ❌ Community-Übersicht               → GET    /api/communities
 *
 *  Rechte-Modell (bewusst streng, an WhatsApp angelehnt):
 *    · Inhaber  : alles
 *    · Verwalter: kicken (nur Mitglieder), befördern, beschreiben, ansagen
 *    · Verwalter darf KEINEN anderen Verwalter entfernen — nur der Inhaber
 *    · Niemand kann den Inhaber entfernen
 *    · Niemand kann sich selbst entfernen (dafür ist „verlassen" da)
 * ===================================================================== */
'use strict';

const crypto = require('crypto');

const MAX_NAME = 40;
const MAX_DESC = 200;

/** Inhaber oder Verwalter? */
function isAdmin(user, chat) {
  return chat.ownerId === user.id || (chat.adminIds || []).includes(user.id);
}
function isOwner(user, chat) {
  return chat.ownerId === user.id;
}

/** Rolle eines Nutzers in einem Chat — für die Oberfläche. */
function roleOf(user, chat) {
  if (chat.ownerId === user.id) return 'owner';
  if ((chat.adminIds || []).includes(user.id)) return 'admin';
  return 'member';
}

function createV421(app, h, ctx) {
  const {
    db, saveDb, nextId, auth, getChatOr404, sendToChat, sendToUser, chatSummary,
    publicUser, msgPublic,
  } = ctx;

  /* ------------------------------------------------------------------
   *  Kleine Helfer
   * ------------------------------------------------------------------ */

  /** Systemnachricht in den Chat legen — ohne dass jemand „schreibt". */
  function systemMessage(chat, text) {
    const msg = {
      id: nextId('m_'),
      chatId: chat.id,
      senderId: 'system',
      text,
      kind: 'system',
      attachment: null,
      createdAt: Date.now(),
      reactions: {},
      readBy: [],
    };
    (db.messages[chat.id] = db.messages[chat.id] || []).push(msg);
    sendToChat(chat.id, { type: 'message:new', chatId: chat.id, message: msgPublic(msg) });
    return msg;
  }

  /** Alle Mitglieder bekommen die aktualisierte Chat-Kachel. */
  function refreshAll(chat) {
    for (const uid of chat.memberIds) {
      sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, chat) });
    }
  }

  function chatPublic(chat, me) {
    return {
      id: chat.id,
      type: chat.type,
      name: chat.name,
      description: chat.description || '',
      avatar: chat.avatar || '💬',
      ownerId: chat.ownerId,
      adminIds: chat.adminIds || [],
      announce: !!chat.announce,
      memberCount: chat.memberIds.length,
      communityId: chat.communityId || null,
      myRole: roleOf(me, chat),
      createdAt: chat.createdAt,
    };
  }

  /** Nur für Gruppen/Communities/Kanäle — private Chats haben keine Rechte. */
  function requireGroupChat(req, res) {
    const chat = getChatOr404(req, res);
    if (!chat) return null;
    if (chat.type === 'private') {
      res.status(400).json({ error: 'Private Chats haben keine Mitglieder-Rechte 💬' });
      return null;
    }
    return chat;
  }

  function requireAdmin(req, res, chat) {
    if (!isAdmin(req.user, chat)) {
      res.status(403).json({ error: 'Nur Inhaber/Verwalter 👑' });
      return false;
    }
    return true;
  }

  /* ==================================================================
   *  1. Name + Beschreibung ändern
   * ================================================================== */
  app.put(
    '/api/chats/:id',
    auth,
    h(async (req, res) => {
      const chat = requireGroupChat(req, res);
      if (!chat) return;
      if (!requireAdmin(req, res, chat)) return;

      const b = req.body || {};
      let changed = [];

      if (b.name !== undefined) {
        const name = String(b.name).trim();
        if (name.length < 2 || name.length > MAX_NAME) {
          return res.status(400).json({ error: `Name: 2–${MAX_NAME} Zeichen`, code: 'bad_name' });
        }
        if (chat.type === 'channel' && !isOwner(req.user, chat)) {
          return res.status(403).json({ error: 'Nur der Inhaber benennt einen Kanal um' });
        }
        chat.name = name;
        changed.push('name');
      }

      if (b.description !== undefined) {
        const description = String(b.description).trim().slice(0, MAX_DESC);
        chat.description = description;
        changed.push('description');
      }

      if (b.avatar !== undefined) {
        const avatar = String(b.avatar).trim().slice(0, 8);
        if (avatar) {
          chat.avatar = avatar;
          changed.push('avatar');
        }
      }

      if (!changed.length) {
        return res.status(400).json({ error: 'Nichts zu ändern', code: 'nothing' });
      }

      saveDb();
      refreshAll(chat);
      res.json({ ok: true, changed, chat: chatPublic(chat, req.user) });
    })
  );

  /* ==================================================================
   *  2. Mitglied rauswerfen (Kick)
   * ================================================================== */
  app.delete(
    '/api/chats/:id/members/:uid',
    auth,
    h(async (req, res) => {
      const chat = requireGroupChat(req, res);
      if (!chat) return;
      if (!requireAdmin(req, res, chat)) return;

      const me = req.user;
      const targetId = String(req.params.uid || '');
      const target = db.users[targetId];
      if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden 💔' });
      if (!chat.memberIds.includes(targetId)) {
        return res.status(404).json({ error: 'Ist gar nicht in diesem Chat', code: 'not_member' });
      }

      // Schutzregeln — in dieser Reihenfolge, damit die Fehlermeldung stimmt.
      if (targetId === chat.ownerId) {
        return res.status(403).json({ error: 'Der Inhaber kann nicht entfernt werden 👑', code: 'cannot_kick_owner' });
      }
      if (targetId === me.id) {
        return res.status(400).json({ error: 'Dich selbst entfernen? Nimm „Chat verlassen" 💗', code: 'cannot_kick_self' });
      }
      if ((chat.adminIds || []).includes(targetId) && !isOwner(me, chat)) {
        return res.status(403).json({ error: 'Nur der Inhaber kann andere Verwalter entfernen', code: 'cannot_kick_admin' });
      }

      chat.memberIds = chat.memberIds.filter((id) => id !== targetId);
      chat.adminIds = (chat.adminIds || []).filter((id) => id !== targetId);
      // Wer rausgeworfen wurde, kommt nicht über einen alten Link zurück:
      chat.kicked = [...new Set([...(chat.kicked || []), targetId])];

      systemMessage(chat, `${target.displayName} wurde von ${me.displayName} entfernt.`);
      saveDb();

      sendToUser(targetId, { type: 'chat:removed', chatId: chat.id, name: chat.name, byName: me.displayName });
      refreshAll(chat);
      res.json({ ok: true, removed: targetId, memberCount: chat.memberIds.length });
    })
  );

  /** Ban aufheben — sonst wäre der Link für immer verbrannt. */
  app.delete(
    '/api/chats/:id/kicked/:uid',
    auth,
    h(async (req, res) => {
      const chat = requireGroupChat(req, res);
      if (!chat) return;
      if (!requireAdmin(req, res, chat)) return;
      const uid = String(req.params.uid || '');
      chat.kicked = (chat.kicked || []).filter((id) => id !== uid);
      saveDb();
      res.json({ ok: true, unbanned: uid });
    })
  );

  /* ==================================================================
   *  3. Verwalter geben / nehmen
   * ================================================================== */
  app.post(
    '/api/chats/:id/admins',
    auth,
    h(async (req, res) => {
      const chat = requireGroupChat(req, res);
      if (!chat) return;
      if (!requireAdmin(req, res, chat)) return;

      const me = req.user;
      const uid = String((req.body || {}).userId || '');
      const on = (req.body || {}).on === true;
      const target = db.users[uid];
      if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden 💔' });
      if (!chat.memberIds.includes(uid)) {
        return res.status(400).json({ error: 'Muss erst Mitglied sein', code: 'not_member' });
      }
      if (uid === chat.ownerId) {
        return res.status(400).json({ error: 'Der Inhaber ist immer Verwalter 👑', code: 'is_owner' });
      }

      chat.adminIds = chat.adminIds || [];
      const already = chat.adminIds.includes(uid);

      if (on && !already) {
        // Verwalter dürfen Verwalter machen — wie in WhatsApp.
        chat.adminIds.push(uid);
        systemMessage(chat, `${target.displayName} ist jetzt Verwalter 🛡️`);
      } else if (!on && already) {
        // Zurückstufen: nur der Inhaber darf andere Verwalter zurückstufen.
        // Sich selbst zurückstufen darf jeder Verwalter.
        if (uid !== me.id && !isOwner(me, chat)) {
          return res.status(403).json({ error: 'Nur der Inhaber kann andere Verwalter zurückstufen', code: 'only_owner_demotes' });
        }
        chat.adminIds = chat.adminIds.filter((id) => id !== uid);
        systemMessage(chat, `${target.displayName} ist kein Verwalter mehr.`);
      } else {
        // Idempotent: zweimal dasselbe drücken ist kein Fehler.
        return res.json({ ok: true, idempotent: true, adminIds: chat.adminIds, chat: chatPublic(chat, me) });
      }

      saveDb();
      refreshAll(chat);
      res.json({ ok: true, adminIds: chat.adminIds, chat: chatPublic(chat, me) });
    })
  );

  /* ==================================================================
   *  4. Ankündigungsmodus (nur Verwalter schreiben)
   * ================================================================== */
  app.put(
    '/api/chats/:id/announce',
    auth,
    h(async (req, res) => {
      const chat = requireGroupChat(req, res);
      if (!chat) return;
      if (!requireAdmin(req, res, chat)) return;
      if (chat.type === 'channel') {
        return res.status(400).json({
          error: 'Kanäle sind immer Ankündigungen 📢',
          code: 'always_announce',
        });
      }
      const on = (req.body || {}).on === true;
      if (chat.type === 'private') return res.status(400).json({ error: 'Nicht in privaten Chats' });
      chat.announce = on;
      saveDb();
      systemMessage(chat, on
        ? '📢 Ankündigungsmodus AN — nur noch Verwalter können schreiben.'
        : '💬 Ankündigungsmodus AUS — alle dürfen wieder schreiben.');
      saveDb();
      refreshAll(chat);
      res.json({ ok: true, announce: chat.announce, chat: chatPublic(chat, req.user) });
    })
  );

  /* ==================================================================
   *  5. Einladungslink PRO CHAT
   * ================================================================== */
  app.post(
    '/api/chats/:id/invite',
    auth,
    h(async (req, res) => {
      const chat = requireGroupChat(req, res);
      if (!chat) return;
      if (!requireAdmin(req, res, chat)) return;

      if (!db.chatInvites) db.chatInvites = {};
      // Ein alter Code für denselben Chat wird ungültig — sonst sammeln
      // sich Links, die niemand mehr widerrufen kann.
      for (const [code, inv] of Object.entries(db.chatInvites)) {
        if (inv.chatId === chat.id) delete db.chatInvites[code];
      }
      const code = crypto.randomBytes(5).toString('hex');
      db.chatInvites[code] = {
        code,
        chatId: chat.id,
        byId: req.user.id,
        byName: req.user.displayName,
        createdAt: Date.now(),
        uses: 0,
      };
      saveDb();
      res.json({
        ok: true,
        code,
        link: 'https://maxichen.de/join/' + code,
        text: `Komm in „${chat.name}" 💗 https://maxichen.de/join/${code}`,
        chat: chatPublic(chat, req.user),
      });
    })
  );

  /** Vorschau — wer den Link hat, sieht worum es geht, bevor er beitritt. */
  app.get(
    '/api/chats/invite/:code',
    h(async (req, res) => {
      const inv = (db.chatInvites || {})[String(req.params.code || '')];
      if (!inv) return res.status(404).json({ error: 'Einladung ungültig oder abgelaufen', code: 'invite_unknown' });
      const chat = db.chats[inv.chatId];
      if (!chat) return res.status(404).json({ error: 'Der Chat existiert nicht mehr', code: 'chat_gone' });
      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        code: inv.code,
        name: chat.name,
        avatar: chat.avatar || '💬',
        type: chat.type,
        description: chat.description || '',
        memberCount: chat.memberIds.length,
        invitedBy: inv.byName,
      });
    })
  );

  /** Beitreten über den Link. */
  app.post(
    '/api/chats/invite/:code',
    auth,
    h(async (req, res) => {
      const me = req.user;
      const inv = (db.chatInvites || {})[String(req.params.code || '')];
      if (!inv) return res.status(404).json({ error: 'Einladung ungültig oder abgelaufen', code: 'invite_unknown' });
      const chat = db.chats[inv.chatId];
      if (!chat) return res.status(404).json({ error: 'Der Chat existiert nicht mehr', code: 'chat_gone' });

      if (chat.memberIds.includes(me.id)) {
        return res.json({ ok: true, alreadyMember: true, chatId: chat.id, summary: chatSummary(me.id, chat) });
      }
      if ((chat.kicked || []).includes(me.id)) {
        return res.status(403).json({
          error: 'Du wurdest aus diesem Chat entfernt — ein Verwalter muss dich freischalten.',
          code: 'kicked',
        });
      }

      chat.memberIds.push(me.id);
      inv.uses = (inv.uses || 0) + 1;
      systemMessage(chat, `${me.displayName} ist über einen Link beigetreten 💗`);
      saveDb();

      sendToUser(me.id, { type: 'chat:created', summary: chatSummary(me.id, chat) });
      refreshAll(chat);
      res.json({ ok: true, joined: true, chatId: chat.id, summary: chatSummary(me.id, chat) });
    })
  );

  /** Link widerrufen. */
  app.delete(
    '/api/chats/:id/invite',
    auth,
    h(async (req, res) => {
      const chat = requireGroupChat(req, res);
      if (!chat) return;
      if (!requireAdmin(req, res, chat)) return;
      let killed = 0;
      for (const [code, inv] of Object.entries(db.chatInvites || {})) {
        if (inv.chatId === chat.id) { delete db.chatInvites[code]; killed++; }
      }
      saveDb();
      res.json({ ok: true, revoked: killed });
    })
  );

  /** Welche Links gibt es für diesen Chat? (nur Verwalter) */
  app.get(
    '/api/chats/:id/invite',
    auth,
    h(async (req, res) => {
      const chat = requireGroupChat(req, res);
      if (!chat) return;
      if (!requireAdmin(req, res, chat)) return;
      const list = Object.values(db.chatInvites || {})
        .filter((i) => i.chatId === chat.id)
        .map((i) => ({ code: i.code, createdAt: i.createdAt, uses: i.uses || 0, link: 'https://maxichen.de/join/' + i.code }));
      res.json({ ok: true, invites: list });
    })
  );

  /* ==================================================================
   *  6. Communities — Übersicht
   * ================================================================== */
  app.get(
    '/api/communities',
    auth,
    h(async (req, res) => {
      const me = req.user;
      const all = Object.values(db.chats).filter((c) => c.type === 'community');
      const mine = [];
      const discover = [];
      for (const c of all) {
        const groups = Object.values(db.chats)
          .filter((g) => g.communityId === c.id)
          .map((g) => ({
            id: g.id,
            name: g.name,
            avatar: g.avatar || '💬',
            count: g.memberIds.length,
            isMember: g.memberIds.includes(me.id),
          }));
        const item = {
          id: c.id,
          name: c.name,
          avatar: c.avatar || '🏰',
          description: c.description || '',
          memberCount: c.memberIds.length,
          groupCount: groups.length,
          groups,
          isMember: c.memberIds.includes(me.id),
          myRole: roleOf(me, c),
        };
        (item.isMember ? mine : discover).push(item);
      }
      res.json({ ok: true, mine, discover, total: all.length });
    })
  );

  /** Community mit Startgruppen anlegen — in einem Aufruf, nicht in fünf. */
  app.post(
    '/api/communities',
    auth,
    h(async (req, res) => {
      const me = req.user;
      const b = req.body || {};
      const name = String(b.name || '').trim();
      if (name.length < 2 || name.length > MAX_NAME) {
        return res.status(400).json({ error: `Name: 2–${MAX_NAME} Zeichen`, code: 'bad_name' });
      }
      const description = String(b.description || '').trim().slice(0, MAX_DESC);
      const groupNames = Array.isArray(b.groups) ? b.groups.slice(0, 8) : [];

      const community = {
        id: nextId('c_'),
        type: 'community',
        name,
        description,
        avatar: String(b.avatar || '🏰').slice(0, 8),
        ownerId: me.id,
        adminIds: [me.id],
        memberIds: [me.id],
        communityId: null,
        announce: true, // Ankündigungen sind in Communities der Standard
        createdAt: Date.now(),
      };
      db.chats[community.id] = community;
      db.messages[community.id] = [];

      const created = [];
      for (const raw of groupNames) {
        const gname = String(raw).trim().slice(0, MAX_NAME);
        if (gname.length < 2) continue;
        const g = {
          id: nextId('c_'),
          type: 'group',
          name: gname,
          description: '',
          avatar: '💬',
          ownerId: me.id,
          adminIds: [me.id],
          memberIds: [me.id],
          communityId: community.id,
          createdAt: Date.now(),
        };
        db.chats[g.id] = g;
        db.messages[g.id] = [];
        created.push({ id: g.id, name: g.name });
      }

      saveDb();
      for (const cid of [community.id, ...created.map((g) => g.id)]) {
        sendToUser(me.id, { type: 'chat:created', summary: chatSummary(me.id, db.chats[cid]) });
      }
      res.json({
        ok: true,
        community: chatPublic(community, me),
        groups: created,
      });
    })
  );

  /** Community verlassen (alle Untergruppen mit). */
  app.post(
    '/api/communities/:id/leave',
    auth,
    h(async (req, res) => {
      const me = req.user;
      const community = db.chats[String(req.params.id || '')];
      if (!community || community.type !== 'community') {
        return res.status(404).json({ error: 'Community nicht gefunden' });
      }
      if (community.ownerId === me.id) {
        return res.status(400).json({ error: 'Als Inhaber kannst du nicht verlassen — lösche sie stattdessen', code: 'owner_leave' });
      }
      const touched = [community];
      community.memberIds = community.memberIds.filter((id) => id !== me.id);
      for (const g of Object.values(db.chats)) {
        if (g.communityId === community.id && g.memberIds.includes(me.id) && g.ownerId !== me.id) {
          g.memberIds = g.memberIds.filter((id) => id !== me.id);
          touched.push(g);
        }
      }
      saveDb();
      for (const c of touched) sendToUser(me.id, { type: 'chat:removed', chatId: c.id, name: c.name });
      for (const c of touched) refreshAll(c);
      res.json({ ok: true, left: community.id, groupsLeft: touched.length - 1 });
    })
  );

  console.log('👑 V4.21 aktiv — Kick · Verwalter · Beschreibung · Ankündigungen · Chat-Links · Communities');
  return { isAdmin, isOwner, roleOf, createV421: true };
}

module.exports = { createV421, isAdmin, isOwner, roleOf };
