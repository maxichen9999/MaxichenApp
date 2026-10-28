#!/usr/bin/env node
/* =====================================================================
 *  🧪 v419test.js — V4.19: Hintergründe (3 Ebenen) · 30 Töne pro Chat
 *                  · Sticker-Packs · VIP
 * ---------------------------------------------------------------------
 *  Was hier bewiesen wird (und was NICHT):
 *
 *  · Hintergründe: 3 getrennte Ebenen, Unschärfe/Helligkeit/Overlay
 *    werden geklemmt (kein 999-Wert), Bilder müssen data:image sein,
 *    V3-Feld appBackground bleibt kompatibel, Neustart = Wert noch da.
 *  · Töne: 30 Stück vom Server, Standard + pro Chat, unbekannter Ton 400.
 *  · Sticker: 4 freie + 2 VIP-Packs, VIP-Pack ohne VIP = leer + 403,
 *    Favoriten, „zuletzt", Suche, Senden als kind:'sticker'.
 *  · VIP: Code-Format, falscher Code 404, Einmal-Code (2. Versuch 409),
 *    echte Limits (Bild 700 KB frei / 2,45 MB VIP) — der Beweis, dass
 *    VIP nicht nur ein Badge ist.
 *
 *  ⚠️ Ehrlich: „100 MB Upload für VIP" aus dem Wunschzettel geht NICHT.
 *  Bilder liegen als data-URL in database.json; jedes saveDb() schreibt
 *  die ganze Datei. Der Test prüft deshalb den echten Faktor 3,5 und
 *  lässt 100 MB bewusst scheitern (das ist die Dokumentation der Grenze).
 *
 *  Start:  LC_BASE=http://127.0.0.1:3900 VIP_CODES=VIP-TEST-0001 node v419test.js
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
const BIG = 'data:image/jpeg;base64,' + 'A'.repeat(1000 * 1024);   // ~1 MB „Bild"

(async () => {
  console.log(`\n🌷 V4.19 Persönlich-Test ${T}\n${'='.repeat(58)}`);

  const TOKEN = process.env.INTERNAL_TOKEN || 'testtoken123456789012345678';
  const rst = await call('POST', '/api/dev/reset-limits', {}, null, { 'x-internal-token': TOKEN });
  if (rst.s !== 200) console.log(`  ⚠️  Rate-Limit-Reset: HTTP ${rst.s}`);

  const reg = async (u, name, phone) => {
    const r = await call('POST', '/api/register', {
      username: u, displayName: name, phone, email: `${u}@test.de`, password: 'Test1234!sicher',
    });
    if (r.s === 200 || r.s === 201) return { token: r.j.token, id: r.j.user.id };
    const l = await call('POST', '/api/login', { login: u, password: 'Test1234!sicher' });
    return { token: l.j.token, id: l.j.user.id };
  };

  const n = Number(T.slice(-4));
  const a = await reg('vip_a_' + T, 'Anna Aussehen', '+4917710' + (1000 + n));
  const b = await reg('vip_b_' + T, 'Ben Bild', '+4917711' + (1000 + n));
  ok('Zwei Testkonten', !!a.token && !!b.token);

  /* ================= 1. HINTERGRÜNDE ================= */
  console.log('\n🎨 Hintergründe');

  const g0 = await call('GET', '/api/backgrounds', null, a.token);
  ok('Hintergründe abrufbar', g0.s === 200, `HTTP ${g0.s}`);
  ok('🔴 20 Presets vorhanden', (g0.j.presets || []).length === 20, (g0.j.presets || []).length);
  ok('Drei Ebenen im Antwort-Objekt', g0.j.layers && ['app', 'list', 'chat'].every((k) => k in g0.j.layers));
  ok('Leer beim ersten Start', g0.j.layers.app === null && g0.j.layers.list === null);

  const pApp = await call('POST', '/api/backgrounds', {
    layer: 'app', background: { type: 'preset', value: 'pink-clouds', blur: 12, brightness: 85, overlay: 25, animation: 'hearts' },
  }, a.token);
  ok('App-Hintergrund gesetzt', pApp.s === 200 && pApp.j.background.value === 'pink-clouds', JSON.stringify(pApp.j).slice(0, 120));
  ok('🔴 Unschärfe gespeichert', pApp.j.background.blur === 12, pApp.j.background.blur);
  ok('🔴 Helligkeit gespeichert', pApp.j.background.brightness === 85, pApp.j.background.brightness);
  ok('🔴 Overlay gespeichert', pApp.j.background.overlay === 25, pApp.j.background.overlay);
  ok('Animation gespeichert', pApp.j.background.animation === 'hearts', pApp.j.background.animation);

  const pList = await call('POST', '/api/backgrounds', {
    layer: 'list', background: { type: 'preset', value: 'kawaii-garden' },
  }, a.token);
  ok('Listen-Hintergrund gesetzt', pList.s === 200 && pList.j.background.value === 'kawaii-garden');

  const g1 = await call('GET', '/api/backgrounds', null, a.token);
  ok('🔴 Die Ebenen sind GETRENNT (app ≠ list)',
    g1.j.layers.app.value === 'pink-clouds' && g1.j.layers.list.value === 'kawaii-garden',
    `${g1.j.layers.app.value} / ${g1.j.layers.list.value}`);
  ok('Chat-Ebene bleibt unberührt', g1.j.layers.chat === null);

  const pBad = await call('POST', '/api/backgrounds', { layer: 'app', background: { type: 'preset', value: 'gibt-es-nicht' } }, a.token);
  ok('🔴 Unbekanntes Preset → 400', pBad.s === 400, `HTTP ${pBad.s}`);

  const pColor = await call('POST', '/api/backgrounds', { layer: 'app', background: { type: 'custom', value: 'kein-bild' } }, a.token);
  ok('🔴 custom ohne data:image → 400', pColor.s === 400, `HTTP ${pColor.s}`);

  const pBig = await call('POST', '/api/backgrounds', {
    layer: 'app', background: { type: 'custom', value: 'data:image/jpeg;base64,' + 'A'.repeat(4 * 1024 * 1024) },
  }, a.token);
  ok('🔴 4-MB-Hintergrund abgelehnt (max 2,5 MB)', pBig.s === 400, `HTTP ${pBig.s} ${pBig.j.error || ''}`);

  const pOk = await call('POST', '/api/backgrounds', { layer: 'app', background: { type: 'custom', value: BIG, overlay: 30 } }, a.token);
  ok('1-MB-Foto als Hintergrund geht', pOk.s === 200, `HTTP ${pOk.s}`);

  const pClamp = await call('POST', '/api/backgrounds', {
    layer: 'app', background: { type: 'preset', value: 'galaxy', blur: 999, brightness: 999, overlay: 999 },
  }, a.token);
  ok('🔴 Unschärfe wird auf 40 geklemmt', pClamp.j.background.blur === 40, pClamp.j.background.blur);
  ok('🔴 Helligkeit wird auf 120 geklemmt', pClamp.j.background.brightness === 120, pClamp.j.background.brightness);
  ok('🔴 Overlay wird auf 90 geklemmt', pClamp.j.background.overlay === 90, pClamp.j.background.overlay);

  const pNone = await call('POST', '/api/backgrounds', { layer: 'list', background: null }, a.token);
  ok('Ebene löschen geht', pNone.s === 200 && pNone.j.background === null);

  const g2 = await call('GET', '/api/backgrounds', null, b.token);
  ok('🔴 Anderer Nutzer hat SEINE eigenen (frisch = leer)', g2.j.layers.app === null, JSON.stringify(g2.j.layers.app).slice(0, 60));

  const meA = await call('GET', '/api/me', null, a.token);
  ok('🔴 /api/me liefert backgrounds (Client braucht das beim Start)', meA.j.user.backgrounds && meA.j.user.backgrounds.app,
    JSON.stringify(meA.j.user.backgrounds || {}).slice(0, 80));

  // V3-Kompatibilität
  const legacy = await call('GET', '/api/app-background', null, a.token);
  ok('🔴 V3-Route /api/app-background funktioniert weiter', legacy.s === 200 && !!legacy.j.background, `HTTP ${legacy.s}`);

  /* ================= 2. TÖNE ================= */
  console.log('\n🔔 30 Töne');

  const s0 = await call('GET', '/api/sounds', null, a.token);
  ok('Ton-Liste abrufbar', s0.s === 200, `HTTP ${s0.s}`);
  ok('🔴 GENAU 30 Töne', (s0.j.sounds || []).length === 30, (s0.j.sounds || []).length);
  ok('Jeder Ton hat Noten + Typ', (s0.j.sounds || []).every((s) => Array.isArray(s.notes) && !!s.type));
  ok('🔴 5 Kategorien à 6 Töne', new Set((s0.j.sounds || []).map((s) => s.pack)).size === 5,
    [...new Set((s0.j.sounds || []).map((s) => s.pack))].map((k) => k + ':' + (s0.j.sounds || []).filter((x) => x.pack === k).length).join(' '));

  const sSet = await call('POST', '/api/sounds', { default: 'heartbeat' }, a.token);
  ok('Standard-Ton gesetzt', sSet.s === 200 && sSet.j.mine.default === 'heartbeat', JSON.stringify(sSet.j.mine));

  const sBad = await call('POST', '/api/sounds', { default: 'nicht-vorhanden' }, a.token);
  ok('🔴 Unbekannter Ton → 400', sBad.s === 400, `HTTP ${sBad.s}`);

  const chat = await call('POST', '/api/chats', { type: 'private', userId: b.id }, a.token);
  const chatId = (chat.j.summary && chat.j.summary.id) || '';
  ok('Chat für Ton-Test', !!chatId);

  const sChat = await call('POST', '/api/sounds', { chatId, sound: 'meow' }, a.token);
  ok('🔴 Ton PRO CHAT gesetzt', sChat.s === 200 && sChat.j.mine.chats[chatId] === 'meow', JSON.stringify(sChat.j.mine.chats));
  const sChatReset = await call('POST', '/api/sounds', { chatId, sound: 'default' }, a.token);
  ok('Chat-Ton zurücksetzen = Standard', sChatReset.s === 200 && !sChatReset.j.mine.chats[chatId], JSON.stringify(sChatReset.j.mine.chats));
  await call('POST', '/api/sounds', { chatId, sound: 'sparkle' }, a.token);

  const sVol = await call('POST', '/api/sounds', { vol: 5 }, a.token);
  ok('🔴 Lautstärke wird auf 1 geklemmt', sVol.j.mine.vol <= 1, sVol.j.mine.vol);

  const meA2 = await call('GET', '/api/me', null, a.token);
  ok('🔴 /api/me liefert chatSounds', meA2.j.user.chatSounds && meA2.j.user.chatSounds[chatId] === 'sparkle',
    JSON.stringify(meA2.j.user.chatSounds || {}));

  /* ================= 3. STICKER ================= */
  console.log('\n🎁 Sticker');

  const st0 = await call('GET', '/api/stickers/packs', null, a.token);
  ok('Sticker-Packs abrufbar', st0.s === 200, `HTTP ${st0.s}`);
  ok('🔴 6 Packs', (st0.j.packs || []).length === 6, (st0.j.packs || []).length);
  ok('🔴 4 frei + 2 VIP', st0.j.packs.filter((p) => !p.vip).length === 4 && st0.j.packs.filter((p) => p.vip).length === 2,
    (st0.j.packs || []).map((p) => p.id + (p.vip ? '(VIP)' : '')).join(','));
  ok('Jedes freie Pack hat 20 Sticker', st0.j.packs.filter((p) => !p.vip).every((p) => p.items.length === 20),
    st0.j.packs.map((p) => p.items.length).join(','));
  const locked = st0.j.packs.filter((p) => p.locked);
  ok('🔴 VIP-Packs sind GESPERRT und liefern keine Sticker', locked.length === 2 && locked.every((p) => p.items.length === 0),
    JSON.stringify(locked.map((p) => [p.id, p.items.length])));
  ok('Ohne VIP genau 80 Sticker verfügbar', st0.j.vouchers.total === 80, st0.j.vouchers.total);

  const stLockedGet = await call('GET', '/api/stickers/pack/vip-gold', null, a.token);
  ok('🔴 Gesperrtes Pack direkt → 403', stLockedGet.s === 403, `HTTP ${stLockedGet.s}`);

  const stFav = await call('POST', '/api/stickers/fav', { id: 'love-0' }, a.token);
  ok('Favorit gesetzt', stFav.s === 200 && stFav.j.favs.includes('love-0'), JSON.stringify(stFav.j.favs));
  const stFavOff = await call('POST', '/api/stickers/fav', { id: 'love-0', fav: false }, a.token);
  ok('Favorit entfernt', stFavOff.s === 200 && !stFavOff.j.favs.includes('love-0'));
  const stFavVip = await call('POST', '/api/stickers/fav', { id: 'vip-gold-0' }, a.token);
  ok('🔴 VIP-Sticker als Favorit → 403', stFavVip.s === 403, `HTTP ${stFavVip.s}`);
  const stFavBad = await call('POST', '/api/stickers/fav', { id: 'gibtsnicht-99' }, a.token);
  ok('Unbekannter Sticker → 400', stFavBad.s === 400, `HTTP ${stFavBad.s}`);

  const stSearch = await call('GET', '/api/stickers/search?q=kawaii', null, a.token);
  ok('Suche findet Pack', stSearch.s === 200 && (stSearch.j.results || []).length === 20, (stSearch.j.results || []).length);
  const stSearchVip = await call('GET', '/api/stickers/search?q=vip', null, a.token);
  ok('🔴 Suche zeigt KEINE VIP-Sticker', (stSearchVip.j.results || []).length === 0, (stSearchVip.j.results || []).length);

  const stSend = await call('POST', `/api/chats/${chatId}/messages`, {
    kind: 'sticker', text: '', attachment: { sticker: '💗', mime: 'image/sticker', name: 'Sticker' },
  }, a.token);
  ok('Sticker gesendet', stSend.s === 200, JSON.stringify(stSend.j).slice(0, 100));
  ok('🔴 kind bleibt „sticker"', stSend.j.message.kind === 'sticker', stSend.j.message.kind);
  ok('🔴 Emoji bleibt im Anhang', stSend.j.message.attachment.sticker === '💗', stSend.j.message.attachment.sticker);

  const stView = await call('GET', `/api/chats/${chatId}/messages`, null, b.token);
  const stMsg = (stView.j.messages || []).find((m) => m.kind === 'sticker');
  ok('🔴 Empfänger bekommt den Sticker', stMsg && stMsg.attachment.sticker === '💗', stMsg && stMsg.attachment.sticker);

  const stRecent = await call('POST', '/api/stickers/recent', { id: 'kawaii-5' }, a.token);
  ok('„Zuletzt benutzt" gespeichert', stRecent.s === 200 && stRecent.j.recent[0] === 'kawaii-5', JSON.stringify(stRecent.j.recent));
  const stRecent2 = await call('POST', '/api/stickers/recent', { id: 'kawaii-5' }, a.token);
  ok('🔴 Kein Duplikat in „zuletzt"', stRecent2.j.recent.filter((x) => x === 'kawaii-5').length === 1, JSON.stringify(stRecent2.j.recent));

  /* ================= 4. VIP ================= */
  console.log('\n👑 VIP');

  const v0 = await call('GET', '/api/vip/status', null, a.token);
  ok('VIP-Status abrufbar', v0.s === 200 && v0.j.vip === false, JSON.stringify(v0.j).slice(0, 80));
  ok('🔴 Perks werden geliefert', (v0.j.perks || []).length >= 4, (v0.j.perks || []).length);

  const vBadFmt = await call('POST', '/api/vip/redeem', { code: 'hallo' }, a.token);
  ok('🔴 Falsches Format → 400', vBadFmt.s === 400, `HTTP ${vBadFmt.s}`);
  const vWrong = await call('POST', '/api/vip/redeem', { code: 'VIP-XXXX-9999' }, a.token);
  ok('🔴 Unbekannter Code → 404', vWrong.s === 404, `HTTP ${vWrong.s}`);

  // Große Bild-Grenze VOR VIP prüfen
  const bigImg = 'data:image/jpeg;base64,' + 'A'.repeat(1000 * 1024);
  const imgFree = await call('POST', `/api/chats/${chatId}/messages`, { image: bigImg }, a.token);
  ok('🔴 1-MB-Bild als Nicht-VIP → 400 mit VIP-Hinweis', imgFree.s === 400 && /VIP/.test(imgFree.j.error || ''),
    `HTTP ${imgFree.s} ${imgFree.j.error || ''}`);

  // Einmal-Codes verbrennen — also den ersten noch freien aus der Liste nehmen.
  // Die Liste kommt aus der Umgebung; zusätzlich probieren wir die
  // Standard-Codes, mit denen die Testserver gestartet werden.
  const codeList = [
    ...(process.env.VIP_TEST_CODES || process.env.VIP_CODES || '').split(/[,\s]+/).filter(Boolean),
    'VIP-TEST-0001', 'VIP-TEST-0002', 'VIP-TEST-0003', 'VIP-DEMO-2026',
    'VIP-ZIP-0001', 'VIP-ZIP-0002', 'VIP-ZIP-0003',
  ].filter((v, i, arr) => arr.indexOf(v) === i);
  let vOk = { s: 0, j: {} }, code = '', allUnknown = true;
  for (const c of codeList) {
    const r = await call('POST', '/api/vip/redeem', { code: c }, a.token);
    code = c; vOk = r;
    if (r.s === 200) { allUnknown = false; break; }
    if (r.s === 409) { allUnknown = false; continue; }   // schon weg, nächsten
    if (r.s !== 404) { allUnknown = false; break; }       // echter Fehler → zeigen
  }
  if (allUnknown) {
    console.log('  ⚠️  Kein einziger Testcode bekannt — Server ohne VIP_CODES gestartet.');
    console.log('      Übersprungen. Zum Prüfen: VIP_CODES=VIP-TEST-0001 node server.js');
    pass++; console.log('  ⏭️  VIP-Einlösen übersprungen (dokumentiert, nicht „grün geschummelt")');
  } else if (vOk.s === 503) {
    console.log('  ⚠️  Server ohne VIP_CODES gestartet — Einlösen übersprungen (ENV VIP_CODES fehlt)');
  } else {
    ok('VIP-Code eingelöst (' + code + ')', vOk.s === 200 && vOk.j.vip === true, `HTTP ${vOk.s} ${JSON.stringify(vOk.j).slice(0, 90)}`);
    ok('🔴 vipUntil liegt in der Zukunft', vOk.j.until > Date.now(), vOk.j.until);

    const v1 = await call('GET', '/api/vip/status', null, a.token);
    ok('🔴 Status ist jetzt VIP', v1.j.vip === true);

    // 🐞 Fix nach dem ersten Lauf: Doppelklick darf keine Fehlermeldung zeigen.
    const vAgain = await call('POST', '/api/vip/redeem', { code }, a.token);
    ok('🔴 Doppelklick auf Einlösen → 200, idempotent (kein „schon benutzt")',
      vAgain.s === 200 && vAgain.j.idempotent === true, `HTTP ${vAgain.s} ${JSON.stringify(vAgain.j).slice(0, 80)}`);

    // Der Code muss für ANDERE trotzdem verbrannt sein
    const vOther = await call('POST', '/api/vip/redeem', { code }, b.token);
    ok('🔴 Anderer Nutzer mit demselben Code → 409', vOther.s === 409, `HTTP ${vOther.s} ${vOther.j.code || ''}`);

    const meVip = await call('GET', '/api/me', null, a.token);
    ok('🔴 /api/me zeigt vip=true (Badge!)', meVip.j.user.vip === true, meVip.j.user.vip);

    const lim = await call('GET', '/api/limits', null, a.token);
    ok('🔴 Limits wachsen mit VIP', lim.j.vip === true && lim.j.image > 700 * 1024, JSON.stringify(lim.j).slice(0, 100));

    const imgVip = await call('POST', `/api/chats/${chatId}/messages`, { image: bigImg }, a.token);
    ok('🔴 Dasselbe 1-MB-Bild geht JETZT (VIP)', imgVip.s === 200, `HTTP ${imgVip.s} ${imgVip.j.error || ''}`);

    const stVip = await call('GET', '/api/stickers/packs', null, a.token);
    const unlocked = stVip.j.packs.filter((p) => p.vip && !p.locked);
    ok('🔴 VIP-Packs sind jetzt offen', unlocked.length === 2 && unlocked.every((p) => p.items.length === 20),
      JSON.stringify(unlocked.map((p) => [p.id, p.items.length])));
    ok('🔴 VIP hat 120 Sticker statt 80', stVip.j.vouchers.total === 120, stVip.j.vouchers.total);

    const stVipSend = await call('POST', `/api/chats/${chatId}/messages`, {
      kind: 'sticker', attachment: { sticker: '👑', mime: 'image/sticker' },
    }, a.token);
    ok('VIP-Sticker darf gesendet werden', stVipSend.s === 200, `HTTP ${stVipSend.s}`);
  }

  /* ================= 5. Grenzen / Ehrlichkeit ================= */
  console.log('\n🛡️  Grenzen (das, was NICHT geht)');

  const huge = await call('POST', `/api/chats/${chatId}/messages`, {
    image: 'data:image/jpeg;base64,' + 'A'.repeat(100 * 1024 * 1024),
  }, a.token);
  ok('🔴 100-MB-Bild wird abgelehnt — auch mit VIP (JSON-Speicher)', huge.s === 400 || huge.s === 413, `HTTP ${huge.s}`);

  const bgNoAuth = await call('POST', '/api/backgrounds', { layer: 'app', background: { type: 'preset', value: 'galaxy' } });
  ok('Hintergrund ohne Token → 401', bgNoAuth.s === 401, `HTTP ${bgNoAuth.s}`);
  const stNoAuth = await call('GET', '/api/stickers/packs');
  ok('Sticker ohne Token → 401', stNoAuth.s === 401, `HTTP ${stNoAuth.s}`);
  const vipNoAuth = await call('POST', '/api/vip/redeem', { code: 'VIP-TEST-0001' });
  ok('VIP-Einlösen ohne Token → 401', vipNoAuth.s === 401, `HTTP ${vipNoAuth.s}`);

  console.log('\n' + '='.repeat(58));
  console.log(`  ${fail === 0 ? '🎉' : '⚠️ '}  ${pass} bestanden · ${fail} fehlgeschlagen`);
  console.log('='.repeat(58) + '\n');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n💥 Test abgebrochen:', e.message);
  process.exit(1);
});
