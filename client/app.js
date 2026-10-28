/* =====================================================================
   app.js — ausgelagertes Inline-Script der Web-App
   ---------------------------------------------------------------------
   WARUM: Die CSP (security-headers.js) erlaubt nur script-src 'self'.
   Ein 89-KB-<script>-Block im HTML wird vom Browser deshalb
   KOMPLETT BLOCKIERT — Buttons wie 'Registrieren' taten nichts.
   Jetzt: eigene Datei, CSP bleibt streng, keine 'unsafe-inline'-Lücke.
   ===================================================================== */
/* ============ 💗 LoveChat — Client by maxi⁹¹⁰ ============ */
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const THEMES = [
  { id: 'pink-dream', name: 'Pink Dream' },
  { id: 'pastell', name: 'Süßes Pastell' },
  { id: 'kawaii', name: 'Kawaii' },
  { id: 'rosen', name: 'Rosenwiese' },
  { id: 'lila-nacht', name: 'Lila Nacht' },
  { id: 'sternen', name: 'Sternenhimmel' },
  { id: 'neon', name: 'Neon Pink' },
  { id: 'midnight', name: 'Midnight' },
];
const DARK_THEMES = ['lila-nacht', 'sternen', 'neon', 'midnight'];
const EMOJIS = ['💗','💖','💕','🩷','','🤍','❤️','😍','🥰','','😎','','😅','😂','🤣','🥹','😭','😔','🥺','','🤔','😜','','😇','','🌸','','','✨','⭐','🌙','☀️','','','⚽','','💃','','🍰','','🍭','🧸','🐱','','','📱','','🛍️','','💻','⚡','','💯','','👏','','','🙏','','✌️','️','👑','🎁','💌','','🚀','','🍀','️',''];
const AVATAR_EMOJIS = ['💗','💜','🌸','🦋','🎀','⭐','🧸','🍰','🌙','✨','🐱','','👑','🩷','🌷','🍭'];
const QUICK_REACTS = ['💗','😂','😮','😢','🔥',''];
const NAME_COLORS = ['#e64980','#a855f7','#7c3aed','#db2777','#9333ea','#c026d3','#6d28d9','#e11d48'];

const S = {
  token: localStorage.getItem('lc_token') || '',
  user: null,
  chats: [],
  details: {},          // chatId -> {chat, members, groups}
  messages: {},         // chatId -> [msg]
  activeChat: null,
  online: new Set(),
  ws: null, wsRetry: 0,
  tab: 'all',
  searchQ: '',
  pendingImage: '',
  replyTo: null,
  polls: {},           // V4: chatId -> {pollId: poll}
  typingTimers: {},
  lastTypingSent: 0,
};

/* ---------- Helfer ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hashIdx(id, n) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % n; }
function colorOf(id) { return NAME_COLORS[hashIdx(id, NAME_COLORS.length)]; }
function isDarkTheme(t) { return DARK_THEMES.includes(t); }
/* 🖼️ V3: Wallpaper-Presets (identisch mit App + Server) */
const V3_PRESETS = {
  'pink-dream': 'linear-gradient(160deg,#2A0A2E,#4E1B4E 55%,#6B2A5C)',
  'kawaii-cloud': 'linear-gradient(160deg,#2E1A3E,#4E2A5C 55%,#7A4A7E)',
  'lila-nacht': 'linear-gradient(160deg,#1A0A2E,#2D1B4E 55%,#3B1E5A)',
  'neon-city': 'linear-gradient(160deg,#0E0620,#2A0A3E 55%,#1A1046)',
  'sakura': 'linear-gradient(160deg,#2A0F22,#45122E 55%,#63203F)',
  'galaxy': 'linear-gradient(160deg,#0A0A2E,#1A1046 55%,#2E1B6B)',
  'ocean': 'linear-gradient(160deg,#061A2E,#0E2E4E 55%,#155E75)',
  'forest': 'linear-gradient(160deg,#061E14,#0E3524 55%,#175C3A)',
  'sunset': 'linear-gradient(160deg,#2E0A1A,#5E2410 55%,#8A3A1A)',
  'candy': 'linear-gradient(160deg,#3A0A2E,#6B2050 55%,#9E3A78)',
  'mono': 'linear-gradient(160deg,#14141C,#23232E 55%,#32323E)',
  'aurora': 'linear-gradient(160deg,#081E2A,#123E4A 55%,#1A5E5E)',
};
function activeWallpaper() {
  const c = S.chats.find((x) => x.id === S.activeChat);
  return (c && c.wallpaper) || null;
}
function applyV3Wallpaper() {
  const area = $('#msgScroll');
  if (!area) return false;
  const w = activeWallpaper();
  if (w && w.type === 'custom' && w.value) {
    area.className = 'msgScroll dark';
    area.style.backgroundImage = 'linear-gradient(rgba(12,4,24,.35), rgba(12,4,24,.35)), url("' + w.value + '")';
    area.style.backgroundSize = 'cover';
    area.style.backgroundPosition = 'center';
    return true;
  }
  if (w && w.type === 'preset' && V3_PRESETS[w.value]) {
    area.className = 'msgScroll dark';
    area.style.backgroundImage = V3_PRESETS[w.value];
    return true;
  }
  return false;
}

function activeTheme() {
  const c = S.chats.find((x) => x.id === S.activeChat);
  return (c && c.bg) || (S.user && S.user.bg && S.user.bg.default) || 'pink-dream';
}
function fmtTime(ts) { return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
function sameDay(a, b) { return new Date(a).toDateString() === new Date(b).toDateString(); }
function fmtDaySep(ts) {
  const d = new Date(ts), n = new Date();
  if (sameDay(d, n)) return 'Heute';
  if (sameDay(d, new Date(n - 864e5))) return 'Gestern';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtListTime(ts) {
  const d = new Date(ts), n = new Date();
  if (sameDay(d, n)) return fmtTime(ts);
  if (d.getFullYear() === n.getFullYear()) return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtLastSeen(u) {
  if (!u || !u.lastSeen) return 'offline';
  const t = new Date(u.lastSeen);
  if (sameDay(t, new Date())) return 'zuletzt heute um ' + fmtTime(t);
  if (sameDay(t, new Date(Date.now() - 864e5))) return 'zuletzt gestern um ' + fmtTime(t);
  return 'zuletzt ' + t.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function avatarHtml(av, cls) {
  // 📱 V4.28: Profilbilder liegen jetzt als Datei (/media/…) statt Base64
  if (av && (av.startsWith('data:image/') || av.startsWith('/media/') || av.startsWith('/assets/') || /^https?:/.test(av))) {
    return `<img src="${av}" alt="">`;
  }
  return `<span class="${cls || ''}">${esc(av || '💗')}</span>`;
}
function typeIco(t) { return t === 'group' ? '👥' : t === 'community' ? '🏰' : t === 'channel' ? '📢' : ''; }
function isMeAdmin(chatId) {
  const d = S.details[chatId];
  if (!d) return false;
  return d.chat.ownerId === S.user.id || (d.chat.adminIds || []).includes(S.user.id);
}

/* ✨ V4.31 — Splash ausblenden, sobald die Seite steht */
setTimeout(() => { const sp = $('#splash'); if (sp) sp.classList.add('weg'); }, 900);

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Fehler ' + res.status);
    err.status = res.status;
    err.code = data.code || '';
    err.data = data;
    if (data.code === 'banned' && data.ban) {
      err.ban = data.ban;
      try { showBanScreen(data.ban, { login: localStorage.getItem('lc_lastlogin') || '' }); } catch (e2) {}
    } else if (data.code === 'muted') {
      try { toast('🔇', 'Du bist stummgeschaltet', data.mute && data.mute.until ? 'bis ' + fmtDT(data.mute.until) : 'Du kannst gerade nicht schreiben', 5000); } catch (e2) {}
    } else if (data.code === 'groupbanned') {
      try { toast('👥', 'Kein Zugriff', 'Du wurdest aus diesem Chat entfernt', 4500); } catch (e2) {}
    }
    throw err;
  }
  return data;
}

/* ---------- Toast + Ton ---------- */
function toast(icon, title, sub, ms = 3500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="tIco">${icon}</div><div class="tBody"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}
let audioCtx = null;
/* 🔔 V4.18 — Benachrichtigungstöne: 4 Klänge, Lautstärke, pro Chat stumm */
/* 5 Notfall-Töne, falls /api/sounds nicht erreichbar ist (offline/APK-Start) */
let SOUND_PRESETS = {
  chime:  { id: 'chime',  name: 'Glöckchen 🔔', notes: [[880, 0], [1174.66, .09], [1567.98, .18]], type: 'sine', dur: .5 },
  pop:    { id: 'pop',    name: 'Plöpp 💧',     notes: [[520, 0], [780, .05]], type: 'sine', dur: .22 },
  sparkle:{ id: 'sparkle',name: 'Glitzer ✨',   notes: [[1318.5, 0], [1567.98, .06], [2093, .12], [2637, .18]], type: 'triangle', dur: .38 },
  soft:   { id: 'soft',   name: 'Sanft 🌸',     notes: [[392, 0], [523.25, .12]], type: 'sine', dur: .6 },
  off:    { id: 'off',    name: 'Aus 🔇',       notes: [], type: 'sine', dur: 0 },
};
async function loadSounds() {
  try {
    const d = await api('/sounds');
    const map = {};
    (d.sounds || []).forEach((s) => { map[s.id] = s; });
    if (Object.keys(map).length) SOUND_PRESETS = map;
    S.soundMine = d.mine || { default: 'chime', vol: 0.5, chats: {} };
    try { localStorage.setItem('lc_sounds', JSON.stringify({ presets: map, mine: S.soundMine })); } catch (e) {}
  } catch (e) {
    try {
      const c = JSON.parse(localStorage.getItem('lc_sounds') || 'null');
      if (c && c.presets) { SOUND_PRESETS = c.presets; S.soundMine = c.mine; }
    } catch (e2) {}
  }
}
/* Ton für einen bestimmten Chat (fällt auf den Standard zurück) */
function soundForChat(chatId) {
  const mine = S.soundMine || {};
  return (mine.chats && chatId && mine.chats[chatId]) || mine.default || S.user.sound || 'chime';
}
function beep(preset) {
  if (!S.user) return;
  const p = preset || S.user.sound || 'chime';
  if (p === 'off' || S.user.bgSound === false) return;
  const cfg = SOUND_PRESETS[p] || SOUND_PRESETS.chime;
  if (!cfg.notes.length) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const volSetting = (S.soundMine && S.soundMine.vol !== undefined) ? S.soundMine.vol
      : (S.user.soundVol === undefined ? 0.5 : S.user.soundVol);
    const vol = Math.max(0, Math.min(1, volSetting)) * 0.22;
    if (vol <= 0) return;
    const t0 = audioCtx.currentTime;
    cfg.notes.forEach(([f, off]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = cfg.type;
      o.frequency.setValueAtTime(f, t0 + off);
      g.gain.setValueAtTime(0.0001, t0 + off);
      g.gain.exponentialRampToValueAtTime(vol, t0 + off + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + cfg.dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0 + off); o.stop(t0 + off + cfg.dur + 0.02);
    });
  } catch (e) {}
}

/* ================= AUTH ================= */
let regAvatar = '💗';
function initAuth() {
  const box = $('#regAvatars');
  AVATAR_EMOJIS.forEach((e, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = e;
    if (e === regAvatar) b.classList.add('on');
    b.onclick = () => { regAvatar = e; $$('#regAvatars button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); };
    box.appendChild(b);
  });
  $('#tabLogin').onclick = () => switchAuthTab(true);
  $('#tabRegister').onclick = () => switchAuthTab(false);
  $('#authPhoneFlow').onclick = () => {
    if (window.LC428 && typeof window.LC428.openPhone === 'function') window.LC428.openPhone();
    else authError('Telefon-Anmeldung ist noch nicht geladen. Bitte Seite neu laden.');
  };
  $('#loginForm').onsubmit = doLogin;
  $('#registerForm').onsubmit = doRegister;
  // schwebende Herzen
  for (let i = 0; i < 10; i++) {
    const f = document.createElement('div');
    f.className = 'floatHeart';
    f.textContent = ['💗','🩷','','✨',''][i % 5];
    f.style.left = (4 + i * 10 + Math.random() * 4) + '%';
    f.style.animationDuration = (9 + Math.random() * 10) + 's';
    f.style.animationDelay = -(Math.random() * 12) + 's';
    f.style.fontSize = (16 + Math.random() * 20) + 'px';
    $('#authScreen').appendChild(f);
  }
}
function switchAuthTab(login) {
  $('#tabLogin').classList.toggle('on', login);
  $('#tabRegister').classList.toggle('on', !login);
  $('#loginForm').classList.toggle('hidden', !login);
  $('#registerForm').classList.toggle('hidden', login);
  $('#authError').style.display = 'none';
}
function authError(msg) { const e = $('#authError'); e.textContent = msg; e.style.display = 'block'; }
async function doLogin(ev) {
  ev.preventDefault();
  $('#authError').style.display = 'none';
  try {
    localStorage.setItem('lc_lastlogin', $('#loginLogin').value.trim());
    const d = await api('/login', { method: 'POST', body: { login: $('#loginLogin').value, password: $('#loginPass').value } });
    S.token = d.token; localStorage.setItem('lc_token', d.token);
    enterApp(d.user);
  } catch (e) { authError(e.message); }
}
async function doRegister(ev) {
  ev.preventDefault();
  $('#authError').style.display = 'none';
  try {
    const d = await api('/register', {
      method: 'POST',
      body: {
        username: $('#regUser').value, displayName: $('#regName').value, password: $('#regPass').value,
        phone: $('#regPhone').value, email: $('#regEmail').value, avatar: regAvatar,
      },
    });
    localStorage.setItem('lc_lastlogin', $('#regUser').value.trim());
    S.token = d.token; localStorage.setItem('lc_token', d.token);
    enterApp(d.user);
    if (d.welcome) toast('💗', 'Willkommen bei LoveChat!', 'Dein Welcome-Kanal wurde erstellt 💜');
  } catch (e) {
    authError(e.code === 'phone_exists'
      ? 'Diese Nummer hat schon ein Konto. Tippe oben auf „Mit Telefonnummer anmelden / registrieren“ und bestätige den WhatsApp-Code.'
      : e.message);
  }
}

/* ================= APP ================= */
async function boot() {
  initAuth();
  if (S.token) {
    try {
      const d = await api('/me');
      S.user = d.user; S.chats = d.chats;
      S.online = new Set();
      enterApp(S.user, true);
      return;
    } catch { localStorage.removeItem('lc_token'); S.token = ''; }
  }
  showAuth();
}
function showAuth() { $('#authScreen').classList.remove('hidden'); $('#appScreen').classList.add('hidden'); $('#fab').classList.add('hidden'); }
async function enterApp(user, silent) {
  S.user = user;
  $('#authScreen').classList.add('hidden');
  $('#appScreen').classList.remove('hidden');
  $('#fab').classList.remove('hidden');
  try {
    const d = await api('/me');
    S.user = d.user;
    S.chats = d.chats;
  } catch {}
  renderMyAvatar();
  renderStaffBtn();
  renderChatList();
  loadStatus();          // 🌸 Status-Ringe
  loadBackgrounds();     // 🎨 V4.19: 3 Ebenen
  loadSounds();          // 🔔 30 Töne
  loadStickers();        // 🎁 6 Packs
  connectWS();
  refreshMuteState();
  if (!silent) toast('💗', 'Hi ' + user.displayName + '!', 'Schön, dass du da bist 🎀');
}
function renderMyAvatar() {
  const el = $('#btnMyProfile');
  el.innerHTML = S.user.avatar && S.user.avatar.startsWith('data:image/') ? `<img src="${S.user.avatar}">` : esc(S.user.avatar || '💗');
}

/* ---------- Chat-Liste ---------- */
function chatListData() {
  let list = S.chats.slice();
  const archivedTab = S.tab === 'archived';
  // 📥 Archivierte sind aus "Alle" und den Typ-Tabs raus — nur im Archiv-Tab
  list = list.filter((c) => (archivedTab ? !!c.archived : !c.archived));
  if (!archivedTab && S.tab !== 'all') list = list.filter((c) => c.type === S.tab);
  if (S.searchQ) list = list.filter((c) => c.name.toLowerCase().includes(S.searchQ));
  list.sort((a, b) => ((b.last && b.last.createdAt) || 0) - ((a.last && a.last.createdAt) || 0));
  return list;
}
function renderChatList() {
  const box = $('#chatList');
  const list = chatListData();
  if (!list.length) {
    const leer = S.tab === 'archived'
      ? 'Archiv ist leer 📥<br>Chat-Einstellungen → Archivieren'
      : 'Noch keine Chats hier.<br>Tippe auf <b>+</b> und starte einen!';
    box.innerHTML = `<div class="listEmpty"><span class="big">${S.tab === 'archived' ? '📥' : '🔍'}</span>${S.searchQ ? 'Nichts gefunden 💔' : leer}</div>`;
    return;
  }
  box.innerHTML = list.map((c) => {
    const isPrivate = c.type === 'private';
    const otherOnline = isPrivate && c.members.some((id) => id !== S.user.id && S.online.has(id));
    const prev = c.last ? (c.last.image ? '📷 Foto' : (c.last.senderId === S.user.id ? 'Du: ' : (c.type !== 'private' && c.last.senderName ? c.last.senderName.split(' ')[0] + ': ' : '')) + String(c.last.text || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n/g, ' ')) : 'Keine Nachrichten 💌';
    return `
    <div class="chatItem ${c.id === S.activeChat ? 'on' : ''}" data-id="${c.id}">
      <div class="cav">${avatarHtml(c.avatar)}${otherOnline ? '<span class="dot"></span>' : ''}</div>
      <div class="cbody">
        <div class="crow1"><b>${c.archived ? '<span class="archIco">📥</span>' : ''}${typeIco(c.type) ? `<span class="typeIco">${typeIco(c.type)}</span>` : ''}${esc(c.name)}</b><span class="ctime">${c.last ? fmtListTime(c.last.createdAt) : ''}</span></div>
        <div class="crow2"><span class="prev">${esc(prev)}</span>${c.unread ? `<span class="badge">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</div>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('.chatItem').forEach((el) => (el.onclick = () => openChat(el.dataset.id)));
  renderDraftMarks();
}
function upsertSummary(sum) {
  const i = S.chats.findIndex((c) => c.id === sum.id);
  if (i >= 0) S.chats[i] = { ...S.chats[i], ...sum };
  else S.chats.push(sum);
}

/* ---------- Chat öffnen ---------- */
async function openChat(id) {
  const prevChat = S.activeChat;
  if (prevChat && prevChat !== id) saveDraftNow();   // 📝 Entwurf sichern
  S.activeChat = id;
  $('#appScreen').classList.add('show-chat');
  $('#emptyState').classList.add('hidden');
  $('#chatView').classList.remove('hidden');
  renderChatList();
  renderMyAvatar();
  try {
    const d = await api('/chats/' + id);
    S.details[id] = d;
  } catch (e) { toast('💔', 'Chat nicht erreichbar', e.message); closeChat(); return; }
  renderHeader();
  renderPinBar();
  await loadMessages(id);
  await loadPolls(id);
  renderMessages(id, true);
  markRead();
  applyTheme();
  if (!$('#infoPanel').classList.contains('hidden')) renderInfoPanel();
  renderPinBar();
  const input = $('#msgInput');
  loadDraft(id);                                     // 📝 Entwurf zurückholen
  if (!isChannelLocked()) setTimeout(() => input.focus(), 60);
}
function closeChat() {
  const ip = $('#infoPanel'); if (ip) ip.classList.add('hidden');
  S.activeChat = null;
  $('#appScreen').classList.remove('show-chat');
  $('#chatView').classList.add('hidden');
  $('#emptyState').classList.remove('hidden');
  renderChatList();
}
function activeDetails() { return S.activeChat ? S.details[S.activeChat] : null; }


/* =====================================================================
 *  🌸 V4.17 — STATUS / STORIES (24 h)
 *  Der Server konnte das schon lange (/api/moments, v4.js) — nur die
 *  Oberfläche fehlte. Hier ist sie.
 * ===================================================================== */
const ST_BGS = [
  { id: 'pink-dream', css: 'linear-gradient(135deg,#ff7ab8,#ff4d94)' },
  { id: 'lila-nacht', css: 'linear-gradient(135deg,#a855f7,#6d28d9)' },
  { id: 'neon', css: 'linear-gradient(135deg,#ff2d78,#7c3aed)' },
  { id: 'sonne', css: 'linear-gradient(135deg,#ffb347,#ff6b9d)' },
  { id: 'meer', css: 'linear-gradient(135deg,#38bdf8,#818cf8)' },
  { id: 'wald', css: 'linear-gradient(135deg,#4ade80,#14b8a6)' },
  { id: 'kaffee', css: 'linear-gradient(135deg,#a16207,#78350f)' },
  { id: 'mitternacht', css: 'linear-gradient(135deg,#1e293b,#0f172a)' },
];
function stBgCss(id) { const b = ST_BGS.find((x) => x.id === id); return b ? b.css : ST_BGS[0].css; }

const ST = { groups: [], viewing: null, idx: 0, timer: null, mineOpen: false };

/* ---------- Streifen in der Sidebar ---------- */
async function loadStatus() {
  try {
    const d = await api('/moments');
    ST.groups = d.groups || [];
    renderStatusStrip();
  } catch (e) { /* still: Status ist optional */ }
}

function renderStatusStrip() {
  const box = $('#statusStrip');
  if (!box) return;
  const mine = ST.groups.find((g) => g.mine);
  const others = ST.groups.filter((g) => !g.mine);

  const mineCard = `
    <div class="stCard" data-st="mine" title="Mein Status">
      <div class="stRing mine ${mine && mine.moments.length ? '' : 'add'} ${mine && mine.allSeen ? 'seen' : ''}">
        <div class="stRingIn">${avatarHtml(S.user.avatar)}</div>
      </div>
      <span class="stName">Mein Status</span>
    </div>`;

  const cards = others.map((g) => `
    <div class="stCard" data-st="${g.userId}" title="${esc(g.user.displayName)}">
      <div class="stRing ${g.allSeen ? 'seen' : ''}">
        <div class="stRingIn">${avatarHtml(g.user.avatar)}</div>
      </div>
      <span class="stName">${esc(g.user.displayName.split(' ')[0])}</span>
    </div>`).join('');

  box.innerHTML = mineCard + cards;
  box.classList.toggle('hidden', false);

  box.querySelectorAll('.stCard').forEach((el) => {
    el.onclick = () => {
      if (el.dataset.st === 'mine') {
        const g = ST.groups.find((x) => x.mine);
        if (g && g.moments.length) openStatusView('mine', 0);
        else openStatusComposer();
      } else {
        openStatusView(el.dataset.st, 0);
      }
    };
  });
}

/* ---------- Viewer ---------- */
function openStatusView(uid, startIdx) {
  const mine = uid === 'mine';
  const g = mine ? ST.groups.find((x) => x.mine) : ST.groups.find((x) => x.userId === uid);
  if (!g || !g.moments || !g.moments.length) return;
  ST.viewing = g; ST.idx = startIdx || 0;
  $('#statusView').classList.remove('hidden');
  renderStatusView();
  startStatusTimer();
}

function closeStatusView() {
  clearTimeout(ST.timer);
  $('#statusView').classList.add('hidden');
  ST.viewing = null;
  loadStatus();
}

function renderStatusView() {
  const g = ST.viewing;
  if (!g) return;
  const m = g.moments[ST.idx];
  if (!m) return closeStatusView();

  // Fortschrittsbalken
  $('#svBars').innerHTML = g.moments
    .map((x, i) => `<div class="svBar ${i < ST.idx ? 'done' : ''} ${i === ST.idx ? 'on' : ''}">
        <i></i></div>`).join('');

  $('#svAv').innerHTML = avatarHtml(g.user.avatar);
  $('#svName').textContent = g.user.displayName;
  $('#svTime').textContent = relTime(m.createdAt);

  const body = $('#svBody');
  if (m.kind === 'image' && m.data) {
    body.innerHTML = `<img src="${m.data}" alt="">${m.text ? `<div style="position:absolute;bottom:80px;left:16px;right:16px;font-size:15px;text-shadow:0 2px 8px #000">${esc(m.text)}</div>` : ''}`;
  } else {
    body.innerHTML = `<div class="stText" style="background:${stBgCss(m.bg)}">${esc(m.text || '')}</div>`;
  }

  // Zuschauer (nur bei eigenem Status)
  const vw = $('#svViewers');
  if (g.mine) {
    vw.innerHTML = `<span class="eyes">👁️</span> ${m.viewers || 0} angesehen`;
  } else {
    vw.innerHTML = '';
  }

  // Bei eigenem Status: Weg zum NEUEN Status (sonst kommt man nie wieder zum Posten)
  const foot = $('.svFoot');
  let addBtn = $('#svAdd');
  if (g.mine) {
    if (!addBtn) {
      addBtn = document.createElement('button');
      addBtn.id = 'svAdd';
      addBtn.className = 'svAddBtn';
      addBtn.title = 'Neuen Status posten';
      addBtn.textContent = '＋ Neu';
      foot.appendChild(addBtn);
    }
    addBtn.onclick = (ev) => { ev.stopPropagation(); closeStatusView(); openStatusComposer(); };
  } else if (addBtn) { addBtn.remove(); }

  // Reaktionen
  const REACTS = ['💗', '😂', '😮', '😢', '🔥', '👏'];
  const myR = m.reactions && m.reactions[S.user.id];
  $('#svReact').innerHTML = g.mine
    ? `<span style="font-size:12px;opacity:.75">${Object.values(m.reactions || {}).length ? Object.values(m.reactions).join(' ') : ''}</span>`
    : REACTS.map((e) => `<button data-e="${e}" class="${myR === e ? 'mine' : ''}">${e}</button>`).join('');

  if (!g.mine) {
    $('#svReact').querySelectorAll('button').forEach((b) => {
      b.onclick = async (ev) => {
        ev.stopPropagation();
        try {
          await api(`/moments/${m.id}/react`, { method: 'POST', body: { emoji: b.dataset.e } });
          m.reactions = { ...(m.reactions || {}), [S.user.id]: b.dataset.e };
          renderStatusView();
          toast(b.dataset.e, 'Reagiert', '');
        } catch (e) { toast('💔', 'Fehler', e.message); }
      };
    });
  }

  // als gesehen markieren (beim eigenen nicht nötig)
  if (!g.mine && !m.seen) {
    api(`/moments/${m.id}/view`, { method: 'POST', body: {} })
      .then(() => { m.seen = true; })
      .catch(() => {});
  }
}

function startStatusTimer() {
  clearTimeout(ST.timer);
  const m = ST.viewing && ST.viewing.moments[ST.idx];
  const dur = m && m.kind === 'image' ? 6000 : 5000;
  const bar = document.querySelector('#svBars .svBar.on');
  if (bar) bar.style.setProperty('--dur', dur + 'ms');
  ST.timer = setTimeout(() => statusNext(), dur);
}

function statusNext() {
  const g = ST.viewing;
  if (!g) return;
  if (ST.idx < g.moments.length - 1) { ST.idx++; renderStatusView(); startStatusTimer(); return; }
  // nächste Person
  const order = ST.groups.filter((x) => x.moments && x.moments.length);
  const pos = order.findIndex((x) => (g.mine ? x.mine : x.userId === g.userId));
  const next = order[pos + 1];
  if (next) {
    ST.viewing = next; ST.idx = 0;
    renderStatusView(); startStatusTimer();
  } else {
    closeStatusView();
  }
}
function statusPrev() {
  const g = ST.viewing;
  if (!g) return;
  if (ST.idx > 0) { ST.idx--; renderStatusView(); startStatusTimer(); return; }
  const order = ST.groups.filter((x) => x.moments && x.moments.length);
  const pos = order.findIndex((x) => (g.mine ? x.mine : x.userId === g.userId));
  const prev = order[pos - 1];
  if (prev) { ST.viewing = prev; ST.idx = prev.moments.length - 1; renderStatusView(); startStatusTimer(); }
}

/* ---------- Posten ---------- */
function openStatusComposer() {
  let bg = 'pink-dream';
  let privacy = 'public';
  let imgData = '';

  openModal(`<div class="mTitle">Status posten 🌸</div>
    <div class="field"><textarea id="stText" rows="3" maxlength="500" placeholder="Was machst du gerade? 💗"
      style="resize:none;width:100%;border:2px solid var(--pink-pale);border-radius:14px;padding:11px;font:inherit"></textarea></div>
    <div class="stPrev" id="stPrev" style="background:${stBgCss(bg)}">Deine Vorschau 💗</div>
    <div class="stBgs" id="stBgs">
      ${ST_BGS.map((b) => `<button data-bg="${b.id}" class="${b.id === bg ? 'on' : ''}" style="background:${b.css}" title="${b.id}"></button>`).join('')}
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="ipBtn" id="stPickImg" style="margin:0">📷 Bild</button>
      <button class="ipBtn" id="stClearImg" style="margin:0;display:none">✕ Bild weg</button>
    </div>
    <div class="stPrivacy" id="stPrivacy">
      <button data-p="public" class="on">🌍 Alle</button>
      <button data-p="contacts">💌 Kontakte</button>
      <button data-p="private">🔒 Nur ich</button>
    </div>
    <button class="ipBtn" id="stPost" style="margin-top:14px">Status posten 🌸</button>
  `);

  const ta = $('#stText'), prev = $('#stPrev');
  ta.oninput = () => {
    prev.textContent = ta.value.trim() || 'Deine Vorschau 💗';
    prev.style.background = imgData ? `linear-gradient(rgba(20,8,32,.35),rgba(20,8,32,.35)),url("${imgData}") center/cover` : stBgCss(bg);
    prev.style.color = '#fff';
  };
  $('#stBgs').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      bg = b.dataset.bg;
      $('#stBgs').querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      if (!imgData) prev.style.background = stBgCss(bg);
      ta.oninput();
    };
  });
  $('#stPrivacy').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      privacy = b.dataset.p;
      $('#stPrivacy').querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
  });
  $('#stPickImg').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        imgData = await shrinkImage(f, 900, 0.72, 2400000);
        $('#stClearImg').style.display = 'block';
        ta.oninput();
      } catch (e) { toast('💔', 'Bild nicht lesbar', e.message); }
    };
    inp.click();
  };
  $('#stClearImg').onclick = () => {
    imgData = '';
    $('#stClearImg').style.display = 'none';
    prev.style.background = stBgCss(bg);
    ta.oninput();
  };

  $('#stPost').onclick = async () => {
    const text = ta.value.trim();
    if (!text && !imgData) return toast('💔', 'Status ist leer', 'Schreib was oder wähle ein Bild');
    try {
      await api('/moments', {
        method: 'POST',
        body: imgData
          ? { kind: 'image', data: imgData, text, bg, privacy }
          : { kind: 'text', text, bg, privacy },
      });
      closeModal();
      toast('🌸', 'Status gepostet', '24 Stunden sichtbar');
      await loadStatus();
    } catch (e) { toast('💔', 'Posten fehlgeschlagen', e.message); }
  };
}

