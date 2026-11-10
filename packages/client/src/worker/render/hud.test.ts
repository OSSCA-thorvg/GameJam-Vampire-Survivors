import { expect, it } from 'vitest';
import { fakeGameView, type FakePaint } from '../game/view-test-helpers';
import { FULL_VIEW, PIP_TOP, pipRect, type VisibleRect } from '../constants';
import { createHud, hudAnchors, HUD_TOP_RIGHT_BOTTOM, TIMER_Y } from './hud';
import { PIP_BACKDROP } from './panes';
import { createSentToast } from './sent-toast';

/** A 844×390 phone (top and bottom cropped) and a 1024×768 tablet (cropped left and right down to `MIN_VISIBLE_WIDTH`). */
const PHONE: VisibleRect = { x: 0, y: 64.5, width: 1280, height: 591 };
const TABLET: VisibleRect = { x: 30, y: 0, width: 1220, height: 720 };

function setup() {
  const fake = fakeGameView();
  const { TVG, library, layers } = fake.options;
  const hud = createHud(TVG, library, layers);
  const texts = fake.paints.filter((p) => p.id === 'Text');
  const byText = (text: string): FakePaint => {
    const found = texts.find((p) => p.text === text);
    if (!found) throw new Error(`no text ${text}`);
    return found;
  };
  const byId = (id: string): FakePaint => {
    const found = fake.paints.find((p) => p.id === id);
    if (!found) throw new Error(`no paint ${id}`);
    return found;
  };
  const input = {
    x: 0,
    y: 0,
    hp: 50,
    maxHp: 100,
    timeSec: 0,
    kills: 0,
    xp: 0,
    level: 1,
    weapons: [{ def: { id: 'whip', name: 'Whip' }, level: 1 }],
    passives: [],
  };
  return { fake, hud, byText, byId, input };
}

/** Every view-space HUD position for `visible`, read back from the fake paints after one frame. */
function positions(visible: VisibleRect | null) {
  const t = setup();
  if (visible) t.hud.layout(visible);
  t.hud.setVisible(true);
  if (visible) t.hud.layout(visible); // also while shown: the pooled skull and XP bar move too
  t.hud.sync(t.input);
  const shapes = t.fake.paints.filter((p) => p.id === 'Shape');
  return {
    level: t.byText('Lv 1').translate,
    timer: t.byText('00:00').translate,
    kills: t.byText('0').translate,
    weapons: t.byText('Weapons').translate,
    passives: t.byText('Passives').translate,
    firstWeapon: t.byText('Whip Lv 1').translate,
    skull: [t.byId('ui.skull').matrix?.e13, t.byId('ui.skull').matrix?.e23],
    xpBar: t.byId('ui.xpBar').matrix,
    // Shapes in creation order: the inventory backing, the HP fill, the XP fill.
    backing: shapes[0]?.matrix,
    xpFill: shapes[2]?.matrix,
    created: t.fake.paints.length,
  };
}

it('computes the anchors of the full view as no offset at all', () => {
  expect(hudAnchors(FULL_VIEW)).toEqual({
    left: 0,
    top: 0,
    rightCrop: 0,
    centreX: 640,
    xpWidth: 1280,
    xpFillScale: 1,
  });
});

it('keeps every position of the letterboxed HUD when laid out for the full view (contain)', () => {
  const before = positions(null);
  expect(positions(FULL_VIEW)).toEqual(before);
  expect(before.timer).toEqual([640, TIMER_Y]);
  expect(before.kills).toEqual([1180, 16]);
  expect(before.level).toEqual([1252, -1]);
  expect(before.weapons).toEqual([14, TIMER_Y]);
});

