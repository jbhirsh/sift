# Sift — Claude Project Instructions

## What This Project Is
A React Native (Expo) mobile app for rapidly reviewing a music library.
Users swipe/tap through their tracks: keep, remove, or skip.
Supports Apple Music and Spotify. Built with Expo SDK 57, React Native 0.86,
React 19, and TypeScript.

---

## Running the App

```bash
npm install          # first time only
npx expo run:ios     # first build (compiles native modules)
npx expo start       # subsequent launches (use after first build)
```

---

## Test Commands
**Always run tests before committing.**

```bash
make test            # unit tests (Jest)
make lint            # ESLint
make typecheck       # TypeScript type checking
make check           # lint + typecheck + tests (all three)
```

Tests must be green before any commit. Always re-run tests before committing —
especially when test files were modified.

**Testing pyramid:**

| Layer | What it tests | Speed | When to use |
|-------|--------------|-------|-------------|
| Unit tests (`make test`) | Reducers, utils, hooks, services | Seconds | Every commit + CI |
| E2E tests (`make test-e2e`) | Full app flows | Minutes | PR time (Maestro flows in `.maestro/`) |

**Test coverage requirements:**
- Every new reducer action, service function, or utility must have a unit test in `__tests__/unit/`.
- Every new user-facing flow should have a Maestro E2E flow in `.maestro/`.
- Unit tests must be pure logic — no device rendering.
- Tests are written alongside the implementation, not after the commit.

---

## Commit Style
Every commit message must:
- Have a short imperative subject (<=72 chars)
- Have a blank line then a body explaining *why*
- End with the Co-Authored-By trailer

```
Fix artwork fetch crashing on missing cache entry

Guard against undefined track lookups in AppleMusicProvider
instead of assuming the track exists, which caused crashes
when the library hadn't finished loading.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**Never amend a pushed commit. Never use --no-verify.**

---

## Code Style
- **TypeScript**: strict mode enabled. All new code must be typed.
- **ESLint**: flat config in `eslint.config.mjs`. Fix all violations before committing.
- **Testing**: Jest + React Native Testing Library.

---

## Architecture
```
src/
    App.tsx             Phase router + settings modal
    components/         Reusable UI (Button, GlassCard, GlassBackground,
                        InteractiveCard, PlayerControls, PlaylistPicker)
    screens/            SetupScreen, LoadingScreen, SiftScreen,
                        DoneScreen, SettingsScreen
    context/            SiftContext (useReducer state management)
    services/           MusicProviderInterface, AppleMusicProvider,
                        SpotifyProvider (+ spotify/ API & auth), MockMusicProvider,
                        SessionStore, RemovalHistoryStore
    hooks/              useKeyboardShortcuts, useMusicProvider, useResolvedArtwork
    theme/              Design tokens (SPACING, RADIUS, COLORS, SHADOWS,
                        FONTS, GLASS, GRADIENTS), ThemeContext
    types/              Track, Decision, AppPhase, SortOrder, MusicProvider,
                        SiftSession
    utils/              formatTime, mockData, sorting
modules/
  expo-musickit/        Custom Expo native module for MusicKit
__tests__/
  unit/                 Jest unit tests
  helpers/              Test render helpers
