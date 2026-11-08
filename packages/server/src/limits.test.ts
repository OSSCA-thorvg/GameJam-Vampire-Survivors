import { describe, expect, it } from 'vitest';
import { ConnectionCounter, JoinLockout, TokenBucket, clientIp } from './limits.js';

describe('TokenBucket', () => {
  it('allows a burst of 40, then 20 per second', () => {
    let now = 0;
    const bucket = new TokenBucket(() => now);
    for (let i = 0; i < 40; i++) expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);

    now += 1000;
    let allowed = 0;
    for (let i = 0; i < 40; i++) if (bucket.take()) allowed++;
    expect(allowed).toBe(20);

    // 20 per second sustained: one every 50 ms keeps passing.
    for (let i = 0; i < 100; i++) {
      now += 50;
      expect(bucket.take()).toBe(true);
    }
  });

  it('never refills above the burst', () => {
    let now = 0;
    const bucket = new TokenBucket(() => now);
    now += 60_000;
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (bucket.take()) allowed++;
    expect(allowed).toBe(40);
  });
});

describe('ConnectionCounter', () => {
  it('refuses the 11th connection from one IP and frees slots on release', () => {
    const counter = new ConnectionCounter();
    for (let i = 0; i < 10; i++) expect(counter.acquire('1.2.3.4')).toBe(true);
    expect(counter.canAccept('1.2.3.4')).toBe(false);
    expect(counter.acquire('1.2.3.4')).toBe(false);
    expect(counter.count('1.2.3.4')).toBe(10);
    expect(counter.acquire('5.6.7.8')).toBe(true);
    counter.release('1.2.3.4');
    expect(counter.acquire('1.2.3.4')).toBe(true);
  });
});

describe('JoinLockout', () => {
  it('locks at the 10th failure within 60 s and unlocks after 60 s', () => {
    let now = 0;
    const lockout = new JoinLockout(() => now);
    for (let i = 0; i < 9; i++) {
      lockout.recordFailure('ip');
      now += 1000;
    }
    expect(lockout.isLocked('ip')).toBe(false);
    lockout.recordFailure('ip');
    expect(lockout.isLocked('ip')).toBe(true);
    expect(lockout.isLocked('other')).toBe(false);
    now += 59_999;
    expect(lockout.isLocked('ip')).toBe(true);
    now += 1;
    expect(lockout.isLocked('ip')).toBe(false);
  });

  it('forgets failures older than 60 s', () => {
    let now = 0;
    const lockout = new JoinLockout(() => now);
    for (let i = 0; i < 9; i++) lockout.recordFailure('ip');
    now += 60_000;
    lockout.recordFailure('ip');
    expect(lockout.isLocked('ip')).toBe(false);
  });

  it('prunes idle entries', () => {
    let now = 0;
    const lockout = new JoinLockout(() => now);
    lockout.recordFailure('a');
    for (let i = 0; i < 10; i++) lockout.recordFailure('b');
    now += 60_000;
    lockout.prune();
    expect(lockout.size).toBe(0);
  });
});

describe('clientIp', () => {
  it('uses the socket address unless TRUST_PROXY is on', () => {
    expect(clientIp('10.0.0.1', '1.1.1.1', false)).toBe('10.0.0.1');
    expect(clientIp('10.0.0.1', 'spoofed, 1.1.1.1', true)).toBe('1.1.1.1');
    expect(clientIp('10.0.0.1', ['a', 'b'], true)).toBe('b');
    expect(clientIp('10.0.0.1', ' , ', true)).toBe('10.0.0.1');
    expect(clientIp('10.0.0.1', undefined, true)).toBe('10.0.0.1');
    expect(clientIp(undefined, undefined, false)).toBe('unknown');
  });
});
