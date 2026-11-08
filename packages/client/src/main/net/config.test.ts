import { expect, it } from 'vitest';
import { DEV_SERVER_URL, resolveServerUrl } from './config';

it('uses the configured URL, trimmed, in every build', () => {
  expect(resolveServerUrl(' wss://game.example/ws ', false)).toBe('wss://game.example/ws');
  expect(resolveServerUrl('wss://game.example/ws', true)).toBe('wss://game.example/ws');
});

it('falls back to the local server only in dev and e2e builds', () => {
  expect(resolveServerUrl(undefined, true)).toBe(DEV_SERVER_URL);
  expect(resolveServerUrl('  ', true)).toBe(DEV_SERVER_URL);
});

it('has no server in a production build without VITE_SERVER_URL', () => {
  expect(resolveServerUrl(undefined, false)).toBeNull();
  expect(resolveServerUrl('', false)).toBeNull();
});
