import type { Scene, Shape, ThorVGNamespace } from '@thorvg/webcanvas';
import { assertNever } from '../../protocol/assert-never';
import type { PaneLayout } from '../../protocol/worker-messages';
import {
  FULL_VIEW,
  pipRect,
  PIP_RECT,
  PIP_SCALE,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  type VisibleRect,
} from '../constants';

/** Logical units between the two panes (ADR 0018; `main/viewport.ts` `PANE_GAP`). */
export const PANE_GAP = 16;
/** Where the opponent pane starts along the split axis. */
export const OPPONENT_X = VIEW_WIDTH + PANE_GAP;
export const OPPONENT_Y = VIEW_HEIGHT + PANE_GAP;
/** #150, ADR 0024: how far the inset's black backdrop reaches beyond it, and the width of its white frame. */
export const PIP_BACKDROP = 2;
export const PIP_FRAME = 2;
/** The backdrop's alpha: `#000000` at 60%. */
export const PIP_BACKDROP_ALPHA = 153;

/**
 * The two panes of a versus match (#115, ADR 0018): two Scenes under `root`, each clipped by its own rectangle. The
 * own world's layers go under `self`, the opponent pane's under `opponent`. Single player shows `self` only, clipped
 * to the whole canvas, so it looks exactly as before. Each clip sits on an untransformed outer scene, in `root`'s
 * units, and the opponent's offset is a translate of the inner `opponent` scene: ThorVG did not move a scene's
 * clipper with that scene's own translate (found in #115), so no clip depends on it. #150 (ADR 0024): in `pip` the
 * own pane is the whole canvas and the opponent's scene is translated and scaled into the top-right inset, clipped by
 * the same untransformed frame, between a backdrop under it and a white frame above it. #171 (ADR 0025): with one
 * view (`single`, `pip`) the own pane's clip starts at the `visible` area's corner, where the translated root puts
 * the canvas origin, and the inset is measured from `visible`'s top right (`pipRect`).
 */
export interface Panes {
  readonly self: Scene;
  readonly opponent: Scene;
  /**
   * Places and clips the panes for `layout` on a canvas of `areaW`×`areaH` logical units (backing size / scale). The
   * sides that touch the canvas edge reach it, so the under-2-device-pixel fill slack (#103) stays covered by ground.
   * `visible` (#171) is the part of the view the canvas shows; it matters only for `single` and `pip`, the layouts
   * that can cover the window. Rewrites the clip rectangles and the inset's two shapes in place; creates nothing.
   */
  apply(layout: PaneLayout, areaW: number, areaH: number, visible?: Readonly<VisibleRect>): void;
  readonly layout: PaneLayout;
  readonly opponentVisible: boolean;
  /** The opponent scene's scale: `PIP_SCALE` in `pip`, else 1 (the opponent view snaps its camera at it). */
  readonly opponentScale: number;
  /** Whether the inset's backdrop and frame are shown (only in `pip`). */
  readonly insetFrameVisible: boolean;
}

/**
 * Call after `initThorVG`. Creates the two scenes, their two clip shapes and the inset's backdrop and frame once;
 * `apply` only moves, clips and shows them.
 */
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
  // #150: the inset's backdrop under the opponent's frame and its white border above it, fixed in `root` units.
  const backdrop: Shape = new TVG.Shape();
  backdrop
    .appendRect(
      PIP_RECT.x - PIP_BACKDROP,
      PIP_RECT.y - PIP_BACKDROP,
      PIP_RECT.width + 2 * PIP_BACKDROP,
      PIP_RECT.height + 2 * PIP_BACKDROP,
    )
    .fill(0, 0, 0, PIP_BACKDROP_ALPHA);
  backdrop.visible(false);
  const border: Shape = new TVG.Shape();
  border
    .appendRect(PIP_RECT.x, PIP_RECT.y, PIP_RECT.width, PIP_RECT.height)
    .stroke({ width: PIP_FRAME, color: [255, 255, 255, 255] });
  border.visible(false);
  root.add(self).add(backdrop).add(opponentFrame).add(border);
  let layout: PaneLayout = 'single';
  const showInset = (on: boolean): void => {
    backdrop.visible(on);
    border.visible(on);
  };
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
    get opponentScale() {
      return layout === 'pip' ? PIP_SCALE : 1;
    },
    get insetFrameVisible() {
      return layout === 'pip';
    },
    apply(next, areaW, areaH, visible = FULL_VIEW) {
      layout = next;
      if (next !== 'pip') {
        opponent.scale(1);
        showInset(false);
      }
      switch (next) {
        case 'single':
          clip(selfClip, visible.x, visible.y, areaW, areaH);
          opponentFrame.visible(false);
          break;
        case 'pip': {
          const inset = pipRect(visible);
          clip(selfClip, visible.x, visible.y, areaW, areaH);
          opponent.translate(inset.x, inset.y);
          opponent.scale(PIP_SCALE);
          clip(opponentClip, inset.x, inset.y, inset.width, inset.height);
          // ThorVG's `reset()` clears the path only; the fill and the stroke set at creation stay.
          clip(
            backdrop,
            inset.x - PIP_BACKDROP,
            inset.y - PIP_BACKDROP,
            inset.width + 2 * PIP_BACKDROP,
            inset.height + 2 * PIP_BACKDROP,
          );
          clip(border, inset.x, inset.y, inset.width, inset.height);
          opponentFrame.visible(true);
          showInset(true);
          break;
        }
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
