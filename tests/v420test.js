/* =====================================================================
 *  🧪 v420test.js — V4.20 „Downloads + Sicherheit"
 * ---------------------------------------------------------------------
 *  Was hier geprüft wird, prüft DINGE, nicht Behauptungen:
 *   · Die Hashes der API stimmen mit den Dateien auf der Platte überein
 *     (nachgerechnet hier, nicht geglaubt).
 *   · Range-Requests liefern wirklich Teilbereiche.
 *   · Eine verdrehte Signatur wird abgelehnt, eine richtige angenommen.
 *   · Die Pins in der API stimmen mit den Zertifikaten in der App überein.
 *
 *  Läuft gegen einen laufenden Server: LC_BASE=http://127.0.0.1:3900
 * ===================================================================== */
'use strict';

const BASE = process.env.LC_BASE || 'http://127.0.0.1:3900';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', 'client', 'app');

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`);
  }
}

function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`);
}

async function jget(p, opts) {
  const r = await fetch(BASE + p, opts);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* kein JSON */ }
  return { status: r.status, headers: r.headers, json, text };
}

function sha256File(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

async function main() {
  console.log(`\n🧪 V4.20 gegen ${BASE}\n`);

  /* ---------------- 1. Downloads-API ---------------- */
  console.log('📥 Downloads-API');
  const latest = await jget('/api/downloads/latest');
  ok('GET /api/downloads/latest antwortet 200', latest.status === 200, `status ${latest.status}`);
  ok('Antwort ist JSON', !!latest.json);
  const items = (latest.json && latest.json.items) || [];
  ok('mindestens 3 Plattformen gemeldet', items.length >= 3, `${items.length}`);
  ok('jede Plattform hat eine id', items.every((i) => typeof i.id === 'string' && i.id));
  ok('jede Plattform sagt available ja/nein', items.every((i) => typeof i.available === 'boolean'));
  ok('nicht verfügbare Plattformen nennen einen Grund',
    items.filter((i) => !i.available).every((i) => typeof i.reason === 'string' && i.reason.length > 10));

  // Hash gegen die echte Datei nachrechnen
  for (const it of items.filter((i) => i.available)) {
    const file = path.join(APP_DIR, it.file);
    ok(`Datei existiert: ${it.file}`, fs.existsSync(file));
    if (!fs.existsSync(file)) continue;
    const real = sha256File(file);
    eq(`SHA-256 von ${it.file} stimmt mit der API`, it.sha256, real);
    eq(`Größe von ${it.file} stimmt mit der API`, it.size, fs.statSync(file).size);
    ok(`Browser-Prüfung würde für ${it.file} grün`, real === it.sha256);
  }

  /* ---------------- 2. Auslieferung ---------------- */
  console.log('\n⬇️ Auslieferung');
  const apk = items.find((i) => i.available && i.id === 'android');
  if (apk) {
    const head = await fetch(BASE + apk.url, { method: 'GET', headers: { Range: 'bytes=0-99' } });
    ok('Range-Request liefert 206', head.status === 206, `status ${head.status}`);
    const buf = Buffer.from(await head.arrayBuffer());
    eq('Range 0-99 liefert genau 100 Byte', buf.length, 100);
    ok('akzeptiert Teilbereiche (Accept-Ranges)', head.headers.get('accept-ranges') === 'bytes');

    const full = await fetch(BASE + apk.url);
    ok('kompletter Download liefert 200', full.status === 200);
    eq('Content-Length stimmt', Number(full.headers.get('content-length')), apk.size);
    ok('wird als Download ausgeliefert (attachment)',
      (full.headers.get('content-disposition') || '').includes('attachment'));

    // 1:1-Vergleich der Bytes mit der Datei auf der Platte
    const body = Buffer.from(await full.arrayBuffer());
    const disk = fs.readFileSync(path.join(APP_DIR, apk.file));
    ok('heruntergeladene Bytes == Datei auf der Platte', body.equals(disk),
      `${body.length} vs ${disk.length}`);
    eq('Download-Hash == API-Hash', crypto.createHash('sha256').update(body).digest('hex'), apk.sha256);
  } else {
    ok('Android-APK vorhanden (sonst kein Download-Test)', false);
  }

  const unknown = await jget('/app/gibt-es-nicht.apk');
  ok('unbekannte Datei → 404 (kein Verzeichnis-Leak)', unknown.status === 404, `status ${unknown.status}`);

  /* ---------------- 3. Verify-Route ---------------- */
  console.log('\n🔎 /api/downloads/verify');
  const v = await jget('/api/downloads/verify?file=' + encodeURIComponent((apk || {}).file || 'maxichen-v4.15.apk'));
  if (apk && v.json) {
    eq('verify meldet den echten Hash', v.json.sha256, apk.sha256);
    ok('ohne erwarteten Hash wird NICHT "ok" behauptet', v.json.verified === false && v.json.match === null);

    const good = await jget(`/api/downloads/verify?file=${encodeURIComponent(apk.file)}&sha256=${apk.sha256}`);
    eq('richtiger Hash → match:true', good.json.match, true);
    eq('richtiger Hash → 200', good.status, 200);

    const bad = await jget(`/api/downloads/verify?file=${encodeURIComponent(apk.file)}&sha256=${'0'.repeat(64)}`);
    eq('falscher Hash → match:false', bad.json.match, false);
    eq('falscher Hash → 409', bad.status, 409);
    ok('falscher Hash nennt die Abweichung', String(bad.json.message).includes('weicht ab'));

    const missing = await jget('/api/downloads/verify?file=gibt-es-nicht.apk');
    eq('unbekannte Datei → 404', missing.status, 404);
  }

  /* ---------------- 4. Pins ---------------- */
  console.log('\n📌 Pins');
  const pins = await jget('/api/security/pins');
  ok('GET /api/security/pins antwortet 200', pins.status === 200);
  const certs = (pins.json && pins.json.certificates) || [];
  ok('mindestens 3 Zertifikate gepinnt', certs.length >= 3, `${certs.length}`);
  ok('jedes Zertifikat hat einen SPKI-Pin', certs.every((c) => /^[A-Za-z0-9+/]{43}=$/.test(c.spkiSha256Base64)));
  ok('jedes Zertifikat hat einen DER-Pin', certs.every((c) => /^[A-Za-z0-9+/]{43}=$/.test(c.derSha256Base64)));
  ok('Blatt-Zertifikat ist dabei', certs.some((c) => c.role === 'leaf'));
  ok('Zwischenzertifikat ist dabei (Rotation!)', certs.some((c) => c.role === 'intermediate'));

  /* 🗑️ V4.29: Die Flutter-App ist gelöscht — es gibt keine pins.dart mehr,
   * gegen die man prüfen könnte. Statt die Prüfung stillschweigend zu
   * streichen, wird jetzt gegen die QUELLE geprüft: was /api/security/pins
   * ausliefert, muss exakt in server/v420sec.js stehen. So fällt auf, wenn
   * Endpunkt und Code auseinanderlaufen. */
  const pinsSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'v420sec.js'), 'utf8');
  for (const c of certs) {
    ok(`Pins-Quelle (server/v420sec.js) kennt ${c.role}`,
      pinsSrc.includes(c.derSha256Base64) && pinsSrc.includes(c.spkiSha256Base64), c.role);
  }
  ok('die alte Dart-Datei ist wirklich weg',
    !fs.existsSync(path.join(__dirname, '..', 'flutter_app', 'lib', 'core', 'pins.dart')));

  /* ---------------- 5. Status: ehrlich ---------------- */
  console.log('\n📋 /api/security/status');
  const st = await jget('/api/security/status');
  ok('GET /api/security/status antwortet 200', st.status === 200);
  ok('sagt, ob die App-Signatur an ist', typeof st.json.appSignature.enabled === 'boolean');
  ok('behauptet NICHT, Pinning sei serverseitig erzwungen', st.json.pinning.enforceable === false);
  ok('behauptet NICHT, Screenshots seien serverseitig prüfbar', st.json.screenshotProtection.enforceable === false);
  ok('sagt offen, dass Attestation fehlt', st.json.attestation.implemented === false);
  ok('nennt die E2E-Algorithmen', st.json.e2e.algorithms.join(',') === 'X25519,AES-256-GCM');
  ok('Zeitfenster ist 300 s', st.json.appSignature.maxSkewSeconds === 300);

  /* ---------------- 6. Signatur rechnen (Server-Seite) ---------------- */
  console.log('\n🛡️ App-Signatur');
  const { makeSignature, verifySignature } = require('../server/v420sec');
  const secret = 'test-secret-1234567890';
  const sig = makeSignature({
    secret, method: 'GET', path: '/api/downloads/latest', body: '', timestampSeconds: 1700000000,
  });
  ok('Signatur hat das Format lc1 <keyId> <ts> <hex>', /^lc1 \S+ \d+ [0-9a-f]{64}$/.test(sig), sig);
  ok('eigene Signatur wird akzeptiert',
    verifySignature({ header: sig, secret, method: 'GET', path: '/api/downloads/latest', body: '', nowSeconds: 1700000000 }).ok === true);
  ok('Groß/Klein der Methode ist egal',
    verifySignature({ header: sig, secret, method: 'get', path: '/api/downloads/latest', body: '', nowSeconds: 1700000000 }).ok === true);
  ok('veraltete Signatur wird abgelehnt (Replay)',
    verifySignature({ header: sig, secret, method: 'GET', path: '/api/downloads/latest', body: '', nowSeconds: 1700000000 + 301 }).ok === false);
  ok('301 s ist zu alt, 299 s nicht',
    verifySignature({ header: sig, secret, method: 'GET', path: '/api/downloads/latest', body: '', nowSeconds: 1700000000 + 299 }).ok === true);
  ok('anderer Pfad → abgelehnt',
    verifySignature({ header: sig, secret, method: 'GET', path: '/api/anderes', body: '', nowSeconds: 1700000000 }).ok === false);
  ok('falsches Geheimnis → abgelehnt',
    verifySignature({ header: sig, secret: 'falsch-falsch-falsch', method: 'GET', path: '/api/downloads/latest', body: '', nowSeconds: 1700000000 }).ok === false);
  ok('Müll-Header wird abgelehnt statt zu werfen',
    verifySignature({ header: 'lc1 zu-kurz', secret, method: 'GET', path: '/', body: '', nowSeconds: 0 }).ok === false);
  ok('fehlender Header wird abgelehnt',
    verifySignature({ header: undefined, secret, method: 'GET', path: '/', body: '', nowSeconds: 0 }).ok === false);

  // Gleiche Rechnung wie die Flutter-App (dort im Test festgeschrieben)
  const handSig = makeSignature({
    secret: 'test-geheimnis-fuer-signatur', method: 'GET', path: '/api/downloads/latest',
    body: '', timestampSeconds: 1700000000, keyId: 'lovechat-420',
  });
  ok('Signatur-Format identisch zur App (keyId lovechat-420)',
    handSig.startsWith('lc1 lovechat-420 1700000000 '), handSig.slice(0, 40));

  /* ---------------- 7. Signatur-Middleware live ---------------- */
  console.log('\n🔐 Middleware auf /api/downloads');
  const noSig = await fetch(BASE + '/api/downloads/latest', { headers: { 'X-App-Signature': 'lc1 lovechat-420 1700000000 ' + 'a'.repeat(64) } });
  const sigStatusEnabled = st.json.appSignature.enabled;
  if (sigStatusEnabled) {
    ok('ohne gültige Signatur → 401', noSig.status === 401, `status ${noSig.status}`);
  } else {
    ok('Signatur-Prüfung aus → Route antwortet trotzdem (dokumentiert)', noSig.status === 200, `status ${noSig.status}`);
    console.log('     ⏭️  APP_SIGNATURE_SECRET nicht gesetzt — Live-401-Test übersprungen');
  }

  /* ---------------- 8. Downloads-Seite ---------------- */
  console.log('\n🌐 Seite /Downloads');
  for (const p of ['/downloads', '/Downloads', '/DOWNLOADS']) {
    const page = await fetch(BASE + p);
    ok(`GET ${p} → 200`, page.status === 200, `status ${page.status}`);
  }
  const html = await (await fetch(BASE + '/Downloads')).text();
  // Das Skript liegt in client/downloads.js — inline würde es von der
  // CSP (script-src 'self') blockiert. Genau das war beim ersten
  // Browsertest der Fall: Seite blieb bei „⏳" stehen.
  ok('Seite lädt ihr Skript als eigene Datei (CSP-konform)', html.includes('/downloads.js'));
  ok('Seite hat KEIN Inline-<script>-Tag mehr', !/<script>\s*[^<]/.test(html));
  const jsRes = await fetch(BASE + '/downloads.js');
  ok('GET /downloads.js → 200', jsRes.status === 200, `status ${jsRes.status}`);
  const js = await jsRes.text();
  ok('Skript holt die Hashes aus der API', js.includes('/api/downloads/latest'));
  ok('Skript rechnet im Browser nach (crypto.subtle)', js.includes("crypto.subtle.digest('SHA-256'"));
  ok('Seite zeigt keine fest eingetippten Hashes mehr',
    !html.includes('23a5828475e9897a788126dd4a8e703ff6792249be13498153fb3af7902377fe'));

  /* ---------------- Ergebnis ---------------- */
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`V4.20: ${pass}/${pass + fail} grün${fail ? `, ${fail} rot` : ''}`);
  if (fail) {
    console.log('Fehlgeschlagen:');
    failures.forEach((f) => console.log('  · ' + f));
  }
  console.log('');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('💥 Testlauf abgebrochen:', e);
  process.exit(1);
});
