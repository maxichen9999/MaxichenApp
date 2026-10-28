/* =====================================================================
 *  🧪 v421test.js — V4.21 Block C: Rechte, Einladungen, Communities
 * ---------------------------------------------------------------------
 *  Geprüft wird mit ECHTEN Konten gegen einen laufenden Server, nicht
 *  mit Attrappen. Jeder Test legt an, was er braucht, und prüft dann
 *  die Regel — inklusive der Fälle, die schiefgehen MÜSSEN:
 *
 *    · Fremder darf nicht kicken        → 403/404
 *    · Mitglied darf nicht kicken       → 403
 *    · Inhaber kann nicht gekickt werden→ 403
 *    · Verwalter kann Verwalter nicht kicken (nur Inhaber) → 403
 *    · Ankündigungsmodus blockt Mitglieder → 403 announce_only
 *    · Rausgeworfener kommt per Link nicht zurück → 403 kicked
 *
 *  Läuft gegen: LC_BASE=http://127.0.0.1:3900
 * ===================================================================== */
'use strict';

const BASE = process.env.LC_BASE || 'http://127.0.0.1:3900';

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected),
    `erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`);
}

let seq = Math.floor(Math.random() * 900000) + 100000;

async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* kein JSON */ }
  return { status: r.status, json, text };
}

async function signup(tag) {
  seq++;
  const username = `c_${tag}_${seq}`;
  const password = 'Test1234!sicher';
  const phone = '+49177' + String(2000000 + seq).slice(-7);
  const r = await api('/api/register', {
    method: 'POST',
    body: { username, displayName: 'C ' + tag, phone, email: `${username}@test.de`, password },
  });
  if ((r.status === 200 || r.status === 201) && r.json.token) {
    return { token: r.json.token, id: r.json.user.id, username, password, phone };
  }
  const l = await api('/api/login', { method: 'POST', body: { login: username, password } });
  if (l.json && l.json.token) return { token: l.json.token, id: l.json.user.id, username, password, phone };
  throw new Error('Konto konnte nicht angelegt werden: ' + r.status + ' ' + r.text.slice(0, 160));
}

