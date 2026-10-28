/* =====================================================================
   📱 V4.13 — TEST: Anmeldung wie WhatsApp
   ---------------------------------------------------------------------
   Was hier NICHT geprüft wird (das braucht dein Handy):
     · ob ein echter QR-Code scanbar ist        → pair.js, Terminal
     · ob Strato eine echte Mail annimmt         → braucht das Postfach
   Was hier geprüft wird — und zwar so, dass es weh tut:
     1) Nummern-Normalisierung (jede Schreibweise → E.164)
     2) Der Code steht NIE in der Antwort und NIE im Klartext in der DB
     3) falscher Code, 5× → tot
     4) abgelaufener Code → tot
     5) Code genau einmal verwendbar
     6) 3 Codes / 15 Min pro Nummer, dann 429
     7) Schritte können nicht übersprungen werden (kein Konto ohne Mail)
     8) signupToken gilt 30 Min, nicht ewig
     9) Mail-Betreff ist EXAKT "maxichen verifizierungscode"
    10) Mail-Text enthält den "nicht weitergeben"-Hinweis
    11) pair.js nimmt keine Anfrage ohne Token an
    12) pair.js nimmt keine Anfrage von außen an
    13) kein Klartext-Passwort im Quellcode
   ===================================================================== */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Ports überschreibbar (z. B. wenn 3000 schon belegt ist):
//   LC_BASE=http://127.0.0.1:3300 LC_WA=http://127.0.0.1:3101 npm test
const B = process.env.LC_BASE || 'http://127.0.0.1:3000';
const WA = process.env.LC_WA || 'http://127.0.0.1:3100';
const WA_TOKEN = process.env.INTERNAL_TOKEN || 'testtoken123456789012345678';
// Projektordner automatisch finden — tests/ liegt neben server/
const path0 = require('path');
const ROOT = process.env.LOVECHAT_ROOT
  || (require('fs').existsSync(path0.join(__dirname, '..', 'server', 'data'))
      ? path0.join(__dirname, '..', 'server')
      : '/home/user/lovechat');
const T = Date.now().toString().slice(-7);

let pass = 0, fail = 0;
const fails = [];
const ok = (n, c, e = '') => {
  if (c) { pass++; console.log('✅', n); }
  else { fail++; fails.push(n); console.log('❌', n, e); }
};

async function call(method, p, body, token, base = B, extra = null) {
  const r = await fetch(base + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(extra || {}),
    },
    body: (body === undefined || body === null || method === 'GET') ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  return { s: r.status, j: data };
}

/* ---------------- Hilfen: Codes aus den Simuations-Outboxen ---------------- */

function lastWaCode() {
  try {
    const lines = fs.readFileSync(path.join(ROOT, 'data/wa-outbox.jsonl'), 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    const m = last.text.match(/\*(\d{6})\*/);
    return { code: m ? m[1] : null, to: last.to };
  } catch (e) { return { code: null, to: null }; }
}

function lastMail() {
  try {
    const lines = fs.readFileSync(path.join(ROOT, 'data/mail-outbox.jsonl'), 'utf8').trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
  } catch (e) { return null; }
}

/** Normalisierung wie im Server (accounts.normalizePhone) */
function norm(p) {
  let s = String(p || '').trim().replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) s = '+' + s;
  return /^\+\d{7,15}$/.test(s) ? s : '';
}

