/* =====================================================================
 *  🎨 v419.js — V4.19 „Persönlich": Hintergründe, Töne, Sticker, VIP
 * ---------------------------------------------------------------------
 *  Ehrliche Vorgeschichte:
 *  · GET/POST /api/app-background gab es seit V3 — der Client hat es NIE
 *    aufgerufen (grep im ganzen client/ → 0 Treffer). Fünfter Fall dieser Art.
 *  · Pro-Chat-Ton, Sticker-Packs und VIP existierten überhaupt nicht.
 *
 *  Diese Datei macht daraus echte Features:
 *    1. Hintergründe in DREI Ebenen (app / liste / chat) mit Unschärfe,
 *       Helligkeit und Overlay — pro Nutzer gespeichert.
 *    2. 30 Benachrichtigungstöne + Ton PRO CHAT.
 *    3. Sticker-Packs mit Favoriten, „zuletzt benutzt" und Suche.
 *    4. VIP über Einlösecodes (ENV VIP_CODES) mit echten, prüfbaren Rechten.
 *
 *  Grenzen, die ich NICHT erfunden habe:
 *  · Bilder liegen als data-URL in database.json. 100 MB Upload wäre
 *    Selbstmord für den Server (JSON wird bei jedem saveDb neu geschrieben).
 *    VIP bekommt deshalb 2,5 MB statt 700 KB — das ist der Faktor 3,5,
 *    den die Speicherform wirklich hergibt. Steht auch so im Perk-Text.
 * ===================================================================== */
'use strict';

/* ---------------- 🎨 Hintergrund-Presets (CSS, keine Dateien) ---------- */
const BG_PRESETS = [
  { id: 'pink-clouds', name: 'Pink Clouds 💗', css: 'linear-gradient(160deg,#ffd9ec 0%,#ffe9f4 40%,#e9d6ff 100%)' },
  { id: 'neon-city', name: 'Neon City ✨', css: 'linear-gradient(160deg,#1b0b2e 0%,#3d1163 45%,#8b1d8f 100%)' },
  { id: 'kawaii-garden', name: 'Kawaii Garden 🌸', css: 'linear-gradient(160deg,#ffe6f2 0%,#e6ffe9 55%,#fff4d6 100%)' },
  { id: 'galaxy', name: 'Galaxy 🌌', css: 'radial-gradient(circle at 30% 20%,#4b1e7a 0%,#1a0b33 55%,#05010f 100%)' },
  { id: 'pastel-hearts', name: 'Pastel Hearts 🎀', css: 'linear-gradient(135deg,#fff0f7 0%,#ffd6ea 50%,#f0d9ff 100%)' },
  { id: 'fire', name: 'Fire 🔥', css: 'linear-gradient(160deg,#2b0a00 0%,#7a1f00 40%,#ff7a18 75%,#ffd166 100%)' },
  { id: 'ocean', name: 'Ocean 🌊', css: 'linear-gradient(180deg,#e0f7ff 0%,#a8e6ff 40%,#4aa8d8 100%)' },
  { id: 'sunset', name: 'Sunset 🌅', css: 'linear-gradient(180deg,#2b1055 0%,#7597de 35%,#ffb26b 75%,#ffd6a5 100%)' },
  { id: 'mint', name: 'Mint Dream 🍃', css: 'linear-gradient(160deg,#e8fff7 0%,#b8f2e6 55%,#d9f7ff 100%)' },
  { id: 'lavender', name: 'Lavender ✿', css: 'linear-gradient(160deg,#f3e8ff 0%,#ddd0ff 55%,#f8e8ff 100%)' },
  { id: 'strawberry', name: 'Strawberry 🍓', css: 'linear-gradient(160deg,#fff0f3 0%,#ffc2d1 50%,#ffe5ec 100%)' },
  { id: 'midnight', name: 'Midnight 🌙', css: 'linear-gradient(180deg,#0b1026 0%,#1a1f4b 55%,#2d2350 100%)' },
  { id: 'peach', name: 'Peach 🍑', css: 'linear-gradient(160deg,#fff4e6 0%,#ffd7bd 55%,#ffe9d6 100%)' },
  { id: 'cyber', name: 'Cyber Pink ⚡', css: 'linear-gradient(135deg,#12001f 0%,#7a0050 45%,#ff2d95 100%)' },
  { id: 'sky', name: 'Sky ☁️', css: 'linear-gradient(180deg,#eaf4ff 0%,#bfe0ff 45%,#e8f6ff 100%)' },
  { id: 'forest', name: 'Forest 🌲', css: 'linear-gradient(160deg,#e6fff0 0%,#a8e6c1 55%,#d9f2e6 100%)' },
  { id: 'candy', name: 'Candy 🍬', css: 'linear-gradient(135deg,#ffd6f5,#fff0b8,#c6f0ff,#ffd6f5)' },
  { id: 'aurora', name: 'Aurora 🌠', css: 'linear-gradient(160deg,#04121f 0%,#0a5c6b 40%,#12a17a 70%,#7ef0c0 100%)' },
  { id: 'rose', name: 'Rose Gold 🌹', css: 'linear-gradient(160deg,#2a1620 0%,#7d4b5c 45%,#e8b4b8 100%)' },
  { id: 'polaroid', name: 'Polaroid 🤍', css: 'linear-gradient(160deg,#ffffff 0%,#f2f2f4 55%,#e6e6ea 100%)' },
];

