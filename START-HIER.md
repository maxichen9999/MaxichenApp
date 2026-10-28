# 💗 Lovechat — das fertige Projekt

**Stand 27.10.2026 · V4.29**
Ein Ordner. Kein Müll. Alles andere ist gelöscht.

---

## ▶️ Sofort loslegen (alles direkt in diesem Ordner)

```
Lovechat/
├── server.js               ← START: Server starten  (node server.js)
├── pair.js                 ← START: WhatsApp-Brücke (node pair.js)
├── index.html              ← Startseite: Landkarte des Projekts
├── START-WINDOWS.bat       ← Windows: doppelklicken
├── START-MAC-LINUX.command ← Mac/Linux: doppelklicken
├── UEBERSICHT.html         ← wo jede Datei liegt (mit echten Größen)
├── STATUS.md               ← geprüfter Stand, 1.173 Tests
└── server/ · client/ · deploy/ · …   (der eigentliche Code)
```

**Drei Schritte (Terminal, im Ordner `Lovechat`):**

```bash
npm i        # nur beim allerersten Mal — installiert server/node_modules
npm start    # Server starten
# Browser: http://localhost:7777
```

Oder ohne Terminal: **`START-WINDOWS.bat`** (Windows) bzw.
**`START-MAC-LINUX.command`** (Mac/Linux) doppelklicken — die machen dasselbe.

| Befehl (im Ordner `Lovechat`) | tut |
|---|---|
| `npm i` | Pakete installieren (landen in `server/node_modules`) |
| `npm start` | Server starten → http://localhost:7777 |
| `npm run pair` | WhatsApp-Brücke starten (zweites Fenster) |
| `npm test` | alle 936 Server-Tests |

> ⚠️ **Es gibt genau eine `package.json`** — die hier oben. `server/` hat keine
> eigene mehr. Alle 5 Abhängigkeiten (`express`, `ws`, `nodemailer`,
> `qrcode-terminal`, `@whiskeysockets/baileys`) stehen in dieser einen Datei und
> landen in `Lovechat/node_modules`. Node findet sie von `server/server.js` aus,
> weil es nach oben sucht.
>
> Früher: `npm error enoent … package.json` (es gab oben keine) → behoben.
> Und `npm i` in `server/` ist **nicht** mehr nötig und **nicht** mehr möglich.

---

## 👑 Wer ist der Owner? (V4.29)

**Die Telefonnummer entscheidet — nicht ein Konto, nicht ein Name.**

```
+4915155894714   →   Nummer eingeben → Code per WhatsApp → Name → drin
                                                  ↓
                              👑 Owner · ✅ verifiziert · 👑 VIP
```

* Es gibt **kein separates Owner-Konto** und **keinen Setup-Code** mehr.
  Die Nummer ist der Beweis: nur wer den WhatsApp-Code bekommt, hat sie.
* Vorher ist **niemand** Owner. Beim ersten Anmelden wird das Konto automatisch
  Owner, bekommt den blauen Haken (`#1D9BF0`), VIP und 2FA
  (Secret in `owner/totp-secret.txt`, Rechte 0600 — 2FA blockiert die Anmeldung
  **nicht**, es ist nur die Grundlage für den Haken).
* **VIP hängt ebenfalls an der Nummer.** Drei Quellen, in dieser Reihenfolge:
  `server/data/vip-numbers.json` → `VIP_NUMBERS` in der Umgebung → Owner-Nummer
  (immer VIP). Der alte Weg über Einlösecodes funktioniert weiter.
  Der Owner pflegt Nummern über `POST /api/vip/numbers` (maskiert, nur er).

**Alle Nutzer löschen** (inklusive Owner-Konto):

```bash
node tools/reset-users.js                  # zeigt nur, was weg wäre
node tools/reset-users.js --ja-ich-will    # löscht, mit Sicherung in data/backups/
```

Danach: Server starten, mit `+4915155894714` anmelden — fertig.

