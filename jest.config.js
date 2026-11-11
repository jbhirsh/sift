module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [
    '@testing-library/react-native/matchers',
    '<rootDir>/__tests__/helpers/clock.setup.ts',
  ],
  // performance.now() follows Date.now() (helpers/clock.setup.ts), which fake
  // timers do move.
  fakeTimers: { doNotFake: ['performance'] },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|@sentry/.*|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-worklets|@react-native-async-storage/async-storage)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // Anchor the worktree exclusion to this config's rootDir: the main checkout
  // must not pick up test copies inside .claude/worktrees/, but a jest run
  // started from within a worktree (whose rootDir is the worktree itself)
  // still needs to find that worktree's own tests.
  // .stryker-tmp is anchored for the same reason: a leftover Stryker sandbox
  // must not be scanned from the main checkout (it doubles every suite and
  // duplicates manual mocks), but Stryker's own in-sandbox jest runs — whose
  // rootDir is the sandbox — must not have their paths filtered.
  testPathIgnorePatterns: [
    '/node_modules/',
    '__tests__/helpers/',
    '<rootDir>/\\.claude/worktrees/',
    '<rootDir>/\\.stryker-tmp/',
  ],
  modulePathIgnorePatterns: ['<rootDir>/\\.stryker-tmp/'],
  // Every source file Jest can load, whether a test imports it or not: one
  // no test reaches counts as 0% and fails the per-file gate below, rather
  // than going unmeasured.
  collectCoverageFrom: [
    'index.ts',
    'src/**/*.{ts,tsx}',
    // The TypeScript side of the native module (the Swift is the bridge
    // check's job).
    'modules/expo-musickit/src/**/*.ts',
    // The scripts: each is one file, its command line included, that Node
    // runs as it is and the tests import.
    'scripts/*.ts',
    // Only types: nothing in them runs.
    '!src/types/**',
    '!src/services/MusicProviderInterface.ts',
    '!modules/expo-musickit/src/ExpoMusicKit.types.ts',
  ],
  // Per-file coverage enforcement (mirrors BoardGames' vite.config.ts
  // `coverage.thresholds.perFile: true, lines: 80`). A glob key applies the
  // threshold to EACH matched file individually rather than to the aggregate,
  // so a weak file can no longer hide behind well-covered ones the way it
  // could under the previous `global` block. `collectCoverageFrom` above
  // decides which files are measured, and every measured file is a .ts or
  // .tsx that this glob matches.
  coverageThreshold: {
    '**/*.{ts,tsx}': {
      lines: 80,
    },
  },
};
