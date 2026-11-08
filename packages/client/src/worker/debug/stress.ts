import type { Scene } from '@thorvg/webcanvas';
import { createRng } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { createStore } from '../ecs/store';
import { createSpatialGrid } from '../ecs/spatial-grid';
import { PaintPool, RenderBinding } from '../render/pool';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';

export interface StressSnapshot {
  entities: number;
  paintsCreated: number;
  visiblePaints: number;
  churnCycles: number;
  stepMs: number;
}
export interface StressScene {
  step(dt: number): void;
  render(): void;
  snapshot(): StressSnapshot;
  readonly stepMs: number;
  readonly entities: number;
  readonly paintsCreated: number;
}

/** Empty means normal boot. Invalid named scenarios are reserved for #22. */
export function parseStressCount(value: string): number | null {
  if (value === '') return null;
  const count = Number(value);
  if (!/^\d+$/.test(value) || !Number.isFinite(count)) {
    console.warn(`[stress] unsupported scenario: ${value}`);
    return null;
  }
  return Math.min(count, 4096);
}

/** All owned storage and Paints are created here. Steps and render only reuse them. */
export function createStressScene(
  library: Pick<AssetLibrary, 'create'>,
  layer: Pick<Scene, 'add'>,
  count: number,
  now: () => number = () => performance.now(),
): StressScene {
  if (!Number.isInteger(count) || count < 0 || count > 4096)
    throw new RangeError('Stress count must be an integer from 0 to 4096');
  const store = createStore(
    { x: 'f32', y: 'f32', vx: 'f32', vy: 'f32', ...RenderBinding.columns },
    Math.max(1, count),
  );
  const { x, y, vx, vy } = store.cols;
  const pool = new PaintPool(library, 'enemy.bat', layer, count);
  const binding = new RenderBinding(store, [pool]);
  const grid = createSpatialGrid({ cellSize: 64, buckets: 4096, maxItems: count });
  const neighbours = new Int32Array(count);
  const rng = createRng(1);
  let churnTime = 0;
  let churnCycles = 0;
  let stepMs = 0;
  const spawn = (): void => {
    const slot = store.add();
    if (slot === -1) throw new Error('Stress store exhausted its stable IDs');
    x[slot] = rng.range(16, VIEW_WIDTH - 16);
    y[slot] = rng.range(16, VIEW_HEIGHT - 16);
    vx[slot] = rng.range(-35, 35);
    vy[slot] = rng.range(-35, 35);
    binding.bind(slot, 0);
  };
  for (let i = 0; i < count; i++) spawn();

  function move(dt: number): void {
    for (let i = 0; i < store.count; i++) {
      let px = (x[i] ?? 0) + (vx[i] ?? 0) * dt;
      let py = (y[i] ?? 0) + (vy[i] ?? 0) * dt;
      if (px < 16 || px > VIEW_WIDTH - 16) {
        vx[i] = -(vx[i] ?? 0);
        px = Math.max(16, Math.min(VIEW_WIDTH - 16, px));
      }
      if (py < 16 || py > VIEW_HEIGHT - 16) {
        vy[i] = -(vy[i] ?? 0);
        py = Math.max(16, Math.min(VIEW_HEIGHT - 16, py));
      }
      x[i] = px;
      y[i] = py;
    }
  }
  function separate(dt: number): void {
    grid.rebuild(x, y, store.count);
    for (let i = 0; i < store.count; i++) {
      const px = x[i] ?? 0;
      const py = y[i] ?? 0;
      const found = grid.query(px, py, 20, neighbours);
      let pushX = 0;
      let pushY = 0;
      for (let k = 0; k < found; k++) {
        const other = neighbours[k] ?? -1;
        if (other === i) continue;
        const dx = px - (x[other] ?? 0);
        const dy = py - (y[other] ?? 0);
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0 && distance < 20) {
          const push = ((20 - distance) / distance) * dt;
          pushX += dx * push;
          pushY += dy * push;
        }
      }
      x[i] = Math.max(16, Math.min(VIEW_WIDTH - 16, px + pushX));
      y[i] = Math.max(16, Math.min(VIEW_HEIGHT - 16, py + pushY));
    }
  }
  return {
    step(dt) {
      const started = now();
      move(dt);
      separate(dt);
      churnTime += dt;
      if (churnTime >= 2 - 1e-9) {
        churnTime -= 2;
        const removed = Math.min(1000, store.count);
        for (let i = 0; i < removed; i++) {
          const slot = rng.int(store.count);
          binding.unbind(slot);
          store.remove(slot);
        }
        for (let i = 0; i < removed; i++) spawn();
        churnCycles++;
      }
      stepMs = now() - started;
    },
    render() {
      binding.sync(store, x, y);
    },
    snapshot: () => ({
      entities: store.count,
      paintsCreated: pool.created,
      visiblePaints: pool.visibleCount,
      churnCycles,
      stepMs,
    }),
    get stepMs() {
      return stepMs;
    },
    get entities() {
      return store.count;
    },
    get paintsCreated() {
      return pool.created;
    },
  };
}
