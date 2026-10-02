import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'ios/', 'android/', '.expo/', '*.config.js', '.dependency-cruiser.cjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      '@eslint-community/eslint-comments': eslintComments,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Enforce CLAUDE.md's "never suppress lint errors": ban every inline
      // eslint control comment (eslint-disable, disable-next-line,
      // eslint-enable, …) so suppressions can't hide in the code. The
      // sanctioned escape hatch is a file-scoped override in this config —
      // that's configuration, not a comment, so it's unaffected. TypeScript
      // directive comments (ts-ignore / ts-nocheck) are separately blocked by
      // @typescript-eslint/ban-ts-comment via tseslint's strict config.
      '@eslint-community/eslint-comments/no-use': 'error',
    },
  },
  {
    // CLAUDE.md: icons come from expo-symbols (SF Symbols) with
    // @expo/vector-icons as the fallback; don't add other icon packages.
    // Rejects any package import whose name mentions "icon", plus the common
    // icon libraries whose names don't. Local files (./, ../) are exempt, so
    // an IconButton component or the app icon asset stays importable.
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '*icon*',
                'lucide-react-native',
                '@fortawesome/*',
                'phosphor-react-native',
                'react-native-feather',
                '!@expo/vector-icons',
                '!@expo/vector-icons/**',
                '!./**',
                '!../**',
              ],
              caseSensitive: false,
              message:
                'Use expo-symbols (SymbolView), or @expo/vector-icons as the fallback; CLAUDE.md rules out other icon packages.',
            },
          ],
        },
      ],
    },
  },
  {
    // RNTL 14 made render, renderHook, rerender, unmount, fireEvent.* and act
    // async, and a missed `await` leaves a test that passes without checking
    // anything (CLAUDE.md). no-floating-promises catches every un-awaited
    // promise, those included, so it needs type information for the tests.
    files: ['__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // `require()` for lazy/conditional native-module loading. These files pull
    // in the iOS-only MusicKit native module (and the AppleMusicProvider that
    // wraps it) at call time, inside try/catch, so the app falls back to the
    // mock provider in Expo Go / on non-iOS platforms where the module isn't
    // linked. A static ESM import would be hoisted and eager, breaking that
    // fallback — so the require is deliberate, not a lint workaround. Scoped to
    // exactly the three files that need it; the same rule is already relaxed
    // for tests below.
    files: [
      'src/hooks/useResolvedArtwork.ts',
      'src/services/index.ts',
      'src/services/AppleMusicProvider.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Jest manual mocks are CommonJS modules evaluated in the Jest runtime.
    files: ['__mocks__/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        jest: 'readonly',
        module: 'writable',
        require: 'readonly',
      },
    },
  },
);
