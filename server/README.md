# 💗 LoveChat — dein eigener pinker Messenger

**by maxi⁹¹⁰** — wie WhatsApp, nur pinker, süßer und von dir. 💜

Chats · Gruppen · Communities · Kanäle · änderbare Hintergründe · Fotos · Reaktionen · Online-Status · Lesebestätigungen (✓✓) · Klingelton · Web + Android + iOS

---

## 📁 Ordner-Struktur

```
lovechat/
├── server.js              ← DER Server (Node.js) — alles läuft über diese Datei
├── package.json
├── capacitor.config.json  ← für die APK (Android)
├── data/
│   └── database.json      ← wird automatisch angelegt (alle Daten: Accounts, Chats, Nachrichten)
└── client/
    ├── index.html         ← die komplette Web-App (diese eine Datei = die ganze Seite)
    ├── manifest.webmanifest
    ├── sw.js              ← macht die App installierbar (PWA)
    └── icon-512.png
```

---

## 🚀 Starten (auf deinem Windows-Laptop)

**1.** Node.js installieren (falls noch nicht da): https://nodejs.org → LTS-Version → Installer → einfach durchklicken.

**2.** Ordner `Lovechat` auf deinen PC kopieren, dann PowerShell im Ordner öffnen:

```powershell
cd C:\Pfad\zu\Lovechat
npm install     # einmalig — installiert alles NÖTIGE (liegt in Lovechat/node_modules)
npm start       # startet den Server
```

**3.** Browser öffnen → `http://localhost:7777` → Konto erstellen → fertig! 💗

> Anderen Port? Unter Windows in PowerShell z. B. `$env:PORT=4000; npm start`.

Der Server lädt beim Start die privaten Dateien `owner/credentials.env` und
`server/.env` (falls vorhanden). Bereits gesetzte Prozess-Variablen haben
Vorrang. `.env.example` ist nur eine Vorlage und wird nicht geladen. Für echten
E-Mail-Versand `STRATO_SMTP_PASS` in einer privaten Konfigurationsdatei setzen
und `MAIL_SIMULATE=0` verwenden; danach den Server neu starten.

---

## 🌐 Auf maxichen.de hosten

Damit `maxichen.de` → dein Messenger zeigt, muss der Server **ständig laufen** und die Domain auf ihn zeigen. Zwei Wege:

### Weg A: VPS (empfohlen, z. B. Hetzner, ~4 €/Monat)
1. VPS mit **Ubuntu** mieten, `lovechat`-Ordner hochladen (z. B. per `scp`).
2. Auf dem Server:
   ```bash
   cd /home/user/Lovechat
   npm install --omit=dev
   ```
3. Node dauerhaft laufen lassen:
   ```bash
   npm install -g pm2
   pm2 start server/server.js --name lovechat
   pm2 save && pm2 startup
   ```
