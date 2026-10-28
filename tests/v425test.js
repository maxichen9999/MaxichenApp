/* =====================================================================
 *  🧪 v425test.js — V4.25 „Offizieller Lovechen Kanal"
 * ---------------------------------------------------------------------
 *  Was hier geprüft wird — so, dass es weh tut:
 *
 *    · Kanal existiert, heißt „Lovechen 💗", Handle @lovechen_official
 *    · Haken ist ECHT signiert (ECDSA P-256 gegen /api/badges/key geprüft)
 *    · Signatur bindet die Kanal-ID → manipulierte ID = ungültig
 *    · Nur der Inhaber schreibt · Fremder bekommt 403 channel_readonly
 *    · Follower-Zahl zählt hoch, doppelt folgen zählt NICHT doppelt
 *    · Entfolgen zählt runter
 *    · Reaktionen: nur die 6 WhatsApp-Emojis, Text → 400
 *    · gleiche Reaktion zweimal = abgewählt (nicht 2× gezählt)
 *    · Kanal steht NICHT in der Chat-Liste (/api/me) — wie WhatsApp
 *    · Kanal steht in /api/channels (mine oder discover)
 *    · Fremder darf keinen Beitrag löschen · Inhaber darf (für alle)
 *    · ohne Token → 401
 *    · Test-Session-Route ohne INTERNAL_TOKEN → 401
 *
 *  Inhaber-Session: über POST /api/dev/session (nur MAIL_SIMULATE=1),
 *  weil kein Test das Passwort des Inhabers kennen darf.
 * ===================================================================== */
'use strict';

