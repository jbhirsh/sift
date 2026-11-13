# Contributing

## Setup

Node 24, as CI uses; the scripts need at least 22.18, as Node runs them as TypeScript. Xcode
26.4 or later for a native iOS build (Expo SDK 58 needs it). Expo comes with the project: use
`npx expo`, with no global CLI.

```bash
git clone https://github.com/jbhirsh/sift.git
cd sift
npm install                  # also points core.hooksPath at .githooks/
cp .env.example .env.local   # optional: a Sentry DSN; the app runs without one
npx expo run:ios             # the first build, which compiles the native MusicKit module
npx expo start               # later launches
```

Configuration lives in environment variables ([`.env.example`](.env.example) says what each is
for). Expo inlines `EXPO_PUBLIC_*` values into the bundle at build time; real secrets go in the
gitignored `.env.local`. Without the native module (Expo Go, the E2E build, CI) the app runs on an
in-memory mock library.

## Commands

| Command                                     | What it does                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm start` / `npm run ios`                 | the Expo dev server / a build run on iOS (compiles the native module)                        |
| `make test` / `make test-coverage`          | Jest unit tests / with the per-file 80% coverage gate                                        |
| `make lint`                                 | ESLint over the whole repo, then the native bridge check (`npm run bridge`)                  |
| `make format`                               | Prettier rewrites the tree (CI only checks it)                                               |
| `make typecheck` / `npm run typecov`        | TypeScript 7 / type coverage at 100% (`npm run typecov:strict` also counts `as` casts)       |
| `npm run depcruise`                         | the import layering rules (`.dependency-cruiser.cjs`)                                        |
| `make check`                                | the unit job's lint, format check, typecheck, type coverage, depcruise, bridge check and tests with coverage (not its commit, pins, autofix-trigger, Expo Doctor or audit steps) |
| `make build-e2e`, then `make test-e2e`      | the E2E simulator build, then the Maestro suite on a booted simulator                        |
| `make test-mutation`                        | Stryker over the whole mutation scope (slow; `npx stryker run --mutate <file>` while iterating) |
| `make doctor`                               | Expo Doctor (needs the network; CI runs it as advice)                                        |
| `npx knip` / `npx jscpd`                    | what the weekly audit reports: dead code / duplicated code                                   |
| `npm run pr-gifs -- <PR>`                   | a PR's before/after GIFs, hosted on the `screenshots` branch                                 |

The git hooks run lint, Prettier on the staged files, the type-check, the layering rules and the
native bridge check on commit, and the unit tests under coverage on push (not for a push of only
the `screenshots` branch). Both do nothing when `$CI` is set; CI re-runs everything.

## Tests

| Layer    | What it tests                                   | Where it runs                                                                    |
| -------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Unit     | reducers, services, hooks, utils and components | Jest and React Native Testing Library, on push and in CI; 80% of lines per file  |
| E2E      | whole flows on the iOS Simulator                | Maestro flows in `.maestro/`, on every PR that can affect the app                |
| Mutation | how much the unit tests check                   | Stryker over each PR's changed lines, and a monthly full sweep                   |

CI also runs Xcode's accessibility audit on Setup, Sift, Settings and Done in light and dark, and
compares its screenshots of the main screens with their baselines in `e2e/screenshots/baselines`.

**When a simulator job fails or flakes,** its run summary gives the verdict and what needs
attention (failed or re-run flows, flaky ones, steps and flows slower than usual) and links to its
report: every step and flow beside the job's recent runs, the machine's CPU across the job, and
its notes (the simulator, runner image, Xcode, Maestro, the warm-up). Read it before the logs. The
E2E job's `maestro-results` artifact then holds:

- `trace.txt`, the app's trace (E2E build only): every touch with where it landed and how late
  JavaScript saw it, every screen and sheet (when it started rendering, when React committed it,
  when it was up), every app action, each decision-guard check and any JavaScript stall;
- Maestro's log, each command's result and the view hierarchy at the failure (`suite-debug/`);
- the system log for the app (`app-log.txt`);
- the machine's load: `machine-load.txt` (the busiest processes every 10 s), `machine-memory.txt`,
  `machine-disk.txt`;
- the screenshots.

**Visual regression** fails on a screen that changed, appeared or wasn't taken, with its shot and
diff in the `visual-diffs` artifact. A screen that wasn't taken is a flow that stopped: the
`ios-screenshots` artifact holds Maestro's logs and the app's trace, read as for a failed E2E flow.
For a change that's meant, run `visual-baselines.yml` by hand on the PR's branch once its run has
taken the screenshots; it commits them as the new baselines, then approve the checks its push
starts on the PR.

## Required checks

The `main` branch rule requires these jobs by name, and each reports on every PR:

| Check                         | Workflow           | What it runs                                                                                                       |
| ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `Lint, Typecheck & Unit Test` | `ci.yml`           | commit messages, pins, autofix triggers, lint, Prettier, typecheck, type coverage, layering, the native bridge, Jest with coverage, `npm audit --omit=dev` (critical) |
| `Build iOS simulator app`     | `ci.yml`           | the E2E app: the native code's compile gate when a PR changes native files, and otherwise built when it isn't cached |
| `E2E Tests (Maestro)`         | `ci.yml`           | the Maestro suite on the Simulator                                                                                 |
| `Accessibility audit`         | `ci.yml`           | Xcode's accessibility audit                                                                                        |
| `Mutation Tests (Stryker)`    | `mutation.yml`     | mutation testing of the lines a PR changed                                                                         |
| `Claude Review`               | `claude-review.yml` | jbhirsh/ci's AI review; this repo's guide is `.github/claude-review.md`                                           |
| `PR visuals`                  | `pr-visuals.yml`   | a UI change has pictures in its description                                                                        |
| `Secret scan`, `SAST scan`    | `gitleaks.yml`, `semgrep.yml` | gitleaks and Semgrep, also swept weekly                                                                 |

`Screenshots and GIFs` makes pictures and never gates; `Visual regression` joins the list once it
has proved stable. The CI tooling is shared with fog-and-frontier and BoardGames from
[jbhirsh/ci](https://github.com/jbhirsh/ci), run from its `main`; this repo's settings for each
tool are its key in `.github/ci.json`. Dependabot's npm PRs merge themselves once every required
check is green.

## Deployment

Every merge to `main` runs `preview-deploy.yml`. JavaScript-only changes ship as an EAS Update
that the installed preview build downloads on launch and runs from its next cold launch (swipe
Sift away and reopen it). A change to native code (anything in the native fingerprint) builds a
new preview app instead, on a GitHub macOS runner rather than with EAS's monthly cloud builds,
uploaded to EAS and installed from its link on expo.dev.

Preview builds install only on registered iPhones: register one with `npx eas-cli device:create`
(open its link in Safari on the phone and install the profile), then run Preview deploy from the
Actions tab with "Build a new preview app" ticked, so the new build's ad hoc provisioning profile
includes the phone. The phone also needs Developer Mode on (Settings, Privacy & Security), which
iOS asks for on the first launch.

## One-time setup

- **Actions secrets:** `EXPO_TOKEN` (EAS builds and updates), `SENTRY_AUTH_TOKEN` (source maps),
  `CLAUDE_CODE_OAUTH_TOKEN` (Claude Review and autofix) and `BOT_PR_TOKEN`, a fine-grained token
  for this repository with Contents and Pull requests read and write. The README screenshot bot
  opens its PR with it: a PR the default Actions token opens starts no workflows, so its required
  checks would never report. Bots' PRs get no secrets, so the simulator app builds without an Expo
  or Apple login on them (`scripts/build-simulator-app.sh`).
- **The `main` branch rule:** it requires the checks above, Claude Review included, and resolved
  review threads. A bot PR merges as soon as the rule lets it, so a check missing from the rule
  doesn't gate it.
- **Pages:** Settings, Pages: Deploy from a branch, `job-reports`, `/ (root)`, for each simulator
  job's report.
- **ShazamKit:** Start at chorus falls back to ShazamKit, which needs the ShazamKit App Service on
  the App ID (Apple Developer, Identifiers, `com.jessicahirsh.sift`, App Services). Without it the
  setting still works, from lyrics and the estimate.
- **The shared Claude rules:** sessions read them from jbhirsh/ci; on your own computer, link them
  once as its `CONTRIBUTING.md` says ("The shared Claude rules").
- **Blame:** `git config blame.ignoreRevsFile .git-blame-ignore-revs`, so local blame skips the
  one-time reformat (GitHub's blame already does).

## The app icon

`ios.icon` in `app.json` takes `assets/icon.png` (light: on Setup's dark purple), `icon-dark.png`
(no background: iOS adds its own) and `icon-tinted.png` (grayscale on black: iOS tints it); the
launch screen shows `splash-icon.png` (the light icon as a rounded tile) on Setup's light or dark
purple. Each PNG is its same-named SVG in `assets/icon-source/` rendered at 1024x1024 (with
headless Chromium, say), with a transparent background for the dark icon and the tile. A new PNG
is a native change: it ships in a new build, not an EAS Update.
