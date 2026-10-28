#!/usr/bin/env bash
# =====================================================================
# ✅ verify-live.sh — prüft maxichen.de nach dem Upload
# ---------------------------------------------------------------------
# Benutzung:   bash tools/verify-live.sh
#              bash tools/verify-live.sh https://andere-domain.de
#
# Prüft genau die Dinge, die beim letzten Mal schiefgingen:
#   · Liefert die APK wirklich 27.985.732 Byte und den APK-Mime?
#   · Ist die alte v4.13 wirklich weg (404)?
#   · Kommen .exe/.zip als echte Dateien — oder als HTML?
#   · Ist das Inline-Script weg (Registrierung)?
#   · Sind die Fonts lokal da (kein Google)?
# =====================================================================
set -u

BASE="${1:-https://maxichen.de}"
OK=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
dim()   { printf '\033[2m%s\033[0m\n' "$1"; }

ok()   { green "  ✅ $1"; OK=$((OK+1)); }
bad()  { red   "  ❌ $1"; FAIL=$((FAIL+1)); }
info() { dim   "     $1"; }

# ---------------------------------------------------------------- Kopf
echo
echo "💗 maxichen.de — Live-Prüfung"
echo "   Ziel: $BASE"
echo "======================================================"

# Größe + Typ einer Datei holen
size_of() { curl -sIL --max-time 25 "$1" | tr -d '\r' | awk 'tolower($1)=="content-length:"{v=$2} END{print v}'; }
type_of() { curl -sIL --max-time 25 "$1" | tr -d '\r' | awk 'tolower($1)=="content-type:"{print $2}' | tail -1; }
code_of() { curl -s -o /dev/null -w '%{http_code}' -L --max-time 25 "$1"; }

# ------------------------------------------------------- 1) Die APK
echo
echo "1) Android-APK (die Datei, die 'Paket ungültig' gemacht hat)"
APK="$BASE/app/maxichen-v4.15.apk"
S=$(size_of "$APK"); T=$(type_of "$APK"); C=$(code_of "$APK")
if [ "$C" != "200" ]; then
  bad "APK liefert HTTP $C statt 200"
elif [ "$S" = "27985732" ]; then
  ok "APK: HTTP 200, $S Byte — richtige Größe"
  info "Content-Type: $T"
  case "$T" in
    *android.package-archive*) ok "MIME ist application/vnd.android.package-archive" ;;
    text/html*)                bad "MIME ist TEXT/HTML — das ist die Startseite, keine APK!" ;;
    *)                         info "MIME: $T (nicht ideal, aber meist ok)" ;;
  esac
else
  bad "APK hat $S Byte, erwartet 27985732"
  [ "$S" = "130871" ] && red "     ← 130.871 Byte = das ist die index.html! Nicht hochgeladen / nginx-Catch-All."
fi

# Echtes ZIP? (erste 2 Bytes = "PK")
head2=$(curl -sL --max-time 30 -r 0-1 "$APK" | od -An -c | tr -d ' \n')
[ "$head2" = "PK" ] && ok "Datei beginnt mit 'PK' (echtes ZIP/APK)" || bad "Datei beginnt NICHT mit PK ($head2) — kein gültiges APK"

# -------------------------------------------------- 2) Alte APK weg
echo
echo "2) Alte APK gelöscht (sonst lädt jeder noch die kaputte)"
C=$(code_of "$BASE/app/maxichen-v4.13.apk")
if [ "$C" = "404" ]; then ok "maxichen-v4.13.apk → 404 (weg, richtig)"
elif [ "$C" = "200" ]; then bad "maxichen-v4.13.apk → 200 (liegt noch auf dem Server!)"
else info "maxichen-v4.13.apk → HTTP $C"; fi

# ------------------------------------------------------- 3) EXE/ZIP
echo
echo "3) Windows-EXE und Quellcode-ZIP (echte Dateien, kein HTML)"
for pair in "maxichat-windows-4.15.exe:2450944" "sources-v4.15.zip:451716" "maxichen-ios-4.15.zip:45729"; do
  F="${pair%%:*}"; WANT="${pair##*:}"
  S=$(size_of "$BASE/app/$F"); T=$(type_of "$BASE/app/$F")
  if [ "$S" = "$WANT" ]; then ok "$F: $S Byte"
  elif [ "$S" = "130871" ]; then bad "$F: liefert 130.871 B = index.html (nicht hochgeladen)"
  else bad "$F: $S Byte, erwartet $WANT"; fi
  case "$T" in text/html*) bad "   $F hat MIME text/html statt Binärdatei" ;; esac
done

# --------------------------------------------------- 4) Die Seiten
echo
echo "4) Seiten erreichbar"
for p in "/" "/downloads" "/app/" "/app.js" "/fonts/fonts.css"; do
  C=$(code_of "$BASE$p")
  [ "$C" = "200" ] && ok "$p → 200" || bad "$p → HTTP $C"
done

# ------------------------------------------- 5) Registrierung
echo
echo "5) Registrierung (der Bug: Inline-Script wurde von der CSP blockiert)"
HOMEPAGE=$(curl -sL --max-time 25 "$BASE/")
if printf '%s' "$HOMEPAGE" | grep -qi 'script src="/app.js"'; then
  ok 'Startseite lädt /app.js (kein Inline-Script mehr)'
else
  bad 'Startseite hat KEIN <script src="/app.js"> — alter Stand?'
fi
if printf '%s' "$HOMEPAGE" | grep -qi 'fonts.googleapis\|fonts.gstatic'; then
  bad "Startseite lädt noch von Google Fonts (CSP blockt das → falsche Schrift)"
else
  ok "Keine Google-Fonts-Verweise mehr"
fi
JS=$(code_of "$BASE/app.js")
[ "$JS" = "200" ] && ok "/app.js ist da ($JS)" || bad "/app.js fehlt → Registrierung tot"

# ------------------------------------------------------- Fazit
echo
echo "======================================================"
if [ "$FAIL" -eq 0 ]; then
  green "🎉 ALLE PRÜFUNGEN BESTANDEN  ($OK ok, 0 Fehler)"
  echo
  echo "   Du kannst jetzt auf dem Handy:"
  echo "   1. alte App deinstallieren"
  echo "   2. $BASE/downloads öffnen"
  echo "   3. installieren 💗"
  exit 0
else
  red "⚠️  $FAIL FEHLER, $OK ok"
  echo
  echo "   Häufigste Ursache: noch nicht hochgeladen, oder nginx"
  echo "   schickt fehlende Dateien als index.html (Punkt 3 der"
  echo "   DEPLOY-ANLEITUNG.txt)."
  exit 1
fi
