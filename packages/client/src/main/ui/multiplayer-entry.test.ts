// @vitest-environment happy-dom
import { ERROR_CODES } from '@vs/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { entryError, mount, sanitizeCode, type MultiplayerEntryProps } from './multiplayer-entry';

function setup(overrides: Partial<MultiplayerEntryProps> = {}) {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const props: MultiplayerEntryProps = {
    nickname: '',
    connection: 'open',
    error: null,
    onRetry: vi.fn(),
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
  const screen = mount(root, props);
  const q = (sel: string) => {
    const el = root.querySelector<HTMLInputElement>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  const button = (name: string) => {
    const b = [...root.querySelectorAll('button')].find((x) => x.textContent === name);
    if (!b) throw new Error(`missing button ${name}`);
    return b;
  };
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  return {
    root,
    props,
    screen,
    nickname: q('#mp-nickname'),
    code: q('#mp-code'),
    button,
    type,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sanitizeCode', () => {
  it.each([
    ['abcdef', 'ABCDEF'],
    ['ab-c d1', 'ABCD'], // 1 is not in the alphabet
    ['O0Il', ''], // look-alikes are not in the alphabet
    ['k7m2p9x4', 'K7M2P9'],
    ['<b>x</b>', 'BXB'],
  ])('%j → %j', (raw, clean) => {
    expect(sanitizeCode(raw)).toBe(clean);
  });
});

describe('entryError', () => {
  it.each([
    ['roomNotFound', 'code', 'Room not found or not joinable'],
    ['roomFull', 'code', 'That room is full'],
    ['nicknameTaken', 'nickname', 'That nickname is taken in this room'],
    ['invalidNickname', 'nickname', 'Use 1–12 visible characters'],
    ['wrongPhase', 'code', 'That room has already started'],
    ['rateLimited', 'code', 'Too many attempts — wait a minute'],
  ] as const)('%s → %s: %s', (code, fieldName, text) => {
    expect(entryError(code)).toEqual({ field: fieldName, text });
  });

  it('gives every other code a fixed generic message', () => {
    for (const code of ERROR_CODES) expect(entryError(code).text).not.toBe('');
  });
});

describe('multiplayer entry screen', () => {
  it('keeps Create and Join disabled until the nickname is valid and the server is reachable', () => {
    const t = setup();
    expect(t.nickname.maxLength).toBe(12);
    expect(document.activeElement).toBe(t.nickname);
    expect(t.button('Create room').disabled).toBe(true);
    expect(t.button('Join room').disabled).toBe(true);
    t.type(t.nickname, '   ');
    expect(t.button('Create room').disabled).toBe(true);
    t.type(t.nickname, 'a​b');
    expect(t.button('Create room').disabled).toBe(true);
    expect(t.root.querySelector('#mp-nickname-error')?.textContent).toBe(
      'Use 1–12 visible characters',
    );
    t.type(t.nickname, ' Alice ');
    expect(t.button('Create room').disabled).toBe(false);
    expect(t.root.querySelector('#mp-nickname-error')?.textContent).toBe('');
    t.screen.update({ ...t.props, connection: 'failed' });
    expect(t.button('Create room').disabled).toBe(true);
    expect(t.button('Retry').hidden).toBe(false);
    expect(t.root.querySelector('.status')?.textContent).toBe('Cannot reach the game server');
    t.button('Retry').click();
    expect(t.props.onRetry).toHaveBeenCalledOnce();
  });

  it('an unconfigured server disables Create and Join and offers no Retry', () => {
    const t = setup({ connection: 'unconfigured' });
    t.type(t.nickname, 'Alice');
    expect(t.button('Create room').disabled).toBe(true);
    expect(t.button('Join room').disabled).toBe(true);
    expect(t.button('Retry').hidden).toBe(true);
    expect(t.root.querySelector('.status')?.textContent).toBe(
      'Multiplayer is not available: no game server is configured for this site',
    );
  });

  it('creates with the normalized nickname, once, and Enter in the field creates', () => {
    const t = setup();
    t.type(t.nickname, '  Alice  ');
    t.nickname.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    t.button('Create room').click();
    expect(t.props.onCreate).toHaveBeenCalledTimes(1);
    expect(t.props.onCreate).toHaveBeenCalledWith('Alice');
    expect(t.button('Create room').disabled).toBe(true);
  });

  it('Join reveals the code field, which sanitizes input; Join submits only a full code', () => {
    const t = setup({ nickname: 'Bob' });
    expect(t.root.querySelector('.join-row')?.hasAttribute('hidden')).toBe(true);
    t.button('Join room').click();
    expect(t.root.querySelector('.join-row')?.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement).toBe(t.code);
    t.type(t.code, 'ab1o');
    expect(t.code.value).toBe('AB');
    expect(t.button('Join').disabled).toBe(true);
    t.type(t.code, 'abcdefgh');
    expect(t.code.value).toBe('ABCDEF');
    t.code.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    expect(t.props.onJoin).toHaveBeenCalledWith('ABCDEF', 'Bob');
  });

  it('shows each server error under its field, never the server text, and stays put', () => {
    const t = setup({ nickname: 'Bob' });
    t.button('Join room').click();
    t.type(t.code, 'ABCDEF');
    t.button('Join').click();
    t.screen.update({ ...t.props, error: { code: 'roomNotFound', seq: 1 } });
    expect(t.root.querySelector('#mp-code-error')?.textContent).toBe(
      'Room not found or not joinable',
    );
    expect(t.button('Join').disabled).toBe(false);
    t.button('Join').click();
    t.screen.update({ ...t.props, error: { code: 'nicknameTaken', seq: 2 } });
    expect(t.root.querySelector('#mp-nickname-error')?.textContent).toBe(
      'That nickname is taken in this room',
    );
    expect(t.root.querySelector('#mp-code-error')?.textContent).toBe('');
    // Editing the field clears the server message.
    t.type(t.nickname, 'Bobby');
    expect(t.root.querySelector('#mp-nickname-error')?.textContent).toBe('');
  });

  it('renders the notice as text, and Escape goes back', () => {
    const t = setup({ notice: '<b>x</b>', nickname: '<img src=x onerror=alert(1)>' });
    expect(t.root.querySelector('.notice')?.textContent).toBe('<b>x</b>');
    expect(t.root.querySelector('b, img')).toBeNull();
    expect(t.nickname.value).toBe('<img src=x onerror=alert(1)>');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    expect(t.props.onBack).toHaveBeenCalledOnce();
  });

  it('typing WASD in the field neither moves focus nor leaves the field', () => {
    const t = setup();
    t.nickname.focus();
    t.nickname.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
    expect(document.activeElement).toBe(t.nickname);
  });

  it('unmount removes every document listener it added', () => {
    const added: unknown[] = [];
    const removed: unknown[] = [];
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
      added.push(fn);
      add(type, fn, opts);
    });
    vi.spyOn(document, 'removeEventListener').mockImplementation((type, fn, opts) => {
      removed.push(fn);
      remove(type, fn, opts);
    });
    const t = setup();
    expect(added.length).toBeGreaterThan(0);
    t.screen.unmount();
    expect(removed).toHaveLength(added.length);
    expect(new Set(removed)).toEqual(new Set(added));
    expect(t.root.children).toHaveLength(0);
  });
});