.maestro/               Maestro E2E flows
assets/                 App icons, splash screen
app.json                Expo config
jest.config.js          Jest configuration
eslint.config.mjs       ESLint flat config
tsconfig.json           TypeScript configuration
Makefile                Dev commands (test, lint, typecheck, check)
```

---

## Key Architecture Notes
- **State management**: `SiftContext` uses `useReducer` with a `SiftState`/`SiftAction` pattern.
  All app state lives in a single reducer — no external state library.
- **Phase routing**: `PhaseRouter` in `App.tsx` switches screens based on `state.phase`
  (setup, loading, sifting, paused, done). No React Navigation — phase-driven switching.
- **Provider pattern**: Music services implement `MusicProviderInterface`.
  `AppleMusicProvider` and `SpotifyProvider` are concrete implementations;
  `MockMusicProvider` is used for testing/development.
- **Session persistence**: `SessionStore` saves/loads session state via AsyncStorage.
  Sessions auto-save after every decision.
- **Theme system**: Centralized design tokens in `src/theme/index.ts`.
  `ThemeContext` provides light/dark mode colors, glass material settings,
  and phase-specific gradients.
- **Native modules**: `expo-musickit` in `modules/` bridges MusicKit for Apple Music access.

---

## CI/CD
- CI runs in `.github/workflows/ci.yml` on GitHub-hosted runners: lint,
  typecheck, and Jest with coverage on Ubuntu on every PR. The Maestro iOS
  E2E job (macOS) also runs on every PR and push to main, with
  `workflow_dispatch` available for manual runs.
- The Claude Code PR review runs as the `review` job inside `ci.yml`
  (dependent on the `check` job, pull requests only); the auto-fix workflow
  lives alongside it in `.github/workflows/claude-autofix.yml`.
- All changes reach main via PR — never by pushing directly.

---

## App Identity
- **Bundle ID**: `com.jessicahirsh.sift`
- **Display name**: Sift
- **Platform**: iOS only (iPhone and iPad) — the expo-musickit native module is iOS-only and Apple MusicKit has no Android SDK

---

## Things to Never Do
- Never use `git add -A` — add files explicitly
- Never commit secrets, API keys, or `.env` files
- Never modify tests to make them pass — fix the implementation
- Never push directly to main — always create a branch and open a PR
- Never push a commit without first running tests locally to confirm they pass
- Never install packages outside of the project root

---

## Figma MCP Integration Rules

These rules define how to translate Figma inputs into code for this project and must be followed for every Figma-driven change.

### Required Flow (do not skip)

1. Run `get_design_context` first to fetch the structured representation for the exact node(s)
2. If the response is too large or truncated, run `get_metadata` to get the high-level node map, then re-fetch only the required node(s) with `get_design_context`
3. Run `get_screenshot` for a visual reference of the node variant being implemented
4. Only after you have both `get_design_context` and `get_screenshot`, download any assets needed and start implementation
5. Translate the Figma MCP output into React Native using this project's conventions, styles, and patterns
6. Validate against Figma for 1:1 look and behavior before marking complete

### Implementation Rules

- Treat Figma MCP output (typically React + Tailwind) as a **representation of design intent**, not code to copy — always translate to idiomatic React Native with this project's theme tokens
- IMPORTANT: Reuse existing components from `src/components/` instead of duplicating functionality
- IMPORTANT: Use the project's existing design tokens from `src/theme/index.ts`
- Respect existing architecture: `SiftContext` for state, phase-driven navigation, `ThemeContext` for colors
- Strive for 1:1 visual parity with the Figma design
- Validate the final UI against the Figma screenshot for both look and behavior

---

## Design Tokens

Design tokens are centralized in `src/theme/index.ts`. Always import from there — never hardcode values.

### Colors

Semantic colors are defined in `COLORS.light` and `COLORS.dark`, accessed via `useTheme().colors`:

| Role | Token | Usage |
|------|-------|-------|
| Keep / Positive | `COLORS.keep` | Keep buttons, positive feedback |
| Remove / Destructive | `COLORS.remove` | Remove buttons, destructive feedback |
| Skip / Neutral | `COLORS.skip` | Skip buttons, neutral actions |
| Primary text | `colors.text` | Default text |
| Secondary text | `colors.textSecondary` | Labels, subtitles |
| Tertiary text | `colors.textTertiary` | Play count, album info |
| Containers | `colors.quaternary` | Background containers |
| Surfaces | `colors.surface` | Card/section backgrounds |
| Page backgrounds | `colors.background` | Screen backgrounds |

### Spacing (SPACING)

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 2 | Tight text spacing |
| `sm` | 4 | Small internal spacing |
| `md` | 6 | Card content spacing |
| `base` | 8 | List item padding |
| `lg` | 12 | Container padding |
| `xl` | 16 | Card overlay padding |
| `2xl` | 24 | Page horizontal margins |
| `3xl` | 32 | Large spacing |
| `4xl` | 40 | Page-level bottom padding |

### Corner Radius (RADIUS)

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 8 | Thumbnails, list items |
| `md` | 12 | Form containers |
| `lg` | 16 | Summary boxes |
| `xl` | 20 | Main interactive cards |

### Shadows (SHADOWS)

| Token | Usage |
|-------|-------|
| `subtle` | Background card shadows |
| `prominent` | Interactive card shadows |
| `button` | Action button shadows |

### Typography (FONTS)

| Token | Usage |
|-------|-------|
| `brand` | Hero/brand text (rounded on iOS) |
| `headline` | Section titles (semibold) |
| `body` | Default body text |

### Glass Materials (GLASS)

| Token | Blur | Tint | Usage |
|-------|------|------|-------|
| `thin` | 20 | 0.05 | Subtle glass overlays |
| `regular` | 40 | 0.10 | Standard glass cards |
| `thick` | 80 | 0.18 | Heavy glass backgrounds |

---

## Icon System

- Use `expo-symbols` (`SymbolView`) for SF Symbols on iOS
- Use `@expo/vector-icons` as fallback for cross-platform icons
- Do not install additional icon packages
