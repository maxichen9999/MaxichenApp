/* =====================================================================
   ✨ LoveAI — der KI-Assistent von LoveChat
   Funktioniert IMMER: ohne API-Key antwortet eine eingebaute LoveAI.
   Mit OPENAI_API_KEY (Umgebungsvariable) wird ein echtes Modell benutzt.
   ===================================================================== */
'use strict';

const SYSTEM_PROMPT =
  'Du bist LoveAI ✨, die KI-Assistentin von LoveChat (App von maxi⁹¹⁰). ' +
  'Sei herzlich, kawaii, direkt und ein bisschen verspielt. Antworte auf Deutsch, kompakt, ' +
  'mit 1-2 Emojis, aber ohne lange Romane. Du hilfst bei Hausaufgaben, Texten, Ideen, ' +
  'Übersetzungen, Mathe und beim Quatschen. Wenn du etwas nicht weißt, sag es ehrlich.';

/* ---------- kleine Helfer ---------- */
const nl = (s) => String(s || '').toLowerCase().trim();

function safeMath(expr) {
  // nur Ziffern, Operatoren, Klammern, Komma/Punkt — kein Code
  if (!/^[-+*/%().,\d\s^]+$/.test(expr)) return null;
  let e = expr.replace(/\^/g, '**').replace(/,/g, '.');
  if (!/\d/.test(e) || e.length > 60) return null;
  try {
    const v = Function('"use strict";return (' + e + ')')();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.round(v * 1e6) / 1e6;
  } catch (err) {
    return null;
  }
}

function pick(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}

function clockIn(tz) {
  try {
    return new Date().toLocaleString('de-DE', { timeZone: tz || 'Europe/Berlin' });
  } catch (e) {
    return new Date().toLocaleString('de-DE');
  }
}

/* ---------- die eingebaute LoveAI ---------- */
function localAnswer(history, who) {
  const last = [...history].reverse().find((m) => m.role === 'user');
  const q = nl(last ? last.content : '');
  const seed = q.length + Date.now() % 1000;
  const name = who ? who.split(' ')[0] : '';

  if (!q) return 'Sag einfach was — ich hör zu 💗';

  /* Mathe */
  const mathMatch = q.replace(/was ist|rechne|wie viel ist|wieviel ist|\?/g, '').trim();
  const m = safeMath(mathMatch);
  if (m !== null && /[\d]/.test(mathMatch) && /[-+*/%^]/.test(mathMatch)) {
    return `Das sind **${String(m).replace('.', ',')}** 🧮✨`;
  }

  /* Begrüßung */
  if (/^(hi|hey|hallo|hii+|moin|servus|yo|na)\b/.test(q)) {
    return `Hey${name ? ' ' + name : ''}! 💗 Was machen wir? Ich kann dir bei Hausaufgaben, Texten, Ideen oder einfach beim Quatschen helfen ✨`;
  }
  if (/wie geht'?s|wie geht es dir|alles gut/.test(q)) {
    return 'Mir geht es super, danke! 🥰 Und dir? Erzähl — was beschäftigt dich gerade? 💗';
  }
  if (/wer bist du|dein name|was bist du/.test(q)) {
    return 'Ich bin **LoveAI** ✨ — die KI in deinem eigenen Messenger 💗 Ich kann dir bei Mathe, Texten, Ideen und Apps helfen. Frag mich einfach!';
  }
  if (/danke|thank/.test(q)) return 'Immer doch 💗✨';
  if (/tschüss|ciao|bye|bis später/.test(q)) return 'Bis gleich! 💗 Ich bin hier, wenn du mich brauchst ✨';

  /* Zeit / Datum */
  if (/wie spät|uhrzeit/.test(q)) return `Es ist gerade **${clockIn()}** ⏰`;
  if (/welcher tag|datum|heute/.test(q)) {
    return `Heute ist **${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}** 📅`;
  }

  /* Witze / Motivation */
  if (/witz|lustig|erzähl was/.test(q)) {
    return pick(
      [
        'Warum können Geister so schlecht lügen? — Weil man durch sie hindurchsieht 👻😄',
        'Was macht ein Pirat auf einem Parkplatz? — Er sucht nach dem Aarrrrr-parkplatz 🏴‍☠️😂',
        'Warum hat der Computer Angst vorm Wasser? — Weil er sonst einen Kurzschluss kriegt 💻💦',
      ],
      seed
    );
  }
  if (/motivier|motivation|schaffe|aufgeben|müde/.test(q)) {
    return 'Du musst nicht alles heute schaffen — nur den nächsten kleinen Schritt 💗 Atme einmal tief durch, dann fang mit 10 Minuten an. Das reicht für den Anfang ✨';
  }

  /* Schule / Hausaufgaben */
  if (/hausaufgabe|mathe|schule|referat|prüfung|klausur|lerntipp|lernen/.test(q)) {
    return (
      'Lern-Trick, der wirklich funktioniert 🎀\n' +
      '1️⃣ **25 Minuten** konzentriert, **5 Minuten** Pause\n' +
      '2️⃣ Nach dem Lesen **aus dem Kopf aufschreiben** — das ist der Teil, der wirklich hängen bleibt\n' +
      '3️⃣ Am Abend **5 Minuten** wiederholen\n\n' +
      'Und bei Mathe: schick mir einfach die Aufgabe, ich rechne sie dir vor 🧮✨'
    );
  }

  /* App-Fragen */
  if (/app|lovechat|messenger/.test(q)) {
    return 'LoveChat ist dein eigener Messenger 💗 Chats, Gruppen, Communities, Kanäle, Anrufe, LoveAI — und ein eigenes Team-System mit Rollen, Sperren und Einsprüchen ✨ Was willst du wissen?';
  }
  if (/sperre|ban|gesperrt|einspruch/.test(q)) {
    return 'Wenn du gesperrt wurdest, steht auf dem Sperr-Bildschirm der Grund und wer sie verhängt hat 💔 Darunter kannst du direkt einen **Einspruch** schreiben — das Team entscheidet dann 💗';
  }

  /* Übersetzung (kleine Beispiele) */
  if (/übersetz|transl/.test(q)) {
    return 'Klar! Schreib mir den Satz, den ich übersetzen soll — am besten mit Zielsprache (z. B. „auf Englisch") 🌍✨';
  }

  /* Text-Ideen */
  if (/text|schreiben|nachricht|bio|spruch|caption/.test(q)) {
    return (
      'Hier ein paar Ideen ✨\n' +
      '💗 „Träume groß, bleib du selbst."\n' +
      '🎀 „Süß, aber mit Meinung."\n' +
      '🌙 „Nachts am kreativsten, tagsüber am müdesten."\n\n' +
      'Sag mir die Stimmung (süß, frech, traurig, motiviert) — dann mach ich mehr davon 💫'
    );
  }

  /* Standart */
  return (
    pick(
      [
        'Ich hab dich gehört 💗 Magst du mir ein bisschen mehr erzählen, damit ich dir richtig helfen kann?',
        'Interessant! ✨ Sag mir, was genau du brauchst — Idee, Antwort, Text oder einfach eine Meinung?',
        'Hmm, da brauche ich etwas mehr 🎀 Worum geht es genau?',
      ],
      seed
    ) +
    '\n\n_Tipp: Für ein echtes Sprachmodell kann der Owner in den Einstellungen einen API-Key eintragen — dann denke ich wie ein großes Modell ✨_'
  );
}

