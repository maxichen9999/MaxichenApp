/* =====================================================================
 *  👑 vip.js — VIP **anhand der Telefonnummer** (V4.29)
 * ---------------------------------------------------------------------
 *  Wunsch: „geprüft ob VIP wird anhand der Nummer" — ja, ab jetzt schon.
 *
 *  Drei Quellen, in dieser Reihenfolge:
 *    1. `data/vip-numbers.json`   → dauerhaft, per Datei/Route pflegbar
 *    2. ENV `VIP_NUMBERS`         → z. B. "4915112345678,4917699999999"
 *    3. die Owner-Nummer          → ist immer VIP (steht in moderation.js)
 *
 *  Und weiterhin gültig: der alte Weg über Einlösecodes
 *  (`u.vip` + `u.vipUntil`) — bestehende VIPs verlieren nichts.
 *
 *  Die Nummer wird mit derselben Funktion normalisiert wie überall
 *  (`accounts.normalizePhone`), damit „+49 151 …" und „0049151…" und
 *  „49151…" auf denselben Eintrag zeigen.
 *
 *  Wer Nummern eintragen darf: **nur der Owner** (nie über ein normales
 *  Konto). Ansehen darf sie jeder nur für sich selbst.
 * ===================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const OWNER_PHONE_FALLBACK = '+4915155894714';

function loadNormalizer() {
  try {
    const acc = require('./accounts');
    if (typeof acc.normalizePhone === 'function') return acc.normalizePhone;
  } catch (e) {}
  return (p) => {
    let d = String(p || '').replace(/[^\d+]/g, '');
    if (d.startsWith('00')) d = '+' + d.slice(2);
    if (!d.startsWith('+')) d = '+' + d;
    return d;
  };
}
const normalize = loadNormalizer();

function ownerPhone() {
  return String(process.env.OWNER_PHONE || OWNER_PHONE_FALLBACK);
}

function envNumbers() {
  return String(process.env.VIP_NUMBERS || '')
    .split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).map(normalize).filter(Boolean);
}

function createVip(app, h, ctx) {
  const { db, saveDb, auth, isOwner } = ctx;
  const FILE = path.join(__dirname, 'data', 'vip-numbers.json');

  /* ---------------- Datei + DB ----------------
   * Die Datei ist die Wahrheit (überlebt einen DB-Reset), die DB nur
   * Zwischenspeicher — so gehen Nummern beim Aufräumen nicht verloren. */
  function readFile() {
    try {
      const a = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (Array.isArray(a)) return a.map(normalize).filter(Boolean);
    } catch (e) {}
    return [];
  }
  function writeFile(list) {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify([...new Set(list)], null, 2));
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error('⚠️  vip-numbers.json schreiben fehlgeschlagen:', e.message);
    }
  }

  db.vipNumbers = Array.isArray(db.vipNumbers) ? db.vipNumbers.map(normalize).filter(Boolean) : readFile();
  // Beim Start zusammenführen (Datei gewinnt, ENV kommt dazu)
  const merged = [...new Set([...readFile(), ...db.vipNumbers, ...envNumbers()])];
  db.vipNumbers = merged;
  writeFile(merged);

  /** Ist diese Nummer VIP? (ohne Nutzerkonto zu brauchen) */
  function isVipNumber(phone) {
    const p = normalize(String(phone || ''));
    if (!p) return false;
    if (p === normalize(ownerPhone())) return true;   // Owner immer
    if (envNumbers().includes(p)) return true;
    return (db.vipNumbers || []).includes(p);
  }

  /** Ist dieser Nutzer VIP? Nummer zuerst, dann der alte Code-Weg. */
  function isVip(u) {
    if (!u) return false;
    if (u.phone && u.phoneVerified !== false && isVipNumber(u.phone)) return true;
    if (!u.vip) return false;
    if (u.vipUntil && u.vipUntil < Date.now()) return false;
    return true;
  }

  function sourceOf(u) {
    if (!u) return null;
    if (u.phone && u.phoneVerified !== false && isVipNumber(u.phone)) {
      return normalize(u.phone) === normalize(ownerPhone()) ? 'owner-nummer' : 'nummer';
    }
    if (u.vip && (!u.vipUntil || u.vipUntil > Date.now())) return 'code';
    return null;
  }

  /* ---------------- Routen ---------------- */

  /** Eigenstatus: „warum bin ich VIP?" — ehrlich, mit Quelle. */
  app.get('/api/vip/me', auth, h(async (req, res) => {
    const u = req.user;
    res.set('Cache-Control', 'no-store');
    res.json({
      vip: isVip(u),
      source: sourceOf(u),
      phone: normalize(u.phone || '') || null,
      note: 'VIP wird an der Telefonnummer festgemacht — nicht am Kontonamen.',
    });
  }));

  /** Owner: alle VIP-Nummern (maskiert) + hinzufügen/entfernen. */
  app.get('/api/vip/numbers', auth, h(async (req, res) => {
    if (!isOwner(req.user)) return res.status(403).json({ error: 'Nur der Owner 👑', code: 'owner_only' });
    const mask = (p) => (p.length > 7 ? p.slice(0, 5) + '•••••' + p.slice(-3) : p);
    res.json({
      count: (db.vipNumbers || []).length,
      numbers: (db.vipNumbers || []).map((p) => ({ phone: mask(p), me: normalize(req.user.phone || '') === p })),
      ownerPhoneAlwaysVip: true,
      envCount: envNumbers().length,
    });
  }));

  app.post('/api/vip/numbers', auth, h(async (req, res) => {
    if (!isOwner(req.user)) return res.status(403).json({ error: 'Nur der Owner 👑', code: 'owner_only' });
    const p = normalize(String((req.body || {}).phone || ''));
    if (!/^\+[1-9]\d{6,15}$/.test(p)) return res.status(400).json({ error: 'Nummer unbrauchbar — mit Ländervorwahl, z. B. +4915112345678', code: 'bad_phone' });
    if ((db.vipNumbers || []).includes(p)) return res.status(409).json({ error: 'Steht schon drin', code: 'exists' });
    db.vipNumbers = [...(db.vipNumbers || []), p];
    writeFile(db.vipNumbers);
    saveDb();
    res.json({ ok: true, added: p.slice(0, 5) + '•••••' + p.slice(-3), count: db.vipNumbers.length });
  }));

  app.delete('/api/vip/numbers/:phone', auth, h(async (req, res) => {
    if (!isOwner(req.user)) return res.status(403).json({ error: 'Nur der Owner 👑', code: 'owner_only' });
    const p = normalize(String(req.params.phone || ''));
    if (p === normalize(ownerPhone())) return res.status(400).json({ error: 'Die Owner-Nummer bleibt immer VIP', code: 'owner_locked' });
    const before = (db.vipNumbers || []).length;
    db.vipNumbers = (db.vipNumbers || []).filter((x) => x !== p);
    if (db.vipNumbers.length === before) return res.status(404).json({ error: 'Nicht in der Liste', code: 'not_found' });
    writeFile(db.vipNumbers);
    saveDb();
    res.json({ ok: true, removed: p.slice(0, 5) + '•••••' + p.slice(-3), count: db.vipNumbers.length });
  }));

  console.log(`👑 VIP nach Nummer aktiv — ${db.vipNumbers.length} Nummer(n) in der Liste · Owner ${normalize(ownerPhone())} immer VIP`);
  return { isVip, isVipNumber, sourceOf, normalize, file: FILE };
}

module.exports = { createVip, normalize, ownerPhone };
