/* =====================================================================
 *  📱 v428.js — Anmeldung wie WhatsApp (Oberfläche)
 * ---------------------------------------------------------------------
 *  Fünf Bildschirme, in genau der Reihenfolge wie in der WhatsApp-App:
 *
 *    ① Start      Logo · Name · „Zustimmen und fortfahren"
 *    ② Nummer     Ländervorwahl + Nummer
 *    ③ Code       6 Kästchen, „Code erneut senden", Countdown
 *    ④ Profil     Foto (Kreis mit Kamera) + Name
 *    ⑤ drin
 *
 *  Der alte Anmelde-Bildschirm (Benutzername + Passwort) bleibt als
 *  Notausgang erreichbar — „Mit Passwort anmelden" unten auf ①.
 *  Sonst käme niemand mehr in ein Konto, das vor dieser Version entstand.
 * ===================================================================== */
(function () {
  'use strict';

  const S428 = {
    step: 'start',
    phone: '',
    cc: '+49',
    mode: 'signup',
    signupToken: '',
    avatar: '',
    sending: false,
    countdown: 0,
    timer: null,
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  /* Kamera-Symbol als SVG — das Emoji 📷 fehlt in manchen Systemen (leeres Kästchen) */
  const CAM_SVG = `<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#c2187a" stroke-width="1.7"
             stroke-linecap="round" stroke-linejoin="round" opacity=".55">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/></svg>`;

  const LAENDER = [
    ['+49', '🇩🇪', 'Deutschland'],
    ['+91', '🇮🇳', 'Indien'],
    ['+43', '🇦🇹', 'Österreich'],
    ['+41', '🇨🇭', 'Schweiz'],
    ['+31', '🇳🇱', 'Niederlande'],
    ['+48', '🇵🇱', 'Polen'],
    ['+90', '🇹🇷', 'Türkei'],
    ['+1', '🇺🇸', 'USA'],
    ['+44', '🇬🇧', 'UK'],
  ];

  /* ---------------- CSS ---------------- */
  function css() {
    if (document.getElementById('v428css')) return;
    const el = document.createElement('style');
    el.id = 'v428css';
    el.textContent = `
#waOnboard{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;
  background:linear-gradient(170deg,#fff5fa 0%,#ffe9f5 42%,#f3e6ff 100%);
  font-family:'Quicksand',system-ui,sans-serif;overflow-y:auto}
#waOnboard.hidden{display:none}
.waGlow{position:fixed;pointer-events:none;border-radius:50%;filter:blur(60px);opacity:.55}
.waGlow.a{width:340px;height:340px;background:#ffb3d9;top:-120px;left:-90px}
.waGlow.b{width:320px;height:320px;background:#d9b3ff;bottom:-140px;right:-100px}
.waWrap{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:28px 22px calc(22px + env(safe-area-inset-bottom));max-width:440px;
  margin:0 auto;width:100%}
.waStep{width:100%;animation:waIn .28s ease both}
@keyframes waIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
.waLogo{width:96px;height:96px;border-radius:30px;margin:0 auto 18px;display:block;
  box-shadow:0 16px 40px rgba(255,77,166,.42);border:3px solid #fff}
.waH1{font-family:'Baloo 2',cursive;font-size:30px;font-weight:900;text-align:center;
  background:linear-gradient(135deg,#ff4da6,#b06bff);-webkit-background-clip:text;
  background-clip:text;color:transparent;margin:0 0 6px}
.waSub{text-align:center;color:#a5748f;font-size:13.5px;font-weight:700;line-height:1.55;margin:0 0 26px}
.waBtn{width:100%;padding:15px;border-radius:16px;border:none;font-size:15px;font-weight:900;
  color:#fff;background:linear-gradient(135deg,#ff4da6,#b06bff);
  box-shadow:0 10px 26px rgba(255,77,166,.42);letter-spacing:.2px}
.waBtn:disabled{opacity:.5;box-shadow:none}
.waBtn.ghost{background:#fff;color:#e6197d;border:2px solid #ffd9ec;box-shadow:none}
.waLink{display:block;width:100%;text-align:center;margin-top:16px;background:none;border:none;
  color:#a5748f;font-size:12.5px;font-weight:800;text-decoration:underline;text-underline-offset:3px}
.waLegal{background:rgba(255,255,255,.72);border:1.5px solid #ffe0ef;border-radius:16px;
  padding:14px 16px;margin-bottom:22px}
.waLegal p{margin:0 0 9px;font-size:12px;line-height:1.6;color:#6d4a63;font-weight:600}
.waLegal p:last-child{margin:0}
.waLegal b{color:#c2187a}
.waTitle{font-family:'Baloo 2',cursive;font-size:21px;font-weight:900;color:#7b2ff7;
  text-align:center;margin:0 0 8px}
.waNote{text-align:center;color:#a5748f;font-size:12.5px;font-weight:700;line-height:1.6;
  margin:0 0 22px}
.waField{display:flex;gap:9px;margin-bottom:14px}
.waSelect{flex:0 0 auto;padding:14px 10px;border-radius:14px;border:2px solid #ffd9ec;
  background:#fff;font-size:14.5px;font-weight:800;color:#43203a;font-family:inherit}
.waInput{flex:1;min-width:0;padding:14px 16px;border-radius:14px;border:2px solid #ffd9ec;
  background:#fff;font-size:16px;font-weight:700;color:#43203a;outline:none;font-family:inherit}
.waInput:focus{border-color:#ff8fc8;box-shadow:0 0 0 4px rgba(255,77,166,.13)}
.waInput::placeholder{color:#c9a3ba;font-weight:600}
.waErr{background:#fff0f3;border:1.5px solid #ffc2d4;color:#c2185b;border-radius:12px;
  padding:11px 14px;font-size:12.5px;font-weight:800;margin-bottom:14px;line-height:1.5}
.waOk{background:#f2fff9;border:1.5px solid #b7efd6;color:#0a8f5d;border-radius:12px;
  padding:11px 14px;font-size:12.5px;font-weight:800;margin-bottom:14px}
.waCodes{display:flex;gap:8px;justify-content:center;margin:6px 0 20px}
.waCodes input{width:44px;height:56px;text-align:center;font-size:23px;font-weight:900;
  color:#c2187a;border:2.5px solid #ffd9ec;border-radius:14px;background:#fff;outline:none;
  font-family:inherit;transition:.15s}
.waCodes input:focus{border-color:#ff4da6;box-shadow:0 0 0 4px rgba(255,77,166,.16);transform:translateY(-2px)}
.waCodes input.filled{background:#fff2f9;border-color:#ff9dcb}
.waAv{width:132px;height:132px;border-radius:50%;margin:0 auto 10px;position:relative;
  background:linear-gradient(160deg,#ffe3f1,#f2e2ff);border:3px dashed #ffb3d9;
  display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer}
.waAv img{width:100%;height:100%;object-fit:cover}
.waAv .ph{font-size:44px;opacity:.55}
.waAv .cam{position:absolute;right:-2px;bottom:-2px;width:42px;height:42px;border-radius:50%;
  background:linear-gradient(135deg,#ff4da6,#b06bff);color:#fff;display:flex;align-items:center;
  justify-content:center;font-size:18px;border:3px solid #fff;box-shadow:0 6px 16px rgba(255,77,166,.4)}
.waHint{font-size:11.5px;color:#a5748f;font-weight:700;text-align:center;
  line-height:1.6;margin:14px 0 0}
.waDots{display:flex;gap:7px;justify-content:center;margin-top:26px}
.waDots i{width:7px;height:7px;border-radius:50%;background:#ffd0e6}
.waDots i.on{background:#ff4da6;box-shadow:0 0 8px rgba(255,77,166,.7)}
/* V4.29: war position:absolute/top:14px — lag dadurch mitten auf dem Logo.
   Jetzt normal im Fluss, oben über dem Logo. */
.waBanner{display:block;text-align:center;font-size:11px;margin:0 0 14px;
  font-weight:900;color:#c2187a;letter-spacing:.06em;text-transform:uppercase}
.waBack{position:absolute;top:10px;left:12px;width:40px;height:40px;border-radius:50%;
  background:rgba(255,255,255,.85);border:1.5px solid #ffd9ec;font-size:17px;color:#c2187a}
`;
    document.head.appendChild(el);
  }

  /* ---------------- Grundgerüst ---------------- */
  function mount() {
    if (document.getElementById('waOnboard')) return document.getElementById('waOnboard');
    css();
    const d = document.createElement('div');
    d.id = 'waOnboard';
    d.innerHTML = '<div class="waGlow a"></div><div class="waGlow b"></div><div class="waWrap" id="waWrap"></div>';
    document.body.appendChild(d);
    return d;
  }

  function show() {
    const el = mount();
    el.classList.remove('hidden');
    // Der alte Anmeldebildschirm bleibt im Hintergrund, aber unsichtbar
    const auth = document.getElementById('authScreen');
    if (auth) auth.style.visibility = 'hidden';
    render();
  }
  function hide() {
    const el = document.getElementById('waOnboard');
    if (el) el.classList.add('hidden');
    const auth = document.getElementById('authScreen');
    if (auth) auth.style.visibility = '';
    if (S428.timer) { clearInterval(S428.timer); S428.timer = null; }
  }

  function dots(step) {
    const order = ['start', 'phone', 'code', 'profile'];
    return '<div class="waDots">' + order.map((s) => `<i class="${s === step ? 'on' : ''}"></i>`).join('') + '</div>';
  }

  function render() {
    const wrap = document.getElementById('waWrap');
    if (!wrap) return;
    if (S428.step === 'start') wrap.innerHTML = stepStart();
    else if (S428.step === 'phone') wrap.innerHTML = stepPhone();
    else if (S428.step === 'code') wrap.innerHTML = stepCode();
    else if (S428.step === 'profile') wrap.innerHTML = stepProfile();
    wire();
  }

  /* ---------------- ① Start ---------------- */
  function stepStart() {
    return `<div class="waStep">
      <div class="waBanner">LoveChat · V4.29</div>
      <img class="waLogo" src="/icon-512.png" alt="LoveChat">
      <h1 class="waH1">LoveChat</h1>
      <p class="waSub">Einfach. Sicher. Pink. 💗<br>Dein eigener Messenger.</p>
      <div class="waLegal">
        <p><b>1.</b> Anmelden mit deiner Nummer — der Code kommt per WhatsApp.</p>
        <p><b>2.</b> Deine Nummer steht in <b>keinem</b> Profil. Andere sehen nur deinen Namen.</p>
        <p><b>3.</b> Den Code speichern wir nur als Hash — nie im Klartext.</p>
      </div>
      <button class="waBtn" id="waGo">Mit Telefonnummer anmelden oder registrieren</button>
      <p class="waHint">Bekannte Nummern werden angemeldet, neue Nummern registriert.</p>
      <button class="waLink" id="waPw">Mit Passwort anmelden</button>
      ${dots('start')}
    </div>`;
  }

  /* ---------------- ② Nummer ---------------- */
  function stepPhone() {
    return `<div class="waStep">
      <button class="waBack" id="waBack">←</button>
      <h2 class="waTitle">Deine Telefonnummer</h2>
      <p class="waNote">LoveChat schickt dir einen Code per WhatsApp.<br>
        Es können Gebühren deines Anbieters anfallen.</p>
      <div class="waField">
        <select class="waSelect" id="waCC">${LAENDER.map(([cc, fl, n]) =>
          `<option value="${cc}"${cc === S428.cc ? ' selected' : ''}>${fl} ${cc}</option>`).join('')}</select>
        <input class="waInput" id="waNum" type="tel" inputmode="tel" autocomplete="tel"
               placeholder="+49 151 55894714" value="${esc(S428.phone)}">
      </div>
      <div id="waMsg"></div>
      <button class="waBtn" id="waNext">Weiter</button>
      <p class="waHint">Du kannst die ganze Nummer einfügen — auch mit +49 davor.</p>
      ${dots('phone')}
    </div>`;
  }

  /* ---------------- ③ Code ---------------- */
  function stepCode() {
    return `<div class="waStep">
      <button class="waBack" id="waBack">←</button>
      <h2 class="waTitle">Code eingeben</h2>
      <p class="waNote">Wir haben dir einen 6-stelligen Code<br>
        per WhatsApp an <b>${esc(S428.phone)}</b> geschickt.</p>
      <div class="waCodes" id="waCodes">
        ${[0, 1, 2, 3, 4, 5].map((i) => `<input maxlength="1" inputmode="numeric" data-i="${i}" aria-label="Ziffer ${i + 1}">`).join('')}
      </div>
      <div id="waMsg"></div>
      <button class="waBtn" id="waVerify">Bestätigen</button>
      <button class="waLink" id="waResend">Code nicht bekommen? Neu senden</button>
      ${dots('code')}
    </div>`;
  }

  /* ---------------- ④ Profil ---------------- */
  function stepProfile() {
    return `<div class="waStep">
      <h2 class="waTitle">Profil einrichten</h2>
      <p class="waNote">So sehen dich deine Kontakte.</p>
      <input type="file" id="waFile" accept="image/*" style="display:none">
      <div class="waAv" id="waAv" title="Profilbild wählen">
        ${S428.avatar ? `<img src="${esc(S428.avatar)}" alt="">` : '<span class="ph">' + CAM_SVG + '</span>'}
        <span class="cam">＋</span>
      </div>
      <p class="waHint" style="margin:0 0 16px">Tippe auf den Kreis für ein Profilbild</p>
      <div class="waField" style="margin-top:4px">
        <input class="waInput" id="waName" maxlength="30" placeholder="Dein Name" autocomplete="name"
               value="${esc(S428.name || '')}">
      </div>
      <div id="waMsg"></div>
      <button class="waBtn" id="waFinish">Fertig</button>
      <p class="waHint">Kein Passwort, keine E-Mail nötig. Nur dein Name.</p>
      ${dots('profile')}
    </div>`;
  }

  /* ---------------- Verdrahtung ---------------- */
  function wire() {
    const $ = (id) => document.getElementById(id);
    const msg = (html) => { const m = $('waMsg'); if (m) m.innerHTML = html; };
    const err = (t) => msg(`<div class="waErr">${esc(t)}</div>`);
    const ok = (t) => msg(`<div class="waOk">${esc(t)}</div>`);

    if (S428.step === 'start') {
      $('waGo').onclick = () => { S428.step = 'phone'; render(); };
      $('waPw').onclick = () => {
        hide();
        if (typeof switchAuthTab === 'function') { try { switchAuthTab(true); } catch (e) {} }
      };
    }

    if (S428.step === 'phone') {
      const num = $('waNum');
      num.focus();
      $('waBack').onclick = () => { S428.step = 'start'; render(); };
      const go = async () => {
        const btn = $('waNext');
        const cc = $('waCC').value;
        const typed = String(num.value || '').trim();

        /* 🔴 V4.29 — Hier stand nur `replace(/[^\d]/g,'')`. Wer die Nummer
         * KOMPLETT einfügt („+49 151 55894714", so wie sie im Adressbuch
         * steht), bekam die Vorwahl doppelt: +49 + 4915155894714 =
         * +494915155894714. Niemand hätte sich anmelden können.
         * Jetzt: führendes + oder 00 → die Nummer ist schon international. */
        let phone;
        if (/^(\+|00)/.test(typed)) {
          phone = typed.replace(/[^\d+]/g, '');
          if (phone.startsWith('00')) phone = '+' + phone.slice(2);
          // Anzeige der Vorwahl mitziehen, damit beides zusammenpasst
          const sel = $('waCC');
          const hit = Array.from(sel.options).find((o) => phone.startsWith(o.value));
          if (hit) sel.value = hit.value;
        } else {
          const raw = typed.replace(/[^\d]/g, '');
          if (raw.length < 6) return err('Bitte die ganze Nummer eingeben, z. B. 1234 56789.');
          // Führende 0 nach der Ländervorwahl weg — wie WhatsApp
          const digits = raw.replace(/^0+/, '');
          phone = cc + digits;
        }
        if (!/^\+\d{8,16}$/.test(phone)) return err('Diese Nummer sieht nicht richtig aus.');
        S428.phone = phone;
        btn.disabled = true; btn.textContent = 'Code wird geschickt …';
        try {
          const r = await fetch('/api/v428/onboarding/request', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
          S428.mode = d.mode;
          S428.step = 'code';
          render();
          if (d.simulated) {
            setTimeout(() => {
              const m = document.getElementById('waMsg');
              if (m) m.innerHTML = '<div class="waOk">🧪 Testmodus: Code liegt in <b>data/wa-outbox.jsonl</b></div>';
            }, 60);
          }
        } catch (e) {
          btn.disabled = false; btn.textContent = 'Weiter';
          err(e.message);
        }
      };
      $('waNext').onclick = go;
      num.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    }

    if (S428.step === 'code') {
      const boxes = Array.from(document.querySelectorAll('#waCodes input'));
      boxes[0].focus();
      boxes.forEach((b, i) => {
        b.oninput = () => {
          b.value = b.value.replace(/\D/g, '').slice(0, 1);
          b.classList.toggle('filled', !!b.value);
          if (b.value && i < 5) boxes[i + 1].focus();
          if (boxes.every((x) => x.value)) setTimeout(() => $('waVerify').click(), 120);
        };
        b.onkeydown = (e) => {
          if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus();
        };
        b.onpaste = (e) => {
          const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
          if (t.length >= 6) {
            e.preventDefault();
            t.slice(0, 6).split('').forEach((ch, k) => { boxes[k].value = ch; boxes[k].classList.add('filled'); });
            boxes[5].focus();
          }
        };
      });
      $('waBack').onclick = () => { S428.step = 'phone'; render(); };
      $('waVerify').onclick = async () => {
        const code = boxes.map((b) => b.value).join('');
        if (code.length !== 6) return err('Es fehlen noch Ziffern.');
        const btn = $('waVerify');
        btn.disabled = true; btn.textContent = 'prüfe …';
        try {
          const r = await fetch('/api/v428/onboarding/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: S428.phone, code }),
          });
          const d = await r.json();
          /* 🚫 V4.30 — Gesperrtes Konto: der Ban-Screen erklärt Grund und
           * Dauer und nimmt den Einspruch an. Vorher stand hier nur die
           * Fehlermeldung als roter Text. */
          if (r.status === 403 && d.code === 'banned' && d.ban && typeof showBanScreen === 'function') {
            hide();
            showBanScreen(d.ban, { login: S428.phone });
            return;
          }
          if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
          if (d.mode === 'login') {
            localStorage.setItem('lc_token', d.token);
            if (typeof S !== 'undefined') S.token = d.token;
            hide();
            if (typeof enterApp === 'function') await enterApp(d.user);
            return;
          }
          S428.signupToken = d.signupToken;
          S428.step = 'profile';
          render();
        } catch (e) {
          btn.disabled = false; btn.textContent = 'Bestätigen';
          err(e.message);
        }
      };
      $('waResend').onclick = async () => {
        try {
          const r = await fetch('/api/v428/onboarding/request', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: S428.phone }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
          ok('Neuer Code ist unterwegs.');
        } catch (e) { err(e.message); }
      };
    }

    if (S428.step === 'profile') {
      const nameEl = $('waName');
      if (nameEl) nameEl.focus();
      $('waAv').onclick = () => $('waFile').click();
      $('waFile').onchange = async (ev) => {
        const f = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!f) return;
        if (f.size > 15 * 1048576) return err('Das Bild ist größer als 15 MB.');
        const av = $('waAv');
        av.innerHTML = '<span class="ph">…</span>';
        try {
          const dataUrl = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result));
            fr.onerror = () => rej(new Error('Bild nicht lesbar'));
            fr.readAsDataURL(f);
          });
          // Über V4.27 hochladen → /media/… (nicht als Base64 in die DB)
          const r = await fetch('/api/v427/media', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl, name: f.name, mime: f.type || 'image/jpeg' }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
          S428.avatar = d.url;
          av.innerHTML = `<img src="${esc(d.url)}" alt=""><span class="cam">＋</span>`;
        } catch (e) {
          av.innerHTML = '<span class="ph">' + CAM_SVG + '</span><span class="cam">＋</span>';
          err(e.message);
        }
      };
      $('waFinish').onclick = async () => {
        const name = $('waName').value.trim();
        if (name.length < 2) return err('Bitte einen Namen mit mindestens 2 Zeichen.');
        const btn = $('waFinish');
        btn.disabled = true; btn.textContent = 'Konto wird erstellt …';
        try {
          const p = await fetch('/api/v428/onboarding/profile', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signupToken: S428.signupToken, displayName: name, avatar: S428.avatar || '' }),
          });
          const pd = await p.json();
          if (!p.ok) throw new Error(pd.error || ('HTTP ' + p.status));

          const f = await fetch('/api/v428/onboarding/finish', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signupToken: S428.signupToken }),
          });
          const fd = await f.json();
          if (!f.ok) throw new Error(fd.error || ('HTTP ' + f.status));

          localStorage.setItem('lc_token', fd.token);
          if (typeof S !== 'undefined') S.token = fd.token;
          hide();
          if (typeof enterApp === 'function') await enterApp(fd.user);
        } catch (e) {
          btn.disabled = false; btn.textContent = 'Fertig';
          err(e.message);
        }
      };
    }
  }

  /* ---------------- Abzeichen: Owner · verifiziert · VIP ----------------
   * Blauer Haken EXAKT #1D9BF0 (so war es bestellt), Owner golden,
   * VIP pink. Alles inline — die App lädt kein fremdes CSS. */
  const CHECK_SVG = (c) => `<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:-2px" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="${c}"/>
      <path d="M6.8 12.4l3.3 3.3 7-7.4" fill="none" stroke="#fff" stroke-width="2.6"
            stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function badgeRow(u) {
    const pills = [];
    if (u.owner) {
      pills.push(`<span style="display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,#ffe9a8,#ffd166);
        color:#7a5200;border:1.5px solid #f0b93b;border-radius:999px;padding:3px 11px;font-size:12px;font-weight:900">
        👑 Owner</span>`);
    }
    if (u.verified) {
      pills.push(`<span style="display:inline-flex;align-items:center;gap:5px;background:#eaf6ff;
        color:#0b63a3;border:1.5px solid #b6e0fb;border-radius:999px;padding:3px 11px;font-size:12px;font-weight:900">
        ${CHECK_SVG('#1D9BF0')} verifiziert</span>`);
    }
    if (u.vip) {
      pills.push(`<span style="display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,#ff4da6,#b86bff);
        color:#fff;border-radius:999px;padding:3px 11px;font-size:12px;font-weight:900;
        box-shadow:0 4px 14px rgba(255,77,166,.45)">👑 VIP</span>`);
    }
    if (!pills.length) return '';
    return `<div style="display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:9px">${pills.join('')}</div>`;
  }

  /* ---------------- Fünfter Reiter: Profil ---------------- */
  function profileTab() {
    if (typeof S === 'undefined' || !S.user) return;
    const u = S.user;
    const av = u.avatar && (/^(\/media\/|\/assets\/|data:image\/|https?:)/.test(String(u.avatar)))
      ? `<img src="${esc(u.avatar)}" alt="">`
      : esc(u.avatar || '💗');
    const html = `
      <div style="padding:18px 16px 90px">
        <div style="text-align:center;margin-bottom:16px">
          <div class="waAv" style="width:118px;height:118px;cursor:default">
            ${av}
          </div>
          <div style="font-family:'Baloo 2',cursive;font-size:20px;font-weight:900;color:#43203a;margin-top:10px">
            ${esc(u.displayName)}
          </div>
          <div style="font-size:12.5px;color:#a5748f;font-weight:800;margin-top:2px">
            @${esc(u.username)}${u.phone ? ' · ' + esc(u.phone) : ''}
          </div>
          ${badgeRow(u)}
          <div style="font-size:12.5px;color:#8b5a76;font-weight:700;margin-top:8px;line-height:1.5">
            ${esc(u.bio || 'Noch keine Info — tippe auf „Info bearbeiten"')}
          </div>
        </div>
        <div style="background:#fff;border:2px solid #ffd9ec;border-radius:18px;overflow:hidden;
                    box-shadow:0 8px 24px rgba(255,77,166,.12)">
          ${row('✏️', 'Name ändern', 'name')}
          ${row('🖼️', 'Profilbild ändern', 'photo')}
          ${row('💬', 'Info bearbeiten', 'bio')}
          ${row('🔒', 'Datenschutz', 'privacy')}
          ${row('🛡️', 'Sicherheit', 'security')}
          ${row('💾', 'Speicher & Daten', 'storage')}
          ${row('🎵', 'Töne', 'sounds')}
          <!-- ⭐ V4.31 — gemerkte Nachrichten (liegen auf dem Server) -->
          <button data-pr="starred" style="display:flex;align-items:center;gap:13px;width:100%;
            padding:15px 16px;background:none;border:none;font-family:inherit;text-align:left">
            <span style="font-size:19px;width:24px;text-align:center">⭐</span>
            <span style="flex:1;font-size:14px;font-weight:800;color:#43203a">Gemerkt</span>
            <span style="color:#d9a8c4;font-size:16px">›</span>
          </button>
          <button data-pr="search" style="display:flex;align-items:center;gap:13px;width:100%;
            padding:15px 16px;background:none;border:none;border-bottom:1px solid #ffeaf4;font-family:inherit;text-align:left">
            <span style="font-size:19px;width:24px;text-align:center">🔍</span>
            <span style="flex:1;font-size:14px;font-weight:800;color:#43203a">Nachrichten suchen</span>
            <span style="color:#d9a8c4;font-size:16px">›</span>
          </button>
        </div>
        <div style="background:#fff;border:2px solid #ffd0e0;border-radius:18px;overflow:hidden;margin-top:14px;
                    box-shadow:0 8px 24px rgba(255,77,166,.10)">
          <button data-pr="delete" style="display:flex;align-items:center;gap:13px;width:100%;
            padding:15px 16px;background:none;border:none;font-family:inherit;text-align:left">
            <span style="font-size:19px;width:24px;text-align:center">🚪</span>
            <span style="flex:1;font-size:14px;font-weight:800;color:#d92d5c">Konto löschen</span>
            <span style="color:#e8a5bd;font-size:16px">›</span>
          </button>
        </div>
        <button class="waBtn ghost" id="prLogout" style="margin-top:16px">Abmelden</button>
        <p style="text-align:center;font-size:11px;color:#b98aab;font-weight:800;margin-top:14px">
          LoveChat V4.28 · ${esc(u.roleLabel || 'Benutzer')}${u.verified ? ' ' + CHECK_SVG('#1D9BF0') : ''}
        </p>
      </div>`;

    // In den bestehenden App-Bereich einsetzen (eigene Ebene über der Chatliste)
    let host = document.getElementById('lcProfileTab');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lcProfileTab';
      host.style.cssText = 'position:fixed;inset:0;z-index:40;background:linear-gradient(170deg,#fff5fa,#ffeaf6 55%,#f6ebff);overflow-y:auto;display:none';
      document.body.appendChild(host);
    }
    host.innerHTML = html;
    host.style.display = 'block';

    const close = () => { host.style.display = 'none'; };
    host.querySelectorAll('[data-pr]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.pr;
        if (k === 'name') {
          const n = prompt('Neuer Name:', u.displayName);
          if (n && n.trim().length >= 2) edit({ displayName: n.trim() });
        } else if (k === 'bio') {
          const v = prompt('Deine Info (max. 139 Zeichen):', u.bio || '');
          if (v !== null) edit({ bio: v });
        } else if (k === 'starred') {
          if (window.LC431) { close(); window.LC431.starredScreen(); }
        } else if (k === 'search') {
          // 🔍 überall suchen: dafür muss ein Chat offen sein (die Leiste hängt dort)
          if (window.LC431) {
            const last = (window.S && S.chats && S.chats[0]) || null;
            close();
            if (last) openChat(last.id).then(() => { window.LC431.open(); const b = document.querySelector('[data-scope="all"]'); if (b) b.click(); });
          }
        } else if (k === 'photo') {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = 'image/*';
          inp.onchange = async () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
            const r = await fetch('/api/v427/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl, name: f.name, mime: f.type }) });
            const d = await r.json();
            if (d.url) edit({ avatar: d.url });
          };
          inp.click();
        } else if (k === 'delete') {
          deleteAccount();
        } else if (k === 'privacy' || k === 'security' || k === 'storage' || k === 'sounds') {
          close();
          const sec = { privacy: '🔒', security: '🛡️', storage: '💾', sounds: '🎵' }[k];
          const re = new RegExp('^' + sec, 'u');
          const nodes = Array.from(document.querySelectorAll('button, .sideBtn, [role="button"]'));
          const target = nodes.find((n) => re.test((n.textContent || '').trim()));
          if (target) target.click();
          else if (typeof toast === 'function') toast('💗', 'LoveChat', 'Diesen Bereich findest du im Menü oben rechts.');
        }
      };
    });
    // 🔴 Vorher stand hier `$('prLogout')` — das globale `$` ist in app.js aber
    //    `document.querySelector` (mit Selektor), nicht getElementById. Also
    //    suchte es nach dem Tag <prLogout> → null → „Cannot set properties of
    //    null". Der Abmelden-Knopf tat nichts.
    const lo = document.getElementById('prLogout');
    if (lo) lo.onclick = () => { close(); if (typeof logout === 'function') logout(); };

    async function edit(patch) {
      try {
        const r = await fetch('/api/v428/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.token },
          body: JSON.stringify(patch),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
        if (typeof S !== 'undefined') S.user = Object.assign(S.user, d.user);
        profileTab();
      } catch (e) {
        if (typeof toast === 'function') toast('⚠️', 'Nicht gespeichert', e.message);
        else alert(e.message);
      }
    }
    function row(ico, label, key) {
      return `<button data-pr="${key}" style="display:flex;align-items:center;gap:13px;width:100%;
        padding:15px 16px;background:none;border:none;border-bottom:1px solid #ffeaf4;
        font-family:inherit;text-align:left">
        <span style="font-size:19px;width:24px;text-align:center">${ico}</span>
        <span style="flex:1;font-size:14px;font-weight:800;color:#43203a">${label}</span>
        <span style="color:#d9a8c4;font-size:16px">›</span>
      </button>`;
    }
  }

  /* ---------------- Konto löschen (V4.30) ----------------
   * WhatsApp: Einstellungen → Konto → Konto löschen → Nummer + Grund.
   * Hier: erst zeigen, WAS weg ist (echte Zahlen vom Server), dann muss
   * man LÖSCHEN tippen. Kein versehentliches Löschen. */
  async function deleteAccount() {
    let info = {};
    try {
      const r = await fetch('/api/account/delete-preview', { headers: { Authorization: 'Bearer ' + (localStorage.getItem('lc_token') || '') } });
      info = await r.json();
    } catch (e) {}

    const rows = [
      ['Nachrichten', info.messages || 0],
      ['Chats und Gruppen', info.chats || 0],
      ['Medien', (info.media || 0) + ' (' + ((info.mediaBytes || 0) / 1048576).toFixed(1) + ' MB)'],
      ['Anmeldungen (alle Geräte)', info.tokens || 0],
      ['Eigene Gruppen', info.ownedGroups || 0],
    ].map(([k, v]) => `<div style="display:flex;justify-content:space-between;font-size:13px;
        font-weight:700;color:#6b3a56;padding:4px 0"><span>${k}</span><b>${v}</b></div>`).join('');

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:120;background:rgba(40,10,30,.55);display:flex;' +
      'align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
    host.innerHTML = `
      <div style="background:#fff;border-radius:22px;max-width:380px;width:100%;padding:22px 20px 18px;
                  box-shadow:0 24px 60px rgba(120,0,60,.35)">
        <div style="font-size:34px;text-align:center">🚪</div>
        <h3 style="margin:6px 0 4px;font-family:'Baloo 2',cursive;font-size:20px;color:#43203a;text-align:center">
          Konto wirklich löschen?</h3>
        <p style="font-size:12.5px;color:#8b5a76;line-height:1.55;text-align:center;margin:0 0 12px">
          Das lässt sich <b>nicht rückgängig</b> machen. Du fliegst überall raus,
          deine Nummer wird wieder frei.
        </p>
        <div style="background:#fff5fa;border:1.5px solid #ffd9ec;border-radius:14px;padding:10px 12px">${rows}</div>
        <p style="font-size:12px;color:#a5748f;margin:12px 0 6px;font-weight:700">
          Tippe <b>LÖSCHEN</b>, um zu bestätigen:</p>
        <input id="delConfirm" placeholder="LÖSCHEN" autocomplete="off"
               style="width:100%;padding:12px 14px;border:2px solid #ffd9ec;border-radius:14px;
                      font-family:inherit;font-size:14px;font-weight:800;color:#43203a;outline:none">
        <div id="delErr" style="color:#d92d5c;font-size:12px;font-weight:700;min-height:16px;margin-top:6px"></div>
        <div style="display:flex;gap:9px;margin-top:8px">
          <button id="delNo" style="flex:1;padding:13px;border-radius:14px;border:2px solid #ffd9ec;
                  background:#fff;color:#8b5a76;font-family:inherit;font-weight:800;font-size:14px">Behalten</button>
          <button id="delYes" style="flex:1;padding:13px;border-radius:14px;border:none;
                  background:linear-gradient(135deg,#ff4d6d,#d92d5c);color:#fff;font-family:inherit;
                  font-weight:900;font-size:14px;box-shadow:0 8px 20px rgba(217,45,92,.4)">Endgültig löschen</button>
        </div>
      </div>`;
    document.body.appendChild(host);
    const closeD = () => host.remove();
    host.querySelector('#delNo').onclick = closeD;
    host.addEventListener('pointerdown', (e) => { if (e.target === host) closeD(); });
    host.querySelector('#delYes').onclick = async () => {
      const val = host.querySelector('#delConfirm').value.trim().toUpperCase();
      const err = host.querySelector('#delErr');
      if (val !== 'LÖSCHEN' && val !== 'LOESCHEN') { err.textContent = 'Bitte LÖSCHEN eintippen.'; return; }
      const btn = host.querySelector('#delYes');
      btn.disabled = true; btn.textContent = 'Wird gelöscht …';
      try {
        const r = await fetch('/api/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('lc_token') || '') },
          body: JSON.stringify({ confirm: val }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Fehler');
        closeD();
        try { localStorage.removeItem('lc_token'); localStorage.removeItem('lc_chat'); } catch (e) {}
        document.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;
            justify-content:center;height:100vh;gap:12px;background:linear-gradient(170deg,#fff5fa,#ffeaf6 55%,#f6ebff);
            font-family:'Quicksand',sans-serif;text-align:center;padding:24px">
            <div style="font-size:52px">👋</div>
            <h2 style="font-family:'Baloo 2',cursive;color:#43203a;margin:0">Dein Konto ist gelöscht</h2>
            <p style="color:#8b5a76;font-size:13.5px;max-width:300px;line-height:1.6">
              ${d.deleted ? d.deleted.media + ' Medien · ' + d.deleted.tokens + ' Anmeldungen entfernt.' : ''}
              Deine Nummer ist wieder frei — du kannst dich jederzeit neu registrieren.</p>
            <button onclick="location.reload()" style="margin-top:8px;padding:13px 26px;border-radius:999px;border:none;
              background:linear-gradient(135deg,#ff4da6,#b86bff);color:#fff;font-family:inherit;font-weight:900;
              font-size:14px;box-shadow:0 8px 22px rgba(255,77,166,.4)">Zurück zum Start</button>
          </div>`;
      } catch (e) {
        err.textContent = e.message;
        btn.disabled = false; btn.textContent = 'Endgültig löschen';
      }
    };
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    // Nur zeigen, wenn niemand angemeldet ist
    const hasToken = !!localStorage.getItem('lc_token');
    if (hasToken) return;
    setTimeout(() => {
      const auth = document.getElementById('authScreen');
      const app = document.getElementById('appScreen');
      const loggedIn = app && !app.classList.contains('hidden');
      if (loggedIn) return;
      if (auth && auth.classList.contains('hidden')) return;
      show();
    }, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 1400);

  window.LC428 = {
    show, hide, state: S428,
    go: (s) => { S428.step = s; show(); },
    openPhone: () => { S428.step = 'phone'; S428.phone = ''; show(); },
    profileTab,
    LAENDER,
  };
})();
