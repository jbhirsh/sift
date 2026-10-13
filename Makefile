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
	scripts/run-e2e.sh .maestro

# All tests
test-all: test test-e2e

# Lint (the whole repo, as CI does) and the native bridge check
lint:
	npm run -s lint
	npm run -s bridge

# Type check
typecheck:
	npm run -s typecheck

# Build iOS dev client
build-ios:
	npx expo run:ios

# Expo doctor (needs the network; CI runs it as advisory)
doctor:
	npx expo-doctor@latest

# Check everything CI's unit job does: lint, types, layering, the native
# bridge and tests with coverage. The same steps as `npm run check`.
check:
	npm run -s check

.PHONY: test test-coverage test-watch test-mutation build-e2e test-e2e test-all lint typecheck build-ios check doctor
