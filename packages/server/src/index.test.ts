import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from './index.js';

describe('server', () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await startServer({ port: 0 });
  });

  afterAll(async () => {
    await server.close();
  });

  it('answers GET /healthz with 200 ok', async () => {
    const res = await fetch(`http://localhost:${String(server.port)}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('answers every other request with 404', async () => {
    const res = await fetch(`http://localhost:${String(server.port)}/`);
    expect(res.status).toBe(404);
  });
});
