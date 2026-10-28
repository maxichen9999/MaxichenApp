#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
uebersicht.py — schreibt `UEBERSICHT.html`: „Wo ist welche Datei?"

Warum: `server.js`, `pair.js` und die HTML-Seiten liegen **nicht** im
Projekt-Hauptordner, sondern in `server/` und `client/`. Das ist Absicht
(Server und Oberfläche getrennt), führt aber genau zu der Frage
„wo sind die denn?". Diese Datei beantwortet sie mit echten Zahlen aus dem
Dateisystem — nichts geschätzt.

Aufruf:  python3 tools/uebersicht.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'node_modules', '.git', '__pycache__', '.cache', 'build', 'dist'}

# Was die wichtigen Dateien tun (bewusst kurz — der Code hat die Details)
ZWECK = {
    'server.js': 'START: Messenger-Server starten (ruft server/server.js auf, keine zweite Kopie)',
    'pair.js': 'START: WhatsApp-Brücke starten (ruft server/pair.js auf)',
    'index.html': 'Diese Startseite: Landkarte des Projekts, 3 Schritte zum Starten',
    'START-WINDOWS.bat': 'Windows: Doppelklick → installiert Pakete und startet den Server',
    'START-MAC-LINUX.command': 'Mac/Linux: Doppelklick oder ./START-MAC-LINUX.command',
    'UEBERSICHT.html': 'Landkarte aller Dateien mit echten Größen (dieses Skript erzeugt sie)',
    'server/server.js': 'Der Messenger-Server: alle /api/-Routen, WebSocket, Datenbank',
    'server/pair.js': 'WhatsApp-Brücke: verbindet WhatsApp mit LoveChat (QR-Pairing)',
    'server/v427.js': 'V4.27 Medien: Upload auf die Platte, Galerie, GIFs, Speicher, Migration',
    'server/vip.js': 'V4.29 VIP anhand der Telefonnummer (Datei + ENV + Owner-Nummer)',
    'server/v432.js': 'V4.32 Bot-Befehle (/ping … /erinnere), Rechner ohne eval, Erinnerungen',
    'tests/v432test.js': 'V4.32: 68 Prüfungen für Befehle, Erinnerungen, Grenzen, Oberfläche',
    'client/v432.js': 'V4.32: Befehls-Palette über dem Eingabefeld',
    'server/v430.js': 'V4.30 Konto löschen, 20 Nachrichten/Min, Spam, Melden mit 5 Nachrichten',
    'tests/v430test.js': 'V4.30: Limits, Spam, Melden, Konto löschen, Ban/Unban (54 Prüfungen)',
    'server/v428.js': 'V4.28 Anmeldung wie WhatsApp: Nummer, Code, Profil — plus Owner-Erkennung (V4.29)',
    'tests/v429test.js': 'V4.29: Owner+VIP an der Nummer, App-Reste, Aufräum-Werkzeug (44 Prüfungen)',
    'tools/reset-users.js': 'Alle Nutzer löschen — Owner-Nummer bleibt vorgemerkt (mit Sicherung)',
    'server/v426.js': 'V4.26 Sicherheit + Töne: 40 Töne, Backup, Sicherheitscode, App-Sperre',
    'server/v425.js': 'V4.25 Offizieller Lovechen-Kanal (verifiziert)',
    'server/v423.js': 'V4.23 Anrufe-Verlauf, Kanäle, /api/home',
    'server/v4.js': 'V4 Block: Momente, Umfragen, Planung, Blocken, LoveBot',
    'server/v419.js': 'V4.19 30 Töne, 6 Sticker-Packs, 3 Hintergründe, VIP',
    'server/security.js': 'Datenschutz-Schalter, Einmal-Medien, Login-Schutz',
    'server/accounts.js': 'Multi-Account (max 5), Telefon-Nummern',
    'server/signup.js': 'Registrierung, E-Mail-Code',
    'server/twofa.js': '2FA (TOTP) — Pflicht für Owner und Bot',
    'server/e2e.js': 'Ende-zu-Ende-Verschlüsselung (X3DH, Doppel-Ratchet)',
    'server/data/database.json': 'Die Datenbank (JSON). Hier liegen Nutzer, Chats, Nachrichten',
    'server/.env.example': 'Vorlage für Zugangsdaten — kopieren nach .env und ausfüllen',
    'package.json': 'DIE eine Paketdatei: npm i / npm start / npm run pair / npm test',
    'client/index.html': 'DIE Chat-Seite: Layout + komplette Gestaltung (pink/lila)',
    'client/app.js': 'Die Chat-Logik im Browser: Senden, Anzeigen, Klingeltöne, alles',
    'client/v427.js': 'V4.27 Oberfläche: Medien-Blatt (Datei, Galerie, GIFs, Speicher)',
    'client/downloads.html': 'Die Download-Seite (wird zu deploy/downloads/index.html)',
    'client/sw.js': 'Service-Worker: macht die Seite als App installierbar',
    'client/manifest.webmanifest': 'App-Name, Symbole, Farben für „Zum Startbildschirm"',
    'deploy/downloads/index.html': 'Die pinke Download-Seite für maxichen.de',
    'deploy/chat/index.html': 'Die Chat-Seite, fertig zum Hochladen auf den Server',
    'deploy/nginx-maxichen.de.conf': 'nginx-Konfiguration: APK-Endung, /downloads/, /chat/, /api/',
    'deploy/DEPLOY.md': 'Schritt-für-Schritt-Anleitung zum Hochladen',
    'deploy/downloads/prepare.sh': 'Kopiert APK/EXE in downloads/ und schreibt SHA256SUMS.txt',
    'tools/serve-deploy.py': 'Bildet die nginx-Regeln lokal nach (für Tests ohne Server)',
    'tools/restore-toolchain.sh': 'Holt JDK/Android/Swift zurück nach einem Reset',
    'STATUS.md': 'Der geprüfte Stand: jede Zahl mit Prüfmethode (1.110 Tests)',
    'START-HIER.md': 'Erste Schritte — hier anfangen',
    'BUILD-APK-EXE-IPA.md': 'Wie du APK, EXE und IPA auf deinem PC baust',
    'DEPLOY-ANLEITUNG.txt': 'Kurzfassung des Deploys',
}

