import { MATCH_DEADLINE_S } from '@vs/shared';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses the defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({
      port: 8787,
      logLevel: 'info',
      allowedOrigins: ['http://localhost:5173', 'http://localhost:5180'],
      trustProxy: false,
      matchTimeLimitS: MATCH_DEADLINE_S,
      matchTimeLimitOverrideIgnored: false,
    });
  });

  it('reads PORT and LOG_LEVEL', () => {
    const config = loadConfig({ PORT: '9000', LOG_LEVEL: 'debug' });
    expect(config.port).toBe(9000);
    expect(config.logLevel).toBe('debug');
  });

  it('trims ALLOWED_ORIGINS and drops empty items', () => {
    const config = loadConfig({ ALLOWED_ORIGINS: ' https://a.example , ,https://b.example,, ' });
    expect(config.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('throws on an invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('throws on an invalid PORT', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(/PORT/);
  });

  it('reads TRUST_PROXY as 0 or 1, default 0', () => {
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(true);
    expect(loadConfig({ TRUST_PROXY: '0' }).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: '' }).trustProxy).toBe(false);
  });

  it('throws on an invalid TRUST_PROXY', () => {
    for (const value of ['true', 'yes', '2', 'on']) {
      expect(() => loadConfig({ TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
    }
  });

  it('honours MATCH_TIME_LIMIT_S_OVERRIDE only when NODE_ENV is test', () => {
    expect(loadConfig({ NODE_ENV: 'test', MATCH_TIME_LIMIT_S_OVERRIDE: '20' })).toMatchObject({
      matchTimeLimitS: 20,
      matchTimeLimitOverrideIgnored: false,
    });
    for (const nodeEnv of [
      undefined,
      '',
      'production',
      'development',
      'TEST',
      ' test',
      'testing',
    ]) {
      const env = nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv };
      expect(loadConfig({ ...env, MATCH_TIME_LIMIT_S_OVERRIDE: '20' })).toMatchObject({
        matchTimeLimitS: MATCH_DEADLINE_S,
        matchTimeLimitOverrideIgnored: true,
      });
    }
  });

  it('never parses the override outside NODE_ENV=test, even when it is malformed', () => {
    expect(
      loadConfig({ NODE_ENV: 'production', MATCH_TIME_LIMIT_S_OVERRIDE: 'nonsense' })
        .matchTimeLimitS,
    ).toBe(MATCH_DEADLINE_S);
    expect(loadConfig({ NODE_ENV: 'test', MATCH_TIME_LIMIT_S_OVERRIDE: '' })).toMatchObject({
      matchTimeLimitS: MATCH_DEADLINE_S,
      matchTimeLimitOverrideIgnored: false,
    });
  });

  it('accepts an override up to MATCH_DEADLINE_S (ADR 0026)', () => {
    expect(
      loadConfig({ NODE_ENV: 'test', MATCH_TIME_LIMIT_S_OVERRIDE: '1500' }).matchTimeLimitS,
    ).toBe(1500);
    expect(
      loadConfig({ NODE_ENV: 'test', MATCH_TIME_LIMIT_S_OVERRIDE: '901' }).matchTimeLimitS,
    ).toBe(901);
  });

  it('throws on an invalid override under NODE_ENV=test', () => {
    for (const value of ['0', '-5', '1.5', '1501', '1e2', 'abc', '0x10']) {
      expect(() => loadConfig({ NODE_ENV: 'test', MATCH_TIME_LIMIT_S_OVERRIDE: value })).toThrow(
        /MATCH_TIME_LIMIT_S_OVERRIDE/,
      );
    }
  });
});
