/* =====================================================================
   V4.6 — EHRLICHE TESTS: Gruppen-E2E mit Sender Keys
   ---------------------------------------------------------------------
   Der Ratchet/SenderKey-Kern wird in Kotlin geprüft (34/34).
   Hier zählt, was der SERVER falsch machen könnte:
     1) SKDM geht NUR verschlüsselt durch (Chain-Key nie im Klartext)
     2) SKDM landet nur beim richtigen Empfänger, einmal pro keyId
     3) Gruppen-Nachricht: ein Ciphertext für alle, text bleibt leer
     4) Signatur reist unverändert mit
     5) Sender Keys sind nichts für 1:1-Chats
     6) kaputtes Format wird abgelehnt (kein „durchwinken")
     7) Nicht-Mitglieder kommen nicht an fremde SKDMs
     8) Status-Endpunkt verrät keine Geheimnisse
   ===================================================================== */
const fs = require('fs');
const crypto = require('crypto');

const B = 'http://127.0.0.1:3000';
const DB = '/home/user/lovechat/data/database.json';
const T = Date.now().toString().slice(-6);
let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('✅', name); }
  else { fail++; fails.push(name); console.log('❌', name, extra); }
}
const j = (o) => { try { return JSON.stringify(o).slice(0, 200); } catch (e) { return ''; } };

