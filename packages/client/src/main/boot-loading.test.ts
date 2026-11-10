// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { createBootLoading } from './boot-loading';

let el: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  el = document.createElement('p');
  el.id = 'loading';
  document.body.append(el);
});

it('stays hidden while the splash plays and follows the progress', () => {
  const loading = createBootLoading(el);
  expect(el.hidden).toBe(true);
  expect(loading.visible).toBe(false);
  loading.progress(3, 86);
  expect(el.textContent).toBe('Loading 3/86');
  expect(loading.text).toBe('Loading 3/86');
  expect(loading.visible).toBe(false);
});

it('shows the held text under the logo when the played splash ends before the assets', () => {
  const loading = createBootLoading(el);
  loading.splashEnded(true);
  expect(el.hidden).toBe(false);
  expect(el.classList.contains('splash-hold')).toBe(true);
  expect(loading).toMatchObject({ visible: true, held: true });
  loading.assetsReady();
  expect(el.isConnected).toBe(false);
  expect(loading.visible).toBe(false);
});

it('shows the plain top-left text when the splash was skipped', () => {
  const loading = createBootLoading(el);
  loading.splashEnded(false);
  expect(el.hidden).toBe(false);
  expect(el.classList.contains('splash-hold')).toBe(false);
  expect(loading).toMatchObject({ visible: true, held: false });
});

it('is never shown when the assets were ready first', () => {
  const loading = createBootLoading(el);
  loading.assetsReady();
  loading.splashEnded(true);
  expect(el.isConnected).toBe(false);
  expect(el.hidden).toBe(true);
  expect(loading).toMatchObject({ visible: false, held: false });
});

it('places the text at logical y 610 of a 720 CSS pixel view', () => {
  const loading = createBootLoading(el);
  loading.place(720);
  expect(el.style.getPropertyValue('--splash-top')).toBe('calc(50% + 250px)');
  expect(el.style.getPropertyValue('--splash-font')).toBe('24px');
});

// #171, ADR 0025: with the cover fit the view is cropped, so the text is placed through the visible area.
it('scales with the covered view and stays inside the visible area', () => {
  const loading = createBootLoading(el);
  // A 4:3 tablet: the whole height is visible, 768 CSS pixels for 720 units.
  loading.place(768, { y: 0, height: 720 });
  expect(el.style.getPropertyValue('--splash-top')).toBe(
    `calc(50% + ${String((768 / 720) * 250)}px)`,
  );
  expect(el.style.getPropertyValue('--splash-font')).toBe('25.6px');
  // A phone: 540 of 720 units visible from y = 90 in 360 CSS pixels; y 610 would end below the screen (630), so the
  // text's bottom sits on the visible area's bottom edge: its top at 606, 246 units under the centre (360).
  loading.place(360, { y: 90, height: 540 });
  expect(el.style.getPropertyValue('--splash-top')).toBe(
    `calc(50% + ${String((360 / 540) * 246)}px)`,
  );
  expect(el.style.getPropertyValue('--splash-font')).toBe('16px');
});
