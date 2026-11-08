// verify-game Doctor (#31): read-only checks that the running client from verify:launch is the one to drive.
// One line per check, ok or fail; exits 1 on any failure.
import {
  CLIENT_JSON,
  SERVER_HEALTH_URL,
  SERVER_JSON,
  gitRev,
  httpOk,
  isAlive,
  probeGame,
  readJson,
} from './lib.mjs';

let failed = 0;
function report(ok, label, hint = '') {
  console.warn(`${ok ? 'ok  ' : 'fail'} ${label}${!ok && hint ? ` (${hint})` : ''}`);
  if (!ok) failed++;
}

const client = readJson(CLIENT_JSON);
report(Boolean(client), 'verification/.run/client.json exists', 'run `pnpm verify:launch`');
if (client) {
  report(
    await httpOk(client.url),
    `${client.url} answers`,
    'run `pnpm verify:cleanup`, then `pnpm verify:launch`',
  );
  report(
    isAlive(client.pid),
    `pid ${client.pid} is alive`,
    'run `pnpm verify:cleanup`, then `pnpm verify:launch`',
  );
  const { snapshot, error } = await probeGame(client.url, 15_000);
  report(Boolean(snapshot), 'window.__vsTest answers', error);
  report(snapshot?.ready === true, 'the worker is ready', error);
  report(snapshot?.renderer === 'gl', `renderer is gl (got ${String(snapshot?.renderer)})`);
  const head = gitRev();
  report(
    snapshot?.buildRev === head,
    `buildRev ${String(snapshot?.buildRev).slice(0, 12)} equals HEAD ${head.slice(0, 12)}`,
    'stale server: run `pnpm verify:cleanup`, then `pnpm verify:launch`',
  );
}
const server = readJson(SERVER_JSON);
if (server) {
  report(
    await httpOk(SERVER_HEALTH_URL),
    `${SERVER_HEALTH_URL} answers (${server.reused ? 'reused' : `project ${server.project}`})`,
  );
}
process.exit(failed > 0 ? 1 : 0);
