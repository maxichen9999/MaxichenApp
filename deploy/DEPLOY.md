# 🚀 LoveChat auf maxichen.de — in 6 Schritten

**Was hier fertig ist:** die komplette Web-Version, der Server, die nginx-Konfiguration,
die Download-Seite und die Test-Suite. **Was du machen musst:** hochladen und starten.
Ich habe keinen Zugang zu deinem Server — kein Passwort, kein SSH-Schlüssel, keine IP.

---

## 0. Was in `deploy/` liegt

```
Lovechat/deploy/
├── downloads/                    → /var/www/maxichen.de/downloads/
│   ├── index.html                (die pinke Download-Seite)
│   ├── maxichen-v4.15.apk         27.985.732 B
│   ├── maxichat-windows-4.15.exe   2.450.944 B
│   ├── maxichen-ios-4.15.zip          45.729 B  (Xcode-Projekt, keine IPA)
│   └── SHA256SUMS.txt
├── chat/                         → /var/www/maxichen.de/chat/
│   └── index.html · app.js · v422.js · v423.js · v425.js · v426.js · v427.js · icons …
├── nginx-maxichen.de.conf        → /etc/nginx/sites-available/maxichen.de
└── DEPLOY.md                     (diese Datei)
```

> **Große Dateien liegen hier nicht drin** (Workspace-Grenze): `downloads/` enthält
> nur `index.html` + `prepare.sh`. Vor dem Hochladen einmal
> `bash deploy/downloads/prepare.sh` laufen lassen — das kopiert APK/EXE/IPA
> aus `client/app/` hinein und schreibt `SHA256SUMS.txt` neu.

### Vorher lokal ansehen (ohne Server)

`deploy/chat/index.html` lädt seine Skripte **absolut** (`/app.js`, `/v427.js`,
`/fonts/…`). Deshalb liefert ein `python3 -m http.server` im Ordner `deploy/`
überall **404** — das ist kein Fehler der Seite, sondern ein fehlendes `alias`.
Wer es trotzdem lokal testen will, nimmt den kleinen Nachbau der nginx-Regeln:

```bash
cd Lovechat
python3 tools/serve-deploy.py 8099
# → http://127.0.0.1:8099/chat/index.html   (Skripte laden, 3 neue Medien-Einträge im ➕-Menü)
```

`/api/...` antwortet dort mit 404 — auf dem echten Server macht das nginx per
`proxy_pass` zu pm2. Auf maxichen.de ist es also da, lokal nicht.

---

## 1. Hochladen

```bash
# vom eigenen Rechner aus (Pfad anpassen)
cd Lovechat/deploy
scp -r downloads chat  DEINUSER@maxichen.de:/tmp/lovechat-deploy/

ssh DEINUSER@maxichen.de
sudo mkdir -p /var/www/maxichen.de
sudo cp -r /tmp/lovechat-deploy/downloads /var/www/maxichen.de/
sudo cp -r /tmp/lovechat-deploy/chat      /var/www/maxichen.de/
sudo chown -R www-data:www-data /var/www/maxichen.de/downloads /var/www/maxichen.de/chat
sudo chmod -R a+rX /var/www/maxichen.de
```

## 2. Backend (Node) hochladen und starten

```bash
# package.json liegt im Projekt-Hauptordner (es gibt nur EINE)
scp -r Lovechat/server Lovechat/client Lovechat/tests Lovechat/tools Lovechat/package.json \
    DEINUSER@maxichen.de:/var/www/maxichen.de/

ssh DEINUSER@maxichen.de
cd /var/www/maxichen.de
npm install --omit=dev      # legt node_modules NEBEN server/ an
```

> Warum `npm install` **eine Ebene über** `server/`? Weil `server/server.js`
> Pakete auch im übergeordneten `node_modules` findet (Node sucht nach oben).
> So gibt es genau **eine** `package.json` — lokal wie auf dem Server.
> Wer trotzdem `server/package.json` will, legt sie dort an; nötig ist es nicht.

`server/.env` anlegen (Rechte 0600):

```bash
# /var/www/maxichen.de/server/.env
PORT=3900
WA_PORT=3100
INTERNAL_TOKEN=<langer-zufallswert>
TURN_SECRET=<zufall>
TURN_HOST=maxichen.de
TURN_REALM=maxichat.test
# 🔴 NIE im Klartext ins Repo — nur hier:
STRATO_SMTP_PASS=<dein-smtp-passwort>
BACKUP_SECRET=<mindestens-32-zeichen>
```