/* ---------- Tastatur ---------- */
document.addEventListener('keydown', (e) => {
  if ($('#statusView').classList.contains('hidden')) return;
  if (e.key === 'Escape') closeStatusView();
  if (e.key === 'ArrowRight') statusNext();
  if (e.key === 'ArrowLeft') statusPrev();
});

/* ▸ Info-Panel rechts — Kontakt/Medien/Links wie WhatsApp Web */
function renderInfoPanel() {
  const panel = $('#infoPanel');
  const box = $('#infoBody');
  const d = activeDetails();
  if (!panel || !box) return;
  if (!d || !S.activeChat) { panel.classList.add('hidden'); return; }
  const chat = d.chat || {};
  const isPrivate = chat.type === 'private';
  const other = isPrivate ? (d.members || []).find((m) => m.id !== S.user.id) : null;
  const msgs = S.messages[S.activeChat] || [];

  const photos = msgs.filter((m) => m.image).slice(-9).reverse();
  const links = [];
  msgs.forEach((m) => {
    if (!m.text) return;
    (m.text.match(/https?:\/\/[^\s<>"']+/g) || []).forEach((u) => { if (!links.includes(u)) links.push(u); });
  });

  const lastSeen = other ? fmtLastSeen(other) : '';
  const hero = `
    <div class="ipHero">
      <div class="ipAv">${other ? avatarHtml(other.avatar) : avatarHtml(chat.avatar)}</div>
      <div class="ipName">${esc(isPrivate && other ? other.displayName : chat.name || 'Chat')}</div>
      <div class="ipSub">${isPrivate ? esc(lastSeen || (other && other.online ? 'online' : 'zuletzt unbekannt')) : `${(d.members || []).length} Mitglieder`}</div>
    </div>`;

  const about = isPrivate && other
    ? `<div class="ipSec"><div class="ipSecTitle">Info</div>
         <div class="ipRow">💗 <span>${esc(other.bio || 'Keine Beschreibung')}</span></div>
         ${other.phone ? `<div class="ipRow">📞 <b>${esc(other.phone)}</b></div>` : ''}
         <div class="ipRow">🕐 <span>${esc(lastSeen || 'unbekannt')}</span></div>
       </div>`
    : chat.description
      ? `<div class="ipSec"><div class="ipSecTitle">Beschreibung</div><div class="ipRow">${esc(chat.description)}</div></div>`
      : '';

  const media = `
    <div class="ipSec">
      <div class="ipSecTitle"><span>Medien</span><span>${photos.length ? photos.length : ''}</span></div>
      ${photos.length
        ? `<div class="ipMedia">${photos.map((m) => `<img src="${m.image}" data-mid="${m.id}" alt="" loading="lazy">`).join('')}</div>`
        : `<div class="ipEmpty">Noch keine Bilder</div>`}
    </div>`;

  const linkSec = `
    <div class="ipSec">
      <div class="ipSecTitle"><span>Links</span><span>${links.length || ''}</span></div>
      ${links.length
        ? links.slice(0, 8).map((u) => `<div class="ipRow">🔗 <a href="${esc(u)}" target="_blank" rel="noopener" style="color:var(--pink);text-decoration:none;font-size:12.5px;word-break:break-all">${esc(u.replace(/^https?:\/\//, '').slice(0, 44))}</a></div>`).join('')
        : `<div class="ipEmpty">Noch keine Links</div>`}
    </div>`;

  const members = !isPrivate && d.members && d.members.length
    ? `<div class="ipSec"><div class="ipSecTitle"><span>Mitglieder</span><span>${d.members.length}</span></div>
        ${d.members.slice(0, 12).map((m) => `<div class="ipRow">${avatarHtml(m.avatar)} <span>${esc(m.displayName)}</span></div>`).join('')}
      </div>`
    : '';

  box.innerHTML = hero + about + media + linkSec + members;
  panel.classList.remove('hidden');

  box.querySelectorAll('.ipMedia img').forEach((im) => {
    im.onclick = () => {
      const row = document.querySelector(`.msgRow[data-mid="${im.dataset.mid}"]`);
      if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
  });
}

/* =====================================================================
 *  📦 V4.18 — Export, Einladung, Archiv, Entwurf
 *  Alles davon konnte der Server schon; hier ist die Oberfläche.
 * ===================================================================== */

/* ⬇️ Chat als JSON herunterladen */
async function exportChat(chatId) {
  try {
    const all = await api('/export');
    const chat = (all.chats || []).find((c) => c.id === chatId);
    if (!chat) return toast('💔', 'Chat nicht im Export', 'Erst neu laden');
    const payload = {
      exportiert: new Date().toISOString(),
      chat: { name: chat.name, typ: chat.type, seit: new Date(chat.createdAt).toLocaleString('de-DE') },
      nachrichten: chat.messages.map((m) => ({
        von: m.senderId === S.user.id ? 'ich' : memberById(m.senderId).displayName,
        zeit: new Date(m.createdAt).toLocaleString('de-DE'),
        text: m.text || '',
        bild: !!m.image,
        geloescht: !!m.deleted,
        angepinnt: !!m.pinned,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lovechat-' + (chat.name || 'chat').replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('⬇️', 'Exportiert', payload.nachrichten.length + ' Nachrichten');
  } catch (e) { toast('💔', 'Export fehlgeschlagen', e.message); }
}

/* 🔗 Einladungslink erzeugen */
async function createInvite(chatId) {
  /* 🔴 V4.21: Vorher rief das hier `POST /invite` mit { chatId } auf —
     der Server ignoriert chatId aber komplett und macht eine
     PLATTFORM-Einladung zur Registrierung. Der Knopf "Einladungslink"
     im Chat hat also einen Registrierungslink erzeugt, keinen Chat-Link.
     Jetzt: POST /api/chats/:id/invite — echter Beitritt, widerrufbar. */
  try {
    const r = await api(`/chats/${chatId}/invite`, { method: 'POST' });
    const link = location.origin + '/join/' + r.code;
    openModal(`<div class="mTitle">Einladungslink 🔗</div>
      <p style="font-size:13px;color:var(--muted);font-weight:600;margin-bottom:10px">
        Wer den Link öffnet, sieht <b>${esc(r.chat.name)}</b> (${r.chat.memberCount} Mitglieder) und kann beitreten.
        Ein neuer Link macht den alten ungültig.</p>
      <div class="field"><input id="invLink" readonly value="${esc(link)}"></div>
      <button class="ipBtn" id="invCopy">📋 Kopieren</button>
      <button class="ipBtn" id="invShare" style="margin-top:6px">🔗 Teilen</button>
      <button class="btnDanger" id="invRevoke" style="margin-top:14px">Link widerrufen</button>`);
    $('#invCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(link); toast('📋', 'Kopiert', 'Link ist in der Zwischenablage'); }
      catch (e) { $('#invLink').select(); document.execCommand('copy'); toast('📋', 'Kopiert', ''); }
    };
    $('#invShare').onclick = async () => {
      if (navigator.share) {
        try { await navigator.share({ title: 'LoveChat', text: r.text, url: link }); } catch (e) {}
      } else { $('#invCopy').click(); }
    };
    $('#invRevoke').onclick = async () => {
      try {
        const d = await api(`/chats/${chatId}/invite`, { method: 'DELETE' });
        toast('🗑️', 'Link widerrufen', d.revoked + ' Link(s) ungültig');
        closeModal();
      } catch (e) { toast('💔', 'Fehler', e.message); }
    };
  } catch (e) { toast('💔', 'Kein Link', e.message); }
}

/* 📝 Entwurf — pro Chat, überlebt Neustart */
const DRAFTS = {
  key: 'lc_drafts',
  all() { try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch (e) { return {}; } },
  get(chatId) { return this.all()[chatId] || ''; },
  set(chatId, text) {
    const d = this.all();
    if (text && text.trim()) d[chatId] = text;
    else delete d[chatId];
    try { localStorage.setItem(this.key, JSON.stringify(d)); } catch (e) {}
    renderDraftMarks();
  },
  has(chatId) { return !!(this.all()[chatId] || '').trim(); },
};
function renderDraftMarks() {
  const d = DRAFTS.all();
  $$('#chatList .chatItem').forEach((el) => {
    const id = el.dataset.id;
    const prev = el.querySelector('.prev');
    if (!prev) return;
    if (d[id] && d[id].trim()) {
      prev.innerHTML = `<span class="draftTag">Entwurf:</span> ${esc(d[id].slice(0, 40))}`;
    }
  });
}
function saveDraftNow() {
  const id = S.activeChat;
  const input = $('#msgInput');
  if (!id || !input) return;
  DRAFTS.set(id, input.value);
}
function loadDraft(id) {
  const input = $('#msgInput');
  if (!input) return;
  const t = DRAFTS.get(id);
  input.value = t || '';
  input.style.height = 'auto';
  if (t) input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}



/* =====================================================================
 *  🎨 V4.19 — EINSTELLUNGEN „AUSSEHEN": 3 Hintergrund-Ebenen + 30 Töne
 * ===================================================================== */
function modalAppearance(tab) {
  const L = S.bgLayers || {};
  const cur = tab || 'app';
  const sounds = Object.values(SOUND_PRESETS);
  const layers = [
    { id: 'app', name: '🎨 App-Hintergrund', hint: 'Hinter der ganzen App — auch hinter der Chat-Liste' },
    { id: 'list', name: '📋 Listen-Hintergrund', hint: 'Nur links hinter der Chat-Liste' },
  ];
  const mk = (id) => {
    const l = L[id] || { type: 'none', value: '', blur: 0, brightness: 100, overlay: 0, animation: 'none', pos: 'center' };
    return `<div class="bgLayerCard" data-layer="${id}">
      <h4>${id === 'app' ? '🎨 App-Hintergrund' : '📋 Listen-Hintergrund'}</h4>
      <small>${id === 'app' ? 'Hinter der ganzen App — auch hinter der Chat-Liste' : 'Nur links hinter der Chat-Liste'}</small>
      <div class="bgPresetGrid">
        ${(S.bgPresets || []).map((p) => `<div class="bgPreset ${l.type === 'preset' && l.value === p.id ? 'on' : ''}" data-preset="${p.id}" style="background:${p.css}"><span>${esc(p.name.split(' ')[0])}</span></div>`).join('')}
      </div>
      <div class="bgBtns">
        <button data-act="gallery">📷 Aus Galerie</button>
        <button data-act="anim">✨ Animation</button>
        <button data-act="clear">🗑️ Aus</button>
      </div>
      <div class="bgSliders">
        <div class="bgSlider"><label>Unschärfe</label><input type="range" data-sl="blur" min="0" max="40" value="${l.blur || 0}"><b>${l.blur || 0}</b></div>
        <div class="bgSlider"><label>Helligkeit</label><input type="range" data-sl="brightness" min="20" max="120" value="${l.brightness || 100}"><b>${l.brightness || 100}%</b></div>
        <div class="bgSlider"><label>Abdunkeln</label><input type="range" data-sl="overlay" min="0" max="90" value="${l.overlay || 0}"><b>${l.overlay || 0}%</b></div>
      </div>
    </div>`;
  };

  openModal2(`<div class="mTitle">Aussehen 🎨</div>
    <p style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:10px">
      Drei Ebenen, unabhängig: App · Liste · Chat (pro Chat unter ⋮).</p>
    ${mk('app')}${mk('list')}

    <div class="bgLayerCard">
      <h4>🔔 Benachrichtigungston</h4>
      <small>${sounds.length} Töne · gilt für alle Chats, außer du setzt pro Chat einen eigenen</small>
      <div class="csRow" style="margin-bottom:8px">
        <label>Standard</label>
        <select id="sndDefault">
          ${sounds.map((s) => `<option value="${s.id}" ${((S.soundMine && S.soundMine.default) || 'chime') === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="bgSlider"><label>Lautstärke</label>
        <input type="range" id="sndVol" min="0" max="100" value="${Math.round(((S.soundMine && S.soundMine.vol) || 0.5) * 100)}"><b>${Math.round(((S.soundMine && S.soundMine.vol) || 0.5) * 100)}%</b>
      </div>
      <div class="bgBtns"><button id="sndTest">🔊 Anhören</button>
        <button id="sndChat">💬 Ton pro Chat</button></div>
    </div>`, 'rmWide');

  // --- Presets ---
  $$('#modalRoot .bgPreset').forEach((el) => {
    el.onclick = async () => {
      const card = el.closest('.bgLayerCard');
      const layer = card.dataset.layer;
      try {
        const cur2 = (S.bgLayers[layer] || {});
        await saveBgLayer(layer, { type: 'preset', value: el.dataset.preset, blur: cur2.blur || 0, brightness: cur2.brightness || 100, overlay: cur2.overlay || 0, animation: cur2.animation || 'none' });
        card.querySelectorAll('.bgPreset').forEach((x) => x.classList.remove('on'));
        el.classList.add('on');
        toast('🎨', 'Hintergrund gesetzt', '');
      } catch (e) { toast('💔', 'Fehler', e.message); }
    };
  });
  // --- Buttons ---
  $$('#modalRoot [data-act]').forEach((b) => {
    b.onclick = () => {
      const card = b.closest('.bgLayerCard');
      const layer = card.dataset.layer;
      const act = b.dataset.act;
      if (act === 'gallery') {
        pickGalleryPhoto(async (dataUrl, name) => {
          const cur2 = (S.bgLayers[layer] || {});
          try {
            await saveBgLayer(layer, { type: 'custom', value: dataUrl, blur: cur2.blur || 0, brightness: cur2.brightness || 100, overlay: cur2.overlay || 20, animation: cur2.animation || 'none' });
            toast('📷', 'Foto als Hintergrund', name || 'gesetzt 💗');
            modalAppearance();
          } catch (e) { toast('💔', 'Fehler', e.message); }
        });
      } else if (act === 'anim') {
        const opts = S.bgAnimations || ['none', 'hearts', 'stars'];
        const cur2 = (S.bgLayers[layer] || {});
        const i = opts.indexOf(cur2.animation || 'none');
        const next = opts[(i + 1) % opts.length];
        saveBgLayer(layer, { type: cur2.type === 'none' ? 'preset' : (cur2.type || 'preset'), value: cur2.value || (S.bgPresets && S.bgPresets[0] ? S.bgPresets[0].id : 'pink-clouds'), blur: cur2.blur || 0, brightness: cur2.brightness || 100, overlay: cur2.overlay || 0, animation: next })
          .then(() => { toast('✨', 'Animation', next === 'none' ? 'aus' : next); })
          .catch((e) => toast('💔', 'Fehler', e.message));
      } else if (act === 'clear') {
        saveBgLayer(layer, null).then(() => { toast('🗑️', 'Hintergrund entfernt', ''); modalAppearance(); }).catch((e) => toast('💔', 'Fehler', e.message));
      }
    };
  });
  // --- Slider: live anwenden, entprellt speichern ---
  $$('#modalRoot .bgSlider input[type=range][data-sl]').forEach((inp) => {
    const card = inp.closest('.bgLayerCard');
    const layer = card.dataset.layer;
    const key = inp.dataset.sl;
    let t = null;
    inp.oninput = () => {
      const v = +inp.value;
      inp.nextElementSibling.textContent = key === 'brightness' || key === 'overlay' ? v + '%' : v;
      S.bgLayers[layer] = Object.assign({}, S.bgLayers[layer] || { type: 'preset', value: 'pink-clouds' }, { [key]: v });
      applyBackgrounds();
      clearTimeout(t);
      t = setTimeout(() => {
        const l = S.bgLayers[layer] || {};
        if (!l.type || l.type === 'none') return;
        saveBgLayer(layer, { type: l.type, value: l.value, blur: l.blur || 0, brightness: l.brightness || 100, overlay: l.overlay || 0, animation: l.animation || 'none' }).catch(() => {});
      }, 450);
    };
  });
  // --- Töne ---
  const sel = $('#sndDefault');
  if (sel) sel.onchange = async () => {
    try { const r = await api('/sounds', { method: 'POST', body: { default: sel.value } }); S.soundMine = r.mine; beep(sel.value); }
    catch (e) { toast('💔', 'Fehler', e.message); }
  };
  const vol = $('#sndVol');
  if (vol) {
    let vt;
    vol.oninput = () => {
      vol.nextElementSibling.textContent = vol.value + '%';
      S.soundMine = Object.assign({}, S.soundMine || {}, { vol: (+vol.value) / 100 });
      clearTimeout(vt);
      vt = setTimeout(() => api('/sounds', { method: 'POST', body: { vol: (+vol.value) / 100 } }).catch(() => {}), 350);
    };
    vol.onchange = () => beep();
  }
  const tst = $('#sndTest');
  if (tst) tst.onclick = () => beep(sel ? sel.value : undefined);
  const sc = $('#sndChat');
  if (sc) sc.onclick = () => modalChatSound();
}

/* 💬 Ton für einen einzelnen Chat */
function modalChatSound() {
  const chats = S.chats.slice(0, 30);
  const sounds = Object.values(SOUND_PRESETS);
  openModal(`<div class="mTitle">Ton pro Chat 💬</div>
    <p style="font-size:11.5px;color:var(--muted);font-weight:700;margin-bottom:9px">Anna = Herzschlag, Gruppe = Meme …</p>
    <div style="max-height:340px;overflow:auto">
    ${chats.map((c) => `<div class="csRow" style="margin-bottom:5px">
      <label style="max-width:44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</label>
      <select data-chat="${c.id}">
        <option value="default">Standard</option>
        ${sounds.map((s) => `<option value="${s.id}" ${((S.soundMine && S.soundMine.chats && S.soundMine.chats[c.id]) || 'default') === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>`).join('') || '<p>Keine Chats</p>'}
    </div>`);
  $$('#modalRoot select[data-chat]').forEach((sel) => {
    sel.onchange = async () => {
      try {
        const r = await api('/sounds', { method: 'POST', body: { chatId: sel.dataset.chat, sound: sel.value } });
        S.soundMine = r.mine;
        if (sel.value !== 'default') beep(sel.value);
        else beep();
        toast('🔔', 'Ton gespeichert', '');
      } catch (e) { toast('💔', 'Fehler', e.message); }
    };
  });
}

/* =====================================================================
 *  👑 V4.19 — VIP
 * ===================================================================== */
async function openVip() {
  let st = { vip: false, perks: [], codesConfigured: true };
  try { st = await api('/vip/status'); } catch (e) {}
  const lim = await api('/limits').catch(() => null);
  const per = st.perks || [];
  const label = { uploadBytes: 'Bild-Upload', devices: 'Geräte', themes: 'Themes', stickerPacks: 'Sticker-Packs' };
  const fmt = (k, v) => k === 'uploadBytes' ? (v >= 1024 * 1024 ? (v / 1024 / 1024).toFixed(2) + ' MB' : Math.round(v / 1024) + ' KB') : String(v);
  openModal(`<div class="mTitle">VIP 👑</div>
    ${st.vip ? `<div class="vipCard vipOn">
        <h3>👑 Du bist VIP</h3>
        <p>Gültig bis ${st.until ? new Date(st.until).toLocaleDateString('de-DE') : 'unbegrenzt'}</p>
      </div>` : `<div class="vipCard">
        <h3>Werde VIP 👑</h3>
        <p>Einmal-Code einlösen — fertig. Kein Abo, keine Zahlung im Client.</p>
      </div>`}
    <div class="secTitle">Was VIP bringt</div>
    ${per.map((p) => `<div class="vipPerk"><span>${label[p.key] || p.key}</span><span>${fmt(p.key, p.free)} → ${fmt(p.key, p.vip)} 👑</span></div>`).join('')}
    <div class="vipPerk"><span>Sticker</span><span>4 Packs → 6 Packs 👑</span></div>
    <div class="vipPerk"><span>Badge im Chat</span><span>—  → 👑 Gold</span></div>
    ${st.vip ? '<button class="btnSoft" id="vipClose2">Alles klar 💗</button>' : `
      <div class="secTitle">Code einlösen</div>
      <div class="field"><input id="vipCode" placeholder="VIP-XXXX-XXXX" maxlength="13" style="text-transform:uppercase;letter-spacing:1px;font-weight:900"></div>
      <button class="btnMain" id="vipRedeem">👑 Einlösen</button>
      ${st.codesConfigured === false ? '<p style="font-size:11px;color:#c0359b;font-weight:800;margin-top:6px">⚠️ Auf diesem Server sind noch keine Codes gesetzt (ENV <code>VIP_CODES</code>).</p>' : ''}
    `}`);
  const btn = $('#vipRedeem');
  if (btn) btn.onclick = async () => {
    const code = ($('#vipCode').value || '').trim().toUpperCase();
    if (btn.dataset.busy === '1') return;   // 🐞 Doppelklick-Schutz
    btn.dataset.busy = '1';
    btn.disabled = true; btn.textContent = 'Prüfe…';
    try {
      const r = await api('/vip/redeem', { method: 'POST', body: { code } });
      toast('👑', 'Willkommen im VIP-Club', r.message || '');
      beep('gold-chime');
      await refreshMe();
      await loadStickers();
      openVip();
    } catch (e) {
      toast('💔', 'Code abgelehnt', e.message);
      btn.disabled = false; btn.textContent = '👑 Einlösen';
      delete btn.dataset.busy;
    }
  };
  const c2 = $('#vipClose2');
  if (c2) c2.onclick = closeModal;
}

async function refreshMe() {
  try {
    const m = await api('/me');
    S.user = m.user; S.chats = m.chats;
    renderChatList(); renderMyAvatar(); renderSub();
  } catch (e) {}
}

/* 💻 Geräte / Sessions — wo bin ich eingeloggt */
async function modalDevices() {
  openModal('<div class="mTitle">Meine Geräte 💻</div><p style="font-size:12.5px;color:var(--muted);font-weight:600">Lädt…</p>');
  try {
    const d = await api('/sessions');
    const list = d.sessions || [];
    openModal(`<div class="mTitle">Meine Geräte 💻</div>
      <button class="btnSoft" id="devBack" style="margin-bottom:8px">← Zurück zum Profil</button>
      <p style="font-size:12.5px;color:var(--muted);font-weight:600;margin-bottom:10px">
        ${list.length} ${list.length === 1 ? 'Gerät' : 'Geräte'} angemeldet. Wenn dir eines fremd vorkommt: abmelden und Passwort ändern.</p>
      <div style="max-height:320px;overflow:auto">
      ${list.map((s2) => `<div class="devRow ${s2.current ? 'on' : ''}">
        <div class="devIco">${s2.current ? '📱' : '💻'}</div>
        <div class="devInfo">
          <b>${esc(s2.device || 'Unbekannt')} ${s2.current ? '<span class="devNow">dieses Gerät</span>' : ''}</b>
          <span>${esc(s2.ip || '—')} · ${s2.createdAt ? fmtDT(s2.createdAt) : 'unbekannt'}</span>
        </div>
        ${s2.current ? '' : `<button class="devKill" data-s="${s2.id}">Abmelden</button>`}
      </div>`).join('') || '<p style="font-size:13px;color:var(--muted);font-weight:600">Keine Geräte gefunden</p>'}
      </div>
      ${list.length > 1 ? '<button class="btnDanger" id="devAll">Alle anderen abmelden</button>' : ''}`);
    $$('.devKill').forEach((b) => {
      b.onclick = async () => {
        try {
          await api('/sessions/' + b.dataset.s, { method: 'DELETE' });
          toast('👋', 'Abgemeldet', '');
          modalDevices();
        } catch (e) { toast('💔', 'Fehler', e.message); }
      };
    });
    const bk = $('#devBack');
    if (bk) bk.onclick = modalProfile;
    const all = $('#devAll');
    if (all) all.onclick = () => confirmBox('Alle anderen abmelden?', 'Du bleibst auf diesem Gerät angemeldet.', async () => {
      try {
        await api('/sessions', { method: 'DELETE' });
        toast('👋', 'Alle anderen abgemeldet', '');
        modalDevices();
      } catch (e) { toast('💔', 'Fehler', e.message); }
    });
  } catch (e) { openModal('<div class="mTitle">Meine Geräte 💻</div><p>' + esc(e.message) + '</p>'); }
}

/* 🚫 Blockierte Nutzer */
async function modalBlocks() {
  openModal('<div class="mTitle">Blockierte 🚫</div><p style="font-size:12.5px;color:var(--muted);font-weight:600">Lädt…</p>');
  try {
    const d = await api('/blocks');
    const users = d.users || d.blocked || d.blocks || [];
    openModal(`<div class="mTitle">Blockierte 🚫</div>
      <button class="btnSoft" id="blkBack" style="margin-bottom:8px">← Zurück zum Profil</button>
      <p style="font-size:12.5px;color:var(--muted);font-weight:600;margin-bottom:10px">
        ${users.length ? 'Blockierte können dir nicht schreiben und deinen Status nicht sehen.' : 'Niemand blockiert 💗'}</p>
      <div style="max-height:320px;overflow:auto">
      ${users.map((u) => `<div class="devRow">
        <div class="cav">${avatarHtml(u.avatar)}</div>
        <div class="devInfo"><b>${esc(u.displayName || u.username || 'Unbekannt')}</b><span>@${esc(u.username || '?')}</span></div>
        <button class="devKill" data-u="${u.id}">Entsperren</button>
      </div>`).join('')}
      </div>`);
    const bk2 = $('#blkBack');
    if (bk2) bk2.onclick = modalProfile;
    $$('.devKill[data-u]').forEach((b) => {
      b.onclick = async () => {
        try {
          await api('/users/' + b.dataset.u + '/block', { method: 'DELETE' });
          toast('💗', 'Entsperrt', '');
          modalBlocks();
        } catch (e) { toast('💔', 'Fehler', e.message); }
      };
    });
  } catch (e) { openModal('<div class="mTitle">Blockierte 🚫</div><p>' + esc(e.message) + '</p>'); }
}

/* 📌 Leiste über dem Chat — zeigt die angepinnte Nachricht */
function renderPinBar() {
  const bar = $('#pinBar'), txt = $('#pinBarText');
  if (!bar || !txt) return;
  const d = activeDetails();
  const pinned = d && d.pinned;
  if (!pinned) { bar.classList.add('hidden'); return; }
  txt.textContent = (pinned.senderName ? pinned.senderName + ': ' : '') + (pinned.text || (pinned.image ? '📷 Foto' : ''));
  bar.classList.remove('hidden');
  bar.onclick = (ev) => {
    if (ev.target.id === 'pinBarX') return;
    const row = document.querySelector(`.msgRow[data-mid="${pinned.id}"]`);
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.add('flash');
      setTimeout(() => row.classList.remove('flash'), 1200);
    }
  };
  const x = $('#pinBarX');
  if (x) x.onclick = async (ev) => {
    ev.stopPropagation();
    try {
      await api(`/chats/${S.activeChat}/messages/${pinned.id}/pin`, { method: 'POST', body: { pinned: false } });
      (S.messages[S.activeChat] || []).forEach((m) => { m.pinned = false; });
      if (d) d.pinned = null;
      renderPinBar();
      renderMessages(S.activeChat, false);
      toast('📌', 'Losgelöst', '');
    } catch (e) { toast('💔', 'Fehler', e.message); }
  };
}

function toggleInfoPanel() {
  const p = $('#infoPanel');
  if (!p) return;
  if (p.classList.contains('hidden')) renderInfoPanel();
  else p.classList.add('hidden');
}
function isChannelLocked() {
  const d = activeDetails();
  return !!(d && d.chat.type === 'channel' && !isMeAdmin(S.activeChat));
}
function renderHeader() {
  const d = activeDetails();
  if (!d) return;
  const c = d.chat;
  const csum = S.chats.find((x) => x.id === c.id);
  $('#chatHeadAv').innerHTML = avatarHtml(csum ? csum.avatar : c.avatar);
  $('#chatName').textContent = c.name;
  renderSub();
  const locked = isChannelLocked();
  $('#inputBar').classList.toggle('hidden', locked);
  $('#channelBar').classList.toggle('hidden', !locked);
  renderBanner();
}
/* 🖼️ V4.31 — Titelbild eines Kanals anzeigen (nur wenn der Server eins liefert) */
function renderBanner() {
  const d = activeDetails();
  const el = $('#channelBanner');
  if (!el) return;
  const c = d && d.chat;
  const b = c && c.banner;
  if (!b) { el.classList.add('hidden'); el.style.backgroundImage = ''; return; }
  el.classList.remove('hidden');
  el.style.backgroundImage = `url("${String(b).replace(/"/g, '%22')}")`;
  $('#channelBannerName').textContent = c.name;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('#channelBanner');
  if (b) { const t = $('#btnChatMenu'); if (t) t.click(); }
});

function renderSub() {
  const d = activeDetails();
  if (!d) return;
  const c = d.chat, sub = $('#chatSub');
  const typ = S.typingTimers[c.id] && S.typingName;
  if (typ) { sub.textContent = typ + ' schreibt…'; sub.classList.add('typing'); return; }
  sub.classList.remove('typing');
  if (c.type === 'private') {
    const other = d.members.find((m) => m.id !== S.user.id);
    sub.textContent = other && other.online ? 'online 💗' : fmtLastSeen(other);
  } else if (c.type === 'group') sub.textContent = d.members.length + ' Mitglieder';
  else if (c.type === 'community') sub.textContent = 'Community · ' + d.members.length + ' Mitglieder';
  else sub.textContent = 'Kanal · ' + d.members.length + ' Abonnenten';
}
/* Eigenes Wallpaper: Bild verkleinern -> dataURL -> Server */
function shrinkImage(file, maxW, quality, maxBytes) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = Math.min(img.width, maxW);
      let h = Math.round(img.height * w / img.width);
      let q = quality;
      const canvas = document.createElement('canvas');
      for (let i = 0; i < 9; i++) {
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', q);
        if (dataUrl.length <= maxBytes) { URL.revokeObjectURL(url); return resolve('custom:' + dataUrl); }
        if (q > 0.36) { q -= 0.12; } else { w = Math.round(w * 0.75); h = Math.round(h * 0.75); q = 0.62; }
      }
      URL.revokeObjectURL(url);
      reject(new Error('Bild zu groß'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
}

function pickWallpaper(chatId, grid, tileEl) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const theme = await shrinkImage(f, 1000, 0.75, 290000);
      await api(`/chats/${chatId}/background`, { method: 'PUT', body: { theme } });
      const cs = S.chats.find((x) => x.id === chatId);
      if (cs) cs.bg = theme;
      grid.querySelectorAll('.bgTile').forEach((x) => x.classList.remove('on'));
      if (tileEl) tileEl.classList.add('on');
      applyTheme();
      toast('🖼️', 'Eigenes Wallpaper gesetzt!', 'Sieht richtig gut aus 💗');
    } catch (e) { toast('💔', 'Fehler', e.message); }
  };
  inp.click();
}


/* =====================================================================
 *  🎨 V4.19 — HINTERGRUND IN DREI EBENEN
 *  app  = hinter der ganzen App (body)
 *  list = links hinter der Chat-Liste
 *  chat = im Chat (das alte Wallpaper-System, bleibt unverändert)
 *  Jede Ebene: preset | custom (Galerie-Foto) | color | none
 *              + blur 0-40, brightness 20-120, overlay 0-90, animation
 * ===================================================================== */

const BG_CACHE_KEY = 'lc_bg_layers';
S.bgLayers = { app: null, list: null, chat: null };

function cssOfLayer(layer) {
  if (!layer || layer.type === 'none') return null;
  if (layer.type === 'custom') return `url("${layer.value}")`;
  if (layer.type === 'color') return layer.value || null;
  // preset
  const p = (S.bgPresets || []).find((x) => x.id === layer.value);
  return p ? p.css : null;
}
function animHtml(name) {
  if (!name || name === 'none') return '';
  const n = name === 'snow' ? 18 : 14;
  let html = '';
  for (let i = 0; i < n; i++) {
    const left = (i * 7.3 + 3) % 100;
    const delay = (i * 0.53) % 6;
    const dur = 5 + (i % 5);
    const size = 10 + (i % 4) * 6;
    const ico = name === 'hearts' ? '💗' : name === 'stars' ? '⭐' : name === 'bubbles' ? '🫧'
      : name === 'snow' ? '❄️' : name === 'sparkle' ? '✨' : '✦';
    html += `<span style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s;font-size:${size}px">${ico}</span>`;
  }
  return `<div class="bgAnim bgAnim-${name}">${html}</div>`;
}

function applyBackgrounds() {
  const L = S.bgLayers || {};
  // --- APP ---
  const appCss = cssOfLayer(L.app);
  const appEl = $('#bgApp');
  if (appCss) {
    document.body.classList.add('hasAppBg');
    if (appEl) {
      appEl.style.background = appCss;
      appEl.style.backgroundSize = 'cover';
      appEl.style.backgroundPosition = (L.app.pos || 'center');
      appEl.style.filter = `blur(${L.app.blur || 0}px) brightness(${(L.app.brightness || 100)}%)`;
      appEl.innerHTML = animHtml(L.app.animation);
      appEl.classList.remove('hidden');
    }
    const ov = $('#bgAppOverlay');
    if (ov) ov.style.background = `rgba(12,4,20,${(L.app.overlay || 0) / 100})`;
  } else {
    document.body.classList.remove('hasAppBg');
    if (appEl) { appEl.classList.add('hidden'); appEl.style.background = ''; appEl.innerHTML = ''; }
  }
  // --- LISTE ---
  const listCss = cssOfLayer(L.list);
  const side = $('#sidebar');
  if (side) {
    if (listCss) {
      side.classList.add('hasListBg');
      side.style.setProperty('--listbg', listCss);
      side.style.setProperty('--listblur', (L.list.blur || 0) + 'px');
      side.style.setProperty('--listbright', (L.list.brightness || 100) + '%');
    } else {
      side.classList.remove('hasListBg');
      side.style.removeProperty('--listbg');
    }
  }
}

async function loadBackgrounds() {
  try {
    const d = await api('/backgrounds');
    S.bgPresets = d.presets || [];
    S.bgAnimations = d.animations || [];
    S.bgLayers = d.layers || { app: null, list: null, chat: null };
    // V3-Altlast übernehmen, falls die neue Ebene leer ist
    if (!S.bgLayers.app && d.legacyAppBackground && d.legacyAppBackground.type) {
      S.bgLayers.app = { type: d.legacyAppBackground.type, value: d.legacyAppBackground.value, blur: 0, brightness: 100, overlay: 0, animation: 'none', pos: 'center' };
    }
    try { localStorage.setItem(BG_CACHE_KEY, JSON.stringify(S.bgLayers)); } catch (e) {}
    applyBackgrounds();
  } catch (e) {
    // offline: aus dem Cache
    try {
      const c = JSON.parse(localStorage.getItem(BG_CACHE_KEY) || 'null');
      if (c) { S.bgLayers = c; applyBackgrounds(); }
    } catch (e2) {}
  }
}

async function saveBgLayer(layerName, background) {
  const r = await api('/backgrounds', { method: 'POST', body: { layer: layerName, background } });
  if (S.bgLayers) S.bgLayers[layerName] = r.background;
  applyBackgrounds();
  return r;
}

/* 📷 Foto aus der Galerie → 1920×1080, JPEG, max 2,5 MB */
function pickGalleryPhoto(cb) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const MAXW = 1920, MAXH = 1080;
      let w = img.width, h = img.height;
      const sc = Math.min(1, MAXW / w, MAXH / h);
      w = Math.round(w * sc); h = Math.round(h * sc);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      let q = 0.86, out = cv.toDataURL('image/jpeg', q);
      while (out.length > 2.4 * 1024 * 1024 && q > 0.4) { q -= 0.08; out = cv.toDataURL('image/jpeg', q); }
      URL.revokeObjectURL(url);
      if (out.length > 2.5 * 1024 * 1024) return toast('💔', 'Foto zu groß', 'Bitte ein kleineres wählen');
      cb(out, f.name);
    };
    img.onerror = () => toast('💔', 'Kein Bild', 'Diese Datei kann der Browser nicht lesen');
    img.src = url;
  };
  inp.click();
}

