#!/usr/bin/env node
/* =====================================================================
 *  🧪 v418test.js — Block A: Anhänge, Selbstlöschung, Einmalansicht,
 *                    Archiv, Export, Entwurf, Ton — V4.18
 * ---------------------------------------------------------------------
 *  WICHTIG (ehrlich): Fast alles hier war im Server schon fertig.
 *  V4.18 hat die Oberfläche gebaut. Dieser Test beweist, dass die
 *  Endpunkte wirklich tun, was die neue UI ihnen abverlangt:
 *
 *    · 🎞️ Video / 📄 Datei / 🎙️ Sprache (Wellenform) / 📍 Standort
 *      / 👤 Kontakt / 🎁 GIF  → ankommen + Felder bleiben erhalten
 *    · ⏱️ Auto-Delete: setzen, lesen, Rechte (nur Admin), Grenzen
 *    · 🔥 Einmalansicht: empfangen → 1× ansehen → Inhalt wirklich weg
 *    · 📥 Archiv: pro Nutzer, nicht für andere sichtbar
 *    · ⬇️ Export: enthält Chats + Nachrichten
 *    · 🔵 Ungelesen markieren
 *    · 🔔 Ton-Einstellungen (sound/soundVol) in /api/me
 *    · 🚫 Blockliste
 *    · 💻 Sessions
 *
 *  Start:  LC_BASE=http://127.0.0.1:3900 node v418test.js
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

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const TXT = 'data:text/plain;base64,' + Buffer.from('Hallo aus LoveChat 💗').toString('base64');
const VCF = 'data:text/vcard;base64,' + Buffer.from('BEGIN:VCARD\nVERSION:3.0\nFN:Anna\nEND:VCARD').toString('base64');
const MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
const AUD = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1GnkenhgQAAAABJRU5ErkJggg==';

(async () => {
  console.log(`\n🌸 V4.18 Block-A-Test ${T}\n${'='.repeat(58)}`);

  const TOKEN = process.env.INTERNAL_TOKEN || 'testtoken123456789012345678';
  const rst = await call('POST', '/api/dev/reset-limits', {}, null, { 'x-internal-token': TOKEN });
  if (rst.s !== 200) console.log(`  ⚠️  Rate-Limit-Reset ging nicht (HTTP ${rst.s})`);

  const reg = async (u, name, phone) => {
    const r = await call('POST', '/api/register', {
      username: u, displayName: name, phone, email: `${u}@test.de`, password: 'Test1234!sicher',
    });
    if (r.s === 200 || r.s === 201) return { token: r.j.token, id: r.j.user.id };
    const l = await call('POST', '/api/login', { login: u, password: 'Test1234!sicher' });
    return { token: l.j.token, id: l.j.user.id };
  };

  const n = Number(T.slice(-5));
  const a = await reg('an_a_' + T, 'Anna Anhang', '+4917710' + (10000 + n));
  const b = await reg('an_b_' + T, 'Ben Bilder', '+4917711' + (10000 + n));
  const c = await reg('an_c_' + T, 'Clara Dritt', '+4917712' + (10000 + n));
  ok('Drei Testkonten', !!a.token && !!b.token && !!c.token);

  /* ---------- Chat bauen ---------- */
  const mk = await call('POST', '/api/chats', { type: 'private', userId: b.id }, a.token);
  const chatId = (mk.j.summary && mk.j.summary.id) || (mk.j.chat && mk.j.chat.id) || '';
  ok('Privatchat Anna↔Ben', !!chatId, JSON.stringify(mk.j).slice(0, 120));

  const send = (tok, body, id) => call('POST', `/api/chats/${id || chatId}/messages`, body, tok);

  /* ================= 1. Anhänge kommen an ================= */
  console.log('\n🎞️  Anhänge');

  const v1 = await send(a.token, { kind: 'video', attachment: { url: MP4, name: 'clip.mp4', mime: 'video/mp4', size: 40 } });
  ok('Video gesendet', v1.s === 200 && v1.j.message, JSON.stringify(v1.j).slice(0, 100));
  ok('Video-Kind bleibt „video“', v1.j.message && v1.j.message.kind === 'video', v1.j.message && v1.j.message.kind);
  ok('Video-URL bleibt erhalten', v1.j.message && v1.j.message.attachment && v1.j.message.attachment.url.startsWith('data:video/'));

  const f1 = await send(a.token, { kind: 'file', attachment: { url: TXT, name: 'notiz.txt', mime: 'text/plain', size: 64 } });
  ok('Dokument gesendet', f1.s === 200 && f1.j.message.attachment.name === 'notiz.txt', JSON.stringify(f1.j).slice(0, 100));
  ok('Dokument-Größe gespeichert', f1.j.message.attachment.size === 64, f1.j.message.attachment.size);

  const wave = [0.1, 0.5, 0.9, 0.3, 0.7];
  const vo1 = await send(a.token, {
    kind: 'voice',
    attachment: { url: AUD, name: 'Sprachnachricht', mime: 'audio/webm', size: 128, duration: 7, wave },
  });
  ok('Sprachnachricht gesendet', vo1.s === 200, JSON.stringify(vo1.j).slice(0, 100));
  ok('🔴 Wellenform kommt an (5 Werte)', vo1.j.message.attachment.wave && vo1.j.message.attachment.wave.length === 5,
    JSON.stringify(vo1.j.message.attachment.wave));
  ok('🔴 Wellenform-Werte bleiben 0–1', vo1.j.message.attachment.wave.every((x) => x >= 0 && x <= 1),
    JSON.stringify(vo1.j.message.attachment.wave));
  ok('Dauer 7 s gespeichert', vo1.j.message.attachment.duration === 7, vo1.j.message.attachment.duration);

  const lo1 = await send(a.token, { kind: 'location', attachment: { lat: 51.5136, lng: 7.4653, name: 'Dortmund' } });
  ok('Standort gesendet', lo1.s === 200, JSON.stringify(lo1.j).slice(0, 100));
  ok('🔴 Koordinaten bleiben exakt', lo1.j.message.attachment.lat === 51.5136 && lo1.j.message.attachment.lng === 7.4653,
    `${lo1.j.message.attachment.lat}, ${lo1.j.message.attachment.lng}`);

  const vc1 = await send(a.token, {
    kind: 'contact',
    attachment: { url: VCF, name: 'Anna', mime: 'text/vcard', vname: 'Anna Anhang', vuser: 'an_a_' + T, vphone: '+4917710' + (10000 + n) },
  });
  ok('Kontakt gesendet', vc1.s === 200, JSON.stringify(vc1.j).slice(0, 100));
  ok('🔴 vCard-Felder bleiben erhalten', vc1.j.message.attachment.vname === 'Anna Anhang' && vc1.j.message.attachment.vuser === 'an_a_' + T,
    JSON.stringify(vc1.j.message.attachment).slice(0, 120));

  const g1 = await send(a.token, { kind: 'gif', attachment: { url: GIF, name: 'heart.gif', mime: 'image/gif', size: 60 } });
  ok('GIF gesendet', g1.s === 200 && g1.j.message.kind === 'gif', JSON.stringify(g1.j).slice(0, 100));

  /* Ben sieht alle Anhänge */
  const bView = await call('GET', `/api/chats/${chatId}/messages`, null, b.token);
  const bMsgs = bView.j.messages || [];
  const kinds = bMsgs.map((m) => m.kind);
  ok('🔴 Ben bekommt alle 6 Anhänge', ['video', 'file', 'voice', 'location', 'contact', 'gif'].every((k) => kinds.includes(k)),
    kinds.join(','));
  const bVoice = bMsgs.find((m) => m.kind === 'voice');
  ok('🔴 Wellenform überlebt den Transport', bVoice && bVoice.attachment.wave && bVoice.attachment.wave.length === 5);

  /* ================= 2. Einmalansicht ================= */
  console.log('\n🔥 Einmalansicht');

  const vo = await send(a.token, { viewOnce: true, kind: 'photo', image: PNG });
  ok('Einmal-Foto gesendet', vo.s === 200, JSON.stringify(vo.j).slice(0, 120));
  const voMsg = vo.j.message;
  ok('🔴 Als Einmal-Medium markiert', voMsg.attachment && voMsg.attachment.viewOnce === true);
  ok('🔴 Noch nicht verbraucht', voMsg.attachment.consumed === false);
  ok('Bild ist (noch) da', typeof voMsg.attachment.url === 'string' && voMsg.attachment.url.length > 20);

  const bBefore = await call('GET', `/api/chats/${chatId}/messages`, null, b.token);
  const voForB = (bBefore.j.messages || []).find((m) => m.id === voMsg.id);
  ok('🔴 Ben sieht das Medium (noch nicht verbraucht)', voForB && voForB.attachment.url.length > 20);

  const selfOpen = await call('POST', `/api/chats/${chatId}/messages/${voMsg.id}/view-once`, {}, a.token);
  ok('🔴 Eigene Nachricht kann man nicht „öffnen“ → 400', selfOpen.s === 400, `HTTP ${selfOpen.s}`);

  const open1 = await call('POST', `/api/chats/${chatId}/messages/${voMsg.id}/view-once`, {}, b.token);
  ok('Ben öffnet es (1× erlaubt)', open1.s === 200 && open1.j.ok === true, JSON.stringify(open1.j).slice(0, 140));
  const w = open1.j.secureDelete || {};
  ok('🔴 Server meldet sicheres Löschen (3 Durchgänge, Felder)',
    Array.isArray(w.fields) && w.fields.length > 0 && w.passes >= 3, JSON.stringify(w));

  const open2 = await call('POST', `/api/chats/${chatId}/messages/${voMsg.id}/view-once`, {}, b.token);
  ok('🔴 Zweites Öffnen → 409 (schon angesehen)', open2.s === 409, `HTTP ${open2.s} ${JSON.stringify(open2.j).slice(0, 80)}`);

  const after = await call('GET', `/api/chats/${chatId}/messages`, null, b.token);
  const voAfter = (after.j.messages || []).find((m) => m.id === voMsg.id);
  ok('🔴 Inhalt ist wirklich weg (keine URL mehr)', voAfter && !voAfter.attachment.url, voAfter && voAfter.attachment.url);
  ok('🔴 Text sagt „Einmal angesehen“', voAfter && /Einmal angesehen/.test(voAfter.text), voAfter && voAfter.text);
  ok('🔴 consumed-Flag steht', voAfter && voAfter.attachment.consumed === true);

  const cTry = await call('POST', `/api/chats/${chatId}/messages/${voMsg.id}/view-once`, {}, c.token);
  ok('🔴 Fremder (nicht im Chat) darf nicht → 404/403', cTry.s === 404 || cTry.s === 403, `HTTP ${cTry.s}`);

  /* ================= 3. Selbstlöschung ================= */
  console.log('\n⏱️  Selbstlöschung');

  const ad1 = await call('POST', `/api/chats/${chatId}/auto-delete`, { seconds: 86400 }, a.token);
  ok('Auto-Delete auf 24 h', ad1.s === 200 && ad1.j.ok === true, JSON.stringify(ad1.j).slice(0, 100));
  ok('🔴 Wert 86400 gespeichert', ad1.j.autoDelete === 86400, ad1.j.autoDelete);

  const meA = await call('GET', '/api/me', null, a.token);
  const sumA = (meA.j.chats || []).find((x) => x.id === chatId);
  ok('🔴 Chat-Zusammenfassung liefert autoDelete (die UI liest das!)', sumA && sumA.autoDelete === 86400, sumA && sumA.autoDelete);

  const ad2 = await call('POST', `/api/chats/${chatId}/auto-delete`, { seconds: 0 }, a.token);
  ok('Auto-Delete wieder aus', ad2.s === 200 && ad2.j.autoDelete === 0, ad2.j.autoDelete);

  const ad3 = await call('POST', `/api/chats/${chatId}/auto-delete`, { seconds: 999999999 }, a.token);
  ok('🔴 Unsinniger Wert wird gekappt (max 30 Tage)', ad3.s === 200 && ad3.j.autoDelete <= 2592000, ad3.j.autoDelete);

  const otherChat = await call('POST', '/api/chats', { type: 'private', userId: c.id }, b.token);
  const cChatId = (otherChat.j.summary && otherChat.j.summary.id) || '';
  const adForbidden = await call('POST', `/api/chats/${cChatId}/auto-delete`, { seconds: 3600 }, a.token);
  ok('🔴 Fremder darf Timer nicht setzen → 403/404', adForbidden.s === 403 || adForbidden.s === 404, `HTTP ${adForbidden.s}`);
  await call('POST', `/api/chats/${chatId}/auto-delete`, { seconds: 0 }, a.token);

  /* ================= 4. Archiv ================= */
  console.log('\n📥 Archiv');

  const ar1 = await call('POST', `/api/chats/${chatId}/archive`, { archived: true }, a.token);
  ok('Chat archiviert', ar1.s === 200 && ar1.j.archived === true, JSON.stringify(ar1.j).slice(0, 100));

  const meA2 = await call('GET', '/api/me', null, a.token);
  const archivedA = (meA2.j.chats || []).find((x) => x.id === chatId);
  ok('🔴 Anna sieht archived=true (Archiv-Tab lebt davon)', archivedA && archivedA.archived === true, archivedA && archivedA.archived);

  const meB = await call('GET', '/api/me', null, b.token);
  const archivedB = (meB.j.chats || []).find((x) => x.id === chatId);
  ok('🔴 Für Ben ist der Chat NICHT archiviert (pro Nutzer)', archivedB && archivedB.archived !== true, archivedB && archivedB.archived);

  const ar2 = await call('POST', `/api/chats/${chatId}/archive`, { archived: false }, a.token);
  ok('Wieder aus dem Archiv', ar2.s === 200 && ar2.j.archived === false);

  /* ================= 5. Export ================= */
  console.log('\n⬇️  Export');

  const ex = await call('GET', '/api/export', null, a.token);
  ok('Export liefert Daten', ex.s === 200 && ex.j.ok !== false, `HTTP ${ex.s}`);
  ok('🔴 Export enthält Chats', Array.isArray(ex.j.chats) && ex.j.chats.length > 0, ex.j.chats && ex.j.chats.length);
  const exChat = (ex.j.chats || []).find((x) => x.id === chatId);
  ok('🔴 Unser Chat ist im Export', !!exChat);
  ok('🔴 Export enthält die Nachrichten', exChat && exChat.messages.length >= 6, exChat && exChat.messages.length);
  ok('Export hat Zeitstempel', typeof ex.j.exportedAt === 'number' || typeof ex.j.exportedAt === 'string', ex.j.exportedAt);

  /* ================= 6. Ungelesen ================= */
  console.log('\n🔵 Ungelesen');

  const last = bMsgs[bMsgs.length - 1];
  const un = await call('POST', `/api/chats/${chatId}/messages/${last.id}/unread`, {}, b.token);
  ok('Als ungelesen markiert', un.s === 200 && un.j.ok === true, JSON.stringify(un.j).slice(0, 100));
  const meB2 = await call('GET', '/api/me', null, b.token);
  const sumB = (meB2.j.chats || []).find((x) => x.id === chatId);
  ok('🔴 Ungelesen-Zähler steigt', sumB && sumB.unread >= 1, sumB && sumB.unread);

  /* ================= 7. Ton-Einstellungen ================= */
  console.log('\n🔔 Benachrichtigungston');

  const s1 = await call('PUT', '/api/me', { sound: 'sparkle' }, a.token);
  ok('Ton umgestellt', s1.s === 200 && s1.j.user.sound === 'sparkle', JSON.stringify(s1.j.user && s1.j.user.sound));
  const s2 = await call('PUT', '/api/me', { soundVol: 0.8 }, a.token);
  ok('Lautstärke 0.8 gespeichert', s2.s === 200 && Math.abs(s2.j.user.soundVol - 0.8) < 0.01, s2.j.user && s2.j.user.soundVol);
  const s3 = await call('PUT', '/api/me', { sound: 'böse-hacker-melodie' }, a.token);
  ok('🔴 Unbekannter Ton → 400', s3.s === 400, `HTTP ${s3.s}`);
  const s4 = await call('PUT', '/api/me', { soundVol: 99 }, a.token);
  ok('🔴 Lautstärke wird auf 0–1 gekappt', s4.s === 200 && s4.j.user.soundVol <= 1, s4.j.user && s4.j.user.soundVol);
  const meA3 = await call('GET', '/api/me', null, a.token);
  ok('🔴 /api/me liefert sound + soundVol (die UI braucht das)', meA3.j.user.sound === 'sparkle' && meA3.j.user.soundVol <= 1,
    meA3.j.user.sound + ' / ' + meA3.j.user.soundVol);

  /* ================= 8. Blockliste ================= */
  console.log('\n🚫 Blockliste');

  const bl0 = await call('GET', '/api/blocks', null, a.token);
  ok('Blockliste abrufbar', bl0.s === 200, `HTTP ${bl0.s}`);
  await call('POST', `/api/users/${c.id}/block`, { blocked: true }, a.token);
  const bl1 = await call('GET', '/api/blocks', null, a.token);
  const blList = bl1.j.users || bl1.j.blocked || bl1.j.blocks || bl1.j.list || [];
  ok('🔴 Blockierter steht in der Liste', Array.isArray(blList) && blList.some((u) => (u.id || u) === c.id),
    JSON.stringify(blList).slice(0, 120));
  const unblk = await call('DELETE', `/api/users/${c.id}/block`, null, a.token);
  ok('Entsperren geht', unblk.s === 200 || unblk.s === 204, `HTTP ${unblk.s}`);
  const bl2 = await call('GET', '/api/blocks', null, a.token);
  const blList2 = bl2.j.users || bl2.j.blocked || bl2.j.blocks || bl2.j.list || [];
  ok('🔴 Liste ist wieder leer', Array.isArray(blList2) && blList2.length === 0, JSON.stringify(blList2).slice(0, 100));

  /* ================= 9. Sessions ================= */
  console.log('\n💻 Geräte');

  const se = await call('GET', '/api/sessions', null, a.token);
  const sess = se.j.sessions || [];
  ok('Sessions abrufbar', se.s === 200, `HTTP ${se.s}`);
  ok('🔴 Mindestens eine Sitzung (diese)', sess.length >= 1, sess.length);
  ok('🔴 Genau eine ist „current“', sess.filter((x) => x.current).length === 1, sess.filter((x) => x.current).length);
  ok('Sitzung hat Gerät + Zeit', sess[0] && typeof sess[0].createdAt === 'number' && typeof sess[0].device === 'string',
    JSON.stringify(sess[0]).slice(0, 120));

  /* ================= 10. Anhänge: Grenzen ================= */
  console.log('\n🛡️  Grenzen');

  const empty = await send(a.token, {});
  ok('🔴 Leere Nachricht → 400', empty.s === 400, `HTTP ${empty.s}`);

  const huge = await send(a.token, {
    kind: 'file',
    attachment: { url: 'data:application/octet-stream;base64,' + 'A'.repeat(6 * 1024 * 1024), name: 'riesig.bin', mime: 'application/octet-stream', size: 1 },
  });
  ok('🔴 6-MB-Anhang wird abgelehnt', huge.s === 400, `HTTP ${huge.s}`);

  const blocked = await call('POST', `/api/users/${a.id}/block`, {}, b.token);
  ok('Ben blockiert Anna', blocked.s === 200, `HTTP ${blocked.s}`);
  await call('POST', `/api/chats/${chatId}/messages`, { text: 'Hallo trotz Block?' }, b.token);
  const cAfterBlock = await call('POST', `/api/chats/${chatId}/messages`, { text: 'Test' }, a.token);
  ok('🔴 Blockierter kann nicht mehr schreiben → 403', cAfterBlock.s === 403, `HTTP ${cAfterBlock.s}`);
  await call('DELETE', `/api/users/${a.id}/block`, null, b.token);

  /* ================= Ergebnis ================= */
  console.log('\n' + '='.repeat(58));
  console.log(`  ${fail === 0 ? '🎉' : '⚠️ '}  ${pass} bestanden · ${fail} fehlgeschlagen`);
  console.log('='.repeat(58) + '\n');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n💥 Test abgebrochen:', e.message);
  process.exit(1);
});
