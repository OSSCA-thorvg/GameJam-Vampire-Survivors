import { expect, it } from 'vitest';
import { buildCsp, serverSource } from './csp';

it('derives the connect-src source from the server URL, without its path', () => {
  expect(serverSource('wss://game.example:8443/ws', true)).toBe('wss://game.example:8443');
  expect(serverSource(' wss://game.example/ws ', true)).toBe('wss://game.example');
  expect(serverSource('ws://localhost:8787/ws', false)).toBe('ws://localhost:8787');
});

it('has no server source when VITE_SERVER_URL is unset or blank', () => {
  expect(serverSource(undefined, true)).toBeNull();
  expect(serverSource('  ', true)).toBeNull();
});

it('rejects URLs that cannot be a safe connect-src entry', () => {
  expect(() => serverSource('ws://game.example/ws', true)).toThrow(/wss/);
  expect(() => serverSource('https://game.example/ws', false)).toThrow(/ws:\/\/ or wss:\/\//);
  expect(() => serverSource('not a url', false)).toThrow(/not a URL/);
  expect(() => serverSource('wss://user:pw@game.example/ws', false)).toThrow(/credentials/);
});

it('builds the ADR 0011 policy, with frame-ancestors only for a header', () => {
  const meta = buildCsp('wss://game.example', false);
  expect(meta).toBe(
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' wss://game.example; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
  );
  expect(buildCsp(null, false)).toContain("connect-src 'self'; img-src");
  expect(buildCsp(null, true).endsWith("; frame-ancestors 'none'")).toBe(true);
  expect(meta).not.toContain("'unsafe-eval'");
  expect(meta).not.toContain("'unsafe-inline'");
});
