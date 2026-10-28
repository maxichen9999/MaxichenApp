#!/usr/bin/env bash
# =====================================================================
# 🧪 SignupAPI gegen den echten server.js testen (auf Linux möglich!)
# ---------------------------------------------------------------------
# Voraussetzung: server.js + pair.js laufen im Simulationsmodus.
#
#   cd /home/user/lovechat
#   INTERNAL_TOKEN=testtoken123456789012345678 WA_SIMULATE=1 node pair.js &
#   INTERNAL_TOKEN=testtoken123456789012345678 MAIL_SIMULATE=1 node server.js &
#
#   bash maxichen-ios/Integration/run-integration.sh
# =====================================================================
set -e
cd "$(dirname "$0")"
SWIFT=${SWIFT:-/opt/swift/usr/bin/swiftc}
TMP=$(mktemp -d)
cp ../Sources/MaxiChenKit/*.swift "$TMP/"
cp ../Sources/MaxiChenUI/SignupAPI.swift "$TMP/"
cp main.swift "$TMP/"
# Auf Linux liegt URLSession in FoundationNetworking, und das Modul
# MaxiChenKit gibt es hier nicht (alles in einer Datei kompiliert).
python3 - "$TMP/SignupAPI.swift" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace("import MaxiChenKit", "")
if "FoundationNetworking" not in s:
    s = s.replace("import Foundation", "import Foundation\n#if canImport(FoundationNetworking)\nimport FoundationNetworking\n#endif", 1)
open(p, "w").write(s)
PY
"$SWIFT" -O "$TMP"/*.swift -o "$TMP/iosit"
"$TMP/iosit"
