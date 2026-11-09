// Argument parsing for scripts/perf/measure.mjs (#119), kept apart so `measure-args.test.mjs` can test it without a
// browser.

export const BROWSERS = ['chromium', 'chrome', 'firefox', 'webkit'];

const USAGE =
  'usage: node scripts/perf/measure.mjs --browser <chromium|chrome|firefox|webkit> --base <url> --out <file.jsonl> --runs <n> [--max-load <n>] [--max-wait <s>] [--headed] <scenario...>';

/**
 * Parses `--browser`, `--base`, `--out`, `--runs`, the optional `--max-load`, `--max-wait` (seconds the load gate waits
 * per attempt, 600 by default) and `--headed`, and one or more scenario names. Throws on an unknown flag, a flag without a value, an unknown browser, a non-positive run count or no scenario.
 */
export function parseMeasureArgs(argv) {
  const opts = {
    browser: '',
    base: '',
    out: '',
    runs: 0,
    maxLoad: null,
    maxWaitS: 600,
    headed: false,
    scenarios: [],
  };
  const value = (flag, i) => {
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--'))
      throw new Error(`${flag} needs a value\n${USAGE}`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--browser':
        opts.browser = value(arg, i++);
        if (!BROWSERS.includes(opts.browser))
          throw new Error(`unknown browser '${opts.browser}' (one of ${BROWSERS.join(', ')})`);
        break;
      case '--base':
        opts.base = value(arg, i++).replace(/\/+$/, '');
        break;
      case '--out':
        opts.out = value(arg, i++);
        break;
      case '--runs': {
        const raw = value(arg, i++);
        if (!/^\d+$/.test(raw) || Number(raw) < 1)
          throw new Error(`--runs must be a positive integer, not '${raw}'`);
        opts.runs = Number(raw);
        break;
      }
      case '--max-load': {
        const raw = value(arg, i++);
        const n = Number(raw);
        if (raw === '' || !Number.isFinite(n) || n <= 0)
          throw new Error(`--max-load must be a positive number, not '${raw}'`);
        opts.maxLoad = n;
        break;
      }
      case '--max-wait': {
        const raw = value(arg, i++);
        if (!/^\d+$/.test(raw)) throw new Error(`--max-wait must be whole seconds, not '${raw}'`);
        opts.maxWaitS = Number(raw);
        break;
      }
      case '--headed':
        opts.headed = true;
        break;
      default:
        if (arg.startsWith('-')) throw new Error(`unknown flag '${arg}'\n${USAGE}`);
        opts.scenarios.push(arg);
    }
  }
  for (const [flag, missing] of [
    ['--browser', opts.browser === ''],
    ['--base', opts.base === ''],
    ['--out', opts.out === ''],
    ['--runs', opts.runs === 0],
  ])
    if (missing) throw new Error(`${flag} is required\n${USAGE}`);
  if (opts.scenarios.length === 0) throw new Error(`no scenario given\n${USAGE}`);
  return opts;
}
