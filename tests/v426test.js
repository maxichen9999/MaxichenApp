/* =====================================================================
 *  🧪 v426test.js — V4.26 „Sicherheit + Töne"
 * ---------------------------------------------------------------------
 *  Geprüft wird:
 *    A. 40 Töne (30 alte bleiben + 10 neue), 5 Klingeltöne, Packs
 *    B. Ton wählen: gültig / ungültig / Lautstärke-Grenzen
 *    C. Backup: AES-256-GCM, Selbstprüfung, NUR das eigene
 *    D. Backup enthält NIE Passwort/Token/Schlüssel
 *    E. Manipuliertes Backup wird abgelehnt (nicht „repariert")
 *    F. Sicherheitscode: 60 Ziffern, für beide Seiten gleich, stabil
 *    G. App-Sperre: Biometrie nicht ohne Sperre,Minuten nur aus Liste
 *    H. Datenschutz: 6 neue Schlüssel, ungültige Wahl → 400
 *    I. Sicherheits-Punktzahl rechnet aus den Schaltern
 *    J. Alles ohne Token → 401
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
    const username = `v426_${tag}_${seq}`;
    const phone = '+49170' + String(6000000 + seq).slice(-7);
    const r = await api('/api/register', {
      method: 'POST',
      body: { username, displayName: 'V426 ' + tag, phone, email: `${username}@test.de`, password: 'Test1234!sicher' },
    });
    if ((r.status === 200 || r.status === 201) && r.json && r.json.token) return { token: r.json.token, id: r.json.user.id, username };
    // 🔴 Der Reset braucht den Header x-internal-token — ohne ihn 401, und dann
    //    bricht der zweite signup() ab (genau das passierte im npm-Lauf).
    if (r.status === 429 || r.status === 409) {
      await api('/api/dev/reset-limits', { method: 'POST', body: {}, internal: INTERNAL });
      continue;
    }
    break;
  }
  throw new Error('Registrierung fehlgeschlagen: ' + tag);
}

(async () => {
  console.log('\n🔒🎵 V4.26 — Sicherheit + Töne\n');

  const a = await signup('a');
  const b = await signup('b');

  console.log('— A. 40 Töne —');
  const snd = await api('/api/v426/sounds', { token: a.token });
  ok('A1: GET /api/v426/sounds → 200', snd.status === 200, `HTTP ${snd.status}`);
  const list = (snd.json && snd.json.sounds) || [];
  eq('A2: genau 40 Töne', snd.json && snd.json.total, 40);
  eq('A3: 40 Einträge in der Liste', list.length, 40);
  eq('A4: 10 neue Lovechen-Töne', list.filter((s) => s.pack === 'lovechen').length, 10);
  eq('A5: 30 alte bleiben', list.filter((s) => s.source === 'v419').length, 30);
  eq('A6: 5 Klingeltöne', (snd.json.ringtones || []).length, 5);
  ok('A7: jeder Ton hat Vibration', list.every((s) => Array.isArray(s.vib)), list.filter((s) => !Array.isArray(s.vib)).map((s) => s.id).join(','));
  // ⚠️ „Aus 🔇" (id: off) ist ABSICHTLICH ohne Noten und mit Dauer 0 —
  //    das ist der Stumm-Schalter, kein Ton. Er wird ausgenommen.
  const tonal = list.filter((s) => s.id !== 'off');
  ok('A8: jeder KLINGENDE Ton hat Noten', tonal.every((s) => Array.isArray(s.notes) && s.notes.length > 0), tonal.filter((s) => !s.notes.length).map((s) => s.id).join(','));
  ok('A9: jeder klingende Ton hat eine Dauer', tonal.every((s) => typeof s.dur === 'number' && s.dur > 0));
  ok('A9b: „Aus" existiert als Stummschalter', list.some((s) => s.id === 'off' && s.notes.length === 0));
  const ids = list.map((s) => s.id);
  eq('A10: keine doppelte ID', new Set(ids).size, ids.length);
  ok('A11: alter Ton „heartbeat" noch da', ids.includes('heartbeat'));
  ok('A12: neuer Ton „lovechen-glow" da', ids.includes('lovechen-glow'));
  ok('A13: Packs gezählt', snd.json && typeof snd.json.packs === 'object' && snd.json.packs.lovechen === 10, JSON.stringify(snd.json && snd.json.packs));

  console.log('\n— B. Ton wählen —');
  const set1 = await api('/api/v426/sounds', { method: 'POST', token: a.token, body: { default: 'lovechen-glow' } });
  ok('B1: gültigen Ton wählen → 200', set1.status === 200, `HTTP ${set1.status}`);
  eq('B2: gespeichert', set1.json && set1.json.sound, 'lovechen-glow');
  const set2 = await api('/api/v426/sounds', { method: 'POST', token: a.token, body: { default: 'gibtsnicht' } });
  ok('B3: unbekannter Ton → 400', set2.status === 400, `HTTP ${set2.status}`);
  const set3 = await api('/api/v426/sounds', { method: 'POST', token: a.token, body: { ringtone: 'ring-neon' } });
  eq('B4: Klingelton gesetzt', set3.json && set3.json.ringtone, 'ring-neon');
  const set4 = await api('/api/v426/sounds', { method: 'POST', token: a.token, body: { ringtone: 'ring-falsch' } });
  ok('B5: unbekanntes Klingeln → 400', set4.status === 400, `HTTP ${set4.status}`);
  const set5 = await api('/api/v426/sounds', { method: 'POST', token: a.token, body: { vol: 0.42 } });
  eq('B6: Lautstärke 0.42', set5.json && set5.json.vol, 0.42);
  const set6 = await api('/api/v426/sounds', { method: 'POST', token: a.token, body: { vol: 5 } });
  ok('B7: Lautstärke 5 → 400', set6.status === 400, `HTTP ${set6.status}`);
  const again = await api('/api/v426/sounds', { token: a.token });
  eq('B8: Wahl bleibt gespeichert', again.json && again.json.mine.default, 'lovechen-glow');

  console.log('\n— C. Verschlüsseltes Backup —');
  const bk = await api('/api/v426/backup', { method: 'POST', token: a.token, body: {} });
  ok('C1: Backup → 200', bk.status === 200, `HTTP ${bk.status} ${(bk.text || '').slice(0, 120)}`);
  eq('C2: AES-256-GCM', bk.json && bk.json.algorithm, 'AES-256-GCM');
  ok('C3: Selbstprüfung bestanden', bk.json && bk.json.selfCheck === true);
  ok('C4: versiegeltes Format v1.iv.tag.ct', /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bk.json.sealed || ''), (bk.json.sealed || '').slice(0, 30));
  ok('C5: Chats gezählt', bk.json && bk.json.counts && typeof bk.json.counts.chats === 'number');

  const ver = await api('/api/v426/backup/verify', { method: 'POST', token: a.token, body: { sealed: bk.json.sealed } });
  ok('C6: eigenes Backup prüfbar', ver.status === 200 && ver.json.ok === true, `HTTP ${ver.status}`);
  ok('C7: Version im Backup', ver.json && ver.json.version === 426, ver.json && ver.json.version);

  // Manipulation: ein Zeichen im Chiffrat kippen
  const parts = bk.json.sealed.split('.');
  const ct = parts[3];
  parts[3] = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
  const bad = await api('/api/v426/backup/verify', { method: 'POST', token: a.token, body: { sealed: parts.join('.') } });
  ok('C8: manipuliertes Backup → 400', bad.status === 400, `HTTP ${bad.status}`);
  eq('C9: Code bad_backup', bad.json && bad.json.code, 'bad_backup');
  const nonsense = await api('/api/v426/backup/verify', { method: 'POST', token: a.token, body: { sealed: 'hallo' } });
  ok('C10: Unsinn → 400 (kein Absturz)', nonsense.status === 400, `HTTP ${nonsense.status}`);

  console.log('\n— D. Backup enthält keine Geheimnisse —');
  const raw = (bk.json && bk.json.sealed) || '';
  ok('D1: kein „password" im Backup-Text', !/password/i.test(raw));
  ok('D2: kein „token" im Backup-Text', !/token/i.test(raw));
  ok('D3: kein „secret" im Backup-Text', !/secret/i.test(raw));
  ok('D4: kein „twofa" im Backup-Text', !/twofa/i.test(raw));
  // Gegenprobe: Klartext ist wirklich chiffriert (Nutzer-ID nicht lesbar)
  ok('D5: Nutzer-ID nicht im Chiffrat lesbar', !raw.includes(a.id), 'ID wäre im Klartext lesbar!');

  console.log('\n— E. Fremdes Backup wird abgelehnt —');
  const brestore = await api('/api/v426/backup/restore', { method: 'POST', token: b.token, body: { sealed: bk.json.sealed } });
  ok('E1: Backup von A bei B → 403', brestore.status === 403, `HTTP ${brestore.status}`);
  eq('E2: Code not_yours', brestore.json && brestore.json.code, 'not_yours');
  const own = await api('/api/v426/backup/restore', { method: 'POST', token: a.token, body: { sealed: bk.json.sealed } });
  ok('E3: eigenes Backup → 200', own.status === 200, `HTTP ${own.status}`);
  ok('E4: Einstellungen übernommen', own.json && Array.isArray(own.json.applied) && own.json.applied.length > 0, JSON.stringify(own.json && own.json.applied));
  ok('E5: Passwort/2FA NICHT übernommen', own.json && own.json.skipped.includes('passwort') && own.json.skipped.includes('2FA'));

  console.log('\n— F. Sicherheitscode —');
  const sc = await api('/api/v426/safety-code/' + b.id, { token: a.token });
  ok('F1: Sicherheitscode → 200', sc.status === 200, `HTTP ${sc.status}`);
  eq('F2: 60 Ziffern', sc.json && sc.json.digits, 60);
  ok('F3: in 5er-Gruppen', /^(\d{5} ){11}\d{5}$/.test(sc.json.code || ''), sc.json && sc.json.code);
  const sc2 = await api('/api/v426/safety-code/' + a.id, { token: b.token });
  eq('F4: beide Seiten sehen denselben Code', sc2.json && sc2.json.code, sc.json && sc.json.code);
  const sc3 = await api('/api/v426/safety-code/' + b.id, { token: a.token });
  eq('F5: Code ist stabil', sc3.json && sc3.json.code, sc.json && sc.json.code);
  ok('F6: QR-Nutzlast enthält den Code', (sc.json.qrPayload || '').includes((sc.json.code || '').replace(/ /g, '')));
  const self = await api('/api/v426/safety-code/' + a.id, { token: a.token });
  ok('F7: mit sich selbst → 400', self.status === 400, `HTTP ${self.status}`);
  const ghost = await api('/api/v426/safety-code/u_gibtsnicht', { token: a.token });
  ok('F8: unbekannter Nutzer → 404', ghost.status === 404, `HTTP ${ghost.status}`);

  console.log('\n— G. App-Sperre —');
  const lock0 = await api('/api/v426/lock', { token: a.token });
  ok('G1: GET /api/v426/lock → 200', lock0.status === 200, `HTTP ${lock0.status}`);
  ok('G2: Auswahl 0/1/5/30/60', JSON.stringify(lock0.json.choices) === JSON.stringify([0, 1, 5, 30, 60]), JSON.stringify(lock0.json.choices));
  const bioNo = await api('/api/v426/lock', { method: 'POST', token: a.token, body: { allowBiometric: true } });
  ok('G3: Biometrie ohne Sperre → 400', bioNo.status === 400, `HTTP ${bioNo.status}`);
  eq('G4: Code lock_off', bioNo.json && bioNo.json.code, 'lock_off');
  const on = await api('/api/v426/lock', { method: 'POST', token: a.token, body: { enabled: true } });
  ok('G5: Sperre einschalten → 200', on.status === 200 && on.json.enabled === true);
  const bioYes = await api('/api/v426/lock', { method: 'POST', token: a.token, body: { allowBiometric: true } });
  ok('G6: jetzt Biometrie erlaubt', bioYes.json && bioYes.json.allowBiometric === true);
  const badMin = await api('/api/v426/lock', { method: 'POST', token: a.token, body: { autoLockMinutes: 7 } });
  ok('G7: 7 Minuten → 400', badMin.status === 400, `HTTP ${badMin.status}`);
  const goodMin = await api('/api/v426/lock', { method: 'POST', token: a.token, body: { autoLockMinutes: 5 } });
  eq('G8: 5 Minuten gesetzt', goodMin.json && goodMin.json.autoLockMinutes, 5);
  ok('G9: Server speichert keinen Fingerabdruck', !/fingerprint|biometricData|faceId|face_data/i.test(JSON.stringify((await api('/api/v426/lock', { token: a.token })).json)));

  console.log('\n— H. Datenschutz (6 neue Schlüssel) —');
  const pv = await api('/api/v426/privacy', { token: a.token });
  ok('H1: GET /api/v426/privacy → 200', pv.status === 200, `HTTP ${pv.status}`);
  const keys = Object.keys(pv.json.privacy || {});
  eq('H2: 7 neue Schlüssel', keys.length, 7);
  ok('H3: statusPrivacy vorhanden', keys.includes('statusPrivacy'));
  ok('H4: groupAddPrivacy vorhanden', keys.includes('groupAddPrivacy'));
  ok('H5: callsPrivacy vorhanden', keys.includes('callsPrivacy'));
  ok('H6: liveLocationPrivacy vorhanden', keys.includes('liveLocationPrivacy'));
  const p1 = await api('/api/v426/privacy', { method: 'POST', token: a.token, body: { statusPrivacy: 'nobody' } });
  eq('H7: statusPrivacy → nobody', p1.json && p1.json.privacy.statusPrivacy, 'nobody');
  const p2 = await api('/api/v426/privacy', { method: 'POST', token: a.token, body: { callsPrivacy: 'quatsch' } });
  ok('H8: ungültige Wahl → 400', p2.status === 400, `HTTP ${p2.status}`);
  ok('H9: erlaubte Werte mitgeliefert', p2.json && Array.isArray(p2.json.allowed));
  const p3 = await api('/api/v426/privacy', { method: 'POST', token: a.token, body: { lastSeenHideFrom: [b.id, b.id, 'u_gibtsnicht'] } });
  eq('H10: Ausnahmen entdoppelt + nur echte Nutzer', p3.json && p3.json.privacy.lastSeenHideFrom, [b.id]);
  const p4 = await api('/api/v426/privacy', { method: 'POST', token: a.token, body: { lastSeenHideFrom: 'alle' } });
  ok('H11: String statt Liste → 400', p4.status === 400, `HTTP ${p4.status}`);

  console.log('\n— I. Sicherheits-Punktzahl —');
  const sec = await api('/api/v426/security', { token: a.token });
  ok('I1: GET /api/v426/security → 200', sec.status === 200, `HTTP ${sec.status}`);
  ok('I2: Punktzahl 0–100', sec.json.score >= 0 && sec.json.score <= 100, String(sec.json.score));
  eq('I3: Maximalpunktzahl 100', sec.json.maxScore, 100);
  ok('I4: Note vorhanden', typeof sec.json.grade === 'string' && sec.json.grade.length > 3, sec.json.grade);
  ok('I5: App-Sperre zählt als „an"', (sec.json.items.find((i) => i.id === 'appLock') || {}).on === true);
  ok('I6: Backup zählt als „an" (gerade erstellt)', (sec.json.items.find((i) => i.id === 'backup') || {}).on === true);
  ok('I7: Punktzahl passt zu den Schaltern', sec.json.score === sec.json.items.filter((i) => i.on).reduce((n, i) => n + i.weight, 0), `${sec.json.score}`);
  ok('I8: 40 Töne in der Übersicht', sec.json.sounds === 40, String(sec.json.sounds));
  const secB = await api('/api/v426/security', { token: b.token });
  ok('I9: anderer Nutzer hat andere Punktzahl', secB.json.score !== sec.json.score, `A=${sec.json.score} B=${secB.json.score}`);

  console.log('\n— J. Blockierte + Zugriffsschutz —');
  const bl = await api('/api/v426/blocked', { token: a.token });
  ok('J1: Blockliste → 200', bl.status === 200, `HTTP ${bl.status}`);
  ok('J2: Liste ist ein Array', Array.isArray(bl.json.blocked));
  const routes = ['/api/v426/sounds', '/api/v426/lock', '/api/v426/privacy', '/api/v426/session-check'];
  for (const r of routes.slice(0, 3)) {
    const noTok = await api(r);
    ok(`J3: ${r} ohne Token → 401`, noTok.status === 401, `HTTP ${noTok.status}`);
  }
  const bkNo = await api('/api/v426/backup', { method: 'POST', body: {} });
  ok('J4: Backup ohne Token → 401', bkNo.status === 401, `HTTP ${bkNo.status}`);
  const scNo = await api('/api/v426/safety-code/' + b.id);
  ok('J5: Sicherheitscode ohne Token → 401', scNo.status === 401, `HTTP ${scNo.status}`);

  console.log(`\n${fail === 0 ? '✅' : '❌'} V4.26: ${pass} grün, ${fail} rot`);
  if (fail) { console.log('\nFehlgeschlagen:'); failures.forEach((f) => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ v426test abgebrochen:', e); process.exit(1); });
