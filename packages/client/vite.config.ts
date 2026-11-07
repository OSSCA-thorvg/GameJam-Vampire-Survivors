import { defineConfig } from 'vite';

export default defineConfig({
  // Art and assets/manifest.json are served from the repository's assets/ folder (ADR 0007).
  publicDir: '../../assets',
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
});
