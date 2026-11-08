// The app state machine (ADR 0009): the only code that mounts screens. Each transition unmounts the old screen,
// mounts the new one and tells the worker. The DOM never reads game state; what it shows arrives as messages (ADR 0004).
import { CHARACTERS, type CharacterId, type ChestReward, type PlayerInfo } from '@vs/shared';
import { assertNever } from '../protocol/assert-never';
import type { LevelUpOption, MainToWorker, RunStats } from '../protocol/worker-messages';
import { browserSocket } from './net/browser-socket';
import { NetClient, type NetState } from './net/client';
import { SERVER_URL } from './net/config';
import { loadNickname, saveNickname } from './storage';
import type { AssetUrl } from './ui/asset-url';
import { mount as mountCharacterSelect, type CharacterSelectProps } from './ui/character-select';
import { mount as mountChest } from './ui/chest';
import type { Screen } from './ui/dom';
import { mount as mountLevelUp } from './ui/levelup';
import { mount as mountLobby, type LobbyProps, type MatchStart, type RoomState } from './ui/lobby';
import {
  mount as mountMultiplayerEntry,
  type Connection,
  type MultiplayerEntryProps,
  type ServerError,
} from './ui/multiplayer-entry';
import { mount as mountPause } from './ui/pause';
import { mount as mountResults } from './ui/results';
import { mount as mountTitle } from './ui/title';
import './ui/styles.css';

export type AppState =
  | { name: 'title' }
  /** #14: choosing the character before a run; #19: or before the versus flow (`purpose: 'versus'`). */
  | { name: 'characterSelect'; selectedId: CharacterId; purpose: 'single' | 'versus' }
  /** #19: nickname, then create a room or join one by code. `error` is a notice such as the connection loss. */
  | { name: 'multiplayerEntry'; characterId: CharacterId; error?: string }
  /** #19: in a room; `match` is set from `matchStart` until the room is back in `lobby`. */
  | {
      name: 'lobby';
      room: RoomState;
      selfId: string;
      characterId: CharacterId;
      match?: MatchStart;
    }
  | { name: 'playing'; paused: boolean }
  /** #11: the worker paused the run for a level-up choice. */
  | { name: 'levelUp'; level: number; options: LevelUpOption[] }
  /** #15: the worker paused the run while the chest overlay shows its rewards. */
  | { name: 'chest'; rewards: ChestReward[] }
  | { name: 'results'; stats: RunStats };

export type AppEvent =
  | { type: 'start' }
  /** #19: the title's Multiplayer button. */
  | { type: 'multiplayer' }
  /** #19: a `roomState` from the server; `selfId` is this client's `playerId`. */
  | { type: 'roomState'; room: RoomState; selfId: string }
  /** #19: a `matchStart` from the server. */
  | { type: 'matchStart'; match: MatchStart }
  /** #19: Leave in the lobby. */
  | { type: 'leave' }
  /** #19: the socket closed unexpectedly and the reconnect attempts are over; the room was left. */
  | { type: 'connectionLost' }
  /** #14: on the character select, move the selection, start the run, or go back to the title. */
  | { type: 'select'; id: CharacterId }
  | { type: 'confirm' }
  | { type: 'back' }
  | { type: 'pauseToggle' }
  | { type: 'quitToTitle' }
  | { type: 'gameOver'; stats: RunStats }
  | { type: 'retry' }
  | { type: 'hidden' }
  /** #11: from the worker; a level-up choice is waiting. */
  | { type: 'levelUp'; level: number; options: LevelUpOption[] }
  /** #11: the player chose option `index` on the level-up screen. */
  | { type: 'chosen'; index: number }
  /** #15: from the worker; a chest opened. */
  | { type: 'chestOpened'; rewards: ChestReward[] }
  /** #15: the chest overlay closed (Enter or its timer). */
  | { type: 'chestClosed' };

/** The notice on the entry screen after the socket closed unexpectedly (#19). */
export const CONNECTION_LOST = 'Connection lost — the room was left';

/** The character the select screen starts on when none was chosen yet this session. */
export const DEFAULT_CHARACTER_ID: CharacterId = CHARACTERS[0]?.id ?? 'warden';

/**
 * Pure transition function. An event that does not apply to the state returns the same state object. `lastCharacter`
 * is the character chosen last this session (#14), where the select screen starts.
 */
