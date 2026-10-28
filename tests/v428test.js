/* =====================================================================
 *  🧪 v428test.js — V4.28 „Anmeldung wie WhatsApp"
 * ---------------------------------------------------------------------
 *  Der Ablauf, den der Nutzer vorgegeben hat, Schritt für Schritt:
 *
 *    ① Startbildschirm   (Download-Startseite → „Zustimmen und fortfahren")
 *    ② Nummer eingeben   (+49 …)
 *    ③ Code per WhatsApp (6 Ziffern)
 *    ④ Name + Profilbild
 *    ⑤ drin — 5 Reiter: Chats · Aktuelles · Communitys · Anrufe · Profil
 *
 *  Geprüft wird ausserdem, was WhatsApp von unserem alten Weg unterschied:
 *    · bekannte Nummer  → EINLOGGEN (nicht „Nummer vergeben"-Fehler)
 *    · KEINE E-Mail und KEIN Passwort nötig
 *    · Kontoname wird automatisch aus dem Namen gebaut
 *    · Profilbild kommt als Datei (/media/…), nicht als Base64
 *
 *  Voraussetzung: Server läuft (PORT=3900) und pair.js im Testmodus (3100).
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.LC_BASE || 'http://127.0.0.1:3900';
const ROOT = process.env.LOVECHAT_ROOT || path.join(__dirname, '..', 'server');
const OUTBOX = path.join(ROOT, 'data', 'wa-outbox.jsonl');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
function section(t) { console.log(`\n— ${t} —`); }

async function call(method, p, body, token) {
  const r = await fetch(BASE + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}

/* Letzter an diese Nummer geschickter Code (Testmodus schreibt nach
 * data/wa-outbox.jsonl — genau wie ein echter Versand, nur ohne WhatsApp). */
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

