/* =====================================================================
 *  🧪 v427test.js — V4.27 „Medien"
 * ---------------------------------------------------------------------
 *  Geprüft wird, was vorher NICHT existierte:
 *    A. Upload → Datei auf der Platte, DB wächst NICHT
 *    B. MIME-Allowlist (kein SVG!, kein HTML)
 *    C. Größenlimit pro Datei (25 MB / VIP 100 MB)
 *    D. Quota pro Nutzer
 *    E. Ausliefern mit echtem Content-Type + Cache
 *    F. Löschen entfernt Datei von der Platte
 *    G. Galerie pro Chat (Fotos/Videos/Voice/Docs/Links)
 *    H. GIF-Katalog + Suche
 *    I. Speicher-Übersicht zeigt die Base64-Altlast ehrlich
 *    J. Migration rechnet nach und stellt um
 *    K. Zugriffsschutz
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

async function api(p, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, json, text, headers: r.headers };
}

async function signup(tag) {
  for (let i = 0; i < 6; i++) {
    seq++;
    const username = `v427_${tag}_${seq}`;
    const phone = '+49171' + String(7000000 + seq).slice(-7);
    const r = await api('/api/register', {
      method: 'POST',
      body: { username, displayName: 'V427 ' + tag, phone, email: `${username}@test.de`, password: 'Test1234!sicher' },
    });
    if ((r.status === 200 || r.status === 201) && r.json && r.json.token) return { token: r.json.token, id: r.json.user.id, username };
    if (r.status === 429 || r.status === 409) { continue; }
    break;
  }
  throw new Error('Registrierung fehlgeschlagen: ' + tag);
}

/** Kleines echtes PNG (1×1), damit Bytes stimmen. */
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  console.log('\n🖼️ V4.27 — Medien\n');

  const a = await signup('a');
  const b = await signup('b');

  // Chat zwischen A und B anlegen
  const chatR = await api('/api/chats', { method: 'POST', token: a.token, body: { type: 'private', userId: b.id } });
  ok('V0: Chat angelegt', chatR.status === 200 && chatR.json && chatR.json.summary, `HTTP ${chatR.status}`);
  const chatId = chatR.json && chatR.json.summary && chatR.json.summary.id;

  console.log('— A. Upload schreibt eine Datei, nicht in die DB —');
  const up = await api('/api/v427/media', {
    method: 'POST', token: a.token,
    body: { dataUrl: 'data:image/png;base64,' + PNG_1PX, name: 'pixel.png', chatId },
  });
  ok('A1: Upload → 201', up.status === 201, `HTTP ${up.status} ${(up.text || '').slice(0, 120)}`);
  const media = up.json && up.json.media;
  ok('A2: ID beginnt mit md_', !!media && /^md_[a-f0-9]{18}$/.test(media.id), media && media.id);
  eq('A3: MIME erkannt', media && media.mime, 'image/png');
  eq('A4: Endung abgeleitet', media && media.ext, 'png');
  eq('A5: Kind = photo', media && media.kind, 'photo');
  eq('A6: Größe stimmt (68 Byte PNG)', media && media.size, Buffer.from(PNG_1PX, 'base64').length);
  ok('A7: URL ohne Base64', up.json.url === '/media/' + media.id + '.png', up.json.url);
  ok('A8: keine Base64-Daten in der Antwort', !JSON.stringify(up.json).includes('iVBORw0KGgo'), 'Antwort enthält noch den Blob!');
  ok('A9: Limit mitgeliefert', typeof up.json.limitBytes === 'number' && up.json.limitBytes > 0);

  console.log('— B. Ausliefern —');
  const served = await api('/media/' + media.id + '.png');
  ok('B1: GET /media/… → 200', served.status === 200, `HTTP ${served.status}`);
  eq('B2: Content-Type image/png', served.headers.get('content-type'), 'image/png');
  eq('B3: X-Content-Type-Options nosniff', served.headers.get('x-content-type-options'), 'nosniff');
  const servedApi = await api('/api/v427/media/' + media.id + '.png');
  ok('B4: auch über /api/v427/media/…', servedApi.status === 200, `HTTP ${servedApi.status}`);
  const ghost = await api('/media/md_000000000000000000.png');
  ok('B5: unbekannte ID → 404', ghost.status === 404, `HTTP ${ghost.status}`);
  // ⚠️ Ein nacktes „/media/../../etc/passwd" wird schon vom HTTP-Client
  //    normalisiert (fetch macht daraus /etc/passwd) — dann landete der Test
  //    auf dem SPA-Fallback und sah 200. Deshalb prozent-kodiert.
  const badName = await api('/media/%2e%2e%2f%2e%2e%2fetc%2fpasswd');
  ok('B6: Pfad-Ausbruch (%2e%2e) → 400/404', badName.status === 400 || badName.status === 404, `HTTP ${badName.status}`);
  const badName2 = await api('/api/v427/media/%2e%2e%2fpasswd');
  ok('B6b: Ausbruch über API-Pfad → 400', badName2.status === 400, `HTTP ${badName2.status}`);
  const info = await api('/api/v427/media/' + media.id + '/info', { token: a.token });
  ok('B7: Info-Route → 200', info.status === 200 && info.json.exists === true, `HTTP ${info.status}`);

  console.log('— C. MIME-Allowlist —');
  const svg = await api('/api/v427/media', { method: 'POST', token: a.token, body: { mime: 'image/svg+xml', base64: 'PHN2Zz48L3N2Zz4=' } });
  ok('C1: SVG verboten → 415', svg.status === 415, `HTTP ${svg.status}`);
  ok('C2: Code bad_mime', svg.json && svg.json.code === 'bad_mime');
  ok('C3: Allowlist mitgeliefert', svg.json && Array.isArray(svg.json.allowed) && svg.json.allowed.length >= 10);
  const html = await api('/api/v427/media', { method: 'POST', token: a.token, body: { mime: 'text/html', base64: 'PGI+aGk8L2I+' } });
  ok('C4: HTML verboten → 415', html.status === 415, `HTTP ${html.status}`);
  const empty = await api('/api/v427/media', { method: 'POST', token: a.token, body: {} });
  ok('C5: ohne Daten → 400', empty.status === 400, `HTTP ${empty.status}`);
  const pdf = await api('/api/v427/media', { method: 'POST', token: a.token, body: { mime: 'application/pdf', base64: Buffer.from('%PDF-1.4 test').toString('base64'), name: 'test.pdf' } });
  ok('C6: PDF erlaubt → 201', pdf.status === 201, `HTTP ${pdf.status}`);
  eq('C7: PDF-Kind = file', pdf.json && pdf.json.media.kind, 'file');

  console.log('— D. Größenlimit + Quota —');
  const big = Buffer.alloc(16 * 1024 * 1024, 1).toString('base64');
  const tooBig = await api('/api/v427/media', { method: 'POST', token: a.token, body: { mime: 'image/png', base64: big } });
  ok('D1: 16 MB → 413 (Limit 15 MB)', tooBig.status === 413, `HTTP ${tooBig.status}`);
  ok('D2: Code too_big', tooBig.json && tooBig.json.code === 'too_big', JSON.stringify(tooBig.json).slice(0, 90));
  ok('D3: maxBytes im Fehler', tooBig.json && tooBig.json.maxBytes === 15 * 1024 * 1024, String(tooBig.json && tooBig.json.maxBytes));
  const st = await api('/api/v427/storage', { token: a.token });
  ok('D4: Speicher-Übersicht → 200', st.status === 200, `HTTP ${st.status}`);
  ok('D5: Quota 500 MB', st.json.limits.quota === 500 * 1024 * 1024, String(st.json.limits.quota));
  ok('D6: belegter Platz > 0', st.json.mine.bytes > 0, String(st.json.mine.bytes));
  ok('D7: nach Kind aufgeschlüsselt', typeof st.json.mine.byKind === 'object');
  ok('D8: Dateien auf der Platte gezählt', st.json.disk.files >= 2, String(st.json.disk.files));

  console.log('— E. Galerie pro Chat —');
  // Eine Nachricht mit dem Medium in den Chat legen
  const msg = await api('/api/chats/' + chatId + '/messages', {
    method: 'POST', token: a.token,
    body: { kind: 'photo', text: 'Schau mal https://maxichen.de/downloads/', attachment: { url: up.json.url, name: 'pixel.png', mime: 'image/png', size: media.size } },
  });
  ok('E1: Nachricht mit Medium gesendet', msg.status === 200 || msg.status === 201, `HTTP ${msg.status} ${(msg.text || '').slice(0, 100)}`);
  const gal = await api('/api/v427/chats/' + chatId + '/media', { token: a.token });
  ok('E2: Galerie → 200', gal.status === 200, `HTTP ${gal.status}`);
  ok('E3: Foto in der Galerie', gal.json.photos.length >= 1, `photos=${gal.json.photos.length}`);
  ok('E4: Foto ist NICHT als legacy markiert', gal.json.photos[0].legacy === false, String(gal.json.photos[0].legacy));
  ok('E5: Link wurde gefunden', gal.json.links.some((l) => l.url.includes('maxichen.de')), JSON.stringify(gal.json.links).slice(0, 120));
  eq('E6: Zähler stimmen', gal.json.counts.photos, gal.json.photos.length);
  const galOutsider = await api('/api/v427/chats/' + chatId + '/media', { token: (await signup('c')).token });
  ok('E7: Fremder → 403', galOutsider.status === 403, `HTTP ${galOutsider.status}`);
  const galGhost = await api('/api/v427/chats/c_gibtsnicht/media', { token: a.token });
  ok('E8: unbekannter Chat → 404', galGhost.status === 404, `HTTP ${galGhost.status}`);

  console.log('— F. Löschen räumt die Platte —');
  const delOutsider = await api('/api/v427/media/' + media.id, { method: 'DELETE', token: b.token });
  ok('F1: Fremder löschen → 403', delOutsider.status === 403, `HTTP ${delOutsider.status}`);
  const del = await api('/api/v427/media/' + media.id, { method: 'DELETE', token: a.token });
  ok('F2: Eigentümer löschen → 200', del.status === 200, `HTTP ${del.status}`);
  ok('F3: freigegebene Bytes gemeldet', del.json && del.json.freedBytes === media.size, String(del.json && del.json.freedBytes));
  const afterDel = await api('/media/' + media.id + '.png');
  ok('F4: Datei ist weg (404)', afterDel.status === 404, `HTTP ${afterDel.status}`);
  const delAgain = await api('/api/v427/media/' + media.id, { method: 'DELETE', token: a.token });
  ok('F5: zweimal löschen → 404', delAgain.status === 404, `HTTP ${delAgain.status}`);

  console.log('— G. GIF-Katalog —');
  const gifs = await api('/api/v427/gifs', { token: a.token });
  ok('G1: GIF-Liste → 200', gifs.status === 200, `HTTP ${gifs.status}`);
  ok('G2: mindestens 10 GIFs', gifs.json.all >= 10, String(gifs.json.all));
  eq('G3: Quelle ist lokal (kein fremder Host)', gifs.json.source, 'lokal');
  const gifSearch = await api('/api/v427/gifs?q=liebe', { token: a.token });
  ok('G4: Suche „liebe" findet etwas', gifSearch.json.gifs.length >= 1, String(gifSearch.json.total));
  const gifNone = await api('/api/v427/gifs?q=xyzgibtsnicht', { token: a.token });
  eq('G5: Suche ohne Treffer → leer', gifNone.json.gifs.length, 0);
  ok('G6: jeder GIF hat Emoji + Farbe', gifs.json.gifs.every((g) => g.emoji && g.color));

  console.log('— H. Migration der Base64-Altlast —');
  // Nachricht mit Data-URL (alter Weg) anlegen
  const oldMsg = await api('/api/chats/' + chatId + '/messages', {
    method: 'POST', token: a.token, body: { text: 'alt', image: 'data:image/png;base64,' + PNG_1PX },
  });
  ok('H1: alte Data-URL-Nachricht angelegt', oldMsg.status === 200 || oldMsg.status === 201, `HTTP ${oldMsg.status}`);
  const stBefore = await api('/api/v427/storage', { token: a.token });
  ok('H2: Altlast wird gezeigt', stBefore.json.legacy.count >= 1, String(stBefore.json.legacy.count));
  ok('H3: Altlast-Größe > 0', stBefore.json.legacy.bytes > 0, String(stBefore.json.legacy.bytes));
  const mig = await api('/api/v427/storage/migrate', { method: 'POST', token: a.token, body: {} });
  ok('H4: Migration → 200', mig.status === 200, `HTTP ${mig.status}`);
  ok('H5: mindestens 1 Anhang umgezogen', mig.json.moved >= 1, String(mig.json.moved));
  const stAfter = await api('/api/v427/storage', { token: a.token });
  ok('H6: Altlast ist kleiner geworden', stAfter.json.legacy.count < stBefore.json.legacy.count || stAfter.json.legacy.bytes < stBefore.json.legacy.bytes,
    `${stBefore.json.legacy.count} → ${stAfter.json.legacy.count}`);
  const gal2 = await api('/api/v427/chats/' + chatId + '/media', { token: a.token });
  ok('H7: umgezogenes Bild steht in der Galerie', gal2.json.photos.length >= 1, String(gal2.json.photos.length));
  ok('H8: und ist jetzt nicht mehr legacy', gal2.json.photos.every((p) => !p.legacy), JSON.stringify(gal2.json.photos.map((p) => p.legacy)));

  console.log('— I. Zugriffsschutz —');
  const noTok = await api('/api/v427/media', { method: 'POST', body: { mime: 'image/png', base64: PNG_1PX } });
  ok('I1: Upload ohne Token → 401', noTok.status === 401, `HTTP ${noTok.status}`);
  const stNo = await api('/api/v427/storage');
  ok('I2: Speicher ohne Token → 401', stNo.status === 401, `HTTP ${stNo.status}`);
  const gifNo = await api('/api/v427/gifs');
  ok('I3: GIFs ohne Token → 401', gifNo.status === 401, `HTTP ${gifNo.status}`);
  const migNo = await api('/api/v427/storage/migrate', { method: 'POST', body: {} });
  ok('I4: Migration ohne Token → 401', migNo.status === 401, `HTTP ${migNo.status}`);
  const otherChat = await api('/api/v427/media', { method: 'POST', token: a.token, body: { dataUrl: 'data:image/png;base64,' + PNG_1PX, chatId: 'c_gibtsnicht' } });
  ok('I5: Upload in fremden Chat → 404', otherChat.status === 404, `HTTP ${otherChat.status}`);

  console.log(`\n${fail === 0 ? '✅' : '❌'} V4.27: ${pass} grün, ${fail} rot`);
  if (fail) { console.log('\nFehlgeschlagen:'); failures.forEach((f) => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ v427test abgebrochen:', e); process.exit(1); });
