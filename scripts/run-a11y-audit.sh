#!/usr/bin/env bash
# Runs Xcode's accessibility audit (e2e/a11y-audit, #146) against the
# e2e-simulator app on the booted simulator, in light and dark appearance,
# and reports each issue as a GitHub error annotation and in the step
# summary. Any issue, or a screen never audited, fails the script.
# The audit's test bundle comes from <bundle dir> (CI restores it from the
# cache, .github/actions/a11y-audit-bundle); without one there, it's built
# first (scripts/build-a11y-audit.sh).
# Usage: scripts/run-a11y-audit.sh <path to Sift.app> [<bundle dir>]
set -euo pipefail

APP_PATH=${1:?usage: run-a11y-audit.sh <path to .app> [<bundle dir>]}
BUNDLE_DIR=${2:-build/a11y-audit-bundle}
BUNDLE_ID=com.jessicahirsh.sift
OUT_DIR=${A11Y_OUT_DIR:-a11y-audit}
mkdir -p "$OUT_DIR"

UDID=$(xcrun simctl list devices booted -j | python3 -c "
import json, sys
for devs in json.load(sys.stdin)['devices'].values():
    for d in devs:
        if d['state'] == 'Booted':
            print(d['udid']); sys.exit(0)
sys.exit('no booted simulator')
")

XCTESTRUN=$(ls "$BUNDLE_DIR"/*.xctestrun 2>/dev/null | head -1 || true)
if [ -z "$XCTESTRUN" ]; then
  "$(dirname "$0")/build-a11y-audit.sh" "$BUNDLE_DIR"
  XCTESTRUN=$(ls "$BUNDLE_DIR"/*.xctestrun | head -1)
fi

status=0
for appearance in light dark; do
  xcrun simctl ui "$UDID" appearance "$appearance"
  # A fresh install each pass: no saved session, the same path through.
  xcrun simctl uninstall "$UDID" "$BUNDLE_ID" || true
  xcrun simctl install "$UDID" "$APP_PATH"
  TEST_RUNNER_A11Y_APPEARANCE=$appearance xcodebuild test-without-building \
    -xctestrun "$XCTESTRUN" \
    -destination "id=$UDID" \
    > "$OUT_DIR/xcodebuild-$appearance.log" 2>&1 || {
      status=$?
      echo "::error title=Accessibility audit::The $appearance pass didn't finish (exit $status); see $OUT_DIR/xcodebuild-$appearance.log"
      tail -40 "$OUT_DIR/xcodebuild-$appearance.log"
    }
done
xcrun simctl ui "$UDID" appearance light

# Workflow-command escaping: % CR LF in a message; also : and , in a
# property (a bare comma ends the property).
escape_data() { local s=${1//%/%25}; s=${s//$'\r'/%0D}; printf '%s' "${s//$'\n'/%0A}"; }
escape_property() { local s; s=$(escape_data "$1"); s=${s//:/%3A}; printf '%s' "${s//,/%2C}"; }

# A11Y-AUDIT|screen|appearance|type|description|element
grep -h '^A11Y-AUDIT|' "$OUT_DIR"/xcodebuild-*.log | sort -u > "$OUT_DIR/issues.txt" || true
# A11Y-AUDITED|screen|appearance: a screen whose audit ran to the end.
grep -h '^A11Y-AUDITED|' "$OUT_DIR"/xcodebuild-*.log | sort -u > "$OUT_DIR/audited.txt" || true
missing=()
for appearance in light dark; do
  for screen in Setup Sift Settings Done; do
    grep -qx "A11Y-AUDITED|$screen|$appearance" "$OUT_DIR/audited.txt" || missing+=("$screen ($appearance)")
  done
done
# Guarded: bash 3.2 (macOS /bin/bash) calls an empty array unbound under -u.
missing_list=""
if [ "${#missing[@]}" -gt 0 ]; then
  missing_list=$(printf '%s, ' "${missing[@]}"); missing_list=${missing_list%, }
fi
count=$(wc -l < "$OUT_DIR/issues.txt" | tr -d ' ')
{
  echo "### Accessibility audit: $count issue(s)"
  if [ "${#missing[@]}" -gt 0 ]; then
    echo
    echo "**Not audited** (the pass stopped before reaching them): $missing_list"
  fi
  if [ "$count" -gt 0 ]; then
    echo
    echo "| Screen | Appearance | Type | Issue | Element |"
    echo "|---|---|---|---|---|"
    awk -F'|' '{ printf "| %s | %s | %s | %s | %s |\n", $2, $3, $4, $5, $6 }' "$OUT_DIR/issues.txt"
  fi
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
while IFS='|' read -r _ screen appearance type description element; do
  echo "::error title=$(escape_property "Accessibility audit ($screen, $appearance)")::$(escape_data "$type: $description ($element)")"
done < "$OUT_DIR/issues.txt"
if [ "$count" -gt 0 ] && [ "$status" -eq 0 ]; then status=1; fi
if [ "${#missing[@]}" -gt 0 ]; then
  echo "::error title=Accessibility audit::$(escape_data "Not audited: $missing_list")"
  [ "$status" -ne 0 ] || status=1
fi
exit "$status"
