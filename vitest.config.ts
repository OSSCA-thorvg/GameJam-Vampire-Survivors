import { configDefaults, defineConfig } from 'vitest/config';

// `vitest run --changed` (`pnpm test:changed`) and `vitest related` (the pre-commit hook) follow the module graph,
// which misses files that tests read through `fs`: `packages/shared/src/assets-catalog.test.ts` reads
// `assets/manifest.json`, `assets/CATALOG.md` and the SVG and Lottie files. A change to any of these, to a package or
// Vitest/Vite config, a tsconfig or the lockfile runs the whole suite instead.
// Vitest matches these globs against absolute paths without picomatch's `dot` option, so `**` never crosses a dot
// segment such as `.claude/worktrees/issue-<N>/`, where issue work happens; Vitest's own defaults
// (`**/package.json/**`, `**/{vitest,vite}.config.*/**`) never match there, and its config default does not match
// `vitest.config.ts` anywhere. The patterns are therefore anchored at this directory.
const root = import.meta.dirname.replace(/[*?[\]{}()!+@]/g, '\\$&');
const rerunTriggers = [
  'assets/**',
  '**/package.json',
  '**/{vitest,vite}.config.*',
  '**/tsconfig*.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
].map((pattern) => `${root}/${pattern}`);

export default defineConfig({
  test: {
    projects: ['packages/*'],
    forceRerunTriggers: [...configDefaults.forceRerunTriggers, ...rerunTriggers],
  },
});
