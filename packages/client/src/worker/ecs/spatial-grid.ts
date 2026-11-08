export interface SpatialGridOptions {
  cellSize: number;
  buckets: number;
  maxItems: number;
}
export interface SpatialGrid {
  rebuild(xs: Float32Array, ys: Float32Array, count: number): void;
  query(x: number, y: number, radius: number, out: Int32Array): number;
  nearest(x: number, y: number, maxRadius: number): number;
}

/** Unbounded world coordinates, bounded storage. Scratch space is allocated only when creating the grid. */
export function createSpatialGrid({
  cellSize,
  buckets,
  maxItems,
}: SpatialGridOptions): SpatialGrid {
  if (!Number.isFinite(cellSize) || cellSize <= 0)
    throw new RangeError('Grid cellSize must be positive and finite');
  if (
    !Number.isInteger(buckets) ||
    buckets < 1 ||
    buckets > 0x40000000 ||
    (buckets & (buckets - 1)) !== 0
  )
    throw new RangeError('Grid buckets must be a positive power of two');
  if (!Number.isInteger(maxItems) || maxItems < 0)
    throw new RangeError('Grid maxItems must be a nonnegative integer');
  const head = new Int32Array(buckets).fill(-1);
  const next = new Int32Array(maxItems);
  const keys = new Int32Array(64);
  let xs: Float32Array = new Float32Array(0);
  let ys: Float32Array = new Float32Array(0);
  let count = 0;
  const hash = (cx: number, cy: number): number =>
    ((cx * 73856093) ^ (cy * 19349663)) & (buckets - 1);
  const distanceTo = (i: number, x: number, y: number, linear: boolean): number => {
    const dx = (xs[i] ?? 0) - x;
    const dy = (ys[i] ?? 0) - y;
    return linear ? Math.hypot(dx, dy) : dx * dx + dy * dy;
  };
  const validQuery = (x: number, y: number, radius: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0)
      throw new RangeError('Grid queries need finite coordinates and a nonnegative radius');
  };
  const markKey = (key: number, used: number): boolean => {
    for (let i = 0; i < used; i++) if (keys[i] === key) return false;
    keys[used] = key;
    return true;
  };
  return {
    rebuild(nextXs, nextYs, nextCount) {
      if (
        !Number.isInteger(nextCount) ||
        nextCount < 0 ||
        nextCount > maxItems ||
        nextCount > nextXs.length ||
        nextCount > nextYs.length
      )
        throw new RangeError('Grid rebuild exceeds its storage or input columns');
      xs = nextXs;
      ys = nextYs;
      count = nextCount;
      head.fill(-1);
      for (let i = 0; i < count; i++) {
        const x = xs[i] ?? 0;
        const y = ys[i] ?? 0;
        if (!Number.isFinite(x) || !Number.isFinite(y))
          throw new RangeError('Grid positions must be finite');
        const key = hash(Math.floor(x / cellSize), Math.floor(y / cellSize));
        next[i] = head[key] ?? -1;
        head[key] = i;
      }
    },
    query(x, y, radius, out) {
      validQuery(x, y, radius);
      const radius2 = radius * radius;
      const linear = !Number.isFinite(radius2) || radius2 < 2 ** -1022;
      const limit = linear ? radius : radius2;
      const minX = Math.floor((x - radius) / cellSize);
      const maxX = Math.floor((x + radius) / cellSize);
      const minY = Math.floor((y - radius) / cellSize);
      const maxY = Math.floor((y + radius) / cellSize);
      let written = 0;
      // Large queries scan each indexed item once: no fixed-key scratch overflow or enormous cell loops.
      if (
        !Number.isSafeInteger(minX) ||
        !Number.isSafeInteger(maxX) ||
        !Number.isSafeInteger(minY) ||
        !Number.isSafeInteger(maxY) ||
        (maxX - minX + 1) * (maxY - minY + 1) > keys.length
      ) {
        for (let i = 0; i < count && written < out.length; i++)
          if (distanceTo(i, x, y, linear) <= limit) out[written++] = i;
        return written;
      }
      let used = 0;
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          const key = hash(cx, cy);
          if (!markKey(key, used)) continue;
          used++;
          for (let i = head[key] ?? -1; i !== -1; i = next[i] ?? -1) {
            if (written === out.length) return written;
            if (distanceTo(i, x, y, linear) <= limit) out[written++] = i;
          }
        }
      }
      return written;
    },
    nearest(x, y, maxRadius) {
      validQuery(x, y, maxRadius);
      let best = -1;
      const radius2 = maxRadius * maxRadius;
      const linear = !Number.isFinite(radius2) || radius2 < 2 ** -1022;
      let bestDistance = linear ? maxRadius : radius2;
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);
      const rings = Math.ceil(maxRadius / cellSize);
      if (
        !Number.isSafeInteger(cx) ||
        !Number.isSafeInteger(cy) ||
        !Number.isSafeInteger(rings) ||
        !Number.isSafeInteger(cx - rings) ||
        !Number.isSafeInteger(cx + rings) ||
        !Number.isSafeInteger(cy - rings) ||
        !Number.isSafeInteger(cy + rings) ||
        (rings * 2 + 1) ** 2 > keys.length
      ) {
        for (let i = 0; i < count; i++) {
          const distance = distanceTo(i, x, y, linear);
          if (distance < bestDistance || (distance === bestDistance && (best === -1 || i < best))) {
            best = i;
            bestDistance = distance;
          }
        }
        return best;
      }
      let used = 0;
      for (let ring = 0; ring <= rings; ring++) {
        for (let row = cy - ring; row <= cy + ring; row++) {
          for (let col = cx - ring; col <= cx + ring; col++) {
            if (
              ring !== 0 &&
              row !== cy - ring &&
              row !== cy + ring &&
              col !== cx - ring &&
              col !== cx + ring
            )
              continue;
            const key = hash(col, row);
            if (!markKey(key, used)) continue;
            used++;
            for (let i = head[key] ?? -1; i !== -1; i = next[i] ?? -1) {
              const distance = distanceTo(i, x, y, linear);
              if (
                distance < bestDistance ||
                (distance === bestDistance && (best === -1 || i < best))
              ) {
                best = i;
                bestDistance = distance;
              }
            }
          }
        }
      }
      return best;
    },
  };
}
