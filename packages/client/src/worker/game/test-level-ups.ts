import { createLevelUpFlow } from './level';
import type { World } from './world';

/**
 * For tests that play a run for a while (#11): steps `world` like the worker does and answers every level-up with
 * its first option, so the world never stays frozen on a pending choice. Returns the `levelUp` messages posted.
 */
export function stepAnsweringLevelUps(world: World, steps: number, after?: () => void): number {
  let offered = 0;
  const flow = createLevelUpFlow({
    post: () => {
      offered++;
    },
    pause: () => undefined,
    resume: () => undefined,
  });
  for (let i = 0; i < steps; i++) {
    world.step(1 / 60);
    flow.afterStep(world);
    while (flow.open) flow.choose(world, 0);
    after?.();
  }
  return offered;
}
