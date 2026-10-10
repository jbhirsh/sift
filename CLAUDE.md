# Sift — Claude Project Instructions

## What This Project Is
A React Native (Expo) mobile app for rapidly reviewing a music library.
Users swipe/tap through their tracks: keep, remove, or skip.
Supports Apple Music (Spotify was removed, #140). Built with Expo SDK 57, React Native 0.86,
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

```bash
make test            # unit tests (Jest)
make lint            # ESLint
make typecheck       # TypeScript type checking
make check           # lint + typecheck + tests (all three)
```

Git hooks (installed by the `prepare` script via `core.hooksPath`) run these
automatically: **pre-commit** runs lint + typecheck; **pre-push** runs the
unit-test suite under coverage. Both no-op when `$CI` is set. CI re-runs
everything.

**Testing pyramid:**

| Layer | What it tests | Speed | When to use |
|-------|--------------|-------|-------------|
| Unit tests (`make test`) | Reducers, utils, hooks, services | Seconds | Every push + CI |
| E2E tests (`make test-e2e`) | Full app flows | Minutes | PR time (Maestro flows in `.maestro/`) |
| Mutation tests (`make test-mutation`) | Assertion depth of unit tests (Stryker) | Minutes–hour | PR time (changed files) + weekly full sweep (`mutation.yml`) |

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

CI's commit-message step (`.github/scripts/check-commits.sh`, in the
`Lint, Typecheck & Unit Test` job) fails a PR on a subject over 72 chars,
a missing body, a fixup/"oops" commit or a merge commit (history is
linear: rebase, not merge).