/* ---------- Route ---------- */
function createLoveAI(app, h) {
  const apiKey = () => (process.env.OPENAI_API_KEY || '').trim();
  const model = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';

  app.get(
    '/api/ai/status',
    h(async (req, res) => {
      res.json({
        online: true,
        engine: apiKey() ? 'openai' : 'loveai-lokal',
        model: apiKey() ? model() : 'LoveAI 1.0',
        hint: apiKey()
          ? 'Verbunden mit einem echten Sprachmodell ✨'
          : 'Läuft ohne Key — LoveAI antwortet lokal 💗',
      });
    })
  );

  app.post(
    '/api/ai/chat',
    h(async (req, res) => {
      const b = req.body || {};
      const raw = Array.isArray(b.messages) ? b.messages : [];
      const history = raw
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 4000) }))
        .slice(-16);
      const who = String(b.who || '').slice(0, 40);
      if (!history.length) return res.status(400).json({ error: 'Keine Nachricht' });

      const key = apiKey();
      if (!key) {
        const text = localAnswer(history, who);
        return res.json({ reply: text, engine: 'loveai-lokal' });
      }

      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({
            model: model(),
            messages: [{ role: 'system', content: SYSTEM_PROMPT + (who ? ` Der Nutzer heißt ${who}.` : '') }, ...history],
            max_tokens: 600,
            temperature: 0.8,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const text = localAnswer(history, who);
          return res.json({ reply: text, engine: 'loveai-lokal', note: 'Modell nicht erreichbar' });
        }
        const reply = String(data.choices?.[0]?.message?.content || '').trim();
        return res.json({ reply: reply || localAnswer(history, who), engine: 'openai' });
      } catch (e) {
        return res.json({ reply: localAnswer(history, who), engine: 'loveai-lokal' });
      }
    })
  );

  console.log('✨ LoveAI aktiv — ' + (apiKey() ? 'echtes Modell (' + model() + ')' : 'lokaler Modus (ohne Key)'));
}

module.exports = { createLoveAI };
