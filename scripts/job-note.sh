#!/bin/bash
# Adds a label and its value to a job's notes: a JSON object of labels and
# values that the job summary (jbhirsh/ci's job-summary, the simulator
# jobs' last step) shows in its report's Environment section, beside the
# machine's CPU. .github/actions/simulator-app notes the simulator, the
# runner image, Xcode, Maestro, the warm-up and apsd as it goes.
#
#   scripts/job-note.sh <file> <label> <value>
#
# A note that can't be written is left out: it never fails the job.
set -uo pipefail

file="${1:?usage: scripts/job-note.sh <file> <label> <value>}"
label="${2:?usage: scripts/job-note.sh <file> <label> <value>}"
value="${3-}"
[ -s "$file" ] || echo '{}' > "$file" 2>/dev/null
jq --arg k "$label" --arg v "$value" '. + {($k): $v}' "$file" > "$file.tmp" 2>/dev/null \
  && mv "$file.tmp" "$file" || rm -f "$file.tmp"
exit 0
