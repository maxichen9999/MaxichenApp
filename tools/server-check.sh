#!/usr/bin/env bash
# =====================================================================
#  🩺 server-check.sh — läuft AUF dem Strato-Server und sagt, warum
#     maxichen.de nicht antwortet.
#
#  Von außen sieht es so aus:
#     http://maxichen.de  → 301 auf https://  (nginx lebt)
#     https://maxichen.de → hängt 60 s, 0 Bytes (nach dem TLS-Handshake)
#     Zertifikat gültig (Let's Encrypt), TLS-Handshake ok
#
#  Das heißt fast immer: nginx nimmt die Verbindung an, aber das Ziel
#  dahinter (der Node-Server) antwortet nicht. Dieses Skript findet
#  genau das.
#
#  BENUTZUNG (auf dem Server, per SSH):
#     bash server-check.sh
#     bash server-check.sh /var/www/maxichen.de     # anderer Pfad
#
#  Es ändert NICHTS. Es liest nur.
# =====================================================================
set -uo pipefail

DOCROOT="${1:-/var/www/maxichen.de}"
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; OFF=$'\033[0m'
[ -t 1 ] || { RED=; GRN=; YEL=; BLD=; OFF=; }

frage=0
fehler=0
gut()  { echo "${GRN}✅ $*${OFF}"; }
bad()  { echo "${RED}❌ $*${OFF}"; fehler=$((fehler+1)); }
warn() { echo "${YEL}⚠️  $*${OFF}"; }
abschnitt() { echo; echo "${BLD}── $* ──────────────────────────────────────────${OFF}"; }

echo "${BLD}🩺 Lovechat Server-Diagnose${OFF}  $(date '+%d.%m.%Y %H:%M')"
echo "   Pfad: $DOCROOT"

# ---------------------------------------------------------------- 1. Node
abschnitt "1. Läuft der Node-Server?"

NODE_PIDS=$(pgrep -af "node .*server\.js" 2>/dev/null || true)
if [ -n "$NODE_PIDS" ]; then
  gut "server.js läuft:"
  echo "$NODE_PIDS" | sed 's/^/     /'
else
  bad "server.js läuft NICHT — das ist der Grund für den Timeout"
  echo "     Starten:  cd $DOCROOT/server && nohup node server.js > /tmp/lovechat.log 2>&1 &"
  echo "     Log:      tail -50 /tmp/lovechat.log"
fi

PAIR_PIDS=$(pgrep -af "node .*pair\.js" 2>/dev/null || true)
if [ -n "$PAIR_PIDS" ]; then
  gut "pair.js läuft (WhatsApp-Brücke, Port 3100)"
else
  warn "pair.js läuft nicht — WhatsApp-Codes gehen nicht (Rest funktioniert)"
fi

# ---------------------------------------------------------------- 2. Ports
abschnitt "2. Hört der Server auf den richtigen Ports?"

if command -v ss >/dev/null 2>&1; then
  SS=$(ss -lptn 2>/dev/null)
  echo "$SS" | grep -E ':(3000|3100|80|443)\b' | sed 's/^/     /' || warn "kein Listener auf 3000/3100/80/443 gefunden"
  if echo "$SS" | grep -q ':3000 '; then
    gut "Port 3000 hört"
    # ⚠️ Wichtig: 0.0.0.0 = von außen erreichbar. Besser 127.0.0.1 hinter nginx.
    if echo "$SS" | grep -qE ':3000 .*0\.0\.0\.0'; then
      warn "Port 3000 lauscht auf 0.0.0.0 (von außen erreichbar)"
      echo "     Sicherer: nur 127.0.0.1, nginx macht den Rest davor"
    fi
  else
    bad "Port 3000 hört NICHT — nginx kann nicht proxien"
  fi
else
  warn "ss nicht verfügbar"
fi

# ---------------------------------------------------------------- 3. Lokal
abschnitt "3. Antwortet der Node-Server lokal?"

CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null)
CODE=${CODE:-000}
if [ "$CODE" = "200" ]; then
  H=$(curl -s --max-time 5 http://127.0.0.1:3000/api/health)
  gut "http://127.0.0.1:3000/api/health → $H"
else
  bad "Node antwortet lokal NICHT (Code $CODE)"
  echo "     Wenn 000: Prozess hängt oder ist tot → neu starten"
  echo "     Wenn 502/503: nginx läuft, aber Upstream fehlt"
fi

LOCAL=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1/ 2>/dev/null)
LOCAL=${LOCAL:-000}
if [ "$LOCAL" = "000" ]; then
  bad "nginx selbst antwortet lokal nicht auf Port 80 (Code 000)"
else
  gut "nginx antwortet lokal auf Port 80 (HTTP $LOCAL)"
fi

# ---------------------------------------------------------------- 4. nginx
abschnitt "4. nginx-Konfiguration"

if ! command -v nginx >/dev/null 2>&1; then
  warn "nginx ist hier nicht installiert (oder nicht im PATH) — Abschnitte 4 und 7 werden übersprungen"
