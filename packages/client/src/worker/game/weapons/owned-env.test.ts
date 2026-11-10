import { BASE_STATS } from '@vs/shared';
import { expect, it, vi } from 'vitest';
import { addWeapon } from './owned';

vi.mock('./patterns/registry', () => ({ PATTERNS: {} }));

it('still rejects missing weapon patterns in the actual development environment', () => {
  expect(import.meta.env.DEV).toBe(true);
  expect(() => addWeapon({ weapons: [], player: { stats: BASE_STATS } }, 'whip')).toThrow(
    /has no module/,
  );
});
