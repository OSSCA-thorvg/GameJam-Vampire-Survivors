import { CHARACTERS, findCharacter, formatClock, WEAPONS } from '@vs/shared';
import { formatDuration, type BestSet, type Records, type RecentRun } from '../records/format';
import { h, menuKeys, type Screen } from './dom';
import './records.css';

export interface RecordsProps {
  records: Records;
  confirming: boolean;
  onBack: () => void;
  onResetRequest: () => void;
  onResetCancel: () => void;
  onResetConfirm: () => void;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD HH:MM` in local time, from the `Date` getters (no locale API). */
export function formatAt(at: number): string {
  const d = new Date(at);
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const bestOf = (map: Readonly<Record<string, BestSet>>, id: string): BestSet | undefined =>
  Object.hasOwn(map, id) ? map[id] : undefined;

function bestRow(label: string, b: BestSet | undefined, key: string): HTMLTableRowElement {
  return h('tr', { 'data-best-row': key }, [
    h('th', { text: label }),
    h('td', { text: b ? formatClock(b.timeSec) : '--:--' }),
    h('td', { text: String(b?.kills ?? 0) }),
    h('td', { text: String(b?.level ?? 0) }),
    h('td', { text: b?.cleared === true ? 'Yes' : '-' }),
  ]);
}

function runItem(run: RecentRun, i: number): HTMLLIElement {
  const name = findCharacter(run.characterId)?.displayName ?? run.characterId;
  const parts = [
    formatAt(run.at),
    name,
    formatClock(run.timeSec),
    `${String(run.kills)} kills`,
    `Lv ${String(run.level)}`,
    run.cleared ? 'Stage cleared' : 'Game over',
  ];
  return h('li', { 'data-run-index': String(i) }, [
    ...parts.flatMap((text, j) => [
      ...(j > 0 ? [' · '] : []),
      h('span', { class: `run-${String(j)}`, text }),
    ]),
  ]);
}

/**
 * The Records screen (#143, ADR 0022): bests overall and per character, lifetime totals, the last 10 runs and per-weapon
 * bests, then "Back" and "Reset records". Names come from the content data; stored IDs not in it show as text. Every
 * value is set with `textContent` (ADR 0011). Reset asks in an in-page `alertdialog` (Cancel, Delete records), never a
 * native dialog. Escape cancels the confirm step, otherwise goes back.
 */
export function mount(root: HTMLElement, props: RecordsProps): Screen<RecordsProps> {
  const doc = root.ownerDocument;
  let current = props;

  const bests = h('tbody');
  const totals = h('dl', { class: 'stats', 'data-list': 'totals' });
  const recentList = h('ol', { class: 'records-recent', 'data-list': 'recent' });
  const noRuns = h('p', { class: 'hint', text: 'No runs yet.' });
  const weapons = h('dl', { class: 'stats', 'data-list': 'weapon-bests' });
  const weaponsSection = h('section', { class: 'records-weapons' }, [
    h('h3', { text: 'Weapon bests' }),
    weapons,
  ]);

  const back = h('button', {
    type: 'button',
    text: 'Back',
    'on:click': () => {
      if (!current.confirming) current.onBack();
    },
  });
  const reset = h('button', {
    type: 'button',
    text: 'Reset records',
    'on:click': () => {
      if (!current.confirming) current.onResetRequest();
    },
  });
  const cancel = h('button', {
    type: 'button',
    text: 'Cancel',
    'on:click': () => {
      if (current.confirming) {
        leaving = 'cancel';
        current.onResetCancel();
      }
    },
  });
  const del = h('button', {
    type: 'button',
    text: 'Delete records',
    'on:click': () => {
      if (current.confirming) {
        leaving = 'delete';
        current.onResetConfirm();
      }
    },
  });
  const confirmBox = h(
    'div',
    {
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-labelledby': 'records-reset-q',
      class: 'records-confirm',
    },
    [
      h('p', { id: 'records-reset-q', text: 'Delete all records? This cannot be undone.' }),
      h('div', { class: 'menu' }, [cancel, del]),
    ],
  );

  const el = h('section', { class: 'screen records', 'aria-labelledby': 'records-heading' }, [
    h('h2', { id: 'records-heading', text: 'Records' }),
    h('div', { class: 'records-body' }, [
      h('section', { class: 'records-bests' }, [
        h('h3', { text: 'Bests' }),
        h('table', { 'data-list': 'bests' }, [
          h('thead', {}, [
            h(
              'tr',
              {},
              ['Character', 'Time', 'Kills', 'Level', 'Cleared'].map((t) => h('th', { text: t })),
            ),
          ]),
          bests,
        ]),
      ]),
      h('section', { class: 'records-totals' }, [h('h3', { text: 'Totals' }), totals]),
      h('section', { class: 'records-last' }, [
        h('h3', { text: 'Last 10 runs' }),
        noRuns,
        recentList,
      ]),
      weaponsSection,
    ]),
    h('div', { class: 'menu' }, [back, reset]),
    confirmBox,
  ]);

  /** How the confirm step was left, for the focus rule; `null` when it was not left by a button. */
  let leaving: 'cancel' | 'delete' | null = null;
  let wasConfirming = false;

  const show = (): void => {
    const { records: r, confirming } = current;
    bests.replaceChildren(
      bestRow('All characters', r.overall, 'overall'),
      ...CHARACTERS.map((c) => bestRow(c.displayName, bestOf(r.characters, c.id), c.id)),
    );
    const t = r.totals;
    totals.replaceChildren(
      ...(
        [
          ['Runs', String(t.runs)],
          ['Kills', String(t.kills)],
          ['Clears', String(t.clears)],
          ['Play time', formatDuration(t.playTimeSec)],
        ] as const
      ).flatMap(([label, value]) => [h('dt', { text: label }), h('dd', { text: value })]),
    );
    noRuns.hidden = r.recent.length > 0;
    recentList.hidden = r.recent.length === 0;
    recentList.replaceChildren(...r.recent.map(runItem));
    const listed = Object.keys(WEAPONS).filter((id) => Object.hasOwn(r.weaponBest, id));
    weapons.replaceChildren(
      ...listed.flatMap((id) => [
        h('dt', { text: WEAPONS[id as keyof typeof WEAPONS].name }),
        h('dd', {
          'data-weapon': id,
          text: `${String(Math.round(r.weaponBest[id] ?? 0))} dmg`,
        }),
      ]),
    );
    weaponsSection.hidden = listed.length === 0;
    confirmBox.hidden = !confirming;
    back.disabled = confirming;
    reset.disabled = confirming;
    if (confirming && !wasConfirming) cancel.focus();
    else if (!confirming && wasConfirming) (leaving === 'cancel' ? reset : back).focus();
    leaving = null;
    wasConfirming = confirming;
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || e.repeat) return;
    e.preventDefault();
    if (current.confirming) {
      leaving = 'cancel';
      current.onResetCancel();
    } else current.onBack();
  };

  root.append(el);
  show();
  const removeKeys = menuKeys(doc, () => (current.confirming ? [cancel, del] : [back, reset]));
  doc.addEventListener('keydown', onKey);
  return {
    update(next) {
      current = next;
      show();
    },
    unmount() {
      removeKeys();
      doc.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
