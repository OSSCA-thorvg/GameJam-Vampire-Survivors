// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyRecords, type Records } from '../records/format';
import { formatAt, mount, type RecordsProps } from './records';

const FULL: Records = {
  v: 1,
  overall: { timeSec: 912.5, kills: 1500, level: 40, cleared: true },
  characters: {
    warden: { timeSec: 61, kills: 20, level: 4, cleared: false },
    swift: { timeSec: 912.5, kills: 1500, level: 40, cleared: true },
  },
  totals: { runs: 3, kills: 1530, clears: 1, playTimeSec: 3725 },
  recent: [
    {
      at: new Date(2026, 10, 9, 8, 5).getTime(),
      characterId: 'swift',
      timeSec: 912.5,
      kills: 1500,
      level: 40,
      cleared: true,
    },
    {
      at: new Date(2026, 0, 2, 13, 0).getTime(),
      characterId: 'oldHero',
      timeSec: 61,
      kills: 20,
      level: 4,
      cleared: false,
    },
  ],
  weaponBest: { thousandEdge: 120_000.4, knife: 50_000.6, futureWeapon: 9 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const key = (code: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const texts = (selector: string) =>
  Array.from(document.querySelectorAll(selector), (el) => el.textContent);
const button = (name: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent === name);

function setup(records: Records = FULL) {
  const props: RecordsProps = {
    records,
    confirming: false,
    onBack: vi.fn(),
    onResetRequest: vi.fn(),
    onResetCancel: vi.fn(),
    onResetConfirm: vi.fn(),
  };
  const screen = mount(document.body, props);
  // Like the app: requests come back as new props.
  vi.mocked(props.onResetRequest).mockImplementation(() => {
    screen.update({ ...props, confirming: true });
  });
  vi.mocked(props.onResetCancel).mockImplementation(() => {
    screen.update({ ...props, confirming: false });
  });
  vi.mocked(props.onResetConfirm).mockImplementation(() => {
    screen.update({ ...props, records: emptyRecords(), confirming: false });
  });
  return { props, screen };
}

describe('the Records screen', () => {
  it('shows "No runs yet." and zero rows for empty records', () => {
    setup(emptyRecords());
    expect(texts('h2')).toEqual(['Records']);
    expect(texts('[data-best-row="overall"] td')).toEqual(['00:00', '0', '0', '-']);
    expect(texts('[data-best-row="warden"] td')).toEqual(['--:--', '0', '0', '-']);
    expect(texts('[data-best-row] th')).toEqual([
      'All characters',
      'Warden',
      'Ember',
      'Swift',
      'Aurelia',
    ]);
    expect(texts('p.hint')).toEqual(['No runs yet.']);
    expect(document.querySelector<HTMLElement>('p.hint')?.hidden).toBe(false);
    expect(document.querySelectorAll('[data-run-index]')).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('.records-weapons')?.hidden).toBe(true);
    expect(document.activeElement?.textContent).toBe('Back');
  });

  it('renders every section in order', () => {
    setup();
    expect(texts('h3')).toEqual(['Bests', 'Totals', 'Last 10 runs', 'Weapon bests']);
    expect(texts('[data-best-row="overall"] td')).toEqual(['15:12', '1500', '40', 'Yes']);
    expect(texts('[data-best-row="swift"] td')).toEqual(['15:12', '1500', '40', 'Yes']);
    expect(texts('[data-list="totals"] dt, [data-list="totals"] dd')).toEqual([
      'Runs',
      '3',
      'Kills',
      '1530',
      'Clears',
      '1',
      'Play time',
      '1:02:05',
    ]);
    expect(document.querySelector<HTMLElement>('p.hint')?.hidden).toBe(true);
    expect(texts('[data-run-index]')).toEqual([
      '2026-11-09 08:05 · Swift · 15:12 · 1500 kills · Lv 40 · Stage cleared',
      '2026-01-02 13:00 · oldHero · 01:01 · 20 kills · Lv 4 · Game over',
    ]);
    // Content order, only stored weapons; an unknown stored ID is not listed.
    expect(texts('[data-list="weapon-bests"] dt, [data-list="weapon-bests"] dd')).toEqual([
      'Knife',
      '50001 dmg',
      'Thousand Edge',
      '120000 dmg',
    ]);
    expect(document.body.textContent).not.toContain('futureWeapon');
  });

  it('formats dates zero-padded in local time', () => {
    expect(formatAt(new Date(2026, 2, 4, 5, 6).getTime())).toBe('2026-03-04 05:06');
  });

  it('confirms the reset in page: Cancel keeps the data and focuses Reset records', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const { props } = setup();
    button('Reset records')?.click();
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(dialog?.hidden).toBe(false);
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById('records-reset-q')?.textContent).toBe(
      'Delete all records? This cannot be undone.',
    );
    expect(document.activeElement?.textContent).toBe('Cancel');
    expect(button('Back')?.disabled).toBe(true);
    expect(button('Reset records')?.disabled).toBe(true);
    button('Cancel')?.click();
    expect(props.onResetConfirm).not.toHaveBeenCalled();
    expect(dialog?.hidden).toBe(true);
    expect(document.querySelectorAll('[data-run-index]')).toHaveLength(2);
    expect(document.activeElement?.textContent).toBe('Reset records');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('Delete records calls onResetConfirm and focuses Back', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const { props } = setup();
    button('Reset records')?.click();
    key('ArrowRight');
    expect(document.activeElement?.textContent).toBe('Delete records');
    button('Delete records')?.click();
    expect(props.onResetConfirm).toHaveBeenCalledTimes(1);
    expect(texts('p.hint')).toEqual(['No runs yet.']);
    expect(document.activeElement?.textContent).toBe('Back');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('Escape cancels the confirm step, then goes back', () => {
    const { props } = setup();
    button('Reset records')?.click();
    key('Escape');
    expect(props.onResetCancel).toHaveBeenCalledTimes(1);
    expect(props.onBack).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe('Reset records');
    key('Escape');
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('arrows move between Back and Reset records', () => {
    setup();
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Reset records');
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Back');
  });

  it('shows stored strings as text, never as markup', () => {
    setup({ ...FULL, recent: FULL.recent.map((r) => ({ ...r, characterId: 'oldHero' })) });
    expect(document.querySelector('b, i, script')).toBeNull();
    expect(texts('[data-run-index] .run-1')).toEqual(['oldHero', 'oldHero']);
  });
});