/* Animierte Overlays, die über jedem Hintergrund liegen können */
const BG_ANIMATIONS = ['none', 'hearts', 'stars', 'bubbles', 'aurora', 'snow', 'sparkle'];

/* ---------------- 🔔 30 Töne (WebAudio-Rezepte) ------------------------
 *  Keine MP3-Dateien nötig: Der Client spielt die Rezepte über WebAudio.
 *  Jeder Ton = Liste von [Frequenz, Startversatz]-Paaren + Wellenform.
 *  Das hält das ZIP klein und funktioniert offline in der APK.
 * -------------------------------------------------------------------- */
const SOUNDS = [
  // 💗 Love
  { id: 'heartbeat',   name: 'Herzschlag 💗', pack: 'love',  type: 'sine',     notes: [[60, 0], [55, 0.18], [60, 0.62], [55, 0.8]], dur: 0.18 },
  { id: 'kiss',        name: 'Kuss 💋',       pack: 'love',  type: 'sine',     notes: [[1200, 0], [900, 0.06]], dur: 0.16 },
  { id: 'love-pop',    name: 'Love Pop 💕',   pack: 'love',  type: 'sine',     notes: [[660, 0], [990, 0.05], [1320, 0.1]], dur: 0.2 },
  { id: 'gold-chime',  name: 'Gold Chime 👑', pack: 'love',  type: 'triangle', notes: [[1046, 0], [1318, 0.08], [1568, 0.16], [2093, 0.26]], dur: 0.5 },
  { id: 'diamond',     name: 'Diamant 💎',    pack: 'love',  type: 'triangle', notes: [[2093, 0], [2637, 0.07], [3136, 0.14]], dur: 0.4 },
  { id: 'royal',       name: 'Royal 🎺',      pack: 'love',  type: 'square',   notes: [[392, 0], [523, 0.12], [659, 0.24]], dur: 0.35 },

  // ✨ Kawaii
  { id: 'chime',       name: 'Glöckchen 🔔',  pack: 'kawaii', type: 'sine',    notes: [[880, 0], [1174, 0.09], [1568, 0.18]], dur: 0.5 },
  { id: 'pop-sweet',   name: 'Süß Pop 🍬',    pack: 'kawaii', type: 'sine',    notes: [[520, 0], [780, 0.05]], dur: 0.22 },
  { id: 'sparkle',     name: 'Glitzer ✨',    pack: 'kawaii', type: 'triangle', notes: [[1318, 0], [1568, 0.06], [2093, 0.12], [2637, 0.18]], dur: 0.38 },
  { id: 'bell-cute',   name: 'Bell Cute 🔕',  pack: 'kawaii', type: 'sine',    notes: [[1568, 0], [2093, 0.1]], dur: 0.45 },
  { id: 'meow',        name: 'Miau 🐱',       pack: 'kawaii', type: 'sawtooth', notes: [[700, 0], [900, 0.08], [700, 0.18]], dur: 0.2 },
  { id: 'bubble',      name: 'Bläschen 🫧',   pack: 'kawaii', type: 'sine',    notes: [[1200, 0], [1600, 0.04], [2000, 0.08]], dur: 0.14 },

  // ⚡ Neon
  { id: 'synth',       name: 'Synth ⚡',      pack: 'neon',   type: 'sawtooth', notes: [[220, 0], [330, 0.06], [440, 0.12]], dur: 0.25 },
  { id: 'laser',       name: 'Laser 🔫',      pack: 'neon',   type: 'square',   notes: [[2400, 0], [1200, 0.05], [600, 0.1]], dur: 0.12 },
  { id: 'cyber',       name: 'Cyber 🤖',      pack: 'neon',   type: 'square',   notes: [[880, 0], [660, 0.05], [880, 0.1], [1320, 0.16]], dur: 0.14 },
  { id: 'glitch',      name: 'Glitch 📺',     pack: 'neon',   type: 'sawtooth', notes: [[400, 0], [1200, 0.03], [300, 0.07]], dur: 0.1 },
  { id: 'power-up',    name: 'Power Up 🎮',   pack: 'neon',   type: 'square',   notes: [[523, 0], [659, 0.06], [784, 0.12], [1046, 0.18]], dur: 0.2 },
  { id: 'arcade',      name: 'Arcade 👾',     pack: 'neon',   type: 'square',   notes: [[988, 0], [1319, 0.05], [988, 0.1]], dur: 0.12 },

  // 🌿 Chill
  { id: 'soft',        name: 'Sanft 🌸',      pack: 'chill',  type: 'sine',     notes: [[392, 0], [523, 0.12]], dur: 0.6 },
  { id: 'rain',        name: 'Regen 🌧️',     pack: 'chill',  type: 'sine',     notes: [[180, 0], [220, 0.15], [200, 0.3]], dur: 0.5 },
  { id: 'ocean-sound', name: 'Welle 🌊',      pack: 'chill',  type: 'sine',     notes: [[140, 0], [110, 0.25]], dur: 0.7 },
  { id: 'wind',        name: 'Wind 🍃',       pack: 'chill',  type: 'triangle', notes: [[300, 0], [260, 0.2]], dur: 0.6 },
  { id: 'wood',        name: 'Holz 🪵',       pack: 'chill',  type: 'triangle', notes: [[440, 0], [330, 0.04]], dur: 0.14 },
  { id: 'marimba',     name: 'Marimba 🎵',    pack: 'chill',  type: 'sine',     notes: [[523, 0], [659, 0.1]], dur: 0.5 },

  // 😂 Fun
  { id: 'boing',       name: 'Boing 🌀',      pack: 'fun',    type: 'sine',     notes: [[900, 0], [400, 0.06]], dur: 0.3 },
  { id: 'wobble',      name: 'Wobble 🫠',     pack: 'fun',    type: 'triangle', notes: [[500, 0], [700, 0.08], [450, 0.16]], dur: 0.25 },
  { id: 'meme',        name: 'Meme 😂',       pack: 'fun',    type: 'square',   notes: [[660, 0], [880, 0.05], [660, 0.1]], dur: 0.1 },
  { id: 'bruh',        name: 'Bruh 😐',       pack: 'fun',    type: 'sawtooth', notes: [[220, 0], [165, 0.15]], dur: 0.35 },
  { id: 'pop',         name: 'Plöpp 💧',      pack: 'fun',    type: 'sine',     notes: [[520, 0], [780, 0.05]], dur: 0.22 },
  { id: 'off',         name: 'Aus 🔇',        pack: 'fun',    type: 'sine',     notes: [], dur: 0 },
];