async function main() {
  console.log(`\n👑 V4.21 Block C gegen ${BASE}\n`);

  const owner = await signup('owner');
  const admin = await signup('admin');
  const member = await signup('member');
  const stranger = await signup('stranger');
  ok('vier Testkonten angelegt', !!(owner.token && admin.token && member.token && stranger.token));

  /* ================= 1. Chat anlegen ================= */
  console.log('\n📛 1. Name + Beschreibung');
  const created = await api('/api/chats', {
    method: 'POST', token: owner.token,
    body: { type: 'group', name: 'Block-C-Test', description: 'vorher', memberIds: [admin.id, member.id] },
  });
  ok('Gruppe angelegt', created.status === 200 && created.json.summary, `${created.status}`);
  const chatId = created.json.summary.id;
  eq('Standard: Ankündigung aus', created.json.summary.announce, false);
  eq('Chatliste kennt meine Rolle', created.json.summary.myRole, 'owner');
  ok('Chatliste kennt die Verwalter', Array.isArray(created.json.summary.adminIds));

  const noName = await api(`/api/chats/${chatId}`, { method: 'PUT', token: owner.token, body: { name: 'x' } });
  eq('Name zu kurz → 400', noName.status, 400);
  eq('Grund wird genannt', noName.json.code, 'bad_name');

  const longName = await api(`/api/chats/${chatId}`, { method: 'PUT', token: owner.token, body: { name: 'y'.repeat(41) } });
  eq('Name zu lang → 400', longName.status, 400);

  const renamed = await api(`/api/chats/${chatId}`, { method: 'PUT', token: owner.token, body: { name: 'Block-C-Neu', description: 'Eine echte Beschreibung 💗' } });
  eq('Umbenennen → 200', renamed.status, 200);
  eq('Name geändert', renamed.json.chat.name, 'Block-C-Neu');
  eq('Beschreibung geändert', renamed.json.chat.description, 'Eine echte Beschreibung 💗');
  ok('changed nennt beide Felder', renamed.json.changed.includes('name') && renamed.json.changed.includes('description'));

  const memberRename = await api(`/api/chats/${chatId}`, { method: 'PUT', token: member.token, body: { name: 'Hack' } });
  eq('Mitglied darf nicht umbenennen → 403', memberRename.status, 403);

  const strangerRename = await api(`/api/chats/${chatId}`, { method: 'PUT', token: stranger.token, body: { name: 'Hack' } });
  ok('Fremder bekommt 403/404', [403, 404].includes(strangerRename.status), `${strangerRename.status}`);

  const descLong = await api(`/api/chats/${chatId}`, { method: 'PUT', token: owner.token, body: { description: 'z'.repeat(500) } });
  eq('Beschreibung wird auf 200 gekürzt', descLong.json.chat.description.length, 200);

  const nothing = await api(`/api/chats/${chatId}`, { method: 'PUT', token: owner.token, body: {} });
  eq('leerer Aufruf → 400', nothing.status, 400);
  eq('Grund: nothing', nothing.json.code, 'nothing');

  /* ================= 2. Verwalter ================= */
  console.log('\n🛡️ 2. Verwalter geben/nehmen');
  const prom = await api(`/api/chats/${chatId}/admins`, { method: 'POST', token: owner.token, body: { userId: admin.id, on: true } });
  eq('Inhaber befördert → 200', prom.status, 200);
  ok('adminIds enthält den Neuen', prom.json.adminIds.includes(admin.id));
  eq('meine Rolle als Inhaber', prom.json.chat.myRole, 'owner');

  const promAgain = await api(`/api/chats/${chatId}/admins`, { method: 'POST', token: owner.token, body: { userId: admin.id, on: true } });
  eq('zweimal befördern ist kein Fehler', promAgain.status, 200);
  eq('sondern idempotent', promAgain.json.idempotent, true);

  const promStranger = await api(`/api/chats/${chatId}/admins`, { method: 'POST', token: owner.token, body: { userId: stranger.id, on: true } });
  eq('Nicht-Mitglied befördern → 400', promStranger.status, 400);
  eq('Grund: not_member', promStranger.json.code, 'not_member');

  const promOwner = await api(`/api/chats/${chatId}/admins`, { method: 'POST', token: owner.token, body: { userId: owner.id, on: true } });
  eq('Inhaber ist immer Verwalter → 400', promOwner.status, 400);
  eq('Grund: is_owner', promOwner.json.code, 'is_owner');

  const promByMember = await api(`/api/chats/${chatId}/admins`, { method: 'POST', token: member.token, body: { userId: member.id, on: true } });
  eq('Mitglied kann sich nicht selbst befördern → 403', promByMember.status, 403);

  // Verwalter befördert Mitglied — erlaubt (wie WhatsApp)
  const promByAdmin = await api(`/api/chats/${chatId}/admins`, { method: 'POST', token: admin.token, body: { userId: member.id, on: true } });
  eq('Verwalter darf befördern → 200', promByAdmin.status, 200);

  // Verwalter straft Verwalter ab — verboten
  const demoteByAdmin = await api(`/api/chats/${chatId}/admins`, { method: 'POST', token: admin.token, body: { userId: member.id, on: false } });
  eq('Verwalter darf anderen Verwalter NICHT zurückstufen → 403', demoteByAdmin.status, 403);
  eq('Grund: only_owner_demotes', demoteByAdmin.json.code, 'only_owner_demotes');

  // Inhaber darf
  const demoteByOwner = await api(`/api/chats/${chatId}/admins`, { method: 'POST', token: owner.token, body: { userId: member.id, on: false } });
  eq('Inhaber straft ab → 200', demoteByOwner.status, 200);
  ok('adminIds enthält member nicht mehr', !demoteByOwner.json.adminIds.includes(member.id));

  /* ================= 3. Ankündigungsmodus ================= */
  console.log('\n📢 3. Ankündigungsmodus');
  const annByMember = await api(`/api/chats/${chatId}/announce`, { method: 'PUT', token: member.token, body: { on: true } });
  eq('Mitglied darf nicht schalten → 403', annByMember.status, 403);

  const annOn = await api(`/api/chats/${chatId}/announce`, { method: 'PUT', token: owner.token, body: { on: true } });
  eq('Inhaber schaltet an → 200', annOn.status, 200);
  eq('announce ist an', annOn.json.announce, true);

  const msgByMember = await api(`/api/chats/${chatId}/messages`, { method: 'POST', token: member.token, body: { text: 'darf ich?' } });
  eq('Mitglied kann nicht mehr schreiben → 403', msgByMember.status, 403);
  eq('Grund: announce_only', msgByMember.json.code, 'announce_only');

  const msgByAdmin = await api(`/api/chats/${chatId}/messages`, { method: 'POST', token: admin.token, body: { text: 'Ankündigung: Filmabend 21 Uhr 🍿' } });
  ok('Verwalter darf schreiben', msgByAdmin.status === 200, `${msgByAdmin.status}`);

  const msgByOwner = await api(`/api/chats/${chatId}/messages`, { method: 'POST', token: owner.token, body: { text: 'Und ich auch 💗' } });
  ok('Inhaber darf schreiben', msgByOwner.status === 200);

  const annOff = await api(`/api/chats/${chatId}/announce`, { method: 'PUT', token: owner.token, body: { on: false } });
  eq('wieder aus', annOff.json.announce, false);
  const msgAfter = await api(`/api/chats/${chatId}/messages`, { method: 'POST', token: member.token, body: { text: 'jetzt wieder' } });
  ok('Mitglied darf wieder schreiben', msgAfter.status === 200, `${msgAfter.status}`);

  const annChannel = await api(`/api/chats/${chatId}/announce`, { method: 'PUT', token: stranger.token, body: { on: true } });
  ok('Fremder darf nicht schalten', [403, 404].includes(annChannel.status));

  /* ================= 4. Kick ================= */
  console.log('\n🚪 4. Rauswerfen');
  const kickByMember = await api(`/api/chats/${chatId}/members/${admin.id}`, { method: 'DELETE', token: member.token });
  eq('Mitglied darf nicht kicken → 403', kickByMember.status, 403);

  const kickStranger = await api(`/api/chats/${chatId}/members/${admin.id}`, { method: 'DELETE', token: stranger.token });
  ok('Fremder darf nicht kicken', [403, 404].includes(kickStranger.status), `${kickStranger.status}`);

  const kickOwner = await api(`/api/chats/${chatId}/members/${owner.id}`, { method: 'DELETE', token: admin.token });
  eq('Inhaber kann nicht gekickt werden → 403', kickOwner.status, 403);
  eq('Grund: cannot_kick_owner', kickOwner.json.code, 'cannot_kick_owner');

  const kickSelf = await api(`/api/chats/${chatId}/members/${admin.id}`, { method: 'DELETE', token: admin.token });
  eq('sich selbst kicken → 400', kickSelf.status, 400);
  eq('Grund: cannot_kick_self', kickSelf.json.code, 'cannot_kick_self');

  const kickGhost = await api(`/api/chats/${chatId}/members/${stranger.id}`, { method: 'DELETE', token: owner.token });
  eq('Nicht-Mitglied kicken → 404', kickGhost.status, 404);
  eq('Grund: not_member', kickGhost.json.code, 'not_member');

  // Verwalter kickt Mitglied: erlaubt
  const kickOk = await api(`/api/chats/${chatId}/members/${member.id}`, { method: 'DELETE', token: admin.token });
  eq('Verwalter kickt Mitglied → 200', kickOk.status, 200);
  eq('Mitglied ist raus', kickOk.json.removed, member.id);

  const memberSee = await api(`/api/chats/${chatId}`, { token: member.token });
  ok('Rausgeworfener sieht den Chat nicht mehr', [403, 404].includes(memberSee.status), `${memberSee.status}`);

  const memberPost = await api(`/api/chats/${chatId}/messages`, { method: 'POST', token: member.token, body: { text: 'hallo?' } });
  ok('Rausgeworfener kann nicht mehr schreiben', [403, 404].includes(memberPost.status));

  // Nachricht im Chat
  const feed = await api(`/api/chats/${chatId}/messages`, { token: owner.token });
  const sys = (feed.json.messages || feed.json || []).filter
    ? (Array.isArray(feed.json) ? feed.json : feed.json.messages || [])
    : [];
  ok('Systemnachricht zum Kick existiert',
    sys.some((m) => (m.text || '').includes('entfernt')), `Nachrichten: ${sys.length}`);

  /* ================= 5. Einladungslink ================= */
  console.log('\n🔗 5. Einladungslink pro Chat');
  const invByMember = await api(`/api/chats/${chatId}/invite`, { method: 'POST', token: member.token });
  eq('Rausgeworfener darf keinen Link erzeugen → 403', invByMember.status, 403);

  const inv = await api(`/api/chats/${chatId}/invite`, { method: 'POST', token: owner.token });
  eq('Inhaber erzeugt Link → 200', inv.status, 200);
  ok('Code hat 10 Hex-Zeichen', /^[0-9a-f]{10}$/.test(inv.json.code), inv.json.code);
  ok('Link zeigt auf /join/', inv.json.link.includes('/join/' + inv.json.code));

  const preview = await api(`/api/chats/invite/${inv.json.code}`);
  eq('Vorschau ohne Login → 200', preview.status, 200);
  eq('Vorschau zeigt den Namen', preview.json.name, 'Block-C-Neu');
  ok('Vorschau nennt den Einlader', typeof preview.json.invitedBy === 'string' && preview.json.invitedBy.length > 0, preview.json.invitedBy);
  ok('Vorschau nennt die Mitgliederzahl', typeof preview.json.memberCount === 'number');

  const joinStranger = await api(`/api/chats/invite/${inv.json.code}`, { method: 'POST', token: stranger.token });
  eq('Fremder tritt bei → 200', joinStranger.status, 200);
  eq('joined ist true', joinStranger.json.joined, true);

  const joinAgain = await api(`/api/chats/invite/${inv.json.code}`, { method: 'POST', token: stranger.token });
  eq('zweiter Beitritt ist kein Fehler → 200', joinAgain.status, 200);
  eq('sondern alreadyMember', joinAgain.json.alreadyMember, true);

  const kickBack = await api(`/api/chats/invite/${inv.json.code}`, { method: 'POST', token: member.token });
  eq('Rausgeworfener kommt NICHT zurück → 403', kickBack.status, 403);
  eq('Grund: kicked', kickBack.json.code, 'kicked');

  const unban = await api(`/api/chats/${chatId}/kicked/${member.id}`, { method: 'DELETE', token: owner.token });
  eq('Inhaber hebt die Sperre auf → 200', unban.status, 200);
  const backAgain = await api(`/api/chats/invite/${inv.json.code}`, { method: 'POST', token: member.token });
  eq('jetzt kommt er wieder rein → 200', backAgain.status, 200);

  const newInv = await api(`/api/chats/${chatId}/invite`, { method: 'POST', token: owner.token });
  ok('neuer Link hat anderen Code', newInv.json.code !== inv.json.code);
  const oldCode = await api(`/api/chats/invite/${inv.json.code}`);
  eq('alter Link ist damit tot → 404', oldCode.status, 404);

  const listInv = await api(`/api/chats/${chatId}/invite`, { token: owner.token });
  eq('Verwalter sieht genau einen aktiven Link', listInv.json.invites.length, 1);

  const listByMember = await api(`/api/chats/${chatId}/invite`, { token: member.token });
  eq('Mitglied sieht die Linkliste nicht → 403', listByMember.status, 403);

  const revoke = await api(`/api/chats/${chatId}/invite`, { method: 'DELETE', token: owner.token });
  ok('Link widerrufen → 200', revoke.status === 200);
  const afterRevoke = await api(`/api/chats/invite/${newInv.json.code}`);
  eq('nach Widerruf → 404', afterRevoke.status, 404);

  const badCode = await api('/api/chats/invite/0000000000');
  eq('unbekannter Code → 404', badCode.status, 404);
  eq('Grund: invite_unknown', badCode.json.code, 'invite_unknown');

  /* ================= 6. Communities ================= */
  console.log('\n🏰 6. Communities');
  const comm = await api('/api/communities', {
    method: 'POST', token: owner.token,
    body: { name: 'Movie Crew 🍿', description: 'Filme, Serien, Popcorn', groups: ['Allgemein', 'Spoiler', 'Watchparty'] },
  });
  eq('Community anlegen → 200', comm.status, 200);
  eq('Typ ist community', comm.json.community.type, 'community');
  eq('drei Startgruppen', comm.json.groups.length, 3);
  ok('Ankündigungen sind Standard', comm.json.community.announce === true);

  const commId = comm.json.community.id;
  const noGroups = await api('/api/communities', { method: 'POST', token: owner.token, body: { name: 'Leer' } });
  eq('Community ohne Gruppen → 200', noGroups.status, 200);
  eq('und ohne Untergruppen', noGroups.json.groups.length, 0);

  const badComm = await api('/api/communities', { method: 'POST', token: owner.token, body: { name: 'x' } });
  eq('Name zu kurz → 400', badComm.status, 400);

  const list = await api('/api/communities', { token: owner.token });
  eq('Liste → 200', list.status, 200);
  ok('meine Community ist drin', list.json.mine.some((c) => c.id === commId));
  const mine = list.json.mine.find((c) => c.id === commId);
  eq('Liste zeigt die Gruppen', mine.groups.length, 3);
  ok('jede Gruppe nennt isMember', mine.groups.every((g) => typeof g.isMember === 'boolean'));
  eq('meine Rolle', mine.myRole, 'owner');

  const listStranger = await api('/api/communities', { token: stranger.token });
  ok('Fremde sehen sie unter "entdecken"', listStranger.json.discover.some((c) => c.id === commId));
  ok('und nicht unter "meine"', !listStranger.json.mine.some((c) => c.id === commId));

  // In der Community schreiben: nur Verwalter (announce an)
  const commMsgMember = await api(`/api/chats/${commId}/messages`, { method: 'POST', token: member.token, body: { text: 'hi' } });
  ok('Nicht-Mitglied kann in Community nicht schreiben', [403, 404].includes(commMsgMember.status), `${commMsgMember.status}`);

  // Verlassen
  const leaveOwner = await api(`/api/communities/${commId}/leave`, { method: 'POST', token: owner.token });
  eq('Inhaber kann nicht verlassen → 400', leaveOwner.status, 400);
  eq('Grund: owner_leave', leaveOwner.json.code, 'owner_leave');

  const leaveStranger = await api(`/api/communities/${commId}/leave`, { method: 'POST', token: stranger.token });
  eq('Fremder verlässt → 200', leaveStranger.status, 200);
  eq('und war in keiner Untergruppe', leaveStranger.json.groupsLeft, 0);

  const leaveUnknown = await api('/api/communities/gibtsnicht/leave', { method: 'POST', token: owner.token });
  eq('unbekannte Community → 404', leaveUnknown.status, 404);

  // Untergruppe anlegen (war schon da, jetzt gegengeprüft)
  const sub = await api(`/api/chats/${commId}/groups`, { method: 'POST', token: owner.token, body: { name: 'Neu 📺' } });
  ok('Untergruppe anlegen funktioniert weiterhin', sub.status === 200, `${sub.status}`);
  const subByMember = await api(`/api/chats/${commId}/groups`, { method: 'POST', token: member.token, body: { name: 'Hack' } });
  ok('Mitglied darf keine Untergruppe anlegen', [403, 404].includes(subByMember.status));

  /* ================= 7. Nichts Altes kaputt ================= */
  console.log('\n🔁 7. Alte Funktionen unberührt');
  const priv = await api('/api/chats', { method: 'POST', token: owner.token, body: { type: 'private', userId: admin.id } });
  ok('privater Chat geht weiter', priv.status === 200, `${priv.status}`);
  const privRename = await api(`/api/chats/${priv.json.summary.id}`, { method: 'PUT', token: owner.token, body: { name: 'X' } });
  eq('privater Chat lässt sich nicht umbenennen → 400', privRename.status, 400);

  const channel = await api('/api/chats', { method: 'POST', token: owner.token, body: { type: 'channel', name: 'Kanal-Test' } });
  ok('Kanal anlegen geht weiter', channel.status === 200);
  const chanAnnounce = await api(`/api/chats/${channel.json.summary.id}/announce`, { method: 'PUT', token: owner.token, body: { on: true } });
  eq('Kanal braucht keinen Ankündigungs-Schalter → 400', chanAnnounce.status, 400);
  eq('Grund: always_announce', chanAnnounce.json.code, 'always_announce');

  const chanKickNone = await api(`/api/chats/${channel.json.summary.id}/members/${stranger.id}`, { method: 'DELETE', token: owner.token });
  eq('Nicht-Mitglied im Kanal kicken → 404', chanKickNone.status, 404);

  const stillLatest = await api('/api/downloads/latest');
  eq('V4.20-Downloads laufen weiter → 200', stillLatest.status, 200);

  const bg = await api('/api/backgrounds', { token: owner.token });
  eq('V4.19-Hintergründe laufen weiter → 200', bg.status, 200);

  /* ================= Ergebnis ================= */
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`V4.21 Block C: ${pass}/${pass + fail} grün${fail ? `, ${fail} rot` : ''}`);
  if (fail) { console.log('Fehlgeschlagen:'); failures.forEach((f) => console.log('  · ' + f)); }
  console.log('');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('💥 Abgebrochen:', e); process.exit(1); });
