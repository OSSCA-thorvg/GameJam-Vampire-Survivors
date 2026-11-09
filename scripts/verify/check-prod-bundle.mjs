// Production bundle guard (#31): fails when a dev-only tool leaks into packages/client/dist. Run by the client's
// `build` script after `vite build`, so `pnpm build` and `pnpm check` fail on a leak.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST = join(ROOT, 'packages/client/dist');
/**
 * Dev-only tool names, then #22's stress scenario names (`STRESS_SCENARIO_NAMES` in
 * packages/client/src/worker/debug/stress.ts; `stress.test.ts` checks every name is listed here). The perf overlay
 * itself ships in production behind `?perf`, so its labels are not listed.
 */
const STRESS_SCENARIO_NAMES = [
  'enemies-400',
  'enemies-800',
  'enemies-1200',
  'projectiles-max',
  'projectiles-1800',
  'projectiles-frozen',
  'gems-flood',
  'lottie-enemy',
  'lottie-enemy-shared',
];
const FORBIDDEN = [
  '__vsTest',
  '__vsDebug',
  'testSnapshot',
  'togglePerfOverlay',
  // #119: the scenario progress message, filtered out before the main thread's switch inside the dev/perf guard.
  'stressProgress',
  ...STRESS_SCENARIO_NAMES,
];
/** Only text files can contain the names; thorvg.wasm and images are skipped. */
const TEXT = /\.(js|mjs|cjs|html|css|map|json|txt|svg)$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files;
try {
  files = walk(DIST).filter((f) => TEXT.test(f));
} catch {
  console.error(`check-prod-bundle: ${relative(ROOT, DIST)} does not exist; run vite build first`);
  process.exit(1);
}

let leaks = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const name of FORBIDDEN) {
    if (text.includes(name)) {
      console.error(
        `check-prod-bundle: ${relative(ROOT, file)} contains '${name}' (dev-only code reached production)`,
      );
      leaks++;
    }
  }
}
if (leaks > 0) process.exit(1);
console.warn(
  `check-prod-bundle: ok, ${String(files.length)} files, none contain ${FORBIDDEN.join(', ')}`,
);
