# Sift

A React Native (Expo) app for rapidly culling your music library. Swipe through tracks and decide: **Keep**, **Skip**, or **Remove**. Supports Apple Music and Spotify.

---

## Requirements

- Node.js 22+
- [Expo CLI](https://docs.expo.dev/get-started/set-up-your-environment/): `npm install -g expo-cli`
- iOS: Xcode 26+ (for native builds)

---

## Setup

```bash
npm install
npx expo run:ios       # first build (compiles native modules)
npx expo start         # subsequent launches
```

---

## Running Tests

```bash
make test              # unit tests (Jest)
make lint              # ESLint
make typecheck         # TypeScript type checking
make check             # all three
```

---

## Architecture

```
src/
  App.tsx               Phase router + settings modal
  components/           Reusable UI (GlassCard, InteractiveCard, PlayerControls, …)
  screens/              SetupScreen, LoadingScreen, SiftScreen, DoneScreen, SettingsScreen
  context/              SiftContext (useReducer state management)
  services/             Music provider implementations, SessionStore
  hooks/                Custom hooks (useKeyboardShortcuts, useMusicProvider)
  theme/                Design tokens, ThemeContext
  types/                TypeScript type definitions
  utils/                Helpers (formatTime, sorting, mockData)
modules/
  expo-musickit/        Custom Expo native module for MusicKit
__tests__/              Jest unit + E2E tests
```

---

## CI/CD

CI runs lint, typecheck, and unit tests on every PR. All changes reach main via PR.
