import type { Matrix, Paint } from '@thorvg/webcanvas';
import { vi } from 'vitest';

export function fakePaintLibrary(recordTransforms = true) {
  const paints: { visible: boolean; matrix: Matrix | null }[] = [];
  const create = vi.fn(() => {
    const state = { visible: true, matrix: null as Matrix | null };
    paints.push(state);
    const paint = {
      visible(value?: boolean) {
        if (value !== undefined) state.visible = value;
        return state.visible;
      },
      transform(matrix: Matrix) {
        if (recordTransforms) state.matrix = { ...matrix };
      },
    } as unknown as Paint;
    return { paint, offsetX: -16, offsetY: -16 };
  });
  const layer = { add: vi.fn() };
  return { create, layer, paints };
}
