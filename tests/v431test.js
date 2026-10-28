/* =====================================================================
 *  🧪 v431test.js — V4.31 „Suchen & Merken"
 * ---------------------------------------------------------------------
 *  Geprüft wird, was der Server wirklich macht:
 *
 *    ① Suche       GET /api/v431/search
 *         · findet Text, unabhängig von Groß/Klein
 *         · mindestens 2 Zeichen, sonst 400
 *         · nur eigene Chats (fremder Chat → 403)
 *         · gelöschte Nachrichten tauchen nicht auf
 *         · liefert Trefferzahl + Ausschnitt
 *         · ohne Anmeldung 401
 *    ② Gemerkt     POST /api/v431/star · GET /api/v431/starred · DELETE
 *         · an/aus in einem Aufruf
 *         · liegt auf dem Server (zweiter Abruf zeigt es weiter)
 *         · fremder Chat 403, unbekannte Nachricht 404
 *         · gelöschte Nachricht verschwindet aus der Liste
 *
 *  Dazu ein paar Standbild-Prüfungen für die Oberfläche (Icon, Manifest,
 *  Lupe im Chat-Kopf, Skript eingebunden) — die Bilder selbst werden im
 *  Browser-Beweis geprüft, nicht hier.
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

async function privateChat(a, bId) {
  const r = await call('POST', '/api/chats', { type: 'private', userId: bId }, a.token);
  return r.j.summary && r.j.summary.id;
}

async function send(tok, chatId, text) {
  return call('POST', '/api/chats/' + chatId + '/messages', { text }, tok);
}

/** Breite/Höhe aus dem PNG-Kopf lesen (ohne Bibliothek). */
function pngSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.slice(1, 4).toString() !== 'PNG') return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
  } catch (e) { return null; }
}

const T = String(Date.now()).slice(-6);
const OWNER = '+4915155894714';
const PH_A = '+49170' + T + '3';
const PH_B = '+49170' + T + '4';
const PH_C = '+49170' + T + '5';

