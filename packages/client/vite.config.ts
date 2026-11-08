import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

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
 * ADR 0011's production CSP, applied by `vite preview` so the build is checked under it. `worker-src` adds `blob:`
 * for the support check's module-worker probe (`main/support.ts`); `connect-src` names the local server.
 */
const PREVIEW_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' ws://localhost:8787",
  "img-src 'self' data: blob:",
  "style-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export default defineConfig({
  // Art and assets/manifest.json are served from the repository's assets/ folder (ADR 0007).
  publicDir: '../../assets',
  // Bundle @vs/shared from source in dev and build, so the client never needs packages/shared/dist (#4).
  resolve: {
    alias: { '@vs/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
  plugins: [copyThorvgWasm(), removeDuplicateThorvgWasm()],
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { headers: { 'Content-Security-Policy': PREVIEW_CSP } },
});
