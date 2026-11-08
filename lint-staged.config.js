// @ts-check
// The pre-commit hook (`pnpm exec lint-staged`, ADR 0002). It formats and lints the staged files, then runs only the
// Vitest tests related to them; CI and `pnpm check` keep running the full suite.
import path from 'node:path';

const root = import.meta.dirname;
/** @param {string} file */
const isAsset = (file) => path.relative(root, file).split(path.sep)[0] === 'assets';
/** @param {string} file */
const isFormatted = (file) => /\.(json|md|css|html|ya?ml)$/.test(file);
/** @param {readonly string[]} files */
const quoted = (files) => files.map((file) => JSON.stringify(file)).join(' ');

/** @type {import('lint-staged').Configuration} */
export default {
  // lint-staged appends the staged paths to string commands, so `vitest related` gets exactly the staged files.
  '*.{ts,js,mjs}': [
    'prettier --write',
    'eslint --fix --max-warnings=0',
    'vitest related --run --passWithNoTests',
  ],
  // Staged files under assets/ are formatted by the assets task below, so that Prettier never rewrites a file while
  // the catalog tests read it (lint-staged runs the tasks of different globs concurrently).
  '*.{json,md,css,html,yml,yaml}': (files) => {
    const others = files.filter((file) => !isAsset(file));
    return others.length > 0 ? [`prettier --write ${quoted(others)}`] : [];
  },
  // `assets-catalog.test.ts` reads the manifest, the catalog and the art through `fs`, outside the module graph, so a
  // staged asset runs the whole @vs/shared project. A function task gets no paths appended: as a string command, the
  // paths would become Vitest name filters and match no test.
  'assets/**': (files) => {
    const formatted = files.filter(isFormatted);
    return [
      ...(formatted.length > 0 ? [`prettier --write ${quoted(formatted)}`] : []),
      'vitest run --project @vs/shared',
    ];
  },
};
