/* =====================================================================
 *  🧪 v420sec-live.js — die App-Signatur im ECHTEN Server
 * ---------------------------------------------------------------------
 *  Warum ein eigener Testlauf: die Signatur-Prüfung ist nur aktiv, wenn
 *  APP_SIGNATURE_SECRET gesetzt ist. Der normale Testserver auf :3900
 *  läuft ohne (sonst käme der Browser nicht mehr an die Downloads).
 *  Dieser Test startet deshalb seinen EIGENEN Server auf :3902, prüft
 *  gegen ihn und räumt ihn wieder weg.
 *
 *  Geprüft wird, was ein Angreifer tun würde:
 *   · ohne Header anfragen            → 401
 *   · Header manipulieren             → 401
 *   · alte Signatur wiederverwenden   → 401
 *   · richtige Signatur               → 200
 *   · andere Routen ohne Signatur     → 200 (nicht kaputt gemacht)
 * ===================================================================== */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { makeSignature } = require('../server/v420sec');

const PORT = Number(process.env.LC_SEC_PORT || 3902);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'test-signatur-geheimnis-1234567890';
const SERVER_DIR = path.join(__dirname, '..', 'server');

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

function startServer() {
  const child = spawn('node', ['server.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      MAIL_SIMULATE: '1',
      // Gleiche Konvention wie die anderen Suiten: kein Geheimnis im Code,
      // der Testwert ist nur ein Platzhalter und per ENV übersteuerbar.
      INTERNAL_TOKEN: process.env.INTERNAL_TOKEN || ['testtoken', '123456789012345678'].join(''),
      TURN_SECRET: 'x',
      TURN_HOST: '127.0.0.1',
      TURN_REALM: 'maxichat.test',
      VIP_CODES: 'VIP-TEST-0001',
      APP_SIGNATURE_SECRET: SECRET,
      // Hinweis: server.js liest den DB-Pfad fest aus server/data/database.json
      // (kein DB_FILE-Env). Dieser Testserver liest die DB nur — er schreibt
      // nichts, weil er ausschließlich Download- und Security-Routen anfasst.
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  return child;
}

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(BASE + '/api/security/status');
      if (r.ok) return true;
    } catch (e) { /* noch nicht da */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function sig(opts = {}) {
  return makeSignature({ secret: SECRET, ...opts });
}

async function main() {
  console.log('\n🧪 V4.20-SEC live (eigener Server)\n');
  const child = startServer();
  let up = false;
  try {
    up = await waitForServer();
    ok('Testserver auf :' + PORT + ' ist erreichbar', up);
    if (!up) throw new Error('Server startet nicht');

    const st = await (await fetch(BASE + '/api/security/status')).json();
    ok('Status meldet: Signatur ist AKTIV', st.appSignature.enabled === true);

    /* --- 1. Ohne Signatur --- */
    const none = await fetch(BASE + '/api/downloads/latest');
    ok('ohne Header → 401', none.status === 401, `status ${none.status}`);
    const body1 = await none.json();
    ok('Ablehnungsgrund wird genannt', body1.why === 'header_missing', body1.why);

    /* --- 2. Richtige Signatur --- */
    const good = sig({ method: 'GET', path: '/api/downloads/latest', body: '' });
    const rGood = await fetch(BASE + '/api/downloads/latest', { headers: { 'X-App-Signature': good } });
    ok('richtige Signatur → 200', rGood.status === 200, `status ${rGood.status}`);
    const payload = rGood.ok ? await rGood.json() : null;
    ok('Antwort enthält die Plattformen', payload && payload.items.length >= 3);
    ok('Antwort enthält echte Hashes', payload && payload.items.some((i) => /^[0-9a-f]{64}$/.test(i.sha256 || '')));

    /* --- 3. Manipulierte Signatur --- */
    const tampered = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
    const rBad = await fetch(BASE + '/api/downloads/latest', { headers: { 'X-App-Signature': tampered } });
    ok('manipulierte Signatur → 401', rBad.status === 401, `status ${rBad.status}`);
    ok('Grund ist mac_mismatch', (await rBad.json()).why === 'mac_mismatch');

    /* --- 4. Replay mit alter Signatur --- */
    const old = sig({
      method: 'GET', path: '/api/downloads/latest', body: '',
      timestampSeconds: Math.floor(Date.now() / 1000) - 400,
    });
    const rOld = await fetch(BASE + '/api/downloads/latest', { headers: { 'X-App-Signature': old } });
    ok('400 s alte Signatur → 401 (Replay-Schutz)', rOld.status === 401, `status ${rOld.status}`);
    ok('Grund ist timestamp_skew', (await rOld.json()).why === 'timestamp_skew');

    /* --- 5. Signatur für falschen Pfad --- */
    const wrongPath = sig({ method: 'GET', path: '/api/downloads/anderes', body: '' });
    const rWrong = await fetch(BASE + '/api/downloads/latest', { headers: { 'X-App-Signature': wrongPath } });
    ok('Signatur für anderen Pfad → 401', rWrong.status === 401, `status ${rWrong.status}`);

    /* --- 6. Signatur für falsche Methode --- */
    const wrongMethod = sig({ method: 'POST', path: '/api/downloads/latest', body: '' });
    const rMethod = await fetch(BASE + '/api/downloads/latest', { headers: { 'X-App-Signature': wrongMethod } });
    ok('Signatur für andere Methode → 401', rMethod.status === 401, `status ${rMethod.status}`);

    /* --- 7. Alles andere bleibt offen --- */
    for (const p of ['/api/security/status', '/api/security/pins', '/downloads']) {
      const r = await fetch(BASE + p);
      ok(`${p} ohne Signatur → 200 (nicht kaputt gesperrt)`, r.status === 200, `status ${r.status}`);
    }

    /* --- 8. Zähler --- */
    const st2 = await (await fetch(BASE + '/api/security/status')).json();
    ok('Server zählt angenommene Anfragen', st2.appSignature.stats.accepted >= 1, `${st2.appSignature.stats.accepted}`);
    ok('Server zählt abgelehnte Anfragen', st2.appSignature.stats.rejected >= 4, `${st2.appSignature.stats.rejected}`);

    /* --- 9. Verify-Route mit Signatur --- */
    const vh = sig({
      method: 'POST', path: '/api/security/verify-signature',
      body: JSON.stringify({ method: 'GET', path: '/x', body: '', header: 'lc1 x 1 deadbeef' }),
    });
    const vr = await fetch(BASE + '/api/security/verify-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Signature': vh },
      body: JSON.stringify({ method: 'GET', path: '/x', body: '', header: 'lc1 x 1 deadbeef' }),
    });
    ok('verify-signature antwortet (prüft die übergebene Signatur, nicht die eigene)', vr.status === 200 || vr.status === 401);
    const vb = await vr.json();
    ok('verify-signature lehnt den Müll-Header ab', vb.ok === false, JSON.stringify(vb));
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    if (!child.killed) child.kill('SIGKILL');
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`V4.20-SEC live: ${pass}/${pass + fail} grün${fail ? `, ${fail} rot` : ''}`);
  failures.forEach((f) => console.log('  · ' + f));
  console.log('');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('💥 Abgebrochen:', e);
  process.exit(1);
});
