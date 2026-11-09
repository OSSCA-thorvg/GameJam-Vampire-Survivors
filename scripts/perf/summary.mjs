// Pure helpers that turn `[stress] result` records (JSONL, one Copy-results `StressSummary` per line, optionally with
// the harness fields `browserKind`, `browserVersion`, `run`, `loadBefore` and `machine`) into the results table of
// docs/reference/performance.md (#119). Used by measure.mjs and the summarize.mjs CLI.

/** Parses JSONL text into records, skipping blank lines. Throws with the line number on invalid JSON. */
export function readRecords(text) {
  const records = [];
  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`line ${String(index + 1)}: ${error.message}`, { cause: error });
    }
  });
  return records;
}

/** `"<browserKind> <browserVersion>"` when the harness recorded both, else derived from the user agent. */
export function browserOf(record) {
  if (record.browserKind && record.browserVersion)
    return `${record.browserKind} ${record.browserVersion}`;
  const ua = record.ua ?? '';
  const edge = /Edg\/([\d.]+)/.exec(ua);
  if (edge) return `edge ${edge[1]}`;
  const chrome = /Chrome\/([\d.]+)/.exec(ua);
  if (chrome) return `chrome ${chrome[1]}`;
  const firefox = /Firefox\/([\d.]+)/.exec(ua);
  if (firefox) return `firefox ${firefox[1]}`;
  const safari = /Version\/([\d.]+).*Safari\//.exec(ua);
  if (safari) return `safari ${safari[1]}`;
  return 'unknown';
}

/** The lower median: `sorted[Math.floor((n - 1) / 2)]`; `NaN` for no values. */
export function median(values) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

const COLUMNS = [
  'Browser',
  'Scenario',
  'Runs',
  'Frame median ms',
  'Frame p95 ms (runs)',
  'Max frame ms',
  'Sim ms/step (mean)',
  'Transform ms (mean)',
  'update() ms (mean)',
  'render() ms (mean)',
  'Max counts',
  'Load avg',
];

const fixed = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : '—');

/** One row's cells from the records of one browser and scenario. */
function row(browser, scenario, group, anyLoad) {
  const p95s = group.map((r) => r.p95Ms);
  const counts = {};
  for (const r of group)
    for (const [name, value] of Object.entries(r.maxCounts ?? {}))
      counts[name] = Math.max(counts[name] ?? 0, value);
  const loads = group.map((r) => r.loadBefore).filter((v) => typeof v === 'number');
  return [
    browser,
    `\`${scenario}\``,
    String(group.length),
    fixed(median(group.map((r) => r.medianMs)), 2),
    `${fixed(median(p95s), 2)} (${p95s.map((v) => fixed(v, 1)).join(' / ')})`,
    fixed(Math.max(...group.map((r) => r.maxMs)), 1),
    fixed(median(group.map((r) => r.meanMs?.sim)), 3),
    fixed(median(group.map((r) => r.meanMs?.transform)), 3),
    fixed(median(group.map((r) => r.meanMs?.update)), 3),
    fixed(median(group.map((r) => r.meanMs?.render)), 3),
    Object.entries(counts)
      .map(([name, value]) => `${name} ${String(value)}`)
      .join(', '),
    anyLoad ? fixed(median(loads), 1) : '—',
  ];
}

/**
 * The markdown table (the columns of the 2026-11-09 table in docs/reference/performance.md), one row per browser and
 * scenario in first-seen order, then one line per browser with the `gpu` values seen.
 */
export function formatRows(records) {
  const groups = new Map();
  const gpus = new Map();
  for (const record of records) {
    const browser = browserOf(record);
    const key = `${browser}\u0000${record.scenario}`;
    if (!groups.has(key)) groups.set(key, { browser, scenario: record.scenario, records: [] });
    groups.get(key).records.push(record);
    if (!gpus.has(browser)) gpus.set(browser, new Set());
    if (record.gpu) gpus.get(browser).add(record.gpu);
  }
  const anyLoad = records.some((r) => typeof r.loadBefore === 'number');
  const lines = [
    `| ${COLUMNS.join(' | ')} |`,
    `| ${COLUMNS.map(() => '---').join(' | ')} |`,
    ...[...groups.values()].map(
      ({ browser, scenario, records: group }) =>
        `| ${row(browser, scenario, group, anyLoad).join(' | ')} |`,
    ),
    '',
    ...[...gpus].map(([browser, set]) => `${browser} gpu: ${[...set].join('; ') || 'unknown'}`),
  ];
  return lines.join('\n');
}
