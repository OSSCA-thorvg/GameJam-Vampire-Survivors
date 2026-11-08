/**
 * Abuse limits (ADR 0011): a per-connection token bucket, a per-IP connection counter and the per-IP join
 * lockout. Each takes an injected clock (`now()` in ms) so tests control time. IPs are kept only for this
 * bookkeeping and are never logged.
 */
export type Clock = () => number;

export const RATE_SUSTAINED_PER_S = 20;
export const RATE_BURST = 40;
export const MAX_CONNECTIONS_PER_IP = 10;
export const JOIN_FAILURES_MAX = 10;
export const JOIN_FAILURE_WINDOW_MS = 60_000;
export const JOIN_LOCKOUT_MS = 60_000;

/** 20 messages per second sustained with a burst of 40; one bucket per connection. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly now: Clock,
    private readonly ratePerS = RATE_SUSTAINED_PER_S,
    private readonly burst = RATE_BURST,
  ) {
    this.tokens = burst;
    this.last = now();
  }

  /** Takes one token; `false` when the bucket is empty. */
  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) * this.ratePerS) / 1000);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Concurrent connections per client IP. */
export class ConnectionCounter {
  private readonly counts = new Map<string, number>();

  constructor(private readonly max = MAX_CONNECTIONS_PER_IP) {}

  /** Whether one more connection from `ip` would stay within the cap. */
  canAccept(ip: string): boolean {
    return (this.counts.get(ip) ?? 0) < this.max;
  }

  /** Counts a connection; `false` (and nothing counted) when `ip` is already at the cap. */
  acquire(ip: string): boolean {
    const n = this.counts.get(ip) ?? 0;
    if (n >= this.max) return false;
    this.counts.set(ip, n + 1);
    return true;
  }

  release(ip: string): void {
    const n = this.counts.get(ip) ?? 0;
    if (n <= 1) this.counts.delete(ip);
    else this.counts.set(ip, n - 1);
  }

  count(ip: string): number {
    return this.counts.get(ip) ?? 0;
  }
}

interface LockoutEntry {
  failures: number[];
  lockedUntil: number;
}

/** 10 failed joins (wrong codes) within 60 s lock the IP out of joining for 60 s. */
export class JoinLockout {
  private readonly entries = new Map<string, LockoutEntry>();

  constructor(
    private readonly now: Clock,
    private readonly maxFailures = JOIN_FAILURES_MAX,
    private readonly windowMs = JOIN_FAILURE_WINDOW_MS,
    private readonly lockoutMs = JOIN_LOCKOUT_MS,
  ) {}

  isLocked(ip: string): boolean {
    const entry = this.entries.get(ip);
    return entry !== undefined && this.now() < entry.lockedUntil;
  }

  /** Records a failed join; the failure that reaches `maxFailures` within the window starts the lockout. */
  recordFailure(ip: string): void {
    const t = this.now();
    const entry = this.entries.get(ip) ?? { failures: [], lockedUntil: 0 };
    entry.failures = entry.failures.filter((at) => t - at < this.windowMs);
    entry.failures.push(t);
    if (entry.failures.length >= this.maxFailures) {
      entry.lockedUntil = t + this.lockoutMs;
      entry.failures = [];
    }
    this.entries.set(ip, entry);
  }

  /** Drops entries with no recent failures and no active lockout, so the map does not grow without bound. */
  prune(): void {
    const t = this.now();
    for (const [ip, entry] of this.entries) {
      const recent = entry.failures.some((at) => t - at < this.windowMs);
      if (!recent && t >= entry.lockedUntil) this.entries.delete(ip);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * The client IP for limits: the socket's remote address, or, when `trustProxy` is on, the right-most
 * `x-forwarded-for` entry (the one the trusted proxy appended; entries to its left are client-supplied).
 */
export function clientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy && forwardedFor !== undefined) {
    const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
    const parts = header
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const last = parts.at(-1);
    if (last !== undefined) return last;
  }
  return remoteAddress ?? 'unknown';
}
