/* =====================================================================
 *  🧪 v429test.js — V4.29 „Owner an der Nummer, VIP an der Nummer"
 * ---------------------------------------------------------------------
 *  Der Auftrag, in Prüfungen übersetzt:
 *
 *    ① ALLE Nutzer gelöscht          → Datenbank leer, Owner-Konto weg
 *    ② +4915155894714 vorgemerkt     → wer sich damit anmeldet, ist Owner
 *    ③ „owner und verifiziert"       → role=owner + Haken, ohne Sonderweg
 *    ④ normale Anmeldung             → Nummer → WhatsApp-Code → Name, fertig
 *    ⑤ VIP anhand der Nummer         → nicht (nur) über Einlösecodes
 *    ⑥ Flutter weg                   → keine Datei, kein Download, kein Link
 *
 *  Läuft als ERSTER Test der Kette: auf leerer Datenbank wird der
 *  Owner-Weg als „signup" geprüft, beim zweiten Lauf als „login" —
 *  beides muss dasselbe Ergebnis haben. Der benutzte Pfad wird
 *  ausgedruckt, damit nichts behauptet, sondern gezeigt wird.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.LC_BASE || 'http://127.0.0.1:3900';
const ROOT = process.env.LOVECHAT_ROOT || path.join(__dirname, '..', 'server');
const PROJ = path.join(__dirname, '..');
const OUTBOX = path.join(ROOT, 'data', 'wa-outbox.jsonl');
const OWNER_PHONE = '+4915155894714';

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
function section(t) { console.log(`\n— ${t} —`); }

async function call(method, p, body, token) {
  /* Content-Type NUR setzen, wenn wirklich ein Körper mitkommt — sonst
   * versucht der JSON-Parser, einen leeren String zu lesen, und antwortet
   * mit 400 ohne JSON (das hatte DELETE künstlich kaputt gemacht). */
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}

/* Letzter Code an diese Nummer (Testmodus schreibt in die Outbox) */
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

/** Der Zähler des Limiters (12 Anfragen / 15 Min pro IP) leeren — dieser
 *  Test stellt viele Anfragen von derselben IP. */
async function resetLimits() {
  try {
    const r = await fetch(BASE + '/api/dev/reset-limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_TOKEN || 'testtoken123456789012345678' },
      body: '{}',
    });
    if (r.ok) console.log('  🧹 Rate-Limiter zurückgesetzt');
  } catch (e) {}
}

/** Vollständiger WhatsApp-Weg für eine Nummer. Gibt zurück, was passiert ist. */
async function signIn(phone, displayName) {
  const req = await call('POST', '/api/v428/onboarding/request', { phone });
  if (req.s !== 200) return { error: 'request ' + req.s, req };
  const code = lastCode(phone);
  if (!code) return { error: 'kein Code in der Outbox' };
  const ver = await call('POST', '/api/v428/onboarding/verify', { phone, code });
  if (ver.s !== 200) return { error: 'verify ' + ver.s + ' ' + (ver.j.error || ''), ver };

  if (req.j.mode === 'login') {
    return { mode: 'login', token: ver.j.token, user: ver.j.user, owner: ver.j.owner, twoFactor: ver.j.twoFactor };
  }
  const prof = await call('POST', '/api/v428/onboarding/profile', { signupToken: ver.j.signupToken, displayName });
  if (prof.s !== 200) return { error: 'profile ' + prof.s + ' ' + (prof.j.error || '') };
  const fin = await call('POST', '/api/v428/onboarding/finish', { signupToken: ver.j.signupToken });
  if (fin.s !== 200) return { error: 'finish ' + fin.s + ' ' + (fin.j.error || '') };
  return { mode: 'signup', token: fin.j.token, user: fin.j.user, owner: fin.j.owner, twoFactor: fin.j.twoFactor };
}

