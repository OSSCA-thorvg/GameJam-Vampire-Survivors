import type { Matrix, Scene, Shape, Text, ThorVGNamespace } from '@thorvg/webcanvas';
import { formatClock, xpToNext } from '@vs/shared';
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
/** The XP bar along the top edge (#11): `ui.xpBar` (400×12) stretched to the view width, its fill inset by 2. */
const XP_FRAME_W = 400;
const XP_BAR_H = 12;
const XP_INSET = 2;
const XP_FILL_W = VIEW_WIDTH - 2 * XP_INSET;
const XP_FILL_H = XP_BAR_H - 2 * XP_INSET;
const LEVEL_SIZE = 13;
/** The timer sits below the XP bar (#11 moved it down by 14). */
const TIMER_Y = MARGIN + 14;
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
  /** XP toward the next level, and the level (#11). */
  xp: number;
  level: number;
}

export interface Hud {
  /** Places the HP bar under the player and refreshes the texts when their displayed value changed. */
  sync(input: HudInput): void;
  /** Shows or hides every HUD paint; hidden between runs. Creates nothing. */
  setVisible(visible: boolean): void;
  /** The HUD's pooled paints (`ui.hpBar`, `ui.skull`, `ui.xpBar`), for the `paintsCreated` count. */
  readonly pools: readonly PaintPool[];
}

/**
 * The in-game HUD (#9, ADR 0004): drawn by ThorVG, never the DOM. The HP bar lives in world space under the player
 * (in the `player` layer, above the sprite); the XP bar with its `Lv n` (#11), the `mm:ss` timer and the kill counter
 * are in the `hud` layer. Every
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

  const xpBarPool = new PaintPool(library, 'ui.xpBar', layers.hud, 1);
  const xpFill: Shape = new TVG.Shape();
  xpFill.appendRect(0, 0, XP_FILL_W, XP_FILL_H).fill(0x3b, 0x8e, 0xea, 255);
  layers.hud.add(xpFill);
  const levelText: Text = new TVG.Text();
  levelText.font(HUD_FONT).fontSize(LEVEL_SIZE).fill(255, 255, 255).outline(2, 0, 0, 0);
  levelText
    .align(1, 0)
    .translate(VIEW_WIDTH - 2 * MARGIN, -1)
    .text('Lv 1');
  layers.hud.add(levelText);

  const timer: Text = new TVG.Text();
  timer.font(HUD_FONT).fontSize(TIMER_SIZE).fill(255, 255, 255).outline(2, 0, 0, 0);
  timer
    .align(0.5, 0)
    .translate(VIEW_WIDTH / 2, TIMER_Y)
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
  const xpMatrix: Matrix = { ...matrix, e13: XP_INSET, e23: XP_INSET };
  let bar = barPool.get(0);
  let shownSecond = 0;
  let shownKills = 0;
  let shownLevel = 1;
  let visible = true;

  const setVisible = (next: boolean): void => {
    if (next === visible) return;
    visible = next;
    barPool.releaseAll();
    skullPool.releaseAll();
    xpBarPool.releaseAll();
    if (next) {
      // A new run starts at 00:00 with no kills, at level 1 with no XP.
      bar = barPool.get(barPool.acquire());
      const skull = skullPool.get(skullPool.acquire());
      setTransform(skull, SKULL_X, MARGIN + 15, 0, SKULL_SCALE);
      const xpBar = xpBarPool.get(xpBarPool.acquire());
      const sx = VIEW_WIDTH / XP_FRAME_W;
      xpBar.paint.transform({
        ...matrix,
        e11: sx,
        e22: 1,
        e13: VIEW_WIDTH / 2 + sx * xpBar.offsetX,
        e23: XP_BAR_H / 2 + xpBar.offsetY,
      });
      shownSecond = 0;
      shownKills = 0;
      shownLevel = 1;
      timer.text(formatClock(0));
      kills.text('0');
      levelText.text('Lv 1');
    }
    fill.visible(next);
    xpFill.visible(next);
    levelText.visible(next);
    timer.visible(next);
    kills.visible(next);
  };
  setVisible(false);

  return {
    pools: [barPool, skullPool, xpBarPool],
    setVisible,
    sync({ x, y, hp, maxHp, timeSec, kills: killCount, xp, level }) {
      if (!visible) return;
      const top = y + BAR_GAP;
      setTransform(bar, x, top + BAR_H / 2);
      matrix.e11 = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      matrix.e13 = x - FILL_W / 2;
      matrix.e23 = top + 1;
      fill.transform(matrix);
      const need = xpToNext(level);
      xpMatrix.e11 = need > 0 ? Math.max(0, Math.min(1, xp / need)) : 0;
      xpFill.transform(xpMatrix);
      if (level !== shownLevel) {
        shownLevel = level;
        levelText.text(`Lv ${String(level)}`);
      }
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
