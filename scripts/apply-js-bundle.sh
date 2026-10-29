#!/bin/bash
# Put a JavaScript bundle (scripts/bundle-js.sh) into a built E2E app, in
# place of the one it was built with, for .github/actions/simulator-app:
# main.jsbundle, the bundle's assets and expo-updates' app.manifest. The
# bundle must be Hermes bytecode of the version the app's Hermes reads (the
# native build's hermesc and the hermes-compiler package's could drift
# apart): a mismatch would crash the app at launch, so it stops here
# instead, saying so. An app that was signed is signed again, ad hoc, as
# its contents changed.
#
# Usage: scripts/apply-js-bundle.sh <Sift.app> <bundle-dir>
set -euo pipefail

APP="${1:?usage: scripts/apply-js-bundle.sh <app> <bundle-dir>}"
BUNDLE="${2:?usage: scripts/apply-js-bundle.sh <app> <bundle-dir>}"

# Hermes bytecode starts with an 8-byte magic number, then its version.
HBC_MAGIC=c61fbc03c103191f
magic() { od -An -t x1 -N 8 "$1" | tr -d ' \n'; }
version() { od -An -t u4 -j 8 -N 4 "$1" | tr -d ' \n'; }
for f in "$APP/main.jsbundle" "$BUNDLE/main.jsbundle"; do
  if [ ! -f "$f" ] || [ "$(magic "$f")" != "$HBC_MAGIC" ]; then
    echo "::error::$f isn't Hermes bytecode."
    exit 1
  fi
done
built="$(version "$APP/main.jsbundle")"
bundled="$(version "$BUNDLE/main.jsbundle")"
if [ "$built" != "$bundled" ]; then
  echo "::error::The app reads Hermes bytecode version $built, but the bundle is version $bundled: hermes-compiler and the app's Hermes have drifted apart. Rebuild the app (Build iOS simulator app) or match their versions."
  exit 1
fi

cp "$BUNDLE/main.jsbundle" "$APP/main.jsbundle"
rm -rf "$APP/assets"
if [ -d "$BUNDLE/assets" ]; then cp -R "$BUNDLE/assets" "$APP/assets"; fi
if [ -f "$APP/EXUpdates.bundle/app.manifest" ]; then
  cp "$BUNDLE/app.manifest" "$APP/EXUpdates.bundle/app.manifest"
else
  echo "::warning::$APP has no EXUpdates.bundle/app.manifest to replace."
fi

if [ -d "$APP/_CodeSignature" ]; then
  codesign --force --sign - --preserve-metadata=identifier,entitlements,flags "$APP"
fi
echo "Put this commit's JavaScript into $APP (Hermes bytecode version $bundled)."
