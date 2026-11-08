import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer, type RunningServer } from './index.js';

const ALLOWED = 'http://localhost:5173';

describe('server', () => {
  let server: RunningServer;
  let base: string;

  beforeAll(async () => {
    server = await startServer({ port: 0, logLevel: 'info', allowedOrigins: [ALLOWED] });
    base = `localhost:${String(server.port)}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('answers GET /healthz with 200 ok and no caching', async () => {
    const res = await fetch(`http://${base}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('ok');
  });

  it('answers every other request with 404', async () => {
    const res = await fetch(`http://${base}/`);
    expect(res.status).toBe(404);
  });

  it('greets a client from an allowed Origin with the protocol version', async () => {
    const socket = new WebSocket(`ws://${base}/ws`, { origin: ALLOWED });
    const first = await new Promise<string>((resolve, reject) => {
      socket.once('message', (data: Buffer) => {
        resolve(data.toString());
      });
      socket.once('error', reject);
    });
    socket.close();
    expect(JSON.parse(first)).toEqual({ type: 'hello', protocol: 1 });
  });

  it('rejects an upgrade from a disallowed Origin with 403', async () => {
    const socket = new WebSocket(`ws://${base}/ws`, { origin: 'http://evil.example' });
    const status = await new Promise<number | undefined>((resolve) => {
      socket.once('unexpected-response', (_req, res) => {
        resolve(res.statusCode);
      });
      socket.once('error', () => {
        resolve(undefined);
      });
    });
    expect(status).toBe(403);
  });

  it('closes the socket with 1003 on any message', async () => {
    const socket = new WebSocket(`ws://${base}/ws`, { origin: ALLOWED });
    const code = await new Promise<number>((resolve, reject) => {
      socket.once('message', () => {
        socket.send('{"type":"ping"}');
      });
      socket.once('close', (closeCode: number) => {
        resolve(closeCode);
      });
      socket.once('error', reject);
    });
    expect(code).toBe(1003);
  });

  it('closes the socket with 1009 on a message over 4 KiB', async () => {
    const socket = new WebSocket(`ws://${base}/ws`, { origin: ALLOWED });
    const code = await new Promise<number>((resolve) => {
      socket.once('message', () => {
        socket.send('x'.repeat(4097));
      });
      socket.once('close', (closeCode: number) => {
        resolve(closeCode);
      });
    });
    expect(code).toBe(1009);
  });
});
