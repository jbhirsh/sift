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
make lint            # ESLint over the whole repo + the native bridge check
make typecheck       # TypeScript type checking
make check           # what CI's unit job runs: lint, typecheck, depcruise,
                     # the native bridge check, tests with coverage
```

`make check` is `npm run check`; `make lint` is `npm run lint` plus
`npm run bridge`. Lint covers the whole repo (`eslint .`), as CI does.

Git hooks (installed by the `prepare` script via `core.hooksPath`) run these
automatically: **pre-commit** runs lint, typecheck, depcruise and the native
bridge check; **pre-push** runs the unit-test suite under coverage. Both
no-op when `$CI` is set. CI re-runs everything.

**Testing pyramid:**

| Layer | What it tests | Speed | When to use |
|-------|--------------|-------|-------------|
| Unit tests (`make test`) | Reducers, utils, hooks, services | Seconds | Every push + CI |
| E2E tests (`make test-e2e`) | Full app flows | Minutes | PR time (Maestro flows in `.maestro/`) |
| Mutation tests (`make test-mutation`) | Assertion depth of unit tests (Stryker) | Minutes–hour | PR time (changed files, incremental) + weekly full sweep (`mutation.yml`) |

**Test coverage requirements:**
- Every new reducer action, service function, or utility must have a unit test in `__tests__/unit/`.
- Every new user-facing flow should have a Maestro E2E flow in `.maestro/`.
- Unit tests must be pure logic — no device rendering.
- Every touchable needs an `accessibilityRole` and a name (label or text);
  `__tests__/helpers/a11yScan.ts` fails a screen's "VoiceOver scan" test
  otherwise. A new screen gets one of those tests. Don't make a container
  that holds Maestro-targeted text `accessible`: it hides the text's testID
  from XCUITest.
- The E2E job also runs Xcode's accessibility audit
  (`e2e/a11y-audit`, `scripts/run-a11y-audit.sh`) on Setup, Sift, Settings
  and Done in light and dark: contrast, hit targets, clipped text, Dynamic
  Type, as iOS renders them. Any issue fails the job, as does a screen the
  pass never reached.
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
                        InteractiveCard, PlayerControls, PlaylistPicker,
                        ResumeSessionModal, SessionStatRow, UndoPill,
                        DecisionsSheet, ErrorBoundary)
    screens/            SetupScreen, LoadingScreen, SiftScreen,
                        DoneScreen, SettingsScreen
    context/            SiftContext (useReducer state management),
                        MusicProviderContext (the one shared provider + poller),
                        resumeSession (a saved session's defaults)
    services/           MusicProviderInterface, AppleMusicProvider, MockMusicProvider,
                        SessionStore, RemovalHistoryStore, PreferencesStore,
                        ReviewedLedgerStore, haptics, trace (E2E trace),
                        ChorusFinder + LrclibClient ("Start at chorus")
    hooks/              useMusicProvider, usePendingDecision (Undo),
                        useReviseDecision, useRemovalRetry,
                        useResolvedArtwork, useChorusStart,
                        useTrace (the E2E trace's screens, touches, stalls)
    theme/              Design tokens (SPACING, RADIUS, COLORS, SHADOWS,
                        FONTS, GLASS, GRADIENTS), ThemeContext, useThemeColors
    types/              Track, Decision, AppPhase, SortOrder, TrackFilter,
                        MusicProvider, SiftSession
    utils/              Pure logic, each file named for what it does (sorting,
                        trackFilter, trackIdentity, sessionFormat, musicKit,
                        serialQueue, cardLayout, …); `ls src/utils`
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
  `MockMusicProvider` is used for testing/development. `SiftProvider` renders
  `MusicProviderHost`, which creates the provider once per provider change and
  runs the only playback poller; every `useMusicProvider` shares it.
- **Session persistence**: `SessionStore` saves/loads session state via AsyncStorage.
  Sessions auto-save after every decision. The track list is stored once per
  list (two alternating slots, so a crash mid-write keeps the last pair
  intact) and each save writes a compact record of ids (`utils/sessionFormat`,
  #150); a pre-#150 `sift_session` blob still loads and is removed after the
  first compact save. `__tests__/fixtures/sessions` holds a frozen copy of
  every saved shape: add one when the shape changes, never edit them. User settings (`startAtChorus`) are
  preferences, not session state: `PreferencesStore` persists them and
  `RESUME_SESSION` never touches them.
- **Reviewed ledger**: library keeps leave the song in place, so
  `ReviewedLedgerStore` records kept ids per source and later library sifts
  leave them out; Setup's "Include songs I've already sifted" switch passes
  `skipFiltering` (for Start Sifting and a library Start Over) to bring them
  back. Skipped songs aren't recorded.
- **Undo** (#152): the latest decision is held in `state.pending` (persisted
  with the session) and reaches the music service only after a 5 s undo
  window, on the next decision, or when the Sift screen goes away or the app
  goes to the background (`hooks/usePendingDecision`). `UNDO_LAST` takes it
  back while it's held. Nothing calls `removeTrack`/`keepTrack` for a
  decision directly: send through `useSendPending`, which sends each once.
  A decision a killed app was holding goes out on Resume, or, if a new sift
  replaces that session, through `useSendSavedPending` first.
- **One decision at a time** (`utils/decisionGuard`): every way to decide
  on the Sift screen, and Finish, Undo, Back and the decisions list, asks
  the guard when pressed. A press is judged by its touch's own timestamp
  (when the finger lifted), not when JavaScript got to it: too soon after
  the last decision (its fly-off and settle) it's turned away; otherwise it
  goes, or, if the decision before it isn't on screen yet, a Skip waits and
  then runs with that state, while a Keep or Remove is turned away (its
  card hasn't been seen). No timers and no button is disabled for it:
  after a JavaScript stall, queued taps run before both (the likely way
  flow 21 lost two Skips).
- **Changing an older decision**: the decisions list (`DecisionsSheet`, from
  the Sift header and Done) changes any decided card through
  `useReviseDecision`: a held decision just changes (`REVISE`); a sent one
  is taken back first (`restoreTrack`, or `unkeepTrack`: out of the
  reviewed ledger or "<name> - Sifted"), then the new one is sent through
  the screen's `useSendPending`. If taking it back fails, nothing changes.
- **Remove collects; it never deletes or edits the user's playlists.**
  MusicKit can't delete library songs and edits only playlists the app
  created, so every Apple Music Remove, from a library or a playlist sift,
  adds the song to "Sift — Removed" (`AppleMusicProvider.removeFromLibrary`)
  for the user to delete from their library in Music; Done says how.
  Removed songs are left out of every later sift (`collectedRemovalIds`, a
  playlist record carries `collected: true`); Restore takes the song back
  out (`restoreRemoved`) and forgets every record of it. Start Over clears
  a playlist's other records but never un-removes. Sift edits only
  playlists it created ("- Sifted", "Sift — Removed"): MusicKit's edit
  throws on any other, so a "Sift — Removed" the user made is skipped.
- **Library writes run one at a time.** `AppleMusicProvider` queues every
  write (`utils/serialQueue`): a native playlist removal reads the playlist
  and writes it back, so two at once would undo each other.
- **Start at chorus** (Apple Music only): `ChorusFinder` picks each track's start
  from LRCLIB synced lyrics (the repeated block, `utils/chorus`), then from where
  ShazamKit places Apple's preview clip in the track (`AppleMusicProvider.previewOffset`, native `shazamOffset`), then
  a ~20% estimate; results are cached per track. ShazamKit matching needs the
  ShazamKit App Service enabled on the App ID; without it that step just yields
  nothing.
- **Theme system**: Centralized design tokens in `src/theme/index.ts`.
  `ThemeContext` provides light/dark mode colors, glass material settings,
  and phase-specific gradients.
- **Native modules**: `expo-musickit` in `modules/` bridges MusicKit for Apple Music access.
  It is a thin bridge: each native function asks MusicKit, ShazamKit or the
  player one thing and returns raw values. Every decision (defaults, lookup
  order, catalog id pairing, batching, counting what landed, the "Sift —
  Removed" policy, which preview to fingerprint) lives in TypeScript
  (`utils/musicKit`, `AppleMusicProvider`), so it ships with an EAS Update
  instead of a reinstall and is covered by Jest and Stryker. Add a primitive
  in Swift; put the policy in TypeScript. The "Native bridge" check
  (`scripts/check-native-bridge.mjs`, in CI and pre-commit) holds this: every
  native function needs an entry in `modules/expo-musickit/native-api.json`
  saying the one thing it asks, the Swift and TypeScript surfaces must match,
  and functions and the file stay under the size budgets there.

---

## CI/CD
- CI runs in `.github/workflows/ci.yml` on GitHub-hosted runners: lint,
  typecheck, dependency-cruiser, Jest with coverage and a production
  dependency audit on Ubuntu on every PR. The audit gates at critical, not
  high: Expo's build tooling carries high advisories only Expo can fix.
  The Maestro iOS E2E job (macOS) also runs on every PR that can affect the
  app or the job, with `workflow_dispatch` available for manual runs. It
  skips PRs that only touch docs or repo tooling (other workflows, the
  commit check, `scripts/` apart from its two runners, `stryker.config.json`;
  the `code` filter in `ci.yml`, with `predicate-quantifier: 'every'` so its
  `!` patterns exclude). Its app build is cached on
  the native fingerprint plus a hash of the bundle's inputs (`src/`,
  `index.ts`, `metro.config.js`, `package-lock.json`, `.env`, `assets/`;
  tests and flows don't count),
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
  copy, so any build output the checkout holds goes in `.fingerprintignore`
  (empty today).
- Security/quality gates run per PR and sweep weekly (Mon 06:00 UTC):
  `gitleaks.yml` (secret scanning), `semgrep.yml` (SAST, `--config auto`), and
  `mutation.yml` (Stryker), alongside the weekly Dependabot bumps. PR mutation
  runs are incremental: they reuse the PR's last results (or the last weekly
  sweep's, from the Actions cache) and re-test only mutants whose code or
  tests changed. The weekly sweep tests everything and refreshes that
  baseline.
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
  right after launch. A flow starts a sift through
  `.maestro/shared/start_sifting.yaml` (`runFlow`), which fails at the tap
  if Setup doesn't go away; only a tap meant to stay on Setup (an error, a
  "Discard?" alert) taps `setup-start-sifting` itself. `shared/` holds subflows, not flows (Maestro
  runs only the top level of `.maestro/`).
- **A flaky E2E flow is a bug: diagnose it and fix it at the root, never
  re-run CI to get past it.** Read the run's `maestro-results` artifact
  first: the app's trace (`trace.txt`: every touch with where it landed
  and how late JavaScript saw it, every screen and sheet (when it started
  rendering and when it was up), every app action,
  each decision-guard check and any JavaScript stall; `services/trace`,
  written only by the E2E build), Maestro's log, each command's result and
  the view hierarchy at the failure (`suite-debug/`), the system log for
  the app (`app-log.txt`), the screenshots. A touch followed by no action,
  screen or guard line is a tap the app dropped; say where, then fix it. Then fix the flow (wait for the element with
  `extendedWaitUntil`, never assert right after an animated transition) or
  the app, whichever is wrong. No retry in a flow to cover one either (a
  second tap, a repeated step): it hides the failure instead of fixing it.

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
