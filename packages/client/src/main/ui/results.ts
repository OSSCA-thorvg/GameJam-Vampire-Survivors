import { PASSIVES, WEAPONS, findCharacter, formatClock } from '@vs/shared';
import type { RunSummary } from '../../protocol/worker-messages';
import type { BestScope, RecordBreaks } from '../records/apply';
import { h, menuKeys, type Screen } from './dom';

export interface ResultsProps {
  stats: RunSummary;
  /** #143: what the run broke in the personal records; `null` shows no badge. */
  breaks: RecordBreaks | null;
  onRetry: () => void;
  onTitle: () => void;
}

const weaponName = (id: string): string =>
  Object.hasOwn(WEAPONS, id) ? WEAPONS[id as keyof typeof WEAPONS].name : id;
const passiveName = (id: string): string => PASSIVES.find((p) => p.id === id)?.name ?? id;

/** A "New best!" badge (#143), text set with `textContent` only. */
function badge(item: string, scope: BestScope | null): HTMLElement | null {
  if (scope === null) return null;
  return h('span', {
    class: 'new-best',
    'data-best': item,
    'data-scope': scope,
    text: scope === 'overall' ? 'New best! (all characters)' : 'New best!',
  });
}

/**
 * Fills `dd` with the value in its own `span` (`attrs` carries `data-stat`, so journeys reading a stat's text never
 * see the badge), then the badge when there is one.
 */
function value(
  dd: HTMLElement,
  text: string,
  mark: HTMLElement | null,
  attrs: Record<`data-${string}`, string> = {},
): void {
  dd.replaceChildren(h('span', { ...attrs, text }), ...(mark ? [' ', mark] : []));
}

/** Rows for a `dl`: one `dt`/`dd` pair per entry, text set with `textContent` only (ADR 0011). */
function rows(
  list: HTMLElement,
  entries: [label: string, value: string, mark?: HTMLElement | null][],
): void {
  list.replaceChildren(
    ...entries.flatMap(([label, text, mark]) => {
      const dd = h('dd');
      if (mark) value(dd, text, mark);
      else dd.textContent = text;
      return [h('dt', { text: label }), dd];
    }),
  );
}

/**
 * The results screen (#9, #17): "Stage cleared" once the run reached the time limit (even if Death then killed the
 * player), otherwise "Game over"; the survived time (`mm:ss`), kills, level and character, the weapons with their level
 * and damage dealt (most damage first, as the worker sorts them) and the passives with their level; then "Retry"
 * (focused) and "Title". Each item the run broke in the personal records carries a "New best!" badge, and a
 * character's first clear "First clear!" after the heading (#143). Records are saved by `main/records/` (#143); nothing
 * a run uses is persisted (ADR 0008).
 */
export function mount(root: HTMLElement, props: ResultsProps): Screen<ResultsProps> {
  let current = props;
  const heading = h('h2', { id: 'results-heading' });
  const firstClear = h('span', { class: 'new-best', 'data-best': 'clear', text: 'First clear!' });
  const time = h('dd');
  const kills = h('dd');
  const level = h('dd');
  const character = h('dd', { 'data-stat': 'character' });
  const weapons = h('dl', { class: 'stats', 'data-list': 'weapons' });
  const passives = h('dl', { class: 'stats', 'data-list': 'passives' });
  const passivesSection = h('section', {}, [h('h3', { text: 'Passives' }), passives]);
  const weaponsSection = h('section', {}, [h('h3', { text: 'Weapons' }), weapons]);
  const show = ({ stats, breaks }: ResultsProps): void => {
    heading.textContent = stats.cleared ? 'Stage cleared' : 'Game over';
    firstClear.hidden = breaks?.firstClear !== true;
    value(time, formatClock(stats.timeSec), badge('time', breaks?.timeSec ?? null), {
      'data-stat': 'time',
    });
    value(kills, String(stats.kills), badge('kills', breaks?.kills ?? null), {
      'data-stat': 'kills',
    });
    value(level, String(stats.level), badge('level', breaks?.level ?? null), {
      'data-stat': 'level',
    });
    character.textContent = findCharacter(stats.characterId)?.displayName ?? stats.characterId;
    rows(
      weapons,
      stats.weapons.map((w) => [
        `${weaponName(w.id)} Lv ${String(w.level)}`,
        `${String(Math.round(w.damage))} dmg`,
        breaks?.weapons.includes(w.id)
          ? h('span', {
              class: 'new-best',
              'data-best': 'weapon',
              'data-weapon': w.id,
              text: 'New best!',
            })
          : null,
      ]),
    );
    rows(
      passives,
      stats.passives.map((p) => [passiveName(p.id), `Lv ${String(p.level)}`]),
    );
    weaponsSection.hidden = stats.weapons.length === 0;
    passivesSection.hidden = stats.passives.length === 0;
  };
  const retry = h('button', {
    type: 'button',
    text: 'Retry',
    'on:click': () => {
      current.onRetry();
    },
  });
  const title = h('button', {
    type: 'button',
    text: 'Title',
    'on:click': () => {
      current.onTitle();
    },
  });
  const el = h(
    'section',
    { class: 'screen overlay results', 'aria-labelledby': 'results-heading' },
    [
      heading,
      firstClear,
      h('dl', { class: 'stats' }, [
        h('dt', { text: 'Survived' }),
        time,
        h('dt', { text: 'Kills' }),
        kills,
        h('dt', { text: 'Level' }),
        level,
        h('dt', { text: 'Character' }),
        character,
      ]),
      h('div', { class: 'items' }, [weaponsSection, passivesSection]),
      h('div', { class: 'menu' }, [retry, title]),
    ],
  );
  show(props);
  root.append(el);
  const removeKeys = menuKeys(root.ownerDocument, [retry, title]);
  return {
    update(next) {
      current = next;
      show(next);
    },
    unmount() {
      removeKeys();
      el.remove();
    },
  };
}
