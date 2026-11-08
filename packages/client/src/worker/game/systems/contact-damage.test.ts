import { ENEMIES, HIT_INVULN_SEC, PLAYER_RADIUS } from '@vs/shared';
import { describe, expect, it, vi } from 'vitest';
import { spawnEnemy } from '../enemies';
import type { World } from '../world';
import { createBaseWorld } from '../base-world';
import { contactDamageSystem } from './contact-damage';

const DT = 1 / 60;

/** Ten enemies on the player: five bats (damage 5) and five ghouls (damage 8). */
function crowded(onGameOver?: () => void): World {
  const world = createBaseWorld({ seed: 1, onGameOver });
  // Keep the spawner quiet so only the crowd below touches the player.
  world.spawnTimer = 1e9;
  for (let i = 0; i < 10; i++) spawnEnemy(world, i % 2 ? 'ghoul' : 'bat', i - 5, 3);
  return world;
}

function contactStep(world: World): void {
  const { x, y } = world.enemies.cols;
  world.enemyGrid.rebuild(x, y, world.enemies.count);
  contactDamageSystem(world, DT);
}

describe('contact damage', () => {
  it('lands one hit of the strongest touching enemy: 10 overlapping enemies of damage 5 and 8 deal exactly 8', () => {
    const world = crowded();
    contactStep(world);
    expect(world.player.hp).toBe(92);
    expect(world.player.invulnTime).toBe(HIT_INVULN_SEC);
    expect(world.events.count).toBe(1);
    expect(world.events.items[0]).toMatchObject({ kind: 'playerHit', amount: 8 });
  });

  it('lands the next hit only after 0.5 s of invulnerability', () => {
    const world = crowded();
    contactStep(world);
    let steps = 0;
    while (world.player.hp === 92 && steps < 120) {
      contactStep(world);
      steps++;
    }
    expect(world.player.hp).toBe(84);
    expect(steps * DT).toBeCloseTo(HIT_INVULN_SEC, 6);
  });

  it('ignores enemies beyond PLAYER_RADIUS + radius and applies armor with a minimum of 1', () => {
    const world = createBaseWorld({ seed: 1 });
    // A bat (radius 12) just out of reach, then a bat just in reach.
    spawnEnemy(world, 'bat', PLAYER_RADIUS + 12, 0);
    contactStep(world);
    expect(world.player.hp).toBe(100);
    spawnEnemy(world, 'bat', 0, PLAYER_RADIUS + 11.9);
    world.player.armor = 20;
    contactStep(world);
    expect(world.player.hp).toBe(99);
  });

  it('lets Death ignore armor: its full contact damage lands through any armor (#17)', () => {
    const world = createBaseWorld({ seed: 1 });
    world.player.armor = 1000;
    world.player.hp = 1e6;
    spawnEnemy(world, 'death', 0, 0);
    contactStep(world);
    expect(world.player.hp).toBe(1e6 - ENEMIES.death.contactDamage);
  });

  it('reports the game over once when HP crosses zero, and the simulation stops', () => {
    const onGameOver = vi.fn();
    const world = crowded(onGameOver);
    world.player.hp = 16;
    for (let i = 0; i < 300; i++) world.step(DT);
    expect(world.state).toBe('dead');
    expect(world.player.hp).toBe(0);
    expect(onGameOver).toHaveBeenCalledTimes(1);
    expect(onGameOver).toHaveBeenCalledWith(
      expect.objectContaining({ timeSec: world.time, kills: 0, level: 1, cleared: false }),
    );
    // Two ghoul hits (8 + 8) 0.5 s apart, before the Whip's first strike at 1.35 s: dead in the step after 0.5 s, then
    // frozen. Before #105 the faster bats shifted the crowd so a bat (5) landed one of the hits and death took three.
    expect(world.time).toBeCloseTo(0.5 + DT, 6);
    const frozen = { time: world.time, x: Array.from(world.enemies.cols.x) };
    world.step(DT);
    expect(world.time).toBe(frozen.time);
    expect(Array.from(world.enemies.cols.x)).toEqual(frozen.x);
    expect(onGameOver).toHaveBeenCalledTimes(1);
  });
});
