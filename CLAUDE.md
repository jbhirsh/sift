# Sift — Claude Project Instructions

## What This Project Is
A native SwiftUI macOS app for rapidly reviewing an Apple Music library.
Users swipe/keyboard through their tracks: keep, remove, or skip.
Targets the Mac App Store. Uses ScriptingBridge to control Music.app.

---

## Running the App
Open `Sift.xcodeproj` in Xcode and hit ⌘R.

To regenerate the Xcode project after editing `project.yml`:
```bash
xcodegen generate
```

---

## Test Commands
**Always run tests before committing.**

```bash
xcodebuild test \
  -project Sift.xcodeproj \
  -scheme Sift \
  -destination 'platform=macOS' \
  CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  | xcbeautify
```

Tests must be green before any commit. Always re-run tests before committing — especially when test files were modified.

**Test coverage requirements:**
- Every new ViewModel method or service function must have a unit test in `SiftTests/`.
- Every new UI element or user-facing feature must have a UI test in `SiftUITests/`.
- Tests are written alongside the implementation, not after the commit.

---

## Build (command line)
```bash
xcodebuild build \
  -project Sift.xcodeproj \
  -scheme Sift \
  -destination 'platform=macOS' \
  CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  | xcbeautify
```

Note: Xcode GUI builds (⌘R) use automatic signing with team 9PWVKSC697.
Command-line builds skip signing — this is intentional for local verification.

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
- **Credentials**: Spotify credentials stored in Keychain via `CredentialStore`.
  Never hardcode or commit credentials.

---

## Architecture
```
Sift/
  App/              SiftApp.swift
  Models/           Track, Section, Decision, SiftSession, SortOrder
  Services/         MusicService (ScriptingBridge), SpotifyService,
                    SessionStore, CredentialStore
  ViewModels/       SiftViewModel (@MainActor ObservableObject)
  Views/            SetupView, LoadingView, SiftView, CardView,
                    PlayerControlsView, DoneView, SettingsView
  Resources/        Info.plist, Sift.entitlements, Assets.xcassets
SiftTests/          XCTest suite
fastlane/           Fastfile, Appfile
project.yml         xcodegen spec — source of truth for Xcode project
```

**Important**: `project.yml` is the source of truth. Never edit
`Sift.xcodeproj` directly for structural changes — edit `project.yml`
and run `xcodegen generate`.

---

## Key Architecture Notes
- `MusicService` is a Swift `actor`. All Music.app calls are synchronous
  ScriptingBridge calls, but cross-actor calls are `await`-ed.
- `MusicService` caches ScriptingBridge track objects in `trackCache`
  after `loadLibrary()`. This avoids re-traversing the library on every
  play/seek/delete call.
- `SiftViewModel` is `@MainActor` and owns all published state.
- Session is persisted to `~/Library/Application Support/Sift/session.json`
  after every decision.
- Spotify credentials live in the macOS Keychain via `CredentialStore`.

---

## CI/CD
- **CI** (`.github/workflows/ci.yml`): runs on every push to main.
  Lints + builds + tests.
- **Deploy** (`.github/workflows/deploy.yml`): runs on `v*` tag push.
  Builds, signs, notarizes, submits to App Store via Fastlane.
- Deploy requires GitHub environment `app-store` with signing secrets.

---

## App Store
- **Bundle ID**: `com.jessicahirsh.sift`
- **Display name**: Sift — Music Library Cleaner
- **SKU**: SIFT-001
- **Team ID**: 9PWVKSC697
- `com.apple.security.scripting-targets` for Music.app is a restricted
  entitlement — approval from Apple required before App Store submission.

---

## Things to Never Do
- Never add SPM or CocoaPods dependencies
- Never edit `Sift.xcodeproj` directly for structural changes
- Never use `git add -A` — add files explicitly
- Never commit Keychain credentials or `.p12`/`.p8` files
- Never modify tests to make them pass — fix the implementation
- Never push directly to main without passing tests
