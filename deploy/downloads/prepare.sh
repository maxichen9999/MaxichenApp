#!/usr/bin/env bash
# =====================================================================
#  Macht aus deploy/downloads/ ein vollständiges Upload-Verzeichnis.
# ---------------------------------------------------------------------
#  WARUM DAS EXISTIERT:
#  Die Binärdateien liegen EINMAL im Projekt (client/app/). Eine zweite
#  Kopie in deploy/downloads/ hätte den Workspace auf 187 MB gebracht —
#  über der Grenze, ab der Dateien beim Sichern stillschweigend fehlen.
#  Genau das ist in V4.24 passiert (die 46-MB-APK war danach weg).
#
#  Aufruf:  bash deploy/downloads/prepare.sh
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"
SRC=../../client/app

need=(lovechat-4.20-flutter.apk maxichen-v4.15.apk maxichat-windows-4.15.exe maxichen-ios-4.15.zip)
missing=0
for f in "${need[@]}"; do
  if [ -f "$SRC/$f" ]; then
    cp -f "$SRC/$f" .
    echo "  ✅ $f  ($(stat -c%s "$SRC/$f") B)"
  else
    echo "  ❌ FEHLT: $SRC/$f"
    missing=$((missing+1))
  fi
done

# Prüfsummen NEU schreiben (nicht die alten behalten!)
rm -f SHA256SUMS.txt
for f in "${need[@]}"; do [ -f "$f" ] && sha256sum "$f"; done > SHA256SUMS.txt
echo
echo "SHA256SUMS.txt geschrieben:"
cat SHA256SUMS.txt
echo
[ "$missing" -eq 0 ] && echo "✅ fertig — jetzt: scp -r deploy/downloads USER@maxichen.de:/var/www/maxichen.de/" \
                     || echo "⚠️  $missing Datei(en) fehlen — siehe oben"
