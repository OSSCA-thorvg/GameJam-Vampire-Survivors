// Compile-time constants defined in vite.config.ts. Included by both tsconfig.main.json and tsconfig.worker.json.

/** `git rev-parse HEAD` when the Vite server or build started; `'unknown'` outside a git checkout. */
declare const __VS_BUILD_REV__: string;
