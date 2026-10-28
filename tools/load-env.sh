#!/usr/bin/env bash
# =====================================================================
#  🔐 load-env.sh — lädt owner/credentials.env SICHER in die Umgebung
# ---------------------------------------------------------------------
#  Warum nicht "export $(cat ... | xargs)"?
#  Das zerlegt jede Zeile an Leerzeichen. Ein Passwort mit Leerzeichen,
#  &, ! oder $ wird zerstückelt oder sogar ausgeführt. Dieses Skript
#  nutzt "." (source) über set -a — da bleibt alles heil.
#
#  Benutzung:
#    bash tools/load-env.sh                 # nur prüfen + laden
#    bash tools/load-env.sh --start         # laden + server.js starten
#    bash tools/load-env.sh --start --pair  # dazu pair.js im Hintergrund
#    bash tools/load-env.sh -f other.env    # andere Datei
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="$ROOT/owner/credentials.env"
START=0
PAIR=0

while [ $# -gt 0 ]; do
  case "$1" in
    --start) START=1; shift ;;
    --pair)  PAIR=1;  shift ;;
    -f)      FILE="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "❓ Unbekannt: $1 (--help zeigt die Optionen)"; exit 2 ;;
  esac
done

if [ ! -f "$FILE" ]; then
  echo "❌ $FILE fehlt."
  echo ""
  echo "   So anlegen:"
  echo "     cd $ROOT/owner"
  echo "     cp credentials.env.example credentials.env"
  echo "     chmod 600 credentials.env"
  echo "     nano credentials.env"
  exit 1
fi

# ---- Rechte prüfen -------------------------------------------------
PERM=$(stat -c '%a' "$FILE" 2>/dev/null || stat -f '%Lp' "$FILE")
if [ "$PERM" != "600" ] && [ "$PERM" != "400" ]; then
  echo "⚠️  $FILE hat Rechte $PERM — das kann jeder lesen."
  echo "    chmod 600 \"$FILE\""
  chmod 600 "$FILE" && echo "    ✅ korrigiert auf 600"
fi

# ---- Platzhalter finden --------------------------------------------
WARN=0
while IFS= read -r line; do
  case "$line" in
    \#*|'') continue ;;
    *changeme*|*CHANGEME*|*bitte-aendern*)
      echo "⚠️  Noch Platzhalter: ${line%%=*}"
      WARN=1 ;;
  esac
done < "$FILE"

# ---- Werte mit Leerzeichen MÜSSEN in Anführungszeichen ------------
# Ein nacktes  PASS=mein passwort & so  führt die Shell aus ("so: command
# not found") und die Variable bleibt leer. Deshalb vorher prüfen.
UNQUOTED=0
LN=0
while IFS= read -r line; do
  LN=$((LN+1))
  case "$line" in \#*|'') continue ;; esac
  case "$line" in *=*) ;; *) continue ;; esac
  VAL="${line#*=}"
  case "$VAL" in
    \"*|\'*) continue ;;            # korrekt in Anführungszeichen
  esac
  case "$VAL" in
    *[[:space:]]*)
      echo "❌ Zeile $LN: Wert mit Leerzeichen ohne Anführungszeichen:"
      echo "     ${line}"
      echo "     → so: ${line%%=*}=\"${VAL}\"   (oder in einfache Anführungszeichen)"
      UNQUOTED=1 ;;
  esac
done < "$FILE"
if [ "$UNQUOTED" = "1" ]; then
  echo ""
  echo "   Abgebrochen — sonst zerlegt die Shell das Passwort und die Variable bleibt leer."
  exit 1
fi

# ---- Laden (der sichere Weg) ---------------------------------------
set -a
# shellcheck disable=SC1090
. "$FILE"
set +a

echo "✅ geladen: $FILE"
echo "   PORT=${PORT:-3000} · MAIL_SIMULATE=${MAIL_SIMULATE:-?} · WA_SIMULATE=${WA_SIMULATE:-?}"

if [ "${MAIL_SIMULATE:-1}" = "0" ] && [ -z "${STRATO_SMTP_PASS:-}" ]; then
  echo "⚠️  MAIL_SIMULATE=0, aber STRATO_SMTP_PASS ist leer → Mails schlagen fehl."
  WARN=1
fi
if [ "$WARN" = "1" ]; then
  echo ""
  echo "   Das ist beim ersten Start normal. Vor dem Livegang ausfüllen."
fi

[ "$START" = "1" ] || exit 0

# ---- Starten -------------------------------------------------------
cd "$ROOT/server"
[ -d node_modules ] || { echo "📦 npm install …"; npm install --silent; }

if [ "$PAIR" = "1" ]; then
  echo "🔗 pair.js startet auf Port ${WA_PORT:-3100} …"
  ( setsid node pair.js > /tmp/lovechat-pair.log 2>&1 & )
  sleep 2
  curl -s -o /dev/null -w "   pair.js: HTTP %{http_code}\n" "http://127.0.0.1:${WA_PORT:-3100}/health" || true
fi

echo "💗 server.js startet auf Port ${PORT:-3000} …"
exec node server.js
