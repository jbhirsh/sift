#!/bin/bash
# Run the Maestro suite: one session first, then isolate driver casualties.
#
# Pass 1 runs the whole suite in ONE `maestro test` session — the mode with
# the long stable track record. (Running every flow in its own invocation was
# tried: restarting the XCUITest driver per flow introduced a new failure, a
# "Start Sifting" tap with no effect right after launch, in 2 of 3 runs.)
#
# The weakness of a single session is that when its driver dies mid-suite
# (seen on main as DeviceUnreachableException "Failed to connect to
# /127.0.0.1:<port>"), every flow queued after it fails too — one infra
# hiccup reads as "11/11 failed". So pass 2 re-runs, each on a fresh driver,
# ONLY the flows whose pass-1 failure was a driver/transport error.
#
# Retry policy — deliberately narrow:
#   - A flow that fails on an APP-LEVEL signal (an assertion, an element that
#     never appeared, a crash) is NEVER retried. That is exactly the
#     nondeterminism a retry would mask, and it must stay loud.
#   - A flow that failed ONLY with a driver/transport error gets one isolated
#     re-run, surfaced as a ::warning:: annotation so infra flakes stay
#     visible instead of silently absorbed.
#   - If an isolated re-run ALSO dies on a driver error, the driver is down,
#     not flaky: stop and fail fast rather than burn a 5-minute driver-startup
#     timeout on every remaining flow (which would outlast the job timeout and
#     lose the diagnostics along with it).
#
# Usage: scripts/run-e2e.sh [flow-dir]   (default: .maestro)
# Writes logs, JUnit reports and screenshots under $E2E_OUT_DIR (default:
# maestro-results). Exits non-zero if any flow failed.
set -uo pipefail

FLOW_DIR="${1:-.maestro}"
OUT_DIR="${E2E_OUT_DIR:-maestro-results}"
mkdir -p "$OUT_DIR"

# Driver/transport failures: the XCUITest server was unreachable or never came
# up. These say nothing about the app under test. Kept to connection-level
# signatures on purpose — a broader match (e.g. any XCUITestServerError) could
# catch an app hang that stalls the driver and wrongly earn it a retry.
INFRA_RE='DeviceUnreachableException|IOSDriverTimeoutException|Transport unreachable|Failed to connect to /127\.0\.0\.1'
# App-level failures. If any of these appear, the failure is treated as real
# even when a transport error shows up alongside it.
APP_RE='Element not found|Assertion is false|App crashed|app crashed|stopped unexpectedly'

screenshot() {
  if command -v xcrun >/dev/null 2>&1; then
    xcrun simctl io booted screenshot "$1" >/dev/null 2>&1 || true
  fi
}

# ── Pass 1: the whole suite in one session ──
suite_xml="$OUT_DIR/suite.xml"
rm -f "$suite_xml"
echo "::group::Pass 1 — full suite, one session"
maestro test \
  --debug-output "$OUT_DIR/suite-debug" \
  --format junit --output "$suite_xml" \
  "$FLOW_DIR" 2>&1 | tee "$OUT_DIR/suite.log"
suite_status=${PIPESTATUS[0]}
echo "::endgroup::"

if [ "$suite_status" -eq 0 ]; then
  echo "E2E summary: suite passed in one session, no retries."
  exit 0
fi
screenshot "$OUT_DIR/suite-end.png"

# Classify each failed flow from the JUnit report as "infra" or "app".
# Output: one "<class> <flow-file>" line per failed test case. A missing or
# unparseable report means the session died before reporting anything — the
# driver-startup case — so every flow is an infra casualty.
classified="$OUT_DIR/classified.txt"
python3 - "$suite_xml" "$FLOW_DIR" "$INFRA_RE" "$APP_RE" > "$classified" <<'EOF'
import glob, os, re, sys
import xml.etree.ElementTree as ET
xml_path, flow_dir, infra_re, app_re = sys.argv[1:5]
flows = sorted(glob.glob(os.path.join(flow_dir, "[0-9]*.yaml")))
try:
    cases = ET.parse(xml_path).getroot().iter("testcase")
except (OSError, ET.ParseError):
    for f in flows:
        print("infra", f)
    sys.exit(0)
for case in cases:
    failure = case.find("failure")
    if failure is None:
        continue
    text = (failure.text or "") + " " + (failure.get("message") or "")
    is_infra = re.search(infra_re, text) and not re.search(app_re, text)
    print("infra" if is_infra else "app", case.get("file") or case.get("name"))
EOF

failed=()
retried=()
driver_down=""

while read -r class flow; do
  [ -z "$flow" ] && continue
  name="$(basename "$flow" .yaml)"
  if [ "$class" = "app" ]; then
    echo "::error title=E2E flow failed::$name failed on an app-level assertion in the suite run — not retried. See $OUT_DIR/suite.log."
    failed+=("$name")
    continue
  fi
  if [ -n "$driver_down" ]; then
    echo "::error title=E2E flow not run::$name not re-run — the driver was down (see $driver_down)."
    failed+=("$name")
    continue
  fi

  # ── Pass 2: isolated re-run on a fresh driver, infra casualties only ──
  echo "::warning title=E2E driver retry::$name failed with a driver/transport error in the suite run, not an app assertion — re-running it alone on a fresh driver."
  retried+=("$name")
  log="$OUT_DIR/$name.retry.log"
  rm -f "$OUT_DIR/$name.retry.xml"
  echo "::group::$name (isolated re-run)"
  maestro test \
    --debug-output "$OUT_DIR/$name.retry-debug" \
    --format junit --output "$OUT_DIR/$name.retry.xml" \
    "$flow" 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  echo "::endgroup::"
  if [ "$status" -eq 0 ]; then
    echo "PASS $name (isolated re-run)"
    continue
  fi
  screenshot "$OUT_DIR/$name.retry.png"
  evidence=("$log")
  [ -f "$OUT_DIR/$name.retry.xml" ] && evidence+=("$OUT_DIR/$name.retry.xml")
  if grep -Eq "$INFRA_RE" "${evidence[@]}" && ! grep -Eq "$APP_RE" "${evidence[@]}"; then
    driver_down="$log"
  fi
  echo "::error title=E2E flow failed::$name failed its isolated re-run. See $log."
  failed+=("$name")
done < "$classified"

echo
if [ ! -s "$classified" ]; then
  echo "::error::maestro exited $suite_status but reported no failed flow — see $OUT_DIR/suite.log."
  exit 1
fi
echo "E2E summary: ${#failed[@]} failed, ${#retried[@]} re-run after a driver error."
[ ${#retried[@]} -gt 0 ] && echo "Re-run after driver error: ${retried[*]}"
if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed: ${failed[*]}"
  exit 1
fi
exit 0
