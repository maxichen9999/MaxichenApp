/* =====================================================================
 *  🔒🎵 v426.js — V4.26 „Sicherheit + Töne" (Oberfläche)
 * ---------------------------------------------------------------------
 *  Was hier passiert:
 *    · Sicherheits-Center: Punktzahl, Schalter, 2FA-Status, Backup
 *    · 40 Töne: anhören (WebAudio, keine MP3) + wählen + Lautstärke
 *    · Datenschutz: 4 neue „Wer darf…"-Schalter + Ausnahmen
 *    · Sicherheitscode (60 Ziffern) mit einer Person
 *    · App-Sperre + Biometrie-Schalter
 *
 *  Alles wird über #lcSecBtn im Profil geöffnet — die Karte wird per
 *  MutationObserver eingehängt (wie V4.25). app.js bleibt unangetastet.
 *
 *  Farben: pink #ff4da6 aktiv, lila inaktiv. KEIN Grün.
 * ===================================================================== */
(function () {
  'use strict';

  const ST = { sounds: [], ringtones: [], mine: {}, sec: null, privacy: null, lock: null, busy: false, ctx: null };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  /* ---------------- CSS ---------------- */
  function injectCss() {
    if (document.getElementById('v426css')) return;
    const css = `
/* ===== V4.26 — Sicherheit + Töne ===== */
.lcSecCard{display:flex;align-items:center;gap:12px;margin:10px 2px;padding:13px;
  border-radius:20px;cursor:pointer;position:relative;overflow:hidden;
  background:linear-gradient(135deg,#fff2f9 0%,#ffe6f4 55%,#f3e8ff 100%);
  border:2px solid #ff4da6;box-shadow:0 6px 20px rgba(255,77,166,.24)}
.lcSecCard:active{transform:scale(.99)}
.lcSecIcon{width:46px;height:46px;min-width:46px;border-radius:50%;font-size:22px;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#ffd6ec,#e6ccff);border:2px solid #fff;
  box-shadow:0 0 12px rgba(255,77,166,.45)}
.lcSecBody{flex:1;min-width:0}
.lcSecBody b{display:block;font-size:14.5px;color:#43203a}
.lcSecBody small{font-size:11.5px;color:#a5748f;font-weight:700}
.lcSecScore{font-family:inherit;font-size:17px;font-weight:900;color:#e6197d;flex:0 0 auto}
#lcSecView{position:fixed;inset:0;z-index:62;display:flex;flex-direction:column;
  background:linear-gradient(170deg,#fff5fa 0%,#ffeaf5 45%,#f6ebff 100%)}
#lcSecView.hidden{display:none}
.lcSecHead{display:flex;align-items:center;gap:10px;padding:12px 14px;flex:0 0 auto;
  background:rgba(255,255,255,.94);backdrop-filter:blur(10px);border-bottom:2px solid #ffd9ec}
.lcSecTitle{flex:1;font-family:'Baloo 2',cursive;font-size:18px;color:#7b2ff7;font-weight:800}
.lcSecClose{width:38px;height:38px;border-radius:12px;background:#ffeef5;font-size:18px}
.lcSecScroll{flex:1;overflow-y:auto;padding:14px 12px 26px}
.lcRing{display:flex;align-items:center;gap:16px;background:#fff;border-radius:22px;padding:16px;
  margin-bottom:14px;box-shadow:0 6px 20px rgba(255,77,148,.14);border:1.5px solid #ffe0ef}
.lcRingNum{width:84px;height:84px;min-width:84px;border-radius:50%;display:flex;flex-direction:column;
  align-items:center;justify-content:center;font-weight:900;color:#fff;
  background:conic-gradient(#ff4da6 var(--p,60%), #ffe3f0 0);position:relative}
.lcRingNum::after{content:'';position:absolute;inset:7px;border-radius:50%;background:#fff}
.lcRingNum span{position:relative;z-index:1;color:#e6197d;font-size:24px;line-height:1}
.lcRingNum small{position:relative;z-index:1;color:#b2588e;font-size:9px;font-weight:900;letter-spacing:.5px}
.lcRingTxt b{display:block;font-size:15px;color:#43203a}
.lcRingTxt small{font-size:12px;color:#a5748f;font-weight:700;line-height:1.5;display:block;margin-top:4px}
.lcGroup{background:#fff;border-radius:20px;padding:6px 12px 12px;margin-bottom:14px;
  box-shadow:0 4px 16px rgba(255,77,148,.12);border:1.5px solid #ffe0ef}
.lcGroupH{display:flex;align-items:center;justify-content:space-between;padding:12px 2px 10px;
  font-size:11.5px;font-weight:900;letter-spacing:.7px;text-transform:uppercase;color:#b2588e}
.lcRow{display:flex;align-items:center;gap:10px;padding:11px 2px;border-top:1.5px solid #fff0f7}
.lcRow:first-of-type{border-top:none}
.lcRowBody{flex:1;min-width:0}
.lcRowBody b{display:block;font-size:13.5px;color:#43203a}
.lcRowBody small{font-size:11px;color:#a5748f;font-weight:700}
.lcSw{width:50px;height:28px;min-width:50px;border-radius:999px;background:#e9d8e6;position:relative;transition:.18s}
.lcSw.on{background:linear-gradient(135deg,#ff4da6,#b06bff);box-shadow:0 0 12px rgba(255,77,166,.55)}
.lcSw::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;
  background:#fff;transition:.18s;box-shadow:0 2px 6px rgba(0,0,0,.18)}
.lcSw.on::after{left:25px}
.lcSeg{display:flex;flex-wrap:wrap;gap:6px;padding:2px}
.lcSeg button{padding:7px 12px;border-radius:999px;background:#fff0f5;color:#a5748f;
  font-size:11.5px;font-weight:800;border:1.5px solid transparent}
.lcSeg button.on{background:linear-gradient(135deg,#ff4da6,#b06bff);color:#fff;
  box-shadow:0 3px 10px rgba(255,77,166,.35)}
.lcSound{display:flex;align-items:center;gap:10px;padding:8px 2px;border-top:1.5px solid #fff0f7}
.lcSound:first-of-type{border-top:none}
.lcSoundPlay{width:34px;height:34px;min-width:34px;border-radius:50%;font-size:15px;
  display:flex;align-items:center;justify-content:center;background:#fff0f7;color:#e6197d}
.lcSoundPlay.on{background:linear-gradient(135deg,#ff4da6,#b06bff);color:#fff;box-shadow:0 0 12px rgba(255,77,166,.5)}
.lcSoundName{flex:1;min-width:0;font-size:13px;font-weight:800;color:#43203a;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lcSoundPick{font-size:10.5px;font-weight:900;color:#e6197d;background:#fff0f6;
  padding:5px 10px;border-radius:999px}
.lcSoundPick.on{background:linear-gradient(135deg,#ff4da6,#b06bff);color:#fff}
.lcSafeCode{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;letter-spacing:1px;
  color:#43203a;background:#fff6fb;border:1.5px dashed #ffb8d9;border-radius:14px;
  padding:12px;text-align:center;line-height:1.9;word-spacing:2px}
.lcBtnWide{width:100%;padding:12px;border-radius:14px;font-weight:900;font-size:13.5px;
  background:linear-gradient(135deg,#ff4da6,#b06bff);color:#fff;
  box-shadow:0 6px 18px rgba(255,77,166,.4);margin-top:8px}
.lcBtnGhost{width:100%;padding:11px;border-radius:14px;font-weight:900;font-size:13px;
  background:#fff;color:#e6197d;border:2px solid #ffd9ec;margin-top:8px}
.lcNotice{margin-top:8px;font-size:11px;color:#a5748f;font-weight:700;line-height:1.5;text-align:center}
body.dark #lcSecView{background:linear-gradient(170deg,#1a1220,#221630)}
body.dark .lcGroup,body.dark .lcRing{background:rgba(255,255,255,.06);border-color:rgba(255,77,166,.3)}
body.dark .lcRowBody b,body.dark .lcRingTxt b,body.dark .lcSecBody b,body.dark .lcSoundName{color:#ffe6f4}
body.dark .lcSecHead{background:rgba(30,20,36,.94)}
`;
    const el = document.createElement('style');
    el.id = 'v426css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------------- WebAudio: Töne abspielen ---------------- */
  function ac() {
    if (!ST.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ST.ctx = new C();
    }
    if (ST.ctx.state === 'suspended') ST.ctx.resume();
    return ST.ctx;
  }

  /** Spielt ein Rezept wie im Handy: Noten als Hz + Versatz, Wellenform, Dauer. */
  function play(sound) {
    if (!sound || sound.id === 'off') return;
    const ctx = ac();
    if (!ctx) return;
    const vol = (ST.mine && typeof ST.mine.vol === 'number') ? ST.mine.vol : 0.5;
    const t0 = ctx.currentTime + 0.01;
    for (const [hz, off] of (sound.notes || [])) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = sound.type || 'sine';
      osc.frequency.value = hz;
      const start = t0 + (off || 0);
      const d = Math.max(0.05, sound.dur || 0.2);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22 * vol + 0.02, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + d + 0.02);
    }
    // Vibration, wenn das Gerät es kann
    try {
      if (ST.mine.vibrate !== false && Array.isArray(sound.vib) && navigator.vibrate) navigator.vibrate(sound.vib);
    } catch (e) {}
  }

  /* ---------------- Daten laden ---------------- */
  async function loadAll() {
    const out = {};
    try { out.sounds = await api('/v426/sounds'); ST.sounds = out.sounds.sounds || []; ST.ringtones = out.sounds.ringtones || []; ST.mine = out.sounds.mine || {}; } catch (e) { out.soundsErr = e.message; }
    try { out.sec = await api('/v426/security'); ST.sec = out.sec; } catch (e) { out.secErr = e.message; }
    try { out.privacy = await api('/v426/privacy'); ST.privacy = out.privacy; } catch (e) { out.privacyErr = e.message; }
    try { out.lock = await api('/v426/lock'); ST.lock = out.lock; } catch (e) { out.lockErr = e.message; }
    return out;
  }

  /* ---------------- Sicherheits-Center (HTML) ---------------- */
  function scoreRing(sec) {
    const p = sec ? Math.round((sec.score / (sec.maxScore || 100)) * 100) : 0;
    return `<div class="lcRingNum" style="--p:${p}%"><span>${sec ? sec.score : 0}</span><small>VON 100</small></div>`;
  }

  function sw(id, on) {
    return `<div class="lcSw${on ? ' on' : ''}" data-sw="${esc(id)}" role="switch" aria-checked="${on ? 'true' : 'false'}" tabindex="0"></div>`;
  }

  function seg(key, current, choices, labels) {
    return `<div class="lcSeg">${choices.map((c) =>
      `<button class="${current === c ? 'on' : ''}" data-seg="${esc(key)}" data-val="${esc(c)}">${esc(labels[c] || c)}</button>`
    ).join('')}</div>`;
  }

  const LABELS = { all: 'Alle', contacts: 'Meine Kontakte', selected: 'Ausgewählte', except: 'Alle außer…', nobody: 'Niemand' };

  function securityHtml() {
    const sec = ST.sec;
    const rows = (sec && sec.items || []).map((i) => `
      <div class="lcRow">
        <div class="lcRowBody"><b>${esc(i.label)}</b><small>${esc(i.hint || '')}</small></div>
        <div class="lcSw${i.on ? ' on' : ''}" aria-checked="${i.on}"></div>
      </div>`).join('');

    const lock = ST.lock || {};
    const pv = (ST.privacy && ST.privacy.privacy) || {};

    return `
      <div class="lcRing">
        ${scoreRing(sec)}
        <div class="lcRingTxt">
          <b>Sicherheit: ${esc(sec ? sec.grade : '—')}</b>
          <small>${sec ? `${sec.score} von 100 Punkten aus ${sec.items.length} Schaltern · ${sec.sessions} angemeldete Geräte · ${sec.sounds} Töne` : 'wird geladen …'}</small>
        </div>
      </div>

      <div class="lcGroup">
        <div class="lcGroupH"><span>Kontoschutz</span><span>${sec ? sec.score + '/100' : ''}</span></div>
        ${rows}
        <div class="lcNotice">${esc(sec ? sec.note : '')}</div>
      </div>

      <div class="lcGroup">
        <div class="lcGroupH"><span>App-Sperre</span><span>${lock.enabled ? 'AN' : 'AUS'}</span></div>
        <div class="lcRow">
          <div class="lcRowBody"><b>App-Sperre</b><small>beim Öffnen nach PIN fragen</small></div>
          ${sw('appLock', lock.enabled === true)}
        </div>
        <div class="lcRow">
          <div class="lcRowBody"><b>Biometrie</b><small>Fingerabdruck / Face ID</small></div>
          ${sw('biometric', lock.allowBiometric === true)}
        </div>
        <div class="lcRow">
          <div class="lcRowBody"><b>Screenshots blockieren</b><small>FLAG_SECURE in der App</small></div>
          ${sw('screenshotBlock', lock.screenshotBlock === true)}
        </div>
        <div class="lcGroupH" style="padding-bottom:4px"><span>Automatisch sperren</span></div>
        ${seg('autoLockMinutes', lock.autoLockMinutes, (lock.choices || [1, 5, 30, 60]), { 0: 'Sofort', 1: '1 Min', 5: '5 Min', 30: '30 Min', 60: '60 Min' })}
        <div class="lcNotice">Der Server speichert keine Fingerabdrücke — nur diese Schalter.</div>
      </div>

      <div class="lcGroup">
        <div class="lcGroupH"><span>Datenschutz</span></div>
        <div class="lcRow"><div class="lcRowBody"><b>Status</b><small>wer sieht meinen Status</small></div></div>
        ${seg('statusPrivacy', pv.statusPrivacy, (ST.privacy && ST.privacy.choices && ST.privacy.choices.statusPrivacy) || ['all', 'contacts', 'selected', 'except', 'nobody'], LABELS)}
        <div class="lcRow"><div class="lcRowBody"><b>Wer darf mich anrufen</b><small>Anrufe</small></div></div>
        ${seg('callsPrivacy', pv.callsPrivacy, (ST.privacy && ST.privacy.choices && ST.privacy.choices.callsPrivacy) || ['all', 'contacts', 'nobody'], LABELS)}
        <div class="lcRow"><div class="lcRowBody"><b>Wer darf mich zur Gruppe hinzufügen</b><small>Gruppen</small></div></div>
        ${seg('groupAddPrivacy', pv.groupAddPrivacy, (ST.privacy && ST.privacy.choices && ST.privacy.choices.groupAddPrivacy) || ['all', 'contacts', 'nobody'], LABELS)}
        <div class="lcRow"><div class="lcRowBody"><b>Standort teilen</b><small>Live-Standort</small></div></div>
        ${seg('liveLocationPrivacy', pv.liveLocationPrivacy, (ST.privacy && ST.privacy.choices && ST.privacy.choices.liveLocationPrivacy) || ['all', 'contacts', 'nobody'], LABELS)}
      </div>

      <div class="lcGroup">
        <div class="lcGroupH"><span>Verschlüsseltes Backup</span></div>
        <div class="lcRow">
          <div class="lcRowBody"><b>AES-256-GCM</b><small>Profil + Einstellungen · nie Passwort oder 2FA</small></div>
          <button class="lcSoundPick" data-backup="1">Erstellen</button>
        </div>
        <button class="lcBtnGhost" data-restore="1">Backup einspielen …</button>
        <div class="lcNotice">Die Datei ist ohne den Server-Schlüssel nicht lesbar.</div>
      </div>

      <div class="lcGroup">
        <div class="lcGroupH"><span>Sicherheitscode</span></div>
        <div class="lcRow"><div class="lcRowBody"><b>60 Ziffern</b><small>mit einer Person vergleichen</small></div></div>
        <input class="chInput" id="lcSafeUser" placeholder="Benutzername (z. B. lovebot)" style="width:100%">
        <button class="lcBtnWide" data-safety="1">Code anzeigen</button>
        <div id="lcSafeOut"></div>
      </div>
    `;
  }

  function soundsHtml() {
    const groups = {};
    for (const s of ST.sounds) (groups[s.pack] = groups[s.pack] || []).push(s);
    const PACKNAME = { love: '💗 Love', kawaii: '✨ Kawaii', neon: '⚡ Neon', chill: '🌿 Chill', fun: '😂 Fun', lovechen: '🩷 Lovechen Spezial' };
    const order = ['lovechen', 'love', 'kawaii', 'neon', 'chill', 'fun'];

    const blocks = order.filter((p) => groups[p]).map((p) => `
      <div class="lcGroup">
        <div class="lcGroupH"><span>${esc(PACKNAME[p] || p)}</span><span>${groups[p].length} Töne</span></div>
        ${groups[p].map((s) => `
          <div class="lcSound">
            <button class="lcSoundPlay" data-play="${esc(s.id)}" title="Anhören">▶</button>
            <div class="lcSoundName">${esc(s.name)}</div>
            <button class="lcSoundPick${ST.mine.default === s.id ? ' on' : ''}" data-pick="${esc(s.id)}">${ST.mine.default === s.id ? 'gewählt ✓' : 'wählen'}</button>
          </div>`).join('')}
      </div>`).join('');

    return `
      <div class="lcGroup">
        <div class="lcGroupH"><span>Lautstärke</span><span id="lcVolVal">${Math.round((ST.mine.vol || 0.5) * 100)}%</span></div>
        <input type="range" min="0" max="100" value="${Math.round((ST.mine.vol || 0.5) * 100)}" id="lcVol" style="width:100%;accent-color:#ff4da6">
        <div class="lcRow">
          <div class="lcRowBody"><b>Vibration</b><small>beim Ton mitvibrieren</small></div>
          ${sw('vibrate', ST.mine.vibrate !== false)}
        </div>
      </div>

      <div class="lcGroup">
        <div class="lcGroupH"><span>Klingeltöne (Anrufe)</span><span>${ST.ringtones.length}</span></div>
        ${ST.ringtones.map((r) => `
          <div class="lcSound">
            <button class="lcSoundPlay" data-play="${esc(r.id)}" title="Anhören">▶</button>
            <div class="lcSoundName">${esc(r.name)}</div>
            <button class="lcSoundPick${ST.mine.ringtone === r.id ? ' on' : ''}" data-ring="${esc(r.id)}">${ST.mine.ringtone === r.id ? 'gewählt ✓' : 'wählen'}</button>
          </div>`).join('')}
      </div>

      ${blocks}
      <div class="lcNotice">${ST.sounds.length} Töne gesamt — 30 alte + 10 neue Lovechen-Töne. Gespielt über WebAudio, keine MP3 nötig.</div>
    `;
  }

  /* ---------------- Ansicht ---------------- */
  let currentPane = 'security';

  async function openCenter(pane) {
    injectCss();
    currentPane = pane || 'security';
    let host = document.getElementById('lcSecView');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lcSecView';
      document.body.appendChild(host);
    }
    host.classList.remove('hidden');
    host.innerHTML = '<div class="lcSecHead"><button class="lcSecClose" id="lcSecClose">✕</button><div class="lcSecTitle">Sicherheit</div></div><div class="lcSecScroll"><div class="tabLoading">wird geladen …</div></div>';

    await loadAll();

    host.innerHTML = `
      <div class="lcSecHead">
        <button class="lcSecClose" id="lcSecClose">✕</button>
        <div class="lcSecTitle">${currentPane === 'sounds' ? 'Töne 🎵' : 'Sicherheit 🔒'}</div>
        <button class="lcSecClose" id="lcPaneSwitch" title="wechseln">${currentPane === 'sounds' ? '🔒' : '🎵'}</button>
      </div>
      <div class="lcSecScroll">${currentPane === 'sounds' ? soundsHtml() : securityHtml()}</div>`;

    wire(host);
  }

  function closeCenter() {
    const h = document.getElementById('lcSecView');
    if (h) h.classList.add('hidden');
  }

  function wire(host) {
    const close = document.getElementById('lcSecClose');
    if (close) close.onclick = closeCenter;
    const sw2 = document.getElementById('lcPaneSwitch');
    if (sw2) sw2.onclick = () => openCenter(currentPane === 'sounds' ? 'security' : 'sounds');

    /* --- Schalter --- */
    host.querySelectorAll('[data-sw]').forEach((el) => {
      el.onclick = async () => {
        const id = el.dataset.sw;
        el.classList.toggle('on');
        const on = el.classList.contains('on');
        try {
          if (id === 'appLock') await api('/v426/lock', { method: 'POST', body: { enabled: on } });
          else if (id === 'biometric') await api('/v426/lock', { method: 'POST', body: { allowBiometric: on } });
          else if (id === 'screenshotBlock') await api('/v426/lock', { method: 'POST', body: { screenshotBlock: on } });
          else if (id === 'vibrate') {
            await api('/v426/sounds', { method: 'POST', body: { vibrate: on } });
            ST.mine.vibrate = on;
          }
          if (id !== 'vibrate') await openCenter(currentPane);
        } catch (e) {
          el.classList.toggle('on');
          toast('💔', 'Schalter', e.message);
        }
      };
    });

    /* --- Segmente (Datenschutz + Sperrzeit) --- */
    host.querySelectorAll('[data-seg]').forEach((b) => {
      b.onclick = async () => {
        const key = b.dataset.seg, val = b.dataset.val;
        try {
          if (key === 'autoLockMinutes') await api('/v426/lock', { method: 'POST', body: { autoLockMinutes: Number(val) } });
          else await api('/v426/privacy', { method: 'POST', body: { [key]: val } });
          await openCenter(currentPane);
        } catch (e) { toast('💔', 'Datenschutz', e.message); }
      };
    });

    /* --- Töne: anhören --- */
    host.querySelectorAll('[data-play]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.play;
        const s = ST.sounds.find((x) => x.id === id) || ST.ringtones.find((x) => x.id === id);
        if (!s) return;
        b.classList.add('on');
        play(s);
        setTimeout(() => b.classList.remove('on'), Math.max(400, (s.dur || 0.3) * 1000 + 200));
      };
    });

    /* --- Ton / Klingelton wählen --- */
    host.querySelectorAll('[data-pick]').forEach((b) => {
      b.onclick = async () => {
        try {
          await api('/v426/sounds', { method: 'POST', body: { default: b.dataset.pick } });
          const s = ST.sounds.find((x) => x.id === b.dataset.pick);
          if (s) play(s);
          await openCenter('sounds');
          toast('🎵', 'Ton gewählt', b.dataset.pick);
        } catch (e) { toast('💔', 'Ton', e.message); }
      };
    });
    host.querySelectorAll('[data-ring]').forEach((b) => {
      b.onclick = async () => {
        try {
          await api('/v426/sounds', { method: 'POST', body: { ringtone: b.dataset.ring } });
          const s = ST.ringtones.find((x) => x.id === b.dataset.ring);
          if (s) play(s);
          await openCenter('sounds');
        } catch (e) { toast('💔', 'Klingelton', e.message); }
      };
    });

    /* --- Lautstärke --- */
    const vol = document.getElementById('lcVol');
    if (vol) {
      vol.oninput = () => {
        const out = document.getElementById('lcVolVal');
        if (out) out.textContent = vol.value + '%';
      };
      vol.onchange = async () => {
        try {
          await api('/v426/sounds', { method: 'POST', body: { vol: Number(vol.value) / 100 } });
          ST.mine.vol = Number(vol.value) / 100;
        } catch (e) { toast('💔', 'Lautstärke', e.message); }
      };
    }

    /* --- Backup --- */
    const bk = host.querySelector('[data-backup]');
    if (bk) {
      bk.onclick = async () => {
        try {
          bk.textContent = '…';
          const d = await api('/v426/backup', { method: 'POST', body: {} });
          // Als Datei anbieten
          const blob = new Blob([d.sealed], { type: 'text/plain' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'lovechat-backup-' + new Date().toISOString().slice(0, 10) + '.lcbackup';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          toast('🔐', 'Backup', `${d.counts.chats} Chats · ${d.plainBytes} B → ${d.bytes} B verschlüsselt`);
          await openCenter('security');
        } catch (e) { bk.textContent = 'Erstellen'; toast('💔', 'Backup', e.message); }
      };
    }
    const rs = host.querySelector('[data-restore]');
    if (rs) {
      rs.onclick = async () => {
        const sealed = prompt('Verschlüsseltes Backup einfügen (beginnt mit v1.):');
        if (!sealed) return;
        try {
          const d = await api('/v426/backup/restore', { method: 'POST', body: { sealed: sealed.trim() } });
          toast('✅', 'Wiederhergestellt', (d.applied || []).join(', '));
          await openCenter('security');
        } catch (e) { toast('💔', 'Wiederherstellen', e.message); }
      };
    }

    /* --- Sicherheitscode --- */
    const sc = host.querySelector('[data-safety]');
    if (sc) {
      sc.onclick = async () => {
        const name = (document.getElementById('lcSafeUser') || {}).value || '';
        const out = document.getElementById('lcSafeOut');
        if (!name.trim()) { toast('🙂', 'Sicherheitscode', 'Bitte einen Benutzernamen eingeben'); return; }
        try {
          // Benutzername → ID
          // 🔴 Vorher stand hier /api/users/search — die Route gibt es NICHT
          //    (gemessen: grep api/users/search → 0 Treffer). Die echte Route
          //    ist /api/search (server.js:1158), gleiche Antwortform {users:[…]}.
          const r = await fetch('/api/search?q=' + encodeURIComponent(name.trim()), {
            headers: { Authorization: 'Bearer ' + (localStorage.getItem('lc_token') || '') },
          });
          const j = await r.json();
          const hit = (j.users || []).find((u) => u.username === name.trim().toLowerCase()) || (j.users || [])[0];
          if (!hit) { out.innerHTML = '<div class="lcNotice">Kein Nutzer gefunden 💔</div>'; return; }
          const d = await api('/v426/safety-code/' + hit.id);
          out.innerHTML = `<div class="lcSafeCode">${esc(d.code)}</div>
            <div class="lcNotice">Beide Seiten sehen denselben Code. Stimmt er nicht überein, ist etwas faul.</div>`;
        } catch (e) { out.innerHTML = '<div class="lcNotice">' + esc(e.message) + '</div>'; }
      };
    }
  }

  /* ---------------- Einstiegskarte (Profil) ---------------- */
  async function mountCard() {
    if (document.getElementById('lcSecBtn')) return;
    // Die Profilseite hat einen Scroll-Container; wir hängen uns an den
    // ersten Block, der „SICHERHEIT" oder „PERSÖNLICH" enthält.
    // 🔴 Vorher: /^SICHERHEIT/i auf JEDEM div/h3/section. Dadurch passte auch
    //    „Sicherheit: ausbaufähig" im eigenen Dialog → die Karte hängte sich
    //    in #lcSecView selbst ein und stand doppelt im Text.
    //    Jetzt: nur echte Abschnitts-Überschriften der Profilseite.
    const nodes = Array.from(document.querySelectorAll('div,h3,h4,section'));
    const anchor = nodes.find((n) => {
      if (n.closest('#lcSecView')) return false;            // nie im eigenen Dialog
      const t = (n.innerText || '').trim();
      if (!/^SICHERHEIT$/.test(t)) return false;            // nur die exakte Zeile
      return n.children.length <= 3 && t.length <= 14;
    });
    if (!anchor) return;
    let sec = { score: 0 };
    try { sec = await api('/v426/security'); } catch (e) {}
    const card = document.createElement('div');
    card.className = 'lcSecCard';
    card.id = 'lcSecBtn';
    card.innerHTML = `
      <div class="lcSecIcon">🔒</div>
      <div class="lcSecBody"><b>Sicherheit &amp; Töne</b><small>2FA · Sperre · Datenschutz · 40 Töne</small></div>
      <div class="lcSecScore">${sec.score || 0}</div>`;
    card.onclick = () => openCenter('security');
    anchor.parentNode.insertBefore(card, anchor);
  }

  function watch() {
    const obs = new MutationObserver(() => { mountCard(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(mountCard, 1200);
    setTimeout(mountCard, 3000);
  }

  document.addEventListener('DOMContentLoaded', () => { injectCss(); watch(); });
  setTimeout(() => { injectCss(); watch(); }, 700);

  window.LC426 = {
    open: openCenter,
    close: closeCenter,
    play,
    state: ST,
    load: loadAll,
    mountCard,
  };
})();