const BASE = process.env.LC_BASE || 'http://127.0.0.1:3900';
const INTERNAL = process.env.INTERNAL_TOKEN || 'testtoken123456789012345678';

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`);
}

let seq = Math.floor(Math.random() * 900000) + 100000;

async function api(p, { method = 'GET', token, body, internal } = {}) {
  const r = await fetch(BASE + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(internal ? { 'x-internal-token': internal } : {}),
    },
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
    const username = `v425_${tag}_${seq}`;
    const phone = '+49179' + String(5000000 + seq).slice(-7);
    const r = await api('/api/register', {
      method: 'POST',
      body: { username, displayName: 'V425 ' + tag, phone, email: `${username}@test.de`, password: 'Test1234!sicher' },
    });
    if ((r.status === 200 || r.status === 201) && r.json && r.json.token) {
      return { token: r.json.token, id: r.json.user.id, username };
    }
    if (r.status === 429) await api('/api/dev/reset-limits', { method: 'POST', body: {}, internal: INTERNAL });
    else break;
  }
  throw new Error('Registrierung fehlgeschlagen für ' + tag);
}

async function ownerSession() {
  const r = await api('/api/dev/session', {
    method: 'POST', internal: INTERNAL, body: { username: 'maxichen' },
  });
  if (r.status !== 200 || !r.json || !r.json.token) throw new Error('Inhaber-Session nicht möglich: ' + r.status + ' ' + r.text.slice(0, 120));
  return { token: r.json.token, id: r.json.user.id, username: 'maxichen', me: r.json.user };
}

/** Prüft eine Kanal-Signatur gegen den öffentlichen Server-Schlüssel. */
function verifyChannelBadge(badge, publicB64) {
  const crypto = require('crypto');
  const data = Buffer.from(
    `LC-CH|${badge.version}|${badge.channelId}|${badge.ownerId}|${badge.avatarHash}|${badge.issuedAt}`,
    'utf8'
  );
  const key = crypto.createPublicKey({ key: Buffer.from(publicB64, 'base64'), format: 'der', type: 'spki' });
  return crypto.verify('sha256', data, key, Buffer.from(badge.signature, 'base64'));
}

(async () => {
  console.log('\n📢 V4.25 — Offizieller Lovechen Kanal\n');
  console.log('— A. Kanal existiert und ist verifiziert —');

  let owner;
  try {
    owner = await ownerSession();
    ok('A0: Inhaber-Test-Session (maxichen)', true);
  } catch (e) {
    ok('A0: Inhaber-Test-Session (maxichen)', false, e.message);
    console.log('\n❌ Ohne Inhaber-Session ist der Rest nicht prüfbar.\n');
    process.exit(1);
  }

  const fan = await signup('fan');
  const stranger = await signup('stranger');

  const off = await api('/api/channels/official', { token: fan.token });
  ok('A1: GET /api/channels/official → 200', off.status === 200, `HTTP ${off.status}`);
  const chan = off.json && off.json.channel;
  ok('A2: ID ist die feste offizielle ID', chan && chan.id === 'c_lovechen_official', chan && chan.id);
  ok('A3: Name „Lovechen 💗"', chan && chan.name === 'Lovechen 💗', chan && chan.name);
  ok('A4: Handle @lovechen_official', chan && chan.handle === '@lovechen_official', chan && chan.handle);
  ok('A5: verified === true', chan && chan.verified === true);
  ok('A6: official === true', chan && chan.official === true);
  /* 🔧 V4.31 — seit der WhatsApp-Anmeldung darf der Inhaber seinen Anzeigenamen
   * selbst wählen („Maxichen", „Maxi", …). Geprüft wird deshalb: der Kanal
   * gehört dem Inhaber-Konto (@maxichen), nicht ein fest verdrahteter Name. */
  /* 🔧 V4.31 — der Anzeigename ist seit der WhatsApp-Anmeldung frei wählbar.
   * Geprüft wird deshalb die ID des Inhaber-Kontos, nicht ein Text. */
  ok('A7: Inhaber ist maxichen', chan && chan.ownerId === owner.id, chan && (chan.ownerId + ' vs ' + owner.id));
  ok('A8: Beschreibung vorhanden', chan && String(chan.description).length > 20);
  ok('A9: genau 6 Reaktionen', chan && Array.isArray(chan.reactions) && chan.reactions.length === 6, chan && (chan.reactions || []).length);
  eq('A10: Reaktionen = WhatsApp-Satz', chan && chan.reactions, ['❤️', '😍', '😂', '😮', '😢', '🙏']);

  console.log('\n— B. Der Haken ist wirklich signiert (nicht nur ein Boolean) —');

  const keyRes = await api('/api/badges/key');
  const publicB64 = keyRes.json && keyRes.json.publicKey;
  ok('B1: Server gibt öffentlichen Schlüssel', !!publicB64, `HTTP ${keyRes.status}`);
  const badge = off.json && off.json.badge;
  ok('B2: Kanal-Badge vorhanden', !!badge);
  ok('B3: Nutzlast-Format dokumentiert', badge && badge.payloadFormat === 'LC-CH|version|channelId|ownerId|avatarHash|issuedAt');
  ok('B4: Signatur ist gültig (ECDSA P-256)', badge && verifyChannelBadge(badge, publicB64) === true);
  // Manipulation: Kanal-ID austauschen → Signatur muss brechen
  const forged = badge && { ...badge, channelId: 'c_evil_channel' };
  ok('B5: manipulierte Kanal-ID → Signatur ungültig', forged && verifyChannelBadge(forged, publicB64) === false);
  const forged2 = badge && { ...badge, ownerId: 'u_evil' };
  ok('B6: manipulierter Inhaber → Signatur ungültig', forged2 && verifyChannelBadge(forged2, publicB64) === false);
  // Domänentrennung: Nutzer-Haken darf NICHT als Kanal-Haken durchgehen
  const userBadges = await api('/api/badges', { token: owner.token });
  const ownerBadgeStr = userBadges.json && userBadges.json.badges && userBadges.json.badges[owner.id];
  ok('B7: Nutzer-Haken existiert (Vergleichsobjekt)', !!ownerBadgeStr, `HTTP ${userBadges.status}`);
  ok('B8: Kanal-Signatur ≠ Nutzer-Signatur', !!(badge && ownerBadgeStr) && !ownerBadgeStr.includes(badge.signature));

  console.log('\n— C. Nur der Inhaber schreibt —');

  const fanPost = await api('/api/channels/c_lovechen_official/messages', {
    method: 'POST', token: fan.token, body: { text: 'Ich will schreiben!' },
  });
  ok('C1: Fremder → 403', fanPost.status === 403, `HTTP ${fanPost.status}`);
  ok('C2: Code channel_readonly', fanPost.json && fanPost.json.code === 'channel_readonly', fanPost.json && fanPost.json.code);

  const ownerPost = await api('/api/channels/c_lovechen_official/messages', {
    method: 'POST', token: owner.token, body: { text: 'Neues aus dem LoveChat-Labor 💗 V4.25 ist da!' },
  });
  ok('C3: Inhaber → 201', ownerPost.status === 201, `HTTP ${ownerPost.status} ${(ownerPost.text || '').slice(0, 100)}`);
  const postId = ownerPost.json && ownerPost.json.message && ownerPost.json.message.id;

  // Auch die allgemeine Chat-Route muss Kanäle schreibgeschützt halten
  const fanGeneric = await api('/api/chats/c_lovechen_official/messages', {
    method: 'POST', token: fan.token, body: { text: 'über die andere Route' },
  });
  ok('C4: Fremder über /api/chats/:id/messages → 403', fanGeneric.status === 403, `HTTP ${fanGeneric.status}`);

  console.log('\n— D. Lesen, Follower, Reaktionen —');

  const msgs = await api('/api/channels/c_lovechen_official/messages', { token: fan.token });
  ok('D1: Fremder darf lesen → 200', msgs.status === 200, `HTTP ${msgs.status}`);
  ok('D2: Beitrag ist in der Liste', msgs.json && msgs.json.messages.some((m) => m.id === postId));
  ok('D3: canPost false für Fremden', msgs.json && msgs.json.canPost === false);
  ok('D4: Hinweis „Nur Admins können schreiben"', msgs.json && /Nur Admins können schreiben/.test(msgs.json.readonlyHint || ''), msgs.json && msgs.json.readonlyHint);
  const ownerMsgs = await api('/api/channels/c_lovechen_official/messages', { token: owner.token });
  ok('D5: canPost true für Inhaber', ownerMsgs.json && ownerMsgs.json.canPost === true);

  const before = chan.followers;
  const f1 = await api('/api/channels/c_lovechen_official/follow', { method: 'POST', token: fan.token, body: {} });
  ok('D6: Folgen → 200', f1.status === 200, `HTTP ${f1.status}`);
  eq('D7: Follower +1', f1.json && f1.json.followers, before + 1);
  const f2 = await api('/api/channels/c_lovechen_official/follow', { method: 'POST', token: fan.token, body: {} });
  eq('D8: zweimal folgen zählt NICHT doppelt', f2.json && f2.json.followers, before + 1);
  ok('D9: added = 0 beim zweiten Mal', f2.json && f2.json.added === 0);

  const reactOk = await api(`/api/channels/c_lovechen_official/messages/${postId}/react`, {
    method: 'POST', token: fan.token, body: { emoji: '❤️' },
  });
  ok('D10: Reaktion ❤️ → 200', reactOk.status === 200, `HTTP ${reactOk.status}`);
  ok('D11: meine Reaktion gespeichert', reactOk.json && reactOk.json.mine === '❤️');
  const reactBad = await api(`/api/channels/c_lovechen_official/messages/${postId}/react`, {
    method: 'POST', token: fan.token, body: { emoji: 'haha' },
  });
  ok('D12: Text als Reaktion → 400', reactBad.status === 400, `HTTP ${reactBad.status}`);
  const reactBad2 = await api(`/api/channels/c_lovechen_official/messages/${postId}/react`, {
    method: 'POST', token: fan.token, body: { emoji: '🚀' },
  });
  ok('D13: fremdes Emoji → 400', reactBad2.status === 400, `HTTP ${reactBad2.status}`);
  const reactToggle = await api(`/api/channels/c_lovechen_official/messages/${postId}/react`, {
    method: 'POST', token: fan.token, body: { emoji: '❤️' },
  });
  ok('D14: gleiche Reaktion nochmal = abgewählt', reactToggle.status === 200 && reactToggle.json.mine === null, JSON.stringify(reactToggle.json && reactToggle.json.mine));

  console.log('\n— E. Kanal nicht in der Chat-Liste (wie WhatsApp) —');

  const meFan = await api('/api/me', { token: fan.token });
  const chatIds = ((meFan.json && meFan.json.chats) || []).map((c) => c.id);
  ok('E1: /api/me → 200', meFan.status === 200, `HTTP ${meFan.status}`);
  ok('E2: Kanal NICHT in der Chat-Liste', !chatIds.includes('c_lovechen_official'), chatIds.slice(0, 5).join(','));
  const chans = await api('/api/channels', { token: fan.token });
  const inMine = ((chans.json && chans.json.mine) || []).some((c) => c.id === 'c_lovechen_official');
  const inDiscover = ((chans.json && chans.json.discover) || []).some((c) => c.id === 'c_lovechen_official');
  ok('E3: Kanal steht in /api/channels (mine oder discover)', inMine || inDiscover, `mine=${inMine} discover=${inDiscover}`);
  ok('E4: als Follower in „mine"', inMine, `mine=${inMine}`);

  console.log('\n— F. Aufräumen: Löschen für alle —');

  const fanDel = await api(`/api/channels/c_lovechen_official/messages/${postId}`, { method: 'DELETE', token: stranger.token });
  ok('F1: Fremder löschen → 403', fanDel.status === 403, `HTTP ${fanDel.status}`);
  const ownerDel = await api(`/api/channels/c_lovechen_official/messages/${postId}`, { method: 'DELETE', token: owner.token });
  ok('F2: Inhaber löschen → 200', ownerDel.status === 200, `HTTP ${ownerDel.status}`);
  ok('F3: deletedForEveryone true', ownerDel.json && ownerDel.json.deletedForEveryone === true);
  const afterDel = await api('/api/channels/c_lovechen_official/messages', { token: fan.token });
  ok('F4: Beitrag ist weg', afterDel.json && !afterDel.json.messages.some((m) => m.id === postId));

  const unf = await api('/api/channels/c_lovechen_official/unfollow', { method: 'POST', token: fan.token, body: {} });
  eq('F5: Entfolgen zählt runter', unf.json && unf.json.followers, before);
  const unf2 = await api('/api/channels/c_lovechen_official/unfollow', { method: 'POST', token: fan.token, body: {} });
  eq('F6: zweimal entfolgen ändert nichts', unf2.json && unf2.json.followers, before);

  console.log('\n— G. Zugriffsschutz —');

  const noToken = await api('/api/channels/official');
  ok('G1: ohne Token → 401', noToken.status === 401, `HTTP ${noToken.status}`);
  const noTokenPost = await api('/api/channels/c_lovechen_official/messages', { method: 'POST', body: { text: 'x' } });
  ok('G2: ohne Token schreiben → 401', noTokenPost.status === 401, `HTTP ${noTokenPost.status}`);
  const devNo = await api('/api/dev/session', { method: 'POST', body: { username: 'maxichen' } });
  ok('G3: Test-Session ohne INTERNAL_TOKEN → 401', devNo.status === 401, `HTTP ${devNo.status}`);
  const devBad = await api('/api/dev/session', { method: 'POST', internal: 'falsch', body: { username: 'maxichen' } });
  ok('G4: Test-Session mit falschem Token → 401', devBad.status === 401, `HTTP ${devBad.status}`);
  const notChannel = await api('/api/channels/' + encodeURIComponent('c_gibtsnicht') + '/messages', { token: fan.token });
  ok('G5: unbekannter Kanal → 404', notChannel.status === 404, `HTTP ${notChannel.status}`);

  console.log(`\n${fail === 0 ? '✅' : '❌'} V4.25: ${pass} grün, ${fail} rot`);
  if (fail) { console.log('\nFehlgeschlagen:'); failures.forEach((f) => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ v425test abgebrochen:', e); process.exit(1); });
