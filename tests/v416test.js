#!/usr/bin/env node
/* =====================================================================
 *  🧪 v416test.js — WhatsApp-Web-Features (V4.16)
 * ---------------------------------------------------------------------
 *  Prüft die Dinge, die NEU sind. Nicht "die Seite lädt", sondern:
 *    · Antwort mit Zitat kommt mit den richtigen Feldern zurück
 *    · Pin setzt EINE Nachricht, löst alte automatisch
 *    · Pin-Recht: Fremde dürfen nicht anpinnen
 *    · Weiterleiten setzt forwarded + forwardedFrom
 *    · Löschen entfernt die Nachricht wirklich
 *
 *  Start:  LC_BASE=http://127.0.0.1:3000 npm test
 * ===================================================================== */
const B = process.env.LC_BASE || 'http://127.0.0.1:3000';
const T = Date.now().toString().slice(-7);

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra !== undefined ? '  →  ' + extra : ''}`); }
};

async function call(method, path, body, token) {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined || body === null || method === 'GET' ? undefined : JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}

(async () => {
  console.log(`\n🎨 V4.16 WhatsApp-Web-Test ${T}\n${'='.repeat(58)}`);

  /* ---------- Vorbereitung: zwei Konten, ein Chat ---------- */
  const reg = async (username, displayName, phone) => {
    const r = await call('POST', '/api/register', {
      username, displayName, phone, email: `${username}@test.de`, password: 'Test1234!sicher',
    });
    if (r.s === 200 || r.s === 201) return { token: r.j.token, id: r.j.user.id };
    const l = await call('POST', '/api/login', { login: username, password: 'Test1234!sicher' });
    return { token: l.j.token, id: l.j.user.id };
  };

  const a = await reg('wa_a_' + T, 'Anna 💗', '+4917600' + (100000 + Number(T.slice(-5))));
  const b = await reg('wa_b_' + T, 'Ben 💙', '+4917601' + (100000 + Number(T.slice(-5))));
  ok('Zwei Testkonten angelegt', !!a.token && !!b.token);

  const chatRes = await call('POST', '/api/chats', { type: 'private', userId: b.id }, a.token);
  const chatId = chatRes.j.summary && chatRes.j.summary.id;
  ok('Privater Chat erstellt', !!chatId, JSON.stringify(chatRes.j).slice(0, 120));

  /* ---------- 1. Normale Nachricht ---------- */
  const m1 = await call('POST', `/api/chats/${chatId}/messages`, { text: 'Erste Nachricht 💗' }, a.token);
  ok('Nachricht gesendet', m1.s === 200 && !!m1.j.message);
  const mid1 = m1.j.message.id;
  ok('Sie hat keine replyTo', m1.j.message.replyTo === null, m1.j.message.replyTo);
  ok('Sie ist nicht angepinnt', m1.j.message.pinned === false);
  ok('Sie ist nicht weitergeleitet', m1.j.message.forwarded === false);

  /* ---------- 2. Antwort mit Zitat ---------- */
  const m2 = await call('POST', `/api/chats/${chatId}/messages`, { text: 'Antwort darauf ↩️', replyTo: mid1 }, b.token);
  const r2 = m2.j.message;
  ok('Antwort gesendet', m2.s === 200 && !!r2);
  ok('🔴 Antwort hat ein Zitat (replyTo)', !!r2.replyTo, r2.replyTo);
  ok('Zitat verweist auf die richtige Nachricht', r2.replyTo && r2.replyTo.id === mid1, r2.replyTo && r2.replyTo.id);
  ok('Zitat enthält den Original-Text', r2.replyTo && r2.replyTo.text === 'Erste Nachricht 💗', r2.replyTo && r2.replyTo.text);
  ok('Zitat kennt den Absender', r2.replyTo && r2.replyTo.senderName === 'Anna 💗', r2.replyTo && r2.replyTo.senderName);

  /* ---------- 3. Antwort auf gelöschte Nachricht wird abgelehnt ---------- */
  const ghost = await call('POST', `/api/chats/${chatId}/messages`, { text: 'antwort auf nichts', replyTo: 'm_gibtsnicht' }, b.token);
  ok('Antwort auf unbekannte Nachricht → kein Zitat, aber sendbar',
    ghost.s === 200 && ghost.j.message.replyTo === null, ghost.j.message && ghost.j.message.replyTo);

  /* ---------- 4. Anpinnen ---------- */
  const pin1 = await call('POST', `/api/chats/${chatId}/messages/${mid1}/pin`, {}, a.token);
  ok('Eigene Nachricht anpinnen', pin1.s === 200 && pin1.j.pinned === true, JSON.stringify(pin1.j));

  const pin2 = await call('POST', `/api/chats/${chatId}/messages/${mid1}/pin`, {}, a.token);
  ok('Zweites Anpinnen löst sie wieder', pin2.s === 200 && pin2.j.pinned === false, JSON.stringify(pin2.j));

  // wieder anpinnen, dann eine andere — die erste muss automatisch losgehen
  await call('POST', `/api/chats/${chatId}/messages/${mid1}/pin`, { pinned: true }, a.token);
  const pinOther = await call('POST', `/api/chats/${chatId}/messages/${r2.id}/pin`, { pinned: true }, b.token);
  ok('Zweite Nachricht anpinnen', pinOther.s === 200 && pinOther.j.pinned === true, JSON.stringify(pinOther.j));

  const list = await call('GET', `/api/chats/${chatId}/messages`, null, a.token);
  const msgs = list.j.messages || [];
  const pinnedCount = msgs.filter((m) => m.pinned).length;
  ok('🔴 Pro Chat ist nur EINE Nachricht angepinnt', pinnedCount === 1, `gefunden: ${pinnedCount}`);
  const pinnedMsg = msgs.find((m) => m.pinned);
  ok('Die NEUE ist die angepinnte', pinnedMsg && pinnedMsg.id === r2.id, pinnedMsg && pinnedMsg.id);

  const detail = await call('GET', `/api/chats/${chatId}`, null, a.token);
  ok('Chat-Details liefern die angepinnte Nachricht',
    !!(detail.j.pinned || (detail.j.chat && detail.j.chat.pinned)), JSON.stringify(detail.j).slice(0, 160));

  /* ---------- 5. Pin-Recht: Fremder darf nicht ---------- */
  const c = await reg('wa_c_' + T, 'Clara 🧡', '+4917602' + (100000 + Number(T.slice(-5))));
  const addC = await call('POST', `/api/chats/${chatId}/members`, { userId: c.id }, a.token);
  const cPin = await call('POST', `/api/chats/${chatId}/messages/${mid1}/pin`, { pinned: true }, c.token);
  ok('🔴 Fremder darf fremde Nachricht NICHT anpinnen', cPin.s === 403, `HTTP ${cPin.s}`);

  /* ---------- 6. Weiterleiten ---------- */
  const fwd = await call('POST', `/api/chats/${chatId}/messages`, {
    text: 'Weitergeleitete Nachricht ↪️',
    forwarded: true,
    forwardedFrom: { chatId: chatId, chatName: 'Testchat', senderName: 'Anna 💗' },
  }, a.token);
  const f = fwd.j.message;
  ok('Weiterleitung gesendet', fwd.s === 200 && !!f);
  ok('🔴 Sie ist als weitergeleitet markiert', f.forwarded === true);
  ok('Sie kennt den Ursprung', f.forwardedFrom && f.forwardedFrom.senderName === 'Anna 💗', f.forwardedFrom && f.forwardedFrom.senderName);

  /* ---------- 7. Bearbeiten ---------- */
  const upd = await call('PATCH', `/api/chats/${chatId}/messages/${mid1}`, { text: 'Erste Nachricht (bearbeitet)' }, a.token);
  ok('Eigene Nachricht bearbeiten', upd.s === 200 && upd.j.message.editedAt > 0, JSON.stringify(upd.j).slice(0, 100));
  const updForeign = await call('PATCH', `/api/chats/${chatId}/messages/${mid1}`, { text: 'hack' }, b.token);
  ok('Fremde Nachricht NICHT bearbeitbar', updForeign.s === 403, `HTTP ${updForeign.s}`);

  /* ---------- 8. Löschen ---------- */
  const del = await call('DELETE', `/api/chats/${chatId}/messages/${r2.id}`, null, b.token);
  ok('Eigene Nachricht löschen', del.s === 200, JSON.stringify(del.j).slice(0, 90));
  const after = await call('GET', `/api/chats/${chatId}/messages`, null, a.token);
  const gone = (after.j.messages || []).find((m) => m.id === r2.id);
  // Soft-Delete ist gewollt: WhatsApp zeigt "Nachricht wurde gelöscht".
  // Der TEXT muss weg sein, die Nachricht bleibt als Platzhalter.
  ok('🔴 Gelöschte Nachricht ist als gelöscht markiert', !!gone && gone.deleted === true,
    gone ? `deleted=${gone.deleted}` : 'Nachricht komplett weg');
  ok('🔴 Gelöschter Text ist wirklich leer', !gone || !gone.text, gone && gone.text);
  const stillPinned = (after.j.messages || []).filter((m) => m.pinned).length;
  ok('Gelöschte Nachricht ist nicht mehr angepinnt', stillPinned === 0, `noch ${stillPinned} angepinnt`);

  /* ---------- Fazit ---------- */
  console.log('\n' + '─'.repeat(58));
  const total = pass + fail;
  if (fail === 0) {
    console.log(`🏁 ${pass}/${total} bestanden`);
    console.log('   Antworten · Pin · Weiterleiten · Bearbeiten · Löschen 💗');
  } else {
    console.log(`❌ ${pass}/${total} bestanden — ${fail} Fehler`);
    process.exit(1);
  }
})().catch((e) => { console.error('💥', e); process.exit(1); });
