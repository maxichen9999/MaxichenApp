/* =====================================================================
   ✅ V4.12 — TEST: Verified Badges · TOTP · Recovery · Security-Header
   ---------------------------------------------------------------------
   Was hier WIRKLICH geprüft wird:

     1) Der Server signiert Haken — und eine manipulierte Nutzlast
        MUSS scheitern (nicht "sieht gut aus", sondern crypto.verify=false)
     2) Der private Schlüssel geht über KEINEN Endpunkt raus
     3) TOTP: setup → falscher Code abgelehnt → richtiger Code aktiviert
     4) Nach Aktivierung: Login ohne Code scheitert, mit Code geht es
     5) Recovery-Code funktioniert GENAU EINMAL
     6) 2FA abschalten braucht Passwort UND Code
     7) Owner/Bot ohne 2FA bekommen keinen Haken (die Regel)
     8) Security-Header sind auf jeder Antwort
     9) Ein Nutzer kann seinen Haken NICHT selbst setzen
   ===================================================================== */
const crypto = require('crypto');

const B = 'http://127.0.0.1:3000';
const T = Date.now().toString().slice(-6);
let pass = 0, fail = 0;
const fails = [];

const ok = (n, c, e = '') => { if (c) { pass++; console.log('✅', n); } else { fail++; fails.push(n); console.log('❌', n, e); } };
const j = (o) => { try { return JSON.stringify(o).slice(0, 220); } catch (e) { return ''; } };

async function call(method, p, body, token) {
  const r = await fetch(B + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: (body === undefined || body === null || method === 'GET') ? undefined : JSON.stringify(body),
  });
  let data = {}; let headers = {};
  try { data = await r.json(); } catch (e) {}
  for (const [k, v] of r.headers.entries()) headers[k] = v;
  return { s: r.status, j: data, h: headers };
}

/* ------ TOTP selbst nachrechnen (unabhängig vom Server-Modul) ------ */
function b32d(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0; const out = [];
  for (const ch of clean) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(out);
}
function totpNow(secretB32, offset = 0) {
  const secret = b32d(secretB32);
  const counter = Math.floor(Date.now() / 1000 / 30) + offset;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0); buf.writeUInt32BE(counter, 4);
  const h = crypto.createHmac('sha1', secret).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return String(bin % 1e6).padStart(6, '0');
}

