# Run unit tests
test:
	npx jest

# Run unit tests with coverage report (80% threshold enforced)
test-coverage:
	npx jest --coverage

# Run unit tests in watch mode
test-watch:
	npx jest --watch

# Run mutation tests (Stryker) on reducer, services, utils, and hooks.
# Slow — not part of `make check`. CI (mutation.yml) mutates changed files
# on every PR and does a full sweep weekly.
test-mutation:
	npx stryker run

# Build standalone simulator app for E2E testing (no dev server needed)
build-e2e:
	eas build --profile e2e-simulator --platform ios --local --output build/Sift-e2e.tar.gz
	mkdir -p build/e2e
	tar -xzf build/Sift-e2e.tar.gz -C build/e2e

# Run E2E tests (requires build-e2e first)
test-e2e:
	xcrun simctl install booted build/e2e/*.app
	maestro test .maestro/

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

# Expo doctor
doctor:
	npx expo-doctor@latest

# Check everything (lint + types + tests with coverage + expo doctor)
check: lint typecheck test-coverage doctor

.PHONY: test test-coverage test-watch test-mutation build-e2e test-e2e test-all lint typecheck build-ios check doctor
