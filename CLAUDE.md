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
make format          # Prettier: rewrite the tree (CI only checks it)
make typecheck       # TypeScript type checking
npm run typecov      # type coverage: fails on any expression typed `any`
make check           # what CI's unit job runs: lint, format check, typecheck,
                     # type coverage, depcruise, the native bridge check,
                     # tests with coverage
```

`make check` is `npm run check`; `make lint` is `npm run lint` plus
`npm run bridge`. Lint covers the whole repo (`eslint .`), as CI does.

Git hooks (installed by the `prepare` script via `core.hooksPath`) run these
automatically: **pre-commit** runs lint, Prettier on the staged files,
typecheck, depcruise and the native bridge check; **pre-push** runs the unit-test suite under coverage (not
for a push of only the `screenshots` branch: pictures, no code). Both
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
- **No `any` anywhere** in the app code (src, the native module's TypeScript,
  `scripts/*.ts`: `tsconfig.typecov.json`; tests aren't counted, their mocks
  are `any` by nature). `npm run typecov` (`type-coverage` at 100%, in CI and
  `make check`) fails on, and lists, any expression typed `any`, including the
  ones TypeScript infers silently: a `JSON.parse` or `response.json()` result,
  a `require()`, an array narrowed by `Array.isArray`, a `process.env` key
  `src/types/env.d.ts` doesn't name. Type it where it enters (`const x:
  unknown = JSON.parse(...)`, then narrow); no ignore comments, and no
  `ignoreFiles` except generated code. `npm run typecov:strict` also counts
  `as` casts and non-null assertions; CI shows that figure, as information.
- **ESLint**: flat config in `eslint.config.mjs`. Fix all violations before committing.
  `eslint-plugin-jsdoc` holds JSDoc to the code where JSDoc exists: a `@param`
  naming an argument the function doesn't take, an unknown tag, or a type
  TypeScript already states fails lint. Nothing requires JSDoc; plain comments
  stay the norm.
- **Prettier** formats the code (TypeScript, JavaScript, JSON; `.prettierrc.json`):
  `make format` writes it, CI's Format step and the pre-commit hook check it.
  `eslint-config-prettier`, last in the ESLint config, turns off the style rules
  that would fight it. Markdown, YAML, `app.json`/`eas.json` (the native
  fingerprint) and the frozen session fixtures keep their own formatting
  (`.prettierignore`). The one-time reformat belongs in
  `.git-blame-ignore-revs` by its SHA on main, listed once it has merged (a
  rebase merge gives every commit a new SHA). GitHub's blame skips what that
  file lists; for local blame, `git config blame.ignoreRevsFile
  .git-blame-ignore-revs`.
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
                        DecisionsSheet, BottomSheet: the sliding sheet
                        and its header those three sheets share,
                        ErrorBoundary, TouchOverlay:
                        a PR GIF's drawn touches, ResetGate: holds
                        an E2E launch until its reset has run,
                        SwitchRow: a row that is one switch; use it,
                        not a bare Switch, whose toggle a busy main
                        thread can lose)
    screens/            SetupScreen, LoadingScreen, SiftScreen,
                        DoneScreen, SettingsScreen
    context/            SiftContext (useReducer state management),
                        MusicProviderContext (the one shared provider + poller),
                        resumeSession (a saved session's defaults)
    services/           MusicProviderInterface, AppleMusicProvider, MockMusicProvider,
                        SessionStore, RemovalHistoryStore, PreferencesStore,
                        ReviewedLedgerStore, SiftedImport, playlistLoads
                        (one load of a playlist at a time), haptics,
                        trace (E2E trace),
                        ChorusFinder + LrclibClient ("Start at chorus"),
                        touchOverlay (whether a GIF's touches are drawn),
                        DeletedInMusic (Setup's once-a-launch note, #183),
                        e2eReset (an E2E flow's fresh start, SiftResetState)
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
  (setup, loading, sifting, done). No React Navigation — phase-driven switching.
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
  every saved shape: add one when the shape changes, never edit them. User settings (`startAtChorus`, and
  Setup's last sort and Plays/Added choices, #175) are preferences, not
  session state: `PreferencesStore` persists them (`updatePreferences`
  saves one field over the rest, one update at a time) and they load at
  launch (`APPLY_PREFERENCES`, only while Setup shows no sift).
  `RESUME_SESSION` never touches the stored ones: a resumed session brings
  its own sort without saving it (Setup shows that sort until the next
  launch or a new pick), and a sift in hand or loading when they arrive
  keeps its own.
- **Reviewed ledger**: a Keep leaves the song in place and writes nothing to
  Apple Music, for a library or a playlist sift alike: `ReviewedLedgerStore`
  records kept ids per source (`utils/reviewedLedger` `ledgerKey`, one entry
  per playlist id) and later sifts of that source leave them out. Setup's
  "Include songs I've already sifted" switch, shown when the selected source
  has kept songs, passes `skipFiltering` (for Start Sifting and Start Over)
  to bring them back; removed songs stay out either way (see "Remove
  collects"). Skipped songs aren't recorded. A sent keep changed in the
  decisions list leaves the ledger (`unmarkReviewed`). A song restored on
  Done counts as kept, so it's recorded as one too.
- **Saving kept songs** (playlist sifts, Done only): Done's "Save kept songs
  as a playlist" (`save-kept-playlist`, `useMusicProvider.saveKeptPlaylist`)
  copies every song the ledger remembers for that playlist, from every sift
  of it, that is still in it (the rest are counted as left out) into
  "<name> - Sifted". It finds that playlist with the provider's lookup,
  which trusts one made this launch before the library lists it
  (`findPlaylists`), preferring one an earlier save made (a launch-wide
  map); when there is none it makes it empty first, so its id is known
  before any add can fail. Then only the songs not in it yet are added
  (matched by song, as Apple re-identifies tracks in playlists), 10 at a
  time through the serial write queue; every batch is tried. Songs with
  nothing to add (`AddShortfallError.unresolved`) are counted, not retried
  forever; songs the add refused (`failed`) make the save fail, with
  Retry. A batch that times out may still be adding while later ones go:
  before reading anything a save waits for earlier writes to finish
  (`writesSettled`), so nothing still landing is added again; after 15 s
  it says Music is still finishing. One save runs
  at a time, launch-wide. Done shows Saving… (Continue sifting and the
  decisions list wait), then what was saved, or the error with the button
  turned into Retry. Nothing fills "- Sifted" on a Keep any more, and
  Setup's picker hides "- Sifted" playlists (outputs, not sources). Keeps
  from the builds that filled it come over once: the first time a playlist
  is picked or loaded, the songs of it found (by song) in its
  "<name> - Sifted" go to the ledger, and `sift_sifted_imported` records
  that it was looked at (`services/SiftedImport`; a failed look is tried
  again next time). It also looks in the "- Sifted" playlist an old saved
  session named (its `siftedPlaylistId`, kept in `sift_sifted_ids`), if
  that is still in the library, so a renamed playlist's keeps still come
  over (#179). The playlist's own songs come from a load shared with a
  sift's load of it under way (`services/playlistLoads`), so Start
  Sifting during the look fetches it once. A session saved by those builds (with
  `pendingKeeps`/`siftedPlaylistId`) still loads: its sent keeps and the
  ones that never reached "- Sifted" go to the ledger (not a keep still
  held for Undo) and both fields are dropped (`SessionStore`).
- **Undo** (#152): the latest decision is held in `state.pending` (persisted
  with the session) and reaches the music service only after a 5 s undo
  window, on the next decision, or when the Sift screen goes away or the app
  goes to the background (`hooks/usePendingDecision`). `UNDO_LAST` takes it
  back while it's held. Nothing calls `removeTrack`/`keepTrack` for a
  decision directly: send through `useSendPending`, which sends each once.
  (Done's Restore is not a decision: once the song is restored it records
  it with `keepTrack`.)
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
  reviewed ledger), then the new one is sent through
  the screen's `useSendPending`. If taking it back fails, nothing changes.
- **Remove collects; it never deletes or edits the user's playlists.**
  MusicKit can't delete library songs and edits only playlists the app
  created, so every Apple Music Remove, from a library or a playlist sift,
  adds the song to "Sift — Removed" (`AppleMusicProvider.removeFromLibrary`)
  for the user to delete from their library in Music; Done's "Finish in
  Music" card says how (on a Mac, select all; on iPhone, one at a time),
  with Open Music, whenever a removal reached it (#173); Share List shows
  whenever anything was removed.
  Removed songs are left out of every later sift (`collectedRemovalIds`, a
  playlist record carries `collected: true`); Restore takes the song back
  out (`restoreRemoved`) and forgets every record of it. Once a launch,
  Setup says how many collected songs the user has since deleted from
  their library in Music (#183, `services/DeletedInMusic`, silent without
  library access): a library song gone from "Sift — Removed" and not found
  in the library (`deletedFromLibrary`; one only taken out of the
  playlist is still in the library). Once a Setup has shown it, those
  songs are recorded as reported (`sift_deleted_in_music_reported`), so
  it's said once; their removal records stay, as a lapsed subscription or
  library sync hides catalog songs until it's back, and they must still
  be left out of sifts then. The E2E mock counts every song an earlier
  launch collected as deleted when launched with `SiftDeletedInMusic`
  (flow 27). Start Over clears
  a playlist's other records but never un-removes. Sift edits only
  playlists it created ("- Sifted", "Sift — Removed"): MusicKit's edit
  throws on any other, so a "Sift — Removed" the user made is skipped.
- **Library writes run one at a time.** `AppleMusicProvider` queues every
  write (`utils/serialQueue`): a native playlist removal reads the playlist
  and writes it back, so two at once would undo each other. A write that
  doesn't settle within `WRITE_STALL_MS` (30 s) lets the next one start and
  rejects for its caller with a `QueueStallError` (it may still land), so
  nothing waits on it forever; `settled()` resolves once every queued write
  has really finished, but gives up on one 2 minutes after it started, so
  a write that never settles can't block saving for the rest of the launch.
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
  Prettier, typecheck, type coverage, dependency-cruiser, Jest with coverage and a production
  dependency audit on Ubuntu on every PR. The audit gates at critical, not
  high: Expo's build tooling carries high advisories only Expo can fix.
  The Maestro iOS E2E job (macOS) also runs on every PR that can affect the
  app or the job, with `workflow_dispatch` available for manual runs. It
  skips PRs that only touch docs or repo tooling (other workflows, the
  commit check, `scripts/` apart from its runners (`run-e2e.sh`,
  `run-a11y-audit.sh`, `take-screenshots.sh`, `take-gifs.sh`,
  `build-simulator-app.sh`),
  `stryker.config.json`;
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
  its own file, CI changes still get reviewed. It reads every changed file's
  diff on its own, tests included (big output is cut to a preview it must
  open in full; only lockfiles, generated files and images may be skimmed
  or skipped) and
  posts one summary comment per PR, updated on each push, saying what it
  read; only its inline comments are merge blockers. Its tool calls are
  then checked (`scripts/review-coverage.mjs`, rules in
  `scripts/reviewCoverage.ts`): a changed file it never read goes back to
  a second pass, and one still unread after that fails the check. The auto-fix workflow lives
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
  resolved, or a bot PR merges past a failing or unreported gate. Bot PRs get
  no Actions secrets, so no `EXPO_TOKEN`: the simulator app
  (`scripts/build-simulator-app.sh`, used by `ios-build.yml` and the E2E
  job) then builds with `expo prebuild` + `xcodebuild` and no Expo or Apple
  login, so "Build iOS simulator app" really compiles on them too (#178).
  Run `ios-build.yml` by hand with `without_expo_login` to check that path.
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
  bump), edits `eas.json`, the `package.json` scripts or the native parts of
  `app.json` (such as the app icon or launch screen: all part of the
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
- **The weekly audit** (`weekly-audit.yml`, the same Monday slot, or by hand)
  runs what needs the whole repository at once: knip (`knip.jsonc`: unused
  files, exports and dependencies), jscpd (`.jscpd.json`: duplicated blocks),
  lychee (every markdown link, local file, image and `#anchor`; `.lycheeignore`
  for a link that only refuses scripts) and dependency-cruiser's whole graph
  as an `architecture-graph` artifact (its rules already gate every PR). Each
  finding category keeps one issue labelled `weekly-audit` ("Dead code",
  "Duplicated code", "Broken links"), updated weekly and closed by the first
  clean sweep (`scripts/weekly-audit.mjs`, rules in `scripts/weeklyAudit.ts`).
  Findings never fail the run, a broken tool does. Run `npx knip` or
  `npx jscpd` locally to see the same; when knip is wrong about something
  (a file only a native build or a script reaches), say so in `knip.jsonc`.
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
  fail every flow), and the flows during which the Simulator lost a tap:
  XCTest taps through a virtual touchscreen it adds per tap, and backboardd
  rarely drops the touch-up and cancels the held touch when XCTest removes
  it (`LOST_TOUCH_RE`, matched in the failed flow's own
  `device-simulator.log`, never guessed from the failure). Any other
  assertion failure, and any app crash (lost touch or not), is never
  retried. Each re-run is flagged
  with a `::warning::` annotation, and if a re-run also hits a driver error
  the runner stops. Don't switch to one
  invocation per flow: restarting the driver per flow caused lost taps
  right after launch. A flow starts fresh by launching with the
  `SiftResetState` argument (quoted `"true"`), not `clearState`: on iOS
  Maestro's `clearState` reinstalls the app, which took 7-30 s per launch on
  CI, and once the app took 52 s to show Setup after it. The E2E build clears
  everything it saves before anything reads it (`services/e2eReset`,
  `components/ResetGate`, which shows `reset-failed` if it can't); a later
  launch without the argument keeps the data, for flows that test what
  survives a relaunch. Caches (images, network) aren't cleared, so later
  flows load artwork faster; no assertion depends on them. A flow starts a sift through
  `.maestro/shared/start_sifting.yaml` (`runFlow`), which fails at the tap
  if Setup doesn't go away; only a tap meant to stay on Setup (an error, a
  "Discard?" alert) taps `setup-start-sifting` itself. `shared/` holds subflows, not flows (Maestro
  runs only the top level of `.maestro/`).
- **A flaky E2E flow is a bug: diagnose it and fix it at the root, never
  re-run CI to get past it.** Read the run's `maestro-results` artifact
  first: the app's trace (`trace.txt`: every touch with where it landed
  and how late JavaScript saw it, every screen and sheet (when it started
  rendering, when React committed it and when it was up), every app
  action, each decision-guard check and any JavaScript stall;
  `services/trace`, written only by the E2E build), Maestro's log, each
  command's result and the view hierarchy at the failure (`suite-debug/`),
  the system log for the app (`app-log.txt`), the screenshots. A touch followed by no action,
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
  - Screenshot: `xcrun simctl io booted screenshot after.png`. Without a
    Mac, use the E2E job's: it photographs Setup, the sort sheet, Sift,
    the decisions list, Settings and Done in light and dark
    (`e2e/screenshots/screens.yaml`, `scripts/take-screenshots.sh`) and
    uploads them as the `ios-screenshots` artifact. Not a web export: it
    can't draw SF Symbols, so every icon comes out an empty box.
  - GIF: the real app on the Simulator, with each touch drawn (a ring
    where a finger presses, a fading trail where it drags:
    `components/TouchOverlay`, only in the E2E build and only when
    launched with `SiftShowTouches`, quoted `"true"`). A scenario is a
    Maestro flow, `e2e/gifs/<name>.yaml`: it launches the app with that
    argument, gets to where the GIF starts, then `startRecording: <name>`,
    the taps and swipes (with pauses to follow them by), `stopRecording`
    and `takeScreenshot: <name>-end`, which says every step ran. Add or
    edit one for the motion a PR changes. The E2E job runs them all in one
    Maestro session (`scripts/take-gifs.sh`, artifact `ios-gif-videos`);
    one that stops early is set aside, never made into a GIF. A drag a
    gesture handler owns (the card swipe, the seek bar) feeds the trail
    from its own pan (`followTouch`), since React Native's touch is
    cancelled once the pan takes over. Then
    `node scripts/pr-gifs.mjs <pr>` (rules in `scripts/prGifs.ts`) does the
    rest:
    1. It waits for the PR's run.
    2. It runs CI by hand on `main` with `gifs_only` and the PR's
       scenarios, for the "before".
    3. It makes the GIFs: the waits between touches cut (Maestro spends
       seconds finding each element; the touches are found by the drawn
       ring's colour, and each keeps a lead-in and its result), idle ends
       trimmed, still frames dropped at real timing, scaled sharp.
    4. It commits them to the `screenshots` branch and prints the Before |
       After table to paste.
    `--side-by-side` adds one labelled GIF per pair; `--no-before` is for
    a screen `main` doesn't have. On a Mac by hand:
    `xcrun simctl io booted recordVideo --codec=h264 swipe.mov`.
  - Host them by dragging them into the PR description, or commit them to
    a folder named for the topic on the `screenshots` branch (one branch
    for every PR's pictures, each set a commit on it; no workflow runs on
    it). Link them by that commit's SHA,
    `raw.githubusercontent.com/jbhirsh/sift/<sha>/<topic>/...`, so a later
    push can't change what an old PR shows. Don't start a new branch per
    topic.
- **The README's screenshots refresh themselves.** When a PR merges,
  `readme-screenshots.yml` takes the light Setup, Sift and Done shots its CI
  run's E2E job took (the `ios-screenshots` artifact; the status bar is
  pinned to 9:41, as in the GIFs), shrinks them to the README's 780 px, and replaces each
  `docs/screenshots/` image where more than 0.5% of pixels differ
  (`scripts/readme-screenshots.mjs`, rules in `scripts/readmeScreenshots.ts`;
  ImageMagick). The changes go in one PR from `bot/readme-screenshots`,
  opened or updated, with auto-merge on (squash), its pictures linked by
  commit; a merge that changes no screen still brings an open one up to
  date with main, which the rule requires. That workflow-owned branch is the one exception to "no new
  branches". It opens the PR with the `BOT_PR_TOKEN` secret (a fine-grained
  token on this repo with Contents and Pull requests read/write); without
  it, the Actions token opens it but GitHub runs no workflow on it, so the
  required checks never report. A docs-only PR's run has no E2E screenshots,
  so nothing refreshes; Settings (a hand-picked crop) isn't refreshed.

---

## App Identity
- **Bundle ID**: `com.jessicahirsh.sift`
- **Display name**: Sift
- **Icon**: a stack of song cards, the front one with Remove and Keep.
  `ios.icon` in `app.json` takes `assets/icon.png` (light: on Setup's
  dark purple), `icon-dark.png` (no background: iOS adds its own) and
  `icon-tinted.png` (grayscale on black: iOS tints it); the launch screen
  shows `splash-icon.png` (the light icon as a rounded tile) on Setup's
  light or dark purple. Each PNG is its same-named SVG in
  `assets/icon-source/` rendered at 1024x1024 (e.g. headless Chromium, with
  a transparent background for the dark icon and the tile). Changing one of
  the PNGs is a native change: it ships in a new build, not an EAS Update.
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

- Use `expo-symbols` (`SymbolView`) for SF Symbols on iOS; every icon in the
  app is one. Their names are typed by `sf-symbols-typescript` (`SFSymbol`).
- `@expo/vector-icons` is the one sanctioned fallback, should an icon ever
  need to work beyond SF Symbols. It isn't installed (nothing used it, so the
  weekly audit's knip flagged it): add it back with `npx expo install
  @expo/vector-icons` when something does.
- Do not install other icon packages (lint rejects importing a package
  whose name mentions "icon", other than `@expo/vector-icons`, and the common
  icon libraries that don't: lucide, Font Awesome, Phosphor, Feather)
