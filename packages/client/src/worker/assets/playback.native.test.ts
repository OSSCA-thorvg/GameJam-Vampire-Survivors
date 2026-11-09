import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { init, type LottieAnimation } from '@thorvg/webcanvas';
import { afterEach, expect, it, vi } from 'vitest';
import { validateLottie } from '@vs/shared';
import { createWorld } from '../game/world';
import { contactDamageSystem } from '../game/systems/contact-damage';
import { createCachedLottie } from './image-lottie';
import { NativePlayback } from './playback';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders every real countdown state natively and freezes inactive pooled playback', async () => {
  let pixels = new Uint8Array();
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return {
          putImageData(value: ImageData) {
            pixels = Uint8Array.from(value.data);
          },
          clearRect() {
            pixels = new Uint8Array();
          },
        };
      }
    },
  );
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  const entry = createRequire(import.meta.url).resolve('@thorvg/webcanvas');
  const wasm = readFileSync(resolve(dirname(entry), 'thorvg.wasm'));
  const TVG = await init({
    renderer: 'sw',
    locateFile: () => 'data:application/wasm;base64,' + wasm.toString('base64'),
  });
  const canvas = new TVG.Canvas(new OffscreenCanvas(64, 48), {
    width: 64,
    height: 48,
    enableDevicePixelRatio: false,
  });
  let animation: LottieAnimation | undefined;
  let other: LottieAnimation | undefined;
  try {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const json = readFileSync(
      new URL('../../../../shared/src/__fixtures__/player-motion.json', import.meta.url),
      'utf8',
    );
    const value: unknown = JSON.parse(json);
    const definition = validateLottie(value, 'characters/swift.json', 'player');
    const png = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAL0lEQVR4nGNgGGjACGNo3Pn/H5uC6yULsWvckADWy0SpC5hGDWAYDQOGQRAGAw8A6PoGGEpWSQkAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const images = new Map<string, Uint8Array>();
    for (const image of definition.images) {
      images.set(image.path, png);
      images.set('/' + image.path, png);
    }
    let resolverCalls = 0;
    animation = createCachedLottie(TVG, { json, images }, () => {
      resolverCalls++;
    });
    const picture = animation.picture;
    if (!picture) throw new Error('Native picture missing');
    const pointer = picture.ptr;
    const opacity = vi.spyOn(picture, 'opacity');
    const counters = { frameCalls: 0, segmentChanges: 0, slotApplications: 0 };
    const playback = new NativePlayback({
      animation,
      fps: 150,
      frames: 1200,
      loop: true,
      motion: definition.motion,
      counters,
    });
    canvas.add(picture);
    const drawAlpha = () => {
      canvas.update().render();
      let alpha = 0;
      for (let i = 3; i < pixels.length; i += 4) alpha = Math.max(alpha, pixels[i] ?? 0);
      return alpha;
    };
    for (const hitTime of [
      0, 3.9, 3.97, 4, 299.9666666667225, 299.98333333338917, 300.0000000000558,
    ]) {
      playback.reset();
      playback.tick(hitTime);
      const world = createWorld({ seed: 1 });
      world.player.invulnTime = 0.5;
      playback.setFeedback(world.player.invulnTime);
      for (let step = 0; step <= 30; step++) {
        if (step) {
          playback.tick(1 / 60);
          contactDamageSystem(world, 1 / 60);
        }
        if (world.player.invulnTime === 0) playback.setFeedback(0);
        if (step === 8) playback.setMotion('move');
        const flip = step % 2 === 1;
        picture.transform({
          e11: flip ? -1 : 1,
          e12: 0,
          e13: flip ? 48 : 8,
          e21: 0,
          e22: 1,
          e23: 8,
          e31: 0,
          e32: 0,
          e33: 1,
        });
        const expected =
          world.player.invulnTime > 0 && Math.floor(world.player.invulnTime / 0.08) % 2 === 0
            ? 100
            : 255;
        expect(
          drawAlpha(),
          `hit ${String(hitTime)} step ${String(step)} remaining ${String(world.player.invulnTime)}`,
        ).toBe(expected);
        expect(picture.ptr).toBe(pointer);
      }
    }
    // Art-tick partitions below retain 60Hz physics; no opacity claim is made between physics samples.
    for (const partition of [
      [1 / 60],
      [1 / 240, 1 / 240, 1 / 240, 1 / 240],
      [1 / 360, 1 / 180, 1 / 120],
    ]) {
      playback.reset();
      playback.tick(300);
      playback.setMotion('move');
      const bulkFrame = animation.frame();
      playback.reset();
      for (let step = 0; step < 18000; step++) playback.tick(1 / 60);
      playback.setMotion('move');
      expect(animation.frame()).toBe(bulkFrame);
      expect(animation.frame()).toBe(0);
      for (let skipped = 0; skipped < 5; skipped++) {
        const world = createWorld({ seed: 7 });
        world.player.invulnTime = 0.5;
        for (let step = 0; step < skipped; step++) contactDamageSystem(world, 1 / 60);
        playback.setFeedback(world.player.invulnTime);
        for (let step = 0; step <= 30; step++) {
          if (step) {
            for (const dt of partition) playback.tick(dt);
            contactDamageSystem(world, 1 / 60);
          }
          if (step === 3 || step === 22) playback.setMotion('move');
          if (step === 13) playback.setMotion('idle');
          if (world.player.invulnTime === 0) playback.setFeedback(0);
          const expected =
            world.player.invulnTime > 0 && Math.floor(world.player.invulnTime / 0.08) % 2 === 0
              ? 100
              : 255;
          expect(
            drawAlpha(),
            `partition ${String(partition)} skipped ${String(skipped)} step ${String(step)}`,
          ).toBe(expected);
        }
      }
    }
    playback.reset();
    playback.tick(0.04);
    playback.setMotion('move');
    const bulkArbitraryFrame = animation.frame();
    playback.reset();
    for (const dt of [0.013, 0.007, 0.009, 0.011]) playback.tick(dt);
    playback.setMotion('move');
    expect(animation.frame()).toBe(bulkArbitraryFrame);
    playback.reset();
    const initial = counters.frameCalls;
    playback.tick(0.1);
    playback.tick(0.1);
    expect(counters.frameCalls).toBe(initial);
    playback.tick(0.31);
    expect(counters.frameCalls).toBe(initial + 1);
    const actorFrame = animation.frame();
    playback.setMotion('move');
    expect(animation.frame()).toBe(actorFrame);
    playback.setFeedback(0.5);
    expect(drawAlpha()).toBe(100);
    playback.setActive(false);
    const frozen = { ...counters };
    const resolutions = resolverCalls;
    const frame = animation.frame();
    playback.setMotion('move');
    playback.tick(5);
    playback.reset();
    playback.setFeedback(0.4);
    expect(counters).toEqual(frozen);
    expect(animation.frame()).toBe(frame);
    expect(resolverCalls).toBe(resolutions);
    playback.setActive(true);
    expect(animation.frame()).toBe(0);
    expect(drawAlpha()).toBe(255);
    expect(picture.ptr).toBe(pointer);
    other = createCachedLottie(TVG, { json, images });
    const otherPicture = other.picture;
    if (!otherPicture) throw new Error('Second native picture missing');
    otherPicture.translate(32, 8);
    canvas.add(otherPicture);
    const independent = new NativePlayback({
      animation: other,
      fps: 150,
      frames: 1200,
      loop: true,
      motion: definition.motion,
      counters,
    });
    playback.tick(0.6);
    const firstFrame = animation.frame();
    independent.tick(0.9);
    expect(animation.frame()).toBe(firstFrame);
    expect(other.frame()).not.toBe(firstFrame);
    playback.setFeedback(0.5);
    otherPicture.visible(false);
    expect(drawAlpha()).toBe(100);
    picture.visible(false);
    otherPicture.visible(true);
    expect(drawAlpha()).toBe(255);
    expect(otherPicture.ptr).not.toBe(pointer);
    canvas.remove(otherPicture);
    other.dispose();
    other = undefined;
    expect(opacity).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    canvas.remove(picture);
    const actorJson = readFileSync(
      new URL('../../../../shared/src/__fixtures__/actor-motion.json', import.meta.url),
      'utf8',
    );
    const actorValue: unknown = JSON.parse(actorJson);
    const actorDefinition = validateLottie(actorValue, 'enemies/bat.json', 'actor');
    const actorImages = new Map<string, Uint8Array>();
    for (const image of actorDefinition.images) {
      actorImages.set(image.path, png);
      actorImages.set('/' + image.path, png);
    }
    other = createCachedLottie(TVG, { json: actorJson, images: actorImages });
    const enemyPicture = other.picture;
    if (!enemyPicture) throw new Error('Enemy picture missing');
    canvas.add(enemyPicture);
    const enemyOpacity = vi.spyOn(enemyPicture, 'opacity');
    const combatCounters = { frameCalls: 0, segmentChanges: 0, slotApplications: 0 };
    const enemyPlayback = new NativePlayback({
      animation: other,
      fps: 12,
      frames: 32,
      loop: true,
      motion: actorDefinition.motion,
      counters: combatCounters,
    });
    for (const state of ['idle', 'move'] as const) {
      enemyPlayback.setMotion(state);
      for (let pose = 0; pose < (state === 'idle' ? 4 : 8); pose++) {
        enemyPlayback.tick(state === 'idle' ? 0.5 : 1 / 12);
        const frame = other.frame();
        enemyPicture.transform({
          e11: pose % 2 ? -1 : 1,
          e12: 0,
          e13: pose % 2 ? 48 : 8,
          e21: 0,
          e22: 1,
          e23: 8,
          e31: 0,
          e32: 0,
          e33: 1,
        });
        enemyPlayback.setFlash(true);
        expect(drawAlpha()).toBe(140);
        enemyPlayback.setFlash(false);
        expect(drawAlpha()).toBe(255);
        expect(other.frame()).toBe(frame);
      }
    }
    enemyPlayback.setFlash(true);
    enemyPlayback.setActive(false);
    const inactive = { ...combatCounters };
    enemyPlayback.reset();
    enemyPlayback.tick(1);
    enemyPlayback.setFlash(false);
    expect(combatCounters).toEqual(inactive);
    enemyPlayback.setActive(true);
    expect(drawAlpha()).toBe(255);
    expect(() => {
      enemyPlayback.setDuration(0.1);
    }).toThrow(/flat/);
    expect(enemyOpacity).not.toHaveBeenCalled();
    canvas.remove(enemyPicture);
    other.dispose();
    other = undefined;
    const flatValue = {
      v: '5.7.4',
      fr: 60,
      ip: 0,
      op: 15,
      w: 8,
      h: 8,
      assets: [{ id: 'art', w: 16, h: 16, u: '', p: 'hit/art.png', e: 0 }],
      layers: [
        {
          ty: 2,
          refId: 'art',
          ip: 0,
          op: 15,
          st: 0,
          ks: {
            o: {
              a: 1,
              k: [
                { t: 0, s: [100], h: 1 },
                { t: 14, s: [0], h: 1 },
              ],
            },
            r: { a: 0, k: 0 },
            p: { a: 0, k: [0, 0, 0] },
            a: { a: 0, k: [0, 0, 0] },
            s: { a: 0, k: [50, 50, 100] },
          },
        },
      ],
    };
    const flatDefinition = validateLottie(flatValue, 'fx/hit.json');
    other = createCachedLottie(TVG, {
      json: JSON.stringify(flatValue),
      images: new Map([
        ['hit/art.png', png],
        ['/hit/art.png', png],
      ]),
    });
    const effectPicture = other.picture;
    if (!effectPicture) throw new Error('Effect picture missing');
    effectPicture.translate(8, 8);
    canvas.add(effectPicture);
    const effect = new NativePlayback({
      animation: other,
      fps: 60,
      frames: 15,
      loop: false,
      motion: flatDefinition.motion,
      counters: combatCounters,
    });
    effect.setDuration(0.1);
    effect.tick(0.1);
    expect(other.frame()).toBe(14);
    expect(drawAlpha()).toBe(0);
    effect.reset();
    effect.tick(0.1);
    expect(other.frame()).toBe(6);
    expect(drawAlpha()).toBe(255);
    for (const duration of [0, -1, NaN, Infinity])
      expect(() => {
        effect.setDuration(duration);
      }).toThrow();
    expect(fetch).not.toHaveBeenCalled();
    canvas.remove(effectPicture);
    other.dispose();
    other = undefined;
  } finally {
    other?.dispose();
    animation?.dispose();
    canvas.destroy();
    TVG.term();
  }
});