export function reduce(
  state: AppState,
  event: AppEvent,
  lastCharacter: CharacterId = DEFAULT_CHARACTER_ID,
): AppState {
  switch (state.name) {
    case 'title':
      if (event.type === 'start')
        return { name: 'characterSelect', selectedId: lastCharacter, purpose: 'single' };
      if (event.type === 'multiplayer')
        return { name: 'characterSelect', selectedId: lastCharacter, purpose: 'versus' };
      return state;
    case 'characterSelect':
      switch (event.type) {
        case 'select':
          return event.id === state.selectedId || !CHARACTERS.some((c) => c.id === event.id)
            ? state
            : { ...state, selectedId: event.id };
        case 'confirm':
          return state.purpose === 'versus'
            ? { name: 'multiplayerEntry', characterId: state.selectedId }
            : { name: 'playing', paused: false };
        case 'back':
          return { name: 'title' };
        default:
          return state;
      }
    case 'multiplayerEntry':
      switch (event.type) {
        case 'roomState':
          return {
            name: 'lobby',
            room: event.room,
            selfId: event.selfId,
            characterId: state.characterId,
          };
        case 'back':
          return { name: 'title' };
        case 'connectionLost':
          return {
            name: 'multiplayerEntry',
            characterId: state.characterId,
            error: CONNECTION_LOST,
          };
        default:
          return state;
      }
    case 'lobby':
      switch (event.type) {
        case 'roomState': {
          const { match, ...rest } = state;
          // Back in `lobby` after a match (#18's 5 s reset): the next `matchStart` starts a new countdown.
          return event.room.phase === 'lobby' || match === undefined
            ? { ...rest, room: event.room, selfId: event.selfId }
            : { ...rest, room: event.room, selfId: event.selfId, match };
        }
        case 'matchStart':
          return { ...state, match: event.match };
        case 'leave':
          return { name: 'title' };
        case 'connectionLost':
          return {
            name: 'multiplayerEntry',
            characterId: state.characterId,
            error: CONNECTION_LOST,
          };
        default:
          return state;
      }
    case 'playing':
      switch (event.type) {
        case 'pauseToggle':
          return { name: 'playing', paused: !state.paused };
        case 'hidden':
          return state.paused ? state : { name: 'playing', paused: true };
        case 'quitToTitle':
          return { name: 'title' };
        case 'gameOver':
          return { name: 'results', stats: event.stats };
        case 'levelUp':
          return { name: 'levelUp', level: event.level, options: event.options };
        case 'chestOpened':
          return { name: 'chest', rewards: event.rewards };
        default:
          return state;
      }
    case 'levelUp':
      // Escape, a hidden tab and quitting do nothing here: a choice is required (the worker is already paused).
      return event.type === 'chosen' && event.index >= 0 && event.index < state.options.length
        ? { name: 'playing', paused: false }
        : state;
    case 'chest':
      // Like the level-up screen: Escape, a hidden tab and quitting do nothing; only closing the overlay resumes.
      return event.type === 'chestClosed' ? { name: 'playing', paused: false } : state;
    case 'results':
      if (event.type === 'retry') return { name: 'playing', paused: false };
      if (event.type === 'quitToTitle') return { name: 'title' };
      return state;
    default:
      return assertNever(state);
  }
}

/**
 * The messages a transition sends to the worker, in order. `event` is the one that caused it. A run starts as the
 * character confirmed on the select screen, or as `lastCharacter` on Retry (#14).
 */
export function effects(
  from: AppState,
  to: AppState,
  seed: () => number,
  event?: AppEvent,
  lastCharacter: CharacterId = DEFAULT_CHARACTER_ID,
): MainToWorker[] {
  if (from === to) return [];
  // The worker resumes by itself once no level-up is pending, or posts the next `levelUp`.
  if (from.name === 'levelUp')
    return event?.type === 'chosen' ? [{ type: 'levelUpChoice', index: event.index }] : [];
  if (to.name === 'levelUp') return [];
  // The worker resumes when told the overlay closed.
  if (from.name === 'chest') return [{ type: 'chestClosed' }];
  if (to.name === 'chest') return [];
  if (to.name === 'playing' && from.name !== 'playing') {
    const characterId = from.name === 'characterSelect' ? from.selectedId : lastCharacter;
    return [{ type: 'startRun', seed: seed(), characterId }];
  }
  if (to.name === 'playing' && from.name === 'playing')
    return to.paused === from.paused ? [] : [{ type: to.paused ? 'pause' : 'resume' }];
  // Only a run (playing or its results) is ended; the select and multiplayer screens never started one.
  if (to.name === 'title' && (from.name === 'playing' || from.name === 'results'))
    return [{ type: 'endRun' }];
  return [];
}

