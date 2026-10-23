import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-config-prettier/flat';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'ios/',
      'android/',
      '.expo/',
      '*.config.js',
      '.dependency-cruiser.cjs',
      // Generated: test and mutation reports, a leftover Stryker sandbox, builds.
      'coverage/',
      'reports/',
      '.stryker-tmp/',
      'build/',
      'dist/',
      // Other checkouts of this repo (agent worktrees): jest.config.js skips
      // them too, and their own tsconfig would confuse the type-aware rules.
      '.claude/',
    ],
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
    // Colors come from the theme (src/theme/index.ts), never literals: a
    // hard-coded rgba caption was near-invisible in dark mode (#136). Applied
    // to files already free of color literals, so the whole-tree lint in the
    // pre-commit hook stays green; add each file here as it is cleaned.
    files: ['src/screens/SiftScreen.tsx', 'src/screens/SettingsScreen.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^(#[0-9a-fA-F]{3,8}|rgba?\\()/]',
          message: 'Use a theme color (useTheme().colors or COLORS), not a color literal.',
        },
        {
          selector: 'TemplateElement[value.raw=/(#[0-9a-fA-F]{3,8}|rgba?\\()/]',
          message: 'Use a theme color (useTheme().colors or COLORS), not a color literal.',
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
  {
    // JSDoc must be right where it exists, not exist everywhere: a @param
    // naming an argument the function no longer takes, an unknown tag or a
    // type that TypeScript already states is an error, while code with no
    // JSDoc (most of it, documented by plain comments) is fine. So the
    // TypeScript set's checks stay and every rule demanding a comment, a
    // tag or a description is off.
    ...jsdoc.configs['flat/recommended-typescript-error'],
    files: ['**/*.{ts,tsx,js,mjs}'],
  },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-property': 'off',
      'jsdoc/require-property-description': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-yields': 'off',
      'jsdoc/require-next-type': 'off',
      'jsdoc/require-yields-type': 'off',
      'jsdoc/require-throws-type': 'off',
    },
  },
  // Last: turns off every rule that would fight Prettier's formatting
  // (.prettierrc.json), which `npm run format:check` enforces instead.
  prettier,
);
