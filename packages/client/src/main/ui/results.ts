import { PASSIVES, WEAPONS, findCharacter, formatClock } from '@vs/shared';
import type { RunSummary } from '../../protocol/worker-messages';
import { h, menuKeys, type Screen } from './dom';

export interface ResultsProps {
  stats: RunSummary;
  onRetry: () => void;
  onTitle: () => void;
}

const weaponName = (id: string): string =>
  Object.hasOwn(WEAPONS, id) ? WEAPONS[id as keyof typeof WEAPONS].name : id;
const passiveName = (id: string): string => PASSIVES.find((p) => p.id === id)?.name ?? id;

/** Rows for a `dl`: one `dt`/`dd` pair per entry, text set with `textContent` only (ADR 0011). */
function rows(list: HTMLElement, entries: [label: string, value: string][]): void {
  list.replaceChildren(
    ...entries.flatMap(([label, value]) => [h('dt', { text: label }), h('dd', { text: value })]),
  );
}

/**
 * The results screen (#9, #17): "Stage cleared" once the run reached the time limit (even if Death then killed the
 * player), otherwise "Game over"; the survived time (`mm:ss`), kills, level and character, the weapons with their level
 * and damage dealt (most damage first, as the worker sorts them) and the passives with their level; then "Retry"
 * (focused) and "Title". Nothing is persisted (ADR 0008).
 */
export function mount(root: HTMLElement, props: ResultsProps): Screen<ResultsProps> {
  let current = props;
  const heading = h('h2', { id: 'results-heading' });
  const time = h('dd', { 'data-stat': 'time' });
  const kills = h('dd', { 'data-stat': 'kills' });
  const level = h('dd', { 'data-stat': 'level' });
  const character = h('dd', { 'data-stat': 'character' });
  const weapons = h('dl', { class: 'stats', 'data-list': 'weapons' });
  const passives = h('dl', { class: 'stats', 'data-list': 'passives' });
  const passivesSection = h('section', {}, [h('h3', { text: 'Passives' }), passives]);
  const weaponsSection = h('section', {}, [h('h3', { text: 'Weapons' }), weapons]);
  const show = ({ stats }: ResultsProps): void => {
    heading.textContent = stats.cleared ? 'Stage cleared' : 'Game over';
    time.textContent = formatClock(stats.timeSec);
    kills.textContent = String(stats.kills);
    level.textContent = String(stats.level);
    character.textContent = findCharacter(stats.characterId)?.displayName ?? stats.characterId;
    rows(
      weapons,
      stats.weapons.map((w) => [
        `${weaponName(w.id)} Lv ${String(w.level)}`,
        `${String(Math.round(w.damage))} dmg`,
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
