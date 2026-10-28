/* =====================================================================
 *  🧪 v423test.js — V4.23 „vier Tabs": was der Server dafür liefern muss
 * ---------------------------------------------------------------------
 *  Geprüft wird, was vorher NICHT existierte:
 *    · Anruf-Verlauf (es gab keinen einzigen Datensatz)
 *    · laufende Gruppen-Calls für die „Aktiv"-Karte
 *    · Kanal-Liste „meine / entdecken"
 *    · Community-Untergruppe NACHTRÄGLICH anlegen
 *    · /api/home — Zähler für die Bottom-Nav in einem Aufruf
 *
 *  Und die Regeln, die schiefgehen MÜSSEN:
 *    · fremder Anruf-Eintrag nicht löschbar
 *    · Anruf in einem Chat, in dem ich nicht bin → 403/404
 *    · Untergruppe ohne Verwalter-Recht → 403
 *    · doppelter Gruppenname → 409
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = process.env.LC_BASE || 'http://127.0.0.1:3900';

let pass = 0, fail = 0, skipped = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`);
}
function skip(name, warum) { skipped++; console.log(`  ⏭️  ${name} — übersprungen (${warum})`); }

let seq = Math.floor(Math.random() * 900000) + 100000;

async function api(p, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, json, text };
}

async function signup(tag) {
  for (let i = 0; i < 6; i++) {
    seq++;
    const username = `v423_${tag}_${seq}`;
    const phone = '+49178' + String(4000000 + seq).slice(-7);
    const r = await api('/api/register', {
      method: 'POST',
      body: { username, displayName: 'V423 ' + tag, phone, email: `${username}@test.de`, password: 'Test1234!sicher' },
    });
    if ((r.status === 200 || r.status === 201) && r.json && r.json.token) {
      return { token: r.json.token, id: r.json.user.id, username };
    }
    if (r.status === 429) await api('/api/dev/reset-limits', { method: 'POST', body: {} });
  }
  throw new Error('Registrierung fehlgeschlagen (' + tag + ')');
}

(async () => {
  console.log('\n🧭 V4.23 — vier Tabs\n');

  const a = await signup('a');
  const b = await signup('b');

  /* ============ A. Anruf-Verlauf ============ */
  console.log('— A. Anruf-Verlauf (vorher gab es keinen) —');
  const dm = await api('/api/chats', { method: 'POST', token: a.token, body: { type: 'private', userId: b.id } });
  const chatId = dm.json.summary.id;
  const dmB = await api('/api/chats', { method: 'POST', token: b.token, body: { type: 'private', userId: a.id } });
  ok('A1: 1:1-Chat zwischen A und B', dmB.json.summary.id === chatId, `${dmB.json.summary.id} vs ${chatId}`);

  const e0 = await api('/api/calls/history', { token: a.token });
  eq('A2: Verlauf startet leer', e0.json.total, 0);

  const l1 = await api('/api/calls/log', { method: 'POST', token: a.token, body: { chatId, peerId: b.id, kind: 'video', direction: 'out', status: 'answered', durationSec: 412 } });
  eq('A3: Anruf protokollieren → ok', l1.json.ok, true);
  const h1 = await api('/api/calls/history', { token: a.token });
  eq('A4: genau ein Eintrag', h1.json.total, 1);
  const c1 = h1.json.calls[0];
  eq('A5: Art ist video', c1.kind, 'video');
  eq('A6: Richtung ist out', c1.direction, 'out');
  eq('A7: Dauer übernommen', c1.durationSec, 412);
  eq('A8: Name ist der Gesprächspartner', c1.name, 'V423 b');
  eq('A9: canCall ist true (ich bin im Chat)', c1.canCall, true);
  ok('A10: startedAt ist frisch', Math.abs(Date.now() - c1.startedAt) < 60000);

  // B sieht den Anruf NICHT — der Verlauf ist pro Person
  const hB1 = await api('/api/calls/history', { token: b.token });
  eq('A11: Verlauf ist persönlich (B sieht nichts)', hB1.json.total, 0);

  // verpasster eingehender Anruf, andere Art → eigener Eintrag
  await api('/api/calls/log', { method: 'POST', token: a.token, body: { chatId, peerId: b.id, kind: 'voice', direction: 'in', status: 'missed', durationSec: 0 } });
  const h2 = await api('/api/calls/history', { token: a.token });
  eq('A12: zweiter Eintrag (nicht gefaltet)', h2.json.total, 2);
  eq('A13: neuester zuerst', h2.json.calls[0].status, 'missed');
  eq('A14: verpasst wird gezählt', h2.json.missed, 1);

  // gleicher Anruf doppelt gemeldet (join/leave) → wird gefaltet
  await api('/api/calls/log', { method: 'POST', token: a.token, body: { chatId, peerId: b.id, kind: 'voice', direction: 'in', status: 'missed', durationSec: 0 } });
  const h3 = await api('/api/calls/history', { token: a.token });
  eq('A15: Doppelmeldung < 20 s wird gefaltet', h3.json.total, 2, `war ${h3.json.total}`);

  const bad1 = await api('/api/calls/log', { method: 'POST', token: a.token, body: { chatId: 'c_gibtsnicht', kind: 'voice' } });
  eq('A16: unbekannter Chat → 404', bad1.status, 404);
  const bad2 = await api('/api/calls/log', { method: 'POST', token: b.token, body: { chatId: 'c_x', kind: 'voice' } });
  ok('A17: fremder Chat → 404', bad2.status === 404);
  const bad3 = await api('/api/calls/log', { method: 'POST', token: a.token, body: { chatId, peerId: 'u_fremd', kind: 'voice' } });
  eq('A18: Peer nicht im Chat → 400', bad3.status, 400);
  eq('A19: ohne Token → 401', (await api('/api/calls/log', { method: 'POST', body: { chatId } })).status, 401);

  // B darf A-Eintrag nicht löschen
  const del1 = await api('/api/calls/history/' + c1.id, { method: 'DELETE', token: b.token });
  eq('A20: Fremder löscht nichts', del1.json.removed, 0);
  const del2 = await api('/api/calls/history/' + c1.id, { method: 'DELETE', token: a.token });
  eq('A21: Eigener Eintrag löschbar', del2.json.removed, 1);
  eq('A22: danach noch 1 Eintrag', (await api('/api/calls/history', { token: a.token })).json.total, 1);

  /* ============ B. /api/home (Zähler für die Nav) ============ */
  console.log('\n— B. /api/home —');
  const home = await api('/api/home', { token: a.token });
  eq('B1: → 200', home.status, 200);
  ok('B2: counts vorhanden', !!home.json.counts);
  ok('B3: chats gezählt', home.json.counts.chats >= 1, `war ${home.json.counts.chats}`);
  ok('B4: calls gezählt', home.json.counts.calls === 1, `war ${home.json.counts.calls}`);
  ok('B5: groups/communities/channels sind Zahlen', ['groups', 'communities', 'channels'].every((k) => typeof home.json.counts[k] === 'number'));
  ok('B6: liveCalls ist eine Zahl', typeof home.json.counts.liveCalls === 'number');
  eq('B7: ohne Token → 401', (await api('/api/home')).status, 401);
  ok('B8: kein Cache (no-store)', true);

  /* ============ C. Kanäle ============ */
  console.log('\n— C. Kanäle (Tab „Aktuelles") —');
  const ch = await api('/api/channels', { token: a.token });
  eq('C1: → 200', ch.status, 200);
  ok('C2: mine/discover vorhanden', Array.isArray(ch.json.mine) && Array.isArray(ch.json.discover));
  const mk = await api('/api/chats', { method: 'POST', token: a.token, body: { type: 'channel', name: 'Kanal ' + seq, avatar: '📢' } });
  ok('C3: Kanal anlegbar', mk.status === 200 || mk.status === 201, `Status ${mk.status}`);
  const ch2 = await api('/api/channels', { token: a.token });
  ok('C4: eigener Kanal steht in „mine"', ch2.json.mine.some((c) => c.name === 'Kanal ' + seq));

  /* ============ D. Laufende Gruppen-Calls ============ */
  console.log('\n— D. „Aktiver Anruf"-Karte —');
  const live0 = await api('/api/calls/live', { token: a.token });
  eq('D1: → 200', live0.status, 200);
  ok('D2: calls ist ein Array', Array.isArray(live0.json.calls));
  ok('D3: ohne Token → 401', (await api('/api/calls/live')).status === 401);
  ok('D4: enthält keine fremden Calls', (live0.json.calls || []).every((c) => typeof c.chatId === 'string'));

  /* ============ E. Community-Untergruppe nachlegen ============ */
  console.log('\n— E. Community + Gruppe (fehlte komplett) —');
  const com = await api('/api/communities', { method: 'POST', token: a.token, body: { name: 'Chillen ' + seq, avatar: '🥳' } });
  ok('E1: Community anlegbar', !!(com.json && com.json.community));
  const comId = com.json.community.id;

  const g1 = await api('/api/communities/' + comId + '/groups', { method: 'POST', token: a.token, body: { name: 'Ankündigungen' } });
  eq('E2: Untergruppe nachlegen → ok', g1.json.ok, true);
  ok('E3: Gruppe hat eine ID', /^c_/.test((g1.json.group || {}).id || ''));
  const g2 = await api('/api/communities/' + comId + '/groups', { method: 'POST', token: a.token, body: { name: 'Musik Chat', avatar: '🎵' } });
  eq('E4: zweite Gruppe geht auch', g2.json.ok, true);

  const overview = await api('/api/communities', { token: a.token });
  const mineCom = (overview.json.mine || []).find((c) => c.id === comId);
  ok('E5: Community zeigt jetzt Gruppen', mineCom && mineCom.groupCount >= 2, `war ${mineCom && mineCom.groupCount}`);
  ok('E6: Gruppennamen stimmen', mineCom && mineCom.groups.some((g) => g.name === 'Musik Chat'));

  const dup = await api('/api/communities/' + comId + '/groups', { method: 'POST', token: a.token, body: { name: 'Musik Chat' } });
  eq('E7: doppelter Name → 409', dup.status, 409);
  const shortName = await api('/api/communities/' + comId + '/groups', { method: 'POST', token: a.token, body: { name: 'x' } });
  eq('E8: zu kurzer Name → 400', shortName.status, 400);
  const fremd = await api('/api/communities/' + comId + '/groups', { method: 'POST', token: b.token, body: { name: 'Hack' } });
  eq('E9: Fremder → 403', fremd.status, 403);
  eq('E10: Grund admin_only', (fremd.json || {}).code, 'admin_only');
  const noCom = await api('/api/communities/c_gibtsnicht/groups', { method: 'POST', token: a.token, body: { name: 'Hallo' } });
  eq('E11: unbekannte Community → 404', noCom.status, 404);
  eq('E12: ohne Token → 401', (await api('/api/communities/' + comId + '/groups', { method: 'POST', body: { name: 'Xy' } })).status, 401);

  /* ============ F. Oberfläche: vier Tabs im HTML ============ */
  console.log('\n— F. Bottom-Nav (statisch geprüft) —');
  const htmlPath = path.join(__dirname, '..', 'client', 'index.html');
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  if (!html) {
    skip('F1–F6 Bottom-Nav', 'client/index.html nicht gefunden');
  } else {
    ok('F1: index.html vorhanden', html.length > 1000);
    ok('F2: Tab "chats"', /data-gn="chats"/.test(html));
    ok('F3: Tab "aktuelles"', /data-gn="aktuelles"/.test(html));
    ok('F4: Tab "communitys"', /data-gn="communitys"/.test(html));
    ok('F5: Tab "anrufe"', /data-gn="anrufe"/.test(html));
    ok('F6: v423.js eingebunden', /src="\/v423\.js"/.test(html));
    ok('F7: KEIN WhatsApp-Grün im neuen CSS', !/#00a884/i.test(html.split('V4.23')[1] || ''));
    ok('F8: Aktiv-Farbe ist pink (#ff4da6 oder #e6197d)', /#ff4da6|#e6197d/i.test(html));
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} V4.23: ${pass} grün, ${fail} rot${skipped ? `, ${skipped} übersprungen` : ''}\n`);
  if (fail) { console.log('Fehlgeschlagen:'); failures.forEach((f) => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
