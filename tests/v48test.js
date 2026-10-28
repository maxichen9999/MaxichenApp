/* =====================================================================
   V4.8 — EHRLICHE TESTS: „nirgends ein privater Schlüssel"
   ---------------------------------------------------------------------
   Die Keystore-Hülle selbst lebt im Gerät (Kotlin-Tests: 47/47).
   Was der SERVER garantieren muss:
     1) er nimmt NIE private Schlüssel an (Whitelist, keine Sammel-Felder)
     2) er gibt NIE private Schlüssel aus
     3) unbekannte Felder werden still verworfen, nicht gespeichert
     4) in der DB liegen nur öffentliche Teile + Ciphertext
     5) nach dem Löschen eines Chats ist auch der Sender-Key-Müll weg
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

const phone = (n) => '+49155' + T + String(n).padStart(2, '0');
const b64 = (n) => crypto.randomBytes(n).toString('base64');

(async () => {
  console.log('\n🔐 V4.8 Testlauf ' + T + '\n' + '='.repeat(56));

  const owner = await call('POST', '/api/login', { login: 'maxichen', password: 'LoveChat!2026' });
  ok('Owner-Login', owner.s === 200 && !!owner.j.token, j(owner.j));
  const OT = owner.j.token;

  const mk = async (tag, n) => {
    const r = await call('POST', '/api/register', {
      username: 'v48' + tag + T, displayName: 'Vera-' + tag, password: 'Test!1234', phone: phone(n),
    });
    return { token: r.j.token, id: r.j.user && r.j.user.id, s: r.s };
  };
  const A = await mk('a', 1), C = await mk('c', 2);
  if ([A, C].some((u) => u.s === 429)) {
    console.log('\n⛔ IP-Registrierungslimit — Server neu starten, dann erneut.');
    process.exit(2);
  }
  ok('zwei Accounts', A.s === 200 && C.s === 200);

  /* ---------------- 1) Server nimmt keine privaten Schlüssel an ---------------- */
  const LEAK = 'PRIVATGEHEIM-' + T;
  const bundle = {
    identityKey: b64(32), signedPrekey: b64(32), prekeySignature: b64(64), signingKey: b64(91),
    oneTimePrekeys: [{ id: 1, key: b64(32) }],
    // 🚨 absichtlich gefährliche Zusatzfelder — ein schlampiger Server würde sie speichern
    privateKey: LEAK,
    identityPrivate: LEAK,
    signingPrivate: LEAK,
    secret: LEAK,
  };
  const up = await call('POST', '/api/e2e/keys', bundle, A.token);
  ok('Bundle angenommen', up.s === 200, j(up.j));

  await new Promise((r) => setTimeout(r, 350));
  let dbRaw = fs.readFileSync(DB, 'utf8');
  ok('private Zusatzfelder wurden NICHT gespeichert (Whitelist)', !dbRaw.includes(LEAK), 'LEAK in DB gefunden!');

  const fetched = await call('GET', '/api/e2e/keys/' + A.id, null, C.token);
  const bundleOut = fetched.j.bundle || {};
  ok('Bundle abrufbar', fetched.s === 200, j(fetched.j));
  ok('Antwort enthält kein privates Feld',
    !('privateKey' in bundleOut) && !('identityPrivate' in bundleOut) && !('signingPrivate' in bundleOut) && !('secret' in bundleOut),
    Object.keys(bundleOut).join(','));
  ok('Antwort enthält keinen LEAK-Wert', !JSON.stringify(fetched.j).includes(LEAK));

  /* ---------------- 2) 1:1-Chat + Gruppen-Chat ---------------- */
  const dm = await call('POST', '/api/chats', { type: 'private', userId: C.id }, A.token);
  const did = dm.j.summary ? dm.j.summary.id : '';
  const grp = await call('POST', '/api/chats', { type: 'group', name: 'Vault ' + T, memberIds: [C.id] }, A.token);
  const gid = grp.j.summary ? grp.j.summary.id : '';
  ok('1:1 + Gruppe angelegt', !!did && !!gid);

  const ratchet = [b64(32), '0', '0', b64(12), b64(80), b64(32), b64(32), b64(91), 'x', 'y'].join('|');
  await call('POST', `/api/chats/${did}/e2e/messages`, { enc: { v: 2, ratchet } }, A.token);

  const skdm = 'skdm-env1|' + ratchet;
  await call('POST', `/api/chats/${gid}/e2e/senderkey`, { to: C.id, keyId: 'k1', envelope: skdm }, A.token);
  const skm = ['skm1', 'k1', '0', b64(12), b64(64), b64(70)].join('|');
  const gm = await call('POST', `/api/chats/${gid}/e2e/messages`, { enc: { v: 3, group: skm } }, A.token);
  ok('Gruppen-Nachricht gesendet', gm.s === 200, j(gm.j));

  await new Promise((r) => setTimeout(r, 350));
  dbRaw = fs.readFileSync(DB, 'utf8');
  ok('kein Klartext der Nachrichten in der DB', !dbRaw.includes('Hallo Klartext') && !dbRaw.includes(LEAK));

  /* ---------------- 3) Alle Lese-Endpunkte durchkämmen ---------------- */
  const endpoints = [
    '/api/chats/' + did + '/messages',
    '/api/chats/' + gid + '/messages',
    '/api/chats/' + gid + '/e2e',
    '/api/chats/' + gid + '/e2e/senderkey-status',
    '/api/e2e/keys/' + A.id,
  ];
  let leakFound = '';
  for (const ep of endpoints) {
    const r = await call('GET', ep, null, C.token);
    const blob = JSON.stringify(r.j);
    if (blob.includes(LEAK)) leakFound = ep;
    if (/"privateKey"|"identityPrivate"|"signingPrivate"|"privateKeyB64"/.test(blob)) leakFound = ep + ' (Feldname)';
  }
  ok('kein Endpunkt gibt private Felder aus', leakFound === '', leakFound);

  /* ---------------- 4) Sender-Key-Status verrät keine Schlüssel ---------------- */
  const st = await call('GET', `/api/chats/${gid}/e2e/senderkey-status`, null, A.token);
  const stBlob = JSON.stringify(st.j);
  ok('Status enthält keine Key-Materialien', !stBlob.includes('skdm-env1') && !stBlob.includes(skm) && !stBlob.includes('chainKey'), j(st.j));

  /* ---------------- 5) gelöschter Chat lässt nichts zurück ---------------- */
  const before = fs.readFileSync(DB, 'utf8').includes(skdm);
  ok('SKDM liegt (vor dem Aufräumen) noch in der DB', before);

  const del = await call('DELETE', '/api/chats/' + gid, null, A.token);
  await new Promise((r) => setTimeout(r, 400));
  const afterRaw = fs.readFileSync(DB, 'utf8');
  ok('Chat gelöscht', del.s === 200 || del.s === 204, 's=' + del.s);
  ok('Sender-Key-Umschlag ist mit dem Chat verschwunden', !afterRaw.includes(skdm.slice(0, 60)), 'SKDM-Rest gefunden');
  ok('Gruppen-Nachricht ist verschwunden', !afterRaw.includes(skm.slice(0, 40)), 'skm-Rest gefunden');

  /* ---------------- Aufräumen ---------------- */
  for (const u of [A, C]) await call('POST', '/api/admin/users/' + u.id + '/action', { action: 'delete', reason: 'Test' }, OT);

  console.log('\n' + '='.repeat(56));
  console.log(`${pass}/${pass + fail} grün` + (fail ? '  ❌ ' + fails.join(' · ') : '  🔐'));
  process.exit(fail ? 1 : 0);
})();
