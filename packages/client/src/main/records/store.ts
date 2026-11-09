// The personal records store (#143, ADR 0022). Storage may be unavailable (private mode, disabled storage, a full
// quota), so every access sits inside a `try`; a failure keeps the records in memory and never reaches a run.
import type { RunSummary } from '../../protocol/worker-messages';
import { applyRun, type RecordBreaks } from './apply';
import { emptyRecords, parseRecords, RECORDS_KEY, serializeRecords, type Records } from './format';

export interface RecordsStore {
  read(): Records;
  /** Applies one single-player run and saves it; returns what it broke. */
  record(summary: RunSummary, at: number): RecordBreaks;
  /** Removes `vs.records` only and returns to empty records. */
  reset(): void;
  /** False once a write failed this session (private mode, full quota); the records then live in memory. */
  readonly persisted: boolean;
}

export const WARN_UNAVAILABLE =
  '[records] storage is unavailable; records stay in memory this session';
export const WARN_INVALID =
  '[records] stored records were unreadable (unknown version, corrupt data); starting empty';
export const WARN_SAVE_FAILED =
  '[records] failed to save records; they stay in memory this session';

/**
 * A store backed by `storage()` (read lazily, on the first call to any method). Warns at most once per cause per
 * session; never throws.
 */
export function createRecordsStore(
  storage: () => Storage = () => localStorage,
  warn: (message: string) => void = console.warn,
): RecordsStore {
  let records: Records | null = null;
  let persisted = true;
  const warned = new Set<string>();
  const warnOnce = (message: string): void => {
    if (warned.has(message)) return;
    warned.add(message);
    warn(message);
  };
  const load = (): Records => {
    if (records) return records;
    let raw: string | null = null;
    try {
      raw = storage().getItem(RECORDS_KEY);
    } catch {
      warnOnce(WARN_UNAVAILABLE);
    }
    const parsed = parseRecords(raw);
    // An invalid value stays stored until the next save overwrites it.
    if (parsed.status === 'invalid') warnOnce(WARN_INVALID);
    records = parsed.records;
    return records;
  };
  return {
    read: load,
    record(summary, at) {
      const { records: next, breaks } = applyRun(load(), summary, at);
      records = next;
      try {
        storage().setItem(RECORDS_KEY, serializeRecords(next));
      } catch {
        persisted = false;
        warnOnce(WARN_SAVE_FAILED);
      }
      return breaks;
    },
    reset() {
      load();
      records = emptyRecords();
      try {
        storage().removeItem(RECORDS_KEY);
      } catch {
        warnOnce(WARN_UNAVAILABLE);
      }
    },
    get persisted() {
      return persisted;
    },
  };
}

/** The same store without storage: `createApp`'s default, so tests and debug scenes need no storage. */
export function createMemoryRecords(): RecordsStore {
  let records = emptyRecords();
  return {
    read: () => records,
    record(summary, at) {
      const { records: next, breaks } = applyRun(records, summary, at);
      records = next;
      return breaks;
    },
    reset() {
      records = emptyRecords();
    },
    get persisted() {
      return false;
    },
  };
}
