import type { Paint, Matrix } from '@thorvg/webcanvas';
import { expect, it } from 'vitest';
import { setTransform } from './transform';

it('combines anchor, rotation, scale and horizontal flip in a single transform', () => {
  let result: Matrix | undefined;
  const paint = {
    transform: (matrix: Matrix) => {
      result = { ...matrix };
    },
  } as unknown as Paint;
  const instance = { paint, offsetX: -10, offsetY: -5 };
  setTransform(instance, 100, 50);
  expect(result).toMatchObject({ e11: 1, e12: -0, e13: 90, e21: 0, e22: 1, e23: 45 });
  setTransform(instance, 100, 50, 90, 2, true);
  expect(result?.e13).toBeCloseTo(110);
  expect(result?.e23).toBeCloseTo(70);
  expect(result?.e12).toBeCloseTo(-2);
  expect(result?.e21).toBeCloseTo(-2);
});
