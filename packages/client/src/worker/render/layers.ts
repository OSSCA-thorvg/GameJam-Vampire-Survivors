import { Scene } from '@thorvg/webcanvas';

export interface Layers {
  world: Scene;
  ground: Scene;
  pickups: Scene;
  enemies: Scene;
  projectiles: Scene;
  player: Scene;
  fx: Scene;
  hud: Scene;
}

/** Call after ThorVG.init. Camera transforms belong to world, never hud. */
export function createLayers(root: Scene): Layers {
  const layers: Layers = {
    world: new Scene(),
    ground: new Scene(),
    pickups: new Scene(),
    enemies: new Scene(),
    projectiles: new Scene(),
    player: new Scene(),
    fx: new Scene(),
    hud: new Scene(),
  };
  layers.world
    .add(layers.ground)
    .add(layers.pickups)
    .add(layers.enemies)
    .add(layers.projectiles)
    .add(layers.player)
    .add(layers.fx);
  root.add(layers.world).add(layers.hud);
  return layers;
}
