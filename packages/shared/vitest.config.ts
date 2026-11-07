import { defineConfig } from 'vitest/config';

// Lets `pnpm --filter <package> test` run from the package directory; without it Vitest finds the root
// config, whose `projects: ['packages/*']` only resolves from the repository root.
export default defineConfig({});
