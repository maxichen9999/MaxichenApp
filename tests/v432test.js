/* =====================================================================
 *  🧪 v432test.js — V4.32 „Lovechen mit Befehlen"
 * ---------------------------------------------------------------------
 *  Der Bot wird NICHT simuliert: jede Prüfung schickt eine echte Nachricht
 *  an den echten Server und liest die echte Antwort von Lovechen aus dem
 *  Chat. Dazu die Rechen-Einheit (eigener Parser, kein eval) und die
 *  Erinnerung, die wirklich feuert.
 *
 *  Voraussetzung: Server auf :3900 (MAIL_SIMULATE=1).
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.LC_BASE || 'http://127.0.0.1:3900';
const ROOT = process.env.LOVECHAT_ROOT || path.join(__dirname, '..', 'server');
const CLIENT = path.join(__dirname, '..', 'client');
const OUTBOX = path.join(ROOT, 'data', 'wa-outbox.jsonl');
const INTERNAL = process.env.INTERNAL_TOKEN || 'testtoken123456789012345678';

const { calc, parseDelay } = require('../server/v432.js');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
function section(t) { console.log(`\n— ${t} —`); }

async function call(method, p, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}

function lastCode(phone) {
  const jid = String(phone).replace(/\D/g, '') + '@s.whatsapp.net';
  try {
    const lines = fs.readFileSync(OUTBOX, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const o = JSON.parse(lines[i]);
      if (o.to === jid) {
        const m = String(o.text || '').match(/\*(\d{6})\*/);
        if (m) return m[1];
      }
    }
  } catch (e) {}
  return null;
}

async function resetLimits() {
  const r = await fetch(BASE + '/api/dev/reset-limits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-token': INTERNAL },
    body: '{}',
  });
  return r.ok;
}

async function signup(phone, name) {
  const req = await call('POST', '/api/v428/onboarding/request', { phone });
  const code = lastCode(phone);
  const ver = await call('POST', '/api/v428/onboarding/verify', { phone, code });
  if (req.j.mode === 'login') return { token: ver.j.token, user: ver.j.user, mode: 'login' };
  const pr = await call('POST', '/api/v428/onboarding/profile', { signupToken: ver.j.signupToken, displayName: name });
  if (pr.s !== 200) throw new Error('profile: ' + JSON.stringify(pr.j));
  const fin = await call('POST', '/api/v428/onboarding/finish', { signupToken: ver.j.signupToken });
  if (fin.s !== 200) throw new Error('finish: ' + JSON.stringify(fin.j));
  return { token: fin.j.token, user: fin.j.user, mode: 'signup' };
}

async function msgs(token, chatId) {
  const r = await call('GET', '/api/chats/' + chatId + '/messages?limit=100', null, token);
  return (r.j.messages || []);
}

/** Sendet einen Befehl und gibt Lovechens Antwort zurück (oder null). */
/* Grenzen der Gegenstelle (10 Befehle je Minute) — der Test würde sich sonst
 * selbst blocken. In Sektion ⑤ wird das bewusst abgeschaltet. */
let AUTO_RESET = true;
let nCmds = 0;

async function cmd(sess, chatId, text, wait) {
  if (AUTO_RESET && ++nCmds % 8 === 0) await resetLimits();
  const before = (await msgs(sess.token, chatId)).length;
  const r = await call('POST', '/api/chats/' + chatId + '/messages', { text }, sess.token);
  if (r.s !== 200) throw new Error('senden: ' + r.s + ' ' + JSON.stringify(r.j).slice(0, 120));
  await new Promise((res) => setTimeout(res, wait || 220));
  const all = await msgs(sess.token, chatId);
  const news = all.slice(before);
  const bots = news.filter((m) => m.senderId !== sess.user.id);
  return { sent: news.length, botCount: bots.length, bot: bots.length ? bots[bots.length - 1] : null, all: news };
}

const T = String(Date.now()).slice(-6);
const PH = '+49170' + T + '8';

