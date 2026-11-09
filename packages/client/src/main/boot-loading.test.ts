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
