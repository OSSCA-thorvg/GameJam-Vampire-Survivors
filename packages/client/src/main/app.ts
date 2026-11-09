// The app state machine (ADR 0009): the only code that mounts screens. Each transition unmounts the old screen,
// mounts the new one and tells the worker. The DOM never reads game state; what it shows arrives as messages (ADR 0004).
import {
  CHARACTERS,
  DEFAULT_AUDIO_SETTINGS,
  type AudioSettings,
  type CharacterId,
  type ChestReward,
  type InterferenceKind,
  type SfxId,
} from '@vs/shared';
import { assertNever } from '../protocol/assert-never';
import type {
  LevelUpOption,
  MainToWorker,
  RunSummary,
  WorkerStatus,
  WorkerView,
} from '../protocol/worker-messages';
import {
  createVersusController,
  type VersusController,
  type VersusControllerOptions,
  type VersusStart,
} from './match/versusController';
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
import { mount as mountPause, type PauseProps } from './ui/pause';
import { mount as mountResults } from './ui/results';
import { mount as mountTitle } from './ui/title';
import { mount as mountVersusResult, type VersusResult } from './ui/versus-result';
import './ui/styles.css';

/** A dialog over a running versus world (#20): the level-up choice (#11) or the chest (#15) pause only this world. */
export type VersusOverlay =
  | null
  | { kind: 'levelUp'; level: number; options: LevelUpOption[] }
  | { kind: 'chest'; rewards: ChestReward[] };

/** What the versus states (#20) keep of the room, so Rematch returns to the same lobby. */
interface VersusRoom {
  room: RoomState;
  selfId: string;
  characterId: CharacterId;
  /** The socket left `open` during or after the match: no more messages, no Rematch. */
  offline: boolean;
}

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
  | { name: 'results'; stats: RunSummary }
  /** #20: the versus match runs; Escape and a hidden tab do nothing (the world keeps simulating). */
  | ({ name: 'versusPlaying'; overlay: VersusOverlay } & VersusRoom)
  /** #20: the match is over: the server's result, or the local one when offline. */
  | ({ name: 'versusResult'; result: VersusResult } & VersusRoom);

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
  | { type: 'gameOver'; stats: RunSummary }
  | { type: 'retry' }
  | { type: 'hidden' }
  /** #11: from the worker; a level-up choice is waiting. */
  | { type: 'levelUp'; level: number; options: LevelUpOption[] }
  /** #11: the player chose option `index` on the level-up screen. */
  | { type: 'chosen'; index: number }
  /** #15: from the worker; a chest opened. */
  | { type: 'chestOpened'; rewards: ChestReward[] }
  /** #15: the chest overlay closed (Enter or its timer). */
  | { type: 'chestClosed' }
  /** #20: the lobby countdown ended and the versus run started. */
  | { type: 'versusStarted' }
  /** #20: the versus match ended for this player. */
  | { type: 'versusOver'; result: VersusResult }
  /** #20: the socket left `open` during the match. */
  | { type: 'versusOffline' }
  /** #20: Rematch on the versus result: back to the same room's lobby. */
  | { type: 'rematch' };

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
        case 'versusStarted':
          return {
            name: 'versusPlaying',
            room: state.room,
            selfId: state.selfId,
            characterId: state.characterId,
            offline: false,
            overlay: null,
          };
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
    case 'versusPlaying':
      return reduceVersusPlaying(state, event);
    case 'versusResult':
      switch (event.type) {
        case 'roomState':
          return { ...state, room: event.room };
        case 'versusOffline':
        case 'connectionLost':
          return state.offline ? state : { ...state, offline: true };
        case 'rematch':
          return state.offline
            ? state
            : {
                name: 'lobby',
                room: state.room,
                selfId: state.selfId,
                characterId: state.characterId,
              };
        case 'leave':
          return { name: 'title' };
        default:
          return state;
      }
    default:
      return assertNever(state);
  }
}

