// The EXPO_PUBLIC_ variables the app reads, which Expo inlines into the
// bundle at build time (.env.example says what each is for).
// expo-modules-core types every other process.env key as `any`; naming
// these keeps a typo or a misuse from type-checking.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SENTRY_DSN?: string;
    EXPO_PUBLIC_USE_MOCK_PROVIDER?: string;
    EXPO_PUBLIC_UNDO_WINDOW_MS?: string;
    EXPO_PUBLIC_MOCK_FAIL_REMOVES?: string;
    EXPO_PUBLIC_MOCK_FAIL_ADDS?: string;
  }
}
