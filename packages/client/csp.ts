// The production Content Security Policy (ADR 0011) and the GitHub Pages base path (ADR 0017), shared by
// vite.config.ts (the build's <meta> tag and vite preview's header) and its unit test.

/** The URL path GitHub Pages serves this repository's site under; only `vite build --mode pages` uses it. */
export const PAGES_BASE = '/GameJam-Vampire-Survivors/';

/** The Vite mode of the GitHub Pages build (`pnpm build:pages`). */
export const PAGES_MODE = 'pages';

/**
 * The `connect-src` source for the game server named by `VITE_SERVER_URL`: its scheme, host and port, without the
 * path. `null` when the URL is unset or blank (no multiplayer in that build). Throws on anything that is not a
 * `ws:` or `wss:` URL, and on `ws:` when `requireWss` is set: an https page may only open `wss://` sockets.
 */
export function serverSource(url: string | undefined, requireWss: boolean): string | null {
  const value = url?.trim() ?? '';
  if (value === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`VITE_SERVER_URL is not a URL: ${value}`);
  }
  if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:')
    throw new Error(`VITE_SERVER_URL must be a ws:// or wss:// URL, got ${parsed.protocol}`);
  if (requireWss && parsed.protocol !== 'wss:')
    throw new Error('VITE_SERVER_URL must be a wss:// URL for the GitHub Pages build (https page)');
  if (parsed.username !== '' || parsed.password !== '')
    throw new Error('VITE_SERVER_URL must not contain credentials');
  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * ADR 0011's policy. `worker-src` adds `blob:` for the support check's module-worker probe (`main/support.ts`), and
 * `connect-src` adds the game server when there is one. `frameAncestors` is for a response header only: browsers
 * ignore `frame-ancestors` in a `<meta>` tag.
 */
export function buildCsp(server: string | null, frameAncestors: boolean): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    server === null ? "connect-src 'self'" : `connect-src 'self' ${server}`,
    "img-src 'self' data: blob:",
    "style-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    ...(frameAncestors ? ["frame-ancestors 'none'"] : []),
  ].join('; ');
}
