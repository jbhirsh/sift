// The Stryker setup's files, as .github/ci.json lists them for the shared
// mutation tooling (`mutation.wiring`): a PR that changes one runs the smoke
// scope even when it changes no mutable line, so a broken setup still shows.
// Jest's own setup is part of it, so every local file jest.config.js loads,
// and the custom Jest runner Stryker uses, must be listed.

// The app's tsconfig loads no Node types, so type the calls used here.
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const { matchesGlob } = jest.requireActual<{
  matchesGlob: (path: string, glob: string) => boolean;
}>('path');

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function wiring(): string[] {
  const ci: unknown = JSON.parse(readFileSync('.github/ci.json', 'utf8'));
  const mutation: unknown =
    typeof ci === 'object' && ci !== null && 'mutation' in ci ? ci.mutation : undefined;
  const list: unknown =
    typeof mutation === 'object' && mutation !== null && 'wiring' in mutation
      ? mutation.wiring
      : undefined;
  if (!isStrings(list)) throw new Error('.github/ci.json has no mutation.wiring list');
  return list;
}

const listed = (file: string) => wiring().some((glob) => matchesGlob(file, glob));

describe('mutation wiring', () => {
  it('lists every file of the repository jest.config.js loads', () => {
    // jest.config.js is CommonJS; read its setup file lists as text.
    const config = readFileSync('jest.config.js', 'utf8');
    const lists = [...config.matchAll(/setupFiles(?:AfterEnv)?:\s*\[([^\]]*)\]/g)];
    const local = lists.flatMap(([, list]) =>
      [...list.matchAll(/'<rootDir>\/([^']+)'/g)].map(([, file]) => file),
    );
    expect(local.length).toBeGreaterThan(0);
    for (const file of local) expect([file, listed(file)]).toEqual([file, true]);
  });

  it('lists the configs and the Jest runner Stryker uses', () => {
    for (const file of [
      'stryker.config.json',
      'jest.config.js',
      'babel.config.js',
      'package.json',
      'package-lock.json',
      'scripts/stryker-jest-runner.mjs',
      'scripts/strykerTestFiles.ts',
    ]) {
      expect([file, listed(file)]).toEqual([file, true]);
    }
  });

  it('leaves out source, tests and docs, which have their own rules', () => {
    for (const file of [
      'src/utils/sorting.ts',
      '__tests__/unit/sorting.test.ts',
      '__tests__/helpers/renderWithProviders.tsx',
      'README.md',
      'my-stryker.config.json',
    ]) {
      expect([file, listed(file)]).toEqual([file, false]);
    }
  });
});
