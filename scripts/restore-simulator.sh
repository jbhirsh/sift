#!/bin/bash
# Puts the settled simulator snapshot (scripts/settle-simulator.sh, restored
# from the cache by .github/actions/simulator-app) into a device's data
# folder before it boots, so the device starts with its first-boot chores
# already done.
#
# Only the data folder is replaced, the CircleCI way: the device keeps its
# own UDID and device.plist, so a snapshot made on one runner image goes
# into the matching device of a newer one. The device must be shut down
# (it's shut down first if it isn't). The snapshot is unpacked beside the
# data folder first, so a broken archive never touches the device; then the
# two folders swap by rename.
#
#   scripts/restore-simulator.sh <udid> <snapshot-dir>
#
# Exits 0 once the snapshot is in place. Otherwise exits 1 with the device
# as it was (its own data folder) or, if the swap broke halfway, erased:
# either way it boots fresh.
set -uo pipefail

udid="${1:?usage: scripts/restore-simulator.sh <udid> <snapshot-dir>}"
snapshot="${2:?usage: scripts/restore-simulator.sh <udid> <snapshot-dir>}"
here="$(dirname "$0")"
archive="$snapshot/data.tar.zst"

fail() {
  echo "Not restored: $*" >&2
  exit 1
}

[ -s "$archive" ] || fail "no archive at $archive"
command -v zstd >/dev/null || fail "no zstd on this runner"
"$here/simulator-device.sh" --shut-down "$udid" || fail "$udid won't shut down"
data=$("$here/simulator-device.sh" --data "$udid")
device=$(dirname "$data")
[ -d "$device" ] || fail "no device folder at $device"

staging="$device/data.snapshot"
fresh="$device/data.fresh"
rm -rf "$staging" "$fresh"
mkdir "$staging" || fail "can't write to $device"
if ! zstd -dc "$archive" | tar -xf - -C "$staging"; then
  rm -rf "$staging"
  fail "the archive didn't unpack"
fi

if [ -e "$data" ] && ! mv "$data" "$fresh"; then
  rm -rf "$staging"
  fail "couldn't move the device's own data folder aside"
fi
if ! mv "$staging" "$data"; then
  rm -rf "$staging"
  if ! mv "$fresh" "$data"; then
    xcrun simctl erase "$udid" || true
  fi
  fail "couldn't move the snapshot into place"
fi
rm -rf "$fresh"
exit 0
