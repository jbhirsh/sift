# Run unit tests
test:
	npx jest

# Run unit tests with coverage report (80% threshold enforced)
test-coverage:
	npx jest --coverage

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

# Expo doctor
doctor:
	npx expo-doctor@latest

# Check everything (lint + types + tests + expo doctor)
check: lint typecheck test doctor

.PHONY: test test-coverage test-watch test-e2e test-all lint typecheck build-ios check doctor
