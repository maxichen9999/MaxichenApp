/* =====================================================================
 *  🧭 v423.js — V4.23 „WhatsApp-Layout": was der Server dafür braucht
 * ---------------------------------------------------------------------
 *  GEMESSEN vor dem Bau (nicht geraten):
 *
 *  ✅ /api/communities   existiert (V4.21) — mine/discover/groups
 *  ✅ /api/moments       existiert (V4)    — Status-Ringe
 *  ✅ Kanäle             sind Chats mit type='channel'
 *  ✅ /api/calls/:id     existiert (extras.js) — Gruppen-Calls (max 8)
 *  ❌ ANRUF-HISTORIE     existiert NICHT. Für den Tab „Anrufe" (Letzte)
 *                        gibt es keinen einzigen Datensatz. Das ist die
 *                        einzige echte Lücke — hier wird sie geschlossen.
 *  ❌ KANAL-LISTE        Suche filtert Kanäle, aber es gibt keine
 *                        „meine Kanäle / entdecken"-Route.
 *
 *  Dazu: /api/home — ein Aufruf für die vier Tabs (Zähler für die
 *  Bottom-Nav), damit die Leiste nicht vier Anfragen feuert.
 * ===================================================================== */
'use strict';

const MAX_LOG = 4000;      // Anruf-Einträge, älteste fliegen raus
const MAX_KEEP_DAYS = 180;