---

`server.js` und `pair.js` oben sind absichtlich nur **Starter** — sie rufen
`server/server.js` bzw. `server/pair.js` auf. Es gibt also keine zweite Kopie
des Codes, nur einen bequemen Eingang. Beim **ersten** Start werden die Pakete
automatisch installiert (`npm install`, ~1 Minute, braucht Internet).

---

## 📁 Was hier liegt

```
Lovechat/
├── client/                 Webseite für maxichen.de
│   ├── index.html          Startseite (Registrierung läuft wieder)
│   ├── app.js              Script ausgelagert — CSP-konform, KEIN Inline-JS
│   ├── downloads.html      /downloads (APK · iOS · EXE + Prüfsummen)
│   ├── fonts/              Baloo 2 + Quicksand lokal (17 Dateien, kein Google)
│   ├── icon-512.png · manifest.webmanifest · sw.js   (PWA)
│   └── app/
│       ├── index.html                     /app
│       ├── maxichen-v4.15.apk             27.985.732 B   ← Android
│       ├── maxichat-windows-4.15.exe       2.450.944 B   ← Windows
│       ├── maxichen-ios-4.15.zip              45.729 B   ← iOS-Quellen
│       ├── sources-v4.15.zip                 451.716 B   ← Android-Quellen
│       ├── qr-apk.svg                     QR → APK
│       └── tests/                         Test-Suiten (lesbar)
│
├── server/                 was auf dem Server läuft
│   ├── server.js           Einstieg · Port 3000
│   ├── pair.js             WhatsApp-Brücke · Port 3100 · läuft dauerhaft daneben
│   ├── security-headers.js CSP · HSTS · Clickjacking-Schutz
│   ├── signup.js · mailer.js · accounts.js · twofa.js · moderation.js
│   ├── badges.js · e2e.js · turn.js · extras.js · loveai.js · v3.js
│   ├── vip.js              VIP anhand der Telefonnummer (neu in V4.29)
│   ├── .env.example        STRATO_SMTP_PASS NUR als ENV
│   └── data/               5 Nutzer · 4 Chats
│
├── android/                Android-Studio-Projekt (Kotlin, Compose, minSdk 24)
├── ios/                    Swift Package (41 Tests, ML-KEM-768)
├── windows/                Go-Quelle der EXE
├── keys/                   🔑 0700 · Release-Key + Passwort — NIE im ZIP
│   ├── release.jks         0600  dein Signatur-Schlüssel
│   ├── password.txt        0600  Passwort dazu
│   └── *.example                Vorlagen (die kommen ins ZIP)
│
├── owner/                  👤 0700 · alle Zugänge — NIE im ZIP
│   ├── credentials.env     0600  Mail-Passwort, Tokens, Owner
│   ├── accounts.json       0600  Konten + Ablageorte (ohne Passwörter)
│   └── *.example                Vorlagen (die kommen ins ZIP)
│
├── tests/                  Server-Tests (61 · 12 · 9)
├── tools/                  restore-toolchain · verify-live · reset-ratelimits
│                           load-env (ENV sicher laden) · check-secrets (Leck-Suche)
├── START-HIER.md           diese Datei
└── DEPLOY-ANLEITUNG.txt    inkl. nginx-Fix
```

---

## ▶️ 1. Starten

```bash
cd Lovechat/server
npm install            # einmalig — node_modules ist absichtlich nicht dabei
node server.js         # → http://localhost:7777
```

Zweites Terminal (WhatsApp-Codes):

```bash
cd Lovechat/server
node pair.js           # QR im Terminal scannen
```

**Mit echten Zugängen** (Mail verschicken, TURN, Tokens) — ENV sicher laden:

```bash
cd Lovechat
set -a; . ./owner/credentials.env; set +a      # ✅ der sichere Weg
node server/server.js

# oder kürzer:
bash tools/load-env.sh --start
```

