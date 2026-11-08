import { Scene } from '@thorvg/webcanvas';
import { expect, it, vi } from 'vitest';
import { createLayers } from './layers';

vi.mock('@thorvg/webcanvas', () => ({
  Scene: class {
    readonly children: unknown[] = [];
    add(paint: unknown) {
      this.children.push(paint);
      return this;
    }
  },
}));

it('keeps ordered world layers below the camera-independent HUD', () => {
  const root = new Scene();
  const layers = createLayers(root);
  expect(root).toMatchObject({ children: [layers.world, layers.hud] });
  expect(layers.world).toMatchObject({
    children: [
      layers.ground,
      layers.pickups,
      layers.enemies,
      layers.projectiles,
      layers.player,
      layers.fx,
    ],
  });
});
