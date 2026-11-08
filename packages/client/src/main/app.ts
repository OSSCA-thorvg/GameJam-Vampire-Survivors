// The app state machine (ADR 0009): the only code that mounts screens. Each transition unmounts the old screen,
// mounts the new one and tells the worker. The DOM never reads game state; what it shows arrives as messages (ADR 0004).
import { CHARACTERS, type CharacterId } from '@vs/shared';
import { assertNever } from '../protocol/assert-never';
import type { LevelUpOption, MainToWorker, RunStats } from '../protocol/worker-messages';
import type { AssetUrl } from './ui/asset-url';
import { mount as mountCharacterSelect, type CharacterSelectProps } from './ui/character-select';
import type { Screen } from './ui/dom';
import { mount as mountLevelUp } from './ui/levelup';
import { mount as mountPause } from './ui/pause';
import { mount as mountResults } from './ui/results';
import { mount as mountTitle } from './ui/title';
import './ui/styles.css';

export type AppState =
  | { name: 'title' }
  /** #14: choosing the character before a run. */
  | { name: 'characterSelect'; selectedId: CharacterId }
  | { name: 'playing'; paused: boolean }
  /** #11: the worker paused the run for a level-up choice. */
  | { name: 'levelUp'; level: number; options: LevelUpOption[] }
  | { name: 'results'; stats: RunStats };

export type AppEvent =
  | { type: 'start' }
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
  | { type: 'chosen'; index: number };

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
      return event.type === 'start'
        ? { name: 'characterSelect', selectedId: lastCharacter }
        : state;
    case 'characterSelect':
      switch (event.type) {
        case 'select':
          return event.id === state.selectedId || !CHARACTERS.some((c) => c.id === event.id)
            ? state
            : { name: 'characterSelect', selectedId: event.id };
        case 'confirm':
          return { name: 'playing', paused: false };
        case 'back':
          return { name: 'title' };
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
        default:
          return state;
      }
    case 'levelUp':
      // Escape, a hidden tab and quitting do nothing here: a choice is required (the worker is already paused).
      return event.type === 'chosen' && event.index >= 0 && event.index < state.options.length
        ? { name: 'playing', paused: false }
        : state;
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
  if (to.name === 'playing' && from.name !== 'playing') {
    const characterId = from.name === 'characterSelect' ? from.selectedId : lastCharacter;
    return [{ type: 'startRun', seed: seed(), characterId }];
  }
  if (to.name === 'playing' && from.name === 'playing')
    return to.paused === from.paused ? [] : [{ type: to.paused ? 'pause' : 'resume' }];
  // Back from the character select: no run was started.
  if (to.name === 'title' && from.name !== 'characterSelect') return [{ type: 'endRun' }];
  return [];
}

export interface App {
  readonly state: AppState;
  dispatch(event: AppEvent): void;
}

/** A fresh 32-bit run seed from the platform CSPRNG (the simulation's own randomness is the seeded PRNG). */
const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;

/**
 * Starts the app on the title screen, mounting screens into `root`. Escape while playing toggles the pause; hiding the
 * tab while playing pauses (the worker's `'pause'` background policy already stops the simulation, and the overlay
 * stays until the player resumes). The level-up screen (#11) ignores both; `iconUrl` resolves its icons and the
 * character select's portraits (#14).
 */
export function createApp(
  root: HTMLElement,
  post: (message: MainToWorker) => void,
  seed: () => number = randomSeed,
  iconUrl: AssetUrl = () => null,
): App {
  const doc = root.ownerDocument;
  let state: AppState = { name: 'title' };
  let screen: Screen<never> | null = null;
  /** Kept only in memory for this session (#14); nothing is persisted between runs. */
  let lastCharacter = DEFAULT_CHARACTER_ID;
  /** The mounted select screen, updated in place while the selection moves. */
  let select: Screen<CharacterSelectProps> | null = null;
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
    screen?.unmount();
    screen = null;
    select = null;
    switch (state.name) {
      case 'characterSelect':
        select = mountCharacterSelect(root, selectProps(state.selectedId));
        screen = select;
        break;
      case 'title':
        screen = mountTitle(root, {
          onStart: () => {
            app.dispatch({ type: 'start' });
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
      if (state.name === 'characterSelect' && next.name === 'playing')
        lastCharacter = state.selectedId;
      state = next;
      show();
      for (const message of messages) post(message);
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
