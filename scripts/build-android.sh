#!/usr/bin/env bash
# Build and install the CricketScorer debug APK on this Mac.
#
# Must be run from YOUR OWN Terminal, not from a Claude tool call. Gradle binds
# a UDP socket at startup (FileLockContentionHandler) and socket binding is
# denied to Claude's child processes on this machine — Gradle dies before it
# reads any build file. Same reason the emulator and adb have to be started by
# you.
#
# Usage:
#   scripts/build-android.sh              build + install on a running device
#   scripts/build-android.sh build        build only, don't install
#   scripts/build-android.sh clean        clean first, then build + install
set -euo pipefail

# React Native 0.73 rejects newer JDKs; the system default here is 25.
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$PATH"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { echo "ERROR: $*" >&2; exit 1; }

[ -d "$JAVA_HOME" ]    || fail "JDK 17 not found at $JAVA_HOME"
[ -d "$ANDROID_HOME" ] || fail "Android SDK not found at $ANDROID_HOME"
[ -d "$ANDROID_HOME/platforms/android-34" ] || fail "SDK platform 34 missing — install it with sdkmanager"
[ -d node_modules/react-native ] || fail "node_modules missing — run npm install"

# Gradle reads the SDK location from here. Written rather than committed,
# because it is machine-specific.
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

echo "JDK    : $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
echo "SDK    : $ANDROID_HOME"
echo "Devices:"; adb devices | sed '1d;/^$/d' | sed 's/^/  /' || true
echo

MODE="${1:-install}"
cd android

case "$MODE" in
  clean) ./gradlew clean && ./gradlew installDebug ;;
  build) ./gradlew assembleDebug ;;
  *)     ./gradlew installDebug ;;
esac

cd "$ROOT"
if [ "$MODE" = "build" ]; then
  echo
  echo "APK: $(ls -1 android/app/build/outputs/apk/debug/*.apk 2>/dev/null | head -1)"
else
  echo
  echo "Installed. Launch it with:"
  echo "  adb shell monkey -p com.cricketscorer -c android.intent.category.LAUNCHER 1"
  echo
  echo "To watch app logs (paste these to Claude if something misbehaves):"
  echo "  adb logcat -s ReactNativeJS:V ReactNative:V AndroidRuntime:E"
fi
