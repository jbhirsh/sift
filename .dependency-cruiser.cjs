/**
 * Architecture rules (dependency-cruiser). CLAUDE.md describes sift's layering
 * as prose — "utils are pure logic", "services implement MusicProviderInterface",
 * "all state lives in the SiftContext reducer", "design tokens are centralized
 * in the theme" — and the Claude review re-checks it per PR, but nothing failed
 * a build on a violation. These rules make the layering computational.
 *
 * The layers, leaf → top, as the code actually imports today:
 *
 *   types    → (nothing)                 pure type declarations, the leaf
 *   utils    → types                     pure helpers: formatTime, sorting, …
 *   theme    → types, react/react-native design tokens + ThemeContext
 *   services → types, services           MusicProviderInterface + providers,
 *                                         SessionStore, Spotify API/auth
 *   context  → types, utils, services    the single SiftContext reducer
 *   hooks    → context, services, utils  glue between state and providers
 *   components / screens                  the UI, top of the graph
 *
 * The rules below forbid the edges that would break that shape: no cycles, a
 * pure/leaf bottom (types, utils), and lower layers (services, theme, context)
 * that never reach up into the UI or state above them. Rules that don't hold
 * cleanly against the current code are deliberately omitted rather than
 * invented — better a small true ruleset than a fictional one.
 *
 * CommonJS (.cjs): dependency-cruiser loads its config via require(), and the
 * project is CommonJS by default. eslint.config.mjs ignores this file (it's
 * config, not app source), the same way it ignores *.config.js.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependencies make modules impossible to reason about or test in isolation.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'types-is-leaf',
      severity: 'error',
      comment:
        'src/types holds pure type declarations — the leaf of the graph. It may not depend on any runtime app code.',
      from: { path: '^src/types' },
      to: { path: '^src/', pathNot: '^src/types/' },
    },
    {
      name: 'utils-pure',
      severity: 'error',
      comment:
        'src/utils are pure helpers (CLAUDE.md: "pure logic — no device rendering"). They may reach only other utils and the type layer.',
      from: { path: '^src/utils' },
      to: { path: '^src/', pathNot: '^src/(utils|types)/' },
    },
    {
      name: 'utils-framework-free',
      severity: 'error',
      comment:
        'src/utils must stay free of React and React Native so they remain directly unit-testable as plain functions.',
      from: { path: '^src/utils' },
      to: { path: '^node_modules/react' },
    },
    {
      name: 'theme-below-features',
      severity: 'error',
      comment:
        'The theme is the design-token layer the UI consumes; it must not reach up into feature code (components, screens, hooks, context, services, utils).',
      from: { path: '^src/theme' },
      to: { path: '^src/(components|screens|hooks|context|services|utils)/' },
    },
    {
      name: 'services-below-ui-and-state',
      severity: 'error',
      comment:
        'Music providers sit behind MusicProviderInterface, below the app. A service must not import UI (components/screens), the theme, hooks, or the SiftContext state layer.',
      from: { path: '^src/services' },
      to: { path: '^src/(components|screens|hooks|context|theme)/' },
    },
    {
      name: 'services-not-react',
      severity: 'error',
      comment:
        'Services are plain classes/functions implementing MusicProviderInterface, not React. They may use react-native primitives but must not import react itself.',
      from: { path: '^src/services' },
      to: { path: '^node_modules/react/' },
    },
    {
      name: 'context-below-ui',
      severity: 'error',
      comment:
        'The SiftContext reducer is the state layer under the UI. Components, screens, and hooks consume it — it must never import them back.',
      from: { path: '^src/context' },
      to: { path: '^src/(components|screens|hooks)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
