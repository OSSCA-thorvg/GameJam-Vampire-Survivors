import type { EliminationReason, PlayerInfo, PlayerStatus } from '@vs/shared';
import { h } from './dom';
import './versus.css';

/** Largest number a row shows (#20): a misbehaving peer cannot widen the panel. */
const MAX_SHOWN = 999_999;

export interface OpponentPanelProps {
  /** The room's players (`roomState`); the row of `selfId` is left out. */
  players: readonly PlayerInfo[];
  selfId: string;
  /** `requestAnimationFrame` unless a test passes another. */
  raf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
}

/** The live view of the opponents (#20, ADR 0005): the only thing a player sees of another world. */
export interface OpponentPanel {
  /** Rows follow the room: new players get a row, `connected: false` shows "disconnected". */
  setPlayers(players: readonly PlayerInfo[]): void;
  /** A `peerStatus`; rows change at most once per animation frame, with the latest status of each player. */
  status(playerId: string, status: PlayerStatus): void;
  /** A `peerAway`: "away" while the opponent's tab is hidden. */
  away(playerId: string, away: boolean): void;
  /** A `playerEliminated`: greyed and struck through; `'afk'` shows "forfeited". */
  eliminated(playerId: string, reason: EliminationReason): void;
  unmount(): void;
}

/** A non-negative whole number no larger than `MAX_SHOWN`; anything else is 0. */
export function shownInt(x: number): number {
  return Number.isFinite(x) ? Math.min(MAX_SHOWN, Math.max(0, Math.floor(x))) : 0;
}

/** `hp` and `maxHp` as shown: `0 ≤ hp ≤ maxHp`, whole numbers (HP rounds up, so a living player never shows 0). */
export function shownHp(status: Pick<PlayerStatus, 'hp' | 'maxHp'>): { hp: number; maxHp: number } {
  const maxHp = shownInt(Math.ceil(status.maxHp));
  const hp = Number.isFinite(status.hp) ? Math.min(maxHp, Math.max(0, Math.ceil(status.hp))) : 0;
  return { hp, maxHp };
}

interface Row {
  el: HTMLLIElement;
  name: HTMLSpanElement;
  fill: HTMLDivElement;
  bar: HTMLDivElement;
  level: HTMLSpanElement;
  kills: HTMLSpanElement;
  badge: HTMLSpanElement;
  info: PlayerInfo;
  away: boolean;
  out: EliminationReason | null;
}

/**
 * The opponent panel (#20, ADR 0009): a DOM overlay at the top right of the canvas, one row per opponent with the
 * nickname, an HP bar, `Lv`, kills and a badge ("dead", "disconnected", "away", "forfeited"). Nicknames and numbers
 * are set with `textContent` only (ADR 0011), and every number is clamped.
 */
export function mount(root: HTMLElement, props: OpponentPanelProps): OpponentPanel {
  const raf = props.raf ?? ((cb: () => void) => requestAnimationFrame(cb));
  const cancelRaf =
    props.cancelRaf ??
    ((id: number) => {
      cancelAnimationFrame(id);
    });
  const list = h('ul', { class: 'opponents', 'aria-label': 'Opponents' });
  const el = h('aside', { class: 'opponent-panel', 'aria-label': 'Opponents' }, [list]);
  const rows = new Map<string, Row>();
  const pending = new Map<string, PlayerStatus>();
  let frame: number | null = null;

  const badgeOf = (row: Row): string => {
    if (row.out === 'afk') return 'forfeited';
    if (row.out === 'disconnected' || !row.info.connected) return 'disconnected';
    if (row.out === 'died') return 'dead';
    return row.away ? 'away' : '';
  };
  const paintState = (row: Row): void => {
    const badge = badgeOf(row);
    row.badge.textContent = badge;
    row.badge.hidden = badge === '';
    row.el.setAttribute('data-out', String(row.out !== null));
    row.el.setAttribute('data-badge', badge);
    row.name.textContent = row.info.nickname;
  };
  const paintStatus = (row: Row, status: PlayerStatus): void => {
    const { hp, maxHp } = shownHp(status);
    row.fill.style.width = `${String(maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0)}%`;
    row.bar.setAttribute('aria-valuenow', String(hp));
    row.bar.setAttribute('aria-valuemax', String(maxHp));
    row.bar.setAttribute('aria-valuetext', `${String(hp)} / ${String(maxHp)}`);
    row.level.textContent = `Lv ${String(shownInt(status.level))}`;
    row.kills.textContent = `Kills ${String(shownInt(status.kills))}`;
  };

  const makeRow = (info: PlayerInfo): Row => {
    const name = h('span', { class: 'opponent-name' });
    const fill = h('div', { class: 'hp-fill' });
    const bar = h(
      'div',
      {
        class: 'hp',
        role: 'meter',
        'aria-label': 'HP',
        'aria-valuemin': '0',
        'aria-valuemax': '0',
        'aria-valuenow': '0',
      },
      [fill],
    );
    const level = h('span', { class: 'opponent-level', text: 'Lv 1' });
    const kills = h('span', { class: 'opponent-kills', text: 'Kills 0' });
    const badge = h('span', { class: 'badge' });
    const rowEl = h('li', { class: 'opponent' }, [
      h('div', { class: 'opponent-head' }, [name, badge]),
      bar,
      h('div', { class: 'opponent-numbers' }, [level, kills]),
    ]);
    fill.style.width = '100%';
    const row: Row = {
      el: rowEl,
      name,
      fill,
      bar,
      level,
      kills,
      badge,
      info,
      away: false,
      out: null,
    };
    paintState(row);
    return row;
  };

  const flush = (): void => {
    frame = null;
    for (const [id, status] of pending) {
      const row = rows.get(id);
      if (row) paintStatus(row, status);
    }
    pending.clear();
  };

  const panel: OpponentPanel = {
    setPlayers(players) {
      const seen = new Set<string>();
      const ordered: HTMLLIElement[] = [];
      for (const info of players) {
        if (info.id === props.selfId) continue;
        seen.add(info.id);
        let row = rows.get(info.id);
        if (row) row.info = info;
        else {
          row = makeRow(info);
          rows.set(info.id, row);
        }
        paintState(row);
        ordered.push(row.el);
      }
      for (const id of [...rows.keys()]) if (!seen.has(id)) rows.delete(id);
      list.replaceChildren(...ordered);
    },
    status(playerId, status) {
      if (!rows.has(playerId)) return;
      pending.set(playerId, status);
      frame ??= raf(flush);
    },
    away(playerId, away) {
      const row = rows.get(playerId);
      if (!row) return;
      row.away = away;
      paintState(row);
    },
    eliminated(playerId, reason) {
      const row = rows.get(playerId);
      if (row?.out !== null) return;
      row.out = reason;
      if (reason === 'died') row.fill.style.width = '0%';
      paintState(row);
    },
    unmount() {
      if (frame !== null) cancelRaf(frame);
      frame = null;
      el.remove();
    },
  };
  panel.setPlayers(props.players);
  root.append(el);
  return panel;
}
