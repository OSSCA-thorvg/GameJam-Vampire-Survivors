import { ENEMIES, STAGE } from '@vs/shared';
import { expect, it, vi } from 'vitest';
import type { RunSummary } from '../../protocol/worker-messages';
import { createBaseWorld } from './base-world';
import { cleanupSystem, damageEnemy } from './combat';
import { spawnEnemy } from './enemies';
import { addPassive } from './passives';
import { addWeapon } from './weapons/owned';

const DT = 1 / 60;

it('reports kills and per-weapon damage, capped at the HP left, in gameOver for a scripted fight', () => {
  const onGameOver = vi.fn<(summary: RunSummary) => void>();
  const world = createBaseWorld({ seed: 4, onGameOver });
  world.spawnTimer = 1e9;
  world.nextEventIndex = STAGE.events.length;
  addWeapon(world, 'magicWand');
  addPassive(world, 'spinach');
  for (const w of world.weapons) w.cooldownLeft = 1e9;
  const [whip, wand] = world.weapons;
  if (!whip || !wand) throw new Error('two weapons expected');
  // Two ghouls (15 HP each). Ghoul a: Whip 10, then Whip 10 on its last 5 HP (counts 5). Ghoul b: wand 10, then Whip 10
  // on its last 5 HP (counts 5). A non-weapon hit (source -1, as the Rosary deals) on a bat counts for no weapon.
  const a = spawnEnemy(world, 'ghoul', 400, 0);
  const b = spawnEnemy(world, 'ghoul', 420, 0);
  const c = spawnEnemy(world, 'bat', 440, 0);
  damageEnemy(world, a, 10, 1, 0, 0, whip.slot);
  damageEnemy(world, a, 10, 1, 0, 0, whip.slot);
  damageEnemy(world, b, 10, 1, 0, 0, wand.slot);
  damageEnemy(world, b, 10, 1, 0, 0, whip.slot);
  damageEnemy(world, c, 99, 0, 0, 0, -1);
  cleanupSystem(world, DT);
  expect(world.stats.kills).toBe(3);
  expect(ENEMIES.ghoul.maxHp).toBe(15);
  expect(Array.from(world.runStats.damageBySlot)).toEqual([20, 10, 0, 0, 0, 0]);
  // A bat on the player at 1 HP ends the run.
  world.player.hp = 1;
  world.enemies.clear();
  spawnEnemy(world, 'bat', world.player.x, world.player.y);
  world.step(DT);
  expect(world.state).toBe('dead');
  expect(onGameOver).toHaveBeenCalledTimes(1);
  expect(onGameOver.mock.calls[0]?.[0]).toEqual({
    timeSec: world.time,
    kills: 3,
    level: 1,
    cleared: false,
    characterId: 'warden',
    weapons: [
      { id: 'whip', level: 1, damage: 20 },
      { id: 'magicWand', level: 1, damage: 10 },
    ],
    passives: [{ id: 'spinach', level: 1 }],
  });
});

it('sorts the weapons by damage, most first', () => {
  const onGameOver = vi.fn<(summary: RunSummary) => void>();
  const world = createBaseWorld({ seed: 4, onGameOver });
  addWeapon(world, 'knife');
  world.runStats.damageBySlot[1] = 50;
  world.runStats.damageBySlot[0] = 7;
  world.player.hp = 1;
  world.spawnTimer = 1e9;
  for (const w of world.weapons) w.cooldownLeft = 1e9;
  spawnEnemy(world, 'bat', world.player.x, world.player.y);
  world.step(DT);
  expect(onGameOver.mock.calls[0]?.[0].weapons.map((w) => w.id)).toEqual(['knife', 'whip']);
});
