#!/bin/bash
# Photograph the main screens on the booted simulator, in light and dark,
# for PR descriptions: e2e/screenshots/screens.yaml walks Setup, the sort
# sheet, Sift, the decisions list, Settings and Done. A web export can't
# draw SF Symbols; these are the real app as iOS renders it.
#
# Usage: scripts/take-screenshots.sh [out-dir]   (default: screenshots)
# Never fails: a missed screenshot is a warning, not a broken build.
set -uo pipefail

OUT_DIR="${1:-screenshots}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
MARKER="$(mktemp)"

for mode in light dark; do
  xcrun simctl ui booted appearance "$mode"
  if ! maestro test \
    -e MODE="$mode" \
    --debug-output "$OUT_DIR/debug-$mode" --flatten-debug-output \
    e2e/screenshots/screens.yaml > "$OUT_DIR/maestro-$mode.log" 2>&1; then
    echo "::warning::The $mode screenshots stopped early. See $OUT_DIR/maestro-$mode.log in the ios-screenshots artifact."
  fi
done
xcrun simctl ui booted appearance light

# Maestro writes each takeScreenshot under its output folder (2.8+:
# debug-<mode>/.../takeScreenshot/; older ones the working directory):
# gather every one taken this run. Its own step-NNN- shots don't match.
find . "$HOME/.maestro" -path ./node_modules -prune -o -type f -name '*-0[0-9]-*.png' \
  -newer "$MARKER" -print 2>/dev/null |
  while IFS= read -r shot; do
    [ "$(dirname "$shot")" -ef "$OUT_DIR" ] || mv "$shot" "$OUT_DIR/"
  done
rm -f "$MARKER"

shots=$(find "$OUT_DIR" -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')
echo "Screenshots taken: $shots"
# 7 screens in each mode.
if [ "$shots" -lt 14 ]; then
  echo "::warning::Only $shots of 14 screenshots were taken. See the logs in the ios-screenshots artifact."
fi
