#!/usr/bin/env bash
# Start everything needed to run CricketScorer on the local emulator, then
# build, install and launch it.
#
# Run from YOUR OWN Terminal — Gradle, the emulator and adb all need to bind
# sockets, which Claude's tool calls cannot do.
#
#   scripts/dev-start.sh          start everything, build, install, launch
#   scripts/dev-start.sh --stop   shut the emulator and Metro down
#
# Safe to re-run: it reuses an emulator or Metro that is already up rather than
# starting a second one.
set -uo pipefail

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
ADB="$ANDROID_HOME/platform-tools/adb"
EMU="$ANDROID_HOME/emulator/emulator"
AVD="${AVD:-cricket}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !! \033[0m%s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ── stop mode ────────────────────────────────────────────────
if [ "${1:-}" = "--stop" ]; then
  say "Stopping Metro"
  pkill -f "react-native/cli.js start" 2>/dev/null && echo "  stopped" || echo "  was not running"
  say "Stopping emulator"
  "$ADB" emu kill 2>/dev/null && echo "  stopped" || echo "  was not running"
  exit 0
fi

[ -x "$ADB" ] || die "adb not found at $ADB"
[ -x "$EMU" ] || die "emulator not found at $EMU"
[ -d "$JAVA_HOME" ] || die "JDK 17 not found at $JAVA_HOME"

# ── 1. emulator ──────────────────────────────────────────────
# `adb devices` lists a booting emulator too, so also check boot_completed
# before trusting it.
if "$ADB" devices | grep -q "emulator-.*device$"; then
  say "Emulator already running"
else
  say "Starting emulator '$AVD' (this takes a minute)"
  "$EMU" -avd "$AVD" -no-snapshot-load >/tmp/emulator.log 2>&1 &
  sleep 3
fi

say "Waiting for the emulator to finish booting"
"$ADB" wait-for-device
for i in $(seq 1 90); do
  [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
  sleep 2
  [ "$i" = 90 ] && die "emulator did not finish booting — see /tmp/emulator.log"
done
echo "  booted: $("$ADB" devices | grep emulator | head -1)"

# ── 2. Metro ─────────────────────────────────────────────────
# A debug build fetches its JavaScript from Metro at runtime, so without it the
# app dies on the splash screen with no useful error.
if curl -s --max-time 2 "http://localhost:8081/status" | grep -q packager; then
  say "Metro already running on 8081"
else
  say "Starting Metro"
  nohup npx react-native start >/tmp/metro.log 2>&1 &
  for i in $(seq 1 45); do
    curl -s --max-time 2 "http://localhost:8081/status" | grep -q packager && break
    sleep 2
    [ "$i" = 45 ] && die "Metro did not come up — see /tmp/metro.log"
  done
  echo "  ready"
fi

# ── 3. port forward ──────────────────────────────────────────
# Maps port 8081 inside the emulator to 8081 on this Mac. `gradle installDebug`
# does not do this (only `react-native run-android` does), and without it the
# app cannot reach Metro.
say "Forwarding port 8081"
"$ADB" reverse tcp:8081 tcp:8081 >/dev/null && echo "  done"

# ── 4. build + install ───────────────────────────────────────
say "Building and installing"
if ! ./scripts/build-android.sh >/tmp/build.txt 2>&1; then
  warn "Build failed. Last 25 lines of /tmp/build.txt:"
  tail -25 /tmp/build.txt
  die "build failed"
fi
grep -q "BUILD SUCCESSFUL" /tmp/build.txt && echo "  $(grep 'BUILD SUCCESSFUL' /tmp/build.txt)"

# ── 5. launch ────────────────────────────────────────────────
say "Launching the app"
"$ADB" shell am start -n com.cricketscorer/.MainActivity >/dev/null
sleep 6

# ── 6. did it survive? ───────────────────────────────────────
if [ -n "$("$ADB" shell pidof com.cricketscorer 2>/dev/null | tr -d '\r')" ]; then
  say "App is running"
else
  warn "The app started and then exited. Crash details:"
  "$ADB" logcat -d -b crash | tail -25
fi

say "Screenshot"
"$ADB" exec-out screencap -p > /tmp/screen.png && echo "  saved to /tmp/screen.png"

cat <<'EOF'

Useful from here:
  reload JS after an edit ....... press r in the Metro terminal, or:
                                  adb shell input keyevent 82   (opens dev menu)
  fresh screenshot .............. adb exec-out screencap -p > /tmp/screen.png
  watch app logs ................ adb logcat -s ReactNativeJS:V AndroidRuntime:E
  shut everything down .......... scripts/dev-start.sh --stop

Note: after a JS-only change you do NOT need to rebuild — just reload.
Rebuild only after changing native code or dependencies.
EOF
