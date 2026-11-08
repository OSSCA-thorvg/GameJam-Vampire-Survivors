import type { Paint, Scene } from '@thorvg/webcanvas';
import { ASSET_IDS, ASSET_SIZES, createRng, type DrawableAssetId } from '@vs/shared';
import type { Axis } from '../../protocol/worker-messages';
import type { AssetLibrary } from '../assets/library';
import { isDrawableId, type AssetInstance } from '../assets/library';
import { HUD_FONT, type ThorVGContext } from '../render/thorvg';
import { setTransform } from '../render/transform';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';

const GROUPS = [
  'player',
  'portrait',
  'enemy',
  'boss',
  'weapon',
  'icon',
  'gem',
  'pickup',
  'stage',
  'fx',
  'ui',
];
const COLUMNS = 5;
const CELL_WIDTH = 244;
const PAN_SPEED = 500;

/**
 * Speed preview (#5, `KeyV`): every mass ID as a cluster drifting over tiled ground, to judge readability at game
 * speed. The drift is about the player's speed (initial value; tune against footage, docs/reference/gameplay.md).
 */
export const PREVIEW_IDS: readonly DrawableAssetId[] = [
  'enemy.bat',
  'enemy.ghoul',
  'enemy.skeleton',
  'enemy.wisp',
  'enemy.brute',
  'enemy.wraith',
  'gem.blue',
  'gem.green',
  'gem.red',
  'weapon.magicWand',
  'weapon.knife',
  'weapon.axe',
  'weapon.cross',
  'weapon.fireWand',
  'weapon.holyWand',
  'weapon.thousandEdge',
  'weapon.deathSpiral',
  'weapon.heavenSword',
];
const PREVIEW_PER_ID = 30;
const PREVIEW_SPEED = 100;
const PREVIEW_COLUMNS = 6;
const PREVIEW_SPREAD = 46;
const TILE = 128;

export interface Gallery {
  step(dx: Axis, dy: Axis, dtSec: number): void;
  snapshot(): {
    ids: readonly string[];
    panX: number;
    panY: number;
    width: number;
    height: number;
    lottieFrame: number;
  };
  /** Shows or hides the speed preview; its Paints are created the first time it opens. */
  togglePreview(): void;
  previewVisible(): boolean;
}

