/** How long the module-worker probe may take to reply. */
const PROBE_TIMEOUT_MS = 1000;

export type SupportResult = { ok: true } | { ok: false; missing: string[] };

/**
 * Checks the browser features the game needs (ADR 0004): `transferControlToOffscreen`, WebGL 2 on an
 * `OffscreenCanvas`, and module workers. In dev builds, `?forceUnsupported=<name>` adds `<name>` to the missing list.
 */
export async function checkSupport(): Promise<SupportResult> {
  const missing: string[] = [];

  if (
    typeof HTMLCanvasElement === 'undefined' ||
    !('transferControlToOffscreen' in HTMLCanvasElement.prototype)
  ) {
    missing.push('transferControlToOffscreen');
  }
  if (!hasOffscreenWebGL2()) missing.push('webgl2-offscreen');
  if (!(await probeModuleWorker())) missing.push('module-worker');

  if (import.meta.env.DEV) {
    for (const name of new URLSearchParams(location.search).getAll('forceUnsupported')) {
      if (name && !missing.includes(name)) missing.push(name);
    }
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function hasOffscreenWebGL2(): boolean {
  if (typeof OffscreenCanvas === 'undefined') return false;
  try {
    return new OffscreenCanvas(1, 1).getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/** Starts a tiny module worker from a blob URL. `export {}` is a syntax error in a classic worker, so it never replies. */
function probeModuleWorker(): Promise<boolean> {
  return new Promise((resolve) => {
    let worker: Worker | null = null;
    let url = '';
    let timer = 0;
    const finish = (ok: boolean): void => {
      clearTimeout(timer);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(ok);
    };
    try {
      url = URL.createObjectURL(
        new Blob(['export {};\npostMessage(1);\n'], { type: 'text/javascript' }),
      );
      worker = new Worker(url, { type: 'module' });
      worker.onmessage = () => {
        finish(true);
      };
      worker.onerror = () => {
        finish(false);
      };
      timer = window.setTimeout(() => {
        finish(false);
      }, PROBE_TIMEOUT_MS);
    } catch {
      finish(false);
    }
  });
}