/** The versus match (#20): the dialogs pause only this world (ADR 0004); the socket's loss keeps the match local. */
function reduceVersusPlaying(
  state: Extract<AppState, { name: 'versusPlaying' }>,
  event: AppEvent,
): AppState {
  const { overlay } = state;
  switch (event.type) {
    case 'roomState':
      return { ...state, room: event.room };
    case 'versusOffline':
    case 'connectionLost':
      return state.offline ? state : { ...state, offline: true };
    case 'versusOver': {
      const { room, selfId, characterId, offline } = state;
      return { name: 'versusResult', room, selfId, characterId, offline, result: event.result };
    }
    case 'levelUp':
      return overlay === null
        ? { ...state, overlay: { kind: 'levelUp', level: event.level, options: event.options } }
        : state;
    case 'chosen':
      return overlay?.kind === 'levelUp' && event.index >= 0 && event.index < overlay.options.length
        ? { ...state, overlay: null }
        : state;
    case 'chestOpened':
      return overlay === null
        ? { ...state, overlay: { kind: 'chest', rewards: event.rewards } }
        : state;
    case 'chestClosed':
      return overlay?.kind === 'chest' ? { ...state, overlay: null } : state;
    default:
      return state;
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
  // #20: the versus run is started by its controller; its dialogs answer the worker like single player's.
  if (from.name === 'versusPlaying' && to.name === 'versusPlaying') {
    if (from.overlay?.kind === 'levelUp' && to.overlay === null && event?.type === 'chosen')
      return [{ type: 'levelUpChoice', index: event.index }];
    if (from.overlay?.kind === 'chest' && to.overlay === null) return [{ type: 'chestClosed' }];
    return [];
  }
  if (from.name === 'versusPlaying' || from.name === 'versusResult')
    return to.name === 'title' || to.name === 'lobby' ? [{ type: 'endRun' }] : [];
  // The worker resumes by itself once no level-up is pending, or posts the next `levelUp`.
  if (from.name === 'levelUp')
    return event?.type === 'chosen' ? [{ type: 'levelUpChoice', index: event.index }] : [];
  if (to.name === 'levelUp') return [];
  // The worker resumes when told the overlay closed.
  if (from.name === 'chest') return [{ type: 'chestClosed' }];
  if (to.name === 'chest') return [];
  if (to.name === 'playing' && from.name !== 'playing') {
    const characterId = from.name === 'characterSelect' ? from.selectedId : lastCharacter;
    return [{ type: 'startRun', seed: seed(), characterId, mode: 'single' }];
  }
  if (to.name === 'playing' && from.name === 'playing')
    return to.paused === from.paused ? [] : [{ type: to.paused ? 'pause' : 'resume' }];
  // Only a run (playing or its results) is ended; the select and multiplayer screens never started one.
  if (to.name === 'title' && (from.name === 'playing' || from.name === 'results'))
    return [{ type: 'endRun' }];
  return [];
}

export type { VersusStart };

export interface App {
  readonly state: AppState;
  dispatch(event: AppEvent): void;
  /**
   * Starts the versus match when the lobby countdown ends (#20): only from the lobby, with the socket open. Creates
   * the match's `versusController`, which starts the `'versus'` run.
   */
  startVersus(start: VersusStart): void;
  /** A worker `status` (#20): relayed by the running versus match; ignored otherwise. */
  status(message: WorkerStatus): void;
  /** A worker `view` (#114): sent by the running versus match; ignored otherwise. */
  view(message: WorkerView): void;
  /** A worker `interferenceCollected` (#21): sent by the running versus match; ignored otherwise. */
  interferenceCollected(kind: InterferenceKind): void;
  /** The interference banners shown now (#21); empty outside a versus match. */
  banners(): string[];
}

/**
 * The app's sound (#129): `screen` follows every state (music and duck), `cue` plays a main-thread cue, and the pause
 * screen reads and changes the settings. The default is silent, so tests and debug scenes need no audio.
 */
export interface AppSound {
  screen(state: AppState): void;
  cue(id: SfxId): void;
  settings(): AudioSettings;
  setSettings(s: AudioSettings): void;
  /** Calls `fn` after every settings change; returns the unsubscribe. */
  onSettings(fn: (s: AudioSettings) => void): () => void;
}

export const SILENT_SOUND: AppSound = {
  screen: () => undefined,
  cue: () => undefined,
  settings: () => ({ ...DEFAULT_AUDIO_SETTINGS }),
  setSettings: () => undefined,
  onSettings: () => () => undefined,
};

/** Creates the controller of one versus match; tests pass a fake. */
export type CreateVersus = (opts: VersusControllerOptions) => VersusController;

/** Creates the multiplayer flow's socket client, or `null` when the build has no server (ADR 0017); tests pass a fake. */
export type CreateNet = () => NetClient | null;

const defaultNet: CreateNet = () =>
  SERVER_URL === null ? null : new NetClient(SERVER_URL, browserSocket);

const connectionOf = (state: NetState): Connection =>
  state === 'open' ? 'open' : state === 'connecting' ? 'connecting' : 'failed';

/** A fresh 32-bit run seed from the platform CSPRNG (the simulation's own randomness is the seeded PRNG). */
const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;

/**
 * Starts the app on the title screen, mounting screens into `root`. Escape while playing toggles the pause; hiding the
 * tab while playing pauses (the worker's `'pause'` background policy already stops the simulation, and the overlay
 * stays until the player resumes). The level-up screen (#11) and the chest overlay (#15) ignore both; `iconUrl`
 * resolves their icons and the character select's portraits (#14). `setPanes` (#115, ADR 0018) switches the canvas to two
 * panes on entering `versusPlaying` and back to one on leaving `versusResult`, whose screen keeps the last split frame.
 */
export function createApp(
  root: HTMLElement,
  post: (message: MainToWorker) => void,
  seed: () => number = randomSeed,
  iconUrl: AssetUrl = () => null,
  createNet: CreateNet = defaultNet,
  createVersus: CreateVersus = createVersusController,
  setPanes: (panes: 1 | 2) => void = () => undefined,
  sound: AppSound = SILENT_SOUND,
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
  /** The running versus match (#20); `null` outside `versusPlaying`, so single player never creates one. */
  let versus: VersusController | null = null;
  /** The mounted pause screen (#129), updated in place when the sound settings change (the `M` key, the toggle). */
  let pause: Screen<PauseProps> | null = null;

  const openNet = (): NetClient | null => {
    if (net) return net;
    const client = createNet();
    if (!client) {
      // A production build without VITE_SERVER_URL: the entry says so and no socket is ever opened.
      connection = 'unconfigured';
      return null;
    }
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
    const client = openNet();
    if (!client) {
      show();
      return;
    }
    client.connect().catch(() => {
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
        startAt: match.startAt,
        roomCode: s.room.code,
        selfId: s.selfId,
        players: s.room.players,
        characterId: s.characterId,
      });
    },
  });

  const pauseProps = (): PauseProps => ({
    onResume: () => {
      app.dispatch({ type: 'pauseToggle' });
    },
    onQuit: () => {
      app.dispatch({ type: 'quitToTitle' });
    },
    audio: sound.settings(),
    onAudio: (s) => {
      sound.setSettings(s);
    },
  });
  sound.onSettings(() => {
    pause?.update(pauseProps());
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
    pause = null;
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
        if (state.paused) {
          pause = mountPause(root, pauseProps());
          screen = pause;
        }
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
      case 'versusPlaying':
        if (state.overlay?.kind === 'levelUp')
          screen = mountLevelUp(root, {
            level: state.overlay.level,
            options: state.overlay.options,
            iconUrl,
            onChoose: (index) => {
              app.dispatch({ type: 'chosen', index });
            },
          });
        else if (state.overlay?.kind === 'chest')
          screen = mountChest(root, {
            rewards: state.overlay.rewards,
            iconUrl,
            onClose: () => {
              app.dispatch({ type: 'chestClosed' });
            },
          });
        break;
      case 'versusResult':
        screen = mountVersusResult(root, {
          result: state.result,
          selfId: state.selfId,
          canRematch: !state.offline,
          onRematch: () => {
            app.dispatch({ type: 'rematch' });
          },
          onLeave: () => {
            app.dispatch({ type: 'leave' });
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
      // The versus match reports the local run's end to the server (#20); the state follows its `versusOver`.
      if (event.type === 'gameOver' && versus) versus.gameOver(event.stats);
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
      if (from.name === 'versusPlaying' && next.name !== 'versusPlaying') {
        versus?.dispose();
        versus = null;
      }
      const inVersus = (name: AppState['name']): boolean =>
        name === 'versusPlaying' || name === 'versusResult';
      if (next.name === 'versusPlaying' && from.name !== 'versusPlaying') setPanes(2);
      else if (inVersus(from.name) && !inVersus(next.name)) setPanes(1);
      // The socket lives only inside the multiplayer flow (#19).
      if ((from.name === 'lobby' || from.name === 'versusResult') && next.name === 'title')
        net?.send({ type: 'leaveRoom' });
      if (next.name === 'title') closeNet();
      show();
      sound.screen(state);
      if (next.name === 'multiplayerEntry' && from.name !== 'multiplayerEntry') connect();
      for (const message of messages) post(message);
    },
    startVersus(start) {
      if (state.name !== 'lobby' || !net || versus) return;
      versus = createVersus({
        net,
        post,
        root,
        start,
        iconUrl,
        onResult: (result) => {
          app.dispatch({ type: 'versusOver', result });
        },
        onOffline: () => {
          app.dispatch({ type: 'versusOffline' });
        },
        cue: (id) => {
          sound.cue(id);
        },
      });
      app.dispatch({ type: 'versusStarted' });
    },
    status(message) {
      versus?.status(message);
    },
    view(message) {
      versus?.view(message);
    },
    interferenceCollected(kind) {
      versus?.interferenceCollected(kind);
    },
    banners() {
      return versus?.banners() ?? [];
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
  sound.screen(state);
  return app;
}
