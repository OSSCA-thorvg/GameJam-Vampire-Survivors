// Prints the performance.md results table for a JSONL file of `[stress] result` records (#119):
//   node scripts/perf/summarize.mjs <file.jsonl>
import { readFileSync } from 'node:fs';
import { formatRows, readRecords } from './summary.mjs';

const file = process.argv[2];
if (!file || process.argv.length > 3) {
  console.error('usage: node scripts/perf/summarize.mjs <file.jsonl>');
  process.exit(2);
}
process.stdout.write(`${formatRows(readRecords(readFileSync(file, 'utf8')))}\n`);
