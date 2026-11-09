import { randomUUID } from 'node:crypto';
import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '@vs/shared';
import type { WebSocket } from 'ws';
import { type Clock, type JoinLockout, TokenBucket } from './limits.js';
import { log } from './log.js';
import type { Outcome, RoomRegistry } from './rooms.js';

/** Close code for every protocol or policy violation (ADR 0011). */
export const POLICY_VIOLATION = 1008;
/** The second violation on one connection closes it. */
const MAX_VIOLATIONS = 2;
/** Heartbeat pings that may go unanswered before the socket is terminated. */
const MAX_MISSED_PONGS = 2;

const ERROR_TEXT: Record<ErrorCode, string> = {
  badMessage: 'malformed message',
  versionMismatch: `the first message must be hello with protocol version ${String(PROTOCOL_VERSION)}`,
  roomNotFound: 'no joinable room has this code',
  roomFull: 'the room is full',
  nicknameTaken: 'the nickname is taken in this room',
  invalidNickname: 'nicknames are 1-12 characters without control or invisible characters',
  notHost: 'only the host can start the match',
  notAllReady: 'every player must be ready, with at least 2 players',
  wrongPhase: 'not allowed in the current phase',
  rateLimited: 'too many messages',
};
const LOCKED_OUT_TEXT = 'too many failed joins; try again in a minute';

/** Shared by all connections of one server. */
export interface ConnectionContext {
  registry: RoomRegistry;
  lockout: JoinLockout;
  now: Clock;
  /** Live connections by player id, so the registry's `send` can reach them. */
  players: Map<string, Connection>;
}

function sizeOf(data: Buffer | ArrayBuffer | Buffer[]): number {
  return Array.isArray(data) ? data.reduce((sum, chunk) => sum + chunk.length, 0) : data.byteLength;
}

