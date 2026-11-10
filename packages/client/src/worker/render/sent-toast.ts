import type { Scene, Text, ThorVGNamespace } from '@thorvg/webcanvas';
import { INTERFERENCE } from '@vs/shared';
import { VIEW_WIDTH, type VisibleRect } from '../constants';
import { HUD_FONT } from './thorvg';

/** Font size of the toast; `hud-extents.ts` reads it for `MIN_VISIBLE_WIDTH`. */
export const TOAST_SIZE = 22;
const SIZE = TOAST_SIZE;
/** Below the timer (`hud.ts`). */
const TOAST_Y = 64;
/** The sender's "Sent <label>" line (#21): one ThorVG `Text` per interference kind, created once, only shown or hidden. */
export interface SentToast {
  /** Shows kind `index` (an `INTERFERENCE` index), or nothing for -1. */
  sync(index: number): void;
  /** #171: anchors the line to the `visible` area's top centre; on a layout change only, creates nothing. */
  layout(visible: Readonly<VisibleRect>): void;
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
    layout(visible) {
      const x = visible.x + visible.width / 2;
      for (const text of texts) text.translate(x, TOAST_Y + visible.y);
    },
  };
}
