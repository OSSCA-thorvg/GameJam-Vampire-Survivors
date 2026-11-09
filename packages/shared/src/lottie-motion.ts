export type LottieProfile = 'flat' | 'actor' | 'boss' | 'player';
export type MotionState = 'idle' | 'move';
export interface MotionRange {
  readonly start: number;
  readonly frames: number;
  readonly poseFrames: number;
}
export interface ActorMotion {
  readonly kind: 'actor' | 'player';
  readonly idle: MotionRange;
  readonly move: MotionRange;
}

export function lottieProfile(id: string): LottieProfile {
  switch (id) {
    case 'player.warden':
    case 'player.ember':
    case 'player.swift':
    case 'player.aurelia':
      return 'player';
    case 'enemy.bat':
    case 'enemy.ghoul':
    case 'enemy.skeleton':
    case 'enemy.wisp':
    case 'enemy.brute':
    case 'enemy.wraith':
      return 'actor';
    case 'boss.reaper5':
    case 'boss.reaper10':
    case 'boss.death':
      return 'boss';
    default:
      return 'flat';
  }
}

function fail(): never {
  throw new Error('Invalid bounded actor Lottie profile');
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail();
}
function name(value: Record<string, unknown>): void {
  if (value.nm !== undefined && (typeof value.nm !== 'string' || value.nm.length > 128)) fail();
}
function equal(value: unknown, expected: number | readonly number[]): boolean {
  return typeof expected === 'number'
    ? value === expected
    : Array.isArray(value) &&
        value.length === expected.length &&
        expected.every((number, index) => value[index] === number);
}
function channel(value: unknown, expected: number | readonly number[], slot = false): void {
  if (!object(value) || value.a !== 0 || !equal(value.k, expected)) fail();
  keys(value, slot ? ['a', 'k', 'sid'] : ['a', 'k']);
  if (slot && value.sid !== 'damage') fail();
}
function transform(value: unknown, playerParent = false): void {
  if (!object(value)) fail();
  keys(value, ['o', 'r', 'p', 'a', 's']);
  channel(value.o, 100, playerParent);
  channel(value.r, 0);
  channel(value.p, [0, 0, 0]);
  channel(value.a, [0, 0, 0]);
  channel(value.s, playerParent ? [100, 100, 100] : [50, 50, 100]);
}
function markers(value: unknown, player: boolean): void {
  if (!Array.isArray(value) || value.length !== 2) fail();
  for (const [index, marker] of value.entries()) {
    if (!object(marker)) fail();
    keys(marker, ['cm', 'tm', 'dr']);
    if (
      marker.cm !== (index === 0 ? 'idle' : 'move') ||
      marker.tm !== (index === 0 ? 0 : player ? 600 : 24) ||
      marker.dr !== (player ? 600 : index === 0 ? 24 : 8)
    )
      fail();
  }
}
function imageLayers(value: unknown, player: boolean): readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length !== 12) fail();
  const layers: Record<string, unknown>[] = [];
  for (const [index, layer] of value.entries()) {
    if (!object(layer)) fail();
    keys(layer, ['ddd', 'ind', 'ty', 'nm', 'refId', 'sr', 'ks', 'ip', 'op', 'st', 'bm', 'ao']);
    name(layer);
    const duration = player ? (index < 4 ? 75 : 12.5) : index < 4 ? 6 : 1;
    const start = index < 4 ? index * duration : (player ? 300 : 24) + (index - 4) * duration;
    if (
      layer.ty !== 2 ||
      layer.ind !== index + 1 ||
      typeof layer.refId !== 'string' ||
      layer.ip !== start ||
      layer.op !== start + duration ||
      layer.sr !== 1 ||
      layer.st !== 0 ||
      layer.bm !== 0 ||
      (layer.ddd !== undefined && layer.ddd !== 0) ||
      (layer.ao !== undefined && layer.ao !== 0)
    )
      fail();
    transform(layer.ks);
    layers.push(layer);
  }
  if (new Set(layers.map((layer) => layer.refId)).size !== 12) fail();
  return layers;
}
function timeRemap(value: unknown): void {
  if (!object(value) || value.a !== 1 || !Array.isArray(value.k) || value.k.length !== 57) fail();
  keys(value, ['a', 'k']);
  for (const [index, key] of value.k.entries()) {
    if (!object(key)) fail();
    keys(key, ['t', 's', 'h']);
    const time = index < 8 ? index * 75 : index < 56 ? 600 + (index - 8) * 12.5 : 1200;
    const pose = index < 8 ? 0.25 + (index % 4) * 0.5 : 2 + (((index - 8) % 8) + 0.5) / 12;
    const expected = index === 56 ? 2 + 7.5 / 12 : pose;
    if (key.t !== time || !equal(key.s, [expected]) || key.h !== 1) fail();
  }
}

/** Only these closed actor profiles may introduce a precomposition or native opacity slot. */
export function validateActorMotion(
  value: Record<string, unknown>,
  profile: Exclude<LottieProfile, 'flat'>,
): { motion: ActorMotion; layers: readonly Record<string, unknown>[]; slotOwner: unknown } {
  const player = profile === 'player';
  keys(value, ['v', 'fr', 'ip', 'op', 'w', 'h', 'nm', 'ddd', 'assets', 'layers', 'markers']);
  if (value.fr !== (player ? 150 : 12) || value.ip !== 0 || value.op !== (player ? 1200 : 32))
    fail();
  if (
    !Number.isInteger(value.w) ||
    !Number.isInteger(value.h) ||
    (value.ddd !== undefined && value.ddd !== 0)
  )
    fail();
  if (value.nm !== undefined && (typeof value.nm !== 'string' || value.nm.length > 128)) fail();
  markers(value.markers, player);
  if (!Array.isArray(value.assets) || !Array.isArray(value.layers) || value.layers.length !== 1)
    fail();
  const bank: unknown = value.assets.find(
    (asset: unknown) => object(asset) && asset.id === 'poses',
  );
  const parent: unknown = value.layers[0];
  if (!object(bank) || !object(parent)) fail();
  keys(bank, ['id', 'w', 'h', 'fr', 'layers']);
  if (bank.w !== value.w || bank.h !== value.h || bank.fr !== (player ? 150 : 12)) fail();
  keys(parent, [
    'ddd',
    'ind',
    'ty',
    'nm',
    'refId',
    'sr',
    'ks',
    'tm',
    'w',
    'h',
    'ip',
    'op',
    'st',
    'bm',
  ]);
  if (
    parent.ty !== 0 ||
    parent.ind !== 1 ||
    parent.refId !== 'poses' ||
    parent.sr !== 1 ||
    parent.w !== value.w ||
    parent.h !== value.h ||
    parent.ip !== 0 ||
    parent.op !== (player ? 1200 : 32) ||
    parent.st !== 0 ||
    parent.bm !== 0 ||
    (parent.ddd !== undefined && parent.ddd !== 0)
  )
    fail();
  name(parent);
  transform(parent.ks, true);
  if (!object(parent.ks)) fail();
  const slotOwner = parent.ks.o;
  if (player) timeRemap(parent.tm);
  else if ('tm' in parent) fail();
  const layers = imageLayers(bank.layers, player);
  return {
    layers,
    slotOwner,
    motion: player
      ? {
          kind: 'player',
          idle: { start: 0, frames: 600, poseFrames: 75 },
          move: { start: 600, frames: 600, poseFrames: 12.5 },
        }
      : {
          kind: 'actor',
          idle: { start: 0, frames: 24, poseFrames: 6 },
          move: { start: 24, frames: 8, poseFrames: 1 },
        },
  };
}
