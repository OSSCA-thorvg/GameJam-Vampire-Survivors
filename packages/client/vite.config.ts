import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // Art and assets/manifest.json are served from the repository's assets/ folder (ADR 0007).
  publicDir: '../../assets',
  // Bundle @vs/shared from source in dev and build, so the client never needs packages/shared/dist (#4).
  resolve: {
    alias: { '@vs/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
});
