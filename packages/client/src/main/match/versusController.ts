// One versus match on the main thread (#20, ADRs 0004, 0005, 0006): it bridges the game worker and the server
// socket. The worker simulates this player's own world from the match seed; nothing here synchronizes worlds. What
// the player sees of the others is the opponent panel, fed only by the server's relayed messages.
import {
  INTERFERENCE,
  interferenceIndex,
  MATCH_DEADLINE_GRACE_S,
  MATCH_TIME_LIMIT_S,
  STATUS_MIN_INTERVAL_MS,
  type ClientMessage,
  type EliminationReason,
  type InterferenceKind,
  type PlayerInfo,
  type PlayerStatus,
  type ServerMessage,
} from '@vs/shared';
import type { MainToWorker, RunSummary, WorkerStatus } from '../../protocol/worker-messages';
import type { NetClient } from '../net/client';
import type { AssetUrl } from '../ui/asset-url';
import { h } from '../ui/dom';
import { mount as mountBanners, type InterferenceBanner } from '../ui/interference-banner';
import type { RoomState } from '../ui/lobby';
import { mount as mountPanel, type OpponentPanel } from '../ui/opponent-panel';
import type { VersusResult } from '../ui/versus-result';

/**
 * Least time between two `status` messages sent (#20): the server relays at most one per `STATUS_MIN_INTERVAL_MS` by
 * its own receive time and drops the rest, so the client waits a little longer and network jitter loses none.
 */
export const STATUS_SEND_INTERVAL_MS = STATUS_MIN_INTERVAL_MS + 10;

export const SURVIVED_BANNER = 'Survived! Waiting for others';
export const OFFLINE_BANNER = 'Disconnected from server — result unavailable';
export const SELF_DEADLINE_NOTE =
  'Time ran out on the server: you were counted as survived with your last reported kills.';
export const PEER_DEADLINE_NOTE =
  'Time ran out on the server: players who had not finished were counted as survived with their last reported kills.';

/** What a versus match starts from (#19's `startVersus`): the `matchStart`, the room and this player's character. */
export interface VersusStart {
  seed: number;
  /** `matchStart.startAt`, server time in ms. */
  startAt: number;
  roomCode: string;
  selfId: string;
  players: PlayerInfo[];
  characterId: string;
}

export type VersusNet = Pick<NetClient, 'send' | 'on' | 'onState' | 'state'>;

export interface VersusControllerOptions {
  net: VersusNet;
  post: (message: MainToWorker) => void;
  /** Where the opponent panel and the in-match banner go (the app's screen root). */
  root: HTMLElement;
  start: VersusStart;
  /** The match is over for this player: the server's result, or the local result once offline. Called once. */
  onResult: (result: VersusResult) => void;
  /** The socket left `open` during the match; nothing more is sent. Called once. */
  onOffline: () => void;
  /** Resolves the interference banner's `fx.warning` icon (#21); no icon when omitted. */
  iconUrl?: AssetUrl;
  /** Wall clock, `Date.now` unless a test passes another. */
  now?: () => number;
  setTimer?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
  raf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
}

export interface VersusController {
  /** A worker `status`: relayed as `ClientMessage.status`, at most once per `STATUS_SEND_INTERVAL_MS`. */
  status(message: WorkerStatus): void;
  /** The worker's `gameOver`: `died` or `survived`, or the unofficial result when offline. */
  gameOver(stats: RunSummary): void;
  /** The worker's `interferenceCollected` (#21): sent as `ClientMessage.interference`; the server picks the target. */
  interferenceCollected(kind: InterferenceKind): void;
  /** The interference banners shown now (#21, the `banners` snapshot field). */
  banners(): string[];
  /** Removes the panel, banner, listeners and timers; restores the `'pause'` background policy. Idempotent. */
  dispose(): void;
}

type MatchResult = Extract<ServerMessage, { type: 'matchResult' }>;

/** The headline for this player from a `matchResult` (ADR 0005). */
export function headlineOf(
  result: Pick<MatchResult, 'outcome' | 'winnerId'>,
  selfId: string,
): 'Win' | 'Lose' | 'Draw' {
  if (result.outcome === 'draw') return 'Draw';
  return result.winnerId === selfId ? 'Win' : 'Lose';
}

/**
 * Starts the match: mounts the opponent panel, switches the worker to the `'simulate'` background policy (a hidden
 * tab keeps playing, ADR 0004) and starts a `'versus'` run with the match seed and `finale: 'end'`, so Death never
 * spawns (ADR 0005).
 */
