#!/bin/bash
# Runs unit tests with coverage and fails if line coverage for the Sift target
# is below the required threshold.
#
# Usage:
#   ./scripts/check_coverage.sh [threshold]
#
# Arguments:
#   threshold  Minimum line coverage percentage (default: 85)
#
# Environment:
#   COVERAGE_DESTINATION  xcodebuild -destination value
#                         (default: platform=iOS Simulator,name=iPhone 17)
#   SKIP_COVERAGE         Set to 1 to skip this check entirely

set -euo pipefail

if [[ "${SKIP_COVERAGE:-0}" == "1" ]]; then
  echo "SKIP_COVERAGE=1 — skipping coverage check."
  exit 0
fi

THRESHOLD="${1:-85}"
DESTINATION="${COVERAGE_DESTINATION:-platform=iOS Simulator,name=iPhone 17}"
RESULT_BUNDLE="$(mktemp -d)/coverage.xcresult"

cleanup() { rm -rf "$RESULT_BUNDLE"; }
trap cleanup EXIT

echo "Running unit tests with coverage (threshold: ${THRESHOLD}%)..."

xcodebuild test \
  -project Sift.xcodeproj \
  -scheme SiftUnitTests \
  -destination "$DESTINATION" \
  -enableCodeCoverage YES \
  -resultBundlePath "$RESULT_BUNDLE" \
  CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  -quiet 2>&1 | tail -5

COVERAGE=$(xcrun xccov view --report --json "$RESULT_BUNDLE" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for t in data.get('targets', []):
    if t['name'].startswith('Sift.app'):
        print(f\"{t['lineCoverage'] * 100:.1f}\")
        sys.exit(0)
print('0.0')
")

echo "Line coverage: ${COVERAGE}%"

python3 -c "
import sys
cov = float('$COVERAGE')
threshold = float('$THRESHOLD')
if cov < threshold:
    print(f'FAIL: {cov:.1f}% coverage is below the required {threshold:.0f}%')
    sys.exit(1)
print(f'PASS: {cov:.1f}% coverage meets the required {threshold:.0f}%')
"
