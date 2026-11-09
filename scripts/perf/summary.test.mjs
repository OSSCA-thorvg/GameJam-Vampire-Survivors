import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserOf, formatRows, median, readRecords } from './summary.mjs';

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

const record = (p95Ms, extra = {}) => ({
  scenario: 'projectiles-max',
  medianMs: 16.7,
  p95Ms,
  maxMs: 20,
  meanMs: { sim: 0.2, transform: 0.1, update: 0.1, render: 0.15 },
  maxCounts: { enemies: 300, projectiles: 600 },
  ua: CHROME_UA,
  gpu: 'ANGLE Metal Renderer: Apple M4 Pro',
  ...extra,
});

test('median is the lower median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2);
});

test('browserOf prefers the harness fields and falls back to the user agent', () => {
  assert.equal(browserOf({ ua: CHROME_UA }), 'chrome 156.0.0.0');
  assert.equal(browserOf({ ua: `${CHROME_UA} Edg/156.0.1` }), 'edge 156.0.1');
  assert.equal(
    browserOf({ ua: 'Mozilla/5.0 (Macintosh; rv:157.0) Gecko/20100101 Firefox/157.0' }),
    'firefox 157.0',
  );
  assert.equal(
    browserOf({
      ua: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15',
    }),
    'safari 27.2',
  );
  assert.equal(
    browserOf({ ua: CHROME_UA, browserKind: 'webkit', browserVersion: '27.2' }),
    'webkit 27.2',
  );
});

test('three records of one scenario give one row with the per-run p95 values', () => {
  const text = [record(18.6), record(18.4), record(17.5)].map((r) => JSON.stringify(r)).join('\n');
  const lines = formatRows(readRecords(`${text}\n\n`)).split('\n');
  const rows = lines.filter((line) => line.includes('`projectiles-max`'));
  assert.equal(rows.length, 1);
  assert.match(rows[0], /\| 3 \| 16\.70 \| 18\.40 \(18\.6 \/ 18\.4 \/ 17\.5\) \|/);
  assert.match(rows[0], /enemies 300, projectiles 600 \| — \|$/);
  assert.ok(lines.includes('chrome 156.0.0.0 gpu: ANGLE Metal Renderer: Apple M4 Pro'));
});

test('the load column is the median loadBefore when recorded', () => {
  const out = formatRows([
    record(18, { loadBefore: 3 }),
    record(18, { loadBefore: 2.5 }),
    record(18, { loadBefore: 9 }),
  ]);
  assert.match(out, /\| 3\.0 \|\n/);
});