else
  if nginx -t 2>/tmp/nginxtest; then
    gut "nginx -t: Konfiguration ist gültig"
  else
    bad "nginx -t meldet Fehler:"
    sed 's/^/     /' /tmp/nginxtest | head -12
  fi
fi

CONF=$(nginx -T 2>/dev/null | grep -nE "server_name .*maxichen\.de|listen .*443|proxy_pass|root " | head -30)
if [ -n "$CONF" ]; then
  echo "     Relevante Zeilen:"
  echo "$CONF" | sed 's/^/       /'
else
  warn "keine maxichen.de-Konfiguration in nginx -T gefunden"
fi

# Hat der 443-Block ein proxy_pass auf einen Port, der NICHT hört?
PROXY=$(nginx -T 2>/dev/null | grep -oE "proxy_pass https?://[^;]+" | sort -u)
if [ -n "$PROXY" ]; then
  echo "     proxy_pass-Ziele:"
  echo "$PROXY" | sed 's/^/       /'
  for p in $(echo "$PROXY" | grep -oE ':[0-9]+' | tr -d ':' | sort -u); do
    if ss -lptn 2>/dev/null | grep -q ":$p "; then
      gut "Upstream-Port $p hört"
    else
      bad "🔴 Upstream-Port $p hört NICHT — nginx hängt genau hier"
    fi
  done
fi

# ---------------------------------------------------------------- 5. Logs
abschnitt "5. Die letzten Fehler aus den Logs"

for L in /var/log/nginx/error.log /var/log/nginx/maxichen.error.log /var/log/nginx/*error*.log; do
  [ -f "$L" ] || continue
  echo "     ${BLD}$L${OFF} (letzte 8 Zeilen):"
  tail -8 "$L" 2>/dev/null | sed 's/^/       /'
  break
done

if [ -f /tmp/lovechat.log ]; then
  echo "     ${BLD}/tmp/lovechat.log${OFF}:"
  tail -15 /tmp/lovechat.log | sed 's/^/       /'
else
  warn "kein /tmp/lovechat.log — wenn du mit nohup startest, landet es dort"
fi

# ---------------------------------------------------------------- 6. Dateien
abschnitt "6. Liegen die Dateien da, wo nginx sie sucht?"

for f in index.html downloads.html app.js; do
  if [ -f "$DOCROOT/$f" ]; then
    gut "$f vorhanden ($(stat -c%s "$DOCROOT/$f") B)"
  else
    bad "$f FEHLT in $DOCROOT"
  fi
done
[ -f "$DOCROOT/fonts/fonts.css" ] && gut "fonts/ vorhanden" || bad "fonts/ FEHLT (Schrift lädt nicht)"
[ -f "$DOCROOT/app/maxichen-v4.15.apk" ] && gut "APK vorhanden ($(stat -c%s "$DOCROOT/app/maxichen-v4.15.apk") B)" || warn "APK fehlt in app/"
[ -f "$DOCROOT/app/maxichen-v4.13.apk" ] && warn "🔴 alte maxichen-v4.13.apk liegt noch da → löschen!"

# ---------------------------------------------------------------- 7. Zert
abschnitt "7. Zertifikat"

CERT=$(nginx -T 2>/dev/null | grep -oE "ssl_certificate\s+\S+;" | head -1 | sed 's/ssl_certificate\s*//;s/;//')
if [ -n "$CERT" ] && [ -f "$CERT" ]; then
  END=$(openssl x509 -enddate -noout -in "$CERT" 2>/dev/null | cut -d= -f2)
  if openssl x509 -checkend 604800 -noout -in "$CERT" 2>/dev/null; then
    gut "Zertifikat gültig bis: $END"
  else
    bad "Zertifikat läuft in <7 Tagen ab: $END → certbot renew"
  fi
else
  warn "ssl_certificate nicht gefunden (Pfad: ${CERT:-unbekannt})"
fi

# ---------------------------------------------------------------- Fazit
echo
echo "════════════════════════════════════════════════════════════════"
if [ "$fehler" -eq 0 ]; then
  echo "${GRN}🎉 Keine harten Fehler gefunden.${OFF}"
  echo "   Wenn die Seite von außen trotzdem nicht geht: Strato-Firewall"
  echo "   oder DNS prüfen."
else
  echo "${RED}🔴 $fehler Fehler gefunden.${OFF}"
  echo
  echo "   Häufigste Ursachen, in dieser Reihenfolge:"
  echo "   1. Node-Server läuft nicht  → cd $DOCROOT/server && nohup node server.js > /tmp/lovechat.log 2>&1 &"
  echo "   2. nginx zeigt auf falschen Port  → proxy_pass http://127.0.0.1:3000"
  echo "   3. Dateien liegen woanders  → root $DOCROOT"
  echo
  echo "   Danach: sudo nginx -t && sudo systemctl reload nginx"
fi
exit 0
