// The floating virtual joystick (#149): a touch layer under the screens and above the canvas. The main thread owns
// input (ADR 0004), so the stick only turns a drag into the same 3-valued axis the keyboard produces; the worker
// normalizes diagonals. The ring and knob are DOM circles, never ThorVG.
import type { Axis } from '../../protocol/worker-messages';
import { h } from './dom';
import './touch-stick.css';

/** Inside this many CSS pixels from where the finger went down, the stick is centred: no movement. */
export const DEAD_ZONE_PX = 14;
/** The knob is drawn at most this far from the ring's centre. */
export const KNOB_RANGE_PX = 40;

export interface TouchStick {
  /** Enables the layer while a run is being played; disabling it releases a held stick. */
  setActive(active: boolean): void;
  /** Whether the layer is enabled (it only takes touches in touch mode, by CSS). */
  readonly active: boolean;
  /** The direction the stick sends now. */
  readonly axis: readonly [Axis, Axis];
  unmount(): void;
}

const SECTOR = Math.PI / 4;

/** `-0` becomes `0`, so equal directions compare equal everywhere. */
const unit = (v: number): Axis => (Math.round(v) || 0) as Axis;

/**
 * The direction of an offset from the stick's origin: (0, 0) inside the dead zone, otherwise the angle snapped to the
 * nearest of 8 sectors of 45°. Screen y grows downwards, as the world's does.
 */
export function stickAxis(offsetX: number, offsetY: number): [Axis, Axis] {
  if (Math.hypot(offsetX, offsetY) < DEAD_ZONE_PX) return [0, 0];
  const angle = Math.round(Math.atan2(offsetY, offsetX) / SECTOR) * SECTOR;
  return [unit(Math.cos(angle)), unit(Math.sin(angle))];
}

/**
 * Mounts `#touch-layer` into `root`, before anything mounted later (the screens), so it sits above the canvas and
 * under the screens. A touch `pointerdown` sets the origin and captures the pointer; moves set the axis through
 * `setAxis` (only on change); `pointerup`, `pointercancel` and `lostpointercapture` reset it to (0, 0). Only the first
 * touch pointer steers; others and every mouse or pen pointer are ignored.
 */
export function mountTouchStick(
  root: HTMLElement,
  setAxis: (dx: Axis, dy: Axis) => void,
): TouchStick {
  const ring = h('div', { class: 'touch-stick-ring', 'aria-hidden': 'true' });
  const knob = h('div', { class: 'touch-stick-knob', 'aria-hidden': 'true' });
  const layer = h('div', { id: 'touch-layer', 'data-active': 'false' }, [ring, knob]);
  let active = false;
  let pointerId: number | null = null;
  let originX = 0;
  let originY = 0;
  let axis: [Axis, Axis] = [0, 0];

  const send = (next: [Axis, Axis]): void => {
    if (next[0] === axis[0] && next[1] === axis[1]) return;
    axis = next;
    setAxis(next[0], next[1]);
  };
  const place = (el: HTMLElement, x: number, y: number): void => {
    el.style.transform = `translate(${String(x)}px, ${String(y)}px) translate(-50%, -50%)`;
  };
  const release = (): void => {
    if (pointerId !== null)
      try {
        if (layer.hasPointerCapture(pointerId)) layer.releasePointerCapture(pointerId);
      } catch {
        // Environments without pointer capture have nothing to release.
      }
    pointerId = null;
    layer.dataset.dragging = 'false';
    send([0, 0]);
  };

  layer.addEventListener('pointerdown', (e) => {
    if (!active || e.pointerType !== 'touch' || pointerId !== null) return;
    e.preventDefault();
    pointerId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    try {
      layer.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that is already gone cannot be captured; its `pointerup` still ends the drag.
    }
    place(ring, originX, originY);
    place(knob, originX, originY);
    layer.dataset.dragging = 'true';
  });
  layer.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - originX;
    const dy = e.clientY - originY;
    const length = Math.hypot(dx, dy);
    const k = length > KNOB_RANGE_PX ? KNOB_RANGE_PX / length : 1;
    place(knob, originX + dx * k, originY + dy * k);
    send(stickAxis(dx, dy));
  });
  const end = (e: PointerEvent): void => {
    if (e.pointerId === pointerId) release();
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);
  layer.addEventListener('lostpointercapture', end);
  // A long press must not open the context menu or the iOS callout over the game.
  layer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  layer.dataset.dragging = 'false';
  root.append(layer);

  return {
    setActive(next) {
      if (next === active) return;
      active = next;
      layer.dataset.active = String(next);
      if (!next) release();
    },
    get active() {
      return active;
    },
    get axis() {
      return axis;
    },
    unmount() {
      release();
      layer.remove();
    },
  };
}
