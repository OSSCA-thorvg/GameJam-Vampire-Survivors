import type { Scene, ThorVGNamespace } from '@thorvg/webcanvas';
import { describe, expect, it } from 'vitest';
import { PIP_RECT, PIP_SCALE } from '../constants';
import { HUD_TOP_RIGHT_BOTTOM } from './hud';
import {
  createPanes,
  OPPONENT_X,
  OPPONENT_Y,
  PIP_BACKDROP,
  PIP_BACKDROP_ALPHA,
  PIP_FRAME,
} from './panes';

/** Fake Scenes and Shapes that record their clip rectangle, translation and visibility. */
function fakes() {
  const scenes: {
    visible: boolean;
    translate: [number, number];
    scale: number;
    clip: { rect: number[] } | null;
  }[] = [];
  const shapes: {
    rect: number[];
    resets: number;
    visible: boolean;
    fill: number[] | null;
    stroke: unknown;
  }[] = [];
  const TVG = {
    Scene: function Scene() {
      const state = {
        visible: true,
        translate: [0, 0] as [number, number],
        scale: 1,
        clip: null as { rect: number[] } | null,
      };
      scenes.push(state);
      const scene = {
        visible: (v: boolean) => ((state.visible = v), scene),
        translate: (x: number, y: number) => ((state.translate = [x, y]), scene),
        scale: (k: number) => ((state.scale = k), scene),
        clip: (s: { state: { rect: number[] } }) => ((state.clip = s.state), scene),
        add: () => scene,
      };
      return scene;
    },
    Shape: function Shape() {
      const state = {
        rect: [] as number[],
        resets: 0,
        visible: true,
        fill: null as number[] | null,
        stroke: null as unknown,
      };
      shapes.push(state);
      const shape = {
        state,
        appendRect: (x: number, y: number, w: number, h: number) => (
          (state.rect = [x, y, w, h]),
          shape
        ),
        fill: (...rgba: number[]) => ((state.fill = rgba), shape),
        stroke: (o: unknown) => ((state.stroke = o), shape),
        visible: (v: boolean) => ((state.visible = v), shape),
        reset: () => ((state.resets++, (state.rect = [])), shape),
      };
      return shape;
    },
  } as unknown as Pick<ThorVGNamespace, 'Scene' | 'Shape'>;
  const added: unknown[] = [];
  const root = { add: (p: unknown) => (added.push(p), root) } as unknown as Pick<Scene, 'add'>;
  return { TVG, root, scenes, shapes, added };
}

