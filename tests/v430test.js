/* =====================================================================
 *  🧪 v430test.js — V4.30 „Konto löschen · Rate-Limit · Spam · Melden"
 * ---------------------------------------------------------------------
 *  Aus der WhatsApp-Liste waren das die echten Lücken:
 *
 *    ① Konto löschen          DELETE /api/account  (gab es vorher NICHT)
 *    ② 20 Nachrichten/Minute  → 21. wird abgewiesen
 *    ③ 5 Gruppen/Stunde       → 6. wird abgewiesen
 *    ④ Spam-Erkennung         → gleiche Nachricht ≥ 5× → Label,
 *                               ≥ 12× → eine Minute Pause
 *    ⑤ Melden                 → Bericht enthält die letzten 5 Nachrichten
 *
 *  Und zur Sicherheit die Gegenprobe, dass das BESTEHENDE Ban-System
 *  weiter funktioniert (Temp-Ban → 403 banned → Unban → wieder frei).
 *
 *  Voraussetzung: Server auf :3900 (MAIL_SIMULATE=1).
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.LC_BASE || 'http://127.0.0.1:3900';
const ROOT = process.env.LOVECHAT_ROOT || path.join(__dirname, '..', 'server');
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

/** Konto über den WhatsApp-Weg anlegen (Nummer → Code → Name). */
async function signup(phone, name) {
  const req = await call('POST', '/api/v428/onboarding/request', { phone });
  const code = lastCode(phone);
  const ver = await call('POST', '/api/v428/onboarding/verify', { phone, code });
  if (req.j.mode === 'login') return { token: ver.j.token, user: ver.j.user };
  const pr = await call('POST', '/api/v428/onboarding/profile', { signupToken: ver.j.signupToken, displayName: name });
  if (pr.s !== 200) throw new Error('profile: ' + JSON.stringify(pr.j));
  const fin = await call('POST', '/api/v428/onboarding/finish', { signupToken: ver.j.signupToken });
  if (fin.s !== 200) throw new Error('finish: ' + JSON.stringify(fin.j));
  return { token: fin.j.token, user: fin.j.user };
}

async function privateChat(a, bId) {
  const r = await call('POST', '/api/chats', { type: 'private', userId: bId }, a.token);
  return r.j.summary && r.j.summary.id;
}

async function send(tok, chatId, text) {
  return call('POST', '/api/chats/' + chatId + '/messages', { text }, tok);
}

const T = String(Date.now()).slice(-6);
const OWNER = '+4915155894714';
const PH_A = '+49170' + T + '1';
const PH_B = '+49170' + T + '2';