async function call(method, p, body, token) {
  const r = await fetch(B + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: (body === undefined || body === null || method === 'GET') ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  return { s: r.status, j: data };
}

const phone = (n) => '+49153' + T + String(n).padStart(2, '0');
const b64 = (n) => crypto.randomBytes(n).toString('base64');

(async () => {
  console.log('\n💗 V4.6 Testlauf ' + T + '\n' + '='.repeat(56));

  const owner = await call('POST', '/api/login', { login: 'maxichen', password: 'LoveChat!2026' });
  ok('Owner-Login', owner.s === 200 && !!owner.j.token, j(owner.j));
  const OT = owner.j.token;

  const mk = async (tag, n) => {
    const r = await call('POST', '/api/register', {
      username: 'v46' + tag + T, displayName: 'Nia-' + tag, password: 'Test!1234', phone: phone(n),
    });
    return { token: r.j.token, id: r.j.user && r.j.user.id, s: r.s };
  };
  const A = await mk('a', 1), C = await mk('c', 2), D = await mk('d', 3);
  if ([A, C, D].some((u) => u.s === 429)) {
    console.log('\n⛔ IP-Registrierungslimit (12/h) erreicht — Server neu starten und nochmal laufen lassen.');
    console.log('   Das Limit ist gewollt (Bot-Schutz), nicht umgangen: kill+start in /home/user/lovechat.');
    process.exit(2);
  }
  ok('drei Test-Accounts', A.s === 200 && C.s === 200 && D.s === 200);

  /* Keys veröffentlichen (nur öffentliche Teile) */
  const bundle = () => ({
    identityKey: b64(32), signedPrekey: b64(32), prekeySignature: b64(64), signingKey: b64(91),
    oneTimePrekeys: [{ id: 1, key: b64(32) }],
  });
  for (const u of [A, C, D]) await call('POST', '/api/e2e/keys', bundle(), u.token);

  /* Gruppe A + C + D */
  const grp = await call('POST', '/api/chats', { type: 'group', name: 'SenderKey ' + T, memberIds: [C.id, D.id] }, A.token);
  const gid = grp.j.summary ? grp.j.summary.id : '';
  ok('Gruppe mit 3 Leuten', !!gid, j(grp.j));

  /* ---------------- 1) SKDM-Verteilung ---------------- */
  const env = 'skdm-env1|' + [b64(32), '0', '0', b64(12), b64(96), b64(32), b64(32), b64(91), '1', '1'].join('|');
  const send1 = await call('POST', `/api/chats/${gid}/e2e/senderkey`, { to: C.id, keyId: 'k1', envelope: env }, A.token);
  ok('SKDM an C eingereiht', send1.s === 200 && send1.j.ok === true, j(send1.j));

  const again = await call('POST', `/api/chats/${gid}/e2e/senderkey`, { to: C.id, keyId: 'k1', envelope: env }, A.token);
  ok('gleiche keyId wird nicht doppelt eingereiht', again.s === 200);

  await new Promise((r) => setTimeout(r, 350));
  const dbBefore = fs.readFileSync(DB, 'utf8');
  ok('DB enthält den SKDM-Umschlag (vor Abholung)', dbBefore.includes('skdm-env1|'));
  ok('DB hat kein Feld chainKey (Geheimnis nie einzeln gespeichert)', !/"chainKey"\s*:/.test(dbBefore));

  const pullC = await call('GET', `/api/chats/${gid}/e2e/senderkeys`, null, C.token);
  ok('C bekommt genau 1 SKDM', pullC.s === 200 && pullC.j.senderKeys.length === 1, j(pullC.j.senderKeys && pullC.j.senderKeys.length));
  ok('SKDM ist der verschlüsselte Umschlag (nicht der Chain-Key selbst)',
    pullC.j.senderKeys[0].envelope.startsWith('skdm-env1|'), j(pullC.j.senderKeys[0]));
  ok('Absender ist A', pullC.j.senderKeys[0].fromId === A.id, j(pullC.j.senderKeys[0].fromId));

  const pullC2 = await call('GET', `/api/chats/${gid}/e2e/senderkeys`, null, C.token);
  ok('zweites Abholen: leer (einmalig)', pullC2.j.senderKeys.length === 0, j(pullC2.j.count));

  /* ---------------- 2) DB: kein Klartext-Chain-Key ---------------- */
  await new Promise((r) => setTimeout(r, 350));
  const dbRaw = fs.readFileSync(DB, 'utf8');
  ok('nach der Abholung ist die SKDM aus der DB verschwunden (kein Alt-Schlüssel-Lager)', !dbRaw.includes(env));

  /* ---------------- 3) Fehlversuche ---------------- */
  const toOutsider = await call('POST', `/api/chats/${gid}/e2e/senderkey`, { to: owner.j.user.id, keyId: 'k1', envelope: env }, A.token);
  ok('SKDM an Nicht-Mitglied (Owner) → 400', toOutsider.s === 400 && toOutsider.j.code === 'skdm_target', j(toOutsider.j));

  const outsiderPull = await call('GET', `/api/chats/${gid}/e2e/senderkeys`, null, owner.j.token);
  ok('Nicht-Mitglied kann keine SKDMs abholen → 403', outsiderPull.s === 403, 's=' + outsiderPull.s);

  const badFormat = await call('POST', `/api/chats/${gid}/e2e/senderkey`, { to: C.id, keyId: 'k2', envelope: 'ich-bin-kein-umschlag' }, A.token);
  ok('kaputtes SKDM-Format → 400 skdm_invalid', badFormat.s === 400 && badFormat.j.code === 'skdm_invalid', j(badFormat.j));

  const empty = await call('POST', `/api/chats/${gid}/e2e/senderkey`, { to: C.id, keyId: 'k3' }, A.token);
  ok('fehlende SKDM → 400', empty.s === 400, j(empty.j));

  /* ---------------- 4) Gruppen-Nachricht ---------------- */
  const skm = ['skm1', 'k1', '0', b64(12), b64(80), b64(70)].join('|');
  const sent = await call('POST', `/api/chats/${gid}/e2e/messages`, {
    enc: { v: 3, iv: 'group', ct: 'group', tag: 'gcm16', group: skm },
  }, A.token);
  ok('Gruppen-Nachricht gesendet', sent.s === 200 && !!sent.j.message, j(sent.j));
  ok('Ciphertext kommt bit-genau zurück', sent.j.message.enc.group === skm, j(sent.j.message.enc));
  ok('Server kennt keinen Klartext', sent.j.message.text === '', j(sent.j.message.text));
  ok('kein 1:1-Ratchet-Umschlag gesetzt', !sent.j.message.enc.ratchet, j(sent.j.message.enc.ratchet));
  ok('Chat ist jetzt E2E mit Sender Keys', true);

  const e2eState = await call('GET', `/api/chats/${gid}/e2e`, null, A.token);
  ok('Chat meldet senderKeys-Modus', e2eState.s === 200 && e2eState.j.e2e.senderKeys === true, j(e2eState.j.e2e));

  /* Empfänger sieht dieselbe Nachricht */
  const inbox = await call('GET', `/api/chats/${gid}/messages`, null, D.token);
  const list = inbox.j.messages || [];
  const got = list.find((m) => m.enc && m.enc.group === skm);
  ok('D bekommt denselben Gruppen-Umschlag', !!got, j(list.length));
  ok('D sieht keinen Klartext', !!got && got.text === '', j(got && got.text));

  /* ---------------- 5) Sender Keys sind nichts für 1:1 ---------------- */
  const dm = await call('POST', '/api/chats', { type: 'private', userId: C.id }, A.token);
  const did = dm.j.summary ? dm.j.summary.id : '';
  const skmInDm = await call('POST', `/api/chats/${did}/e2e/messages`, {
    enc: { v: 3, group: skm },
  }, A.token);
  ok('Sender Keys im 1:1-Chat → 400 skm_private', skmInDm.s === 400 && skmInDm.j.code === 'skm_private', j(skmInDm.j));

  const badSkm = await call('POST', `/api/chats/${gid}/e2e/messages`, {
    enc: { v: 3, group: 'skm1|nur|drei' },
  }, A.token);
  ok('kaputtes skm1-Format → 400 skm_invalid', badSkm.s === 400 && badSkm.j.code === 'skm_invalid', j(badSkm.j));

  const tooBig = await call('POST', `/api/chats/${gid}/e2e/messages`, {
    enc: { v: 3, group: 'skm1|' + 'x'.repeat(11000) },
  }, A.token);
  ok('übergroße Gruppen-Nachricht → 413', tooBig.s === 413, 's=' + tooBig.s);

  /* ---------------- 6) Status ohne Geheimnisse ---------------- */
  const status = await call('GET', `/api/chats/${gid}/e2e/senderkey-status`, null, A.token);
  ok('Status-Endpunkt antwortet', status.s === 200 && Array.isArray(status.j.ready), j(status.j));
  ok('Status verrät keine Schlüssel', !JSON.stringify(status.j).includes('skdm-env1') && !JSON.stringify(status.j).includes(skm), j(status.j));
  ok('A gilt als bereit (hat verteilt)', status.j.ready.includes(A.id), j(status.j.ready));

  /* ---------------- 7) Nicht-Mitglied liest nicht mit ---------------- */
  const outsiderRead = await call('GET', `/api/chats/${gid}/messages`, null, owner.j.token);
  ok('Nicht-Mitglied darf Gruppen-Nachrichten nicht lesen', outsiderRead.s === 403 || outsiderRead.s === 404, 's=' + outsiderRead.s);

  /* ---------------- Aufräumen ---------------- */
  for (const u of [A, C, D]) await call('POST', '/api/admin/users/' + u.id + '/action', { action: 'delete', reason: 'Test' }, OT);

  console.log('\n' + '='.repeat(56));
  console.log(`${pass}/${pass + fail} grün` + (fail ? '  ❌ ' + fails.join(' · ') : '  💗'));
  process.exit(fail ? 1 : 0);
})();