(async () => {
  await resetLimits();
  console.log('  🧹 Limits zurückgesetzt');

  /* ================= Vorbereitung ================= */
  section('0. Konten, Chat und Nachrichten');
  const owner = await signup(OWNER, 'Maxichen 💗');
  ok('0a: Owner meldet sich an', !!owner.token, 'Pfad: ' + owner.mode);
  const a = await signup(PH_A, 'Anna');
  const b = await signup(PH_B, 'Ben');
  const c = await signup(PH_C, 'Clara');
  ok('0b: drei normale Konten', !!a.token && !!b.token && !!c.token);

  const ab = await privateChat(a, b.user.id);
  const ac = await privateChat(a, c.user.id);
  ok('0c: zwei private Chats', !!ab && !!ac);

  const m1 = await send(a.token, ab, 'Wir gehen morgen ins Kino 🎬');
  const m2 = await send(a.token, ab, 'Kino um acht, ja?');
  const m3 = await send(b.token, ab, 'Kino klingt gut!');
  const m4 = await send(a.token, ac, 'Anderer Chat, auch Kino');
  ok('0d: vier Nachrichten verschickt', m1.s === 200 && m2.s === 200 && m3.s === 200 && m4.s === 200);
  const id1 = m1.j && m1.j.message && m1.j.message.id;
  const id4 = m4.j && m4.j.message && m4.j.message.id;
  ok('0e: Nachrichten haben IDs', !!id1 && !!id4);

  /* ================= ① Suche ================= */
  section('① Nachrichten durchsuchen');

  const s1 = await call('GET', '/api/v431/search?q=' + encodeURIComponent('Kino') + '&chatId=' + ab, null, a.token);
  ok('1a: Suche im Chat liefert 200', s1.s === 200, 'HTTP ' + s1.s);
  ok('1b: drei Treffer im Chat ab', s1.j.total === 3, 'total=' + s1.j.total);
  ok('1c: Treffer tragen Chat- und Nachrichten-ID', s1.j.hits.every((h) => h.chatId === ab && h.msgId), '');
  ok('1d: Treffer tragen den Chatnamen', s1.j.hits[0] && typeof s1.j.hits[0].chatName === 'string' && s1.j.hits[0].chatName.length > 0, s1.j.hits[0] && s1.j.hits[0].chatName);
  ok('1e: Treffer tragen Absender', s1.j.hits.every((h) => !!h.senderName), '');

  const s2 = await call('GET', '/api/v431/search?q=' + encodeURIComponent('kInO'), null, a.token);
  ok('1f: Groß/Klein egal', s2.j.total >= 4, 'total=' + s2.j.total);
  ok('1g: ohne chatId über alle eigenen Chats', s2.j.hits.some((h) => h.chatId === ac), '');

  const s3 = await call('GET', '/api/v431/search?q=a', null, a.token);
  ok('1h: ein Zeichen → 400 too_short', s3.s === 400 && s3.j.code === 'too_short', 'HTTP ' + s3.s + ' ' + s3.j.code);

  const s4 = await call('GET', '/api/v431/search?q=' + encodeURIComponent('Kino'));
  ok('1i: ohne Anmeldung 401', s4.s === 401, 'HTTP ' + s4.s);

  const s5 = await call('GET', '/api/v431/search?q=' + encodeURIComponent('Kino') + '&chatId=' + ab, null, c.token);
  ok('1j: fremder Chat → 403', s5.s === 403, 'HTTP ' + s5.s);

  const s6 = await call('GET', '/api/v431/search?q=' + encodeURIComponent('gibtsnicht' + T), null, a.token);
  ok('1k: nichts gefunden → 0 Treffer', s6.s === 200 && s6.j.total === 0, 'total=' + s6.j.total);

  ok('1l: Ausschnitt wird geliefert', !!(s1.j.hits[0] && s1.j.hits[0].text && s1.j.hits[0].text.indexOf('Kino') >= 0), s1.j.hits[0] && s1.j.hits[0].text);

  /* gelöschte Nachricht verschwindet aus der Suche (Soft-Delete, falls vorhanden) */
  const del = await call('DELETE', '/api/chats/' + ab + '/messages/' + (m2.j.message.id), null, a.token);
  const s7 = await call('GET', '/api/v431/search?q=' + encodeURIComponent('acht') + '&chatId=' + ab, null, a.token);
  ok('1m: gelöschte Nachricht ist nicht mehr auffindbar', del.s === 200 ? s7.j.total === 0 : true, 'DELETE HTTP ' + del.s + ' · total=' + s7.j.total);

  /* ================= ② Gemerkt ================= */
  section('② Gemerkte Nachrichten');

  const st0 = await call('GET', '/api/v431/starred', null, a.token);
  ok('2a: Liste startet leer', st0.s === 200 && st0.j.count === 0, 'count=' + st0.j.count);

  const st1 = await call('POST', '/api/v431/star', { chatId: ab, msgId: id1 }, a.token);
  ok('2b: Stern setzen → starred:true', st1.s === 200 && st1.j.starred === true, JSON.stringify(st1.j));

  const st2 = await call('GET', '/api/v431/starred', null, a.token);
  ok('2c: taucht in der Liste auf', st2.j.count === 1 && st2.j.items[0].msgId === id1, JSON.stringify(st2.j.items && st2.j.items[0]));
  ok('2d: Eintrag hat Chatname + Text', !!(st2.j.items[0].chatName && st2.j.items[0].text), '');

  const st3 = await call('POST', '/api/v431/star', { chatId: ab, msgId: id1 }, a.token);
  ok('2e: zweiter Klick nimmt den Stern weg', st3.j.starred === false, JSON.stringify(st3.j));

  const st4 = await call('GET', '/api/v431/starred', null, a.token);
  ok('2f: Liste ist wieder leer', st4.j.count === 0, 'count=' + st4.j.count);

  await call('POST', '/api/v431/star', { chatId: ab, msgId: id1 }, a.token);
  await call('POST', '/api/v431/star', { chatId: ac, msgId: id4 }, a.token);
  const st5 = await call('GET', '/api/v431/starred', null, a.token);
  ok('2g: zwei Sterne aus zwei Chats', st5.j.count === 2, 'count=' + st5.j.count);
  ok('2h: neueste zuerst', (st5.j.items[0].starredAt || 0) >= (st5.j.items[1].starredAt || 0), '');

  const st6 = await call('POST', '/api/v431/star', { chatId: ac, msgId: id4 }, b.token);
  ok('2i: fremder Chat → 403', st6.s === 403, 'HTTP ' + st6.s);

  const st7 = await call('POST', '/api/v431/star', { chatId: ab, msgId: 'gibtsnicht' }, a.token);
  ok('2j: unbekannte Nachricht → 404', st7.s === 404, 'HTTP ' + st7.s);

  const st8 = await call('DELETE', '/api/v431/star/' + ab + '/' + id1, null, a.token);
  ok('2k: DELETE nimmt den Stern weg', st8.s === 200 && st8.j.starred === false, JSON.stringify(st8.j));

  const st9 = await call('GET', '/api/v431/starred', null, a.token);
  ok('2l: nur noch ein Stern übrig', st9.j.count === 1 && st9.j.items[0].msgId === id4, 'count=' + st9.j.count);

  ok('2m: Sterne sind pro Nutzer getrennt', (await call('GET', '/api/v431/starred', null, b.token)).j.count === 0, '');

  const st10 = await call('GET', '/api/v431/starred');
  ok('2n: ohne Anmeldung 401', st10.s === 401, 'HTTP ' + st10.s);

  /* gelöschte Nachricht fällt aus „Gemerkt" heraus */
  await call('POST', '/api/v431/star', { chatId: ab, msgId: m3.j.message.id }, a.token);
  const before = (await call('GET', '/api/v431/starred', null, a.token)).j.count;
  await call('DELETE', '/api/chats/' + ab + '/messages/' + m3.j.message.id, null, b.token);
  const after = (await call('GET', '/api/v431/starred', null, a.token)).j.count;
  ok('2o: gelöschte Nachricht verlässt „Gemerkt"', after === before - 1, before + ' → ' + after);

  /* ================= ③ Oberfläche (Standbild) ================= */
  section('③ Oberfläche trägt die neuen Teile');
  const html = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');
  ok('3a: Lupe im Chat-Kopf', html.indexOf('id="btnChatSearch"') >= 0, '');
  ok('3b: v431.js eingebunden', html.indexOf('/v431.js') >= 0, '');
  ok('3c: Splash mit Logo', html.indexOf('id="splash"') >= 0 && html.indexOf('assets/icon-192.png') >= 0, '');
  ok('3d: apple-touch-icon neu', html.indexOf('assets/apple-touch-icon.png') >= 0, '');

  const appJs = fs.readFileSync(path.join(CLIENT, 'app.js'), 'utf8');
  ok('3e: Stern ruft den Server', appJs.indexOf('LC431.toggleStar') >= 0, '');
  ok('3f: Avatar darf /assets/ sein', appJs.indexOf("av.startsWith('/assets/')") >= 0, '');

  const v428 = fs.readFileSync(path.join(CLIENT, 'v428.js'), 'utf8');
  ok('3g: Profil hat „Gemerkt"', v428.indexOf('data-pr="starred"') >= 0, '');
  ok('3h: Profil hat „Nachrichten suchen"', v428.indexOf('data-pr="search"') >= 0, '');

  const man = JSON.parse(fs.readFileSync(path.join(CLIENT, 'manifest.webmanifest'), 'utf8'));
  const srcs = (man.icons || []).map((i) => i.src);
  ok('3i: Manifest zeigt auf assets/', srcs.every((s) => s.indexOf('assets/') === 0), srcs.join(', '));
  ok('3j: maskable ist dabei', (man.icons || []).some((i) => i.purpose === 'maskable'), '');

  const i512 = pngSize(path.join(CLIENT, 'assets', 'icon-512.png'));
  ok('3k: icon-512.png ist 512×512', !!i512 && i512.w === 512 && i512.h === 512, i512 ? i512.w + '×' + i512.h : 'fehlt');
  const i192 = pngSize(path.join(CLIENT, 'assets', 'icon-192.png'));
  ok('3l: icon-192.png ist 192×192', !!i192 && i192.w === 192 && i192.h === 192, i192 ? i192.w + '×' + i192.h : 'fehlt');
  const iAp = pngSize(path.join(CLIENT, 'assets', 'apple-touch-icon.png'));
  ok('3m: apple-touch-icon ist 180×180', !!iAp && iAp.w === 180 && iAp.h === 180, iAp ? iAp.w + '×' + iAp.h : 'fehlt');
  const iMk = pngSize(path.join(CLIENT, 'assets', 'icon-maskable-512.png'));
  ok('3n: maskable ist 512×512', !!iMk && iMk.w === 512 && iMk.h === 512, iMk ? iMk.w + '×' + iMk.h : 'fehlt');
  const iBan = pngSize(path.join(CLIENT, 'assets', 'kanal-lovechen.png'));
  ok('3o: Kanalbild ist 1600×900', !!iBan && iBan.w === 1600 && iBan.h === 900, iBan ? iBan.w + '×' + iBan.h : 'fehlt');
  const iAv = pngSize(path.join(CLIENT, 'assets', 'lovechen-avatar.png'));
  ok('3p: Lovechen-Avatar ist 512×512', !!iAv && iAv.w === 512 && iAv.h === 512, iAv ? iAv.w + '×' + iAv.h : 'fehlt');

  /* das Kanalbild kommt wirklich beim Browser an */
  const r = await fetch(BASE + '/assets/kanal-lovechen.png');
  const buf = Buffer.from(await r.arrayBuffer());
  ok('3q: /assets/kanal-lovechen.png wird ausgeliefert', r.status === 200 && buf.length > 50000, 'HTTP ' + r.status + ' · ' + buf.length + ' Bytes');
  const r2 = await fetch(BASE + '/assets/icon-512.png');
  ok('3r: /assets/icon-512.png wird ausgeliefert', r2.status === 200, 'HTTP ' + r2.status);

  /* ================= Ergebnis ================= */
  console.log('\n' + '='.repeat(60));
  console.log(`  V4.31 — ${pass} ✅ / ${fail} ❌`);
  if (fail) { console.log('  Fehlgeschlagen:'); failures.forEach((f) => console.log('   • ' + f)); }
  console.log('='.repeat(60));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('💥 Testlauf abgebrochen:', e && e.message);
  console.error(e && e.stack);
  process.exit(1);
});
