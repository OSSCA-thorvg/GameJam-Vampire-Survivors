import {
  AFK_FORFEIT_MS,
  DISCONNECT_GRACE_MS,
  MAX_PLAYERS_DEFAULT,
  SIMULTANEOUS_DEATH_WINDOW_MS,
  START_DELAY_MS,
  STATUS_MIN_INTERVAL_MS,
  normalizeNickname,
  type EliminationReason,
  type ErrorCode,
  type InterferenceKind,
  type PlayerInfo,
  type PlayerStatus,
  type RankingEntry,
  type RoomPhase,
  type ServerMessage,
} from '@vs/shared';
import { cryptoRandom, generateRoomCode, type RandomInt } from './code.js';

/** After `matchResult`, the room returns to `lobby` (ready flags cleared) this much later, for a rematch. */
export const REMATCH_DELAY_MS = 5_000;

/** Opaque: a Node `Timeout` in the server, a number in tests. */
export type TimerHandle = object | number;

/** Timer scheduling, injected so tests run on a fake clock. */
export interface Timers {
  set(fn: () => void, ms: number): TimerHandle;
  clear(handle: TimerHandle): void;
}

export interface RegistryDeps {
  /** Server time in epoch ms; deaths are ordered by it (ADR 0005). */
  now: () => number;
  timers: Timers;
  /** Delivers one message to one connected player. */
  send: (playerId: string, message: ServerMessage) => void;
  /** Interference target choice; `crypto.randomInt` by default. */
  randomInt?: RandomInt;
  /** Match seed, a uint32; `crypto.randomInt(2^32)` by default. */
  randomSeed?: () => number;
  maxPlayers?: number;
  /** Structured events for the log (room codes and counts only, never nicknames). */
  onEvent?: (event: string, fields: Record<string, string | number>) => void;
}

/**
 * The answer to a request: `null` when it was accepted (or dropped as a late in-match message), otherwise the
 * error to send. `violation` marks protocol misuse (a message that makes no sense in the sender's state), which
 * the connection counts towards its 1008 close; ordinary refusals such as `roomNotFound` or `notAllReady` do not count.
 */
export type Outcome = { error: ErrorCode; violation: boolean } | null;

const refuse = (error: ErrorCode): Outcome => ({ error, violation: false });
const violation = (error: ErrorCode): Outcome => ({ error, violation: true });

interface Player {
  id: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
  // Match state, reset when a match starts.
  eliminated: boolean;
  eliminatedAt: number;
  survived: boolean;
  kills: number;
  lastStatusAt: number | null;
  away: boolean;
  afkTimer: TimerHandle | null;
  graceTimer: TimerHandle | null;
}

interface Room {
  code: string;
  phase: RoomPhase;
  /** In join order; the host is `hostId`, handed to the oldest remaining player when the host leaves. */
  players: Player[];
  hostId: string;
  countdownTimer: TimerHandle | null;
  decideTimer: TimerHandle | null;
  resetTimer: TimerHandle | null;
}

/** Read-only view of a room for tests and logs. */
export interface RoomView {
  code: string;
  phase: RoomPhase;
  hostId: string;
  players: {
    id: string;
    nickname: string;
    ready: boolean;
    connected: boolean;
    eliminated: boolean;
  }[];
}

