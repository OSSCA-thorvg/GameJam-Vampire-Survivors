// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { BANNER_MS, MAX_BANNERS, mount } from './interference-banner';

function setup(icon: string | null = 'http://x/fx/warning.png') {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const timers: (() => void)[] = [];
  const delays: number[] = [];
  const banners = mount(root, {
    iconUrl: (id) => (id === 'fx.warning' ? icon : null),
    setTimer: (cb, ms) => {
      delays.push(ms);
      return timers.push(cb);
    },
    clearTimer: (id) => {
      timers[id - 1] = () => undefined;
    },
  });
  return { root, banners, timers, delays };
}

it('shows "<nickname> sent <label>!" with the warning icon for BANNER_MS', () => {
  const t = setup();
  t.banners.show('Alice', 'Swarm');
  const el = t.root.querySelector('.interference-banner');
  expect(el?.textContent).toBe('Alice sent Swarm!');
  expect(el?.querySelector('img')?.getAttribute('src')).toBe('http://x/fx/warning.png');
  expect(t.delays).toEqual([BANNER_MS]);
  t.timers[0]?.();
  expect(t.banners.texts()).toEqual([]);
  expect(t.root.querySelector('.interference-banner')).toBeNull();
});

it('stacks at most MAX_BANNERS, dropping the oldest, and draws no icon without art', () => {
  const t = setup(null);
  for (let i = 0; i < MAX_BANNERS + 2; i++) t.banners.show(`P${String(i)}`, 'Elite Call');
  expect(t.banners.texts()).toEqual([
    'P2 sent Elite Call!',
    'P3 sent Elite Call!',
    'P4 sent Elite Call!',
  ]);
  expect(t.root.querySelectorAll('.interference-banner')).toHaveLength(MAX_BANNERS);
  expect(t.root.querySelector('img')).toBeNull();
  t.banners.unmount();
  expect(t.root.children).toHaveLength(0);
});

it('never parses a nickname as markup', () => {
  const t = setup();
  t.banners.show('<img src=x onerror=alert(1)>', 'Gem Thief');
  expect(t.root.querySelectorAll('img')).toHaveLength(1);
  expect(t.banners.texts()).toEqual(['<img src=x onerror=alert(1)> sent Gem Thief!']);
});
