#!/bin/bash
# Pre-commit gate: run the unit suite with coverage and fail the commit if the
# thresholds configured in jest.config.js are not met. Invoked by
# .githooks/pre-commit (enabled automatically via the package.json "prepare"
# script, which points core.hooksPath at .githooks).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
exec npx jest --coverage --silent
