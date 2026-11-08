import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseE2eArgs } from './e2e-args.mjs';

test('forwards project selection, filters and listing in original order', () => {
  assert.deepEqual(
    parseE2eArgs([
      '--project',
      'hidden-tab',
      '--issue',
      '52',
      'hidden-tab',
      '--list',
      '--with-server',
    ]),
    {
      launch: ['--with-server'],
      playwright: ['--project', 'hidden-tab', 'hidden-tab', '--list'],
      evidence: ['--issue', '52'],
    },
  );
  assert.deepEqual(parseE2eArgs(['--project=chromium']).playwright, ['--project=chromium']);
});

test('empty arguments preserve branch-based evidence and default projects', () => {
  assert.deepEqual(parseE2eArgs([]), { launch: [], playwright: [], evidence: [] });
});

test('rejects invalid harness issue options before any launch', () => {
  for (const args of [['--issue'], ['--issue', '--project'], ['--issue', 'abc'], ['--issue=52']]) {
    assert.throws(() => parseE2eArgs(args), /issue/);
  }
});