function applyTheme() {
  if (applyV3Wallpaper()) return;
  const t = activeTheme();
  const area = $('#msgScroll');
  if (typeof t === 'string' && t.startsWith('custom:')) {
    area.className = 'msgScroll dark';
    area.style.backgroundImage = 'linear-gradient(rgba(20,8,32,.30), rgba(20,8,32,.30)), url("' + t.slice(7) + '")';
    area.style.backgroundSize = 'cover';
    area.style.backgroundPosition = 'center';
    return;
  }
  area.style.backgroundImage = '';
  area.className = 'bg-' + t;
  area.classList.toggle('dark', isDarkTheme(t));
}

/* ---------- Nachrichten ---------- */
async function loadMessages(id) {
  const d = await api(`/chats/${id}/messages`);
  S.messages[id] = d.messages;
  renderMessages(id, true);
}
function memberById(id) {
  const d = activeDetails();
  if (d) { const m = d.members.find((x) => x.id === id); if (m) return m; }
  return { id, displayName: '?' };
}
function ticksHtml(m, chatId) {
  const d = S.details[chatId];
  if (!d) return '';
  const others = d.members.filter((x) => x.id !== S.user.id).map((x) => x.id);
  const read = others.length && others.every((id) => m.readBy.includes(id));
  return `<span class="ticks ${read ? 'read' : ''}">${read ? '✓✓' : '✓'}</span>`;
}


/* =====================================================================
 *  🎁 V4.19 — STICKER
 *  6 Packs (4 frei, 2 nur VIP), Favoriten, „zuletzt", Suche.
 *  Gesendet wird als kind:'sticker' mit attachment.sticker = Emoji.
 * ===================================================================== */
S.sticker = { packs: [], favs: [], recent: [], open: false, tab: 'recent' };

async function loadStickers() {
  try {
    const d = await api('/stickers/packs');
    S.sticker.packs = d.packs || [];
    S.sticker.favs = d.favs || [];
    S.sticker.recent = d.recent || [];
  } catch (e) { /* still */ }
}
function stickerById(id) {
  // id = "pack-3"
  const [packId, idx] = [id.slice(0, id.lastIndexOf('-')), parseInt(id.slice(id.lastIndexOf('-') + 1), 10)];
  const p = S.sticker.packs.find((x) => x.id === packId);
  if (!p) return null;
  return (p.items || []).find((i) => i.id === id) || (p.items || [])[idx] || null;
}
function openStickerPanel(force) {
  const el = $('#stickerPanel');
  if (!el) return;
  const show = force === undefined ? el.classList.contains('hidden') : force;
  el.classList.toggle('hidden', !show);
  S.sticker.open = show;
  if (show) {
    attPop(false);
    // Standard ist immer ein ECHTES Pack — „zuletzt" ist ein eigener Tab.
    // Sonst sieht der erste Blick aus wie „es gibt keine Sticker".
    if (!S.sticker.tab || S.sticker.tab === 'recent' && !(S.sticker.recent || []).length) {
      const first = (S.sticker.packs || []).find((p2) => !p2.locked);
      S.sticker.tab = first ? first.id : 'recent';
    }
    if (S.sticker.autoPack !== false && !S.sticker.openedOnce) {
      const first = (S.sticker.packs || []).find((p2) => !p2.locked);
      if (first) S.sticker.tab = first.id;
      S.sticker.openedOnce = true;
    }
    renderStickerTabs(); renderStickerGrid();
    const se = $('#stSearch'); if (se) { se.value = ''; }
  }
}
function renderStickerTabs() {
  const box = $('#stTabs');
  if (!box) return;
  const tabs = [{ id: 'recent', ico: '🕐', locked: false }, { id: 'favs', ico: '⭐', locked: false }];
  for (const p of S.sticker.packs) tabs.push({ id: p.id, ico: p.emoji, locked: p.locked, name: p.name });
  box.innerHTML = tabs.map((t) => `<button class="stTab ${S.sticker.tab === t.id ? 'on' : ''} ${t.locked ? 'locked' : ''}" data-st="${t.id}" title="${esc(t.name || t.id)}">${t.ico}${t.locked ? '🔒' : ''}</button>`).join('');
  box.querySelectorAll('.stTab').forEach((b) => {
    b.onclick = () => {
      S.sticker.tab = b.dataset.st;
      const p = S.sticker.packs.find((x) => x.id === b.dataset.st);
      if (p && p.locked) { openVip(); return; }
      renderStickerTabs(); renderStickerGrid();
    };
  });
}
function renderStickerGrid(q) {
  const box = $('#stGrid');
  if (!box) return;
  let items = [];
  if (q) {
    for (const p of S.sticker.packs) {
      if (p.locked) continue;
      if (p.name.toLowerCase().includes(q) || p.id.includes(q)) items = items.concat(p.items || []);
    }
  } else if (S.sticker.tab === 'recent') {
    items = (S.sticker.recent || []).map(stickerById).filter(Boolean);
  } else if (S.sticker.tab === 'favs') {
    items = (S.sticker.favs || []).map(stickerById).filter(Boolean);
  } else {
    const p = S.sticker.packs.find((x) => x.id === S.sticker.tab);
    items = (p && p.items) || [];
  }
  if (!items.length) {
    box.innerHTML = `<div style="grid-column:1/-1;text-align:center;font-size:11.5px;font-weight:800;color:var(--muted);padding:14px 6px">
      ${q ? 'Nichts gefunden 💔' : S.sticker.tab === 'favs' ? 'Noch keine Favoriten — lange auf einen Sticker tippen ⭐' : 'Noch nichts hier — schick den ersten Sticker! 💗'}</div>`;
    return;
  }
  box.innerHTML = items.map((i) => `<button class="stItem" data-stick="${i.id}" title="Sticker">${i.emoji}</button>`).join('');
  box.querySelectorAll('.stItem').forEach((b) => {
    b.onclick = () => sendSticker(b.dataset.stick);
    // ⭐ Favorit per Rechtsklick / Langdruck
    let lp = null;
    b.oncontextmenu = (ev) => { ev.preventDefault(); toggleStickerFav(b.dataset.stick); };
    b.onpointerdown = () => { lp = setTimeout(() => { toggleStickerFav(b.dataset.stick); lp = null; }, 550); };
    b.onpointerup = b.onpointerleave = () => { if (lp) clearTimeout(lp); };
  });
}
async function toggleStickerFav(id) {
  try {
    const isFav = (S.sticker.favs || []).includes(id);
    const r = await api('/stickers/fav', { method: 'POST', body: { id, fav: !isFav } });
    S.sticker.favs = r.favs || [];
    toast('⭐', isFav ? 'Favorit entfernt' : 'Zu Favoriten', '');
    renderStickerGrid();
  } catch (e) { toast('💔', 'Fehler', e.message); }
}
async function sendSticker(id) {
  const it = stickerById(id);
  if (!it) return toast('💔', 'Sticker nicht gefunden', '');
  if (S.mutedUntil) return toast('🔇', 'Du bist stummgeschaltet', '');
  if (isChannelLocked()) return;
  try {
    const d = await api(`/chats/${S.activeChat}/messages`, {
      method: 'POST',
      body: { kind: 'sticker', text: '', attachment: { sticker: it.emoji, mime: 'image/sticker', name: 'Sticker' } },
    });
    if (!S.messages[S.activeChat]) S.messages[S.activeChat] = [];
    if (!S.messages[S.activeChat].some((m) => m.id === d.message.id)) S.messages[S.activeChat].push(d.message);
    appendMsg(d.message, S.activeChat);
    S.sticker.recent = [id, ...(S.sticker.recent || []).filter((x) => x !== id)].slice(0, 24);
    renderStickerGrid();
    api('/stickers/recent', { method: 'POST', body: { id } }).then((r) => { S.sticker.recent = r.recent || S.sticker.recent; }).catch(() => {});
  } catch (e) { toast('💔', 'Sticker fehlgeschlagen', e.message); }
}

