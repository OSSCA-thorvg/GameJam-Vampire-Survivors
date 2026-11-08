/** Runtime configuration of the game server, read once from the environment at startup (ADR 0006, ADR 0011). */
export interface ServerConfig {
  port: number;
  logLevel: 'info' | 'debug';
  /** `Origin` values allowed to open a WebSocket on `/ws` (ADR 0011). */
  allowedOrigins: string[];
  /**
   * Trust the right-most `x-forwarded-for` entry as the client IP (`TRUST_PROXY=1`), for a deployment behind one
   * reverse proxy. Off by default: the socket's remote address is used, so clients cannot spoof their IP.
   */
  trustProxy: boolean;
}

/** `pnpm dev` (5173) and `verify-game`'s fixed port (5180, #31). */
const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:5180';

/** A trimmed variable, or `undefined` when it is unset or blank (`PORT=` in `.env` means the default). */
function valueOf(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value === undefined || value === '' ? undefined : value;
}

/** Reads `PORT`, `LOG_LEVEL`, `ALLOWED_ORIGINS` and `TRUST_PROXY`. Throws on an invalid value, so a bad deployment fails at startup. */
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

  const rawTrustProxy = valueOf(env.TRUST_PROXY) ?? '0';
  if (rawTrustProxy !== '0' && rawTrustProxy !== '1') {
    throw new Error(`TRUST_PROXY must be "0" or "1", got "${rawTrustProxy}"`);
  }
  const trustProxy = rawTrustProxy === '1';

  return { port, logLevel, allowedOrigins, trustProxy };
}