describe('createPanes', () => {
  it('creates the clipped self scene and the clipped frame of the opponent scene under root once, hidden', () => {
    const f = fakes();
    const panes = createPanes(f.TVG, f.root);
    // Scenes: self, opponent, and the untransformed frame that clips the opponent. Under root: self, the inset's
    // backdrop, the frame and the inset's border (#150).
    expect(f.added).toHaveLength(4);
    expect(f.added[0]).toBe(panes.self);
    expect(f.scenes).toHaveLength(3);
    expect(f.shapes).toHaveLength(4);
    expect(f.shapes[2]?.visible).toBe(false);
    expect(f.shapes[3]?.visible).toBe(false);
    expect(f.scenes[0]?.clip).toBe(f.shapes[0]);
    expect(f.scenes[1]?.clip).toBeNull();
    expect(f.scenes[2]?.clip).toBe(f.shapes[1]);
    expect(f.scenes[2]?.visible).toBe(false);
    expect(panes.layout).toBe('single');
  });

  it('clips single to the whole canvas, including the fill slack', () => {
    const f = fakes();
    const panes = createPanes(f.TVG, f.root);
    panes.apply('single', 1281.5, 721);
    expect(f.shapes[0]?.rect).toEqual([0, 0, 1281.5, 721]);
    expect(f.scenes[2]?.visible).toBe(false);
    expect(panes.opponentVisible).toBe(false);
  });

  it('splits columns: self 1280 wide, opponent from 1296 to the right edge', () => {
    const f = fakes();
    const panes = createPanes(f.TVG, f.root);
    panes.apply('columns', 2577, 720.5);
    expect(f.shapes[0]?.rect).toEqual([0, 0, 1280, 720.5]);
    expect(f.scenes[1]?.translate).toEqual([OPPONENT_X, 0]);
    expect(OPPONENT_X).toBe(1296);
    // The clip is in root units on the untransformed frame, so it does not depend on the translate.
    expect(f.shapes[1]?.rect).toEqual([1296, 0, 2577 - 1296, 720.5]);
    expect(f.scenes[2]?.visible).toBe(true);
    expect(panes.opponentVisible).toBe(true);
  });

  it('splits rows: self 720 high, opponent from 736 to the bottom edge, and back to single', () => {
    const f = fakes();
    const panes = createPanes(f.TVG, f.root);
    panes.apply('rows', 1280, 1457);
    expect(f.shapes[0]?.rect).toEqual([0, 0, 1280, 720]);
    expect(f.scenes[1]?.translate).toEqual([0, OPPONENT_Y]);
    expect(OPPONENT_Y).toBe(736);
    expect(f.shapes[1]?.rect).toEqual([0, 736, 1280, 1457 - 736]);
    panes.apply('single', 1280, 720);
    expect(f.scenes[2]?.visible).toBe(false);
    expect(f.shapes[0]?.rect).toEqual([0, 0, 1280, 720]);
    // Rewritten in place: still the same shapes.
    expect(f.shapes).toHaveLength(4);
    expect(f.shapes[0]?.resets).toBe(2);
  });

  // #150, ADR 0024: touch devices.
  it('keeps the inset, its backdrop and its frame at least 8 units below the top-right HUD', () => {
    const insetTop = PIP_RECT.y - Math.max(PIP_BACKDROP, PIP_FRAME / 2);
    expect(insetTop - HUD_TOP_RIGHT_BOTTOM).toBeGreaterThanOrEqual(8);
    expect(PIP_RECT.x + PIP_RECT.width).toBeLessThanOrEqual(1280);
  });

  it('draws pip: self over the whole canvas, the opponent scaled into the top-right inset with its frame', () => {
    const f = fakes();
    const panes = createPanes(f.TVG, f.root);
    panes.apply('pip', 1281.5, 720);
    expect(f.shapes[0]?.rect).toEqual([0, 0, 1281.5, 720]);
    expect(f.scenes[1]?.translate).toEqual([PIP_RECT.x, PIP_RECT.y]);
    expect(f.scenes[1]?.scale).toBe(PIP_SCALE);
    expect(f.shapes[1]?.rect).toEqual([PIP_RECT.x, PIP_RECT.y, PIP_RECT.width, PIP_RECT.height]);
    expect(f.scenes[2]?.visible).toBe(true);
    expect(panes.opponentVisible).toBe(true);
    expect(panes.opponentScale).toBe(PIP_SCALE);
    // Backdrop (60% black, 2 units beyond) under the frame, white 2-unit border above it.
    expect(f.shapes[2]).toMatchObject({
      visible: true,
      rect: [PIP_RECT.x - 2, PIP_RECT.y - 2, PIP_RECT.width + 4, PIP_RECT.height + 4],
      fill: [0, 0, 0, PIP_BACKDROP_ALPHA],
    });
    expect(f.shapes[3]).toMatchObject({
      visible: true,
      rect: [PIP_RECT.x, PIP_RECT.y, PIP_RECT.width, PIP_RECT.height],
      stroke: { width: 2, color: [255, 255, 255, 255] },
    });
    expect(panes.insetFrameVisible).toBe(true);
  });

  it('resets the scale and hides the inset frame when leaving pip, creating nothing', () => {
    const f = fakes();
    const panes = createPanes(f.TVG, f.root);
    panes.apply('pip', 1280, 720);
    panes.apply('columns', 2576, 720);
    expect(f.scenes[1]?.scale).toBe(1);
    expect(f.scenes[1]?.translate).toEqual([OPPONENT_X, 0]);
    expect(f.shapes[2]?.visible).toBe(false);
    expect(f.shapes[3]?.visible).toBe(false);
    expect(panes.opponentScale).toBe(1);
    panes.apply('pip', 1280, 720);
    panes.apply('single', 1280, 720);
    expect(f.scenes[1]?.scale).toBe(1);
    expect(f.shapes[3]?.visible).toBe(false);
    expect(f.scenes).toHaveLength(3);
    expect(f.shapes).toHaveLength(4);
    expect(f.added).toHaveLength(4);
  });
});
