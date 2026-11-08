/**
 * Structured logging: one JSON line per event. Callers pass event names and small scalar fields such as message
 * types, sizes and close codes. Message bodies are never logged (ADR 0011).
 */
export type LogLevel = 'info' | 'debug' | 'warn' | 'error';

let threshold: 'info' | 'debug' = 'info';

/** Sets the lowest level written; `startServer` calls it with `ServerConfig.logLevel`. */
export function setLogLevel(level: 'info' | 'debug'): void {
  threshold = level;
}

export function log(
  level: LogLevel,
  event: string,
  fields?: Record<string, string | number>,
): void {
  if (level === 'debug' && threshold !== 'debug') return;
  const line = `${JSON.stringify({ time: new Date().toISOString(), level, event, ...fields })}\n`;
  if (level === 'warn' || level === 'error') process.stderr.write(line);
  else process.stdout.write(line);
}
