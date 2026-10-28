#!/usr/bin/env bash
# =====================================================================
#  🕵️ check-secrets.sh — findet ausgelaufene Geheimnisse
# ---------------------------------------------------------------------
#  Sucht im ORDNER und im ZIP-Inhalt (nicht nur im Ordner!) nach:
#    · release.jks / *.keystore / *.p12       (Release-Schlüssel)
#    · password.txt, keystore.properties      (Passwörter)
#    · credentials.env, accounts.json, .env   (Zugänge)
#    · internal-token.txt, creds.json
#    · Private-Key-Blöcke (-----BEGIN ... PRIVATE KEY-----)
#    · gesetzte Mail-/Owner-Passwörter im Klartext
#
#  Benutzung:
#    bash tools/check-secrets.sh
#    bash tools/check-secrets.sh Lovechat-FINAL-v4.15-SECURE.zip
#    bash tools/check-secrets.sh --fix
#       ↑ repariert falsche Rechte gleich mit (nach jedem Sandbox-Neustart!)
#
#  Exit 0 = sauber · Exit 1 = LECK GEFUNDEN
# =====================================================================
set -uo pipefail

FIX=0
KEEP=()
for a in "$@"; do
  case "$a" in
    --fix) FIX=1 ;;
    *)     KEEP+=("$a") ;;
  esac
done
set -- ${KEEP[@]+"${KEEP[@]}"}

STARTDIR="$PWD"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Relative ZIP-Pfade würden nach dem cd ins Projekt nicht mehr stimmen
ARGS=()
for a in "$@"; do
  case "$a" in
    /*) ARGS+=("$a") ;;
    *)  ARGS+=("$STARTDIR/$a") ;;
  esac
done
set -- ${ARGS[@]+"${ARGS[@]}"}

cd "$ROOT" || exit 1

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
[ -t 1 ] || { RED=; GRN=; YEL=; DIM=; OFF=; }
FEHLER=0; WARN=0; OK=0

rot()  { echo "${RED}❌ $*${OFF}"; FEHLER=$((FEHLER+1)); }
gelb() { echo "${YEL}⚠️  $*${OFF}"; WARN=$((WARN+1)); }
gruen(){ echo "${GRN}✅ $*${OFF}"; OK=$((OK+1)); }

echo "🕵️  Secret-Check — $(date '+%d.%m.%Y %H:%M')"
echo "    Ordner: $ROOT"
echo ""

# ---------------------------------------------------------------- 1. Ordner
echo "── 1. Projektordner ────────────────────────────────────────────"

# Erlaubte Vorlagen sind kein Leck
ist_vorlage() { case "$1" in *.example|*/README.md|*/.gitignore) return 0;; esac; return 1; }

VERBOTEN=(
  "keys/release.jks" "keys/password.txt"
  "owner/credentials.env" "owner/accounts.json"
  "android/keystore.properties" "flutter_app/android/keystore.properties"
  "server/.env" "server/data/internal-token.txt" "creds.json"
)

for f in "${VERBOTEN[@]}"; do
  if [ -e "$f" ]; then
    PERM=$(stat -c '%a' "$f" 2>/dev/null || stat -f '%Lp' "$f")
    case "$f" in
      keys/release.jks|keys/password.txt|owner/credentials.env|owner/accounts.json|android/keystore.properties|flutter_app/android/keystore.properties)
        if [ "$PERM" = "600" ] || [ "$PERM" = "400" ]; then
          gruen "$f existiert — Rechte $PERM (ok, nur lokal)"
        elif [ "$FIX" = "1" ]; then
          chmod 600 "$f" && gruen "$f war $PERM — auf 600 korrigiert (--fix)"
        else
          rot "$f ist $PERM — jeder kann es lesen! → chmod 600 $f  (oder: --fix)"
        fi ;;
      *)
        gelb "$f existiert (Laufzeit-Datei, darf nicht ins ZIP/Git)" ;;
    esac
  fi
done

# Ordner-Rechte
for d in owner keys; do
  [ -d "$d" ] || continue
  P=$(stat -c '%a' "$d")
  if [ "$P" = "700" ]; then gruen "$d/ ist 0700"
  elif [ "$FIX" = "1" ]; then
    chmod 700 "$d" && gruen "$d/ war $P — auf 700 korrigiert (--fix)"
  else rot "$d/ ist $P — muss 700 sein → chmod 700 $d  (oder: --fix)"; fi
done

# Irgendwo sonst noch Schlüssel?
EXTRA=$(find . -path ./node_modules -prune -o \( -name "*.jks" -o -name "*.p12" -o -name "*.keystore" \) -print 2>/dev/null | grep -v '^./keys/' || true)
# 🔴 V4.22: keystore.properties liegt ZWEIMAL (android/ und flutter_app/android/).
#    Die feste Liste kannte nur eine. Jetzt: jede Datei zählt.
KS_PROPS=$(find . -path ./node_modules -prune -o -name "keystore.properties" -print 2>/dev/null | grep -v '\.example' || true)
for f in $KS_PROPS; do
  if grep -qE 'storePassword=|keyPassword=' "$f" 2>/dev/null; then
    P=$(stat -c '%a' "$f" 2>/dev/null)
    if [ "$P" = "600" ]; then gruen "$f enthält Passwörter, Rechte 600 (nur lokal)"
    elif [ "$FIX" = "1" ]; then chmod 600 "$f" && gruen "$f war $P — auf 600 korrigiert (--fix)"
    else rot "$f enthält KLARTEXT-Passwörter und ist $P → chmod 600 $f"; fi
  fi
