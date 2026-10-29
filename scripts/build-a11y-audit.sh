#!/usr/bin/env bash
# Builds the accessibility audit's UI-test bundle (e2e/a11y-audit, #146)
# for the iOS Simulator into <out dir>, for scripts/run-a11y-audit.sh to
# run with `xcodebuild test-without-building -xctestrun`. The bundle
# depends only on e2e/a11y-audit, this script and Xcode, so CI builds it
# once and caches it under those (.github/actions/a11y-audit-bundle):
# generating the project and compiling took about 5 minutes on a fresh
# runner, every run.
# Usage: scripts/build-a11y-audit.sh <out dir>
set -euo pipefail

OUT=${1:?usage: build-a11y-audit.sh <out dir>}
PROJECT_DIR=e2e/a11y-audit
DERIVED=build/a11y-audit-dd

command -v xcodegen >/dev/null || HOMEBREW_NO_AUTO_UPDATE=1 brew install xcodegen
(cd "$PROJECT_DIR" && xcodegen generate --quiet)

# A generic destination: the bundle doesn't depend on which simulator runs it.
xcodebuild build-for-testing \
  -project "$PROJECT_DIR/SiftAccessibilityAudit.xcodeproj" \
  -scheme SiftAccessibilityAudit \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED" \
  -quiet

# The .xctestrun names the bundle relative to itself (__TESTROOT__), so the
# Products folder moves as a whole.
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$DERIVED/Build/Products/." "$OUT/"
ls "$OUT"/*.xctestrun >/dev/null
