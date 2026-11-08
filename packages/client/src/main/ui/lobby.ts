import type { PlayerInfo, ServerMessage } from '@vs/shared';
import { h, menuKeys, type Screen } from './dom';
import type { ServerError } from './multiplayer-entry';
import './multiplayer.css';

export type RoomState = Extract<ServerMessage, { type: 'roomState' }>;
export type MatchStart = Extract<ServerMessage, { type: 'matchStart' }>;

export interface LobbyProps {
  room: RoomState;
  selfId: string;
  /** The `matchStart` of this room, while its countdown runs or the match is on. */
  match: MatchStart | null;
  /** False while the socket is reconnecting after an unexpected close. */
  connected: boolean;
  error: ServerError | null;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  /** The countdown reached zero (called once per `matchStart`). */
  onCountdownDone: (match: MatchStart) => void;
  /** Wall clock, `Date.now` unless a test passes another. */
  now?: () => number;
  /** Writes to the clipboard; `navigator.clipboard.writeText` unless a test passes another. */
  copy?: (text: string) => Promise<void>;
}

/** The longest countdown shown, whatever `startAt` says (a skewed or hostile clock cannot freeze the lobby). */
export const MAX_COUNTDOWN_MS = 5000;
const COPIED_MS = 1500;
const TICK_MS = 100;

const LOBBY_ERRORS: Partial<Record<ServerError['code'], string>> = {
  notAllReady: 'Every player must be ready first',
  notHost: 'Only the host can start the match',
  wrongPhase: 'That room has already started',
  rateLimited: 'Too many attempts — wait a minute',
};

/** Whether `selfId` may start: the host, in `lobby`, with at least 2 players, all ready. */
export function canStart(room: RoomState, selfId: string): boolean {
  const self = room.players.find((p) => p.id === selfId);
  return (
    self?.host === true &&
    room.phase === 'lobby' &&
    room.players.length >= 2 &&
    room.players.every((p) => p.ready)
  );
}

function playerRow(p: PlayerInfo, selfId: string): HTMLLIElement {
  // The nickname is user data: a text node only (ADR 0011).
  return h(
    'li',
    {
      class: 'player',
      'data-ready': String(p.ready),
      'data-host': String(p.host),
      'aria-label': `${p.nickname}${p.host ? ', host' : ''}${p.ready ? ', ready' : ', not ready'}`,
    },
    [
      h('span', { class: 'player-name', text: p.nickname }),
      ...(p.id === selfId ? [h('span', { class: 'player-you', text: '(you)' })] : []),
      h('span', { class: 'player-host', 'aria-hidden': 'true', text: p.host ? '★' : '' }),
      h('span', { class: 'player-ready', 'aria-hidden': 'true', text: p.ready ? '✓' : '' }),
    ],
  );
}

/**
 * The lobby (#19, ADR 0009): the room code with Copy, the players (nickname, host ★, ready ✓; text nodes only,
 * ADR 0011), Ready, Start (host only; enabled when every player is ready and there are at least 2), and Leave.
 * Escape asks to leave in an inline row. On `matchStart` a 3-2-1 overlay runs until `startAt` (at most 5 s), then
 * calls `onCountdownDone`. While the room is not in `lobby` and no countdown runs, Ready and Start are disabled.
 */
