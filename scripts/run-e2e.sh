#!/bin/bash
# Run the Maestro suite one flow per `maestro test` invocation.
#
# Why not `maestro test .maestro/`: a directory run drives every flow through
# ONE XCUITest driver session. When that driver dies mid-suite (seen on main as
# DeviceUnreachableException "Failed to connect to /127.0.0.1:<port>"), every
# flow queued after it fails too — one infrastructure hiccup reads as "11/11
# flows failed" and hides whether any flow actually regressed. A fresh
# invocation per flow gets a fresh driver, so a driver death is contained to
# the flow it happened in.
#
# Retry policy — deliberately narrow:
#   - A flow that fails on an APP-LEVEL signal (an assertion, an element that
#     never appeared) is NEVER retried. That is exactly the nondeterminism a
#     retry would mask, and it must stay loud.
#   - A flow that fails ONLY with a driver/device transport error (the
#     XCUITest server became unreachable or never started) gets one retry on a
#     fresh driver, and the retry is surfaced as a ::warning:: annotation so
#     infra flakes stay visible instead of silently absorbed.
#   - If a flow's retry ALSO dies on a driver error, the driver is down, not
#     flaky: stop and fail fast instead of burning a 5-minute driver-startup
#     timeout on every remaining flow (which would outlast the job timeout and
#     lose the diagnostics along with it).
#
# Usage: scripts/run-e2e.sh [flow-dir]   (default: .maestro)
# Writes per-flow logs, JUnit reports and debug output under $E2E_OUT_DIR
# (default: maestro-results). Exits non-zero if any flow failed.
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

shopt -s nullglob
flows=("$FLOW_DIR"/[0-9]*.yaml)
if [ ${#flows[@]} -eq 0 ]; then
  echo "::error::No flows matched $FLOW_DIR/[0-9]*.yaml"
  exit 1
fi

failed=()
retried=()
driver_down=""

for flow in "${flows[@]}"; do
  name="$(basename "$flow" .yaml)"
  if [ -n "$driver_down" ]; then
    echo "::error title=E2E flow not run::$name skipped — the driver was down (see $driver_down)."
    failed+=("$name")
    continue
  fi
  for attempt in 1 2; do
    log="$OUT_DIR/$name.attempt$attempt.log"
    # Never read a previous run's report as this attempt's evidence.
    rm -f "$OUT_DIR/$name.xml"
    echo "::group::$name (attempt $attempt)"
    maestro test \
      --debug-output "$OUT_DIR/$name.attempt$attempt-debug" \
      --format junit --output "$OUT_DIR/$name.xml" \
      "$flow" 2>&1 | tee "$log"
    status=${PIPESTATUS[0]}
    echo "::endgroup::"

    if [ "$status" -eq 0 ]; then
      echo "PASS $name (attempt $attempt)"
      break
    fi

    # Capture the screen NOW, while it still shows where this flow stalled.
    # Maestro's --debug-output has come back empty in CI, and the job-level
    # screenshot runs after the last flow, so it shows the wrong flow's screen.
    if command -v xcrun >/dev/null 2>&1; then
      xcrun simctl io booted screenshot "$OUT_DIR/$name.attempt$attempt.png" >/dev/null 2>&1 || true
    fi

    evidence=("$log")
    [ -f "$OUT_DIR/$name.xml" ] && evidence+=("$OUT_DIR/$name.xml")
    infra=""
    if grep -Eq "$INFRA_RE" "${evidence[@]}" && ! grep -Eq "$APP_RE" "${evidence[@]}"; then
      infra=1
    fi
    if [ "$attempt" -eq 1 ] && [ -n "$infra" ]; then
      echo "::warning title=E2E driver retry::$name failed with a driver/device transport error, not an app assertion — retrying once on a fresh driver. See $log."
      retried+=("$name")
      continue
    fi
    if [ -n "$infra" ]; then
      driver_down="$log"
    fi

    echo "::error title=E2E flow failed::$name failed (attempt $attempt). See $log."
    failed+=("$name")
    break
  done
done

echo
echo "E2E summary: ${#flows[@]} flows, ${#failed[@]} failed, ${#retried[@]} needed a driver retry."
[ ${#retried[@]} -gt 0 ] && echo "Driver retries: ${retried[*]}"
if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed: ${failed[*]}"
  exit 1
fi
