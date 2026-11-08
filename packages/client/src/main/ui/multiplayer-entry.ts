import {
  NICKNAME_MAX,
  normalizeNickname,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ErrorCode,
} from '@vs/shared';
import { h, isTextField, menuKeys, type Screen } from './dom';
import './multiplayer.css';

/**
 * The connection as the screens show it: `failed` covers a closed socket and a refused handshake; `unconfigured` is a
 * production build without `VITE_SERVER_URL` (ADR 0017), which never opens a socket.
 */
export type Connection = 'connecting' | 'open' | 'failed' | 'unconfigured';

/** The latest server `error`; `seq` grows with every error, so the same code twice shows twice. */
export interface ServerError {
  code: ErrorCode;
  seq: number;
}

export interface MultiplayerEntryProps {
  /** Pre-filled nickname: the one used last (memory, then `localStorage`). */
  nickname: string;
  /** A notice above the form, such as the connection-lost message. */
  notice?: string;
  connection: Connection;
  error: ServerError | null;
  onRetry: () => void;
  onCreate: (nickname: string) => void;
  onJoin: (code: string, nickname: string) => void;
  onBack: () => void;
}

export type ErrorField = 'nickname' | 'code';

/**
 * Fixed English messages for the server's error codes (#19). The server's own `message` text is never rendered.
 * `roomNotFound` also covers full rooms and rooms in a match, which the server does not tell apart (ADR 0011, #18).
 */
const ENTRY_ERRORS: Partial<Record<ErrorCode, { field: ErrorField; text: string }>> = {
  roomNotFound: { field: 'code', text: 'Room not found or not joinable' },
  roomFull: { field: 'code', text: 'That room is full' },
  nicknameTaken: { field: 'nickname', text: 'That nickname is taken in this room' },
  invalidNickname: { field: 'nickname', text: 'Use 1–12 visible characters' },
  wrongPhase: { field: 'code', text: 'That room has already started' },
  rateLimited: { field: 'code', text: 'Too many attempts — wait a minute' },
};

/** The message and field for a server error code; codes outside the table get a generic message. */
export function entryError(code: ErrorCode): { field: ErrorField; text: string } {
  return ENTRY_ERRORS[code] ?? { field: 'code', text: 'The server refused that request' };
}

const NOT_IN_ALPHABET = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, 'g');

/** Upper-cases, strips characters outside `ROOM_CODE_ALPHABET` and keeps at most `ROOM_CODE_LENGTH`. */
export function sanitizeCode(raw: string): string {
  return raw.toUpperCase().replace(NOT_IN_ALPHABET, '').slice(0, ROOM_CODE_LENGTH);
}

const CONNECTION_TEXT: Record<Connection, string> = {
  connecting: 'Connecting to the game server…',
  open: '',
  failed: 'Cannot reach the game server',
  unconfigured: 'Multiplayer is not available: no game server is configured for this site',
};

function field(id: string, label: string, input: HTMLInputElement, error: HTMLElement) {
  input.id = id;
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-describedby', error.id);
  const labelEl = h('label', { text: label });
  labelEl.htmlFor = id;
  return h('div', { class: 'field' }, [labelEl, input, error]);
}

/**
 * The multiplayer entry (#19, ADR 0009): nickname, Create room, Join room (which reveals the code field) and Back.
 * The nickname is checked live with `normalizeNickname`; Create and Join stay disabled until it is valid, the server
 * is reachable and no request is pending. Every text is set with `textContent` (ADR 0011). Enter in the nickname field
 * creates (or joins, once the code field is shown and filled), Enter in the code field joins, Escape goes back.
 */
