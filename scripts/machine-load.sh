#!/bin/bash
# Samples the runner's load for the rest of the job, every 10 s, into <dir>:
#   machine-load.txt    load average, CPU use and the 15 busiest processes
#                       (macOS top)
#   machine-memory.txt  free, compressed and swapped memory, page-ins and
#                       page-outs (vm_stat): a machine that's swapping looks
#                       idle in top
#   machine-disk.txt    each disk's transfers per second and throughput
#                       (iostat)
# CI's simulator jobs start it first (.github/actions/simulator-app) and
# upload <dir> with their results, so a slow run says what the machine was
# busy with. The simulator's own daemons (apsd, SpringBoard, the app) are
# processes on the Mac, so they show in top too.
#
#   scripts/machine-load.sh <dir>     returns at once; the samplers run on
#
# Once started it can't fail the job: a sampler that won't start leaves
# its error in its file.
set -uo pipefail

dir="${1:?usage: scripts/machine-load.sh <dir>}"
mkdir -p "$dir"
nohup top -l 0 -s 10 -o cpu -n 15 -stats pid,command,cpu,threads,mem \
  > "$dir/machine-load.txt" 2>&1 &
nohup vm_stat 10 > "$dir/machine-memory.txt" 2>&1 &
nohup iostat -w 10 > "$dir/machine-disk.txt" 2>&1 &
echo "Sampling the machine's load every 10 s into $dir/machine-{load,memory,disk}.txt"
exit 0
