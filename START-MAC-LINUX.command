#!/bin/bash
# LoveChat starten — doppelklicken (Mac) oder im Terminal: ./START-MAC-LINUX.command
cd "$(dirname "$0")" || exit 1

echo ""
echo "  LoveChat wird gestartet ..."
echo ""

if [ ! -d "server/node_modules" ]; then
  echo "  Erster Start: Pakete werden installiert (einmalig, braucht Internet) ..."
  npm install --no-audit --no-fund || exit 1
  echo ""
fi

echo "  Server laeuft gleich auf http://localhost:7777"
echo "  Fenster offen lassen. Zum Beenden: Strg + C"
echo ""
node server.js
