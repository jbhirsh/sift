module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/react-native/matchers'],
  moduleNameMapper: {
    '@react-native-async-storage/async-storage': '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|@sentry/.*|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-worklets|@react-native-async-storage/async-storage)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // Anchor the worktree exclusion to this config's rootDir: the main checkout
  // must not pick up test copies inside .claude/worktrees/, but a jest run
  // started from within a worktree (whose rootDir is the worktree itself)
  // still needs to find that worktree's own tests.
  testPathIgnorePatterns: ['/node_modules/', '__tests__/helpers/', '<rootDir>/\\.claude/worktrees/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/types/**',
    '!src/**/index.ts',
    '!src/services/MusicProviderInterface.ts',
    '!src/hooks/useKeyboardShortcuts.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
