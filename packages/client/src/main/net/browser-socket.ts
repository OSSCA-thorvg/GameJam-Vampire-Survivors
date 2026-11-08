import type { OpenSocket } from './client';

/** `OpenSocket` over the browser's `WebSocket`; text frames arrive as strings. */
export const browserSocket: OpenSocket = (url, on) => {
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => {
    on.open();
  });
  ws.addEventListener('message', (event: MessageEvent<unknown>) => {
    on.message(event.data);
  });
  ws.addEventListener('close', (event) => {
    on.close(event.code);
  });
  return {
    send: (data) => {
      ws.send(data);
    },
    close: () => {
      ws.close();
    },
  };
};