(async () => {
  await resetLimits();
  console.log('  🧹 Limits zurückgesetzt');

  /* ================= Vorbereitung ================= */
  section('0. Konten und ein Chat');
  const owner = await signup(OWNER, 'Maxichen 💗');
  ok('0a: Owner meldet sich an', !!owner.token);
  const a = await signup(PH_A, 'Anna');
  const b = await signup(PH_B, 'Ben');
  ok('0b: zwei normale Konten', !!a.token && !!b.token);
  const c1 = await privateChat(a, b.user.id);
  ok('0c: privater Chat entsteht', !!c1, String(c1));

  /* ================= ① Rate-Limit 20/Minute ================= */
  section('① Höchstens 20 Nachrichten pro Minute');
  await resetLimits();
  let sent = 0, blockedAt = 0, blockedCode = '';
  for (let i = 1; i <= 21; i++) {
    const r = await send(a.token, c1, 'Nachricht ' + i);
    if (r.s === 200) sent++;
    else { blockedAt = i; blockedCode = r.j.code; break; }
  }
  ok('1a: die ersten 20 gehen durch', sent === 20, 'gesendet: ' + sent);
  ok('1b: die 21. wird abgewiesen (429)', blockedAt === 21, 'bei Nummer ' + blockedAt);
  ok('1c: Code ist too_fast', blockedCode === 'too_fast', blockedCode);

  const lim = await call('GET', '/api/v430/limits', null, a.token);
  ok('1d: /api/v430/limits sagt 20', lim.j.messages && lim.j.messages.max === 20, JSON.stringify(lim.j.messages));

  const resetOk = await resetLimits();
  ok('1e: Test-Reset leert den Zähler', resetOk);
  const after = await send(a.token, c1, 'nach dem Reset');
  ok('1f: danach geht es wieder', after.s === 200, 'HTTP ' + after.s);

  /* ================= ② Gruppen-Limit 5/Stunde ================= */
  section('② Höchstens 5 Gruppen pro Stunde');
  await resetLimits();
  let made = 0, gBlocked = 0, gCode = '';
  for (let i = 1; i <= 6; i++) {
    const r = await call('POST', '/api/chats', { type: 'group', name: 'Testgruppe ' + i, memberIds: [b.user.id] }, a.token);
    if (r.s === 200) made++;
    else { gBlocked = i; gCode = r.j.code; break; }
  }
  ok('2a: 5 Gruppen gehen durch', made === 5, 'angelegt: ' + made);
  ok('2b: die 6. wird abgewiesen (429)', gBlocked === 6, 'bei Nummer ' + gBlocked);
  ok('2c: Code ist group_too_fast', gCode === 'group_too_fast', gCode);
  const pc = await call('POST', '/api/chats', { type: 'private', userId: owner.user.id }, a.token);
  ok('2d: private Chats sind NICHT begrenzt', pc.s === 200, 'HTTP ' + pc.s);

  /* ================= ③ Spam-Erkennung ================= */
  section('③ Gleiche Nachricht mehrfach');
  await resetLimits();
  let firstLabels = [];
  for (let i = 1; i <= 5; i++) {
    const r = await send(a.token, c1, 'KAUF JETZT BEI MIR');
    firstLabels.push(!!(r.j.message && r.j.message.spamLabel));
  }
  ok('3a: 1–4 sind normal', firstLabels.slice(0, 4).every((x) => x === false), JSON.stringify(firstLabels));
  ok('3b: ab der 5. kommt das Spam-Label', firstLabels[4] === true, JSON.stringify(firstLabels));

  const rep = await send(a.token, c1, 'KAUF JETZT BEI MIR');
  ok('3c: Zähler steht in der Nachricht', rep.j.message && rep.j.message.repeated >= 5,
    String(rep.j.message && rep.j.message.repeated));

  await resetLimits();
  let hardBlocked = 0, hardCode = '';
  for (let i = 1; i <= 12; i++) {
    const r = await send(a.token, c1, 'SPAM SPAM SPAM');
    if (r.s !== 200) { hardBlocked = i; hardCode = r.j.code; break; }
  }
  ok('3d: bei 12× dieselbe Nachricht wird geblockt', hardBlocked === 12, 'blockiert bei ' + hardBlocked);
  ok('3e: Code ist spam', hardCode === 'spam', hardCode);
  await resetLimits();
  const fresh = await send(a.token, c1, 'eine ganz andere Nachricht');
  ok('3f: anderer Text geht danach wieder', fresh.s === 200, 'HTTP ' + fresh.s);

  /* ================= ④ Melden mit den letzten 5 Nachrichten ================= */
  section('④ Melden — Bericht enthält die letzten 5 Nachrichten');
  await resetLimits();
  for (const t of ['Hallo', 'Wie geht es dir?', 'Antworte bitte', 'Letzte Warnung', 'Du hörst nie zu']) {
    await send(b.token, c1, t);
  }
  const rep1 = await call('POST', '/api/v430/report', {
    chatId: c1, targetId: b.user.id, reason: 'Belästigung', block: false,
  }, a.token);
  ok('4a: Bericht wird angenommen', rep1.s === 200, JSON.stringify(rep1.j).slice(0, 120));
  ok('4b: genau 5 Nachrichten im Bericht', rep1.j.report && rep1.j.report.messages === 5,
    String(rep1.j.report && rep1.j.report.messages));
  ok('4c: nicht blockiert (block=false)', rep1.j.blocked === false);

  const rep2 = await call('POST', '/api/v430/report', {
    chatId: c1, targetId: b.user.id, reason: 'Spam', block: false,
  }, a.token);
  ok('4d: zweimal in einer Minute → 429', rep2.s === 429 && rep2.j.code === 'too_fast', 'HTTP ' + rep2.s);

  const self = await call('POST', '/api/v430/report', { chatId: c1, targetId: a.user.id, reason: 'Spam' }, a.token);
  ok('4e: sich selbst melden geht nicht (400)', self.s === 400, 'HTTP ' + self.s);

  const own = await call('GET', '/api/v430/reports/me', null, a.token);
  ok('4f: eigener Bericht ist abrufbar', own.j.reports && own.j.reports.length >= 1,
    JSON.stringify(own.j.reports || []).slice(0, 120));

  /* die 5 Nachrichten sind wirklich gespeichert (nicht nur gezählt) */
  const mineAgain = await call('GET', '/api/v430/reports/me', null, a.token);
  const stored = (mineAgain.j.reports || [])[0] || {};
  const l5 = stored.last5 || [];
  ok('4g: die Nachrichten liegen im Bericht', l5.length === 5, String(l5.length));
  ok('4h: mit Absender und Zeit', l5.every((m) => m.senderName && m.at > 0));
  ok('4i: mit dem echten Text der letzten Nachricht', l5[4] && l5[4].text === 'Du hörst nie zu', l5[4] && l5[4].text);
  ok('4j: keine Bild-Daten im Bericht',
    l5.every((m) => typeof m.text === 'string' && !String(m.text).startsWith('data:')));

  /* ================= ⑤ Ban-System (bestand schon) ================= */
  section('⑤ Gegenprobe: Temp-Ban → 403 → Unban');
  await resetLimits();
  const banRes = await call('POST', '/api/admin/users/' + b.user.id + '/action', {
    action: 'tempban', minutes: 30, reason: 'Test',
  }, owner.token);
  const banned = banRes.s === 200;
  ok('5a: Owner kann temporär bannen', banned, 'HTTP ' + banRes.s + ' ' + JSON.stringify(banRes.j).slice(0, 100));

  /* Der Ban kickt sofort (Token weg) — das ist gewollt: kein Weiterarbeiten.
   * Der Ban-SCREEN kommt über den nächsten Anmeldeversuch: dort steht
   * Grund + Dauer, und von dort geht auch der Einspruch raus. */
  const blockedSend = await send(b.token, c1, 'darf ich noch?');
  ok('5b: nach der Sperre ist die alte Sitzung sofort tot (401)',
    blockedSend.s === 401, 'HTTP ' + blockedSend.s);

  await call('POST', '/api/v428/onboarding/request', { phone: PH_B });
  const banLogin = await call('POST', '/api/v428/onboarding/verify', { phone: PH_B, code: lastCode(PH_B) });
  ok('5c: Anmeldeversuch zeigt die Sperre (403 banned)',
    banLogin.s === 403 && banLogin.j.code === 'banned', 'HTTP ' + banLogin.s + ' ' + banLogin.j.code);
  ok('5d: mit Grund und Ende (das braucht der Ban-Screen)',
    !!(banLogin.j.ban && banLogin.j.ban.reason),
    JSON.stringify(banLogin.j.ban || {}).slice(0, 120));

  /* Einspruch — ohne Passwort, nur mit der bestätigten Nummer */
  const appeal = await call('POST', '/api/appeal', { login: PH_B, text: 'Bitte wieder reinlassen, war ein Test.' });
  ok('5e: Einspruch mit Nummer (ohne Passwort) geht', appeal.s === 200, 'HTTP ' + appeal.s + ' ' + JSON.stringify(appeal.j).slice(0, 90));

  const unban = await call('POST', '/api/admin/users/' + b.user.id + '/action', { action: 'unban', reason: 'Test' }, owner.token);
  ok('5f: Owner kann entbannen', unban.s === 200, 'HTTP ' + unban.s + ' ' + JSON.stringify(unban.j).slice(0, 100));

  await call('POST', '/api/v428/onboarding/request', { phone: PH_B });
  const back = await call('POST', '/api/v428/onboarding/verify', { phone: PH_B, code: lastCode(PH_B) });
  ok('5g: nach dem Unban kommt er wieder rein', back.s === 200 && !!back.j.token, 'HTTP ' + back.s);
  b.token = back.j.token;
  const again = await send(b.token, c1, 'wieder da');
  ok('5h: … und darf wieder schreiben', again.s === 200, 'HTTP ' + again.s);

  const notOwner = await call('POST', '/api/admin/users/' + a.user.id + '/action', { action: 'tempban', minutes: 5 }, a.token);
  ok('5i: ein normaler Nutzer darf NICHT bannen', notOwner.s === 403, 'HTTP ' + notOwner.s);

  /* ================= ⑥ Konto löschen ================= */
  section('⑥ Konto löschen');
  await resetLimits();
  const prev = await call('GET', '/api/account/delete-preview', null, a.token);
  ok('6a: Vorschau zeigt echte Zahlen', prev.s === 200 && typeof prev.j.chats === 'number' && prev.j.chats > 0,
    JSON.stringify(prev.j).slice(0, 140));
  ok('6b: Vorschau nennt die Nachrichtenzahl', prev.j.messages > 0, String(prev.j.messages));

  const noConfirm = await call('DELETE', '/api/account', { confirm: 'ja' }, a.token);
  ok('6c: ohne LÖSCHEN passiert nichts (400)',
    noConfirm.s === 400 && noConfirm.j.code === 'confirm_required', 'HTTP ' + noConfirm.s);
  const stillThere = await call('GET', '/api/v428/profile', null, a.token);
  ok('6d: Konto lebt noch', stillThere.s === 200, 'HTTP ' + stillThere.s);

  /* Gruppe mit zwei Leuten — Besitz muss übergehen */
  await resetLimits();
  const grp = await call('POST', '/api/chats', { type: 'group', name: 'Übergabe-Test', memberIds: [b.user.id] }, a.token);
  const grpId = grp.j.summary && grp.j.summary.id;
  ok('6e: Gruppe vor dem Löschen angelegt', !!grpId, String(grpId));

  const del = await call('DELETE', '/api/account', { confirm: 'LÖSCHEN' }, a.token);
  ok('6f: Konto wird gelöscht', del.s === 200 && del.j.ok === true, JSON.stringify(del.j).slice(0, 140));
  ok('6g: Antwort zählt auf, was weg ist', del.j.deleted && del.j.deleted.tokens >= 1, JSON.stringify(del.j.deleted || {}));

  const dead = await call('GET', '/api/v428/profile', null, a.token);
  ok('6h: der alte Token ist tot (401)', dead.s === 401, 'HTTP ' + dead.s);

  const grpAfter = await call('GET', '/api/chats/' + grpId, null, b.token);
  ok('6i: Gruppe lebt weiter', grpAfter.s === 200, 'HTTP ' + grpAfter.s);
  const members = (grpAfter.j.members || []).map((m) => m.id);
  ok('6j: Gelöschter ist raus aus der Gruppe', members.length > 0 && !members.includes(a.user.id), JSON.stringify(members));
  const newOwner = grpAfter.j.chat && grpAfter.j.chat.ownerId;
  ok('6k: Gruppen-Besitz ist übergegangen', newOwner && newOwner !== a.user.id, String(newOwner));

  const reborn = await signup(PH_A, 'Anna neu');
  ok('6l: dieselbe Nummer kann sich neu registrieren', !!reborn.token && reborn.user.id !== a.user.id,
    reborn.user && reborn.user.id);

  /* ================= ⑦ Client hat die Oberfläche ================= */
  section('⑦ Die Oberfläche ist da (kein Server-Feature ohne Knopf)');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'client', 'app.js'), 'utf8');
  const v428js = fs.readFileSync(path.join(__dirname, '..', 'client', 'v428.js'), 'utf8');
  ok('7a: „Melden" steht im Nachrichtenmenü', /a: 'report'/.test(appjs));
  ok('7b: der Melden-Knopf ruft /v430/report', /v430\/report/.test(appjs));
  ok('7c: „Konto löschen" steht im Profil', /Konto löschen/.test(v428js));
  ok('7d: Löschen verlangt das Wort LÖSCHEN', /LÖSCHEN/.test(v428js) && /confirm: val/.test(v428js));

  console.log('\n' + (fail ? '❌' : '✅') + ` V4.30: ${pass} grün, ${fail} rot`);
  if (fail) { console.log('❌ Fehlgeschlagen: ' + failures.join(' · ')); process.exit(1); }
})();
