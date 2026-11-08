import { formatClock } from '@vs/shared';
import type { RunStats } from '../../protocol/worker-messages';
import { h, menuKeys, type Screen } from './dom';

export interface ResultsProps {
  stats: RunStats;
  onRetry: () => void;
  onTitle: () => void;
}

/** The results screen (#9): survived time (`mm:ss`), kills and level, then "Retry" (focused) and "Title". */
export function mount(root: HTMLElement, props: ResultsProps): Screen<ResultsProps> {
  let current = props;
  const time = h('dd', { 'data-stat': 'time' });
  const kills = h('dd', { 'data-stat': 'kills' });
  const level = h('dd', { 'data-stat': 'level' });
  const show = ({ stats }: ResultsProps): void => {
    time.textContent = formatClock(stats.timeSec);
    kills.textContent = String(stats.kills);
    level.textContent = String(stats.level);
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
  const el = h('section', { class: 'screen overlay', 'aria-labelledby': 'results-heading' }, [
    h('h2', { id: 'results-heading', text: 'Game over' }),
    h('dl', { class: 'stats' }, [
      h('dt', { text: 'Survived' }),
      time,
      h('dt', { text: 'Kills' }),
      kills,
      h('dt', { text: 'Level' }),
      level,
    ]),
    h('div', { class: 'menu' }, [retry, title]),
  ]);
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
