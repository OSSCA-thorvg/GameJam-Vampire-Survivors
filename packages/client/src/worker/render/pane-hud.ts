import type { Paint, Scene, Text, ThorVGNamespace } from '@thorvg/webcanvas';
import { formatClock } from '@vs/shared';
import type { OpponentState } from '../../protocol/worker-messages';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../constants';
import { TIMER_SIZE, TIMER_Y } from './hud';
import { HUD_FONT } from './thorvg';

/** Printable ASCII only (ADR 0013): the HUD font has no other glyphs. Nicknames stay DOM text (ADR 0009, 0011). */
export const YOU_LABEL = 'YOU';
export const OPPONENT_LABEL = 'OPPONENT';
export const AWAY_TEXT = 'AWAY';
export const OUT_TEXT = 'OUT';
const LABEL_SIZE = 20;
const STATE_SIZE = 48;
/** Bottom-left corner of a pane, in view units. */
const LABEL_X = 16;
const LABEL_Y = VIEW_HEIGHT - 16;
/** The opponent world's and HUD's opacity while away or disconnected (60%), and once out of the match (40%). */
export const AWAY_OPACITY = 153;
export const OUT_OPACITY = 102;
const OPAQUE = 255;

/** One pane label (#115): a ThorVG text at the pane's bottom left, created once, only shown or hidden. */
export interface PaneLabel {
  setVisible(visible: boolean): void;
  readonly visible: boolean;
}

/** Call after `initThorVG` (reads `HUD_FONT`). Hidden until shown. */
export function createPaneLabel(
  TVG: Pick<ThorVGNamespace, 'Text'>,
  layer: Pick<Scene, 'add'>,
  label: string,
): PaneLabel {
  const text: Text = new TVG.Text();
  text.font(HUD_FONT).fontSize(LABEL_SIZE).fill(255, 255, 255).outline(2, 0, 0, 0);
  text.align(0, 1).translate(LABEL_X, LABEL_Y).text(label);
  text.visible(false);
  layer.add(text);
  let visible = false;
  return {
    get visible() {
      return visible;
    },
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      text.visible(next);
    },
  };
}

/** The opponent pane's HUD (#115): its "OPPONENT" label, the opponent's `mm:ss` and the "AWAY"/"OUT" dim. */
export interface OpponentHud {
  /** The opponent's simulated time in ms from the newest view, or `null` before the first (the timer hides). */
  sync(timeMs: number | null): void;
  setState(state: OpponentState): void;
  readonly state: OpponentState;
}

/**
 * Call after `initThorVG`. `hud` gets the label and timer; `top` (the opponent pane's scene, above both layers) gets
 * the state line, so it stays readable while `dim` (the opponent's world and HUD layers) fade.
 */
export function createOpponentHud(
  TVG: Pick<ThorVGNamespace, 'Text'>,
  hud: Pick<Scene, 'add'>,
  top: Pick<Scene, 'add'>,
  dim: readonly Pick<Paint, 'opacity'>[],
): OpponentHud {
  const label = createPaneLabel(TVG, hud, OPPONENT_LABEL);
  label.setVisible(true);
  const timer: Text = new TVG.Text();
  timer.font(HUD_FONT).fontSize(TIMER_SIZE).fill(255, 255, 255).outline(2, 0, 0, 0);
  timer
    .align(0.5, 0)
    .translate(VIEW_WIDTH / 2, TIMER_Y)
    .text(formatClock(0));
  timer.visible(false);
  hud.add(timer);
  const line: Text = new TVG.Text();
  line.font(HUD_FONT).fontSize(STATE_SIZE).fill(255, 255, 255).outline(3, 0, 0, 0);
  line
    .align(0.5, 0.5)
    .translate(VIEW_WIDTH / 2, VIEW_HEIGHT / 2)
    .text(AWAY_TEXT);
  line.visible(false);
  top.add(line);
  let shownSecond = -1;
  let state: OpponentState = 'live';
  return {
    get state() {
      return state;
    },
    sync(timeMs) {
      if (timeMs === null) {
        if (shownSecond !== -1) timer.visible(false);
        shownSecond = -1;
        return;
      }
      const second = Math.floor(timeMs / 1000);
      if (second === shownSecond) return;
      if (shownSecond === -1) timer.visible(true);
      shownSecond = second;
      timer.text(formatClock(timeMs / 1000));
    },
    setState(next) {
      if (next === state) return;
      state = next;
      const opacity = next === 'away' ? AWAY_OPACITY : next === 'out' ? OUT_OPACITY : OPAQUE;
      for (const scene of dim) scene.opacity(opacity);
      if (next !== 'live') line.text(next === 'away' ? AWAY_TEXT : OUT_TEXT);
      line.visible(next !== 'live');
    },
  };
}