(async () => {
  await resetLimits();
  section('0. Konto und Chat mit Lovechen');
  const me = await signup(PH, 'Anna');
  ok('0a: Konto angelegt', !!me.token, 'Pfad: ' + me.mode);

  const srch = await call('GET', '/api/search?q=Love', null, me.token);
  /* publicUser gibt kein `isBot` heraus — erkannt wird Lovechen am Namen
   * (und daran, dass es genau ein Treffer ist). */
  const bot = (srch.j.users || []).find((u) => /love/i.test(u.displayName || ''));
  ok('0b: Lovechen ist auffindbar', !!bot, JSON.stringify((srch.j.users || []).map((u) => u.displayName)));

  const chat = await call('POST', '/api/chats', { type: 'private', userId: bot.id }, me.token);
  const chatId = chat.j.summary && chat.j.summary.id;
  ok('0c: privater Chat mit Lovechen', !!chatId, JSON.stringify(chat.j).slice(0, 120));

  const warm = await cmd(me, chatId, 'Hallo 💗', 200);
  ok('0d: normale Nachricht → keine Bot-Antwort', warm.botCount === 0, 'Antworten: ' + warm.botCount);

  /* ================= ① Befehle ================= */
  await resetLimits();
  section('① Die Befehle antworten wirklich');

  let r = await cmd(me, chatId, '/ping');
  ok('1a: /ping → Antwort', !!r.bot, 'keine Antwort');
  ok('1b: /ping enthält „pong"', r.bot && /pong/i.test(r.bot.text), r.bot && r.bot.text);
  ok('1c: /ping nennt Millisekunden', r.bot && /ms/i.test(r.bot.text), r.bot && r.bot.text);

  r = await cmd(me, chatId, '/help');
  ok('1d: /help listet /ping', r.bot && r.bot.text.includes('/ping'), '');
  ok('1e: /help listet /erinnere', r.bot && r.bot.text.includes('/erinnere'), '');
  ok('1f: genau EINE Antwort auf /help', r.botCount === 1, 'Antworten: ' + r.botCount);
  ok('1g: /help ist nicht doppelt (kein alter Bot)', r.bot && ((r.bot.text.match(/\*\*Meine Befehle\*\*/g) || []).length === 1), '');

  r = await cmd(me, chatId, '/zeit');
  ok('1h: /zeit → Uhrzeit mit Doppelpunkt', r.bot && /\d{2}:\d{2}/.test(r.bot.text), r.bot && r.bot.text);
  ok('1i: /zeit → Datum mit Jahr', r.bot && /\d{4}/.test(r.bot.text), '');

  r = await cmd(me, chatId, '/würfel');
  const w6 = r.bot && Number((r.bot.text.match(/\*\*(\d+)\*\*/) || [])[1]);
  ok('1j: /würfel → 1 bis 6', w6 >= 1 && w6 <= 6, String(w6));

  r = await cmd(me, chatId, '/würfel 20');
  const w20 = r.bot && Number((r.bot.text.match(/\*\*(\d+)\*\*/) || [])[1]);
  ok('1k: /würfel 20 → 1 bis 20', w20 >= 1 && w20 <= 20, String(w20));

  r = await cmd(me, chatId, '/zahl 5 5');
  ok('1l: /zahl 5 5 → genau 5', r.bot && r.bot.text.includes('**5**'), r.bot && r.bot.text);

  r = await cmd(me, chatId, '/zahl 1 3');
  const z = r.bot && Number((r.bot.text.match(/\*\*(\d+)\*\*/) || [])[1]);
  ok('1m: /zahl 1 3 → 1 bis 3', z >= 1 && z <= 3, String(z));

  r = await cmd(me, chatId, '/münze');
  ok('1n: /münze → Kopf oder Zahl', r.bot && /Kopf|Zahl/.test(r.bot.text), r.bot && r.bot.text);

  r = await cmd(me, chatId, '/witz');
  ok('1o: /witz → ein Witz', r.bot && r.bot.text.length > 20, r.bot && r.bot.text.slice(0, 40));

  r = await cmd(me, chatId, '/kompliment');
  ok('1p: /kompliment nennt mich', r.bot && /Anna/.test(r.bot.text), r.bot && r.bot.text);

  r = await cmd(me, chatId, '/rechne 2+2*3');
  ok('1q: /rechne 2+2*3 = 8', r.bot && /8/.test(r.bot.text), r.bot && r.bot.text);
  r = await cmd(me, chatId, '/rechne (2+3)*4');
  ok('1r: /rechne (2+3)*4 = 20', r.bot && /20/.test(r.bot.text), r.bot && r.bot.text);
  r = await cmd(me, chatId, '/rechne 1/0');
  ok('1s: /rechne 1/0 → freundlicher Hinweis', r.bot && /nicht rechnen|Damit kann ich/i.test(r.bot.text), r.bot && r.bot.text);

  r = await cmd(me, chatId, '/info');
  ok('1t: /info nennt V4.32', r.bot && /V4\.32/.test(r.bot.text), r.bot && r.bot.text);
  ok('1u: /info nennt LoveChat', r.bot && /LoveChat/.test(r.bot.text), '');

  r = await cmd(me, chatId, '/id');
  ok('1v: /id zeigt meine ID', r.bot && r.bot.text.includes(me.user.id), r.bot && r.bot.text);
  ok('1w: /id zeigt die Chat-ID', r.bot && r.bot.text.includes(chatId), '');

  r = await cmd(me, chatId, '/status');
  ok('1x: /status nennt Mitglieder', r.bot && /Mitglieder/.test(r.bot.text), r.bot && r.bot.text);
  ok('1y: /status nennt Nachrichten', r.bot && /Nachrichten/.test(r.bot.text), '');

  /* ================= ② Suche im Chat ================= */
  await resetLimits();
  section('② /suche findet wirklich etwas');
  await cmd(me, chatId, 'Wir gehen ins Kino 🎬', 250);
  r = await cmd(me, chatId, '/suche Kino');
  ok('2a: /suche findet „Kino"', r.bot && /Kino/.test(r.bot.text) && /1 Treffer|Treffer/.test(r.bot.text), r.bot && r.bot.text);
  r = await cmd(me, chatId, '/suche gibtsnicht' + T);
  ok('2b: /suche ohne Treffer sagt es', r.bot && /Nichts zu/.test(r.bot.text), r.bot && r.bot.text);
  r = await cmd(me, chatId, '/suche a');
  ok('2c: /suche mit 1 Zeichen → Beispiel', r.bot && /Wonach|Beispiel/.test(r.bot.text), r.bot && r.bot.text);

  /* ================= ③ Erinnerung ================= */
  await resetLimits();
  section('③ /erinnere speichert und feuert');
  r = await cmd(me, chatId, '/erinnere 10m Tee kochen');
  ok('3a: Bestätigung mit 10 min', r.bot && /10 min/.test(r.bot.text), r.bot && r.bot.text);
  const rem = await call('GET', '/api/v432/reminders', null, me.token);
  ok('3b: Erinnerung liegt auf dem Server', rem.s === 200 && rem.j.count >= 1, JSON.stringify(rem.j).slice(0, 100));
  ok('3c: Text ist gespeichert', (rem.j.reminders || []).some((x) => /Tee kochen/.test(x.text)), '');

  r = await cmd(me, chatId, '/erinnere gleich');
  ok('3d: ohne Zeit → Format-Hinweis', r.bot && /Format/.test(r.bot.text), r.bot && r.bot.text);

  await cmd(me, chatId, '/erinnere 5s Kurztest', 200);
  let fired = [];
  for (let i = 0; i < 20; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    const after = await msgs(me.token, chatId);
    fired = after.filter((m) => m.senderId === bot.id && /Erinnerung/.test(m.text || ''));
    if (fired.length) break;
  }
  ok('3e: Erinnerung kommt nach 5 s wirklich an', fired.length > 0, 'Bot-Nachrichten mit „Erinnerung": ' + fired.length);
  ok('3f: Erinnerung nennt den Text', fired.some((m) => /Kurztest/.test(m.text)), '');

  /* ================= ④ /bot aus und an ================= */
  await resetLimits();
  section('④ /bot aus · /bot an');
  r = await cmd(me, chatId, '/bot aus');
  ok('4a: /bot aus bestätigt', r.bot && /halte mich raus/i.test(r.bot.text), r.bot && r.bot.text);
  r = await cmd(me, chatId, '/ping');
  ok('4b: aus → /ping bleibt still', r.botCount === 0, 'Antworten: ' + r.botCount);
  r = await cmd(me, chatId, '/help');
  ok('4c: aus → auch /help still', r.botCount === 0, '');
  r = await cmd(me, chatId, '/bot an');
  ok('4d: /bot an bestätigt', r.bot && /wieder da/i.test(r.bot.text), r.bot && r.bot.text);
  r = await cmd(me, chatId, '/ping');
  ok('4e: an → /ping antwortet wieder', !!(r.bot && /pong/i.test(r.bot.text)), r.bot && r.bot.text);

  /* ================= ⑤ Grenzen ================= */
  await resetLimits();
  section('⑤ Grenzen und Unbekanntes');
  await resetLimits();
  AUTO_RESET = false;
  let slow = null;
  for (let i = 0; i < 11; i++) {
    const rr = await cmd(me, chatId, '/ping', 120);
    if (rr.bot && /Langsamer/i.test(rr.bot.text)) { slow = i + 1; break; }
  }
  ok('5a: nach 10 Befehlen kommt die Pause', slow !== null, 'bei Befehl ' + slow);

  await resetLimits();
  r = await cmd(me, chatId, '/quatsch123');
  ok('5b: unbekannter Befehl → Hinweis auf /help', r.bot && /kenne ich nicht/.test(r.bot.text), r.bot && r.bot.text);

  AUTO_RESET = true;
  /* --- alte Befehle dürfen NICHT vom neuen Handler geschluckt werden --- */
  await resetLimits();
  r = await cmd(me, chatId, '/stats');
  ok('5c: /stats antwortet noch (alter Handler)', r.bot && /Mitglieder/.test(r.bot.text), r.bot && r.bot.text.slice(0, 60));
  r = await cmd(me, chatId, '/regeln');
  ok('5d: /regeln antwortet noch', r.bot && /Regeln/.test(r.bot.text), r.bot && r.bot.text.slice(0, 60));

  /* ================= ⑥ Rechnen (Einheit) ================= */
  section('⑥ Rechen-Parser ohne eval');
  ok('6a: 2+2*3 = 8', calc('2+2*3') === 8, String(calc('2+2*3')));
  ok('6b: (2+3)*4 = 20', calc('(2+3)*4') === 20, String(calc('(2+3)*4')));
  ok('6c: 10/4 = 2.5', calc('10/4') === 2.5, String(calc('10/4')));
  ok('6d: -5+3 = -2', calc('-5+3') === -2, String(calc('-5+3')));
  ok('6e: 2^10 = 1024', calc('2^10') === 1024, String(calc('2^10')));
  ok('6f: 1,5*2 = 3', calc('1,5*2') === 3, String(calc('1,5*2')));
  ok('6g: 1/0 → null (kein Infinity)', calc('1/0') === null, String(calc('1/0')));
  ok('6h: „abc" → null', calc('abc') === null, '');
  ok('6i: Code wird NICHT ausgeführt', calc('process.exit(1)') === null, '');
  ok('6j: Klammerfehler → null', calc('(2+3') === null, '');
  ok('6k: parseDelay 10m', parseDelay('10m Tee') && parseDelay('10m Tee').ms === 600000, JSON.stringify(parseDelay('10m Tee')));
  ok('6l: parseDelay „gleich" → null', parseDelay('gleich') === null, '');

  /* ================= ⑦ Oberfläche ================= */
  section('⑦ Oberfläche');
  const html = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');
  ok('7a: v432.js eingebunden', html.includes('/v432.js'), '');
  const cl = fs.readFileSync(path.join(CLIENT, 'v432.js'), 'utf8');
  ok('7b: Palette kennt /ping', cl.includes("'/ping'"), '');
  ok('7c: Palette kennt /erinnere', cl.includes("'/erinnere'"), '');
  ok('7d: Palette öffnet bei „/"', cl.includes("startsWith('/')"), '');
  const appJs = fs.readFileSync(path.join(CLIENT, 'app.js'), 'utf8');
  ok('7e: Sprachnachricht hat Geschwindigkeit', appJs.includes('voiceRate'), '');
  ok('7f: 0,5× ist dabei', appJs.includes('0.5]'), '');

  /* ================= Ergebnis ================= */
  /* --- kleine Oberflächen-Reparaturen aus V4.32 --- */
  const v432c = cl;
  const appc = appJs;
  ok('7g: Palette schließt beim Abschicken', /if \(e\.key === 'Enter'\) close\(\)/.test(v432c), '');
  ok('7h: Befehle in Antworten werden Code-Chips', /lcCode/.test(v432c) && /lcCode/.test(appc), '');
  ok('7i: jede Nachricht ist merkbar (nicht nur die eigene)',
    /\{ a: 'star', ico: '⭐', t: 'Merken' \},/.test(appc), '');

  console.log('\n' + '='.repeat(60));
  console.log(`  V4.32 — ${pass} ✅ / ${fail} ❌`);
  if (fail) { console.log('  Fehlgeschlagen:'); failures.forEach((f) => console.log('   • ' + f)); }
  console.log('='.repeat(60));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('💥 Testlauf abgebrochen:', e && e.message);
  console.error(e && e.stack);
  process.exit(1);
});
