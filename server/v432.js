/* =====================================================================
 *  🤖 v432.js — Lovechen mit Befehlen (V4.32)
 * ---------------------------------------------------------------------
 *  Bis V4.31 konnte Lovechen vier Dinge: /help, /regeln, /stats, /poll.
 *  Hier kommt der Rest dazu — alles, was ein Chat-Bot können soll, ohne
 *  dass man dafür eine KI-API braucht:
 *
 *    /ping                 Antwortzeit messen
 *    /help /hilfe          alle Befehle
 *    /zeit                 Uhrzeit + Datum
 *    /würfel [6]           Würfel werfen
 *    /zahl 1 100           Zufallszahl
 *    /münze                Kopf oder Zahl
 *    /witz                 platter Witz
 *    /kompliment           Kompliment
 *    /rechne 2+2*3         rechnen (eigener Parser, KEIN eval)
 *    /info                 Version, Laufzeit, Konten
 *    /id                   eigene ID + Chat-ID
 *    /status               wer ist da, wie viele Nachrichten
 *    /suche Begriff        Suche in diesem Chat (nutzt v431)
 *    /erinnere 10m Text    Erinnerung — Lovechen meldet sich
 *    /bot an | /bot aus    Antworten ein-/ausschalten (pro Nutzer)
 *
 *  Regeln, die für ALLE gelten (auch für den Owner):
 *    · höchstens 10 Befehle pro Minute, danach eine kurze Pause
 *    · nur in Chats, in denen Lovechen Mitglied ist
 *    · ein Befehl, eine Antwort — keine Doppel-Antworten
 * ===================================================================== */

'use strict';

const VERSION = 'V4.32';
const CMD_MAX = 10;              // Befehle pro Minute
const CMD_WINDOW = 60 * 1000;

/* ---------------- Rechnen ohne eval ----------------
 * Shunting-Yard: Zahlen, + - * / % ^, Klammern, Komma als Dezimaltrenner.
 * Alles andere → null (kein Code, keine Funktionen, kein Zugriff). */
function calc(expr) {
  const s = String(expr || '').replace(/,/g, '.').replace(/\s+/g, '');
  if (!s || s.length > 60) return null;
  if (!/^[0-9+\-*/%^().]+$/.test(s)) return null;

  const tokens = s.match(/\d+\.?\d*|[+\-*/%^()]/g);
  if (!tokens) return null;

  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  const right = { '^': true };
  const out = [];
  const ops = [];
  let prevType = 'start';

  for (const t of tokens) {
    if (/^\d/.test(t)) { out.push(parseFloat(t)); prevType = 'num'; continue; }
    if (t === '(') { ops.push(t); prevType = 'open'; continue; }
    if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop());
      if (!ops.length) return null;
      ops.pop();
      prevType = 'close';
      continue;
    }
    // Vorzeichen: -5 oder (-5) oder 3 * -2
    if ((t === '-' || t === '+') && (prevType === 'start' || prevType === 'op' || prevType === 'open')) {
      out.push(0);
    }
    while (ops.length && ops[ops.length - 1] !== '(' &&
      (prec[ops[ops.length - 1]] > prec[t] || (prec[ops[ops.length - 1]] === prec[t] && !right[t]))) {
      out.push(ops.pop());
    }
    ops.push(t);
    prevType = 'op';
  }
  while (ops.length) { const o = ops.pop(); if (o === '(') return null; out.push(o); }

  const st = [];
  for (const t of out) {
    if (typeof t === 'number') { st.push(t); continue; }
    const b = st.pop(), a = st.pop();
    if (a === undefined || b === undefined) return null;
    let r;
    switch (t) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '*': r = a * b; break;
      case '/': if (b === 0) return null; r = a / b; break;
      case '%': if (b === 0) return null; r = a % b; break;
      case '^': r = Math.pow(a, b); break;
      default: return null;
    }
    st.push(r);
  }
  if (st.length !== 1 || !isFinite(st[0])) return null;
  return Math.round(st[0] * 1e10) / 1e10;
}

const WITZE = [
  'Warum können Geister so schlecht lügen? — Weil man durch sie hindurchsieht 👻',
  'Was macht ein Pirat auf einem Segelflugzeug? — Höhenangst 🏴‍☠️',
  'Wie nennt man einen Bumerang, der nicht zurückkommt? — Stock 🪃',
  'Warum hat der Computer Angst vor dem Internet? — Es hat ein Netzwerk-Problem 💻',
  'Zwei WLAN-Router heiraten. Die Feier war super, nur der Empfang mies 📶',
  'Was sagt ein Mathematiker im Restaurant? — „Ich hätte gern ∫ e^x dx" … „Das ist doch dasselbe!" 🥐',
  'Warum sind Fische so schlecht in Mathe? — Weil sie ständig abtauchen 🐟',
  'Ich wollte Witze über Uhren machen — aber die waren mir zu zeitaufwendig ⏰',
];

