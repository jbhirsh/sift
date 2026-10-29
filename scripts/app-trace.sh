#!/bin/bash
# Record the app's E2E trace (src/services/trace.ts) from the booted
# simulator, for CI's E2E and screenshot jobs: the test build writes a line
# to the system log for every touch, screen, app action and decision-guard
# check, and for any stall of the JavaScript thread, so a tap that did
# nothing says where it went.
#
#   scripts/app-trace.sh start <dir>   before the app runs
#   scripts/app-trace.sh stop <dir>    after: leaves <dir>/trace.txt
#
# The lines are info level, which iOS keeps only in memory by default:
# start persists them for React Native's subsystem and streams them live
# into <dir>/trace.txt. stop ends the stream and, if it lost its tail, takes
# the persisted log instead. Never fails: an empty trace is a warning (the
# trace itself broke), not a broken build.
set -uo pipefail

mode="${1:-}"
dir="${2:-}"
if [ -z "$dir" ] || { [ "$mode" != start ] && [ "$mode" != stop ]; }; then
  echo "usage: scripts/app-trace.sh start|stop <dir>" >&2
  exit 2
fi
predicate='subsystem == "com.facebook.react.log" AND eventMessage CONTAINS "[sift-trace]"'
pidfile="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/sift-trace-stream.pid"
# When this recording began, so stop reads back only its own lines (a job
# can record more than one: the screenshots, then the GIFs).
startfile="${pidfile%.pid}.start"
mkdir -p "$dir"

if [ "$mode" = start ]; then
  xcrun simctl spawn booted log config --subsystem com.facebook.react.log \
    --mode "level:info,persist:info" || true
  date '+%Y-%m-%d %H:%M:%S' > "$startfile"
  nohup xcrun simctl spawn booted log stream --level info --style compact \
    --predicate "$predicate" > "$dir/trace.txt" 2> "$dir/trace-stream.err" &
  echo $! > "$pidfile"
  exit 0
fi

pid=$(cat "$pidfile" 2>/dev/null || true)
if [ -n "$pid" ]; then
  kill -INT "$pid" 2>/dev/null || true
  sleep 2
  kill "$pid" 2>/dev/null || true
fi
rm -f "$pidfile"
since=$(cat "$startfile" 2>/dev/null || true)
if [ -n "$since" ]; then range=(--start "$since"); else range=(--last 60m); fi
xcrun simctl spawn booted log show --info --style compact "${range[@]}" \
  --predicate "$predicate" > "$dir/trace-persisted.txt" 2>/dev/null || true
# Trace lines only: log's own header quotes the predicate.
streamed=$(grep -c '\[sift-trace\] #' "$dir/trace.txt" 2>/dev/null || true)
persisted=$(grep -c '\[sift-trace\] #' "$dir/trace-persisted.txt" 2>/dev/null || true)
echo "Trace lines: ${streamed:-0} streamed, ${persisted:-0} persisted"
if [ "${persisted:-0}" -gt "${streamed:-0}" ]; then
  cp "$dir/trace-persisted.txt" "$dir/trace.txt"
fi
if [ "${streamed:-0}" -eq 0 ] && [ "${persisted:-0}" -eq 0 ]; then
  echo "::warning::The app's E2E trace came out empty. See $dir/trace-stream.err."
fi
exit 0
