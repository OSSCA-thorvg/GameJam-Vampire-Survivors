// verify:e2e (#31): launch, run the Playwright suite in e2e/ against it, and always clean up, even on failure.
// Exits with Playwright's exit code. `VERIFY_HEADED=1` runs headed on the real GPU; `--issue <N>` picks the evidence
// folder (default: from the branch name, else verification/adhoc/). Other arguments reach Playwright unchanged;
// the hidden-tab project always runs headed (Linux: xvfb-run -a pnpm verify:e2e). `VERIFY_PORT` (default 5180, #146)
// reaches launch and cleanup through the environment, and Playwright gets that port's URL.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, evidenceDir, readRecord, verifyPortOrExit } from './lib.mjs';
import { parseE2eArgs } from './e2e-args.mjs';

const args = parseE2eArgs(process.argv.slice(2));
const port = verifyPortOrExit('verify:e2e');

const script = (name) => join(ROOT, 'scripts/verify', name);
const run = (cmd, args, env = process.env) =>
  spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env, shell: process.platform === 'win32' })
    .status ?? 1;
const cleanup = () => run(process.execPath, [script('cleanup.mjs')]);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}

const launched = run(process.execPath, [script('launch.mjs'), ...args.launch]);
if (launched !== 0) {
  cleanup();
  process.exit(launched);
}
let code;
try {
  const client = readRecord(port).client;
  code = run(
    'pnpm',
    ['exec', 'playwright', 'test', '-c', 'e2e/playwright.config.ts', ...args.playwright],
    {
      ...process.env,
      VERIFY_URL: client?.url ?? `http://localhost:${port}/`,
      VERIFY_EVIDENCE_DIR: evidenceDir(args.evidence),
    },
  );
} finally {
  cleanup();
}
process.exit(code);
