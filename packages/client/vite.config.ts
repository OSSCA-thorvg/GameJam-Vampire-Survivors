import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { buildCsp, PAGES_BASE, PAGES_MODE, serverSource } from './csp';

/** URL path (under the base) at which the worker's `locateFile` finds ThorVG's WASM (`worker/render/thorvg.ts`). */
const WASM_FILE = 'thorvg/thorvg.wasm';

/**
 * Serves `@thorvg/webcanvas`'s `thorvg.wasm` at `/thorvg/thorvg.wasm` in dev and emits it there in the build.
 * The package exports only `.` and `./thread`, so the file cannot be imported with `?url`.
 */
function copyThorvgWasm(): Plugin {
  const require = createRequire(import.meta.url);
  // `.` resolves to dist/webcanvas.cjs.js, next to dist/thorvg.wasm.
  const wasmPath = join(dirname(require.resolve('@thorvg/webcanvas')), 'thorvg.wasm');
  return {
    name: 'copy-thorvg-wasm',
    configureServer(server) {
      server.middlewares.use(`${server.config.base}${WASM_FILE}`, (_req, res) => {
        res.setHeader('content-type', 'application/wasm');
        res.end(readFileSync(wasmPath));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: WASM_FILE, source: readFileSync(wasmPath) });
    },
  };
}

/** The worker's `locateFile` loads WASM_FILE, so Vite's URL-generated copy is unused. */
function removeDuplicateThorvgWasm(): Plugin {
  return {
    name: 'remove-duplicate-thorvg-wasm',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const fileName of Object.keys(bundle)) {
          if (/^assets\/thorvg-[^/]+\.wasm$/.test(fileName)) {
            Reflect.deleteProperty(bundle, fileName);
          }
        }
      },
    },
  };
}

/**
 * Puts ADR 0011's CSP into every production build's `index.html` as the first `<meta>` in `<head>` (ADR 0017): GitHub
 * Pages sends no custom headers, so the tag is the only policy there. `frame-ancestors` is left out, as browsers ignore
 * it in a `<meta>` tag.
 */
function cspMeta(policy: string): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ],
  };
}

/** `git rev-parse HEAD` when Vite starts, exposed as `__VS_BUILD_REV__` (the test bridge's `buildRev`, for Doctor). */
function gitRev(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** The repository root: `.env` lives there next to `compose.yaml`; only `VITE_*` variables reach the client (#19). */
const ENV_DIR = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, 'VITE_');
  const pages = mode === PAGES_MODE;
  // An https page may only open wss:// sockets, so the Pages build fails on a ws:// server URL.
  const server = serverSource(env.VITE_SERVER_URL, pages);
  return {
    // GitHub Pages serves the site under /<repo>/ (ADR 0017); dev, e2e and the ordinary build stay at the root.
    base: pages ? PAGES_BASE : '/',
    define: { __VS_BUILD_REV__: JSON.stringify(gitRev()) },
    // Art and assets/manifest.json are served from the repository's assets/ folder (ADR 0007).
    publicDir: '../../assets',
    envDir: ENV_DIR,
    // Bundle @vs/shared from source in dev and build, so the client never needs packages/shared/dist (#4).
    resolve: {
      alias: { '@vs/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
    },
    plugins: [copyThorvgWasm(), removeDuplicateThorvgWasm(), cspMeta(buildCsp(server, false))],
    worker: { format: 'es' },
    server: { port: 5173, strictPort: true },
    // vite preview sends the same policy as a header, with frame-ancestors, so a build is checked under it.
    preview: { headers: { 'Content-Security-Policy': buildCsp(server, true) } },
  };
});
