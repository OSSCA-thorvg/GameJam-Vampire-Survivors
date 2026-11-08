import type { Scene, Text, ThorVGNamespace } from '@thorvg/webcanvas';
import { INTERFERENCE } from '@vs/shared';
import { VIEW_WIDTH } from '../constants';
import { HUD_FONT } from './thorvg';

const SIZE = 22;
/** Below the timer (`hud.ts`). */
const TOAST_Y = 64;

/** The sender's "Sent <label>" line (#21): one ThorVG `Text` per interference kind, created once, only shown or hidden. */
export interface SentToast {
  /** Shows kind `index` (an `INTERFERENCE` index), or nothing for -1. */
  sync(index: number): void;
}

/** Call after `initThorVG` (reads `HUD_FONT`). The labels are printable ASCII (`interference.test.ts`). */
export function createSentToast(
  TVG: Pick<ThorVGNamespace, 'Text'>,
  layer: Pick<Scene, 'add'>,
): SentToast {
  const texts: Text[] = INTERFERENCE.map((def) => {
    const text: Text = new TVG.Text();
    text.font(HUD_FONT).fontSize(SIZE).fill(0xff, 0xd0, 0x40).outline(2, 0, 0, 0);
    text
      .align(0.5, 0)
      .translate(VIEW_WIDTH / 2, TOAST_Y)
      .text(`Sent ${def.label}`);
    text.visible(false);
    layer.add(text);
    return text;
  });
  let shown = -1;
  return {
    sync(index) {
      if (index === shown) return;
      texts[shown]?.visible(false);
      texts[index]?.visible(true);
      shown = index;
    },
  };
}
