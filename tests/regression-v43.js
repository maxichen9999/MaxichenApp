/* 🔁 Regression: V4.2 Owner-only Ban + V4-Basics (kompakt) */
const B = 'http://127.0.0.1:3000';
const T = Date.now().toString().slice(-6);
let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('✅', n); } else { fail++; console.log('❌', n, e); } };
async function call(m, p, b, t) {
  const r = await fetch(B + p, {
    method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}
(async () => {
  const o = await call('POST', '/api/login', { login: 'maxichen', password: 'LoveChat!2026' });
  ok('Owner-Login', o.s === 200 && !!o.j.token);
  const OT = o.j.token, OID = o.j.user.id;

  ok('/me liefert Owner', (await call('GET', '/api/me', null, OT)).j.user.owner === true);
  ok('App-Hintergrund', (await call('GET', '/api/app-background', null, OT)).s === 200);
  ok('LoveBot-Regel', (await call('GET', '/api/lovebot', null, OT)).j.rule.includes('einzige'));
  ok('Admin-Übersicht', (await call('GET', '/api/admin/overview', null, OT)).s === 200);

  await call('POST', '/api/register', { username: 'rv' + T, displayName: 'RV ' + T, password: 'Test!1234' });
  const u = await call('POST', '/api/login', { login: 'rv' + T, password: 'Test!1234' });
  const uid = u.j.user.id, UT = u.j.token;
  ok('Testnutzer', !!uid);

  const r1 = await call('POST', '/api/admin/users/' + uid + '/action', { action: 'role', role: 'admin' }, OT);
  ok('Owner darf Rolle setzen', r1.s === 200);
  const lg = await call('POST', '/api/login', { login: 'rv' + T, password: 'Test!1234' });
  const AT = lg.j.token;
  const r2 = await call('POST', '/api/admin/users/' + uid + '/action', { action: 'tempban', duration: '1d' }, AT);
  ok('Admin darf NICHT bannen (403 owner_only)', r2.s === 403 && r2.j.code === 'owner_only', `s=${r2.s}`);
  const r3 = await call('POST', '/api/admin/users/' + OID + '/action', { action: 'permaban' }, OT);
  ok('Owner unantastbar', r3.s === 403, `s=${r3.s}`);
  const r4 = await call('POST', '/api/admin/users/' + uid + '/action', { action: 'warn', reason: 'RV' }, OT);
  ok('Owner darf verwarnen', r4.s === 200);

  const tb = await call('POST', '/api/admin/users/' + uid + '/action', { action: 'tempban', duration: '1d', reason: 'RV-Test' }, OT);
  ok('Owner tempbannt', tb.s === 200);
  const ban = await call('POST', '/api/login', { login: 'rv' + T, password: 'Test!1234' });
  ok('Ban-Grund + Dauer sichtbar', ban.s === 403 && ban.j.code === 'banned' && !!ban.j.reason && !!ban.j.until,
    JSON.stringify(ban.j).slice(0, 130));
  const ap = await call('POST', '/api/appeal', { login: 'rv' + T, password: 'Test!1234', text: 'Bitte entbannen 💗' });
  ok('Einspruch möglich', ap.s === 200);
  const ub = await call('POST', '/api/admin/users/' + uid + '/action', { action: 'unban', reason: 'RV fertig' }, OT);
  ok('Owner entbannt', ub.s === 200);

  // Aufräumen
  await call('POST', '/api/admin/users/' + uid + '/action', { action: 'role', role: 'user' }, OT);
  console.log('\n' + pass + '/' + (pass + fail) + (fail === 0 ? ' grün 💗' : ' — Fehler: ' + fail));
  process.exit(fail === 0 ? 0 : 1);
})();
