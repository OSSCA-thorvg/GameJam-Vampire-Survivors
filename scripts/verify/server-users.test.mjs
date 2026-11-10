// Shared verify server ownership (#161): fake records and users lists in a temporary folder, no Docker.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  COMPOSE_PROJECT,
  ROOT,
  addServerUser,
  ownsServer,
  readRecord,
  readServerUsers,
  recordPath,
  releaseServer,
  serverUsersPath,
  sharedVerificationDir,
  updateRecord,
  writeServerUsers,
} from './lib.mjs';

const OWNER = { reused: false, owner: true, project: COMPOSE_PROJECT };
const SHARED = { reused: true, owner: false, project: COMPOSE_PROJECT };
const EXTERNAL = { reused: true, owner: false, url: 'http://localhost:8787/healthz' };

/** A temp folder holding the users list and the fake per-port records. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'vs-verify-users-'));
  const users = serverUsersPath(dir);
  const recordFor = (port) => recordPath(port, dir);
  /** What launch writes: the record, and for a sharing launch its users entry. */
  const launch = (port, server) => {
    updateRecord(port, { server, client: { pid: null, port } }, dir);
    if (server === SHARED) addServerUser(port, recordFor(port), users);
  };
  /** What cleanup does: release the server, then delete the record. */
  const cleanup = (port) => {
    const result = releaseServer(port, readRecord(port, dir).server, users, recordFor);
    rmSync(recordFor(port), { force: true });
    return result;
  };
  return { dir, users, recordFor, launch, cleanup, done: () => rmSync(dir, { recursive: true }) };
}

test('the owner alone stops the server on cleanup', () => {
  const t = setup();
  try {
    t.launch(5187, OWNER);
    assert.deepEqual(t.cleanup(5187), { action: 'down', to: null });
    assert.deepEqual(readServerUsers(t.users).ports, []);
  } finally {
    t.done();
  }
});

test('cleaning up the owner keeps the server for the other user, and the last cleanup stops it', () => {
  const t = setup();
  try {
    t.launch(5187, OWNER);
    t.launch(5188, SHARED);
    assert.deepEqual(readServerUsers(t.users).ports, [5188]);
    assert.deepEqual(t.cleanup(5187), { action: 'handOver', to: 5188 });
    assert.equal(readRecord(5188, t.dir).server.owner, true, 'ownership passed to 5188');
    assert.ok(ownsServer(readRecord(5188, t.dir).server));
    assert.deepEqual(readServerUsers(t.users).ports, []);
    assert.deepEqual(t.cleanup(5188), { action: 'down', to: null });
  } finally {
    t.done();
  }
});

test('ownership passes to the lowest remaining port, and only the owner ever stops the server', () => {
  const t = setup();
  try {
    t.launch(5190, OWNER);
    t.launch(5189, SHARED);
    t.launch(5186, SHARED);
    t.launch(5188, SHARED);
    assert.deepEqual(readServerUsers(t.users).ports, [5186, 5188, 5189]);
    // A non-owner leaving never stops it, whoever is left.
    assert.deepEqual(t.cleanup(5189), { action: 'keep', to: null });
    assert.deepEqual(t.cleanup(5190), { action: 'handOver', to: 5186 });
    assert.equal(readRecord(5188, t.dir).server.owner, false);
    assert.deepEqual(readServerUsers(t.users).ports, [5188]);
    assert.deepEqual(t.cleanup(5186), { action: 'handOver', to: 5188 });
    assert.deepEqual(t.cleanup(5188), { action: 'down', to: null });
  } finally {
    t.done();
  }
});

test('a sharing launch that is the last to leave never stops a server nobody owns', () => {
  const t = setup();
  try {
    // vs-verify started outside verify:launch (or its owner record is gone): every launch shares it.
    t.launch(5187, SHARED);
    t.launch(5188, SHARED);
    assert.deepEqual(t.cleanup(5187), { action: 'keep', to: null });
    assert.deepEqual(t.cleanup(5188), { action: 'keep', to: null });
    assert.deepEqual(readServerUsers(t.users).ports, []);
  } finally {
    t.done();
  }
});

test('a server not started by verify:launch is never stopped and never listed', () => {
  const t = setup();
  try {
    t.launch(5187, EXTERNAL);
    assert.equal(ownsServer(EXTERNAL), false);
    assert.deepEqual(t.cleanup(5187), { action: 'keep', to: null });
    assert.ok(!existsSync(t.users), 'no users list written');
    assert.deepEqual(releaseServer(5187, undefined, t.users, t.recordFor), {
      action: 'keep',
      to: null,
    });
    // Even a record claiming ownership of another project is not an owner of vs-verify.
    assert.equal(ownsServer({ owner: true, project: 'issue-150' }), false);
  } finally {
    t.done();
  }
});

test('a listed port without a vs-verify record is skipped when ownership passes', () => {
  const t = setup();
  try {
    t.launch(5190, OWNER);
    t.launch(5188, SHARED);
    t.launch(5186, SHARED);
    rmSync(t.recordFor(5186)); // that run's record was deleted by hand
    assert.deepEqual(t.cleanup(5190), { action: 'handOver', to: 5188 });
    assert.deepEqual(readServerUsers(t.users).ports, []);
  } finally {
    t.done();
  }
});

test('ownership follows the stored record path, so a user in another worktree can inherit it', () => {
  const t = setup();
  const other = mkdtempSync(join(tmpdir(), 'vs-verify-other-'));
  try {
    t.launch(5187, OWNER);
    updateRecord(5188, { server: SHARED }, other);
    addServerUser(5188, recordPath(5188, other), t.users);
    assert.deepEqual(t.cleanup(5187), { action: 'handOver', to: 5188 });
    assert.equal(readRecord(5188, other).server.owner, true);
  } finally {
    t.done();
    rmSync(other, { recursive: true });
  }
});

test('records from before #161 still own the server they started', () => {
  assert.equal(ownsServer({ reused: false, project: COMPOSE_PROJECT }), true);
  assert.equal(ownsServer({ reused: true, url: 'http://localhost:8787/healthz' }), false);
});

test('the users list is written whole through a rename and ignores junk', () => {
  const t = setup();
  try {
    writeServerUsers({ ports: [5188, 5187], records: {} }, t.users);
    assert.deepEqual(readdirSync(t.dir), ['.verify-server-users.json'], 'no temp file left');
    assert.deepEqual(readServerUsers(t.users).ports, [5187, 5188]);
    writeServerUsers({ ports: [5187, 'x', 5187, 1.5] }, t.users);
    assert.deepEqual(readServerUsers(t.users), { ports: [5187], records: {} });
    assert.deepEqual(readServerUsers(join(t.dir, 'missing.json')), { ports: [], records: {} });
  } finally {
    t.done();
  }
});

test('the users list lives in the main checkout, shared by every worktree', () => {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(sharedVerificationDir(), join(dirname(common), 'verification'));
});
