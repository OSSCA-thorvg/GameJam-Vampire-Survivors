import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMeasureArgs } from './measure-args.mjs';

const base = [
  '--browser',
  'webkit',
  '--base',
  'http://localhost:4173/',
  '--out',
  'v/r.jsonl',
  '--runs',
  '3',
];

test('parses every option and the scenario list', () => {
  assert.deepEqual(
    parseMeasureArgs([
      ...base,
      '--max-load',
      '4',
      '--max-wait',
      '120',
      'projectiles-max',
      'gems-flood',
    ]),
    {
      browser: 'webkit',
      base: 'http://localhost:4173',
      out: 'v/r.jsonl',
      runs: 3,
      maxLoad: 4,
      maxWaitS: 120,
      headed: false,
      scenarios: ['projectiles-max', 'gems-flood'],
    },
  );
});

test('leaves the load gate off without --max-load, and runs headless unless --headed', () => {
  assert.equal(parseMeasureArgs([...base, 'enemies-400']).maxLoad, null);
  assert.equal(parseMeasureArgs([...base, 'enemies-400']).headed, false);
  assert.equal(parseMeasureArgs([...base, 'enemies-400']).maxWaitS, 600);
  assert.equal(parseMeasureArgs([...base, '--headed', 'enemies-400']).headed, true);
});

test('throws on an unknown flag, a missing value or an unknown browser', () => {
  assert.throws(
    () => parseMeasureArgs([...base, '--headless', 'enemies-400']),
    /unknown flag '--headless'/,
  );
  assert.throws(
    () => parseMeasureArgs([...base, 'enemies-400', '--max-load']),
    /--max-load needs a value/,
  );
  assert.throws(() => parseMeasureArgs(['--browser', '--base', 'x']), /--browser needs a value/);
  assert.throws(
    () => parseMeasureArgs(['--browser', 'safari', ...base.slice(2), 'enemies-400']),
    /unknown browser 'safari'/,
  );
});

test('throws on bad numbers, a missing required flag or no scenario', () => {
  assert.throws(
    () => parseMeasureArgs([...base.slice(0, 6), '--runs', '0', 'x']),
    /--runs must be a positive integer/,
  );
  assert.throws(
    () => parseMeasureArgs([...base, '--max-load', 'many', 'x']),
    /--max-load must be a positive number/,
  );
  assert.throws(() => parseMeasureArgs(base.slice(2).concat('x')), /--browser is required/);
  assert.throws(() => parseMeasureArgs(base), /no scenario given/);
  assert.throws(
    () => parseMeasureArgs([...base, '--max-wait', '1.5', 'x']),
    /--max-wait must be whole seconds/,
  );
});
