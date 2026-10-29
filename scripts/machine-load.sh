#!/bin/bash
# Samples the runner's load for the rest of the job, every 10 s, into <dir>:
#   machine-load.txt    load average, CPU use and the 15 busiest processes
#                       (macOS top)
#   machine-memory.txt  free, compressed and swapped memory, page-ins and
#                       page-outs (vm_stat): a machine that's swapping looks
#                       idle in top
#   machine-disk.txt    each disk's transfers per second and throughput
#                       (iostat)
#   machine-cpu.csv     time,load,busy rows (Unix seconds, the 1-minute load
#                       average, % of the CPU busy), which the job summary
#                       (jbhirsh/ci's job-summary) charts across the job
# CI's simulator jobs start it first (.github/actions/simulator-app) and
# upload <dir> with their results, so a slow run says what the machine was
# busy with. The simulator's own daemons (apsd, SpringBoard, the app) are
# processes on the Mac, so they show in top too.
#
#   scripts/machine-load.sh <dir>       returns at once; the samplers run on
#   scripts/machine-load.sh --cpu-row   one machine-cpu.csv row, now
#
# Once started it can't fail the job: a sampler that won't start leaves
# its error in its file.
set -uo pipefail

# One row: the 1-minute load average from sysctl ("{ 2.31 2.10 1.98 }"),
# and the CPU's busy share from top's second sample (its first counts
# since boot): 100 less the idle share in "CPU usage: 12.5% user, 8.3%
# sys, 79.2% idle".
cpu_row() {
  local load idle
  load=$(sysctl -n vm.loadavg | awk '{ print $2 }')
  idle=$(top -l 2 -s 1 -n 0 | awk '/^CPU usage/ { v = $7 } END { sub("%", "", v); print v }')
  [ -n "$load" ] && [ -n "$idle" ] || return 1
  awk -v t="$(date +%s)" -v l="$load" -v i="$idle" 'BEGIN { printf "%d,%s,%.1f\n", t, l, 100 - i }'
}

if [ "${1:-}" = --cpu-row ]; then
  cpu_row
  exit
fi

dir="${1:?usage: scripts/machine-load.sh <dir>}"
mkdir -p "$dir"
nohup top -l 0 -s 10 -o cpu -n 15 -stats pid,command,cpu,threads,mem \
  > "$dir/machine-load.txt" 2>&1 &
nohup vm_stat 10 > "$dir/machine-memory.txt" 2>&1 &
nohup iostat -w 10 > "$dir/machine-disk.txt" 2>&1 &
# Each row takes top about a second, so this samples every 10 s or so.
echo 'time,load,busy' > "$dir/machine-cpu.csv"
nohup bash -c 'while :; do "$0" --cpu-row; sleep 9; done' "$0" \
  >> "$dir/machine-cpu.csv" 2>/dev/null &
echo "Sampling the machine's load every 10 s into $dir/machine-{load,memory,disk}.txt and machine-cpu.csv"
exit 0
