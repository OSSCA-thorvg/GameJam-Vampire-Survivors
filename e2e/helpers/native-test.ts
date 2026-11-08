import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test as base } from '@playwright/test';
import { evidencePath } from '../helpers';

/** A fresh task-owned browser, retaining native tab visibility rather than Playwright's focus override. */
export const test = base.extend({
  context: async ({ playwright, launchOptions }, use, testInfo) => {
    const dir = evidencePath(`native-fixture-${testInfo.testId.replace(/[^a-zA-Z0-9-]/g, '-')}`);
    const server = await playwright.chromium.launchServer({
      ...launchOptions,
      headless: false,
      args: [
        ...(launchOptions.args ?? []),
        '--remote-debugging-address=127.0.0.1',
        '--remote-debugging-port=0',
      ],
    });
    const child = server.process();
    const profile = child.spawnargs
      .find((arg) => arg.startsWith('--user-data-dir='))
      ?.slice('--user-data-dir='.length);
    let browser;
    let context;
    let tracingStarted = false;
    try {
      if (!profile) throw new Error('Owned BrowserServer did not report its generated profile');
      const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
        throw new Error('Owned browser did not report a valid local CDP port');
      const endpoint = `http://127.0.0.1:${port}`;
      writeFileSync(
        join(dir, 'ownership.json'),
        JSON.stringify({ pid: child.pid, profile, endpoint }, null, 2),
      );
      browser = await playwright.chromium.connectOverCDP(endpoint, { noDefaults: true });
      context = browser.contexts()[0];
      if (!context) throw new Error('Owned native browser has no default context');
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracingStarted = true;
      await use(context);
    } finally {
      try {
        if (context && tracingStarted) {
          const failed = testInfo.status !== testInfo.expectedStatus;
          const path = testInfo.outputPath('native-trace.zip');
          await context.tracing.stop(failed ? { path } : {});
          if (failed)
            await testInfo.attach('native trace', { path, contentType: 'application/zip' });
        }
      } finally {
        try {
          await browser?.close();
        } finally {
          await server.close();
          const cleanup = {
            pid: child.pid,
            exited: child.exitCode !== null || child.signalCode !== null,
            profileRemoved: profile !== undefined && !existsSync(profile),
          };
          writeFileSync(join(dir, 'cleanup.json'), JSON.stringify(cleanup, null, 2));
          assert.ok(
            cleanup.exited && cleanup.profileRemoved,
            `Owned browser cleanup failed: ${JSON.stringify(cleanup)}`,
          );
        }
      }
    }
  },
});

// The runner cannot collect browser chunks after this separately connected process closes.
test.use({ trace: 'off' });