/* 🧩 Anhang einer Nachricht als HTML (V4.18) */
function attachmentHtml(m, chatId) {
  const a = m.attachment || {};
  // 🐞 V4.19: Sticker haben KEINE url (nur ein Emoji in `sticker`).
  // Stand die URL-Prüfung davor, kam der Sticker nie bis zum Renderer.
  if (m.kind === 'sticker' || a.mime === 'image/sticker') {
    return `<span class="stickerMsg" title="Sticker">${esc(a.sticker || '💗')}</span>`;
  }
  if (!a || (!a.url && !a.lat && !a.lng)) return '';
  const mine = m.senderId === S.user.id;

  // 🔥 Einmalansicht
  if (a.viewOnce) {
    if (a.consumed) {
      return `<div class="viewOnceCard" style="cursor:default;border-style:solid;opacity:.65">
        <b>🔥</b><span>Einmal angesehen</span><small>Inhalt wurde gelöscht</small></div>`;
    }
    if (mine) {
      return `<div class="viewOnceCard" style="cursor:default">
        <b>🔥</b><span>Einmal gesendet</span><small>Empfänger sieht es genau 1×</small></div>`;
    }
    return `<div class="viewOnceCard" data-vo="${m.id}" data-chat="${chatId}">
      <b>🔥</b><span>Antippen zum Öffnen</span><small>Nur einmal · dann gelöscht</small></div>`;
  }
  // 🎞️ Video
  if (m.kind === 'video' || (a.mime || '').startsWith('video/')) {
    return `<video class="msgVideo" controls preload="metadata" src="${a.url}"></video>`;
  }
  // 🎙️ Sprachnachricht
  if (m.kind === 'voice' || (a.mime || '').startsWith('audio/')) {
    const wave = Array.isArray(a.wave) && a.wave.length ? a.wave : Array.from({ length: 26 }, (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 1.7)));
    /* ▶️ V4.32 — Abspielgeschwindigkeit wie bei WhatsApp (1× → 1,5× → 2× → 0,5×) */
    return `<div class="voiceWrap">
      <button class="voicePlay" data-play="${m.id}">▶</button>
      <div class="voiceBars">${wave.map((v) => `<i style="height:${Math.max(4, Math.round(6 + v * 20))}px"></i>`).join('')}</div>
      <span class="voiceDur">${fmtDur(a.duration)}</span>
      <button class="voiceRate" data-rate="${m.id}" title="Geschwindigkeit">${(S.voiceRate || 1) === 1 ? '1×' : S.voiceRate + '×'}</button>
    </div>`;
  }
  // 📍 Standort
  if (m.kind === 'location' || (a.lat && a.lng)) {
    const ll = `${a.lat},${a.lng}`;
    return `<a class="locCard" href="https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=16/${a.lat}/${a.lng}" target="_blank" rel="noopener">
      <div class="locMap"><span class="g1"></span><span class="g2"></span><span class="g3"></span><span class="locPin">📍</span></div>
      <div class="locTxt">${esc(a.name || 'Mein Standort')}<span>${ll} · Karte öffnen</span></div>
    </a>`;
  }
  // 👤 Kontakt
  if (m.kind === 'contact' || a.mime === 'text/vcard') {
    return `<div class="vcardCard">
      <div class="cav">${esc(a.vavatar || '👤')}</div>
      <div><b>${esc(a.vname || a.name || 'Kontakt')}</b><span>@${esc(a.vuser || '?')}${a.vphone ? ' · ' + esc(a.vphone) : ''}</span></div>
    </div>`;
  }
  // 🖼️ Foto — V4.27: liegt als echte Datei auf der Platte (/media/<id>.png).
  //    Vor V4.27 kam jedes Foto als Base64 in `m.image`; der Zweig hier hat
  //    gefehlt, deshalb war die Blase eines /media/-Fotos leer.
  if (m.kind === 'photo' || ((a.mime || '').startsWith('image/') && a.mime !== 'image/gif')) {
    return `<img class="msgImg" src="${a.url}" alt="Foto" loading="lazy" data-open-media="${m.id}">`;
  }
  // 📄 Datei/Dokument
  if (m.kind === 'file' || (a.url || '').startsWith('data:application/') || (a.mime || '').includes('pdf')) {
    const ico = (a.mime || '').includes('pdf') ? '📕' : (a.mime || '').includes('zip') ? '🗜️'
      : (a.mime || '').startsWith('text/') ? '📝' : '📄';
    return `<a class="fileChip" href="${a.url}" download="${esc(a.name || 'datei')}">
      <span class="fi">${ico}</span>
      <span><span class="fn">${esc(a.name || 'Datei')}</span><span class="fs">${fmtSize(a.size)} · herunterladen</span></span>
    </a>`;
  }
  // 🎁 GIF
  if (m.kind === 'gif' || a.mime === 'image/gif') {
    return `<div class="gifWrap"><img class="msgImg" src="${a.url}" alt="GIF"><span class="gifBadge">GIF</span></div>`;
  }
  return '';
}