/* ---------------- 🎁 Sticker-Packs (40 Stickern pro Pack wären zu viel
 *  Datenbank-Ballast als Dateien — Sticker sind hier Emoji-basiert,
 *  dadurch unendlich scharf, transparent und sofort verfügbar.
 *  6 Packs à 20 = 120 Sticker + das animierte GIF-Pack (16).
 * -------------------------------------------------------------------- */
const STICKER_PACKS = [
  {
    id: 'love', name: 'Love 💗', emoji: '💗', vip: false,
    items: ['💗', '💖', '💕', '💞', '💓', '💘', '💝', '❤️', '🩷', '😍', '🥰', '😘', '💋', '🌹', '💐', '💌', '💍', '👩‍❤️‍💋‍👨', '🫶', '💐'],
  },
  {
    id: 'kawaii', name: 'Kawaii ✨', emoji: '✨', vip: false,
    items: ['✨', '⭐', '🌟', '💫', '🌸', '🌷', '🌺', '🦋', '🎀', '🧸', '🍭', '🍰', '🧁', '🍓', '🐱', '🐰', '🦄', '🌈', '☁️', '🍼'],
  },
  {
    id: 'meme', name: 'Meme 😂', emoji: '😂', vip: false,
    items: ['😂', '🤣', '😭', '💀', '🤡', '👽', '🤖', '🙃', '😐', '😴', '🤯', '🥴', '🤪', '😎', '🫠', '🤌', '👀', '🗿', '🥲', '😮‍💨'],
  },
  {
    id: 'reactions', name: 'Reactions 👍', emoji: '👍', vip: false,
    items: ['👍', '👎', '👏', '🙌', '🙏', '💪', '✌️', '🤝', '👋', '🫡', '🤙', '☝️', '🔥', '💯', '🎉', '🎊', '⚡', '✅', '❌', '💢'],
  },
  {
    id: 'vip-gold', name: 'VIP Gold 👑', emoji: '👑', vip: true,
    items: ['👑', '💎', '🏆', '🥇', '🪙', '💰', '🤑', '🍾', '🥂', '🎩', '🦁', '🐉', '⚜️', '🔱', '💠', '🌟', '🚀', '🛥️', '🏰', '🎖️'],
  },
  {
    id: 'dark', name: 'Dark Mode 🖤', emoji: '🖤', vip: true,
    items: ['🖤', '🌑', '🕷️', '🦇', '💀', '⚰️', '🗡️', '🩸', '🌚', '🕯️', '🔮', '🧛', '🧟', '👻', '🌘', '⛓️', '🥀', '☠️', '🌪️', '🖤'],
  },
];

