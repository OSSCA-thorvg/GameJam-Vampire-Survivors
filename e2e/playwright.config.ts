// Playwright configuration for verify-game (#31, .claude/skills/verify-game/SKILL.md). Run through `pnpm verify:e2e`,
// which launches the client and sets VERIFY_URL; when VERIFY_URL is unset, the URL recorded by `pnpm verify:launch`
// is used. `VERIFY_JOURNEYS=<dir>` runs the journey specs in that folder instead of e2e/ (feature-map journeys
// saved under verification/issue-<N>/journeys/).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');

function recordedUrl(): string | undefined {
  try {
    const client = JSON.parse(
      readFileSync(join(root, 'verification/.run/client.json'), 'utf8'),
    ) as {
      url?: string;
    };
    return client.url;
  } catch {
    return undefined;
  }
}

const headed = process.env.VERIFY_HEADED === '1';
const evidence = process.env.VERIFY_EVIDENCE_DIR ?? join(root, 'verification/adhoc');

export default defineConfig({
  testDir: process.env.VERIFY_JOURNEYS ? resolve(process.env.VERIFY_JOURNEYS) : import.meta.dirname,
  testMatch: '**/*.spec.ts',
  outputDir: join(evidence, 'playwright-output'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    baseURL: process.env.VERIFY_URL ?? recordedUrl() ?? 'http://localhost:5180/',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        headless: !headed,
        launchOptions: {
          // WebGL 2 without a GPU in headless and CI runs; headed runs use the real GPU.
          args: headed ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
});
