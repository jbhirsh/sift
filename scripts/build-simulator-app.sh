#!/bin/bash
# Build the E2E simulator app (eas.json's e2e-simulator profile) as a
# tarball with Sift.app at its root, for ci.yml's build job (the native
# compile check) and its E2E job (which unpacks it and installs
# build/e2e/*.app).
#
# With EXPO_TOKEN it builds with `eas build --local`. Without it (Dependabot's
# runs get no Actions secrets, #178), or with SIFT_BUILD_WITHOUT_EXPO=1, it
# builds the same app with no Expo or Apple login: expo prebuild, pod
# install, then xcodebuild for the simulator, unsigned. The profile's env is
# read from eas.json (scripts/e2e-env.sh), so the two builds can't drift. Either way the Swift in
# modules/expo-musickit really compiles.
#
# Usage: scripts/build-simulator-app.sh [out.tar.gz]   (default: build/Sift-e2e.tar.gz)
set -euo pipefail

OUT="${1:-build/Sift-e2e.tar.gz}"
mkdir -p "$(dirname "$OUT")"

# The source-map upload needs SENTRY_AUTH_TOKEN; without it, build anyway.
if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  export SENTRY_DISABLE_AUTO_UPLOAD=true
fi

if [ -n "${EXPO_TOKEN:-}" ] && [ "${SIFT_BUILD_WITHOUT_EXPO:-}" != "1" ]; then
  exec eas build --profile e2e-simulator --platform ios --local --non-interactive --output "$OUT"
fi

echo "::notice::Building the simulator app without the Expo login (expo prebuild + xcodebuild)."

# The e2e-simulator profile's env (scripts/e2e-env.sh).
source scripts/e2e-env.sh

npx expo prebuild --platform ios --clean --no-install
(cd ios && pod install)

DERIVED=build/derived
xcodebuild \
  -workspace ios/Sift.xcworkspace \
  -scheme Sift \
  -configuration Release \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  -quiet \
  build

APP_DIR="$DERIVED/Build/Products/Release-iphonesimulator"
[ -d "$APP_DIR/Sift.app" ] || { echo "::error::xcodebuild finished but $APP_DIR/Sift.app is missing."; exit 1; }
tar -czf "$OUT" -C "$APP_DIR" Sift.app
echo "Built $OUT"
