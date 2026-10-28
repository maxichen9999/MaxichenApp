/* =====================================================================
   🔐 MaxiChat E2E (V4.4) — Signal-Protokoll VORBEREITUNG
   Was hier schon echt funktioniert:
   · Identitäts-Keys (X25519) + signierte Prekeys + Einmal-Prekeys
   · Key-Bundle-Austausch wie bei Signal (X3DH-Bausteine)
   · verschlüsselte Umschläge (opaque) — der Server sieht nur Ciphertext
   Was noch fehlt (ehrlich):
   · Doppel-Ratchet (Double Ratchet) im Client — V4.5
   · Gruppen-Sender-Keys — V4.5
   ===================================================================== */

const crypto = require('crypto');

function createE2E(app, h, ctx) {
  const { db, saveDb, auth, MOD } = ctx;

  function ensure() {
    if (!db.e2eKeys) db.e2eKeys = {};
    return db.e2eKeys;
  }

  function pub(userId) {
    const k = ensure()[userId];
    if (!k) return null;
    return {
      userId,
      identityKey: k.identityKey,
      signedPrekey: k.signedPrekey,
      prekeySignature: k.prekeySignature,
      signingKey: k.signingKey || '',
      oneTimePrekeys: (k.oneTimePrekeys || []).filter((p) => !p.used).map((p) => ({ id: p.id, key: p.key })),
      registrationId: k.registrationId,
      // V4.9: ML-KEM-768-Prekey + Signatur (PQXDH)
      pqPrekey: k.pqPrekey || null,
      pqSignature: k.pqSignature || null,
      pqUpdatedAt: k.pqUpdatedAt || null,
      updatedAt: k.updatedAt,
    };
  }

  /* ---------- eigene Keys veröffentlichen ---------- */
  app.post('/api/e2e/keys', auth, h(async (req, res) => {
    const me = req.user;
    const b = req.body || {};
    const b64 = (v, max) => typeof v === 'string' && v.length >= 16 && v.length <= (max || 4096);

    if (!b64(b.identityKey) || !b64(b.signedPrekey) || !b64(b.prekeySignature, 512)) {
      return res.status(400).json({ error: 'Key-Bundle unvollständig', code: 'e2e_invalid' });
    }
    // V4.9 — ML-KEM-768: öffentlicher Schlüssel MUSS exakt 1184 Byte sein
    // (FIPS 203). Ein abgeschnittener Schlüssel würde sonst als "PQ-fähig"
    // durchgehen und der Quantenschutz wäre nur auf dem Papier da.
    let pqPrekey = null, pqSignature = null;
    if (b.pqPrekey != null) {
      let raw = null;
      try { raw = Buffer.from(String(b.pqPrekey), 'base64'); } catch (e) { raw = null; }
      if (!raw || raw.length !== 1184) {
        return res.status(400).json({
          error: 'PQ-Prekey muss ein ML-KEM-768-Schlüssel sein (1184 Byte)',
          code: 'pq_invalid', got: raw ? raw.length : 0, want: 1184,
        });
      }
      if (!b64(b.pqSignature, 512)) {
        return res.status(400).json({ error: 'PQ-Prekey ist nicht signiert', code: 'pq_unsigned' });
      }
      pqPrekey = String(b.pqPrekey);
      pqSignature = b.pqSignature;
    }

    const otp = Array.isArray(b.oneTimePrekeys) ? b.oneTimePrekeys.slice(0, 100) : [];
    const key = {
      identityKey: b.identityKey,
      signedPrekey: b.signedPrekey,
      prekeySignature: b.prekeySignature,
      // öffentlicher ECDSA-P-256-Schlüssel: damit PRÜFT der Partner die SPK-Signatur
      signingKey: typeof b.signingKey === 'string' ? b.signingKey.slice(0, 512) : '',
      registrationId: parseInt(b.registrationId, 10) || crypto.randomInt(1, 16380),
      pqPrekey,
      pqSignature,
      pqUpdatedAt: pqPrekey ? Date.now() : null,
      oneTimePrekeys: otp.map((p, i) => ({
        id: parseInt(p.id, 10) || i + 1,
        key: String(p.key || '').slice(0, 512),
        used: false,
      })),
      updatedAt: Date.now(),
    };
    ensure()[me.id] = key;
    saveDb();
    res.json({
      ok: true,
      registrationId: key.registrationId,
      prekeys: key.oneTimePrekeys.length,
      pq: !!key.pqPrekey,
    });
  }));

  /* ---------- fremdes Key-Bundle holen (verbraucht 1 Einmal-Prekey) ---------- */
  app.get('/api/e2e/keys/:userId', auth, h(async (req, res) => {
    const targetId = String(req.params.userId || '');
    if (!db.users[targetId]) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    const keys = ensure();
    const k = keys[targetId];
    if (!k) return res.status(404).json({ error: 'Diese Person hat noch keine E2E-Keys 🔐', code: 'no_keys' });

    // Einmal-Prekey abgeben (Signal-Verhalten)
    const otp = (k.oneTimePrekeys || []).find((p) => !p.used);
    if (otp) otp.used = true;
    saveDb();

    res.json({
      bundle: {
        userId: targetId,
        identityKey: k.identityKey,
        signedPrekey: k.signedPrekey,
        prekeySignature: k.prekeySignature,
        signingKey: k.signingKey || '',
        oneTimePrekey: otp ? { id: otp.id, key: otp.key } : null,
        registrationId: k.registrationId,
        // V4.9: ohne diesen Schlüssel startet der Client KEINEN stillen Fallback
        pqPrekey: k.pqPrekey || null,
        pqSignature: k.pqSignature || null,
      },
      pq: !!k.pqPrekey,
      prekeysLeft: (k.oneTimePrekeys || []).filter((p) => !p.used).length,
    });
  }));

  /* ---------- V4.9: Wer kann schon Post-Quantum? ----------
     Ehrliche Auskunft statt stiller Annahme: der Client fragt hier nach,
     bevor er behauptet "quantensicher". Liefert nur öffentliche Fakten. */
  app.get('/api/e2e/pq-readiness', auth, h(async (req, res) => {
    const keys = ensure();
    const ids = Object.keys(keys);
    const out = {};
    for (const id of ids) out[id] = !!keys[id].pqPrekey;
    const ready = ids.filter((id) => out[id]).length;
    res.json({
      ready,
      total: ids.length,
      users: out,
      algo: 'ML-KEM-768 (FIPS 203) + X25519',
      handshake: 'PQXDH',
      keyBytes: 1184,
    });
  }));

  /* ---------- Chat auf E2E stellen ---------- */
  app.post('/api/chats/:id/e2e/enable', auth, h(async (req, res) => {
    const me = req.user;
    const chat = ctx.getChatOr404(req, res);
    if (!chat) return;
    if (!ctx.isChatAdmin(me, chat)) return res.status(403).json({ error: 'Nur Chat-Admins können E2E aktivieren 🔐' });

    const ready = chat.memberIds.filter((id) => ensure()[id]);
    chat.e2e = {
      enabled: true,
      version: 1,
      since: Date.now(),
      byId: me.id,
      readyIds: ready,
      // ehrlich: Doppel-Ratchet fehlt noch
      note: 'Key-Austausch aktiv · Doppel-Ratchet folgt in V4.5',
    };
    saveDb();
    for (const uid of chat.memberIds) {
      ctx.sendToUser(uid, { type: 'e2e:enabled', chatId: chat.id, readyIds: ready, version: 1 });
    }
    res.json({
      ok: true, e2e: chat.e2e,
      warning: ready.length < chat.memberIds.length
        ? (chat.memberIds.length - ready.length) + ' Mitglied(er) haben noch keine Keys — sie können nicht entschlüsseln 🔐'
        : 'Alle Mitglieder haben Keys ✅',
    });
  }));

  app.post('/api/chats/:id/e2e/disable', auth, h(async (req, res) => {
    const chat = ctx.getChatOr404(req, res);
    if (!chat) return;
    if (!ctx.isChatAdmin(req.user, chat)) return res.status(403).json({ error: 'Nur Chat-Admins' });
    chat.e2e = { enabled: false, since: Date.now(), byId: req.user.id };
    saveDb();
    res.json({ ok: true });
  }));

  app.get('/api/chats/:id/e2e', auth, h(async (req, res) => {
    const chat = ctx.getChatOr404(req, res);
    if (!chat) return;
    const keys = ensure();
    res.json({
      e2e: chat.e2e || { enabled: false },
      members: chat.memberIds.map((id) => ({
        id,
        name: (db.users[id] || {}).displayName || '?',
        hasKeys: !!keys[id],
      })),
      ready: chat.memberIds.every((id) => !!keys[id]),
    });
  }));

  /* ---------- Verschlüsselter Umschlag senden ----------
     Der Client verschlüsselt selbst (X25519 + AES-GCM).
     Der Server speichert NUR Ciphertext — niemals Klartext. */
  app.post('/api/chats/:id/e2e/messages', auth, h(async (req, res) => {
    const me = req.user;
    const chat = ctx.getChatOr404(req, res);
    if (!chat) return;
    if (!chat.memberIds.includes(me.id)) return res.status(403).json({ error: 'Kein Mitglied' });

    const b = req.body || {};
    const enc = b.enc || {};
    const ratchet = typeof enc.ratchet === 'string' ? enc.ratchet.slice(0, 12000) : '';
    // 👥 V4.6: Gruppen-Nachricht (Sender Keys) — ein Ciphertext für alle Mitglieder
    const group = typeof enc.group === 'string' ? enc.group.slice(0, 12000) : '';
    if (ratchet.length > 10000 || group.length > 10000) return res.status(413).json({ error: 'Umschlag zu groß' });
    // streng prüfen: skm1|keyId|iteration|iv|ct|sig — genau 6 Teile, Iteration numerisch
    const skmParts = group ? group.split('|') : [];
    const skmOk = skmParts.length === 6 && skmParts[0] === 'skm1' && /^\d+$/.test(skmParts[2])
      && skmParts[1].length > 0 && skmParts[3].length > 0 && skmParts[4].length > 0 && skmParts[5].length > 0;
    if (group && !skmOk) return res.status(400).json({ error: 'Sender-Key-Nachricht unvollständig', code: 'skm_invalid' });
    if (group && chat.type === 'private') return res.status(400).json({ error: 'Sender Keys sind für Gruppen', code: 'skm_private' });

    // Klassischer Umschlag (V4.4) braucht aktiviertes E2E …
    if (!ratchet && !group && (!chat.e2e || !chat.e2e.enabled)) {
      return res.status(400).json({ error: 'E2E ist in diesem Chat nicht aktiv', code: 'e2e_off' });
    }
    // … ein echter Doppel-Ratchet-Umschlag (V4.5) schaltet den Chat selbst frei
    if ((ratchet || group) && (!chat.e2e || !chat.e2e.enabled)) {
      chat.e2e = { enabled: true, version: group ? 3 : 2, since: Date.now(), byId: me.id, ratchet: true, senderKeys: !!group };
    }
    if ((!enc.iv || !enc.ct || !enc.tag) && !ratchet && !group) return res.status(400).json({ error: 'Umschlag unvollständig', code: 'e2e_invalid' });
    if (String(enc.ct).length > 40 * 1024) return res.status(413).json({ error: 'Umschlag zu groß' });

    const m = {
      id: ctx.nextId('m_'),
      senderId: me.id,
      text: '',                     // ← absichtlich leer: Server kennt den Klartext nicht
      image: null,
      createdAt: Date.now(),
      reactions: {},
      readBy: [me.id],
      kind: 'e2e',
      enc: {
        v: parseInt(enc.v, 10) || 1,
        iv: String(enc.iv).slice(0, 64),
        ct: String(enc.ct),
        tag: String(enc.tag).slice(0, 64),
        // pro Empfänger ein eigener Schlüssel-Umschlag (Signal-Stil)
        recipients: Array.isArray(enc.recipients)
          ? enc.recipients.slice(0, 64).map((r) => ({ userId: String(r.userId || ''), key: String(r.key || '').slice(0, 512) }))
          : [],
        senderKey: String(enc.senderKey || '').slice(0, 512),
        // V4.5: kompletter Doppel-Ratchet-Umschlag (Header + Init + Ciphertext)
        ratchet,
        // V4.6: Gruppen-Nachricht mit Sender Keys (Signatur + Ciphertext, für ALLE gleich)
        group,
        v: group ? 3 : (ratchet ? 2 : (parseInt(enc.v, 10) || 1)),
      },
    };
    (db.messages[chat.id] = db.messages[chat.id] || []).push(m);
    saveDb();

    for (const uid of chat.memberIds) {
      ctx.sendToUser(uid, { type: 'message:new', chatId: chat.id, message: ctx.msgPublic(m) });
    }
    res.json({ ok: true, message: ctx.msgPublic(m) });
  }));

  /* ---------- 👥 V4.6: Sender-Key-Verteilung (SKDM) ----------
     Der Chain-Key ist ein GEHEIMNIS → er darf nur als Ciphertext durch den Server.
     Der Client verschlüsselt die SKDM einmal pro Empfänger über dessen
     1:1-Doppel-Ratchet-Session; der Server reiht sie nur ein. */
  app.post('/api/chats/:id/e2e/senderkey', auth, h(async (req, res) => {
    const me = req.user;
    const chat = ctx.getChatOr404(req, res);
    if (!chat) return;
    if (!chat.memberIds.includes(me.id)) return res.status(403).json({ error: 'Kein Mitglied' });
    const b = req.body || {};
    const to = String(b.to || '');
    if (!to || !chat.memberIds.includes(to)) return res.status(400).json({ error: 'Empfänger ist nicht in diesem Chat', code: 'skdm_target' });
    const envelope = typeof b.envelope === 'string' ? b.envelope.slice(0, 12000) : '';
    if (envelope.length < 32) return res.status(400).json({ error: 'SKDM fehlt', code: 'skdm_invalid' });
    if (!envelope.startsWith('skdm-env1|')) return res.status(400).json({ error: 'SKDM Format falsch', code: 'skdm_invalid' });

    if (!db.senderKeys) db.senderKeys = {};
    // Merker: dieser Nutzer hat in diesem Chat einen Sender-Key erzeugt (nur IDs, keine Schlüssel)
    if (!db.senderKeyOwners) db.senderKeyOwners = {};
    db.senderKeyOwners[chat.id] = db.senderKeyOwners[chat.id] || {};
    db.senderKeyOwners[chat.id][me.id] = String(b.keyId || '').slice(0, 64);
    const box = (db.senderKeys[chat.id] = db.senderKeys[chat.id] || {});
    const list = (box[to] = box[to] || []);
    // eine SKDM pro (Sender, keyId) — kein Aufblähen bei jedem Senden
    if (!list.some((x) => x.from === me.id && x.keyId === String(b.keyId || ''))) {
      list.push({ from: me.id, keyId: String(b.keyId || '').slice(0, 64), envelope, createdAt: Date.now() });
      if (list.length > 200) list.splice(0, list.length - 200);
      saveDb();
    }
    ctx.sendToUser(to, { type: 'e2e:senderkey', chatId: chat.id, fromId: me.id, keyId: String(b.keyId || '') });
    res.json({ ok: true, queued: true });
  }));

  /* ---------- offene Sender-Keys abholen (und damit als verteilt markieren) ---------- */
  app.get('/api/chats/:id/e2e/senderkeys', auth, h(async (req, res) => {
    const me = req.user;
    const chat = ctx.getChatOr404(req, res);
    if (!chat) return;
    if (!chat.memberIds.includes(me.id)) return res.status(403).json({ error: 'Kein Mitglied' });
    const box = (db.senderKeys && db.senderKeys[chat.id]) || {};
    const mine = box[me.id] || [];
    box[me.id] = [];
    saveDb();
    res.json({
      senderKeys: mine.map((x) => ({ fromId: x.from, keyId: x.keyId, envelope: x.envelope, createdAt: x.createdAt })),
      count: mine.length,
    });
  }));

  /* ---------- wer hat schon Sender Keys? (UI-Status, ohne Geheimnisse) ---------- */
  app.get('/api/chats/:id/e2e/senderkey-status', auth, h(async (req, res) => {
    const chat = ctx.getChatOr404(req, res);
    if (!chat) return;
    if (!chat.memberIds.includes(req.user.id)) return res.status(403).json({ error: 'Kein Mitglied' });
    const owners = (db.senderKeyOwners && db.senderKeyOwners[chat.id]) || {};
    // bereit = hat einen Sender-Key erzeugt UND wir haben ihn schon einmal gesehen
    const ready = chat.memberIds.filter((uid) => !!owners[uid]);
    res.json({ ready, total: chat.memberIds.length, mode: chat.e2e && chat.e2e.senderKeys ? 'senderkeys' : 'off' });
  }));

  console.log('🔐 V4.6 aktiv — X3DH + Doppel-Ratchet + Sender Keys (Gruppen-E2E)');
  return { pub };
}

module.exports = { createE2E };
