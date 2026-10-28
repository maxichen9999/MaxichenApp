/* =====================================================================
 *  🔍 v431.js — Suchen & Merken (V4.31)
 * ---------------------------------------------------------------------
 *  Zwei Dinge, die in der WhatsApp-Liste stehen und bisher fehlten:
 *
 *    ❌ Nachrichten durchsuchen   → GET  /api/v431/search
 *    ❌ Markierte Nachrichten     → GET  /api/v431/starred
 *                                   POST /api/v431/star   (an/aus)
 *                                   DELETE /api/v431/star/:chatId/:msgId
 *
 *  Ehrlich dazu:
 *    • Gesucht wird nur in Chats, in denen man selbst Mitglied ist.
 *    • Gelöschte Nachrichten tauchen nicht auf.
 *    • Bilder/Sprachnachrichten haben keinen Text — sie werden über ihre
 *      Beschriftung gefunden (falls vorhanden), sonst gar nicht.
 *    • „Gemerkt" liegt pro Nutzer auf dem Server (db.users[x].starred),
 *      überlebt also Neuladen und Gerätewechsel.
 * ===================================================================== */

'use strict';

const MAX_HITS = 60;          // mehr zeigt die Oberfläche nicht auf einmal
const MAX_STARRED = 500;      // Obergrenze pro Nutzer