```bash
chmod 600 .env
```

## 3. Prozesse dauerhaft starten (pm2)

```bash
sudo npm i -g pm2

cd /var/www/maxichen.de/server
# pair.js MUSS mit WA_SIMULATE=1 laufen, wenn kein echtes WhatsApp
# verknüpft ist — sonst versucht er einen QR-Login und die Hälfte
# der Tests fällt. (In Produktion scannst du den QR einmal, dann ohne.)
pm2 start server/pair.js --name lovechat-pair --env WA_SIMULATE=1 --env WA_PORT=3100
pm2 start server/server.js --name lovechat-api --env PORT=3900
pm2 save
pm2 startup            # Ausgabe ausführen, damit es nach Reboot läuft
```

Prüfen:

```bash
curl -s http://127.0.0.1:3900/api/health | head -c 200
curl -s http://127.0.0.1:3100/health      | head -c 200
```

## 4. nginx

```bash
sudo cp Lovechat/deploy/nginx-maxichen.de.conf /etc/nginx/sites-available/maxichen.de
sudo ln -sf /etc/nginx/sites-available/maxichen.de /etc/nginx/sites-enabled/
sudo nginx -t            # MUSS „syntax is ok" sagen
sudo systemctl reload nginx
```

⚠️ **Die `map $http_upgrade`-Zeile gehört in den `http{}`-Block**, nicht in
`server{}`. Wenn `nginx -t` meckert („map directive is not allowed here"),
die Zeile nach `/etc/nginx/nginx.conf` in den `http{}`-Block verschieben.

## 5. TLS

```bash
sudo certbot --nginx -d maxichen.de -d www.maxichen.de
```

## 6. Gegenprobe — genau diese vier Befehle

```bash
# 1. APK wirklich eine APK? (Content-Type + Größe, KEIN HTML!)
curl -sI https://maxichen.de/downloads/maxichen-v4.15.apk \
  | grep -iE "HTTP/|content-type|content-length"
# erwartet: 200 · application/vnd.android.package-archive · 27985732

# 2. Fehlende Datei → echter 404, NICHT 200 mit HTML
curl -sI https://maxichen.de/downloads/gibtsnicht.apk | head -1
# erwartet: 404

# 3. Chat-Seite
curl -sI https://maxichen.de/chat/ | head -3
# erwartet: 200 text/html

# 4. API
curl -s https://maxichen.de/api/health | head -c 120
```

Wenn 1. `text/html` liefert, greift die Endungsregel **nicht** — dann steht
`location /` in der Datei **vor** der `\.(apk|…)$`-Regel. Reihenfolge tauschen.

---

## 7. Tests gegen den echten Server

```bash
cd /var/www/maxichen.de/server
LC_BASE=https://maxichen.de LC_WA=http://127.0.0.1:3100 npm test
# erwartet: 758 grün, 0 rot (Stand V4.26)
```

---

## ❌ Was ich NICHT liefern kann (und warum)

| Ding | Warum nicht |
|---|---|
| **Hochladen** | kein SSH-Zugang zu maxichen.de von hier |
| **Neue APK** | Die alte Flutter-App ist auf Wunsch **gelöscht**. Wer eine native App will: `cd android && ./gradlew assembleRelease` (JDK 17 + Android SDK nötig) |
| **EXE (neu)** | braucht Windows + MSVC. Die mitgelieferte `.exe` ist V4.15 |
| **IPA** | braucht macOS + Xcode + Apple-Developer-Konto. `maxichen-ios-4.15.zip` ist ein **Xcode-Projekt**, keine fertige IPA |
| **„Live auf maxichen.de"** | Ich kann nicht prüfen, was auf deinem Server läuft, ohne Zugang |

---

## 8. Wenn etwas nicht geht

| Symptom | Ursache | Fix |
|---|---|---|
| APK lädt als HTML | `location /` vor der Endungsregel | Reihenfolge in der conf tauschen |
| `502 Bad Gateway` auf `/api/` | Node läuft nicht | `pm2 status` · `pm2 logs lovechat-api` |
| Chat lädt, aber kein Login | `/api/` nicht geproxyt | `curl -sI https://maxichen.de/api/health` |
| `map`-Fehler bei `nginx -t` | map im falschen Block | nach `http{}` in `nginx.conf` |
| Tests fallen im `pair`-Teil | `WA_SIMULATE=1` fehlt | `pm2 restart lovechat-pair --update-env` |