❌ **Nie so:** `export $(cat owner/credentials.env | xargs)`
Das zerlegt jede Zeile an Leerzeichen — ein Passwort mit Leerzeichen, `&` oder
`!` wird zerstückelt. Deshalb macht `load-env.sh` das über `set -a` + `.`.

Nach einem Neustart der Umgebung zuerst die Toolchain zurückholen:

```bash
bash Lovechat/tools/restore-toolchain.sh
```

### 🔐 Nach JEDEM Neustart: Rechte prüfen

Container und Sandboxes setzen Dateirechte beim Wiederherstellen auf `644`
zurück — der Release-Key war dann wieder weltlesbar. Genau das ist mir hier
passiert, und genau dafür gibt es den Fix-Modus:

```bash
bash tools/check-secrets.sh --fix
# ✅ keys/release.jks war 644 — auf 600 korrigiert (--fix)
# ✅ owner/ war 755 — auf 700 korrigiert (--fix)
```

`restore-toolchain.sh` ruft das am Ende selbst auf. Auf einem normalen Server
(Linux, Strato) passiert das nicht — dort bleiben die Rechte.

---

## 📊 1b. Der Wahrheits-Stand

**`STATUS.md`** — jede Zeile mit Prüfmethode, jede Lücke benannt.
Kurz: APK auslieferbar · iOS nur Krypto-Kern · EXE nie ausgeführt ·
Web/Server fertig · live noch alt.

---

## 🧪 2. Testen

```bash
cd Lovechat/server
npm test
```

Erwartete Ausgabe:

```
🏁 61/61 bestanden      (Server: Nummer→WhatsApp→Profil→Mail→Konto)
12/12 bestanden         (TOTP-Vektoren)
9/9 bestanden           (Backup-Format)
```

Plus die App-Tests:

```bash
cd Lovechat/android && ./gradlew :app:testDebugUnitTest   # 186/186
cd Lovechat/ios     && PATH=/opt/swift/usr/bin:$PATH swift test -c release   # 41/41
```

**Summe: 186 + 41 + 61 + 12 + 9 = 309**

### ⚠️ Wenn `npm test` plötzlich 429 sagt

Der Rate-Limiter zählt in `db.rateBuckets` **und speichert das in der Datenbank** —
ein Server-Neustart leert ihn deshalb NICHT. Die Testsuite setzt ihn am Anfang
selbst zurück (Route `POST /api/dev/reset-limits`, existiert **nur** wenn
`MAIL_SIMULATE=1`). Falls es doch klemmt:

```bash
node Lovechat/tools/reset-ratelimits.js    # Server vorher stoppen!
```

### ⚠️ Wenn `npm test` plötzlich `null` statt Werten zeigt

Dann antwortet ein **fremder `pair.js`** auf Port 3100 — z. B. einer aus einem
anderen Ordner. `pair.js` schreibt seine Codes in `server/data/wa-outbox.jsonl`
**relativ zu seinem eigenen Ordner**. Läuft er woanders, ist die Outbox hier leer
und der Test sieht `null`.

```bash
# Wer hält 3100?
ss -lptn | grep 3100
# Alten Prozess beenden, dann im RICHTIGEN Ordner neu starten:
kill <PID>
cd Lovechat/server && node pair.js
```

Die Tests melden in diesem Fall **ehrlich ❌** — sie werden nicht einfach grün.

---

## 📱 3. APK neu bauen

```bash
bash Lovechat/tools/restore-toolchain.sh          # JDK + Android-SDK + Swift holen
cd Lovechat/android
./gradlew :app:assembleRelease                     # signiert mit v1 + v2 + v3
```

Ergebnis: `android/app/build/outputs/apk/release/app-release.apk`
→ kopieren nach `client/app/maxichen-v4.15.apk`.

Signatur prüfen (**muss v1, v2 UND v3 zeigen** — v1 fehlte bei der kaputten APK):

