#!/bin/bash
# Bundle the E2E app's JavaScript on its own, as the app's Xcode build does
# (React Native's react-native-xcode.sh: `expo export:embed`, then Hermes
# bytecode, -O, as a Release build), for ci.yml's bundle job. The simulator
# jobs put it into the native app cached under the native fingerprint
# (scripts/apply-js-bundle.sh), so a JavaScript-only change bundles in about
# a minute on Linux instead of rebuilding the whole app on macOS for 25.
# Metro's output doesn't depend on the machine; Hermes bytecode is checked
# against the app's own when it's put in.
#
# Writes to <out-dir>: main.jsbundle (bytecode), assets/ (the bundle's
# images, if any) and app.manifest (expo-updates' record of the embedded
# update, which names the bundle's assets).
#
# Usage: scripts/bundle-js.sh <out-dir>
set -euo pipefail

OUT="${1:?usage: scripts/bundle-js.sh <out-dir>}"
rm -rf "$OUT"
mkdir -p "$OUT"
work="$(mktemp -d)"

# The e2e-simulator profile's env, which the bundle inlines
# (scripts/e2e-env.sh); .env's flags Expo loads itself.
source scripts/e2e-env.sh

npx expo export:embed \
  --entry-file index.ts \
  --platform ios \
  --dev false \
  --reset-cache \
  --minify false \
  --bundle-output "$work/main.js" \
  --assets-dest "$OUT"

# The hermesc for this machine, from the hermes-compiler package React
# Native ships it in.
case "$(uname -s)" in
  Darwin) bin=osx-bin ;;
  Linux) bin=linux64-bin ;;
  *) echo "::error::No hermesc for $(uname -s)."; exit 1 ;;
esac
hermesc="$(node -p "require('path').join(require('path').dirname(require.resolve('hermes-compiler/package.json')), 'hermesc', '$bin', 'hermesc')")"
"$hermesc" -emit-binary -max-diagnostic-width=80 -O -out "$OUT/main.jsbundle" "$work/main.js"

# Only app.manifest: the fingerprint beside it is the native build's.
mkdir -p "$work/updates"
node node_modules/expo-updates/utils/build/createUpdatesResources.js ios "$PWD" "$work/updates" all index.ts production >/dev/null
cp "$work/updates/app.manifest" "$OUT/app.manifest"

rm -rf "$work"
echo "Bundled into $OUT: $(du -sh "$OUT/main.jsbundle" | cut -f1) of bytecode"