function bubbleHtml(m, chatId) {
  const d = S.details[chatId] || {};
  const chat = d.chat || {};
  const mine = m.senderId === S.user.id;
  if (m.kind === 'poll') return pollHtml(m, chatId);
  const name = !mine && chat.type !== 'private' ? `<span class="msgName" style="color:${colorOf(m.senderId)}">${esc(memberById(m.senderId).displayName)}</span>` : '';
  if (m.deleted) {
    return `<div class="msgRow ${mine ? 'mine' : 'others'}" data-mid="${m.id}">
      <div class="bubble deleted"><span class="deletedTxt">🚫 Diese Nachricht wurde gelöscht</span></div>
    </div>`;
  }
  const attHtml = attachmentHtml(m, chatId);
  const img = (m.image && !attHtml) ? `<img class="msgImg" src="${m.image}" alt="" loading="lazy">` : '';
  const text = (m.text && m.kind !== 'sticker')
    // **fett** aus Bot-Antworten wirklich fett zeigen (esc() ist schon gelaufen → sicher)
    ? esc(m.text)
      .replace(/`([^`\n]{1,60})`/g, '<code class="lcCode">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
    : '';

  // ↩️ Zitat (Antwort auf eine Nachricht)
  // 🔴 V4.22: Lovechen antwortet mit replyTo = nur ID (botSay). Dann stand ein
  //    leerer rosa Balken über der Nachricht. Jetzt: nur mit Inhalt zeichnen.
  const rp = m.replyTo && (m.replyTo.text || m.replyTo.image || m.replyTo.senderName) ? m.replyTo : null;
  const quote = rp
    ? `<div class="quote" data-jump="${esc(rp.id)}">
         <span class="qName" style="color:${rp.senderId === S.user.id ? 'var(--pink)' : colorOf(rp.senderId)}">${rp.senderId === S.user.id ? 'Du' : esc(rp.senderName || '')}</span>
         <span class="qText">${rp.image ? '📷 Foto' : esc(rp.text || '')}</span>
       </div>`
    : '';

  // 📌 Angepinnt
  const pinMark = m.pinned ? `<span class="pinMark" title="Angepinnt">📌</span>` : '';

  // ↪️ Weitergeleitet
  // forwardedFrom kommt als String (v3.js) ODER als Objekt (neuer Weg) — beide dulden
  const fwdWho = typeof m.forwardedFrom === 'string'
    ? m.forwardedFrom
    : (m.forwardedFrom && m.forwardedFrom.senderName) || '';
  const fwdMark = m.forwarded
    ? `<div class="fwdMark">↪ Weitergeleitet${fwdWho ? ' von ' + esc(fwdWho) : ''}</div>`
    : '';
  const reacts = Object.entries(m.reactions || {}).length
    ? Object.entries(
        Object.entries(m.reactions).reduce((acc, [uid, e]) => { acc[e] = (acc[e] || 0) + 1; return acc; }, {})
      ).map(([e, n]) => `<span class="reactChip" data-e="${e}" title="Reagieren">${e}${n > 1 ? n : ''}</span>`)
      .join('')
    : '';
  return `
  <div class="msgRow ${mine ? 'mine' : 'others'}" data-mid="${m.id}">
    <div class="bubble${m.kind === 'sticker' ? ' bubbleSticker' : ''}${m.pinned ? ' isPinned' : ''}">
      ${fwdMark}${name}${quote}${attHtml}${img}${text}
      <div class="mmeta">${pinMark}${m.editedAt ? '<span class="editedMark">bearbeitet</span> ' : ''}${fmtTime(m.createdAt)} ${mine ? ticksHtml(m, chatId) : ''}</div>
      ${reacts ? `<div class="reacts">${reacts}</div>` : ''}
      <div class="qreact">${QUICK_REACTS.map((e) => `<button data-e="${e}">${e}</button>`).join('')}</div>
    </div>
  </div>`;
}
/* 📊 V4: Umfragen */
async function loadPolls(chatId) {
  try {
    const d = await api('/chats/' + chatId + '/polls');
    S.polls[chatId] = {};
    (d.polls || []).forEach((p) => { S.polls[chatId][p.id] = p; });
  } catch (e) {}
}
function pollOf(m, chatId) {
  const map = S.polls[chatId] || {};
  const id = (m.attachment && m.attachment.pollId) || '';
  return map[id] || Object.values(map).find((p) => p.question === m.text) || null;
}
function pollHtml(m, chatId) {
  const mine = m.senderId === S.user.id;
  const p = pollOf(m, chatId);
  const head = `<div class="pollQ">📊 ${esc(m.text)}</div>`;
  let body = '';
  if (!p) {
    body = `<div class="pollMuted">Umfrage wird geladen…</div>`;
  } else {
    body = p.options.map((o) => `
      <div class="pollOpt${o.mine ? ' mine' : ''}${p.closed ? ' closed' : ''}" data-poll="${p.id}" data-opt="${o.index}">
        <div class="pollBar" style="width:${o.percent}%"></div>
        <span class="pollLabel">${esc(o.label)}</span>
        <span class="pollPct">${o.percent}%</span>
      </div>`).join('');
    body += `<div class="pollMuted">${p.totalVotes} Stimmen${p.closed ? ' · beendet' : ''}${p.anonymous ? ' · anonym' : ''}</div>`;
  }
  return `
  <div class="msgRow ${mine ? 'mine' : 'others'}" data-mid="${m.id}">
    <div class="bubble pollBubble">
      ${head}${body}
      <div class="mmeta">${fmtTime(m.createdAt)}</div>
    </div>
  </div>`;
}
function renderMessages(id, scrollBottom) {
  const area = $('#msgScroll');
  const msgs = S.messages[id] || [];
  let html = '';
  let lastDay = '';
  for (const m of msgs) {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) { html += `<div class="daySep">${fmtDaySep(m.createdAt)}</div>`; lastDay = day; }
    html += bubbleHtml(m, id);
  }
  if (!msgs.length) html = `<div class="sysNote">Noch keine Nachrichten — sag Hallo! 👋💗</div>`;
  area.innerHTML = html;
  bindBubbleEvents(id);
  if (scrollBottom) area.scrollTop = area.scrollHeight;
}
function appendMsg(m, chatId) {
  const area = $('#msgScroll');
  /* 🐞 V4.31 — gefunden beim Video-Dreh: die eigene Nachricht stand DOPPELT
   * im Chat, weil der Server sie einmal als Antwort auf POST und einmal über
   * den WebSocket schickt. Im Speicher wurde sie entdoppelt, im DOM nicht.
   * Jetzt gilt: eine Nachricht, ein Element. */
  if (m && m.id && area.querySelector(`.msgRow[data-mid="${m.id}"]`)) return;
  const ph = area.querySelector('.sysNote');
  if (ph && /Noch keine Nachrichten/.test(ph.textContent || '')) ph.remove();
  const msgs = S.messages[chatId];
  const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 220;
  const prev = msgs[msgs.length - 1];
  if (prev && !sameDay(prev.createdAt, m.createdAt)) area.insertAdjacentHTML('beforeend', `<div class="daySep">${fmtDaySep(m.createdAt)}</div>`);
  area.insertAdjacentHTML('beforeend', bubbleHtml(m, chatId));
  bindBubbleEvents(chatId);
  if (nearBottom || m.senderId === S.user.id) area.scrollTop = area.scrollHeight;
}
function sysNote(text) {
  const area = $('#msgScroll');
  area.insertAdjacentHTML('beforeend', `<div class="sysNote">${esc(text)}</div>`);
  area.scrollTop = area.scrollHeight;
}
function bindBubbleEvents(chatId) {
  $$('#msgScroll .msgRow').forEach((row) => {
    row.onclick = (ev) => {
      const pollOpt = ev.target.closest('.pollOpt');
      if (pollOpt) {
        const pid = pollOpt.dataset.poll;
        const idx = parseInt(pollOpt.dataset.opt, 10);
        api(`/chats/${chatId}/polls/${pid}/vote`, { method: 'POST', body: { option: idx } })
          .then((r) => {
            if (r && r.poll) { S.polls[chatId] = S.polls[chatId] || {}; S.polls[chatId][pid] = r.poll; }
            renderMessages(chatId, false);
          })
          .catch((e) => toast('💔', 'Abstimmung fehlgeschlagen', e.message));
        return;
      }
      // 🔥 Einmal-Medium + 🎧 Sprache haben eigene Handler
      if (ev.target.closest('[data-vo]') || ev.target.closest('[data-play]')) return;
      const chip = ev.target.closest('.reactChip');
      const qr = ev.target.closest('.qreact button');
      if (chip) { api(`/chats/${chatId}/messages/${row.dataset.mid}/reaction`, { method: 'POST', body: { emoji: chip.dataset.e } }).catch(() => {}); return; }
      if (qr) { api(`/chats/${chatId}/messages/${row.dataset.mid}/reaction`, { method: 'POST', body: { emoji: qr.dataset.e } }).catch(() => {}); row.querySelector('.qreact').classList.remove('show'); return; }
      const qrBox = row.querySelector('.qreact');
      $$('#msgScroll .qreact.show').forEach((x) => x !== qrBox && x.classList.remove('show'));
      qrBox.classList.toggle('show');

      // 📋 Aktions-Menü: Antworten · Weiterleiten · Pin · Bearbeiten · Löschen
      const mid = row.dataset.mid;
      const msg = (S.messages[chatId] || []).find((x) => x.id === mid);
      if (!msg || msg.deleted) return;
      openMsgMenu(msg, chatId, qrBox);
    };
  });
}

/* 📋 Menü unter einer Nachricht — wie WhatsApp Web, nur pink */
function openMsgMenu(msg, chatId, anchorEl) {
  closeMsgMenu();
  const mine = msg.senderId === S.user.id;
  const d = S.details[chatId] || {};
  const chat = d.chat || {};
  const isAdmin = (chat.adminIds || []).includes(S.user.id) || chat.ownerId === S.user.id;
  const items = [
    { a: 'reply', ico: '↩️', t: 'Antworten' },
    { a: 'fwd',   ico: '↪️', t: 'Weiterleiten' },
    { a: 'pin',   ico: '📌', t: msg.pinned ? 'Loslösen' : 'Anpinnen' },
    (msg.readBy || []).includes(S.user.id) ? { a: 'unread', ico: '🔵', t: 'Ungelesen' } : null,
    mine && !msg.image ? { a: 'edit', ico: '✏️', t: 'Bearbeiten' } : null,
    { a: 'star', ico: '⭐', t: 'Merken' },   // ⭐ jede Nachricht, nicht nur die eigene
    (mine || isAdmin) ? { a: 'del', ico: '🗑️', t: 'Löschen', danger: true } : null,
    // 🚩 V4.30 — Melden wie bei WhatsApp (mit den letzten 5 Nachrichten)
    !mine ? { a: 'report', ico: '🚩', t: 'Melden', danger: true } : null,
  ].filter(Boolean);

  const box = document.createElement('div');
  box.className = 'msgMenu';
  box.id = 'msgMenu';
  box.innerHTML = items.map((i) => `<button data-a="${i.a}" class="${i.danger ? 'danger' : ''}">${i.ico} ${i.t}</button>`).join('');
  document.body.appendChild(box);

  const r = anchorEl.getBoundingClientRect();
  box.style.left = Math.min(Math.max(8, r.left - 60), innerWidth - 200) + 'px';
  box.style.top = Math.min(r.bottom + 6, innerHeight - box.offsetHeight - 8) + 'px';

  box.querySelectorAll('button').forEach((b) => {
    b.onclick = async (ev) => {
      ev.stopPropagation();
      const a = b.dataset.a;
      closeMsgMenu();
      await msgAction(a, msg, chatId);
    };
  });
  setTimeout(() => document.addEventListener('pointerdown', outsideClose, { once: true }), 0);
}
function outsideClose(ev) {
  const m = $('#msgMenu');
  if (m && !m.contains(ev.target)) closeMsgMenu();
}
function closeMsgMenu() { const m = $('#msgMenu'); if (m) m.remove(); }

async function msgAction(a, msg, chatId) {
  const id = msg.id;
  try {
    if (a === 'reply') {
      S.replyTo = msg;
      showReplyBar();
      $('#msgInput').focus();
      return;
    }
    if (a === 'fwd') { openForward(msg, chatId); return; }
    if (a === 'unread') {
      await api(`/chats/${chatId}/messages/${id}/unread`, { method: 'POST', body: {} });
      const c = S.chats.find((x) => x.id === chatId);
      if (c) { c.unread = Math.max(1, (c.unread || 0) + 1); renderChatList(); }
      if (S.activeChat === chatId) closeChat();
      toast('🔵', 'Als ungelesen markiert', 'Gesehen hast du es trotzdem 😌');
      return;
    }
    if (a === 'pin') {
      const r = await api(`/chats/${chatId}/messages/${id}/pin`, { method: 'POST', body: {} });
      // ⚠️ NICHT das übergebene `msg`-Objekt ändern!
      // Der WebSocket-Broadcast (message:updated) ERSETZT das Objekt in
      // S.messages durch ein neues. `msg` zeigt dann auf eine Waise —
      // Änderungen daran sieht nie jemand. Deshalb: frisch per id suchen.
      const next = r && typeof r.pinned === 'boolean' ? r.pinned : !msg.pinned;
      const arr = S.messages[chatId] || [];
      arr.forEach((x) => { x.pinned = false; });
      const fresh = arr.find((x) => x.id === id);
      if (fresh) fresh.pinned = next;
      renderMessages(chatId, false);
      if (S.details[chatId]) {
        S.details[chatId].pinned = next
          ? { id, text: (fresh && fresh.text) || '', image: !!(fresh && fresh.image), senderName: (fresh && memberById(fresh.senderId).displayName) || '' }
          : null;
        renderPinBar();
      }
      toast('📌', next ? 'Angepinnt' : 'Losgelöst', '');
      return;
    }
    if (a === 'edit') {
      const neu = prompt('Nachricht bearbeiten:', msg.text || '');
      if (neu === null) return;
      const t = neu.trim();
      if (!t || t === msg.text) return;
      const r = await api(`/chats/${chatId}/messages/${id}`, { method: 'PATCH', body: { text: t } });
      const freshE = (S.messages[chatId] || []).find((x) => x.id === id);
      if (freshE && r && r.message) Object.assign(freshE, r.message);
      renderMessages(chatId, false);
      toast('✏️', 'Bearbeitet', '');
      return;
    }
    if (a === 'star') {
      /* ⭐ V4.31 — der Stern liegt jetzt auf dem Server (überlebt Neuladen
       * und ist auf jedem Gerät da). Siehe client/v431.js. */
      if (window.LC431) { await window.LC431.toggleStar(chatId, id); return; }
      S.starred = S.starred || [];
      const i = S.starred.findIndex((x) => x.id === id);
      if (i >= 0) { S.starred.splice(i, 1); toast('⭐', 'Nicht mehr gemerkt', ''); }
      else { S.starred.push({ ...msg, chatId }); toast('⭐', 'Gemerkt', 'In „Gemerkt" gesammelt'); }
      localStorage.setItem('lc_starred', JSON.stringify(S.starred.slice(-200)));
      return;
    }
    if (a === 'report') {
      const GRUENDE = ['Spam', 'Belästigung', 'Falsche Informationen', 'Gewalt oder Bedrohung', 'Sonstiges'];
      const wahl = prompt('Warum meldest du diese Nachricht?\n\n1 = Spam\n2 = Belästigung\n3 = Falsche Informationen\n4 = Gewalt oder Bedrohung\n5 = Sonstiges', '1');
      if (wahl === null) return;
      const idx = Math.max(1, Math.min(5, parseInt(wahl, 10) || 5)) - 1;
      const reason = GRUENDE[idx];
      const block = confirm('Auch blockieren?\n\nOK = melden und blockieren\nAbbrechen = nur melden');
      const r = await api('/v430/report', {
        method: 'POST',
        body: {
          chatId,
          targetId: msg.senderId,
          reason,
          block,
          text: '',
          messageId: id,
        },
      });
      toast('🚩', 'Danke 💗', r.message || 'Das Team schaut sich das an.');
      if (r.blocked) {
        const c = S.chats.find((x) => x.id === chatId);
        if (c) { c.blocked = true; renderChatList(); }
      }
      return;
    }
    if (a === 'del') {
      if (!confirm('Diese Nachricht löschen? Für alle.')) return;
      await api(`/chats/${chatId}/messages/${id}`, { method: 'DELETE' });
      const arr = S.messages[chatId] || [];
      const i = arr.findIndex((x) => x.id === id);
      if (i >= 0) arr.splice(i, 1);
      renderMessages(chatId, false);
      toast('🗑️', 'Gelöscht', '');
      return;
    }
  } catch (e) {
    toast('💔', 'Hat nicht geklappt', e.message);
  }
}

/* ↩️ Antwort-Leiste über dem Eingabefeld */
function showReplyBar() {
  let bar = $('#replyBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'replyBar';
    $('#inputBar').insertBefore(bar, $('#pendingImg'));
  }
  const m = S.replyTo;
  if (!m) { bar.remove(); return; }
  const who = m.senderId === S.user.id ? 'Dir selbst' : memberById(m.senderId).displayName;
  bar.innerHTML = `<div class="rbBody"><span class="rbWho">Antwort an ${esc(who)}</span>
      <span class="rbText">${m.image ? '📷 Foto' : esc((m.text || '').slice(0, 90))}</span></div>
    <button id="rbX" title="Abbrechen">✕</button>`;
  $('#rbX').onclick = () => { S.replyTo = null; showReplyBar(); };
}

/* ↪️ Weiterleiten: Chat auswählen */
function openForward(msg, fromChatId) {
  const chats = S.chats.filter((c) => c.id !== fromChatId || true);
  openModal(`<div class="mTitle">Weiterleiten ↪️</div>
    <div class="fwdList">
      ${chats.map((c) => `<button class="fwdPick" data-id="${c.id}">
        <span class="fwdAv">${avatarHtml(c.avatar)}</span>
        <span class="fwdName">${esc(c.name || 'Chat')}</span>
      </button>`).join('') || '<div class="pollMuted">Keine anderen Chats</div>'}
    </div>`);
  $$('.fwdPick').forEach((b) => {
    b.onclick = async () => {
      const target = b.dataset.id;
      try {
        // Server kopiert die Nachricht selbst (kein Client-Vertrauen nötig)
        await api(`/chats/${fromChatId}/messages/${msg.id}/forward`, { method: 'POST', body: { toChatId: target } });
        closeModal();
        toast('↪️', 'Weitergeleitet', '');
      } catch (e) { toast('💔', 'Weiterleiten fehlgeschlagen', e.message); }
    };
  });
}

/* ---------- Senden ---------- */
async function send() {
  const input = $('#msgInput');
  const text = input.value.trim();
  if (!text && !S.pendingImage) return;
  if (S.mutedUntil) {
    toast('🔇', 'Du bist stummgeschaltet', 'Schreiben ist bis ' + fmtDT(S.mutedUntil) + ' gesperrt', 4000);
    return;
  }
  if (isChannelLocked()) return;
  const body = {};
  if (text) body.text = text;
  if (S.pendingImage) body.image = S.pendingImage;
  if (S.replyTo) body.replyTo = S.replyTo.id;
  input.value = ''; input.style.height = 'auto';
  clearPending();
  S.replyTo = null;
  showReplyBar();
  DRAFTS.set(S.activeChat, '');
  try {
    const d = await api(`/chats/${S.activeChat}/messages`, { method: 'POST', body });
    if (!S.messages[S.activeChat]) S.messages[S.activeChat] = [];
    if (!S.messages[S.activeChat].some((m) => m.id === d.message.id)) S.messages[S.activeChat].push(d.message);
    appendMsg(d.message, S.activeChat);
    input.focus();
  } catch (e) { toast('💔', 'Senden fehlgeschlagen', e.message); }
}
function clearPending() { S.pendingImage = ''; $('#pendingImg').style.display = 'none'; }

/* =====================================================================
 *  📎 V4.18 — Anhänge: Video · Dokument · Sprache · Standort · Kontakt
 *  · GIF · Einmalansicht
 *  Der Server konnte all das längst (server.js KINDS). Hier ist die UI.
 * ===================================================================== */

const GIF_PACK = [
  { id: 'heart-pulse', n: 'Herz' }, { id: 'sparkle', n: 'Glitzer' }, { id: 'star', n: 'Stern' },
  { id: 'cat', n: 'Kätzchen' }, { id: 'kiss', n: 'Kuss' }, { id: 'fire', n: 'Feuer' },
  { id: 'moon', n: 'Mond' }, { id: 'rainbow', n: 'Regenbogen' }, { id: 'party', n: 'Party' },
  { id: 'flower', n: 'Blume' }, { id: 'ghost', n: 'Geist' }, { id: 'unicorn', n: 'Einhorn' },
  { id: 'heart-eyes', n: 'Verliebt' }, { id: 'thumbs', n: 'Daumen' }, { id: 'cry', n: 'Weinen' },
  { id: 'rocket', n: 'Rakete' },
];

function attPop(open) {
  const el = $('#attPop');
  if (!el) return;
  const show = open === undefined ? el.classList.contains('hidden') : open;
  el.classList.toggle('hidden', !show);
}
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}
function fileDataUrl(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden'));
    r.readAsDataURL(f);
  });
}
/* Bild verkleinern (gleiche Logik wie beim Foto-Versand) */
function shrinkImage(f, maxPx, maxBytes) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) { const sc = maxPx / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      let q = 0.82, out = cv.toDataURL('image/jpeg', q);
      while (out.length > maxBytes && q > 0.4) { q -= 0.08; out = cv.toDataURL('image/jpeg', q); }
      URL.revokeObjectURL(url);
      if (out.length > maxBytes) return rej(new Error('Bild zu groß — bitte kleiner wählen'));
      res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Kein gültiges Bild')); };
    img.src = url;
  });
}

/* 📤 Eine Nachricht mit Anhang senden */
async function sendAttachment(kind, attachment, text) {
  if (!S.activeChat) return;
  if (S.mutedUntil) return toast('🔇', 'Du bist stummgeschaltet', '');
  if (isChannelLocked()) return;
  const body = { kind };
  if (text) body.text = text;
  if (attachment) body.attachment = attachment;
  if (S.replyTo) body.replyTo = S.replyTo.id;
  try {
    const d = await api(`/chats/${S.activeChat}/messages`, { method: 'POST', body });
    if (!S.messages[S.activeChat]) S.messages[S.activeChat] = [];
    if (!S.messages[S.activeChat].some((m) => m.id === d.message.id)) S.messages[S.activeChat].push(d.message);
    appendMsg(d.message, S.activeChat);
    S.replyTo = null; showReplyBar();
    attPop(false);
    return d.message;
  } catch (e) { toast('💔', 'Senden fehlgeschlagen', e.message); }
}

/* 🎞️ Video */
async function pickVideo() {
  $('#fileVideo').click();
}
async function onVideoPicked(ev) {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  if (f.size > 4 * 1024 * 1024) return toast('💔', 'Video zu groß', 'Max. 4 MB — schneide es kürzer');
  toast('🎞️', 'Video wird geladen…', '');
  try {
    const url = await fileDataUrl(f);
    if (url.length > 5 * 1024 * 1024) return toast('💔', 'Video zu groß', 'Nach dem Kodieren zu groß');
    await sendAttachment('video', { url, name: f.name || 'Video', mime: f.type || 'video/mp4', size: f.size });
  } catch (e) { toast('💔', 'Video fehlgeschlagen', e.message); }
}

/* 📄 Dokument */
async function onDocPicked(ev) {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  if (f.size > 4 * 1024 * 1024) return toast('💔', 'Datei zu groß', 'Max. 4 MB');
  try {
    const url = await fileDataUrl(f);
    await sendAttachment('file', { url, name: f.name || 'Datei', mime: f.type || 'application/octet-stream', size: f.size });
  } catch (e) { toast('💔', 'Datei fehlgeschlagen', e.message); }
}

/* 🔥 Einmalansicht */
async function pickViewOnce() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const data = await shrinkImage(f, 900, 700 * 1024);
      await apiSendViewOnce(data);
    } catch (e) { toast('💔', 'Einmal-Foto fehlgeschlagen', e.message); }
  };
  inp.click();
}
async function apiSendViewOnce(data) {
  // ⚠️ Der Server baut das Einmal-Medium aus `image` — ohne Bild kommt 400.
  const body = { viewOnce: true, image: data };
  if (S.replyTo) body.replyTo = S.replyTo.id;
  const d = await api(`/chats/${S.activeChat}/messages`, { method: 'POST', body });
  if (!S.messages[S.activeChat]) S.messages[S.activeChat] = [];
  if (!S.messages[S.activeChat].some((m) => m.id === d.message.id)) S.messages[S.activeChat].push(d.message);
  appendMsg(d.message, S.activeChat);
  S.replyTo = null; showReplyBar();
  attPop(false);
  toast('🔥', 'Einmal-Foto gesendet', 'Der Empfänger kann es genau einmal öffnen');
}

/* 🎙️ Sprachnachricht aufnehmen */
let recState = null;
async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return toast('💔', 'Kein Mikrofon', 'Dein Browser erlaubt keine Aufnahme');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    const peaks = [];
    let ac = null, analyser = null, raf = null;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(stream);
      analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      raf = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        peaks.push(Math.max(0.08, Math.min(1, rms * 4)));
        const w = $('#recWave');
        if (w) {
          const i = document.createElement('i');
          i.style.height = Math.round(6 + peaks[peaks.length - 1] * 20) + 'px';
          w.appendChild(i);
          while (w.children.length > 40) w.firstChild.remove();
        }
      }, 90);
    } catch (e) { /* ohne Analyse geht's auch */ }
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      clearInterval(raf);
      stream.getTracks().forEach((t) => t.stop());
      if (ac) try { ac.close(); } catch (e) {}
      $('#recBar').classList.add('hidden');
      $('#recWave').innerHTML = '';
      const st = recState; recState = null;
      if (st && st.cancelled) return;
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      if (blob.size < 400) return toast('💔', 'Zu kurz', 'Halte das Mikro etwas länger');
      const dur = Math.max(1, Math.round((Date.now() - (st ? st.started : Date.now())) / 1000));
      const url = await fileDataUrl(blob);
      // Wellenform auf 32 Balken eindampfen
      const wave = [];
      const step = Math.max(1, Math.floor(peaks.length / 32));
      for (let i = 0; i < 32; i++) {
        const slice = peaks.slice(i * step, (i + 1) * step);
        wave.push(slice.length ? +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2) : 0.15);
      }
      await sendAttachment('voice', { url, name: 'Sprachnachricht', mime: blob.type, size: blob.size, duration: dur, wave });
    };
    recState = { mr, started: Date.now(), cancelled: false };
    mr.start(200);
    $('#recBar').classList.remove('hidden');
    let secs = 0;
    const tick = setInterval(() => {
      if (!recState) return clearInterval(tick);
      secs++;
      $('#recTime').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      if (secs >= 300) { clearInterval(tick); stopRecording(false); }  // max 5 Min
    }, 1000);
    $('#recTime').textContent = '0:00';
  } catch (e) {
    toast('💔', 'Mikrofon verweigert', e.message || 'Zugriff nicht erlaubt');
  }
}
function stopRecording(cancelled) {
  if (!recState) return;
  recState.cancelled = !!cancelled;
  try { recState.mr.stop(); } catch (e) {}
}

/* 📍 Standort */
function pickLocation() {
  attPop(false);
  if (!navigator.geolocation) return toast('💔', 'Kein Standort', 'Dein Browser kann das nicht');
  toast('📍', 'Standort wird gesucht…', '');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = +pos.coords.latitude.toFixed(5);
    const lng = +pos.coords.longitude.toFixed(5);
    await sendAttachment('location', { lat, lng, name: 'Mein Standort', mime: 'geo/point' });
    toast('📍', 'Standort gesendet', lat + ', ' + lng);
  }, (err) => {
    toast('💔', 'Standort nicht verfügbar', err.message || 'Zugriff verweigert');
  }, { timeout: 12000, maximumAge: 60000 });
}

/* 👤 Kontakt (vCard) */
async function pickContact() {
  attPop(false);
  const people = [];
  const seen = new Set();
  for (const d of Object.values(S.details)) {
    for (const m of d.members || []) {
      if (m.id === S.user.id || seen.has(m.id)) continue;
      seen.add(m.id);
      people.push(m);
    }
  }
  if (!people.length) return toast('💔', 'Keine Kontakte', 'Öffne zuerst einen Chat');
  openModal(`<div class="mTitle">Kontakt senden 👤</div>
    <div style="max-height:320px;overflow:auto">
    ${people.map((u) => `<div class="devRow" data-u="${u.id}">
      <div class="cav">${avatarHtml(u.avatar)}</div>
      <div class="devInfo"><b>${esc(u.displayName)}</b><span>@${esc(u.username || '?')}${u.phone ? ' · ' + esc(u.phone) : ''}</span></div>
      <button class="devKill">Senden</button>
    </div>`).join('')}
    </div>`);
  $$('.devRow[data-u]').forEach((row) => {
    row.querySelector('.devKill').onclick = async () => {
      const u = people.find((x) => x.id === row.dataset.u);
      const vcf = 'BEGIN:VCARD\nVERSION:3.0\nFN:' + (u.displayName || '') + '\nNICKNAME:' + (u.username || '') +
        (u.phone ? '\nTEL:' + u.phone : '') + '\nEND:VCARD';
      await sendAttachment('contact', {
        url: 'data:text/vcard;base64,' + btoa(unescape(encodeURIComponent(vcf))),
        name: u.displayName || 'Kontakt', mime: 'text/vcard', size: vcf.length,
        vname: u.displayName || '', vuser: u.username || '', vphone: u.phone || '', vavatar: u.avatar || '💗',
      });
      closeModal();
    };
  });
}

/* 🎁 GIF-Auswahl */
function pickGif() {
  attPop(false);
  openModal2(`<div class="mTitle">GIFs 🎁</div>
    <p style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:8px">16 animierte Liebe-GIFs — antippen und losschicken 💗</p>
    <div class="gifGrid">
      ${GIF_PACK.map((g) => `<div class="gifTile" data-g="${g.id}" title="${esc(g.n)}"><img src="/gifs/${g.id}.gif" alt="${esc(g.n)}" loading="lazy"></div>`).join('')}
    </div>`);
  $$('.gifTile').forEach((t) => {
    t.onclick = async () => {
      const id = t.dataset.g;
      try {
        const r = await fetch('/gifs/' + id + '.gif');
        const blob = await r.blob();
        const url = await fileDataUrl(blob);
        await sendAttachment('gif', { url, name: id + '.gif', mime: 'image/gif', size: blob.size });
        closeModal();
      } catch (e) { toast('💔', 'GIF fehlgeschlagen', e.message); }
    };
  });
}

/* 🔥 Einmal-Medium öffnen (nur der Empfänger, nur einmal) */
function openViewOnce(msg, chatId) {
  const att = msg.attachment || {};
  const src = att.url || msg.image;
  if (!src) return toast('🔥', 'Schon weg', 'Dieses Einmal-Medium gibt es nicht mehr');
  const ov = document.createElement('div');
  ov.id = 'viewOnceView';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(20,6,18,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px';
  ov.innerHTML = `<div style="color:#ffb7e2;font-weight:900;font-size:13px">🔥 Einmalansicht — schließt für immer</div>
    <img src="${src}" style="max-width:92vw;max-height:72vh;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.6)">
    <button id="voClose" style="background:linear-gradient(135deg,#ff8fd0,#c0359b);border:none;color:#fff;font-weight:900;padding:12px 26px;border-radius:16px;font-size:14px;cursor:pointer;font-family:inherit">Gesehen — löschen 🔥</button>`;
  document.body.appendChild(ov);
  $('#voClose').onclick = async () => {
    ov.remove();
    try {
      await api(`/chats/${chatId}/messages/${msg.id}/view-once`, { method: 'POST' });
      toast('🔥', 'Sicher gelöscht', 'Der Inhalt ist jetzt weg');
    } catch (e) { toast('💔', 'Löschen fehlgeschlagen', e.message); }
  };
}

/* 🎧 Sprachnachricht abspielen */
function playVoice(m, btn) {
  const att = m.attachment || {};
  if (!S._voiceAudio || S._voiceAudio.src !== att.url) {
    S._voiceAudio = new Audio(att.url);
  }
  const a = S._voiceAudio;
  a.playbackRate = S.voiceRate || 1;
  const wrap = btn.closest('.voiceWrap');
  const paint = () => {
    const p = a.duration ? a.currentTime / a.duration : 0;
    const bars = wrap.querySelectorAll('.voiceBars i');
    bars.forEach((b, i) => b.classList.toggle('on', i / bars.length <= p));
    wrap.querySelector('.voiceDur').textContent = fmtDur(Math.max(0, (a.duration || att.duration || 0) - a.currentTime));
  };
  if (a.paused) {
    a.play().then(() => {
      btn.textContent = '⏸';
      a.ontimeupdate = paint;
      a.onended = () => { btn.textContent = '▶'; a.currentTime = 0; paint(); };
    }).catch(() => toast('💔', 'Abspielen fehlgeschlagen', ''));
  } else { a.pause(); btn.textContent = '▶'; }
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

function markRead() {
  const id = S.activeChat;
  if (!id) return;
  const c = S.chats.find((x) => x.id === id);
  if (c) { c.unread = 0; renderChatList(); }
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ type: 'chat:open', chatId: id }));
  else api(`/chats/${id}/read`, { method: 'POST' }).catch(() => {});
}

/* ---------- WebSocket ---------- */
function connectWS() {
  if (S.ws && (S.ws.readyState === 1 || S.ws.readyState === 0)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(S.token)}`);
  S.ws = ws;
  ws.onopen = () => {
    S.wsRetry = 0;
    setInterval(() => { try { ws.readyState === 1 && ws.send(JSON.stringify({ type: 'ping' })); } catch {} }, 25000);
  };
  ws.onmessage = (ev) => {
    let d; try { d = JSON.parse(ev.data); } catch { return; }
    wsHandle(d);
  };
  ws.onclose = () => {
    const delay = Math.min(30000, 1000 * Math.pow(2, S.wsRetry++));
    setTimeout(async () => {
      try { const m = await api('/me'); S.user = m.user; S.chats = m.chats; renderChatList(); renderMyAvatar(); } catch {}
      if ($('#appScreen') !== null && !$('#appScreen').classList.contains('hidden')) connectWS();
    }, delay);
  };
}
function wsHandle(d) {
  switch (d.type) {
    case 'hello':
      d.online.forEach((id) => S.online.add(id));
      renderChatList(); renderSub();
      break;
    case 'message:new': {
      const m = d.message;
      const chatId = d.chatId || m.chatId;
      const c = S.chats.find((x) => x.id === chatId);
      if (!c) return;
      const cache = S.messages[chatId];
      if (cache) {
        if (cache.some((x) => x.id === m.id)) return;
        cache.push(m);
        if (chatId === S.activeChat) appendMsg(m, chatId);
      }
      if (chatId === S.activeChat) {
        if (m.senderId === S.user.id) markRead();
      } else {
        c.unread = (c.unread || 0) + 1;
        const dm = S.details[chatId];
        const sender = dm && dm.members.find((x) => x.id === m.senderId);
        toast(c.type === 'private' ? '💬' : typeIco(c.type) || '💬', (c.type === 'private' ? c.name : c.name) + (sender && c.type !== 'private' ? ' · ' + sender.displayName : ''), m.text || (m.attachment && m.attachment.viewOnce ? '🔥 Einmal-Foto' : m.kind === 'voice' ? '🎙️ Sprachnachricht' : m.kind === 'video' ? '🎞️ Video' : m.kind === 'location' ? '📍 Standort' : '📎 Anhang'), 2800);
        const muted = (c.mutedUntil || 0) > Date.now();
        if (!muted) beep(soundForChat(chatId));   // 🔔 V4.19: eigener Ton pro Chat
      }
      renderChatList();
      if (m.chatId === S.activeChat && m.senderId === S.user.id) markRead();
      break;
    }
    case 'chat:updated': upsertSummary(d.summary); if (S.activeChat === d.summary.id) renderSub(); renderChatList(); break;
    case 'chat:created':
      upsertSummary(d.summary);
      renderChatList();
      if (d.summary.id !== S.activeChat) toast(typeIco(d.summary.type) || '💬', 'Neuer Chat', d.summary.name, 2600);
      break;
    case 'chat:deleted':
      S.chats = S.chats.filter((c) => c.id !== d.chatId);
      delete S.details[d.chatId]; delete S.messages[d.chatId];
      if (S.activeChat === d.chatId) closeChat();
      renderChatList();
      toast('🗑️', 'Chat gelöscht', '', 2200);
      break;
    case 'messages:read': {
      const msgs = S.messages[d.chatId];
      if (msgs) {
        msgs.forEach((m) => { if (m.senderId === S.user.id && m.createdAt <= d.upTo && !m.readBy.includes(d.userId)) m.readBy.push(d.userId); });
        if (d.chatId === S.activeChat) renderMessages(d.chatId, false);
      }
      break;
    }
    case 'chat:wallpaper': {
      const cs = S.chats.find((x) => x.id === d.chatId);
      if (cs) cs.wallpaper = d.personal || d.wallpaper || null;
      if (d.chatId === S.activeChat) applyTheme();
      break;
    }
    // 🌸 jemand hat einen Status gepostet oder reagiert
    case 'moment:new':
    case 'moment:reaction': {
      loadStatus();
      break;
    }
    case 'message:updated': {
      const msgs = S.messages[d.chatId];
      if (msgs) {
        const i = msgs.findIndex((m) => m.id === d.message.id);
        if (i >= 0) msgs[i] = d.message;
        if (d.chatId === S.activeChat) renderMessages(d.chatId, false);
      }
      break;
    }
    case 'reaction:new': {
      const msgs = S.messages[d.chatId];
      if (msgs) {
        const i = msgs.findIndex((m) => m.id === d.message.id);
        if (i >= 0) msgs[i] = d.message;
        if (d.chatId === S.activeChat) renderMessages(d.chatId, false);
      }
      break;
    }
    case 'member:added': {
      const dm = S.details[d.chatId];
      if (dm && !dm.members.some((m) => m.id === d.userId)) dm.members.push({ id: d.userId, displayName: d.name, online: false });
      if (S.activeChat === d.chatId) { renderSub(); sysNote(`${d.name} wurde hinzugefügt 💗`); }
      toast('👋', 'Neues Mitglied', `${d.name} ist jetzt dabei`, 2500);
      break;
    }
    case 'presence':
      if (d.online) S.online.add(d.userId); else S.online.delete(d.userId);
      renderChatList(); renderSub();
      break;
    case 'typing': {
      S.typingName = d.name;
      S.typingTimers[d.chatId] = setTimeout(() => { S.typingTimers[d.chatId] = null; S.typingName = null; renderSub(); }, 3000);
      if (d.chatId === S.activeChat) renderSub();
      break;
    }
    case 'profile:updated': {
      S.chats.forEach((c) => {
        if (c.type === 'private' && c.members.includes(d.user.id)) { c.name = d.user.displayName; c.avatar = d.user.avatar || '💗'; }
      });
      const dm = S.details[S.activeChat];
      if (dm) dm.members = dm.members.map((m) => (m.id === d.user.id ? { ...m, ...d.user } : m));
      renderChatList(); renderSub();
      break;
    }
    case 'account:blocked':
    case 'account:kicked': {
      try { S.token = ''; localStorage.removeItem('lc_token'); } catch (e) {}
      try { S.ws && S.ws.close(); } catch (e) {}
      $('#appScreen').classList.add('hidden');
      $('#authScreen').classList.remove('hidden');
      if (d.ban) showBanScreen(d.ban, { login: localStorage.getItem('lc_lastlogin') || '' });
      else {
        // Konto wurde entfernt/gesperrt → nochmal nachfragen, was los ist
        api('/me').catch(() => {});
        toast('🚫', 'Dein Konto wurde gesperrt', d.message || 'Du kannst einen Einspruch einlegen', 7000);
        setTimeout(() => { if (S.token === '') location.reload(); }, 7000);
      }
      break;
    }
    case 'appeal:new': {
      if (isStaff()) toast('💌', 'Neuer Einspruch', '@' + (d.appeal ? d.appeal.username : '') + ' bittet um Entsperrung', 6000);
      break;
    }
    case 'moderation': {
      const m = {
        warn: '⚠️ Du wurdest verwarnt',
        mute: '🔇 Du wurdest stummgeschaltet',
        futureban: '🕒 Eine Sperre wurde für dich geplant',
        permaban: '🚫 Dein Konto wurde gesperrt',
      }[d.action];
      if (m) toast('🛡️', m, d.reason || '', 6000);
      break;
    }
  }
}

/* ================= MODALS ================= */
function openModal(html) {
  $('#modalRoot').innerHTML = `<div class="mback"><div class="mcard"><button class="mClose">✕</button>${html}</div></div>`;
  $('#modalRoot').classList.add('show');
  $('#modalRoot .mClose').onclick = closeModal;
  $('#modalRoot .mback').onclick = (e) => { if (e.target === e.currentTarget) closeModal(); };
}
/* Breite Variante (z. B. GIF-Raster) */
function openModal2(html, cls) {
  openModal(html);
  const card = $('#modalRoot .mcard');
  if (card && cls) card.classList.add(cls);
}
function closeModal() { $('#modalRoot').classList.remove('show'); $('#modalRoot').innerHTML = ''; }
function confirmBox(title, text, cb, danger) {
  openModal(`<div class="mTitle">${esc(title)}</div>
    <p style="font-size:14px;color:var(--muted);font-weight:600;text-align:center;margin-bottom:14px">${esc(text)}</p>
    <button class="btnSoft" id="cfNo">Abbrechen</button>
    <button class="${danger ? 'btnDanger' : 'btnMain'}" id="cfYes">${danger ? 'Ja, löschen' : 'Ja, okay'}</button>`);
  $('#cfNo').onclick = closeModal;
  $('#cfYes').onclick = () => { closeModal(); cb(); };
}

/* Neuer Chat */
function modalNewChat() {
  openModal(`<div class="mTitle">Neu starten 🎀</div>
  <div class="optGrid">
    <div class="optTile" data-t="private"><span class="big">💬</span>Private Nachricht</div>
    <div class="optTile" data-t="group"><span class="big">👥</span>Gruppe</div>
    <div class="optTile" data-t="community"><span class="big">🏰</span>Community</div>
    <div class="optTile" data-t="channel"><span class="big">📢</span>Kanal</div>
  </div>
  <p style="font-size:12px;color:var(--muted);font-weight:600;text-align:center">💡 Kanäle sind öffentlich — jeder kann sie sich suchen & beitreten.<br>Communities haben eigene Untergruppen.</p>`);
  $$('.optTile').forEach((t) => (t.onclick = () => {
    // 🏰 V4.21: Communities haben eine eigene Übersicht (meine + entdecken),
    // nicht nur "anlegen". Sonst findet man nie wieder eine Community.
    if (t.dataset.t === 'community') return modalCommunities();
    return t.dataset.t === 'private' ? modalPrivateSearch() : modalCreate(t.dataset.t);
  }));
  // Zweiter Weg dorthin: eigener Knopf unten im Dialog
  const extra = document.createElement('button');
  extra.className = 'btnSoft';
  extra.style.marginTop = '10px';
  extra.id = 'openComms';
  extra.textContent = '🏰 Meine Communities';
  $('#modalRoot .mcard').appendChild(extra);
  extra.onclick = () => modalCommunities();
}

/* Private Suche */
async function modalPrivateSearch() {
  openModal(`<div class="mTitle">Private Nachricht 💬</div>
  <div class="field"><input id="mSearchInput" placeholder="Benutzername oder Name suchen… (min. 2 Zeichen)"></div>
  <div id="mSearchRes"><p style="text-align:center;color:var(--muted);font-weight:600;font-size:13px;padding:20px">Suche nach @Benutzernamen 💗</p></div>`);
  const inp = $('#mSearchInput');
  inp.focus();
  let timer;
  inp.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = inp.value.trim();
      if (q.length < 2) return;
      try {
        const d = await api('/search?q=' + encodeURIComponent(q));
        let html = '';
        d.users.forEach((u) => {
          html += `<div class="mRow" data-id="${u.id}" data-k="u"><div class="cav">${avatarHtml(u.avatar)}</div><div class="info"><b>${esc(u.displayName)}</b><span>@${esc(u.username)} ${u.online ? '· online 💗' : ''}</span></div><span class="act">Chatten</span></div>`;
        });
        d.channels.forEach((c) => {
          html += `<div class="mRow" data-id="${c.id}" data-k="c"><div class="cav">${avatarHtml(c.avatar)}</div><div class="info"><b>📢 ${esc(c.name)}</b><span>Kanal · ${c.count} Abonnenten</span></div><span class="act">Beitreten</span></div>`;
        });
        $('#mSearchRes').innerHTML = html || '<p style="text-align:center;color:var(--muted);font-weight:600;font-size:13px;padding:16px">Nichts gefunden 💔</p>';
        $$('#mSearchRes .mRow').forEach((r) => (r.onclick = async () => {
          try {
            if (r.dataset.k === 'u') {
              const d2 = await api('/chats', { method: 'POST', body: { type: 'private', userId: r.dataset.id } });
              closeModal();
              openChat(d2.summary.id);
            } else {
              const d2 = await api(`/chats/${r.dataset.id}/join`, { method: 'POST' });
              closeModal();
              openChat(d2.summary.id);
            }
          } catch (e) { toast('💔', 'Fehler', e.message); }
        }));
      } catch {}
    }, 300);
  };
}

