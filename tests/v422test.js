/* =====================================================================
 *  🧪 v422test.js — V4.22: „Verifiziert" und „KI" müssen PRÜFBAR sein
 * ---------------------------------------------------------------------
 *  Diese Datei prüft nicht, ob irgendwo ein blaues Bild steht, sondern
 *  ob die Kette stimmt:
 *
 *    Server-Schlüssel → Signatur → Prüfung mit dem Public Key
 *
 *  Und sie prüft die Fehler, die es vorher gab:
 *    · 2FA lag in drei Feldern (totp / twoFactor / db.twofa)
 *    · deswegen war der Haken für Inhaber und KI dauerhaft „blockiert"
 *    · ein normaler Nutzer konnte sich keinen Haken nehmen
 *
 *  Läuft gegen: LC_BASE=http://127.0.0.1:3900
 * ===================================================================== */
'use strict';

const crypto = require('crypto');
const BASE = process.env.LC_BASE || 'http://127.0.0.1:3900';
const VERSION = 'maxichat-badge-v1';

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
let skipped = 0;
function skip(name, warum) { skipped++; console.log(`  ⏭️  ${name} — übersprungen (${warum})`); }
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected),
    `erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`);
}

let seq = Math.floor(Math.random() * 900000) + 100000;

async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + path, {
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
    const username = `v422_${tag}_${seq}`;
    const phone = '+49176' + String(3000000 + seq).slice(-7);
    const r = await api('/api/register', {
      method: 'POST',
      body: { username, displayName: 'V422 ' + tag, phone, email: `${username}@test.de`, password: 'Test1234!sicher' },
    });
    if ((r.status === 200 || r.status === 201) && r.json && r.json.token) {
      return { token: r.json.token, id: r.json.user.id, username };
    }
    if (r.status === 429) await api('/api/dev/reset-limits', { method: 'POST', body: {} });
  }
  throw new Error('Registrierung fehlgeschlagen');
}

function parseBadge(s) {
  const p = String(s).split('|');
  if (p.length !== 5) return null;
  return { userId: p[0], role: p[1], avatarHash: p[2], issuedAt: Number(p[3]), signature: p[4] };
}
function payloadOf(b) {
  return Buffer.from(`${VERSION}|${b.userId}|${b.role}|${b.avatarHash}|${b.issuedAt}`, 'utf8');
}
function verifyBadge(b, pubDer) {
  return crypto.verify('sha256', payloadOf(b), { key: pubDer, format: 'der', type: 'spki' }, Buffer.from(b.signature, 'base64'));
}

