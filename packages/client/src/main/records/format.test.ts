import { describe, expect, it } from 'vitest';
import {
  emptyRecords,
  formatDuration,
  parseRecords,
  RECENT_MAX,
  serializeRecords,
  STORED_MAX,
  type Records,
} from './format';

const FULL: Records = {
  v: 1,
  overall: { timeSec: 912.5, kills: 1500, level: 40, cleared: true },
  characters: {
    warden: { timeSec: 300.25, kills: 200, level: 12, cleared: false },
    swift: { timeSec: 912.5, kills: 1500, level: 40, cleared: true },
  },
  totals: { runs: 3, kills: 1800, clears: 1, playTimeSec: 1400.75 },
  recent: [
    {
      at: 1_762_700_000_000,
      characterId: 'swift',
      timeSec: 912.5,
      kills: 1500,
      level: 40,
      cleared: true,
    },
    {
      at: 1_762_600_000_000,
      characterId: 'warden',
      timeSec: 300.25,
      kills: 200,
      level: 12,
      cleared: false,
    },
  ],
  weaponBest: { knife: 50_000.5, thousandEdge: 120_000, whip: 3000 },
};

const raw = (r: unknown): string => JSON.stringify(r);
const mutate = (fn: (r: Record<string, unknown>) => void): string => {
  const copy = JSON.parse(serializeRecords(FULL)) as Record<string, unknown>;
  fn(copy);
  return raw(copy);
};
const invalid = (s: string): void => {
  const out = parseRecords(s);
  expect(out.status).toBe('invalid');
  expect(out.records).toEqual(emptyRecords());
};

describe('parseRecords', () => {
  it('round-trips a full value', () => {
    expect(parseRecords(serializeRecords(FULL))).toEqual({ records: FULL, status: 'ok' });
  });

  it('serializes keys in the order of the types', () => {
    expect(Object.keys(JSON.parse(serializeRecords(FULL)) as object)).toEqual([
      'v',
      'overall',
      'characters',
      'totals',
      'recent',
      'weaponBest',
    ]);
  });

  it('reads null as empty', () => {
    expect(parseRecords(null)).toEqual({ records: emptyRecords(), status: 'empty' });
  });

  it('round-trips empty records', () => {
    expect(parseRecords(serializeRecords(emptyRecords())).status).toBe('ok');
  });

  it('keeps unknown but well-formed IDs', () => {
    const s = mutate((r) => {
      (r.weaponBest as Record<string, number>).futureWeapon = 7;
      (r.characters as Record<string, unknown>).oldHero = FULL.overall;
    });
    const out = parseRecords(s);
    expect(out.status).toBe('ok');
    expect(out.records.weaponBest.futureWeapon).toBe(7);
    expect(Object.hasOwn(out.records.characters, 'oldHero')).toBe(true);
  });

  it.each([
    ['invalid JSON', '{"v":1,'],
    ['an array', '[]'],
    ['a string', '"records"'],
    ['null JSON', 'null'],
    ['v: 2', mutate((r) => (r.v = 2))],
    ['v: 0', mutate((r) => (r.v = 0))],
    ['a missing field', mutate((r) => delete r.totals)],
    ['an extra top-level key', mutate((r) => (r.extra = 1))],
    ['an extra key in overall', mutate((r) => ((r.overall as Record<string, unknown>).gold = 1))],
    ['kills: 1.5', mutate((r) => ((r.overall as Record<string, unknown>).kills = 1.5))],
    ['timeSec: -1', mutate((r) => ((r.overall as Record<string, unknown>).timeSec = -1))],
    [
      'timeSec over the range',
      mutate((r) => ((r.overall as Record<string, unknown>).timeSec = 86_401)),
    ],
    ['a string number', mutate((r) => ((r.overall as Record<string, unknown>).level = '3'))],
    ['cleared not a boolean', mutate((r) => ((r.overall as Record<string, unknown>).cleared = 1))],
    ['clears > runs', mutate((r) => ((r.totals as Record<string, unknown>).clears = 4))],
    ['a non-integer run count', mutate((r) => ((r.totals as Record<string, unknown>).runs = 2.5))],
    [
      'a bad character key',
      mutate((r) => ((r.characters as Record<string, unknown>)['<b>'] = FULL.overall)),
    ],
    [
      'a bad recent characterId',
      mutate((r) => {
        (r.recent as Record<string, unknown>[]).forEach((x) => (x.characterId = 'X y'));
      }),
    ],
    [
      'a non-integer at',
      mutate((r) => {
        (r.recent as Record<string, unknown>[]).forEach((x) => (x.at = 1.5));
      }),
    ],
    ['a negative damage', mutate((r) => ((r.weaponBest as Record<string, number>).knife = -1))],
    ['recent not an array', mutate((r) => (r.recent = {}))],
  ])('rejects %s', (_name, s) => {
    invalid(s);
  });

  it('rejects Infinity written as 1e999', () => {
    invalid(serializeRecords(FULL).replace('"timeSec":912.5', '"timeSec":1e999'));
  });

  it('rejects __proto__ as a weapon key', () => {
    invalid(serializeRecords(FULL).replace('"knife":', '"__proto__":'));
  });

  it('rejects more than RECENT_MAX recent runs', () => {
    const run = FULL.recent[0];
    invalid(mutate((r) => (r.recent = Array.from({ length: RECENT_MAX + 1 }, () => run))));
  });

  it('rejects more than 64 keys in a map', () => {
    invalid(
      mutate((r) => {
        r.weaponBest = Object.fromEntries(
          Array.from({ length: 65 }, (_, i) => [`w${String(i)}`, 1]),
        );
      }),
    );
  });

  it('rejects an oversized string', () => {
    invalid(' '.repeat(STORED_MAX + 1));
  });
});

describe('formatDuration', () => {
  it('writes H:MM:SS with unpadded hours', () => {
    expect(formatDuration(0)).toBe('0:00:00');
    expect(formatDuration(59.9)).toBe('0:00:59');
    expect(formatDuration(3_725)).toBe('1:02:05');
    expect(formatDuration(36_000 * 3)).toBe('30:00:00');
    expect(formatDuration(Number.NaN)).toBe('0:00:00');
  });
});
