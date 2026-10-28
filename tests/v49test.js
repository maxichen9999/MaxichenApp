/* =====================================================================
   V4.9 — PQXDH / ML-KEM-768: EHRLICHE TESTS
   ---------------------------------------------------------------------
   Die Kryptografie selbst beweisen die Kotlin-Tests (21/21 gegen die
   unabhängige kyber-py-Referenz). Was der SERVER hier beweisen muss:

     1) er nimmt PQ-Prekeys nur in EXAKT 1184 Byte an (FIPS 203)
     2) er lehnt einen PRIVATEN Schlüssel als "pqPrekey" ab (2400 B = dk)
     3) er lässt keinen unsignierten PQ-Prekey durch
     4) was rausgeht, ist Byte-für-Byte das, was reinkam
     5) in der DB liegt nur der öffentliche Teil
     6) der PQ-Ciphertext in der Nachricht wird nicht angefasst
     7) die Gegenstelle ohne PQ-Key meldet ehrlich pq:false
        (kein stilles "ist ja alles sicher")
     8) der alte Weg (X3DH/Sender Keys) funktioniert weiter
   ===================================================================== */
const fs = require('fs');
const crypto = require('crypto');

const B = 'http://127.0.0.1:3000';
const DB = '/home/user/lovechat/data/database.json';
const VEC = '/home/user/lovechat-v2/tests-vectors/mlkem768.json';
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
    body: (body === undefined || body === null || method === 'GET') ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  return { s: r.status, j: data };
}

const phone = (n) => '+49155' + T + String(n).padStart(2, '0');
const b64 = (n) => crypto.randomBytes(n).toString('base64');

