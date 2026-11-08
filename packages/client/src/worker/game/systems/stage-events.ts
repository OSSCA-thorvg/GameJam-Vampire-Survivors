import { ENEMY_CAP, STAGE, type StageEvent } from '@vs/shared';
import { assertNever } from '../../../protocol/assert-never';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../../constants';
import { spawnEnemy } from '../enemies';
import type { World } from '../world';
import { makeRoomForEnemy, spawnBoss } from './bosses';
import { spawnElite } from './elites';
import { SPAWN_MARGIN } from './spawner';

/** A ring swarm's radius around the player: half the view diagonal plus the spawn margin, just off screen. */
export const SWARM_RING_RADIUS = Math.hypot(VIEW_WIDTH, VIEW_HEIGHT) / 2 + SPAWN_MARGIN;

/**
 * Spawns a swarm (#17): `count` enemies evenly on a circle of `SWARM_RING_RADIUS` around the player (`ring`), or evenly
 * along the vertical view edge behind the player, `SPAWN_MARGIN` outside it (`line`). No randomness, so the schedule
 * depends only on the seed and the input (ADR 0005). Stops at `ENEMY_CAP`; the enemies then chase normally.
 */
function spawnSwarm(world: World, event: Extract<StageEvent, { kind: 'swarm' }>): void {
  const { player, enemies } = world;
  const view = world.camera.viewRect(SPAWN_MARGIN);
  const height = view.bottom - view.top;
  for (let k = 0; k < event.count && enemies.count < ENEMY_CAP; k++) {
    if (event.formation === 'ring') {
      const angle = (2 * Math.PI * k) / event.count;
      spawnEnemy(
        world,
        event.enemyId,
        player.x + Math.cos(angle) * SWARM_RING_RADIUS,
        player.y + Math.sin(angle) * SWARM_RING_RADIUS,
      );
    } else {
      const x = player.facingX > 0 ? view.left : view.right;
      spawnEnemy(world, event.enemyId, x, view.top + ((k + 0.5) * height) / event.count);
    }
  }
}

/**
 * Fires the stage's timed events (#17), after the spawner: every `STAGE.events` entry with `at <= world.time`, once and
 * in order, through `world.nextEventIndex`. Bosses and elites draw their ring point from `world.spawnRng`, in the
 * same order every run, and at `ENEMY_CAP` take the slot of the farthest normal enemy (`makeRoomForEnemy`). Stops once
 * the stage is cleared.
 */
export function stageEventSystem(world: World): void {
  const { events } = STAGE;
  while (!world.cleared && world.nextEventIndex < events.length) {
    const event = events[world.nextEventIndex];
    if (!event || event.at > world.time) return;
    world.nextEventIndex++;
    switch (event.kind) {
      case 'boss':
        spawnBoss(world, event.enemyId);
        break;
      case 'elite':
        for (let n = 0; n < event.count; n++) {
          // A scheduled elite (and its chest) is never lost to a full field, like a boss.
          makeRoomForEnemy(world);
          spawnElite(world, event.enemyId, 'player');
        }
        break;
      case 'swarm':
        spawnSwarm(world, event);
        break;
      default:
        assertNever(event);
    }
  }
}