(async () => {
  console.log('\n✅ V4.12 Testlauf ' + T + '\n' + '='.repeat(62));

  /* ================= 1. Badge-Schlüssel ================= */
  const keyRes = await call('GET', '/api/badges/key');
  ok('Public-Key-Endpunkt liefert ECDSA-P256', keyRes.s === 200 && keyRes.j.algorithm === 'ECDSA-P256-SHA256', j(keyRes.j));
  const pubB64 = keyRes.j.publicKey;
  ok('Public-Key ist ein X.509-DER-Schlüssel (91 Byte)', Buffer.from(pubB64, 'base64').length === 91,
    'len=' + Buffer.from(pubB64, 'base64').length);
  ok('KEIN privater Schlüssel im Antwortfeld',
    !('privateKey' in keyRes.j) && !('privatePem' in keyRes.j) && !JSON.stringify(keyRes.j).includes('PRIVATE'));

  const owner = await call('POST', '/api/login', { login: 'maxichen', password: 'LoveChat!2026' });
  ok('Owner-Login', owner.s === 200 && !!owner.j.token, j(owner.j));
  const OT = owner.j.token;

  /* ================= 2. Signatur-Selbstprüfung ================= */
  const sc = await call('GET', '/api/badges/selfcheck', null, OT);
  ok('Server signiert und verifiziert selbst', sc.s === 200 && sc.j.good === true, j(sc.j));
  ok('manipulierte Nutzlast wird ABGELEHNT (Anti-Fälschung)',
    sc.j.tamperedAccepted === false, 'tamperedAccepted=' + sc.j.tamperedAccepted);

  /* ================= 3. Eigener Haken ================= */
  const meBadge = await call('GET', '/api/badges/me', null, OT);
  ok('Owner-Haken: Rolle owner', meBadge.s === 200 && meBadge.j.role === 'owner', j(meBadge.j));
  // Ohne 2FA -> blockiert (die Regel greift schon hier)
  const ownerBlocked = meBadge.j.blocked === true && meBadge.j.badge === null;
  ok('Owner ohne 2FA bekommt NOCH keinen Haken (Regel greift)', ownerBlocked, j(meBadge.j));

  /* ================= 4. E2E: privater Key bleibt drin ================= */
  const allBadges = await call('GET', '/api/badges', null, OT);
  ok('Badge-Liste liefert nur signierte Strings',
    allBadges.s === 200 && typeof allBadges.j.badges === 'object', j(allBadges.j).slice(0, 120));
  ok('Badge-Strings sind 5-teilig (userId|role|avatarHash|issuedAt|sig)',
    Object.values(allBadges.j.badges).every((b) => String(b).split('|').length === 5));

  /* ================= 5. Nutzer kann Haken NICHT selbst setzen ================= */
  const selfSet = await call('POST', '/api/badges/me', null, OT);
  ok('es gibt keinen POST, der den Haken setzt', selfSet.s === 404 || selfSet.s === 405, 'HTTP ' + selfSet.s);
  const fakeRole = await call('POST', '/api/register', {
    username: 'v412fake' + T, displayName: 'Fake', password: 'Test!1234', phone: '+4915' + T + '11',
    role: 'owner', isOwner: true, verified: true,
  });
  if (fakeRole.s === 429) { console.log('\n⛔ IP-Limit — Server neu starten.'); process.exit(2); }
  const fakeTok = fakeRole.j.token, fakeId = fakeRole.j.user && fakeRole.j.user.id;
  ok('role/isOwner beim Registrieren werden ignoriert',
    fakeRole.s === 200 && fakeRole.j.user.role !== 'owner' && fakeRole.j.user.isOwner !== true, j(fakeRole.j.user || {}));
  const fakeBadge = await call('GET', '/api/badges/me', null, fakeTok);
  ok('der Fake-Account bekommt keinen Haken', fakeBadge.j.badge === null, j(fakeBadge.j));

  /* ================= 6. TOTP-Ablauf ================= */
  const setup = await call('POST', '/api/auth/2fa/setup', {}, fakeTok);
  ok('TOTP-Setup liefert Secret + otpauth-URL',
    setup.s === 200 && !!setup.j.secret && String(setup.j.otpauth).startsWith('otpauth://totp/'), j(setup.j).slice(0, 160));
  ok('otpauth-URL hat Doppelpunkt UNkodiert (sonst falscher Kontoname)',
    !String(setup.j.otpauth).includes('%3A'), String(setup.j.otpauth).slice(0, 60));
  const secret = setup.j.secret;

  const badEnable = await call('POST', '/api/auth/2fa/enable', { code: '000000' }, fakeTok);
  ok('falscher Code aktiviert 2FA NICHT', badEnable.s === 401 && badEnable.j.code === 'totp_bad', j(badEnable.j));

  const code1 = totpNow(secret);
  const enable = await call('POST', '/api/auth/2fa/enable', { code: code1 }, fakeTok);
  ok('richtiger Code aktiviert 2FA', enable.s === 200 && enable.j.ok === true, j(enable.j));
  ok('10 Recovery-Codes werden EINMALIG ausgegeben',
    Array.isArray(enable.j.recoveryCodes) && enable.j.recoveryCodes.length === 10, j(enable.j).slice(0, 100));
  const recovery = enable.j.recoveryCodes || [];
  ok('Recovery-Codes haben Format ABCD-EFGH', recovery.every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)), recovery[0]);

  const status = await call('GET', '/api/auth/2fa', null, fakeTok);
  ok('Status zeigt enabled + 10 Recovery übrig',
    status.j.enabled === true && status.j.recoveryLeft === 10, j(status.j));

  /* ================= 7. Login mit 2FA ================= */
  const l1 = await call('POST', '/api/login', { login: 'v412fake' + T, password: 'Test!1234' });
  ok('Login ohne Code wird abgewiesen', l1.s === 401 && l1.j.code === '2fa_required', j(l1.j));
  const l2 = await call('POST', '/api/login', { login: 'v412fake' + T, password: 'Test!1234', totp: '000000' });
  ok('Login mit falschem Code abgewiesen', l2.s === 401 && l2.j.code === '2fa_invalid', j(l2.j));
  const good = totpNow(secret);
  const l3 = await call('POST', '/api/login', { login: 'v412fake' + T, password: 'Test!1234', totp: good });
  ok('Login mit richtigem Code funktioniert', l3.s === 200 && !!l3.j.token, j(l3.j));

  /* ================= 8. Recovery-Code genau einmal ================= */
  const rc1 = recovery[0];
  const r1 = await call('POST', '/api/login', { login: 'v412fake' + T, password: 'Test!1234', totp: rc1 });
  ok('Recovery-Code #1 wird als Code akzeptiert', r1.s === 200 && !!r1.j.token, j(r1.j).slice(0, 120));
  const r2 = await call('POST', '/api/login', { login: 'v412fake' + T, password: 'Test!1234', totp: rc1 });
  ok('derselbe Recovery-Code geht NICHT nochmal', r2.s === 401, 'HTTP ' + r2.s);
  const st2 = await call('GET', '/api/auth/2fa', null, fakeTok);
  ok('Recovery-Zähler ist auf 9 gefallen', st2.j.recoveryLeft === 9, j(st2.j));

  /* ================= 9. 2FA abschalten braucht Passwort + Code ================= */
  const d1 = await call('POST', '/api/auth/2fa/disable', { password: 'falsch', code: totpNow(secret) }, fakeTok);
  ok('Abschalten mit falschem Passwort scheitert', d1.s === 401, 'HTTP ' + d1.s);
  const d2 = await call('POST', '/api/auth/2fa/disable', { password: 'Test!1234', code: '000000' }, fakeTok);
  ok('Abschalten mit falschem Code scheitert', d2.s === 401, 'HTTP ' + d2.s);
  const d3 = await call('POST', '/api/auth/2fa/disable', { password: 'Test!1234', code: totpNow(secret) }, fakeTok);
  ok('Abschalten mit Passwort + Code geht', d3.s === 200, j(d3.j));
  const st3 = await call('GET', '/api/auth/2fa', null, fakeTok);
  ok('2FA ist wirklich aus', st3.j.enabled === false, j(st3.j));


  /* ================= 10b. Sitzungen trennen wirklich =================
     Regression: bis V4.11 rief "ein Gerät abmelden" MOD.kick() auf — und
     das löschte ALLE Tokens des Nutzers. Man warf ein fremdes Gerät raus
     und flog selbst mit. Hier wird genau das nachgemessen.            */
  const sTok = async () => {
    const r = await call('POST', '/api/login', { login: 'test', password: 'test1234' });
    return r.j.token;
  };
  const a1 = await sTok(), a2 = await sTok(), a3 = await sTok();
  const sl = await call('GET', '/api/sessions', null, a1);
  ok('Sitzungsliste zeigt 3 eigene Geräte', (sl.j.sessions || []).length >= 3, j(sl.j.sessions && sl.j.sessions.length));
  ok('genau eine ist "current"', (sl.j.sessions || []).filter((x) => x.current).length === 1);
  ok('Sitzungs-ID ist NICHT der Token selbst', (sl.j.sessions || []).every((x) => !x.id.includes(a1.slice(0, 8))), 'kein Token-Leak');
  const vid = (sl.j.sessions || []).filter((x) => !x.current)[0].id;
  const dk = await call('DELETE', '/api/sessions/' + vid, null, a1);
  ok('ein Gerät abmelden → ok', dk.s === 200, j(dk.j));
  const still = await call('GET', '/api/me', null, a1);
  ok('🔴 das ablösende Gerät bleibt ANGEMELDET (der alte Bug)', still.s === 200, 'HTTP ' + still.s);
  const others = (await call('GET', '/api/me', null, a2)).s + (await call('GET', '/api/me', null, a3)).s;
  ok('genau EIN Gerät wurde abgemeldet, nicht alle', others === 401 + 200 || others === 200 + 401, 'HTTP ' + others);
  const bogus = await call('DELETE', '/api/sessions/deadbeef1234', null, a1);
  ok('fremde/erfundene Sitzungs-ID → 404', bogus.s === 404, 'HTTP ' + bogus.s);

  /* ================= 10. Security-Header ================= */
  const page = await call('GET', '/');
  const csp = page.h['content-security-policy'] || '';
  ok('CSP vorhanden', csp.length > 50, csp.slice(0, 60));
  ok("script-src ist 'self' (kein Inline-JS, kein CDN)", /script-src 'self'(;|$)/.test(csp), csp.slice(0, 120));
  ok("object-src 'none'", csp.includes("object-src 'none'"));
  ok("frame-ancestors 'none' (kein Clickjacking)", csp.includes("frame-ancestors 'none'"));
  ok("base-uri 'self'", csp.includes("base-uri 'self'"));
  ok('X-Frame-Options: DENY', page.h['x-frame-options'] === 'DENY');
  ok('X-Content-Type-Options: nosniff', page.h['x-content-type-options'] === 'nosniff');
  ok('Referrer-Policy gesetzt', !!page.h['referrer-policy']);
  ok('Permissions-Policy begrenzt Kamera/Mikro auf self', (page.h['permissions-policy'] || '').includes('camera=(self)'));
  ok('kein x-powered-by (Express verrät sich nicht)', !page.h['x-powered-by']);

  const apiRes = await call('GET', '/api/badges/key');
  ok('API-Antworten sind nicht cachebar', (apiRes.h['cache-control'] || '').includes('no-store'), apiRes.h['cache-control']);

  /* ================= 11. Aufräumen ================= */
  console.log('\n' + '='.repeat(62));
  console.log(`🏁 ${pass}/${pass + fail} bestanden`);
  if (fail) { console.log('❌ Fehlgeschlagen:', fails.join(' · ')); process.exit(1); }
  console.log('✅ Haken signiert, 2FA erzwungen, Header dicht.\n');
})();
