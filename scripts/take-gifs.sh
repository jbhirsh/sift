#!/bin/bash
# Record each GIF scenario in e2e/gifs on the booted simulator, as a video
# for a PR's GIFs (scripts/pr-gifs.mjs turns them into GIFs). Each
# e2e/gifs/<name>.yaml gets the app to where its GIF begins, records the
# steps with Maestro's startRecording (named <name>), then takes a
# <name>-end screenshot to say every step ran. All of them run in one
# Maestro session: restarting the driver per flow loses taps (CLAUDE.md,
# "E2E runner"). Recording the real app keeps its SF Symbols, materials
# and animations, at native resolution and real speed.
#
# Usage: scripts/take-gifs.sh [out-dir]   (default: gif-videos)
# Writes <name>.mp4 for each scenario that finished, a failed/ folder for
# the ones that stopped early (never made into GIFs), and Maestro's log.
# Never fails: a scenario that stops early is a warning, not a broken build.
set -uo pipefail

OUT_DIR="${1:-gif-videos}"
mkdir -p "$OUT_DIR/failed"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
MARKER="$(mktemp)"
shopt -s nullglob

flows=(e2e/gifs/*.yaml)
if [ "${#flows[@]}" -eq 0 ]; then
  echo "No GIF scenarios in e2e/gifs."
  exit 0
fi

# The same status bar as the screenshots (take-screenshots.sh): Apple's
# 9:41, full signal and battery.
xcrun simctl status_bar booted override --time "9:41" --dataNetwork wifi \
  --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 \
  --batteryState charged --batteryLevel 100 || true

if ! maestro test --debug-output "$OUT_DIR/debug" --flatten-debug-output \
  e2e/gifs > "$OUT_DIR/maestro.log" 2>&1; then
  echo "::warning::A GIF scenario stopped early. See maestro.log in the ios-gif-videos artifact."
fi
xcrun simctl status_bar booted clear || true

# Maestro names each flow's debug folder after its `name:`, and an artifact
# path can't hold a colon or any of "<>|*? (GitHub refuses the whole
# upload): swap them for dashes.
find "$OUT_DIR/debug" -depth -name '*[:"<>|*?]*' 2>/dev/null |
  while IFS= read -r path; do
    mv "$path" "$(dirname "$path")/$(basename "$path" | tr ':"<>|*?' '-------')"
  done

# Maestro writes each recording and screenshot under its output folder
# (2.8+) or the working directory (older ones): gather this run's.
find . "$HOME/.maestro" -path ./node_modules -prune -o -type f \( -name '*.mp4' -o -name '*-end.png' \) \
  -newer "$MARKER" -print 2>/dev/null |
  while IFS= read -r file; do
    [ "$(dirname "$file")" -ef "$OUT_DIR" ] || mv "$file" "$OUT_DIR/"
  done
rm -f "$MARKER"

for flow in "${flows[@]}"; do
  name="$(basename "$flow" .yaml)"
  if [ ! -s "$OUT_DIR/$name.mp4" ]; then
    echo "::warning::GIF $name: nothing was recorded. See maestro.log in the ios-gif-videos artifact."
  elif [ ! -f "$OUT_DIR/$name-end.png" ]; then
    mv "$OUT_DIR/$name.mp4" "$OUT_DIR/failed/"
    echo "::warning::GIF $name stopped before its last step, so it won't be made into a GIF. See maestro.log in the ios-gif-videos artifact."
  else
    echo "Recorded $name.mp4"
  fi
done
