This is Sift, a React Native app (Expo SDK 57, RN 0.86, React 19,
TypeScript strict, iOS only) for swiping through a music library (Apple
Music via the `expo-musickit` native module in `modules/`).

### Focus

- Logic errors and edge cases, especially in the reducer, the sorting
  utilities and the providers' paging and error paths.

### Architecture

- All app state lives in the single `SiftContext` reducer (`SiftState` /
  `SiftAction`). Flag a new external state library or app state held
  outside it.
- Screens are switched by `state.phase` in `PhaseRouter` (`App.tsx`). Flag
  React Navigation or another router.
- Music services implement `MusicProviderInterface`. Flag provider-specific
  calls made from screens or components instead of through the interface,
  and interface changes that `MockMusicProvider` doesn't follow.
- Design values come from `src/theme/index.ts` (`SPACING`, `RADIUS`,
  `COLORS` via `useTheme()`, `SHADOWS`, `FONTS`, `GLASS`, `GRADIENTS`). Flag
  hard-coded spacing, radii, colours or font settings in components and
  screens.
- Reuse components from `src/components/` rather than duplicating one.

### Tests

- Every new user-facing flow needs a Maestro flow in `.maestro/`. Flag a new
  screen, phase or user flow without one.
- A new screen needs its "VoiceOver scan" test (`__tests__/helpers/a11yScan.ts`),
  which is what checks its touchables' roles and names. Flag a new screen
  without one.
- E2E flows wait for elements (`extendedWaitUntil`) rather than asserting
  straight after an animated transition. Flag a retry or a fixed sleep
  added to paper over a flaky flow.

### Where the data lives

The app keeps state on the device that outlives an app update: the saved
session (`SessionStore`: the compact record `sift_session_v2` and its
track-list slots, plus the older `sift_session` blob), the removal history
(`RemovalHistoryStore`), the reviewed ledger (`ReviewedLedgerStore`),
preferences (`PreferencesStore`) and the other `sift_*` keys under
`src/services/`. A changed key or stored shape (a renamed or removed field
on `SiftSession` or a stored record) must still load the old shape or
migrate it; otherwise a user who updates mid-session loses it or crashes on
load. A new saved session shape needs a new frozen fixture in
`__tests__/fixtures/sessions`.
