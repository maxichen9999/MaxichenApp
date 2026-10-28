# 🔑 keys/ — der Release-Schlüssel

**Ordner 0700 · Dateien 0600 · NIE im ZIP · NIE auf GitHub.**

| Datei | Echt? | Was |
|---|---|---|
| `release.jks` | 🔴 ECHT | dein Signatur-Schlüssel (Android akzeptiert nur Updates, die damit signiert sind) |
| `password.txt` | 🔴 ECHT | das Passwort dazu |
| `release.jks.example` | 🟢 Vorlage | nur ein Platzhalter-Text, **kein** gültiger Key |
| `password.txt.example` | 🟢 Vorlage | Platzhalter |
| `keystore.properties.example` | 🟢 Vorlage | für den Android-Build |

---

## Warum das so streng ist

Android prüft bei jedem Update, ob die Signatur zur installierten App passt.
Passt sie nicht, kommt **„App nicht installiert"** — für immer, bis alle
deinstallieren. Wer `release.jks` **und** das Passwort hat, kann Updates bauen,
die deine Nutzer ohne Warnung installieren.

Deshalb: Schlüssel **und** Passwort getrennt vom Projekt, beide 0600.

```
Zertifikat:  CN=MaxiChen, OU=LoveChat, O=MaxiChen, L=Recklinghausen, ST=NRW, C=DE
SHA-256:     b42ca11f8a7836d4518c6c65bf0b0cbe5f32132e0b41d79988def6217d12caeb
Gültig:      01.01.2020 – 24.12.2049
```

---

## Backup — einmal, richtig

1. USB-Stick 1 → `release.jks` + `password.txt`
2. USB-Stick 2 → dasselbe, **anderer** Stick, **anderer** Ort
3. Beide offline aufbewahren (nicht am Rechner hängen lassen)

**Verloren = kein Update mehr möglich.** Auf beiden Sticks, nie nur einem.

---

## Benutzen

Der Android-Build liest `android/keystore.properties`. Die wird **erzeugt**, nicht
mitgeliefert:

```bash
cd ~/Lovechat/android
cp ../keys/keystore.properties.example keystore.properties
chmod 600 keystore.properties
nano keystore.properties        # Passwort aus keys/password.txt eintragen
./gradlew :app:assembleRelease
```

Oder automatisch:

```bash
bash tools/restore-toolchain.sh   # liest keys/password.txt und baut keystore.properties
```

---

## Prüfen

```bash
# Rechte
ls -l ~/Lovechat/keys       # -rw------- für release.jks und password.txt

# Nichts ausgelaufen?
bash tools/check-secrets.sh
```

---

## Im ZIP liegt

`keys/README.md` · `keys/.gitignore` · `keys/release.jks.example` ·
`keys/password.txt.example` · `keys/keystore.properties.example`

**Nicht** im ZIP: `release.jks`, `password.txt`.

---

*Made with 💗 — by Maxichen*