/* Chat anlegen */
function modalCreate(type) {
  const titles = { group: 'Neue Gruppe 👥', community: 'Neue Community 🏰', channel: 'Neuer Kanal 📢' };
  const hints = {
    group: 'Alle Mitglieder können schreiben & Fotos teilen.',
    community: 'Dein Zuhause mit eigenen Untergruppen — perfekt für eine große Crew.',
    channel: 'Öffentlich: Nur du schreibst, alle anderen folgen. Jeder kann ihn sich suchen.',
  };
  let picked = new Set();
  openModal(`<div class="mTitle">${titles[type]}</div>
  <p style="font-size:12.5px;color:var(--muted);font-weight:600;margin-bottom:12px">${hints[type]}</p>
  <div class="field"><label>Name</label><input id="cName" maxlength="40" placeholder="z. B. Maxichens World 💗"></div>
  <div class="field"><label>Beschreibung (optional)</label><input id="cDesc" maxlength="200" placeholder="Worum geht's?"></div>
  <div class="field"><label>Avatar</label><div class="avatarPick" id="cAvatars"></div></div>
  ${type !== 'channel' ? `<div class="field"><label>Mitglieder (optional — du kannst später noch Leute einladen)</label><input id="cSearch" placeholder="Nutzer suchen…"></div><div id="cSearchRes"></div>` : ''}
  <button class="btnMain" id="cCreate">${type === 'channel' ? 'Kanal erstellen 📢' : type === 'community' ? 'Community erstellen 🏰' : 'Gruppe erstellen 👥'}</button>`);
  let cAv = type === 'channel' ? '📢' : type === 'community' ? '🏰' : '💗';
  const abox = $('#cAvatars');
  const avs = type === 'channel' ? ['📢','','🌸','✨','🎵','💗','🦋',''] : AVATAR_EMOJIS;
  avs.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = e;
    if (e === cAv) b.classList.add('on');
    b.onclick = () => { cAv = e; abox.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); };
    abox.appendChild(b);
  });
  let stimer;
  const cSearch = $('#cSearch');
  if (cSearch) {
    cSearch.oninput = () => {
      clearTimeout(stimer);
      stimer = setTimeout(async () => {
        const q = cSearch.value.trim();
        if (q.length < 2) return;
        try {
          const d = await api('/search?q=' + encodeURIComponent(q));
          $('#cSearchRes').innerHTML = d.users
            .map((u) => `<div class="mRow" data-id="${u.id}"><div class="cav">${avatarHtml(u.avatar)}</div><div class="info"><b>${esc(u.displayName)}</b><span>@${esc(u.username)}</span></div><span class="act" style="background:${picked.has(u.id) ? 'var(--grad)' : '#e5c3d4'};color:${picked.has(u.id) ? '#fff' : 'var(--muted)'}">${picked.has(u.id) ? '✓ drin' : '+ Add'}</span></div>`)
            .join('') || '<p style="text-align:center;color:var(--muted);font-weight:600;font-size:13px;padding:14px">Nichts gefunden 💔</p>';
          $$('#cSearchRes .mRow').forEach((r) => (r.onclick = () => {
            const id = r.dataset.id;
            if (picked.has(id)) picked.delete(id); else picked.add(id);
            modalCreate(type); cSearch.value = q; cSearch.focus();
          }));
        } catch {}
      }, 300);
    };
  }
  $('#cCreate').onclick = async () => {
    const name = $('#cName').value.trim();
    if (name.length < 2) { toast('💗', 'Noch keinen Namen', 'Gib mindestens 2 Zeichen ein'); return; }
    try {
      const d = await api('/chats', {
        method: 'POST',
        body: { type, name, description: $('#cDesc').value.trim(), avatar: cAv, memberIds: [...picked] },
      });
      closeModal();
      toast('🎉', 'Erstellt!', name, 2400);
      openChat(d.summary.id);
    } catch (e) { toast('💔', 'Fehler', e.message); }
  };
}

