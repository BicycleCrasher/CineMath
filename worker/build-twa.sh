#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# WatchTrack TWA Build Script
#
# Builds a Trusted Web Activity APK for sideloading onto Sony Bravia Google TV.
# Handles: bubblewrap install, project init, Leanback manifest patching, build.
#
# Prerequisites: Node.js + npm (already have)
# First run downloads JDK + Android SDK (~700 MB, one-time).
# =============================================================================

MANIFEST_URL="https://bicyclecrasher.github.io/WatchTrack/manifest.json"
BUILD_DIR="$HOME/watchtrack-twa"
BANNER_SRC="$(cd "$(dirname "$0")/.." && pwd)/icons/tv-banner.png"
PACKAGE_NAME="com.watchtrack.tv"

echo "=== WatchTrack TWA Builder ==="
echo ""

# --- Step 1: Ensure bubblewrap is installed ---
if ! command -v bubblewrap &>/dev/null; then
  echo "[1/5] Installing @bubblewrap/cli..."
  npm install -g @bubblewrap/cli
else
  echo "[1/5] bubblewrap already installed."
fi

# --- Step 2: Init the TWA project ---
echo ""
echo "[2/5] Initializing TWA project at $BUILD_DIR"
echo "      Bubblewrap will ask interactive questions."
echo "      Recommended answers:"
echo "        Package name:  $PACKAGE_NAME"
echo "        App name:      WatchTrack"
echo "        Orientation:   default"
echo "        Signing key:   let bubblewrap create one (or point to existing keystore)"
echo ""

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

if [ ! -f "twa-manifest.json" ]; then
  bubblewrap init --manifest="$MANIFEST_URL"
else
  echo "      twa-manifest.json already exists — skipping init."
  echo "      Delete $BUILD_DIR/twa-manifest.json to re-init."
fi

# --- Step 3: Patch AndroidManifest.xml for Android TV ---
echo ""
echo "[3/5] Patching AndroidManifest.xml for Leanback (Android TV)..."

MANIFEST_FILE="$BUILD_DIR/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST_FILE" ]; then
  echo "      ERROR: $MANIFEST_FILE not found."
  echo "      Run bubblewrap init first, then re-run this script."
  exit 1
fi

# Add touchscreen + leanback feature declarations if not already present
if ! grep -q "android.hardware.touchscreen" "$MANIFEST_FILE"; then
  sed -i.bak '/<manifest/,/<application/ {
    /<application/i\
\    <uses-feature android:name="android.hardware.touchscreen" android:required="false"/>\
\    <uses-feature android:name="android.software.leanback" android:required="false"/>
  }' "$MANIFEST_FILE"
  echo "      Added touchscreen + leanback feature declarations."
else
  echo "      Feature declarations already present."
fi

# Add LEANBACK_LAUNCHER intent filter if not already present
if ! grep -q "LEANBACK_LAUNCHER" "$MANIFEST_FILE"; then
  sed -i.bak '/<category android:name="android.intent.category.LAUNCHER"/a\
\            </intent-filter>\
\            <intent-filter>\
\                <action android:name="android.intent.action.MAIN"/>\
\                <category android:name="android.intent.category.LEANBACK_LAUNCHER"/>
  ' "$MANIFEST_FILE"
  echo "      Added LEANBACK_LAUNCHER intent filter."
else
  echo "      LEANBACK_LAUNCHER already present."
fi

# Add banner attribute to <application> tag if not already present
if ! grep -q "android:banner" "$MANIFEST_FILE"; then
  sed -i.bak 's/<application/<application android:banner="@drawable\/tv_banner"/' "$MANIFEST_FILE"
  echo "      Added banner attribute to <application>."
else
  echo "      Banner attribute already present."
fi

# Remove portrait orientation lock if present
if grep -q 'android:screenOrientation="portrait"' "$MANIFEST_FILE"; then
  sed -i.bak 's/android:screenOrientation="portrait"/android:screenOrientation="unspecified"/' "$MANIFEST_FILE"
  echo "      Changed orientation from portrait to unspecified."
fi

# Clean up sed backups
rm -f "$MANIFEST_FILE".bak

# --- Step 4: Copy TV banner ---
echo ""
echo "[4/5] Copying TV banner image..."

DRAWABLE_DIR="$BUILD_DIR/app/src/main/res/drawable"
mkdir -p "$DRAWABLE_DIR"

if [ -f "$BANNER_SRC" ]; then
  cp "$BANNER_SRC" "$DRAWABLE_DIR/tv_banner.png"
  echo "      Copied tv-banner.png → $DRAWABLE_DIR/tv_banner.png"
else
  echo "      WARNING: Banner not found at $BANNER_SRC"
  echo "      The APK will build but won't show a banner in the TV launcher."
fi

# --- Step 5: Build ---
echo ""
echo "[5/5] Building APK..."
bubblewrap build

echo ""
echo "=== Build complete ==="
echo ""
echo "APK location: $BUILD_DIR/app-release-signed.apk"
echo ""
echo "Next steps:"
echo "  1. Extract your signing key fingerprint:"
echo "     keytool -list -v -keystore <your-keystore-path> | grep SHA256"
echo ""
echo "  2. Update assetlinks.json with the SHA-256 fingerprint at:"
echo "     https://github.com/BicycleCrasher/bicyclecrasher.github.io"
echo ""
echo "  3. Sideload to Sony Bravia:"
echo "     - Copy app-release-signed.apk to a USB drive (FAT32/exFAT)"
echo "     - Plug into TV → Settings > Security > Unknown Sources → enable"
echo "     - Open file manager on TV → navigate to USB → install APK"
echo ""
