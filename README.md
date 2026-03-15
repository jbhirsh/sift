# Sift

A macOS app for rapidly culling your Apple Music library. Swipe through tracks and decide: **Keep**, **Skip**, or **Remove**. When you're done, move all tracks marked for removal into a "Sift — To Remove" playlist in Music.app for easy cleanup.

---

## Requirements

- macOS 14+
- Xcode 16+
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

Build and run with **⌘R**.

---

## Running Tests

### Unit tests (from the terminal — no signing required)

```bash
make test
```

Tests business logic: sort order, playlist script generation, view model decisions, session persistence.

### UI tests (full interaction flow)

UI tests launch the real app with `--ui-testing`, which skips Music authorization and loads mock tracks directly into the sifting view. They require the app to be built and signed in Xcode first.

1. Build in Xcode: **⌘B**
2. Then from the terminal:
   ```bash
   make test-ui
   ```

Or just run **⌘U** in Xcode to run everything in one step.

### How mock data works

When the app is launched with the `--ui-testing` argument, it skips Music authorization and loads three mock tracks ("Mock Song One", "Mock Song Two", "Mock Song Three") directly into the sifting view. No Apple Music account or network access is needed.

---

## Architecture

```
Sift/
  App/            — SiftApp entry point
  Views/          — SwiftUI views (ContentView, SiftView, DoneView, …)
  ViewModels/     — SiftViewModel (main state machine)
  Services/       — MusicService, PlaylistService, SessionStore
  Resources/      — Info.plist, entitlements, assets
SiftTests/        — Unit tests
SiftUITests/      — XCUITest UI tests
project.yml       — XcodeGen project definition
```

---

## Deploying

See `.claude/skills/deploy` for the App Store deployment process via Fastlane.