# Diese Ordner/Dateien sollen ganz oben in der Antwort stehen
WICHTIG = [
    ('server.js', 'START im Hauptordner → Server'),
    ('pair.js', 'START im Hauptordner → WhatsApp'),
    ('index.html', 'Startseite / Landkarte'),
    ('server/server.js', 'Der Server'),
    ('server/pair.js', 'WhatsApp-Brücke'),
    ('client/index.html', 'Die Chat-Seite'),
    ('client/app.js', 'Chat-Logik im Browser'),
    ('deploy/downloads/index.html', 'Download-Seite'),
    ('server/data/database.json', 'Die Datenbank'),
]


def human(n):
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024 or unit == 'GB':
            if unit == 'B':
                return '%d B' % n
            return ('%.1f %s' % (n, unit)).replace('.', ',')
        n /= 1024.0


def walk(base):
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in SKIP]
        for f in sorted(filenames):
            p = os.path.join(dirpath, f)
            yield p, os.path.relpath(p, base), os.path.getsize(p)


def main():
    files = list(walk(ROOT))
    total = sum(s for _, _, s in files)

    # Ordner-Übersicht
    folder = {}
    for _, rel, s in files:
        top = rel.split(os.sep)[0]
        if os.sep in rel:
            folder.setdefault(top, [0, 0])
            folder[top][0] += 1
            folder[top][1] += s
        else:
            folder.setdefault('(direkt im Hauptordner)', [0, 0])
            folder['(direkt im Hauptordner)'][0] += 1
            folder['(direkt im Hauptordner)'][1] += s

    def row(path, label=''):
        p = os.path.join(ROOT, path)
        if not os.path.isfile(p):
            return ('<tr class="miss"><td><code>%s</code></td><td>—</td>'
                    '<td>FEHLT</td><td>%s</td></tr>' % (path, label))
        raw = os.path.getsize(p)
        with open(p, 'rb') as fh:
            data = fh.read()
        lines = data.count(b'\n') + (0 if data.endswith(b'\n') else 1)
        return ('<tr><td><code>%s</code><span class="sz">%s = %s B · %s Zeilen</span></td>'
                '<td class="p">%s</td></tr>'
                % (path, human(raw), format(raw, ',d').replace(',', '.'), format(lines, ',d').replace(',', '.'), label))

    wichtig = '\n'.join(row(p, ZWECK.get(p, l)) for p, l in WICHTIG)

    ordner = '\n'.join(
        '<tr><td><code>%s</code></td><td class="num">%d Dateien</td><td class="num">%s</td></tr>'
        % (k, v[0], human(v[1]))
        for k, v in sorted(folder.items(), key=lambda x: -x[1][1]))

    rest = [(rel, s) for p, rel, s in files if rel in ZWECK and rel not in dict(WICHTIG)]
    rest.sort()
    rest_rows = '\n'.join(row(p, ZWECK[p]) for p, _ in rest)

    html = """<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lovechat — wo ist welche Datei?</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:26px 18px 60px;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
       color:#43203a;background:
         radial-gradient(1200px 500px at 15% -10%,#ffe3f3 0%,transparent 60%),
         radial-gradient(900px 420px at 100% 0%,#f0e4ff 0%,transparent 55%),
         linear-gradient(170deg,#fff8fc,#fdf2ff 60%,#fff6fb)}
  h1{font-size:27px;margin:0 0 4px;background:linear-gradient(135deg,#ff4da6,#b06bff);
     -webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900}
  .sub{color:#a5748f;font-weight:700;font-size:13px;margin-bottom:20px}
  .card{background:#fff;border:2px solid #ffd9ec;border-radius:20px;padding:18px 20px;
        box-shadow:0 10px 30px rgba(255,77,166,.13);margin-bottom:18px}
  .card h2{font-size:16px;margin:0 0 12px;color:#7b2ff7}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;
     color:#b98aab;padding:0 8px 8px;font-weight:900}
  td{padding:9px 8px;border-top:1px solid #ffeaf4;vertical-align:top}
  tr:first-child td{border-top:none}
  code{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;color:#c2187a;
       background:#fff2f9;padding:2px 6px;border-radius:7px;display:inline-block}
  .sz{display:block;font-size:10.5px;color:#b98aab;margin-top:3px;font-family:inherit}
  .p{color:#6d4a63}
  .num{text-align:right;font-variant-numeric:tabular-nums;color:#6d4a63;white-space:nowrap}
  .miss td{background:#fff0f0}
  .big{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px}
  .kpi{flex:1 1 150px;background:linear-gradient(150deg,#fff,#ffeaf6);border:2px solid #ffd9ec;
       border-radius:18px;padding:14px 16px}
  .kpi b{display:block;font-size:23px;color:#e6197d;font-weight:900}
  .kpi span{font-size:11.5px;color:#a5748f;font-weight:800}
  pre{background:#2b1229;color:#ffd7ec;padding:14px 16px;border-radius:14px;overflow-x:auto;
      font-size:12px;line-height:1.55;margin:0}
  .hint{background:#fff6fb;border-left:4px solid #ff4da6;border-radius:0 12px 12px 0;
        padding:12px 14px;font-size:13px;line-height:1.6;color:#6d4a63}
  .ok{color:#0a8f5d;font-weight:900}
</style>
</head>
<body>
<h1>💗 Lovechat — wo ist welche Datei?</h1>
<div class="sub">Stand @@DATUM@@ · alle Zahlen direkt aus dem Ordner gezählt, nichts geschätzt</div>

<div class="big">
  <div class="kpi"><b>@@NFILES@@</b><span>Dateien im Projekt</span></div>
  <div class="kpi"><b>@@SIZE@@</b><span>Gesamtgröße</span></div>
  <div class="kpi"><b>@@VORHANDEN@@</b><span>der gesuchten Dateien<br>wirklich auf der Platte</span></div>
</div>

<div class="card">
  <h2>⭐ Die sechs Dateien, nach denen du gesucht hast</h2>
  <table>
    <tr><th>Pfad (ab <code>Lovechat/</code>)</th><th>Was drin ist</th></tr>
    @@WICHTIG@@
  </table>
  <div class="hint" style="margin-top:14px">
    <b>Wichtig:</b> <code>server.js</code> und <code>pair.js</code> liegen im Unterordner
    <code>server/</code>, die Chat-Seite im Unterordner <code>client/</code>.
    Es gibt <b>keine</b> Kopie im Hauptordner — das ist Absicht: Server, Oberfläche
    und Deploy sind getrennt, damit man den Server einzeln hochladen kann.
  </div>
</div>

<div class="card">
  <h2>📁 Alle Ordner</h2>
  <table>
    <tr><th>Ordner</th><th class="num">Dateien</th><th class="num">Größe</th></tr>
    @@ORDNER@@
  </table>
  <div class="sz" style="margin-top:10px">
    <code>server/node_modules</code> ist absichtlich nicht mitgezählt (wird mit
    <code>npm install</code> neu erzeugt).
  </div>
</div>

<div class="card">
  <h2>📜 Die wichtigsten weiteren Dateien</h2>
  <table>
    <tr><th>Pfad</th><th>Zweck</th></tr>
    @@REST@@
  </table>
</div>

<div class="card">
  <h2>▶️ So startest du es</h2>
  <pre>cd Lovechat
npm i        # nur beim allerersten Mal — alles landet in Lovechat/node_modules
npm start    # Server auf http://localhost:3900</pre>
  <pre style="margin-top:10px">npm run pair   # WhatsApp-Brücke (eigenes Fenster, QR-Code scannen)
npm test       # alle Tests</pre>
</div>

<div class="card">
  <h2>🔍 Selbst nachzählen</h2>
  <pre>cd Lovechat
ls server/server.js server/pair.js client/index.html     # müssen alle drei erscheinen
wc -l server/server.js server/pair.js client/index.html
python3 tools/uebersicht.py                              # diese Seite neu erzeugen</pre>
</div>

</body>
</html>
"""
    for k, v in {
        'datum': '27.10.2026',
        'nfiles': str(len(files)),
        'size': human(total),
        'wichtig': wichtig,
        'ordner': ordner,
        'rest': rest_rows,
        'vorhanden': '%d/%d' % (sum(1 for p, _ in WICHTIG if os.path.isfile(os.path.join(ROOT, p))), len(WICHTIG)),
    }.items():
        html = html.replace('@@' + k.upper() + '@@', v)

    out = os.path.join(ROOT, 'UEBERSICHT.html')
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(html)
    print('✅ %s — %d Dateien, %s' % (out, len(files), human(total)))


if __name__ == '__main__':
    main()
