# Run unit tests
test:
	npx jest

# Run unit tests in watch mode
test-watch:
	npx jest --watch

# Run E2E tests (placeholder — will use Maestro later)
test-e2e:
	@echo "E2E tests not yet configured (Maestro)"

# All tests
test-all: test test-e2e

# Lint
lint:
	npx eslint src/ __tests__/

# Type check
typecheck:
	npx tsc --noEmit

# Build iOS dev client
build-ios:
	npx expo run:ios

# Check everything (lint + types + tests)
check: lint typecheck test

.PHONY: test test-watch test-e2e test-all lint typecheck build-ios check