const KOMPLIMENTE = [
  'Du hast heute den Freundlichkeits-Rekord gebrochen 💗',
  'Wenn gute Laune eine Person wäre — sie wäre du ✨',
  'Deine Nachrichten machen jeden Chat ein bisschen pinker 🌸',
  'Du bist der Grund, warum „zu nett" ein Kompliment ist 💕',
  'Ich habe 1.000 Chats gesehen — und du gehörst zu den Besten 🌟',
  'Dein Tipp-Stil? Großartig. Dein Geschmack? Noch besser 💅',
];

/* „10m Mama anrufen" → { ms: 600000, rest: "Mama anrufen" } */
function parseDelay(txt) {
const m = String(txt || '').match(/^(\d{1,4})\s*(s|sek|min|m|h|std|tag|t)\b/i);
if (!m) return null;
const n = parseInt(m[1], 10);
const unit = m[2].toLowerCase();
const mult = unit === 's' || unit === 'sek' ? 1000
  : unit === 'min' || unit === 'm' ? 60000
    : unit === 'h' || unit === 'std' ? 3600000
      : 86400000;
const ms = n * mult;
if (ms < 5000) return { ms: 5000, rest: String(txt).slice(m[0].length).trim() || 'Erinnerung' };
if (ms > 7 * 86400000) return { ms: 7 * 86400000, rest: String(txt).slice(m[0].length).trim() || 'Erinnerung' };
return { ms, rest: String(txt).slice(m[0].length).trim().replace(/^[,–-]\s*/, '') || 'Erinnerung' };
}


