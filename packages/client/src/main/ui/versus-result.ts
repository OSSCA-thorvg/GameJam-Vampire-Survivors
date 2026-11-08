import { formatClock, type EliminationReason, type RankingEntry } from '@vs/shared';
import type { RunSummary } from '../../protocol/worker-messages';
import { h, menuKeys, type Screen } from './dom';
import './versus.css';

/**
 * How a versus match ended for this player (#20): the server's `matchResult` (`official`), or, when the socket was
 * lost during the match, only the local run (`unofficial`).
 */
export type VersusResult =
  | {
      kind: 'official';
      headline: 'Win' | 'Lose' | 'Draw';
      ranking: RankingEntry[];
      /** Why each player who is out left the match (`playerEliminated`), by player id. */
      out: Record<string, EliminationReason>;
      /** Set when the server's match deadline decided (#60): who was counted as survived. */
      note: string | null;
    }
  | { kind: 'unofficial'; stats: RunSummary };

export interface VersusResultProps {
  result: VersusResult;
  selfId: string;
  /** False once the socket is gone: Rematch is hidden. */
  canRematch: boolean;
  onRematch: () => void;
  onLeave: () => void;
}

/** The notice of a result that could not be confirmed by the server. */
export const UNOFFICIAL_NOTE = 'Disconnected from server — result unavailable';

const OUT_TEXT: Record<EliminationReason, string> = {
  died: 'dead',
  disconnected: 'disconnected',
  afk: 'forfeited',
};

function rankingTable(
  ranking: readonly RankingEntry[],
  out: Readonly<Record<string, EliminationReason>>,
  selfId: string,
): HTMLTableElement {
  // Nicknames are user data: text nodes only (ADR 0011).
  return h('table', { class: 'ranking', 'aria-label': 'Ranking' }, [
    h('thead', {}, [
      h('tr', {}, [
        h('th', { text: 'Player' }),
        h('th', { text: 'Status' }),
        h('th', { text: 'Kills' }),
      ]),
    ]),
    h(
      'tbody',
      {},
      ranking.map((entry) =>
        h('tr', { 'data-self': String(entry.playerId === selfId) }, [
          h('td', { text: entry.playerId === selfId ? `${entry.nickname} (you)` : entry.nickname }),
          h('td', {
            text: entry.alive
              ? 'alive'
              : Object.hasOwn(out, entry.playerId)
                ? OUT_TEXT[out[entry.playerId] ?? 'died']
                : 'out',
          }),
          h('td', { text: String(entry.kills) }),
        ]),
      ),
    ),
  ]);
}

function localStats(stats: RunSummary): HTMLDListElement {
  return h('dl', { class: 'stats' }, [
    h('dt', { text: 'Survived' }),
    h('dd', { 'data-stat': 'time', text: formatClock(stats.timeSec) }),
    h('dt', { text: 'Kills' }),
    h('dd', { 'data-stat': 'kills', text: String(stats.kills) }),
    h('dt', { text: 'Level' }),
    h('dd', { 'data-stat': 'level', text: String(stats.level) }),
  ]);
}

/**
 * The versus result screen (#20, ADR 0009): the headline (Win, Lose or Draw; "Unofficial result" without the
 * server), the ranking from `matchResult` (nickname, alive, kills) or the local run's numbers, an optional note, then
 * "Rematch" (focused; back to the same room's lobby) and "Leave".
 */
export function mount(root: HTMLElement, props: VersusResultProps): Screen<VersusResultProps> {
  let current = props;
  const heading = h('h2', { id: 'versus-result-heading' });
  const body = h('div', { class: 'versus-result-body' });
  const rematch = h('button', {
    type: 'button',
    text: 'Rematch',
    'on:click': () => {
      if (current.canRematch) current.onRematch();
    },
  });
  const leave = h('button', {
    type: 'button',
    text: 'Leave',
    'on:click': () => {
      current.onLeave();
    },
  });
  const el = h(
    'section',
    { class: 'screen overlay versus-result', 'aria-labelledby': 'versus-result-heading' },
    [heading, body, h('div', { class: 'menu' }, [rematch, leave])],
  );
  const show = ({ result, selfId, canRematch }: VersusResultProps): void => {
    const official = result.kind === 'official';
    heading.textContent = official ? result.headline : 'Unofficial result';
    el.setAttribute('data-outcome', official ? result.headline.toLowerCase() : 'unofficial');
    const parts: Node[] = official
      ? [rankingTable(result.ranking, result.out, selfId)]
      : [h('p', { class: 'notice', text: UNOFFICIAL_NOTE }), localStats(result.stats)];
    if (official && result.note !== null) parts.push(h('p', { class: 'note', text: result.note }));
    body.replaceChildren(...parts);
    rematch.hidden = !canRematch;
  };
  show(props);
  root.append(el);
  const removeKeys = menuKeys(root.ownerDocument, () => [rematch, leave].filter((b) => !b.hidden));
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
