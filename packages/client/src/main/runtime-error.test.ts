// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRuntimeErrorReporter,
  routeWorkerError,
  type WorkerErrorLike,
} from './runtime-error';

const event = (message: string): WorkerErrorLike => ({
  message,
  filename: 'http://localhost/src/worker/index.ts',
  lineno: 12,
  colno: 34,
});

let root: HTMLElement;
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  root.remove();
  vi.restoreAllMocks();
});

const notice = (): HTMLElement | null => root.querySelector('#runtime-error');
const button = (name: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent === name);
  if (!found) throw new Error(`no ${name} button`);
  return found;
};

describe('createRuntimeErrorReporter', () => {
  it('appends the notice on the first report without removing the existing screen', () => {
    const screens = document.createElement('div');
    screens.id = 'screens';
    root.append(screens);
    const reporter = createRuntimeErrorReporter(root, () => undefined);
    reporter.report(event('Uncaught Error: probe'));
    expect(root.querySelector('#screens')).toBe(screens);
    const el = notice();
    expect(el?.getAttribute('role')).toBe('alert');
    expect(el?.textContent).toContain('Something went wrong in the game. Reload to start again.');
    expect(el?.querySelector('.runtime-error-detail')?.textContent).toBe('Uncaught Error: probe');
    expect(button('Reload')).toBeTruthy();
    expect(button('Dismiss')).toBeTruthy();
    expect(reporter.count).toBe(1);
  });

  it('keeps one notice on a second report and shows the count', () => {
    const reporter = createRuntimeErrorReporter(root, () => undefined);
    reporter.report(event('first'));
    reporter.report(event('second'));
    expect(root.querySelectorAll('#runtime-error')).toHaveLength(1);
    expect(notice()?.querySelector('.runtime-error-detail')?.textContent).toBe('second (2 errors)');
    expect(reporter.count).toBe(2);
  });

  it('removes the notice on Dismiss and mounts it again on the next report', () => {
    const reporter = createRuntimeErrorReporter(root, () => undefined);
    reporter.report(event('first'));
    button('Dismiss').click();
    expect(notice()).toBeNull();
    reporter.report(event('again'));
    expect(root.querySelectorAll('#runtime-error')).toHaveLength(1);
    expect(notice()?.querySelector('.runtime-error-detail')?.textContent).toBe('again');
  });

  it('calls the injected reload on Reload', () => {
    const reload = vi.fn();
    createRuntimeErrorReporter(root, reload).report(event('x'));
    button('Reload').click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('renders the message as text, never markup', () => {
    createRuntimeErrorReporter(root, () => undefined).report(event('<b>x</b>'));
    const detail = notice()?.querySelector('.runtime-error-detail');
    expect(detail?.textContent).toBe('<b>x</b>');
    expect(notice()?.querySelector('b')).toBeNull();
  });

  it('shows Unknown error for an empty message', () => {
    createRuntimeErrorReporter(root, () => undefined).report(event(''));
    expect(notice()?.querySelector('.runtime-error-detail')?.textContent).toBe('Unknown error');
  });

  it('logs once per report with the runtime prefix and the location', () => {
    const reporter = createRuntimeErrorReporter(root, () => undefined);
    reporter.report(event('a'));
    reporter.report(event('b'));
    expect(errorLog).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenNthCalledWith(
      1,
      '[vs] game worker runtime error: a at http://localhost/src/worker/index.ts:12:34',
    );
  });
});

describe('routeWorkerError', () => {
  it('takes the fatal path before ready and never reports', () => {
    const fatal = vi.fn();
    const report = vi.fn();
    const e = event('load failed');
    expect(routeWorkerError(false, e, fatal, { report })).toBe('fatal');
    expect(fatal).toHaveBeenCalledWith(e);
    expect(report).not.toHaveBeenCalled();
  });

  it('reports after ready and never takes the fatal path', () => {
    const fatal = vi.fn();
    const report = vi.fn();
    const e = event('runtime');
    expect(routeWorkerError(true, e, fatal, { report })).toBe('runtime');
    expect(report).toHaveBeenCalledWith(e);
    expect(fatal).not.toHaveBeenCalled();
  });
});