export function mount(
  root: HTMLElement,
  props: MultiplayerEntryProps,
): Screen<MultiplayerEntryProps> {
  const doc = root.ownerDocument;
  let current = props;
  let busy = false;
  let joinShown = false;
  let shownError: { field: ErrorField; text: string } | null = null;
  let lastSeq = props.error?.seq ?? -1;

  const nickname = h('input', { class: 'nickname' });
  nickname.maxLength = NICKNAME_MAX;
  nickname.value = props.nickname;
  const nicknameError = h('p', { id: 'mp-nickname-error', class: 'field-error', role: 'alert' });
  const code = h('input', { class: 'code' });
  code.maxLength = ROOM_CODE_LENGTH;
  code.inputMode = 'text';
  code.autocapitalize = 'characters';
  const codeError = h('p', { id: 'mp-code-error', class: 'field-error', role: 'alert' });

  const button = (text: string, onClick: () => void): HTMLButtonElement =>
    h('button', { type: 'button', text, 'on:click': onClick });
  const valid = (): string | null => normalizeNickname(nickname.value);
  const canSend = (): boolean => current.connection === 'open' && !busy && valid() !== null;

  const create = button('Create room', () => {
    const nick = valid();
    if (!canSend() || nick === null) return;
    busy = true;
    shownError = null;
    refresh();
    current.onCreate(nick);
  });
  const reveal = button('Join room', () => {
    if (!canSend()) return;
    joinShown = true;
    refresh();
    code.focus();
  });
  const join = button('Join', () => {
    const nick = valid();
    if (!canSend() || nick === null || code.value.length !== ROOM_CODE_LENGTH) return;
    busy = true;
    shownError = null;
    refresh();
    current.onJoin(code.value, nick);
  });
  const back = button('Back', () => {
    current.onBack();
  });
  const retry = button('Retry', () => {
    current.onRetry();
  });

  const status = h('p', { class: 'status', role: 'status' });
  const notice = h('p', { class: 'notice', role: 'alert' });
  const joinRow = h('div', { class: 'join-row' }, [
    field('mp-code', 'Room code', code, codeError),
    join,
  ]);
  const el = h('section', { class: 'screen multiplayer-entry', 'aria-labelledby': 'mp-heading' }, [
    h('h2', { id: 'mp-heading', text: 'Multiplayer' }),
    notice,
    h('div', { class: 'connection' }, [status, retry]),
    field('mp-nickname', 'Nickname', nickname, nicknameError),
    h('div', { class: 'menu' }, [create, reveal]),
    joinRow,
    h('div', { class: 'menu' }, [back]),
    h('p', {
      class: 'hint',
      text: 'Enter creates a room, or joins once a code is entered. Escape goes back.',
    }),
  ]);

  function refresh(): void {
    const nick = valid();
    const open = current.connection === 'open';
    status.textContent = CONNECTION_TEXT[current.connection];
    retry.hidden = current.connection !== 'failed';
    notice.textContent = current.notice ?? '';
    notice.hidden = current.notice === undefined;
    create.disabled = !canSend();
    reveal.disabled = !canSend() || joinShown;
    joinRow.hidden = !joinShown;
    join.disabled = !canSend() || code.value.length !== ROOM_CODE_LENGTH;
    nickname.disabled = busy;
    code.disabled = busy;
    // Live check: an invalid non-empty nickname says why; a server error replaces it until the field changes.
    let nickText =
      nickname.value.trim() !== '' && nick === null ? 'Use 1–12 visible characters' : '';
    let codeText = '';
    if (shownError) {
      if (shownError.field === 'code' && joinShown) codeText = shownError.text;
      else nickText = shownError.text;
    }
    nicknameError.textContent = nickText;
    codeError.textContent = codeText;
    nickname.setAttribute('aria-invalid', String(nickText !== ''));
    code.setAttribute('aria-invalid', String(codeText !== ''));
    el.setAttribute('aria-busy', String(busy || !open));
  }

  nickname.addEventListener('input', () => {
    if (shownError?.field === 'nickname') shownError = null;
    refresh();
  });
  code.addEventListener('input', () => {
    const clean = sanitizeCode(code.value);
    if (clean !== code.value) code.value = clean;
    if (shownError?.field === 'code') shownError = null;
    refresh();
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      current.onBack();
      return;
    }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && isTextField(e.target)) {
      e.preventDefault();
      if (joinShown && (e.target === code || code.value.length === ROOM_CODE_LENGTH)) join.click();
      else if (e.target === nickname) create.click();
    }
  };
  doc.addEventListener('keydown', onKey);
  const removeMenu = menuKeys(
    doc,
    () =>
      [retry, create, reveal, join, back].filter(
        (b) => !b.disabled && !b.hidden && !(b === join && joinRow.hidden),
      ),
    false,
  );

  root.append(el);
  refresh();
  nickname.focus();

  return {
    update(next) {
      current = next;
      if (next.error && next.error.seq !== lastSeq) {
        lastSeq = next.error.seq;
        busy = false;
        shownError = entryError(next.error.code);
      }
      if (next.connection !== 'open') busy = false;
      const focusLost = doc.activeElement === null || doc.activeElement === doc.body;
      refresh();
      if (
        focusLost ||
        (doc.activeElement instanceof HTMLElement && !el.contains(doc.activeElement))
      )
        (shownError?.field === 'code' && joinShown ? code : nickname).focus();
    },
    unmount() {
      doc.removeEventListener('keydown', onKey);
      removeMenu();
      el.remove();
    },
  };
}
