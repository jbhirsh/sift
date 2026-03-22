# Sift

An iOS app for rapidly culling your Apple Music library. Tap through tracks and decide: **Keep**, **Skip**, or **Remove**. When you're done, all tracks marked for removal are collected into a "Sift — To Remove" playlist for easy cleanup.

---

## Requirements

- iOS 17.0+ (iPhone or iPad)
- Xcode 26+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- [SwiftLint](https://github.com/realm/SwiftLint): `brew install swiftlint`

---

## Setup

```bash
xcodegen generate   # regenerate Sift.xcodeproj from project.yml
open Sift.xcodeproj
```

After opening in Xcode, enable automatic signing:
- Select the **Sift** target → Signing & Capabilities → check "Automatically manage signing"

Build and run with **⌘R** targeting an iPhone simulator or device.

---

## Running Tests

### Unit tests

```bash
xcodebuild test \
  -project Sift.xcodeproj \
  -scheme SiftUnitTests \
  -destination 'platform=iOS Simulator,arch=arm64,name=iPhone 17' \
  CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  | xcbeautify
```

### UI tests

```bash
xcodebuild test \
  -project Sift.xcodeproj \
  -scheme Sift \
  -destination 'platform=iOS Simulator,arch=arm64,name=iPhone 17' \
  -only-testing:SiftUITests/SiftUITests \
  CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
  ENABLE_USER_SCRIPT_SANDBOXING=NO \
  | xcbeautify
```

When launched with the `--ui-testing` argument, the app skips Music authorization and loads mock tracks directly — no Apple Music account or network access needed.

---

## Architecture

```
Sift/
  App/            — SiftApp entry point
  Views/          — SwiftUI views (ContentView, SiftView, DoneView, …)
  ViewModels/     — SiftViewModel (main state machine, @MainActor)
  Services/       — MusicService (actor), PlaylistService, SessionStore
  Models/         — Track, Section, Decision, SiftSession, SortOrder
  Resources/      — Info.plist, entitlements, assets
SiftTests/        — XCTest unit tests
SiftUITests/      — XCUITest UI tests
project.yml       — XcodeGen project definition (source of truth)
```

---

## CI/CD

CI runs on every PR and push to main: lint → unit tests → UI tests.
Deploys to the App Store via Fastlane on `v*` tag push.