(async () => {
  console.log('\n🌌 V4.9 PQXDH-Testlauf ' + T + '\n' + '='.repeat(60));

  // ---------- echte FIPS-203-Vektoren laden (kein Fake-Material) ----------
  let ek, vectorsOk = false;
  try {
    const v = JSON.parse(fs.readFileSync(VEC, 'utf8'));
    ek = Buffer.from(v[0].ek, 'hex');            // 1184 Byte, echtes ML-KEM-768
    vectorsOk = ek.length === 1184;
  } catch (e) { ek = Buffer.alloc(1184, 7); }
  ok('Referenz-Vektoren im Repo (tests-vectors/mlkem768.json)', vectorsOk, 'ek=' + (ek ? ek.length : 0));

  const owner = await call('POST', '/api/login', { login: 'maxichen', password: 'LoveChat!2026' });
  ok('Owner-Login', owner.s === 200 && !!owner.j.token, j(owner.j));
  const OT = owner.j.token;

  const mk = async (tag, n) => {
    const r = await call('POST', '/api/register', {
      username: 'v49' + tag + T, displayName: 'Nova-' + tag, password: 'Test!1234', phone: phone(n),
    });
    return { token: r.j.token, id: r.j.user && r.j.user.id, s: r.s };
  };
  const A = await mk('a', 1), C = await mk('c', 2);
  if ([A, C].some((u) => u.s === 429)) {
    console.log('\n⛔ IP-Registrierungslimit — Server neu starten, dann erneut.');
    process.exit(2);
  }
  ok('zwei Accounts registriert', A.s === 200 && C.s === 200);

  // Signaturschlüssel (nur Struktur — Server prüft nicht, der Client tut es)
  const signing = Crypto_createKeyPairLike();
  const pqSig = crypto.randomBytes(70).toString('base64');
  const spk = crypto.randomBytes(32).toString('base64');

  /* ---------- 1) unvollständiger / falscher PQ-Prekey ---------- */
  const shortPq = ek.subarray(0, 1183).toString('base64');
  const r1 = await call('POST', '/api/e2e/keys', {
    identityKey: b64(32), signedPrekey: spk, prekeySignature: b64(70), signingKey: signing,
    oneTimePrekeys: [], pqPrekey: shortPq, pqSignature: pqSig,
  }, A.token);
  ok('PQ-Prekey mit 1183 Byte wird ABGELEHNT (FIPS 203 = exakt 1184)',
    r1.s === 400 && r1.j.code === 'pq_invalid' && r1.j.want === 1184, j(r1.j));

  /* ---------- 2) der PRIVATE Schlüssel (dk, 2400 B) wird abgelehnt ----------
     Der gefährlichste Fehler wäre, dk versehentlich als Prekey hochzuladen. */
  const dkLike = Buffer.alloc(2400, 3).toString('base64');
  const r2 = await call('POST', '/api/e2e/keys', {
    identityKey: b64(32), signedPrekey: spk, prekeySignature: b64(70), signingKey: signing,
    oneTimePrekeys: [], pqPrekey: dkLike, pqSignature: pqSig,
  }, A.token);
  ok('privater Schlüssel (2400 B) als pqPrekey wird ABGELEHNT',
    r2.s === 400 && r2.j.code === 'pq_invalid' && r2.j.got === 2400, j(r2.j));

  /* ---------- 3) unsignierter PQ-Prekey ---------- */
  const r3 = await call('POST', '/api/e2e/keys', {
    identityKey: b64(32), signedPrekey: spk, prekeySignature: b64(70), signingKey: signing,
    oneTimePrekeys: [], pqPrekey: ek.toString('base64'),
  }, A.token);
  ok('PQ-Prekey ohne Signatur wird ABGELEHNT', r3.s === 400 && r3.j.code === 'pq_unsigned', j(r3.j));

  /* ---------- 4) gültiger PQ-Prekey ---------- */
  const pqB64 = ek.toString('base64');
  const r4 = await call('POST', '/api/e2e/keys', {
    identityKey: b64(32), signedPrekey: spk, prekeySignature: b64(70), signingKey: signing,
    oneTimePrekeys: [{ id: 1, key: b64(32) }, { id: 2, key: b64(32) }],
    pqPrekey: pqB64, pqSignature: pqSig,
    // 💥 Angriff: Client schickt "privat" mit — der Server darf das NICHT behalten
    pqSecret: b64(2400), dk: b64(2400), secretKey: b64(2400),
  }, A.token);
  ok('gültiger 1184-Byte-PQ-Prekey wird angenommen', r4.s === 200 && r4.j.pq === true, j(r4.j));

  /* ---------- 5) Bundle: Byte-für-Byte, ohne private Teile ---------- */
  const r5 = await call('GET', '/api/e2e/keys/' + A.id, null, C.token);
  const bundle = r5.j.bundle || {};
  const back = bundle.pqPrekey ? Buffer.from(bundle.pqPrekey, 'base64') : null;
  ok('Bundle liefert den PQ-Prekey unverändert zurück',
    r5.s === 200 && back && back.equals(ek), 'len=' + (back ? back.length : 0));
  ok('Bundle meldet pq:true', r5.j.pq === true);
  const bundleStr = JSON.stringify(bundle);
  ok('kein privater Schlüssel im Bundle (2400-B-Werte / secret-Felder)',
    !("pqSecret" in bundle) && !("dk" in bundle) && !("secretKey" in bundle) &&
    !Object.values(bundle).some((v) => typeof v === 'string' && Buffer.from(v, 'base64').length === 2400),
    bundleStr.slice(0, 160));

  /* ---------- 6) Gegenstelle ohne PQ-Key: ehrliches false ---------- */
  const r6 = await call('POST', '/api/e2e/keys', {
    identityKey: b64(32), signedPrekey: spk, prekeySignature: b64(70), signingKey: signing,
    oneTimePrekeys: [{ id: 1, key: b64(32) }],
  }, C.token);   // C veröffentlicht ABSICHTLICH keinen PQ-Key (alte App)
  ok('alte App ohne PQ-Key kann sich weiter registrieren', r6.s === 200 && r6.j.pq === false);

  const r6b = await call('GET', '/api/e2e/keys/' + C.id, null, A.token);
  ok('Bundle ohne PQ-Key sagt ehrlich pq:false (kein stilles Versprechen)',
    r6b.s === 200 && r6b.j.pq === false && r6b.j.bundle.pqPrekey === null, j(r6b.j).slice(0, 200));

  /* ---------- 7) PQ-Bereitschaft ---------- */
  const r7 = await call('GET', '/api/e2e/pq-readiness', null, A.token);
  ok('pq-readiness zählt nur echte PQ-Keys',
    r7.s === 200 && r7.j.users[A.id] === true && r7.j.users[C.id] === false &&
    r7.j.algo.includes('ML-KEM-768') && r7.j.keyBytes === 1184, j(r7.j).slice(0, 260));

  /* ---------- 8) PQ-Ciphertext in der Nachricht bleibt unangetastet ---------- */
  const chat = await call('POST', '/api/chats', { type: 'private', userId: C.id }, A.token);
  ok('privater Chat', chat.s === 200 && !!chat.j.summary, j(chat.j).slice(0, 160));
  const chatId = chat.j.summary && chat.j.summary.id;

  const pqCt = crypto.randomBytes(1088);          // echte ML-KEM-768-Ciphertext-Größe
  const ratchet = ['dh' + crypto.randomBytes(31).toString('base64'), '0', '0',
    crypto.randomBytes(12).toString('base64'), crypto.randomBytes(64).toString('base64'),
    b64(32), b64(32), b64(70), '1', '1', pqCt.toString('base64')].join('|');
  const r8 = await call('POST', '/api/chats/' + chatId + '/e2e/messages', {
    enc: { ratchet, iv: b64(12), ct: b64(64), tag: b64(16) },
  }, A.token);
  ok('Nachricht mit PQ-Ciphertext wird angenommen', r8.s === 200, j(r8.j).slice(0, 160));

  const msgs = await call('GET', '/api/chats/' + chatId + '/messages', null, C.token);
  const m = (msgs.j.messages || []).find((x) => x.enc && x.enc.ratchet);
  const gotParts = m ? String(m.enc.ratchet).split('|') : [];
  const gotPq = gotParts.length === 11 ? Buffer.from(gotParts[10], 'base64') : null;
  ok('PQ-Ciphertext kommt Byte-für-Byte beim Empfänger an (1088 B)',
    !!gotPq && gotPq.equals(pqCt), 'teile=' + gotParts.length + ' len=' + (gotPq ? gotPq.length : 0));
  ok('Server speichert keinen Klartext (text ist leer)', m && m.text === '', m ? String(m.text).slice(0, 40) : 'keine Nachricht');

  /* ---------- 9) DB: nur öffentliche Teile ---------- */
  await new Promise((r) => setTimeout(r, 400));   // saveDb debounced
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const stored = db.e2eKeys && db.e2eKeys[A.id];
  const storedEk = stored && stored.pqPrekey ? Buffer.from(stored.pqPrekey, 'base64') : null;
  ok('DB: gespeicherter pqPrekey == öffentlicher ek', !!storedEk && storedEk.equals(ek));
  ok('DB: kein pqSecret/dk/privater Gitteranteil',
    !!stored && !('pqSecret' in stored) && !('dk' in stored) && !('pqPriv' in stored) &&
    Object.values(stored).every((v) => !(typeof v === 'string' && Buffer.from(v, 'base64').length === 2400)));
  const rawDb = fs.readFileSync(DB, 'utf8');
  ok('DB-Datei enthält keine 2400-Byte-PQ-Geheimnisse',
    !rawDb.includes(Buffer.alloc(2400, 3).toString('base64').slice(0, 60)));

  /* ---------- 10) Regression: klassischer Weg läuft weiter ---------- */
  const xChat = await call('POST', '/api/chats', { type: 'private', userId: C.id }, A.token);
  const xId = xChat.j.summary && xChat.j.summary.id;
  const classic = ['dh' + crypto.randomBytes(31).toString('base64'), '0', '0',
    b64(12), b64(64), b64(32), b64(32), b64(70), '1', '1'].join('|');
  const r10 = await call('POST', '/api/chats/' + xId + '/e2e/messages', {
    enc: { ratchet: classic, iv: b64(12), ct: b64(64), tag: b64(16) },
  }, A.token);
  ok('alter X3DH-Umschlag (ohne PQ) funktioniert weiter', r10.s === 200);

  /* ---------- 11) PQ-Umschlag ohne Auth ---------- */
  const r11 = await call('GET', '/api/e2e/keys/' + A.id, null, null);
  ok('Bundle ohne Login gesperrt', r11.s === 401 || r11.s === 403, String(r11.s));

  /* ---------- 12) Aufräumen: Testchats löschen ---------- */
  for (const cid of [chatId, xId]) {
    if (cid) await call('DELETE', '/api/chats/' + cid, null, A.token);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`🏁 ${pass}/${pass + fail} bestanden`);
  if (fail) { console.log('❌ Fehlgeschlagen:', fails.join(' · ')); process.exit(1); }
  console.log('✅ PQXDH-Serverseite sitzt: nur echte 1184-Byte-Schlüssel, keine Geheimnisse, Ciphertext unangetastet.\n');
})();

/* kleiner Helfer: nur ein zufälliger "Prüfschlüssel" in X.509-Form (Server prüft Inhalte nicht) */
function Crypto_createKeyPairLike() {
  return crypto.randomBytes(294).toString('base64');
}
