const configured = import.meta.env.VITE_SERVER_URL as string | undefined;

/**
 * The game server's WebSocket URL (ADR 0006): `VITE_SERVER_URL` from the repository's `.env` (`envDir` in
 * `vite.config.ts`), `ws://localhost:8787/ws` when it is unset or blank.
 */
export const SERVER_URL: string =
  configured !== undefined && configured.trim() !== ''
    ? configured.trim()
    : 'ws://localhost:8787/ws';
