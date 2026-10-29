#!/bin/bash
# Samples the runner's load for the rest of the job: every 10 s, the load
# average, CPU use and the 15 busiest processes (macOS top), into <file>.
# CI's simulator jobs start it first (.github/actions/simulator-app) and
# upload the file with their results, so a slow run says what the machine
# was busy with. The simulator's own daemons (apsd, SpringBoard, the app)
# are processes on the Mac, so they show here too.
#
#   scripts/machine-load.sh <file>     returns at once; top runs on
#
# Never fails: a sampler that doesn't start is a warning, not a broken job.
set -uo pipefail

file="${1:?usage: scripts/machine-load.sh <file>}"
mkdir -p "$(dirname "$file")"
nohup top -l 0 -s 10 -o cpu -n 15 -stats pid,command,cpu,threads,mem \
  > "$file" 2>&1 &
echo "Sampling the machine's load into $file (top, pid $!)"
exit 0
