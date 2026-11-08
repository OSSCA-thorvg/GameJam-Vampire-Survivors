import { createLevelUpFlow } from './level';
import { createChestFlow } from './systems/chest-open';
import type { World } from './world';

/**
 * For tests that play a run for a while (#11): steps `world` like the worker does and answers every level-up with
 * its first option, and closes every opened chest (#15, #17), so the world never stays frozen on a pending choice.
 * Returns the `levelUp` messages posted.
 */
export function stepAnsweringLevelUps(world: World, steps: number, after?: () => void): number {
  let offered = 0;
  const idle = { pause: () => undefined, resume: () => undefined };
  const flow = createLevelUpFlow({
    post: () => {
      offered++;
    },
    ...idle,
  });
  const chests = createChestFlow({ post: () => undefined, ...idle });
  for (let i = 0; i < steps; i++) {
    world.step(1 / 60);
    flow.afterStep(world);
    while (flow.open) flow.choose(world, 0);
    chests.afterStep(world);
    chests.close(world);
    after?.();
  }
  return offered;
}
