// verify-game Doctor (#31): read-only checks that the running client from verify:launch is the one to drive.
// One line per check, ok or fail; exits 1 on any failure. Reads only the record of `VERIFY_PORT` (default 5180, #146).
import { relative } from 'node:path';
import {
  DEFAULT_PORT,
  ROOT,
  SERVER_HEALTH_URL,
  gitRev,
  httpOk,
  isAlive,
  probeGame,
  readRecord,
  recordPath,
  verifyPortOrExit,
} from './lib.mjs';

const PORT = verifyPortOrExit('verify:doctor');
const portEnv = PORT === DEFAULT_PORT ? '' : `VERIFY_PORT=${PORT} `;
const relaunch = `run \`${portEnv}pnpm verify:cleanup\`, then \`${portEnv}pnpm verify:launch\``;

let failed = 0;
function report(ok, label, hint = '') {
  console.warn(`${ok ? 'ok  ' : 'fail'} ${label}${!ok && hint ? ` (${hint})` : ''}`);
  if (!ok) failed++;
}

const record = readRecord(PORT);
const client = record.client;
report(
  Boolean(client),
  `${relative(ROOT, recordPath(PORT))} records a client`,
  `run \`${portEnv}pnpm verify:launch\``,
);
if (client) {
  report(
    client.port === PORT,
    `the recorded port is ${PORT} (got ${String(client.port)})`,
    relaunch,
  );
  report(await httpOk(client.url), `${client.url} answers`, relaunch);
  report(isAlive(client.pid), `pid ${client.pid} is alive`, relaunch);
  const { snapshot, error } = await probeGame(client.url, 15_000);
  report(Boolean(snapshot), 'window.__vsTest answers', error);
  report(snapshot?.ready === true, 'the worker is ready', error);
  report(snapshot?.renderer === 'gl', `renderer is gl (got ${String(snapshot?.renderer)})`);
  const head = gitRev();
  report(
    snapshot?.buildRev === head,
    `buildRev ${String(snapshot?.buildRev).slice(0, 12)} equals HEAD ${head.slice(0, 12)}`,
    `stale server: ${relaunch}`,
  );
}
const server = record.server;
if (server) {
  report(
    await httpOk(SERVER_HEALTH_URL),
    `${SERVER_HEALTH_URL} answers (${server.reused ? 'reused' : `project ${server.project}`})`,
  );
}
process.exit(failed > 0 ? 1 : 0);
