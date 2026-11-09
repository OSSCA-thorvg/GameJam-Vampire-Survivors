import type { Scene, ThorVGNamespace } from '@thorvg/webcanvas';
import type { DrawableAssetId } from '@vs/shared';
import type { AssetInstance, AssetLibrary } from '../assets/library';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';

/** The "Powered by ThorVG" boot splash (#126, ADR 0020). */
export const SPLASH_ID: DrawableAssetId = 'ui.splash';
/** The composition is 1920 wide; it is drawn at 2/3 scale into the 1280×720 view. */
const SPLASH_COMP_WIDTH = 1920;

export type SplashState = 'playing' | 'holding' | 'done';
export interface SplashSnapshot {
  state: SplashState | 'skipped';
  frame: number;
  elapsedS: number;
  durationS: number;
}
export interface Splash {
  /** Advances the splash clock; the first step reaching its duration holds the last frame and calls `onEnded` once. */
  step(dtSec: number): void;
  /** Hides the splash layer and releases its playback; disposes nothing (ADR 0003). */
  finish(): void;
  readonly state: SplashState;
  snapshot(): SplashSnapshot;
}
export interface SplashOptions {
  TVG: Pick<ThorVGNamespace, 'Shape' | 'Scene'>;
  library: Pick<AssetLibrary, 'create' | 'release' | 'isPlaceholder' | 'timeline'>;
  layer: Pick<Scene, 'add' | 'visible'>;
  onEnded: () => void;
}

/**
 * Creates the splash's paints once, on `layer` (above the game panes): a black rect over the view and the animation
 * centred at 2/3 scale. Returns `null` with one warning when the asset is a placeholder, has no timeline, or fails.
 */
export function createSplash({ TVG, library, layer, onEnded }: SplashOptions): Splash | null {
  const skip = (): null => {
    console.warn('[splash] ui.splash unavailable; skipping');
    return null;
  };
  if (library.isPlaceholder(SPLASH_ID)) return skip();
  const timeline = library.timeline(SPLASH_ID);
  if (!timeline || !(timeline.fps > 0) || !(timeline.frames > 0)) return skip();
  let instance: AssetInstance;
  try {
    instance = library.create(SPLASH_ID);
    const background = new TVG.Shape();
    background.appendRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill(0, 0, 0, 255);
    const content = new TVG.Scene();
    content.translate(VIEW_WIDTH / 2, VIEW_HEIGHT / 2);
    content.scale(VIEW_WIDTH / SPLASH_COMP_WIDTH);
    instance.paint.translate(instance.offsetX, instance.offsetY);
    content.add(instance.paint);
    layer.add(background);
    layer.add(content);
  } catch (error) {
    console.warn(
      `[splash] ui.splash unavailable; skipping: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
  const durationS = timeline.frames / timeline.fps;
  let elapsedS = 0;
  let state: SplashState = 'playing';
  return {
    get state() {
      return state;
    },
    step(dtSec) {
      if (state !== 'playing') return;
      elapsedS += dtSec;
      if (elapsedS >= durationS - 1e-6) {
        state = 'holding';
        onEnded();
      }
    },
    finish() {
      if (state === 'done') return;
      layer.visible(false);
      library.release(instance);
      state = 'done';
    },
    snapshot() {
      return { state, frame: instance.lottie?.frame() ?? 0, elapsedS, durationS };
    },
  };
}
