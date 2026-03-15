SCHEME_UNIT = SiftUnitTests
SCHEME_ALL  = Sift
DEST        = platform=macOS,arch=arm64
SIGN_FLAGS  = CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=NO \
              PROVISIONING_PROFILE_SPECIFIER="" CODE_SIGN_STYLE=Manual \
              CODE_SIGN_ENTITLEMENTS="" ENABLE_HARDENED_RUNTIME=NO

# Unit tests — no signing required, always runnable from the terminal
test:
	xcodebuild test \
	  -project Sift.xcodeproj \
	  -scheme $(SCHEME_UNIT) \
	  -destination "$(DEST)" \
	  $(SIGN_FLAGS) \
	  2>&1 | grep -E "Test (Suite|Case)|passed|failed|error:|SUCCEED|FAILED"

# All tests including UI interaction (builds and runs entirely from the terminal)
test-ui:
	xcodebuild test \
	  -project Sift.xcodeproj \
	  -scheme $(SCHEME_ALL) \
	  -destination "$(DEST)" \
	  $(SIGN_FLAGS) \
	  2>&1 | grep -E "Test (Suite|Case)|passed|failed|error:|SUCCEED|FAILED"

# Regenerate Sift.xcodeproj from project.yml
generate:
	xcodegen generate

.PHONY: test test-ui generate
