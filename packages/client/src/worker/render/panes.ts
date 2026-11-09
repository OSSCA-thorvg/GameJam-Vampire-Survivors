import type { Scene, Shape, ThorVGNamespace } from '@thorvg/webcanvas';
import { assertNever } from '../../protocol/assert-never';
import type { PaneLayout } from '../../protocol/worker-messages';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';

/** Logical units between the two panes (ADR 0018; `main/viewport.ts` `PANE_GAP`). */
export const PANE_GAP = 16;
/** Where the opponent pane starts along the split axis. */
export const OPPONENT_X = VIEW_WIDTH + PANE_GAP;
export const OPPONENT_Y = VIEW_HEIGHT + PANE_GAP;

/**
 * The two panes of a versus match (#115, ADR 0018): two Scenes under `root`, each clipped by its own rectangle. The
 * own world's layers go under `self`, the opponent pane's under `opponent`. Single player shows `self` only, clipped
 * to the whole canvas, so it looks exactly as before. Each clip sits on an untransformed outer scene, in `root`'s
 * units, and the opponent's offset is a translate of the inner `opponent` scene: ThorVG did not move a scene's
 * clipper with that scene's own translate (found in #115), so no clip depends on it.
 */
export interface Panes {
  readonly self: Scene;
  readonly opponent: Scene;
  /**
   * Places and clips the panes for `layout` on a canvas of `areaW`×`areaH` logical units (backing size / scale). The
   * sides that touch the canvas edge reach it, so the under-2-device-pixel fill slack (#103) stays covered by ground.
   * Rewrites the two clip rectangles in place; creates nothing.
   */
  apply(layout: PaneLayout, areaW: number, areaH: number): void;
  readonly layout: PaneLayout;
  readonly opponentVisible: boolean;
}

/** Call after `initThorVG`. Creates the two scenes and their two clip shapes once. */
export function createPanes(
  TVG: Pick<ThorVGNamespace, 'Scene' | 'Shape'>,
  root: Pick<Scene, 'add'>,
): Panes {
  const self: Scene = new TVG.Scene();
  const opponent: Scene = new TVG.Scene();
  const opponentFrame: Scene = new TVG.Scene();
  const selfClip: Shape = new TVG.Shape();
  const opponentClip: Shape = new TVG.Shape();
  selfClip.appendRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill(0, 0, 0, 255);
  opponentClip.appendRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill(0, 0, 0, 255);
  self.clip(selfClip);
  opponentFrame.clip(opponentClip);
  opponentFrame.add(opponent);
  opponentFrame.visible(false);
  root.add(self).add(opponentFrame);
  let layout: PaneLayout = 'single';
  const clip = (shape: Shape, x: number, y: number, w: number, h: number): void => {
    shape.reset().appendRect(x, y, Math.max(0, w), Math.max(0, h));
  };
  return {
    self,
    opponent,
    get layout() {
      return layout;
    },
    get opponentVisible() {
      return layout !== 'single';
    },
    apply(next, areaW, areaH) {
      layout = next;
      switch (next) {
        case 'single':
          clip(selfClip, 0, 0, areaW, areaH);
          opponentFrame.visible(false);
          break;
        case 'columns':
          clip(selfClip, 0, 0, VIEW_WIDTH, areaH);
          opponent.translate(OPPONENT_X, 0);
          clip(opponentClip, OPPONENT_X, 0, areaW - OPPONENT_X, areaH);
          opponentFrame.visible(true);
          break;
        case 'rows':
          clip(selfClip, 0, 0, areaW, VIEW_HEIGHT);
          opponent.translate(0, OPPONENT_Y);
          clip(opponentClip, 0, OPPONENT_Y, areaW, areaH - OPPONENT_Y);
          opponentFrame.visible(true);
          break;
        default:
          assertNever(next);
      }
    },
  };
}