/**
 * In-memory rooms and the match lifecycle (ADR 0005, ADR 0006). No I/O: time, timers, randomness and delivery
 * are injected. Callers pass only messages that already passed `parseClientMessage`; nicknames are normalized here.
 *
 * Phases: `lobby` → (`startMatch` by the host, ≥ 2 players, all ready) `countdown` → (at `startAt`) `playing` →
 * (result decided) `finished` → (after `REMATCH_DELAY_MS`) `lobby`. A room is deleted when its last connected
 * player leaves.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  /** The room of every player that is connected and attached to one. */
  private readonly playerRoom = new Map<string, Room>();
  private readonly now: () => number;
  private readonly timers: Timers;
  private readonly deliver: (playerId: string, message: ServerMessage) => void;
  private readonly randomInt: RandomInt;
  private readonly randomSeed: () => number;
  private readonly maxPlayers: number;
  private readonly onEvent: (event: string, fields: Record<string, string | number>) => void;

  constructor(deps: RegistryDeps) {
    this.now = deps.now;
    this.timers = deps.timers;
    this.deliver = deps.send;
    this.randomInt = deps.randomInt ?? cryptoRandom;
    this.randomSeed = deps.randomSeed ?? (() => cryptoRandom(2 ** 32));
    this.maxPlayers = deps.maxPlayers ?? MAX_PLAYERS_DEFAULT;
    this.onEvent =
      deps.onEvent ??
      (() => {
        /* no logging */
      });
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  view(code: string): RoomView | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players: room.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        ready: p.ready,
        connected: p.connected,
        eliminated: p.eliminated,
      })),
    };
  }

  roomCodeOf(playerId: string): string | null {
    return this.playerRoom.get(playerId)?.code ?? null;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Lobby

  createRoom(playerId: string, rawNickname: string): Outcome {
    if (this.playerRoom.has(playerId)) return violation('wrongPhase');
    const nickname = normalizeNickname(rawNickname);
    if (nickname === null) return refuse('invalidNickname');
    const code = generateRoomCode((c) => this.rooms.has(c));
    const room: Room = {
      code,
      phase: 'lobby',
      players: [],
      hostId: playerId,
      countdownTimer: null,
      decideTimer: null,
      resetTimer: null,
    };
    this.rooms.set(code, room);
    this.addPlayer(room, playerId, nickname);
    this.onEvent('room_created', { code });
    this.broadcastState(room);
    return null;
  }

  /**
   * `roomNotFound` when no live room with the code can be joined: missing, full or in a match, so the answer never
   * reveals that a code exists (ADR 0011). The caller counts it towards the join lockout. `nicknameTaken` comes
   * only after the room is known to be joinable.
   */
  joinRoom(playerId: string, code: string, rawNickname: string): Outcome {
    if (this.playerRoom.has(playerId)) return violation('wrongPhase');
    const nickname = normalizeNickname(rawNickname);
    if (nickname === null) return refuse('invalidNickname');
    const room = this.rooms.get(code);
    if (room?.phase !== 'lobby' || room.players.length >= this.maxPlayers) {
      return refuse('roomNotFound');
    }
    const folded = nickname.toLowerCase();
    if (room.players.some((p) => p.nickname.toLowerCase() === folded)) {
      return refuse('nicknameTaken');
    }
    this.addPlayer(room, playerId, nickname);
    this.onEvent('room_joined', { code, players: room.players.length });
    this.broadcastState(room);
    return null;
  }

  leaveRoom(playerId: string): Outcome {
    const room = this.playerRoom.get(playerId);
    if (!room) return violation('wrongPhase');
    this.detach(room, playerId, 'left');
    return null;
  }

  setReady(playerId: string, ready: boolean): Outcome {
    const room = this.playerRoom.get(playerId);
    if (!room) return violation('wrongPhase');
    if (room.phase !== 'lobby') return refuse('wrongPhase');
    const player = this.player(room, playerId);
    if (player.ready !== ready) {
      player.ready = ready;
      this.broadcastState(room);
    }
    return null;
  }

  startMatch(playerId: string): Outcome {
    const room = this.playerRoom.get(playerId);
    if (!room) return violation('wrongPhase');
    if (room.hostId !== playerId) return refuse('notHost');
    if (room.phase !== 'lobby') return refuse('wrongPhase');
    if (room.players.length < 2 || room.players.some((p) => !p.ready)) {
      return refuse('notAllReady');
    }
    const seed = this.randomSeed();
    const startAt = this.now() + START_DELAY_MS;
    room.phase = 'countdown';
    for (const p of room.players) this.resetMatchState(p);
    room.countdownTimer = this.timers.set(() => {
      room.countdownTimer = null;
      if (this.rooms.get(room.code) !== room || room.phase !== 'countdown') return;
      room.phase = 'playing';
      this.broadcastState(room);
    }, START_DELAY_MS);
    this.onEvent('match_start', { code: room.code, players: room.players.length });
    this.broadcast(room, { type: 'matchStart', seed, startAt });
    this.broadcastState(room);
    return null;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Match

  /** Relays at most one `status` per `STATUS_MIN_INTERVAL_MS` per player as `peerStatus` to the others. */
  status(playerId: string, status: PlayerStatus): Outcome {
    const found = this.inMatch(playerId);
    if (found === 'violation') return violation('wrongPhase');
    if (found === null) return null;
    const { room, player } = found;
    const t = this.now();
    if (player.lastStatusAt !== null && t - player.lastStatusAt < STATUS_MIN_INTERVAL_MS)
      return null;
    player.lastStatusAt = t;
    player.kills = status.kills;
    this.broadcast(room, { type: 'peerStatus', playerId, status }, playerId);
    return null;
  }

  /** Routes interference to one living, connected opponent chosen at random; only during `playing`. */
  interference(playerId: string, kind: InterferenceKind): Outcome {
    const found = this.inMatch(playerId);
    if (found === 'violation') return violation('wrongPhase');
    if (found === null) return null;
    const { room, player } = found;
    if (room.phase !== 'playing') return null;
    const targets = room.players.filter((p) => p.id !== playerId && !p.eliminated && p.connected);
    if (targets.length === 0) return null;
    const target = targets.length === 1 ? targets[0] : targets[this.randomInt(targets.length)];
    if (target === undefined) return null;
    this.deliver(target.id, {
      type: 'interferenceIncoming',
      kind,
      fromPlayerId: playerId,
      fromNickname: player.nickname,
    });
    return null;
  }

  died(playerId: string, kills: number): Outcome {
    const found = this.inMatch(playerId);
    if (found === 'violation') return violation('wrongPhase');
    if (found === null) return null;
    found.player.kills = kills;
    this.eliminate(found.room, found.player, 'died');
    return null;
  }

  /** The local time limit was reached; only during `playing`. */
  survived(playerId: string, kills: number): Outcome {
    const found = this.inMatch(playerId);
    if (found === 'violation') return violation('wrongPhase');
    if (found === null) return null;
    const { room, player } = found;
    if (room.phase !== 'playing') return null;
    player.kills = kills;
    player.survived = true;
    this.evaluate(room);
    return null;
  }

  /** Starts or cancels the `AFK_FORFEIT_MS` timer; dropped outside `countdown`/`playing`. */
  visibility(playerId: string, hidden: boolean): Outcome {
    const room = this.playerRoom.get(playerId);
    if (!room) return violation('wrongPhase');
    if (room.phase !== 'countdown' && room.phase !== 'playing') return null;
    const player = this.player(room, playerId);
    if (player.eliminated) return null;
    if (hidden && !player.away) {
      player.away = true;
      player.afkTimer = this.timers.set(() => {
        player.afkTimer = null;
        if (this.rooms.get(room.code) !== room) return;
        this.eliminate(room, player, 'afk');
      }, AFK_FORFEIT_MS);
      this.broadcast(room, { type: 'peerAway', playerId, away: true }, playerId);
    } else if (!hidden && player.away) {
      player.away = false;
      this.clearTimer(player.afkTimer);
      player.afkTimer = null;
      this.broadcast(room, { type: 'peerAway', playerId, away: false }, playerId);
    }
    return null;
  }

  /** The player's socket closed. */
  disconnect(playerId: string): void {
    const room = this.playerRoom.get(playerId);
    if (room) this.detach(room, playerId, 'disconnected');
  }

  // -------------------------------------------------------------------------------------------------------------
  // Internals

  private addPlayer(room: Room, id: string, nickname: string): void {
    room.players.push({
      id,
      nickname,
      ready: false,
      connected: true,
      eliminated: false,
      eliminatedAt: 0,
      survived: false,
      kills: 0,
      lastStatusAt: null,
      away: false,
      afkTimer: null,
      graceTimer: null,
    });
    this.playerRoom.set(id, room);
  }

  private player(room: Room, id: string): Player {
    const player = room.players.find((p) => p.id === id);
    if (!player) throw new Error('player not in room');
    return player;
  }

  /**
   * The sender's room and record for an in-match message. `'violation'` when the sender is in no room or its room
   * is in `lobby`; `null` when the message is late (room `finished`, or the sender already eliminated) and is
   * dropped silently.
   */
  private inMatch(playerId: string): { room: Room; player: Player } | 'violation' | null {
    const room = this.playerRoom.get(playerId);
    if (!room || room.phase === 'lobby') return 'violation';
    if (room.phase === 'finished') return null;
    const player = this.player(room, playerId);
    if (player.eliminated) return null;
    return { room, player };
  }

  /**
   * Removes the player's connection from the room. In `lobby` the player is removed; during a match the record
   * stays (shown as disconnected) and is eliminated after `DISCONNECT_GRACE_MS`, or at once for `leaveRoom`.
   */
  private detach(room: Room, playerId: string, why: 'left' | 'disconnected'): void {
    this.playerRoom.delete(playerId);
    const player = this.player(room, playerId);
    player.connected = false;
    this.clearTimer(player.afkTimer);
    player.afkTimer = null;

    if (!room.players.some((p) => p.connected)) {
      this.deleteRoom(room);
      return;
    }

    if (room.phase === 'lobby') {
      this.removePlayer(room, player);
      this.onEvent('room_left', { code: room.code, players: room.players.length });
      this.broadcastState(room);
      return;
    }

    this.broadcastState(room);
    if (room.phase === 'finished' || player.eliminated) return;
    if (why === 'left') {
      this.eliminate(room, player, 'disconnected');
      return;
    }
    player.graceTimer = this.timers.set(() => {
      player.graceTimer = null;
      if (this.rooms.get(room.code) !== room) return;
      this.eliminate(room, player, 'disconnected');
    }, DISCONNECT_GRACE_MS);
  }

  private removePlayer(room: Room, player: Player): void {
    room.players = room.players.filter((p) => p !== player);
    const first = room.players[0];
    if (room.hostId === player.id && first) room.hostId = first.id;
  }

  private deleteRoom(room: Room): void {
    this.clearTimer(room.countdownTimer);
    this.clearTimer(room.decideTimer);
    this.clearTimer(room.resetTimer);
    for (const p of room.players) {
      this.clearPlayerTimers(p);
      if (this.playerRoom.get(p.id) === room) this.playerRoom.delete(p.id);
    }
    this.rooms.delete(room.code);
    this.onEvent('room_deleted', { code: room.code });
  }

  private resetMatchState(p: Player): void {
    this.clearPlayerTimers(p);
    p.eliminated = false;
    p.eliminatedAt = 0;
    p.survived = false;
    p.kills = 0;
    p.lastStatusAt = null;
    p.away = false;
  }

  private clearPlayerTimers(p: Player): void {
    this.clearTimer(p.afkTimer);
    this.clearTimer(p.graceTimer);
    p.afkTimer = null;
    p.graceTimer = null;
  }

  private clearTimer(handle: TimerHandle | null): void {
    if (handle !== null) this.timers.clear(handle);
  }

  private eliminate(room: Room, player: Player, reason: EliminationReason): void {
    if (player.eliminated || (room.phase !== 'countdown' && room.phase !== 'playing')) return;
    player.eliminated = true;
    player.eliminatedAt = this.now();
    this.clearPlayerTimers(player);
    this.onEvent('player_eliminated', { code: room.code, reason });
    this.broadcast(room, { type: 'playerEliminated', playerId: player.id, reason });
    this.evaluate(room);
  }

  /**
   * Win rule (ADR 0005). When at most one player is left alive, the result waits `SIMULTANEOUS_DEATH_WINDOW_MS`
   * after that death: if a player is still alive then, they win (the others died first, or more than the window
   * earlier); if nobody is, every one of those last deaths arrived within the window of each other, a draw. When
   * every living player has survived the time limit, the most kills win and a tie is a draw.
   */
  private evaluate(room: Room): void {
    if (room.phase !== 'countdown' && room.phase !== 'playing') return;
    if (room.decideTimer !== null) return;
    const alive = room.players.filter((p) => !p.eliminated);
    if (alive.length <= 1) {
      room.decideTimer = this.timers.set(() => {
        room.decideTimer = null;
        if (this.rooms.get(room.code) !== room) return;
        this.decideLastAlive(room);
      }, SIMULTANEOUS_DEATH_WINDOW_MS);
      return;
    }
    if (alive.every((p) => p.survived)) {
      const top = Math.max(...alive.map((p) => p.kills));
      const leaders = alive.filter((p) => p.kills === top);
      const winner = leaders.length === 1 ? leaders[0] : undefined;
      this.finish(room, winner ?? null);
    }
  }

  private decideLastAlive(room: Room): void {
    if (room.phase !== 'countdown' && room.phase !== 'playing') return;
    const alive = room.players.filter((p) => !p.eliminated);
    if (alive.length > 1) {
      this.evaluate(room);
      return;
    }
    this.finish(room, alive[0] ?? null);
  }

  private finish(room: Room, winner: Player | null): void {
    room.phase = 'finished';
    this.clearTimer(room.countdownTimer);
    this.clearTimer(room.decideTimer);
    room.countdownTimer = null;
    room.decideTimer = null;
    for (const p of room.players) this.clearPlayerTimers(p);

    const ranking: RankingEntry[] = room.players
      .map((p, order) => ({ p, order }))
      .sort(
        (a, b) =>
          Number(a.p.eliminated) - Number(b.p.eliminated) ||
          b.p.kills - a.p.kills ||
          a.order - b.order,
      )
      .map(({ p }) => ({
        playerId: p.id,
        nickname: p.nickname,
        alive: !p.eliminated,
        kills: p.kills,
      }));

    const outcome = winner ? 'win' : 'draw';
    this.onEvent('match_result', { code: room.code, outcome });
    this.broadcast(room, { type: 'matchResult', outcome, winnerId: winner?.id ?? null, ranking });
    this.broadcastState(room);
    room.resetTimer = this.timers.set(() => {
      room.resetTimer = null;
      if (this.rooms.get(room.code) !== room) return;
      this.backToLobby(room);
    }, REMATCH_DELAY_MS);
  }

  private backToLobby(room: Room): void {
    for (const p of room.players.filter((q) => !q.connected)) this.removePlayer(room, p);
    if (room.players.length === 0) {
      this.deleteRoom(room);
      return;
    }
    for (const p of room.players) {
      p.ready = false;
      this.resetMatchState(p);
    }
    room.phase = 'lobby';
    this.broadcastState(room);
  }

  private broadcast(room: Room, message: ServerMessage, exceptId?: string): void {
    for (const p of room.players) {
      if (p.connected && p.id !== exceptId) this.deliver(p.id, message);
    }
  }

  private broadcastState(room: Room): void {
    const players: PlayerInfo[] = room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      ready: p.ready,
      host: p.id === room.hostId,
      connected: p.connected,
    }));
    this.broadcast(room, {
      type: 'roomState',
      code: room.code,
      maxPlayers: this.maxPlayers,
      players,
      phase: room.phase,
    });
  }
}
