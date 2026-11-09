import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../../protocol/worker-messages';
import { applyRun } from './apply';
import { emptyRecords, MAX_TIME_SEC, parseRecords, serializeRecords, type Records } from './format';

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  timeSec: 120.5,
  kills: 50,
  level: 6,
  cleared: false,
  characterId: 'warden',
  weapons: [{ id: 'whip', level: 3, damage: 900 }],
  passives: [],
  ...over,
});

const chain = (runs: RunSummary[]): Records =>
  runs.reduce((r, s, i) => applyRun(r, s, 1000 + i).records, emptyRecords());

describe('applyRun', () => {
  it('marks every non-zero item overall on the first run', () => {
    const { records, breaks } = applyRun(emptyRecords(), run(), 1);
    expect(breaks).toEqual({
      timeSec: 'overall',
      kills: 'overall',
      level: 'overall',
      firstClear: false,
      weapons: ['whip'],
    });
    expect(records.overall).toEqual({ timeSec: 120.5, kills: 50, level: 6, cleared: false });
    expect(records.characters.warden).toEqual(records.overall);
  });

  it('marks no kills break for a run with 0 kills', () => {
    expect(applyRun(emptyRecords(), run({ kills: 0 }), 1).breaks.kills).toBeNull();
  });

  it('marks a longer run with another character overall', () => {
    const prev = chain([run()]);
    const { breaks } = applyRun(prev, run({ characterId: 'ember', timeSec: 200 }), 2);
    expect(breaks.timeSec).toBe('overall');
  });

  it('marks a run that beats only its own character as character', () => {
    const prev = chain([run({ timeSec: 500, kills: 400, level: 20 })]);
    const { breaks } = applyRun(prev, run({ characterId: 'ember', timeSec: 100 }), 2);
    expect(breaks.timeSec).toBe('character');
    expect(breaks.kills).toBe('character');
    expect(breaks.level).toBe('character');
  });

  it('counts equal values as no break', () => {
    const prev = chain([run()]);
    const { breaks } = applyRun(prev, run(), 2);
    expect(breaks).toEqual({
      timeSec: null,
      kills: null,
      level: null,
      firstClear: false,
      weapons: [],
    });
  });

  it('marks firstClear once per character', () => {
    const a = applyRun(emptyRecords(), run({ cleared: true }), 1);
    expect(a.breaks.firstClear).toBe(true);
    const b = applyRun(a.records, run({ cleared: true }), 2);
    expect(b.breaks.firstClear).toBe(false);
    const c = applyRun(b.records, run({ cleared: true, characterId: 'swift' }), 3);
    expect(c.breaks.firstClear).toBe(true);
    // A later non-cleared run keeps the cleared mark.
    expect(applyRun(c.records, run(), 4).records.characters.warden?.cleared).toBe(true);
  });

  it('adds up totals over three runs', () => {
    const r = chain([
      run(),
      run({ cleared: true, kills: 10, timeSec: 900 }),
      run({ kills: 5, timeSec: 10 }),
    ]);
    expect(r.totals).toEqual({ runs: 3, kills: 65, clears: 1, playTimeSec: 1030.5 });
  });

  it('keeps the last 10 runs newest first', () => {
    const r = chain(Array.from({ length: 11 }, (_, i) => run({ kills: i })));
    expect(r.recent).toHaveLength(10);
    expect(r.recent[0]?.kills).toBe(10);
    expect(r.recent[9]?.kills).toBe(1);
    expect(r.recent[0]?.at).toBe(1010);
  });

  it('gives an evolved weapon its own best and lists only weapons that rose', () => {
    const prev = chain([run()]);
    const { records, breaks } = applyRun(
      prev,
      run({
        weapons: [
          { id: 'bloodyTear', level: 1, damage: 5000 },
          { id: 'whip', level: 8, damage: 100 },
        ],
      }),
      2,
    );
    expect(breaks.weapons).toEqual(['bloodyTear']);
    expect(records.weaponBest).toEqual({ whip: 900, bloodyTear: 5000 });
  });

  it('clamps timeSec and skips weapon IDs failing the pattern', () => {
    const { records } = applyRun(
      emptyRecords(),
      run({ timeSec: 1e9, weapons: [{ id: '__proto__', level: 1, damage: 5 }] }),
      1,
    );
    expect(records.overall.timeSec).toBe(MAX_TIME_SEC);
    expect(records.weaponBest).toEqual({});
    expect(parseRecords(serializeRecords(records)).status).toBe('ok');
  });

  it('does not mutate prev', () => {
    const prev = chain([run()]);
    const before = serializeRecords(prev);
    applyRun(prev, run({ timeSec: 999, cleared: true, characterId: 'ember' }), 2);
    expect(serializeRecords(prev)).toBe(before);
  });
});