/** What #20's versus match starts from: the `matchStart` seed, the room and this player's character. */
export interface VersusStart {
  seed: number;
  roomCode: string;
  selfId: string;
  players: PlayerInfo[];
  characterId: CharacterId;
}

export interface App {
  readonly state: AppState;
  dispatch(event: AppEvent): void;
  /** Starts the versus match when the lobby countdown ends. A stub until #20: it logs in dev and stays in the lobby. */
  startVersus(start: VersusStart): void;
}

/** Creates the multiplayer flow's socket client; tests pass a fake. */
export type CreateNet = () => NetClient;

const defaultNet: CreateNet = () => new NetClient(SERVER_URL, browserSocket);

const connectionOf = (state: NetState): Connection =>
  state === 'open' ? 'open' : state === 'connecting' ? 'connecting' : 'failed';

/** A fresh 32-bit run seed from the platform CSPRNG (the simulation's own randomness is the seeded PRNG). */
const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;

/**
 * Starts the app on the title screen, mounting screens into `root`. Escape while playing toggles the pause; hiding the
 * tab while playing pauses (the worker's `'pause'` background policy already stops the simulation, and the overlay
 * stays until the player resumes). The level-up screen (#11) and the chest overlay (#15) ignore both; `iconUrl`
 * resolves their icons and the character select's portraits (#14).
 */
