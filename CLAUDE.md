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
make generate
```

---

## Test Commands
**Always run tests before committing.**

```bash
make test        # unit tests
make test-ui     # UI tests
make test-all    # unit then UI
```

Tests must be green before any commit. Always re-run tests before committing —
especially when test files were modified.

**Test coverage requirements:**
- Every new ViewModel method or service function must have a unit test in `SiftTests/`.
- Every new UI element or user-facing feature must have a UI test in `SiftUITests/`.
- Tests are written alongside the implementation, not after the commit.

---

## Build (command line)
Use `make test` to build and test in one step. For a standalone build, use Xcode (⌘B or ⌘R) with automatic signing (team 9PWVKSC697).

---

## Commit Style
Every commit message must:
- Have a short imperative subject (≤72 chars)
- Have a blank line then a body explaining *why*
- End with the Co-Authored-By trailer

```
Fix artwork fetch crashing on missing cache entry

Guard against nil songCache lookups in MusicService.artwork(for:)
instead of force-unwrapping, which caused crashes on first launch
before loadLibrary() completes.

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
- **CI** (`.github/workflows/ci.yml`): runs on every PR and push to main.
  Lints, then runs unit tests (`SiftUnitTests` scheme), then UI tests (`Sift` scheme).
  All changes reach main via PR — never by pushing directly.
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
- Never push directly to main — always create a branch and open a PR
- Never push a commit without first running tests locally to confirm they pass

---

## Figma MCP Integration Rules

These rules define how to translate Figma inputs into code for this project and must be followed for every Figma-driven change.

### Required Flow (do not skip)

1. Run `get_design_context` first to fetch the structured representation for the exact node(s)
2. If the response is too large or truncated, run `get_metadata` to get the high-level node map, then re-fetch only the required node(s) with `get_design_context`
3. Run `get_screenshot` for a visual reference of the node variant being implemented
4. Only after you have both `get_design_context` and `get_screenshot`, download any assets needed and start implementation
5. Translate the Figma MCP output into SwiftUI using this project's conventions, styles, and patterns
6. Validate against Figma for 1:1 look and behavior before marking complete

### Implementation Rules

- Treat Figma MCP output (typically React + Tailwind) as a **representation of design intent**, not code to copy — always translate to idiomatic SwiftUI
- IMPORTANT: Reuse existing views from `Sift/Views/` instead of duplicating functionality
- IMPORTANT: Use the project's existing color, typography, spacing, and radius conventions (see below)
- Respect existing architecture: `@EnvironmentObject` injection, `@MainActor` ViewModels, phase-driven navigation
- Strive for 1:1 visual parity with the Figma design
- Validate the final UI against the Figma screenshot for both look and behavior

---

## Design Tokens

This project uses **no centralized token files** — values are inline SwiftUI modifiers. Follow these conventions consistently.

### Colors (Semantic Only)

| Role | SwiftUI Color | Usage |
|------|--------------|-------|
| Keep / Positive | `.green` | Keep buttons, positive feedback overlays |
| Remove / Destructive | `.red` | Remove buttons, destructive feedback overlays |
| Skip / Neutral | `.orange` | Skip buttons, neutral actions |
| Primary text | `.primary` | Default text (implicit) |
| Secondary text | `.secondary` | Labels, subtitles |
| Tertiary text | `.tertiary` | Play count, album info |
| Containers | `.quaternary` | Background containers, placeholders |
| Surfaces | `.background` | Page backgrounds |
| Bars | `.bar` | Header/footer bar backgrounds |

- IMPORTANT: Never hardcode hex colors — always use SwiftUI semantic colors
- IMPORTANT: No custom color assets in `Assets.xcassets` — rely on system palette

### Typography

| Scale | SwiftUI Font | Usage |
|-------|-------------|-------|
| Display (lg) | `.system(size: 48, weight: .bold, design: .rounded)` | Hero title on SetupView |
| Display (md) | `.system(size: 40, weight: .bold, design: .rounded)` | "All done." on DoneView |
| Display (sm) | `.system(size: 36, weight: .bold, design: .rounded)` | "sift." branding on LoadingView |
| Headline | `.headline` / `.headline.bold()` | Section titles, stat labels |
| Title | `.title.bold()`, `.title3.bold()` | Track names on cards |
| Body | `.subheadline`, `.callout` | Artist names, descriptions |
| Caption | `.caption`, `.caption2` | Album info, timestamps |
| Monospace | `.caption.monospacedDigit()` | Time displays (seek bar) |

- Brand/hero text uses **rounded** design; all other text uses default system font
- IMPORTANT: Do not introduce custom fonts — use system fonts only

### Spacing Scale

| Value | Usage |
|-------|-------|
| 2 | Tight text group VStack spacing |
| 4 | Small internal spacing |
| 6 | Card content spacing |
| 8 | List item padding, picker padding |
| 12 | Container padding, section VStack spacing |
| 16 | Card overlay padding |
| 24 | Page horizontal margins, stat spacing |
| 32 | Large VStack spacing |
| 40 | Page-level bottom padding |

- Standard horizontal page padding: **24**
- Standard bar padding: **12** vertical
- Standard list item padding: **8**

### Corner Radius Scale

| Value | Usage |
|-------|-------|
| 8 | Thumbnails, list item backgrounds |
| 12 | Form containers (e.g., picker background) |
| 16 | Summary stats boxes |
| 20 | Main interactive cards |

### Shadows

- Background card shadows: `shadow(color: .black.opacity(0.04), radius: 8, y: 4)` (subtle)
- Interactive card shadow: `shadow(color: .black.opacity(0.08), radius: 20, y: 8)` (prominent)
- Action button shadows: `shadow(color: .black.opacity(0.06), radius: 8, y: 4)` (light)

---

## Component Patterns

### View Naming

- All views: `<Feature>View` (e.g., `SetupView`, `SiftView`, `DoneView`)
- Sub-components: nested structs or private helpers within the same file
- New view files go in `Sift/Views/`

### State & Data Flow

- Shared state via `@EnvironmentObject var vm: SiftViewModel`
- Navigation via `vm.phase` enum in `ContentView` (setup, loading, sifting, paused, done)
- No NavigationStack — phase-driven view switching

### Button Styles

| Style | Usage |
|-------|-------|
| `.borderedProminent` | Primary actions |
| `.bordered` | Secondary actions |
| `.plain` | Icon/minimal buttons |
| `.controlSize(.large)` | Large primary controls |
| `.controlSize(.small)` | Secondary controls |

### Animation Patterns

- Phase transitions: `.easeInOut(duration: 0.3)`
- Drag gestures: `.spring(response: 0.3, dampingFraction: 0.7)`
- State changes: `.default`

### Icon System

- IMPORTANT: All icons use **SF Symbols** — do not add custom icon assets
- Reference via `Image(systemName: "symbol.name")`
- Key symbols: `play.fill`, `pause.fill`, `gobackward.15`, `goforward.15`, `checkmark.circle.fill`, `xmark.circle.fill`, `arrow.right.circle`, `music.note`, `music.note.list`

---

## Asset Handling

- Assets live in `Sift/Resources/Assets.xcassets/`
- Only the AppIcon is stored as a raster asset; all UI icons are SF Symbols
- IMPORTANT: If the Figma MCP server returns a localhost source for an image or SVG, download it and place it in `Assets.xcassets` as a named image set
- IMPORTANT: Do not install icon packages or third-party asset libraries
