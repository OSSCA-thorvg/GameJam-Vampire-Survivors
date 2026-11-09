// The stress-scenario measurement harness (#119): runs named `?stress=<name>&perf` scenarios in fresh browsers on a
// `perf` build and appends each `[stress] result` to a JSONL file. See docs/reference/performance.md § How to measure.
//
//   node scripts/perf/measure.mjs --browser <chromium|chrome|firefox|webkit> --base <url> --out <file.jsonl> \
//     --runs <n> [--max-load <n>] [--max-wait <s>] [--headed] <scenario...>
//
// Headless by default: Chrome (`--browser chrome`), Firefox and WebKit render on the real GPU headless on macOS (the
// `gpu` field of every record says which renderer ran; Playwright's own `chromium` falls back to SwiftShader). With
// `--headed`, Chromium-based browsers open their window off-screen at a fixed size and are never brought to the front
// or minimized (macOS throttles occluded windows); Firefox and WebKit cannot be placed off-screen and warn.
//
// Every attempt gets a fresh browser process (launchServer + connect), closed and killed in `finally`, so a hung
// browser cannot poison later runs (#22's WebKit pass failed every run after one hang with `browser.newContext:
// Target page, context or browser has been closed`). A run gets at most 2 attempts; a timed-out attempt leaves a
// screenshot and a failure record with the console errors and the last `[stress] progress`. Exit code 1 when any run
// failed both attempts.
import { appendFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, firefox, webkit } from '@playwright/test';
import { parseMeasureArgs } from './measure-args.mjs';
import { formatRows } from './summary.mjs';

const ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 120_000;
const CLOSE_TIMEOUT_MS = 10_000;
const LOAD_POLL_MS = 5_000;
const RESULT_PREFIX = '[stress] result ';
const PROGRESS_PREFIX = '[stress] progress ';