function createV432(app, h, ctx) {
  const { db, saveDb, auth } = ctx;
  const STARTED = Date.now();
  const CMDS = new Map();        // uid → [timestamps]
  const REM_TIMER = { t: null };

  function botUser() {
    return Object.values(db.users || {}).find((u) => u.isBot && u.botType === 'lovebot') || null;
  }
  function botIn(chat) {
    const b = botUser();
    return !!(b && Array.isArray(chat.memberIds) && chat.memberIds.includes(b.id));
  }
  function say(chat, text, extra) {
    if (typeof app.locals.botSay !== 'function') return null;
    return app.locals.botSay(chat, text, extra || {});
  }
  function isBotOn(user) {
    return !(user && user.botMuted === true);
  }
  function withinLimit(userId) {
    const now = Date.now();
    let arr = (CMDS.get(userId) || []).filter((t) => now - t < CMD_WINDOW);
    if (arr.length >= CMD_MAX) { CMDS.set(userId, arr); return false; }
    arr.push(now);
    CMDS.set(userId, arr);
    return true;
  }
  function msSince(ts) { return Math.max(0, Date.now() - ts); }

  const HELP = [
    '🤖 **Meine Befehle**',
    '',
    '/ping — bin ich wach?',
    '/zeit — Uhrzeit + Datum',
    '/würfel [6] — Würfel werfen',
    '/zahl 1 100 — Zufallszahl',
    '/münze — Kopf oder Zahl',
    '/witz — ein Witz',
    '/kompliment — für dich',
    '/rechne 2+2*3 — ich rechne',
    '/suche Kino — diesen Chat durchsuchen',
    '/erinnere 10m Mama anrufen — ich erinnere dich',
    '/status — wer ist da',
    '/info — Version + Laufzeit',
    '/id — deine ID + Chat-ID',
    '/bot aus · /bot an — Antworten schalten',
    '/regeln · /stats · /poll Frage | A | B — wie vorher',
  ].join('\n');

  /* ---------------- Erinnerungen ---------------- */
  function addReminder(user, chat, text, ms) {
    db.reminders = db.reminders || [];
    const r = {
      id: 'rem_' + Math.random().toString(16).slice(2, 10),
      userId: user.id,
      chatId: chat.id,
      text: String(text || 'Erinnerung').slice(0, 200),
      dueAt: Date.now() + ms,
      createdAt: Date.now(),
    };
    db.reminders.push(r);
    if (db.reminders.length > 2000) db.reminders = db.reminders.slice(-2000);
    saveDb();
    return r;
  }

  function tickReminders() {
    const now = Date.now();
    const list = db.reminders || [];
    if (!list.length) return;
    const due = list.filter((r) => r.dueAt <= now);
    if (!due.length) return;
    db.reminders = list.filter((r) => r.dueAt > now);
    for (const r of due) {
      const chat = db.chats[r.chatId];
      if (!chat) continue;
      const u = db.users[r.userId];
      if (!u) continue;
      if (!chat.memberIds.includes(u.id)) continue;
      if (!botIn(chat)) continue;
      /* „/bot aus" schaltet Antworten ab — nicht aber eine Erinnerung,
       * die der Nutzer selbst bestellt hat. Sonst wäre sie still verloren. */
      say(chat, `⏰ **Erinnerung** für ${u.displayName}: ${r.text}`);
    }
    saveDb();
  }

  function startReminders() {
    if (REM_TIMER.t) return;
    REM_TIMER.t = setInterval(() => {
      try { tickReminders(); } catch (e) { /* nie den Server abschießen */ }
    }, 1000);
    if (REM_TIMER.t.unref) REM_TIMER.t.unref();
    tickReminders();
  }

  /* ---------------- Der eigentliche Handler ---------------- */
  /**
   * @returns true, wenn der Befehl beantwortet wurde (dann soll der alte
   *          LoveBot-Handler nicht auch noch antworten).
   */
  function handle(chat, msg) {
    if (!chat || !msg) return false;
    if (msg.kind !== 'text') return false;
    const raw = String(msg.text || '').trim();
    if (!raw.startsWith('/')) return false;
    if (!botIn(chat)) return false;
    const bot = botUser();
    if (bot && msg.senderId === bot.id) return false;

    const user = db.users[msg.senderId];
    if (!user) return false;

    const cmd = (raw.split(/\s+/)[0] || '').toLowerCase();
    const arg = raw.slice(cmd.length).trim();
    const name = user.displayName || user.username || 'du';

    // Ausschalten geht immer, auch wenn die Antworten aus sind.
    if (cmd === '/bot') {
      const a = arg.toLowerCase();
      if (a === 'aus' || a === 'off') { user.botMuted = true; saveDb(); say(chat, '😴 Okay — ich halte mich raus. Mit `/bot an` bin ich wieder da.', { replyTo: msg.id }); return true; }
      if (a === 'an' || a === 'on') { user.botMuted = false; saveDb(); say(chat, '🤖 Ich bin wieder da! Schreib `/help` 💗', { replyTo: msg.id }); return true; }
      say(chat, `Gerade: **${isBotOn(user) ? 'an' : 'aus'}** · schalte mit \`/bot an\` oder \`/bot aus\`.`, { replyTo: msg.id });
      return true;
    }

    /* Diese drei gehören weiter dem alten Handler (v4.js). Ohne diese Zeile
     * würde der „kenne ich nicht"-Zweig sie abfangen und v4.js käme nie dran. */
    if (cmd === '/regeln' || cmd === '/stats' || cmd === '/poll') return false;

    if (!isBotOn(user)) return true;          // still, aber Befehl „verbraucht"

    if (!withinLimit(user.id)) {
      say(chat, '🐢 Langsamer! Höchstens 10 Befehle pro Minute — ich bin auch nur ein Roboter 💗', { replyTo: msg.id });
      return true;
    }

    switch (cmd) {
      case '/ping':
        say(chat, `🏓 **pong** · ${msSince(msg.createdAt || Date.now())} ms · ${VERSION}`, { replyTo: msg.id });
        return true;

      case '/help': case '/hilfe': case '/befehle': case '/commands':
        say(chat, HELP, { replyTo: msg.id });
        return true;

      case '/zeit': case '/time': {
        const now = new Date();
        const zeit = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const datum = now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        say(chat, `🕐 **${zeit}**\n📅 ${datum}`, { replyTo: msg.id });
        return true;
      }

      case '/würfel': case '/wuerfel': case '/dice': {
        const n = Math.min(100, Math.max(2, parseInt(arg, 10) || 6));
        const r = 1 + Math.floor(Math.random() * n);
        say(chat, `🎲 **${r}** von ${n} — ${r === n ? 'Jackpot! 🎉' : r === 1 ? 'Autsch 😅' : 'nochmal?'}`, { replyTo: msg.id });
        return true;
      }

      case '/zahl': case '/random': {
        const p = arg.split(/[\s,]+/).map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x));
        const a = p.length >= 2 ? p[0] : 1;
        const b = p.length >= 2 ? p[1] : (p.length === 1 ? p[0] : 100);
        const lo = Math.min(a, b), hi = Math.max(a, b);
        if (hi - lo > 10000000) { say(chat, 'So große Zahlen? Bis 10.000.000 Abstand, bitte 💗', { replyTo: msg.id }); return true; }
        const r = lo + Math.floor(Math.random() * (hi - lo + 1));
        say(chat, `🔢 **${r}** (zwischen ${lo} und ${hi})`, { replyTo: msg.id });
        return true;
      }

      case '/münze': case '/muenze': case '/coin':
        say(chat, Math.random() < 0.5 ? '🪙 **Kopf**' : '🪙 **Zahl**', { replyTo: msg.id });
        return true;

      case '/witz': case '/joke':
        say(chat, '😂 ' + WITZE[Math.floor(Math.random() * WITZE.length)], { replyTo: msg.id });
        return true;

      case '/kompliment': case '/compliment':
        say(chat, '💗 ' + name + ', ' + KOMPLIMENTE[Math.floor(Math.random() * KOMPLIMENTE.length)], { replyTo: msg.id });
        return true;

      case '/rechne': case '/calc': case '/math': {
        const r = calc(arg);
        if (r === null) { say(chat, '🤔 Damit kann ich nicht rechnen. Beispiel: `/rechne (2+3)*4`', { replyTo: msg.id }); return true; }
        say(chat, `🧮 \`${arg}\` = **${r}**`, { replyTo: msg.id });
        return true;
      }

      case '/info': case '/version': {
        const users = Object.values(db.users || {}).filter((u) => !u.isBot).length;
        const min = Math.floor(msSince(STARTED) / 60000);
        const lauf = min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
        say(chat, `💗 **LoveChat ${VERSION}**\n🤖 Lovechen · Antworten aus Regeln, keine KI-Cloud\n⏱️ läuft seit ${lauf}\n👥 ${users} Konten\n🌐 maxichen.de/chat`, { replyTo: msg.id });
        return true;
      }

      case '/id': case '/me':
        say(chat, `👤 \`${user.id}\`\n💬 \`${chat.id}\`\n@${user.username || '?'}`, { replyTo: msg.id });
        return true;

      case '/status': {
        const msgs = (db.messages[chat.id] || []).length;
        const mem = (chat.memberIds || []).length;
        const today = (db.messages[chat.id] || []).filter((m) => Date.now() - m.createdAt < 86400000).length;
        say(chat, `📊 **${chat.name || 'Chat'}**\n👥 ${mem} Mitglieder\n💬 ${msgs} Nachrichten (${today} in 24 h)`, { replyTo: msg.id });
        return true;
      }

      case '/suche': case '/search': {
        if (arg.length < 2) { say(chat, '🔍 Wonach? Beispiel: `/suche Kino`', { replyTo: msg.id }); return true; }
        const needle = arg.toLowerCase();
        const hits = (db.messages[chat.id] || []).filter((m) =>
          !m.deleted && m.id !== msg.id && String(m.text || '').toLowerCase().includes(needle));
        if (!hits.length) { say(chat, `🔍 Nichts zu „${arg}" in diesem Chat.`, { replyTo: msg.id }); return true; }
        const lines = hits.slice(-5).map((m) => {
          const u = db.users[m.senderId];
          return `· ${(u && u.displayName) || '?'}: ${String(m.text || '').slice(0, 60)}`;
        });
        say(chat, `🔍 **${hits.length} Treffer** für „${arg}"\n${lines.join('\n')}`, { replyTo: msg.id });
        return true;
      }

      case '/erinnere': case '/remind': {
        const d = parseDelay(arg);
        if (!d) { say(chat, '⏰ Format: `/erinnere 10m Mama anrufen` (s, min, m, h, tag)', { replyTo: msg.id }); return true; }
        addReminder(user, chat, d.rest, d.ms);
        const mins = Math.round(d.ms / 60000);
        say(chat, `⏰ Alles klar, ${name}! Ich melde mich in ${mins >= 1 ? mins + ' min' : Math.round(d.ms / 1000) + ' s'} an „${d.rest}".`, { replyTo: msg.id });
        return true;
      }

      default:
        // Unbekannt → einmal ein kurzer Hinweis, aber nur wenn es wie ein
        // Befehl aussieht (sonst wäre jeder Smiley „/lachen" eine Antwort).
        if (/^\/[a-z0-9äöüß_-]{2,}$/i.test(cmd)) {
          say(chat, `🤔 \`${cmd}\` kenne ich nicht. Schreib \`/help\` — da stehen alle.`, { replyTo: msg.id });
          return true;
        }
        return false;
    }
  }

  /* Eigene Erinnerungen ansehen — damit man nicht raten muss, ob etwas
   * gespeichert ist (und damit der Test es messen kann). */
  app.get('/api/v432/reminders', auth, h(async (req, res) => {
    const mine = (db.reminders || []).filter((r) => r.userId === req.user.id);
    res.set('Cache-Control', 'no-store');
    res.json({
      count: mine.length,
      reminders: mine.map((r) => ({ id: r.id, chatId: r.chatId, text: r.text, dueAt: r.dueAt, inMs: r.dueAt - Date.now() })),
    });
  }));

  app.locals.v432Handle = handle;
  startReminders();

  /** Nur für den Test-/Dev-Weg: Befehls-Zähler leeren. */
  function resetCounters() { const n = CMDS.size; CMDS.clear(); return n; }

  return {
    VERSION, handle, calc, parseDelay, tickReminders, HELP, resetCounters,
    CMD_MAX, CMD_WINDOW,
    routes: ['POST /api/chats/:id/messages (Befehle)'],
  };
}

module.exports = { createV432, calc, parseDelay };
