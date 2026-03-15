# Sift — Claude Project Instructions

## What This Project Is
A native SwiftUI iOS app for rapidly reviewing an Apple Music library.
Users swipe/tap through their tracks: keep, remove, or skip.
Targets the iOS App Store. Uses MusicKit for library access and playback.

---

## Running the App
Open `Sift.xcodeproj` in Xcode and hit ⌘R (target an iPhone/iPad simulator or device).

To regenerate the Xcode project after editing `project.yml`:
```bash
xcodegen generate
```

---

## Test Commands
**Always run tests before committing.**

Unit tests:
```bash
xcodebuild test \
  -project Sift.xcodeproj \
  -scheme SiftUnitTests \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  | xcbeautify
```

UI tests:
```bash
xcodebuild test \
  -project Sift.xcodeproj \
  -scheme Sift \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:SiftUITests/SiftUITests \
  CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  | xcbeautify
```

Tests must be green before any commit. Always re-run tests before committing —
especially when test files were modified.

**Test coverage requirements:**
- Every new ViewModel method or service function must have a unit test in `SiftTests/`.
- Every new UI element or user-facing feature must have a UI test in `SiftUITests/`.
- Tests are written alongside the implementation, not after the commit.

---

## Build (command line)
```bash
xcodebuild build \
  -project Sift.xcodeproj \
  -target Sift \
  -sdk iphonesimulator \
  CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
  CODE_SIGNING_ALLOWED=NO \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  | xcbeautify
```

Note: Xcode GUI builds (⌘R) use automatic signing with team 9PWVKSC697.

---

## Commit Style
Every commit message must:
- Have a short imperative subject (≤72 chars)
- Have a blank line then a body explaining *why*
- End with the Co-Authored-By trailer

```
Fix SBElementArray casting in MusicService

compactMap each element instead of casting the whole array, since
NSArray→[Protocol] bridging doesn't work in Swift.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**Never amend a pushed commit. Never use --no-verify.**

---

## Code Style
- **Swift**: stdlib + Apple frameworks only. No SPM dependencies.
- **SwiftLint**: runs as a build phase. Fix all violations before committing.
- **Tests**: XCTest only. Test classes named `Test<FeatureName>`.

---

## Architecture
```
Sift/
  App/              SiftApp.swift
  Models/           Track, Section, Decision, SiftSession, SortOrder
  Services/         MusicService (MusicKit), PlaylistService (MusicKit),
                    SessionStore
  ViewModels/       SiftViewModel (@MainActor ObservableObject)
  Views/            SetupView, LoadingView, SiftView, CardView,
                    PlayerControlsView, DoneView, SettingsView
  Resources/        Info.plist, Sift.entitlements, Assets.xcassets
SiftTests/          XCTest unit test suite
SiftUITests/        XCTest UI test suite + SnapshotHelper
fastlane/           Fastfile, Snapfile, Appfile
project.yml         xcodegen spec — source of truth for Xcode project
```

**Important**: `project.yml` is the source of truth. Never edit
`Sift.xcodeproj` directly for structural changes — edit `project.yml`
and run `xcodegen generate`.

---

## Key Architecture Notes
- `MusicService` is a Swift `actor`. All MusicKit calls are `await`-ed.
- `MusicService` caches `Song` objects in `songCache` after `loadLibrary()`.
  This avoids re-fetching the library on every play/artwork call.
- `MusicKitPlaylistService` creates a "Sift — To Remove" playlist using
  `MusicLibrary.shared.createPlaylist`. Requires iOS 16+.
- `SiftViewModel` is `@MainActor` and owns all published state.
- Session is persisted to `~/Library/Application Support/Sift/session.json`
  after every decision.

---

## CI/CD
- **CI** (`.github/workflows/ci.yml`): runs on every push to main.
  Lints + builds + tests.
- **Deploy** (`.github/workflows/deploy.yml`): runs on `v*` tag push.
  Builds, signs, submits to App Store via Fastlane.
- Deploy requires GitHub environment `app-store` with signing secrets.

---

## App Store
- **Bundle ID**: `com.jessicahirsh.sift`
- **Display name**: Sift — Music Library Cleaner
- **SKU**: SIFT-001
- **Team ID**: 9PWVKSC697
- **Platform**: iOS 17.0+ (iPhone and iPad)

---

## Things to Never Do
- Never add SPM or CocoaPods dependencies
- Never edit `Sift.xcodeproj` directly for structural changes
- Never use `git add -A` — add files explicitly
- Never commit Keychain credentials or `.p12`/`.p8` files
- Never modify tests to make them pass — fix the implementation
- Never push directly to main without passing tests
