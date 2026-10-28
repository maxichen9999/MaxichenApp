/* =====================================================================
   V4.4 — EHRLICHE TESTS (keine Gefälligkeits-Checks)
   Deckt genau die Punkte ab, die Maxichen als „fake" bezeichnet hat:
     1) UNIQUE phone  → gleiche Nummer 409 phone_exists
     2) versteckte Chats tauchen in /api/search/messages NICHT auf
     3) Secure-Delete → Felder leer + Bytes aus der DB-Datei verschwunden
     4) Filter-Block mit Grund + Einspruch
     5) requireOwner auf ALLEN Ban-Wegen (+ Defense-in-Depth)
     6) E2E-Umlauf (nur Ciphertext in der DB, Einmal-Prekey wird verbraucht)
     7) Account-Switch liefert gültigen Token des Ziel-Accounts
     8) Login-Lock pro ACCOUNT (nicht pro IP) — WLAN-Fall
     9) Extras: Standort live, Gruppen-Call max 8, Einladung, Backup, Themen
   ===================================================================== */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const B = 'http://127.0.0.1:3000';
const DB = '/home/user/lovechat/data/database.json';
const T = Date.now().toString().slice(-6);
let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('✅', name); }
  else { fail++; fails.push(name); console.log('❌', name, extra); }
}
const j = (o) => { try { return JSON.stringify(o).slice(0, 240); } catch (e) { return ''; } };

