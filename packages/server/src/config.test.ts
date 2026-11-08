import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses the defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({
      port: 8787,
      logLevel: 'info',
      allowedOrigins: ['http://localhost:5173', 'http://localhost:5180'],
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
});