export function buildGallery({ TVG, root }: ThorVGContext, library: AssetLibrary): Gallery {
  const container: Scene = new TVG.Scene();
  root.add(new TVG.Shape().appendRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT).fill(20, 24, 36, 255));
  root.add(container);
  const ids = ASSET_IDS.filter(isDrawableId);
  let y = 32;
  let animated: AssetInstance | undefined;
  const label = (text: string, x: number, top: number, size: number): void => {
    const paint = new TVG.Text().font(HUD_FONT).fontSize(size).text(text).fill(230, 234, 245);
    paint.translate(x, top);
    container.add(paint);
  };
  for (const group of GROUPS) {
    const groupIds = ids.filter((id) => id.split('.')[0] === group);
    if (!groupIds.length) continue;
    label(group.toUpperCase(), 24, y, 20);
    y += 40;
    for (let start = 0; start < groupIds.length; start += COLUMNS) {
      const row = groupIds.slice(start, start + COLUMNS);
      const height = Math.max(...row.map((id) => ASSET_SIZES[id][1])) + 66;
      for (const [column, id] of row.entries()) {
        const x = 24 + column * CELL_WIDTH;
        const centerX = x + CELL_WIDTH / 2;
        const anchorY = y + (height - 36) / 2;
        const instance = library.create(id);
        const [width] = ASSET_SIZES[id];
        const previewScale = Math.min(1, (CELL_WIDTH - 12) / width);
        setTransform(instance, centerX, anchorY, 0, previewScale);
        container.add(instance.paint);
        const cross = new TVG.Shape();
        cross
          .appendRect(centerX - 5, anchorY - 1, 10, 2)
          .appendRect(centerX - 1, anchorY - 5, 2, 10)
          .fill(255, 255, 255, 255);
        container.add(cross);
        label(id, x + 2, y + height - 20, Math.min(13, (CELL_WIDTH - 12) / (id.length * 0.8)));
        if (id === 'fx.levelUp') animated = instance;
      }
      y += height;
    }
    y += 28;
  }
  let preview: Scene | null = null;
  let previewOn = false;
  let previewTime = 0;
  const drifting: { instance: AssetInstance; x: number; y: number; dir: 1 | -1 }[] = [];
  const labels: { paint: Paint; x: number; y: number; dir: 1 | -1 }[] = [];
  const buildPreview = (): Scene => {
    const scene: Scene = new TVG.Scene();
    for (let ty = 0; ty < Math.ceil(VIEW_HEIGHT / TILE); ty++)
      for (let tx = 0; tx < Math.ceil(VIEW_WIDTH / TILE); tx++) {
        const tile = library.create('stage.ground');
        // Tiles overlap by 1 unit: anti-aliased edges at fractional view scales otherwise show hairline seams.
        setTransform(tile, tx * TILE, ty * TILE, 0, (TILE + 1) / TILE);
        scene.add(tile.paint);
      }
    const rng = createRng(1);
    const rows = Math.ceil(PREVIEW_IDS.length / PREVIEW_COLUMNS);
    const cellW = VIEW_WIDTH / PREVIEW_COLUMNS;
    const cellH = VIEW_HEIGHT / rows;
    for (const [index, id] of PREVIEW_IDS.entries()) {
      const row = Math.floor(index / PREVIEW_COLUMNS);
      const x = (index % PREVIEW_COLUMNS) * cellW + cellW / 2;
      const y = row * cellH + cellH / 2;
      // Alternate rows drift left, flipped, so the flip path is previewed too.
      const dir = row % 2 === 0 ? 1 : -1;
      for (let n = 0; n < PREVIEW_PER_ID; n++) {
        const instance = library.create(id);
        scene.add(instance.paint);
        drifting.push({
          instance,
          x: x + rng.range(-PREVIEW_SPREAD, PREVIEW_SPREAD),
          y: y + rng.range(-PREVIEW_SPREAD, PREVIEW_SPREAD) * 0.8,
          dir,
        });
      }
      const paint = new TVG.Text().font(HUD_FONT).fontSize(12).text(id).fill(255, 255, 255);
      scene.add(paint);
      labels.push({ paint, x: x - 40, y: y + cellH / 2 - 16, dir });
    }
    root.add(scene);
    return scene;
  };
  /** Horizontal position after drifting, wrapped across the view (allocation-free; runs every step). */
  const drift = (x: number, dir: 1 | -1): number => {
    const span = VIEW_WIDTH + 2 * PREVIEW_SPREAD;
    const raw = x + dir * previewTime * PREVIEW_SPEED + PREVIEW_SPREAD;
    return (((raw % span) + span) % span) - PREVIEW_SPREAD;
  };
  const placePreview = (): void => {
    for (const item of drifting)
      setTransform(item.instance, drift(item.x, item.dir), item.y, 0, 1, item.dir < 0);
    for (const label of labels) label.paint.translate(drift(label.x, label.dir), label.y);
  };
  let panX = 0;
  let panY = 0;
  const width = 48 + COLUMNS * CELL_WIDTH;
  const height = y;
  return {
    step(dx, dy, dtSec) {
      panX = Math.max(0, Math.min(Math.max(0, width - VIEW_WIDTH), panX + dx * PAN_SPEED * dtSec));
      panY = Math.max(
        0,
        Math.min(Math.max(0, height - VIEW_HEIGHT), panY + dy * PAN_SPEED * dtSec),
      );
      container.translate(-panX, -panY);
      if (previewOn) {
        previewTime += dtSec;
        placePreview();
      }
    },
    togglePreview() {
      preview ??= buildPreview();
      previewOn = !previewOn;
      preview.visible(previewOn);
      container.visible(!previewOn);
      placePreview();
    },
    previewVisible: () => previewOn,
    snapshot: () => ({
      ids,
      panX,
      panY,
      width,
      height,
      lottieFrame: animated?.lottie?.frame() ?? 0,
    }),
  };
}
