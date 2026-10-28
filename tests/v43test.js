/* V4.3 — Security-Systeme testen
   Privat-Modus · Sicherheits-Center · Login-Schutz · Einmal-Medien
   Versteckte Chats · Inhaltsfilter */
const B = 'http://127.0.0.1:3000';
const T = Date.now().toString().slice(-6);
let pass = 0, fail = 0;
function ok(n, c, extra = '') { if (c) { pass++; console.log('✅', n); } else { fail++; console.log('❌', n, extra); } }
async function call(method, path, body, token, ua) {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(ua ? { 'User-Agent': ua } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}

(async () => {
  /* ---------- Setup ---------- */
  const owner = await call('POST', '/api/login', { login: 'maxichen', password: 'LoveChat!2026' });
  ok('Owner-Login', owner.s === 200 && !!owner.j.token);
  const OT = owner.j.token;

  await call('POST', '/api/register', { username: 'v43a' + T, displayName: 'Mina ' + T, password: 'Test!1234' });
  await call('POST', '/api/register', { username: 'v43b' + T, displayName: 'Alex ' + T, password: 'Test!1234' });
  const A = await call('POST', '/api/login', { login: 'v43a' + T, password: 'Test!1234' });
  const Bu = await call('POST', '/api/login', { login: 'v43b' + T, password: 'Test!1234' });
  const AT = A.j.token, BT = Bu.j.token;
  const AID = A.j.user.id, BID = Bu.j.user.id;
  ok('Zwei Testnutzer angemeldet', !!AT && !!BT);

  /* ---------- 1. Privat-Modus ---------- */
  const p0 = await call('GET', '/api/privacy', null, AT);
  ok('Privat-Einstellungen abrufbar', p0.s === 200 && p0.j.privacy.allowDmFrom === 'all');

  const p1 = await call('POST', '/api/privacy', {
    allowDmFrom: 'nobody', lastSeenPrivacy: 'nobody', readReceipts: false,
    quietHours: { enabled: true, from: '22:00', to: '07:00' },
  }, AT);
  ok('Privat-Modus gespeichert', p1.s === 200 && p1.j.privacy.allowDmFrom === 'nobody' && p1.j.privacy.quietHours.enabled === true);

  const dmDenied = await call('POST', '/api/chats', { type: 'private', userId: AID }, BT);
  ok('DM an "nobody" blockiert (403)', dmDenied.s === 403, `s=${dmDenied.s} ${JSON.stringify(dmDenied.j)}`);

  await call('POST', '/api/privacy', { allowDmFrom: 'contacts' }, AT);
  const dmContacts = await call('POST', '/api/chats', { type: 'private', userId: AID }, BT);
  ok('DM an "nur Kontakte" blockiert (403 contacts_only)', dmContacts.s === 403, `s=${dmContacts.s} ${JSON.stringify(dmContacts.j)}`);

  await call('POST', '/api/privacy', { allowDmFrom: 'all' }, AT);
  const dmOk = await call('POST', '/api/chats', { type: 'private', userId: AID }, BT);
  ok('DM an "alle" erlaubt', dmOk.s === 200, `s=${dmOk.s} ${JSON.stringify(dmOk.j).slice(0, 120)}`);
  const chatId = dmOk.j.chat ? dmOk.j.chat.id : (dmOk.j.summary ? dmOk.j.summary.id : dmOk.j.id);

  /* ---------- 2. Sicherheits-Center ---------- */
  const sec = await call('GET', '/api/security/overview', null, AT);
  ok('Sicherheits-Score vorhanden', sec.s === 200 && typeof sec.j.score === 'number' && Array.isArray(sec.j.checks),
    JSON.stringify(sec.j).slice(0, 160));
  ok('Score zwischen 0 und 100', sec.j.score >= 0 && sec.j.score <= 100, String(sec.j.score));
  ok('Grade-Text vorhanden', typeof sec.j.grade === 'string' && sec.j.grade.length > 0, sec.j.grade);
  ok('8 Prüfungen', sec.j.checks.length === 8);
  ok('Sitzungszahl dabei', typeof sec.j.sessions === 'number');

  /* ---------- 3. Login-Verlauf ---------- */
  const logins = await call('GET', '/api/security/logins', null, AT);
  ok('Login-Verlauf protokolliert', logins.s === 200 && logins.j.logins.length >= 1,
    JSON.stringify(logins.j).slice(0, 140));

  /* ---------- 4. Login-Schutz (Brute Force) ---------- */
  const target = 'v43b' + T;
  let lastStatus = 0, lockedSeen = false;
  for (let i = 0; i < 6; i++) {
    const r = await call('POST', '/api/login', { login: target, password: 'falsch' + i });
    lastStatus = r.s;
    if (r.j.code === 'login_locked') lockedSeen = true;
  }
  ok('Nach 5 Fehlversuchen gesperrt (429)', lockedSeen, 'letzter Status ' + lastStatus);
  const rightWhileLocked = await call('POST', '/api/login', { login: target, password: 'Test!1234' });
  ok('Auch richtiges Passwort während Sperre blockiert', rightWhileLocked.s === 429 && rightWhileLocked.j.code === 'login_locked',
    `s=${rightWhileLocked.s} ${JSON.stringify(rightWhileLocked.j).slice(0, 120)}`);

  /* ---------- 5. Inhaltsfilter ---------- */
  const scan = await call('POST', '/api/security/scan', { text: 'Gratis iPhone gewinnen, klicke hier bit.ly/abc' }, AT);
  ok('Scanner erkennt Scam', scan.s === 200 && scan.j.score >= 3 && scan.j.blocked === true,
    JSON.stringify(scan.j));
  const scanClean = await call('POST', '/api/security/scan', { text: 'Hey, wie geht es dir? 💗' }, AT);
  ok('Scanner lässt normale Nachricht durch', scanClean.s === 200 && scanClean.j.blocked === false);

  const blockedMsg = await call('POST', '/api/chats/' + chatId + '/messages',
    { text: 'Sende mir deine Passwort und Kreditkarte, garantierte Rendite' }, BT);
  ok('Scam-Nachricht im Chat blockiert (403 filtered)', blockedMsg.s === 403 && blockedMsg.j.code === 'filtered',
    `s=${blockedMsg.s} ${JSON.stringify(blockedMsg.j).slice(0, 140)}`);

  const okMsg = await call('POST', '/api/chats/' + chatId + '/messages', { text: 'Hey Mina 💗' }, BT);
  ok('Normale Nachricht geht durch', okMsg.s === 200, JSON.stringify(okMsg.j).slice(0, 120));

  /* ---------- 6. Einmal-Medium ---------- */
  const tinyImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const vo = await call('POST', '/api/chats/' + chatId + '/messages',
    { kind: 'photo', image: tinyImg, viewOnce: true }, AT);
  ok('Einmal-Foto gesendet', vo.s === 200 && vo.j.message && vo.j.message.attachment && vo.j.message.attachment.viewOnce === true,
    JSON.stringify(vo.j).slice(0, 200));
  const voId = vo.j.message.id;

  const voOpen = await call('POST', '/api/chats/' + chatId + '/messages/' + voId + '/view-once', null, BT);
  ok('Empfänger öffnet Einmal-Foto', voOpen.s === 200, JSON.stringify(voOpen.j).slice(0, 140));
  const voAgain = await call('POST', '/api/chats/' + chatId + '/messages/' + voId + '/view-once', null, BT);
  ok('Zweites Öffnen verweigert (409 consumed)', voAgain.s === 409 && voAgain.j.code === 'consumed',
    `s=${voAgain.s} ${JSON.stringify(voAgain.j).slice(0, 120)}`);

  const msgs = await call('GET', '/api/chats/' + chatId + '/messages', null, AT);
  const consumed = (msgs.j.messages || []).find((m) => m.id === voId);
  ok('Konsumiertes Medium ist geleert', consumed && consumed.attachment && consumed.attachment.url === '' && consumed.text.includes('Einmal angesehen'),
    JSON.stringify(consumed || {}).slice(0, 200));

  /* ---------- 7. Versteckte Chats ---------- */
  const hide = await call('POST', '/api/chats/' + chatId + '/hide', { hidden: true }, AT);
  ok('Chat versteckt', hide.s === 200 && Array.isArray(hide.j.hidden) && hide.j.hidden.includes(chatId));

  const meNorm = await call('GET', '/api/me', null, AT);
  ok('Versteckt → nicht in normaler /me-Liste', !(meNorm.j.chats || []).some((c) => c.id === chatId));

  const meHidden = await call('GET', '/api/me?hidden=1', null, AT);
  ok('Versteckt → in /me?hidden=1 sichtbar', (meHidden.j.chats || []).some((c) => c.id === chatId));
  ok('privacy liegt in /me', meNorm.j.user.privacy && meNorm.j.user.privacy.allowDmFrom === 'all');

  const unhide = await call('POST', '/api/chats/' + chatId + '/hide', { hidden: false }, AT);
  ok('Chat wieder sichtbar', unhide.s === 200 && !unhide.j.hidden.includes(chatId));

  /* ---------- 8. Score steigt mit Schutz ---------- */
  const before = sec.j.score;
  await call('POST', '/api/privacy', { allowDmFrom: 'contacts', lastSeenPrivacy: 'nobody', strictFilter: true, quietHours: { enabled: true, from: '22:00', to: '07:00' }, pinSet: true }, AT);
  const after = await call('GET', '/api/security/overview', null, AT);
  ok('Score steigt nach Schutz-Einstellungen', after.j.score >= before, `${before} → ${after.j.score}`);
  ok('PIN wird als erledigt erkannt', (after.j.checks || []).find((c) => c.id === 'pin').ok === true);

  console.log('\n' + pass + '/' + (pass + fail) + (fail === 0 ? ' grün 💗' : ' — Fehler: ' + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
