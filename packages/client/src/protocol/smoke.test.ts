import { expect, it } from 'vitest';

// Gives `pnpm --filter client test` and `-t` filtering something to run; #2 deletes it.
it('client toolchain runs', () => {
  expect(1 + 1).toBe(2);
});