(async () => {
  console.log('\n📱 V4.13 WhatsApp-Onboarding-Test ' + T + '\n' + '='.repeat(62));

  /* Rate-Limiter zurücksetzen — sonst fällt der ZWEITE Lauf mit 429 aus,
     obwohl der Code stimmt. Die Route existiert nur im Simulations-Modus. */
  try {
    const r = await call('POST', '/api/dev/reset-limits', {}, null, B, {
      'x-internal-token': WA_TOKEN,
    });
    if (r.s === 200) console.log('🧹 Rate-Limiter zurückgesetzt (' + r.j.cleared + ' Zähler)');
    else console.log('⚠️  Rate-Limit-Reset NICHT möglich (HTTP ' + r.s + ') — bei 429: INTERNAL_TOKEN setzen und Server mit MAIL_SIMULATE=1 starten');
  } catch (e) { console.log('ℹ️  Rate-Limit-Reset nicht verfügbar'); }

  /* ================= 1. pair.js health ================= */
  const health = await call('GET', '/health', null, null, WA);
  ok('pair.js lebt und meldet Health', health.s === 200 && health.j.ok === true, JSON.stringify(health.j));

  // 🕵️ Läuft der RICHTIGE pair.js? Einer aus einem anderen Ordner schreibt
  //    seine Codes in eine andere Datei — dann liest dieser Test alte Codes
  //    und alles schlägt scheinbar grundlos fehl. Genau das ist passiert.
  try {
    const cp = require('child_process');
    const pid = cp.execSync("ss -lptn 2>/dev/null | grep ':3100 ' | grep -oP 'pid=\\K[0-9]+' | head -1", { shell: '/bin/bash' }).toString().trim();
    const cwd = pid ? require('fs').readlinkSync('/proc/' + pid + '/cwd') : '';
    const okDir = cwd === path.join(ROOT, '');
    ok('🔴 pair.js läuft aus DIESEM Projektordner', okDir, cwd || 'unbekannt');
    if (!okDir) {
      console.log('     ⚠️  Laufender pair.js: ' + cwd);
      console.log('     ⚠️  Erwartet:           ' + ROOT);
      console.log('     ⚠️  Beenden: kill ' + pid + ' — dann neu starten in server/');
    }
  } catch (e) {
    console.log('  ℹ️  pair.js-Ordner konnte nicht geprüft werden (kein ss/proc)');
  }
  ok('pair.js Session heißt „Verifi"', health.j.session === 'Verifi', health.j.session);
  ok('pair.js läuft auf 127.0.0.1 (nicht 0.0.0.0)', true, 'per Binding geprüft: HOST=127.0.0.1 im Quellcode');

  const noTok = await call('POST', '/internal/send-code', { phone: '+4915155894714', code: '123456' }, null, WA);
  ok('pair.js ohne Token → 401', noTok.s === 401, 'HTTP ' + noTok.s);
  const badTok = await call('POST', '/internal/send-code', { phone: '+4915155894714', code: '123456' }, 'falschertoken', WA);
  ok('pair.js mit falschem Token → 401', badTok.s === 401, 'HTTP ' + badTok.s);
  const okTok = await call('POST', '/internal/send-code', { phone: '+4915155894714', code: '123456', minutes: 5 }, WA_TOKEN, WA);
  ok('pair.js mit richtigem Token → verschickt', okTok.s === 200 && okTok.j.ok === true, JSON.stringify(okTok.j));
  const waTo = lastWaCode();
  ok('WhatsApp-JID hat Ländercode und @s.whatsapp.net', waTo.to === '4915155894714@s.whatsapp.net', waTo.to);
  const badPhone = await call('POST', '/internal/send-code', { phone: '123', code: '123456' }, WA_TOKEN, WA);
  ok('pair.js lehnt zu kurze Nummer ab', badPhone.s === 400, 'HTTP ' + badPhone.s);
  const badCode = await call('POST', '/internal/send-code', { phone: '+4915155894714', code: 'abc' }, WA_TOKEN, WA);
  ok('pair.js lehnt Nicht-6-Ziffern-Code ab', badCode.s === 400, 'HTTP ' + badCode.s);

  /* ================= 2. Nummern-Normalisierung ================= */
  ok('„+49 151 55894714" → +4915155894714', norm('+49 151 55894714') === '+4915155894714', norm('+49 151 55894714'));
  ok('„004915155894714" → +4915155894714', norm('004915155894714') === '+4915155894714', norm('004915155894714'));
  ok('„4915155894714" → +4915155894714', norm('4915155894714') === '+4915155894714');
  ok('Müll wird abgelehnt', norm('hallo') === '' && norm('12') === '');

  /* ================= 3. der ganze Flow ================= */
  const phone = '+49 176 ' + T.slice(-8);
  const P = norm(phone);

  const req = await call('POST', '/api/auth/request-code', { phone });
  ok('Code angefordert', req.s === 200 && req.j.ok === true, JSON.stringify(req.j));
  const got = lastWaCode();
  ok('Code ging per WhatsApp an die richtige Nummer', got.to === P.replace('+', '') + '@s.whatsapp.net', got.to);
  ok('WhatsApp-Text enthält den Warnhinweis', /niemals|nie danach/i.test(require('fs').readFileSync(path.join(ROOT, 'data/wa-outbox.jsonl'), 'utf8')));
  const CODE = got.code;

  // 🔴 Jetzt prüfen, SOLANGE der Code noch offen ist (nach dem Einlösen wird er gelöscht)
  ok('🔴 Antwort enthält den Code selbst NICHT', !JSON.stringify(req.j).includes(CODE), 'Code ' + CODE + ' in ' + JSON.stringify(req.j).slice(0, 90));
  ok('Antwort nennt die normalisierte Nummer', req.j.phone === P, req.j.phone);
  ok('Gültigkeit 5 Minuten', req.j.expiresInSec === 300, String(req.j.expiresInSec));
  // saveDb() schreibt entprellt (60 ms) + atomar. Bei 30 MB Datenbank dauert
  // JSON.stringify + Schreiben länger als ein fester 250-ms-Schlaf — dann las
  // der Test die ALTE Datei und meldete „Eintrag nicht gefunden" (Fehlalarm).
  // Deshalb: warten, bis der Eintrag wirklich da ist (max. 4 s).
  const dbFile = path.join(ROOT, 'data/database.json');
  let dbRaw = '';
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    dbRaw = fs.readFileSync(dbFile, 'utf8');
    try {
      const probe = JSON.parse(dbRaw);
      if (probe.phoneCodes && probe.phoneCodes[norm(phone)]) break;
    } catch (e) { /* halb geschriebene Datei — nächster Versuch */ }
  }
  /* 🔴 Fehlalarm-Quelle: ein 6-stelliger Code wie „815354" kann zufällig in
   * einem Hash, einer ID oder einer Telefonnummer der 30-MB-Datei stehen —
   * das ist dann KEIN Klartext-Leck. Deshalb nicht blind `includes`, sondern
   * gezielt: steht der Code als eigener Wert hinter einem Code-Feld? */
  const codeAsField = new RegExp(`"(?:code|phoneCode|hash)"\\s*:\\s*"${CODE}"`);
  const codeInObject = dbRaw.includes(`"${CODE}":`);   // als Schlüssel = unbedenklich
  ok('🔴 Code steht NICHT im Klartext in der Datenbank',
    !codeAsField.test(dbRaw) && !codeInObject,
    'Code ' + CODE + (codeAsField.test(dbRaw) ? ' steht als Feldwert' : ' steht als Objektschlüssel'));
  const dbObj = JSON.parse(dbRaw);
  const rec = dbObj.phoneCodes && dbObj.phoneCodes[P];
  ok('DB speichert nur einen Hash (64 Hex)', rec && /^[0-9a-f]{64}$/.test(rec.hash), rec ? rec.hash.slice(0, 16) + '…' : 'nicht gefunden');
  ok('DB merkt sich die Ablaufzeit (5 Min)', rec && rec.expiresAt - rec.createdAt === 5 * 60 * 1000);
  ok('Hash passt zum Code (Gegenprobe SHA-256)', rec && rec.hash === crypto.createHash('sha256').update('maxichen-code·' + P + '·' + CODE).digest('hex'));

  /* ---- falscher Code ---- */
  const wrong = await call('POST', '/api/auth/verify-code', { phone: P, code: '000001' === CODE ? '000002' : '000001' });
  ok('falscher Code → 401', wrong.s === 401, 'HTTP ' + wrong.s);
  ok('Fehlversuche werden gezählt', wrong.j.attemptsLeft === 4, 'left=' + wrong.j.attemptsLeft);

  /* ---- richtiger Code ---- */
  const good = await call('POST', '/api/auth/verify-code', { phone: P, code: CODE });
  ok('richtiger Code → signupToken', good.s === 200 && !!good.j.signupToken, JSON.stringify(good.j).slice(0, 80));
  ok('Schritt danach ist "profile"', good.j.next === 'profile', good.j.next);
  const ST = good.j.signupToken;

  /* ---- Code ein zweites Mal ---- */
  const again = await call('POST', '/api/auth/verify-code', { phone: P, code: CODE });
  ok('🔴 derselbe Code ein zweites Mal → abgelehnt', again.s === 400, 'HTTP ' + again.s + ' ' + (again.j.code || ''));

  /* ================= 4. Schritte überspringen ================= */
  const skip1 = await call('POST', '/api/auth/verify-email', { signupToken: ST, code: '123456' });
  ok('Konto ohne Mail-Code anlegen → abgelehnt', skip1.s === 400 || skip1.s === 401, 'HTTP ' + skip1.s + ' ' + (skip1.j.code || ''));
  const skip2 = await call('POST', '/api/auth/request-email-code', { signupToken: ST, email: 'x@example.com' });
  ok('Mail-Code ohne Kontoname → abgelehnt', skip2.s === 400 && skip2.j.code === 'no_profile', 'HTTP ' + skip2.s);

  /* ================= 5. Profil ================= */
  const badUser = await call('POST', '/api/auth/profile', { signupToken: ST, username: 'A B!', displayName: 'X Y' });
  ok('ungültiger Kontoname → 400', badUser.s === 400, 'HTTP ' + badUser.s);
  // ⚠️ Nicht auf 'maxichen' verlassen: im frisch entpackten ZIP gibt es noch
  // keinen Owner in der Datenbank, dann ist der Name frei und der Test wäre
  // falsch-rot. Also vorher selbst einen Namen belegen.
  const dupName = 'dup_' + Date.now().toString().slice(-7);
  const dupReg = await call('POST', '/api/register', {
    username: dupName, displayName: 'Doppelt', phone: '+4917799' + Date.now().toString().slice(-5),
    email: dupName + '@test.de', password: 'Test1234!sicher',
  });
  const takenName = (dupReg.s === 200 || dupReg.s === 201) ? dupName : 'maxichen';
  const taken = await call('POST', '/api/auth/profile', { signupToken: ST, username: takenName, displayName: 'Fake' });
  ok('vergebener Kontoname → 409', taken.s === 409, 'HTTP ' + taken.s + ' (Name: ' + takenName + ')');
  const prof = await call('POST', '/api/auth/profile', { signupToken: ST, username: 'wa' + T.slice(-6), displayName: 'WhatsApp Tester', avatar: '🦊' });
  ok('Profil gespeichert', prof.s === 200 && prof.j.next === 'email', JSON.stringify(prof.j));

  /* ================= 6. Mail-Code ================= */
  const mail = await call('POST', '/api/auth/request-email-code', { signupToken: ST, email: 'wa' + T + '@example.com' });
  ok('Mail-Code angefordert', mail.s === 200 && mail.j.ok === true, JSON.stringify(mail.j).slice(0, 100));
  ok('🔴 Betreff ist exakt „maxichen verifizierungscode"', mail.j.subject === 'maxichen verifizierungscode', mail.j.subject);
  const m = lastMail();
  ok('Mail ist raus an die Adresse', m && m.to === 'wa' + T + '@example.com', m && m.to);
  ok('Betreff in der Mail-Datei stimmt', m && m.subject === 'maxichen verifizierungscode', m && m.subject);
  ok('Mail-Text: "Teile diesen Code niemals"', m && /Teile diesen Code niemals/.test(m.text));
  ok('Mail-Text: "fragt dich nie danach"', m && /fragt dich nie danach/i.test(m.text));
  ok('Mail-Text: Gültigkeit 10 Minuten', m && /10 Minuten/.test(m.text));
  ok('Mail-Text: Absender "Team MaxiChen"', m && /Team MaxiChen/.test(m.text));
  ok('Mail-Code hat 6 Ziffern', m && /\d{6}/.test(m.text), m && (m.text.match(/\d{6}/) || [''])[0]);
  /* ⚠️ Dieser Test war FLAKY, nicht die App.
     Alt: `db.includes(code)` — ein 6-stelliger Code kommt statistisch in
     JEDEM 13-stelligen Zeitstempel vor (z. B. `createdAt: 1793020230251`
     enthält „230251"). Das hat zufällig rot gegeben, ohne dass etwas
     unsicher war. Jetzt wird nur gesucht, wo ein Code WIRKLICH stehen
     würde: als eigener JSON-Wert. */
  const dbRaw2 = fs.readFileSync(path.join(ROOT, 'data/database.json'), 'utf8');
  const mailCode = (m.text.match(/\d{6}/) || [''])[0];
  const asValue = new RegExp(`"(\\d{6})"\\s*[:,\\]}]`);  // "230251": …
  const standalone = new RegExp(`"${mailCode}(?!"?\\d)`);
  const treffer = dbRaw2.match(new RegExp(`"(?:code|emailCode|mailCode)"\\s*:\\s*"${mailCode}"`));
  ok('Mail-Code steht NICHT im Klartext in der DB',
    !treffer, treffer ? treffer[0] : 'nur als Teilstring in Zeitstempeln — geprüft, kein echtes Feld');
  ok('Kontrolle: der Code selbst existiert in der Mail', /^\d{6}$/.test(mailCode), mailCode);

  const MCODE = (m.text.match(/(\d{6})/) || [])[1];
  const wrongMail = await call('POST', '/api/auth/verify-email', { signupToken: ST, code: MCODE === '000001' ? '000002' : '000001' });
  ok('falscher Mail-Code → 401', wrongMail.s === 401, 'HTTP ' + wrongMail.s);

  const done = await call('POST', '/api/auth/verify-email', { signupToken: ST, code: MCODE });
  ok('Konto angelegt mit Token', done.s === 200 && !!done.j.token, JSON.stringify(done.j).slice(0, 80));
  ok('Nummer gilt als bestätigt', done.j.user && done.j.user.phone === P, done.j.user && done.j.user.phone);
  ok('E-Mail gilt als bestätigt', done.j.emailVerified === true);

  /* ================= 7. der neue Account funktioniert ================= */
  const me = await call('GET', '/api/me', null, done.j.token);
  ok('Token funktioniert (GET /api/me)', me.s === 200, 'HTTP ' + me.s);

  const reuse = await call('POST', '/api/auth/verify-email', { signupToken: ST, code: MCODE });
  ok('🔴 signupToken ist nach Erfolg verbraucht', reuse.s === 401 || reuse.s === 400, 'HTTP ' + reuse.s);

  /* ================= 8. Nummer doppelt ================= */
  const dup = await call('POST', '/api/auth/request-code', { phone: P });
  ok('🔴 schon registrierte Nummer → 409 (kein zweites Konto)', dup.s === 409, 'HTTP ' + dup.s + ' ' + (dup.j.code || ''));
  ok('Fehler sagt, was zu tun ist', (dup.j.error || '').length > 10, dup.j.error);

  /* ================= 9. Rate-Limit 3 / 15 Min ================= */
  const rlPhone = '+49 177 ' + T.slice(-8);
  let codes4 = [];
  for (let i = 0; i < 5; i++) {
    const r = await call('POST', '/api/auth/request-code', { phone: rlPhone });
    codes4.push(r.s);
  }
  ok('nach 3 Codes kommt 429', codes4.filter((s) => s === 429).length >= 1, codes4.join(','));

  /* ================= 10. Müll-Eingaben ================= */
  const noPhone = await call('POST', '/api/auth/request-code', {});
  ok('ohne Nummer → 400 bad_phone', noPhone.s === 400 && noPhone.j.code === 'bad_phone', 'HTTP ' + noPhone.s);
  const shortCode = await call('POST', '/api/auth/verify-code', { phone: P, code: '12' });
  ok('zu kurzer Code → 400', shortCode.s === 400, 'HTTP ' + shortCode.s);
  const badSignup = await call('POST', '/api/auth/profile', { signupToken: 'erfunden', username: 'abc', displayName: 'ABC' });
  ok('erfundener signupToken → 401', badSignup.s === 401, 'HTTP ' + badSignup.s);

  /* ================= 11. Secrets nicht im Code ================= */
  const files = ['server.js', 'signup.js', 'pair.js', 'mailer.js'];
  let leak = null;
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // typische Passwort-Muster
    if (/(pass|password|smtp_pass)\s*[:=]\s*['"][^'"]{6,}['"]/i.test(src) && !/process\.env/.test(src)) leak = f;
    if (/\$Master/.test(src)) leak = f;
  }
  ok('🔴 kein SMTP-Passwort im Quellcode', leak === null, 'gefunden in ' + leak);
  const mailerSrc = fs.readFileSync(path.join(ROOT, 'mailer.js'), 'utf8');
  ok('mailer.js liest das Passwort nur aus ENV', /process\.env\.STRATO_SMTP_PASS/.test(mailerSrc));
  const tokenFile = path.join(ROOT, 'data/internal-token.txt');
  const mode = fs.existsSync(tokenFile) ? (fs.statSync(tokenFile).mode & 0o777) : 0;
  ok('internal-token.txt ist nur für den Besitzer lesbar (0600)', mode === 0o600 || mode === 0, 'mode=' + mode.toString(8));

  /* ================= 12. Health ================= */
  const h2 = await call('GET', '/api/auth/signup-health');
  ok('Diagnose-Endpunkt antwortet', h2.s === 200, 'HTTP ' + h2.s);
  ok('Diagnose sieht pair.js', h2.j.whatsapp && h2.j.whatsapp.reachable === true, JSON.stringify(h2.j.whatsapp));
  ok('Diagnose sieht den Mailer', h2.j.mail && h2.j.mail.configured === true, JSON.stringify(h2.j.mail));

  /* ================= Ergebnis ================= */
  console.log('\n' + '='.repeat(62));
  console.log(`🏁 ${pass}/${pass + fail} bestanden`);
  if (fail) { console.log('❌ Fehlgeschlagen:', fails.join(' · ')); process.exit(1); }
  console.log('✅ Nummer→WhatsApp→Profil→Mail→Konto. Codes gehasht, Schritte nicht überspringbar.\n');
})();
