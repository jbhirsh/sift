# CLAUDE.md

**Sift**: an iOS app (Expo SDK 58, React Native 0.88, React 19, TypeScript) for reviewing a music
library one song at a time: Keep, Skip or Remove, with Apple Music through a hand-written MusicKit
module (`modules/expo-musickit`). The shared rules every repo here follows come from jbhirsh/ci
(`claude-rules/CLAUDE.md`); setup, the commands, the required checks and one-time settings are in
`CONTRIBUTING.md`. Each module's header or JSDoc says what it does and why: read it before
changing the module.

## Commands that aren't obvious

- Type-check with `npm run typecheck` or `make typecheck`, never bare `tsc` or `npx tsc` (below).

## Where names don't tell

- All app state is one reducer, `SiftContext` (`SiftState`/`SiftAction`), with no state library;
  `PhaseRouter` in `src/App.tsx` switches screens on `state.phase` (setup, loading, sifting,
  done), with no React Navigation.
- `createMusicProvider` (`src/services/index.ts`) picks the music service, and
  `MusicProviderHost` (`src/context/MusicProviderContext.tsx`) creates it once per provider change
  and runs the only playback poller, which every `useMusicProvider` shares.

## Traps that cross files

- **TypeScript 7 runs beside the TypeScript 6 API.** TS 7 (the native compiler) has no JavaScript
  API, which typescript-eslint, dependency-cruiser and type-coverage load through
  `require('typescript')`, so `@typescript/native` aliases `typescript@7` and `typescript` aliases
  `@typescript/typescript6`. Both install a `tsc`; `npm run typecheck` runs TS 7 by path. Swap
  the alias back once all three support TS 7 (`.github/dependabot.yml`'s typescript ignore quotes
  their errors).
- **The native module is a thin bridge.** Add a primitive in Swift (one thing asked of MusicKit,
  ShazamKit or the player, returning raw values) and put every decision in TypeScript
  (`utils/musicKit`, `AppleMusicProvider`), where it ships with an EAS Update and is tested. The
  Native bridge check sees the module grow, not whether a function decides something.
- **What the native fingerprint covers ships only in a new build.** Swift, a native package, an
  SDK bump, `eas.json`, the `package.json` scripts and the native parts of `app.json` (the icon
  PNGs and launch screen included) need a reinstall; everything else reaches installed phones as
  an EAS Update (`preview-deploy.yml`).
- **Saved state outlives an app update.** A changed key or stored shape (a field of `SiftSession`
  or of any `sift_*` record under `src/services/`) must still load the old one or migrate it, or a
  user who updates mid-session loses the sift. A new session shape adds a fixture to
  `__tests__/fixtures/sessions`; the existing ones are never edited.
- **A decision reaches the music service only through `useSendPending`**, which sends each one
  once, after Undo's window (`hooks/usePendingDecision`). Nothing calls `removeTrack` or
  `keepTrack` for a decision directly. Done's Restore isn't a decision: once the song is
  restored, it records it with `keepTrack`.
- **Every way to decide asks the decision guard when pressed** (`utils/decisionGuard`): each on
  the Sift screen, and Finish, Undo, Back and the decisions list. A new one does too, with no
  timer and no disabled button.
- **Remove collects; it never deletes or edits the user's playlists.** Every Remove adds the song
  to "Sift — Removed" for the user to delete in Music, and Sift edits only the playlists it made
  ("- Sifted", "Sift — Removed"). A Keep writes nothing to Apple Music (the reviewed ledger,
  `services/ReviewedLedgerStore`). Every library write goes through `AppleMusicProvider`'s serial
  queue: two at once undo each other.
- **Accessibility.** Every touchable needs an `accessibilityRole` and a name (a label or its
  text); a screen's "VoiceOver scan" test (`__tests__/helpers/a11yScan.ts`) fails it otherwise,
  and a new screen gets one. Don't make a container holding Maestro-targeted text `accessible`: it
  hides the text's testID from XCUITest. A row that is one switch is a `SwitchRow`, never a bare
  `Switch`, whose toggle a busy main thread can lose.
- **E2E flows** (`.maestro/`, Maestro on the Simulator):
  - A flow starts fresh by launching with `SiftResetState: "true"` (quoted), never
    `clearState`, which reinstalls the app: 7–30 s per launch on CI, and once 52 s before Setup
    showed. A later launch without it
    keeps the data, for what must survive a relaunch.
  - A flow starts a sift through `runFlow: shared/start_sifting.yaml`, which fails at the tap if
    Setup doesn't go away; only a tap meant to stay on Setup (an error, a "Discard?" alert) taps
    `setup-start-sifting` itself. `.maestro/shared/` holds subflows: Maestro runs only the top
    level.
  - Wait for an element with `extendedWaitUntil`, never assert straight after an animated
    transition, and never add a retry to a flow (a second tap, a repeated step) to cover a flake.
  - To find why a flow failed or flaked, read the job's report and the `maestro-results` artifact
    before the logs (`CONTRIBUTING.md` says what each holds). In `trace.txt`, a touch followed by
    no action, screen or guard line is a tap the app dropped: say where, then fix the flow or the
    app, whichever is wrong.
- **PR pictures never go on the `screenshots` branch**: the PR template says where they come
  from. A GIF comes from pushing a flow in `e2e/gifs/`, which CI records and
  `pr-gif-attach.yml` attaches; don't run PR GIFs by hand except as the fallback.

## Conventions

- **Unit tests live in `__tests__/unit/`** (Jest, React Native Testing Library 14): pure logic and
  rendering in Jest, never on a device. A script is one `scripts/*.ts` file that Node runs as it
  is (`npm run …` silences its warning for a `.ts` module) and the tests import whole: its
  command line runs only under `if (import.meta.main)`.
- **A new user-facing flow gets a Maestro flow** in `.maestro/`.
- **Nothing requires JSDoc**; plain comments stay the norm. Where JSDoc exists, lint holds it to
  the code (`eslint-plugin-jsdoc`).

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

Spacing (`SPACING`, `xs` to `4xl`), corner radius (`RADIUS`), shadows (`SHADOWS`: `subtle`,
`prominent`, `button`), type (`FONTS`: `brand`, `headline`, `body`) and glass materials (`GLASS`:
`thin`, `regular`, `thick`) are there too, each value with a comment saying what it's for.

## Icon System

- Use `expo-symbols` (`SymbolView`) for SF Symbols on iOS; every icon in the app is one. Their
  names are typed by `sf-symbols-typescript` (`SFSymbol`).
- `@expo/vector-icons` is the one sanctioned fallback, should an icon ever need to work beyond SF
  Symbols. It isn't installed (nothing used it, so the weekly audit's knip flagged it): add it back
  with `npx expo install @expo/vector-icons` when something does.
