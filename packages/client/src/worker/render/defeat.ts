import type { Paint, Scene, Text, ThorVGNamespace } from '@thorvg/webcanvas';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';
import { HUD_FONT } from './thorvg';

/** The world and HUD opacity while the defeat line shows (#20): 40%. */
export const DEFEAT_DIM = 102;
const OPAQUE = 255;
const SIZE = 28;
/** Printable ASCII only: the HUD font has no other glyphs (ADR 0013). */
export const DEFEAT_TEXT = 'You were defeated - waiting for the match to end';

/**
 * The versus defeat screen (#20, ADR 0004): after a versus death the worker keeps drawing the frozen world dimmed to
 * 40%, with one centred ThorVG line above it. Created once at boot and only shown or hidden afterwards.
 */
export interface DefeatOverlay {
  setVisible(visible: boolean): void;
  readonly visible: boolean;
}

/** Call after `initThorVG` (reads `HUD_FONT`); `dim` are the scenes faded while it shows, `root` gets the text on top. */
export function createDefeatOverlay(
  TVG: Pick<ThorVGNamespace, 'Text'>,
  root: Pick<Scene, 'add'>,
  dim: readonly Pick<Paint, 'opacity'>[],
): DefeatOverlay {
  const text: Text = new TVG.Text();
  text.font(HUD_FONT).fontSize(SIZE).fill(255, 255, 255).outline(2, 0, 0, 0);
  text
    .align(0.5, 0.5)
    .translate(VIEW_WIDTH / 2, VIEW_HEIGHT / 2)
    .text(DEFEAT_TEXT);
  text.visible(false);
  root.add(text);
  let visible = false;
  return {
    get visible() {
      return visible;
    },
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      text.visible(next);
      for (const scene of dim) scene.opacity(next ? DEFEAT_DIM : OPAQUE);
    },
  };
}
