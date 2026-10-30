#!/bin/bash
# Picks the simulator CI's simulator jobs test on, and names its settled
# snapshot, so .github/actions/simulator-app (which boots it) and ci.yml's
# simulator-snapshot job (which settles one like it) always agree.
#
# Pinned to one model (SIM_MODEL), on the newest iOS runtime that has it:
# the visual regression compares screenshots pixel for pixel with baselines
# (e2e/screenshots/baselines), so the screen they come from can't change
# with the runner image's device list. When an image drops the model this
# fails and lists what it has: move to a newer one and rewrite the
# baselines (visual-baselines.yml).
#
# Prints NAME=value lines, for $GITHUB_ENV or $GITHUB_OUTPUT:
#   SIM_UDID            the runner's own device of that model and runtime
#   SIM_MODEL           its name (iPhone 17 Pro)
#   SIM_DEVICE_TYPE     its device type identifier, to create another
#   SIM_RUNTIME_ID      the runtime's identifier
#   SIM_RUNTIME         the runtime, readable (iOS 26.4)
#   SIM_RUNTIME_BUILD   the runtime's build (23E244)
#   SIM_SNAPSHOT_KEY    the settled snapshot's cache key:
#                       sim-settled-<version>-<runtime build>-<model slug>,
#                       empty when the runtime's build can't be read (the
#                       jobs then boot fresh)
#   SIM_SNAPSHOT_VERSION
#
# The key holds what decides a device's data folder: how it was made, the
# runtime's build and the model. The version is the start of
# scripts/settle-simulator.sh's hash, so a change to how a snapshot is made
# makes a new one and no job restores one made the old way. Not the runner
# image: a newer image with the same runtime restores the same snapshot
# into its own device (scripts/restore-simulator.sh copies the data folder,
# so the UDID needn't match).
#
#   scripts/simulator-device.sh
#
# Exits 1, with the runner's devices on stderr, when the model is missing.
# Two helpers for one device, which the snapshot scripts share:
#
#   scripts/simulator-device.sh --data <udid>       prints its data folder
#   scripts/simulator-device.sh --shut-down <udid>  shuts it down and waits
#                                                   until simctl says so (2
#                                                   minutes at most; exits 1
#                                                   if it never does)
set -euo pipefail

SIM_MODEL='iPhone 17 Pro'
SNAPSHOT_VERSION=$(shasum -a 256 "$(dirname "$0")/settle-simulator.sh" | cut -c1-8)

# One field of one device from simctl's list (state, dataPath), or nothing.
device_field() {
  xcrun simctl list devices -j | python3 -c "
import json, sys
udid, field = sys.argv[1], sys.argv[2]
for devices in json.load(sys.stdin)['devices'].values():
    for d in devices:
        if d['udid'] == udid:
            print(d.get(field, ''))
" "$1" "$2"
}

case "${1:-}" in
  --data)
    udid="${2:?usage: scripts/simulator-device.sh --data <udid>}"
    data=$(device_field "$udid" dataPath || true)
    echo "${data:-$HOME/Library/Developer/CoreSimulator/Devices/$udid/data}"
    exit 0
    ;;
  --shut-down)
    udid="${2:?usage: scripts/simulator-device.sh --shut-down <udid>}"
    [ "$(device_field "$udid" state || true)" = Shutdown ] && exit 0
    xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
    for ((i = 0; i < 120; i++)); do
      [ "$(device_field "$udid" state || true)" = Shutdown ] && exit 0
      sleep 1
    done
    echo "$udid is still '$(device_field "$udid" state || true)' after 2 minutes" >&2
    exit 1
    ;;
esac

devices=$(xcrun simctl list devices available -j)
# The runtimes' builds; without them there's just no snapshot key.
runtimes=$(xcrun simctl list runtimes -j 2>/dev/null || echo '{}')

SIM_MODEL="$SIM_MODEL" SNAPSHOT_VERSION="$SNAPSHOT_VERSION" RUNTIMES="$runtimes" \
  python3 -c "
import json, os, re, sys
model = os.environ['SIM_MODEL']
devices = json.load(sys.stdin)['devices']
try:
    runtimes = {r['identifier']: r for r in json.loads(os.environ['RUNTIMES']).get('runtimes', [])}
except ValueError:
    runtimes = {}
def version(runtime):
    return [int(n) for n in re.findall(r'\d+', runtime.split('iOS')[-1])]
for runtime in sorted((r for r in devices if 'iOS' in r), key=version, reverse=True):
    for d in devices[runtime]:
        if d['name'] != model:
            continue
        info = runtimes.get(runtime, {})
        build = info.get('buildversion', '')
        if not re.fullmatch(r'[A-Za-z0-9]+', build):
            build = ''
        readable = info.get('name') or re.sub(r'^iOS-', 'iOS ', runtime.rsplit('.', 1)[-1]).replace('-', '.')
        slug = re.sub(r'[^a-z0-9]+', '-', model.lower()).strip('-')
        version_ = os.environ['SNAPSHOT_VERSION']
        key = f'sim-settled-{version_}-{build}-{slug}' if build else ''
        print(f'SIM_UDID={d[\"udid\"]}')
        print(f'SIM_MODEL={model}')
        print(f'SIM_DEVICE_TYPE={d.get(\"deviceTypeIdentifier\", \"\")}')
        print(f'SIM_RUNTIME_ID={runtime}')
        print(f'SIM_RUNTIME={readable}')
        print(f'SIM_RUNTIME_BUILD={build}')
        print(f'SIM_SNAPSHOT_KEY={key}')
        print(f'SIM_SNAPSHOT_VERSION={version_}')
        sys.exit(0)
print('no', model, 'on this runner; it has:', file=sys.stderr)
for runtime, devs in devices.items():
    if 'iOS' in runtime:
        print(' ', runtime.rsplit('.', 1)[-1] + ':', ', '.join(d['name'] for d in devs), file=sys.stderr)
sys.exit(1)
" <<< "$devices"