/* Profil */
function modalProfile() {
  const u = S.user;
  openModal(`<div class="mTitle">Mein Profil ${S.user.vip ? '<span class="vipBadge">👑 VIP</span>' : '👑'}</div>
  <div style="text-align:center;margin-bottom:14px">
    <div style="width:84px;height:84px;margin:0 auto;border-radius:50%;background:var(--pink-pale);display:flex;align-items:center;justify-content:center;font-size:42px;overflow:hidden;border:3px solid #fff;box-shadow:var(--shadow)">${u.avatar && u.avatar.startsWith('data:image/') ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover">` : esc(u.avatar || '💗')}</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
      <button class="btnSoft" style="width:auto;margin:0;padding:8px 14px" id="pAvEmoji">😊 Emoji</button>
      <button class="btnSoft" style="width:auto;margin:0;padding:8px 14px" id="pAvUpload">📷 Foto</button>
    </div>
  </div>
  <div class="field"><label>Anzeigename</label><input id="pName" maxlength="30" value="${esc(u.displayName)}"></div>
  <div class="field"><label>Bio</label><input id="pBio" maxlength="120" placeholder="z. B. träume groß, bleib du selbst ✨" value="${esc(u.bio || '')}"></div>
  <div class="field"><label>Telefon</label><input id="pPhone" value="${esc(u.phone || '')}"></div>
  <div class="secTitle">Persönlich 🎨</div>
  <button class="btnSoft" id="pAppearance">🎨 Hintergründe & Töne</button>
  <button class="btnSoft" id="pVip">👑 VIP</button>
  <div class="secTitle">Sicherheit 🔐</div>
  <button class="btnSoft" id="pDevices">💻 Meine Geräte</button>
  <button class="btnSoft" id="pBlocks">🚫 Blockierte</button>
  <div class="field"><label>E-Mail</label><input id="pEmail" value="${esc(u.email || '')}"></div>
  <div class="secTitle">Standard-Hintergrund</div>
  <div class="bgGrid" id="pBgGrid"></div>
  <div class="switchRow"><div><b>Klingelton</b><small>Ton bei neuen Nachrichten</small></div><div class="switch ${u.bgSound === false ? '' : 'on'}" id="pSound"></div></div>
  <p style="font-size:11px;color:var(--muted);font-weight:700;margin-top:-4px">Ton, Lautstärke und Hintergründe findest du unter 🎨 Hintergründe &amp; Töne.</p>
  ${window.__lcInstall ? '<button class="btnMain" style="margin-top:12px" id="pInstall">📲 App installieren</button>' : ''}
  <button class="btnDanger" id="pLogout">Abmelden</button>`);
  const curBg = (u.bg && u.bg.default) || 'pink-dream';
  let pBg = curBg;
  const grid = $('#pBgGrid');
  THEMES.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'bgTile bg-' + t.id + (t.id === curBg ? ' on' : '');
    el.innerHTML = `<span>${t.name}</span>`;
    el.onclick = () => { pBg = t.id; grid.querySelectorAll('.bgTile').forEach((x) => x.classList.remove('on')); el.classList.add('on'); };
    grid.appendChild(el);
  });
  let soundOn = u.bgSound !== false;
  $('#pSound').onclick = (e) => { soundOn = !soundOn; e.currentTarget.classList.toggle('on', soundOn); };
  // (Ton-Einstellungen sind V4.19 im Aussehen-Panel — nicht doppelt binden)
  $('#pAppearance').onclick = () => modalAppearance();
  $('#pVip').onclick = openVip;
  $('#pDevices').onclick = modalDevices;
  $('#pBlocks').onclick = modalBlocks;
  $('#pAvEmoji').onclick = async () => {
    const av = prompt('Emoji-Avatar (1–2 Zeichen):', u.avatar || '💗');
    if (av === null) return;
    const a = av.trim().slice(0, 8) || '💗';
    try { const d = await api('/me', { method: 'PUT', body: { avatar: a } }); S.user = d.user; renderMyAvatar(); modalProfile(); } catch (e) { toast('💔', 'Fehler', e.message); }
  };
  $('#pAvUpload').onclick = () => $('#fileAvatar').click();
  const ob = document.createElement('div');
  ob.style.marginTop = '12px';
  ownerBoxHtml().then((h) => {
    const extra = isStaff()
      ? (myRole() !== 'owner' ? '<button class="btnMain" style="margin:0 0 8px" id="pTeam">🛡️ Team-Zentrale öffnen</button>' : '')
        + '<a href="/anleitung" target="_blank" rel="noopener" style="display:block;text-align:center;padding:11px;border-radius:14px;background:#fff3fa;border:2px solid var(--line);color:var(--lila-dark);font-weight:800;font-size:13px;text-decoration:none;margin:0 0 10px">📖 Anleitung für Owner & Team</a>'
      : '';
    ob.innerHTML = extra + h;
    wireOwnerBox();
    const t = $('#pTeam');
    if (t) t.onclick = () => { closeModal(); openModPanel(); };
  }).catch(() => {});
  $('#pLogout').onclick = async () => {
    try { await api('/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('lc_token');
    location.reload();
  };
  if (window.__lcInstall) $('#pInstall').onclick = () => window.__lcInstall();
  // ⚠️ Hier stand früher `$('#btnMyProfile').onclick = null;` — der Kommentar
  // sagte „wird unten neu gesetzt", aber das passierte nie. Folge: nach dem
  // ersten Öffnen des Profils war der Avatar-Button tot (kein zweites Öffnen
  // ohne Neuladen). V4.18: Handler bleibt einfach stehen.
  // Speichern
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btnMain'; saveBtn.style.marginTop = '12px'; saveBtn.textContent = 'Speichern 💾';
  saveBtn.onclick = async () => {
    try {
      const d = await api('/me', { method: 'PUT', body: { displayName: $('#pName').value, bio: $('#pBio').value, phone: $('#pPhone').value, email: $('#pEmail').value, bgTheme: pBg, bgSound: soundOn } });
      S.user = d.user;
      renderMyAvatar(); applyTheme();
      closeModal();
      toast('💗', 'Gespeichert!', 'Profil aktualisiert ✨');
    } catch (e) { toast('💔', 'Fehler', e.message); }
  };
  document.querySelector('.mcard').appendChild(saveBtn);
  document.querySelector('.mcard').appendChild(ob);
}

/* Chat-Einstellungen */

/* =====================================================================
 *  🏰 V4.21 — Communities
 *  Eine Ansicht, die zeigt: meine Communities (mit Untergruppen) und
 *  solche, die ich noch nicht habe. Anlegen in einem Schritt.
 * ===================================================================== */
async function modalCommunities() {
  let data;
  try { data = await api('/communities'); }
  catch (e) { return toast('💔', 'Fehler', e.message); }

  const cardC = (c) => `<div class="commCard">
    <div class="cav" style="width:52px;height:52px;font-size:26px">${avatarHtml(c.avatar)}</div>
    <div class="info">
      <b>${esc(c.name)}</b>
      <span>${c.groupCount} Gruppen · ${c.memberCount} Mitglieder</span>
      ${c.description ? `<p style="font-size:12px;color:var(--muted);font-weight:600;margin:4px 0 0">${esc(c.description)}</p>` : ''}
    </div>
    ${c.isMember ? '<span class="roleBadge">' + (c.myRole === 'owner' ? '👑' : c.myRole === 'admin' ? '🛡️' : '✓') + '</span>' : ''}
  </div>`;

  openModal(`<div class="mTitle">Communities 🏰</div>
    <div class="secTitle">Meine (${data.mine.length})</div>
    <div id="commMine">${data.mine.map(cardC).join('') || '<p style="font-size:12.5px;color:var(--muted);font-weight:600">Noch keine — leg unten die erste an 💗</p>'}</div>
    <div class="secTitle">Entdecken (${data.discover.length})</div>
    <div id="commDiscover">${data.discover.map(cardC).join('') || '<p style="font-size:12.5px;color:var(--muted);font-weight:600">Nichts Neues gerade.</p>'}</div>
    <button class="btnMain" id="commNew">+ Community anlegen</button>`);

  const openComm = async (id) => { closeModal(); openChat(id); };
  $$('#commMine .commCard').forEach((el, i) => (el.onclick = () => openComm(data.mine[i].id)));

  $('#commNew').onclick = async () => {
    const name = prompt('Name der Community:', 'Meine Community 🏰');
    if (!name || name.trim().length < 2) return;
    const description = (prompt('Beschreibung (optional):', '') || '').trim();
    const groupsRaw = prompt('Gruppen (mit Komma getrennt):', 'Allgemein, Plauderecke') || '';
    const groups = groupsRaw.split(',').map((g) => g.trim()).filter((g) => g.length >= 2);
    try {
      const r = await api('/communities', { method: 'POST', body: { name: name.trim(), description, groups } });
      // ❗ Die 'chat:created'-Ereignisse des Servers erzeugen pro Gruppe einen
      // eigenen „Neuer Chat"-Toast — bei 4 Gruppen sind das 4 Stapel über dem
      // Bildschirm. Deshalb einmal aufräumen und EINE Meldung zeigen.
      document.querySelectorAll('.toast').forEach((t) => t.remove());
      toast('🏰', 'Community erstellt', `${r.groups.length} Gruppen angelegt`, 2400);
      closeModal();
      openChat(r.community.id);
    } catch (e) { toast('💔', 'Fehler', e.message); }
  };
}

/* Wie komme ich da hin? Über den Chat-Menü-Knopf im Header. */

function modalChatSettings() {
  const d = S.details[S.activeChat];
  if (!d) return;
  const c = d.chat;
  const csum = S.chats.find((x) => x.id === c.id);
  const me = S.user.id;
  const admin = isMeAdmin(c.id);
  const myTheme = (csum && csum.bg) || (S.user.bg && S.user.bg.default) || 'pink-dream';
  openModal(`<div class="mTitle">${esc(c.name)}</div>
  ${c.type !== 'private' ? `<div class="secTitle">Beschreibung</div>
  <p id="csDescText" style="font-size:13.5px;font-weight:600;color:var(--muted);margin-bottom:4px">${esc(c.description || '— keine —')}</p>
  ${admin ? '<button class="btnSoft" id="csDescEdit">✏️ Name & Beschreibung bearbeiten</button>' : ''}
  ${admin && c.type === 'group' ? `<div class="csRow" style="margin-top:10px">
    <label>📢 Ankündigungen <span style="font-weight:600;color:var(--muted)">(nur Verwalter schreiben)</span></label>
    <input type="checkbox" id="csAnnounce" ${c.announce ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--pink)">
  </div>` : ''}
  ${c.type === 'channel' ? '<p style="font-size:11.5px;color:var(--muted);font-weight:600">📢 Kanäle sind immer Ankündigungen — hier schreibt nur der Inhaber.</p>' : ''}` : ''}
  <div class="secTitle">Chat-Hintergrund 🎨</div>
  <div class="bgGrid" id="csBgGrid"></div>
  <p style="font-size:11px;color:var(--muted);font-weight:600;margin-top:6px">Gilt nur für dich. „Reset“ = dein Standard aus dem Profil.</p>
  ${c.type !== 'private' ? `
  <div class="secTitle">Mitglieder (${d.members.length})</div>
  <div id="csMembers" style="max-height:220px;overflow-y:auto">
  ${d.members.map((m) => {
    const isOwn = m.id === c.ownerId;
    const isAdm = (c.adminIds || []).includes(m.id);
    const iAmOwner = c.ownerId === me;
    const canKick = admin && !isOwn && m.id !== me && (!isAdm || iAmOwner);
    const canRole = admin && !isOwn && m.id !== me && (!isAdm || iAmOwner);
    const badge = isOwn ? '<span class="crown">👑 Inhaber</span>' : isAdm ? '<span class="roleBadge">🛡️ Verwalter</span>' : '';
    return `<div class="mRow" style="cursor:default">
      <div class="cav">${avatarHtml(m.avatar)}</div>
      <div class="info"><b>${esc(m.displayName)} ${badge}</b><span>@${esc(m.username || '?')} ${m.online ? '· online 💗' : ''}</span></div>
      ${canRole ? `<button class="miniBtn" data-promote="${m.id}" data-on="${isAdm ? '0' : '1'}" title="${isAdm ? 'Verwalter entziehen' : 'Zum Verwalter machen'}">${isAdm ? '⬇️' : '🛡️'}</button>` : ''}
      ${canKick ? `<button class="miniBtn danger" data-kick="${m.id}" title="Aus dem Chat entfernen">🚪</button>` : ''}
    </div>`;
  }).join('')}
  </div>
  ${admin && c.type !== 'channel' ? '<button class="btnSoft" id="csAdd">+ Mitglied hinzufügen</button>' : ''}
  ${c.type === 'community' ? `
  <div class="secTitle">Gruppen in dieser Community</div>
  <div id="csGroups">${(d.groups || []).map((g) => `<div class="mRow" data-g="${g.id}"><div class="cav">${avatarHtml(g.avatar)}</div><div class="info"><b>${esc(g.name)}</b><span>${g.count} Mitglieder</span></div></div>`).join('') || '<p style="font-size:12.5px;color:var(--muted);font-weight:600">Noch keine Gruppen — lege die erste an! 💗</p>'}</div>
  ${admin ? '<button class="btnSoft" id="csNewGroup">+ Gruppe anlegen</button>' : ''}` : ''}` : ''}
  <div class="secTitle">Nachrichten ⏱️</div>
  <div class="csRow">
    <label>Selbst löschen nach</label>
    <select id="csAutoDelete">
      <option value="0">Aus</option>
      <option value="86400">24 Stunden</option>
      <option value="604800">7 Tage</option>
      <option value="7776000">90 Tage</option>
      <option value="2592000">30 Tage</option>
    </select>
  </div>
  <p style="font-size:11px;color:var(--muted);font-weight:600;margin:-2px 0 8px">${admin || c.type === 'private' ? 'Nachrichten verschwinden für ALLE nach dieser Zeit.' : 'Nur Verwalter können das einstellen.'}</p>

  <div class="secTitle">Dieser Chat 📁</div>
  <button class="btnSoft" id="csArchive">${(csum && csum.archived) || c.archived ? '📤 Aus dem Archiv holen' : '📥 Archivieren'}</button>
  <button class="btnSoft" id="csExport">⬇️ Chat exportieren (JSON)</button>
  ${c.type !== 'private' ? '<button class="btnSoft" id="csInvite">🔗 Einladungslink</button>' : ''}

  <div class="secTitle">Gefahrzone</div>
  ${c.type !== 'private' && c.ownerId !== me ? '<button class="btnSoft" id="csLeave">Chat verlassen</button>' : ''}
  ${admin ? '<button class="btnDanger" id="csDelete">Chat für mich/sie löschen</button>' : ''}`);

  const grid = $('#csBgGrid');
  THEMES.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'bgTile bg-' + t.id + (t.id === myTheme ? ' on' : '');
    el.innerHTML = `<span>${t.name}</span>`;
    el.onclick = async () => {
      try {
        await api(`/chats/${c.id}/background`, { method: 'PUT', body: { theme: t.id } });
        const cs = S.chats.find((x) => x.id === c.id);
        if (cs) cs.bg = t.id;
        grid.querySelectorAll('.bgTile').forEach((x) => x.classList.remove('on'));
        el.classList.add('on');
        applyTheme();
      } catch (e) { toast('💔', 'Fehler', e.message); }
    };
    grid.appendChild(el);
  });
  // 🖼️ V3-Presets (synchron mit der App)
  const v3Head = document.createElement('div');
  v3Head.className = 'secTitle';
  v3Head.textContent = 'App-Presets (auch in der App)';
  $('#csBgGrid').parentNode.insertBefore(v3Head, $('#csBgGrid'));
  Object.entries(V3_PRESETS).forEach(([id, css]) => {
    const el = document.createElement('div');
    el.className = 'bgTile';
    el.style.cssText = 'background:' + css + ';display:flex;align-items:flex-end;justify-content:center';
    el.innerHTML = '<span style="color:#fff;font-size:9.5px;font-weight:800">' + id + '</span>';
    if (c.wallpaper && c.wallpaper.type === 'preset' && c.wallpaper.value === id) el.classList.add('on');
    el.onclick = async () => {
      try {
        const r = await api(`/chats/${c.id}/wallpaper`, { method: 'POST', body: { type: 'preset', value: id } });
        const cs = S.chats.find((x) => x.id === c.id);
        if (cs) cs.wallpaper = r.wallpaper;
        grid.querySelectorAll('.bgTile').forEach((x) => x.classList.remove('on'));
        el.classList.add('on');
        applyTheme();
        toast('🎨', 'Hintergrund gesetzt', id + ' — gilt auch in der App 💗');
      } catch (e) { toast('💔', 'Fehler', e.message); }
    };
    grid.appendChild(el);
  });
  // 📷 Eigenes Foto als Wallpaper (V2)
  const custom = document.createElement('div');
  custom.className = 'bgTile';
  custom.style.cssText = 'background:#2a2a4e;display:flex;align-items:center;justify-content:center';
  custom.innerHTML = '<span style="color:#ff7edb;font-size:10.5px">📷 Eigenes</span>';
  if (typeof myTheme === 'string' && myTheme.startsWith('custom:')) custom.classList.add('on');
  custom.onclick = () => pickWallpaper(c.id, grid, custom);
  grid.appendChild(custom);

  const reset = document.createElement('div');
  reset.className = 'bgTile' + (myTheme !== myTheme ? '' : '');
  reset.style.background = '#fff0f5'; reset.style.textAlign = 'center'; reset.style.display = 'flex'; reset.style.alignItems = 'center'; reset.style.justifyContent = 'center';
  reset.innerHTML = '<span style="color:#c2255c;font-size:10.5px">Reset ↺</span>';
  reset.onclick = async () => {
    try {
      await api(`/chats/${c.id}/background`, { method: 'PUT', body: { theme: null } });
      const cs = S.chats.find((x) => x.id === c.id);
      if (cs) cs.bg = null;
      grid.querySelectorAll('.bgTile').forEach((x) => x.classList.remove('on'));
      applyTheme();
      toast('💗', 'Hintergrund zurückgesetzt');
    } catch {}
  };
  grid.appendChild(reset);

  const add = $('#csAdd');
  if (add) add.onclick = () => modalAddMember(c.id);

  /* 👑 V4.21 — Rechte: befördern, rauswerfen, beschreiben, ansagen */
  $$('#csMembers [data-kick]').forEach((b) => (b.onclick = async (ev) => {
    ev.stopPropagation();
    const uid = b.dataset.kick;
    const row = d.members.find((m) => m.id === uid);
    if (!confirm(`${row ? row.displayName : 'Dieses Mitglied'} wirklich aus dem Chat entfernen?`)) return;
    b.disabled = true;
    try {
      await api(`/chats/${c.id}/members/${uid}`, { method: 'DELETE' });
      toast('🚪', 'Entfernt', (row ? row.displayName : 'Mitglied') + ' ist raus');
      closeModal();
      modalChatSettings();
    } catch (e) { b.disabled = false; toast('💔', 'Fehler', e.message); }
  }));

  $$('#csMembers [data-promote]').forEach((b) => (b.onclick = async (ev) => {
    ev.stopPropagation();
    const uid = b.dataset.promote;
    const on = b.dataset.on === '1';
    b.disabled = true;
    try {
      await api(`/chats/${c.id}/admins`, { method: 'POST', body: { userId: uid, on } });
      toast(on ? '🛡️' : '⬇️', on ? 'Zum Verwalter gemacht' : 'Verwalter entzogen');
      closeModal();
      modalChatSettings();
    } catch (e) { b.disabled = false; toast('💔', 'Fehler', e.message); }
  }));

  const descBtn = $('#csDescEdit');
  if (descBtn) descBtn.onclick = async () => {
    const name = prompt('Name des Chats:', c.name);
    if (name === null) return;
    const description = prompt('Beschreibung (max. 200 Zeichen):', c.description || '');
    if (description === null) return;
    try {
      const r = await api(`/chats/${c.id}`, { method: 'PUT', body: { name: name.trim(), description } });
      const cs = S.chats.find((x) => x.id === c.id);
      if (cs) { cs.name = r.chat.name; cs.description = r.chat.description; }
      toast('✏️', 'Gespeichert', r.chat.name);
      closeModal();
      modalChatSettings();
    } catch (e) { toast('💔', 'Fehler', e.message); }
  };

  const annBox = $('#csAnnounce');
  if (annBox) annBox.onchange = async () => {
    const on = annBox.checked;
    try {
      const r = await api(`/chats/${c.id}/announce`, { method: 'PUT', body: { on } });
      const cs = S.chats.find((x) => x.id === c.id);
      if (cs) cs.announce = r.announce;
      toast(on ? '📢' : '💬', on ? 'Ankündigungsmodus AN' : 'Ankündigungsmodus AUS',
        on ? 'Nur Verwalter können schreiben' : 'Alle dürfen wieder schreiben');
    } catch (e) { annBox.checked = !on; toast('💔', 'Fehler', e.message); }
  };
  const ng = $('#csNewGroup');
  if (ng) ng.onclick = async () => {
    const name = prompt('Name der neuen Gruppe:', 'Gruppe 💗');
    if (!name || name.trim().length < 2) return;
    const desc = (prompt('Beschreibung (optional):', '') || '').trim();
    try {
      const r = await api(`/chats/${c.id}/groups`, { method: 'POST', body: { name: name.trim(), description: desc } });
      toast('🎉', 'Gruppe erstellt', name, 2200);
      closeModal();
      openChat(r.summary.id);
    } catch (e) { toast('💔', 'Fehler', e.message); }
  };
  $$('#csGroups .mRow').forEach((r) => (r.onclick = () => { closeModal(); openChat(r.dataset.g); }));
  // ⏱️ Selbstlöschende Nachrichten
  const ad = $('#csAutoDelete');
  if (ad) {
    ad.value = String((csum && csum.autoDelete) || c.autoDelete || 0);
    ad.onchange = async () => {
      const sec = parseInt(ad.value, 10) || 0;
      try {
        await api(`/chats/${c.id}/auto-delete`, { method: 'POST', body: { seconds: sec } });
        c.autoDelete = sec;
        toast('⏱️', sec ? 'Selbstlöschung aktiv' : 'Aus', sec ? `Nachrichten verschwinden nach ${sec >= 86400 ? Math.round(sec / 86400) + ' Tagen' : Math.round(sec / 3600) + ' Stunden'}` : 'Nachrichten bleiben');
      } catch (e) { toast('💔', 'Fehler', e.message); ad.value = String(c.autoDelete || 0); }
    };
  }

  // 📥 Archivieren
  const arc = $('#csArchive');
  if (arc) arc.onclick = async () => {
    try {
      // ⚠️ details.chat kennt `archived` NICHT — immer die Summary fragen.
      const sum = S.chats.find((x) => x.id === c.id) || {};
      const r = await api(`/chats/${c.id}/archive`, { method: 'POST', body: { archived: !sum.archived } });
      const cs = S.chats.find((x) => x.id === c.id);
      if (cs) cs.archived = !!(r && r.archived !== undefined ? r.archived : !sum.archived);
      closeModal();
      renderChatList();
      toast('📁', cs && cs.archived ? 'Archiviert' : 'Aus dem Archiv geholt', '');
    } catch (e) { toast('💔', 'Fehler', e.message); }
  };

  // ⬇️ Export
  const exp = $('#csExport');
  if (exp) exp.onclick = () => exportChat(c.id);

  // 🔗 Einladungslink
  const inv = $('#csInvite');
  if (inv) inv.onclick = () => createInvite(c.id);

  const lv = $('#csLeave');
  if (lv) lv.onclick = () => confirmBox('Chat verlassen?', `Du verlässt „${c.name}“.`, async () => {
    try { await api(`/chats/${c.id}/leave`, { method: 'POST' }); S.chats = S.chats.filter((x) => x.id !== c.id); if (S.activeChat === c.id) closeChat(); renderChatList(); toast('👋', 'Verlassen'); } catch (e) { toast('💔', 'Fehler', e.message); }
  });
  const del = $('#csDelete');
  if (del) del.onclick = () => confirmBox('Chat löschen?', c.type === 'private' ? 'Chat für dich löschen?' : 'Chat für alle Mitglieder löschen?', async () => {
    try { await api(`/chats/${c.id}`, { method: 'DELETE' }); S.chats = S.chats.filter((x) => x.id !== c.id); if (S.activeChat === c.id) closeChat(); renderChatList(); toast('🗑️', 'Gelöscht'); } catch (e) { toast('💔', 'Fehler', e.message); }
  }, true);
}

/* Mitglied hinzufügen */
async function modalAddMember(chatId) {
  openModal(`<div class="mTitle">Mitglied hinzufügen 👋</div>
  <div class="field"><input id="amInput" placeholder="Nutzer suchen… (min. 2 Zeichen)"></div>
  <div id="amRes"><p style="text-align:center;color:var(--muted);font-weight:600;font-size:13px;padding:20px">Suche nach @Benutzernamen 💗</p></div>`);
  const inp = $('#amInput');
  inp.focus();
  let timer;
  inp.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = inp.value.trim();
      if (q.length < 2) return;
      try {
        const d = await api('/search?q=' + encodeURIComponent(q));
        $('#amRes').innerHTML = d.users
          .filter((u) => { const dd = S.details[chatId]; return dd && !dd.members.some((m) => m.id === u.id); })
          .map((u) => `<div class="mRow" data-id="${u.id}"><div class="cav">${avatarHtml(u.avatar)}</div><div class="info"><b>${esc(u.displayName)}</b><span>@${esc(u.username)}</span></div><span class="act">+ Add</span></div>`)
          .join('') || '<p style="text-align:center;color:var(--muted);font-weight:600;font-size:13px;padding:16px">Niemand gefunden (oder schon dabei)</p>';
        $$('#amRes .mRow').forEach((r) => (r.onclick = async () => {
          try {
            const s = await api(`/chats/${chatId}/members`, { method: 'POST', body: { userId: r.dataset.id } });
            S.details[chatId] = { ...S.details[chatId], members: s.summary.members.map((id) => (S.details[chatId].members.find((m) => m.id === id) || { id, displayName: '?', username: '', online: false })) };
            closeModal();
            toast('🎉', 'Hinzugefügt!');
            if (S.activeChat === chatId) { renderSub(); sysNote('Ein neues Mitglied ist dabei 💗'); }
          } catch (e) { toast('💔', 'Fehler', e.message); }
        }));
      } catch {}
    }, 300);
  };
}

/* ================= EINGABE ================= */
function initInput() {
  const input = $('#msgInput');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    const now = Date.now();
    if (S.activeChat && now - S.lastTypingSent > 1800) {
      S.lastTypingSent = now;
      if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ type: 'typing', chatId: S.activeChat }));
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  let draftTimer;
  input.addEventListener('input', () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, 400);
  });
  $('#btnSend').onclick = send;
  $('#backBtn').onclick = closeChat;
  $('#btnChatMenu').onclick = modalChatSettings;
  // #chatHeadAv liegt NEBEN #chatHeadInfo, #chatName liegt DARIN.
  // Beide einzeln zu binden würde beim Klick auf den Namen doppelt feuern
  // (Kind + Blase) → Panel geht auf und sofort wieder zu. Deshalb nur diese zwei.
  $('#chatHeadInfo').onclick = toggleInfoPanel;
  const headAv = $('#chatHeadAv');
  if (headAv) { headAv.style.cursor = 'pointer'; headAv.onclick = toggleInfoPanel; }
  const ic = $('#infoClose');
  if (ic) ic.onclick = () => $('#infoPanel').classList.add('hidden');
  $('#btnMyProfile').onclick = modalProfile;
  $('#fab').onclick = modalNewChat;
  $('#tabs').querySelectorAll('.tabBtn').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; $$('#tabs .tabBtn').forEach((x) => x.classList.remove('on')); b.classList.add('on'); renderChatList(); }));
  let sTimer;
  $('#searchInput').oninput = (e) => {
    clearTimeout(sTimer);
    sTimer = setTimeout(() => { S.searchQ = e.target.value.trim().toLowerCase(); renderChatList(); }, 150);
  };
  // Emoji
  const pop = $('#emojiPop');
  EMOJIS.forEach((e) => {
    const b = document.createElement('button');
    b.textContent = e;
    b.onclick = () => { input.value += e; input.focus(); };
    pop.appendChild(b);
  });
  $('#btnEmoji').onclick = (ev) => { ev.stopPropagation(); pop.classList.toggle('show'); };
  document.addEventListener('click', (ev) => { if (!pop.contains(ev.target) && ev.target !== $('#btnEmoji')) pop.classList.remove('show'); });
  // Bild
  $('#btnImage').onclick = () => $('#fileImage').click();
  $('#fileImage').onchange = (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast('💔', 'Bild zu groß', 'Max. 4 MB'); return; }
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 900;
      let { width: w, height: h } = img;
      if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      S.pendingImage = cv.toDataURL('image/jpeg', 0.82);
      if (S.pendingImage.length > 700 * 1024) { toast('💔', 'Bild zu groß', 'Komprimiere es kleiner (max. ~700 KB)'); S.pendingImage = ''; return; }
      $('#pendingImgPrev').src = S.pendingImage;
      $('#pendingImg').style.display = 'flex';
      URL.revokeObjectURL(url);
    };
    img.src = url;
    ev.target.value = '';
  };
  $('#pendingImgX').onclick = clearPending;
  // ➕ Anhang-Menü (V4.18)
  $('#btnPlus').onclick = (ev) => { ev.stopPropagation(); openStickerPanel(false); attPop(); };
  $('#btnSticker').onclick = (ev) => { ev.stopPropagation(); attPop(false); openStickerPanel(); };
  $$('#attPop button').forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const a = b.dataset.att;
      attPop(false);
      if (a === 'image') $('#fileImage').click();
      else if (a === 'once') pickViewOnce();
      else if (a === 'video') pickVideo();
      else if (a === 'doc') $('#fileDoc').click();
      else if (a === 'voice') startRecording();
      else if (a === 'gif') pickGif();
      else if (a === 'loc') pickLocation();
      else if (a === 'vcard') pickContact();
    };
  });
  document.addEventListener('click', (ev) => {
    const sp = $('#stickerPanel');
    if (sp && !sp.classList.contains('hidden') && !sp.contains(ev.target) && ev.target.id !== 'btnSticker') openStickerPanel(false);
    const p2 = $('#attPop');
    if (p2 && !p2.classList.contains('hidden') && !p2.contains(ev.target) && ev.target.id !== 'btnPlus') attPop(false);
  });
  let stTimer;
  const stS = $('#stSearch');
  if (stS) stS.oninput = () => {
    clearTimeout(stTimer);
    stTimer = setTimeout(() => renderStickerGrid(stS.value.trim().toLowerCase()), 160);
  };
  $('#fileVideo').onchange = onVideoPicked;
  $('#fileDoc').onchange = onDocPicked;
  $('#recStop').onclick = () => stopRecording(false);
  $('#recCancel').onclick = () => stopRecording(true);

  // Klicks auf Einmal-Medien + Sprachnachrichten (Delegation, einmalig)
  document.addEventListener('click', (ev) => {
    const vo = ev.target.closest('[data-vo]');
    if (vo) { ev.preventDefault(); const msg = (S.messages[vo.dataset.chat] || []).find((x) => x.id === vo.dataset.vo); if (msg) openViewOnce(msg, vo.dataset.chat); return; }
    const rt = ev.target.closest('[data-rate]');
    if (rt) {
      ev.preventDefault(); ev.stopPropagation();
      const stufen = [1, 1.5, 2, 0.5];
      const i = stufen.indexOf(S.voiceRate || 1);
      S.voiceRate = stufen[(i + 1) % stufen.length];
      rt.textContent = S.voiceRate === 1 ? '1×' : S.voiceRate + '×';
      if (S._voiceAudio) S._voiceAudio.playbackRate = S.voiceRate;
      document.querySelectorAll('.voiceRate').forEach((b) => { b.textContent = S.voiceRate === 1 ? '1×' : S.voiceRate + '×'; });
      return;
    }
    const pl = ev.target.closest('[data-play]');
    if (pl) {
      ev.preventDefault(); ev.stopPropagation();
      const chatId = S.activeChat;
      const msg = (S.messages[chatId] || []).find((x) => x.id === pl.dataset.play);
      if (msg) playVoice(msg, pl);
    }
  });
  // Avatar-Upload
  $('#fileAvatar').onchange = (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = async () => {
      const cv = document.createElement('canvas');
      const s = Math.min(1, 256 / Math.max(img.width, img.height));
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const data = cv.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(url);
      try {
        const d = await api('/me', { method: 'PUT', body: { avatar: data } });
        S.user = d.user; renderMyAvatar();
        if (activeDetails()) { /* eigener Avatar in Gruppen */ }
        toast('💗', 'Avatar geändert!');
      } catch (e) { toast('💔', 'Fehler', e.message); }
    };
    img.src = url;
  };
  window.addEventListener('focus', () => { if (S.activeChat) markRead(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); $('#emojiPop').classList.remove('show'); } });
}

/* ================= PWA ================= */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  window.__lcInstall = () => {
    e.prompt();
    e.userChoice.then(() => { window.__lcInstall = null; deferredInstall = null; });
  };
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));


/* ---------- Eigene Sperren: Banner + Eingabe aus ---------- */
async function refreshMuteState() {
  try {
    const d = await api('/moderation/me');
    const now = Date.now();
    const mute = (d.bans || []).find((b) => b.type === 'mute' && !b.revoked && (!b.until || b.until > now));
    const ban = (d.bans || []).find((b) => !b.revoked && (
      b.type === 'perm' || (b.type === 'temp' && b.until > now) || (b.type === 'future' && b.activated && b.until > now)
    ));
    if (ban) { showBanScreen(ban, { login: localStorage.getItem('lc_lastlogin') || '' }); return; }
    const input = $('#inputBar');
    let banner = $('#muteBanner');
    S.mutedUntil = mute ? (mute.until || 0) : 0;
    if (mute) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'muteBanner';
      }
      banner.textContent = '🔇 Du bist stummgeschaltet' + (mute.until ? ' bis ' + fmtDT(mute.until) : '') + (mute.reason ? ' · ' + mute.reason : '') + ' — schreiben ist gerade gesperrt';
      if (input && banner.previousElementSibling !== input) input.insertAdjacentElement('afterend', banner);
      if (input) input.style.opacity = '.45';
      if ($('#msgInput')) $('#msgInput').placeholder = 'Du bist gerade stummgeschaltet 🔇';
      const w = (d.warnings || []);
      if (w.length) {
        const last = w[w.length - 1];
        toast('⚠️', 'Verwarnung', (last.reason || 'Grund siehe Team') + (last.byName ? ' · von ' + last.byName : ''), 6000);
      }
    } else if (banner) {
      banner.remove();
      if (input) input.style.opacity = '';
      if ($('#msgInput')) $('#msgInput').placeholder = 'Nachricht schreiben… 💗';
    }
  } catch {}
}

/* ==================================================================
   👑 ROLLEN · OWNER · MODERATION · SPERREN
   ================================================================== */
const RANK = { user: 0, support: 20, moderator: 40, admin: 60, superadmin: 80, owner: 100 };
const ROLE_LABEL = { user: 'Benutzer', support: 'Support', moderator: 'Moderator', admin: 'Admin', superadmin: 'Superadmin', owner: 'Owner' };
const ROLE_ICON = { user: '💗', support: '🎧', moderator: '🛡️', admin: '⚔️', superadmin: '👑', owner: '👑' };
const BAN_LABEL = { temp: 'Zeitweise gesperrt', perm: 'Dauerhaft gesperrt', future: 'Geplante Sperre', group: 'Gruppen-Sperre', mute: 'Stummgeschaltet' };
const ACT_ICON = {
  WARN: '⚠️', MUTE: '🔇', TEMPBAN: '⏳', FUTUREBAN: '🕒', 'FUTUREBAN:AKTIV': '🕒', PERMABAN: '🚫',
  GROUPBAN: '👥', UNBAN: '✅', ROLE: '🏷️', APPEAL: '💌', 'APPEAL:ACCEPT': '💚', 'APPEAL:DENY': '❌',
  'AUTO-UNBAN': '🔁', 'AUTO-UNMUTE': '🔁', 'OWNER-CLAIM': '👑',
};
S.modMe = null;
S.modTab = 'over';
S.modQ = '';
S.modFilter = 'all';
S.modUsers = [];

function myRole() { return (S.user && S.user.role) || 'user'; }
function myRank() { return RANK[myRole()] || 0; }
function isStaff() { return myRank() >= RANK.moderator; }
/** 🔒 V4.2: Der EINZIGE, der sperren darf. Server prüft das zusätzlich selber. */
function isOwnerMe() {
  if (!S.user) return false;
  return S.user.username === 'maxichen' && (S.user.owner === true || S.user.role === 'owner');
}
function roleChip(role) {
  if (!role || role === 'user') return '';
  return `<span class="roleChip ${role}">${ROLE_ICON[role]} ${ROLE_LABEL[role]}</span>`;
}
function fmtDT(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function relTime(ts) {
  const s = Math.round((ts - Date.now()) / 1000);
  if (s <= 0) return 'jetzt';
  if (s < 90) return 'in ' + s + ' s';
  if (s < 5400) return 'in ' + Math.round(s / 60) + ' min';
  if (s < 129600) return 'in ' + Math.round(s / 3600) + ' h';
  return 'in ' + Math.round(s / 86400) + ' Tagen';
}

/* ---------- 🧊 Liquid-Glass-Navigation (mobil) ---------- */
function initGlassNav(){
  const nav = document.getElementById('glassNav');
  if(!nav) return;
  const pick = (el) => {
    nav.querySelectorAll('.gnItem').forEach(b => b.classList.toggle('on', b === el));
  };
  nav.querySelectorAll('.gnItem').forEach(btn => {
    btn.onclick = () => {
      const g = btn.dataset.gn;
      pick(btn);
      if (g === 'chats') {
        document.getElementById('appScreen').classList.remove('show-chat');
        try { if (typeof loadChats === 'function') loadChats(); } catch(e){}
      } else if (g === 'search') {
        document.getElementById('appScreen').classList.remove('show-chat');
        const inp = document.getElementById('searchInput');
        if (inp) { inp.focus(); inp.scrollIntoView({block:'center', behavior:'smooth'}); }
      } else if (g === 'profile') {
        // 📱 V4.28: eigener Profil-Reiter (wie bei WhatsApp), sonst altes Profil
        if (window.LC428 && typeof window.LC428.profileTab === 'function') {
          window.LC428.profileTab();
          return;
        }
        const b = document.getElementById('btnMyProfile');
        if (b) b.click();
      } else if (g === 'team') {
        const b = document.getElementById('btnStaff');
        if (b) { b.click(); return; }
        if (typeof openModal === 'function' && typeof S !== 'undefined') {
          openModal('<h3 style="margin:0 0 8px">🛡️ Sicherheit</h3>' +
            '<p style="font-size:13px;color:#8B7A93">Melde dich als Team-Mitglied an, um die Team-Zentrale zu öffnen. Sperren darf nur <b>Owner maxichen</b> 👑</p>');
        }
      }
    };
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGlassNav);
else initGlassNav();

/* ---------- Staff-Button in der Seitenleiste ---------- */
function renderStaffBtn() {
  const head = document.querySelector('#sidebar .sideHeader');
  if (!head) return;
  let b = $('#btnStaff');
  if (!isStaff()) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'btnStaff';
    b.className = 'staffBtn';
    b.title = 'Team-Zentrale';
    b.onclick = () => openModPanel();
    head.appendChild(b);
  }
  b.textContent = isOwnerMe() ? '👑' : myRole() === 'superadmin' ? '🛡️' : '🛡️';
}

/* ==================================================================
   🚫 BAN-SCREEN + EINSPRUCH
   ================================================================== */
function showBanScreen(ban, opts = {}) {
  if (!ban) return;
  let el = $('#banScreen');
  if (!el) { el = document.createElement('div'); el.id = 'banScreen'; document.body.appendChild(el); }
  el.classList.remove('hidden');
  const t = ban.type === 'perm' ? 'perm' : ban.type || 'perm';
  const isTemp = t === 'temp';
  const lines = [];
  if (ban.reason) lines.push(`<div><b>Grund:</b> ${esc(ban.reason)}</div>`);
  lines.push(`<div><b>Von:</b> ${esc(ban.byName || 'Team')}</div>`);
  if (isTemp && ban.until) lines.push(`<div><b>Läuft ab:</b> ${fmtDT(ban.until)} <span style="opacity:.7">(${relTime(ban.until)})</span></div>`);
  if (t === 'perm') lines.push('<div><b>Dauer:</b> dauerhaft — nur der Owner kann sie aufheben</div>');
  el.innerHTML = `
  <div class="banCard">
    <div class="banIco">${t === 'perm' ? '🚫' : '💔'}</div>
    <h1>${t === 'perm' ? 'Dein Konto ist gesperrt' : 'Du bist gerade gesperrt'}</h1>
    <span class="banType">${BAN_LABEL[t] || 'Gesperrt'}</span>
    <div class="banInfo">${lines.join('')}</div>
    <div class="banOk" id="banOkMsg" style="display:none"></div>
    <div id="banForm">
      <div style="font-size:13px;font-weight:800;margin-bottom:9px;color:#ffc9ec">💌 Du willst wieder rein? Schreib uns!</div>
      <input id="banLogin" placeholder="Benutzername, Telefon oder E-Mail" value="${esc(opts.login || '')}" autocomplete="username">
      <input id="banPass" type="password" placeholder="Passwort (nur bei altem Konto nötig)" autocomplete="current-password">
      <textarea id="banText" maxlength="1000" placeholder="Warum soll deine Sperre aufgehoben werden? Schreib ehrlich, was passiert ist 💗"></textarea>
      <button class="btnMain" id="banSend">Einspruch abschicken 💗</button>
      <button class="btnSoft2" id="banBackBtn">Zurück zur Anmeldung</button>
    </div>
    <div class="banFoot">LoveChat 💗 by maxi⁹¹⁰<br>Jede Sperre steht im Team-Protokoll — nichts passiert heimlich.</div>
  </div>`;
  $('#banBackBtn').onclick = () => { el.classList.add('hidden'); };
  $('#banSend').onclick = async () => {
    const login = $('#banLogin').value.trim();
    const password = $('#banPass').value;
    const text = $('#banText').value.trim();
    // 📞 Wer sich mit Nummer anmeldet, hat kein Passwort — dann reicht die Nummer.
    const mitNummer = /^\+?\d[\d /-]{6,18}$/.test(login);
    if (!login) { toast('💔', 'Fehlt noch was', 'Bitte Nummer oder Login eintragen'); return; }
    if (!mitNummer && !password) { toast('💔', 'Fehlt noch was', 'Bitte Passwort eintragen'); return; }
    if (text.length < 5) { toast('💔', 'Zu kurz', 'Schreib kurz, warum du wieder rein willst'); return; }
    const btn = $('#banSend');
    btn.disabled = true; btn.textContent = 'Wird gesendet…';
    try {
      const d = await api('/appeal', { method: 'POST', body: { login, password, text } });
      $('#banOkMsg').style.display = 'block';
      $('#banOkMsg').textContent = d.message || 'Einspruch eingegangen 💗';
      $('#banForm').style.display = 'none';
    } catch (e) {
      toast('💔', 'Hat nicht geklappt', e.message);
      btn.disabled = false; btn.textContent = 'Einspruch abschicken 💗';
    }
  };
}

/* ==================================================================
   👑 OWNER WERDEN (im Profil)
   ================================================================== */
async function ownerBoxHtml() {
  let st = null;
  try { st = await api('/owner/status'); } catch { return ''; }
  if (st.owner.claimed) {
    if (st.me.isOwner) {
      return `<div class="ownerBox"><h4>👑 Du bist der Owner</h4>
        <div class="ownerStatus"><span style="font-size:19px">👑</span><div>Niemand kann dich sperren, löschen oder ersetzen.<br>Du allein darfst dauerhaft sperren.</div></div>
        <button class="btnMain" style="margin-top:10px" id="pOpenMod">Team-Zentrale öffnen 🛡️</button></div>`;
    }
    return `<div class="ownerBox"><h4>👑 Owner vergeben</h4>
      <p>Der Owner ist schon eingerichtet und kann nicht ersetzt werden.</p>
      <div class="ownerStatus"><span style="font-size:19px">🔒</span><div>Owner: <b>${esc(st.owner.displayName || st.owner.username || '—')}</b></div></div></div>`;
  }
  const ok = st.canClaimPhone || st.canClaimEmail;
  return `<div class="ownerBox"><h4>👑 Owner werden</h4>
    <p>${ok
      ? 'Dein Konto passt! Gib den Setup-Code ein, den LoveChat beim ersten Start ausgegeben hat. Danach gehört dir LoveChat für immer.'
      : `Damit du Owner wirst, muss in deinem Profil die Owner-Telefonnummer <b>${esc(st.owner.phoneHint)}</b> oder die E-Mail <b>${esc(st.owner.emailHint)}</b> stehen. Trag sie oben ein, speichere, und komm zurück 💗`}</p>
    ${ok ? `<input id="ownerKey" placeholder="Setup-Code" autocomplete="off">
      <button class="btnMain" style="margin-top:9px" id="ownerClaim">Owner werden 👑</button>` : ''}
    </div>`;
}

async function wireOwnerBox() {
  const btn = $('#ownerClaim');
  if (btn) {
    btn.onclick = async () => {
      const key = ($('#ownerKey').value || '').trim();
      if (!key) { toast('💔', 'Kein Code', 'Gib den Setup-Code ein'); return; }
      btn.disabled = true; btn.textContent = 'Prüfe…';
      try {
        const d = await api('/owner/claim', { method: 'POST', body: { setupKey: key } });
        S.user = d.user;
        renderMyAvatar(); renderStaffBtn();
        closeModal();
        toast('👑', 'Du bist jetzt Owner!', 'LoveChat gehört dir 💗', 6000);
        openModPanel();
      } catch (e) {
        toast('💔', 'Hat nicht geklappt', e.message, 5000);
        btn.disabled = false; btn.textContent = 'Owner werden 👑';
      }
    };
  }
  const open = $('#pOpenMod');
  if (open) open.onclick = () => { closeModal(); openModPanel(); };
}

/* ==================================================================
   🛡️ TEAM-ZENTRALE
   ================================================================== */
async function openModPanel(tab) {
  if (!isStaff()) { toast('🔒', 'Kein Zugang', 'Das ist nur für das Team'); return; }
  S.modTab = tab || 'over';
  let p = $('#modPanel');
  if (!p) { p = document.createElement('div'); p.id = 'modPanel'; document.body.appendChild(p); }
  document.body.classList.add('mp-on');
  p.innerHTML = `
    <div class="mpHead">
      <button class="back" id="mpClose">←</button>
      <div style="flex:1;min-width:0">
        <h2>Team-Zentrale 👑</h2>
        <div class="sub" id="mpSub">${roleChip(myRole()) || 'Lade…'}</div>
      </div>
      <a href="/anleitung" target="_blank" rel="noopener" title="Anleitung" style="width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,.22);color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center;text-decoration:none;flex:0 0 auto">📖</a>
    </div>
    <div class="mpTabs">
      <button class="mpTab" data-t="over">📊 Übersicht</button>
      <button class="mpTab" data-t="users">👥 Nutzer</button>
      <button class="mpTab" data-t="appeals">💌 Einsprüche</button>
      <button class="mpTab" data-t="logs">📜 Protokoll</button>
    </div>
    <div class="mpBody" id="mpBody"><div class="mpEmpty"><span class="big">💗</span>Einen Moment…</div></div>`;
  $('#mpClose').onclick = closeModPanel;
  p.querySelectorAll('.mpTab').forEach((b) => (b.onclick = () => { S.modTab = b.dataset.t; syncModTabs(); renderModBody(); }));
  syncModTabs();
  try {
    const d = await api('/admin/overview');
    S.modMe = d.me;
    S.modRoles = d.roles;
    S.modStats = d.stats;
    $('#mpSub').innerHTML = `${roleChip(myRole())} <span style="opacity:.85">· ${esc(S.user.displayName)}</span>`;
  } catch (e) {
    $('#mpBody').innerHTML = `<div class="mpEmpty"><span class="big">💔</span>${esc(e.message)}</div>`;
    return;
  }
  renderModBody();
}
function closeModPanel() {
  const p = $('#modPanel');
  if (p) p.remove();
  document.body.classList.remove('mp-on');
}
function syncModTabs() {
  $$('#modPanel .mpTab').forEach((b) => b.classList.toggle('on', b.dataset.t === S.modTab));
}
function renderModBody() {
  const body = $('#mpBody');
  if (!body) return;
  if (S.modTab === 'over') return renderModOverview();
  if (S.modTab === 'users') return renderModUsers();
  if (S.modTab === 'appeals') return renderModAppeals();
  if (S.modTab === 'logs') return renderModLogs();
}

/* ---------- Übersicht ---------- */
function renderModOverview() {
  const st = S.modStats || {};
  const rc = st.roleCounts || {};
  const body = $('#mpBody');
  body.innerHTML = `
    <div class="mpStats">
      <div class="mpStat"><b>${st.users || 0}</b><span>Konten</span></div>
      <div class="mpStat ${st.activeBans ? 'alert' : ''}"><b>${st.activeBans || 0}</b><span>aktiv gesperrt</span></div>
      <div class="mpStat"><b>${st.muted || 0}</b><span>stummgeschaltet</span></div>
      <div class="mpStat ${st.openAppeals ? 'gold' : ''}"><b>${st.openAppeals || 0}</b><span>offene Einsprüche</span></div>
      <div class="mpStat"><b>${st.messages || 0}</b><span>Nachrichten</span></div>
      <div class="mpStat"><b>${st.online || 0}</b><span>gerade online</span></div>
    </div>
    <div class="mpSec">👑 Team</div>
    <div class="mpCard">
      ${['owner', 'superadmin', 'admin', 'moderator', 'support'].map((r) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-weight:800;font-size:13px">${roleChip(r)}<span style="color:var(--muted)">${rc[r] || 0}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-weight:800;font-size:13px;border-top:1px solid #ffe9f4;margin-top:4px">💗 Benutzer<span style="color:var(--muted)">${rc.user || 0}</span></div>
    </div>
    <div class="mpSec">⚡ Schnellzugriff</div>
    <div class="mpBtns" style="gap:9px">
      <button class="yes" style="background:var(--grad);color:#fff;padding:12px" id="mpGoUsers">👥 Alle Nutzer</button>
      <button class="yes" style="background:var(--lila-pale);color:var(--lila-dark);padding:12px" id="mpGoAppeals">💌 Einsprüche</button>
    </div>
    <div style="margin-top:16px;font-size:11.5px;color:var(--muted);font-weight:700;line-height:1.7;background:#fff;border:2px solid var(--line);border-radius:16px;padding:12px 13px">
      <b style="color:var(--text)">Was darfst du?</b><br>
      🎧 Support: nur mitlesen<br>
      🛡️ Moderator: Nachrichten löschen — <b>kein</b> Sperren<br>
      ⚔️ Admin: Gruppen verwalten — <b>kein</b> Sperren<br>
      👑 Superadmin: Nutzer ansehen, Meldungen lesen — <b>kein</b> Sperren<br>
      💗 <b>Owner maxichen: ALLES — verwarnen, stummschalten, Zeit-/Zukunfts-/Dauer-Sperre, Gruppen-Ausschluss, Entsperren. Unantastbar.</b>
    </div>`;
  $('#mpGoUsers').onclick = () => { S.modTab = 'users'; syncModTabs(); renderModBody(); };
  $('#mpGoAppeals').onclick = () => { S.modTab = 'appeals'; syncModTabs(); renderModBody(); };
}

/* ---------- Nutzer ---------- */
async function renderModUsers() {
  const body = $('#mpBody');
  body.innerHTML = `
    <input class="mpSearch" id="mpQ" placeholder="🔍 Name, @username, E-Mail, Telefon…" value="${esc(S.modQ)}">
    <div class="mpFilters">
      ${[['all', 'Alle'], ['banned', '🚫 Gesperrt'], ['muted', '🔇 Stumm'], ['staff', '🛡️ Team'], ['warned', '⚠️ Verwarnt']]
        .map(([k, l]) => `<button class="mpFilter ${S.modFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}
    </div>
    <div id="mpList"><div class="mpEmpty"><span class="big">💗</span>Lade…</div></div>`;
  const q = $('#mpQ');
  q.oninput = () => {
    S.modQ = q.value.trim();
    clearTimeout(S._qT);
    S._qT = setTimeout(loadModUsers, 280);
  };
  body.querySelectorAll('.mpFilter').forEach((b) => (b.onclick = () => { S.modFilter = b.dataset.f; renderModUsers(); }));
  await loadModUsers();
}
async function loadModUsers() {
  const list = $('#mpList');
  if (!list) return;
  try {
    const qs = `?q=${encodeURIComponent(S.modQ)}&filter=${encodeURIComponent(S.modFilter)}`;
    const d = await api('/admin/users' + qs);
    S.modUsers = d.users;
    if (!d.users.length) {
      list.innerHTML = `<div class="mpEmpty"><span class="big">🔍</span>Niemand gefunden</div>`;
      return;
    }
    list.innerHTML = d.users.map(userCardHtml).join('');
    list.querySelectorAll('.mpUser').forEach((el) => (el.onclick = () => {
      const u = S.modUsers.find((x) => x.id === el.dataset.id);
      if (u) modalUserActions(u);
    }));
  } catch (e) {
    list.innerHTML = `<div class="mpEmpty"><span class="big">💔</span>${esc(e.message)}</div>`;
  }
}
function userCardHtml(u) {
  const pills = [];
  if (u.owner) pills.push('<span class="mpPill ok">👑 Owner</span>');
  else if (u.role !== 'user') pills.push(`<span class="mpPill ok">${ROLE_ICON[u.role]} ${esc(u.roleLabel)}</span>`);
  if (u.ban) pills.push(`<span class="mpPill">🚫 ${esc(BAN_LABEL[u.ban.type] || 'gesperrt')}</span>`);
  if (u.mute) pills.push(`<span class="mpPill mute">🔇 stumm${u.mute.until ? ' bis ' + fmtDT(u.mute.until) : ''}</span>`);
  if (u.warnings) pills.push(`<span class="mpPill warn">⚠️ ${u.warnings}</span>`);
  if (u.online) pills.push('<span class="mpPill ok">🟢 online</span>');
  return `<div class="mpUser" data-id="${u.id}">
    <div class="av">${avatarHtml(u.avatar)}</div>
    <div class="who">
      <div class="nm">${esc(u.displayName)}</div>
      <div class="un">@${esc(u.username)}${u.email ? ' · ' + esc(u.email) : ''}</div>
      <div class="mpPills">${pills.join('')}</div>
    </div>
    <div class="mpGo">⚙️</div>
  </div>`;
}

/* ---------- Aktions-Sheet ---------- */
function modalUserActions(u) {
  const st = {
    act: '', dur: '1d', role: 'support', reason: '',
    chatId: (u.groups && u.groups[0] && u.groups[0].id) || '',
    start: '', end: '',
  };
  // 🔒 V4.2: ALLE Sperr-Aktionen sind Owner-only (min = RANK.owner).
  const OWN = 100;
  const actions = [
    { id: 'warn', l: 'Verwarnen', ic: '⚠️', min: OWN },
    { id: 'mute', l: 'Stummschalten', ic: '🔇', min: OWN },
    { id: 'tempban', l: 'Zeit-Sperre', ic: '⏳', min: OWN },
    { id: 'futureban', l: 'Geplante Sperre', ic: '🕒', min: OWN },
    { id: 'permaban', l: 'Dauer-Sperre', ic: '🚫', min: OWN, danger: true },
    { id: 'groupban', l: 'Aus Gruppe werfen', ic: '👥', min: OWN },
    { id: 'unban', l: 'Entsperren', ic: '✅', min: OWN },
    { id: 'role', l: 'Rolle ändern', ic: '🏷️', min: OWN },
  ];
  const draw = () => {
    const rank = (S.modMe && S.modMe.rank) || myRank();
    const isOwnerT = u.owner;
    const locked = isOwnerT ? 'Das Owner-Konto ist geschützt 👑' : '';
    const iAmOwner = isOwnerMe();
    const tiles = actions.map((a) => {
      const dis = !iAmOwner || a.min > rank;
      return `<button class="actTile ${a.danger ? 'danger' : ''} ${st.act === a.id ? 'on' : ''}" data-a="${a.id}" ${dis ? 'disabled' : ''}>
        <span class="ic">${a.ic}</span>${a.l}${dis ? '<br><span style="font-size:9.5px;opacity:.85">' + (iAmOwner ? 'zu hoch' : '🔒 nur Owner') + '</span>' : ''}</button>`;
    }).join('');

    let extra = '';
    if (st.act === 'tempban') {
      extra = `<div class="miniLbl">Wie lange?</div><div class="optRow">
        ${[['1h', '1 Std'], ['6h', '6 Std'], ['1d', '1 Tag'], ['7d', '7 Tage'], ['30d', '30 Tage']]
          .map(([k, l]) => `<button class="opt ${st.dur === k ? 'on' : ''}" data-d="${k}">${l}</button>`).join('')}</div>`;
    }
    if (st.act === 'mute') {
      extra = `<div class="miniLbl">Wie lange?</div><div class="optRow">
        ${[['1h', '1 Std'], ['6h', '6 Std'], ['1d', '1 Tag'], ['7d', '7 Tage']]
          .map(([k, l]) => `<button class="opt ${st.dur === k ? 'on' : ''}" data-d="${k}">${l}</button>`).join('')}</div>`;
    }
    if (st.act === 'futureban') {
      const now = new Date(Date.now() + 3600e3);
      const pad = (n) => String(n).padStart(2, '0');
      const def = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      extra = `<div class="miniLbl">Sperre startet am</div>
        <input type="datetime-local" id="actStart" value="${st.start || def}" style="width:100%;padding:11px 13px;border:2px solid var(--line);border-radius:13px;background:#fff;font-size:14px">
        <div class="miniLbl">… und endet</div>
        <div class="optRow">${[['1d', 'nach 1 Tag'], ['7d', 'nach 7 Tagen'], ['30d', 'nach 30 Tagen'], ['perm', 'nie (dauerhaft)']]
          .map(([k, l]) => `<button class="opt ${st.dur === k ? 'on' : ''}" data-d="${k}">${l}</button>`).join('')}</div>`;
    }
    if (st.act === 'role') {
      extra = `<div class="miniLbl">Neue Rolle</div><div class="optRow">
        ${['user', 'support', 'moderator', 'admin', 'superadmin']
          .map((r) => `<button class="opt ${st.role === r ? 'on' : ''}" data-r="${r}" ${RANK[r] >= rank ? 'disabled style="opacity:.35"' : ''}>${ROLE_ICON[r]} ${ROLE_LABEL[r]}</button>`).join('')}</div>
        <div style="font-size:11px;color:var(--muted);font-weight:700;margin-top:7px">Owner kann nie vergeben werden — der Owner existiert nur einmal.</div>`;
    }
    if (st.act === 'groupban') {
      const gs = u.groups || [];
      extra = gs.length
        ? `<div class="miniLbl">Aus welchem Chat?</div>
           <select id="actChat" style="width:100%;padding:11px 13px;border:2px solid var(--line);border-radius:13px;background:#fff;font-size:14px;font-weight:700">
             ${gs.map((g) => `<option value="${g.id}" ${st.chatId === g.id ? 'selected' : ''}>${{ group: '👥', community: '🏰', channel: '📢' }[g.type] || '💬'} ${esc(g.name)}</option>`).join('')}
           </select>`
        : '<div style="font-size:12px;color:var(--muted);font-weight:700;padding:8px 0">Diese Person ist in keiner Gruppe.</div>';
    }
    if (st.act === 'unban') {
      const what = u.ban ? `Diese Sperre aufheben: <b>${esc(BAN_LABEL[u.ban.type] || u.ban.type)}</b>${u.ban.reason ? ' — ' + esc(u.ban.reason) : ''}` : 'Keine aktive Sperre — Stummschaltung/Warnungen werden trotzdem zurückgesetzt.';
      extra = `<div style="font-size:12.5px;font-weight:700;color:var(--muted);line-height:1.5;background:#fff7fb;border-radius:13px;padding:10px 12px">${what}</div>`;
    }

    openModal(`
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;font-family:'Baloo 2',cursive;font-size:19px">
        <div style="width:38px;height:38px;border-radius:13px;background:#fff;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:21px;overflow:hidden;flex:0 0 auto">${avatarHtml(u.avatar)}</div>
        <div style="min-width:0"><div style="font-size:15px">${esc(u.displayName)}</div><div style="font-size:11.5px;color:var(--muted);font-weight:700">@${esc(u.username)}</div></div>
      </div>
      ${iAmOwner ? '' : `<div style="background:#fff7fb;border:2px solid #ffd6ea;border-radius:14px;padding:10px 12px;font-size:12px;font-weight:800;color:#a1527d;line-height:1.5;margin:4px 0 8px">🔒 Nur Owner <b>maxichen</b> darf sperren, verwarnen, stummschalten oder Rollen ändern. Du kannst hier nur zuschauen.</div>`}
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin:8px 0 4px">
        ${u.owner ? '<span class="mpPill ok">👑 Owner</span>' : roleChip(u.role) || '<span class="mpPill warn">💗 Benutzer</span>'}
        ${u.ban ? `<span class="mpPill">🚫 ${esc(BAN_LABEL[u.ban.type] || 'gesperrt')}</span>` : ''}
        ${u.mute ? '<span class="mpPill mute">🔇 stumm</span>' : ''}
      </div>
      ${locked ? `<div style="background:#fff8dd;border:2px solid #ffd76e;border-radius:13px;padding:10px 12px;font-size:12.5px;font-weight:800;color:#8a5a00;margin:10px 0">${locked}</div>` : ''}
      <div class="actGrid">${tiles}</div>
      ${extra}
      ${st.act ? `<div class="miniLbl">Grund ${st.act === 'unban' ? '(optional)' : ''}</div>
        <input id="actReason" maxlength="300" placeholder="z. B. Beleidigung im Chat" value="${esc(st.reason)}">` : ''}
      ${st.act && !(st.act === 'groupban' && !(u.groups || []).length) ? `<button class="btnMain" id="actRun" style="margin-top:12px">${st.act === 'unban' ? 'Entsperren ✅' : 'Ausführen 💗'}</button>` : (st.act ? '' : '<div style="text-align:center;font-size:12px;color:var(--muted);font-weight:700;padding:8px 0">Wähle oben eine Aktion 👆</div>')}
    `);
    $$('#modalRoot .actTile').forEach((t) => {
      if (t.disabled) return;
      t.onclick = () => { st.act = t.dataset.a === st.act ? '' : t.dataset.a; draw(); };
    });
    $$('#modalRoot .opt').forEach((o) => {
      if (o.disabled) return;
      o.onclick = () => {
        if (o.dataset.d) st.dur = o.dataset.d;
        if (o.dataset.r) st.role = o.dataset.r;
        draw();
      };
    });
    const rs = $('#actReason');
    if (rs) rs.oninput = () => { st.reason = rs.value; };
    const cs = $('#actChat');
    if (cs) cs.onchange = () => { st.chatId = cs.value; };
    const ss = $('#actStart');
    if (ss) ss.onchange = () => { st.start = ss.value; };
    const run = $('#actRun');
    if (run) run.onclick = () => runAction(u, st, run);
  };
  draw();
}

async function runAction(u, st, btn) {
  const body = { action: st.act, reason: st.reason || '' };
  if (st.act === 'tempban' || st.act === 'mute') body.duration = st.dur;
  if (st.act === 'futureban') {
    if (!st.start) { toast('💔', 'Wann denn?', 'Wähle den Start der Sperre'); return; }
    body.startsAt = st.start;
    if (st.dur === 'perm') { body.until = new Date(Date.now() + 100 * 365 * 86400e3).toISOString(); }
    else body.duration = st.dur;
  }
  if (st.act === 'role') body.role = st.role;
  if (st.act === 'groupban') {
    if (!st.chatId) { toast('💔', 'Kein Chat', 'Diese Person ist in keiner Gruppe'); return; }
    body.chatId = st.chatId;
  }
  if (!st.act) return;
  if ((st.act === 'permaban' || st.act === 'tempban' || st.act === 'futureban') && !confirm(`Wirklich ${st.act === 'permaban' ? 'DAUERHAFT' : ''} sperren?\n\n${u.displayName} (@${u.username})`)) return;
  btn.disabled = true; btn.textContent = 'Moment…';
  try {
    const d = await api(`/admin/users/${u.id}/action`, { method: 'POST', body });
    closeModal();
    toast('✅', 'Erledigt', d.message || 'Aktion ausgeführt', 5000);
    loadModUsers();
  } catch (e) {
    toast('💔', 'Hat nicht geklappt', e.message, 5000);
    btn.disabled = false; btn.textContent = st.act === 'unban' ? 'Entsperren ✅' : 'Ausführen 💗';
  }
}

/* ---------- Einsprüche ---------- */
async function renderModAppeals() {
  const body = $('#mpBody');
  body.innerHTML = '<div class="mpEmpty"><span class="big">💌</span>Lade Einsprüche…</div>';
  try {
    const d = await api('/admin/appeals');
    const open = d.appeals.filter((a) => a.status === 'open');
    const done = d.appeals.filter((a) => a.status !== 'open');
    body.innerHTML = `
      <div class="mpSec">💌 Offen (${open.length})</div>
      ${open.length ? open.map(appealCard).join('') : '<div class="mpEmpty"><span class="big">🌈</span>Alles erledigt — niemand wartet 💗</div>'}
      <div class="mpSec" style="margin-top:18px">📁 Erledigt</div>
      ${done.length ? done.slice(0, 30).map(appealCard).join('') : '<div class="mpEmpty" style="padding:18px">Noch nichts entschieden</div>'}`;
    body.querySelectorAll('.mpBtns button').forEach((b) => {
      b.onclick = () => resolveAppeal(b.dataset.id, b.dataset.d);
    });
  } catch (e) {
    body.innerHTML = `<div class="mpEmpty"><span class="big">💔</span>${esc(e.message)}</div>`;
  }
}
function appealCard(a) {
  const u = a.user || {};
  const stChip = a.status === 'open' ? '<span class="mpPill warn">offen</span>'
    : a.status === 'accepted' ? '<span class="mpPill ok">angenommen</span>' : '<span class="mpPill">abgelehnt</span>';
  return `<div class="mpCard">
    <div class="t"><span style="width:26px;height:26px;border-radius:9px;background:var(--pink-pale);display:inline-flex;align-items:center;justify-content:center;font-size:14px;overflow:hidden">${avatarHtml(u.avatar || '💗')}</span>
      ${esc(u.displayName || a.username || 'Konto gelöscht')} <span style="color:var(--muted);font-weight:700">@${esc(a.username || '?')}</span> ${stChip}</div>
    <div style="font-size:11px;color:var(--muted);font-weight:700">${fmtDT(a.at)}${u.ban ? ' · Sperre: ' + esc(BAN_LABEL[u.ban.type] || u.ban.type) : ''}</div>
    <div class="x">${esc(a.text)}</div>
    ${a.status === 'open'
      ? `<div class="mpBtns"><button class="yes" data-id="${a.id}" data-d="accept">✅ Annehmen</button><button class="no" data-id="${a.id}" data-d="deny">❌ Ablehnen</button></div>`
      : `<div class="meta">Entschieden von ${esc(a.decidedByName || 'Team')} · ${fmtDT(a.decidedAt)}${a.note ? ' · „' + esc(a.note) + '“' : ''}</div>`}
  </div>`;
}
async function resolveAppeal(id, decision) {
  const note = prompt(decision === 'accept' ? 'Notiz zum Entsperren (optional):' : 'Warum abgelehnt? (optional):', '') || '';
  try {
    const d = await api(`/admin/appeals/${id}/resolve`, { method: 'POST', body: { decision, note } });
    toast('✅', 'Erledigt', d.message || 'Gespeichert', 4500);
    renderModAppeals();
  } catch (e) {
    toast('💔', 'Hat nicht geklappt', e.message, 5000);
  }
}

/* ---------- Protokoll ---------- */
async function renderModLogs() {
  const body = $('#mpBody');
  if (!S.modLogAction) S.modLogAction = '';
  body.innerHTML = `
    <div class="mpFilters" style="padding-bottom:10px">
      ${[['', 'Alles'], ['WARN', '⚠️ Warn'], ['MUTE', '🔇 Mute'], ['TEMPBAN', '⏳ Tempban'], ['FUTUREBAN', '🕒 Futureban'], ['PERMABAN', '🚫 Permaban'], ['UNBAN', '✅ Unban'], ['ROLE', '🏷️ Rollen'], ['APPEAL', '💌 Einspruch']]
        .map(([k, l]) => `<button class="mpFilter ${S.modLogAction === k ? 'on' : ''}" data-a="${k}">${l}</button>`).join('')}
    </div>
    <div id="mpLogs"><div class="mpEmpty"><span class="big">📜</span>Lade…</div></div>`;
  body.querySelectorAll('.mpFilter').forEach((b) => (b.onclick = () => { S.modLogAction = b.dataset.a; renderModLogs(); }));
  try {
    const d = await api('/admin/logs?limit=200' + (S.modLogAction ? '&action=' + encodeURIComponent(S.modLogAction) : ''));
    const box = $('#mpLogs');
    if (!box) return;
    if (!d.logs.length) { box.innerHTML = '<div class="mpEmpty"><span class="big">📜</span>Noch nichts passiert</div>'; return; }
    box.innerHTML = '<div class="mpCard" style="padding:4px 6px">' + d.logs.map((l) => `
      <div class="mpLog">
        <div class="ic">${ACT_ICON[l.action] || '•'}</div>
        <div class="tx"><b>${esc(l.actorName || 'System')}</b> <span class="r">→</span> <b>${esc(l.targetName || '—')}</b>
          <div class="r" style="font-size:11px">${esc(l.action)}${l.meta && l.meta.chatName ? ' · ' + esc(l.meta.chatName) : ''}${l.reason ? ' · „' + esc(l.reason) + '“' : ''}</div>
        </div>
        <div class="tm">${fmtDT(l.at)}</div>
      </div>`).join('') + '</div>';
  } catch (e) {
    const box = $('#mpLogs');
    if (box) box.innerHTML = `<div class="mpEmpty"><span class="big">💔</span>${esc(e.message)}</div>`;
  }
}

/* ================= START ================= */
initInput();
boot();
