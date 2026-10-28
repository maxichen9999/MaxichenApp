#!/usr/bin/env bash
# =====================================================================
# 🛠️ MaxiChat — Toolchain wiederherstellen + APK neu bauen
# ---------------------------------------------------------------------
# Nötig, weil /opt (JDK + Android-SDK) NICHT im Workspace-Snapshot liegt.
# Nach einem Snapshot-Rollback:  bash Lovechat/tools/restore-toolchain.sh
# Danach fehlt nur noch die APK in Lovechat/client/app/ — die baut dieses Script.
# =====================================================================
set -e

JDK=/opt/jdk17
SDK=/opt/sdk
DL=/var/tmp/kit
SRC=/home/user/Lovechat/android

echo "📦 1/5 Ordner anlegen"
sudo mkdir -p "$JDK" "$SDK" "$DL"
sudo chown -R "$(id -u)":"$(id -g)" /opt/jdk17 /opt/sdk /var/tmp/kit
mkdir -p "$DL"

echo "⬇️ 2/5 JDK 17 + cmdline-tools laden (nur wenn nicht vorhanden)"
[ -x "$JDK/bin/java" ] || curl -sSL --retry 3 --max-time 600 -o "$DL/jdk17.tar.gz" \
  "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
[ -f "$SDK/cmdline-tools/latest/bin/sdkmanager" ] || curl -sSL --retry 3 --max-time 600 -o "$DL/cmdline-tools.zip" \
  "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"

echo "🔧 3/5 entpacken"
if [ ! -x "$JDK/bin/java" ]; then tar -xzf "$DL/jdk17.tar.gz" -C "$JDK" --strip-components=1; fi
if [ ! -f "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$SDK/cmdline-tools"
  unzip -q -o "$DL/cmdline-tools.zip" -d "$SDK/cmdline-tools"
  mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
fi

echo "📜 4/5 SDK-Lizenzen + Pakete"
mkdir -p "$SDK/licenses"
printf '\n24333f8a63b6825ea9c5514f83c2829b004d1fee\n8933bad161af4178b1185d1a37fbf41ea5269c55\nd56f5187479451eabf01fb78af6dfcb131a6481e\n' \
  > "$SDK/licenses/android-sdk-license"
if [ ! -f "$SDK/platforms/android-36/android.jar" ] || [ ! -x "$SDK/build-tools/34.0.0/aapt2" ]; then
  JAVA_HOME=$JDK PATH=$JDK/bin:$PATH "$SDK/cmdline-tools/latest/bin/sdkmanager" \
    --sdk_root="$SDK" "platform-tools" "platforms;android-36" "build-tools;34.0.0" > /tmp/sdkmanager.log 2>&1 \
    || { echo "❌ sdkmanager fehlgeschlagen — /tmp/sdkmanager.log"; exit 1; }
fi

echo "🧠 5/5 Quellen + Swap (2 GB) + APK bauen"
# Quellen aus dem Liefer-Zip holen, falls der Snapshot sie verloren hat
if [ ! -f "$SRC/app/src/main/java/de/maxichen/app/crypto/MlKem768.kt" ]; then
  echo "   ↳ sources-v4.15.zip auspacken"
  ( cd "$SRC" && unzip -oq /home/user/Lovechat/client/app/sources-v4.15.zip )
fi
chmod +x "$SRC/gradlew"
if ! sudo swapon --show 2>/dev/null | grep -q swapfile; then
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile > /dev/null
  sudo swapon /swapfile
fi
printf 'sdk.dir=%s\n' "$SDK" > "$SRC/local.properties"
cd "$SRC"
# 🔑 Release-Signatur: keystore.properties muss existieren, sonst wird die APK
#    unsigniert und ist auf keinem Handy installierbar ("Paket ungültig").
if [ ! -f "$SRC/keystore.properties" ]; then
  cat > "$SRC/keystore.properties" <<EOF
storeFile=/home/user/Lovechat/keys/release.jks
storePassword=$(grep 'Passwort:' /home/user/Lovechat/keys/password.txt | awk '{print $2}')
keyAlias=maxichat
keyPassword=$(grep 'Passwort:' /home/user/Lovechat/keys/password.txt | awk '{print $2}')
EOF
  chmod 600 "$SRC/keystore.properties"
fi

JAVA_HOME=$JDK PATH=$JDK/bin:$PATH ./gradlew :app:testDebugUnitTest :app:assembleRelease --console=plain > /tmp/build.log 2>&1
tail -5 /tmp/build.log

APK=app/build/outputs/apk/release/app-release.apk
BT="$SDK/build-tools/34.0.0"
echo "🔏 Signatur prüfen (v1 muss true sein):"
JAVA_HOME=$JDK PATH=$JDK/bin:$PATH "$BT/apksigner" verify --verbose --min-sdk-version 21 "$APK" | grep -E "Verified using v[123]"

cp "$APK" /home/user/Lovechat/client/app/maxichen-v4.15.apk
echo "✅ fertig: /home/user/Lovechat/client/app/maxichen-v4.15.apk"
echo "   Erwartet: 27.985.732 Bytes · code 19 · \"4.15\""
echo "   Prüfen:   md5sum /home/user/Lovechat/client/app/maxichen-v4.15.apk"
echo "   MD5 soll: 27a98c9bafe3e97a9853b856e053d502"

# 🔐 Rechte nach einem Neustart wiederherstellen
#    (Sandboxes/Container setzen Dateirechte beim Wiederherstellen auf 644 zurück)
echo ""
echo "🔐 Rechte prüfen:"
bash "$(dirname "$0")/check-secrets.sh" --fix | grep -E "korrigiert|SAUBER|Leck" || true
