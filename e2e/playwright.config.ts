// Playwright configuration for verify-game (#31, .claude/skills/verify-game/SKILL.md). Run through `pnpm verify:e2e`,
// which launches the client and sets VERIFY_URL; when VERIFY_URL is unset, the URL recorded by `pnpm verify:launch`
// is used. `VERIFY_JOURNEYS=<dir>` runs the journey specs in that folder instead of e2e/ (feature-map journeys
// saved under verification/issue-<N>/journeys/). The native hidden-tab project owns a fresh headed browser;
// Linux runs need Xvfb. Select chromium for ordinary headless-only smoke. VERIFY_AUDIO_ENGINES=1 adds the headless
// audio-firefox and audio-webkit projects, which run only e2e/audio-decode.spec.ts (#128). #149: `mobile-chromium` (a
// Pixel 7 in landscape, headless, also in CI) runs e2e/touch.spec.ts with touch input; `mobile-webkit` (an iPhone 14 in
// landscape, headless) needs WebKit (`pnpm exec playwright install webkit`), which CI does not install, so it is opt-in
// with VERIFY_MOBILE_WEBKIT=1.
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
/** ADR 0021: decode the audio in Firefox's and WebKit's engines too; CI installs only Chromium, so these are opt-in. */
const audioEngines = process.env.VERIFY_AUDIO_ENGINES === '1';
/** #149: the touch journeys in WebKit's engine (iOS Safari); opt-in for the same reason as the audio engines. */
const mobileWebkit = process.env.VERIFY_MOBILE_WEBKIT === '1';
/** WebGL 2 without a GPU in headless and CI runs; headed runs use the real GPU. */
const swiftshader = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
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
      testIgnore: '**/hidden-tab.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        headless: !headed,
        launchOptions: { args: headed ? [] : swiftshader },
      },
    },
    {
      name: 'mobile-chromium',
      testMatch: '**/touch.spec.ts',
      use: {
        ...devices['Pixel 7 landscape'],
        headless: true,
        launchOptions: { args: swiftshader },
      },
    },
    ...(mobileWebkit
      ? [
          {
            name: 'mobile-webkit',
            testMatch: '**/touch.spec.ts',
            use: { ...devices['iPhone 14 landscape'], headless: true },
          },
        ]
      : []),
    {
      name: 'hidden-tab',
      testMatch: '**/hidden-tab.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: {
          ignoreDefaultArgs: [
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ],
          args: process.env.CI ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
        },
      },
    },
    ...(audioEngines
      ? [
          {
            name: 'audio-firefox',
            testMatch: '**/audio-decode.spec.ts',
            use: { ...devices['Desktop Firefox'], headless: true },
          },
          {
            name: 'audio-webkit',
            testMatch: '**/audio-decode.spec.ts',
            use: { ...devices['Desktop Safari'], headless: true },
          },
        ]
      : []),
  ],
});
