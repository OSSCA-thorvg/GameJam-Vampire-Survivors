/** The local development server, used by dev and e2e builds when `VITE_SERVER_URL` is unset. */
export const DEV_SERVER_URL = 'ws://localhost:8787/ws';

/**
 * Picks the game server's WebSocket URL (ADR 0006, ADR 0017) from `VITE_SERVER_URL`: the trimmed value when it is set,
 * otherwise `DEV_SERVER_URL` in dev and e2e builds and `null` in production builds, which have no server until the
 * deploy sets the repository variable. `null` makes the multiplayer entry say that no server is configured.
 */
export function resolveServerUrl(configured: string | undefined, dev: boolean): string | null {
  const value = configured?.trim() ?? '';
  if (value !== '') return value;
  return dev ? DEV_SERVER_URL : null;
}

/**
 * The game server's WebSocket URL: `VITE_SERVER_URL` from the repository's `.env` (`envDir` in `vite.config.ts`) or
 * the deploy workflow's environment, resolved by `resolveServerUrl`.
 */
export const SERVER_URL: string | null = resolveServerUrl(
  import.meta.env.VITE_SERVER_URL as string | undefined,
  import.meta.env.DEV,
);