it.each([
  ['a phone (top and bottom cropped)', PHONE],
  ['a 4:3 tablet (left and right cropped)', TABLET],
])('anchors each group to its edge of the visible area on %s', (_name, visible) => {
  const base = positions(null);
  const p = positions(visible);
  const right = visible.x + visible.width;
  const dy = visible.y;
  // Top left: the inventory keeps its offset from the visible left and top.
  expect(p.weapons).toEqual([14 + visible.x, TIMER_Y + dy]);
  expect(p.passives).toEqual([244 + visible.x, TIMER_Y + dy]);
  expect(p.firstWeapon).toEqual([14 + visible.x, TIMER_Y + 20 + dy]);
  expect(p.backing?.e13).toBe((base.backing?.e13 ?? NaN) + visible.x);
  expect(p.backing?.e23).toBe((base.backing?.e23 ?? NaN) + dy);
  // Top centre.
  expect(p.timer).toEqual([visible.x + visible.width / 2, TIMER_Y + dy]);
  // Top right: the same distance from the visible right edge as from 1280 before.
  expect(p.kills).toEqual([right - 100, 16 + dy]);
  expect(p.level).toEqual([right - 28, dy - 1]);
  expect(p.skull).toEqual([(base.skull[0] ?? NaN) - (1280 - right), (base.skull[1] ?? NaN) + dy]);
  // The XP bar spans the visible width: frame scaled by width / 400 around the centre, fill from the left inset.
  expect(p.xpBar?.e11).toBeCloseTo(visible.width / 400, 12);
  expect(p.xpBar?.e13).toBeCloseTo(visible.x + visible.width / 2, 12);
  expect(p.xpBar?.e23).toBe((base.xpBar?.e23 ?? NaN) + dy);
  expect(p.xpFill?.e13).toBe(visible.x + 2);
  expect(p.xpFill?.e23).toBe(dy + 2);
  // Everything stays inside the visible area.
  for (const [x, y] of [p.timer, p.kills, p.level, p.weapons, p.passives] as [number, number][]) {
    expect(x).toBeGreaterThanOrEqual(visible.x);
    expect(x).toBeLessThanOrEqual(right);
    expect(y).toBeGreaterThanOrEqual(visible.y - 1);
    expect(y).toBeLessThanOrEqual(visible.y + visible.height);
  }
  // ADR 0003: a layout moves paints, it never creates one.
  expect(p.created).toBe(base.created);
});

it('fills the XP bar across the visible width', () => {
  const t = setup();
  t.hud.layout(TABLET);
  t.hud.setVisible(true);
  // More XP than the level needs: a full bar, 1220 - 4 units of the 1276-unit shape.
  t.hud.sync({ ...t.input, xp: 1e9, level: 1 });
  const fill = t.fake.paints.filter((p) => p.id === 'Shape')[2];
  expect(fill?.matrix?.e11).toBeCloseTo((1220 - 4) / 1276, 12);
});

it('keeps the pip inset at least 8 units below the kill count, relative to the visible area', () => {
  for (const visible of [FULL_VIEW, PHONE, TABLET]) {
    const inset = pipRect(visible);
    // The kill count moves down by `visible.y` (above), and so does the inset.
    expect(inset.y - PIP_BACKDROP - (visible.y + HUD_TOP_RIGHT_BOTTOM)).toBeGreaterThanOrEqual(8);
    expect(inset.y - visible.y).toBe(PIP_TOP);
  }
});

it('anchors the sent toast to the top centre of the visible area without creating a paint', () => {
  const fake = fakeGameView();
  const toast = createSentToast(fake.options.TVG, fake.options.layers.hud);
  const created = fake.paints.length;
  expect(fake.paints.every((p) => p.translate?.[0] === 640 && p.translate[1] === 64)).toBe(true);
  toast.layout(PHONE);
  expect(fake.paints.every((p) => p.translate?.[0] === 640 && p.translate[1] === 128.5)).toBe(true);
  toast.layout(TABLET);
  expect(fake.paints.every((p) => p.translate?.[0] === 640 && p.translate[1] === 64)).toBe(true);
  expect(fake.paints).toHaveLength(created);
});