function textOf(data: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

/**
 * One WebSocket client (ADR 0006, ADR 0011). Every frame passes, in order: the token bucket, the text and size
 * check, `JSON.parse` in a `try`, `parseClientMessage`, and the `hello` gate. Only then does it reach the
 * registry. A malformed or out-of-phase message gets one `error`; the second closes with 1008. The first message
 * must be `hello` with the current version, and exceeding the rate limit sends `rateLimited` and closes with 1008.
 * Logs carry message types, sizes and room codes, never bodies or nicknames.
 */
export class Connection {
  private playerId: string | null = null;
  private violations = 0;
  private missedPongs = 0;
  private closing = false;
  private readonly bucket: TokenBucket;

  constructor(
    private readonly socket: WebSocket,
    private readonly ip: string,
    private readonly ctx: ConnectionContext,
  ) {
    this.bucket = new TokenBucket(ctx.now);
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      this.onMessage(data, isBinary);
    });
    socket.on('pong', () => {
      this.missedPongs = 0;
    });
    // ws answers client pings itself, without a 'message' event; they draw on the same bucket.
    socket.on('ping', () => {
      if (this.closing || this.bucket.take()) return;
      log('warn', 'rate_limited', { size: 0 });
      this.close('rate_limited');
    });
    // Frame-level violations (oversized: 1009, invalid UTF-8: 1007) surface here and ws closes the socket.
    // Without a listener the error would be thrown and stop the process.
    socket.on('error', (err: Error & { code?: string }) => {
      log('warn', 'socket_error', { code: err.code ?? 'unknown' });
    });
  }

  /** Called by the server when the socket has closed. */
  closed(): void {
    this.closing = true;
    if (this.playerId !== null) {
      this.ctx.players.delete(this.playerId);
      this.ctx.registry.disconnect(this.playerId);
    }
  }

  /** Called every heartbeat interval: ping, and terminate after `MAX_MISSED_PONGS` unanswered pings. */
  heartbeat(): void {
    if (this.missedPongs >= MAX_MISSED_PONGS) {
      log('info', 'heartbeat_timeout');
      this.socket.terminate();
      return;
    }
    this.missedPongs++;
    this.socket.ping();
  }

  send(message: ServerMessage): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private close(reason: string): void {
    if (this.closing) return;
    this.closing = true;
    log('info', 'close_policy', { reason });
    this.socket.close(POLICY_VIOLATION, reason);
  }

  private sendError(code: ErrorCode, text = ERROR_TEXT[code]): void {
    this.send({ type: 'error', code, message: text });
  }

  /** One `error`; the `MAX_VIOLATIONS`-th violation closes the socket with 1008. */
  private violation(code: ErrorCode, reason: string, size: number): void {
    this.violations++;
    log('info', 'violation', { reason, size, count: this.violations });
    this.sendError(code);
    if (this.violations >= MAX_VIOLATIONS) this.close('violation');
  }

  private onMessage(data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean): void {
    if (this.closing) return;
    const size = sizeOf(data);

    if (!this.bucket.take()) {
      log('warn', 'rate_limited', { size });
      this.sendError('rateLimited');
      this.close('rate_limited');
      return;
    }

    let message: ClientMessage | null = null;
    // ws already refuses frames over maxPayload (1009); this re-check keeps the limit if that setting changes.
    if (!isBinary && size <= MAX_MESSAGE_BYTES) {
      try {
        message = parseClientMessage(JSON.parse(textOf(data)) as unknown);
      } catch {
        message = null;
      }
    }

    if (this.playerId === null) {
      if (message?.type !== 'hello' || message.v !== PROTOCOL_VERSION) {
        log('info', 'version_mismatch', { size });
        this.sendError('versionMismatch');
        this.close('version_mismatch');
        return;
      }
      this.playerId = randomUUID();
      this.ctx.players.set(this.playerId, this);
      log('debug', 'message', { type: 'hello', size });
      this.send({ type: 'welcome', playerId: this.playerId });
      return;
    }

    if (message === null) {
      this.violation(
        'badMessage',
        isBinary ? 'binary' : size > MAX_MESSAGE_BYTES ? 'size' : 'schema',
        size,
      );
      return;
    }
    log('debug', 'message', { type: message.type, size });
    try {
      this.handle(this.playerId, message, size);
    } catch (err) {
      // A bug in a handler must not stop the process (and with it every other room).
      log('error', 'handler_failed', {
        type: message.type,
        error: err instanceof Error ? err.message : 'unknown',
      });
      this.sendError('badMessage');
    }
  }

  private handle(playerId: string, message: ClientMessage, size: number): void {
    const { registry } = this.ctx;
    let outcome: Outcome;
    switch (message.type) {
      case 'hello':
        outcome = { error: 'wrongPhase', violation: true };
        break;
      case 'createRoom':
        outcome = registry.createRoom(playerId, message.nickname);
        break;
      case 'joinRoom':
        if (this.ctx.lockout.isLocked(this.ip)) {
          log('debug', 'join_locked_out');
          this.sendError('rateLimited', LOCKED_OUT_TEXT);
          return;
        }
        outcome = registry.joinRoom(playerId, message.code, message.nickname);
        if (outcome?.error === 'roomNotFound') this.ctx.lockout.recordFailure(this.ip);
        break;
      case 'leaveRoom':
        outcome = registry.leaveRoom(playerId);
        break;
      case 'setReady':
        outcome = registry.setReady(playerId, message.ready);
        break;
      case 'startMatch':
        outcome = registry.startMatch(playerId);
        break;
      case 'status':
        outcome = registry.status(playerId, message.status);
        break;
      case 'interference':
        outcome = registry.interference(playerId, message.kind);
        break;
      case 'died':
        outcome = registry.died(playerId, message.kills);
        break;
      case 'survived':
        outcome = registry.survived(playerId, message.kills);
        break;
      case 'visibility':
        outcome = registry.visibility(playerId, message.hidden);
        break;
      case 'view':
        outcome = registry.relayView(playerId, message.view);
        break;
      default:
        assertNever(message);
    }
    if (outcome === null) return;
    if (outcome.violation) {
      this.violation(outcome.error, `phase:${message.type}`, size);
    } else {
      log('debug', 'refused', { type: message.type, code: outcome.error });
      this.sendError(outcome.error);
    }
  }
}

function assertNever(x: never): never {
  throw new Error(`unhandled message type ${String((x as { type?: unknown }).type)}`);
}
