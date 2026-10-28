# 📦 LoveChat aufs Handy — ohne Build, ohne Store

**Stand 27.10.2026 · V4.29**

## ✅ Der Weg (30 Sekunden)

1. Server starten: `npm i` → `npm start`
2. Handy ins gleiche WLAN, im Browser öffnen: `http://<PC-IP>:3900`
3. **iPhone (Safari):** Teilen → „Zum Home-Bildschirm"
   **Android (Chrome):** Menü → „App installieren"
4. Fertig: eigenes Icon (pinke Sprechblase mit Herz), Vollbild, kein Browser-Rahmen,
   Push-Nachrichten. Das ist eine **PWA** — `client/manifest.webmanifest` + `client/sw.js`.

> Das ist kein Notbehelf. WhatsApp Web, Telegram Web und viele andere laufen
> genauso. Nichts zu signieren, nichts hochzuladen, kein 45-MB-Download.

## 📱 Was noch an App-Dateien im Ordner liegt

| Datei | Größe | Was es ist |
|---|---|---|
| `client/app/maxichen-v4.15.apk` | 27.985.732 B | echte Android-App (Kotlin, 186 Tests) — **älter**, kennt die neuen Funktionen nicht |
| `client/app/maxichat-windows-4.15.exe` | 2.450.944 B | Fenster um die Web-App (WebView2), nicht signiert |
| `client/app/maxichen-ios-4.15.zip` | 45.729 B | Xcode-Projekt (keine fertige IPA — dafür braucht es einen Mac) |

Die alte Zusatz-App (46 MB) ist **gelöscht**, auf Wunsch. Sie war doppelt zur
Web-App und hier nicht mehr baubar.

## 🔧 Wenn du trotzdem eine native Android-App willst

Ohne Zusatz-SDK, direkt mit dem Android-SDK (Projekt liegt in `android/`):

```bash
cd Lovechat/android
./gradlew assembleRelease          # braucht JDK 17 + Android SDK
# Ergebnis: app/build/outputs/apk/release/app-release.apk
```

Signiert wird mit `release.jks` (in `keys/`, Passwort in `keys/password.txt`,
Rechte 0600 — niemals weitergeben, niemals ins Archiv).

**Was hier nicht geht:** In dieser Umgebung gibt es kein Android-SDK und keinen
Mac. Frühere Release-Builds scheiterten an zu wenig RAM (1,98 GB, 0 Swap →
`OutOfMemoryError` bei R8/ProGuard) — das steht so in `STATUS.md`.

## ❌ Was ich nicht liefern kann

| Ding | Warum nicht |
|---|---|
| Neue `.exe` | Windows-Build braucht MSVC — hier nicht vorhanden. Die V4.15-EXE bleibt. |
| `.ipa` fürs iPhone | Braucht macOS + Xcode + Apple-Developer-Konto (99 €/Jahr). Das Xcode-Projekt liegt bei. |
| Store-Upload | Play Store verlangt Developer-Konto (25 $) + Review. Nicht nötig: PWA reicht. |
