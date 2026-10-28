/* =====================================================================
   V4.7 — EHRLICHE TESTS: TURN-Credentials
   ---------------------------------------------------------------------
   Der Relay selbst wird von tests/turn-probe.js gegen echten coturn
   geprüft (10/10). Hier geht es um das, was der API-Endpunkt falsch
   machen könnte:
     1) Credentials nur mit gültigem Token
     2) username = <ablauf>:<userId>, credential = base64(HMAC-SHA1(secret, username))
     3) Ablauf in der Zukunft, TTL begrenzt
     4) Secret taucht NIRGENDS in der Antwort auf
     5) jeder Nutzer bekommt seine eigenen Credentials
     6) ohne TURN-Konfiguration: ehrliche STUN-only-Antwort statt Fake
     7) Health-Endpoint sagt die Wahrheit über den Relay
     8) Rate-Limit greift pro Account
   ===================================================================== */
const crypto = require('crypto');

const B = 'http://127.0.0.1:3000';
const T = Date.now().toString().slice(-6);
const SECRET = process.env.EXPECT_TURN_SECRET || 'TEST_SECRET_123';
const REALM = process.env.EXPECT_TURN_REALM || 'maxichat.test';
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

const phone = (n) => '+49154' + T + String(n).padStart(2, '0');

(async () => {
  console.log('\n🔥 V4.7 Testlauf ' + T + '\n' + '='.repeat(56));

  /* ---------- Auth-Gate ---------- */
  const noAuth = await call('GET', '/api/rtc/ice', null, null);
  ok('ohne Token → 401 (keine offenen Credentials)', noAuth.s === 401, 's=' + noAuth.s);

  const owner = await call('POST', '/api/login', { login: 'maxichen', password: 'LoveChat!2026' });
  ok('Owner-Login', owner.s === 200 && !!owner.j.token, j(owner.j));
  const OT = owner.j.token;

  const reg = await call('POST', '/api/register', {
    username: 'v47a' + T, displayName: 'Tara ' + T, password: 'Test!1234', phone: phone(1),
  });
  if (reg.s === 429) {
    console.log('\n⛔ IP-Registrierungslimit (12/h) — Server neu starten, dann erneut.');
    process.exit(2);
  }
  ok('Test-Account registriert', reg.s === 200 && !!reg.j.token, j(reg.j));
  const AT = reg.j.token;
  const AID = reg.j.user.id;

  /* ---------- Grundantwort ---------- */
  const ice = await call('GET', '/api/rtc/ice', null, AT);
  ok('ICE-Konfiguration abrufbar', ice.s === 200 && Array.isArray(ice.j.iceServers), j(ice.j));

  const turnServer = ice.j.iceServers.find((s) => (s.urls || []).some((u) => u.startsWith('turn:')));
  ok('TURN-Server enthalten (nicht nur STUN)', !!turnServer, j(ice.j.iceServers));
  if (!turnServer) {
    console.log('\n⚠️ Server läuft ohne TURN_HOST/SECRET — Rest wird als STUN-only geprüft.');
  } else {
    ok('UDP und TCP angeboten', turnServer.urls.some((u) => u.includes('transport=udp')) && turnServer.urls.some((u) => u.includes('transport=tcp')), j(turnServer.urls));

    const [expiryStr, userPart] = String(turnServer.username).split(':');
    const expiry = parseInt(expiryStr, 10);
    ok('username beginnt mit Ablaufzeit', Number.isFinite(expiry) && expiry > Date.now() / 1000, turnServer.username);
    ok('userId steckt im username', userPart === AID, `${userPart} vs ${AID}`);
    ok('Credentials laufen in ≤ 24 h ab', expiry - Date.now() / 1000 <= 86400, 'in ' + Math.round(expiry - Date.now() / 1000) + 's');

    /* 👮 Die eigentliche Prüfung: stimmt die Signatur mit coturns Verfahren? */
    const expected = crypto.createHmac('sha1', SECRET).update(turnServer.username).digest('base64');
    ok('credential = base64(HMAC-SHA1(secret, username)) — coturn-kompatibel', turnServer.credential === expected,
      'erwartet ' + expected.slice(0, 12) + '… bekommen ' + String(turnServer.credential).slice(0, 12) + '…');

    const wrong = crypto.createHmac('sha1', 'falsches-secret').update(turnServer.username).digest('base64');
    ok('mit falschem Secret wäre es anders (Signatur ist bindend)', wrong !== turnServer.credential);

    ok('realm wird mitgeliefert', ice.j.realm === REALM, String(ice.j.realm));
  }

  /* ---------- Kein Secret-Leak ---------- */
  const blob = JSON.stringify(ice.j);
  ok('Secret steht NICHT in der Antwort', !blob.includes(SECRET), '');
  ok('kein Feld "secret"', !("secret" in ice.j) && !/static-auth-secret/.test(blob), '');

  /* ---------- Pro Nutzer eigene Credentials ---------- */
  const ownerIce = await call('GET', '/api/rtc/ice', null, OT);
  const ownerTurn = (ownerIce.j.iceServers || []).find((s) => s.username);
  if (ownerTurn && turnServer) {
    ok('Owner bekommt andere Credentials als Testkonto', ownerTurn.username !== turnServer.username,
      `${ownerTurn.username} vs ${turnServer.username}`);
    ok('Owner-Credential ist für SEINEN username signiert',
      ownerTurn.credential === crypto.createHmac('sha1', SECRET).update(ownerTurn.username).digest('base64'));
  } else {
    ok('Owner bekommt eigenes ICE-Set', ownerIce.s === 200);
  }

  /* ---------- Health = Wahrheit ---------- */
  const health = await call('GET', '/api/rtc/turn-health', null, AT);
  ok('Health-Endpoint antwortet', health.s === 200, j(health.j));
  ok('Health prüft wirklich per STUN (ok=true bei laufendem Relay)', health.j.ok === true, j(health.j));
  ok('Health verrät kein Secret', !JSON.stringify(health.j).includes(SECRET), '');
  ok('Health nennt Host und Port', health.j.port === 3478, j(health.j));

  /* ---------- Rate-Limit pro Account ---------- */
  let limited = false;
  for (let i = 0; i < 70; i++) {
    const r = await call('GET', '/api/rtc/ice', null, AT);
    if (r.s === 429) { limited = true; ok('Rate-Limit greift (429 ice_rate)', r.j.code === 'ice_rate', j(r.j)); break; }
  }
  if (!limited) ok('Rate-Limit greift (429 ice_rate)', false, 'nie 429 gesehen');

  /* ---------- Aufräumen ---------- */
  await call('POST', '/api/admin/users/' + AID + '/action', { action: 'delete', reason: 'Test' }, OT);

  console.log('\n' + '='.repeat(56));
  console.log(`${pass}/${pass + fail} grün` + (fail ? '  ❌ ' + fails.join(' · ') : '  🔥'));
  process.exit(fail ? 1 : 0);
})();