(async () => {
  console.log('\n🔐 V4.22 — Haken & KI\n');

  /* ============ A. Die 2FA-Prüfung: alle drei Speicher ============ */
  console.log('— A. Feld-Drift (totp / twoFactor / db.twofa) —');
  const { hasTwoFactor } = require('../server/v422');
  const uid = 'u_probe42';
  ok('A1: nichts gesetzt → kein 2FA', hasTwoFactor({}, { id: uid }) === false);
  ok('A2: user.totp.enabled (alt) → 2FA erkannt', hasTwoFactor({}, { id: uid, totp: { enabled: true } }) === true);
  ok('A3: user.twoFactor.enabled (v3.js) → 2FA erkannt', hasTwoFactor({}, { id: uid, twoFactor: { enabled: true } }) === true);
  ok('A4: db.twofa[id].enabled (Login) → 2FA erkannt', hasTwoFactor({ twofa: { [uid]: { enabled: true } } }, { id: uid }) === true);
  ok('A5: enabled=false zählt NICHT', hasTwoFactor({ twofa: { [uid]: { enabled: false } } }, { id: uid, twoFactor: { enabled: false } }) === false);
  ok('A6: fremdes Konto im twofa-Store zählt nicht', hasTwoFactor({ twofa: { u_other: { enabled: true } } }, { id: uid }) === false);
  ok('A7: null-Nutzer stürzt nicht ab', hasTwoFactor({}, null) === false);
  ok('A8: leerer DB-Wert stürzt nicht ab', hasTwoFactor(undefined, { id: uid }) === false);

  /* ============ B. KI-Identität ============ */
  console.log('\n— B. Die KI ist als KI erkennbar —');
  const kiRes = await api('/api/verify/ki');
  const ki = (kiRes.json || {}).ki || {};
  eq('B1: /api/verify/ki antwortet 200', kiRes.status, 200);
  ok('B2: isAI === true', ki.isAI === true, `war ${ki.isAI}`);
  eq('B3: Anzeigename ist Lovechen', ki.displayName, 'Lovechen');
  ok('B4: Haken der KI ist verifiziert', ki.verified === true);
  ok('B5: Signatur-Zeile vorhanden', typeof ki.signature === 'string' && ki.signature.includes('Maxichen'));
  ok('B6: username bleibt technisch lovebot', ki.username === 'lovebot');
  ok('B7: ID der KI stabil (u_…)', /^u_[0-9a-f]{12}$/.test(String(ki.id)), `war ${ki.id}`);
  ok('B8: kein Passwort/Hash im KI-Objekt', !('pass' in ki) && !('salt' in ki));

  /* ============ C. Zusammenfassung für die Oberfläche ============ */
  console.log('\n— C. /api/verify/summary —');
  const u = await signup('a');
  const sum = await api('/api/verify/summary', { token: u.token });
  eq('C1: 200 mit Token', sum.status, 200);
  ok('C2: verified-Map vorhanden', !!(sum.json && sum.json.verified));
  ok('C3: KI steht in der Map', !!(sum.json.verified || {})[ki.id]);
  eq('C4: KI ist dort als kind=ai markiert', (sum.json.verified || {})[ki.id] && sum.json.verified[ki.id].kind, 'ai');
  ok('C5: KI hat dort isAI=true', ((sum.json.verified || {})[ki.id] || {}).isAI === true);
  const ownerId = (sum.json.ki || {}).id;
  ok('C6: count passt zur Map', sum.json.count === Object.keys(sum.json.verified).length);
  ok('C7: Regeln werden mitgeliefert (needs2fa)', !!sum.json.rules && Array.isArray(sum.json.rules.needs2fa));
  ok('C8: Regeln nennen den Signatur-Endpunkt', sum.json.rules.signature.endpoint === '/api/badges');
  eq('C9: ohne Token → 401', (await api('/api/verify/summary')).status, 401);
  ok('C10: normaler Nutzer steht NICHT in der Map', !sum.json.verified[u.id]);

  /* ============ D. Der Inhaber ============ */
  console.log('\n— D. Inhaber-Haken —');
  const badgeRes = await api('/api/badges', { token: u.token });
  eq('D1: /api/badges → 200', badgeRes.status, 200);
  const all = (badgeRes.json || {}).badges || {};
  const ownerBadges = Object.values(all).filter((v) => String(v).split('|')[1] === 'owner');
  const ownerEntry = Object.entries(all).find(([, v]) => String(v).split('|')[1] === 'owner');
  /* In einem frischen ZIP gibt es keinen Inhaber: data/database.json wird
     bewusst NICHT mitgeliefert (Passwort-Hashes). Dann sind diese Prüfungen
     nicht anwendbar — sie werden übersprungen, nicht rot gefärbt. */
  if (ownerBadges.length) {
    ok('D2: es gibt genau einen Inhaber-Haken', ownerBadges.length === 1, `waren ${ownerBadges.length}`);
    ok('D3: Inhaber-Haken ist nicht blockiert', !!ownerEntry);
    ok('D4: Inhaber-Rolle heißt "owner"', ownerEntry && String(ownerEntry[1]).split('|')[1] === 'owner');
  } else {
    skip('D2–D4 Inhaber-Haken', 'kein Inhaber in dieser Datenbank (frisches ZIP)');
  }
  ok('D5: KI-Haken ist da', !!all[ki.id]);
  eq('D6: KI-Rolle heißt "bot"', String(all[ki.id] || '').split('|')[1], 'bot');
  ok('D7: normaler Nutzer hat KEINEN Haken', !all[u.id]);
  ok('D8: count ist plausibel (1–20)', badgeRes.json.count >= 1 && badgeRes.json.count <= 20, `war ${badgeRes.json.count}`);

  /* ============ E. Signatur wirklich prüfen ============ */
  console.log('\n— E. ECDSA-Signatur (nicht nur ein Flag) —');
  const keyRes = await api('/api/badges/key');
  eq('E1: /api/badges/key → 200', keyRes.status, 200);
  eq('E2: Algorithmus', keyRes.json.algorithm, 'ECDSA-P256-SHA256');
  eq('E3: Version', keyRes.json.version, VERSION);
  const pub = Buffer.from(keyRes.json.publicKey, 'base64');
  ok('E4: Public Key ist 91 Byte (P-256 SPKI)', pub.length === 91, `war ${pub.length}`);
  ok('E5: kein privater Schlüssel im Endpunkt', !JSON.stringify(keyRes.json).toLowerCase().includes('private'));

  // Geprüft wird am KI-Haken: der existiert in JEDER Installation.
  const kb = parseBadge(all[ki.id]);
  const ob = parseBadge(ownerEntry && ownerEntry[1]);
  ok('E6: KI-Badge zerlegbar in 5 Felder', !!kb);
  ok('E7: KI-Signatur ist gültig', kb && verifyBadge(kb, pub) === true);
  ok('E8: manipulierter avatarHash wird abgelehnt',
    kb && verifyBadge({ ...kb, avatarHash: 'deadbeef' }, pub) === false);
  ok('E9: manipulierte Rolle wird abgelehnt',
    kb && verifyBadge({ ...kb, role: 'owner' }, pub) === false);
  ok('E10: manipulierter Zeitstempel wird abgelehnt',
    kb && verifyBadge({ ...kb, issuedAt: kb.issuedAt + 1 }, pub) === false);
  ok('E11: Signatur ohne Public Key nicht prüfbar (fremder Key)',
    kb && (() => {
      const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'der' }, privateKeyEncoding: { type: 'pkcs8', format: 'der' } });
      return crypto.verify('sha256', payloadOf(kb), { key: other.publicKey, format: 'der', type: 'spki' }, Buffer.from(kb.signature, 'base64')) === false;
    })());
  ok('E12: avatarHash ist 32 Hex-Zeichen', /^[0-9a-f]{32}$/.test(kb.avatarHash), `war ${kb.avatarHash}`);
  ok('E13: issuedAt ist frisch (< 1 Tag)', Math.abs(Date.now() - kb.issuedAt) < 86400000);
  if (ob) ok('E14: Inhaber-Signatur ist gültig', verifyBadge(ob, pub) === true);
  else skip('E14 Inhaber-Signatur', 'kein Inhaber in dieser Datenbank');

  const sc = await api('/api/badges/selfcheck', { token: u.token });
  eq('E16: selfcheck good = true', sc.json.good, true);
  eq('E17: selfcheck tamperedAccepted = false', sc.json.tamperedAccepted, false);

  /* ============ F. Missbrauch: Haken selbst nehmen ============ */
  console.log('\n— F. Kein Haken per Knopfdruck —');
  const p1 = await api('/api/verify/provision', { method: 'POST', token: u.token, body: {} });
  eq('F1: normaler Nutzer → 400', p1.status, 400);
  eq('F2: Grund not_eligible', (p1.json || {}).code, 'not_eligible');
  const p2 = await api('/api/verify/provision', { method: 'POST', token: u.token, body: { userId: ki.id } });
  eq('F3: Fremder darf die KI nicht einrichten → 403', p2.status, 403);
  eq('F4: Grund owner_only', (p2.json || {}).code, 'owner_only');
  const p3 = await api('/api/verify/provision', { method: 'POST', token: u.token, body: { userId: u.id } });
  eq('F5: sich selbst auch nicht → 400', p3.status, 400);
  const o1 = await api('/api/verify/owner', { token: u.token });
  eq('F6: /api/verify/owner für Fremde → 403', o1.status, 403);
  eq('F7: /api/verify/provision ohne Token → 401', (await api('/api/verify/provision', { method: 'POST', body: {} })).status, 401);

  /* ============ G. KI in Chats ============ */
  console.log('\n— G. KI im Chat (Grundlage für Label + Fußzeile) —');
  const dm = await api('/api/chats', { method: 'POST', token: u.token, body: { type: 'private', userId: ki.id } });
  ok('G1: Chat mit der KI lässt sich öffnen', dm.status === 200 || dm.status === 201, `Status ${dm.status}`);
  const chatId = (dm.json || {}).summary && dm.json.summary.id;
  ok('G2: Chat-ID vorhanden', !!chatId);
  const det = await api('/api/chats/' + chatId, { token: u.token });
  eq('G3: Chat-Details → 200', det.status, 200);
  const members = ((det.json || {}).members) || [];
  const kiMember = members.find((m) => m.id === ki.id);
  ok('G4: KI ist Mitglied', !!kiMember);
  ok('G5: Mitglied trägt isAI=true', kiMember && kiMember.isAI === true);
  ok('G6: Mitglied trägt keinen Passwort-Hash', kiMember && !('pass' in kiMember) && !('salt' in kiMember));
  const sumWithKi = ((det.json || {}).chat) || {};
  ok('G7: Chatname zeigt den Klarnamen "Lovechen"', String(sumWithKi.name || '').includes('Lovechen'), `war ${sumWithKi.name}`);
  ok('G8: Chatname enthält nicht mehr "LoveBot"', !String(sumWithKi.name || '').includes('LoveBot'), `war ${sumWithKi.name}`);

  /* ============ H. Öffentliches Nutzerbild ============ */
  console.log('\n— H. publicUser —');
  const me = await api('/api/me', { token: u.token });
  ok('H1: /api/me → 200', me.status === 200);
  ok('H2: eigenes Konto hat isAI=false', me.json.user.isAI === false);
  ok('H3: kein salt im eigenen Konto', !('salt' in me.json.user));
  ok('H4: kein pass im eigenen Konto', !('pass' in me.json.user));

  console.log(`\n${fail === 0 ? '✅' : '❌'} V4.22: ${pass} grün, ${fail} rot${skipped ? `, ${skipped} übersprungen` : ''}\n`);
  if (fail) { console.log('Fehlgeschlagen:'); failures.forEach((f) => console.log('  · ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