export function createVersusController(opts: VersusControllerOptions): VersusController {
  const { net, post, root, start } = opts;
  const doc = root.ownerDocument;
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer =
    opts.clearTimer ??
    ((id: ReturnType<typeof setTimeout>) => {
      clearTimeout(id);
    });
  const { selfId } = start;

  /** No more messages to the server: the result arrived, or the socket left `open`. */
  let finished = false;
  let offline = net.state !== 'open';
  /** The local run is over: what was reported. */
  let localOver: 'died' | 'survived' | null = null;
  let selfOut = false;
  let disposed = false;
  let lastSentAt: number | null = null;
  let latest: PlayerStatus | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Why each eliminated player is out, for the result's ranking; no prototype, as the keys are server ids. */
  const out = Object.create(null) as Record<string, EliminationReason>;

  const panel: OpponentPanel = mountPanel(root, {
    players: start.players,
    selfId,
    ...(opts.raf ? { raf: opts.raf } : {}),
    ...(opts.cancelRaf ? { cancelRaf: opts.cancelRaf } : {}),
  });
  const banner = h('p', { class: 'versus-banner', role: 'status' });
  root.append(banner);
  const incoming: InterferenceBanner = mountBanners(root, {
    iconUrl: opts.iconUrl ?? (() => null),
    setTimer,
    clearTimer,
  });

  const send = (message: ClientMessage): void => {
    if (!finished && !offline) net.send(message);
  };
  const cancelPending = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    latest = null;
  };
  const sendLatest = (): void => {
    timer = null;
    if (!latest || finished || offline || selfOut || localOver) return;
    send({ type: 'status', status: latest });
    latest = null;
    lastSentAt = now();
  };
  const restorePolicy = (): void => {
    post({ type: 'setBackgroundPolicy', policy: 'pause' });
  };
  const finish = (result: VersusResult): void => {
    if (finished) return;
    finished = true;
    cancelPending();
    restorePolicy();
    opts.onResult(result);
  };
  const goOffline = (): void => {
    if (offline || finished) return;
    offline = true;
    cancelPending();
    banner.textContent = OFFLINE_BANNER;
    opts.onOffline();
  };

  const onVisibility = (): void => {
    send({ type: 'visibility', hidden: doc.hidden });
  };

  const off = [
    net.on('roomState', (room: RoomState) => {
      panel.setPlayers(room.players);
    }),
    net.on('peerStatus', (m) => {
      panel.status(m.playerId, m.status);
    }),
    net.on('peerAway', (m) => {
      panel.away(m.playerId, m.away);
    }),
    net.on('playerEliminated', (m) => {
      out[m.playerId] = m.reason;
      if (m.playerId === selfId) {
        selfOut = true;
        cancelPending();
      } else panel.eliminated(m.playerId, m.reason);
    }),
    // #21: an opponent's interference; only the effect crosses to the worker, the nickname stays here.
    net.on('interferenceIncoming', (m) => {
      if (finished || selfOut || localOver) return;
      const def = INTERFERENCE[interferenceIndex(m.kind)];
      if (!def) return;
      post({ type: 'applyInterference', kind: def.kind });
      incoming.show(m.fromNickname, def.label);
    }),
    net.on('matchResult', (m) => {
      if (offline) return;
      const alive = m.ranking.filter((e) => e.alive);
      const deadlinePassed =
        now() >= start.startAt + (MATCH_TIME_LIMIT_S + MATCH_DEADLINE_GRACE_S) * 1000 - 1000;
      let note: string | null = null;
      // Several alive is a kills decision; without this player's own `survived` the server's deadline made it (#60).
      if (alive.length >= 2 && alive.some((e) => e.playerId === selfId) && localOver === null)
        note = SELF_DEADLINE_NOTE;
      else if (alive.length >= 2 && deadlinePassed) note = PEER_DEADLINE_NOTE;
      // Stop the local world on its last frame before the result covers it.
      post({ type: 'forceEnd', reason: 'matchOver' });
      finish({
        kind: 'official',
        headline: headlineOf(m, selfId),
        ranking: m.ranking,
        out: { ...out },
        note,
      });
    }),
    net.onState((state) => {
      if (state !== 'open') goOffline();
    }),
  ];
  doc.addEventListener('visibilitychange', onVisibility);

  post({ type: 'setBackgroundPolicy', policy: 'simulate' });
  post({
    type: 'startRun',
    mode: 'versus',
    seed: start.seed,
    characterId: start.characterId,
    finale: 'end',
  });
  if (offline) {
    banner.textContent = OFFLINE_BANNER;
  } else if (doc.hidden) onVisibility();

  return {
    status(m) {
      if (finished || offline || selfOut || localOver) return;
      latest = {
        hp: m.hp,
        maxHp: m.maxHp,
        level: m.level,
        kills: m.kills,
        alive: m.alive,
        elapsedMs: m.elapsedMs,
      };
      if (timer !== null) return;
      const wait = lastSentAt === null ? 0 : lastSentAt + STATUS_SEND_INTERVAL_MS - now();
      if (wait <= 0) sendLatest();
      else timer = setTimer(sendLatest, wait);
    },
    gameOver(stats) {
      if (finished || localOver) return;
      localOver = stats.cleared ? 'survived' : 'died';
      cancelPending();
      if (offline) {
        finish({ kind: 'unofficial', stats });
        return;
      }
      if (stats.cleared) {
        send({ type: 'survived', kills: stats.kills });
        banner.textContent = SURVIVED_BANNER;
      } else {
        send({ type: 'died', kills: stats.kills, elapsedMs: Math.round(stats.timeSec * 1000) });
      }
    },
    interferenceCollected(kind) {
      if (selfOut || localOver) return;
      send({ type: 'interference', kind });
    },
    banners() {
      return incoming.texts();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!finished) {
        finished = true;
        restorePolicy();
      }
      cancelPending();
      for (const unsubscribe of off) unsubscribe();
      doc.removeEventListener('visibilitychange', onVisibility);
      panel.unmount();
      incoming.unmount();
      banner.remove();
    },
  };
}