function createV431(app, h, ctx) {
  const { db, saveDb, auth, chatSummary } = ctx;

  /* ---------------- Hilfen ---------------- */

  function myChats(uid) {
    return Object.values(db.chats || {}).filter(
      (c) => Array.isArray(c.memberIds) && c.memberIds.includes(uid) && !(Array.isArray(c.kicked) && c.kicked.includes(uid))
    );
  }

  function canRead(uid, chatId) {
    const c = (db.chats || {})[String(chatId || '')];
    if (!c) return null;
    if (!Array.isArray(c.memberIds) || !c.memberIds.includes(uid)) return null;
    if (Array.isArray(c.kicked) && c.kicked.includes(uid)) return null;
    return c;
  }

  /** Text einer Nachricht, in dem gesucht/angezeigt werden kann. */
  function msgText(m) {
    if (!m) return '';
    if (m.deleted) return '';
    if (m.poll) return '[Umfrage] ' + (m.poll.question || m.text || '');
    const t = String(m.text || '');
    if (!t) {
      if (m.image) return '[Bild]';
      if (m.audio) return '[Sprachnachricht]';
      if (m.file) return '[Datei] ' + (m.file.name || '');
      if (m.location) return '[Standort]';
      if (m.video) return '[Video]';
    }
    return t;
  }

  /** Treffer-Ausschnitt: ein Stück um die Fundstelle herum. */
  function snippet(text, q, radius) {
    const r = radius || 60;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text.slice(0, r * 2);
    const from = Math.max(0, i - r);
    const to = Math.min(text.length, i + q.length + r);
    return (from > 0 ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '');
  }

  function senderNameFor(chat, m) {
    const u = (db.users || {})[m.senderId];
    if (u) return u.name || u.username || 'Unbekannt';
    if (chat.type === 'channel') return chat.name || 'Kanal';
    return 'Unbekannt';
  }

  /* ================= 1) Nachrichten durchsuchen ================= */
  app.get(
    '/api/v431/search',
    auth,
    h((req, res) => {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) {
        return res.status(400).json({ error: 'Bitte mindestens 2 Zeichen eingeben 🔍', code: 'too_short' });
      }
      if (q.length > 100) return res.status(400).json({ error: 'Zu lang — höchstens 100 Zeichen', code: 'too_long' });

      let scope;
      if (req.query.chatId) {
        const one = canRead(req.user.id, req.query.chatId);
        if (!one) return res.status(403).json({ error: 'Du bist nicht in diesem Chat' });
        scope = [one];
      } else {
        scope = myChats(req.user.id);
      }

      const needle = q.toLowerCase();
      const hits = [];
      let total = 0;

      for (const c of scope) {
        const sum = chatSummary(req.user.id, c);
        const msgs = (db.messages || {})[c.id] || [];
        for (const m of msgs) {
          const t = msgText(m);
          if (!t || !t.toLowerCase().includes(needle)) continue;
          total++;
          if (hits.length >= MAX_HITS) continue;
          hits.push({
            chatId: c.id,
            chatType: c.type,
            chatName: sum.name,
            chatAvatar: sum.avatar,
            msgId: m.id,
            text: snippet(t, q),
            senderId: m.senderId,
            senderName: senderNameFor(c, m),
            createdAt: m.createdAt,
          });
        }
      }

      // neueste zuerst
      hits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      res.json({
        q,
        total,
        shown: hits.length,
        capped: total > hits.length,
        hits,
      });
    })
  );

  /* ================= 2) „Gemerkt" (Sternchen) ================= */

  function starredList(uid) {
    const arr = (db.users[uid] && Array.isArray(db.users[uid].starred)) ? db.users[uid].starred : [];
    const out = [];
    for (const s of arr) {
      const c = (db.chats || {})[s.chatId];
      const m = c && ((db.messages || {})[s.chatId] || []).find((x) => x.id === s.msgId);
      if (!c || !m) continue;                        // Chat oder Nachricht gelöscht
      if (!c.memberIds.includes(uid)) continue;      // nicht mehr im Chat
      if (m.deleted) continue;
      out.push({
        chatId: c.id,
        chatType: c.type,
        chatName: chatSummary(uid, c).name,
        chatAvatar: chatSummary(uid, c).avatar,
        msgId: m.id,
        text: msgText(m).slice(0, 300),
        senderName: senderNameFor(c, m),
        createdAt: m.createdAt,
        starredAt: s.at,
      });
    }
    out.sort((a, b) => (b.starredAt || 0) - (a.starredAt || 0));
    return out;
  }

  app.get(
    '/api/v431/starred',
    auth,
    h((req, res) => {
      const items = starredList(req.user.id);
      res.json({ count: items.length, items });
    })
  );

  /** An oder aus — ein Aufruf, zwei Zustände (wie der Stern in WhatsApp). */
  app.post(
    '/api/v431/star',
    auth,
    h((req, res) => {
      const chatId = String(req.body && req.body.chatId || '');
      const msgId = String(req.body && req.body.msgId || '');
      const chat = canRead(req.user.id, chatId);
      if (!chat) return res.status(403).json({ error: 'Du bist nicht in diesem Chat' });
      const m = ((db.messages || {})[chatId] || []).find((x) => x.id === msgId);
      if (!m || m.deleted) return res.status(404).json({ error: 'Nachricht nicht gefunden 💔' });

      const u = db.users[req.user.id];
      if (!Array.isArray(u.starred)) u.starred = [];
      const i = u.starred.findIndex((s) => s.chatId === chatId && s.msgId === msgId);
      let starred;
      if (i >= 0) {
        u.starred.splice(i, 1);
        starred = false;
      } else {
        u.starred.push({ chatId, msgId, at: Date.now() });
        if (u.starred.length > MAX_STARRED) u.starred = u.starred.slice(-MAX_STARRED);
        starred = true;
      }
      saveDb();
      res.json({ ok: true, starred, count: starredList(req.user.id).length });
    })
  );

  app.delete(
    '/api/v431/star/:chatId/:msgId',
    auth,
    h((req, res) => {
      const u = db.users[req.user.id];
      if (!Array.isArray(u.starred)) u.starred = [];
      const before = u.starred.length;
      u.starred = u.starred.filter((s) => !(s.chatId === req.params.chatId && s.msgId === req.params.msgId));
      if (u.starred.length !== before) saveDb();
      res.json({ ok: true, starred: false, count: starredList(req.user.id).length });
    })
  );

  return { MAX_HITS, MAX_STARRED, starredList, msgText };
}

module.exports = { createV431 };
