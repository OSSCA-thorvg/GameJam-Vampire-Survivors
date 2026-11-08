import type { Matrix, Scene, Shape, Text, ThorVGNamespace } from '@thorvg/webcanvas';
import { formatClock } from '@vs/shared';
import type { AssetLibrary } from '../assets/library';
import { VIEW_WIDTH } from '../constants';
import { PaintPool } from './pool';
import { HUD_FONT } from './thorvg';
import { setTransform } from './transform';

/** HP bar frame (`ui.hpBar`, 40×6) and its fill, inset by 1 on each side. */
const BAR_W = 40;
const BAR_H = 6;
const FILL_W = BAR_W - 2;
const FILL_H = BAR_H - 2;
/** Gap between the player's feet and the top of the HP bar, in world units. */
const BAR_GAP = 6;
const TIMER_SIZE = 28;
const KILLS_SIZE = 24;
/** Top margin of the HUD texts, in view units. */
const MARGIN = 14;
/** The kill counter's skull centre and the left edge of its number, which grows to the right (room for 5 digits). */
const SKULL_X = VIEW_WIDTH - 120;
const KILLS_X = VIEW_WIDTH - 100;
const SKULL_SCALE = 1.5;

/** What the HUD reads each frame. */
export interface HudInput {
  /** Player feet position, world units. */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  timeSec: number;
  kills: number;
}

export interface Hud {
  /** Places the HP bar under the player and refreshes the texts when their displayed value changed. */
  sync(input: HudInput): void;
  /** Shows or hides every HUD paint; hidden between runs. Creates nothing. */
  setVisible(visible: boolean): void;
  /** The HUD's pooled paints (`ui.hpBar`, `ui.skull`), for the `paintsCreated` count. */
  readonly pools: readonly PaintPool[];
}

/**
 * The in-game HUD (#9, ADR 0004): drawn by ThorVG, never the DOM. The HP bar lives in world space under the player
 * (in the `player` layer, above the sprite); the `mm:ss` timer and the kill counter are in the `hud` layer. Every
 * paint is created here once; per frame only transforms change, and text only when the shown value changes.
 */
export function createHud(
  TVG: Pick<ThorVGNamespace, 'Shape' | 'Text'>,
  library: Pick<AssetLibrary, 'create'>,
  layers: { player: Pick<Scene, 'add'>; hud: Pick<Scene, 'add'> },
): Hud {
  const barPool = new PaintPool(library, 'ui.hpBar', layers.player, 1);
  const fill: Shape = new TVG.Shape();
  fill.appendRect(0, 0, FILL_W, FILL_H).fill(0xc0, 0x39, 0x2b, 255);
  layers.player.add(fill);

  const timer: Text = new TVG.Text();
  timer.font(HUD_FONT).fontSize(TIMER_SIZE).fill(255, 255, 255).outline(2, 0, 0, 0);
  timer
    .align(0.5, 0)
    .translate(VIEW_WIDTH / 2, MARGIN)
    .text(formatClock(0));
  layers.hud.add(timer);

  const skullPool = new PaintPool(library, 'ui.skull', layers.hud, 1);
  const kills: Text = new TVG.Text();
  kills.font(HUD_FONT).fontSize(KILLS_SIZE).fill(255, 255, 255).outline(2, 0, 0, 0);
  kills
    .align(0, 0)
    .translate(KILLS_X, MARGIN + 2)
    .text('0');
  layers.hud.add(kills);

  const matrix: Matrix = { e11: 1, e12: 0, e13: 0, e21: 0, e22: 1, e23: 0, e31: 0, e32: 0, e33: 1 };
  let bar = barPool.get(0);
  let shownSecond = 0;
  let shownKills = 0;
  let visible = true;

  const setVisible = (next: boolean): void => {
    if (next === visible) return;
    visible = next;
    barPool.releaseAll();
    skullPool.releaseAll();
    if (next) {
      // A new run starts at 00:00 with no kills.
      bar = barPool.get(barPool.acquire());
      const skull = skullPool.get(skullPool.acquire());
      setTransform(skull, SKULL_X, MARGIN + 15, 0, SKULL_SCALE);
      shownSecond = 0;
      shownKills = 0;
      timer.text(formatClock(0));
      kills.text('0');
    }
    fill.visible(next);
    timer.visible(next);
    kills.visible(next);
  };
  setVisible(false);

  return {
    pools: [barPool, skullPool],
    setVisible,
    sync({ x, y, hp, maxHp, timeSec, kills: killCount }) {
      if (!visible) return;
      const top = y + BAR_GAP;
      setTransform(bar, x, top + BAR_H / 2);
      matrix.e11 = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      matrix.e13 = x - FILL_W / 2;
      matrix.e23 = top + 1;
      fill.transform(matrix);
      const second = Math.floor(timeSec);
      if (second !== shownSecond) {
        shownSecond = second;
        timer.text(formatClock(timeSec));
      }
      if (killCount !== shownKills) {
        shownKills = killCount;
        kills.text(String(killCount));
      }
    },
  };
}