4. Domain `maxichen.de` per DNS auf die Server-IP zeigen (A-Record beim Hoster).
5. **HTTPS** mit Caddy (macht's automatisch):
   ```bash
   # /etc/caddy/Caddyfile
   maxichen.de {
       reverse_proxy localhost:7777
   }
   ```
   → `systemctl restart caddy` — fertig, `https://maxichen.de` läuft mit Schloss. 🔒

### Weg B: Dein Windows-PC (zum Testen / im Heimnetz)
Server läuft nur, solange der PC an ist. Im Router **Port 80/443 weiterleiten** + DynDNS oder einen VPS für den Ernstfall.
> ⚠️ Ohne HTTPS funktioniert "App installieren" (PWA) **nicht** — dafür Weg A mit Caddy nehmen.

---

## 📲 Android & iOS — SOHIN bekommst du die App

### ⭐ Variante 1 (NEU): LoveChat V2 „KawaiiChat“ 💗
Die **echte native App** (Kotlin + Jetpack Compose, **kein Web-Wrapper**), jetzt in **V2** mit Neon-Glass-Design:
```
lovechat-v2/                  ← Android-Studio-Projekt V2
lovechat-apk/maxichen-v2.apk  ← die FERTIGE V2-APK (29 MB) zum Installieren
lovechat-apk/LoveChat-v1.0-debug.apk  ← alte V1 (läuft weiter)
```
- **Installieren:** `maxichen-v2.apk` aufs Handy kopieren → antippen → „aus unbekannten Quellen erlauben“ → installieren (installiert sich einfach über V1 drüber, Login bleibt).
- 🆕 In V2: Glassmorphism + Neon-Glow, 8 animierte Hintergründe, **eigenes Wallpaper pro Chat**, schwebende Bottom-Nav (Chats/Favoriten/Gruppen/**KI**), **LoveAI-Tab**, **Sprach- & Videoanrufe** (WebRTC), Outfit-Font.
- Loggt sich mit **dieselben Accounts** wie maxichen.de ein (gleiche API → Web + App sehen dieselben Nachrichten).
- Details + „selbst neu bauen“: siehe **`lovechat-v2/README.md`**.
- V1-Doku: **`lovechat-android/README.md`**

### Variante 2: PWA (Web als App, geht ohne Installieren-Bau)
Die Web-App ist eine PWA — sie lässt sich wie eine App installieren:

**Android:** Chrome öffnen → `https://maxichen.de` → Menü ⋮ → **„App installieren“ / „Zum Startbildschirm hinzufügen“*.
**iPhone (iOS):** Safari öffnen → `https://maxichen.de` → Teilen-Button ▢↑ → **„Zum Home-Bildschirm“* → „Hinzufügen“.

→ Eigene App-Icons auf dem Homescreen, startet Vollbild ohne Browserleiste. **Funktioniert so wie bei Onimai ONE (Beta)** — nur dass du sie selbst hast. 😎

### Variante 3: (Alt) Capacitor-APK — nur falls du sie statt der nativen App willst
Läuft auf deinem Windows-PC:

1. **Android Studio** installieren (https://developer.android.com/studio) — mit dem JDK.
2. Im `lovechat`-Ordner PowerShell:
   ```powershell
   npm install @capacitor/core @capacitor/cli
   npm install @capacitor/android
   npx cap add android
   npx cap sync
   ```
3. `npx cap open android` → Android Studio öffnet sich.
4. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
5. APK liegt danach unter:
   ```
   lovechat\android\app\build\outputs\apk\debug\app-debug.apk
   ```
6. APK aufs Handy kopieren → installieren (bei Google Play-Sperre: **App aus unbekannten Quelle erlauben**).

> 💡 **Wichtig:** Damit die APK deinen Server findet, trage in `capacitor.config.json` bei `"server"` → `"url"` deine Adresse ein:
> ```json
> "server": { "url": "https://maxichen.de", "androidScheme": "https" }
> ```
> Dann `npx cap sync` nochmal. Ohne URL lädt die APK den eingebauten Ordner (offline-Kopie), nicht den Live-Server.

### Variante 4: iOS (echte IPA)
Braucht einen **Mac mit Xcode**. Gleiche Befehle wie oben, nur:
```bash
npx cap add ios
npx cap sync
npx cap open ios
```
→ In Xcode: **Product → Archive → Distribute App** (oder wie bei Onimai per AltStore/Sideloadly signieren, 7 Tage kostenlos).
Ohne Mac: **Variante 2 (PWA)** ist auf dem iPhone identisch nutzbar. 💗

---

## ✨ Funktionen

| Funktion | Wo |
|---|---|
| Konto erstellen (Benutzername, Anzeigename, Telefon, E-Mail, Passwort, Emoji-Avatar) | Startseite „Registrieren“ |
| Anmelden mit Benutzername **oder** Telefon **oder** E-Mail | Startseite „Anmelden“ |
| Private Chats | **+** → Private Nachricht → @Name suchen |
| Gruppen (Mitglieder einladen, Inhaber/Verwalter) | **+** → Gruppe |
| Communities (mit eigenen Untergruppen) | **+** → Community → ⋮ → „+ Gruppe anlegen“ |
| Kanäle (öffentlich, nur Inhaber schreibt, alle folgen) | **+** → Kanal · andere suchen sie über @-Suche → „Beitreten“ |
| **Hintergrund ändern** (8 Themes: Pink Dream, Pastell, Kawaii, Rosen, Lila Nacht, Sterne, Neon, Midnight) | Chat öffnen → **⋮** → Chat-Hintergrund · Standard im Profil |
| Fotos senden, Reaktionen (💗😂😮😢🔥✨), Online-Status, ✓✓ gelesen | im Chat |
| Profil: Name, Bio, Avatar (Emoji oder Foto), Klingelton | eigener Avatar oben rechts |
| Benachrichtigungen mit Ton + Vorschau | automatisch |
| Offline-Funktion (PWA) | automatisch |

**Themes im Detail:**
- 🌸 **Pink Dream** (Standard) — dein Style
- 🍡 **Süßes Pastell** — hell & weich
- 🧸 **Kawaii** — Herzen überall
- 🌹 **Rosenwiese** — rosa romantisch
- 🌙 **Lila Nacht** — dunkel-violett
- ✨ **Sternenhimmel** — dunkel mit Sternen
- 💜 **Neon Pink** — dunkel mit Neon
- 🖤 **Midnight** — sehr dunkel

---

## 🔒 Sicherheit & Daten

- Passwörter werden **verschlüsselt** gespeichert (scrypt-Hash) — niemand (auch du) liest sie im Klartext zurück.
- Alle Daten liegen in `data/database.json` → **Backup = diese Datei kopieren.**
- Für echte Nutzung immer **HTTPS** (Weg A oben), sonst sehen andere Leute die Daten im Netz.
- Rate-Limiting gegen Spam bei Login/Registrierung ist eingebaut.

---

## 🛠️ Falls etwas nicht klappt

| Problem | Lösung |
|---|---|
| `node: command not found` | Node.js nicht installiert / neu PowerShell öffnen |
| `EADDRINUSE` | Port 7777 belegt → `PORT=7778 node server.js` |
| App öffnet, aber keine Chats | Internet prüfen / Server läuft? `node server.js` muss laufen |
| „Nicht angemeldet“ nach Neuladen | Token abgelaufen → einfach nochmal anmelden |
| Daten zurücksetzen | Server stoppen, `data/database.json` löschen, neu starten |
| APK zeigt weiße Seite | `url` in `capacitor.config.json` setzen (s.o.) |

---

## 💗 Träume groß, gib niemals auf und bleib immer du selbst. ✨

*LoveChat — by maxi⁹¹⁰*