function createV423(app, h, ctx) {
  const { db, saveDb, auth } = ctx;

  /* ------------------------------------------------------------------
   *  Anruf-Historie
   * ------------------------------------------------------------------ */

  function ensureLog() {
    if (!Array.isArray(db.callLog)) db.callLog = [];
    return db.callLog;
  }

  /** Wird auch von extras.js aufgerufen (Gruppen-Call beitreten/verlassen). */
  function logCall(entry) {
    const log = ensureLog();
    log.push({
      id: 'cl_' + require('crypto').randomBytes(6).toString('hex'),
      chatId: String(entry.chatId || ''),
      userId: String(entry.userId || ''),
      peerId: entry.peerId ? String(entry.peerId) : null,
      kind: entry.kind === 'video' ? 'video' : 'voice',
      direction: entry.direction === 'in' ? 'in' : 'out',
      status: ['missed', 'declined', 'answered'].includes(entry.status) ? entry.status : 'answered',
      group: !!entry.group,
      startedAt: Number(entry.startedAt || Date.now()),
      durationSec: Math.max(0, Math.min(86400, Number(entry.durationSec || 0))),
    });
    // Deckel drauf — sonst wächst die DB endlos
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    const cutoff = Date.now() - MAX_KEEP_DAYS * 86400000;
    db.callLog = log.filter((e) => e.startedAt > cutoff);
    saveDb();
  }

  /** Chat-Name aus Sicht des Nutzers (1:1 → der andere). */
  function chatView(chat, me) {
    if (!chat) return { name: 'Unbekannt', avatar: '❔' };
    if (chat.type === 'private') {
      const other = (chat.memberIds || []).find((id) => id !== me.id);
      const u = other && db.users[other];
      return { name: (u && u.displayName) || 'Unbekannt', avatar: (u && u.avatar) || '💗' };
    }
    return { name: chat.name || 'Gruppe', avatar: chat.avatar || '👥' };
  }

  /** Gefalteter Verlauf einer Person — EINE Wahrheit für Liste UND Zähler. */
  function foldedHistory(userId) {
    const mine = ensureLog()
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.startedAt - a.startedAt);
    const merged = [];
    for (const e of mine) {
      const prev = merged[merged.length - 1];
      // Nur echte join/leave-Duplikate falten: gleicher Chat, gleiche Art,
      // gleicher Status, < 20 s auseinander. Zwei Anrufe kurz hintereinander
      // (z. B. verpasst, dann zurückgerufen) bleiben ZWEI Einträge.
      if (prev && prev.chatId === e.chatId && prev.kind === e.kind && prev.status === e.status && Math.abs(prev.startedAt - e.startedAt) < 20000) {
        prev.durationSec = Math.max(prev.durationSec, e.durationSec);
        if (e.status === 'answered') prev.status = 'answered';
        continue;
      }
      merged.push({ ...e });
    }
    return merged;
  }

  /** Öffentliche Sicht auf einen Verlaufseintrag. */
  function publicCall(e, me) {
    const chat = db.chats[e.chatId];
    const v = chatView(chat, me);
    const peer = e.peerId && db.users[e.peerId] ? db.users[e.peerId] : null;
    return {
      id: e.id,
      chatId: e.chatId,
      name: (peer && peer.displayName) || v.name,
      avatar: (peer && peer.avatar) || v.avatar,
      peerId: e.peerId,
      kind: e.kind,
      direction: e.direction,
      status: e.status,
      group: e.group || !!(chat && chat.type !== 'private'),
      startedAt: e.startedAt,
      durationSec: e.durationSec,
      canCall: !!chat && (chat.memberIds || []).includes(me.id),
    };
  }

  app.get('/api/calls/history', auth, h(async (req, res) => {
    const me = req.user;
    const limit = Math.min(100, Math.max(1, Number((req.query || {}).limit) || 50));
    const merged = foldedHistory(me.id);
    const out = merged.slice(0, limit).map((e) => publicCall(e, me));
    res.set('Cache-Control', 'no-store');
    res.json({
      calls: out,
      total: out.length,
      missed: out.filter((c) => c.status === 'missed' && c.direction === 'in').length,
    });
  }));

  /** Anruf protokollieren (1:1 im Client, Gruppen automatisch in extras.js). */
  app.post('/api/calls/log', auth, h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};
    const chat = db.chats[String(b.chatId || '')];
    if (!chat) return res.status(404).json({ error: 'Chat nicht gefunden 💔' });
    if (!(chat.memberIds || []).includes(me.id)) return res.status(403).json({ error: 'Du bist nicht in diesem Chat' });
    if (b.peerId && !chat.memberIds.includes(String(b.peerId))) {
      return res.status(400).json({ error: 'Diese Person ist nicht im Chat' });
    }
    logCall({
      chatId: chat.id,
      userId: me.id,
      peerId: b.peerId || null,
      kind: b.kind,
      direction: b.direction,
      status: b.status,
      durationSec: b.durationSec,
      group: chat.type !== 'private',
    });
    res.json({ ok: true, count: ensureLog().filter((e) => e.userId === me.id).length });
  }));

  /** Löschen (nur eigene Einträge). */
  app.delete('/api/calls/history/:id', auth, h(async (req, res) => {
    const me = req.user;
    const before = ensureLog().length;
    db.callLog = ensureLog().filter((e) => !(e.id === req.params.id && e.userId === me.id));
    const removed = before - db.callLog.length;
    if (removed) saveDb();
    res.json({ ok: true, removed });
  }));

  /** Laufende Gruppen-Calls, die mich betreffen (Karte „Aktiv" im Tab Anrufe). */
  app.get('/api/calls/live', auth, h(async (req, res) => {
    const me = req.user;
    const out = [];
    for (const call of Object.values(db.groupCalls || {})) {
      const chat = db.chats[call.chatId];
      if (!chat || !(chat.memberIds || []).includes(me.id)) continue;
      const parts = (call.participants || []).filter((p) => Date.now() - p.lastSeen < 10 * 60 * 1000);
      if (!parts.length) continue;
      out.push({
        callId: call.id,
        chatId: call.chatId,
        chatName: chat.name,
        kind: call.kind === 'video' ? 'video' : 'voice',
        startedAt: call.startedAt,
        participants: parts.map((p) => ({
          userId: p.userId,
          name: p.name,
          avatar: (db.users[p.userId] && db.users[p.userId].avatar) || '💗',
        })),
        iamIn: parts.some((p) => p.userId === me.id),
      });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ calls: out, count: out.length });
  }));

  /* ------------------------------------------------------------------
   *  Kanäle (für „Aktuelles")
   * ------------------------------------------------------------------ */

  function channelView(c, me) {
    const msgs = Object.values(db.messages || {}).filter((m) => m.chatId === c.id && !m.deleted);
    const last = msgs.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
    return {
      id: c.id,
      name: c.name,
      avatar: c.avatar || '📢',
      description: c.description || '',
      followers: (c.memberIds || []).length,
      isMember: (c.memberIds || []).includes(me.id),
      lastText: last ? String(last.text || '').slice(0, 120) : '',
      lastAt: last ? last.createdAt : null,
    };
  }

  app.get('/api/channels', auth, h(async (req, res) => {
    const me = req.user;
    const all = Object.values(db.chats).filter((c) => c.type === 'channel');
    const mine = all.filter((c) => c.memberIds.includes(me.id)).map((c) => channelView(c, me));
    const discover = all.filter((c) => !c.memberIds.includes(me.id)).map((c) => channelView(c, me));
    mine.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    res.json({ mine, discover, total: all.length });
  }));

  /* ------------------------------------------------------------------
   *  Community: Untergruppe NACHTRÄGLICH anlegen
   *  (fehlte komplett — Gruppen entstanden nur beim Erstellen der Community)
   * ------------------------------------------------------------------ */

  app.post('/api/communities/:id/groups', auth, h(async (req, res) => {
    const me = req.user;
    const com = db.chats[String(req.params.id || '')];
    if (!com || com.type !== 'community') return res.status(404).json({ error: 'Community nicht gefunden' });
    const isAdmin = com.ownerId === me.id || (com.adminIds || []).includes(me.id);
    if (!isAdmin) return res.status(403).json({ error: 'Nur Inhaber und Verwalter dürfen Gruppen anlegen', code: 'admin_only' });
    if (!(com.memberIds || []).includes(me.id)) return res.status(403).json({ error: 'Du bist nicht in dieser Community', code: 'not_member' });

    const name = String((req.body || {}).name || '').trim();
    if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Name: 2–60 Zeichen', code: 'bad_name' });
    const groups = Object.values(db.chats).filter((c) => c.communityId === com.id);
    if (groups.length >= 20) return res.status(400).json({ error: 'Maximal 20 Gruppen pro Community', code: 'too_many' });
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'Diese Gruppe gibt es schon', code: 'duplicate_name' });
    }

    const g = {
      id: 'c_' + require('crypto').randomBytes(6).toString('hex'),
      type: 'group',
      name,
      description: String((req.body || {}).description || '').slice(0, 300),
      avatar: String((req.body || {}).avatar || '💬').slice(0, 8),
      ownerId: me.id,
      adminIds: [me.id],
      memberIds: [...new Set([me.id, ...(com.memberIds || [])])],
      communityId: com.id,
      createdAt: Date.now(),
    };
    db.chats[g.id] = g;
    db.messages[g.id] = [];
    saveDb();
    res.json({ ok: true, group: { id: g.id, name: g.name, avatar: g.avatar, count: g.memberIds.length } });
  }));

  /* ------------------------------------------------------------------
   *  Ein Aufruf für die vier Tabs
   * ------------------------------------------------------------------ */

  app.get('/api/home', auth, h(async (req, res) => {
    const me = req.user;
    const chats = Object.values(db.chats).filter((c) => c.memberIds.includes(me.id));
    const unread = chats.reduce((n, c) => n + ((me.unread && me.unread[c.id]) || 0), 0);
    const groups = chats.filter((c) => c.type === 'group').length;
    const communities = chats.filter((c) => c.type === 'community').length;
    const channels = chats.filter((c) => c.type === 'channel').length;
    const moments = (db.moments || []).filter((m) => m.userId === me.id).length;
    // ⚠️ Gleiche Faltung wie /api/calls/history — sonst zeigt das Abzeichen
    //    eine andere Zahl als die Liste darunter.
    const calls = foldedHistory(me.id);
    const missed = calls.filter((e) => e.status === 'missed' && e.direction === 'in').length;
    const live = Object.values(db.groupCalls || {}).filter(
      (c) => c.participants && c.participants.length > 0 && db.chats[c.chatId] && db.chats[c.chatId].memberIds.includes(me.id)
    ).length;

    res.set('Cache-Control', 'no-store');
    res.json({
      counts: {
        chats: chats.length,
        unread,
        groups,
        communities,
        channels,
        moments,
        calls: calls.length,
        missed,
        liveCalls: live,
      },
      me: { id: me.id, displayName: me.displayName, avatar: me.avatar || '💗' },
    });
  }));

  console.log('🧭 V4.23 aktiv — Anrufe-Verlauf · Kanäle · /api/home (4 Tabs)');
  return { logCall, ensureLog, foldedHistory, publicCall, chatView, channelView };
}

module.exports = { createV423, MAX_LOG };
