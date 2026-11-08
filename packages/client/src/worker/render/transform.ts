import type { Matrix } from '@thorvg/webcanvas';
import type { AssetInstance } from '../assets/library';

const matrix: Matrix = { e11: 1, e12: 0, e13: 0, e21: 0, e22: 1, e23: 0, e31: 0, e32: 0, e33: 1 };

export function setTransform(
  instance: AssetInstance,
  x: number,
  y: number,
  rotationDeg = 0,
  scale = 1,
  flipX = false,
): void {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const sx = flipX ? -scale : scale;
  matrix.e11 = cos * sx;
  matrix.e12 = -sin * scale;
  matrix.e21 = sin * sx;
  matrix.e22 = cos * scale;
  matrix.e13 = x + matrix.e11 * instance.offsetX + matrix.e12 * instance.offsetY;
  matrix.e23 = y + matrix.e21 * instance.offsetX + matrix.e22 * instance.offsetY;
  instance.paint.transform(matrix);
}
