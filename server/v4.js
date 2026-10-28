/* =====================================================================
   🚀 LoveChat V4 „MaxiChat" — Server-Erweiterungen
   Momente · Umfragen · Geplante Nachrichten · Blocken/Melden ·
   Nachrichtensuche · Stummschalten · LoveBot · Konto deaktivieren
   ===================================================================== */

const crypto = require('crypto');

const MOMENT_TTL = 24 * 3600 * 1000;

function createV4(app, h, ctx) {
  const {
    db, saveDb, nextId, auth, getChatOr404, isChatAdmin,
    sendToChat, sendToUser, chatSummary, MOD, onlineUsers, checkPassword,
  } = ctx;

  /* ---------- Helfer ---------- */
  const now = () => Date.now();
  const isOwner = (u) => MOD.isOwner(u);

  function publicUserLite(u) {
    if (!u) return { id: '', username: '?', displayName: 'Unbekannt', avatar: '💗', owner: false, role: 'user' };
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar || '💗',
      bio: u.bio || '',
      owner: MOD.isOwner(u),
      role: MOD.roleOf(u),
      roleLabel: u.roleLabel || MOD.roleOf(u),
      online: onlineUsers.has(u.id),
    };
  }

  function ensureV4() {
    if (!db.moments) db.moments = [];
    if (!db.polls) db.polls = {};
    if (!db.scheduled) db.scheduled = [];
    if (!db.reports) db.reports = [];
    if (!db.blocks) db.blocks = {};
    if (!db.lovebotConfig) {
      db.lovebotConfig = {
        enabled: true,
        greetGroups: true,
        greetCommunities: true,
        modHints: true,
        weeklyPoll: false,
        signOff: '💗 LoveBot · by maxi⁹¹⁰',
      };
    }
  }
  ensureV4();

  function isBlocked(a, b) {
    // a hat b blockiert ODER b hat a blockiert
    return !!(db.blocks[a] && db.blocks[a][b]) || !!(db.blocks[b] && db.blocks[b][a]);
  }

  function botUser() {
    return Object.values(db.users).find((u) => u.isBot && u.botType === 'lovebot') || null;
  }

  /** LoveBot schreibt in einen Chat (als echter Bot-Account) */
  function botSay(chat, text, extra = {}) {
    const bot = botUser();
    if (!bot || !db.lovebotConfig.enabled) return null;
    if (!(chat.memberIds || []).includes(bot.id)) return null;
    const msg = {
      id: nextId('m_'),
      chatId: chat.id,
      senderId: bot.id,
      text,
      kind: 'text',
      attachment: null,
      createdAt: now(),
      reactions: {},
      readBy: [bot.id],
      bot: true,
      ...extra,
    };
    (db.messages[chat.id] = db.messages[chat.id] || []).push(msg);
    saveDb();
    sendToChat(chat.id, { type: 'message:new', chatId: chat.id, message: msg });
    for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, chat) });
    return msg;
  }

  /* =====================================================================
     🌸 MOMENTE / STORIES (24 h)
     ===================================================================== */

  function momentPublic(m, viewerId) {
    const u = db.users[m.userId];
    return {
      id: m.id,
      userId: m.userId,
      user: publicUserLite(u),
      kind: m.kind,
      text: m.text || '',
      data: m.data || '',
      bg: m.bg || 'pink-dream',
      duration: m.duration || 24,
      createdAt: m.createdAt,
      expiresAt: m.createdAt + MOMENT_TTL,
      viewers: (m.viewers || []).length,
      reactions: m.reactions || {},
      seen: (m.viewers || []).includes(viewerId),
      mine: m.userId === viewerId,
    };
  }

  app.get('/api/moments', auth, h(async (req, res) => {
    const me = req.user;
    const all = (db.moments || []).filter((m) => m.createdAt + MOMENT_TTL > now());

    // Aufräumen (abgelaufene löschen)
    if ((db.moments || []).length !== all.length) { db.moments = all; saveDb(); }

    // Sichtbarkeit: öffentlich, Kontakte oder nur ich (privacy am Moment)
    const visible = all.filter((m) => {
      if (m.userId === me.id) return true;
      if (m.privacy === 'private') return false;
      const author = db.users[m.userId];
      if (!author) return false;
      if (isBlocked(me.id, author.id)) return false;
      if (m.privacy === 'contacts') {
        return Object.values(db.chats).some(
          (c) => c.type === 'private' && c.memberIds.includes(me.id) && c.memberIds.includes(author.id),
        );
      }
      return true;
    });

    // gruppiert nach Person, ich als erstes
    const groups = {};
    for (const m of visible) {
      (groups[m.userId] = groups[m.userId] || []).push(momentPublic(m, me.id));
    }
    for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.createdAt - b.createdAt);
    const list = Object.entries(groups).map(([uid, items]) => ({
      userId: uid,
      user: publicUserLite(db.users[uid]),
      moments: items,
      allSeen: items.every((x) => x.seen || x.mine),
      mine: uid === me.id,
    }));
    list.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.moments[b.moments.length - 1].createdAt - a.moments[a.moments.length - 1].createdAt);

    res.json({ groups: list, ttlHours: 24 });
  }));

  app.post('/api/moments', auth, h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};
    const kind = ['text', 'image', 'video'].includes(b.kind) ? b.kind : 'text';
    const text = String(b.text || '').slice(0, 500);
    const data = typeof b.data === 'string' ? b.data : '';
    if (kind === 'image' && !data.startsWith('data:image/')) return res.status(400).json({ error: 'Bild fehlt 📷' });
    if (data.length > 3.2 * 1024 * 1024) return res.status(400).json({ error: 'Bild zu groß (max. 2,4 MB)' });
    if (kind === 'text' && !text.trim()) return res.status(400).json({ error: 'Schreib kurz was 🌸' });

    const m = {
      id: nextId('mo_'),
      userId: me.id,
      kind,
      text,
      data,
      bg: String(b.bg || 'pink-dream').slice(0, 40),
      privacy: ['public', 'contacts', 'private'].includes(b.privacy) ? b.privacy : 'public',
      createdAt: now(),
      viewers: [],
      reactions: {},
    };
    db.moments.push(m);
    saveDb();

    // 🔔 Andere sofort informieren — sonst sehen sie den Status erst beim Neuladen.
    // Sichtbarkeit dabei beachten: 'private' geht an NIEMANDEN außer mir selbst.
    try {
      for (const u of Object.values(db.users)) {
        if (u.id === me.id) continue;
        if (m.privacy === 'private') continue;
        if (isBlocked(me.id, u.id)) continue;
        if (m.privacy === 'contacts') {
          const hasChat = Object.values(db.chats).some(
            (c) => c.type === 'private' && c.memberIds.includes(me.id) && c.memberIds.includes(u.id),
          );
          if (!hasChat) continue;
        }
        sendToUser(u.id, { type: 'moment:new', userId: me.id, momentId: m.id });
      }
    } catch (e) { /* WS-Fehler darf das Posten nicht kaputt machen */ }

    res.json({ ok: true, moment: momentPublic(m, me.id) });
  }));

  app.post('/api/moments/:id/view', auth, h(async (req, res) => {
    const m = (db.moments || []).find((x) => x.id === String(req.params.id));
    if (!m) return res.status(404).json({ error: 'Moment nicht gefunden' });
    if (!Array.isArray(m.viewers)) m.viewers = [];
    if (!m.viewers.includes(req.user.id)) m.viewers.push(req.user.id);
    saveDb();
    res.json({ ok: true, viewers: m.viewers.length });
  }));

  app.post('/api/moments/:id/react', auth, h(async (req, res) => {
    const m = (db.moments || []).find((x) => x.id === String(req.params.id));
    if (!m) return res.status(404).json({ error: 'Moment nicht gefunden' });
    const emoji = String((req.body || {}).emoji || '💗').slice(0, 8);
    if (!m.reactions) m.reactions = {};
    m.reactions[req.user.id] = emoji;
    saveDb();
    // Autor informieren
    if (m.userId !== req.user.id) {
      sendToUser(m.userId, {
        type: 'moment:reaction',
        momentId: m.id,
        emoji,
        from: publicUserLite(req.user),
      });
    }
    res.json({ ok: true, reactions: m.reactions });
  }));

  app.delete('/api/moments/:id', auth, h(async (req, res) => {
    const i = (db.moments || []).findIndex((x) => x.id === String(req.params.id));
    if (i < 0) return res.status(404).json({ error: 'Moment nicht gefunden' });
    const m = db.moments[i];
    if (m.userId !== req.user.id && !isOwner(req.user)) return res.status(403).json({ error: 'Das ist nicht dein Moment' });
    db.moments.splice(i, 1);
    saveDb();
    res.json({ ok: true, message: 'Moment gelöscht 🗑️' });
  }));

  /* =====================================================================
     📊 UMFRAGEN (Polls)
     ===================================================================== */

  function pollPublic(p, meId) {
    const votes = p.votes || {};
    const counts = p.options.map((_, i) => Object.values(votes).filter((v) => (Array.isArray(v) ? v.includes(i) : v === i)).length);
    const total = Object.keys(votes).length;
    return {
      id: p.id,
      chatId: p.chatId,
      question: p.question,
      options: p.options.map((label, i) => ({
        index: i,
        label,
        votes: counts[i],
        percent: total ? Math.round((counts[i] / total) * 100) : 0,
        mine: votes[meId] !== undefined && (Array.isArray(votes[meId]) ? votes[meId].includes(i) : votes[meId] === i),
      })),
      multiple: !!p.multiple,
      anonymous: !!p.anonymous,
      closed: !!p.closed,
      createdAt: p.createdAt,
      closesAt: p.closesAt || 0,
      totalVotes: total,
      voted: votes[meId] !== undefined,
      createdBy: p.createdBy,
    };
  }

  app.post('/api/chats/:id/polls', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    if (chat.type === 'channel' && !isChatAdmin(req.user, chat)) return res.status(403).json({ error: 'Nur der Kanal darf Umfragen starten 📢' });
    const b = req.body || {};
    const question = String(b.question || '').trim().slice(0, 140);
    const options = (Array.isArray(b.options) ? b.options : []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 10);
    if (!question) return res.status(400).json({ error: 'Frage fehlt' });
    if (options.length < 2) return res.status(400).json({ error: 'Mindestens 2 Antworten' });

    const p = {
      id: nextId('pl_'),
      chatId: chat.id,
      question,
      options,
      multiple: !!b.multiple,
      anonymous: !!b.anonymous,
      closed: false,
      createdAt: now(),
      closesAt: b.closesAt ? Math.min(now() + 30 * 86400000, parseInt(b.closesAt, 10) || 0) : 0,
      createdBy: req.user.id,
      votes: {},
    };
    db.polls[p.id] = p;

    const msg = {
      id: nextId('m_'),
      chatId: chat.id,
      senderId: req.user.id,
      text: question,
      kind: 'poll',
      attachment: { pollId: p.id },
      createdAt: now(),
      reactions: {},
      readBy: [req.user.id],
    };
    (db.messages[chat.id] = db.messages[chat.id] || []).push(msg);
    saveDb();
    sendToChat(chat.id, { type: 'message:new', chatId: chat.id, message: msg });
    sendToChat(chat.id, { type: 'poll:update', chatId: chat.id, poll: pollPublic(p, req.user.id) });
    for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, chat) });
    res.json({ ok: true, message: msg, poll: pollPublic(p, req.user.id) });
  }));

  app.get('/api/chats/:id/polls', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const list = Object.values(db.polls).filter((p) => p.chatId === chat.id);
    res.json({ polls: list.map((p) => pollPublic(p, req.user.id)) });
  }));

  app.post('/api/chats/:id/polls/:pid/vote', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const p = db.polls[String(req.params.pid)];
    if (!p || p.chatId !== chat.id) return res.status(404).json({ error: 'Umfrage nicht gefunden' });
    if (p.closed) return res.status(400).json({ error: 'Umfrage ist beendet' });
    if (p.closesAt && p.closesAt < now()) { p.closed = true; saveDb(); return res.status(400).json({ error: 'Zeit abgelaufen ⏰' }); }

    const idx = parseInt((req.body || {}).option, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= p.options.length) return res.status(400).json({ error: 'Ungültige Antwort' });

    if (p.multiple) {
      const cur = Array.isArray(p.votes[req.user.id]) ? p.votes[req.user.id] : [];
      p.votes[req.user.id] = cur.includes(idx) ? cur.filter((x) => x !== idx) : [...cur, idx];
    } else {
      p.votes[req.user.id] = p.votes[req.user.id] === idx ? undefined : idx;
      if (p.votes[req.user.id] === undefined) delete p.votes[req.user.id];
    }
    saveDb();
    sendToChat(chat.id, { type: 'poll:update', chatId: chat.id, poll: pollPublic(p, '') });
    res.json({ ok: true, poll: pollPublic(p, req.user.id) });
  }));

  app.post('/api/chats/:id/polls/:pid/close', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const p = db.polls[String(req.params.pid)];
    if (!p || p.chatId !== chat.id) return res.status(404).json({ error: 'Umfrage nicht gefunden' });
    if (!isChatAdmin(req.user, chat) && p.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Nur Ersteller oder Admins dürfen beenden' });
    }
    p.closed = true;
    saveDb();
    sendToChat(chat.id, { type: 'poll:update', chatId: chat.id, poll: pollPublic(p, '') });
    res.json({ ok: true, message: 'Umfrage beendet ✅' });
  }));

  /* =====================================================================
     ⏰ GEPLANTE NACHRICHTEN
     ===================================================================== */

  app.post('/api/chats/:id/messages/schedule', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    if (chat.type === 'channel' && !isChatAdmin(req.user, chat)) return res.status(403).json({ error: 'In Kanälen darf nur der Inhaber schreiben 📢' });
    const b = req.body || {};
    const text = String(b.text || '').trim().slice(0, 4000);
    const at = parseInt(b.at, 10) || 0;
    if (!text && !b.attachment) return res.status(400).json({ error: 'Nachricht ist leer' });
    if (at < now() + 5000) return res.status(400).json({ error: 'Zeitpunkt muss mindestens 5 Sekunden in der Zukunft liegen' });
    if (at > now() + 90 * 86400000) return res.status(400).json({ error: 'Maximal 90 Tage im Voraus' });

    const item = {
      id: nextId('sc_'),
      chatId: chat.id,
      userId: req.user.id,
      text,
      kind: ['text', 'sticker', 'gif', 'photo', 'video', 'voice', 'file', 'location'].includes(b.kind) ? b.kind : 'text',
      attachment: b.attachment && typeof b.attachment === 'object' ? b.attachment : null,
      at,
      createdAt: now(),
    };
    db.scheduled.push(item);
    saveDb();
    res.json({
      ok: true,
      scheduled: { ...item, chatName: chat.type === 'private' ? chat.name : chat.name },
      message: 'Geplant für ' + new Date(at).toLocaleString('de-DE') + ' ⏰',
    });
  }));

  app.get('/api/scheduled', auth, h(async (req, res) => {
    const mine = (db.scheduled || []).filter((s) => s.userId === req.user.id).sort((a, b) => a.at - b.at);
    res.json({
      scheduled: mine.map((s) => {
        const c = db.chats[s.chatId];
        return { ...s, chatName: c ? c.name : 'Chat gelöscht' };
      }),
    });
  }));

  app.delete('/api/scheduled/:id', auth, h(async (req, res) => {
    const i = (db.scheduled || []).findIndex((s) => s.id === String(req.params.id) && s.userId === req.user.id);
    if (i < 0) return res.status(404).json({ error: 'Nicht gefunden' });
    db.scheduled.splice(i, 1);
    saveDb();
    res.json({ ok: true, message: 'Geplante Nachricht gelöscht 🗑️' });
  }));

  /* =====================================================================
     🚫 BLOCKIEREN · MELDEN
     ===================================================================== */

  app.get('/api/blocks', auth, h(async (req, res) => {
    const mine = Object.keys(db.blocks[req.user.id] || {});
    res.json({ blocks: mine.map((id) => publicUserLite(db.users[id])).filter((u) => u.id) });
  }));

  app.post('/api/users/:id/block', auth, h(async (req, res) => {
    const target = db.users[String(req.params.id)];
    if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Dich selbst kannst du nicht blockieren 😊' });
    if (MOD.isOwner(target) && !MOD.isOwner(req.user)) return res.status(403).json({ error: 'Den Owner kann man nicht blockieren 👑' });
    db.blocks[req.user.id] = db.blocks[req.user.id] || {};
    db.blocks[req.user.id][target.id] = now();
    saveDb();
    res.json({ ok: true, message: target.displayName + ' blockiert 🚫' });
  }));

  app.delete('/api/users/:id/block', auth, h(async (req, res) => {
    const id = String(req.params.id);
    if (db.blocks[req.user.id]) delete db.blocks[req.user.id][id];
    saveDb();
    res.json({ ok: true, message: 'Blockierung aufgehoben 💗' });
  }));

  app.post('/api/report', auth, h(async (req, res) => {
    const b = req.body || {};
    const targetId = String(b.targetId || '');
    const reason = String(b.reason || 'Sonstiges').slice(0, 80);
    const text = String(b.text || '').slice(0, 1000);
    if (!targetId) return res.status(400).json({ error: 'Wen möchtest du melden?' });
    if (db.reports.some((r) => r.by === req.user.id && r.targetId === targetId && now() - r.at < 60_000)) {
      return res.status(429).json({ error: 'Du hast gerade schon gemeldet — kurz warten 💗' });
    }
    const r = {
      id: nextId('rp_'),
      by: req.user.id,
      byName: req.user.displayName,
      targetId,
      targetName: (db.users[targetId] || {}).displayName || 'Unbekannt',
      chatId: String(b.chatId || ''),
      messageId: String(b.messageId || ''),
      reason,
      text,
      at: now(),
      status: 'open',
    };
    db.reports.push(r);
    saveDb();
    MOD.logAction(req.user, db.users[targetId] || null, 'REPORT', reason + (text ? ': ' + text : ''));
    for (const staff of Object.values(db.users)) {
      if (MOD.rankOf(staff) >= MOD.RANKS.moderator) {
        sendToUser(staff.id, { type: 'report:new', report: r });
      }
    }
    res.json({ ok: true, message: 'Danke 💗 Das Team schaut sich das an.' });
  }));

  app.get('/api/admin/reports', auth, h(async (req, res) => {
    if (MOD.rankOf(req.user) < MOD.RANKS.moderator) return res.status(403).json({ error: 'Kein Zugriff' });
    const list = (db.reports || []).slice().reverse().slice(0, 200).map((r) => ({
      ...r,
      target: publicUserLite(db.users[r.targetId]),
    }));
    res.json({ reports: list });
  }));

  app.post('/api/admin/reports/:id/resolve', auth, h(async (req, res) => {
    if (MOD.rankOf(req.user) < MOD.RANKS.moderator) return res.status(403).json({ error: 'Kein Zugriff' });
    const r = db.reports.find((x) => x.id === String(req.params.id));
    if (!r) return res.status(404).json({ error: 'Meldung nicht gefunden' });
    r.status = 'resolved';
    r.resolvedBy = req.user.displayName;
    r.resolvedAt = now();
    saveDb();
    res.json({ ok: true, message: 'Meldung erledigt ✅' });
  }));

  /* =====================================================================
     🔍 NACHRICHTEN-SUCHE (über alle Chats)
     ===================================================================== */

  app.get('/api/search/messages', auth, h(async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const onlyChat = String(req.query.chatId || '');
    const kind = String(req.query.kind || '');
    if (q.length < 2) return res.json({ results: [], total: 0 });

    // 🙈 V4.4: versteckte Chats tauchen in der Suche NICHT auf (Leck geschlossen)
    const hidden = new Set(req.user.hiddenChats || []);
    const chatIds = Object.values(db.chats)
      .filter((c) => c.memberIds.includes(req.user.id))
      .filter((c) => !onlyChat || c.id === onlyChat)
      .filter((c) => !hidden.has(c.id))   // auch mit chatId-Parameter: versteckt bleibt versteckt
      .map((c) => c.id);

    const results = [];
    for (const cid of chatIds) {
      const chat = db.chats[cid];
      for (const m of db.messages[cid] || []) {
        if (m.deleted) continue;
        if (kind && (m.kind || 'text') !== kind) continue;
        const hay = (m.text || '') + ' ' + (m.attachment?.name || '');
        if (!hay.toLowerCase().includes(q)) continue;
        const sender = db.users[m.senderId] || {};
        results.push({
          chatId: cid,
          chatName: chat.type === 'private' ? chat.name : chat.name,
          chatType: chat.type,
          messageId: m.id,
          text: (m.text || '').slice(0, 200),
          kind: m.kind || 'text',
          senderId: m.senderId,
          senderName: sender.displayName || 'Unbekannt',
          createdAt: m.createdAt,
        });
      }
    }
    results.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ results: results.slice(0, 60), total: results.length });
  }));

  /* =====================================================================
     🔕 STUMMSCHALTEN · ARCHIV · UNGELESEN
     ===================================================================== */

  app.post('/api/chats/:id/mute', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const minutes = parseInt((req.body || {}).minutes, 10) || 0;
    chat.mutedByUser = chat.mutedByUser || {};
    if (minutes <= 0) delete chat.mutedByUser[req.user.id];
    else chat.mutedByUser[req.user.id] = now() + Math.min(minutes, 90 * 24 * 60) * 60000;
    saveDb();
    res.json({
      ok: true,
      mutedUntil: chat.mutedByUser[req.user.id] || 0,
      message: minutes > 0 ? 'Chat stummgeschaltet 🔕' : 'Benachrichtigungen wieder an 🔔',
    });
  }));

  app.post('/api/chats/:id/archive', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    chat.archivedByUser = chat.archivedByUser || {};
    const on = !!(req.body || {}).archived;
    if (on) chat.archivedByUser[req.user.id] = now();
    else delete chat.archivedByUser[req.user.id];
    saveDb();
    res.json({ ok: true, archived: on, message: on ? 'Archiviert 📦' : 'Aus dem Archiv geholt 💗' });
  }));

  app.post('/api/chats/:id/messages/:mid/unread', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    const m = (db.messages[chat.id] || []).find((x) => x.id === String(req.params.mid));
    if (!m) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
    m.readBy = (m.readBy || []).filter((id) => id !== req.user.id);
    saveDb();
    sendToUser(req.user.id, { type: 'chat:updated', summary: chatSummary(req.user.id, chat) });
    res.json({ ok: true, message: 'Als ungelesen markiert 🔵' });
  }));

  /* =====================================================================
     🔐 KONTO VORÜBERGEHEND SPERREN (Selbstschutz)
     ===================================================================== */

  app.post('/api/me/deactivate', auth, h(async (req, res) => {
    const me = req.user;
    if (isOwner(me)) return res.status(400).json({ error: 'Das Owner-Konto kann nicht deaktiviert werden 👑' });
    const b = req.body || {};
    if (!checkPassword(me, String(b.password || ''))) return res.status(401).json({ error: 'Passwort falsch' });
    const days = Math.min(90, Math.max(1, parseInt(b.days, 10) || 7));
    me.deactivatedUntil = now() + days * 86400000;
    me.deactivatedAt = now();
    // alle Sitzungen beenden
    for (const [tok, uid] of Object.entries(db.tokens)) if (uid === me.id) delete db.tokens[tok];
    saveDb();
    MOD.logAction(me, me, 'DEACTIVATE', `${days} Tage`);
    res.json({ ok: true, message: `Konto für ${days} Tage deaktiviert. Zum Zurückholen: /api/me/reactivate 💗` });
  }));

  app.post('/api/me/reactivate', h(async (req, res) => {
    const b = req.body || {};
    const login = String(b.login || '').trim().toLowerCase();
    const user = Object.values(db.users).find(
      (u) => u.username === login || u.phone === login || (u.email && String(u.email).toLowerCase() === login),
    );
    if (!user || !checkPassword(user, String(b.password || ''))) return res.status(401).json({ error: 'Login fehlgeschlagen' });
    if (!user.deactivatedUntil) return res.status(400).json({ error: 'Konto ist nicht deaktiviert' });
    if (user.deactivatedUntil < now()) {
      delete user.deactivatedUntil;
      saveDb();
      return res.json({ ok: true, message: 'Die Sperre ist schon abgelaufen — du kannst dich normal anmelden 💗' });
    }
    delete user.deactivatedUntil;
    delete user.deactivatedAt;
    saveDb();
    res.json({ ok: true, message: 'Willkommen zurück 💗 Dein Konto ist wieder aktiv.' });
  }));

  /* =====================================================================
     🤖 LOVEBOT (einziger Verwaltungs-Bot)
     ===================================================================== */

  app.get('/api/lovebot', auth, h(async (req, res) => {
    const bot = botUser();
    res.json({
      bot: bot ? publicUserLite(bot) : null,
      config: db.lovebotConfig,
      isOwner: isOwner(req.user),
      rule: 'LoveBot ist der einzige zugelassene Bot. Eigene Bots sind nicht erlaubt.',
    });
  }));

  app.post('/api/lovebot/config', auth, h(async (req, res) => {
    if (!isOwner(req.user)) return res.status(403).json({ error: 'Nur der Owner darf LoveBot konfigurieren 👑' });
    const b = req.body || {};
    const c = db.lovebotConfig;
    ['enabled', 'greetGroups', 'greetCommunities', 'modHints', 'weeklyPoll'].forEach((k) => {
      if (typeof b[k] === 'boolean') c[k] = b[k];
    });
    if (typeof b.signOff === 'string') c.signOff = b.signOff.slice(0, 80);
    saveDb();
    MOD.logAction(req.user, null, 'LOVEBOT', JSON.stringify(c));
    res.json({ ok: true, config: c, message: 'LoveBot-Einstellungen gespeichert 🤖💗' });
  }));

  /** LoveBot in einen Chat holen (Admin des Chats oder Owner) */
  app.post('/api/chats/:id/lovebot', auth, h(async (req, res) => {
    const chat = getChatOr404(req, res);
    if (!chat) return;
    if (!isChatAdmin(req.user, chat) && !isOwner(req.user)) return res.status(403).json({ error: 'Nur Admins dieses Chats' });
    const bot = botUser();
    if (!bot) return res.status(404).json({ error: 'LoveBot fehlt auf dem Server' });
    const action = String((req.body || {}).action || 'add');
    if (action === 'remove') {
      chat.memberIds = chat.memberIds.filter((id) => id !== bot.id);
      saveDb();
      return res.json({ ok: true, message: 'LoveBot verlässt den Chat 👋' });
    }
    if (!chat.memberIds.includes(bot.id)) chat.memberIds.push(bot.id);
    saveDb();
    sendToChat(chat.id, { type: 'member:added', chatId: chat.id, userId: bot.id, name: bot.displayName, byId: req.user.id });
        botSay(chat, 'Hey 💗 ich bin **Lovechen**, die KI von LoveChat ✨ Ich begrüße neue Leute, starte Umfragen und helfe bei Moderation. Schreib /help für meine Befehle 🤖');
    res.json({ ok: true, message: 'LoveBot ist jetzt im Chat 🤖' });
  }));

  /** LoveBot-Befehle, die in normalen Nachrichten ankommen */
  function lovebotHandle(chat, msg) {
    const bot = botUser();
    if (!bot || !db.lovebotConfig.enabled) return;
    if (!(chat.memberIds || []).includes(bot.id)) return;
    if (msg.senderId === bot.id) return;
    if (msg.kind !== 'text') return;
    const t = (msg.text || '').trim().toLowerCase();

    if (t === '/help' || t === '/hilfe') {
      botSay(chat, '✨ **Meine Befehle**\n/help – diese Hilfe\n/poll Frage | A | B – Umfrage starten\n/regeln – Gruppenregeln\n/stats – kleine Statistik\nUnd ich begrüße neue Leute automatisch 💗', { replyTo: msg.id });
      return;
    }
    if (t === '/regeln') {
      botSay(chat, '📜 **Regeln**\n1) Sei nett — kein Mobbing\n2) Keine Spam-Links\n3) Kein NSFW\n4) Admin-Ansagen gelten\nVerstöße → Warn, Mute, Ban. Einspruch ist immer möglich 💗');
      return;
    }
    if (t === '/stats') {
      const arr = db.messages[chat.id] || [];
      botSay(chat, `📊 **${chat.name}**\n👥 ${chat.memberIds.length} Mitglieder\n💬 ${arr.length} Nachrichten\n🕐 aktiv: ${new Date().toLocaleDateString('de-DE')}`);
      return;
    }
    if (t.startsWith('/poll ')) {
      if (!isChatAdmin({ id: msg.senderId, ...(db.users[msg.senderId] || {}) }, chat) && !MOD.isOwner(db.users[msg.senderId])) {
        botSay(chat, 'Nur Admins dürfen Umfragen starten 💗');
        return;
      }
      const parts = (msg.text || '').replace(/^\/poll\s+/i, '').split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) { botSay(chat, 'Format: `/poll Frage | Antwort A | Antwort B`'); return; }
      const p = {
        id: nextId('pl_'),
        chatId: chat.id,
        question: parts[0].slice(0, 140),
        options: parts.slice(1, 11).map((s) => s.slice(0, 60)),
        multiple: false,
        anonymous: false,
        closed: false,
        createdAt: now(),
        closesAt: 0,
        createdBy: bot.id,
        votes: {},
      };
      db.polls[p.id] = p;
      const m = {
        id: nextId('m_'),
        chatId: chat.id,
        senderId: bot.id,
        text: p.question,
        kind: 'poll',
        attachment: { pollId: p.id },
        createdAt: now(),
        reactions: {},
        readBy: [bot.id],
        bot: true,
      };
      (db.messages[chat.id] = db.messages[chat.id] || []).push(m);
      saveDb();
      sendToChat(chat.id, { type: 'message:new', chatId: chat.id, message: m });
      sendToChat(chat.id, { type: 'poll:update', chatId: chat.id, poll: pollPublic(p, '') });
      return;
    }
  }
  // Export für den Server (Nachrichten-Hook)
  app.locals.lovebotHandle = lovebotHandle;
  /* 🤖 V4.32 — der neue Befehls-Katalog (server/v432.js) schreibt ebenfalls
   * als Lovechen. Statt botSay zu kopieren, wird es hier geteilt. */
  app.locals.botSay = botSay;

  /* =====================================================================
     ⏱️ HINTERGRUND-JOBS: geplante Nachrichten, Momente, Umfragen
     ===================================================================== */

  setInterval(() => {
    let changed = false;

    // ⏰ fällige geplante Nachrichten senden
    const due = (db.scheduled || []).filter((s) => s.at <= now());
    if (due.length) {
      db.scheduled = db.scheduled.filter((s) => s.at > now());
      for (const s of due) {
        const chat = db.chats[s.chatId];
        const author = db.users[s.userId];
        if (!chat || !author || !chat.memberIds.includes(author.id)) continue;
        const msg = {
          id: nextId('m_'),
          chatId: chat.id,
          senderId: author.id,
          text: s.text || '',
          kind: s.kind || 'text',
          attachment: s.attachment || null,
          createdAt: now(),
          reactions: {},
          readBy: [author.id],
          scheduled: true,
        };
        (db.messages[chat.id] = db.messages[chat.id] || []).push(msg);
        sendToChat(chat.id, { type: 'message:new', chatId: chat.id, message: msg });
        for (const uid of chat.memberIds) sendToUser(uid, { type: 'chat:updated', summary: chatSummary(uid, chat) });
        changed = true;
      }
    }

    // 🌸 abgelaufene Momente entfernen
    const before = (db.moments || []).length;
    db.moments = (db.moments || []).filter((m) => m.createdAt + MOMENT_TTL > now());
    if (db.moments.length !== before) changed = true;

    // 📊 Umfragen mit Ablauf schließen
    for (const p of Object.values(db.polls || {})) {
      if (!p.closed && p.closesAt && p.closesAt < now()) {
        p.closed = true;
        const chat = db.chats[p.chatId];
        if (chat) sendToChat(chat.id, { type: 'poll:update', chatId: chat.id, poll: pollPublic(p, '') });
        changed = true;
      }
    }

    if (changed) saveDb();
  }, 5000);

  /* =====================================================================
     📊 V4-STATUS fürs Owner-Dashboard
     ===================================================================== */

  app.get('/api/admin/v4', auth, h(async (req, res) => {
    if (MOD.rankOf(req.user) < MOD.RANKS.moderator) return res.status(403).json({ error: 'Kein Zugriff' });
    res.json({
      moments: (db.moments || []).length,
      polls: Object.keys(db.polls || {}).length,
      scheduled: (db.scheduled || []).length,
      reports: (db.reports || []).filter((r) => r.status === 'open').length,
      blocks: Object.values(db.blocks || {}).reduce((n, o) => n + Object.keys(o).length, 0),
      lovebot: db.lovebotConfig,
      botUser: botUser() ? publicUserLite(botUser()) : null,
    });
  }));
}

module.exports = { createV4, MOMENT_TTL };
