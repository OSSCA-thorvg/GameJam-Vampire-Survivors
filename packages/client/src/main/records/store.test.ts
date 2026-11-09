import { describe, expect, it, vi } from 'vitest';
import type { RunSummary } from '../../protocol/worker-messages';
import { parseRecords, RECORDS_KEY } from './format';
import {
  createMemoryRecords,
  createRecordsStore,
  WARN_INVALID,
  WARN_SAVE_FAILED,
  WARN_UNAVAILABLE,
} from './store';

const RUN: RunSummary = {
  timeSec: 61,
  kills: 12,
  level: 3,
  cleared: false,
  characterId: 'warden',
  weapons: [{ id: 'whip', level: 2, damage: 400 }],
  passives: [],
};

/** A fake `Storage` over a Map; `fail` makes the named method throw. */
function fakeStorage(
  initial: Record<string, string> = {},
  fail: Partial<Record<'get' | 'set' | 'remove', Error>> = {},
) {
  const map = new Map(Object.entries(initial));
  const clear = vi.fn(() => {
    map.clear();
  });
  const storage = {
    getItem: vi.fn((k: string) => {
      if (fail.get) throw fail.get;
      return map.get(k) ?? null;
    }),
    setItem: vi.fn((k: string, v: string) => {
      if (fail.set) throw fail.set;
      map.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      if (fail.remove) throw fail.remove;
      map.delete(k);
    }),
    clear,
    key: () => null,
    length: 0,
  } as unknown as Storage;
  return { storage, map, clear };
}

describe('createRecordsStore', () => {
  it('saves a run that a second store reads back', () => {
    const { storage } = fakeStorage();
    const warn = vi.fn();
    const a = createRecordsStore(() => storage, warn);
    const breaks = a.record(RUN, 1234);
    expect(breaks.timeSec).toBe('overall');
    expect(a.persisted).toBe(true);
    const b = createRecordsStore(() => storage, warn);
    expect(b.read().totals.runs).toBe(1);
    expect(b.read().recent[0]).toEqual({
      at: 1234,
      characterId: 'warden',
      timeSec: 61,
      kills: 12,
      level: 3,
      cleared: false,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once on a corrupt value, keeps it until the next run overwrites it with v1', () => {
    const { storage, map } = fakeStorage({ [RECORDS_KEY]: '{"v":99}' });
    const warn = vi.fn();
    const store = createRecordsStore(() => storage, warn);
    expect(store.read().totals.runs).toBe(0);
    store.read();
    store.read();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(WARN_INVALID);
    expect(map.get(RECORDS_KEY)).toBe('{"v":99}');
    store.record(RUN, 1);
    const saved = parseRecords(map.get(RECORDS_KEY) ?? null);
    expect(saved.status).toBe('ok');
    expect(saved.records.v).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('survives a getItem that throws', () => {
    const { storage } = fakeStorage({}, { get: new DOMException('denied', 'SecurityError') });
    const warn = vi.fn();
    const store = createRecordsStore(() => storage, warn);
    expect(store.record(RUN, 1).timeSec).toBe('overall');
    expect(store.read().totals.runs).toBe(1);
    store.read();
    expect(warn.mock.calls).toEqual([[WARN_UNAVAILABLE]]);
    expect(store.persisted).toBe(true);
  });

  it('survives a setItem that throws QuotaExceededError', () => {
    const { storage } = fakeStorage({}, { set: new DOMException('full', 'QuotaExceededError') });
    const warn = vi.fn();
    const store = createRecordsStore(() => storage, warn);
    expect(() => store.record(RUN, 1)).not.toThrow();
    const breaks = store.record({ ...RUN, timeSec: 90 }, 2);
    expect(breaks.timeSec).toBe('overall');
    expect(store.read().totals.runs).toBe(2);
    expect(store.persisted).toBe(false);
    expect(warn.mock.calls).toEqual([[WARN_SAVE_FAILED]]);
  });

  it('survives a storage getter that throws', () => {
    const warn = vi.fn();
    const store = createRecordsStore(() => {
      throw new DOMException('no storage', 'SecurityError');
    }, warn);
    expect(store.record(RUN, 1).kills).toBe('overall');
    expect(store.read().totals.runs).toBe(1);
    store.record(RUN, 2);
    expect(() => {
      store.reset();
    }).not.toThrow();
    expect(store.persisted).toBe(false);
    expect(warn.mock.calls).toEqual([[WARN_UNAVAILABLE], [WARN_SAVE_FAILED]]);
    expect(store.read().totals.runs).toBe(0);
  });

  it('reset removes vs.records only', () => {
    const { storage, map, clear } = fakeStorage({ 'vs.audio': '{"v":1}', 'vs.nickname': 'Ann' });
    const store = createRecordsStore(() => storage, vi.fn());
    store.record(RUN, 1);
    expect(map.has(RECORDS_KEY)).toBe(true);
    store.reset();
    expect(map.has(RECORDS_KEY)).toBe(false);
    expect(map.get('vs.audio')).toBe('{"v":1}');
    expect(map.get('vs.nickname')).toBe('Ann');
    expect(clear).not.toHaveBeenCalled();
    expect(store.read().totals.runs).toBe(0);
  });
});

describe('createMemoryRecords', () => {
  it('records and resets in memory', () => {
    const store = createMemoryRecords();
    store.record(RUN, 1);
    expect(store.read().totals.runs).toBe(1);
    store.reset();
    expect(store.read().totals.runs).toBe(0);
  });
});
