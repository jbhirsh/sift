#!/bin/bash
# Pre-push gate: run the unit suite with coverage and fail the push if the
# thresholds configured in jest.config.js are not met. Invoked by
# .githooks/pre-push (enabled automatically via the package.json "prepare"
# script, which points core.hooksPath at .githooks). Kept out of pre-commit so
# every commit isn't blocked on the full coverage run.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
exec npx jest --coverage --silent