```
Fix artwork fetch crashing on missing cache entry

Guard against undefined track lookups in AppleMusicProvider
instead of assuming the track exists, which caused crashes
when the library hadn't finished loading.

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Amend or squash your own feature branch freely before it merges, but never
amend, rebase, or force-push `main`. Never use `--no-verify`.**

---

## Code Style
- **TypeScript**: strict mode enabled. All new code must be typed.
  Type-checking runs on **TypeScript 7** (the native compiler), installed as
  `@typescript/native` (an npm alias of `typescript@7`). TS 7 ships no
  JavaScript API, and typescript-eslint and dependency-cruiser load that API
  via `require('typescript')`, so the `typescript` name is an alias of
  `@typescript/typescript6` (the 6.0 API). Both install a `tsc` binary, so
  never call bare `tsc`/`npx tsc`: use `npm run typecheck` / `make typecheck`,
  which invoke TS 7 by path. Swap the alias back once typescript-eslint
  supports TS 7.
- **ESLint**: flat config in `eslint.config.mjs`. Fix all violations before committing.
- **Testing**: Jest + React Native Testing Library 14. In RNTL 14, `render`,
  `renderHook`, `rerender`, `unmount`, `fireEvent.*` and `act` are async:
  always `await` them (and any helper that wraps them, like
  `renderWithProviders`). A missed `await` is a silently wrong test, so lint
  fails on one (`@typescript-eslint/no-floating-promises` in `__tests__/`).
- **Architecture layering**: `npm run depcruise` enforces the import rules in
  `.dependency-cruiser.cjs` (pure `utils`, `types` a leaf, `services`/`context`
  below the UI). Runs in CI and the pre-commit hook.

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
    services/           MusicProviderInterface, AppleMusicProvider, MockMusicProvider,
                        SessionStore, RemovalHistoryStore, PreferencesStore,
                        ChorusFinder + LrclibClient ("Start at chorus")
    hooks/              useKeyboardShortcuts, useMusicProvider, useResolvedArtwork,
                        useChorusStart
    theme/              Design tokens (SPACING, RADIUS, COLORS, SHADOWS,
                        FONTS, GLASS, GRADIENTS), ThemeContext
    types/              Track, Decision, AppPhase, SortOrder, MusicProvider,
                        SiftSession
    utils/              formatTime, mockData, sorting, chorus
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
  `AppleMusicProvider` is the concrete implementation (Spotify was removed,
  #140; the interface stays so another service can be added);
  `MockMusicProvider` is used for testing/development.
- **Session persistence**: `SessionStore` saves/loads session state via AsyncStorage.
  Sessions auto-save after every decision. User settings (`startAtChorus`) are
  preferences, not session state: `PreferencesStore` persists them and
  `RESUME_SESSION` never touches them.
- **Start at chorus** (Apple Music only): `ChorusFinder` picks each track's start
  from LRCLIB synced lyrics (the repeated block, `utils/chorus`), then from where
  ShazamKit places Apple's preview clip in the track (native `previewOffset`), then
  a ~20% estimate; results are cached per track. ShazamKit matching needs the
  ShazamKit App Service enabled on the App ID; without it that step just yields
  nothing.
- **Theme system**: Centralized design tokens in `src/theme/index.ts`.
  `ThemeContext` provides light/dark mode colors, glass material settings,
  and phase-specific gradients.
- **Native modules**: `expo-musickit` in `modules/` bridges MusicKit for Apple Music access.

---

## CI/CD
- CI runs in `.github/workflows/ci.yml` on GitHub-hosted runners: lint,
  typecheck, dependency-cruiser, Jest with coverage and a production
  dependency audit on Ubuntu on every PR. The audit gates at critical, not
  high: Expo's build tooling carries high advisories only Expo can fix.
  The Maestro iOS E2E job (macOS) also runs on every PR, with
  `workflow_dispatch` available for manual runs. Its app build is cached on
  the native fingerprint plus a hash of the bundle's inputs (`src/`,
  `index.ts`, `metro.config.js`; tests and flows don't count),
  and on a native PR it waits for ios-build's identical build instead of
  building in parallel. On push to main it builds and caches the app but
  skips the suite: only caches saved on main can be restored by PRs.
- The Claude Code PR review runs in its own workflow,
  `.github/workflows/claude-review.yml` (job `Claude Review`, pull requests
  only), in parallel with CI rather than after it, so a red PR is reviewed
  too. It is kept out of `ci.yml` because claude-code-action skips (while
  reporting success) any PR that edits the workflow file it runs from; in
  its own file, CI changes still get reviewed. The auto-fix workflow lives
  alongside it in `.github/workflows/claude-autofix.yml`. It acts only on
  bots' PRs (Dependabot's): it fixes review threads opened by Claude Review or
  the owner (two rounds per PR at most, once CI and Claude Review are both
  green on the head) and, when an npm bump fails a check
  (CI, iOS Build, Mutation Testing), mechanical breakage from the bump, one
  attempt per head and two per PR. When every fix would change behavior it
  comments and leaves the decision to the owner. A person's PR is left to its
  author.
- **Dependabot's npm PRs merge themselves.** `dependabot-merge.yml` turns on
  auto-merge as each one opens, and the `main` rule does the gating: GitHub
  merges only once every required check is green. So the rule must list every
  check a PR runs, Claude Review included, and require review threads to be
  resolved, or a bot PR merges past a failing or unreported gate.
- **The phone build follows `main`.** `.github/workflows/preview-deploy.yml`
  runs on every push to `main`. It fingerprints the native layer
  (`runtimeVersion.policy: fingerprint` in `app.json`) and looks for an EAS
  build with that fingerprint: if one exists, it publishes an EAS Update to
  the `preview` channel, which installed preview builds download on launch
  and run from their next cold launch; otherwise native code changed, which
  an update can't carry, so it builds the `preview` app on a GitHub macOS
  runner (`eas build --local`) and uploads it to EAS (`eas upload`) for an
  install link. Local builds don't use the plan's EAS cloud builds (15 iOS a
  month). A change that touches native code (Swift, a native package, an SDK
  bump), or edits `eas.json` or the `package.json` scripts (both part of the
  fingerprint), therefore needs a reinstall; everything else arrives by
  itself. `--refresh-ad-hoc-provisioning-profile` rebuilds the ad hoc
  provisioning profile from the iPhones registered on EAS (`eas device:create`).
  Unattended, it reads only the App Store Connect API key assigned to the app
  for EAS Submit (`eas credentials -p ios`), which carries no Apple team, so
  the job sets `EXPO_APPLE_TEAM_ID`. A newly registered iPhone needs a new
  build: run the workflow by hand with "Build a new preview app" ticked. The
  fingerprint must come out the same in the checkout and in the build's clean
  copy, so build output the checkout holds (SwiftPM's `.build`) goes in
  `.fingerprintignore`.
- Security/quality gates run per PR and sweep weekly (Mon 06:00 UTC):
  `gitleaks.yml` (secret scanning), `semgrep.yml` (SAST, `--config auto`), and
  `mutation.yml` (Stryker), alongside the weekly Dependabot bumps.
- **Required status checks.** The `main` branch rule requires these job names
  (from GitHub Actions, whichever workflow file they live in), so renaming a
  job's `name:` silently un-gates it. Update the rule in the same PR as any
  rename:
  `Lint, Typecheck & Unit Test`, `E2E Tests (Maestro)`, `Claude Review`,
  `Secret scan`, `SAST scan`, `Build iOS simulator app`,
  `Mutation Tests (Stryker)`, `PR visuals`.
  Every one of these reports on every PR. Never add a trigger-level
  `on.pull_request.paths` filter to a gating workflow: a filtered-out workflow
  never reports, and the required check hangs at "Expected". Path-filter
  inside the workflow instead (see the `changes` job in `ios-build.yml` and
  `mutation.yml`). A job skipped by its `if:` counts as passing.
- **E2E runner.** `scripts/run-e2e.sh` runs the whole Maestro suite in one
  session, then re-runs alone, on a fresh XCUITest driver, only the flows
  whose failure was a driver/transport error (so one driver death can't
  fail every flow). Assertion failures and app crashes are never retried.
  Each re-run is flagged with a `::warning::` annotation, and if a re-run
  also hits a driver error the runner stops. Don't switch to one
  invocation per flow: restarting the driver per flow caused lost taps
  right after launch. Fix flaky flows at the root: wait for the element
  (`extendedWaitUntil`), never assert right after an animated transition.

---

## Workflow
- **Issues are the source of truth.** Check `gh issue list` (and
  `gh issue view <n>`) before designing or implementing a feature — issues
  carry rationale the code doesn't.
- **Review before raising a PR.** Review the full diff (e.g. a review subagent
  reading it) before opening the PR — review gates PR creation, rather than
  opening first and reviewing after.
- **Show UI changes in the PR.** A PR that changes a screen, a component,
  `src/App.tsx`, the theme or an image asset puts before/after visuals in its
  description (`.github/pull_request_template.md`): simulator screenshots for
  how things look, GIFs for how things move or respond (card swipes,
  animations, sheets and modals opening and closing, scrolling, multi-step
  flows). The `PR visuals` check (`scripts/pr-visuals.mjs`, rules in
  `scripts/prVisuals.ts`) fails a UI change with no picture unless "No
  visible UI change" is ticked, and re-runs when the description is edited;
  Claude Review asks for a GIF when motion changes.
  - Screenshot: `xcrun simctl io booted screenshot after.png`.
  - GIF: `xcrun simctl io booted recordVideo --codec=h264 swipe.mov` (Ctrl-C
    stops it), then
    `ffmpeg -i swipe.mov -vf "fps=12,scale=320:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse" swipe.gif`.
  - Host them by dragging them into the PR description, or commit them to a
    `pr-screenshots/<topic>` branch (no workflow runs on it) and link their
    `raw.githubusercontent.com` URLs.

---

## App Identity
- **Bundle ID**: `com.jessicahirsh.sift`
- **Display name**: Sift
- **Platform**: iOS only (iPhone and iPad) — the expo-musickit native module is iOS-only and Apple MusicKit has no Android SDK

---

## Things to Never Do
- Never use `git add -A` — add files explicitly
- Never modify tests to make them pass — fix the implementation
- Never install packages outside of the project root

(Rules enforced by tooling — committing secrets (gitleaks), pushing to `main`
(branch protection), pushing with failing tests (the pre-push hook), and inline
lint/type suppression (the `no-use` and `ban-ts-comment` lint rules) — are the
source of truth and aren't repeated here.)

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
- Do not install additional icon packages (lint rejects importing a package
  whose name mentions "icon", other than `@expo/vector-icons`, and the common
  icon libraries that don't: lucide, Font Awesome, Phosphor, Feather)
