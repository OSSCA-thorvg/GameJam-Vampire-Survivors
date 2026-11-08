import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { waitForOwnedCdpEndpoint } from './native-cdp.ts';

const browserPath = '/devtools/browser/01234567-89ab-cdef-0123-456789abcdef';

async function profileFor(t) {
  const profile = await mkdtemp(join(tmpdir(), 'owned-cdp-test-'));
  t.after(() => rm(profile, { recursive: true, force: true }));
  return profile;
}

test('waits through missing, port-only and partial-path writes before accepting a complete endpoint', async (t) => {
  const profile = await profileFor(t);
  const file = join(profile, 'DevToolsActivePort');
  let complete = false;
  const writer = (async () => {
    await delay(20);
    await writeFile(file, '45678\n');
    await delay(20);
    await writeFile(file, '45678\n/devtools/browser/01234567-89ab');
    await delay(20);
    complete = true;
    await writeFile(file, `45678\n${browserPath}`);
  })();
  try {
    const endpoint = await waitForOwnedCdpEndpoint({ profile, isAlive: () => true, pollMs: 5 });
    assert.equal(complete, true);
    assert.equal(endpoint, 'http://127.0.0.1:45678');
  } finally {
    await writer;
  }
});

test('accepts complete files with both port bounds and normalizes only to loopback', async (t) => {
  const profile = await profileFor(t);
  for (const port of [1, 65535]) {
    await writeFile(join(profile, 'DevToolsActivePort'), `${String(port)}\r\n${browserPath}\r\n`);
    assert.equal(
      await waitForOwnedCdpEndpoint({ profile, isAlive: () => true }),
      `http://127.0.0.1:${String(port)}`,
    );
  }
});

test('invalid ports and incomplete, foreign or extra paths time out without fallback', async (t) => {
  const profile = await profileFor(t);
  for (const content of [
    `0\n${browserPath}`,
    `65536\n${browserPath}`,
    `-1\n${browserPath}`,
    `123x\n${browserPath}`,
    '1234\n/devtools/browser/',
    '1234\n/devtools/browser/01234567-89ab',
    '1234\nhttp://example.com/devtools/browser/01234567-89ab-cdef-0123-456789abcdef',
    `1234\n${browserPath}\nother`,
  ]) {
    await writeFile(join(profile, 'DevToolsActivePort'), content);
    await assert.rejects(
      waitForOwnedCdpEndpoint({ profile, isAlive: () => true, timeoutMs: 20, pollMs: 2 }),
      /not ready within 20 ms/,
    );
  }
});

test('missing files have a bounded readiness deadline', async (t) => {
  const profile = await profileFor(t);
  const started = performance.now();
  await assert.rejects(
    waitForOwnedCdpEndpoint({ profile, isAlive: () => true, timeoutMs: 30, pollMs: 2 }),
    /not ready within 30 ms/,
  );
  assert.ok(performance.now() - started < 1000);
});

test('fails promptly when the owned child exits, including before accepting a valid file', async (t) => {
  const profile = await profileFor(t);
  await assert.rejects(
    waitForOwnedCdpEndpoint({ profile, isAlive: () => false }),
    /Owned browser exited/,
  );
  await writeFile(join(profile, 'DevToolsActivePort'), `1234\n${browserPath}`);
  let checks = 0;
  await assert.rejects(
    waitForOwnedCdpEndpoint({ profile, isAlive: () => ++checks === 1 }),
    /Owned browser exited/,
  );
});

test('rejects non-regular port files without opening a directory or symlink', async (t) => {
  const profile = await profileFor(t);
  const file = join(profile, 'DevToolsActivePort');
  await mkdir(file);
  await assert.rejects(waitForOwnedCdpEndpoint({ profile, isAlive: () => true }), /regular file/);
  await rm(file, { recursive: true });
  const target = join(profile, 'another-file');
  await writeFile(target, `1234\n${browserPath}`);
  await symlink(target, file);
  await assert.rejects(waitForOwnedCdpEndpoint({ profile, isAlive: () => true }), /regular file/);
});

test(
  'rejects a FIFO instead of leaving a file read pending beyond the deadline',
  { skip: process.platform === 'win32' },
  async (t) => {
    const profile = await profileFor(t);
    await promisify(execFile)('mkfifo', [join(profile, 'DevToolsActivePort')]);
    const started = performance.now();
    await assert.rejects(
      waitForOwnedCdpEndpoint({ profile, isAlive: () => true, timeoutMs: 100 }),
      /regular file/,
    );
    assert.ok(performance.now() - started < 1000);
  },
);

test('bounds pending regular-file I/O by the same readiness deadline', async (t) => {
  const profile = await profileFor(t);
  await writeFile(join(profile, 'DevToolsActivePort'), Buffer.alloc(16 * 1024 * 1024));
  const started = performance.now();
  await assert.rejects(
    waitForOwnedCdpEndpoint({ profile, isAlive: () => true, timeoutMs: 0.1 }),
    /not ready within 0.1 ms/,
  );
  assert.ok(performance.now() - started < 1000);
});

test('propagates non-transient filesystem failures', async (t) => {
  const profile = await profileFor(t);
  const file = join(profile, 'not-a-directory');
  await writeFile(file, 'not a profile');
  await assert.rejects(waitForOwnedCdpEndpoint({ profile: file, isAlive: () => true }), {
    code: 'ENOTDIR',
  });
});

test(
  'propagates a regular-file permission failure',
  { skip: process.platform === 'win32' || process.getuid?.() === 0 },
  async (t) => {
    const profile = await profileFor(t);
    const file = join(profile, 'DevToolsActivePort');
    await writeFile(file, `1234\n${browserPath}`);
    await chmod(file, 0);
    try {
      await assert.rejects(waitForOwnedCdpEndpoint({ profile, isAlive: () => true }), {
        code: 'EACCES',
      });
    } finally {
      await chmod(file, 0o600);
    }
  },
);

test('supports an immediate forced deadline and rejects invalid timing options', async (t) => {
  const profile = await profileFor(t);
  await assert.rejects(
    waitForOwnedCdpEndpoint({ profile, isAlive: () => true, timeoutMs: 0 }),
    /not ready within 0 ms/,
  );
  for (const options of [{ timeoutMs: -1 }, { timeoutMs: Infinity }, { pollMs: 0 }]) {
    await assert.rejects(
      waitForOwnedCdpEndpoint({ profile, isAlive: () => true, ...options }),
      RangeError,
    );
  }
});
