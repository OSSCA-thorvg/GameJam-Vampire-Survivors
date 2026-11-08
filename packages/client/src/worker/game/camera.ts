import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';

export interface ViewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Camera {
  /** World position shown at the centre of the view. */
  x: number;
  y: number;
  /**
   * The view in world units, expanded by `margin` on each side (the spawner, #8, and culling use it). Returns one
   * shared object, overwritten by the next call, so the frame loop allocates nothing.
   */
  viewRect(margin: number): ViewRect;
}

export function createCamera(): Camera {
  const rect: ViewRect = { left: 0, top: 0, right: 0, bottom: 0 };
  const camera: Camera = {
    x: 0,
    y: 0,
    viewRect(margin) {
      rect.left = camera.x - VIEW_WIDTH / 2 - margin;
      rect.top = camera.y - VIEW_HEIGHT / 2 - margin;
      rect.right = camera.x + VIEW_WIDTH / 2 + margin;
      rect.bottom = camera.y + VIEW_HEIGHT / 2 + margin;
      return rect;
    },
  };
  return camera;
}

/** Keeps the player exactly centred, with no smoothing, as the original does. */
export function cameraSystem(world: { camera: Camera; player: { x: number; y: number } }): void {
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
}

/** Rounds a logical coordinate to a whole device pixel (`scale` device pixels per unit) to avoid shimmering seams. */
export function snapToPixel(value: number, scale: number): number {
  return scale > 0 ? Math.round(value * scale) / scale : value;
}