let opts;
try {
  opts = parseMeasureArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const TYPES = { chromium, chrome: chromium, firefox, webkit };
const type = TYPES[opts.browser];
const browserKind = opts.browser;
/** Off-screen and fixed-size, for headed Chromium-based runs; the occlusion flags keep it rendering at full rate. */
const HEADED_CHROMIUM_ARGS = [
  '--window-position=-2400,-2400',
  '--window-size=1280,800',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];
const chromiumBased = opts.browser === 'chromium' || opts.browser === 'chrome';
if (opts.headed && !chromiumBased)
  console.warn(
    `[measure] --headed ${opts.browser}: its window cannot be placed off-screen and will be visible`,
  );
const failuresFile = opts.out.replace(/\.jsonl$/, '') + '-failures.jsonl';
mkdirSync(dirname(opts.out) || '.', { recursive: true });
const cpus = os.cpus();
const machine = {
  platform: os.platform(),
  release: os.release(),
  cpu: cpus[0]?.model ?? 'unknown',
  cores: cpus.length,
};
const load = () => Math.round(os.loadavg()[0] * 100) / 100;

/** With `--max-load`, waits until the 1-minute load average is below it; `false` when `--max-wait` was not enough. */
async function waitForLoad() {
  if (opts.maxLoad === null) return true;
  const deadline = Date.now() + opts.maxWaitS * 1000;
  let logged = false;
  while (load() >= opts.maxLoad) {
    if (Date.now() >= deadline) {
      console.warn(
        `[measure] load ${String(load())} still >= ${String(opts.maxLoad)} after ${String(opts.maxWaitS)} s; running anyway`,
      );
      return false;
    }
    if (!logged)
      console.warn(`[measure] waiting for load ${String(load())} < ${String(opts.maxLoad)}`);
    logged = true;
    await sleep(LOAD_POLL_MS);
  }
  return true;
}

/** Races a promise against a timer; resolves `undefined` on timeout and never rejects. */
const bounded = (promise, ms) =>
  Promise.race([promise.catch(() => undefined), sleep(ms).then(() => undefined)]);

/** One attempt in a fresh browser: the result record, or `null` after writing a failure record. */
async function attempt(scenario, run, attemptNo) {
  const loadGateMet = await waitForLoad();
  const loadBefore = load();
  const console_ = [];
  const errors = [];
  let lastProgress = null;
  /** Every `[stress] progress` line of the attempt, kept in the record as evidence of steady progress. */
  const progress = [];
  let browserVersion = 'unknown';
  let server = null;
  let browser = null;
  let page = null;
  try {
    server = await type.launchServer({
      headless: !opts.headed,
      ...(opts.browser === 'chrome' ? { channel: 'chrome' } : {}),
      ...(opts.headed && chromiumBased ? { args: HEADED_CHROMIUM_ARGS } : {}),
    });
    browser = await type.connect(server.wsEndpoint());
    browserVersion = browser.version();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    const result = new Promise((resolve, reject) => {
      page.on('console', (message) => {
        const text = message.text();
        const entry = { type: message.type(), text };
        console_.push(entry);
        if (entry.type === 'error') errors.push(text);
        if (text.startsWith(PROGRESS_PREFIX)) {
          try {
            lastProgress = JSON.parse(text.slice(PROGRESS_PREFIX.length));
            progress.push(lastProgress);
            if (lastProgress.error) errors.push(`stressProgress: ${String(lastProgress.error)}`);
          } catch {
            errors.push(`unparsable progress: ${text}`);
          }
        }
        if (text.startsWith(RESULT_PREFIX)) {
          try {
            resolve(JSON.parse(text.slice(RESULT_PREFIX.length)));
          } catch (error) {
            reject(new Error(`unparsable result: ${error.message}`));
          }
        }
      });
      page.on('pageerror', (error) => {
        errors.push(`pageerror: ${error.stack ?? error.message}`);
      });
      page.on('crash', () => {
        reject(new Error('page crashed'));
      });
    });
    // A crash after the result or the timeout must not become an unhandled rejection.
    result.catch(() => undefined);
    const url = `${opts.base}/?stress=${encodeURIComponent(scenario)}&perf`;
    await page.goto(url, { timeout: 30_000 });
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`no [stress] result within ${String(ATTEMPT_TIMEOUT_MS / 1000)} s`));
      }, ATTEMPT_TIMEOUT_MS);
    });
    let summary;
    try {
      summary = await Promise.race([result, timeout]);
    } finally {
      clearTimeout(timer);
    }
    const record = {
      ...summary,
      date: new Date().toISOString(),
      browserKind,
      browserVersion,
      run,
      attempt: attemptNo,
      headed: opts.headed,
      machine,
      loadBefore,
      loadAfter: load(),
      loadGateMet,
      errors,
      progress,
    };
    appendFileSync(opts.out, `${JSON.stringify(record)}\n`);
    return record;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const shot = join(
      dirname(opts.out),
      `failure-${browserKind}-${scenario}-r${String(run)}-a${String(attemptNo)}.png`,
    );
    let screenshot = null;
    if (page) {
      const taken = await bounded(
        page.screenshot({ path: shot, fullPage: true }),
        CLOSE_TIMEOUT_MS,
      );
      if (taken) screenshot = basename(shot);
    }
    appendFileSync(
      failuresFile,
      `${JSON.stringify({
        date: new Date().toISOString(),
        browserKind,
        browserVersion,
        scenario,
        run,
        attempt: attemptNo,
        headed: opts.headed,
        reason,
        loadBefore,
        loadAfter: load(),
        loadGateMet,
        lastProgress,
        progress,
        errors,
        console: console_.slice(-50),
        screenshot,
      })}\n`,
    );
    console.warn(
      `[measure] ${scenario} run ${String(run)} attempt ${String(attemptNo)} failed: ${reason}`,
    );
    return null;
  } finally {
    if (browser) await bounded(browser.close(), CLOSE_TIMEOUT_MS);
    if (server) await bounded(server.kill(), CLOSE_TIMEOUT_MS);
  }
}

const records = [];
const failed = [];
for (let run = 1; run <= opts.runs; run++) {
  for (const scenario of opts.scenarios) {
    let record = null;
    for (let attemptNo = 1; attemptNo <= ATTEMPTS && !record; attemptNo++)
      record = await attempt(scenario, run, attemptNo);
    if (!record) {
      failed.push(`${scenario} run ${String(run)}`);
      continue;
    }
    records.push(record);
    const peaks = Object.entries(record.maxCounts ?? {})
      .map(([name, value]) => `${name} ${String(value)}`)
      .join(', ');
    console.warn(
      `[measure] ${browserKind} ${record.browserVersion} ${scenario} run ${String(run)}` +
        `${record.attempt > 1 ? ` (attempt ${String(record.attempt)})` : ''}: median ${String(record.medianMs)} ms, ` +
        `p95 ${String(record.p95Ms)} ms, steps ${String(record.steps)} in ${String(record.durationS)} s, ${peaks}, ` +
        `load ${String(record.loadBefore)}${record.loadGateMet ? '' : ' (gate not met)'}, errors ${String(record.errors.length)}`,
    );
  }
}
if (records.length > 0) process.stdout.write(`\n${formatRows(records)}\n`);
if (failed.length > 0) {
  console.error(`[measure] failed both attempts: ${failed.join(', ')} (see ${failuresFile})`);
  process.exit(1);
}