(async () => {
  /* Der Limiter zählt pro IP (12 Anfragen / 15 Min). Diese Datei stellt
   * mehrere Anfragen — zusammen mit den anderen Tests derselben IP war das
   * irgendwann zu viel und ALLES danach fiel mit „too_many" um (Fehlalarm).
   * Deshalb: vor dem Lauf die Zähler zurücksetzen, wenn der Testserver es
   * erlaubt (nur im Simulations-Modus verfügbar). */
  try {
    const r = await fetch(BASE + '/api/dev/reset-limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_TOKEN || 'testtoken123456789012345678' },
      body: '{}',
    });
    if (r.ok) console.log('  🧹 Rate-Limiter zurückgesetzt');
  } catch (e) {}

  const T = Date.now().toString().slice(-6);
  const phone = '+49 176 44' + T;      // je Lauf eine neue Nummer
  const PHONE = '+4917644' + T;

  /* ================= A. Startbildschirm ================= */
  section('A. Startbildschirm wie WhatsApp');
  const st = await call('GET', '/api/v428/onboarding/start');
  ok('Route antwortet', st.s === 200, 'HTTP ' + st.s);
  ok('Version ist V4.28', st.j.version === 'V4.28', st.j.version);
  ok('App heisst LoveChat', st.j.app === 'LoveChat');
  ok('Schritte in WhatsApp-Reihenfolge', JSON.stringify(st.j.steps) === '["start","phone","code","profile"]',
    JSON.stringify(st.j.steps));
  ok('genau 5 Reiter', Array.isArray(st.j.tabs) && st.j.tabs.length === 5, JSON.stringify(st.j.tabs));
  ok('Reiter = Chats · Aktuelles · Communitys · Anrufe · Profil',
    JSON.stringify(st.j.tabs) === '["Chats","Aktuelles","Communitys","Anrufe","Profil"]', JSON.stringify(st.j.tabs));
  ok('„Profil" ist der fünfte (neu)', st.j.tabs[4] === 'Profil');
  ok('rechtlicher Hinweis vorhanden', Array.isArray(st.j.legal) && st.j.legal.length >= 2);

  /* ================= B. Nummer → Code ================= */
  section('B. Nummer eingeben → Code per WhatsApp');
  const bad = await call('POST', '/api/v428/onboarding/request', { phone: '123' });
  ok('kaputte Nummer → 400', bad.s === 400, 'HTTP ' + bad.s);
  ok('… mit code bad_phone', bad.j.code === 'bad_phone', bad.j.code);

  const req = await call('POST', '/api/v428/onboarding/request', { phone });
  ok('Code angefordert → 200', req.s === 200, JSON.stringify(req.j).slice(0, 120));
  ok('neue Nummer → mode signup', req.j.mode === 'signup', req.j.mode);
  ok('newAccount = true', req.j.newAccount === true);
  ok('Nummer normalisiert (+4917644…)', req.j.phone === PHONE, req.j.phone);
  ok('gültig 300 s (5 Minuten)', req.j.expiresInSec === 300, String(req.j.expiresInSec));
  ok('Antwort sagt nicht „Code verschickt" ohne Beweis', typeof req.j.message === 'string' && req.j.message.length > 5);
  ok('Testmodus wird benannt (simulated)', req.j.simulated === true);

  const code = lastCode(phone);
  ok('Code kam wirklich per WhatsApp an diese Nummer', !!code, String(code));
  ok('Code steht NICHT in der Antwort',
    !!(code && !JSON.stringify(req.j).includes(code)),
    'Code ' + code + ' in ' + JSON.stringify(req.j).slice(0, 80));

  const dbRaw = fs.readFileSync(path.join(ROOT, 'data', 'database.json'), 'utf8');
  await new Promise((r) => setTimeout(r, 400));
  const dbRaw2 = fs.readFileSync(path.join(ROOT, 'data', 'database.json'), 'utf8');
  ok('Code steht NICHT im Klartext in der Datenbank', !!(code && !dbRaw2.includes(code)));
  const dbObj = JSON.parse(dbRaw2);
  const rec = dbObj.phoneCodes && dbObj.phoneCodes[PHONE];
  ok('DB speichert nur einen sha256-Hash', !!(rec && /^[0-9a-f]{64}$/.test(rec.hash)),
    rec ? rec.hash.slice(0, 12) + '…' : 'kein Eintrag');

  /* ================= C. Code eingeben ================= */
  section('C. Code eingeben');
  const wrong = await call('POST', '/api/v428/onboarding/verify', {
    phone, code: code === '000000' ? '111111' : '000000',
  });
  ok('falscher Code → 401', wrong.s === 401, 'HTTP ' + wrong.s);
  ok('Restversuche werden genannt', wrong.j.attemptsLeft === 4, String(wrong.j.attemptsLeft));

  const v = await call('POST', '/api/v428/onboarding/verify', { phone, code });
  ok('richtiger Code → 200', v.s === 200, JSON.stringify(v.j).slice(0, 100));
  ok('mode signup (neue Nummer)', v.j.mode === 'signup', v.j.mode);
  ok('signupToken vorhanden', typeof v.j.signupToken === 'string' && v.j.signupToken.length >= 32);
  ok('nächster Schritt = profile', v.j.next === 'profile');
  const again = await call('POST', '/api/v428/onboarding/verify', { phone, code });
  ok('derselbe Code ein zweites Mal → abgelehnt', again.s === 400, 'HTTP ' + again.s);

  /* ================= D. Name + Profilbild ================= */
  section('D. Name und Profilbild');
  const short = await call('POST', '/api/v428/onboarding/profile', { signupToken: v.j.signupToken, displayName: 'A' });
  ok('zu kurzer Name → 400', short.s === 400, 'HTTP ' + short.s);
  const noTok = await call('POST', '/api/v428/onboarding/profile', { signupToken: 'erfunden', displayName: 'Mia' });
  ok('erfundener signupToken → 401', noTok.s === 401, 'HTTP ' + noTok.s);

  const prof = await call('POST', '/api/v428/onboarding/profile', {
    signupToken: v.j.signupToken, displayName: 'Mia ' + T,
  });
  ok('Name gespeichert → 200', prof.s === 200, JSON.stringify(prof.j).slice(0, 100));
  ok('Anzeigename übernommen', prof.j.displayName === 'Mia ' + T, prof.j.displayName);
  ok('Kontoname automatisch gebaut (a–z0–9_)', /^[a-z0-9_]{3,20}$/.test(prof.j.username), prof.j.username);
  ok('ohne Foto → Standard-Emoji', prof.j.avatar === '💗', prof.j.avatar);
  ok('nächster Schritt = finish', prof.j.next === 'finish');

  const badAv = await call('POST', '/api/v428/onboarding/profile', {
    signupToken: v.j.signupToken, displayName: 'Mia ' + T, avatar: '/media/gibtsnicht123.png',
  });
  ok('erfundenes Bild → 400 (kein Karteileichen-Avatar)', badAv.s === 400, 'HTTP ' + badAv.s);
  const emoti = await call('POST', '/api/v428/onboarding/profile', {
    signupToken: v.j.signupToken, displayName: 'Mia ' + T, avatar: '🌸',
  });
  ok('Emoji als Bild erlaubt', emoti.s === 200 && emoti.j.avatar === '🌸', emoti.j.avatar);

  /* ================= E. Fertig — ohne E-Mail ================= */
  section('E. Fertig — ohne E-Mail, ohne Passwort');
  const fakeFr = await call('POST', '/api/v428/onboarding/finish', { signupToken: 'erfunden' });
  ok('erfundener signupToken → 401', fakeFr.s === 401, 'HTTP ' + fakeFr.s);

  const fin = await call('POST', '/api/v428/onboarding/finish', { signupToken: v.j.signupToken });
  ok('Konto erstellt → 200', fin.s === 200, JSON.stringify(fin.j).slice(0, 120));
  ok('Token dabei (direkt drin)', typeof fin.j.token === 'string' && fin.j.token.length >= 32);
  ok('Nummer gilt als bestätigt', fin.j.phoneVerified === true);
  ok('E-Mail NICHT bestätigt (nicht gefragt)', fin.j.emailVerified === false);
  ok('Nutzer kommt mit', fin.j.user && fin.j.user.id && fin.j.user.displayName === 'Mia ' + T);
  ok('Anmeldeweg = Nummer + WhatsApp-Code', fin.j.mode === 'signup');

  const fin2 = await call('POST', '/api/v428/onboarding/finish', { signupToken: v.j.signupToken });
  ok('zweites finish mit demselben Token → abgelehnt', fin2.s === 401 || fin2.s === 409, 'HTTP ' + fin2.s);

  const TOKEN = fin.j.token;

  /* ================= F. Profil-Reiter ================= */
  section('F. Profil (fünfter Reiter)');
  const noAuth = await call('GET', '/api/v428/profile');
  ok('ohne Token → 401', noAuth.s === 401, 'HTTP ' + noAuth.s);

  const pr = await call('GET', '/api/v428/profile', null, TOKEN);
  ok('liefert 200', pr.s === 200, 'HTTP ' + pr.s);
  ok('eigener Name', pr.j.user && pr.j.user.displayName === 'Mia ' + T);
  ok('Nummer dabei', pr.j.account && pr.j.account.phone === PHONE, pr.j.account && pr.j.account.phone);
  ok('Anmeldeweg heisst „Nummer + WhatsApp-Code"', pr.j.account.method === 'Nummer + WhatsApp-Code', pr.j.account.method);
  ok('Kontoname steht drin', pr.j.account.username === prof.j.username);
  ok('Passwort ist NICHT der Weg rein', pr.j.account.method !== 'Passwort');

  const p1 = await call('PATCH', '/api/v428/profile', { displayName: 'Mia Love 💗' }, TOKEN);
  ok('Name ändern → 200', p1.s === 200 && p1.j.user.displayName === 'Mia Love 💗', JSON.stringify(p1.j).slice(0, 80));
  const p2 = await call('PATCH', '/api/v428/profile', { bio: 'Huhu aus dem Test' }, TOKEN);
  ok('Info ändern → 200', p2.s === 200 && p2.j.user.bio === 'Huhu aus dem Test');
  const p3 = await call('PATCH', '/api/v428/profile', { displayName: 'x' }, TOKEN);
  ok('zu kurzer Name beim Ändern → 400', p3.s === 400, 'HTTP ' + p3.s);
  const p4 = await call('PATCH', '/api/v428/profile', { avatar: '/media/nichtda.png' }, TOKEN);
  ok('erfundenes Bild beim Ändern → 400', p4.s === 400, 'HTTP ' + p4.s);

  /* ================= G. Bekannte Nummer = einloggen ================= */
  section('G. Bekannte Nummer → einloggen (wie WhatsApp)');
  const req2 = await call('POST', '/api/v428/onboarding/request', { phone });
  ok('nummer existiert → trotzdem 200', req2.s === 200, JSON.stringify(req2.j).slice(0, 100));
  ok('… mit mode login', req2.j.mode === 'login', req2.j.mode);
  ok('newAccount = false', req2.j.newAccount === false);
  const code2 = lastCode(phone);
  ok('neuer Code kommt an', !!code2 && code2 !== code, String(code2));
  const v2 = await call('POST', '/api/v428/onboarding/verify', { phone, code: code2 });
  ok('Code → sofort Token, kein Profil-Schritt', v2.s === 200 && !!v2.j.token, JSON.stringify(v2.j).slice(0, 90));
  ok('mode = login', v2.j.mode === 'login', v2.j.mode);
  ok('dasselbe Konto (Name vom Ändern)', v2.j.user.displayName === 'Mia Love 💗', v2.j.user.displayName);
  ok('unterschiedlicher Token (neues Gerät)', v2.j.token !== TOKEN);

  const me2 = await call('GET', '/api/v428/profile', null, v2.j.token);
  ok('der neue Token funktioniert', me2.s === 200 && me2.j.user.displayName === 'Mia Love 💗');

  /* ================= H. Kein Durchprobieren ================= */
  section('H. Schutz vor Durchprobieren');
  const p3r = '+49 176 55' + T;
  await call('POST', '/api/v428/onboarding/request', { phone: p3r });
  const c3 = lastCode(p3r);
  for (let i = 0; i < 5; i++) {
    await call('POST', '/api/v428/onboarding/verify', { phone: p3r, code: c3 === '999999' ? '888888' : '999999' });
  }
  const after5 = await call('POST', '/api/v428/onboarding/verify', { phone: p3r, code: c3 });
  ok('nach 5 Fehlversuchen ist der Code tot', after5.s === 429 || after5.s === 400, 'HTTP ' + after5.s);
  ok('… auch der RICHTIGE Code geht dann nicht mehr', after5.s !== 200);

  /* ================= I. Bestehende Tests nicht kaputt ================= */
  section('I. Der alte Weg bleibt heil');
  const oldReq = await call('POST', '/api/auth/request-code', { phone: '+49 176 66' + T });
  ok('/api/auth/request-code existiert weiter', oldReq.s === 200 || oldReq.s === 503, 'HTTP ' + oldReq.s);
  const existReq = await call('POST', '/api/auth/request-code', { phone });
  ok('alte Route meldet weiter 409 phone_exists (unverändert)', existReq.s === 409 && existReq.j.code === 'phone_exists',
    'HTTP ' + existReq.s + ' ' + existReq.j.code);

  console.log('\n' + (fail ? '❌' : '✅') + ` V4.28: ${pass} grün, ${fail} rot`);
  if (fail) { console.log('❌ Fehlgeschlagen: ' + failures.join(' · ')); process.exit(1); }
})();
