import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

interface OwnedCdpOptions {
  profile: string;
  isAlive: () => boolean;
  timeoutMs?: number;
  pollMs?: number;
}

/** Abort a regular-file read at the deadline; never block opening a FIFO or follow a replaced symlink. */
async function readPortFile(path: string, remaining: number, timeoutError: Error): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, remaining);
  });
  const reading = (async () => {
    const stat = await lstat(path);
    controller.signal.throwIfAborted();
    if (!stat.isFile()) throw new Error('Owned CDP port file must be a regular file');
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      controller.signal.throwIfAborted();
      if (!(await file.stat()).isFile())
        throw new Error('Owned CDP port file must be a regular file');
      controller.signal.throwIfAborted();
      return await file.readFile({ encoding: 'utf8', signal: controller.signal });
    } finally {
      await file.close();
    }
  })();
  try {
    return await Promise.race([reading, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Chromium writes a port and complete browser UUID into its generated profile. */
function parseEndpoint(content: string): string | undefined {
  const [port, path, ...extra] = content.split(/\r?\n/);
  if (
    !port ||
    !/^\d{1,5}$/.test(port) ||
    Number(port) < 1 ||
    Number(port) > 65535 ||
    !path ||
    !/^\/devtools\/browser\/[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(path) ||
    extra.some((line) => line !== '')
  )
    return undefined;
  return `http://127.0.0.1:${String(Number(port))}`;
}

/** Reads only the new child's profile; readiness failures never discover another browser. */
export async function waitForOwnedCdpEndpoint({
  profile,
  isAlive,
  timeoutMs = 5000,
  pollMs = 25,
}: OwnedCdpOptions): Promise<string> {
  if (!profile) throw new Error('Owned browser profile is missing');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
    throw new RangeError('Owned CDP timeout must be finite and nonnegative');
  if (!Number.isFinite(pollMs) || pollMs <= 0)
    throw new RangeError('Owned CDP poll interval must be positive and finite');
  const deadline = performance.now() + timeoutMs;
  const timeout = (): Error =>
    new Error(`Owned browser CDP endpoint was not ready within ${String(timeoutMs)} ms`);
  for (;;) {
    if (!isAlive()) throw new Error('Owned browser exited before its CDP endpoint was ready');
    if (performance.now() >= deadline) throw timeout();
    let content = '';
    try {
      content = await readPortFile(
        join(profile, 'DevToolsActivePort'),
        deadline - performance.now(),
        timeout(),
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    if (!isAlive()) throw new Error('Owned browser exited before its CDP endpoint was ready');
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw timeout();
    const endpoint = parseEndpoint(content);
    if (endpoint) return endpoint;
    await delay(Math.min(pollMs, remaining));
  }
}