```bash
/opt/sdk/build-tools/34.0.0/apksigner verify --verbose --min-sdk-version 21 \
  android/app/build/outputs/apk/release/app-release.apk
# Verified using v1 scheme (JAR signing): true    ← ohne das: "Paket ungültig"
# Verified using v2 scheme: true
# Verified using v3 scheme: true
```

`android/keystore.properties` zeigt auf `../keys/release.jks` — **diese Datei ist
absichtlich NICHT im ZIP** (sie enthält das Passwort). Im ZIP liegt nur
`keys/keystore.properties.example`. Nach dem Auspacken:

```bash
cd Lovechat/android
cp ../keys/keystore.properties.example keystore.properties
chmod 600 keystore.properties
nano keystore.properties      # storePassword + keyPassword eintragen
```

---

## 📲 4. Die drei Downloads

| | Datei | Größe | Status |
|---|---|---|---|
| 🤖 **Android** | `maxichen-v4.15.apk` | 27.985.732 B | **fertig** · v1+v2+v3 · gültig ab 01.01.2020 · Code 19 |
| 🪟 **Windows** | `maxichat-windows-4.15.exe` | 2.450.944 B | **Beta** · PE32+ GUI x64 · Go + WebView2 |
| 🍏 **iOS** | `maxichen-ios-4.15.zip` | 45.729 B | **Quellpaket** · 41/41 Tests · **keine .ipa** |

**Windows ehrlich:** Kein nativer Windows-Code — die EXE ist ein Fenster (WebView2)
um die Web-App. Hier läuft kein Windows, also **nicht auf echtem Windows getestet**.
Windows zeigt beim ersten Start „Unbekannter Herausgeber" (nicht signiert).

**iOS ehrlich:** Eine `.ipa` braucht **Mac + Xcode + Apple-Developer-Konto (99 €/Jahr)**.
Ohne Signatur startet sie auf keinem iPhone — das wäre genau der „Paket ungültig"-Fehler,
nur auf iOS. Was echt ist: 41/41 Swift-Tests, ML-KEM-768 byte-identisch zu Android.
Das Swift Package liegt in `ios/` (Xcode: File → Add Package Dependencies → Add Local).

```
APK    MD5    27a98c9bafe3e97a9853b856e053d502
       SHA256 23a5828475e9897a788126dd4a8e703ff6792249be13498153fb3af7902377fe
EXE    SHA256 cfc5b47ff8294f37c2322166515b02be86ab3e0e25e31d58f474ccb236ff0e45
iOS    SHA256 c08ca7e0d58ee70fe7aeb4a1f7d02992ed19663f5fe1f44fa191d4d47b933d54
```

---

## 📦 4b. ZIP selbst bauen — ohne Geheimnisse

```bash
cd /home/user
zip -qr Lovechat-FINAL-v4.15-SECURE.zip Lovechat \
  -x "Lovechat/keys/release.jks" \
  -x "Lovechat/keys/password.txt" \
  -x "Lovechat/owner/credentials.env" \
  -x "Lovechat/owner/accounts.json" \
  -x "Lovechat/android/keystore.properties" \
  -x "*/node_modules/*" -x "*/android/app/build/*" \
  -x "*/android/.gradle/*" -x "*/ios/.build/*" -x "*.DS_Store"
```

Wichtig: **datei-genau** ausschließen, nicht `-x "Lovechat/keys/*"` — sonst
fliegen auch `README.md` und die `.example`-Vorlagen raus und niemand versteht
das ZIP.

Danach **immer** prüfen:

```bash
bash Lovechat/tools/check-secrets.sh Lovechat-FINAL-v4.15-SECURE.zip
# → 🎉 ALLES SAUBER
```

Das Skript schaut **in den ZIP-Inhalt**, nicht nur in den Ordner. Genau so
wurde das Schlüssel-Leck gefunden: `keys/` war ausgeschlossen, aber
`android/keystore.properties` mit Klartext-Passwort lag noch drin.

---

## ⬆️ 5. Auf maxichen.de hochladen

