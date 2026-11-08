import type { Scene } from '@thorvg/webcanvas';
import { ASSET_IDS, ASSET_SIZES } from '@vs/shared';
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
    },
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
