/* =====================================================================
 *  🤖 v432.js — Befehls-Palette für Lovechen (V4.32)
 * ---------------------------------------------------------------------
 *  Tippst du im Eingabefeld ein „/", klappt über dem Feld eine Liste
 *  aller Befehle auf. Weitertippen filtert, ↑/↓ wählt, Enter setzt ein,
 *  Esc schließt. Nichts davon schickt Nachrichten — es füllt nur das Feld.
 *
 *  Die Befehle selbst beantwortet der Server (server/v432.js). Diese Datei
 *  kennt nur die Liste, damit die Oberfläche helfen kann.
 * ===================================================================== */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);

  /* Reihenfolge = Reihenfolge in der Liste. Kurz, weil es über einem
   * Handy-Eingabefeld steht und nicht das halbe Bild füllen soll. */
  const CMDS = [
    { c: '/help', d: 'alle Befehle zeigen' },
    { c: '/ping', d: 'bin ich wach?' },
    { c: '/zeit', d: 'Uhrzeit + Datum' },
    { c: '/würfel', d: 'Würfel werfen (z. B. /würfel 20)' },
    { c: '/zahl', d: 'Zufallszahl (z. B. /zahl 1 100)' },
    { c: '/münze', d: 'Kopf oder Zahl' },
    { c: '/witz', d: 'ein platter Witz' },
    { c: '/kompliment', d: 'ein Kompliment für dich' },
    { c: '/rechne', d: 'rechnen (z. B. /rechne 2+2*3)' },
    { c: '/suche', d: 'diesen Chat durchsuchen' },
    { c: '/erinnere', d: 'Erinnerung (z. B. /erinnere 10m Tee)' },
    { c: '/status', d: 'Mitglieder + Nachrichten' },
    { c: '/info', d: 'Version + Laufzeit' },
    { c: '/id', d: 'deine ID + Chat-ID' },
    { c: '/bot', d: 'an/aus — /bot aus' },
    { c: '/regeln', d: 'Regeln dieses Chats' },
    { c: '/stats', d: 'kleine Statistik' },
    { c: '/poll', d: 'Umfrage (nur Admins)' },
  ];

  const P = { open: false, idx: 0, list: CMDS.slice(), input: null };

  function css() {
    if (document.getElementById('v432css')) return;
    const st = document.createElement('style');
    st.id = 'v432css';
    st.textContent = `
#cmdPop{position:fixed;z-index:80;background:rgba(255,255,255,.99);border:2px solid #ffd9ec;
  border-radius:16px;box-shadow:0 18px 40px rgba(255,77,166,.28);overflow:hidden;
  display:none;max-height:46vh;overflow-y:auto;backdrop-filter:blur(8px)}
#cmdPop.on{display:block}
#cmdPop .cpHead{display:flex;align-items:center;gap:7px;padding:8px 12px;font-size:11px;font-weight:900;
  color:#c2187a;background:linear-gradient(135deg,#fff0f7,#ffe6f4);border-bottom:1.5px solid #ffe2f0;letter-spacing:.3px}
#cmdPop .cpItem{display:flex;align-items:baseline;gap:8px;padding:9px 12px;cursor:pointer;border-bottom:1px solid #fff2f8}
#cmdPop .cpItem:last-child{border-bottom:none}
#cmdPop .cpItem.on{background:#ffeaf5}
#cmdPop .cpItem b{font-size:13px;font-weight:900;color:#43203a;font-family:'Baloo 2',cursive}
#cmdPop .cpItem span{font-size:11.5px;color:#a5748f;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.voiceRate{border:none;background:#ffd6ec;color:#a3005c;font-family:inherit;font-size:10.5px;
  font-weight:900;border-radius:99px;padding:2px 6px;margin-left:2px;cursor:pointer;line-height:1.5}
.voiceRate:active{transform:scale(.94)}
/* Befehle in einer Bot-Antwort — Code-Chip statt Backticks */
code.lcCode{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;
  background:rgba(255,77,166,.13);color:#a3005c;border:1px solid rgba(255,77,166,.25);
  border-radius:7px;padding:0 5px;white-space:nowrap}
.mine code.lcCode{background:rgba(255,255,255,.55);border-color:rgba(255,255,255,.7);color:#8a0050}`;
    document.head.appendChild(st);
  }

  function host() {
    css();
    let el = document.getElementById('cmdPop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cmdPop';
      el.innerHTML = '<div class="cpHead">🤖 LOVECHEN-BEFEHLE</div><div id="cpList"></div>';
      document.body.appendChild(el);
      el.addEventListener('mousedown', (e) => e.preventDefault()); // Fokus im Feld behalten
    }
    return el;
  }

  function place(input) {
    const el = host();
    const bar = input.closest('#inputBar') || input;
    const r = bar.getBoundingClientRect();
    const h = Math.min(window.innerHeight * 0.46, 320);
    el.style.left = Math.max(8, r.left) + 'px';
    el.style.width = Math.min(window.innerWidth - 16, Math.max(240, r.width)) + 'px';
    el.style.top = Math.max(8, r.top - h - 8) + 'px';
    el.style.maxHeight = h + 'px';
  }

  function render() {
    const el = host();
    const list = document.getElementById('cpList');
    const q = (P.input.value || '').toLowerCase();
    P.list = CMDS.filter((x) => x.c.startsWith(q) || x.d.toLowerCase().includes(q.slice(1)));
    if (!P.list.length) { el.classList.remove('on'); P.open = false; return; }
    if (P.idx >= P.list.length) P.idx = 0;
    list.innerHTML = P.list.map((x, i) =>
      `<div class="cpItem ${i === P.idx ? 'on' : ''}" data-i="${i}"><b>${x.c}</b><span>${x.d}</span></div>`).join('');
    el.classList.add('on');
    P.open = true;
    place(P.input);
    list.querySelectorAll('.cpItem').forEach((it) => {
      it.onclick = () => pick(Number(it.dataset.i));
    });
  }

  function close() {
    const el = document.getElementById('cmdPop');
    if (el) el.classList.remove('on');
    P.open = false;
    P.idx = 0;
  }

  function pick(i) {
    const cmd = P.list[i];
    if (!cmd || !P.input) return;
    const keep = P.input.value.includes(' ') ? ' ' : '';
    P.input.value = cmd.c + keep;
    P.input.focus();
    // Cursor ans Ende
    try { P.input.setSelectionRange(P.input.value.length, P.input.value.length); } catch (e) {}
    close();
    P.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function onInput() {
    const v = String(P.input.value || '');
    // Palette nur, solange der Befehl noch kein Leerzeichen hat
    if (!v.startsWith('/') || v.includes(' ')) { if (P.open) close(); return; }
    render();
  }

  function onKey(e) {
    if (!P.open) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); P.idx = (P.idx + 1) % P.list.length; render(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); P.idx = (P.idx - 1 + P.list.length) % P.list.length; render(); return; }
    if (e.key === 'Tab' || (e.key === 'Enter' && P.list[P.idx] && P.list[P.idx].c !== P.input.value.trim())) {
      e.preventDefault(); pick(P.idx); return;
    }
    /* Enter bei bereits vollständig getipptem Befehl = abschicken. Dann muss
     * die Palette zu — sonst bleibt sie offen über den Nachrichten stehen,
     * weil das Leeren des Feldes kein „input"-Ereignis auslöst. */
    if (e.key === 'Enter') close();
  }

  function boot() {
    css();
    const input = document.getElementById('msgInput');
    if (!input) { setTimeout(boot, 700); return; }
    P.input = input;
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKey, true);
    input.addEventListener('blur', () => setTimeout(close, 150));
    /* Auch der Senden-Knopf leert das Feld ohne „input" — Palette zu. */
    const send = document.getElementById('btnSend');
    if (send) send.addEventListener('click', close);
    window.addEventListener('resize', () => { if (P.open) place(input); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.LC432 = { CMDS, openPalette: () => { const i = document.getElementById('msgInput'); if (i) { i.value = '/'; P.input = i; render(); i.focus(); } }, close, state: P };
})();
