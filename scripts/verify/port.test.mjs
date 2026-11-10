// VERIFY_PORT selection and per-port launch records (#146).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_PORT,
  ROOT,
  readRecord,
  recordPath,
  removeRecord,
  updateRecord,
  verifyPort,
  viteLogPath,
  writeJson,
} from './lib.mjs';

const script = (name) => join(ROOT, 'scripts/verify', name);

test('the default port stays 5180 when VERIFY_PORT is unset or empty', () => {
  assert.equal(DEFAULT_PORT, 5180);
  assert.equal(verifyPort({}), 5180);
  assert.equal(verifyPort({ VERIFY_PORT: '' }), 5180);
});

test('a valid VERIFY_PORT selects that port', () => {
  assert.equal(verifyPort({ VERIFY_PORT: '5185' }), 5185);
  assert.equal(verifyPort({ VERIFY_PORT: '1024' }), 1024);
  assert.equal(verifyPort({ VERIFY_PORT: '65535' }), 65535);
});

test('invalid VERIFY_PORT values throw a clear error', () => {
  for (const value of [
    'abc',
    '80',
    '70000',
    '1023',
    '65536',
    '5185.5',
    ' 5185',
    '-5185',
    '0x1451',
  ]) {
    assert.throws(
      () => verifyPort({ VERIFY_PORT: value }),
      (err) =>
        err instanceof Error &&
        err.message.includes('VERIFY_PORT must be an integer from 1024 to 65535') &&
        err.message.includes(JSON.stringify(value)),
      value,
    );
  }
});

test('every script rejects an invalid VERIFY_PORT before doing anything', () => {
  for (const name of ['launch.mjs', 'doctor.mjs', 'cleanup.mjs', 'e2e.mjs']) {
    const run = spawnSync(process.execPath, [script(name)], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, VERIFY_PORT: '80' },
    });
    assert.equal(run.status, 1, name);
    assert.match(
      run.stderr,
      /^verify:\w+: VERIFY_PORT must be an integer from 1024 to 65535 \(got "80"\)/,
      name,
    );
  }
});

test('each port has its own record and Vite log file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-verify-port-'));
  try {
    assert.equal(basename(recordPath(5180, dir)), '.verify-run-5180.json');
    assert.equal(basename(recordPath(5185, dir)), '.verify-run-5185.json');
    assert.equal(basename(viteLogPath(5185, dir)), '.verify-run-5185.log');
    updateRecord(5180, { client: { pid: 1, port: 5180 } }, dir);
    updateRecord(5185, { server: { reused: true } }, dir);
    updateRecord(5185, { client: { pid: 2, port: 5185 } }, dir);
    assert.deepEqual(readRecord(5185, dir), {
      server: { reused: true },
      client: { pid: 2, port: 5185 },
    });
    assert.deepEqual(readRecord(5180, dir), { client: { pid: 1, port: 5180 } });
    removeRecord(5185, dir);
    assert.deepEqual(readRecord(5185, dir), {});
    assert.ok(existsSync(recordPath(5180, dir)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanup reads and removes only its own port record', () => {
  // Ports no launch uses; the records name no process, so cleanup has nothing to stop.
  const [mine, other] = [65101, 65102];
  try {
    writeJson(recordPath(mine), { client: { pid: null, port: mine } });
    writeJson(recordPath(other), { client: { pid: null, port: other } });
    const run = spawnSync(process.execPath, [script('cleanup.mjs')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, VERIFY_PORT: String(mine) },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, new RegExp(`no client recorded for port ${mine}`));
    assert.match(run.stderr, new RegExp(`\\.verify-run-${mine}\\.json`));
    assert.ok(!existsSync(recordPath(mine)), 'own record removed');
    assert.ok(existsSync(recordPath(other)), "other port's record kept");
  } finally {
    removeRecord(mine);
    removeRecord(other);
  }
});