export function createApp(
  root: HTMLElement,
  post: (message: MainToWorker) => void,
  seed: () => number = randomSeed,
  iconUrl: AssetUrl = () => null,
  createNet: CreateNet = defaultNet,
): App {
  const doc = root.ownerDocument;
  let state: AppState = { name: 'title' };
  let screen: Screen<never> | null = null;
  /** Kept only in memory for this session (#14); nothing is persisted between runs. */
  let lastCharacter = DEFAULT_CHARACTER_ID;
  /** The mounted select screen, updated in place while the selection moves. */
  let select: Screen<CharacterSelectProps> | null = null;
  /**
   * The multiplayer flow's socket (#19): created on entering the entry screen, closed on leaving the flow; `null` in
   * single player, which therefore never opens a WebSocket.
   */
  let net: NetClient | null = null;
  let netOff: (() => void)[] = [];
  let connection: Connection = 'connecting';
  let serverError: ServerError | null = null;
  let errorSeq = 0;
  /** The nickname used last this session; `localStorage` only seeds it. */
  let nickname: string | null = null;
  let entry: Screen<MultiplayerEntryProps> | null = null;
  let lobby: Screen<LobbyProps> | null = null;

  const openNet = (): NetClient => {
    if (net) return net;
    const client = createNet();
    net = client;
    connection = connectionOf(client.state);
    netOff = [
      client.on('roomState', (room) => {
        if (client.selfId !== null)
          app.dispatch({ type: 'roomState', room, selfId: client.selfId });
      }),
      client.on('matchStart', (match) => {
        app.dispatch({ type: 'matchStart', match });
      }),
      client.on('error', (message) => {
        serverError = { code: message.code, seq: ++errorSeq };
        show();
      }),
      client.onState((s) => {
        connection = connectionOf(s);
        show();
      }),
      client.onLost(() => {
        app.dispatch({ type: 'connectionLost' });
      }),
    ];
    return client;
  };
  const connect = (): void => {
    openNet()
      .connect()
      .catch(() => {
        // Shown as "Cannot reach the game server" through the state change.
      });
  };
  const closeNet = (): void => {
    for (const off of netOff) off();
    netOff = [];
    net?.close();
    net = null;
    serverError = null;
  };
  const remember = (nick: string): void => {
    nickname = nick;
    saveNickname(nick);
  };

  const entryProps = (
    s: Extract<AppState, { name: 'multiplayerEntry' }>,
  ): MultiplayerEntryProps => ({
    nickname: nickname ?? loadNickname(),
    ...(s.error === undefined ? {} : { notice: s.error }),
    connection,
    error: serverError,
    onRetry: connect,
    onCreate: (nick) => {
      remember(nick);
      net?.send({ type: 'createRoom', nickname: nick });
    },
    onJoin: (code, nick) => {
      remember(nick);
      net?.send({ type: 'joinRoom', code, nickname: nick });
    },
    onBack: () => {
      app.dispatch({ type: 'back' });
    },
  });
  const lobbyProps = (s: Extract<AppState, { name: 'lobby' }>): LobbyProps => ({
    room: s.room,
    selfId: s.selfId,
    match: s.match ?? null,
    connected: connection === 'open',
    error: serverError,
    onReady: (ready) => {
      net?.send({ type: 'setReady', ready });
    },
    onStart: () => {
      net?.send({ type: 'startMatch' });
    },
    onLeave: () => {
      app.dispatch({ type: 'leave' });
    },
    onCountdownDone: (match) => {
      app.startVersus({
        seed: match.seed,
        roomCode: s.room.code,
        selfId: s.selfId,
        players: s.room.players,
        characterId: s.characterId,
      });
    },
  });

  const selectProps = (selectedId: CharacterId): CharacterSelectProps => ({
    characters: CHARACTERS,
    selectedId,
    assetUrl: iconUrl,
    onSelect: (id) => {
      app.dispatch({ type: 'select', id });
    },
    onConfirm: () => {
      app.dispatch({ type: 'confirm' });
    },
    onBack: () => {
      app.dispatch({ type: 'back' });
    },
  });

  const show = (): void => {
    if (select && state.name === 'characterSelect') {
      select.update(selectProps(state.selectedId));
      return;
    }
    if (entry && state.name === 'multiplayerEntry') {
      entry.update(entryProps(state));
      return;
    }
    if (lobby && state.name === 'lobby') {
      lobby.update(lobbyProps(state));
      return;
    }
    screen?.unmount();
    screen = null;
    select = null;
    entry = null;
    lobby = null;
    switch (state.name) {
      case 'characterSelect':
        select = mountCharacterSelect(root, selectProps(state.selectedId));
        screen = select;
        break;
      case 'multiplayerEntry':
        serverError = null;
        entry = mountMultiplayerEntry(root, entryProps(state));
        screen = entry;
        break;
      case 'lobby':
        serverError = null;
        lobby = mountLobby(root, lobbyProps(state));
        screen = lobby;
        break;
      case 'title':
        screen = mountTitle(root, {
          onStart: () => {
            app.dispatch({ type: 'start' });
          },
          onMultiplayer: () => {
            app.dispatch({ type: 'multiplayer' });
          },
        });
        break;
      case 'playing':
        if (state.paused)
          screen = mountPause(root, {
            onResume: () => {
              app.dispatch({ type: 'pauseToggle' });
            },
            onQuit: () => {
              app.dispatch({ type: 'quitToTitle' });
            },
          });
        break;
      case 'levelUp':
        screen = mountLevelUp(root, {
          level: state.level,
          options: state.options,
          iconUrl,
          onChoose: (index) => {
            app.dispatch({ type: 'chosen', index });
          },
        });
        break;
      case 'chest':
        screen = mountChest(root, {
          rewards: state.rewards,
          iconUrl,
          onClose: () => {
            app.dispatch({ type: 'chestClosed' });
          },
        });
        break;
      case 'results':
        screen = mountResults(root, {
          stats: state.stats,
          onRetry: () => {
            app.dispatch({ type: 'retry' });
          },
          onTitle: () => {
            app.dispatch({ type: 'quitToTitle' });
          },
        });
        break;
      default:
        assertNever(state);
    }
  };

  const app: App = {
    get state() {
      return state;
    },
    dispatch(event) {
      const next = reduce(state, event, lastCharacter);
      if (next === state) return;
      const messages = effects(state, next, seed, event, lastCharacter);
      if (
        state.name === 'characterSelect' &&
        next.name !== 'characterSelect' &&
        next.name !== 'title'
      )
        lastCharacter = state.selectedId;
      const from = state;
      state = next;
      // The socket lives only inside the multiplayer flow (#19).
      if (from.name === 'lobby' && next.name === 'title') net?.send({ type: 'leaveRoom' });
      if (next.name === 'title') closeNet();
      show();
      if (next.name === 'multiplayerEntry' && from.name !== 'multiplayerEntry') connect();
      for (const message of messages) post(message);
    },
    startVersus(start) {
      // #20 replaces this stub with the versus run.
      if (import.meta.env.DEV) console.warn('[vs] startVersus is not wired yet (#20)', start);
    },
  };

  doc.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.repeat || state.name !== 'playing') return;
    e.preventDefault();
    app.dispatch({ type: 'pauseToggle' });
  });
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) app.dispatch({ type: 'hidden' });
  });

  show();
  return app;
}
