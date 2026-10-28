#!/usr/bin/env node
/* =====================================================================
 *  🧪 v417test.js — Status / Stories (24 h) — V4.17
 * ---------------------------------------------------------------------
 *  Der Server konnte das schon (v4.js, /api/moments) — nur ungetestet.
 *  Hier wird JEDE Regel geprüft, die ein Status haben muss:
 *
 *    · Posten (Text, Bild, leer → Fehler)
 *    · 24-h-Ablauf (expiresAt, abgelaufene verschwinden)
 *    · Privacy: public / contacts / private
 *    · Sehen + Zuschauer zählen
 *    · Reaktionen
 *    · Blockieren → unsichtbar
 *    · Gruppierung: eine Person = eine Karte, ich zuerst
 *
 *  Start:  LC_BASE=http://127.0.0.1:3000 node v417test.js
 * ===================================================================== */
const B = process.env.LC_BASE || 'http://127.0.0.1:3000';
const T = Date.now().toString().slice(-7);

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra !== undefined ? '  →  ' + extra : ''}`); }
};

async function call(method, path, body, token, extra) {
  const r = await fetch(B + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(extra || {}),
    },
    body: body === undefined || body === null || method === 'GET' ? undefined : JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}

(async () => {
  console.log(`\n🌸 V4.17 Status/Stories-Test ${T}\n${'='.repeat(58)}`);

  // Rate-Limiter zurücksetzen (sonst 429 beim zweiten Lauf).
  // Die Route verlangt x-internal-token — ohne sie kommt 401 und der Test
  // läuft blind in ein 429. Genau dieser Fehler ist mir hier schon passiert.
  const TOKEN = process.env.INTERNAL_TOKEN || 'testtoken123456789012345678';
  const rst = await call('POST', '/api/dev/reset-limits', {}, null, { 'x-internal-token': TOKEN });
  if (rst.s !== 200) {
    console.log(`  ⚠️  Rate-Limit-Reset ging nicht (HTTP ${rst.s}) — bei 429: INTERNAL_TOKEN setzen`);
  }

  const reg = async (u, name, phone) => {
    const r = await call('POST', '/api/register', {
      username: u, displayName: name, phone, email: `${u}@test.de`, password: 'Test1234!sicher',
    });
    if (r.s === 200 || r.s === 201) return { token: r.j.token, id: r.j.user.id };
    const l = await call('POST', '/api/login', { login: u, password: 'Test1234!sicher' });
    return { token: l.j.token, id: l.j.user.id };
  };

  const n = Number(T.slice(-5));
  const a = await reg('st_a_' + T, 'Anna Status', '+4917610' + (10000 + n));
  const b = await reg('st_b_' + T, 'Ben Blick', '+4917611' + (10000 + n));
  const c = await reg('st_c_' + T, 'Clara Fremd', '+4917612' + (10000 + n));
  ok('Drei Testkonten', !!a.token && !!b.token && !!c.token);

  /* ---------- 1. Text-Status posten ---------- */
  const p1 = await call('POST', '/api/moments', { kind: 'text', text: 'Mein erster Status 🌸' }, a.token);
  ok('Text-Status gepostet', p1.s === 200 && p1.j.ok === true, JSON.stringify(p1.j).slice(0, 100));
  const mo1 = p1.j.moment;
  ok('Status hat eine id', !!mo1.id);
  ok('Status gehört mir', mo1.mine === true);
  ok('Status hat Ablaufzeit', mo1.expiresAt > Date.now(), mo1.expiresAt);
  ok('🔴 Ablauf ist in ~24 h (nicht 24 s)', (() => {
    const h = (mo1.expiresAt - mo1.createdAt) / 3600000;
    return h > 23.9 && h < 24.1;
  })(), ((mo1.expiresAt - mo1.createdAt) / 3600000).toFixed(2) + ' h');

  /* ---------- 2. Leerer Status wird abgelehnt ---------- */
  const empty = await call('POST', '/api/moments', { kind: 'text', text: '   ' }, a.token);
  ok('🔴 Leerer Text-Status → 400', empty.s === 400, `HTTP ${empty.s}`);

  /* ---------- 3. Bild-Status ---------- */
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const pImg = await call('POST', '/api/moments', { kind: 'image', data: tiny }, a.token);
  ok('Bild-Status gepostet', pImg.s === 200 && pImg.j.ok === true, `HTTP ${pImg.s}`);

  const badImg = await call('POST', '/api/moments', { kind: 'image', data: 'kein-bild' }, a.token);
  ok('🔴 Bild ohne data:image → 400', badImg.s === 400, `HTTP ${badImg.s}`);

  /* ---------- 4. Anderer Nutzer sieht ihn ---------- */
  const viewB = await call('GET', '/api/moments', null, b.token);
  const groupsB = viewB.j.groups || [];
  const annaGroup = groupsB.find((g) => g.userId === a.id);
  ok('🔴 Ben sieht Annas Status', !!annaGroup, `${groupsB.length} Gruppen`);
  ok('Gruppe enthält beide Status', annaGroup && annaGroup.moments.length === 2,
    annaGroup && annaGroup.moments.length + ' Status');
  ok('Für Ben sind sie nicht „meine"', annaGroup && annaGroup.mine === false);
  ok('Ungesehen beim ersten Blick', annaGroup && annaGroup.allSeen === false);

  /* ---------- 5. Sehen + Zuschauer ---------- */
  const view1 = await call('POST', `/api/moments/${mo1.id}/view`, {}, b.token);
  ok('Als gesehen markiert', view1.s === 200 && view1.j.viewers === 1, JSON.stringify(view1.j));
  const view2 = await call('POST', `/api/moments/${mo1.id}/view`, {}, b.token);
  ok('🔴 Zweimal ansehen zählt nur einmal', view2.j.viewers === 1, view2.j.viewers + ' Zuschauer');

  const afterSeen = await call('GET', '/api/moments', null, b.token);
  const ag2 = (afterSeen.j.groups || []).find((g) => g.userId === a.id);
  const mo1b = ag2.moments.find((m) => m.id === mo1.id);
  ok('Der Status gilt jetzt als gesehen', mo1b.seen === true);

  /* ---------- 6. Reaktion ---------- */
  const react = await call('POST', `/api/moments/${mo1.id}/react`, { emoji: '😍' }, b.token);
  ok('Reaktion gesendet', react.s === 200, JSON.stringify(react.j).slice(0, 80));
  const mine = await call('GET', '/api/moments', null, a.token);
  const mineGroup = (mine.j.groups || []).find((g) => g.mine);
  const mineMo = mineGroup && mineGroup.moments.find((m) => m.id === mo1.id);
  ok('🔴 Autor sieht die Reaktion', mineMo && Object.values(mineMo.reactions || {}).includes('😍'),
    JSON.stringify(mineMo && mineMo.reactions));
  ok('Autor sieht die Zuschauerzahl', mineMo && mineMo.viewers === 1, mineMo && mineMo.viewers);

  /* ---------- 7. Privacy: private ---------- */
  const pPriv = await call('POST', '/api/moments', { kind: 'text', text: 'Nur für mich 🔒', privacy: 'private' }, a.token);
  ok('Privater Status gepostet', pPriv.s === 200);
  const bPriv = await call('GET', '/api/moments', null, b.token);
  const leaked = (bPriv.j.groups || []).some((g) => g.moments.some((m) => m.text === 'Nur für mich 🔒'));
  ok('🔴 Privater Status für Fremde UNSICHTBAR', leaked === false, leaked ? 'LEAK!' : 'wirklich weg');
  const aPriv = await call('GET', '/api/moments', null, a.token);
  const aSees = (aPriv.j.groups || []).find((g) => g.mine);
  ok('Autor sieht seinen privaten Status', !!aSees && aSees.moments.some((m) => m.text === 'Nur für mich 🔒'));

  /* ---------- 8. Privacy: contacts ---------- */
  const chatAB = await call('POST', '/api/chats', { type: 'private', userId: b.id }, a.token);
  const chatIdAB = chatAB.j.summary && chatAB.j.summary.id;
  const pCont = await call('POST', '/api/moments', { kind: 'text', text: 'Nur für Kontakte 💌', privacy: 'contacts' }, a.token);
  ok('Kontakt-Status gepostet (Chat mit Ben existiert)', pCont.s === 200 && !!chatIdAB);

  const bCont = await call('GET', '/api/moments', null, b.token);
  const bSeesCont = (bCont.j.groups || []).some((g) => g.moments.some((m) => m.text === 'Nur für Kontakte 💌'));
  ok('Kontakt sieht den Kontakt-Status', bSeesCont === true);

  const cCont = await call('GET', '/api/moments', null, c.token);
  const cSeesCont = (cCont.j.groups || []).some((g) => g.moments.some((m) => m.text === 'Nur für Kontakte 💌'));
  ok('🔴 Fremder ohne Chat sieht ihn NICHT', cSeesCont === false, cSeesCont ? 'LEAK!' : 'wirklich weg');

  /* ---------- 9. Blockieren → unsichtbar ---------- */
  const cSeesBefore = await call('GET', '/api/moments', null, c.token);
  const cBefore = (cSeesBefore.j.groups || []).some((g) => g.userId === a.id);
  const blockRes = await call('POST', `/api/users/${a.id}/block`, {}, c.token);
  const cSeesAfter = await call('GET', '/api/moments', null, c.token);
  const cAfter = (cSeesAfter.j.groups || []).some((g) => g.userId === a.id);
  ok('🔴 Nach Blockieren: Status unsichtbar', !cAfter, `Block HTTP ${blockRes.s} · vorher sichtbar: ${cBefore}`);

  /* ---------- 10. Gruppierung ---------- */
  const groups = (mine.j.groups || []);
  ok('Ich stehe in der Liste', groups.some((g) => g.mine));
  const allMine = groups.filter((g) => g.mine);
  ok('🔴 Ich bin genau EINE Karte (nicht pro Status)', allMine.length === 1, allMine.length + ' Karten');
  // Zu diesem Zeitpunkt: Text + Bild. (privat/Kontakte kommen erst später.)
  ok('Meine Karte bündelt mehrere Status', allMine[0] && allMine[0].moments.length === 2,
    allMine[0] && allMine[0].moments.length + ' Status');

  /* ---------- 10b. Nach allen Posts: alle 4 Status auf meiner Karte ---------- */
  const all = await call('GET', '/api/moments', null, a.token);
  const myCard = (all.j.groups || []).find((g) => g.mine);
  ok('🔴 Alle 4 eigenen Status auf EINER Karte', myCard && myCard.moments.length === 4,
    myCard ? myCard.moments.length + ' Status (Text, Bild, privat, Kontakte)' : 'keine Karte');

  /* ---------- 11. TTL-Aufräumen ---------- */
  const ttl = await call('GET', '/api/moments', null, a.token);
  const ttlOk = (ttl.j.groups || []).every((g) => g.moments.every((m) => m.expiresAt > Date.now()));
  ok('🔴 Kein abgelaufener Status in der Liste', ttlOk);

  /* ---------- 12. Ohne Login kein Zugriff ---------- */
  const noAuth = await call('GET', '/api/moments', null, null);
  ok('🔴 Ohne Token → 401', noAuth.s === 401, `HTTP ${noAuth.s}`);

  console.log('\n' + '─'.repeat(58));
  const total = pass + fail;
  if (fail === 0) {
    console.log(`🏁 ${pass}/${total} bestanden`);
    console.log('   Posten · 24 h · Privacy · Zuschauer · Reaktionen · Blocken 💗');
  } else {
    console.log(`❌ ${pass}/${total} bestanden — ${fail} Fehler`);
    process.exit(1);
  }
})().catch((e) => { console.error('💥', e); process.exit(1); });
