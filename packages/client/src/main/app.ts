// The app state machine (ADR 0009): the only code that mounts screens. Each transition unmounts the old screen,
// mounts the new one and tells the worker. The DOM never reads game state; what it shows arrives as messages (ADR 0004).
import { assertNever } from '../protocol/assert-never';
import type { LevelUpOption, MainToWorker, RunStats } from '../protocol/worker-messages';
import type { AssetUrl } from './ui/asset-url';
import type { Screen } from './ui/dom';
import { mount as mountLevelUp } from './ui/levelup';
import { mount as mountPause } from './ui/pause';
import { mount as mountResults } from './ui/results';
import { mount as mountTitle } from './ui/title';
import './ui/styles.css';

export type AppState =
  | { name: 'title' }
  | { name: 'playing'; paused: boolean }
  /** #11: the worker paused the run for a level-up choice. */
  | { name: 'levelUp'; level: number; options: LevelUpOption[] }
  | { name: 'results'; stats: RunStats };

export type AppEvent =
  | { type: 'start' }
  | { type: 'pauseToggle' }
  | { type: 'quitToTitle' }
  | { type: 'gameOver'; stats: RunStats }
  | { type: 'retry' }
  | { type: 'hidden' }
  /** #11: from the worker; a level-up choice is waiting. */
  | { type: 'levelUp'; level: number; options: LevelUpOption[] }
  /** #11: the player chose option `index` on the level-up screen. */
  | { type: 'chosen'; index: number };

/** Pure transition function. An event that does not apply to the state returns the same state object. */
export function reduce(state: AppState, event: AppEvent): AppState {
  switch (state.name) {
    case 'title':
      return event.type === 'start' ? { name: 'playing', paused: false } : state;
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

/** The messages a transition sends to the worker, in order. `event` is the one that caused it. */
export function effects(
  from: AppState,
  to: AppState,
  seed: () => number,
  event?: AppEvent,
): MainToWorker[] {
  if (from === to) return [];
  // The worker resumes by itself once no level-up is pending, or posts the next `levelUp`.
  if (from.name === 'levelUp')
    return event?.type === 'chosen' ? [{ type: 'levelUpChoice', index: event.index }] : [];
  if (to.name === 'levelUp') return [];
  if (to.name === 'playing' && from.name !== 'playing')
    // #14 makes the character a choice.
    return [{ type: 'startRun', seed: seed(), characterId: 'warden' }];
  if (to.name === 'playing' && from.name === 'playing')
    return to.paused === from.paused ? [] : [{ type: to.paused ? 'pause' : 'resume' }];
  if (to.name === 'title') return [{ type: 'endRun' }];
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
 * stays until the player resumes). The level-up screen (#11) ignores both; `iconUrl` resolves its icons.
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

  const show = (): void => {
    screen?.unmount();
    screen = null;
    switch (state.name) {
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
      const next = reduce(state, event);
      if (next === state) return;
      const messages = effects(state, next, seed, event);
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
