# 👤 owner/ — alle wichtigen Zugänge

**Dieser Ordner ist 0700. Er kommt NIE ins ZIP, NIE auf GitHub, NIE in einen Chat.**

Hier liegen die Dinge, mit denen man *dich* übernehmen könnte: Server-Zugang,
Mail-Passwort, Owner-Konto. Deshalb getrennt von allem anderen.

---

## Was liegt hier

| Datei | Echt? | Inhalt |
|---|---|---|
| `credentials.env` | 🔴 **ECHT** · 0600 | Mail-Passwort, Owner-Zugang, Tokens, TURN |
| `accounts.json` | 🔴 **ECHT** · 0600 | deine Konten + wo sie liegen (ohne Passwörter!) |
| `credentials.env.example` | 🟢 Vorlage | kommt ins ZIP, enthält nur Platzhalter |
| `accounts.json.example` | 🟢 Vorlage | kommt ins ZIP |
| `README.md` | 🟢 | diese Datei — kommt ins ZIP |

---

## 1. Ausfüllen

```bash
cd ~/Lovechat/owner
cp -n credentials.env.example credentials.env
cp -n accounts.json.example  accounts.json
chmod 600 credentials.env accounts.json
nano credentials.env
```

---

## 2. Auf dem Server laden — **richtig**

❌ **Nicht so:** `export $(cat credentials.env | xargs)`

Das zerlegt Zeilen an Leerzeichen. Ein Passwort mit Leerzeichen, `&`, `!` oder
`$` wird zerstückelt oder ausgeführt — im besten Fall startet der Server nicht,
im schlechteren landet Müll in einer Variable und du suchst zwei Stunden.

✅ **So:**

```bash
cd ~/Lovechat
set -a                    # alles Exportierte geht in die Umgebung
. ./owner/credentials.env
set +a
node server/server.js
```

Oder mit dem Helfer, der genau das macht (plus Prüfung auf vergessene Werte):

```bash
bash tools/load-env.sh                       # prüft nur
bash tools/load-env.sh --start               # lädt + startet server.js
```

---

## 3. Regeln

- **Datei-Rechte:** Ordner `700`, Dateien `600`. Alles andere ist offen.
  ```bash
  chmod 700 ~/Lovechat/owner && chmod 600 ~/Lovechat/owner/credentials.env ~/Lovechat/owner/accounts.json
  ```
- **Niemals ins ZIP.** Der ZIP-Befehl schließt `owner/` echte Dateien aus.
- **Niemals zu Git.** `owner/.gitignore` und die Root-`.gitignore` verhindern es.
- **Niemals in einen Chat, Screenshot, TikTok, Discord.** Auch nicht „nur kurz".
- **Nach einem Leak:** Passwort sofort ändern, alle Sessions im Security-Center
  abmelden, `INTERNAL_TOKEN` neu erzeugen.

---

## 4. Was NICHT hier rein gehört

**Keine Passwörter von Nutzern.** Der Server speichert nur Hashes — er kann
Klartext-Passwörter gar nicht wiederherstellen. Eine Liste mit Klartext-Passwörtern
wäre der wertvollste Datenklau überhaupt und würde allem widersprechen, was LoveChat
an Sicherheit verspricht.

`accounts.json` enthält deshalb **Benutzernamen + Ablageort**, keine Passwörter:

```json
{
  "owner":  { "user": "maxi_owner", "note": "Owner-Konto, 2FA Pflicht" },
  "email":  { "user": "contact@maxichen.de", "host": "smtp.strato.de", "pass_wo": "Passwort-Manager" },
  "server": { "ssh": "user@maxichen.de", "path": "/var/www/maxichen.de" }
}
```

Das Passwort selbst gehört in einen **Passwort-Manager** (Bitwarden, KeePassXC,
1Password) — verschlüsselt, mit Backup. Nicht in eine `.json` im Klartext.

---

## 5. Prüfen, dass nichts ausgelaufen ist

```bash
bash tools/check-secrets.sh              # prüft Ordner + letztes ZIP
bash tools/check-secrets.sh Lovechat-FINAL-v4.15-SECURE.zip
```

Das Skript sucht nach `.jks`, `password.txt`, `credentials.env`, `accounts.json`,
Private-Keys und Klartext-Passwörtern in Dateien — **auch im ZIP-Inhalt**, nicht
nur im Ordner. Genau so wurde das Schlüssel-Leck gefunden.

---

*Made with 💗 — by Maxichen*
