// Shared helpers for the verify-game scripts (#31, .claude/skills/verify-game/SKILL.md). Node only, no shell, so the
// scripts behave the same on every contributor's OS.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Run state: the processes this harness started. Deleted by cleanup; evidence lives beside it, never inside. */
export const RUN_DIR = join(ROOT, 'verification/.run');
export const CLIENT_JSON = join(RUN_DIR, 'client.json');
export const SERVER_JSON = join(RUN_DIR, 'server.json');
export const VITE_LOG = join(RUN_DIR, 'vite.log');

/** Fixed port: the user's `pnpm dev` keeps 5173, and #4's `ALLOWED_ORIGINS` lists exactly 5173 and 5180. */
export const PORT = 5180;
export const SERVER_HEALTH_URL = 'http://localhost:8787/healthz';
export const COMPOSE_PROJECT = 'vs-verify';

/** Headless Chromium gets WebGL 2 without a GPU through SwiftShader; `VERIFY_HEADED=1` runs headed on the real GPU. */
export const HEADED = process.env.VERIFY_HEADED === '1';
export const CHROMIUM_ARGS = HEADED
  ? []
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

export function removeRunDir() {
  rmSync(RUN_DIR, { recursive: true, force: true });
}

export function gitRev() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function currentBranch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

/** `--issue <N>`, else `issue-(\d+)` in the branch name, else `adhoc`: the folder name under `verification/`. */
export function evidenceDirName(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--issue');
  if (i >= 0 && /^\d+$/.test(argv[i + 1] ?? '')) return `issue-${argv[i + 1]}`;
  const m = /issue-(\d+)/.exec(currentBranch());
  return m ? `issue-${m[1]}` : 'adhoc';
}

export function evidenceDir(argv) {
  return join(ROOT, 'verification', evidenceDirName(argv));
}

/** True when the process exists (signal 0 checks without killing). */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** True when something accepts TCP connections on `port` on IPv4 or IPv6 localhost. */
export async function portInUse(port) {
  const tryHost = (host) =>
    new Promise((resolve) => {
      const socket = connect({ host, port });
      socket.setTimeout(1000);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => resolve(false));
    });
  return (await tryHost('127.0.0.1')) || (await tryHost('::1'));
}

export async function httpOk(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Opens a page on `url` in a fresh headless Chromium and polls `__vsTest.snapshot()` until `ready` and `gl`.
 * Returns the last snapshot (or null) and the error text, if any.
 */
export async function probeGame(url, timeoutMs) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let error = '';
  try {
    const page = await browser.newPage();
    await page.goto(url, { timeout: timeoutMs });
    while (Date.now() < deadline) {
      try {
        last = await page.evaluate(() =>
          globalThis.__vsTest ? globalThis.__vsTest.snapshot() : null,
        );
        if (last && last.ready && last.renderer === 'gl') return { snapshot: last, error: '' };
        error = last ? 'the worker is not ready yet' : 'window.__vsTest does not exist';
      } catch (err) {
        error = String(err.message ?? err);
      }
      await sleep(250);
    }
    return { snapshot: last, error };
  } catch (err) {
    return { snapshot: last, error: String(err.message ?? err) };
  } finally {
    await browser.close();
  }
}

export function logTail(path, lines = 40) {
  if (!existsSync(path)) return '(no log)';
  return readFileSync(path, 'utf8').split('\n').slice(-lines).join('\n');
}
