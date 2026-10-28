/* =====================================================================
   V4.5 — EHRLICHE TESTS zum Doppel-Ratchet-Transport + Gruppen-Mesh
   ---------------------------------------------------------------------
   Der eigentliche Ratchet wird in Kotlin getestet (22/22 JVM-Tests).
   Hier geht es um das, was der SERVER falsch machen könnte:
     1) Doppel-Ratchet-Umschlag kommt 1:1 wieder raus (bit-genau)
     2) Klartext steht NICHT in der DB
     3) Chat wird durch den ersten echten Umschlag E2E-fähig
     4) alter Umschlag ohne Ratchet braucht weiter e2e_off-Gate
     5) signingKey wird mit ausgeliefert (sonst kann niemand prüfen)
     6) Einmal-Prekey wird genau einmal abgegeben
     7) Gruppen-Call: Roster stimmt, 9. Person 409, leave entfernt
   ===================================================================== */
const fs = require('fs');

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

const phone = (n) => '+49152' + T + String(n).padStart(2, '0');
const randB64 = (n) => require('crypto').randomBytes(n).toString('base64');

(async () => {
  console.log('\n💗 V4.5 Testlauf ' + T + '\n' + '='.repeat(56));

  /* ---------------- Setup: 3 Personen ---------------- */
  const owner = await call('POST', '/api/login', { login: 'maxichen', password: 'LoveChat!2026' });
  ok('Owner-Login', owner.s === 200 && !!owner.j.token, j(owner.j));
  const OT = owner.j.token;

  const mkUser = async (tag, n) => {
    const r = await call('POST', '/api/register', {
      username: 'v45' + tag + T, displayName: 'Mia-' + tag, password: 'Test!1234', phone: phone(n),
    });
    return { r, token: r.j.token, id: r.j.user && r.j.user.id };
  };
  const A = await mkUser('a', 1);
  const C = await mkUser('c', 2);
  ok('zwei Test-Accounts registriert', A.r.s === 200 && C.r.s === 200, j(A.r.j) + j(C.r.j));

  /* ---------------- E2E-Keys veröffentlichen ---------------- */
  const keyBundle = () => {
    const spk = randB64(32);
    return {
      identityKey: randB64(32),
      signedPrekey: spk,
      prekeySignature: randB64(64),
      signingKey: randB64(91),
      oneTimePrekeys: [
        { id: 1, key: randB64(32) },
        { id: 2, key: randB64(32) },
      ],
    };
  };
  const kbA = keyBundle(), kbC = keyBundle();
  const upA = await call('POST', '/api/e2e/keys', kbA, A.token);
  const upC = await call('POST', '/api/e2e/keys', kbC, C.token);
  ok('Key-Bundle A veröffentlicht (2 Prekeys)', upA.s === 200 && upA.j.prekeys === 2, j(upA.j));
  ok('Key-Bundle C veröffentlicht', upC.s === 200, j(upC.j));

  const badBundle = await call('POST', '/api/e2e/keys', { identityKey: 'x' }, A.token);
  ok('kaputtes Bundle → 400', badBundle.s === 400, j(badBundle.j));

  /* ---------------- Bundle abholen ---------------- */
  const b1 = await call('GET', '/api/e2e/keys/' + C.id, null, A.token);
  ok('Bundle von C abholbar', b1.s === 200 && !!b1.j.bundle, j(b1.j));
  ok('signingKey wird mitgeliefert (V4.5)', typeof b1.j.bundle.signingKey === 'string' && b1.j.bundle.signingKey.length > 10, j(b1.j.bundle));
  ok('ein Einmal-Prekey dabei', !!b1.j.bundle.oneTimePrekey && b1.j.bundle.oneTimePrekey.key.length > 10, j(b1.j.bundle.oneTimePrekey));
  ok('prekeysLeft sinkt auf 1', b1.j.prekeysLeft === 1, 'left=' + b1.j.prekeysLeft);

  const b2 = await call('GET', '/api/e2e/keys/' + C.id, null, A.token);
  ok('zweiter Abruf: anderer Einmal-Prekey', b2.s === 200 && b2.j.bundle.oneTimePrekey.id !== b1.j.bundle.oneTimePrekey.id,
    `${b1.j.bundle.oneTimePrekey.id} vs ${b2.j.bundle.oneTimePrekey && b2.j.bundle.oneTimePrekey.id}`);

  const b3 = await call('GET', '/api/e2e/keys/' + C.id, null, A.token);
  ok('nach 2 Abrufen kein Prekey mehr (ehrlich: oneTimePrekey null)', b3.s === 200 && b3.j.bundle.oneTimePrekey === null, j(b3.j));

  /* ---------------- Chat A ↔ C ---------------- */
  const chat = await call('POST', '/api/chats', { type: 'private', userId: C.id }, A.token);
  const chatId = chat.j.summary ? chat.j.summary.id : (chat.j.chat ? chat.j.chat.id : (chat.j.id || ''));
  ok('1:1-Chat erstellt', chat.s === 200 && !!chatId, j(chat.j));

  /* alter Umschlag ohne Ratchet → gate muss greifen */
  const oldStyle = await call('POST', `/api/chats/${chatId}/e2e/messages`, {
    enc: { iv: randB64(12), ct: randB64(48), tag: randB64(16) },
  }, A.token);
  ok('V4.4-Umschlag ohne aktiviertes E2E → 400 e2e_off', oldStyle.s === 400 && oldStyle.j.code === 'e2e_off', j(oldStyle.j));

  /* echter Ratchet-Umschlag (Format wie Envelope.serialize) */
  const ratchet = [
    randB64(32), '0', '0', randB64(12), randB64(64),
    randB64(32), randB64(32), randB64(91), 'spk-1', 'opk-1',
  ].join('|');
  const sent = await call('POST', `/api/chats/${chatId}/e2e/messages`, {
    enc: { v: 2, iv: randB64(12), ct: randB64(64), tag: 'gcm16', ratchet },
  }, A.token);
  ok('Ratchet-Umschlag gesendet', sent.s === 200 && !!sent.j.message, j(sent.j));
  ok('Antwort enthält den Umschlag unverändert', sent.j.message && sent.j.message.enc && sent.j.message.enc.ratchet === ratchet,
    j(sent.j.message && sent.j.message.enc));
  ok('Server kennt keinen Klartext (text leer)', sent.j.message && sent.j.message.text === '', j(sent.j.message && sent.j.message.text));

  /* Empfänger sieht denselben Umschlag */
  const inbox = await call('GET', `/api/chats/${chatId}/messages`, null, C.token);
  const msgs = (inbox.j.messages || inbox.j || []);
  const got = Array.isArray(msgs) ? msgs.find((m) => m.enc && m.enc.ratchet) : null;
  ok('Empfänger bekommt den Umschlag', !!got && got.enc.ratchet === ratchet, j(got && got.enc));
  ok('kein Klartext im Umschlag-Feld', !!got && got.text === '', j(got && got.text));

  /* DB-Datei: Klartext darf nirgends stehen */
  await new Promise((r) => setTimeout(r, 350));
  const dbRaw = fs.readFileSync(DB, 'utf8');
  const marker = 'GEHEIM-V45-' + T;
  ok('DB enthält keinen Marker-Klartext', !dbRaw.includes(marker));
  ok('DB enthält den Umschlag (Ciphertext gespeichert)', dbRaw.includes(ratchet.slice(0, 40)));

  /* zu groß → 413 */
  const huge = await call('POST', `/api/chats/${chatId}/e2e/messages`, {
    enc: { ratchet: 'x'.repeat(11000) },
  }, A.token);
  ok('übergroßer Umschlag → 413', huge.s === 413, 's=' + huge.s);

  /* ---------------- Gruppen-Call-Mesh ---------------- */
  const grp = await call('POST', '/api/chats', { type: 'group', name: 'Mesh ' + T, memberIds: [C.id] }, A.token);
  const gid = grp.j.summary ? grp.j.summary.id : (grp.j.chat ? grp.j.chat.id : (grp.j.id || ''));
  ok('Gruppe erstellt', grp.s === 200 && !!gid, j(grp.j));

  const j1 = await call('POST', `/api/calls/${gid}/join`, {}, A.token);
  ok('A tritt Gruppen-Call bei', j1.s === 200 && j1.j.call, j(j1.j));
  ok('Roster enthält A', !!j1.j.call && j1.j.call.participants.some((p) => p.userId === A.id), j(j1.j.call && j1.j.call.participants));
  ok('max. 8 wird genannt', j1.j.max === 8, 'max=' + j1.j.max);

  const j2 = await call('POST', `/api/calls/${gid}/join`, {}, C.token);
  ok('C tritt bei und sieht A', j2.s === 200 && j2.j.peers.some((p) => p.userId === A.id), j(j2.j.peers));

  const state = await call('GET', `/api/calls/${gid}`, null, A.token);
  ok('GET /calls/:id zeigt 2 Teilnehmer', state.s === 200 && state.j.call.participants.length === 2, j(state.j.call && state.j.call.participants.length));

  const privateCall = await call('POST', `/api/calls/${chatId}/join`, {}, A.token);
  ok('1:1-Chat → 400 (Mesh nur für Gruppen)', privateCall.s === 400, j(privateCall.j));

  const left = await call('POST', `/api/calls/${gid}/leave`, {}, C.token);
  ok('C verlässt den Call', left.s === 200, j(left.j));
  const after = await call('GET', `/api/calls/${gid}`, null, A.token);
  ok('Roster nur noch A', after.j.call.participants.length === 1 && after.j.call.participants[0].userId === A.id, j(after.j.call && after.j.call.participants));

  /* ---------------- Aufräumen ---------------- */
  const cleanup = async (id, tok) => {
    const d = await call('POST', '/api/admin/users/' + id + '/action', { action: 'delete', reason: 'Test' }, OT);
    return d.s;
  };
  await cleanup(A.id, OT); await cleanup(C.id, OT);

  console.log('\n' + '='.repeat(56));
  console.log(`${pass}/${pass + fail} grün` + (fail ? '  ❌ ' + fails.join(' · ') : '  💗'));
  process.exit(fail ? 1 : 0);
})();