Vollständig in **`DEPLOY-ANLEITUNG.txt`** (inkl. nginx-Konfiguration).
Kurzfassung: `client/` hochladen, `client/app/maxichen-v4.13.apk` löschen.
Danach selbst prüfen:

```bash
bash Lovechat/tools/verify-live.sh
# Ende muss sein:  🎉 ALLE PRÜFUNGEN BESTANDEN
```

Das Skript prüft genau die Fehler von letzter Woche: APK-Größe + MIME, ob die
alte v4.13 weg ist (404), ob EXE/ZIP als echte Dateien kommen (nicht als HTML),
ob `/app.js` da ist und ob Google-Fonts-Verweise weg sind.

---

## 🔑 6. Der Schlüssel

Zwei Ordner, beide **0700**, jede echte Datei **0600**:

| Ordner | Was drin ist | Warum |
|---|---|---|
| `keys/` | `release.jks` + `password.txt` | wer beides hat, baut Updates, die Android als echt akzeptiert |
| `owner/` | `credentials.env` + `accounts.json` | wer die hat, kommt an dein Postfach und den Owner-Account |

**Beide sind absichtlich NICHT im `Lovechat-FINAL-v4.15-SECURE.zip`.**
Im ZIP liegen nur `README.md` und `*.example` — so versteht man die Struktur,
ohne dass etwas Echtes mitreist.

```bash
chmod 700 owner keys
chmod 600 owner/credentials.env owner/accounts.json keys/release.jks keys/password.txt
```

→ Sicherung: **2 USB-Sticks**, offline, **getrennt vom Projekt**.
→ Verloren = kein Update mehr möglich. Alle müssten deinstallieren.
→ `accounts.json` enthält **keine** Passwörter — die gehören in einen
  Passwort-Manager. Der Server speichert ohnehin nur Hashes.

```
Zertifikat: CN=MaxiChen, OU=LoveChat, O=MaxiChen, L=Recklinghausen, ST=NRW, C=DE
SHA-256:    b42ca11f8a7836d4518c6c65bf0b0cbe5f32132e0b41d79988def6217d12caeb
Gültig:     01.01.2020 – 24.12.2049
```

---

## 🔐 7. ENV-Variablen — nie im Code

```bash
STRATO_SMTP_PASS     # nur als Umgebungsvariable
INTERNAL_TOKEN       # nur als ENV
TURN_SECRET          # nur als ENV
```

```bash
export STRATO_SMTP_PASS='…'
node server.js
```

**Verboten:** Passwort in `creds.json`, in `.js`-Dateien, in einer `.env` im Repo,
im ZIP. `server/.env.example` zeigt nur die Namen, keine Werte.

---

## ✅ 8. Getestet (in genau dieser Struktur)

| | Ergebnis |
|---|---|
| Kotlin (Android) | **186 / 186** |
| Swift (iOS-Kern) | **41 / 41** |
| Server | **61 / 61** (auch beim 2. Lauf) |
| TOTP · Backup | **12 / 12** · **9 / 9** |
| Registrierung im Browser | **durchgeklickt, Konto erstellt** ✅ |
| Secret-Scanner (`check-secrets.sh`) | **4 von 4 künstlichen Lecks erkannt** ✅ |
| Alle Downloads über HTTP | **200, echte Bytes** ✅ |
| Alte URLs | **404** ✅ |

---

## ❌ 9. Was es nicht gibt

- **Keine .ipa** (Mac + Xcode + Apple-Konto nötig)
- **Kein `MaxiChen.xcodeproj`** (Xcode öffnet `ios/Package.swift` direkt)
- **Kein finaler Windows-Test** (hier läuft kein Windows)
- **Kein Gerätetest der APK** (Signatur, zipalign, Manifest geprüft)
- **Kein iOS-Chat** (Krypto-Kern ja, UI/X3DH/Ratchet nein)

---

*Made with 💗 — by Maxichen*