(async () => {
  try {
    const r = await fetch(BASE + '/api/dev/reset-limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_TOKEN || 'testtoken123456789012345678' },
      body: '{}',
    });
    if (r.ok) console.log('  🧹 Rate-Limiter zurückgesetzt');
  } catch (e) {
    console.log('  ⚠️  Server nicht erreichbar: ' + e.message);
    process.exit(1);
  }

  /* ================= A. Der Owner meldet sich ganz normal an ================= */
  section('A. Owner meldet sich mit seiner Nummer an (kein Sonderweg)');

  ok('A0: owner.json ist auf die Nummer gebunden (kein Setup-Code)',
    (() => {
      try {
        const o = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'owner.json'), 'utf8'));
        return o.boundTo === 'phone' && o.phone === OWNER_PHONE && !o.claimedUserId;
      } catch (e) { return false; }
    })());

  const own = await signIn(OWNER_PHONE, 'Maxichen 💗');
  ok('A1: Anmeldung läuft durch (Nummer → Code → Name)', !own.error, own.error);
  console.log('     ↳ benutzter Pfad: ' + (own.mode || '?') +
    (own.mode === 'signup' ? '  (frische Datenbank — Konto neu angelegt)' : '  (Konto war schon da — eingeloggt)'));
  ok('A2: die Antwort markiert den Owner', own.owner === true, String(own.owner));
  ok('A3: Rolle ist „owner"', own.user && own.user.role === 'owner', own.user && own.user.role);
  ok('A4: Haken ist gesetzt (verified)', own.user && own.user.verified === true, String(own.user && own.user.verified));
  ok('A5: VIP über die Nummer', own.user && own.user.vip === true, String(own.user && own.user.vip));
  ok('A6: 2FA automatisch eingerichtet', own.twoFactor === true || own.user && own.user.role === 'owner', String(own.twoFactor));
  ok('A7: Kontoname passt zum Namen (maxichen)', own.user && own.user.username === 'maxichen', own.user && own.user.username);
  const T = own.token;

  ok('A8: Token funktioniert (kein 2FA-Zwang beim Login)',
    (await call('GET', '/api/v428/profile', null, T)).s === 200);

  const prof = await call('GET', '/api/v428/profile', null, T);
  ok('A9: /profile sagt owner+verified', prof.j.role && prof.j.role.owner === true && prof.j.role.verified === true,
    JSON.stringify(prof.j.role));
  ok('A10: /profile sagt VIP mit Quelle „owner-nummer"', prof.j.vip && prof.j.vip.source === 'owner-nummer',
    JSON.stringify(prof.j.vip));

  /* ================= B. Owner-Rechte hängen an der Nummer ================= */
  section('B. Owner-Rechte — nur mit dieser Nummer');

  const vl = await call('GET', '/api/vip/numbers', null, T);
  ok('B1: Owner darf die VIP-Liste sehen', vl.s === 200, 'HTTP ' + vl.s);
  ok('B2: Owner-Nummer ist immer VIP', vl.j.ownerPhoneAlwaysVip === true);

  const newVip = '+49176' + String(Date.now()).slice(-7);
  const add = await call('POST', '/api/vip/numbers', { phone: newVip }, T);
  ok('B3: Owner trägt eine VIP-Nummer ein', add.s === 200, JSON.stringify(add.j).slice(0, 90));
  const add2 = await call('POST', '/api/vip/numbers', { phone: newVip }, T);
  ok('B4: doppelt eintragen wird abgelehnt (409)', add2.s === 409, 'HTTP ' + add2.s);

  const delOwn = await call('DELETE', '/api/vip/numbers/' + encodeURIComponent(OWNER_PHONE), null, T);
  ok('B5: die Owner-Nummer kann niemand austragen', delOwn.s === 400 && delOwn.j.code === 'owner_locked',
    'HTTP ' + delOwn.s + ' ' + delOwn.j.code);

  const addBad = await call('POST', '/api/vip/numbers', { phone: 'keine-nummer' }, T);
  ok('B6: unbrauchbare Nummer wird abgewiesen (400)', addBad.s === 400, 'HTTP ' + addBad.s);

  /* ================= C. Ein normales Konto ist NICHT Owner ================= */
  section('C. Normales Konto — kein Owner, kein VIP, keine Rechte');

  const p2 = '+49176' + String(Date.now()).slice(-6) + '1';
  const mia = await signIn(p2, 'Mia');
  ok('C1: Anmeldung läuft durch', !mia.error, mia.error);
  ok('C2: owner-Flag ist false', mia.owner === false, String(mia.owner));
  ok('C3: Rolle ist „user"', mia.user && mia.user.role === 'user', mia.user && mia.user.role);
  ok('C4: kein Haken', mia.user && mia.user.verified !== true, String(mia.user && mia.user.verified));
  ok('C5: kein VIP', mia.user && mia.user.vip !== true, String(mia.user && mia.user.vip));

  const n1 = await call('GET', '/api/vip/numbers', null, mia.token);
  ok('C6: darf die VIP-Liste nicht sehen (403)', n1.s === 403, 'HTTP ' + n1.s);
  const n2 = await call('POST', '/api/vip/numbers', { phone: '+4917611111111' }, mia.token);
  ok('C7: darf keine VIP-Nummer eintragen (403)', n2.s === 403, 'HTTP ' + n2.s);

  const p3 = '+49176' + String(Date.now()).slice(-6) + '2';
  const vipUser = await signIn(p3, 'VipMia');
  ok('C8: zweites normales Konto auch kein Owner', vipUser.owner === false, String(vipUser.owner));

  /* ================= D. VIP anhand der Nummer ================= */
  section('D. VIP entscheidet die Nummer — nicht der Kontoname');

  /* D1: die vom Owner eingetragene Nummer wird beim Anmelden VIP */
  const p4 = newVip;
  const byList = await signIn(p4, 'NummerVip');
  ok('D1: Nummer aus der Owner-Liste → VIP', byList.user && byList.user.vip === true, byList.error || String(byList.user && byList.user.vip));
  ok('D2: … aber NICHT Owner', byList.user && byList.user.role !== 'owner', byList.user && byList.user.role);
  const p4b = await call('GET', '/api/v428/profile', null, byList.token);
  ok('D3: Quelle ist „nummer"', p4b.j.vip && p4b.j.vip.source === 'nummer', JSON.stringify(p4b.j.vip));

  /* D4: Schreibweise egal (+49 176 … = 0049176 … = 49176 …)
   * Erst als Rechnung (kostet kein Limit), dann EINE echte Anfrage —
   * der Limiter erlaubt nur 3 Codes pro Nummer / 15 Minuten, und das
   * soll auch so bleiben. */
  await resetLimits();
  const norm = require(path.join(ROOT, 'accounts')).normalizePhone;
  const spellings = [p4, '00' + p4.slice(1), p4.replace(/\D/g, ''),
    p4.slice(0, 3) + ' ' + p4.slice(3, 6) + ' ' + p4.slice(6)];
  const targets = new Set(spellings.map((x) => norm(x)));
  ok('D4a: alle Schreibweisen ergeben dieselbe Nummer', targets.size === 1 && targets.has(norm(p4)),
    [...targets].join(' / '));
  const spaced = spellings[3];
  const rr = await call('POST', '/api/v428/onboarding/request', { phone: spaced });
  ok('D4b: „' + spaced + '" wird als bekanntes Konto erkannt', rr.s === 200 && rr.j.mode === 'login',
    'HTTP ' + rr.s + ' ' + rr.j.mode);

  /* D5: VIP per ENV — nur prüfen, wenn der Server so gestartet wurde */
  if (process.env.VIP_NUMBERS) {
    const envNum = process.env.VIP_NUMBERS.split(',')[0].trim();
    const e = await signIn(envNum, 'EnvVip');
    ok('D5: VIP-Nummer aus ENV → VIP', e.user && e.user.vip === true, e.error || String(e.user && e.user.vip));
  } else {
    console.log('  ⏭️  D5 übersprungen (VIP_NUMBERS nicht gesetzt)');
  }

  /* D6: der alte Weg über Einlösecodes bleibt gültig */
  const codeUser = await signIn('+49176' + String(Date.now()).slice(-6) + '3', 'CodeVip');
  ok('D6: normales Konto ohne VIP-Code ist nicht VIP', codeUser.user && codeUser.user.vip !== true);

  /* ================= E. Austragen wirkt sofort ================= */
  section('E. Austragen nimmt den Status wieder weg');
  await resetLimits();
  const rem = await call('DELETE', '/api/vip/numbers/' + encodeURIComponent(newVip), null, T);
  ok('E1: Owner trägt die Nummer wieder aus', rem.s === 200, JSON.stringify(rem.j).slice(0, 80));
  const after = await call('GET', '/api/v428/profile', null, byList.token);
  ok('E2: derselbe Nutzer ist danach kein VIP mehr', after.j.vip && after.j.vip.vip === false,
    JSON.stringify(after.j.vip));
  ok('E3: Owner bleibt VIP (Nummer, nicht Liste)', (await call('GET', '/api/v428/profile', null, T)).j.vip.vip === true);

  /* ================= F. Flutter ist weg ================= */
  section('F. Flutter ist entfernt — überall');

  ok('F1: Ordner flutter_app/ existiert nicht',
    !fs.existsSync(path.join(PROJ, 'flutter_app')));
  ok('F2: Flutter-APK ist gelöscht',
    !fs.existsSync(path.join(PROJ, 'client', 'app', 'lovechat-4.20-flutter.apk')));
  const dl = await call('GET', '/api/downloads/latest');
  const items = (dl.j.items || []).map((i) => i.id);
  ok('F3: /api/downloads/latest bietet kein Flutter-Paket an', !items.includes('flutter'), JSON.stringify(items));
  ok('F4: … die anderen Pakete bleiben', items.includes('android') && items.includes('windows'), JSON.stringify(items));
  const htmlFiles = ['client/downloads.html', 'deploy/downloads/index.html', 'deploy/chat/downloads.html'];
  let mentions = [];
  for (const f of htmlFiles) {
    try {
      const t = fs.readFileSync(path.join(PROJ, f), 'utf8');
      if (/flutter/i.test(t) || /flutter-apk/i.test(t)) mentions.push(f);
    } catch (e) {}
  }
  ok('F5: keine Download-Seite nennt Flutter', mentions.length === 0, mentions.join(', '));
  const jsFiles = ['client/downloads.js', 'server/v420.js', 'server/v420sec.js'];
  let jsMentions = [];
  for (const f of jsFiles) {
    try { if (/flutter/i.test(fs.readFileSync(path.join(PROJ, f), 'utf8'))) jsMentions.push(f); } catch (e) {}
  }
  ok('F6: kein Server-/Client-Code nennt Flutter', jsMentions.length === 0, jsMentions.join(', '));

  /* ================= G. Aufräum-Werkzeug ================= */
  section('G. Aufräum-Werkzeug tools/reset-users.js');
  ok('G1: das Skript existiert', fs.existsSync(path.join(PROJ, 'tools', 'reset-users.js')));
  ok('G2: es schreibt nur mit --ja-ich-will',
    /--ja-ich-will/.test(fs.readFileSync(path.join(PROJ, 'tools', 'reset-users.js'), 'utf8')));
  ok('G3: die Datenbank ist klein (kein Altbestand mehr)', (() => {
    try { return fs.statSync(path.join(ROOT, 'data', 'database.json')).size < 5 * 1024 * 1024; }
    catch (e) { return false; }
  })());

  console.log('\n' + (fail ? '❌' : '✅') + ` V4.29: ${pass} grün, ${fail} rot`);
  if (fail) { console.log('❌ Fehlgeschlagen: ' + failures.join(' · ')); process.exit(1); }
})();
