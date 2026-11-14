#!/bin/bash
# Makes the settled simulator snapshot CI's simulator jobs restore
# (scripts/restore-simulator.sh), in ci.yml's simulator-snapshot job, when
# the cache has none for this runtime and model (scripts/simulator-device.sh
# names it).
#
# A new simulator spends its first minutes on first-boot chores: photo and
# media analysis, Health, Siri suggestions, widgets, indexing. On #215 that
# drove the 3-core runner's load average to 384-639 as the simulator jobs
# booted, and it was still about 90 when the accessibility audit ran out
# of time. A device whose data folder comes from one that has already done
# that work boots without redoing it (caloryn#202 measured about 110
# CPU-seconds for such a boot against 410-470 for a first one).
#
# So this creates a device of the same model and runtime that no app has
# ever been installed on, boots it, and leaves it until it has settled:
# at least MIN_SECONDS after boot, and until the CPU has stayed under
# QUIET_BUSY% busy for QUIET_SECONDS straight (each sample a 5 s average,
# scripts/machine-load.sh --cpu-row), or MAX_SECONDS at most. Measured,
# never a fixed wait: a snapshot taken early repeats the rest of the work
# on every boot (caloryn saw a deferred media analysis pass at 210% for 3
# minutes, past the 10th minute). Then it shuts the device down cleanly
# and archives its data folder.
#
# apsd is stopped once it has booted, as in the simulator jobs
# (.github/actions/simulator-app, which still stops it after every boot):
# its reconnect loop comes from CI having no push servers, not from
# first-boot work, so it would keep the CPU busy forever; and its disable
# lives in CoreSimulator, not the data folder, so it isn't in the snapshot.
# Nothing else is stopped: the point is to let the rest finish its work.
#
#   SIM_DEVICE_TYPE=… SIM_RUNTIME_ID=… scripts/settle-simulator.sh <out-dir>
#
# On success <out-dir> holds data.tar.zst (the data folder's contents, tar
# and zstd; macOS's tar keeps their extended attributes)
# and snapshot.txt (one line on how it settled, which the jobs that
# restore it note). On failure it exits non-zero and <out-dir> is left
# out, so nothing is saved.
set -euo pipefail

out="${1:?usage: scripts/settle-simulator.sh <out-dir>}"
: "${SIM_DEVICE_TYPE:?from scripts/simulator-device.sh}"
: "${SIM_RUNTIME_ID:?from scripts/simulator-device.sh}"
here="$(dirname "$0")"

MIN_SECONDS=600
MAX_SECONDS=1200
QUIET_BUSY=25
QUIET_SECONDS=60
SAMPLE_SECONDS=5
# Never saved from a device the app has run on: its data would come back
# in every job's simulator.
BUNDLE_ID=com.jessicahirsh.sift

summary() {
  echo "$*"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$*" >> "$GITHUB_STEP_SUMMARY"; fi
}

rm -rf "$out" "$out.partial"
command -v zstd >/dev/null || { echo "::error::No zstd on this runner."; exit 1; }

udid=$(xcrun simctl create sift-snapshot "$SIM_DEVICE_TYPE" "$SIM_RUNTIME_ID")
echo "Created $udid ($SIM_DEVICE_TYPE, $SIM_RUNTIME_ID)"
start=$SECONDS
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b
booted=$SECONDS
echo "Booted in $((booted - start)) s"

sim="xcrun simctl spawn $udid launchctl"
for domain in user/foreground system; do
  $sim disable "$domain/com.apple.apsd" >/dev/null 2>&1 || true
  $sim bootout "$domain/com.apple.apsd" >/dev/null 2>&1 || true
done

# Each sample takes SAMPLE_SECONDS (iostat's own interval): no sleeps. A
# sample that fails ends it, with nothing saved: it can't tell a settled
# device from a busy one, and a sampler failing at once would spin here.
quiet_from=''
settled=''
logged=$booted
while :; do
  sampled_from=$SECONDS
  row=$("$here/machine-load.sh" --cpu-row "$SAMPLE_SECONDS") || {
    echo "::error::Couldn't read the CPU (scripts/machine-load.sh --cpu-row): no snapshot made."
    exit 1
  }
  busy=${row##*,}
  if awk -v b="$busy" -v q="$QUIET_BUSY" 'BEGIN { exit !(b + 0 < q + 0) }'; then
    quiet_from=${quiet_from:-$sampled_from}
  else
    quiet_from=''
  fi
  now=$SECONDS
  quiet=0
  [ -z "$quiet_from" ] || quiet=$((now - quiet_from))
  if [ $((now - logged)) -ge 60 ]; then
    echo "$(((now - booted) / 60)) min after boot: ${busy:-?}% busy, quiet for ${quiet} s"
    logged=$now
  fi
  if [ $((now - booted)) -ge $MIN_SECONDS ] && [ "$quiet" -ge $QUIET_SECONDS ]; then
    settled=yes
    break
  fi
  [ $((now - booted)) -lt $MAX_SECONDS ] || break
done
waited=$((SECONDS - booted))
took="$((waited / 60)) min $((waited % 60)) s"
busiest=$(ps -Aro pcpu,comm | sed -n '2,6p' | sed 's#[^ ]*/.*RuntimeRoot#sim:#' \
  | awk '{ cpu = $1; $1 = ""; sub(/^ /, ""); printf "%s%% %s; ", cpu, $0 }' || true)
if [ -n "$settled" ]; then
  how="settled in $took after boot (CPU under ${QUIET_BUSY}% for ${QUIET_SECONDS} s)"
else
  # Saved all the same: after this long the first-boot work is mostly
  # done, and a snapshot that saves most of it beats booting fresh.
  how="not settled after $took (the cap): busiest ${busiest%; }"
  echo "::warning::The simulator never settled (CPU under ${QUIET_BUSY}% for ${QUIET_SECONDS} s) in $took; saving it anyway."
fi
echo "Busiest at the end: ${busiest%; }"

if xcrun simctl get_app_container "$udid" "$BUNDLE_ID" >/dev/null 2>&1; then
  echo "::error::$BUNDLE_ID is installed on the snapshot device; not saving it."
  exit 1
fi

"$here/simulator-device.sh" --shut-down "$udid"
data=$("$here/simulator-device.sh" --data "$udid")
[ -d "$data" ] || { echo "::error::No data folder at $data."; exit 1; }

archive_start=$SECONDS
mkdir -p "$out.partial"
tar -C "$data" -cf - . | zstd -q -T0 > "$out.partial/data.tar.zst"
echo "$how" > "$out.partial/snapshot.txt"
mv "$out.partial" "$out"
archived=$((SECONDS - archive_start))

data_mb=$(du -sk "$data" | awk '{ printf "%d", $1 / 1024 }')
archive_mb=$(du -sk "$out/data.tar.zst" | awk '{ printf "%d", $1 / 1024 }')
summary "Simulator snapshot: booted in $((booted - start)) s, $how; data folder ${data_mb} MB, archived to ${archive_mb} MB in ${archived} s."
# The device stays behind: the runner is thrown away with it.