done
if [ -n "$EXTRA" ]; then
  while IFS= read -r f; do rot "Schlüssel außerhalb von keys/: $f"; done <<< "$EXTRA"
else
  gruen "kein Schlüssel außerhalb von keys/"
fi

# Private-Key-Blöcke in Textdateien
KEYS=$(grep -rlI --exclude-dir=node_modules --exclude-dir=.git --exclude="*.example" \
        --exclude="check-secrets.sh" \
        "BEGIN .*PRIVATE KEY" . 2>/dev/null || true)
if [ -n "$KEYS" ]; then
  while IFS= read -r f; do rot "Private-Key-Block in $f"; done <<< "$KEYS"
else
  gruen "keine Private-Key-Blöcke in Textdateien"
fi

# Gesetzte Zugangsdaten im Klartext (nicht die Vorlagen, nicht Kommentare)
# Findet:   KEY="wert"   KEY='wert'   KEY=wert   const KEY="wert"   env.KEY = "wert"
# Ignoriert: Kommentarzeilen (#), process.env, Platzhalter, Vorlagen.
KLAR=$(grep -rnI --exclude-dir=node_modules --exclude-dir=.git \
        --exclude="*.example" --exclude="*.md" --exclude="check-secrets.sh" \
        -E "(STRATO_SMTP_PASS|OWNER_PASS|TURN_SECRET|INTERNAL_TOKEN|WA_PASSWORD)[[:space:]]*[:=][[:space:]]*[\"'][^\"']{6,}[\"']" . 2>/dev/null \
        | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' \
        | grep -viE 'changeme|bitte-aendern|DEIN_|xxx|placeholder|geheim' || true)
# Zweiter Fall: ohne Anführungszeichen, ganze Zeile, z. B.  INTERNAL_TOKEN=abc123def456
KLAR2=$(grep -rnI --exclude-dir=node_modules --exclude-dir=.git \
        --exclude="*.example" --exclude="*.md" --exclude="check-secrets.sh" \
        -E "^[[:space:]]*(export[[:space:]]+)?(STRATO_SMTP_PASS|OWNER_PASS|TURN_SECRET|INTERNAL_TOKEN)=[A-Za-z0-9!@#%^&*_.-]{8,}[[:space:]]*$" . 2>/dev/null \
        | grep -viE 'changeme|bitte-aendern' || true)
KLAR=$(printf '%s\n%s\n' "$KLAR" "$KLAR2" | sed '/^$/d')
if [ -n "$KLAR" ]; then
  while IFS= read -r l; do rot "Passwort im Klartext: ${l:0:110}"; done <<< "$KLAR"
else
  gruen "keine gesetzten Passwörter im Code"
fi

# ---------------------------------------------------------------- 2. ZIP
echo ""
echo "── 2. ZIP-Inhalt ───────────────────────────────────────────────"

ZIPS=("$@")
if [ ${#ZIPS[@]} -eq 0 ]; then
  while IFS= read -r z; do ZIPS+=("$z"); done < <(ls -1t ../*.zip 2>/dev/null | head -3)
fi

if [ ${#ZIPS[@]} -eq 0 ]; then
  gelb "kein ZIP gefunden (übersprungen)"
else
  for Z in "${ZIPS[@]}"; do
    [ -f "$Z" ] || { gelb "$Z fehlt (übersprungen)"; continue; }
    echo "${DIM}   $Z ($(du -h "$Z" | cut -f1))${OFF}"
    INHALT=$(unzip -l "$Z" 2>/dev/null | awk 'NR>3 && $4 != "" {print $4}')

    BAD=$(echo "$INHALT" | grep -E '(^|/)release\.jks$|(^|/)password\.txt$|/credentials\.env$|/accounts\.json$|/keystore\.properties$|(^|/)\.env$|internal-token\.txt$|(^|/)creds\.json$|\.(p12|keystore)$|node_modules/' || true)
    if [ -n "$BAD" ]; then
      echo "$BAD" | head -10 | while IFS= read -r b; do rot "$Z enthält: $b"; done
      FEHLER=$((FEHLER+1))
    else
      gruen "$(basename "$Z"): keine Schlüssel, keine Passwörter, kein node_modules"
    fi

    VORL=$(echo "$INHALT" | grep -cE '\.example$' || true)
    [ "$VORL" -gt 0 ] && echo "${DIM}   (davon $VORL sinnvolle .example-Vorlagen — so soll es sein)${OFF}"
  done
fi

# ---------------------------------------------------------------- Fazit
echo ""
echo "════════════════════════════════════════════════════════════════"
if [ "$FEHLER" -gt 0 ]; then
  echo "${RED}🔴 $FEHLER Leck(s) gefunden · $WARN Hinweis(e) · $OK ok${OFF}"
  echo "   Reparieren, BEVOR das ZIP irgendwohin geht."
  exit 1
fi
if [ "$WARN" -gt 0 ]; then
  echo "${YEL}🟡 $WARN Hinweis(e) · $OK ok — nichts Kritisches${OFF}"
  exit 0
fi
echo "${GRN}🎉 ALLES SAUBER — $OK Prüfungen bestanden${OFF}"
exit 0
