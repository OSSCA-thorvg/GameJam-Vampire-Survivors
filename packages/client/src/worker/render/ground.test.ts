import type { Matrix, Paint } from '@thorvg/webcanvas';
import { expect, it } from 'vitest';
import { createCamera } from '../game/camera';
import { createGround, GROUND_COLS, GROUND_ROWS, GROUND_TILE } from './ground';

/** A fake library whose instances record their matrix, with the manifest's `[0, 0]` anchor (offset 0). */
function fakeLibrary() {
  const matrices: (Matrix | null)[] = [];
  return {
    matrices,
    library: {
      create: () => {
        const index = matrices.push(null) - 1;
        const paint = {
          visible: () => true,
          transform(m: Matrix) {
            matrices[index] = { ...m };
          },
        } as unknown as Paint;
        return { paint, offsetX: 0, offsetY: 0 };
      },
    },
    layer: { add: () => undefined as never },
  };
}

it('uses the 128-unit tile in a 12 × 8 grid', () => {
  expect([GROUND_TILE, GROUND_COLS, GROUND_ROWS]).toEqual([128, 12, 8]);
});

it.each([
  [0, 0],
  [-1000, 37],
  [12345.6, -987],
  [-0.5, -127.999],
  [-98765.4321, 4321.987],
])('covers the whole view at camera (%d, %d) with 96 tiles', (cx, cy) => {
  const { matrices, library, layer } = fakeLibrary();
  const ground = createGround(library, layer);
  ground.sync(cx, cy);
  expect(ground.pool.created).toBe(96);
  expect(matrices).toHaveLength(96);
  const tiles = matrices.map((m) => {
    if (!m) throw new Error('tile never placed');
    // Overlapping placement: each tile spans its 128 units plus 1 unit of overlap.
    expect(m.e11).toBeCloseTo(129 / 128, 12);
    return {
      left: m.e13,
      top: m.e23,
      right: m.e13 + GROUND_TILE * m.e11,
      bottom: m.e23 + GROUND_TILE * m.e22,
    };
  });
  const camera = createCamera();
  camera.x = cx;
  camera.y = cy;
  const view = camera.viewRect(0);
  const inside = (px: number, py: number) =>
    tiles.some((t) => px >= t.left && px <= t.right && py >= t.top && py <= t.bottom);
  // Every corner, and a grid of points across the view (so neighbouring tiles leave no gap), lies in a tile.
  for (const [px, py] of [
    [view.left, view.top],
    [view.right, view.top],
    [view.left, view.bottom],
    [view.right, view.bottom],
  ] as const)
    expect(inside(px, py)).toBe(true);
  for (let px = view.left; px <= view.right; px += 16)
    for (let py = view.top; py <= view.bottom; py += 16) expect(inside(px, py)).toBe(true);
  // Adjacent tiles overlap by one unit, so no seam opens between them.
  const xs = [...new Set(tiles.map((t) => t.left))].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBe(GROUND_TILE);
});

it('acquires its tiles once and rewrites transforms only when the grid origin moves', () => {
  const { matrices, library, layer } = fakeLibrary();
  const ground = createGround(library, layer);
  for (let x = 0; x < 5000; x += 7.3) ground.sync(x, -x / 2);
  expect(ground.pool.created).toBe(96);
  expect(ground.pool.visibleCount).toBe(96);
  ground.sync(1000, 0);
  const before = JSON.stringify(matrices);
  ground.sync(1001.5, 3); // the same tile origin (256, -384)
  expect(JSON.stringify(matrices)).toBe(before);
  ground.sync(1100, 0); // origin moves one tile right
  expect(JSON.stringify(matrices)).not.toBe(before);
});
