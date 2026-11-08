// The WebSocket client of the multiplayer flow (#19, ADR 0004, ADR 0006): the main thread's only network owner; the
// worker never touches the network. It is created only when the player enters the multiplayer flow, never in single
// player. This file depends on `@vs/shared` alone (no DOM types, no `import.meta.env`), so the server's tests can run
// it against the real server (`packages/server/src/net-client.test.ts`); `browser-socket.ts` adapts `WebSocket`.
import {
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '@vs/shared';

/** What a socket reports back. `data` is a text frame as a string; anything else is ignored with a warning. */
export interface SocketHandlers {
  open(): void;
  message(data: unknown): void;
  close(code: number): void;
}

export interface Socket {
  send(data: string): void;
  close(): void;
}

/** Opens a socket to `url` that reports to `on`; it must call `on` asynchronously, never from inside this call. */
export type OpenSocket = (url: string, on: SocketHandlers) => Socket;

export type NetState = 'idle' | 'connecting' | 'open' | 'closed';

export type ServerMessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

/** `connect()` rejects when no `welcome` arrived this long after the socket was created. */
export const HELLO_TIMEOUT_MS = 5000;
/** Backoff of the three reconnect attempts after an unexpected close in the lobby. */
export const RECONNECT_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

export type ConnectFailure = 'versionMismatch' | 'timeout' | 'closed';

export class ConnectError extends Error {
  constructor(readonly reason: ConnectFailure) {
    super(`connect failed: ${reason}`);
    this.name = 'ConnectError';
  }
}

function decode(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') {
    console.warn('[net] ignored a non-text frame');
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    console.warn('[net] ignored a frame that is not JSON');
    return null;
  }
  const message = parseServerMessage(raw);
  if (!message) console.warn('[net] ignored an invalid server message');
  return message;
}

export class NetClient {
  state: NetState = 'idle';
  /** The `playerId` from the latest `welcome`; a reconnect gets a new one. */
  selfId: string | null = null;

  private socket: Socket | null = null;
  private pending: Promise<void> | null = null;
  private closedByUs = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly handlers = new Map<string, Set<(message: ServerMessage) => void>>();
  private readonly lostHandlers = new Set<() => void>();
  private readonly stateHandlers = new Set<(state: NetState) => void>();

  constructor(
    private readonly url: string,
    private readonly openSocket: OpenSocket,
    private readonly retryDelaysMs: readonly number[] = RECONNECT_DELAYS_MS,
    private readonly helloTimeoutMs = HELLO_TIMEOUT_MS,
  ) {}

  /**
   * Opens the socket and sends `hello { v: PROTOCOL_VERSION }`. Resolves on `welcome`; rejects with a `ConnectError`
   * on `error versionMismatch`, a close before `welcome`, or after `HELLO_TIMEOUT_MS`. Resolves at once when open.
   */
  connect(): Promise<void> {
    if (this.state === 'open') return Promise.resolve();
    if (this.pending) return this.pending;
    this.closedByUs = false;
    const attempt = this.handshake().finally(() => {
      if (this.pending === attempt) this.pending = null;
    });
    this.pending = attempt;
    return attempt;
  }

  /** Sends `message` when the socket is open; returns whether it was sent. Dropped otherwise. */
  send(message: ClientMessage): boolean {
    if (this.state !== 'open' || !this.socket) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  /** Calls `handler` for every valid server message of `type`. Returns the function that unsubscribes. */
  on<T extends ServerMessage['type']>(
    type: T,
    handler: (message: ServerMessageOf<T>) => void,
  ): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const wrapped = handler as (message: ServerMessage) => void;
    set.add(wrapped);
    return () => {
      set.delete(wrapped);
    };
  }

  /**
   * Called once an unexpected close was handled: after a reconnect succeeded or all retries failed. The room is
   * never rejoined, because the server removed the player when the socket closed (#18).
   */
  onLost(handler: () => void): () => void {
    this.lostHandlers.add(handler);
    return () => {
      this.lostHandlers.delete(handler);
    };
  }

  /** Called on every `state` change. */
  onState(handler: (state: NetState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  /** Closes the socket for good: no reconnect, no `onLost`. */
  close(): void {
    this.closedByUs = true;
    clearTimeout(this.retryTimer);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.setState('closed');
  }

  private setState(state: NetState): void {
    if (this.state === state) return;
    this.state = state;
    for (const handler of [...this.stateHandlers]) handler(state);
  }

  private emit(message: ServerMessage): void {
    const set = this.handlers.get(message.type);
    if (set) for (const handler of [...set]) handler(message);
  }

  private handshake(): Promise<void> {
    this.setState('connecting');
    return new Promise<void>((resolve, reject) => {
      let socket: Socket | null = null;
      let settled = false;
      const fail = (reason: ConnectFailure): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket?.close();
        if (this.socket === socket) this.socket = null;
        if (!this.closedByUs) this.setState('closed');
        reject(new ConnectError(reason));
      };
      const timer = setTimeout(() => {
        fail('timeout');
      }, this.helloTimeoutMs);
      try {
        socket = this.openSocket(this.url, {
          open: () => {
            socket?.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION }));
          },
          message: (data) => {
            const message = decode(data);
            if (!message) return;
            if (!settled) {
              if (message.type === 'error' && message.code === 'versionMismatch') {
                fail('versionMismatch');
                return;
              }
              if (message.type === 'welcome') {
                settled = true;
                clearTimeout(timer);
                this.selfId = message.playerId;
                this.setState('open');
                resolve();
              }
            }
            if (this.socket === socket) this.emit(message);
          },
          close: () => {
            if (!settled) {
              fail('closed');
              return;
            }
            if (this.socket !== socket) return;
            this.socket = null;
            void this.reconnect();
          },
        });
      } catch {
        // `new WebSocket` throws on a malformed URL.
        fail('closed');
        return;
      }
      this.socket = socket;
    });
  }

  /** A method, so the checks after each `await` in `reconnect` are not narrowed away: `close()` may run meanwhile. */
  private closed(): boolean {
    return this.closedByUs;
  }

  private async reconnect(): Promise<void> {
    if (this.closed()) return;
    this.setState('connecting');
    for (const delay of this.retryDelaysMs) {
      await new Promise<void>((resolve) => {
        this.retryTimer = setTimeout(resolve, delay);
      });
      if (this.closed()) return;
      try {
        await this.connect();
        break;
      } catch {
        // The next attempt, or `onLost` after the last one.
      }
    }
    if (this.closed()) return;
    for (const handler of [...this.lostHandlers]) handler();
  }
}
