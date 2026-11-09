import { describe, expect, it, vi } from 'vitest';
import type { ThorVGNamespace } from '@thorvg/webcanvas';
import type { AssetInstance } from '../assets/library';
import { createSplash, SPLASH_ID } from './splash';

let constructed = 0;
class FakePaint {
  constructor() {
    constructed++;
  }
  appendRect() {
    return this;
  }
  fill() {
    return this;
  }
  translate() {
    return this;
  }
  scale() {
    return this;
  }
  add() {
    return this;
  }
  dispose = vi.fn();
}
const TVG = { Shape: FakePaint, Scene: FakePaint } as unknown as Pick<
  ThorVGNamespace,
  'Shape' | 'Scene'
>;

function setup(
  options: { placeholder?: boolean; timeline?: { fps: number; frames: number } | null } = {},
) {
  let frame = 0;
  const paint = new FakePaint();
  const instance = {
    paint,
    offsetX: -960,
    offsetY: -540,
    lottie: { frame: () => frame },
  } as unknown as AssetInstance;
  const library = {
    create: vi.fn(() => instance),
    release: vi.fn(),
    isPlaceholder: vi.fn(() => options.placeholder ?? false),
    timeline: vi.fn(() =>
      options.timeline === undefined ? { fps: 30, frames: 210 } : options.timeline,
    ),
  };
  const layer = { add: vi.fn(), visible: vi.fn() };
  const onEnded = vi.fn();
  const setFrame = (value: number) => {
    frame = value;
  };
  return { library, layer, onEnded, instance, setFrame };
}

describe('createSplash', () => {
  it('ends on step 420 of 1/60 s, not on step 419, then holds until finished', () => {
    const { library, layer, onEnded, instance, setFrame } = setup();
    const splash = createSplash({ TVG, library, layer, onEnded });
    if (!splash) throw new Error('expected a splash');
    expect(library.create).toHaveBeenCalledWith(SPLASH_ID);
    for (let i = 0; i < 419; i++) splash.step(1 / 60);
    expect(onEnded).not.toHaveBeenCalled();
    expect(splash.state).toBe('playing');
    splash.step(1 / 60);
    expect(onEnded).toHaveBeenCalledOnce();
    expect(splash.state).toBe('holding');
    setFrame(209);
    for (let i = 0; i < 100; i++) splash.step(1 / 60);
    expect(onEnded).toHaveBeenCalledOnce();
    expect(splash.snapshot()).toMatchObject({ state: 'holding', frame: 209, durationS: 7 });
    expect(layer.visible).not.toHaveBeenCalled();
    splash.finish();
    expect(splash.state).toBe('done');
    expect(layer.visible).toHaveBeenCalledWith(false);
    expect(library.release).toHaveBeenCalledWith(instance);
    splash.finish();
    expect(library.release).toHaveBeenCalledOnce();
  });

  it('creates every Paint up front, none per step, and disposes none', () => {
    const { library, layer, onEnded, instance } = setup();
    constructed = 0;
    const splash = createSplash({ TVG, library, layer, onEnded });
    const created = constructed;
    expect(created).toBe(2);
    for (let i = 0; i < 600; i++) {
      splash?.step(1 / 60);
      splash?.snapshot();
    }
    splash?.finish();
    expect(constructed).toBe(created);
    expect((instance.paint as unknown as FakePaint).dispose).not.toHaveBeenCalled();
    expect(library.create).toHaveBeenCalledOnce();
  });

  it.each([
    ['a placeholder', { placeholder: true }],
    ['no timeline', { timeline: null }],
  ])('skips with one warning for %s', (_name, options) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { library, layer, onEnded } = setup(options);
    expect(createSplash({ TVG, library, layer, onEnded })).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toBe('[splash] ui.splash unavailable; skipping');
    expect(library.create).not.toHaveBeenCalled();
    expect(layer.add).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips with one warning when creation throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { library, layer, onEnded } = setup();
    library.create.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(createSplash({ TVG, library, layer, onEnded })).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
