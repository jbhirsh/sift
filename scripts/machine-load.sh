#!/bin/bash
# Samples the runner's load for the rest of the job, every 10 s, into <dir>:
#   machine-load.txt    the 15 busiest processes, each with its path (ps,
#                       whose %CPU on macOS is a decaying average over about
#                       a minute)
#   machine-memory.txt  free, compressed and swapped memory, page-ins and
#                       page-outs (vm_stat): a machine that's swapping looks
#                       idle in a process list
#   machine-disk.txt    each disk's transfers per second and throughput
#                       (iostat)
#   machine-cpu.csv     time,load,busy rows (Unix seconds, the 1-minute load
#                       average, % of the CPU busy), which the job summary
#                       (jbhirsh/ci's job-summary) charts across the job
# CI's simulator jobs start it first (.github/actions/simulator-app) and
# upload <dir> with their results, so a slow run says what the machine was
# busy with. The simulator's own daemons (apsd, SpringBoard, the app) are
# processes on the Mac, so they show in the list too.
#
# No top: on #215 the sampler's own top processes, and sysmond answering
# them, were the busiest things on the runner after setup (16% and 24% of
# a core, of 3). ps and iostat read the kernel's counters directly.
#
#   scripts/machine-load.sh <dir>            returns at once; the samplers run on
#   scripts/machine-load.sh --cpu-row [<s>]  one machine-cpu.csv row: the CPU
#                                            over the next <s> seconds (1)
#   scripts/machine-load.sh --wait-quiet <busy> <quiet> <max>
#                                            returns once the CPU has stayed
#                                            under <busy>% for <quiet> s
#                                            straight, or after <max> s
#
# Once started it can't fail the job: a sampler that won't start leaves
# its error in its file.
set -uo pipefail

# One row from iostat's second report (its first counts since boot), whose
# last columns are the CPU's "us sy id" and the load average's "1m 5m 15m",
# whatever disk columns come before them: busy is 100 less idle. The
# report covers the given number of seconds (wait_quiet below takes 5, so
# a moment's spike doesn't decide whether the CPU is quiet).
cpu_row() {
  local row
  row=$(iostat -c 2 -w "${1:-1}" | tail -1 | awk '
    NF >= 6 && $(NF - 3) ~ /^[0-9.]+$/ && $(NF - 2) ~ /^[0-9.]+$/ {
      printf "%s,%.1f", $(NF - 2), 100 - $(NF - 3)
    }')
  [ -n "$row" ] || return 1
  echo "$(date +%s),$row"
}

if [ "${1:-}" = --cpu-row ]; then
  cpu_row "${2:-1}"
  exit
fi

# Waits for the machine to go quiet: until the CPU has been under <busy>%
# for <quiet> seconds straight, each sample a 5 s average (a moment's spike
# doesn't decide it), or <max> seconds at most. Measured, never a fixed wait
# (jbhirsh/ci#58): each sample takes iostat's own interval, with no sleeps.
# scripts/settle-simulator.sh waits on it for a snapshot's first-boot work,
# and scripts/run-a11y-audit.sh before each pass, as XCTest's audit gives
# up on a screen when a busy runner keeps it from finishing in time.
# Prints a line a minute to stderr while it waits, so a caller capturing
# its output gets only the last line, on stdout, saying how it ended.
# Exits 0 once quiet, 1 at <max>, 2 if the CPU can't be read (a sampler
# failing at once would spin here, and without a reading it can't tell
# quiet from busy), and 3 for a usage error.
wait_quiet() {
  local busy_max=$1 quiet_for=$2 max=$3 sample=5
  local start=$SECONDS logged=$SECONDS quiet_from='' row busy sampled_from now quiet
  while :; do
    sampled_from=$SECONDS
    row=$(cpu_row "$sample") || {
      echo "Couldn't read the CPU (iostat)."
      return 2
    }
    busy=${row##*,}
    if awk -v b="$busy" -v q="$busy_max" 'BEGIN { exit !(b + 0 < q + 0) }'; then
      quiet_from=${quiet_from:-$sampled_from}
    else
      quiet_from=''
    fi
    now=$SECONDS
    quiet=0
    [ -z "$quiet_from" ] || quiet=$((now - quiet_from))
    if [ "$quiet" -ge "$quiet_for" ]; then
      echo "Quiet after $((now - start)) s (CPU under ${busy_max}% for ${quiet_for} s)"
      return 0
    fi
    if [ $((now - start)) -ge "$max" ]; then
      echo "Not quiet after $((now - start)) s (the cap): ${busy}% busy, quiet for ${quiet} s"
      return 1
    fi
    if [ $((now - logged)) -ge 60 ]; then
      echo "$(((now - start) / 60)) min: ${busy}% busy, quiet for ${quiet} s" >&2
      logged=$now
    fi
  done
}

if [ "${1:-}" = --wait-quiet ]; then
  if [ $# -ne 4 ]; then
    echo 'usage: scripts/machine-load.sh --wait-quiet <busy %> <quiet s> <max s>' >&2
    exit 3
  fi
  wait_quiet "$2" "$3" "$4"
  exit
fi

dir="${1:?usage: scripts/machine-load.sh <dir>}"
mkdir -p "$dir"
nohup bash -c 'while :; do date "+%H:%M:%S"; ps -Aro pcpu,pid,rss,comm | head -16; echo; sleep 10; done' \
  > "$dir/machine-load.txt" 2>&1 &
nohup vm_stat 10 > "$dir/machine-memory.txt" 2>&1 &
nohup iostat -w 10 > "$dir/machine-disk.txt" 2>&1 &
# Each row takes iostat a second, so this samples every 10 s or so.
echo 'time,load,busy' > "$dir/machine-cpu.csv"
nohup bash -c 'while :; do "$0" --cpu-row; sleep 9; done' "$0" \
  >> "$dir/machine-cpu.csv" 2>/dev/null &
echo "Sampling the machine's load every 10 s into $dir/machine-{load,memory,disk}.txt and machine-cpu.csv"
exit 0
