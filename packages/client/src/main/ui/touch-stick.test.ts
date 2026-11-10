// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Axis } from '../../protocol/worker-messages';
import { DEAD_ZONE_PX, mountTouchStick, stickAxis } from './touch-stick';

const pointer = (type: string, x: number, y: number, pointerId = 1, pointerType = 'touch'): Event =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    clientX: x,
    clientY: y,
    pointerId,
    pointerType,
  });

describe('stickAxis', () => {
  it('is centred inside the dead zone', () => {
    expect(stickAxis(0, 0)).toEqual([0, 0]);
    expect(stickAxis(DEAD_ZONE_PX - 1, 0)).toEqual([0, 0]);
    expect(stickAxis(-9, 9)).toEqual([0, 0]);
  });

  it('snaps every angle to the nearest of 8 directions', () => {
    const r = 60;
    const at = (deg: number) =>
      stickAxis(r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180));
    expect(at(0)).toEqual([1, 0]);
    expect(at(22)).toEqual([1, 0]);
    expect(at(23)).toEqual([1, 1]);
    expect(at(90)).toEqual([0, 1]);
    expect(at(135)).toEqual([-1, 1]);
    expect(at(180)).toEqual([-1, 0]);
    expect(at(-135)).toEqual([-1, -1]);
    expect(at(-90)).toEqual([0, -1]);
    expect(at(-45)).toEqual([1, -1]);
    expect(at(-68)).toEqual([0, -1]);
    // Never -0, so equal directions are equal.
    for (let deg = -180; deg <= 180; deg += 5)
      for (const v of at(deg)) expect(Object.is(v, -0)).toBe(false);
  });
});

describe('mountTouchStick', () => {
  let sent: [Axis, Axis][];

  beforeEach(() => {
    document.body.replaceChildren();
    sent = [];
  });

  const mount = () => {
    const stick = mountTouchStick(document.body, (dx, dy) => sent.push([dx, dy]));
    const layer = document.getElementById('touch-layer') as HTMLDivElement;
    return { stick, layer };
  };

  it('drags from the touch-down origin, sends only changes, and resets on release', () => {
    const { stick, layer } = mount();
    stick.setActive(true);
    expect(layer.dataset.active).toBe('true');
    layer.dispatchEvent(pointer('pointerdown', 200, 300));
    expect(layer.dataset.dragging).toBe('true');
    layer.dispatchEvent(pointer('pointermove', 205, 300)); // dead zone
    layer.dispatchEvent(pointer('pointermove', 260, 300));
    layer.dispatchEvent(pointer('pointermove', 280, 302));
    layer.dispatchEvent(pointer('pointermove', 160, 260));
    expect(stick.axis).toEqual([-1, -1]);
    layer.dispatchEvent(pointer('pointerup', 160, 260));
    expect(sent).toEqual([
      [1, 0],
      [-1, -1],
      [0, 0],
    ]);
    expect(layer.dataset.dragging).toBe('false');
  });

  it('clamps the knob to 40 px from the ring', () => {
    const { stick, layer } = mount();
    stick.setActive(true);
    layer.dispatchEvent(pointer('pointerdown', 100, 100));
    layer.dispatchEvent(pointer('pointermove', 400, 100));
    const knob = layer.querySelector<HTMLElement>('.touch-stick-knob');
    expect(knob?.style.transform).toContain('translate(140px, 100px)');
  });

  it('ignores a second finger, mouse and pen pointers, and touches while inactive', () => {
    const { stick, layer } = mount();
    layer.dispatchEvent(pointer('pointerdown', 0, 0));
    layer.dispatchEvent(pointer('pointermove', 100, 0));
    expect(sent).toEqual([]);
    stick.setActive(true);
    layer.dispatchEvent(pointer('pointerdown', 0, 0, 2, 'mouse'));
    layer.dispatchEvent(pointer('pointermove', 100, 0, 2, 'mouse'));
    expect(sent).toEqual([]);
    layer.dispatchEvent(pointer('pointerdown', 0, 0, 3));
    layer.dispatchEvent(pointer('pointerdown', 50, 50, 4));
    layer.dispatchEvent(pointer('pointermove', 0, 100, 4));
    layer.dispatchEvent(pointer('pointerup', 0, 100, 4));
    expect(sent).toEqual([]);
    layer.dispatchEvent(pointer('pointermove', 0, 100, 3));
    expect(sent).toEqual([[0, 1]]);
    layer.dispatchEvent(pointer('pointercancel', 0, 100, 3));
    expect(sent.at(-1)).toEqual([0, 0]);
  });

  it('releases a held stick when deactivated and on lost capture', () => {
    const { stick, layer } = mount();
    stick.setActive(true);
    layer.dispatchEvent(pointer('pointerdown', 0, 0));
    layer.dispatchEvent(pointer('pointermove', 0, -50));
    stick.setActive(false);
    expect(sent).toEqual([
      [0, -1],
      [0, 0],
    ]);
    expect(layer.dataset.active).toBe('false');
    stick.setActive(true);
    layer.dispatchEvent(pointer('pointerdown', 0, 0, 5));
    layer.dispatchEvent(pointer('pointermove', 50, 0, 5));
    layer.dispatchEvent(pointer('lostpointercapture', 50, 0, 5));
    expect(sent.slice(2)).toEqual([
      [1, 0],
      [0, 0],
    ]);
    stick.unmount();
    expect(document.getElementById('touch-layer')).toBeNull();
  });
});
