SCHEME_UNIT = SiftUnitTests
SCHEME_ALL  = Sift
DEST        = platform=iOS Simulator,name=iPhone 17
SIGN_FLAGS  = CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
              ENABLE_USER_SCRIPT_SANDBOXING=NO

# Regenerate Sift.xcodeproj from project.yml
generate:
	xcodegen generate

# Unit tests — override DEST for different simulators:
#   make test DEST="platform=iOS Simulator,name=iPhone 16 Pro"
test:
	rm -rf UnitTestResults.xcresult
	xcodebuild test \
	  -project Sift.xcodeproj \
	  -scheme $(SCHEME_UNIT) \
	  -destination "$(DEST)" \
	  -resultBundlePath UnitTestResults.xcresult \
	  -enableCodeCoverage YES \
	  $(SIGN_FLAGS) \
	  | xcbeautify

# UI tests — full interaction flow on the simulator
test-ui:
	rm -rf IntegTestResults.xcresult
	xcodebuild test \
	  -project Sift.xcodeproj \
	  -scheme $(SCHEME_ALL) \
	  -only-testing:SiftUITests/SiftUITests \
	  -destination "$(DEST)" \
	  -resultBundlePath IntegTestResults.xcresult \
	  $(SIGN_FLAGS) \
	  | xcbeautify

# All tests: unit then UI
test-all: test test-ui

.PHONY: generate test test-ui test-all
