import type { Scene, ThorVGNamespace } from '@thorvg/webcanvas';
import { describe, expect, it } from 'vitest';
import { createPanes, OPPONENT_X, OPPONENT_Y } from './panes';

/** Fake Scenes and Shapes that record their clip rectangle, translation and visibility. */
function fakes() {
  const scenes: {
    visible: boolean;
    translate: [number, number];
    clip: { rect: number[] } | null;
  }[] = [];
  const shapes: { rect: number[]; resets: number }[] = [];
  const TVG = {
    Scene: function Scene() {
      const state = {
        visible: true,
        translate: [0, 0] as [number, number],
        clip: null as { rect: number[] } | null,
      };
      scenes.push(state);
      const scene = {
        visible: (v: boolean) => ((state.visible = v), scene),
        translate: (x: number, y: number) => ((state.translate = [x, y]), scene),
        clip: (s: { state: { rect: number[] } }) => ((state.clip = s.state), scene),
        add: () => scene,
      };
      return scene;
    },
    Shape: function Shape() {
      const state = { rect: [] as number[], resets: 0 };
      shapes.push(state);
      const shape = {
        state,
        appendRect: (x: number, y: number, w: number, h: number) => (
          (state.rect = [x, y, w, h]),
          shape
        ),
        fill: () => shape,
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
    // Scenes: self, opponent, and the untransformed frame that clips the opponent.
    expect(f.added).toHaveLength(2);
    expect(f.added[0]).toBe(panes.self);
    expect(f.scenes).toHaveLength(3);
    expect(f.shapes).toHaveLength(2);
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
    // Rewritten in place: still the same two shapes.
    expect(f.shapes).toHaveLength(2);
    expect(f.shapes[0]?.resets).toBe(2);
  });
});
