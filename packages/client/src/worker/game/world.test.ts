import { expect, it } from 'vitest';
import { cameraSystem } from './camera';
import { playerMovementSystem } from './player';
import { readPlayerSnapshot } from './snapshot';
import { createWorld, inputSystem, SYSTEMS } from './world';

it('runs input, movement, then camera', () => {
  expect(SYSTEMS).toEqual([inputSystem, playerMovementSystem, cameraSystem]);
});

it('stores the seed and character, seeds the root stream and reports the player snapshot', () => {
  const a = createWorld({ seed: 42 });
  const b = createWorld({ seed: 42, characterId: 'swift' });
  expect(a.characterId).toBe('warden');
  expect(b.characterId).toBe('swift');
  expect(a.rng.fork('spawn').next()).toBe(b.rng.fork('spawn').next());
  a.input = { dx: 1, dy: 0 };
  a.step(0.5);
  expect(readPlayerSnapshot(a)).toEqual({ x: 70, y: 0, facingX: 1 });
});

it('renders through the view: the world layer follows the camera, snapped to device pixels', () => {
  const translations: [number, number][] = [];
  const created: string[] = [];
  const world = createWorld({
    seed: 1,
    view: {
      library: {
        create: (id) => {
          created.push(id);
          return {
            paint: { visible: () => true, transform: () => undefined } as never,
            offsetX: 0,
            offsetY: 0,
          };
        },
      },
      layers: {
        world: {
          translate: (x: number, y: number) => (translations.push([x, y]), undefined as never),
        },
        ground: { add: () => undefined as never },
        player: { add: () => undefined as never },
      },
      scale: () => 2,
    },
  });
  world.input = { dx: 1, dy: 0 };
  world.step(1 / 60);
  world.render(0);
  world.render(0);
  expect(created.filter((id) => id === 'stage.ground')).toHaveLength(96);
  expect(created.filter((id) => id === 'player.warden')).toHaveLength(1);
  expect(created).toHaveLength(97);
  const [x, y] = translations[0] ?? [NaN, NaN];
  expect(x * 2).toBe(Math.round((640 - world.player.x) * 2));
  expect(y).toBe(360);
});