async function call(method, p, body, token) {
  const r = await fetch(B + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: (body === undefined || body === null || method === 'GET' || method === 'HEAD') ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  return { s: r.status, j: data };
}

/* Nummern: eindeutig pro Testlauf, aber im gültigen E.164-Format */
const phone = (n) => '+49151' + T + String(n).padStart(2, '0');
const smsFlow = async (nr) => {
  const req = await call('POST', '/api/accounts/sms/request', { phone: nr, purpose: 'add' });
  return req;
};

(async () => {
  console.log('\n💗 V4.4 Testlauf ' + T + '\n' + '='.repeat(56));

  /* ================= SETUP ================= */
  const owner = await call('POST', '/api/login', { login: 'maxichen', password: 'LoveChat!2026' });
  ok('Owner-Login', owner.s === 200 && !!owner.j.token, j(owner.j));
  const OT = owner.j.token;

  const regA = await call('POST', '/api/register', {
    username: 'v44a' + T, displayName: 'Mina ' + T, password: 'Test!1234', phone: phone(1),
  });
  ok('Registrierung A mit Nummer', regA.s === 200 && !!regA.j.token, j(regA.j));
  const regB = await call('POST', '/api/register', {
    username: 'v44b' + T, displayName: 'Alex ' + T, password: 'Test!1234', phone: phone(2),
  });
  ok('Registrierung B mit anderer Nummer', regB.s === 200 && !!regB.j.token, j(regB.j));
  const AT = regA.j.token, BT = regB.j.token;
  const AID = regA.j.user.id, BID = regB.j.user.id;

  /* =====================================================================
     1) UNIQUE PHONE
     ===================================================================== */
  console.log('\n— 1) Telefonnummer UNIQUE —');
  const dup = await call('POST', '/api/register', {
    username: 'v44dup' + T, displayName: 'Doppelt ' + T, password: 'Test!1234', phone: phone(1),
  });
  ok('Gleiche Nummer registrieren → 409', dup.s === 409, `s=${dup.s} ${j(dup.j)}`);
  ok('…mit code phone_exists', dup.j.code === 'phone_exists', j(dup.j));
  ok('…ohne verräterische ID', !JSON.stringify(dup.j).includes(AID), j(dup.j));

  const availTaken = await call('GET', '/api/accounts/phone-available?phone=' + encodeURIComponent(phone(1)));
  ok('phone-available (vergeben) → available:false', availTaken.s === 200 && availTaken.j.available === false && availTaken.j.code === 'phone_exists', j(availTaken.j));

  const availFree = await call('GET', '/api/accounts/phone-available?phone=' + encodeURIComponent(phone(3)));
  ok('phone-available (frei) → available:true', availFree.s === 200 && availFree.j.available === true, j(availFree.j));
  ok('…Nummer maskiert (+491 •••• xx)', /^\+491 •••• \d{2}$/.test(availFree.j.masked || ''), availFree.j.masked);

  const smsTaken = await smsFlow(phone(2));
  ok('SMS an fremde Nummer → 409 phone_exists', smsTaken.s === 409 && smsTaken.j.code === 'phone_exists', `s=${smsTaken.s} ${j(smsTaken.j)}`);

  /* =====================================================================
     2) MULTI-ACCOUNT (max 5) + SWITCH
     ===================================================================== */
  console.log('\n— 2) Multi-Account —');
  const smsA = await smsFlow(phone(3));
  ok('SMS-Code angefordert (Dev-Outbox)', smsA.s === 200 && /^\d{6}$/.test(smsA.j.devCode || ''), j(smsA.j));
  ok('Outbox-Datei existiert wirklich', fs.existsSync('/home/user/lovechat/data/sms-outbox.log'));

  const smsBad = await call('POST', '/api/accounts/sms/verify', { phone: phone(3), code: '000000' });
  ok('Falscher Code → 400 code_wrong', smsBad.s === 400 && smsBad.j.code === 'code_wrong', j(smsBad.j));

  const smsOk = await call('POST', '/api/accounts/sms/verify', { phone: phone(3), code: smsA.j.devCode });
  ok('Richtiger Code → Ticket', smsOk.s === 200 && !!smsOk.j.ticket, j(smsOk.j));
  const ticket3 = smsOk.j.ticket;

  const addNoTicket = await call('POST', '/api/accounts/add', {
    ticket: 'deadbeef', phone: phone(3), username: 'v44c' + T, displayName: 'Cora ' + T, password: 'Test!1234',
  }, AT);
  ok('Account ohne gültiges Ticket → 403 phone_unverified', addNoTicket.s === 403 && addNoTicket.j.code === 'phone_unverified', j(addNoTicket.j));

  const addC = await call('POST', '/api/accounts/add', {
    ticket: ticket3, phone: phone(3), username: 'v44c' + T, displayName: 'Cora ' + T, password: 'Test!1234',
  }, AT);
  ok('2. Account angelegt (SMS verifiziert)', addC.s === 200 && !!addC.j.token, j(addC.j));
  const CT = addC.j.token, CID = addC.j.user.id;
  ok('Antwort enthält beide Accounts', Array.isArray(addC.j.accounts) && addC.j.accounts.length === 2, j(addC.j.accounts));

  const addReplay = await call('POST', '/api/accounts/add', {
    ticket: ticket3, phone: phone(3), username: 'v44x' + T, displayName: 'Replay ' + T, password: 'Test!1234',
  }, AT);
  ok('Ticket ist Einweg (2. Versuch scheitert)', addReplay.s === 403, `s=${addReplay.s} ${j(addReplay.j)}`);

  const list = await call('GET', '/api/accounts', null, AT);
  ok('Account-Liste zeigt 2 Accounts', list.s === 200 && list.j.accounts.length === 2 && list.j.max === 5, j(list.j));

  const sw = await call('POST', '/api/accounts/switch', { userId: CID }, AT);
  ok('Switch liefert neuen Token', sw.s === 200 && !!sw.j.token && sw.j.token !== AT, j(sw.j).slice(0, 80));
  const swMe = await call('GET', '/api/me', null, sw.j.token);
  ok('Switch-Token gehört wirklich zu Account C', swMe.s === 200 && swMe.j.user.id === CID, j(swMe.j.user));

  const swForeign = await call('POST', '/api/accounts/switch', { userId: BID }, AT);
  ok('Switch auf fremden Account → 403 not_in_group', swForeign.s === 403 && swForeign.j.code === 'not_in_group', j(swForeign.j));

  /* bis 5 Accounts auffüllen */
  const fill = [];
  for (let n = 4; n <= 6; n++) {
    const r = await smsFlow(phone(n));
    const v = await call('POST', '/api/accounts/sms/verify', { phone: phone(n), code: r.j.devCode });
    const a = await call('POST', '/api/accounts/add', {
      ticket: v.j.ticket, phone: phone(n), username: 'v44u' + n + T, displayName: 'Acc' + n + ' ' + T, password: 'Test!1234',
    }, AT);
    fill.push(a);
  }
  ok('Accounts 3–5 angelegt', fill.every((x) => x.s === 200), fill.map((x) => x.s).join(','));
  const five = await call('GET', '/api/accounts', null, AT);
  ok('Genau 5 Accounts', five.j.accounts.length === 5, String(five.j.accounts.length));

  const r7 = await smsFlow(phone(7));
  const v7 = await call('POST', '/api/accounts/sms/verify', { phone: phone(7), code: r7.j.devCode });
  const sixth = await call('POST', '/api/accounts/add', {
    ticket: v7.j.ticket, phone: phone(7), username: 'v44u7' + T, displayName: 'Sechs ' + T, password: 'Test!1234',
  }, AT);
  ok('6. Account → 409 max_accounts', sixth.s === 409 && sixth.j.code === 'max_accounts', `s=${sixth.s} ${j(sixth.j)}`);

  const unlink = await call('DELETE', '/api/accounts/' + CID + '/link', null, AT);
  ok('Account-Verknüpfung lösbar', unlink.s === 200 && unlink.j.accounts.length === 4, j(unlink.j));

  /* =====================================================================
     3) VERSTECKTE CHATS DÜRFEN NICHT IN DER SUCHE AUFTAUCHEN
     ===================================================================== */
  console.log('\n— 3) Such-Leck —');
  const cReq = await call('POST', '/api/chats', { type: 'private', userId: BID }, AT);
  const chatId = cReq.j.chat ? cReq.j.chat.id : (cReq.j.summary ? cReq.j.summary.id : cReq.j.id);
  ok('Privater Chat A↔B', !!chatId, j(cReq.j).slice(0, 120));

  const marker = 'GEHEIM' + T;
  const sent = await call('POST', '/api/chats/' + chatId + '/messages', { text: 'Die Zahl lautet ' + marker + ' ok' }, AT);
  ok('Nachricht gesendet', sent.s === 200, j(sent.j).slice(0, 120));

  const findBefore = await call('GET', '/api/search/messages?q=' + marker, null, AT);
  ok('Suche findet Nachricht (vor Verstecken)', findBefore.s === 200 && findBefore.j.total >= 1, j(findBefore.j));

  const hide = await call('POST', '/api/chats/' + chatId + '/hide', { hidden: true }, AT);
  ok('Chat versteckt', hide.s === 200 && hide.j.hidden.includes(chatId), j(hide.j));

  const findHidden = await call('GET', '/api/search/messages?q=' + marker, null, AT);
  ok('🔎 Suche findet versteckten Chat NICHT', findHidden.s === 200 && findHidden.j.total === 0 && findHidden.j.results.length === 0, j(findHidden.j));

  const findHiddenChatParam = await call('GET', '/api/search/messages?q=' + marker + '&chatId=' + chatId, null, AT);
  ok('…auch nicht mit chatId-Parameter', findHiddenChatParam.j.total === 0, j(findHiddenChatParam.j));

  const findOther = await call('GET', '/api/search/messages?q=' + marker, null, BT);
  ok('…aber B (Chat nicht versteckt) findet sie', findOther.j.total >= 1, j(findOther.j));

  const meA = await call('GET', '/api/me', null, AT);
  ok('…und /me listet den Chat nicht', !(meA.j.chats || []).some((c) => c.id === chatId));

  await call('POST', '/api/chats/' + chatId + '/hide', { hidden: false }, AT);
  const findBack = await call('GET', '/api/search/messages?q=' + marker, null, AT);
  ok('Nach Unhide wieder auffindbar', findBack.j.total >= 1, j(findBack.j));

  /* =====================================================================
     4) SECURE DELETE — WIRKLICH WEG
     ===================================================================== */
  console.log('\n— 4) Secure-Delete —');
  const markerB64 = Buffer.from('EINMALMARKER-' + T + '-ENDE').toString('base64');
  const dataUrl = 'data:image/png;base64,' + markerB64 + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const voSend = await call('POST', '/api/chats/' + chatId + '/messages', { image: dataUrl, viewOnce: true, text: '' }, AT);
  ok('Einmal-Medium gesendet', voSend.s === 200, j(voSend.j).slice(0, 160));
  const mid = voSend.j.message ? voSend.j.message.id : null;
  ok('…als viewOnce markiert', !!(voSend.j.message && voSend.j.message.attachment && voSend.j.message.attachment.viewOnce), j(voSend.j).slice(0, 200));

  await new Promise((r) => setTimeout(r, 250)); // saveDb ist 60 ms debounced
  const dbBefore = fs.readFileSync(DB, 'utf8');
  ok('Marker liegt physisch in der DB-Datei (vorher)', dbBefore.includes(markerB64));

  const ownConsume = await call('POST', '/api/chats/' + chatId + '/messages/' + mid + '/view-once', null, AT);
  ok('Eigenes Einmal-Medium → 400', ownConsume.s === 400, `s=${ownConsume.s} ${j(ownConsume.j)}`);

  const consume = await call('POST', '/api/chats/' + chatId + '/messages/' + mid + '/view-once', null, BT);
  ok('B öffnet Einmal-Medium', consume.s === 200, `s=${consume.s} ${j(consume.j)}`);
  ok('…Antwort nennt überschriebene Felder', Array.isArray(consume.j.secureDelete && consume.j.secureDelete.fields) && consume.j.secureDelete.fields.length > 0, j(consume.j.secureDelete));
  ok('…3 Überschreib-Durchläufe', (consume.j.secureDelete || {}).passes === 3, j(consume.j.secureDelete));
  ok('…DB-Datei wurde neu geschrieben (fileWiped)', (consume.j.secureDelete || {}).fileWiped === true);

  const msgs = await call('GET', '/api/chats/' + chatId + '/messages?limit=50', null, BT);
  const stored = (msgs.j.messages || []).find((m) => m.id === mid) || {};
  ok('Nachricht hat kein Bild mehr', stored.image === null || stored.image === undefined, j(stored).slice(0, 160));
  ok('attachment.url ist leer', !stored.attachment || !stored.attachment.url, j(stored.attachment));
  ok('Text ist ersetzt', stored.text === '🔥 Einmal angesehen', stored.text);
  ok('secureDeleted ist gesetzt', stored.secureDeleted === true);

  await new Promise((r) => setTimeout(r, 250));
  const dbAfter = fs.readFileSync(DB, 'utf8');
  ok('🔒 MARKER IST AUS DER DB-DATEI VERSCHWUNDEN', !dbAfter.includes(markerB64));
  ok('…auch keine Teil-Fragmente im Klartext', !dbAfter.includes('EINMALMARKER-' + T));

  const again = await call('POST', '/api/chats/' + chatId + '/messages/' + mid + '/view-once', null, BT);
  ok('Zweites Öffnen → 409 consumed', again.s === 409 && again.j.code === 'consumed', `s=${again.s} ${j(again.j)}`);

  /* =====================================================================
     5) FILTER-BLOCK MIT GRUND + EINSPRUCH
     ===================================================================== */
  console.log('\n— 5) Filter mit Grund + Einspruch —');
  const badText = 'Gratis iPhone 16 gewinnen! Klick hier: bit.ly/abc123';
  const blocked = await call('POST', '/api/chats/' + chatId + '/messages', { text: badText }, AT);
  ok('Scam-Nachricht → 403 filtered', blocked.s === 403 && blocked.j.code === 'filtered', `s=${blocked.s} ${j(blocked.j)}`);
  ok('…mit lesbarem GRUND', typeof blocked.j.reason === 'string' && blocked.j.reason.length > 5, j(blocked.j.reason));
  ok('…mit Regel-Labels', Array.isArray(blocked.j.ruleLabels) && blocked.j.ruleLabels.length > 0, j(blocked.j.ruleLabels));
  ok('…mit Hinweis, was man tun kann', typeof blocked.j.hint === 'string' && blocked.j.hint.length > 5, j(blocked.j.hint));
  ok('…appealAllowed = true', blocked.j.appealAllowed === true);
  ok('…appealEndpoint gesetzt', blocked.j.appealEndpoint === '/api/security/filter-appeal', blocked.j.appealEndpoint);

  const anonAppeal = await call('POST', '/api/security/filter-appeal', { text: badText });
  ok('Einspruch ohne Login → 401', anonAppeal.s === 401, String(anonAppeal.s));

  const appeal = await call('POST', '/api/security/filter-appeal', {
    text: badText, rules: blocked.j.rules, score: blocked.j.score,
  }, AT);
  ok('Einspruch eingereicht', appeal.s === 200 && appeal.j.appeal && appeal.j.appeal.status === 'open', j(appeal.j));

  const ownerSees = await call('GET', '/api/admin/filter-appeals', null, OT);
  ok('Owner sieht den Einspruch', ownerSees.s === 200 && (ownerSees.j.appeals || []).some((a) => a.id === appeal.j.appeal.id), j(ownerSees.j).slice(0, 160));

  const userSees = await call('GET', '/api/admin/filter-appeals', null, BT);
  ok('Normaler Nutzer sieht Einsprüche NICHT (403 owner_only)', userSees.s === 403 && userSees.j.code === 'owner_only', `s=${userSees.s} ${j(userSees.j)}`);

  const off = await call('POST', '/api/privacy', { strictFilter: false }, AT);
  ok('Filter lässt sich (bewusst) abschalten', off.s === 200 && off.j.privacy.strictFilter === false);
  const nowAllowed = await call('POST', '/api/chats/' + chatId + '/messages', { text: badText }, AT);
  ok('…dann geht die Nachricht durch', nowAllowed.s === 200, `s=${nowAllowed.s} ${j(nowAllowed.j)}`);
  await call('POST', '/api/privacy', { strictFilter: true }, AT);

  /* =====================================================================
     6) NUR OWNER DARF SPERREN — auf JEDEM Weg
     ===================================================================== */
  console.log('\n— 6) Owner-only Bann —');
  const paths = [
    ['POST', '/api/admin/users/' + AID + '/action', { action: 'permaban', reason: 'Test' }],
    ['POST', '/api/admin/appeals/xyz/resolve', { decision: 'accept' }],
    ['POST', '/api/security/ban', { userId: AID }],
    ['POST', '/api/admin/ban', { userId: AID }],
    ['POST', '/api/admin/permaban', { userId: AID }],
  ];
  for (const [m, p, body] of paths) {
    const r = await call(m, p, body, BT);
    ok('Nicht-Owner gesperrt auf ' + p + ' (' + r.s + ')', r.s === 403, `s=${r.s} ${j(r.j)}`);
  }
  const ddi = await call('POST', '/api/security/ban', { userId: BID }, CT);
  ok('Defense-in-Depth greift auch mit fremdem Account-Token', ddi.s === 403 && ddi.j.blockedBy === 'defense-in-depth', `s=${ddi.s} ${j(ddi.j)}`);

  const ownToBan = await call('POST', '/api/admin/users/' + AID + '/action', { action: 'permaban', reason: 'Testlauf' }, OT);
  ok('Owner darf sperren', ownToBan.s === 200, `s=${ownToBan.s} ${j(ownToBan.j)}`);
  const bannedLogin = await call('POST', '/api/login', { login: 'v44a' + T, password: 'Test!1234' });
  ok('Gesperrter Account kann sich nicht einloggen', bannedLogin.s === 403 && bannedLogin.j.code === 'banned', `s=${bannedLogin.s} ${j(bannedLogin.j)}`);
  const appealBan = await call('POST', '/api/appeal', { login: 'v44a' + T, password: 'Test!1234', text: 'Es war ein Test, bitte entsperren.' });
  ok('Einspruch geht auch gesperrt', appealBan.s === 200, `s=${appealBan.s} ${j(appealBan.j)}`);
  const unban = await call('POST', '/api/admin/users/' + AID + '/action', { action: 'unban' }, OT);
  ok('Owner hebt Sperre auf', unban.s === 200, `s=${unban.s} ${j(unban.j)}`);
  const backLogin = await call('POST', '/api/login', { login: 'v44a' + T, password: 'Test!1234' });
  ok('…danach Login wieder möglich', backLogin.s === 200 && !!backLogin.j.token, `s=${backLogin.s}`);
  const AT2 = backLogin.j.token; // alter Token bleibt gültig, aber wir nutzen den neuen

  /* =====================================================================
     7) E2E-VORBEREITUNG (X3DH, nur Ciphertext)
     ===================================================================== */
  console.log('\n— 7) E2E —');
  const key = () => crypto.randomBytes(32).toString('base64');
  const bundleA = {
    identityKey: key(), signedPrekey: key(), prekeySignature: key(), registrationId: 4711,
    oneTimePrekeys: [{ id: 1, key: key() }, { id: 2, key: key() }],
  };
  const bundleB = { ...bundleA, oneTimePrekeys: [{ id: 1, key: key() }, { id: 2, key: key() }, { id: 3, key: key() }] };
  const upA = await call('POST', '/api/e2e/keys', bundleA, AT2);
  const upB = await call('POST', '/api/e2e/keys', bundleB, BT);
  ok('A lädt Key-Bundle', upA.s === 200 && upA.j.prekeys === 2, j(upA.j));
  ok('B lädt Key-Bundle', upB.s === 200 && upB.j.prekeys === 3, j(upB.j));

  const badBundle = await call('POST', '/api/e2e/keys', { identityKey: 'x' }, AT2);
  ok('Unvollständiges Bundle → 400', badBundle.s === 400 && badBundle.j.code === 'e2e_invalid', j(badBundle.j));

  const pk1 = await call('GET', '/api/e2e/keys/' + BID, null, AT2);
  const bd1 = pk1.j.bundle || {};
  ok('A holt Key-Bundle von B', pk1.s === 200 && !!bd1.identityKey && !!bd1.oneTimePrekey, j(pk1.j).slice(0, 160));
  const usedId = bd1.oneTimePrekey && bd1.oneTimePrekey.id;
  const pk2 = await call('GET', '/api/e2e/keys/' + BID, null, AT2);
  const used2 = (pk2.j.bundle || {}).oneTimePrekey && pk2.j.bundle.oneTimePrekey.id;
  ok('Einmal-Prekey wird verbraucht (nächster ist anders)', !!usedId && usedId !== used2, `${usedId} vs ${used2}`);
  ok('…prekeysLeft sinkt (3 → 1)', pk1.j.prekeysLeft === 2 && pk2.j.prekeysLeft === 1, `${pk1.j.prekeysLeft}/${pk2.j.prekeysLeft}`);

  const enable = await call('POST', '/api/chats/' + chatId + '/e2e/enable', {}, AT2);
  ok('E2E im Chat aktiviert', enable.s === 200 && enable.j.e2e.enabled === true, `s=${enable.s} ${j(enable.j)}`);

  const ctMarker = 'KLARTEXT-' + T + '-DARF-NICHT-IN-DB';
  const ciph = crypto.createCipheriv('aes-256-gcm', crypto.randomBytes(32), crypto.randomBytes(12));
  const ct = Buffer.concat([ciph.update(ctMarker, 'utf8'), ciph.final()]).toString('base64');

  const e2eMsg = await call('POST', '/api/chats/' + chatId + '/e2e/messages', {
    enc: { v: 1, iv: key().slice(0, 16), ct, tag: ciph.getAuthTag().toString('base64'), recipients: [{ userId: BID, key: key() }], senderKey: key() },
  }, AT2);
  ok('E2E-Nachricht gespeichert', e2eMsg.s === 200 && e2eMsg.j.message && e2eMsg.j.message.kind === 'e2e', `s=${e2eMsg.s} ${j(e2eMsg.j).slice(0, 160)}`);
  ok('…mit leerem Klartextfeld', e2eMsg.j.message && e2eMsg.j.message.text === '', JSON.stringify(e2eMsg.j.message && e2eMsg.j.message.text));
  ok('…mit Ciphertext', !!(e2eMsg.j.message && e2eMsg.j.message.enc && e2eMsg.j.message.enc.ct));

  await new Promise((r) => setTimeout(r, 250));
  const dbE2E = fs.readFileSync(DB, 'utf8');
  ok('🔐 Klartext steht NICHT in der DB', !dbE2E.includes(ctMarker));

  const e2eOffChat = await call('POST', '/api/chats', { type: 'group', name: 'Test ' + T, memberIds: [BID] }, AT2);
  const gid2 = e2eOffChat.j.chat ? e2eOffChat.j.chat.id : (e2eOffChat.j.summary ? e2eOffChat.j.summary.id : e2eOffChat.j.id);
  const e2eNo = await call('POST', '/api/chats/' + gid2 + '/e2e/messages', { enc: { iv: 'x', ct: 'y', tag: 'z' } }, AT2);
  ok('E2E-Nachricht ohne aktiviertes E2E → 400 e2e_off', e2eNo.s === 400 && e2eNo.j.code === 'e2e_off', `s=${e2eNo.s} ${j(e2eNo.j)}`);

  /* =====================================================================
     8) LOGIN-LOCK PRO ACCOUNT (nicht pro IP)
     ===================================================================== */
  console.log('\n— 8) Login-Lock pro Account —');
  let lastLock = null;
  for (let i = 0; i < 6; i++) {
    lastLock = await call('POST', '/api/login', { login: 'v44c' + T, password: 'falsch' + i });
  }
  ok('6 Fehlversuche → 429 login_locked', lastLock.s === 429 && lastLock.j.code === 'login_locked', `s=${lastLock.s} ${j(lastLock.j)}`);
  ok('…Scope ist account', lastLock.j.scope === 'account', j(lastLock.j));

  const otherUserSameIp = await call('POST', '/api/login', { login: 'v44b' + T, password: 'Test!1234' });
  ok('👥 Anderer Account aus demselben WLAN kommt weiter rein', otherUserSameIp.s === 200, `s=${otherUserSameIp.s} ${j(otherUserSameIp.j)}`);

  const lockedCorrect = await call('POST', '/api/login', { login: 'v44c' + T, password: 'Test!1234' });
  ok('Gesperrter Account bleibt gesperrt (auch mit richtigem Passwort)', lockedCorrect.s === 429, `s=${lockedCorrect.s}`);

  /* =====================================================================
     9) EXTRAS
     ===================================================================== */
  console.log('\n— 9) Extras —');
  const themes = await call('GET', '/api/themes');
  ok('20 Themes', themes.s === 200 && themes.j.count === 20, String(themes.j.count));

  const loc = await call('POST', '/api/chats/' + chatId + '/location/live', { lat: 51.58, lng: 7.31, minutes: 60 }, AT2);
  ok('Standort live gestartet', loc.s === 200 && loc.j.live && loc.j.live.expiresAt - loc.j.live.startedAt === 3600000, j(loc.j).slice(0, 160));
  const locTooLong = await call('POST', '/api/chats/' + chatId + '/location/live', { lat: 51.58, lng: 7.31, minutes: 999 }, AT2);
  ok('…max 1 Stunde (999 → 60)', locTooLong.j.live && locTooLong.j.live.minutes === 60, j(locTooLong.j).slice(0, 120));
  const locSeen = await call('GET', '/api/chats/' + chatId + '/location/live', null, BT);
  ok('B sieht den Live-Standort', locSeen.s === 200 && Array.isArray(locSeen.j.live) && locSeen.j.live.length === 1, j(locSeen.j).slice(0, 160));
  await call('POST', '/api/chats/' + chatId + '/location/stop', null, AT2);
  const locStopped = await call('GET', '/api/chats/' + chatId + '/location/live', null, BT);
  ok('…nach Stop ist er weg', Array.isArray(locStopped.j.live) && locStopped.j.live.length === 0, j(locStopped.j));

  const tx = await call('POST', '/api/chats/' + chatId + '/messages/' + mid + '/transcribe', null, BT);
  ok('Transkription antwortet ehrlich (needsProvider)', tx.s === 200 && tx.j.needsProvider === true, `s=${tx.s} ${j(tx.j)}`);

  /* Gruppen-Call: 10 Accounts in einen Chat, ab dem 9. → 409 call_full */
  const tokens = [AT2, BT];
  const extraIds = [AID, BID];
  /* Accounts 4–6 aus A-Gruppe */
  for (const x of fill) {
    if (x.j && x.j.token) { tokens.push(x.j.token); extraIds.push(x.j.user.id); }
  }
  /* Je Gruppe sind max. 5 Accounts erlaubt → 4 in B-Gruppe, 4 in C-Gruppe */
  const addAccount = async (n, baseToken) => {
    const r = await smsFlow(phone(n));
    const v = await call('POST', '/api/accounts/sms/verify', { phone: phone(n), code: r.j.devCode });
    return call('POST', '/api/accounts/add', {
      ticket: v.j.ticket, phone: phone(n), username: 'v44g' + n + T, displayName: 'G' + n + ' ' + T, password: 'Test!1234',
    }, baseToken);
  };
  for (let n = 8; n <= 11; n++) {
    const a = await addAccount(n, BT);
    if (a.j && a.j.token) { tokens.push(a.j.token); extraIds.push(a.j.user.id); }
  }
  for (let n = 12; n <= 15; n++) {
    const a = await addAccount(n, CT);
    if (a.j && a.j.token) { tokens.push(a.j.token); extraIds.push(a.j.user.id); }
  }
  ok('10 Accounts für den Gruppen-Call', tokens.length >= 10, 'n=' + tokens.length);

  const bigChat = await call('POST', '/api/chats', { type: 'group', name: 'Riesenrunde ' + T, memberIds: extraIds }, AT2);
  const bigId = bigChat.j.chat ? bigChat.j.chat.id : (bigChat.j.summary ? bigChat.j.summary.id : bigChat.j.id);
  ok('Gruppen-Chat mit 10 Mitgliedern', !!bigId, j(bigChat.j).slice(0, 120));

  let joined = 0, full = 0;
  for (const t of tokens.slice(0, 10)) {
    const r = await call('POST', '/api/calls/' + bigId + '/join', {}, t);
    if (r.s === 200) joined++;
    if (r.s === 409 && r.j.code === 'call_full') full++;
  }
  ok('Genau 8 Teilnehmer passen rein', joined === 8, 'joined=' + joined);
  ok('Teilnehmer 9 + 10 bekommen 409 call_full', full === 2, 'full=' + full);

  const privJoin = await call('POST', '/api/calls/' + chatId + '/join', {}, AT2);
  ok('1:1-Chat → 400 (kein Gruppen-Call)', privJoin.s === 400, `s=${privJoin.s} ${j(privJoin.j)}`);

  const inv = await call('POST', '/api/invite', {}, AT2);
  ok('Einladung erzeugt', inv.s === 200 && /^[a-f0-9]{8}$/.test(inv.j.code || ''), j(inv.j));
  const invOpen = await call('GET', '/api/invite/' + inv.j.code);
  ok('Einladung öffentlich prüfbar', invOpen.s === 200 && !!invOpen.j.byName, j(invOpen.j));

  const phoneHash = (p) => crypto.createHash('sha256').update('lovechat·phone·' + String(p).replace(/[^\d+]/g, '')).digest('hex');
  const imp = await call('POST', '/api/contacts/import', { hashes: [phoneHash(phone(2)), 'a'.repeat(64)] }, AT2);
  ok('Kontakt-Import findet B per Hash', imp.s === 200 && imp.j.matches.some((m) => m.id === BID), j(imp.j));
  ok('…und gibt keine Klartext-Nummern zurück', !JSON.stringify(imp.j).includes(phone(2)));

  const exp = await call('POST', '/api/export/encrypted', { password: 'Backup!2026' }, AT2);
  ok('Verschlüsseltes Backup erzeugt', exp.s === 200 && exp.j.format === 'maxichat-backup-v1' && !!exp.j.data, j(exp.j).slice(0, 160));
  ok('…mit AES-256-GCM + scrypt', exp.j.cipher === 'AES-256-GCM' && /scrypt/.test(exp.j.kdf || ''));
  const dec = await call('POST', '/api/export/decrypt', { password: 'Backup!2026', salt: exp.j.salt, iv: exp.j.iv, tag: exp.j.tag, data: exp.j.data }, AT2);
  ok('Backup mit richtigem Passwort entschlüsselbar', dec.s === 200 && dec.j.backup && dec.j.backup.version === 4, j(dec.j).slice(0, 160));
  const decBad = await call('POST', '/api/export/decrypt', { password: 'falsch123', salt: exp.j.salt, iv: exp.j.iv, tag: exp.j.tag, data: exp.j.data }, AT2);
  ok('Falsches Passwort → 400 backup_bad_password', decBad.s === 400 && decBad.j.code === 'backup_bad_password', `s=${decBad.s} ${j(decBad.j)}`);

  const sp = await call('POST', '/api/chats/' + chatId + '/screenshot-protect', { enabled: true }, AT2);
  ok('Screenshot-Schutz pro Chat setzbar', sp.s === 200 && sp.j.enabled === true, j(sp.j));
  const ss = await call('POST', '/api/security/screenshot', { chatId }, BT);
  ok('Screenshot-Meldung wird angenommen', ss.s === 200, `s=${ss.s} ${j(ss.j)}`);

  /* ================= ERGEBNIS ================= */
  console.log('\n' + '='.repeat(56));
  console.log(`${pass} grün · ${fail} rot`);
  if (fail) {
    console.log('\nRot:');
    for (const f of fails) console.log('  ❌ ' + f);
  }
  console.log('\nHinweis: Server-Tests ≠ Gerätetests. FLAG_SECURE/Blur auf echter Hardware',
    'kann hier nicht geprüft werden — das bleibt ehrlich offen.');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('💥 Testabbruch:', e);
  process.exit(2);
});