export function mount(root: HTMLElement, props: LobbyProps): Screen<LobbyProps> {
  const doc = root.ownerDocument;
  let current = props;
  const now = (): number => (current.now ?? Date.now)();
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  let countdownFor: MatchStart | null = null;
  let countdownEnd = 0;
  let countingDown = false;
  let confirming = false;
  let lastSeq = props.error?.seq ?? -1;
  let errorText = '';

  const self = (): PlayerInfo | undefined =>
    current.room.players.find((p) => p.id === current.selfId);
  const button = (text: string, onClick: () => void): HTMLButtonElement =>
    h('button', { type: 'button', text, 'on:click': onClick });

  const codeText = h('strong', { class: 'room-code', 'aria-label': 'Room code' });
  const copied = h('span', { class: 'copied', role: 'status' });
  const copy = button('Copy', () => {
    const code = current.room.code;
    const write =
      current.copy ??
      ((text: string) =>
        typeof navigator.clipboard === 'undefined'
          ? Promise.reject(new Error('no clipboard'))
          : navigator.clipboard.writeText(text));
    write(code).then(
      () => {
        copied.textContent = 'Copied';
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => {
          copied.textContent = '';
        }, COPIED_MS);
      },
      () => {
        // No clipboard (permissions, insecure context): select the code so the player can copy it.
        doc.getSelection()?.selectAllChildren(codeText);
      },
    );
  });
  const players = h('ul', { class: 'players', 'aria-label': 'Players' });
  const ready = button('Ready', () => {
    const me = self();
    if (me && !ready.disabled) current.onReady(!me.ready);
  });
  const start = button('Start', () => {
    if (!start.disabled) current.onStart();
  });
  const leave = button('Leave', () => {
    current.onLeave();
  });
  const confirmLeave = button('Leave the room', () => {
    current.onLeave();
  });
  const stay = button('Stay', () => {
    setConfirming(false);
  });
  const confirmRow = h(
    'div',
    { class: 'confirm-row', role: 'group', 'aria-label': 'Leave the room?' },
    [h('span', { text: 'Leave the room?' }), confirmLeave, stay],
  );
  const status = h('p', { class: 'status', role: 'status' });
  const error = h('p', { class: 'field-error', role: 'alert' });
  const countdownNumber = h('strong', { class: 'countdown-number' });
  const countdown = h(
    'div',
    {
      class: 'countdown',
      role: 'timer',
      'aria-label': 'Match starts in',
      'aria-live': 'assertive',
    },
    [h('span', { text: 'Match starts in' }), countdownNumber],
  );

  const el = h('section', { class: 'screen lobby', 'aria-labelledby': 'lobby-heading' }, [
    h('h2', { id: 'lobby-heading', text: 'Lobby' }),
    h('p', { class: 'room' }, [h('span', { text: 'Room code ' }), codeText, copy, copied]),
    players,
    status,
    error,
    h('div', { class: 'menu' }, [ready, start, leave]),
    confirmRow,
    h('p', { class: 'hint', text: 'Share the code. Arrows move, Enter presses, Escape leaves.' }),
    countdown,
  ]);

  function setConfirming(on: boolean): void {
    confirming = on;
    confirmRow.hidden = !on;
    (on ? confirmLeave : ready.disabled ? leave : ready).focus();
  }

  function stopCountdown(): void {
    clearInterval(tick);
    tick = undefined;
    countingDown = false;
    countdown.hidden = true;
  }

  function step(): void {
    const left = countdownEnd - now();
    if (left <= 0) {
      const match = countdownFor;
      stopCountdown();
      render();
      if (match) current.onCountdownDone(match);
      return;
    }
    countdownNumber.textContent = String(Math.max(1, Math.ceil(left / 1000)));
  }

  function startCountdown(match: MatchStart): void {
    countdownFor = match;
    const delay = Math.min(MAX_COUNTDOWN_MS, Math.max(0, match.startAt - now()));
    countdownEnd = now() + delay;
    countingDown = true;
    countdown.hidden = false;
    clearInterval(tick);
    tick = setInterval(step, TICK_MS);
    step();
  }

  function render(): void {
    const { room, selfId } = current;
    const me = self();
    const host = me?.host === true;
    const inLobby = room.phase === 'lobby';
    codeText.textContent = room.code;
    players.replaceChildren(...room.players.map((p) => playerRow(p, selfId)));
    ready.textContent = me?.ready ? 'Not ready' : 'Ready';
    ready.setAttribute('aria-pressed', String(me?.ready === true));
    ready.disabled = !inLobby || !current.connected || countingDown;
    start.hidden = !host;
    start.disabled = !canStart(room, selfId) || !current.connected;
    let text = '';
    if (!current.connected) text = 'Reconnecting…';
    else if (!inLobby && !countingDown && current.match === null)
      text = 'Waiting for the room to reset';
    else if (!inLobby && !countingDown) text = 'Match in progress';
    else if (room.players.length < 2) text = 'Waiting for another player…';
    else if (host && !room.players.every((p) => p.ready))
      text = 'Waiting for every player to be ready';
    else if (!host && room.players.every((p) => p.ready)) text = 'Waiting for the host to start';
    status.textContent = text;
    error.textContent = errorText;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || e.repeat) return;
    e.preventDefault();
    setConfirming(!confirming);
  };
  doc.addEventListener('keydown', onKey);
  const removeMenu = menuKeys(
    doc,
    () =>
      (confirming ? [confirmLeave, stay] : [ready, start, leave, copy]).filter(
        (b) => !b.disabled && !b.hidden,
      ),
    false,
  );

  const apply = (next: LobbyProps): void => {
    if (next.error && next.error.seq !== lastSeq) {
      lastSeq = next.error.seq;
      errorText = LOBBY_ERRORS[next.error.code] ?? 'The server refused that request';
    } else if (next.room !== current.room) {
      errorText = '';
    }
    current = next;
    if (next.match && next.match !== countdownFor) startCountdown(next.match);
    render();
  };

  confirmRow.hidden = true;
  countdown.hidden = true;
  root.append(el);
  apply(props);
  (ready.disabled ? leave : ready).focus();

  return {
    update(next) {
      apply(next);
      if (!el.contains(doc.activeElement)) (ready.disabled ? leave : ready).focus();
    },
    unmount() {
      doc.removeEventListener('keydown', onKey);
      removeMenu();
      clearTimeout(copiedTimer);
      clearInterval(tick);
      el.remove();
    },
  };
}
