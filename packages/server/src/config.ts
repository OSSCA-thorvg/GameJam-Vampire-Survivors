/** Runtime configuration of the game server, read once from the environment at startup (ADR 0006, ADR 0011). */
export interface ServerConfig {
  port: number;
  logLevel: 'info' | 'debug';
  /** `Origin` values allowed to open a WebSocket on `/ws` (ADR 0011). */
  allowedOrigins: string[];
}

/** `pnpm dev` (5173) and `verify-game`'s fixed port (5180, #31). */
const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:5180';

/** A trimmed variable, or `undefined` when it is unset or blank (`PORT=` in `.env` means the default). */
function valueOf(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value === undefined || value === '' ? undefined : value;
}

/** Reads `PORT`, `LOG_LEVEL` and `ALLOWED_ORIGINS`. Throws on an invalid value, so a bad deployment fails at startup. */
export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const rawPort = valueOf(env.PORT) ?? '8787';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${rawPort}"`);
  }

  const logLevel = valueOf(env.LOG_LEVEL) ?? 'info';
  if (logLevel !== 'info' && logLevel !== 'debug') {
    throw new Error(`LOG_LEVEL must be "info" or "debug", got "${logLevel}"`);
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return { port, logLevel, allowedOrigins };
}