function createV419(app, h, ctx) {
  const { db, saveDb, auth, chatSummary, sendToUser, nextId } = ctx;

  const allStickerItems = () => {
    const out = [];
    for (const p of STICKER_PACKS) p.items.forEach((e, i) => out.push({ pack: p.id, idx: i, emoji: e }));
    return out;
  };

  /* 👑 V4.29: VIP wird jetzt anhand der Telefonnummer entschieden
   * (Modul vip.js). Der alte Weg über Einlösecodes bleibt gültig.
   * Lazy über globalThis, weil v419 vor vip.js geladen wird. */
  const isVip = (u) => {
    try {
      const V = globalThis.__LC_VIP;
      if (V && typeof V.isVip === 'function') return V.isVip(u);
    } catch (e) {}
    if (!u || !u.vip) return false;
    if (u.vipUntil && u.vipUntil < Date.now()) return false;
    return true;
  };

  /* =================================================================
     🎨 HINTERGRUND — drei Ebenen, mit Unschärfe/Helligkeit/Overlay
     =================================================================
     Migration: V3 speicherte nur {type, value}. Das bleibt gültig und
     wird als Ebene „app" mit Standardwerten gelesen.
     ============================================================== */
  function normLayer(l) {
    if (!l || typeof l !== 'object') return null;
    const type = ['preset', 'custom', 'color', 'none'].includes(l.type) ? l.type : 'preset';
    return {
      type,
      value: String(l.value || ''),
      blur: Math.max(0, Math.min(40, Number(l.blur) || 0)),
      brightness: Math.max(20, Math.min(120, Number(l.brightness) || 100)),
      overlay: Math.max(0, Math.min(90, Number(l.overlay) || 0)),
      animation: BG_ANIMATIONS.includes(l.animation) ? l.animation : 'none',
      pos: ['center', 'top', 'bottom'].includes(l.pos) ? l.pos : 'center',
      updatedAt: Date.now(),
    };
  }

  app.get('/api/backgrounds', auth, h(async (req, res) => {
    const bgs = req.user.backgrounds || {};
    // V3-Feld übernehmen, falls vorhanden und noch nichts Neues gesetzt ist
    let layerApp = bgs.app || null;
    if (!layerApp && req.user.appBackground) {
      layerApp = normLayer({ type: req.user.appBackground.type, value: req.user.appBackground.value });
    }
    res.json({
      layers: { app: layerApp, list: bgs.list || null, chat: bgs.chat || null },
      presets: BG_PRESETS,
      animations: BG_ANIMATIONS,
      legacyAppBackground: req.user.appBackground || null,
    });
  }));

  app.post('/api/backgrounds', auth, h(async (req, res) => {
    const b = req.body || {};
    const layerName = String(b.layer || 'app');
    if (!['app', 'list', 'chat'].includes(layerName)) {
      return res.status(400).json({ error: 'Unbekannte Ebene (app, list, chat)' });
    }
    // null löscht die Ebene
    if (b.background === null) {
      req.user.backgrounds = req.user.backgrounds || {};
      delete req.user.backgrounds[layerName];
      saveDb();
      return res.json({ ok: true, layer: layerName, background: null });
    }
    const raw = b.background || b;
    if (raw.type === 'custom') {
      if (typeof raw.value !== 'string' || !raw.value.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Bild fehlt oder ist kein Bild' });
      }
      if (raw.value.length > 3.5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Bild zu groß (max. 2,5 MB nach Kompression)', code: 'bg_too_big' });
      }
    }
    if (raw.type === 'preset' && !BG_PRESETS.some((p) => p.id === raw.value)) {
      return res.status(400).json({ error: 'Unbekanntes Preset' });
    }
    const layer = normLayer(raw);
    req.user.backgrounds = req.user.backgrounds || {};
    req.user.backgrounds[layerName] = layer;
    // V3-Kompatibilität weiterpflegen
    if (layerName === 'app') req.user.appBackground = { type: layer.type, value: layer.value, updatedAt: layer.updatedAt };
    saveDb();
    res.json({ ok: true, layer: layerName, background: layer });
  }));

  /* =================================================================
     🔔 TÖNE — 30 Stück, Standard global, eigener Ton pro Chat
     ================================================================= */
  app.get('/api/sounds', auth, h(async (req, res) => {
    res.json({
      sounds: SOUNDS,
      mine: { default: req.user.sound || 'chime', vol: req.user.soundVol === undefined ? 0.5 : req.user.soundVol, chats: req.user.chatSounds || {} },
    });
  }));

  app.post('/api/sounds', auth, h(async (req, res) => {
    const b = req.body || {};
    if (b.default !== undefined) {
      if (!SOUNDS.some((s) => s.id === b.default)) return res.status(400).json({ error: 'Unbekannter Ton' });
      req.user.sound = b.default;
    }
    if (b.vol !== undefined) req.user.soundVol = Math.max(0, Math.min(1, Number(b.vol) || 0));
    if (b.chatId !== undefined) {
      const cid = String(b.chatId);
      req.user.chatSounds = req.user.chatSounds || {};
      if (b.sound === null || b.sound === 'default') delete req.user.chatSounds[cid];
      else if (!SOUNDS.some((s) => s.id === b.sound)) return res.status(400).json({ error: 'Unbekannter Ton' });
      else req.user.chatSounds[cid] = b.sound;
    }
    saveDb();
    res.json({ ok: true, mine: { default: req.user.sound || 'chime', vol: req.user.soundVol, chats: req.user.chatSounds || {} } });
  }));

  /* =================================================================
     🎁 STICKER — Packs, Favoriten, zuletzt benutzt, Suche
     ================================================================= */
  app.get('/api/stickers/packs', auth, h(async (req, res) => {
    const vip = isVip(req.user);
    const packs = STICKER_PACKS.map((p) => ({
      id: p.id, name: p.name, emoji: p.emoji, vip: !!p.vip,
      count: p.items.length,
      locked: !!p.vip && !vip,
      // gesperrte Packs liefern keine Sticker aus (kein „durchwinken")
      items: (p.vip && !vip) ? [] : p.items.map((e, i) => ({ id: p.id + '-' + i, emoji: e, pack: p.id })),
    }));
    res.json({
      packs,
      vouchers: { vip, total: packs.filter((p) => !p.locked).reduce((n, p) => n + p.items.length, 0) },
      favs: req.user.stickerFavs || [],
      recent: req.user.stickerRecent || [],
    });
  }));

  app.get('/api/stickers/pack/:id', auth, h(async (req, res) => {
    const p = STICKER_PACKS.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Pack nicht gefunden' });
    if (p.vip && !isVip(req.user)) return res.status(403).json({ error: 'Dieses Pack ist nur für VIP 👑', code: 'vip_only' });
    res.json({ pack: { id: p.id, name: p.name, emoji: p.emoji, vip: !!p.vip, items: p.items.map((e, i) => ({ id: p.id + '-' + i, emoji: e, pack: p.id })) } });
  }));

  app.get('/api/stickers/search', auth, h(async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const vip = isVip(req.user);
    const packs = STICKER_PACKS.filter((p) => !p.vip || vip);
    if (!q) return res.json({ results: [] });
    // Suche über Pack-Name + Emoji-Zeichen
    const results = [];
    for (const p of packs) {
      const hit = p.name.toLowerCase().includes(q) || p.id.includes(q);
      p.items.forEach((e, i) => {
        if (hit) results.push({ id: p.id + '-' + i, emoji: e, pack: p.id, packName: p.name });
      });
    }
    res.json({ results: results.slice(0, 60), query: q });
  }));

  app.post('/api/stickers/fav', auth, h(async (req, res) => {
    const id = String((req.body || {}).id || '');
    const exists = allStickerItems().some((x) => x.pack + '-' + x.idx === id);
    if (!exists) return res.status(400).json({ error: 'Diesen Sticker gibt es nicht' });
    const item = allStickerItems().find((x) => x.pack + '-' + x.idx === id);
    const pack = STICKER_PACKS.find((p) => p.id === item.pack);
    if (pack.vip && !isVip(req.user)) return res.status(403).json({ error: 'VIP-Sticker 👑', code: 'vip_only' });
    const favs = new Set(req.user.stickerFavs || []);
    const on = (req.body || {}).fav !== false;
    if (on) favs.add(id); else favs.delete(id);
    req.user.stickerFavs = [...favs].slice(0, 100);
    saveDb();
    res.json({ ok: true, favs: req.user.stickerFavs, fav: on });
  }));

  app.post('/api/stickers/recent', auth, h(async (req, res) => {
    const id = String((req.body || {}).id || '');
    if (!id) return res.status(400).json({ error: 'id fehlt' });
    const list = (req.user.stickerRecent || []).filter((x) => x !== id);
    list.unshift(id);
    req.user.stickerRecent = list.slice(0, 24);
    saveDb();
    res.json({ ok: true, recent: req.user.stickerRecent });
  }));

  /* =================================================================
     👑 VIP — Einlösecodes aus der Umgebung, echte Rechte
     ================================================================= */
  const VIP_LIMITS = {
    // ⚠️ Keine Fantasiezahlen: Bilder liegen als data-URL in database.json.
    // 100 MB würde jede saveDb() in Sekunden blockieren. Faktor 3,5 ist
    // das, was der Speicherweg real hergibt.
    uploadBytes: { free: 700 * 1024, vip: 2450 * 1024 },
    devices: { free: 5, vip: 10 },
    themes: { free: 20, vip: 30 },
    stickerPacks: { free: 4, vip: 6 },
  };

  function vipCodes() {
    const raw = String(process.env.VIP_CODES || '').trim();
    if (!raw) return [];
    return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  }

  app.get('/api/vip/status', auth, h(async (req, res) => {
    const u = req.user;
    const active = isVip(u);
    res.json({
      vip: active,
      since: u.vipSince || null,
      until: u.vipUntil || null,
      code: u.vipCode ? String(u.vipCode).slice(0, 4) + '••••' : null,
      perks: Object.entries(VIP_LIMITS).map(([k, v]) => ({ key: k, free: v.free, vip: v.vip })),
      codesConfigured: vipCodes().length > 0,
    });
  }));

  app.post('/api/vip/redeem', auth, h(async (req, res) => {
    const u = req.user;
    const code = String((req.body || {}).code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Code fehlt' });
    const codes = vipCodes().map((c) => c.toUpperCase());
    if (!codes.length) {
      return res.status(503).json({ error: 'Auf diesem Server sind noch keine VIP-Codes eingerichtet (ENV VIP_CODES)', code: 'no_codes' });
    }
    // 🐞 V4.19: Erst die Liste fragen, dann das Format prüfen. Vorher wurde
    // ein in VIP_CODES eingetragener Code wie „VIP-ZIP-0001" (3 statt 4
    // Zeichen im Mittelteil) mit „Format falsch" abgelehnt — obwohl der
    // Betreiber ihn selbst gesetzt hatte. Die ENV ist die Wahrheit.
    if (!codes.includes(code)) {
      if (!/^VIP-[A-Z0-9]{3,6}-[A-Z0-9]{3,6}$/.test(code)) {
        return res.status(400).json({ error: 'Format: VIP-XXXX-XXXX', code: 'bad_format' });
      }
      return res.status(404).json({ error: 'Dieser Code gilt nicht', code: 'unknown_code' });
    }

    // Codes sind Einmal-Codes: einmal eingelöst = verbrannt (in der DB vermerkt)
    db.usedVipCodes = db.usedVipCodes || {};
    if (db.usedVipCodes[code]) {
      // 🐞 V4.19: Ein Doppelklick auf „Einlösen" schickte den Code zweimal.
      // Der erste Versuch machte den Nutzer VIP, der zweite zeigte „schon
      // benutzt" — eine Fehlermeldung für etwas, das geklappt hat.
      // Lösung: für DENSELBEN Nutzer ist der Aufruf idempotent (200).
      if (db.usedVipCodes[code] === u.id && isVip(u)) {
        return res.json({
          ok: true, vip: true, until: u.vipUntil, months: 0, idempotent: true,
          message: 'Code war schon eingelöst — dein VIP läuft 👑',
        });
      }
      return res.status(409).json({ error: 'Dieser Code wurde schon benutzt', code: 'used', by: db.usedVipCodes[code] === u.id ? 'du' : 'jemand anderes' });
    }
    const months = Math.max(1, Math.min(60, parseInt((req.body || {}).months, 10) || 12));
    const base = isVip(u) && u.vipUntil ? u.vipUntil : Date.now();
    u.vip = true;
    u.vipSince = u.vipSince || Date.now();
    u.vipUntil = base + months * 30 * 86400000;
    u.vipCode = code;
    db.usedVipCodes[code] = u.id;
    saveDb();
    const pu = ctx.publicUser ? ctx.publicUser(u, { vip: true, vipUntil: u.vipUntil }) : { id: u.id, vip: true };
    for (const uid of ctx.onlineUsers || []) sendToUser(uid, { type: 'profile:updated', user: pu });
    res.json({ ok: true, vip: true, until: u.vipUntil, months, message: 'Willkommen im VIP-Club 👑' });
  }));

  app.get('/api/vip/perks', auth, h(async (req, res) => {
    res.json({ limits: VIP_LIMITS, vip: isVip(req.user) });
  }));

  /* Aktive Limits für andere Module (z.B. Upload-Prüfung in server.js) */
  app.get('/api/limits', auth, h(async (req, res) => {
    const vip = isVip(req.user);
    res.json({
      vip,
      image: vip ? VIP_LIMITS.uploadBytes.vip : VIP_LIMITS.uploadBytes.free,
      attachment: vip ? 14 * 1024 * 1024 : 6 * 1024 * 1024,
      devices: vip ? VIP_LIMITS.devices.vip : VIP_LIMITS.devices.free,
      stickerPacks: vip ? VIP_LIMITS.stickerPacks.vip : VIP_LIMITS.stickerPacks.free,
    });
  }));

  console.log('🎨 V4.19 aktiv — 3 Hintergrund-Ebenen · 30 Töne · 6 Sticker-Packs · VIP');
  return { isVip, VIP_LIMITS, SOUNDS, STICKER_PACKS, BG_PRESETS };
}

module.exports = { createV419, SOUNDS, STICKER_PACKS, BG_PRESETS, BG_ANIMATIONS };
